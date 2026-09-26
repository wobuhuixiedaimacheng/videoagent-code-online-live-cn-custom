const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

function loadSceneVisualSpec() {
  const filePath = path.join(__dirname, 'sceneVisualSpec.ts');
  const previous = require.extensions['.ts'];
  require.extensions['.ts'] = (module, modulePath) => {
    const source = fs.readFileSync(modulePath, 'utf8');
    const output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
    }).outputText;
    module._compile(output, modulePath);
  };
  delete require.cache[filePath];
  delete require.cache[path.join(__dirname, 'characterVisualSpec.ts')];
  const result = require(filePath);
  if (previous) require.extensions['.ts'] = previous;
  else delete require.extensions['.ts'];
  return result;
}

const spec = loadSceneVisualSpec();

/** 一个填到「刚好通过」的镜头。测试只改要检查的那一两个字段。 */
function shot(overrides = {}) {
  const continuity = overrides.continuity || {};
  return spec.normalizeSceneShot({
    id: 'shot_1',
    code: 'SH-01',
    cameraMove: 'static',
    ...overrides,
    continuity: {
      characters: [],
      props: [],
      doorState: '关闭',
      lightState: '关',
      timeOfDay: '傍晚',
      axisSide: 'left',
      ...continuity
    }
  }, 0);
}

function cast(overrides = {}) {
  return { characterId: 'xiaocheng', present: true, exited: false, ...overrides };
}

test('镜头运镜同时认 id 和中文名，认不出来才退回固定', () => {
  assert.equal(shot({ cameraMove: 'push_in' }).cameraMove, 'push_in');
  // 模型经常直接写中文运镜名。丢成「固定」会让所有推拉摇移在提示词里消失。
  assert.equal(shot({ cameraMove: '环绕' }).cameraMove, 'orbit');
  assert.equal(shot({ cameraMove: '跟随人物移动' }).cameraMove, 'follow');
  assert.equal(shot({ cameraMove: '' }).cameraMove, 'static');
});

test('母版锚点两种形状都收，并按上限截断', () => {
  const master = spec.normalizeSceneMaster({
    id: 'm1',
    // 模型一半时候写字符串数组，一半时候写对象数组。
    anchors: ['落地窗位于沙发右后方', { text: '墨绿色双人沙发', locked: true }, { text: '' }]
  });
  assert.deepEqual(master.anchors.map((item) => item.text), ['落地窗位于沙发右后方', '墨绿色双人沙发']);
  assert.equal(master.anchors[1].locked, true);
  assert.equal(master.anchors[0].locked, false);

  const overflow = spec.normalizeSceneMaster({ anchors: Array.from({ length: 9 }, (_, i) => `锚点 ${i}`) });
  assert.equal(overflow.anchors.length, spec.SCENE_ANCHOR_MAX);
});

test('道具换手且没有换手动作时报错，有动作说明时放行', () => {
  const drift = spec.checkSceneContinuity([
    shot({ id: 'a', code: 'SH-01', continuity: { characters: [cast({ handProp: '玻璃杯', hand: 'right' })] } }),
    shot({ id: 'b', code: 'SH-02', continuity: { characters: [cast({ handProp: '玻璃杯', hand: 'left' })] } })
  ]);
  assert.equal(drift.length, 1);
  assert.equal(drift[0].field, 'hand_prop');
  assert.equal(drift[0].severity, 'error');
  assert.match(drift[0].message, /右手/);
  assert.match(drift[0].message, /左手/);

  // 剧情里真的换了手，就不是穿帮。全量告警等于没有告警。
  const explained = spec.checkSceneContinuity([
    shot({ id: 'a', continuity: { characters: [cast({ handProp: '玻璃杯', hand: 'right' })] } }),
    shot({ id: 'b', action: '她把杯子换手，右手去拿手机', continuity: { characters: [cast({ handProp: '玻璃杯', hand: 'left' })] } })
  ]);
  assert.deepEqual(explained, []);
});

test('门自己开了会报错，有人推门则放行', () => {
  const drift = spec.checkSceneContinuity([
    shot({ id: 'a', continuity: { doorState: '关闭' } }),
    shot({ id: 'b', continuity: { doorState: '打开' } })
  ]);
  assert.deepEqual(drift.map((issue) => issue.field), ['door']);

  const explained = spec.checkSceneContinuity([
    shot({ id: 'a', continuity: { doorState: '关闭' } }),
    shot({ id: 'b', action: '他推开门走进来', continuity: { doorState: '打开' } })
  ]);
  assert.deepEqual(explained, []);
});

