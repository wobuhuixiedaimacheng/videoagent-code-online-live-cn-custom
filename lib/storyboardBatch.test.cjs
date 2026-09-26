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

function sceneIds(count) {
  return Array.from({ length: count }, (_, index) => `scene_${String(index + 1).padStart(2, '0')}`);
}

test('12 个 15 秒场景分成 6 批，每批 2 场 10 个镜头', () => {
  const restore = installTypeScriptLoader();
  try {
    const { planStoryboardBatches, TARGET_SHOTS_PER_BATCH } = require('./storyboardBatch.ts');
    const { shotsPerSegment } = require('./shotPhysics.ts');
    const batches = planStoryboardBatches(sceneIds(12), 15);

    // 批次大小按「JSON 修复也装得下」定：实测 15 个镜头一批时生成没问题，
    // 但一旦模型吐出语法错误的 JSON，重吐整份产出就会撞 max_tokens。
    assert.equal(TARGET_SHOTS_PER_BATCH, 10);
    assert.equal(batches.length, 6);
    assert.deepEqual(Array.from(batches[0].sceneIds), ['scene_01', 'scene_02']);
    assert.equal(batches[0].index, 1);
    assert.equal(batches[0].total, 6);
    assert.equal(batches[5].index, 6);

    // 每批的镜头数要落在单次响应装得下的范围内——这正是分批要解决的问题。
    for (const batch of batches) {
      assert.ok(batch.sceneIds.length * shotsPerSegment(15) <= TARGET_SHOTS_PER_BATCH);
    }
    // 一个场景都不能漏。
    assert.deepEqual(batches.flatMap((batch) => Array.from(batch.sceneIds)), sceneIds(12));
  } finally {
    restore();
  }
});

test('片子短到一批就够时不分批，走原来的单次请求', () => {
  const restore = installTypeScriptLoader();
  try {
    const { planStoryboardBatches } = require('./storyboardBatch.ts');

    assert.equal(planStoryboardBatches(sceneIds(2), 15).length, 1);
    assert.equal(planStoryboardBatches([], 15).length, 0);
    // 场景特别长时一批只装一场，也不能算出 0 场每批导致死循环。
    assert.equal(planStoryboardBatches(sceneIds(3), 300)[0].sceneIds.length, 1);
  } finally {
    restore();
  }
});

function shot(sceneId, id, durationSeconds) {
  return { id, sourceSceneId: sceneId, title: `${id} 标题`, durationSeconds, start: 0, end: durationSeconds };
}

test('合并按场景原顺序拼回，并重排全片时间轴', () => {
  const restore = installTypeScriptLoader();
  try {
    const { mergeStoryboardBatches } = require('./storyboardBatch.ts');
    // 每批都从 0 开始报 start/end——这正是分批之后模型必然的行为。
    const merged = mergeStoryboardBatches(
      [
        { sceneIds: ['scene_01'], shots: [shot('scene_01', 's1_a', 3), shot('scene_01', 's1_b', 2)] },
        { sceneIds: ['scene_02'], shots: [shot('scene_02', 's2_a', 4)] }
      ],
      ['scene_01', 'scene_02']
    );

    assert.deepEqual(merged.map((item) => item.id), ['s1_a', 's1_b', 's2_a']);
    // 第二批的镜头不能还停在 0 秒。
    assert.deepEqual(merged.map((item) => item.start), [0, 3, 5]);
    assert.deepEqual(merged.map((item) => item.end), [3, 5, 9]);
  } finally {
    restore();
  }
});

