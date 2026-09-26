const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

function loadVideoRenderBatch() {
  // videoRenderBatch 现在会 import shotPhysics（物理模式的时长上限和归一化），
  // 所以不能再用裸的 new Function：那里面没有 require，相对 import 会直接炸。
  const restore = installTypeScriptLoader();
  try {
    const filePath = path.join(__dirname, 'videoRenderBatch.ts');
    assert.equal(fs.existsSync(filePath), true, 'videoRenderBatch.ts should define batch render state helpers');
    const source = fs.readFileSync(filePath, 'utf8');
    const output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    }).outputText;
    const module = { exports: {} };
    // 留在当前 realm 里执行：vm.runInNewContext 会让模块产出的对象带上另一个 realm 的原型，
    // deepStrictEqual 会因此判不等（"same structure but not reference-equal"）。
    new Function('exports', 'module', 'require', output)(module.exports, module, require);
    return module.exports;
  } finally {
    restore();
  }
}

function installTypeScriptLoader() {
  const previous = require.extensions['.ts'];
  require.extensions['.ts'] = (module, filePath) => {
    const source = fs.readFileSync(filePath, 'utf8');
    const output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    }).outputText;
    module._compile(output, filePath);
  };
  return () => {
    if (previous) require.extensions['.ts'] = previous;
    else delete require.extensions['.ts'];
  };
}

function videoJob(status, promptId, videoUrl = '') {
  return { id: `video-${promptId}`, promptId, status, attempt: 1, progress: status === 'completed' ? 100 : 0, videoUrl };
}

test('a confirmed task package creates one render job per non-empty video prompt with stable ids', () => {
  const { createVideoRenderJobs } = loadVideoRenderBatch();
  const prompts = [
    { id: 'shot-1', type: 'video', prompt: '镜头一' },
    { id: 'still-1', type: 'image', prompt: '首帧' },
    { id: 'shot-2', type: 'video', prompt: ' 镜头二 ' },
    { id: 'blank', type: 'video', prompt: '  ' },
    { id: 'shot-1', type: 'video', prompt: '重复镜头' }
  ];
  const jobs = createVideoRenderJobs(prompts);

  assert.deepEqual(jobs.map((job) => job.promptId), ['shot-1', 'shot-2']);
  assert.deepEqual(jobs.map((job) => job.id), ['video-shot-1', 'video-shot-2']);
  assert.equal(jobs[1].prompt, '镜头二');
  assert.equal(jobs[0].status, 'ready');
  assert.notStrictEqual(jobs, prompts);
});

test('job updates are immutable and preserve identity fields', () => {
  const { updateVideoRenderJob } = loadVideoRenderBatch();
  const jobs = [videoJob('submitted', 'shot-1'), videoJob('completed', 'shot-2', 'https://video/2.mp4')];
  const updated = updateVideoRenderJob(jobs, 'video-shot-1', { progress: 42, status: 'polling', id: 'wrong-id', promptId: 'wrong-prompt' });

  assert.notStrictEqual(updated, jobs);
  assert.notStrictEqual(updated[0], jobs[0]);
  assert.strictEqual(updated[1], jobs[1]);
  assert.equal(updated[0].id, 'video-shot-1');
  assert.equal(updated[0].promptId, 'shot-1');
  assert.equal(updated[0].progress, 42);
  assert.equal(jobs[0].progress, 0);
});

test('retry selection contains failed jobs only and keeps completed urls', () => {
  const { retryableVideoJobs } = loadVideoRenderBatch();
  const jobs = [videoJob('completed', 'shot-1', 'https://video/1.mp4'), videoJob('failed', 'shot-2'), videoJob('submitted', 'shot-3')];

  assert.deepEqual(retryableVideoJobs(jobs).map((job) => job.promptId), ['shot-2']);
  assert.equal(jobs[0].videoUrl, 'https://video/1.mp4');
});

test('pending jobs include ready work only and empty batches remain rendering', () => {
  const { pendingVideoJobs, videoBatchStatus } = loadVideoRenderBatch();
  const jobs = [videoJob('ready', 'a'), videoJob('submitting', 'b'), videoJob('submitted', 'c'), videoJob('polling', 'd'), videoJob('failed', 'e')];

  assert.deepEqual(pendingVideoJobs(jobs).map((job) => job.promptId), ['a']);
  assert.equal(videoBatchStatus([]), 'rendering');
});

test('only submitted or polling jobs with provider task ids are resumable after restoration', () => {
  const { resumableVideoJobs } = loadVideoRenderBatch();
  const jobs = [
    { ...videoJob('submitted', 'a'), providerTaskId: 'provider-a' },
    { ...videoJob('polling', 'b'), providerTaskId: 'provider-b' },
    videoJob('submitted', 'missing-id'),
    { ...videoJob('completed', 'done'), providerTaskId: 'provider-done' },
    { ...videoJob('failed', 'failed'), providerTaskId: 'provider-failed' }
  ];

  assert.deepEqual(resumableVideoJobs(jobs).map((job) => job.promptId), ['a', 'b']);
});

