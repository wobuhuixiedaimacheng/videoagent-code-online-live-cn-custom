const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

function loadVideoStitch() {
  const filePath = path.join(__dirname, 'videoStitch.ts');
  assert.equal(fs.existsSync(filePath), true, 'videoStitch.ts should define final-cut helpers');
  const source = fs.readFileSync(filePath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const module = { exports: {} };
  new Function('exports', 'module', 'require', output)(module.exports, module, require);
  return module.exports;
}

const stitch = loadVideoStitch();

function clip(shotNumber, overrides = {}) {
  return {
    promptId: `video-prompt-${shotNumber}`,
    shotNumber,
    url: `https://cdn.example.com/clip-${shotNumber}.mp4`,
    durationSeconds: 15,
    ...overrides
  };
}

test('缺镜头时挡住合成，而不是产出少一段的成片', () => {
  const result = stitch.validateStitchClips([clip(1), clip(2)], 3);
  assert.equal(result.ok, false);
  assert.match(result.error, /还有 1 个镜头没有完成的片段/);
});

test('片段齐了才放行', () => {
  assert.deepEqual(stitch.validateStitchClips([clip(1), clip(2), clip(3)], 3), { ok: true, error: '' });
});

test('空片段列表直接拒绝', () => {
  assert.equal(stitch.validateStitchClips([], 0).ok, false);
});

test('无效地址会被点名，不会被静默跳过', () => {
  const result = stitch.validateStitchClips([clip(1), clip(2, { url: 'not-a-url' })], 2);
  assert.equal(result.ok, false);
  assert.match(result.error, /video-prompt-2/);
});

test('镜头序号重复时拒绝合成：顺序无法确定', () => {
  const result = stitch.validateStitchClips([clip(1), clip(1)], 2);
  assert.equal(result.ok, false);
  assert.match(result.error, /序号重复/);
});

test('乱序传入也按镜头序号排回来', () => {
  const ordered = stitch.orderedStitchClips([clip(3), clip(1), clip(2)]);
  assert.deepEqual(ordered.map((item) => item.shotNumber), [1, 2, 3]);
});

test('concat 清单转义单引号，带撇号的路径不会炸掉整批合成', () => {
  const manifest = stitch.buildConcatManifest(["/tmp/chen's cut/clip-1.mp4", '/tmp/plain/clip-2.mp4']);
  assert.equal(manifest.split('\n')[0], "file '/tmp/chen'\\''s cut/clip-1.mp4'");
  assert.equal(manifest.split('\n')[1], "file '/tmp/plain/clip-2.mp4'");
  assert.equal(manifest.endsWith('\n'), true);
});

test('copy 模式不重编码，reencode 模式带上 H.264 参数', () => {
  const copyArgs = stitch.buildStitchArgs({ manifestPath: '/tmp/list.txt', outputPath: '/tmp/out.mp4', mode: 'copy' });
  assert.equal(copyArgs.includes('-c'), true);
  assert.equal(copyArgs.includes('copy'), true);
  assert.equal(copyArgs.includes('libx264'), false);
  assert.equal(copyArgs.at(-1), '/tmp/out.mp4');

  const reencodeArgs = stitch.buildStitchArgs({
    manifestPath: '/tmp/list.txt',
    outputPath: '/tmp/out.mp4',
    mode: 'reencode',
    frameRate: 24
  });
  assert.equal(reencodeArgs.includes('libx264'), true);
  assert.equal(reencodeArgs[reencodeArgs.indexOf('-r') + 1], '24');
});

test('帧率缺失或非法时回落到 24，不会把 NaN 传给 ffmpeg', () => {
  const args = stitch.buildStitchArgs({ manifestPath: '/l', outputPath: '/o', mode: 'reencode', frameRate: 0 });
  assert.equal(args[args.indexOf('-r') + 1], '24');
});

test('两种模式都用 concat demuxer 且关掉 safe 检查', () => {
  for (const mode of ['copy', 'reencode']) {
    const args = stitch.buildStitchArgs({ manifestPath: '/tmp/list.txt', outputPath: '/tmp/out.mp4', mode });
    assert.equal(args[args.indexOf('-f') + 1], 'concat');
    assert.equal(args[args.indexOf('-safe') + 1], '0');
  }
});

test('解析 ffmpeg 进度行', () => {
  assert.equal(stitch.parseFfmpegProgressSeconds('frame= 120 fps=30 time=00:01:23.50 bitrate=N/A'), 83.5);
  assert.equal(stitch.parseFfmpegProgressSeconds('time=01:00:00'), 3600);
  assert.equal(stitch.parseFfmpegProgressSeconds('no time here'), null);
});

test('下载阶段最多推到 40%，合成阶段接着往上走', () => {
  assert.equal(stitch.finalCutProgress({ phase: 'downloading', downloadedCount: 0, clipCount: 4 }), 0);
  assert.equal(stitch.finalCutProgress({ phase: 'downloading', downloadedCount: 4, clipCount: 4 }), 40);
  assert.equal(stitch.finalCutProgress({ phase: 'stitching', encodedSeconds: 0, totalSeconds: 100 }), 40);
  assert.equal(stitch.finalCutProgress({ phase: 'stitching', encodedSeconds: 50, totalSeconds: 100 }), 70);
  assert.equal(stitch.finalCutProgress({ phase: 'done' }), 100);
});

test('进度不会因为 ffmpeg 报了超出总时长的 time 就冲破 100', () => {
  assert.equal(stitch.finalCutProgress({ phase: 'stitching', encodedSeconds: 500, totalSeconds: 100 }), 100);
});

test('ffmpeg 失败被翻成能照做的一句话', () => {
  assert.match(
    stitch.describeFfmpegFailure('[concat] Invalid data found when processing input', 1),
    /下载中断或上游返回了错误页/
  );
  assert.match(stitch.describeFfmpegFailure('Output file does not contain any stream', 1), /没有视频流/);
});

test('认不出的失败保留原文尾部，不吞掉线索', () => {
  const message = stitch.describeFfmpegFailure('line1\nline2\nsomething nobody predicted', 137);
  assert.match(message, /something nobody predicted/);
  assert.match(message, /137/);
});

test('normalizeFinalCutState 拒绝残缺记录，接受完整记录', () => {
  assert.equal(stitch.normalizeFinalCutState(null), null);
  assert.equal(stitch.normalizeFinalCutState({ status: 'completed' }), null);
  assert.equal(stitch.normalizeFinalCutState({ jobId: 'a', status: 'bogus' }), null);

  const state = stitch.normalizeFinalCutState({
    jobId: 'cut_1',
    status: 'completed',
    phase: 'done',
    progress: 140,
    clipCount: 36,
    encodeMode: 'copy',
    fileName: 'final.mp4',
    error: '   '
  });
  assert.equal(state.progress, 100, '越界进度会被夹回 100');
  assert.equal(state.clipCount, 36);
  assert.equal(state.encodeMode, 'copy');
  assert.equal('error' in state, false, '空白错误不该落进状态里');
});

test('合成中的任务会被识别为 in-flight', () => {
  assert.equal(stitch.isFinalCutInFlight({ jobId: 'a', status: 'stitching' }), true);
  assert.equal(stitch.isFinalCutInFlight({ jobId: 'a', status: 'completed' }), false);
  assert.equal(stitch.isFinalCutInFlight(null), false);
});

test('状态文案区分取回片段和合成', () => {
  assert.match(
    stitch.finalCutStatusLabel({ jobId: 'a', status: 'stitching', phase: 'downloading', downloadedCount: 3, clipCount: 36 }),
    /3\/36/
  );
  assert.equal(stitch.finalCutStatusLabel({ jobId: 'a', status: 'stitching', phase: 'stitching' }), '正在合成成片');
  assert.equal(stitch.finalCutStatusLabel(null), '尚未合成');
});