test('同一场次内时间跳变按硬错误处理', () => {
  const drift = spec.checkSceneContinuity([
    shot({ id: 'a', continuity: { timeOfDay: '白天' } }),
    shot({ id: 'b', continuity: { timeOfDay: '夜晚' } })
  ]);
  assert.equal(drift.length, 1);
  assert.equal(drift[0].field, 'time_light');
  assert.equal(drift[0].severity, 'error');
});

test('正反打两镜视线朝同一侧时报错，方向相对则通过', () => {
  const wrong = spec.checkSceneContinuity([
    shot({ id: 'a', code: 'SH-01', subjectGaze: '看向画面左侧' }),
    shot({ id: 'b', code: 'SH-02', subjectGaze: '看向画面左侧', continuity: { reverseShotOf: 'a' } })
  ]);
  assert.deepEqual(wrong.map((issue) => issue.field), ['gaze']);
  assert.match(wrong[0].message, /正反打/);

  const right = spec.checkSceneContinuity([
    shot({ id: 'a', subjectGaze: '看向画面左侧' }),
    shot({ id: 'b', subjectGaze: '看向画面右侧', continuity: { reverseShotOf: 'a' } })
  ]);
  assert.deepEqual(right, []);
});

test('已离场人物又出现在后续镜头里会被抓出来', () => {
  const drift = spec.checkSceneContinuity([
    shot({ id: 'a', continuity: { characters: [cast({ exited: true })] } }),
    shot({ id: 'b', continuity: { characters: [cast()] } })
  ]);
  assert.deepEqual(drift.map((issue) => issue.field), ['exited_cast']);
  assert.equal(drift[0].severity, 'error');
});

test('墙面装饰更换按母版漂移处理，家具搬动有动作则放行', () => {
  const decor = spec.checkSceneContinuity([
    shot({ id: 'a', continuity: { decor: '抽象画' } }),
    shot({ id: 'b', continuity: { decor: '风景照' } })
  ]);
  assert.deepEqual(decor.map((issue) => issue.field), ['decor']);

  const furniture = spec.checkSceneContinuity([
    shot({ id: 'a', continuity: { furniture: '茶几居中' } }),
    shot({ id: 'b', action: '他把茶几推到一边', continuity: { furniture: '茶几靠墙' } })
  ]);
  assert.deepEqual(furniture, []);
});

test('饮料液面只能变少，回升会被标记', () => {
  const refilled = spec.checkSceneContinuity([
    shot({ id: 'a', continuity: { props: [{ name: '咖啡杯', level: '半' }] } }),
    shot({ id: 'b', continuity: { props: [{ name: '咖啡杯', level: '满' }] } })
  ]);
  assert.deepEqual(refilled.map((issue) => issue.field), ['drink_level']);

  const drunk = spec.checkSceneContinuity([
    shot({ id: 'a', continuity: { props: [{ name: '咖啡杯', level: '满' }] } }),
    shot({ id: 'b', continuity: { props: [{ name: '咖啡杯', level: '半' }] } })
  ]);
  assert.deepEqual(drunk, []);
});

test('灯没动但光换了边按硬错误处理，灯的状态确实变了则不重复报', () => {
  const flipped = spec.checkSceneContinuity([
    shot({ id: 'a', continuity: { lightState: '开', lightDirection: '左后侧' } }),
    shot({ id: 'b', continuity: { lightState: '开', lightDirection: '右前侧' } })
  ]);
  assert.deepEqual(flipped.map((i) => i.field), ['light_direction']);
  assert.equal(flipped[0].severity, 'error');

  // 有人去开关灯，方向跟着变是合理的，这时只报灯光状态那一条。
  const switched = spec.checkSceneContinuity([
    shot({ id: 'a', continuity: { lightState: '关', lightDirection: '左后侧' } }),
    shot({ id: 'b', action: '她伸手按下落地灯', continuity: { lightState: '开', lightDirection: '右前侧' } })
  ]);
  assert.deepEqual(switched, []);
});

