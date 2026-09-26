const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

function loadCharacterVisualSpec() {
  const source = fs.readFileSync(path.join(__dirname, 'characterVisualSpec.ts'), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  const module = { exports: {} };
  new Function('exports', 'module', 'require', output)(module.exports, module, require);
  return module.exports;
}

const {
  CHARACTER_EXPRESSION_SLOTS,
  characterExpressionSlots,
  characterMatrixConflicts,
  characterMatrixRow,
  characterPaletteSwatch,
  characterReviewState,
  characterVisualBrief,
  characterVisualCompleteness,
  characterVisualDraftSkeleton,
  characterEthnicityText,
  characterVisualPromptLines,
  characterWardrobeLookTemplate,
  emptyCharacterVisualSpec,
  normalizeCharacterVisualSpec
} = loadCharacterVisualSpec();

/** 一份必填字段全部填满的设定，用来做「完整」这一侧的对照。 */
function completeSpec(overrides = {}) {
  return normalizeCharacterVisualSpec({
    tagline: '被现实磨过一轮但还没认输的普通人',
    tags: ['克制', '体面', '疲惫'],
    identity: {
      gender: '女性',
      faceShape: '鹅蛋脸', brow: '自然平眉', eyes: '内双杏眼', nose: '鼻梁直',
      lips: '唇形偏薄', skinTone: '自然黄一白', bodyType: '偏瘦', posture: '肩线平直略含胸',
      views: { front: 'data:image/png;base64,aaa' }
    },
    hair: {
      color: '自然黑色', length: '锁骨下 8cm', texture: '顺直', part: '四六侧分',
      bangs: '无刘海', baseStyle: '自然披发', forbiddenStyles: ['厚重齐刘海']
    },
    wardrobe: [
      { id: 'commute', label: '日常通勤', sceneUsage: '第 2 节', top: '米白针织衫', bottom: '深灰西裤', palette: ['米白'] },
      { id: 'date', label: '约会', sceneUsage: '第 4 节', top: '浅蓝衬衫', bottom: '牛仔裤', palette: ['浅蓝'] },
      { id: 'home', label: '居家', sceneUsage: '第 6 节', top: '灰色卫衣', bottom: '棉质长裤', palette: ['灰'] }
    ],
    expressions: [
      { id: 'neutral', intensity: 2, brow: '眉头舒展', gaze: '平视', mouth: '自然闭合' },
      { id: 'sad', intensity: 4, brow: '眉头内聚', gaze: '下垂', mouth: '抿紧' },
      { id: 'angry', intensity: 4, brow: '眉峰下压', gaze: '直视', mouth: '咬肌收紧' },
      { id: 'relieved', intensity: 2, brow: '眉眼舒展', gaze: '望向远处', mouth: '轻抬' }
    ],
    shooting: {
      cameraAngles: ['正面平视'], shotSizes: ['近景', '中景'],
      identityAnchors: ['脸型与骨相'], driftBans: ['突然出现刘海']
    },
    signature: { silhouette: '窄肩细长', primaryColor: '燕麦色', props: ['帆布通勤包'], faceVisibilityRule: '允许正脸' },
    ...overrides
  });
}

test('空设定归一化成固定形状，缺字段不会变成 undefined', () => {
  const spec = normalizeCharacterVisualSpec(undefined);
  assert.deepEqual(spec, emptyCharacterVisualSpec());
  assert.equal(spec.identity.views.front, '');
  assert.deepEqual(spec.wardrobe, []);
  // 老工作区没有出镜字段，默认必须是「允许」——默认成禁止会让所有旧角色突然不许露脸。
  assert.equal(spec.shooting.allowFrontFace, true);
  assert.equal(spec.shooting.allowFullBody, true);
  assert.equal(spec.shooting.voiceOnly, false);
});

test('归一化剔除脏数据但保留可用值', () => {
  const spec = normalizeCharacterVisualSpec({
    tags: ['克制', '  ', '克制', 42, '体面'],
    identity: { locked: 'yes', faceShape: '  方脸  ', views: { front: 1, profile: 'p.png' } },
    expressions: [{ id: 'sad', intensity: '9' }, { id: 'neutral', intensity: -3 }],
    wardrobe: [{}],
    shooting: { allowFrontFace: false, driftBans: ['脸型变化', '脸型变化'] }
  });

  assert.deepEqual(spec.tags, ['克制', '体面']);
  assert.equal(spec.identity.faceShape, '方脸');
  assert.equal(spec.identity.locked, false, 'locked 只认真正的布尔 true');
  assert.equal(spec.identity.views.front, '');
  assert.equal(spec.identity.views.profile, 'p.png');
  assert.equal(spec.expressions[0].intensity, 5, '强度上限 5');
  assert.equal(spec.expressions[1].intensity, 0, '负数归零，表示还没填');
  assert.equal(spec.wardrobe[0].id, 'look_1', '没有 id 的造型要补一个稳定 id');
  assert.equal(spec.shooting.allowFrontFace, false);
  assert.deepEqual(spec.shooting.driftBans, ['脸型变化']);
});

test('标准表情组永远是八格，自定义表情排在后面且不丢', () => {
  const slots = characterExpressionSlots(normalizeCharacterVisualSpec({
    expressions: [{ id: 'sad', intensity: 4 }, { id: 'smirk', label: '冷笑', intensity: 3 }]
  }));

  assert.deepEqual(slots.slice(0, 8).map((item) => item.id), CHARACTER_EXPRESSION_SLOTS.map((item) => item.id));
  assert.equal(slots.find((item) => item.id === 'sad').intensity, 4);
  assert.equal(slots[8].id, 'smirk');
  assert.equal(slots[8].label, '冷笑');
});

test('必填完成度只统计必填项，填满即 100%', () => {
  const empty = characterVisualCompleteness(emptyCharacterVisualSpec());
  assert.equal(empty.done, 0);
  assert.ok(empty.total > 0);
  assert.equal(empty.percent, 0);
  assert.ok(empty.missing.includes('性别呈现'));
  assert.ok(empty.missing.includes('脸型'));
  assert.ok(empty.missing.includes('正脸参考图'));

  const full = characterVisualCompleteness(completeSpec());
  assert.deepEqual(full.missing, []);
  assert.equal(full.percent, 100);
  assert.equal(full.groups.identity.done, full.groups.identity.total);
});

test('审查状态跟着数据走，而不是跟着用户点过什么走', () => {
  // 没填完：无论存的是什么，都是待完善，而且不给提交审查。
  const draft = characterReviewState(normalizeCharacterVisualSpec({ reviewStatus: 'ready_for_review' }));
  assert.equal(draft.status, 'draft');
  assert.equal(draft.label, '待完善');
  assert.equal(draft.actionLabel, '补充设定');
  assert.equal(draft.canSubmitReview, false);

  // 填完了但还没提交：待审查。
  const ready = characterReviewState(completeSpec());
  assert.equal(ready.status, 'ready_for_review');
  assert.equal(ready.actionLabel, '开始审查');
  assert.equal(ready.canSubmitReview, true);

  // 已确认的角色按钮是「查看设定」，不再是那个到处都一样的「审查」。
  const confirmed = characterReviewState(completeSpec({ reviewStatus: 'confirmed' }));
  assert.equal(confirmed.status, 'confirmed');
  assert.equal(confirmed.label, '已确认');
  assert.equal(confirmed.actionLabel, '查看设定');
  assert.equal(confirmed.canSubmitReview, false, '已确认的不需要再提交一次');

  const needsChanges = characterReviewState(completeSpec({ reviewStatus: 'needs_changes' }));
  assert.equal(needsChanges.actionLabel, '继续修改');
});

test('已确认之后再把必填字段清空，状态退回需修改', () => {
  // 「已确认」这三个字必须对数据的当前状态负责，否则它什么都不保证。
  const regressed = characterReviewState(completeSpec({ reviewStatus: 'confirmed', hair: { color: '' } }));
  assert.equal(regressed.status, 'needs_changes');
  assert.ok(regressed.completeness.missing.includes('发色'));
});

test('结构骨架给结构和策略默认值，但绝不编造长相', () => {
  const skeleton = characterVisualDraftSkeleton();

  // 结构齐了：六套造型的位置、八格标准表情、可用角度和禁止漂移项
  assert.equal(skeleton.wardrobe.length, 6);
  assert.equal(skeleton.expressions.length, 8);
  assert.ok(skeleton.shooting.cameraAngles.length > 0);
  assert.ok(skeleton.shooting.driftBans.includes('突然出现刘海'));

  // 长相是关于「这个人长什么样」的事实断言，生成侧不知道就不能编
  for (const key of ['gender', 'faceShape', 'boneStructure', 'brow', 'eyes', 'nose', 'lips', 'skinTone', 'bodyType', 'posture']) {
    assert.equal(skeleton.identity[key], '', `${key} 必须留空`);
  }
  for (const key of ['color', 'length', 'texture', 'part', 'bangs', 'baseStyle']) {
    assert.equal(skeleton.hair[key], '', `hair.${key} 必须留空`);
  }
  assert.equal(skeleton.signature.silhouette, '');
  assert.equal(skeleton.signature.primaryColor, '');
  assert.deepEqual(skeleton.signature.props, []);

  // 造型只给标签，不给衣服，所以完成度照样卡着，逼着真正填内容
  assert.ok(skeleton.wardrobe.every((look) => look.label && !look.top && !look.bottom && !look.palette.length));
  const completeness = characterVisualCompleteness(skeleton);
  assert.ok(completeness.missing.includes('脸型'));
  assert.ok(completeness.missing.includes('至少 1 套完整场景造型'));
  assert.ok(completeness.percent > 0 && completeness.percent < 100, '骨架只是起点，不能直接算完成');

  // 骨架必须能原样通过归一化，否则写进 characters.json 再读出来就变形了
  assert.deepEqual(normalizeCharacterVisualSpec(JSON.parse(JSON.stringify(skeleton))), skeleton);
});

test('造型模板只给标签和适用场景，具体穿什么留空', () => {
  const look = characterWardrobeLookTemplate('conflict');
  assert.equal(look.label, '重要冲突');
  assert.ok(look.sceneUsage);
  assert.equal(look.top, '');
  assert.deepEqual(look.palette, []);
});

test('色板从中文色名或十六进制里取色，取不到就留空让界面画占位', () => {
  assert.equal(characterPaletteSwatch('#3a3f45').hex, '#3a3f45');
  assert.equal(characterPaletteSwatch('炭灰色上衣').hex, '#3a3f45');
  assert.equal(characterPaletteSwatch('说不清的颜色').hex, '');
  assert.equal(characterPaletteSwatch('燕麦 #d8cbb3').label, '燕麦');
});

test('辨识度矩阵把撞车的字段点出来', () => {
  const rows = [
    { id: 'a', name: '男A', role: '前任', visual: normalizeCharacterVisualSpec({
      identity: { faceShape: '方脸' }, hair: { baseStyle: '油头侧分' },
      signature: { silhouette: '肩线挺直', primaryColor: '炭灰色', props: ['机械表'] }
    }) },
    { id: 'b', name: '男B', role: '前任', visual: normalizeCharacterVisualSpec({
      identity: { faceShape: '长脸' }, hair: { baseStyle: '寸头' },
      signature: { silhouette: '轻微含胸', primaryColor: '炭灰色', props: ['旧钱包'] }
    }) },
    { id: 'c', name: '男C', role: '前任', visual: normalizeCharacterVisualSpec({
      identity: { faceShape: '圆脸' }, hair: { baseStyle: '微卷发' },
      signature: { silhouette: '肩颈松弛', primaryColor: '燕麦色', props: ['手机'] }
    }) }
  ].map(characterMatrixRow);

  assert.equal(rows[0].primaryColorHex, '#3a3f45');
  const conflicts = characterMatrixConflicts(rows);
  assert.equal(conflicts.length, 1, '只有主服装色撞车');
  assert.equal(conflicts[0].field, 'primaryColor');
  assert.deepEqual(conflicts[0].names, ['男A', '男B']);

  // 三个人的脸型、头型和道具都不一样时，不该报任何冲突。
  assert.deepEqual(characterMatrixConflicts(rows.slice(1)), []);
});

test('矩阵的正脸规则在没写规则时从出镜约束推出来', () => {
  const voiceOnly = characterMatrixRow({ id: 'v', name: '旁白', role: '画外音', visual: normalizeCharacterVisualSpec({
    shooting: { voiceOnly: true }
  }) });
  assert.equal(voiceOnly.faceVisibilityRule, '只有声音，不出镜');

  const noFrontFace = characterMatrixRow({ id: 'n', name: '男A', role: '前任', visual: normalizeCharacterVisualSpec({
    shooting: { allowFrontFace: false }
  }) });
  assert.equal(noFrontFace.faceVisibilityRule, '不露正脸，只用背影和侧影');
});

test('提示词行只输出填过的字段，空设定只留人种这一条锚点', () => {
  // 人种是唯一一个「空着也要输出」的字段，而且是有意的：别的长相字段留空，
  // 模型会跟着参考图走；人种留空，模型每次都重掷，成片里同一个角色的脸就在
  // 中式和欧美两种面庞之间来回切。所以空设定的输出不是 []，而是恰好这一条。
  assert.deepEqual(characterVisualPromptLines(emptyCharacterVisualSpec()), [
    '人种与地域面孔：东亚面孔，中国人。这一条是身份锚点，任何镜头、任何阶段都不允许改变，也不要往混血或欧美长相上靠。'
  ]);
  assert.equal(characterVisualBrief(emptyCharacterVisualSpec()), '人种：东亚面孔，中国人');

  const lines = characterVisualPromptLines(completeSpec(), { lookId: 'date', expressionId: 'sad' });
  const text = lines.join('\n');
  assert.match(text, /固定身份特征（不可随场景改变）/);
  assert.match(text, /锁骨下 8cm/);
  assert.match(text, /本场造型「约会」/);
  assert.match(text, /表情「悲伤」/);
  assert.match(text, /只改变表情/);
  assert.doesNotMatch(text, /未设定|undefined/);
});

test('人种锚点：空值兜底成中国面孔，填了的值不许被兜底盖掉', () => {
  assert.equal(characterEthnicityText(emptyCharacterVisualSpec()), '东亚面孔，中国人');
  assert.equal(characterEthnicityText(normalizeCharacterVisualSpec({ identity: { ethnicity: '   ' } })), '东亚面孔，中国人');

  // 外籍和混血角色是真实需求，兜底不能把它们一起改成中国面孔——
  // 那样这个字段就从「修一致性」变成了「禁止一类角色」。
  const mixed = normalizeCharacterVisualSpec({ identity: { ethnicity: '中法混血，偏欧亚轮廓' } });
  assert.equal(characterEthnicityText(mixed), '中法混血，偏欧亚轮廓');
  const text = characterVisualPromptLines(mixed).join('\n');
  assert.match(text, /人种与地域面孔：中法混血，偏欧亚轮廓。/);
  assert.doesNotMatch(text, /东亚面孔，中国人/);
});

test('不出镜和不许正脸的角色，约束要进提示词', () => {
  const spec = normalizeCharacterVisualSpec({ shooting: { voiceOnly: true } });
  assert.match(characterVisualPromptLines(spec).join('\n'), /只有声音，不要让他出现在画面里/);

  const backOnly = normalizeCharacterVisualSpec({ shooting: { allowFrontFace: false, allowFullBody: false } });
  const text = characterVisualPromptLines(backOnly).join('\n');
  assert.match(text, /不允许出现正脸/);
  assert.match(text, /不允许全身出镜/);
});