test('只有「发出去却没拿到任务 ID」才算不可恢复，ready 交给续跑', () => {
  // ready = 一次网络请求都没发过。提交 12 个镜头时并发只有 2，任何时刻都有约 10 个躺在
  // ready，页面一刷新就全被判成「中断」——这正是「视频生成一直中断」的来源。
  const { unrecoverableRestoredVideoJobIds, resubmittableRestoredVideoJobs } = loadVideoRenderBatch();
  const jobs = [
    videoJob('ready', 'ready-no-id'),
    videoJob('submitting', 'submitting-no-id'),
    videoJob('submitted', 'submitted-no-id'),
    videoJob('polling', 'polling-no-id'),
    { ...videoJob('submitted', 'submitted-with-id'), providerTaskId: 'provider-submitted' },
    { ...videoJob('completed', 'completed'), providerTaskId: 'provider-completed', videoUrl: 'https://video/completed.mp4' }
  ];

  assert.deepEqual(Array.from(unrecoverableRestoredVideoJobIds(jobs)), [
    'video-submitting-no-id',
    'video-submitted-no-id',
    'video-polling-no-id'
  ]);
  // ready 不进「不可恢复」，而是进续跑队列：重发既不重复生成也不重复计费。
  assert.deepEqual(Array.from(resubmittableRestoredVideoJobs(jobs).map((job) => job.id)), ['video-ready-no-id']);
  assert.deepEqual(Array.from(resubmittableRestoredVideoJobs(jobs.filter((job) => job.status !== 'ready'))), []);
});

test('a final poll attempt times out only outcomes still pending', () => {
  const { timeoutPendingVideoJobIds } = loadVideoRenderBatch();
  assert.deepEqual(timeoutPendingVideoJobIds([{ id: 'video-a', pending: false }]), []);
  assert.deepEqual(timeoutPendingVideoJobIds([
    { id: 'video-a', pending: false },
    { id: 'video-b', pending: true }
  ]), ['video-b']);
});

test('recovery identity remains stable through terminal updates and changes for a retry attempt', () => {
  const { videoRecoveryBatchKey } = loadVideoRenderBatch();
  const initial = [
    { ...videoJob('polling', 'a'), attempt: 1, providerTaskId: 'provider-a' },
    { ...videoJob('polling', 'b'), attempt: 1, providerTaskId: 'provider-b' }
  ];
  const afterACompletes = [{ ...initial[0], status: 'completed', videoUrl: 'https://video/a.mp4' }, initial[1]];
  const afterRetry = [afterACompletes[0], { ...initial[1], status: 'submitted', attempt: 2, providerTaskId: 'provider-b-2' }];

  assert.equal(videoRecoveryBatchKey('project-1', initial), videoRecoveryBatchKey('project-1', afterACompletes));
  assert.notEqual(videoRecoveryBatchKey('project-1', initial), videoRecoveryBatchKey('project-1', afterRetry));
});

test('submission state requires a provider task id only while it remains submitted', () => {
  const { finalizeVideoSubmission } = loadVideoRenderBatch();
  assert.deepEqual(finalizeVideoSubmission('completed', ''), { status: 'completed', missingProviderTaskId: false });
  assert.deepEqual(finalizeVideoSubmission('submitted', ''), { status: 'failed', missingProviderTaskId: true });
  assert.deepEqual(finalizeVideoSubmission('failed', ''), { status: 'failed', missingProviderTaskId: false });
});

test('the batch completes only when every render job completes', () => {
  const { videoBatchStatus } = loadVideoRenderBatch();
  assert.equal(videoBatchStatus([videoJob('completed', 'a'), videoJob('submitted', 'b')]), 'rendering');
  assert.equal(videoBatchStatus([videoJob('completed', 'a'), videoJob('failed', 'b')]), 'failed');
  assert.equal(videoBatchStatus([videoJob('completed', 'a'), videoJob('completed', 'b')]), 'clips_ready');
});

test('editing one shot drops only that shot job and keeps every other completed clip', () => {
  const { dropVideoJobsForPrompt } = loadVideoRenderBatch();
  const jobs = [
    videoJob('completed', 'shot-1', 'https://video/1.mp4'),
    videoJob('completed', 'shot-2', 'https://video/2.mp4'),
    videoJob('completed', 'shot-3', 'https://video/3.mp4')
  ];
  const next = dropVideoJobsForPrompt(jobs, 'shot-2');

  assert.deepEqual(next.map((job) => job.promptId), ['shot-1', 'shot-3']);
  assert.deepEqual(next.map((job) => job.videoUrl), ['https://video/1.mp4', 'https://video/3.mp4']);
  assert.equal(jobs.length, 3, 'the original job list stays untouched');
});

test('dropping an unknown prompt returns the same job list identity', () => {
  const { dropVideoJobsForPrompt } = loadVideoRenderBatch();
  const jobs = [videoJob('completed', 'shot-1', 'https://video/1.mp4')];
  assert.strictEqual(dropVideoJobsForPrompt(jobs, 'shot-9'), jobs);
});

