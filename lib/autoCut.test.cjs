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

function shot(id, overrides = {}) {
  return { id, durationSeconds: 3, ...overrides };
}

test('分批生成造成的重复台词被挑出来，保留先说的那一遍', () => {
  const restore = installTypeScriptLoader();
  try {
    const { planAutoCut } = require('./autoCut.ts');
    const plan = planAutoCut([
      shot('s1', { dialogue: '林岩：我等了你两个小时。', action: '她站起身' }),
      shot('s2', { dialogue: '周叙：对不起。', action: '他低头' }),
      // 第 2 批把同一句又写了一遍——每一批单看都合理，拼起来就是同一句话说两遍。
      shot('s3', { dialogue: '林岩：我等了你两个小时！', action: '她转身走向门口' })
    ]);

    const dup = plan.decisions.find((item) => item.shotId === 's3');
    assert.equal(dup.action, 'drop');
    assert.equal(dup.reason, 'duplicate_dialogue');
    assert.match(dup.detail, /第 1 镜/);
    // 先说的那一遍保留。
    assert.equal(plan.decisions.find((item) => item.shotId === 's1').action, 'keep');
  } finally {
    restore();
  }
});

test('不同角色说同一句话是对手戏，不是重复', () => {
  const restore = installTypeScriptLoader();
  try {
    const { planAutoCut } = require('./autoCut.ts');
    const plan = planAutoCut([
      shot('s1', { dialogue: '林岩：我没事。', action: '她低头' }),
      shot('s2', { dialogue: '周叙：我没事。', action: '他别过脸' })
    ]);
    assert.equal(plan.decisions.filter((item) => item.reason === 'duplicate_dialogue').length, 0);
  } finally {
    restore();
  }
});

test('标点不一致不影响重复判定', () => {
  const restore = installTypeScriptLoader();
  try {
    const { dialogueKey } = require('./autoCut.ts');
    // 模型在不同批次里对同一句台词的标点处理经常不一致，
    // 带标点比较会让绝大多数真重复漏掉。
    assert.equal(dialogueKey('林岩：走吧，别再等他了。'), dialogueKey('林岩：走吧别再等他了'));
    // 说话人要带上：两个角色说同一句是对手戏，不是重复。
    assert.notEqual(dialogueKey('林岩：我不想再听你解释了。'), dialogueKey('周叙：我不想再听你解释了。'));
    assert.equal(dialogueKey(''), '');
    // 太短的判不了重复：「嗯」「对不起」这种在剧里出现十次是正常的写作。
    assert.equal(dialogueKey('林岩：嗯'), '');
    assert.equal(dialogueKey('林岩：对不起'), '');
  } finally {
    restore();
  }
});

test('连续空镜删后一个，单个空镜保留', () => {
  const restore = installTypeScriptLoader();
  try {
    const { planAutoCut, isEmptyShot } = require('./autoCut.ts');

    assert.equal(isEmptyShot(shot('x', { visual: '空荡的客厅，窗帘轻晃' })), true);
    // 有动作动词就不是空镜，判据和物理护栏共用同一份动词表。
    assert.equal(isEmptyShot(shot('x', { visual: '她走向窗边', characterIds: ['lin_yan'] })), false);
    assert.equal(isEmptyShot(shot('x', { dialogue: '林岩：走吧。' })), false);
    // 动词表覆盖不全，「拉开窗帘」一个词都匹配不上。但画面里有人，就不该被判成空镜——
    // 误判成空镜会让系统建议删掉一个真有内容的镜头，那是最危险的方向。
    assert.equal(isEmptyShot(shot('x', { visual: '她拉开窗帘', characterIds: ['lin_yan'] })), false);
    // 除非描述本身就写明这是空镜。
    assert.equal(isEmptyShot(shot('x', { visual: '客厅空镜，无人', characterIds: ['lin_yan'] })), true);

    // 八镜共 24 秒、其中 6 秒空镜 = 25%，正好不超上限，
    // 这样才测得到「连续空镜」这一条本身，而不是被空镜占比那一条抢先命中。
    const withCast = (visual) => ({ visual, characterIds: ['lin_yan'] });
    const plan = planAutoCut([
      shot('s1', withCast('她放下杯子')),
      shot('s2', { visual: '空荡的客厅' }),
      shot('s3', { visual: '桌面上的旧照片' }),
      shot('s4', withCast('她拿起手机')),
      shot('s5', withCast('她走向窗边')),
      shot('s6', withCast('她拉开窗帘')),
      shot('s7', withCast('她转身坐下')),
      shot('s8', withCast('她低头看向地面'))
    ]);
    // 单个空镜是正当的剪辑语言，保留。
    assert.equal(plan.decisions.find((item) => item.shotId === 's2').action, 'keep');
    // 连着两个就是在原地打转。
    const consecutive = plan.decisions.find((item) => item.shotId === 's3');
    assert.equal(consecutive.action, 'drop');
    assert.equal(consecutive.reason, 'consecutive_empty');
  } finally {
    restore();
  }
});

