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
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    }).outputText;
    module._compile(output, filePath);
  };
  return () => {
    if (previous) require.extensions['.ts'] = previous;
    else delete require.extensions['.ts'];
  };
}

function loadTypeScriptModule(fileName) {
  const restore = installTypeScriptLoader();
  try {
    const filePath = path.join(__dirname, fileName);
    assert.equal(fs.existsSync(filePath), true, `${fileName} should exist`);
    const source = fs.readFileSync(filePath, 'utf8');
    const output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    }).outputText;
    const module = { exports: {} };
    // 留在当前 realm：跨 realm 的对象会让 deepStrictEqual 判不等。
    new Function('exports', 'module', 'require', output)(module.exports, module, require);
    return module.exports;
  } finally {
    restore();
  }
}

const loadVideoQa = () => loadTypeScriptModule('videoQa.ts');
const loadVideoRenderBatch = () => loadTypeScriptModule('videoRenderBatch.ts');

function issue(check, severity, detail = '第 2 帧') {
  return { check, severity, detail };
}

test('一帧都没抽到时判 skipped，既不放行也不误杀', () => {
  const { evaluateVideoQa } = loadVideoQa();
  const verdict = evaluateVideoQa([], 'realistic', 0);

  // 判 passed 等于悄悄关掉质检，判 failed 会把正常片段全打回重渲，两个都不行。
  assert.equal(verdict.status, 'skipped');
  assert.equal(verdict.checkedFrames, 0);
  assert.match(verdict.note, /未经画面检查/);
});

test('写实镜头的重力问题判不合格，同样的问题在夸张镜头上放行', () => {
  const { evaluateVideoQa, normalizeVideoQaIssues } = loadVideoQa();

  const raw = [{ check: 'gravity', severity: 'critical', detail: '人物悬空没有支撑' }];

  const realistic = evaluateVideoQa(normalizeVideoQaIssues(raw, 'realistic'), 'realistic', 3);
  assert.equal(realistic.status, 'failed');

  // 霸总一掌把人推飞五米就是这个信号。它是爽点，不是缺陷。
  const stylized = evaluateVideoQa(normalizeVideoQaIssues(raw, 'stylized'), 'stylized', 3);
  assert.equal(stylized.status, 'passed');
  assert.equal(stylized.issues.length, 0, '不在检查范围内的问题应当在归一化阶段就被丢掉');
});

test('六根手指在任何模式下都判不合格', () => {
  const { evaluateVideoQa, normalizeVideoQaIssues } = loadVideoQa();
  const raw = [{ check: 'anatomy', severity: 'critical', detail: '右手有六根手指' }];

  ['realistic', 'stylized', 'surreal'].forEach((mode) => {
    const verdict = evaluateVideoQa(normalizeVideoQaIssues(raw, mode), mode, 3);
    assert.equal(verdict.status, 'failed', `${mode} 模式下的解剖学硬伤必须判不合格`);
  });
});

test('严重度门槛按模式变化：超现实只卡 critical', () => {
  const { evaluateVideoQa } = loadVideoQa();
  const major = [issue('anatomy', 'major', '手腕角度不自然')];

  assert.equal(evaluateVideoQa(major, 'realistic', 3).status, 'failed');
  assert.equal(evaluateVideoQa(major, 'surreal', 3).status, 'passed');
  // minor 一般不构成打回理由，否则每个镜头都会无限重渲。
  assert.equal(evaluateVideoQa([issue('anatomy', 'minor')], 'realistic', 3).status, 'passed');
});

test('身份不分轻重：报了就是不合格，任何模式都一样', () => {
  const { evaluateVideoQa, videoQaIssueSummary } = loadVideoQa();
  // 「脸稍微有点不像」和「换了一张脸」对观众是同一件事。而逐帧的脸部抖动恰恰最容易
  // 被判成 minor——每一帧单看都像这个人。按严重度放行，这类片段就直接交付了。
  const minor = [issue('identity', 'minor', '第 4 帧和第 5 帧之间脸型变宽')];
  assert.equal(evaluateVideoQa(minor, 'realistic', 3).status, 'failed');
  assert.equal(evaluateVideoQa(minor, 'stylized', 3).status, 'failed');
  assert.equal(evaluateVideoQa(minor, 'surreal', 3).status, 'failed');
  // 摘要用的是同一个谓词，不能出现「判了不合格但一条问题都不列」。
  assert.match(videoQaIssueSummary(evaluateVideoQa(minor, 'surreal', 3)), /脸型变宽/);
});

