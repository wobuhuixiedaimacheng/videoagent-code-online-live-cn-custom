const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function loadModelConfig() {
  const source = fs.readFileSync(path.join(__dirname, 'modelConfig.ts'), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, { exports: module.exports, module, require }, { filename: 'modelConfig.ts' });
  return module.exports;
}

const allAgnesModels = [
  { id: 'agnes-1.5-flash' },
  { id: 'agnes-2.0-flash' },
  { id: 'agnes-image-2.0-flash' },
  { id: 'agnes-image-2.1-flash' },
  { id: 'agnes-video-v2.0' }
];

test('pickLayerModel replaces a known model that belongs to a different layer', () => {
  const { pickLayerModel } = loadModelConfig();

  assert.equal(
    pickLayerModel('agnes-1.5-flash', [{ id: 'agnes-image-2.0-flash' }, { id: 'agnes-image-2.1-flash' }], allAgnesModels),
    'agnes-image-2.0-flash'
  );
});

test('pickLayerModel keeps a manual model id that is not returned by the provider list', () => {
  const { pickLayerModel } = loadModelConfig();

  assert.equal(
    pickLayerModel('vendor-private-image-model', [{ id: 'agnes-image-2.0-flash' }], allAgnesModels),
    'vendor-private-image-model'
  );
});

test('modelReadMessage reports per-layer counts instead of only the total', () => {
  const { modelReadMessage } = loadModelConfig();

  assert.equal(modelReadMessage({ all: 5, text: 2, image: 2, video: 1 }), '已读取 5 个模型：文本 2 / 图片 2 / 视频 1。');
});