test('空镜占比过高时只提醒不替用户删', () => {
  const restore = installTypeScriptLoader();
  try {
    const { planAutoCut, EMPTY_SHOT_SHARE_LIMIT } = require('./autoCut.ts');
    assert.equal(EMPTY_SHOT_SHARE_LIMIT, 0.25);

    // 四镜里两个空镜（不相邻）= 50%，超过上限。
    const plan = planAutoCut([
      shot('s1', { visual: '空荡的客厅' }),
      shot('s2', { action: '她放下杯子' }),
      shot('s3', { visual: '窗外的雨' }),
      shot('s4', { action: '她拿起手机' })
    ]);
    const flags = plan.decisions.filter((item) => item.reason === 'empty_share');
    assert.equal(flags.length, 2);
    // 该删哪几个是创作判断，系统只说比例失衡。
    assert.ok(flags.every((item) => item.action === 'flag'));
    assert.match(flags[0].detail, /50%/);
  } finally {
    restore();
  }
});

test('时长明显超出内容所需时建议按动作切，差一点点不打扰', () => {
  const restore = installTypeScriptLoader();
  try {
    const { planAutoCut } = require('./autoCut.ts');

    // 一个动作节拍值 3 秒，给了 5 秒，结尾挂着 2 秒没有信息的余量。
    const plan = planAutoCut([shot('s1', { action: '她放下杯子', durationSeconds: 5 })]);
    const trim = plan.decisions[0];
    assert.equal(trim.action, 'trim');
    assert.equal(trim.reason, 'overlong_for_content');
    assert.equal(trim.durationSeconds, 3);
    assert.equal(trim.originalDurationSeconds, 5);

    // 差 0.5 秒不值得占一行审查位：卡太紧的清单没人会看。
    const tight = planAutoCut([shot('s1', { action: '她放下杯子', durationSeconds: 3.5 })]);
    assert.equal(tight.decisions[0].action, 'keep');
  } finally {
    restore();
  }
});

test('一个镜头只出一条决策，按严重程度取最重的那条', () => {
  const restore = installTypeScriptLoader();
  try {
    const { planAutoCut } = require('./autoCut.ts');
    const plan = planAutoCut([
      shot('s1', { dialogue: '林岩：我等了你两个小时。', action: '她站起身' }),
      // 既是重复台词又超时：建议是「删掉」，再加一行「建议缩短」纯属噪音。
      shot('s2', { dialogue: '林岩：我等了你两个小时。', action: '她站起身', durationSeconds: 8 })
    ]);
    assert.equal(plan.decisions.length, 2);
    assert.equal(plan.decisions[1].action, 'drop');
  } finally {
    restore();
  }
});

