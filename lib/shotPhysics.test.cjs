const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

function loadShotPhysics() {
  const filePath = path.join(__dirname, 'shotPhysics.ts');
  assert.equal(fs.existsSync(filePath), true, 'shotPhysics.ts should define the shared shot physics contract');
  const source = fs.readFileSync(filePath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const module = { exports: {} };
  new Function('exports', 'module', 'require', output)(module.exports, module, require);
  return module.exports;
}

test('缺省和非法取值一律落到最严的 realistic，而不是放行', () => {
  const { normalizePhysicsMode, DEFAULT_PHYSICS_MODE } = loadShotPhysics();

  assert.equal(DEFAULT_PHYSICS_MODE, 'realistic');
  assert.equal(normalizePhysicsMode(undefined), 'realistic');
  assert.equal(normalizePhysicsMode(''), 'realistic');
  assert.equal(normalizePhysicsMode('cinematic'), 'realistic');
  assert.equal(normalizePhysicsMode(42), 'realistic');
  // 模型漏填字段是最常见的情况。缺省放行等于「漏填就自动关掉质检」。
  assert.equal(normalizePhysicsMode({ mode: 'surreal' }), 'realistic');
  assert.equal(normalizePhysicsMode(' STYLIZED '), 'stylized');
  assert.equal(normalizePhysicsMode('surreal'), 'surreal');
});

test('时长上限按模式收紧，超限被裁剪而不是原样放行', () => {
  const { clampShotDuration, exceedsPhysicsDurationCap, physicsDurationCap } = loadShotPhysics();

  assert.equal(physicsDurationCap('realistic'), 5);
  assert.equal(physicsDurationCap('stylized'), 6);
  assert.equal(physicsDurationCap('surreal'), 8);

  assert.equal(clampShotDuration(12, 'realistic'), 5);
  assert.equal(clampShotDuration(12, 'surreal'), 8);
  assert.equal(clampShotDuration(4, 'realistic'), 4);
  // 缺失或非法时长退回上限，而不是 0——0 秒的镜头会让下游按「无时长」处理。
  assert.equal(clampShotDuration(0, 'realistic'), 5);
  assert.equal(clampShotDuration('abc', 'stylized'), 6);
  assert.equal(exceedsPhysicsDurationCap(6, 'realistic'), true);
  assert.equal(exceedsPhysicsDurationCap(6, 'stylized'), false);
});

test('高风险动作被识别出来并给出可执行的改写方向', () => {
  const { detectPhysicsRisks } = loadShotPhysics();

  const hug = detectPhysicsRisks('两人在门口拥抱，久久没有松开');
  assert.deepEqual(hug.map((risk) => risk.code), ['contact']);
  assert.match(hug[0].rewrite, /反打|切走/);

  const fight = detectPhysicsRisks('他一巴掌甩过去，对方摔倒在地');
  assert.equal(fight.some((risk) => risk.code === 'fight'), true);

  // 一个镜头可以同时命中多条规则，全都要报出来。
  const combo = detectPhysicsRisks('她奔跑着倒水，玻璃杯溅起水花');
  const codes = combo.map((risk) => risk.code);
  assert.equal(codes.includes('gait'), true);
  assert.equal(codes.includes('hands'), true);
  assert.equal(codes.includes('material'), true);

  // 普通对话镜头不该被误报，否则分镜会被无谓地改写掉。
  assert.deepEqual(detectPhysicsRisks('她坐在窗边，看着桌上的信封发呆'), []);
  assert.deepEqual(detectPhysicsRisks(undefined, null, ''), []);
});

test('复合动作能被识别，单镜头单动作才有执行依据', () => {
  const { hasMultipleActions } = loadShotPhysics();

  assert.equal(hasMultipleActions('她一边走一边回头说话'), true);
  assert.equal(hasMultipleActions('他站在原地，看着她'), false);
  assert.equal(hasMultipleActions(undefined), false);
});

test('质检判据按模式收放：夸张放行重力光影，但任何模式都不放行畸形和换脸', () => {
  const { physicsQaChecks, physicsFailingSeverities } = loadShotPhysics();

  assert.deepEqual(physicsQaChecks('realistic'), ['anatomy', 'identity', 'clipping', 'gravity', 'lighting', 'morphing']);
  // 霸总一掌把人推飞是要的效果，重力和光影不能拿来判它不合格。
  assert.equal(physicsQaChecks('stylized').includes('gravity'), false);
  assert.equal(physicsQaChecks('stylized').includes('lighting'), false);
  assert.equal(physicsQaChecks('surreal').includes('clipping'), false);

  // 但六根手指和换脸在任何模式下都是缺陷，没有哪个导演想要。
  ['realistic', 'stylized', 'surreal'].forEach((mode) => {
    assert.equal(physicsQaChecks(mode).includes('anatomy'), true, `${mode} 必须检查解剖学`);
    assert.equal(physicsQaChecks(mode).includes('identity'), true, `${mode} 必须检查角色一致性`);
  });

  assert.deepEqual(physicsFailingSeverities('realistic'), ['critical', 'major']);
  assert.deepEqual(physicsFailingSeverities('surreal'), ['critical']);
});

test('负向提示词和正向物理指令随模式变化，且共享同一份基础约束', () => {
  const { physicsNegativePrompt, physicsPromptDirective } = loadShotPhysics();

  ['realistic', 'stylized', 'surreal'].forEach((mode) => {
    assert.match(physicsNegativePrompt(mode), /不要多余手指/);
    assert.match(physicsNegativePrompt(mode), /不要脸部变形或融化/);
  });
  assert.match(physicsNegativePrompt('realistic'), /不要反重力悬浮/);
  assert.doesNotMatch(physicsNegativePrompt('stylized'), /不要反重力悬浮/);

  assert.match(physicsPromptDirective('realistic'), /完全符合真实物理/);
  assert.match(physicsPromptDirective('stylized'), /有意为之的戏剧夸张/);
  assert.match(physicsPromptDirective('surreal'), /允许非现实设定/);
});

test('分镜护栏文案把三种模式、时长上限和改写清单都写进提示词', () => {
  const { physicsGuardrailInstruction } = loadShotPhysics();
  const text = physicsGuardrailInstruction();

  assert.match(text, /physicsMode/);
  assert.match(text, /realistic/);
  assert.match(text, /stylized/);
  assert.match(text, /surreal/);
  assert.match(text, /不超过 5 秒/);
  assert.match(text, /单镜头单动作/);
  // 写错模式的双向代价必须说清楚，否则模型会一律填最省事的那个。
  assert.match(text, /把爽点写成 realistic/);
  assert.match(text, /人物接触/);
  assert.match(text, /手部精细操作/);
});

test('小节是叙事单位，镜头是渲染单位：15 秒小节按目标时长拆成 5 个 realistic 镜头', () => {
  const { shotsPerSegment, estimateShotCount, physicsDurationCap, targetShotSeconds } = loadShotPhysics();

  // 上限管「不能更长」，目标管「该拆到多细」。两者共用一个数时，
  // 15 秒小节只拆 3 个 5 秒镜头，每个镜头塞满一整段戏，观感上根本不是分镜。
  assert.equal(physicsDurationCap('realistic'), 5);
  assert.equal(targetShotSeconds('realistic'), 3);
  assert.ok(targetShotSeconds('realistic') < physicsDurationCap('realistic'));

  assert.equal(shotsPerSegment(15), 5);
  assert.equal(shotsPerSegment(15, 'surreal'), 4);
  // 除不尽要向上取整：13 秒装不进四个 3 秒镜头。
  assert.equal(shotsPerSegment(13), 5);
  // 非法输入不能返回 0——返回 0 会让上游把「一个镜头都不用渲」当成合法结论。
  assert.equal(shotsPerSegment(0), 1);
  assert.equal(shotsPerSegment(NaN), 1);

  assert.equal(estimateShotCount(180), 60);
  assert.equal(estimateShotCount(0), 0);
});

test('复合动作检测认得出纯逗号并列，而不只是「一边…一边」', () => {
  const { hasMultipleActions } = loadShotPhysics();

  // 旧实现只认连接词，这句三个动作一个连接词都没有，完全漏过。
  assert.equal(hasMultipleActions('女主猛地回头，攥紧防狼喷雾，对准身后的人'), true);
  assert.equal(hasMultipleActions('他一边走一边说话'), true);

  // 阈值取 3：一个主动作加一个伴随动作在实拍和生成里都成立，卡到 2 会误伤大量正常镜头。
  assert.equal(hasMultipleActions('他坐下，皱眉'), false);
  assert.equal(hasMultipleActions('小澎站在窗边，窗外下着雨，桌上放着一杯冷掉的咖啡'), false);
  assert.equal(hasMultipleActions(undefined), false);
});

test('脚本阶段约束会把镜头预算和免露脸策略写进去', () => {
  const { scriptConstraintInstruction } = loadShotPhysics();
  const text = scriptConstraintInstruction({ segmentSeconds: 15, segmentCount: 12 });

  assert.match(text, /单个镜头最长 5 秒/);
  assert.match(text, /每个小节最终会被拆成约 5 个镜头/);
  assert.match(text, /全片合计约 60 个镜头/);
  // 真实事故：只给镜头预算不说边界，模型会把 36 个镜头逐条写进 script.md，
  // 输出撑到 8000+ 字符触发 JSON 结构错误，连自动修复都因为 max_tokens 不够而失败。
  assert.match(text, /不要在脚本里逐条列出这些镜头/);
  assert.match(text, /拆镜头是分镜阶段的产物/);
  // 即梦那份 5 秒脚本里性价比最高的一句人设，就是把不需要脸的角色写成看不见脸。
  assert.match(text, /背影/);
  assert.match(text, /画面里不能出现任何文字/);
});
