const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function loadModule(fileName) {
  const source = fs.readFileSync(path.join(__dirname, fileName), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, { exports: module.exports, module, require }, { filename: fileName });
  return module.exports;
}

const { describeUpstreamModelError } = loadModule('providerErrors.ts');

// 中转站真实返回：外层 error.message 里再嵌一段字符串化 JSON。
const orderingBody = JSON.stringify({
  error: {
    message:
      'litellm.BadRequestError: OpenAIException - ' +
      JSON.stringify({ object: 'error', message: 'System message must be at the beginning.', type: 'BadRequest', param: null, code: 400 }),
    type: 'upstream_error',
    param: '',
    code: '400'
  }
});

const quotaBody = JSON.stringify({
  error: {
    message: '预扣费额度失败, 用户剩余额度: ＄0.002268, 需要预扣费额度: ＄0.051380 (request id: 2026080314365038)',
    type: 'AgnesAI_error',
    param: '',
    code: 'insufficient_user_quota'
  }
});

test('嵌套的 system 顺序错误被翻译成可执行的中文提示', () => {
  const message = describeUpstreamModelError({ provider: 'Custom', model: 'agnes-2.5-pro-alpha', status: 400, body: orderingBody });
  assert.match(message, /system 消息必须排在消息数组第一条/);
  assert.match(message, /agnes-2\.5-pro-alpha/);
  assert.doesNotMatch(message, /OpenAIException/);
});

test('额度不足会点明问题不在代码，并带上真实的剩余额度', () => {
  const message = describeUpstreamModelError({ provider: 'Custom', model: 'agnes-2.5-pro-alpha', status: 403, body: quotaBody });
  assert.match(message, /额度不足/);
  assert.match(message, /不是本项目的代码问题/);
  assert.match(message, /0\.002268/);
});

test('未知错误保留状态码和原始信息，不吞掉线索', () => {
  const message = describeUpstreamModelError({
    provider: 'Custom',
    status: 500,
    body: JSON.stringify({ error: { message: '上游服务异常' } })
  });
  assert.match(message, /500/);
  assert.match(message, /上游服务异常/);
});

test('非 JSON body 不会让翻译崩掉', () => {
  const message = describeUpstreamModelError({ provider: 'Custom', status: 502, body: '<html>Bad Gateway</html>' });
  assert.match(message, /502/);
  assert.match(message, /Bad Gateway/);
});
