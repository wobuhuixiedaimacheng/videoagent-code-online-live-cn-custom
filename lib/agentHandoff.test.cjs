const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function loadAgentHandoffModule() {
  const filePath = path.join(__dirname, 'agentHandoff.ts');
  assert.equal(fs.existsSync(filePath), true, 'agentHandoff.ts should exist');
  const source = fs.readFileSync(filePath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020
    }
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, { module, exports: module.exports, require }, { filename: filePath });
  return module.exports;
}

function loadProductionStageOrder() {
  const source = fs.readFileSync(path.join(__dirname, 'productionFlow.ts'), 'utf8');
  const match = source.match(/PRODUCTION_STAGE_ORDER: ProductionStageId\[\] = \[([^\]]+)\]/);
  assert.ok(match, 'PRODUCTION_STAGE_ORDER should be declared in productionFlow.ts');
  return match[1].split(',').map((item) => item.trim().replace(/'/g, '')).filter(Boolean);
}

test('every production stage has an owner', () => {
  const { STAGE_OWNER } = loadAgentHandoffModule();
  for (const stage of loadProductionStageOrder()) {
    const owner = STAGE_OWNER[stage];
    assert.ok(owner, `${stage} should have an owner`);
    assert.ok(owner.name.trim(), `${stage} owner should have a name`);
    assert.ok(owner.emoji.trim(), `${stage} owner should have an emoji`);
  }
});

test('stage owners are distinct so a handoff never reads as self to self', () => {
  const { STAGE_OWNER } = loadAgentHandoffModule();
  const names = loadProductionStageOrder().map((stage) => STAGE_OWNER[stage].name);
  assert.equal(new Set(names).size, names.length, 'stage owner names should be unique');
});

test('handoff text names both the outgoing and incoming owner', () => {
  const { handoffText, STAGE_OWNER } = loadAgentHandoffModule();
  const text = handoffText('script', 'character');
  assert.match(text, new RegExp(`@${STAGE_OWNER.script.name}`));
  assert.match(text, new RegExp(`@${STAGE_OWNER.character.name}`));
  assert.match(text, /邀请/);
  assert.match(text, /加入了群聊/);
});

test('handoff text covers every consecutive stage pair in the pipeline', () => {
  const { handoffText } = loadAgentHandoffModule();
  const order = loadProductionStageOrder();
  for (let index = 0; index < order.length - 1; index += 1) {
    const text = handoffText(order[index], order[index + 1]);
    assert.ok(text.includes('@'), `${order[index]}→${order[index + 1]} should produce a handoff line`);
    assert.doesNotMatch(text, /undefined/, `${order[index]}→${order[index + 1]} should not leak undefined`);
  }
});

test('stage owner label is what the canvas shows and carries the same name as the handoff', () => {
  const { stageOwnerLabel, stageOwnerName, handoffText } = loadAgentHandoffModule();
  for (const stage of loadProductionStageOrder()) {
    assert.ok(stageOwnerLabel(stage).includes(stageOwnerName(stage)));
  }
  // 按钮说「交给角色设计师」，播报就必须是同一个角色设计师，否则用户会认为是两个人。
  assert.ok(handoffText('script', 'character').includes(stageOwnerName('character')));
});