test('某一批越界产出别批的场景时，越界镜头被丢弃而不是重复进片', () => {
  const restore = installTypeScriptLoader();
  try {
    const { mergeStoryboardBatches } = require('./storyboardBatch.ts');
    const merged = mergeStoryboardBatches(
      [
        // 第 1 批把 scene_02 也写了，第 2 批本来就负责 scene_02。
        { sceneIds: ['scene_01'], shots: [shot('scene_01', 's1_a', 3), shot('scene_02', '越界', 3)] },
        { sceneIds: ['scene_02'], shots: [shot('scene_02', 's2_a', 4)] }
      ],
      ['scene_01', 'scene_02']
    );

    assert.deepEqual(merged.map((item) => item.id), ['s1_a', 's2_a']);
  } finally {
    restore();
  }
});

test('没写 sourceSceneId 的镜头不会被静默丢掉', () => {
  const restore = installTypeScriptLoader();
  try {
    const { mergeStoryboardBatches } = require('./storyboardBatch.ts');
    const merged = mergeStoryboardBatches(
      [{ sceneIds: ['scene_01'], shots: [shot('scene_01', 's1_a', 3), { id: '没归属', durationSeconds: 2 }] }],
      ['scene_01']
    );

    assert.deepEqual(merged.map((item) => item.id), ['s1_a', '没归属']);
    assert.equal(merged[1].start, 3);
  } finally {
    restore();
  }
});

test('剪辑节拍跟着合并后的镜头一一对齐', () => {
  const restore = installTypeScriptLoader();
  try {
    const { mergeStoryboardBatches, mergeTimelineBatches } = require('./storyboardBatch.ts');
    const merged = mergeStoryboardBatches(
      [
        { sceneIds: ['scene_01'], shots: [shot('scene_01', 's1_a', 3)] },
        { sceneIds: ['scene_02'], shots: [shot('scene_02', 's2_a', 4)] }
      ],
      ['scene_01', 'scene_02']
    );
    const timeline = mergeTimelineBatches(
      [
        { principle: '先给冲突再给结果。', beats: [{ sceneId: 's1_a', role: 'hook', editNote: '开场直接进冲突。' }] },
        { principle: '', beats: [{ sceneId: 's2_a', role: 'body', pacing: 'fast' }] }
      ],
      merged
    );

    assert.equal(timeline.principle, '先给冲突再给结果。');
    assert.equal(timeline.beats.length, 2);
    assert.deepEqual(timeline.beats.map((beat) => beat.sceneId), ['s1_a', 's2_a']);
    // 时间轴抄合并后的镜头，不采信各批自己报的值。
    assert.deepEqual(timeline.beats.map((beat) => beat.start), [0, 3]);
    assert.deepEqual(timeline.beats.map((beat) => beat.end), [3, 7]);
    assert.equal(timeline.beats[0].editNote, '开场直接进冲突。');
    // 模型没给 editNote 的节拍也要有内容，不能留空让剪辑面板显示一片空白。
    assert.match(String(timeline.beats[1].editNote), /s2_a 标题/);
  } finally {
    restore();
  }
});

test('批次范围会写进生成指令，让模型知道只做这几场', () => {
  const restore = installTypeScriptLoader();
  try {
    const { storyboardBatchInstruction } = require('./storyboardBatch.ts');
    const { stageGenerationInstruction } = require('./stageGeneration.ts');

    assert.equal(storyboardBatchInstruction(undefined), '');
    assert.equal(storyboardBatchInstruction({ sceneIds: [], index: 1, total: 1 }), '');

    const instruction = stageGenerationInstruction('storyboard', '', undefined, {
      sceneIds: ['scene_04', 'scene_05'],
      index: 2,
      total: 4
    });
    assert.match(instruction, /第 2\/4 批/);
    assert.match(instruction, /scene_04、scene_05/);
    assert.match(instruction, /一个别的场景都不要带上/);
    assert.match(instruction, /全片时间轴由系统在合并时统一重排/);
    // 实测两次都挂在 timeline.json 的深层嵌套 JSON 收尾处，所以分批时干脆不向模型要它。
    assert.match(instruction, /本轮不要产出 timeline\.json/);

    // 不分批时指令里不该出现批次话术。
    assert.doesNotMatch(stageGenerationInstruction('storyboard', ''), /批/);
  } finally {
    restore();
  }
});