test('时间线行取被追踪的四项状态，时码按镜头时长累加', () => {
  const shots = [
    shot({ id: 'a', durationSeconds: 4, subjectGaze: '看向画面右侧',
      continuity: { props: [{ name: '玻璃杯', position: '她右手' }], doorState: '关闭', windowState: '纱帘拉上', lightDirection: '左后侧' } }),
    shot({ id: 'b', durationSeconds: 6 }),
    shot({ id: 'c', durationSeconds: 5 })
  ];
  const rows = spec.sceneTimelineRows(shots[0]);
  assert.deepEqual(rows.map((r) => r.label), ['玻璃杯位置', '门窗状态', '人物视线', '灯光方向']);
  assert.deepEqual(rows.map((r) => r.value), ['她右手', '关闭 · 纱帘拉上', '看向画面右侧', '左后侧']);
  // 没标的项显示破折号，不显示「未设定」这类会被误读成内容的占位。
  // 没写 lightDirection 时回落到 lightState（helper 默认是「关」），有总比空着强。
  assert.deepEqual(spec.sceneTimelineRows(shots[1]).map((r) => r.value), ['—', '关闭', '—', '关']);

  assert.equal(spec.sceneShotTimecode(shots, 0), '00:00:00');
  assert.equal(spec.sceneShotTimecode(shots, 1), '00:00:04');
  assert.equal(spec.sceneShotTimecode(shots, 2), '00:00:10');
});

test('锚点速览表按类别摊开，空类别不占位', () => {
  const master = spec.normalizeSceneMaster({
    structure: { doors: '入户门在左侧', windows: '落地窗在右后方' },
    art: { fixedFurniture: '墨绿色双人沙发、木质矮柜', materials: ['胡桃木', '棉麻'], palette: ['墨绿', '米白'] }
  });
  const groups = spec.sceneAnchorGroups(master);
  assert.deepEqual(groups.map((g) => g.label), ['门窗', '家具', '材质', '主色盘']);
  // 多值字段要拆成 chip，否则一整句话塞进一个格子里根本没法扫。
  assert.deepEqual(groups[1].items, ['墨绿色双人沙发', '木质矮柜']);
  assert.equal(groups[2].kind, 'material');
  assert.equal(groups[3].kind, 'color');
  // 固定道具没填，这一行整个不出现。
  assert.equal(groups.some((g) => g.label === '固定道具'), false);
  assert.deepEqual(spec.sceneAnchorGroups(spec.emptySceneMaster('m')), []);
});

test('机位缺坐标时不画假机位，平面家具尺寸为零则丢弃', () => {
  assert.equal(spec.normalizeSceneInstance({}).camera, null);
  assert.equal(spec.normalizeSceneInstance({ camera: { angle: 30 } }).camera, null);
  const camera = spec.normalizeSceneInstance({ camera: { x: 10, y: 60, angle: -20 } }).camera;
  assert.deepEqual(camera, { x: 10, y: 60, angle: -20, fov: 50 });

  const master = spec.normalizeSceneMaster({
    plan: [{ id: 'sofa', label: '沙发', x: 30, y: 20, width: 30, height: 12 }, { id: 'ghost', label: '空', x: 0, y: 0 }]
  });
  assert.deepEqual(master.plan.map((b) => b.id), ['sofa']);
  // 平面布局要进提示词，否则家具位置只存在于界面上，模型看不到。
  assert.match(spec.sceneMasterPromptLines(master).join('\n'), /沙发位于横向 30%～60%/);
});

test('越轴只在没有运动镜头过渡时提示', () => {
  const jump = spec.checkSceneContinuity([
    shot({ id: 'a', continuity: { axisSide: 'left' } }),
    shot({ id: 'b', continuity: { axisSide: 'right' } })
  ]);
  assert.deepEqual(jump.map((issue) => issue.field), ['axis']);
  assert.equal(jump[0].severity, 'warning');

  const bridged = spec.checkSceneContinuity([
    shot({ id: 'a', continuity: { axisSide: 'left' } }),
    shot({ id: 'b', cameraMove: 'orbit', continuity: { axisSide: 'right' } })
  ]);
  assert.deepEqual(bridged, []);
});

test('没标的状态一律跳过检查，不制造假告警', () => {
  const blank = spec.checkSceneContinuity([
    shot({ id: 'a', continuity: { doorState: '', lightState: '', timeOfDay: '', axisSide: 'unset' } }),
    shot({ id: 'b', continuity: { doorState: '打开', lightState: '开', timeOfDay: '夜晚', axisSide: 'unset' } })
  ]);
  assert.deepEqual(blank, []);
  assert.deepEqual(spec.checkSceneContinuity([]), []);
  assert.deepEqual(spec.checkSceneContinuity([shot()]), []);
});

