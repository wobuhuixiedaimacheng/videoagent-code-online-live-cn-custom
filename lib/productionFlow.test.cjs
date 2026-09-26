const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const {
  workspaceWith,
  readyFlow,
  confirmedFlow,
  confirmationInput
} = require('./testFixtures.cjs');

function transpile(filePath) {
  return ts.transpileModule(fs.readFileSync(filePath, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020
    }
  }).outputText;
}

// productionFlow 现在会 import videoStitch（成片状态的归一化），裸 require 解析不到 .ts。
function installTypeScriptLoader() {
  const previous = require.extensions['.ts'];
  require.extensions['.ts'] = (module, filePath) => module._compile(transpile(filePath), filePath);
  return () => {
    if (previous) require.extensions['.ts'] = previous;
    else delete require.extensions['.ts'];
  };
}

function loadProductionFlowModule() {
  const filePath = path.join(__dirname, 'productionFlow.ts');
  assert.equal(fs.existsSync(filePath), true, 'productionFlow.ts should exist');
  const restore = installTypeScriptLoader();
  try {
    const module = { exports: {} };
    vm.runInNewContext(transpile(filePath), { module, exports: module.exports, require }, { filename: filePath });
    return module.exports;
  } finally {
    restore();
  }
}

test('a workspace with a script starts at script review and locks downstream stages', () => {
  const { productionFlowFromWorkspace, visibleProductionStages } = loadProductionFlowModule();
  const flow = productionFlowFromWorkspace(workspaceWith({ 'script.md': '# 完整脚本' }));
  assert.equal(flow.currentStage, 'script');
  assert.equal(flow.stages.script.status, 'ready_for_review');
  assert.equal(flow.stages.character.status, 'locked');
  assert.deepEqual(Array.from(visibleProductionStages(flow)), ['script']);
});

test('confirmation freezes the expected draft and starts only the direct downstream stage', () => {
  const { confirmFlowStage, beginStageGeneration } = loadProductionFlowModule();
  const flow = readyFlow('script', 3);
  const next = confirmFlowStage(flow, {
    stage: 'script',
    expectedDraftVersion: 3,
    confirmationKey: 'confirm-script-3',
    confirmedAt: '2026-07-11T12:00:00.000Z',
    confirmedBy: 'local-user',
    nextGenerationJobId: 'character-job-1',
    sourceVersions: { 'script.md': 3 }
  });
  assert.equal(next.stages.script.status, 'confirmed');
  assert.equal(next.stages.character.status, 'generating');
  assert.equal(next.stages.scene.status, 'locked');
  assert.deepEqual(
    beginStageGeneration(next, 'character', 'character-job-1', { 'script.md': 3 }),
    next
  );
});

test('an upstream revision makes every downstream result stale', () => {
  const { beginStageGeneration, markStageDraft } = loadProductionFlowModule();
  const started = beginStageGeneration(confirmedFlow(), 'script', 'script-revision-2', { 'brief.json': 2 });
  const next = markStageDraft(started, {
    stage: 'script',
    generationJobId: 'script-revision-2',
    sourceVersions: { 'brief.json': 2 }
  });
  assert.equal(next.stages.script.status, 'ready_for_review');
  for (const stage of ['character', 'scene', 'storyboard', 'video']) {
    assert.equal(next.stages[stage].status, 'stale');
  }
});

test('editing an unconfirmed initial script keeps every locked downstream stage locked', () => {
  const { beginStageGeneration, markStageDraft, visibleProductionStages } = loadProductionFlowModule();
  const initial = readyFlow('script', 1);
  initial.stages.script.generationJobId = 'script-initial-job';
  const started = beginStageGeneration(initial, 'script', 'script-manual-job', {});
  const next = markStageDraft(started, {
    stage: 'script', generationJobId: 'script-manual-job', sourceVersions: {}
  });

  assert.equal(next.stages.script.status, 'ready_for_review');
  for (const stage of ['character', 'scene', 'storyboard', 'video']) {
    assert.equal(next.stages[stage].status, 'locked');
  }
  assert.deepEqual(Array.from(visibleProductionStages(next)), ['script']);
});

