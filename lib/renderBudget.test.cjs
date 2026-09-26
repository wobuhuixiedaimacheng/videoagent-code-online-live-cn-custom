const assert = require('node:assert/strict');
const fs = require('node:fs');
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

function loadRenderBudget() {
  const restore = installTypeScriptLoader();
  try {
    return require('./renderBudget.ts');
  } finally {
    restore();
  }
}

// 镜头数按目标时长（realistic 3s）算，不是按硬上限 5s 算：
// 上限只管「不能更长」，拆得多细由目标时长决定，见 shotPhysics.targetShotSeconds。
test('180 秒片子等于 60 个镜头、60–180 次渲染', () => {
  const { estimateRenderBudget } = loadRenderBudget();
  const budget = estimateRenderBudget({ totalSeconds: 180 });

  assert.equal(budget.shotCount, 60);
  assert.equal(budget.minRenders, 60);
  // VIDEO_QA_MAX_ATTEMPTS = 2，所以最坏情况是每个镜头渲 3 次。
  assert.equal(budget.maxRenders, 180);
  // 摘要里报的仍是硬上限，因为那才是「这个镜头会不会崩」的判断依据。
  assert.equal(budget.shotCapSeconds, 5);
});

test('缩短总时长会同比压掉渲染量——这正是要让用户在决策时看见的东西', () => {
  const { estimateRenderBudget } = loadRenderBudget();

  assert.equal(estimateRenderBudget({ totalSeconds: 60 }).maxRenders, 60);
  assert.equal(estimateRenderBudget({ totalSeconds: 180 }).maxRenders, 180);
});

test('时长未定时不假装能预估', () => {
  const { estimateRenderBudget, renderBudgetSummary } = loadRenderBudget();
  const budget = estimateRenderBudget({ totalSeconds: 0 });

  assert.equal(budget.shotCount, 0);
  assert.match(renderBudgetSummary(budget), /暂无法预估/);
});

test('摘要里同时出现镜头数、单镜头上限和渲染区间', () => {
  const { estimateRenderBudget, renderBudgetSummary } = loadRenderBudget();
  const summary = renderBudgetSummary(estimateRenderBudget({ totalSeconds: 180 }));

  assert.match(summary, /60 个镜头/);
  assert.match(summary, /上限 5s/);
  assert.match(summary, /60–180 次/);
});
