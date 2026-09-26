const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

function loadVoiceMode() {
  const filePath = path.join(__dirname, 'voiceMode.ts');
  assert.equal(fs.existsSync(filePath), true, 'voiceMode.ts should define the dialogue contract');
  const source = fs.readFileSync(filePath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const module = { exports: {} };
  new Function('exports', 'module', output)(module.exports, module);
  return module.exports;
}

const voice = loadVoiceMode();

test('dialogue is the default, narration is an explicit opt-in', () => {
  // 反过来（默认旁白）正是那次事故的成因：字段叫 narration，没人显式选过，全片就成了旁白片。
  assert.equal(voice.DEFAULT_VOICE_MODE, 'dialogue');
  assert.equal(voice.normalizeVoiceMode(undefined), 'dialogue');
  assert.equal(voice.normalizeVoiceMode('乱写'), 'dialogue');
  assert.equal(voice.normalizeVoiceMode('narration'), 'narration');
  assert.equal(voice.normalizeVoiceMode('silent'), 'silent');
});

test('narration only passes when every line is spoken by a named character', () => {
  assert.equal(voice.isDialogueNarration(''), true, '没人说话是合法的');
  assert.equal(voice.isDialogueNarration(undefined), true);
  assert.equal(voice.isDialogueNarration('小澎：这颗给你。'), true);
  assert.equal(voice.isDialogueNarration('小澎：走啊\n小雨：不去'), true);
  assert.equal(voice.isDialogueNarration('小澎: 走啊'), true, '英文冒号同样接受');
  assert.equal(voice.isDialogueNarration('小澎：我说：不行'), true, '台词内部允许再出现冒号');

  assert.equal(
    voice.isDialogueNarration('小澎的第一段恋爱，开始于一颗还没剥开的糖。'),
    false,
    '第三人称叙述句就是旁白'
  );
  assert.equal(voice.isDialogueNarration('你要吃糖吗'), false, '没有说话人时模型不知道该让谁开口');
  assert.equal(voice.isDialogueNarration('小澎：走啊\n他们最终还是分开了。'), false, '一行不合规整条就不合规');
});

test('a narrator cannot sneak in disguised as a speaker name', () => {
  // 格式对了内容还是旁白，是模型最容易找到的空子。
  for (const disguise of [
    '旁白：小澎的第一段恋爱，开始于一颗糖。',
    '解说：三年后。',
    '画外音：他后悔了。',
    '独白：我完了。',
    '内心独白：我完了。',
    '字幕：那年夏天。',
    'V.O.：那年夏天。',
    'narrator: that summer.',
    'voiceover：that summer.'
  ]) {
    assert.equal(voice.isDialogueNarration(disguise), false, `${disguise} 应当判不合格`);
    assert.equal(voice.toDialogueNarration(disguise), '', `${disguise} 应当被归一化掉`);
  }
});

test('the fallback template always satisfies the gate it is checked against', () => {
  // 模板产出不合格 = 用同样不合格的内容盖掉模型产出，还白白丢了更好的那一份。
  for (const value of [
    '',
    undefined,
    42,
    '小澎：走啊\n小雨：不去',
    '小澎的第一段恋爱，开始于一颗还没剥开的糖。',
    '旁白：三年后。',
    '你要吃糖吗'
  ]) {
    assert.equal(voice.isDialogueNarration(voice.toDialogueNarration(value)), true);
  }
});

test('render-time directive never asks a character to speak a narration line', () => {
  const spoken = voice.dialoguePromptDirective('小澎：走啊\n小雨：不去');
  assert.match(spoken, /画面中的小澎开口说/);
  assert.match(spoken, /画面中的小雨开口说/);
  assert.match(spoken, /全片不使用旁白/);

  const silent = voice.dialoguePromptDirective('');
  assert.match(silent, /本镜头没有人说话/);
  assert.match(silent, /不要任何画外音、旁白/);

  // 「旁白：……」整行丢掉后就没有台词了，退回无人声，而不是硬塞给某个角色念。
  const disguised = voice.dialoguePromptDirective('旁白：他后悔了。');
  assert.match(disguised, /本镜头没有人说话/);
  assert.doesNotMatch(disguised, /他后悔了/);
});

test('台词进模型之前要洗掉括注和特殊符号', () => {
  // 括注是给人看的舞台提示。原样递给视频模型，它要么让角色把「冷笑」两个字念出来，
  // 要么把它画到画面上——用户看到的就是字幕中间冒出一个奇怪符号。
  assert.equal(voice.sanitizeDialogueLine('（冷笑）你以为我不知道吗——'), '你以为我不知道吗。');
  assert.equal(voice.sanitizeDialogueLine('我等你……很久了【第二章】'), '我等你，很久了');
  assert.equal(voice.sanitizeDialogueLine('这颗给你🍬，等等。'), '这颗给你，等等。');
  // 整句都是括注的行没有台词可念，应该被丢掉，而不是留下一个空壳。
  assert.equal(voice.sanitizeDialogueLine('（自言自语）'), '');
  // 书名号是例外：它是台词的一部分，删符号不删内容。
  assert.equal(voice.sanitizeDialogueLine('《活着》这本书，我读过。'), '活着这本书，我读过。');
  // 正常台词不该被动过。
  assert.equal(voice.sanitizeDialogueLine('正常的一句话。'), '正常的一句话。');

  // 清洗要发生在解析这一层，这样每个下游都拿到干净的台词，不用各洗一遍。
  assert.deepEqual(voice.parseDialogueLines('林岩：（苦笑）算了——\n苏晚：（沉默）'), [
    { speaker: '林岩', line: '算了。' }
  ]);

  const directive = voice.dialoguePromptDirective('林岩：（苦笑）算了——');
  assert.match(directive, /画面中的林岩开口说\{算了。\}/);
  assert.doesNotMatch(directive, /苦笑|——/);
  // 大括号是规范里的台词标记，但要明说它自己不许被画出来。
  assert.match(directive, /只是台词的标记/);
});

test('every prompt layer carries the same ban so the model finds no loose layer', () => {
  const layers = [
    voice.dialogueScriptInstruction(),
    voice.dialogueStoryboardInstruction(),
    voice.dialogueAssetPromptInstruction(),
    voice.dialoguePromptDirective('小澎：走啊')
  ];
  for (const layer of layers) {
    assert.match(layer, /全片不使用旁白/, '四层必须共用同一句禁令');
  }
  assert.match(voice.voiceNegativePrompt(), /不要旁白/);
  assert.match(voice.voiceNegativePrompt(), /不要画外音/);
});

test('the word budget the instruction quotes is the one the code computes', () => {
  // 文案里手写一个数字、函数里算另一个，正是这个模块要防的漂移。
  assert.match(voice.dialogueStoryboardInstruction(), new RegExp(`最多约 ${voice.dialogueWordBudget(5)} 个字`));
  assert.ok(voice.dialogueWordBudget(5) < voice.dialogueWordBudget(8));
  // 时长非法时按 5 秒的默认镜头算，不是直接掉到下限。
  assert.equal(voice.dialogueWordBudget(0), voice.dialogueWordBudget(5));
  assert.equal(voice.dialogueWordBudget('乱写'), voice.dialogueWordBudget(5));
  // 下限只在极短镜头上生效：1 秒按公式只有 3 个字，一句话都说不完。
  assert.equal(voice.dialogueWordBudget(1), 8);
});

test('narration and silent modes stay available for voiceover-driven formats', () => {
  // 口播带货这类片种本来就该有旁白，禁令只是默认值，不是把能力删掉。
  assert.match(voice.dialogueScriptInstruction('narration'), /旁白驱动/);
  assert.doesNotMatch(voice.dialogueScriptInstruction('narration'), /全片不使用旁白/);
  assert.match(voice.dialoguePromptDirective('小澎：走啊', 'silent'), /本镜头没有人声/);
});
