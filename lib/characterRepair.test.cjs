const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

function loadCharacterRepair() {
  const source = fs.readFileSync(path.join(__dirname, 'characterRepair.ts'), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  const module = { exports: {} };
  new Function('exports', 'module', 'require', output)(module.exports, module, require);
  return module.exports;
}

const {
  ageLabelFromText,
  characterContractIssues,
  describeCharacterIssues,
  repairCharactersContent
} = loadCharacterRepair();

/** 和 agentProvider 的 hasCharacters 保持一致，用来验证修补后确实能过校验。 */
function passesContract(content) {
  return characterContractIssues(JSON.parse(content)).length === 0;
}

/**
 * 真实事故的最小复现：脚本写了陈女士 28 岁、前任A、现任B 三个人，
 * 模型也照着写了，但前任A 漏了 faceIdStrategy、现任B 的变体漏了 primaryImagePrompt。
 * 旧逻辑判定整份不合格 → 换成内置模板 → 主角变成「目标观众…」、年龄变成 8 岁。
 */
const MODEL_OUTPUT = JSON.stringify({
  characters: [
    {
      id: 'chen', name: '陈女士', role: '女主角', required: true,
      description: '28岁，职场女性，性格独立但恋爱路上屡遇波折',
      faceAnchorVariantId: 'now', referenceStrategy: 'face_id',
      faceIdStrategy: '以现在的主图锁脸', expressionIds: ['喜悦', '悲伤'],
      expressionRange: '克制的喜悦到失落', consistencyPrompt: '保持中等身高、干练短发',
      imagePrompt: '陈女士职场主图', negativePrompt: '不要换脸',
      variants: [{ id: 'now', label: '本片形象', ageLabel: '28 岁', wardrobe: '简约职场装', primaryImagePrompt: '陈女士正面半身' }]
    },
    {
      // 漏了 faceIdStrategy —— 旧逻辑因为这一个字段丢掉全部三个角色
      id: 'ex_a', name: '前任A', role: '前任', required: false,
      description: '29岁，性格温和但缺乏主见。高挑，戴眼镜，常穿休闲装',
      faceAnchorVariantId: 'only', referenceStrategy: 'face_id',
      expressionIds: ['平静'], expressionRange: '平静为主',
      consistencyPrompt: '高挑戴眼镜', imagePrompt: '前任A 背影', negativePrompt: '不要换脸',
      variants: [{ id: 'only', label: '本片形象', ageLabel: '29 岁', wardrobe: '休闲装', primaryImagePrompt: '前任A 侧影' }]
    },
    {
      // 变体漏了 primaryImagePrompt，而且角色自己漏了 expressionRange
      id: 'now_b', name: '现任B', role: '现任', required: false,
      description: '30岁，成熟稳重。中等身高',
      faceAnchorVariantId: 'only', referenceStrategy: 'face_id',
      faceIdStrategy: '侧影锁形', expressionIds: ['平静'],
      consistencyPrompt: '中等身高成熟稳重', imagePrompt: '现任B 侧影', negativePrompt: '不要换脸',
      variants: [{ id: 'only', label: '本片形象', ageLabel: '30 岁', wardrobe: '深色外套' }]
    }
  ]
});

test('一个角色缺一个字段，不该让另外两个陪葬', () => {
  assert.ok(!passesContract(MODEL_OUTPUT), '前置条件：这份产出确实过不了契约');

  const repaired = repairCharactersContent(MODEL_OUTPUT);
  assert.ok(repaired, '这份产出应该能救回来，而不是整份换模板');
  assert.ok(passesContract(repaired.content), '补齐后必须能过契约');

  const characters = JSON.parse(repaired.content).characters;
  // 三个人一个都不能少，而且必须还是剧本里那三个人
  assert.deepEqual(characters.map((c) => c.name), ['陈女士', '前任A', '现任B']);
  assert.equal(characters[0].variants[0].ageLabel, '28 岁', '写对的字段一个都不能被改掉');
  assert.equal(characters[0].faceIdStrategy, '以现在的主图锁脸');
  assert.equal(characters[1].name, '前任A');
  assert.ok(characters[1].faceIdStrategy, '漏掉的字段要补上');
  assert.ok(characters[2].expressionRange);
  assert.ok(characters[2].variants[0].primaryImagePrompt);
  assert.equal(repaired.dropped, 0);

  // 补了什么必须说得出来，不能悄悄补完就算了
  const summary = describeCharacterIssues(repaired.filled);
  assert.match(summary, /前任A 缺 faceIdStrategy/);
  assert.match(summary, /现任B/);
});

test('补齐永远不碰人名、身份和年龄这类事实', () => {
  const repaired = repairCharactersContent(MODEL_OUTPUT);
  const characters = JSON.parse(repaired.content).characters;
  // 这三条正是模板兜底搞坏过的：名字变成「目标观众…」、年龄变成写死的儿童 8 岁
  assert.ok(!JSON.stringify(characters).includes('对这个主题感兴趣的目标观众'));
  assert.ok(characters.every((c) => c.variants.every((v) => v.ageLabel !== '8 岁')));
  assert.ok(!JSON.stringify(characters).includes('幼儿园'));
  assert.deepEqual(characters.map((c) => c.variants[0].ageLabel), ['28 岁', '29 岁', '30 岁']);
});

test('缺变体时从人物描述里抠年龄，抠不到就写「按剧本设定」，绝不套用写死的年龄档', () => {
  const withAge = repairCharactersContent(JSON.stringify({
    characters: [{ name: '陈女士', description: '28岁，职场女性' }]
  }));
  assert.equal(JSON.parse(withAge.content).characters[0].variants[0].ageLabel, '28 岁');

  const withoutAge = repairCharactersContent(JSON.stringify({
    characters: [{ name: '神秘人', description: '只出现背影' }]
  }));
  assert.equal(JSON.parse(withoutAge.content).characters[0].variants[0].ageLabel, '按剧本设定');

  assert.equal(ageLabelFromText('30岁，成熟稳重'), '30 岁');
  assert.equal(ageLabelFromText('没有年龄'), '');
});

test('没有名字的角色被丢掉并报数——人名是事实，编不出来', () => {
  const repaired = repairCharactersContent(JSON.stringify({
    characters: [{ name: '陈女士', description: '28岁' }, { description: '某个没名字的人' }, {}]
  }));
  const characters = JSON.parse(repaired.content).characters;
  assert.deepEqual(characters.map((c) => c.name), ['陈女士']);
  assert.equal(repaired.dropped, 2);
});

test('一个必需角色都没有时把第一个提成主角', () => {
  const repaired = repairCharactersContent(JSON.stringify({
    characters: [{ name: '陈女士', description: '28岁' }, { name: '前任A', description: '29岁' }]
  }));
  const characters = JSON.parse(repaired.content).characters;
  assert.equal(characters[0].required, true);
  assert.equal(characters[1].required, false);
  assert.ok(passesContract(repaired.content));
});

test('真救不回来的产出返回 null，让内置模板接手', () => {
  assert.equal(repairCharactersContent('{ 这不是 JSON'), null);
  assert.equal(repairCharactersContent('{"characters":"不是数组"}'), null);
  assert.equal(repairCharactersContent('{"characters":[]}'), null);
  assert.equal(repairCharactersContent('{"characters":[{"description":"没有名字"}]}'), null);
});

test('契约问题逐条报出来，而不是只说一句「结构校验未通过」', () => {
  const issues = characterContractIssues(JSON.parse(MODEL_OUTPUT));
  assert.ok(issues.some((item) => item.character === '前任A' && item.field === 'faceIdStrategy'));
  assert.ok(issues.some((item) => item.character === '现任B' && item.field === 'expressionRange'));
  assert.ok(issues.some((item) => item.character === '现任B' && /primaryImagePrompt/.test(item.field)));

  assert.equal(describeCharacterIssues([]), '');
  const many = describeCharacterIssues(
    Array.from({ length: 10 }, (_, index) => ({ character: `角色${index}`, field: 'name' })),
    3
  );
  assert.match(many, /另有 7 处/);
});

test('模型写全了就不补任何字段，原有内容一个字都不改', () => {
  const complete = JSON.parse(MODEL_OUTPUT);
  complete.characters = [complete.characters[0]];
  const content = JSON.stringify(complete);
  assert.ok(passesContract(content));

  const repaired = repairCharactersContent(content);
  assert.deepEqual(Array.from(repaired.filled), [], '没有缺字段就不该记录任何补齐项');

  // 原文里写过的每个字段都要原样保留（补齐会额外补上 primaryImageUrl 这类空字段，允许）
  const before = complete.characters[0];
  const after = JSON.parse(repaired.content).characters[0];
  for (const [key, value] of Object.entries(before)) {
    if (key === 'variants') continue;
    assert.deepEqual(after[key], value, `${key} 不该被改动`);
  }
  for (const [key, value] of Object.entries(before.variants[0])) {
    assert.equal(after.variants[0][key], value, `变体的 ${key} 不该被改动`);
  }
});
