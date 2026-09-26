const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function compile(fileName) {
  const source = fs.readFileSync(path.join(__dirname, fileName), 'utf8');
  return ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;
}

function loadGateway(fetchImpl, env = {}) {
  function localRequire(spec) {
    if (!spec.startsWith('.')) return require(spec);
    const module = { exports: {} };
    vm.runInNewContext(
      compile(`${spec.replace(/^\.\//, '')}.ts`),
      { exports: module.exports, module, require: localRequire },
      { filename: spec }
    );
    return module.exports;
  }

  const module = { exports: {} };
  vm.runInNewContext(
    compile('modelGateway.ts'),
    {
      exports: module.exports,
      module,
      require: localRequire,
      fetch: fetchImpl,
      setTimeout,
      clearTimeout,
      process: { env: { DEFAULT_PROVIDER: 'custom', CUSTOM_API_KEY: 'k', CUSTOM_BASE_URL: 'https://relay.test/v1', CUSTOM_MODEL: 'm', ...env } }
    },
    { filename: 'modelGateway.ts' }
  );
  return module.exports;
}

function okResponse() {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content: 'done' }, finish_reason: 'stop' }], usage: {} })
  };
}

test('循环里追加的 system 消息会被合并并顶到第一条', async () => {
  let sent;
  const gateway = loadGateway(async (_url, init) => {
    sent = JSON.parse(init.body);
    return okResponse();
  });

  await gateway.callModel(
    [
      { role: 'system', content: '主提示词' },
      { role: 'user', content: '做角色' },
      { role: 'assistant', content: '好的' },
      { role: 'system', content: '补充约束' }
    ],
    []
  );

  assert.equal(sent.messages[0].role, 'system');
  assert.equal(sent.messages[0].content, '主提示词\n\n补充约束');
  assert.equal(sent.messages.filter((message) => message.role === 'system').length, 1);
  assert.deepEqual(
    sent.messages.map((message) => message.role),
    ['system', 'user', 'assistant']
  );
});

test('system 本来就在第一条时消息数组原样发出', async () => {
  let sent;
  const gateway = loadGateway(async (_url, init) => {
    sent = JSON.parse(init.body);
    return okResponse();
  });

  await gateway.callModel(
    [
      { role: 'system', content: '主提示词' },
      { role: 'user', content: '做角色' }
    ],
    []
  );

  assert.deepEqual(sent.messages, [
    { role: 'system', content: '主提示词' },
    { role: 'user', content: '做角色' }
  ]);
});

test('网关 4xx 会带着翻译后的原因抛出，而不是原始 JSON', async () => {
  const body = JSON.stringify({
    error: { message: '预扣费额度失败, 用户剩余额度: ＄0.002268, 需要预扣费额度: ＄0.051380', code: 'insufficient_user_quota' }
  });
  const gateway = loadGateway(async () => ({ ok: false, status: 403, text: async () => body }));

  await assert.rejects(
    () => gateway.callModel([{ role: 'user', content: '做角色' }], [], { retries: 1 }),
    /额度不足/
  );
});