test('剪辑摘要给出前后时长，没有可剪时明说', () => {
  const restore = installTypeScriptLoader();
  try {
    const { planAutoCut, autoCutSummary, actionableAutoCutDecisions } = require('./autoCut.ts');

    const clean = planAutoCut([shot('s1', { action: '她放下杯子' }), shot('s2', { action: '她拿起手机' })]);
    assert.deepEqual(Array.from(actionableAutoCutDecisions(clean)), []);
    assert.match(autoCutSummary(clean), /没有发现/);

    const dirty = planAutoCut([
      shot('s1', { dialogue: '林岩：我等了你两个小时。' }),
      shot('s2', { dialogue: '林岩：我等了你两个小时。' })
    ]);
    assert.equal(dirty.originalSeconds, 6);
    assert.equal(dirty.plannedSeconds, 3);
    assert.match(autoCutSummary(dirty), /建议删掉 1 个镜头/);
    assert.match(autoCutSummary(dirty), /6 秒变成 3 秒/);
  } finally {
    restore();
  }
});

test('采纳的建议落到片段上：删掉的丢弃、缩短的改时长、序号重排', () => {
  const restore = installTypeScriptLoader();
  try {
    const { applyAutoCutToClips } = require('./autoCut.ts');
    const clips = [
      { promptId: 'p1', shotNumber: 1, url: 'https://v/1.mp4', durationSeconds: 3 },
      { promptId: 'p2', shotNumber: 2, url: 'https://v/2.mp4', durationSeconds: 3 },
      { promptId: 'p3', shotNumber: 3, url: 'https://v/3.mp4', durationSeconds: 5 }
    ];
    const decisions = [
      { shotId: 's2', shotNumber: 2, action: 'drop', label: '', detail: '', originalDurationSeconds: 3, durationSeconds: 3 },
      { shotId: 's3', shotNumber: 3, action: 'trim', label: '', detail: '', originalDurationSeconds: 5, durationSeconds: 3 }
    ];

    const result = applyAutoCutToClips(clips, decisions);
    assert.deepEqual(Array.from(result.map((clip) => clip.promptId)), ['p1', 'p3']);
    // 留着空档会让 validateStitchClips 的重复/缺失检查报出一堆莫名其妙的错。
    assert.deepEqual(Array.from(result.map((clip) => clip.shotNumber)), [1, 2]);
    assert.equal(result[1].durationSeconds, 3);
  } finally {
    restore();
  }
});

test('flag 不会被自动执行——它的语义就是「你来看一眼」', () => {
  const restore = installTypeScriptLoader();
  try {
    const { applyAutoCutToClips } = require('./autoCut.ts');
    const clips = [{ promptId: 'p1', shotNumber: 1, url: 'https://v/1.mp4', durationSeconds: 3 }];
    const result = applyAutoCutToClips(clips, [
      { shotId: 's1', shotNumber: 1, action: 'flag', label: '', detail: '', originalDurationSeconds: 3, durationSeconds: 3 }
    ]);
    assert.equal(result.length, 1);
    assert.equal(result[0].durationSeconds, 3);
  } finally {
    restore();
  }
});

test('剪辑面板默认一条都不勾，删镜要用户自己点', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'app', 'page.tsx'), 'utf8');
  // 删掉的镜头是花钱渲出来的，而「这个空镜是废镜还是导演留的呼吸」只有人能判断。
  assert.match(source, /const \[acceptedAutoCutIds, setAcceptedAutoCutIds\] = useState<string\[\]>\(\[\]\)/);
  assert.match(source, /applyAutoCutToClips\(clips, acceptedAutoCutDecisions\)/);
  // flag 没有可执行动作，给勾选框会让用户以为勾上系统就替他决定了。
  assert.match(source, /item\.action !== 'flag' && \(/);
  // 采纳删镜之后成片镜头数本来就该变少，仍拿 prompts.length 去卡会把每次剪辑判成漏镜头。
  assert.match(source, /expectedShotCount: finalClips\.length/);
});