test('身份漂移换的是锁脸策略，不是随机种子', () => {
  const { classifyVideoQaVerdict, evaluateVideoQa, videoQaRetryDirective } = loadVideoQa();
  // 身份漂移的成因是参考图没锁住，缩短时长治不了它——第一次重试就该去重新锁脸。
  const identity = evaluateVideoQa([issue('identity', 'major', '第 3 帧换了一张脸')], 'realistic', 3);
  assert.equal(classifyVideoQaVerdict(identity, 0).strategy, 'reanchor');
  assert.match(classifyVideoQaVerdict(identity, 0).reason, /重新锁脸/);
  assert.equal(classifyVideoQaVerdict(identity, 1).strategy, 'simplify');

  // 不涉及身份的问题仍然先缩时长——那一类确实是随时间累积出来的。
  const clipping = evaluateVideoQa([issue('clipping', 'critical', '手穿过桌面')], 'realistic', 3);
  assert.equal(classifyVideoQaVerdict(clipping, 0).strategy, 'shorten');

  const directive = videoQaRetryDirective('reanchor', identity.issues);
  assert.match(directive, /严格按参考图的五官、脸型、肤色和人种呈现/);
  assert.match(directive, /第 3 帧换了一张脸/);
});

test('重渲预算是每镜头两次，用完退回分镜而不是继续烧 GPU', () => {
  const { classifyVideoQaVerdict, evaluateVideoQa, VIDEO_QA_MAX_ATTEMPTS } = loadVideoQa();
  const verdict = evaluateVideoQa([issue('clipping', 'critical', '手穿过桌面')], 'realistic', 3);

  assert.equal(VIDEO_QA_MAX_ATTEMPTS, 2);

  const first = classifyVideoQaVerdict(verdict, 0);
  assert.equal(first.retry, true);
  assert.equal(first.strategy, 'shorten');

  // 第二次必须换策略，不能重复同一条 prompt——那是在赌随机种子。
  const second = classifyVideoQaVerdict(verdict, 1);
  assert.equal(second.retry, true);
  assert.equal(second.strategy, 'simplify');
  assert.notEqual(second.strategy, first.strategy);

  const exhausted = classifyVideoQaVerdict(verdict, 2);
  assert.equal(exhausted.retry, false);
  assert.equal(exhausted.strategy, null);
  assert.match(exhausted.reason, /回到分镜阶段改写/);

  // 通过和跳过都不该触发任何重渲。
  assert.equal(classifyVideoQaVerdict(evaluateVideoQa([], 'realistic', 3), 0).retry, false);
  assert.equal(classifyVideoQaVerdict(evaluateVideoQa([], 'realistic', 0), 0).retry, false);
});

test('重渲策略换提示词并砍时长，且把上一轮的问题写进去', () => {
  const { applyQaRetryStrategy, videoQaRetryDirective, videoQaRetryDuration } = loadVideoQa();
  const issues = [issue('anatomy', 'critical', '第 2 帧右手多了一根手指')];

  const shortened = applyQaRetryStrategy('原始提示词', 5, 'shorten', 'realistic', issues);
  assert.notEqual(shortened.prompt, '原始提示词');
  assert.match(shortened.prompt, /只保留一个最关键的动作/);
  assert.match(shortened.prompt, /第 2 帧右手多了一根手指/);
  assert.equal(shortened.durationSeconds, 3);

  const simplified = applyQaRetryStrategy('原始提示词', 5, 'simplify', 'realistic', issues);
  assert.match(simplified.prompt, /特写/);

  // 砍到六成但不低于 2 秒，且仍然受模式上限约束。
  assert.equal(videoQaRetryDuration(3, 'realistic'), 2);
  assert.equal(videoQaRetryDuration(20, 'realistic'), 5);
  assert.equal(videoQaRetryDirective('shorten', []).length > 0, true);
});

test('模型把 JSON 包在代码块或客套话里也能解析出来', () => {
  const { parseVideoQaResponse } = loadVideoQa();

  const fenced = '好的，我检查了：\n```json\n{"issues":[{"check":"anatomy","severity":"critical","detail":"六根手指"}]}\n```';
  assert.deepEqual(parseVideoQaResponse(fenced, 'realistic'), [
    { check: 'anatomy', severity: 'critical', detail: '六根手指' }
  ]);

  assert.deepEqual(parseVideoQaResponse('{"issues":[]}', 'realistic'), []);
  // 解析不出来时返回空数组：宁可放行也不能拿一个瞎猜的结论去打回用户的片子。
  assert.deepEqual(parseVideoQaResponse('模型今天不想输出 JSON', 'realistic'), []);
  assert.deepEqual(parseVideoQaResponse(undefined, 'realistic'), []);
  // 严重度写错一律降级成 minor，不会凭空制造一个打回理由。
  assert.deepEqual(parseVideoQaResponse('{"issues":[{"check":"anatomy","severity":"blocker"}]}', 'realistic'), [
    { check: 'anatomy', severity: 'minor', detail: '肢体与解剖（手指数量、反关节、多余肢体，以及脚部：脚趾数量、赤脚、脚趾从鞋子里露出、鞋子与脚穿模）' }
  ]);
});

test('质检提问逐项列出检查点，并明确告诉模型哪些夸张不要报', () => {
  const { videoQaInstruction } = loadVideoQa();

  const realistic = videoQaInstruction('realistic', { shotTitle: '开场镜头' });
  assert.match(realistic, /开场镜头/);
  assert.match(realistic, /anatomy/);
  assert.match(realistic, /critical/);
  assert.match(realistic, /只输出一个 JSON 对象/);

  const stylized = videoQaInstruction('stylized');
  // 不告诉模型「这是有意为之」，它一定会把爽点报成缺陷。
  assert.match(stylized, /有意为之的艺术处理/);
  assert.match(stylized, /戏剧夸张/);
});