test('a confirmed character or scene revision becomes re-confirmable and stales downstream stages', () => {
  const { beginStageGeneration, markStageDraft } = loadProductionFlowModule();
  const characterConfirmed = confirmedFlow();
  characterConfirmed.stages.character.status = 'confirmed';
  characterConfirmed.stages.character.draftVersion = 2;
  characterConfirmed.stages.scene.status = 'confirmed';
  characterConfirmed.stages.storyboard.status = 'confirmed';
  characterConfirmed.stages.video.status = 'completed';
  const characterRevision = markStageDraft(
    beginStageGeneration(characterConfirmed, 'character', 'character-manual-3', { 'script.md': 1 }),
    { stage: 'character', generationJobId: 'character-manual-3', sourceVersions: { 'script.md': 1 } }
  );
  assert.equal(characterRevision.stages.character.status, 'ready_for_review');
  assert.equal(characterRevision.stages.character.draftVersion, 3);
  for (const stage of ['scene', 'storyboard', 'video']) assert.equal(characterRevision.stages[stage].status, 'stale');

  const sceneConfirmed = { ...characterConfirmed, stages: Object.fromEntries(Object.entries(characterConfirmed.stages).map(([key, value]) => [key, { ...value }])) };
  sceneConfirmed.stages.scene.status = 'confirmed';
  sceneConfirmed.stages.scene.draftVersion = 4;
  const sceneRevision = markStageDraft(
    beginStageGeneration(sceneConfirmed, 'scene', 'scene-manual-5', { 'script.md': 1, 'characters.json': 2 }),
    { stage: 'scene', generationJobId: 'scene-manual-5', sourceVersions: { 'script.md': 1, 'characters.json': 2 } }
  );
  assert.equal(sceneRevision.stages.scene.status, 'ready_for_review');
  assert.equal(sceneRevision.stages.scene.draftVersion, 5);
  for (const stage of ['storyboard', 'video']) assert.equal(sceneRevision.stages[stage].status, 'stale');
});

test('duplicate confirmation keys are idempotent and mismatched versions are rejected', () => {
  const { confirmFlowStage } = loadProductionFlowModule();
  const once = confirmFlowStage(readyFlow('scene', 2), confirmationInput('scene', 2, 'scene-key'));
  assert.deepEqual(confirmFlowStage(once, confirmationInput('scene', 2, 'scene-key')), once);
  assert.throws(
    () => confirmFlowStage(readyFlow('scene', 3), confirmationInput('scene', 2, 'other-key')),
    /草稿版本已经变化/
  );
});

test('a late generation result cannot replace the current job', () => {
  const { beginStageGeneration, completeStageGeneration } = loadProductionFlowModule();
  const flow = beginStageGeneration(readyFlow('character', 1), 'character', 'job-new', { 'script.md': 1 });
  const result = completeStageGeneration(flow, 'character', 'job-old', { 'script.md': 1 });
  assert.equal(result.accepted, false);
  assert.deepEqual(result.flow, flow);
});

test('a late failure cannot replace a completed draft', () => {
  const { beginStageGeneration, completeStageGeneration, failStageGeneration } = loadProductionFlowModule();
  const started = beginStageGeneration(readyFlow('character', 1), 'character', 'job-current', { 'script.md': 1 });
  const completed = completeStageGeneration(started, 'character', 'job-current', { 'script.md': 1 }).flow;
  assert.deepEqual(failStageGeneration(completed, 'character', 'job-current', 'late failure'), completed);
});

test('marking a draft requires the active generation job and sources', () => {
  const { beginStageGeneration, markStageDraft } = loadProductionFlowModule();
  const started = beginStageGeneration(readyFlow('character', 1), 'character', 'job-current', { 'script.md': 1 });
  assert.deepEqual(markStageDraft(started, {
    stage: 'character', generationJobId: 'job-old', sourceVersions: { 'script.md': 1 }
  }), started);
});

test('marking a draft rejects changed sources even when the job id matches', () => {
  const { beginStageGeneration, markStageDraft } = loadProductionFlowModule();
  const started = beginStageGeneration(readyFlow('character', 1), 'character', 'job-current', { 'script.md': 1 });
  assert.deepEqual(markStageDraft(started, {
    stage: 'character', generationJobId: 'job-current', sourceVersions: { 'script.md': 2 }
  }), started);
});

test('a callback cannot turn a confirmed stage back into a draft without beginning a revision', () => {
  const { markStageDraft } = loadProductionFlowModule();
  const flow = confirmedFlow();
  assert.deepEqual(markStageDraft(flow, {
    stage: 'script', generationJobId: 'late-job', sourceVersions: { 'brief.json': 1 }
  }), flow);
});

test('a locked non-direct stage cannot begin generation', () => {
  const { beginStageGeneration } = loadProductionFlowModule();
  assert.throws(
    () => beginStageGeneration(readyFlow('script', 1), 'scene', 'scene-job', { 'characters.json': 1 }),
    /尚未解锁/
  );
});

test('a stale stage cannot begin while its predecessor is unconfirmed', () => {
  const { beginStageGeneration } = loadProductionFlowModule();
  const flow = readyFlow('character', 1);
  flow.stages.scene.status = 'stale';
  assert.throws(
    () => beginStageGeneration(flow, 'scene', 'scene-job', { 'characters.json': 1 }),
    /尚未解锁/
  );
});

test('a confirmed stage with a missing asset file is downgraded', () => {
  const { productionFlowFromWorkspace } = loadProductionFlowModule();
  const workspace = workspaceWith({
    'production_flow.json': JSON.stringify(confirmedFlow())
  });
  const flow = productionFlowFromWorkspace(workspace);
  assert.equal(flow.stages.script.status, 'failed');
  assert.match(flow.stages.script.error, /script\.md/);
});

