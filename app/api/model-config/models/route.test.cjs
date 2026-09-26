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
    fetch: (...args) => global.__routeFetch(...args)
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

test('model list uses the saved custom connection when the browser leaves connection blank', async () => {
  const { POST } = loadRoute();
  let upstreamRequest;
  global.__routeFetch = async (url, init) => {
    upstreamRequest = {
      url: String(url),
      authorization: init.headers.authorization
    };
    return new Response(JSON.stringify({ data: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  await withEnv(
    {
      CUSTOM_BASE_URL: 'https://apihub.agnes-ai.com/v1',
      CUSTOM_API_KEY: 'custom-key',
      OPENAI_API_KEY: undefined,
      OPENAI_BASE_URL: undefined,
      IMAGE_API_KEY: undefined,
      IMAGE_BASE_URL: undefined,
      VIDEO_API_KEY: undefined,
      VIDEO_BASE_URL: undefined
    },
    async () => {
      const response = await POST(
        new Request('http://localhost/api/model-config/models', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ connection: { baseUrl: '', apiKey: '' } })
        })
      );
      assert.equal(response.status, 200);
    }
  );

  assert.deepEqual(upstreamRequest, {
    url: 'https://apihub.agnes-ai.com/v1/models',
    authorization: 'Bearer custom-key'
  });
});

test('model list classifies agnes text image and video model ids separately', async () => {
  const { POST } = loadRoute();
  global.__routeFetch = async () =>
    new Response(
      JSON.stringify({
        data: [
          { id: 'agnes-1.5-flash', owned_by: 'custom' },
          { id: 'agnes-2.0-flash', owned_by: 'custom' },
          { id: 'agnes-image-2.0-flash', owned_by: 'custom' },
          { id: 'agnes-image-2.1-flash', owned_by: 'custom' },
          { id: 'agnes-video-v2.0', owned_by: 'custom' }
        ]
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );

  const response = await POST(
    new Request('http://localhost/api/model-config/models', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        connection: {
          baseUrl: 'https://apihub.agnes-ai.com/v1',
          apiKey: 'custom-key'
        }
      })
    })
  );
  const body = await response.json();

  assert.deepEqual(
    body.categories.text.map((model) => model.id),
    ['agnes-1.5-flash', 'agnes-2.0-flash']
  );
  assert.deepEqual(
    body.categories.image.map((model) => model.id),
    ['agnes-image-2.0-flash', 'agnes-image-2.1-flash']
  );
  assert.deepEqual(body.categories.video.map((model) => model.id), ['agnes-video-v2.0']);
  assert.deepEqual(body.counts, { all: 5, text: 2, image: 2, video: 1 });
});

test('model list redacts upstream API key details before returning errors to the browser', async () => {
  const { POST } = loadRoute();
  global.__routeFetch = async () =>
    new Response(JSON.stringify({ error: { message: 'Incorrect API key provided: custom-key.' } }), {
      status: 401,
      headers: { 'content-type': 'application/json' }
    });

  const response = await POST(
    new Request('http://localhost/api/model-config/models', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        connection: {
          baseUrl: 'https://apihub.agnes-ai.com/v1',
          apiKey: 'custom-key'
        }
      })
    })
  );
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.error.includes('custom-key'), false);
  assert.match(body.error, /API key/);
});