test('a batch missing an edited shot is not reported as clips_ready', () => {
  const { videoBatchStatus } = loadVideoRenderBatch();
  const remaining = [videoJob('completed', 'shot-1', 'https://video/1.mp4'), videoJob('completed', 'shot-3', 'https://video/3.mp4')];

  assert.equal(videoBatchStatus(remaining, 3), 'rendering', 'two of three shots must not claim the film is done');
  assert.equal(videoBatchStatus(remaining, 2), 'clips_ready');
  assert.equal(videoBatchStatus([], 3), 'rendering');
});

test('reconfirming a task package carries completed clips over instead of re-rendering them', () => {
  const { createVideoRenderJobs, preserveCompletedVideoJobs, submittableVideoJobs } = loadVideoRenderBatch();
  const previous = [
    { ...videoJob('completed', 'shot-1', 'https://video/1.mp4'), providerTaskId: 'provider-1', attempt: 1 },
    { ...videoJob('completed', 'shot-3', 'https://video/3.mp4'), providerTaskId: 'provider-3', attempt: 1 }
  ];
  const fresh = createVideoRenderJobs([
    { id: 'shot-1', type: 'video', prompt: '镜头一' },
    { id: 'shot-2', type: 'video', prompt: '改过的镜头二' },
    { id: 'shot-3', type: 'video', prompt: '镜头三' }
  ]);
  const merged = preserveCompletedVideoJobs(fresh, previous);

  assert.deepEqual(merged.map((job) => job.status), ['completed', 'ready', 'completed']);
  assert.deepEqual(merged.map((job) => job.videoUrl), ['https://video/1.mp4', undefined, 'https://video/3.mp4']);
  assert.deepEqual(merged.map((job) => job.id), ['video-shot-1', 'video-shot-2', 'video-shot-3']);
  assert.equal(merged[0].prompt, '镜头一', 'the carried-over job picks up the freshly confirmed prompt text');
  assert.deepEqual(submittableVideoJobs(merged).map((job) => job.promptId), ['shot-2']);
});

test('rate limits and network blips are retryable, real rejections are not', () => {
  const { isRetryableVideoError, isRateLimitedVideoError } = loadVideoRenderBatch();

  assert.equal(isRateLimitedVideoError('Rate limit exceeded'), true);
  assert.equal(isRateLimitedVideoError('anything', 429), true);
  assert.equal(isRetryableVideoError('request timeout after 60s'), true);
  assert.equal(isRetryableVideoError('fetch failed'), true);
  assert.equal(isRetryableVideoError('upstream said no', 503), true);
  assert.equal(isRetryableVideoError('upstream said no', 502), true);

  // 真实事故：12 个镜头里 1 个撞上上游队列满，被判永久失败，另外 11 个正常渲染完。
  assert.equal(isRateLimitedVideoError('{"code":"video_queue_full","message":"video queue is full, please retry"}'), true);
  assert.equal(isRetryableVideoError('{"code":"video_queue_full","message":"video queue is full, please retry"}'), true);
  assert.equal(isRateLimitedVideoError('video queue is full, please retry later'), true);

  assert.equal(isRetryableVideoError('content_policy_violation'), false);
  assert.equal(isRetryableVideoError('invalid prompt', 400), false);
  assert.equal(isRetryableVideoError('unauthorized', 401), false);
  assert.equal(isRateLimitedVideoError('invalid prompt', 400), false);
});

test('submit retries back off and give rate limits a full window before the last attempt', () => {
  const { classifyVideoSubmitError, VIDEO_RATE_LIMIT_WAIT_MS, VIDEO_SUBMIT_MAX_ATTEMPTS } = loadVideoRenderBatch();

  assert.deepEqual(classifyVideoSubmitError('rate limit', undefined, 1), {
    retry: true, delayMs: VIDEO_RATE_LIMIT_WAIT_MS, rateLimited: true
  });
  assert.deepEqual(classifyVideoSubmitError('timeout', undefined, 1), { retry: true, delayMs: 4000, rateLimited: false });
  assert.deepEqual(classifyVideoSubmitError('timeout', undefined, 2), { retry: true, delayMs: 8000, rateLimited: false });
  assert.deepEqual(classifyVideoSubmitError('timeout', undefined, 3), { retry: true, delayMs: 16000, rateLimited: false });

  assert.equal(classifyVideoSubmitError('timeout', undefined, VIDEO_SUBMIT_MAX_ATTEMPTS).retry, false,
    'the attempt budget is bounded');
  assert.equal(classifyVideoSubmitError('content_policy_violation', 400, 1).retry, false,
    'a real rejection fails immediately instead of burning the retry budget');
});

test('a completed job with no video url is re-rendered rather than carried over', () => {
  const { createVideoRenderJobs, preserveCompletedVideoJobs } = loadVideoRenderBatch();
  const previous = [videoJob('completed', 'shot-1', '')];
  const fresh = createVideoRenderJobs([{ id: 'shot-1', type: 'video', prompt: '镜头一' }]);

  assert.equal(preserveCompletedVideoJobs(fresh, previous)[0].status, 'ready');
});
