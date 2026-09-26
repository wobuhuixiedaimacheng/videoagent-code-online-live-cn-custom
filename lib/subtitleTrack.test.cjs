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

test('字幕只取说出口的字，不带说话人前缀', () => {
  const restore = installTypeScriptLoader();
  try {
    const { subtitleTextFor } = require('./subtitleTrack.ts');
    // 「林岩：走吧」直接烧进画面会变成一条像剧本一样的字幕。
    assert.equal(subtitleTextFor('林岩：我等了你两个小时。'), '我等了你两个小时。');
    // 多行台词并成一条。
    assert.equal(subtitleTextFor('林岩：走吧。\n周叙：等一下。'), '走吧。 等一下。');
    assert.equal(subtitleTextFor(''), '');
    // 旁白行会被 parseDialogueLines 丢掉，字幕里不该出现它。
    assert.equal(subtitleTextFor('旁白：三年后的秋天。'), '');
  } finally {
    restore();
  }
});

test('按字数折行，最多两行', () => {
  const restore = installTypeScriptLoader();
  try {
    const { wrapSubtitleText, SUBTITLE_LINE_CHARS } = require('./subtitleTrack.ts');
    assert.equal(SUBTITLE_LINE_CHARS, 18);
    assert.equal(wrapSubtitleText('短句'), '短句');

    const long = '一'.repeat(40);
    const wrapped = wrapSubtitleText(long);
    // 三行会盖住人物的脸，而人物的脸是这类片子的全部内容。
    assert.equal(wrapped.split('\n').length, 2);
    assert.equal(wrapped.replace('\n', ''), long, '折行不能吞字');
  } finally {
    restore();
  }
});

test('字幕时间轴按最终片段顺序累计，没台词的镜头不占字幕条', () => {
  const restore = installTypeScriptLoader();
  try {
    const { buildSubtitleCues, buildSrt } = require('./subtitleTrack.ts');
    const cues = buildSubtitleCues([
      { dialogue: '林岩：我等了你两个小时。', durationSeconds: 3 },
      // 空镜没有台词，不产生字幕，但仍然占时间轴——不占的话后面全错位。
      { dialogue: '', durationSeconds: 2 },
      { dialogue: '周叙：对不起。', durationSeconds: 4 }
    ]);

    assert.equal(cues.length, 2);
    assert.deepEqual(Array.from(cues.map((cue) => cue.startSeconds)), [0, 5]);
    assert.deepEqual(Array.from(cues.map((cue) => cue.endSeconds)), [3, 9]);
    assert.equal(cues[1].text, '对不起。');

    const srt = buildSrt(cues);
    assert.match(srt, /00:00:00,000 --> 00:00:03,000/);
    assert.match(srt, /00:00:05,000 --> 00:00:09,000/);
    assert.match(srt, /我等了你两个小时。/);
    assert.equal(buildSrt([]), '');
  } finally {
    restore();
  }
});

test('删掉一个镜头之后，后面的字幕整体前移', () => {
  const restore = installTypeScriptLoader();
  try {
    const { buildSubtitleCues } = require('./subtitleTrack.ts');
    // 这一条是字幕最容易出错的地方：用剪辑前的时长排，整条字幕都会错位，
    // 而错位的字幕比没有字幕更糟——观众会以为配音出了问题。
    const afterCut = buildSubtitleCues([
      { dialogue: '林岩：我等了你两个小时。', durationSeconds: 3 },
      { dialogue: '周叙：对不起。', durationSeconds: 4 }
    ]);
    assert.deepEqual(Array.from(afterCut.map((cue) => cue.startSeconds)), [0, 3]);
  } finally {
    restore();
  }
});

