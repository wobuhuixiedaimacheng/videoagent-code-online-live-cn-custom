const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

function loadEpisodePlan() {
  const filePath = path.join(__dirname, 'episodePlan.ts');
  const output = ts.transpileModule(fs.readFileSync(filePath, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  const module = { exports: {} };
  require('node:vm').runInNewContext(output, { module, exports: module.exports, require }, { filename: filePath });
  return module.exports;
}

test('默认仍是 3 分钟 12 小节，老项目行为不变', () => {
  const { episodePlan, DEFAULT_EPISODE_SECONDS } = loadEpisodePlan();

  assert.equal(DEFAULT_EPISODE_SECONDS, 180);
  const plan = episodePlan(DEFAULT_EPISODE_SECONDS);
  assert.equal(plan.totalSeconds, 180);
  assert.equal(plan.segmentCount, 12);
  assert.equal(plan.segmentSeconds, 15);
});

test('每个预设档位都能整除成整齐的小节', () => {
  const { episodePlan, EPISODE_LENGTH_PRESETS } = loadEpisodePlan();

  // Array.from：模块在 vm 的独立 realm 里执行，数组原型和这里不是同一个，deepEqual 会因此判不等。
  assert.deepEqual(Array.from(EPISODE_LENGTH_PRESETS), [30, 60, 180, 300]);
  for (const seconds of EPISODE_LENGTH_PRESETS) {
    const plan = episodePlan(seconds);
    assert.equal(plan.totalSeconds, seconds);
    assert.equal(plan.segmentSeconds, 15, `${seconds}s 的小节时长不该偏离 15s`);
    assert.equal(plan.segmentCount * plan.segmentSeconds, seconds);
  }
});

test('自定义秒数不会被取整吞掉——选 50 秒就得到 50 秒', () => {
  const { episodePlan } = loadEpisodePlan();
  const plan = episodePlan(50);

  assert.equal(plan.totalSeconds, 50);
  assert.equal(plan.segmentCount, 3);
  // 小节时长由总时长反推，所以乘回去精确等于用户要的秒数，不会悄悄缩成 45 秒。
  assert.equal(Math.round(plan.segmentCount * plan.segmentSeconds), 50);
});

test('非法或越界的时长被夹住，不会带进生成指令', () => {
  const { normalizeEpisodeSeconds, episodePlan } = loadEpisodePlan();

  assert.equal(normalizeEpisodeSeconds(undefined), 180);
  assert.equal(normalizeEpisodeSeconds('不是数字'), 180);
  assert.equal(normalizeEpisodeSeconds(-5), 10);
  assert.equal(normalizeEpisodeSeconds(0), 10);
  assert.equal(normalizeEpisodeSeconds(99999), 900);
  // 夹住之后仍然要能算出至少一个小节，否则下游会拿到 0 小节的片子。
  assert.ok(episodePlan(-5).segmentCount >= 1);
});

test('时长文案按用户习惯说，不让用户自己换算', () => {
  const { episodeLengthLabel } = loadEpisodePlan();

  assert.equal(episodeLengthLabel(30), '30 秒');
  assert.equal(episodeLengthLabel(60), '1 分钟');
  assert.equal(episodeLengthLabel(180), '3 分钟');
  assert.equal(episodeLengthLabel(90), '1 分 30 秒');
});

test('首页把总时长真的发给了后端，而不是继续用写死的常量', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'app', 'page.tsx'), 'utf8');

  // 改造前这三个常量写死了 15s × 12，首页选什么都没用。
  assert.doesNotMatch(source, /const VIDEO_RENDER_SEGMENT_SECONDS/);
  assert.doesNotMatch(source, /const VIDEO_RENDER_SEGMENT_COUNT/);
  assert.doesNotMatch(source, /const VIDEO_RENDER_TOTAL_SECONDS/);

  // 规格指令三行数值全部来自 episodePlan。
  assert.match(source, /episode_segment_seconds: \$\{plan\.segmentSeconds\}/);
  assert.match(source, /episode_segment_count: \$\{plan\.segmentCount\}/);
  assert.match(source, /episode_total_seconds: \$\{plan\.totalSeconds\}/);

  // 首页 chip 和面板。
  assert.match(source, /homeMenu === 'length'/);
  assert.match(source, /EPISODE_LENGTH_PRESETS\.map/);
  assert.match(source, /自定义秒数/);

  // 成本预估必须跟着时长走，否则选了 5 分钟还显示 3 分钟的渲染量。
  assert.match(source, /\[videoSpec\.episodeSeconds\]/);

  // 老存档没有这个字段，读进来要归一化。
  assert.match(source, /episodeSeconds: normalizeEpisodeSeconds\(parsed\.episodeSeconds\)/);
});

test('分镜面板读的键名和生成指令一致，且把 id 换成人看得懂的名字', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'app', 'page.tsx'), 'utf8');

  // 指令要求的是 sourceSceneId，面板以前读的是 sceneId，所以「场景」那一栏永远在兜底显示标题。
  assert.match(source, /value\('sourceSceneId', value\('sceneId', ''\)\)/);
  assert.match(source, /storyboardCharacterName/);
  assert.match(source, /storyboardSceneTitle/);
  // 兜底的运镜是全局默认值，不标出来会被当成模型逐镜给的设计。
  assert.match(source, /（全局默认）/);
});
