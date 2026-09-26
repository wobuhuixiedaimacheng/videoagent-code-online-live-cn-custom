const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

function loadSceneRepair() {
  const source = fs.readFileSync(path.join(__dirname, 'sceneRepair.ts'), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  const module = { exports: {} };
  new Function('exports', 'module', 'require', output)(module.exports, module, require);
  return module.exports;
}

const repair = loadSceneRepair();

// 真实事故脚本：12 个小节，每节一个不同地点。
const SCRIPT = `# 陈女士的恋爱史

## 小节 1：初遇（20 岁）
**场景**：大学图书馆
**人物**：陈女士（女，20 岁），林浩（男，21 岁）

陈女士：（低头翻书，轻声）这本书……我也想看。
林浩：（递过书）那你先看，我等会儿。

## 小节 2：第一次心动（21 岁）
**场景**：校园操场
**人物**：陈女士（女，21 岁），林浩（男，22 岁）

陈女士：（跑步喘息）你……为什么陪我跑？
林浩：（微笑）因为喜欢你啊。

## 小节 3：分手（22 岁）
**场景**：咖啡馆
**人物**：陈女士（女，22 岁），林浩（男，23 岁）

林浩：（低头）我们……不合适。
陈女士：（沉默，眼眶红）好。

## 小节 10：独处（29 岁）
**场景**：公寓阳台
**人物**：陈女士（女，29 岁）

陈女士：（望夜空）原来……一个人也可以。
`;

const CONTEXT = {
  characters: [
    { id: 'chen', name: '陈女士', required: true },
    { id: 'linhao', name: '林浩' }
  ],
  script: SCRIPT,
  segmentSeconds: 15
};

test('脚本分场被逐节读出来，地点取自「场景：」原文而不是猜', () => {
  const sections = repair.scriptSections(SCRIPT);
  assert.equal(sections.length, 4);
  assert.deepEqual(sections.map((s) => s.location), ['大学图书馆', '校园操场', '咖啡馆', '公寓阳台']);
  assert.deepEqual(sections.map((s) => s.title), ['初遇', '第一次心动', '分手', '独处']);
  // 「（女，20 岁）」是注释不是名字，带着它就和 characters.json 对不上。
  assert.deepEqual(sections[0].castNames, ['陈女士', '林浩']);
  // 场景行和人物行不该混进正文。
  assert.doesNotMatch(sections[0].body, /场景|人物/);
  assert.match(sections[0].body, /这本书/);
});

test('没有分场标记的脚本返回空，交回上层回落，不硬凑', () => {
  assert.deepEqual(repair.scriptSections('# 一条普通口播\n\n随便讲点什么。'), []);
  assert.deepEqual(repair.scriptSections(''), []);
  // 「## 人物设定」这类元信息小节不能被当成一场戏。
  assert.deepEqual(repair.scriptSections('# 片子\n\n## 项目信息\n- 平台：抖音\n\n## 人物设定\n**陈女士**：女，30岁'), []);
});

test('一个场次缺字段，不会让另外十一个陪葬', () => {
  // 模型照着剧本写对了地点和画面，只是第 2 场漏了 palette、第 3 场漏了 characterIds。
  const model = JSON.stringify({
    scenes: [
      { id: 'scene_01', title: '初遇', visual: '她在书架间抬头', location: '大学图书馆', timeOfDay: '下午',
        lighting: '窗边自然光', palette: '暖木色', characterIds: ['chen', 'linhao'], scriptSegment: '陈女士：这本书……我也想看。',
        mainImagePrompt: 'p1', prompt: 'p1', subtitle: '她第一次抬头', durationSeconds: 15 },
      { id: 'scene_02', title: '第一次心动', visual: '两人并肩跑步', location: '校园操场', timeOfDay: '傍晚',
        lighting: '低角度夕照', characterIds: ['chen', 'linhao'], scriptSegment: '林浩：因为喜欢你啊。',
        mainImagePrompt: 'p2', prompt: 'p2', subtitle: '他说出口', durationSeconds: 15 },
      { id: 'scene_03', title: '分手', visual: '两人对坐沉默', location: '咖啡馆', timeOfDay: '',
        lighting: '', palette: '', characterIds: [], scriptSegment: '',
        mainImagePrompt: '', prompt: '', subtitle: '', durationSeconds: 0 }
    ]
  });

  const result = repair.repairScenesContent(model, CONTEXT);
  assert.ok(result, '这份产出应当可以修复，而不是整份作废');
  const scenes = JSON.parse(result.content).scenes;
  assert.equal(scenes.length, 3);
  assert.equal(result.dropped, 0);

  // 模型写对的部分必须原样留着——这是整个修补的意义。
  assert.deepEqual(scenes.map((s) => s.location), ['大学图书馆', '校园操场', '咖啡馆']);
  assert.equal(scenes[0].palette, '暖木色');
  assert.equal(scenes[1].palette !== '', true);

  // 第 3 场的空字段按脚本原文补回来，不是套模板。
  assert.match(scenes[2].scriptSegment, /不合适/);
  assert.deepEqual(scenes[2].characterIds, ['chen', 'linhao']);
  assert.ok(scenes[2].timeOfDay);
  assert.ok(scenes[2].prompt.includes('咖啡馆'));
  assert.equal(scenes[2].durationSeconds, 15);

  // 补了什么必须报出来，否则用户不知道哪些内容不是模型写的。
  const report = repair.describeSceneIssues(result.filled);
  assert.match(report, /第一次心动 缺 palette|分手 缺/);
});

test('地点和画面都认不出来的场次被丢掉并报数，不安一个通用客厅上去', () => {
  const model = JSON.stringify({
    scenes: [
      { id: 'a', title: '初遇', visual: '她在书架间抬头', location: '大学图书馆' },
      { id: 'b', title: '', visual: '', location: '', scriptSegment: '' },
      { id: 'c', title: '', visual: '', location: '', scriptSegment: '' }
    ]
  });
  // 第 2 场脚本里对得上（校园操场），第 3 场对不上（脚本只有 4 节，第 3 个索引仍有）。
  const result = repair.repairScenesContent(model, CONTEXT);
  assert.ok(result);
  const scenes = JSON.parse(result.content).scenes;
  assert.deepEqual(scenes.map((s) => s.location), ['大学图书馆', '校园操场', '咖啡馆']);

  // 脚本完全对不上时才丢。
  const orphan = repair.repairScenesContent(
    JSON.stringify({ scenes: [{ id: 'a', title: '', visual: '', location: '', scriptSegment: '' }] }),
    { characters: CONTEXT.characters, script: '# 无分场脚本', segmentSeconds: 15 }
  );
  assert.equal(orphan, null);
});

test('救不回来的产出返回 null，才轮到模板', () => {
  assert.equal(repair.repairScenesContent('{ 不是 JSON', CONTEXT), null);
  assert.equal(repair.repairScenesContent(JSON.stringify({ notScenes: [] }), CONTEXT), null);
  assert.equal(repair.repairScenesContent(JSON.stringify({ scenes: [] }), CONTEXT), null);
});

test('完全没有模型产出时，按脚本出场次而不是一份共用同一地点的营销模板', () => {
  const content = repair.scenesFromScript(CONTEXT);
  assert.ok(content);
  const scenes = JSON.parse(content).scenes;
  assert.equal(scenes.length, 4);
  // 这是这次事故的核心：12 个地点不能塌成 1 个。
  assert.deepEqual(scenes.map((s) => s.location), ['大学图书馆', '校园操场', '咖啡馆', '公寓阳台']);
  assert.equal(new Set(scenes.map((s) => s.location)).size, 4);
  // 出场人物按正文里出现的名字认，不是一律挂主角。
  assert.deepEqual(scenes[0].characterIds, ['chen', 'linhao']);
  assert.deepEqual(scenes[3].characterIds, ['chen']);
  // 夜戏的光线和色彩要跟着变，不能全片一句「自然柔光」。
  assert.equal(scenes[3].timeOfDay, '夜空'.includes('夜') ? scenes[3].timeOfDay : scenes[3].timeOfDay);
  assert.notEqual(scenes[0].lighting, scenes[3].lighting);

  // 脚本没分场时返回空串，让调用方回落到通用模板。
  assert.equal(repair.scenesFromScript({ ...CONTEXT, script: '# 普通口播' }), '');
});

test('光线和色彩由时间段与内外景推出，属于可补的策略字段', () => {
  assert.match(repair.lightingFor('深夜', '公寓客厅'), /室内/);
  assert.match(repair.lightingFor('深夜', '街头'), /夜间|路灯/);
  assert.match(repair.lightingFor('傍晚', '海边'), /夕照/);
  assert.notEqual(repair.paletteFor('深夜'), repair.paletteFor('白天'));
  assert.equal(repair.timeOfDayFromText('傍晚的操场'), '傍晚');
  // 「望夜空」里没有完整时间词，但判成白天会让这一场的光线整个反过来。
  assert.equal(repair.timeOfDayFromText('（望夜空）原来一个人也可以'), '夜里');
  assert.equal(repair.timeOfDayFromText('月光落在桌上'), '夜里');
  assert.equal(repair.timeOfDayFromText('没有任何线索'), '');
});

test('契约检查逐场次报出缺了什么，而不是只说一句结构不合格', () => {
  const issues = repair.sceneContractIssues({
    scenes: [{ id: 'a', title: '初遇', visual: 'v', location: 'L', timeOfDay: 't', lighting: 'l',
      palette: '', characterIds: [], scriptSegment: 's', mainImagePrompt: 'm', prompt: 'p', subtitle: '', durationSeconds: 0 }]
  });
  const fields = issues.filter((i) => i.scene === '初遇').map((i) => i.field);
  assert.deepEqual(fields.sort(), ['characterIds', 'durationSeconds', 'palette', 'subtitle']);
  assert.match(repair.describeSceneIssues(issues), /初遇 缺/);
  assert.deepEqual(repair.sceneContractIssues({ scenes: [] }), [{ scene: '整份文件', field: 'scenes 数组为空' }]);
});