test('字体必须显式指定，否则汉字会画成方框', () => {
  const restore = installTypeScriptLoader();
  try {
    const { defaultSubtitleFont, subtitleForceStyle, subtitleFilter } = require('./subtitleTrack.ts');

    assert.equal(defaultSubtitleFont('darwin'), 'PingFang SC');
    assert.equal(defaultSubtitleFont('linux'), 'Noto Sans CJK SC');

    const style = subtitleForceStyle({ fontName: 'PingFang SC' });
    assert.match(style, /FontName=PingFang SC/);
    // 短剧画面亮度变化很大，纯白字幕在浅色背景上直接消失，描边是必须的。
    assert.match(style, /Outline=3/);
    assert.match(style, /Alignment=2/);

    // 滤镜串用冒号分隔参数，一个带冒号的项目名就能让整条滤镜解析失败。
    const filter = subtitleFilter('/tmp/a:b/subs.srt', { fontName: 'PingFang SC' });
    assert.match(filter, /\/tmp\/a\\:b\/subs\.srt/);
    assert.match(subtitleFilter("/tmp/it's/subs.srt", { fontName: 'X' }), /it\\'s/);
  } finally {
    restore();
  }
});

test('响度按投放标准统一，用单遍 loudnorm', () => {
  const restore = installTypeScriptLoader();
  try {
    const { loudnormFilter, LOUDNESS_TARGET_LUFS } = require('./subtitleTrack.ts');
    assert.equal(LOUDNESS_TARGET_LUFS, -16);
    assert.equal(loudnormFilter(), 'loudnorm=I=-16:TP=-1.5:LRA=11');
  } finally {
    restore();
  }
});

test('烧字幕失败只丢字幕这一层，成片仍然交付', () => {
  const restore = installTypeScriptLoader();
  try {
    const { subtitleBurnFailedNote } = require('./subtitleTrack.ts');
    const note = subtitleBurnFailedNote('PingFang SC');
    assert.match(note, /片子本身是完整的/);
    assert.match(note, /libass/);
    assert.match(note, /PingFang SC/);
    assert.match(note, /FFMPEG_SUBTITLE_FONT/);
  } finally {
    restore();
  }
});

test('concat 清单支持按秒截尾，有裁剪就必须重编码', () => {
  const restore = installTypeScriptLoader();
  try {
    const { buildConcatManifest, stitchRequiresReencode, buildStitchArgs } = require('./videoStitch.ts');

    // 纯字符串数组仍然可用：老调用点和老测试不用改。
    assert.equal(buildConcatManifest(['/a/1.mp4']), "file '/a/1.mp4'\n");

    const manifest = buildConcatManifest([
      { filePath: '/a/1.mp4' },
      { filePath: '/a/2.mp4', outpointSeconds: 3.5 }
    ]);
    // inpoint 必须显式写 0：片段的起始时间戳并不保证是 0。
    assert.match(manifest, /inpoint 0\noutpoint 3\.5/);
    assert.doesNotMatch(manifest.split('\n')[0], /outpoint/);

    // -c copy 下 outpoint 只能切在关键帧上，而生成出来的片段关键帧间隔往往就是整段——
    // 一个看起来生效、实际没生效的剪辑功能比没有这个功能更糟。
    assert.equal(stitchRequiresReencode({ entries: [{ filePath: '/a/2.mp4', outpointSeconds: 3.5 }] }), true);
    assert.equal(stitchRequiresReencode({ entries: [{ filePath: '/a/1.mp4' }] }), false);
    assert.equal(stitchRequiresReencode({ subtitlePath: '/a/subs.srt' }), true);
    assert.equal(stitchRequiresReencode({ normalizeLoudness: true }), true);

    // 滤镜和 -c copy 互斥：拼流模式下没有解码后的帧可供叠字幕或调响度。
    const args = buildStitchArgs({
      manifestPath: '/a/concat.txt',
      outputPath: '/a/out.mp4',
      mode: 'copy',
      subtitleFilterValue: "subtitles='/a/subs.srt'",
      audioFilterValue: 'loudnorm=I=-16:TP=-1.5:LRA=11'
    });
    assert.ok(!args.includes('copy'), '带滤镜时不能落到拼流分支');
    assert.ok(args.includes('-vf') && args.includes('-af'));
    assert.ok(args.includes('libx264'));
  } finally {
    restore();
  }
});

test('合成请求带上字幕和响度，字幕烧不进去时单独降级', () => {
  const routeSource = fs.readFileSync(
    path.join(__dirname, '..', 'app', 'api', 'video', 'stitch', 'route.ts'),
    'utf8'
  );
  const pageSource = fs.readFileSync(path.join(__dirname, '..', 'app', 'page.tsx'), 'utf8');

  // 默认开启响度统一：音量忽大忽小是成片才暴露的问题，默认关掉等于默认交付一条要一路调音量的片子。
  assert.match(routeSource, /normalizeLoudness: body\.normalizeLoudness !== false/);
  assert.match(routeSource, /buildSubtitleCues\(/);
  assert.match(routeSource, /FFMPEG_SUBTITLE_FONT/);
  // libass 缺失时重编码再来一次照样失败，所以要单独降级成「不带字幕但能看」的成片。
  assert.match(routeSource, /if \(result\.code !== 0 && subtitleFilterValue\)/);
  assert.match(routeSource, /subtitleBurnFailedNote\(fontName\)/);
  // 客户端要按剪辑之后的顺序和时长排字幕。
  assert.match(pageSource, /const subtitles = finalClips\.map/);
  assert.match(pageSource, /normalizeLoudness: true/);
});
