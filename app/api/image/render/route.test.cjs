const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function loadRoute() {
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
    fetch: (...args) => global.__imageRouteFetch(...args)
  };
  vm.runInNewContext(compiled, context, { filename: routePath });
  return module.exports;
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

test('POST submits a text-to-image reference task to the configured Agnes image endpoint', async () => {
  const { POST } = loadRoute();
  let upstreamRequest;
  global.__imageRouteFetch = async (url, init) => {
    upstreamRequest = {
      url: String(url),
      authorization: init.headers.authorization,
      body: JSON.parse(init.body)
    };
    return new Response(JSON.stringify({ data: [{ url: 'https://cdn.example/xiaopeng.png' }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  await withEnv(
    {
      IMAGE_API_KEY: 'image-key',
      IMAGE_BASE_URL: 'https://apihub.agnes-ai.com/v1',
      IMAGE_MODEL: 'agnes-image-2.1-flash'
    },
    async () => {
      const response = await POST(
        new Request('http://localhost/api/image/render', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            prompt: '真人校园短剧角色参考图，小澎，圆脸浓眉小虎牙',
            negativePrompt: '  不要换脸，不要文字  ',
            size: '768x1024'
          })
        })
      );
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.equal(body.imageUrl, 'https://cdn.example/xiaopeng.png');
    }
  );

  assert.equal(upstreamRequest.url, 'https://apihub.agnes-ai.com/v1/images/generations');
  assert.equal(upstreamRequest.authorization, 'Bearer image-key');
  assert.equal(upstreamRequest.body.model, 'agnes-image-2.1-flash');
  assert.equal(upstreamRequest.body.prompt, '真人校园短剧角色参考图，小澎，圆脸浓眉小虎牙');
  assert.equal(upstreamRequest.body.size, '768x1024');
  assert.equal(upstreamRequest.body.negative_prompt, '不要换脸，不要文字');
  assert.deepEqual(upstreamRequest.body.extra_body, { response_format: 'url' });
});

test('POST omits negative_prompt when the request value is blank', async () => {
  const { POST } = loadRoute();
  let upstreamBody;
  global.__imageRouteFetch = async (url, init) => {
    upstreamBody = JSON.parse(init.body);
    return new Response(JSON.stringify({ data: [{ url: 'https://cdn.example/scene.png' }] }), { status: 200 });
  };
  await withEnv({ IMAGE_API_KEY: 'image-key' }, async () => {
    const response = await POST(new Request('http://localhost/api/image/render', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: '教室场景', negativePrompt: '   ' })
    }));
    assert.equal(response.status, 200);
  });
  assert.equal(Object.hasOwn(upstreamBody, 'negative_prompt'), false);
});

test('POST passes image-to-image references through extra_body.image', async () => {
  const { POST } = loadRoute();
  let upstreamBody;
  global.__imageRouteFetch = async (url, init) => {
    upstreamBody = JSON.parse(init.body);
    return new Response(JSON.stringify({ data: [{ url: 'https://cdn.example/xiaopeng-younger.png' }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  await withEnv(
    {
      IMAGE_API_KEY: 'image-key',
      IMAGE_BASE_URL: 'https://apihub.agnes-ai.com/v1',
      IMAGE_MODEL: 'agnes-image-2.1-flash'
    },
    async () => {
      const response = await POST(
        new Request('http://localhost/api/image/render', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            prompt: '把参考人物改成高中年龄，保持脸部特征一致',
            images: ['https://cdn.example/xiaopeng-base.png'],
            size: '768x1024'
          })
        })
      );
      assert.equal(response.status, 200);
    }
  );

  assert.deepEqual(upstreamBody.extra_body, {
    image: ['https://cdn.example/xiaopeng-base.png'],
    response_format: 'url'
  });
});

test('POST returns a clear configuration error when image API key is missing', async () => {
  const { POST } = loadRoute();
  await withEnv(
    {
      IMAGE_API_KEY: undefined,
      CUSTOM_API_KEY: undefined
    },
    async () => {
      const response = await POST(
        new Request('http://localhost/api/image/render', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ prompt: '测试图片' })
        })
      );
      const body = await response.json();

      assert.equal(response.status, 400);
      assert.match(body.error, /IMAGE_API_KEY/);
    }
  );
});
