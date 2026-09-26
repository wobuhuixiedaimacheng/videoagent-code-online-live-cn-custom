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
    require
  };
  vm.runInNewContext(compiled, context, { filename: routePath });
  return module.exports;
}

test('GET returns the Xiaopeng V2 workspace for the fixed demo id', async () => {
  const { GET } = loadRoute();
  const response = await GET(new Request('http://localhost/api/demo-workspace/xiaopeng-v2'), {
    params: { id: 'xiaopeng-v2' }
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.workspace.title, '小澎的恋爱史｜三分钟搞笑短剧');
  assert.ok(body.workspace.files.some((file) => file.path === 'asset_prompts.json'));
});

test('GET rejects unknown demo ids instead of reading arbitrary files', async () => {
  const { GET } = loadRoute();
  const response = await GET(new Request('http://localhost/api/demo-workspace/../../.env.local'), {
    params: { id: '../../.env.local' }
  });
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.equal(body.ok, false);
  assert.match(body.error, /Unknown demo workspace/);
});
