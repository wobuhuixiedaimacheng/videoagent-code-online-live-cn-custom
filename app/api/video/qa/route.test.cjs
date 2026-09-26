const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function installTypeScriptLoader() {
  const previous = require.extensions['.ts'];
  require.extensions['.ts'] = (module, filePath) => {
    const source = fs.readFileSync(filePath, 'utf8');
    const output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    }).outputText;
    module._compile(output, filePath);
  };
  return () => {
    if (previous) require.extensions['.ts'] = previous;
    else delete require.extensions['.ts'];
  };
}

function loadRoute() {
  // 路由会 import lib 下的 shotPhysics / videoQa，所以先装上 .ts 解析器。
  const restore = installTypeScriptLoader();
  try {
    const routePath = path.join(__dirname, 'route.ts');
    const source = fs.readFileSync(routePath, 'utf8');
    const compiled = ts.transpileModule(source, {
      compilerOptions: {
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022
      }
    }).outputText;
    const module = { exports: {} };
    const context = {
      URL,
      Request,
      Response,
      console,
      exports: module.exports,
      module,
      process,
      require,
      fetch: (...args) => global.__videoQaFetch(...args)
    };
    vm.runInNewContext(compiled, context, { filename: routePath });
    return module.exports;
  } finally {
    restore();
  }
}

async function withEnv(patch, fn) {
  const keys = Object.keys(patch);
  const previous = new Map(keys.map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    await fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const QA_ENV = {
  QA_API_KEY: 'qa-key',
  QA_BASE_URL: 'https://apihub.example.com/v1',
  QA_VISION_MODEL: 'qa-vision',
  CUSTOM_API_KEY: undefined,
  CUSTOM_BASE_URL: undefined,
  CUSTOM_MODEL: undefined,
  OPENAI_API_KEY: undefined,
  OPENAI_BASE_URL: undefined,
  OPENAI_MODEL: undefined
};

function qaRequest(body) {
  return new Request('http://localhost/api/video/qa', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

const FRAME = 'data:image/jpeg;base64,AAAA';

test('GET 报告质检是否可用，客户端据此决定要不要走质检闸门', async () => {
  const { GET } = loadRoute();

  await withEnv(QA_ENV, async () => {
    const body = await (await GET()).json();
    assert.equal(body.enabled, true);
  });

  await withEnv({ ...QA_ENV, QA_API_KEY: undefined }, async () => {
    const body = await (await GET()).json();
    assert.equal(body.enabled, false);
  });
});

test('没配视觉模型时返回 skipped 而不是报错，质检坏了不能拖垮渲染', async () => {
  const { POST } = loadRoute();
  let called = false;
  global.__videoQaFetch = async () => { called = true; return new Response('{}', { status: 200 }); };

  await withEnv({ ...QA_ENV, QA_API_KEY: undefined }, async () => {
    const response = await POST(qaRequest({ frames: [FRAME], physicsMode: 'realistic' }));
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.verdict.status, 'skipped');
    assert.match(body.verdict.note, /未配置画面质检模型/);
    assert.equal(called, false, '没配模型就不该发出上游请求');
  });
});

test('一帧都没抽到同样判 skipped，不能当成合格放行', async () => {
  const { POST } = loadRoute();
  global.__videoQaFetch = async () => new Response('{}', { status: 200 });

  await withEnv(QA_ENV, async () => {
    const body = await (await POST(qaRequest({ frames: [], physicsMode: 'realistic' }))).json();
    assert.equal(body.verdict.status, 'skipped');
    assert.equal(body.verdict.checkedFrames, 0);
  });
});

test('抽帧被送进视觉模型，判据随镜头意图变化', async () => {
  const { POST } = loadRoute();
  let upstream;
  global.__videoQaFetch = async (url, init) => {
    upstream = { url: String(url), authorization: init.headers.authorization, body: JSON.parse(init.body) };
    return new Response(
      JSON.stringify({ choices: [{ message: { content: '{"issues":[{"check":"gravity","severity":"critical","detail":"人物悬空"}]}' } }] }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  };

  await withEnv(QA_ENV, async () => {
    const realistic = await (await POST(qaRequest({ frames: [FRAME, FRAME], physicsMode: 'realistic', shotTitle: '开场' }))).json();
    assert.equal(realistic.verdict.status, 'failed');
    assert.equal(realistic.verdict.checkedFrames, 2);

    // 同一个上游回答，夸张镜头必须放行——那是导演要的效果，不是缺陷。
    const stylized = await (await POST(qaRequest({ frames: [FRAME], physicsMode: 'stylized' }))).json();
    assert.equal(stylized.verdict.status, 'passed');
    assert.equal(stylized.verdict.issues.length, 0);
  });

  assert.equal(upstream.url, 'https://apihub.example.com/v1/chat/completions');
  assert.equal(upstream.authorization, 'Bearer qa-key');
  assert.equal(upstream.body.model, 'qa-vision');
  assert.equal(upstream.body.temperature, 0);
  assert.equal(upstream.body.messages[0].content[0].type, 'text');
  assert.equal(upstream.body.messages[0].content[1].type, 'image_url');
});

test('抽帧数量封顶，非法帧被丢掉', async () => {
  const { POST } = loadRoute();
  let sentFrames = 0;
  global.__videoQaFetch = async (_url, init) => {
    sentFrames = JSON.parse(init.body).messages[0].content.filter((part) => part.type === 'image_url').length;
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"issues":[]}' } }] }), { status: 200 });
  };

  await withEnv(QA_ENV, async () => {
    // 逐帧分析会把每个镜头的成本翻两个数量级，这里必须封顶。
    const body = await (await POST(qaRequest({
      frames: [...Array(20).fill(FRAME), 'javascript:alert(1)', '', 42],
      physicsMode: 'realistic'
    }))).json();
    assert.equal(body.verdict.status, 'passed');
  });

  // 12 帧是为了让相邻帧之间的脸部抖动能被采样到（3 帧时它整段漏检），
  // 但仍然要封顶：逐帧分析会把每个镜头的成本翻两个数量级。
  assert.equal(sentFrames, 12);
});

test('上游报错时透出错误并抹掉密钥', async () => {
  const { POST } = loadRoute();
  global.__videoQaFetch = async () => new Response('unauthorized for key qa-key', { status: 401 });

  await withEnv(QA_ENV, async () => {
    const response = await POST(qaRequest({ frames: [FRAME], physicsMode: 'realistic' }));
    const body = await response.json();

    assert.equal(response.status, 401);
    assert.equal(body.ok, false);
    assert.doesNotMatch(body.error, /qa-key/);
    assert.match(body.error, /\[redacted\]/);
  });
});