test('自然光主光方向必须和母版窗户方位一致', () => {
  const master = spec.normalizeSceneMaster({ id: 'm1', structure: { windows: '一扇落地窗，位于沙发右后方' } });
  const conflict = spec.normalizeSceneInstance({
    lighting: { keySource: '落地窗自然光', keyDirection: '从画面左前方进入' }
  });
  const issues = spec.checkSceneLightingAgainstMaster(master, conflict);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].severity, 'error');

  const aligned = spec.normalizeSceneInstance({
    lighting: { keySource: '落地窗自然光', keyDirection: '从画面右后方进入' }
  });
  assert.deepEqual(spec.checkSceneLightingAgainstMaster(master, aligned), []);

  // 实景灯做主光时方向本来就可以自由布置，不该报冲突。
  const practical = spec.normalizeSceneInstance({
    lighting: { keySource: '沙发左侧落地灯', keyDirection: '从画面左前方进入' }
  });
  assert.deepEqual(spec.checkSceneLightingAgainstMaster(master, practical), []);
});

test('按地点派生母版：同一地点合并成一份，母版 id 在多次调用间稳定', () => {
  const seeds = [
    { id: 'scene_01', title: '清晨', location: '小澄家客厅', visual: '她醒来', palette: '暖黄、米白', lighting: '', timeOfDay: '清晨' },
    { id: 'scene_02', title: '争吵后', location: '小澄家 · 客厅', visual: '两人沉默', palette: '', lighting: '', timeOfDay: '夜里' },
    { id: 'scene_03', title: '街上', location: '楼下街道', visual: '她走出来', palette: '', lighting: '', timeOfDay: '夜里' }
  ];
  const first = spec.deriveSceneMasters(seeds);
  assert.equal(first.masters.length, 2);
  // 同一个客厅的两场必须指向同一份母版，否则空间描述会各写各的。
  assert.equal(first.masterIdByScene.scene_01, first.masterIdByScene.scene_02);
  assert.notEqual(first.masterIdByScene.scene_01, first.masterIdByScene.scene_03);
  assert.equal(first.masters.find((m) => m.id === first.masterIdByScene.scene_03).identity.spaceKind, 'exterior');
  assert.equal(first.masters.find((m) => m.id === first.masterIdByScene.scene_01).identity.accessKind, 'private');
  assert.deepEqual(first.masters.find((m) => m.id === first.masterIdByScene.scene_01).art.palette, ['暖黄', '米白']);

  // id 必须只跟地点有关：换个顺序、只传子集，算出来的 id 还得是同一个。
  // 用序号当 id 会让场次在两次读取之间挂到别人的母版上。
  const subset = spec.deriveSceneMasters([seeds[2], seeds[1]]);
  assert.equal(subset.masterIdByScene.scene_02, first.masterIdByScene.scene_02);
  assert.equal(subset.masterIdByScene.scene_03, first.masterIdByScene.scene_03);
});

test('完成度只统计必填项，凑齐后能到 100%', () => {
  const blank = spec.sceneMasterCompleteness(spec.emptySceneMaster('m1'));
  assert.equal(blank.percent, 0);
  assert.ok(blank.missing.includes('场景名称'));
  assert.ok(blank.missing.includes(`至少 ${spec.SCENE_ANCHOR_MIN} 条空间身份锚点`));

  const filled = spec.normalizeSceneMaster({
    id: 'm1',
    identity: { name: '小澄家客厅', purpose: '日常起居', tagline: '被生活磨旧的暖调客厅' },
    structure: {
      area: '约 18 平米', layout: '长方形', doors: '入户门在左侧，向内开',
      windows: '落地窗在沙发右后方', sightlines: '沙发朝电视墙', depthLayers: '前景矮柜，中景沙发，背景落地窗'
    },
    art: {
      wall: '米白乳胶漆', floor: '浅胡桃木地板', fixedFurniture: '墨绿色双人沙发',
      fixedLighting: '暖色落地灯', palette: ['墨绿', '米白'], materials: ['木', '棉麻']
    },
    anchors: ['落地窗位于沙发右后方', '墨绿色双人沙发', '入口位于画面左侧'],
    views: { panorama: 'https://img/p.png', top: 'https://img/t.png' }
  });
  assert.equal(spec.sceneMasterCompleteness(filled).percent, 100);

  // 有未解决的连续性冲突时，母版填满也不能算「待审查」。
  assert.equal(spec.sceneReviewState(filled, 0).status, 'ready_for_review');
  assert.equal(spec.sceneReviewState(filled, 2).status, 'draft');
  const confirmed = { ...filled, reviewStatus: 'confirmed' };
  assert.equal(spec.sceneReviewState(confirmed, 0).status, 'confirmed');
  assert.equal(spec.sceneReviewState(confirmed, 1).status, 'needs_changes');
});

