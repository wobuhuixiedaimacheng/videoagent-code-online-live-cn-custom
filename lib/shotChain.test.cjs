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

function job(id, promptId) {
  return { id, promptId };
}

/** scene_01 三镜、scene_02 两镜，promptId 到场次的映射就是链的依据。 */
const SCENE_BY_PROMPT = new Map([
  ['p1', 'scene_01'], ['p2', 'scene_01'], ['p3', 'scene_01'],
  ['p4', 'scene_02'], ['p5', 'scene_02']
]);

const JOBS = [job('v1', 'p1'), job('v2', 'p2'), job('v3', 'p3'), job('v4', 'p4'), job('v5', 'p5')];

test('同一场次的镜头串成一条链，链内保持原有顺序', () => {
  const restore = installTypeScriptLoader();
  try {
    const { planShotChains } = require('./shotChain.ts');
    const chains = planShotChains(JOBS, SCENE_BY_PROMPT);

    assert.equal(chains.length, 2);
    assert.deepEqual(Array.from(chains[0].jobIds), ['v1', 'v2', 'v3']);
    assert.deepEqual(Array.from(chains[1].jobIds), ['v4', 'v5']);
    assert.equal(chains[0].sceneId, 'scene_01');
  } finally {
    restore();
  }
});

test('没有场次归属的镜头各自成链，不会被并到一起互相等待', () => {
  const restore = installTypeScriptLoader();
  try {
    const { planShotChains } = require('./shotChain.ts');
    // 老工作区的任务包没有 sourceSceneId。把它们并成一条链会让不相干的镜头串行，
    // 而且会拿上一个镜头的尾帧去接一个完全无关的画面。
    const chains = planShotChains([job('v1', 'p1'), job('v2', 'p2')], new Map());
    assert.equal(chains.length, 2);
    assert.deepEqual(Array.from(chains.map((chain) => chain.jobIds.length)), [1, 1]);
  } finally {
    restore();
  }
});

test('每条链同一时刻只提交一个镜头，前一镜在途时后面的都要等', () => {
  const restore = installTypeScriptLoader();
  try {
    const { planShotChains, readyChainJobIds } = require('./shotChain.ts');
    const chains = planShotChains(JOBS, SCENE_BY_PROMPT);

    // 首次提交：两条链各自只出链首。这正是「并发度从任意 2 个镜头变成任意 2 条链」。
    const first = readyChainJobIds(chains, new Map([
      ['v1', 'ready'], ['v2', 'ready'], ['v3', 'ready'], ['v4', 'ready'], ['v5', 'ready']
    ]));
    assert.deepEqual(Array.from(first), ['v1', 'v4']);

    // v1 在途时 scene_01 整条链都等着；scene_02 不受影响。
    const midway = readyChainJobIds(chains, new Map([
      ['v1', 'polling'], ['v2', 'ready'], ['v3', 'ready'], ['v4', 'ready'], ['v5', 'ready']
    ]));
    assert.deepEqual(Array.from(midway), ['v4']);

    // v1 完成之后轮到 v2。
    const advanced = readyChainJobIds(chains, new Map([
      ['v1', 'completed'], ['v2', 'ready'], ['v3', 'ready'], ['v4', 'submitted'], ['v5', 'ready']
    ]));
    assert.deepEqual(Array.from(advanced), ['v2']);
  } finally {
    restore();
  }
});

test('一个镜头挂掉不会让整场戏剩下的镜头永远不提交', () => {
  const restore = installTypeScriptLoader();
  try {
    const { planShotChains, readyChainJobIds } = require('./shotChain.ts');
    const chains = planShotChains(JOBS, SCENE_BY_PROMPT);

    // failed 和 qa_failed 都是终态：链要继续往下走，只是接不到尾帧。
    // 卡住不动比接不上尾帧严重得多，而且在界面上完全看不出发生了什么。
    for (const terminal of ['failed', 'qa_failed']) {
      const ready = readyChainJobIds(chains, new Map([
        ['v1', terminal], ['v2', 'ready'], ['v3', 'ready'], ['v4', 'completed'], ['v5', 'ready']
      ]));
      assert.deepEqual(Array.from(ready), ['v2', 'v5'], `${terminal} 之后链必须继续`);
    }
  } finally {
    restore();
  }
});

test('全部完成时没有可提交的镜头，不会重复计费', () => {
  const restore = installTypeScriptLoader();
  try {
    const { planShotChains, readyChainJobIds } = require('./shotChain.ts');
    const chains = planShotChains(JOBS, SCENE_BY_PROMPT);
    const done = new Map(JOBS.map((item) => [item.id, 'completed']));
    assert.deepEqual(Array.from(readyChainJobIds(chains, done)), []);

    // 续跑场景：只有 status === 'ready' 的镜头会被提交，
    // 和 resubmittableRestoredVideoJobs 是同一个判据——它们一次都没发出去过。
    const resumed = new Map([
      ['v1', 'completed'], ['v2', 'ready'], ['v3', 'ready'],
      ['v4', 'completed'], ['v5', 'completed']
    ]);
    assert.deepEqual(Array.from(readyChainJobIds(chains, resumed)), ['v2']);
  } finally {
    restore();
  }
});

