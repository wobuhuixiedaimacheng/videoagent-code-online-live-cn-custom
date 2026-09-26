const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

// characterDesign.ts 会 import 同目录的 .ts 模块（人种锚点的缺省值来自 characterVisualSpec），
// 注入的 require 得认得这个扩展名。和 productionAssets.test.cjs 用的是同一套。
function withTsRequire(run) {
  const previous = require.extensions['.ts'];
  require.extensions['.ts'] = (module, filePath) => {
    const source = fs.readFileSync(filePath, 'utf8');
    module._compile(
      ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
      }).outputText,
      filePath
    );
  };
  try {
    return run();
  } finally {
    if (previous) require.extensions['.ts'] = previous;
    else delete require.extensions['.ts'];
  }
}

function loadCharacterDesignModule() {
  const filePath = path.join(__dirname, 'characterDesign.ts');
  assert.equal(fs.existsSync(filePath), true, 'characterDesign.ts should define the character asset behavior');
  const source = fs.readFileSync(filePath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020
    }
  }).outputText;
  const module = { exports: {} };
  withTsRequire(() => vm.runInNewContext(output, {
    module,
    exports: module.exports,
    require,
    URL,
    console
  }, { filename: filePath }));
  return module.exports;
}

test('extracts one visible reference per story stage from existing render prompts', () => {
  const { characterReferenceVariantsFromPrompts } = loadCharacterDesignModule();
  const sharedConsistency = '年龄必须随阶段变化：幼儿园五岁，小学十岁，初中十四岁，高中十七岁，大学二十一岁。';
  const variants = characterReferenceVariantsFromPrompts({
    prompts: [
      { id: 'k1', renderTask: '幼儿园｜糖果相识', prompt: sharedConsistency, referenceImageUrl: 'https://img/k.png' },
      { id: 'k2', renderTask: '幼儿园｜饭勺戒指', prompt: sharedConsistency, referenceImageUrl: 'https://img/k.png' },
      { id: 'p1', renderTask: '小学｜借橡皮靠近', prompt: sharedConsistency, referenceImageUrl: 'https://img/p.png' },
      { id: 'm1', renderTask: '初中｜同桌三分钟', prompt: sharedConsistency, referenceImageUrl: 'https://img/m.png' },
      { id: 'h1', renderTask: '高中｜补课心动', prompt: sharedConsistency, referenceImageUrl: 'https://img/h.png' },
      { id: 'c1', renderTask: '大学｜社团招新', prompt: sharedConsistency, referenceImageUrl: 'https://img/c.png' }
    ]
  });

  assert.deepEqual(
    JSON.parse(JSON.stringify(variants.map((item) => ({ id: item.id, label: item.label, ageLabel: item.ageLabel, imageUrl: item.imageUrl })))),
    [
      { id: 'kindergarten', label: '幼儿园', ageLabel: '5 岁', imageUrl: 'https://img/k.png' },
      { id: 'primary', label: '小学', ageLabel: '10 岁', imageUrl: 'https://img/p.png' },
      { id: 'middle', label: '初中', ageLabel: '14 岁', imageUrl: 'https://img/m.png' },
      { id: 'high', label: '高中', ageLabel: '17 岁', imageUrl: 'https://img/h.png' },
      { id: 'college', label: '大学', ageLabel: '21 岁', imageUrl: 'https://img/c.png' }
    ]
  );
});

test('replaces only the selected stage reference in prompts and render queue', () => {
  const { replaceCharacterStageReference } = loadCharacterDesignModule();
  const original = {
    prompts: [
      { id: 'p1', sceneId: 'primary-a', renderTask: '小学｜靠近', referenceImageUrl: 'old-primary' },
      { id: 'm1', sceneId: 'middle-a', renderTask: '初中｜误会', referenceImageUrl: 'old-middle' }
    ],
    renderQueue: [
      { id: 'q1', sceneId: 'primary-a', referenceImageUrl: 'old-primary' },
      { id: 'q2', sceneId: 'middle-a', referenceImageUrl: 'old-middle' }
    ]
  };

  const next = replaceCharacterStageReference(original, 'primary', 'new-primary');

  assert.equal(next.prompts[0].referenceImageUrl, 'new-primary');
  assert.equal(next.prompts[1].referenceImageUrl, 'old-middle');
  assert.equal(next.renderQueue[0].referenceImageUrl, 'new-primary');
  assert.equal(next.renderQueue[1].referenceImageUrl, 'old-middle');
  assert.equal(original.prompts[0].referenceImageUrl, 'old-primary');
});

test('builds a Chinese live-action character prompt with stage, expression, and adjustment controls', () => {
  const { buildCharacterDesignPrompt } = loadCharacterDesignModule();
  const prompt = buildCharacterDesignPrompt({
    characterName: '小澎',
    role: '贯穿主角',
    description: '圆脸，短黑发，浓眉，小虎牙',
    consistency: '五官锚点保持一致',
    negativePrompt: '动画风，换脸',
    stage: { id: 'high', label: '高中', ageLabel: '17 岁', wardrobe: '蓝白高中校服和红色笔记本' },
    expressionPrompts: ['害羞脸红，眼神躲闪', '紧张挠头'],
    adjustment: '身形更清瘦，不能长胡子',
    outputKind: 'portrait'
  });

  assert.match(prompt, /真人实拍角色定妆照/);
  assert.match(prompt, /高中/);
  assert.match(prompt, /17 岁/);
  assert.match(prompt, /蓝白高中校服和红色笔记本/);
  assert.match(prompt, /害羞脸红/);
  assert.match(prompt, /身形更清瘦/);
  assert.match(prompt, /禁止动画/);
  assert.match(prompt, /不要生成任何可读文字/);
});

test('does not echo policy-sensitive minor safety terms into the positive image prompt', () => {
  const { buildCharacterDesignPrompt } = loadCharacterDesignModule();
  const prompt = buildCharacterDesignPrompt({
    characterName: '小澎',
    role: '贯穿主角',
    description: '十岁中国小学生，圆脸短黑发',
    consistency: '同一张脸，自然年龄',
    negativePrompt: '动画风，换脸，亲吻，拥抱，性暗示，成人化儿童',
    stage: { id: 'primary', label: '小学', ageLabel: '10 岁', wardrobe: '小学校服和红色铅笔盒' },
    outputKind: 'portrait'
  });

  assert.doesNotMatch(prompt, /亲吻|性暗示|成人化儿童/);
  assert.match(prompt, /健康、自然、符合真实年龄/);
});

test('turns provider image failures into concise Chinese recovery messages', () => {
  const { characterImageErrorText } = loadCharacterDesignModule();
  assert.equal(
    characterImageErrorText('{"error":{"message":"blocked","code":"content_policy_violation"}}'),
    '图片模型拒绝了当前描述。系统已去掉容易误触审核的词，请重新生成。'
  );
  assert.equal(characterImageErrorText('IMAGE_API_KEY is required'), '图片模型尚未配置，请先在模型设置中填写图片模型连接。');
  assert.equal(characterImageErrorText('network timeout'), 'network timeout');
});