test('restoring a non-video generating stage marks the unrecoverable run interrupted', () => {
  const { interruptUnrecoverableStageGenerations } = loadProductionFlowModule();
  const flow = readyFlow('script', 1);
  flow.stages.script.status = 'generating';
  flow.stages.script.generationJobId = 'lost-script-job';
  const recovered = interruptUnrecoverableStageGenerations(flow);
  assert.equal(recovered.stages.script.status, 'failed');
  assert.match(recovered.stages.script.error, /中断|重新生成/);
  assert.equal(recovered.currentStage, 'script');
});

test('restoring an active video render leaves provider-backed recovery state intact', () => {
  const { interruptUnrecoverableStageGenerations } = loadProductionFlowModule();
  const flow = readyFlow('video', 1);
  flow.stages.video.status = 'rendering';
  assert.deepEqual(interruptUnrecoverableStageGenerations(flow), flow);
});

// 已经付过钱的片段绝不能被引导去「重新生成」——那一步会清空 videoJobs，
// 连带丢掉上游任务 ID，11 段已渲染完的成片再也找不回来。
test('an interrupted video stage that already has paid-for clips is not offered for regeneration', () => {
  const { interruptUnrecoverableStageGenerations } = loadProductionFlowModule();
  const flow = readyFlow('video', 1);
  flow.stages.video.status = 'generating';
  flow.videoJobs = [
    { id: 'j1', promptId: 'prompt_01', status: 'completed', attempt: 1, providerTaskId: 'task_a', videoUrl: 'https://cdn/a.mp4' },
    { id: 'j2', promptId: 'prompt_02', status: 'polling', attempt: 1, providerTaskId: 'task_b' }
  ];
  const recovered = interruptUnrecoverableStageGenerations(flow);
  assert.equal(recovered.stages.video.status, 'rendering');
  assert.equal(recovered.stages.video.error, null);
  assert.equal(recovered.videoJobs.length, 2);
});

// video 阶段曾被整个排除在中断恢复之外，结果「正在生成视频任务」刷新也退不出去——
// 而刷新本来就是唯一的恢复入口。渲染中的批次靠 status='rendering' 区分，见上一条测试。
test('restoring an interrupted video task generation marks it failed so the user can retry', () => {
  const { interruptUnrecoverableStageGenerations } = loadProductionFlowModule();
  const flow = readyFlow('video', 1);
  flow.stages.video.status = 'generating';
  flow.stages.video.generationJobId = 'lost-video-job';
  const recovered = interruptUnrecoverableStageGenerations(flow);
  assert.equal(recovered.stages.video.status, 'failed');
  assert.match(recovered.stages.video.error, /中断|重新生成/);
  assert.equal(recovered.currentStage, 'video');
});

test('质检态和合成态能存盘再读回来，不会被打回 locked', () => {
  const { productionFlowFromWorkspace, writeProductionFlow } = loadProductionFlowModule();
  // 这条回归的由来：STAGE_STATUSES 白名单曾漏掉 qa_pending / qa_failed，
  // 于是「质检中」的视频阶段存盘再读回来变成「未解锁」，整条流程在界面上倒退回第一步。
  for (const status of ['qa_pending', 'qa_failed', 'stitching', 'rendering', 'completed']) {
    const workspace = workspaceWith({ 'script.md': '# 脚本' });
    const flow = productionFlowFromWorkspace(workspace);
    flow.stages.video = { ...flow.stages.video, status };
    const roundTripped = productionFlowFromWorkspace(writeProductionFlow(workspace, flow));
    assert.equal(roundTripped.stages.video.status, status, `${status} 应该能原样往返`);
  }
});

test('成片状态跟着 flow 一起存盘，刷新后还找得到成片', () => {
  const { productionFlowFromWorkspace, writeProductionFlow } = loadProductionFlowModule();
  const workspace = workspaceWith({ 'script.md': '# 脚本' });
  const flow = productionFlowFromWorkspace(workspace);
  flow.finalCut = {
    jobId: 'cut_abc_def',
    status: 'completed',
    progress: 100,
    clipCount: 36,
    fileName: '陈女士的恋爱史.mp4',
    fileUrl: '/api/video/stitch/file?job_id=cut_abc_def'
  };
  const roundTripped = productionFlowFromWorkspace(writeProductionFlow(workspace, flow));
  assert.equal(roundTripped.finalCut.jobId, 'cut_abc_def');
  assert.equal(roundTripped.finalCut.status, 'completed');
  assert.equal(roundTripped.finalCut.clipCount, 36);
});

test('残缺的成片记录会被丢掉，而不是带着半截状态复活', () => {
  const { productionFlowFromWorkspace, writeProductionFlow } = loadProductionFlowModule();
  const workspace = workspaceWith({ 'script.md': '# 脚本' });
  const flow = productionFlowFromWorkspace(workspace);
  flow.finalCut = { status: 'completed' };
  assert.equal(productionFlowFromWorkspace(writeProductionFlow(workspace, flow)).finalCut, null);
});