test('链的前后关系可以正查反查', () => {
  const restore = installTypeScriptLoader();
  try {
    const { planShotChains, nextInChain, previousInChain, chainPosition } = require('./shotChain.ts');
    const chains = planShotChains(JOBS, SCENE_BY_PROMPT);

    assert.equal(nextInChain(chains, 'v1'), 'v2');
    assert.equal(nextInChain(chains, 'v3'), '', '链尾没有下一镜');
    assert.equal(nextInChain(chains, '不存在'), '');
    assert.equal(previousInChain(chains, 'v2'), 'v1');
    assert.equal(previousInChain(chains, 'v1'), '', '链首没有上一镜，只能用场景主图');
    assert.equal(chainPosition(chains, 'v3'), 3);
    assert.equal(chainPosition(chains, '不存在'), 0);
  } finally {
    restore();
  }
});

test('只有正常完成的上一镜才能拿尾帧接下去', () => {
  const restore = installTypeScriptLoader();
  try {
    const { canChainFromTail } = require('./shotChain.ts');

    assert.equal(canChainFromTail({ previousStatus: 'completed', previousVideoUrl: 'https://v/1.mp4' }), true);
    // 质检没过的那一段尾帧本身就是坏画面：拿一张六根手指的尾帧去接，
    // 等于把缺陷复制到整条链剩下的每个镜头。
    assert.equal(canChainFromTail({ previousStatus: 'qa_failed', previousVideoUrl: 'https://v/1.mp4' }), false);
    assert.equal(canChainFromTail({ previousStatus: 'failed', previousVideoUrl: '' }), false);
    assert.equal(canChainFromTail({ previousStatus: 'completed', previousVideoUrl: '' }), false);
    // 锁脸重渲要把身份锚点图提到首帧，尾帧上那张脸恰恰已经是错的。
    assert.equal(
      canChainFromTail({ previousStatus: 'completed', previousVideoUrl: 'https://v/1.mp4', qaStrategy: 'reanchor' }),
      false
    );
  } finally {
    restore();
  }
});

test('上游拒绝内联尾帧时只降级这一层，不把整批判失败', () => {
  const restore = installTypeScriptLoader();
  try {
    const { rejectsInlineFrame, inlineFrameDegradedNote } = require('./shotChain.ts');

    assert.equal(rejectsInlineFrame(400, 'data:image is not supported'), true);
    assert.equal(rejectsInlineFrame(413, 'payload too large'), true);
    assert.equal(rejectsInlineFrame(422, 'unsupported image format'), true);
    // 其它 400 去掉尾帧重发同样会失败，重发一次纯属浪费一次调用和一次等待。
    assert.equal(rejectsInlineFrame(400, 'prompt violates content policy'), false);
    assert.equal(rejectsInlineFrame(500, 'data:image'), false);
    assert.equal(rejectsInlineFrame(429, 'rate limit'), false);

    // 降级必须说清楚丢的是哪一层，以及成片上会看到什么。
    assert.match(inlineFrameDegradedNote(), /尾帧/);
    assert.match(inlineFrameDegradedNote(), /场景主图/);
  } finally {
    restore();
  }
});

test('前端按场次链提交，并在镜头到终态时推进链', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'app', 'page.tsx'), 'utf8');

  assert.match(source, /async function submitChainedVideoJobs/);
  assert.match(source, /async function advanceShotChain/);
  assert.match(source, /async function extractVideoTailFrame/);
  // 链的推进挂在 updateVideoJobsForBatch 这一个收口点上：分散到质检、轮询、
  // 提交失败三处的话，总有一条路会忘记推进，那一场戏剩下的镜头就永远停在 ready。
  assert.match(source, /if \(patch\.status && CHAIN_TERMINAL_STATUSES\.has\(patch\.status\)\)/);
  // workspaceRef 是在 useEffect 里同步的，同步读会读到这次 patch 之前的旧值，
  // 于是 canChainFromTail 永远返回 false，续接静默失效。
  assert.match(source, /const previousStatus = finishedPatch\.status \|\| finished\?\.status/);
  // 尾帧要比质检抽帧清晰：512 宽喂回去会让下一镜整体变糊。
  assert.match(source, /1024 \/ \(video\.videoWidth \|\| 1024\)/);
  // 最后一帧经常是编码器补的黑场，直接 seek 到 duration 有相当概率抽到黑图。
  assert.match(source, /duration - 0\.08/);
});