test('提示词只写填了的字段，母版负责空间、场次负责差异', () => {
  const master = spec.normalizeSceneMaster({
    id: 'm1',
    identity: { name: '小澄家客厅', spaceKind: 'interior', accessKind: 'private', tagline: '暖调小客厅' },
    structure: { windows: '落地窗在沙发右后方' },
    art: { fixedFurniture: '墨绿色双人沙发', palette: ['墨绿'] },
    anchors: ['落地窗位于沙发右后方']
  });
  const masterLines = spec.sceneMasterPromptLines(master).join('\n');
  assert.match(masterLines, /场景：小澄家客厅；内景，私人空间。/);
  assert.match(masterLines, /空间身份锚点（每一条都必须出现且位置不变）：落地窗位于沙发右后方。/);
  // 没填的字段不该出现「未设定」这类会误导模型的占位。
  assert.doesNotMatch(masterLines, /未设定|层高|天花板/);

  const instance = spec.normalizeSceneInstance({
    environment: { timeOfDay: '傍晚', weather: '阴' },
    lighting: { keySource: '落地窗自然光', keyDirection: '从画面右后方进入', effects: ['逆光'] }
  });
  const instanceLines = spec.sceneInstancePromptLines(instance).join('\n');
  assert.match(instanceLines, /本场环境状态：时间段：傍晚；天气：阴。/);
  assert.match(instanceLines, /画面效果：逆光。/);
  // 场次不该重复描述空间本身，那是母版的活。
  assert.doesNotMatch(instanceLines, /沙发|客厅/);

  // 镜头行是「场景与人物占比不对」的解药：景别要被翻译成具体的占比，
  // 而不是原样丢一个「特写」给模型自己理解。
  const shotLines = spec.sceneShotPromptLines(spec.normalizeSceneShot({
    shotSize: '特写', cameraAngle: '平视', cameraHeight: '坐姿视线', cameraMove: '固定',
    subjectPlacement: '人物在画面左三分之一'
  }, 0)).join('\n');
  assert.match(shotLines, /镜头：景别：特写；拍摄角度：平视；机位高度：坐姿视线；运镜：固定。/);
  assert.match(shotLines, /取景与人物占比：人物头部占画面高度的 70% 以上/);
  assert.match(shotLines, /人物画面位置：人物在画面左三分之一/);

  // 一条什么都没填的镜头不该产出「运镜：固定」这种看着像设计过、其实是默认值的噪音。
  assert.deepEqual(spec.sceneShotPromptLines(spec.normalizeSceneShot({}, 0)), []);

  // 过渡景别取【开始】那个。真实分镜数据里写的就是「全景转中景」这种，
  // 按表的顺序匹配会取到「中景」——正好是这一镜结束时的景别，而首帧要的是开始那个。
  assert.match(spec.shotSizeFramingHint('全景转中景'), /^人物全身完整入画/);
  assert.match(spec.shotSizeFramingHint('中景转近景'), /^人物腰部以上/);
  assert.match(spec.shotSizeFramingHint('全景转中景'), /这是镜头开始时的取景/);
  // 单一景别不该被加上那句过渡说明。
  assert.doesNotMatch(spec.shotSizeFramingHint('特写'), /镜头开始时/);
  // 更具体的词优先：「大特写」不能被「特写」抢走。
  assert.match(spec.shotSizeFramingHint('大特写'), /^人物面部占满画面/);

  // 动作/画面描述大多自带句号，不能无条件再补一个拼出「。。」。
  const punctuation = spec.sceneShotPromptLines(spec.normalizeSceneShot({
    shotSize: '特写', action: '她把杯子放下。', openFrame: '手停在杯沿'
  }, 0)).join('\n');
  assert.match(punctuation, /动作：她把杯子放下。/);
  assert.doesNotMatch(punctuation, /。。/);
  assert.match(punctuation, /起始画面：手停在杯沿。/);

  const viewPrompt = spec.buildSceneViewPrompt(master, 'reverse');
  assert.match(viewPrompt, /反向视角/);
  assert.match(viewPrompt, /画面里不要出现任何人物/);
  assert.match(viewPrompt, /禁止出现：门窗数量变化/);
  // 平面图是示意图，不该被要求「不要出现人物」之外还按实拍处理。
  assert.match(spec.buildSceneViewPrompt(master, 'top'), /俯视平面示意图/);
});
