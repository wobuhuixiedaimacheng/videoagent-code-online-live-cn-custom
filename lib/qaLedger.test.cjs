const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

function installTypeScriptLoader() {
  const previous = require.extensions['.ts'];
  require.extensions['.ts'] = (module, filePath) => {
    const source = fs.readFileSync(filePath, 'utf8');
    const output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
    }).outputText;
    module._compile(output, filePath);
  };
  return () => {
    if (previous) require.extensions['.ts'] = previous;
    else delete require.extensions['.ts'];
  };
}

function loadQaLedger() {
  const restore = installTypeScriptLoader();
  try {
    assert.equal(fs.existsSync(path.join(__dirname, 'qaLedger.ts')), true);
    return require('./qaLedger.ts');
  } finally {
    restore();
  }
}

function failedVerdict(checks, mode = 'realistic') {
  return {
    status: 'failed',
    mode,
    issues: checks.map((check) => ({ check, severity: 'major', detail: '' })),
    checkedFrames: 3
  };
}

test('只记 failed：passed 和 skipped 不进账本', () => {
  const { emptyQaLedger, recordQaFailure } = loadQaLedger();
  let ledger = emptyQaLedger();

  for (const status of ['passed', 'skipped']) {
    ledger = recordQaFailure(ledger, {
      sceneId: 'prompt_01',
      verdict: { status, mode: 'realistic', issues: [], checkedFrames: 0 },
      attempt: 0,
      strategy: null,
      exhausted: false
    });
  }

  // skipped 是「一帧都没抽到」，不是质量信号；记进来会把统计带偏。
  assert.equal(ledger.entries.length, 0);
});

test('同一个镜头的多次打回都记，刷满的只算一个镜头', () => {
  const { emptyQaLedger, recordQaFailure, summarizeQaLedger } = loadQaLedger();
  let ledger = emptyQaLedger();

  ledger = recordQaFailure(ledger, {
    sceneId: 'prompt_01',
    verdict: failedVerdict(['anatomy']),
    attempt: 0,
    strategy: 'shorten',
    exhausted: false
  });
  ledger = recordQaFailure(ledger, {
    sceneId: 'prompt_01',
    verdict: failedVerdict(['anatomy', 'clipping']),
    attempt: 1,
    strategy: null,
    exhausted: true
  });

  const summary = summarizeQaLedger(ledger);
  assert.equal(summary.totalFailures, 2);
  // 刷满的是「镜头」不是「次数」——同一个 sceneId 打回两次仍然只是一个救不回来的镜头。
  assert.equal(summary.exhaustedShots, 1);
  assert.deepEqual(summary.topChecks, [
    { check: 'anatomy', count: 2 },
    { check: 'clipping', count: 1 }
  ]);
});

test('账本有上限，超出后丢最早的记录', () => {
  const { emptyQaLedger, recordQaFailure, QA_LEDGER_MAX_ENTRIES } = loadQaLedger();
  let ledger = emptyQaLedger();

  for (let index = 0; index < QA_LEDGER_MAX_ENTRIES + 5; index += 1) {
    ledger = recordQaFailure(ledger, {
      sceneId: `prompt_${index}`,
      verdict: failedVerdict(['identity']),
      attempt: 0,
      strategy: 'simplify',
      exhausted: false
    });
  }

  assert.equal(ledger.entries.length, QA_LEDGER_MAX_ENTRIES);
  assert.equal(ledger.entries[0].sceneId, 'prompt_5');
});

test('坏掉的账本当成空账本，不抛错', () => {
  const { parseQaLedger, qaLedgerFromWorkspace } = loadQaLedger();

  assert.deepEqual(parseQaLedger(null).entries, []);
  assert.deepEqual(parseQaLedger({ schemaVersion: 9, entries: [] }).entries, []);
  assert.deepEqual(parseQaLedger({ schemaVersion: 1, entries: 'nope' }).entries, []);
  // 账本坏掉不该拖垮渲染流程。
  assert.deepEqual(
    qaLedgerFromWorkspace({ files: [{ path: '.aigc/qa_ledger.json', content: '{ not json' }] }).entries,
    []
  );
});

test('空账本不产生提示词段落，有记录才产生', () => {
  const { emptyQaLedger, recordQaFailure, qaLedgerInstruction } = loadQaLedger();

  assert.equal(qaLedgerInstruction(emptyQaLedger()), '');

  const ledger = recordQaFailure(emptyQaLedger(), {
    sceneId: 'prompt_01',
    verdict: failedVerdict(['identity']),
    attempt: 1,
    strategy: null,
    exhausted: true
  });
  const instruction = qaLedgerInstruction(ledger);
  assert.match(instruction, /角色一致性/);
  assert.match(instruction, /1 个镜头刷满重渲仍未通过/);
  // 写成历史教训而不是硬性规则，避免模型为了避坑放弃合理情节。
  assert.match(instruction, /不是硬性规则/);
});

test('写盘会递增版本号，并保留其他文件', () => {
  const { emptyQaLedger, writeQaLedger, QA_LEDGER_PATH } = loadQaLedger();
  const workspace = { files: [{ path: 'script.md', content: '# 脚本', version: 3 }] };

  const once = writeQaLedger(workspace, emptyQaLedger());
  const twice = writeQaLedger(once, emptyQaLedger());

  assert.equal(once.files.find((file) => file.path === 'script.md').version, 3);
  assert.equal(once.files.find((file) => file.path === QA_LEDGER_PATH).version, 1);
  assert.equal(twice.files.find((file) => file.path === QA_LEDGER_PATH).version, 2);
  assert.equal(twice.files.length, 2);
});