test('兜底模板在分批时只补本批场景，不会每批都补齐全片', () => {
  const restore = installTypeScriptLoader();
  try {
    const { runVideoAgent } = require('./agentProvider.ts');
    const source = fs.readFileSync(path.join(__dirname, 'agentProvider.ts'), 'utf8');

    assert.ok(typeof runVideoAgent === 'function');
    assert.match(source, /const batchSceneIds = req\.stageBatch\?\.sceneIds/);
    assert.match(source, /batchSceneIds\.includes\(String\(scene\.id\)\)/);
  } finally {
    restore();
  }
});

test('剪辑说明在模型没给时用分镜自己的运镜和情绪节拍派生', () => {
  const restore = installTypeScriptLoader();
  try {
    const { mergeStoryboardBatches, mergeTimelineBatches } = require('./storyboardBatch.ts');

    const merged = mergeStoryboardBatches(
      [{
        sceneIds: ['scene_01'],
        shots: [{
          id: 's1', sourceSceneId: 'scene_01', title: '轻声开口',
          durationSeconds: 3, cameraMove: '推进', emotionBeat: '鼓起勇气，紧张又期待'
        }]
      }],
      ['scene_01']
    );
    // 一批 timeline 都没有——这正是分批之后的常态。
    const timeline = mergeTimelineBatches([], merged);

    assert.equal(timeline.beats.length, 1);
    assert.match(String(timeline.beats[0].editNote), /轻声开口/);
    assert.match(String(timeline.beats[0].editNote), /推进/);
    assert.match(String(timeline.beats[0].editNote), /鼓起勇气/);
    assert.ok(timeline.principle);
  } finally {
    restore();
  }
});

test('前端按批循环并把合并结果作为唯一 patch 提交', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'app', 'page.tsx'), 'utf8');

  assert.match(source, /function runStoryboardInBatches/);
  // 不能按批收窄 requestedOutputFiles：服务端 requestedStageOutputFiles 会抛 output scope mismatch。
  assert.doesNotMatch(source, /requestedOutputFiles: stageBatch \?/);
  // 挂死的一批必须超时抛出，否则串行链会无限等（实测中转站挂过一批 25 分钟无响应）。
  assert.match(source, /STORYBOARD_BATCH_TIMEOUT_MS/);
  assert.match(source, /await withBatchTimeout\(\s*runOnce\(/);
  // 上一批的收尾状态要跟着请求下发，否则每一批都在真空里重新设定人物造型和走位。
  assert.match(source, /runOnce\(\{ \.\.\.batch, continuityTail \}\)/);
  assert.match(source, /continuityTail = storyboardContinuityTail\(/);
  assert.match(source, /planStoryboardBatches\(sceneIds, episodePlan\(spec\.episodeSeconds\)\.segmentSeconds\)/);
  // 批次多于一批才走循环，短片仍然是单次请求。
  assert.match(source, /batches\.length > 1/);
  // 某一批没产出就当场停，不能拼出一份少了几场戏的分镜。
  assert.match(source, /批没有产出镜头/);
  // 合并 patch 是新造的对象，来源戳必须手动补回来：漏掉它不会报错，
  // 只会让审查页把这份真实产出当成来源不明的历史草稿隔离掉（单批那条路径不受影响）。
  assert.equal(
    (source.match(/origin: \{ kind: 'agent_stage', productionStage: stage, generationJobId \}/g) || []).length,
    2
  );
  // 进度要显示出来，也要在 finally 里清掉。
  assert.match(source, /setStageBatchProgress\(`分镜第 \$\{batch\.index\}\/\$\{batch\.total\} 批/);
  assert.match(source, /finally \{\n\s*\/\/[^\n]*\n\s*\/\/[^\n]*\n\s*setStageBatchProgress\(''\)/);
});