test('质检重渲计数和 provider 重试计数互不消耗', () => {
  const { requeueVideoJobForQaRetry, videoRecoveryBatchKey } = loadVideoRenderBatch();
  const job = {
    id: 'video-shot-1',
    promptId: 'shot-1',
    prompt: '镜头一',
    status: 'qa_pending',
    attempt: 3,
    qaAttempt: 0,
    videoUrl: 'https://cdn/clip.mp4',
    providerTaskId: 'task-1',
    durationSeconds: 5
  };

  const patch = requeueVideoJobForQaRetry(job, '改成特写', 3, '质检未通过');

  assert.equal(patch.status, 'ready');
  assert.equal(patch.qaAttempt, 1);
  assert.equal(patch.qaDirective, '改成特写');
  assert.equal(patch.durationSeconds, 3);
  // provider 侧的 attempt 不能被质检消耗：一次 429 不该吃掉画面重渲的预算，反之亦然。
  assert.equal(patch.attempt, undefined);
  // 上一轮的产物必须清干净，否则会把旧片段当成本轮结果送检。
  assert.equal(patch.videoUrl, '');
  assert.equal(patch.providerTaskId, '');
  assert.equal(patch.qa, undefined);

  const before = videoRecoveryBatchKey('p1', [job]);
  const after = videoRecoveryBatchKey('p1', [{ ...job, ...patch }]);
  assert.notEqual(before, after, '质检重渲是新一批提交，恢复标识必须随之变化');
});

test('渲染成功先落到待质检，质检不可用时才直接完成', () => {
  const { videoJobStatusFromProvider, submittableVideoJobs, qaPendingVideoJobs, videoBatchStatus, retryableVideoJobs } =
    loadVideoRenderBatch();

  assert.equal(videoJobStatusFromProvider('completed', true), 'qa_pending');
  assert.equal(videoJobStatusFromProvider('completed', false), 'completed');
  assert.equal(videoJobStatusFromProvider('failed', true), 'failed');
  assert.equal(videoJobStatusFromProvider('submitted', true), 'submitted');

  const jobs = [
    { id: 'a', promptId: 'a', prompt: 'a', status: 'qa_pending', attempt: 1, videoUrl: 'https://cdn/a.mp4' },
    { id: 'b', promptId: 'b', prompt: 'b', status: 'completed', attempt: 1, videoUrl: 'https://cdn/b.mp4' },
    { id: 'c', promptId: 'c', prompt: 'c', status: 'qa_failed', attempt: 1, videoUrl: '' }
  ];

  // 待质检的片段已经渲染出来了，再次提交等于重复计费。
  assert.deepEqual(submittableVideoJobs(jobs).map((job) => job.id), ['c']);
  assert.deepEqual(qaPendingVideoJobs(jobs).map((job) => job.id), ['a']);
  // 质检未过和渲染失败一样，都要能被「重试失败镜头」捡起来。
  assert.deepEqual(retryableVideoJobs(jobs).map((job) => job.id), ['c']);

  assert.equal(videoBatchStatus(jobs), 'failed');
  assert.equal(videoBatchStatus([jobs[0], jobs[1]]), 'rendering', '还有片段没过质检就不算成片就绪');
  assert.equal(videoBatchStatus([jobs[1]]), 'clips_ready');
});

test('阶段状态把「质检中」和「渲染中」分开，硬失败优先级最高', () => {
  const { videoStageStatus } = loadVideoRenderBatch();
  const job = (id, status) => ({ id, promptId: id, prompt: id, status, attempt: 1 });

  assert.equal(videoStageStatus([job('a', 'polling'), job('b', 'completed')]), 'rendering');
  assert.equal(videoStageStatus([job('a', 'qa_pending'), job('b', 'completed')]), 'qa_pending');
  assert.equal(videoStageStatus([job('a', 'qa_pending'), job('b', 'qa_failed')]), 'qa_failed');
  // 上游硬失败要压过质检状态：那是需要用户先处理的问题。
  assert.equal(videoStageStatus([job('a', 'qa_failed'), job('b', 'failed')]), 'failed');
});

test('任务创建时把物理模式和受上限约束的时长带上', () => {
  const { createVideoRenderJobs } = loadVideoRenderBatch();
  const jobs = createVideoRenderJobs([
    { id: 'shot-1', type: 'video', prompt: '日常对话', durationSeconds: 12 },
    { id: 'shot-2', type: 'video', prompt: '一掌推飞', physicsMode: 'stylized', durationSeconds: 12 },
    { id: 'shot-3', type: 'video', prompt: '御剑飞行', physicsMode: 'SURREAL', durationSeconds: 4 }
  ]);

  assert.deepEqual(jobs.map((job) => job.physicsMode), ['realistic', 'stylized', 'surreal']);
  assert.deepEqual(jobs.map((job) => job.durationSeconds), [5, 6, 4]);
  assert.deepEqual(jobs.map((job) => job.qaAttempt), [0, 0, 0]);
});
