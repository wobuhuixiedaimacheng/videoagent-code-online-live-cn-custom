/**
 * 角色「视觉设定」的数据模型。
 *
 * 角色卡上那句「黑色长发、白色上衣」根本撑不住一致性审查：
 * 换个场景模型就自己发挥出刘海、把直发画成卷发、把三个男配统一穿成灰色上衣，
 * 而这些漂移在镜头里全是「同一个人变成了另一个人」。
 *
 * 所以这里把角色拆成两类字段，而且刻意分开存：
 *  - 身份锚点（identity / hair）：不随场景改变，可以锁定，锁上之后连编辑都不给；
 *  - 场景变量（wardrobe / expressions）：按剧情建立多套方案，允许变，但变的边界要写死。
 * 再加一组 shooting（镜头与生成约束）和 signature（全员辨识度），
 * 前者管「这个角色能不能露正脸」，后者管「三个人别长得一样」。
 *
 * 所有字段都可能是空的——角色数据来自模型生成，不保证写全。
 * 因此这里只做归一化，不做兜底编造：空就是空，让界面显示空状态，
 * 而不是塞一段看起来像模型写的默认文案。
 */

export type CharacterViewAngleId = 'front' | 'three_quarter' | 'profile' | 'full_body';

/** 视觉审查的四个状态。和阶段状态机无关，这是单个角色自己的审查进度。 */
export type CharacterReviewStatus = 'draft' | 'ready_for_review' | 'confirmed' | 'needs_changes';

export type CharacterIdentityAnchor = {
  /** 锁定后身份特征只读，防止有人在场景阶段顺手把脸改了。 */
  locked: boolean;
  /**
   * 性别呈现。
   *
   * 真实事故：男配角「前任A」的描述是「陈女士第一段恋爱的对象，29岁，性格温和」——
   * 整条提示词里「男」出现 0 次，「女」反而出现了（来自女主角的名字），
   * 图片模型于是给这个男配角生成了一张女性正脸。
   * 剧本经常不写性别，所以它必须是一个显式字段，而不是指望从描述里读出来。
   */
  gender: string;
  /**
   * 人种与地域面孔。
   *
   * 真实事故：整条链路里「中国人」三个字只出现在角色定妆照的提示词里，
   * 场景图和视频提示词一个字都没有。剧本同样不会写「这是个中国人」——
   * 于是每个阶段都在重掷一次人种，成片里同一个角色的脸在中式和欧美两种面庞之间来回切。
   * 它和性别是同一类字段：剧本永远不写，但漏了模型就自己猜，猜错就是另一个人。
   *
   * 空值不代表「没有约束」——提示词层会回落到 DEFAULT_CHARACTER_ETHNICITY，
   * 因为「不写」在这个字段上没有任何有用的语义，只有漂移。
   */
  ethnicity: string;
  faceShape: string;
  boneStructure: string;
  forehead: string;
  brow: string;
  eyes: string;
  nose: string;
  lips: string;
  skinTone: string;
  height: string;
  bodyType: string;
  posture: string;
  permanentMarks: string;
  /** 四个固定参考位的图片地址，缺图时是空串——界面显示上传/生成占位。 */
  views: Record<CharacterViewAngleId, string>;
};

export type CharacterHairSpec = {
  color: string;
  length: string;
  texture: string;
  volume: string;
  hairline: string;
  part: string;
  bangs: string;
  baseStyle: string;
  variableStyles: string[];
  forbiddenStyles: string[];
};

export type CharacterWardrobeLook = {
  id: string;
  label: string;
  sceneUsage: string;
  top: string;
  bottom: string;
  outerwear: string;
  shoes: string;
  accessories: string;
  hairChange: string;
  makeup: string;
  /** 主色盘。每一项可以是 `#3a3f45`、`炭灰`，或 `炭灰 #3a3f45`。 */
  palette: string[];
  silhouette: string;
  mustKeep: string[];
  forbidden: string[];
  imageUrl: string;
};

export type CharacterExpressionShot = {
  id: string;
  label: string;
  /** 情绪强度 1–5。0 表示还没填。 */
  intensity: number;
  brow: string;
  gaze: string;
  mouth: string;
  sceneUsage: string;
  imageUrl: string;
};

export type CharacterShootingRule = {
  allowFrontFace: boolean;
  allowFullBody: boolean;
  voiceOnly: boolean;
  cameraAngles: string[];
  shotSizes: string[];
  identityAnchors: string[];
  driftBans: string[];
};

export type CharacterVisualSignature = {
  silhouette: string;
  primaryColor: string;
  primaryColorHex: string;
  props: string[];
  faceVisibilityRule: string;
};

export type CharacterVisualSpec = {
  tagline: string;
  tags: string[];
  reviewStatus: CharacterReviewStatus;
  identity: CharacterIdentityAnchor;
  hair: CharacterHairSpec;
  wardrobe: CharacterWardrobeLook[];
  expressions: CharacterExpressionShot[];
  shooting: CharacterShootingRule;
  signature: CharacterVisualSignature;
};

export type CharacterSpecGroupId = 'identity' | 'hair' | 'wardrobe' | 'expressions' | 'shooting' | 'signature';

export type CharacterFieldDescriptor = {
  key: string;
  label: string;
  required: boolean;
  placeholder: string;
  /** 多行输入（永久识别特征这类会写一整句）。 */
  multiline?: boolean;
};

export const CHARACTER_SPEC_GROUPS: Array<{ id: CharacterSpecGroupId; label: string; hint: string }> = [
  { id: 'identity', label: '固定身份特征', hint: '身份锚点，不可随场景改变' },
  { id: 'hair', label: '头发设定', hint: '发型是最容易漂移的一项，必须写到可执行的精度' },
  { id: 'wardrobe', label: '场景服饰系统', hint: '按剧情建立多套造型，而不是一套衣服走全片' },
  { id: 'expressions', label: '表情状态库', hint: '同一张脸、不同表情，表情不得带来身份漂移' },
  { id: 'shooting', label: '镜头与生成约束', hint: '出镜规则与禁止漂移项' },
  { id: 'signature', label: '视觉辨识度', hint: '和其他角色区分开的头型、色盘与道具' }
];

/** 四个固定参考位。prompt 用于按角度生成参考图，保证四张是同一个人。 */
export const CHARACTER_VIEW_ANGLES: Array<{ id: CharacterViewAngleId; label: string; hint: string; prompt: string }> = [
  { id: 'front', label: '正脸', hint: '身份主锚点', prompt: '正对镜头的正脸半身照，五官完整清晰，视线平视镜头' },
  { id: 'three_quarter', label: '3/4 侧脸', hint: '过渡角度', prompt: '四十五度侧向的 3/4 侧脸半身照，保持同一张脸的骨相和轮廓' },
  { id: 'profile', label: '纯侧脸', hint: '轮廓线', prompt: '完全侧向九十度的纯侧脸半身照，突出鼻梁、下颌线和发际线轮廓' },
  { id: 'full_body', label: '全身', hint: '身高体态', prompt: '站姿全身照，完整展示身高比例、肩颈体态和四肢比例' }
];

/**
 * 人种缺省值。
 *
 * 这是整套设定里唯一一个「空值也要兜底」的长相字段，理由和别的字段正好相反：
 * 其它长相字段留空，模型会跟着参考图走；人种留空，模型每次都从零重掷，
 * 而重掷的结果在成片里就是同一个人换了张脸。本产品做的是中文短剧，
 * 缺省成中国面孔比缺省成「随机」正确得多；确实需要外籍角色时在画板里改这一栏。
 */
export const DEFAULT_CHARACTER_ETHNICITY = '东亚面孔，中国人';

export const CHARACTER_IDENTITY_FIELDS: CharacterFieldDescriptor[] = [
  // 放在第一个，而且必填：剧本经常不写性别，漏了图片模型就会按上下文猜，猜错就是另一个人。
  { key: 'gender', label: '性别呈现', required: true, placeholder: '例如：男性 / 女性 / 中性偏男' },
  // 和性别同一类事故，只是更隐蔽：剧本从不交代人种，漏了就在中式和欧美面庞之间来回切。
  // 不设 required 是因为它有缺省值（DEFAULT_CHARACTER_ETHNICITY），空着也不会失控。
  { key: 'ethnicity', label: '人种与地域面孔', required: false, placeholder: `留空按「${DEFAULT_CHARACTER_ETHNICITY}」处理；例如：东亚面孔，中国北方长相 / 中法混血` },
  { key: 'faceShape', label: '脸型', required: true, placeholder: '例如：鹅蛋脸，下颌线柔和' },
  { key: 'boneStructure', label: '骨相', required: false, placeholder: '例如：颧骨中等偏高，眉骨平缓' },
  { key: 'forehead', label: '额头', required: false, placeholder: '例如：额头饱满，宽度中等' },
  { key: 'brow', label: '眉形', required: true, placeholder: '例如：自然平眉，眉尾略下垂' },
  { key: 'eyes', label: '眼型', required: true, placeholder: '例如：内双杏眼，眼距标准' },
  { key: 'nose', label: '鼻型', required: true, placeholder: '例如：鼻梁直，鼻头小巧' },
  { key: 'lips', label: '唇形', required: true, placeholder: '例如：唇形偏薄，唇峰清晰' },
  { key: 'skinTone', label: '肤色', required: true, placeholder: '例如：自然黄一白，冷调' },
  { key: 'height', label: '身高', required: false, placeholder: '例如：168cm' },
  { key: 'bodyType', label: '体型', required: true, placeholder: '例如：偏瘦，肩宽适中' },
  { key: 'posture', label: '肩颈与体态', required: true, placeholder: '例如：肩线平直，站姿略微含胸' },
  {
    key: 'permanentMarks',
    label: '永久识别特征',
    required: false,
    placeholder: '例如：左眼下方 1cm 有一颗小痣，右耳常年戴细银圈耳钉',
    multiline: true
  }
];

export const CHARACTER_HAIR_FIELDS: CharacterFieldDescriptor[] = [
  { key: 'color', label: '发色', required: true, placeholder: '例如：自然黑色，无挑染' },
  { key: 'length', label: '发长', required: true, placeholder: '例如：锁骨下 8cm' },
  { key: 'texture', label: '发质', required: true, placeholder: '例如：顺直、微哑光' },
  { key: 'volume', label: '发量', required: false, placeholder: '例如：中等发量' },
  { key: 'hairline', label: '发际线', required: false, placeholder: '例如：发际线平整，无美人尖' },
  { key: 'part', label: '分缝方向', required: true, placeholder: '例如：四六侧分，偏左' },
  { key: 'bangs', label: '刘海类型', required: true, placeholder: '例如：无刘海，碎发别在耳后' },
  { key: 'baseStyle', label: '基础发型', required: true, placeholder: '例如：自然披发，发尾内扣' }
];

export const CHARACTER_WARDROBE_FIELDS: CharacterFieldDescriptor[] = [
  { key: 'top', label: '上装', required: true, placeholder: '例如：米白色针织衫' },
  { key: 'bottom', label: '下装', required: true, placeholder: '例如：深灰直筒西裤' },
  { key: 'outerwear', label: '外套', required: false, placeholder: '例如：燕麦色长风衣' },
  { key: 'shoes', label: '鞋子', required: false, placeholder: '例如：白色低帮皮鞋' },
  { key: 'accessories', label: '配饰', required: false, placeholder: '例如：细银圈耳钉、帆布通勤包' },
  { key: 'hairChange', label: '发型变化', required: false, placeholder: '例如：低马尾，鬓角留碎发' },
  { key: 'makeup', label: '妆容', required: false, placeholder: '例如：裸妆，唇色偏豆沙' },
  { key: 'silhouette', label: '服装轮廓', required: false, placeholder: '例如：上宽下窄的 A 形轮廓' },
  { key: 'sceneUsage', label: '适用场景', required: true, placeholder: '例如：第 2、5 节的公司走廊和电梯间' }
];

/** 场景造型模板。这是「剧情里常见的六个状态」，不是某部片子的专属造型。 */
export const CHARACTER_WARDROBE_SCENARIOS: Array<{ id: string; label: string; sceneUsage: string }> = [
  { id: 'commute', label: '日常通勤', sceneUsage: '上班、通勤、办公室日常段落' },
  { id: 'date', label: '约会', sceneUsage: '两人独处、暧昧升温的段落' },
  { id: 'home', label: '居家', sceneUsage: '独处、深夜、卸下防备的段落' },
  { id: 'low', label: '情绪低谷', sceneUsage: '崩溃、失落、被否定的段落' },
  { id: 'conflict', label: '重要冲突', sceneUsage: '正面摊牌、争吵、转折的段落' },
  { id: 'ending', label: '结尾状态', sceneUsage: '收束、释然、新状态的段落' }
];

/** 标准表情组。八格覆盖短剧里绝大多数情绪跨度，同一张脸只换表情。 */
export const CHARACTER_EXPRESSION_SLOTS: Array<{ id: string; label: string; prompt: string }> = [
  { id: 'neutral', label: '中性', prompt: '表情放松，目光平视，肌肉不发力' },
  { id: 'slight_smile', label: '浅笑', prompt: '嘴角轻抬，眼周有细微笑意，克制' },
  { id: 'laugh', label: '大笑', prompt: '露齿笑，眼睛眯起，肩膀带动' },
  { id: 'awkward', label: '尴尬', prompt: '僵硬微笑，视线飘开，下颌收紧' },
  { id: 'suppressed', label: '压抑', prompt: '表情克制，嘴唇抿紧，情绪往回收' },
  { id: 'sad', label: '悲伤', prompt: '眉头内聚，眼眶发红，目光下垂' },
  { id: 'angry', label: '愤怒', prompt: '眉峰下压，眼神有压迫感，咬肌收紧' },
  { id: 'relieved', label: '释然', prompt: '眉眼舒展，呼吸放松，目光望向远处' }
];

export const CHARACTER_EXPRESSION_FIELDS: CharacterFieldDescriptor[] = [
  { key: 'brow', label: '眉毛变化', required: false, placeholder: '例如：眉头内聚，眉峰下压' },
  { key: 'gaze', label: '眼神变化', required: false, placeholder: '例如：视线躲开镜头，眼睑下垂' },
  { key: 'mouth', label: '嘴部变化', required: false, placeholder: '例如：嘴唇抿成一条线' },
  { key: 'sceneUsage', label: '适用剧情场景', required: false, placeholder: '例如：第 6 节被当众否定之后' }
];

export const CHARACTER_CAMERA_ANGLE_PRESETS = ['正面平视', '四十五度侧面', '纯侧面', '背面', '过肩', '俯拍', '仰拍'];
export const CHARACTER_SHOT_SIZE_PRESETS = ['大特写', '特写', '近景', '中景', '中全景', '全景', '远景'];
export const CHARACTER_IDENTITY_ANCHOR_PRESETS = ['脸型与骨相', '眉眼间距', '发际线与分缝', '肤色与色温', '身高体型比例', '肩颈体态', '永久识别特征'];

/** 禁止漂移项预设。这些都是真实翻过车的漂移方式，不是凑数的清单。 */
export const CHARACTER_DRIFT_BAN_PRESETS = [
  '突然出现刘海',
  '直发变卷发',
  '脸型变化',
  '肤色变化',
  '瞳色变化',
  '年龄感变化',
  '服装色盘失控',
  '标志性配饰消失'
];

const HEX_PATTERN = /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/;

/** 常见中文色名 → 十六进制。只用于画色板小方块，取不到就退回中性灰。 */
const COLOR_NAME_HEX: Record<string, string> = {
  黑: '#151719', 白: '#f2f4f5', 米白: '#f0ece2', 燕麦: '#d8cbb3', 燕麦色: '#d8cbb3',
  驼: '#b08d57', 驼色: '#b08d57', 卡其: '#b3a179', 浅灰: '#c7ccd1', 灰: '#8b9299',
  炭灰: '#3a3f45', 深灰: '#4a4f55', 灰绿: '#6f7f70', 墨绿: '#2f4739', 军绿: '#5a6144',
  藏青: '#26344d', 深蓝: '#1f3a5f', 蓝: '#3d6ea8', 天蓝: '#8ab4d8', 牛仔蓝: '#5b7ba3',
  砖红: '#9c4a3c', 酒红: '#6e2733', 红: '#c0392b', 粉: '#e8b4bc', 藕粉: '#d9b3ae',
  杏色: '#e8c9a8', 姜黄: '#c8922a', 米黄: '#e6d5b0', 紫: '#6b5b8f', 棕: '#6b4b34', 咖色: '#5a4436'
};

/** 从一段色彩描述里取出可用于色板的颜色，取不到时 hex 为空串，界面画描边占位。 */
export function characterPaletteSwatch(value: string): { hex: string; label: string } {
  const label = value.trim();
  if (!label) return { hex: '', label: '' };
  const hex = label.match(HEX_PATTERN)?.[0] || '';
  if (hex) return { hex, label: label.replace(HEX_PATTERN, '').trim() || hex };
  const named = Object.keys(COLOR_NAME_HEX)
    .sort((a, b) => b.length - a.length)
    .find((name) => label.includes(name));
  return { hex: named ? COLOR_NAME_HEX[named] : '', label };
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function textList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    const entry = text(item);
    if (!entry || seen.has(entry)) continue;
    seen.add(entry);
    out.push(entry);
  }
  return out;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function intensity(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(text(value));
  if (!Number.isFinite(number)) return 0;
  return Math.min(5, Math.max(0, Math.round(number)));
}

function reviewStatus(value: unknown): CharacterReviewStatus {
  const raw = text(value);
  return raw === 'confirmed' || raw === 'needs_changes' || raw === 'ready_for_review' ? raw : 'draft';
}

export function emptyCharacterIdentity(): CharacterIdentityAnchor {
  return {
    locked: false,
    gender: '',
    ethnicity: '',
    faceShape: '', boneStructure: '', forehead: '', brow: '', eyes: '', nose: '', lips: '',
    skinTone: '', height: '', bodyType: '', posture: '', permanentMarks: '',
    views: { front: '', three_quarter: '', profile: '', full_body: '' }
  };
}

export function emptyCharacterHair(): CharacterHairSpec {
  return {
    color: '', length: '', texture: '', volume: '', hairline: '', part: '', bangs: '', baseStyle: '',
    variableStyles: [], forbiddenStyles: []
  };
}

export function emptyCharacterVisualSpec(): CharacterVisualSpec {
  return {
    tagline: '',
    tags: [],
    reviewStatus: 'draft',
    identity: emptyCharacterIdentity(),
    hair: emptyCharacterHair(),
    wardrobe: [],
    expressions: [],
    shooting: {
      allowFrontFace: true,
      allowFullBody: true,
      voiceOnly: false,
      cameraAngles: [],
      shotSizes: [],
      identityAnchors: [],
      driftBans: []
    },
    signature: { silhouette: '', primaryColor: '', primaryColorHex: '', props: [], faceVisibilityRule: '' }
  };
}

/**
 * 结构骨架：给生成侧当起点用，让用户进画板时是「审一版草稿」而不是「填一张空表」。
 *
 * 刻意只填两类东西：
 *  - 结构（六套造型的标签和适用场景、八格标准表情的通用情绪描述）
 *  - 策略默认值（可用角度、景别、身份锚点、禁止漂移项）
 *
 * 长相类字段（脸型、骨相、发色、肤色、身材轮廓、主服装色…）一律留空。
 * 这些是关于「这个人长什么样」的事实断言，生成侧不知道就不该编——
 * 编出来的是一份看着很确定、其实和剧本无关的设定，比空着更糟。
 * 造型里也只给标签，不给上装下装色盘，所以完成度检查照样卡着，逼着真正填内容。
 */
export function characterVisualDraftSkeleton(): CharacterVisualSpec {
  const base = emptyCharacterVisualSpec();
  return {
    ...base,
    wardrobe: CHARACTER_WARDROBE_SCENARIOS.map((scenario) => characterWardrobeLookTemplate(scenario.id)),
    expressions: CHARACTER_EXPRESSION_SLOTS.map((slot) => ({
      id: slot.id,
      label: slot.label,
      intensity: slot.id === 'neutral' ? 1 : 3,
      brow: '',
      gaze: '',
      mouth: slot.prompt,
      sceneUsage: '',
      imageUrl: ''
    })),
    shooting: {
      ...base.shooting,
      cameraAngles: ['正面平视', '四十五度侧面'],
      shotSizes: ['特写', '近景', '中景'],
      identityAnchors: ['脸型与骨相', '眉眼间距', '发际线与分缝', '肤色与色温'],
      driftBans: [...CHARACTER_DRIFT_BAN_PRESETS]
    }
  };
}

/** 按模板新建一套场景造型。模板只给标签和适用场景，具体穿什么必须由用户/模型填。 */
export function characterWardrobeLookTemplate(scenarioId: string): CharacterWardrobeLook {
  const scenario = CHARACTER_WARDROBE_SCENARIOS.find((item) => item.id === scenarioId);
  return {
    id: scenario?.id || scenarioId || 'look',
    label: scenario?.label || scenarioId || '新造型',
    sceneUsage: scenario?.sceneUsage || '',
    top: '', bottom: '', outerwear: '', shoes: '', accessories: '', hairChange: '', makeup: '',
    palette: [], silhouette: '', mustKeep: [], forbidden: [], imageUrl: ''
  };
}

/** 标准表情槽位。数据里没写的槽位也要出现在界面上，否则「缺哪个表情」根本看不出来。 */
export function characterExpressionSlots(spec: CharacterVisualSpec): CharacterExpressionShot[] {
  const stored = new Map(spec.expressions.map((item) => [item.id, item]));
  const canonical = CHARACTER_EXPRESSION_SLOTS.map((slot) => {
    const existing = stored.get(slot.id);
    stored.delete(slot.id);
    return existing || { id: slot.id, label: slot.label, intensity: 0, brow: '', gaze: '', mouth: '', sceneUsage: '', imageUrl: '' };
  });
  // 模型或用户自建的额外表情排在标准八格之后，不丢数据。
  return [...canonical, ...Array.from(stored.values())];
}

function normalizeWardrobeLook(value: unknown, index: number): CharacterWardrobeLook {
  const source = record(value);
  return {
    id: text(source.id) || `look_${index + 1}`,
    label: text(source.label) || `造型 ${index + 1}`,
    sceneUsage: text(source.sceneUsage),
    top: text(source.top),
    bottom: text(source.bottom),
    outerwear: text(source.outerwear),
    shoes: text(source.shoes),
    accessories: text(source.accessories),
    hairChange: text(source.hairChange),
    makeup: text(source.makeup),
    palette: textList(source.palette),
    silhouette: text(source.silhouette),
    mustKeep: textList(source.mustKeep),
    forbidden: textList(source.forbidden),
    imageUrl: text(source.imageUrl)
  };
}

function normalizeExpression(value: unknown, index: number): CharacterExpressionShot {
  const source = record(value);
  const id = text(source.id) || `expression_${index + 1}`;
  const slot = CHARACTER_EXPRESSION_SLOTS.find((item) => item.id === id);
  return {
    id,
    label: text(source.label) || slot?.label || id,
    intensity: intensity(source.intensity),
    brow: text(source.brow),
    gaze: text(source.gaze),
    mouth: text(source.mouth),
    sceneUsage: text(source.sceneUsage),
    imageUrl: text(source.imageUrl)
  };
}

export function normalizeCharacterVisualSpec(value: unknown): CharacterVisualSpec {
  const source = record(value);
  const identitySource = record(source.identity);
  const viewsSource = record(identitySource.views);
  const hairSource = record(source.hair);
  const shootingSource = record(source.shooting);
  const signatureSource = record(source.signature);
  const primaryColor = text(signatureSource.primaryColor);

  return {
    tagline: text(source.tagline),
    tags: textList(source.tags),
    reviewStatus: reviewStatus(source.reviewStatus),
    identity: {
      locked: identitySource.locked === true,
      gender: text(identitySource.gender),
      ethnicity: text(identitySource.ethnicity),
      faceShape: text(identitySource.faceShape),
      boneStructure: text(identitySource.boneStructure),
      forehead: text(identitySource.forehead),
      brow: text(identitySource.brow),
      eyes: text(identitySource.eyes),
      nose: text(identitySource.nose),
      lips: text(identitySource.lips),
      skinTone: text(identitySource.skinTone),
      height: text(identitySource.height),
      bodyType: text(identitySource.bodyType),
      posture: text(identitySource.posture),
      permanentMarks: text(identitySource.permanentMarks),
      views: {
        front: text(viewsSource.front),
        three_quarter: text(viewsSource.three_quarter),
        profile: text(viewsSource.profile),
        full_body: text(viewsSource.full_body)
      }
    },
    hair: {
      color: text(hairSource.color),
      length: text(hairSource.length),
      texture: text(hairSource.texture),
      volume: text(hairSource.volume),
      hairline: text(hairSource.hairline),
      part: text(hairSource.part),
      bangs: text(hairSource.bangs),
      baseStyle: text(hairSource.baseStyle),
      variableStyles: textList(hairSource.variableStyles),
      forbiddenStyles: textList(hairSource.forbiddenStyles)
    },
    wardrobe: Array.isArray(source.wardrobe) ? source.wardrobe.map(normalizeWardrobeLook) : [],
    expressions: Array.isArray(source.expressions) ? source.expressions.map(normalizeExpression) : [],
    shooting: {
      // 缺省是「允许」：老数据没有这两个字段，默认按限制处理会让所有旧角色突然不许露脸。
      allowFrontFace: shootingSource.allowFrontFace !== false,
      allowFullBody: shootingSource.allowFullBody !== false,
      voiceOnly: shootingSource.voiceOnly === true,
      cameraAngles: textList(shootingSource.cameraAngles),
      shotSizes: textList(shootingSource.shotSizes),
      identityAnchors: textList(shootingSource.identityAnchors),
      driftBans: textList(shootingSource.driftBans)
    },
    signature: {
      silhouette: text(signatureSource.silhouette),
      primaryColor,
      primaryColorHex: text(signatureSource.primaryColorHex) || characterPaletteSwatch(primaryColor).hex,
      props: textList(signatureSource.props),
      faceVisibilityRule: text(signatureSource.faceVisibilityRule)
    }
  };
}

export type CharacterCompletenessCheck = {
  group: CharacterSpecGroupId;
  label: string;
  done: boolean;
};

export type CharacterCompleteness = {
  done: number;
  total: number;
  /** 0–100 的整数百分比，方便直接显示。 */
  percent: number;
  missing: string[];
  checks: CharacterCompletenessCheck[];
  groups: Record<CharacterSpecGroupId, { done: number; total: number }>;
};

/**
 * 必填完成度。只统计「不填就没法做一致性审查」的字段，
 * 选填字段不计入分母——否则完成度永远到不了 100%，这个门槛就形同虚设。
 */
export function characterVisualCompleteness(spec: CharacterVisualSpec): CharacterCompleteness {
  const checks: CharacterCompletenessCheck[] = [];
  const add = (group: CharacterSpecGroupId, label: string, done: boolean) => checks.push({ group, label, done });

  for (const field of CHARACTER_IDENTITY_FIELDS.filter((item) => item.required)) {
    add('identity', field.label, Boolean((spec.identity as unknown as Record<string, string>)[field.key]?.trim()));
  }
  add('identity', '正脸参考图', Boolean(spec.identity.views.front));

  for (const field of CHARACTER_HAIR_FIELDS.filter((item) => item.required)) {
    add('hair', field.label, Boolean((spec.hair as unknown as Record<string, string>)[field.key]?.trim()));
  }
  add('hair', '禁止出现的发型', spec.hair.forbiddenStyles.length > 0);

  const usableLooks = spec.wardrobe.filter((look) => look.top && look.bottom && look.palette.length && look.sceneUsage);
  add('wardrobe', '至少 1 套完整场景造型', usableLooks.length >= 1);
  add('wardrobe', '至少 3 套场景造型', usableLooks.length >= 3);

  const slots = characterExpressionSlots(spec);
  const describedExpression = (item: CharacterExpressionShot) =>
    Boolean(item.intensity) && Boolean(item.brow || item.gaze || item.mouth);
  add('expressions', '中性表情已描述', slots.some((item) => item.id === 'neutral' && describedExpression(item)));
  add('expressions', '至少 4 个表情已描述', slots.filter(describedExpression).length >= 4);

  add('shooting', '可使用的拍摄角度', spec.shooting.cameraAngles.length > 0);
  add('shooting', '景别范围', spec.shooting.shotSizes.length > 0);
  add('shooting', '必须保持的身份锚点', spec.shooting.identityAnchors.length > 0);
  add('shooting', '禁止漂移项', spec.shooting.driftBans.length > 0);

  add('signature', '身材轮廓', Boolean(spec.signature.silhouette));
  add('signature', '主服装色', Boolean(spec.signature.primaryColor));
  add('signature', '标志性道具', spec.signature.props.length > 0);
  add('signature', '正脸/背影规则', Boolean(spec.signature.faceVisibilityRule));

  const groups = CHARACTER_SPEC_GROUPS.reduce((acc, group) => {
    const scoped = checks.filter((check) => check.group === group.id);
    acc[group.id] = { done: scoped.filter((check) => check.done).length, total: scoped.length };
    return acc;
  }, {} as Record<CharacterSpecGroupId, { done: number; total: number }>);

  const done = checks.filter((check) => check.done).length;
  return {
    done,
    total: checks.length,
    percent: checks.length ? Math.round((done / checks.length) * 100) : 0,
    missing: checks.filter((check) => !check.done).map((check) => check.label),
    checks,
    groups
  };
}

export type CharacterReviewState = {
  status: CharacterReviewStatus;
  label: string;
  actionLabel: string;
  completeness: CharacterCompleteness;
  canSubmitReview: boolean;
};

const REVIEW_STATUS_LABEL: Record<CharacterReviewStatus, string> = {
  draft: '待完善',
  ready_for_review: '待审查',
  confirmed: '已确认',
  needs_changes: '需修改'
};

/** 卡片上的操作按钮跟状态走。以前无论什么状态都写「审查」，已确认的角色也被反复点开。 */
const REVIEW_ACTION_LABEL: Record<CharacterReviewStatus, string> = {
  draft: '补充设定',
  ready_for_review: '开始审查',
  confirmed: '查看设定',
  needs_changes: '继续修改'
};

export function characterReviewStatusLabel(status: CharacterReviewStatus): string {
  return REVIEW_STATUS_LABEL[status];
}

/**
 * 角色当前的真实审查状态。
 *
 * 存起来的 reviewStatus 只是「用户点过什么」，不等于「现在是什么」：
 * 必填字段没填完就还是待完善，已确认之后又把字段清空了就退回需修改——
 * 状态必须描述数据的实际情况，否则「已确认」这三个字什么都不保证。
 */
export function characterReviewState(spec: CharacterVisualSpec): CharacterReviewState {
  const completeness = characterVisualCompleteness(spec);
  const complete = completeness.missing.length === 0;
  const stored = spec.reviewStatus;

  let status: CharacterReviewStatus;
  if (stored === 'confirmed') status = complete ? 'confirmed' : 'needs_changes';
  else if (stored === 'needs_changes') status = 'needs_changes';
  else if (!complete) status = 'draft';
  else status = 'ready_for_review';

  return {
    status,
    label: REVIEW_STATUS_LABEL[status],
    actionLabel: REVIEW_ACTION_LABEL[status],
    completeness,
    canSubmitReview: complete && status !== 'confirmed'
  };
}

export type CharacterMatrixRow = {
  id: string;
  name: string;
  role: string;
  faceShape: string;
  headAndHair: string;
  silhouette: string;
  primaryColor: string;
  primaryColorHex: string;
  props: string[];
  faceVisibilityRule: string;
};

type MatrixSourceCharacter = { id: string; name: string; role: string; visual: CharacterVisualSpec };

export function characterMatrixRow(character: MatrixSourceCharacter): CharacterMatrixRow {
  const { visual } = character;
  const headAndHair = [visual.hair.baseStyle, visual.hair.length, visual.hair.part]
    .map((item) => item.trim())
    .filter(Boolean)
    .join(' · ');
  const rule = visual.signature.faceVisibilityRule
    || (visual.shooting.voiceOnly
      ? '只有声音，不出镜'
      : visual.shooting.allowFrontFace ? '' : '不露正脸，只用背影和侧影');
  return {
    id: character.id,
    name: character.name,
    role: character.role,
    faceShape: visual.identity.faceShape,
    headAndHair,
    silhouette: visual.signature.silhouette || visual.identity.bodyType,
    primaryColor: visual.signature.primaryColor,
    primaryColorHex: visual.signature.primaryColorHex || characterPaletteSwatch(visual.signature.primaryColor).hex,
    props: visual.signature.props,
    faceVisibilityRule: rule
  };
}

export type CharacterMatrixConflict = {
  field: 'faceShape' | 'headAndHair' | 'silhouette' | 'primaryColor' | 'props';
  label: string;
  value: string;
  names: string[];
};

function conflictKey(value: string): string {
  return value.replace(/[\s·、,，.。/-]/g, '').toLowerCase();
}

/**
 * 找出「几个角色长得一样」的字段。
 *
 * 三个男配都穿灰色上衣、都用相似背影，在成片里就是同一个人反复出现。
 * 这类问题在单个角色的设定页里永远看不出来，只有把全员摆在一起对比才会暴露，
 * 所以矩阵不只是展示，它得直接把撞车的字段点出来。
 */
export function characterMatrixConflicts(rows: CharacterMatrixRow[]): CharacterMatrixConflict[] {
  const fields: Array<{ field: CharacterMatrixConflict['field']; label: string; pick: (row: CharacterMatrixRow) => string[] }> = [
    { field: 'faceShape', label: '脸型', pick: (row) => (row.faceShape ? [row.faceShape] : []) },
    { field: 'headAndHair', label: '头型与发型', pick: (row) => (row.headAndHair ? [row.headAndHair] : []) },
    { field: 'silhouette', label: '身材轮廓', pick: (row) => (row.silhouette ? [row.silhouette] : []) },
    { field: 'primaryColor', label: '主服装色', pick: (row) => (row.primaryColor ? [row.primaryColor] : []) },
    { field: 'props', label: '标志性道具', pick: (row) => row.props }
  ];

  const conflicts: CharacterMatrixConflict[] = [];
  for (const { field, label, pick } of fields) {
    const buckets = new Map<string, { value: string; names: string[] }>();
    for (const row of rows) {
      for (const raw of pick(row)) {
        const key = conflictKey(raw);
        if (!key) continue;
        const bucket = buckets.get(key) || { value: raw, names: [] };
        if (!bucket.names.includes(row.name)) bucket.names.push(row.name);
        buckets.set(key, bucket);
      }
    }
    for (const bucket of buckets.values()) {
      if (bucket.names.length > 1) conflicts.push({ field, label, value: bucket.value, names: bucket.names });
    }
  }
  return conflicts;
}

/**
 * 一行压缩版的视觉标识。场景图和镜头提示词里可能同时出现四五个角色，
 * 每人灌一整段设定会把提示词撑爆，这里只留下最能区分人的几项。
 */
/**
 * 人种取值，永远返回非空。
 *
 * 所有会进模型的地方都走这一个函数，而不是各自读 spec.identity.ethnicity ——
 * 只要有一处漏了兜底，那一处就会重新变成漂移的入口。
 */
export function characterEthnicityText(spec: CharacterVisualSpec): string {
  return spec.identity.ethnicity.trim() || DEFAULT_CHARACTER_ETHNICITY;
}

export function characterVisualBrief(spec: CharacterVisualSpec): string {
  const headAndHair = [spec.hair.baseStyle, spec.hair.part, spec.hair.bangs].filter(Boolean).join('、');
  return [
    // 压缩版里也必须留人种。这一行是场景图和多角色镜头唯一拿到的角色描述，
    // 省掉它等于在最容易出事的那一层（多人同框）把人种约束关掉。
    `人种：${characterEthnicityText(spec)}`,
    spec.identity.gender && `性别：${spec.identity.gender}`,
    spec.identity.faceShape && `脸型：${spec.identity.faceShape}`,
    headAndHair && `发型：${headAndHair}`,
    spec.signature.silhouette && `体态轮廓：${spec.signature.silhouette}`,
    spec.signature.primaryColor && `主服装色：${spec.signature.primaryColor}`,
    spec.signature.props.length && `标志性道具：${spec.signature.props.join('、')}`,
    spec.shooting.voiceOnly ? '不出镜' : spec.shooting.allowFrontFace ? '' : '不露正脸'
  ]
    .filter(Boolean)
    .join('；');
}

/**
 * 把视觉设定压成提示词行，供角色图和视频提示词复用。
 * 没填的字段直接不出现——宁可少一行，也不要写「未设定」去误导模型。
 */
export function characterVisualPromptLines(
  spec: CharacterVisualSpec,
  options: {
    lookId?: string;
    expressionId?: string;
    /**
     * 'identity_reference' = 四个身份参考位。它们是【设定板】，不是成片画面，
     * 所以不能带出镜约束：真实事故——「只用背影和侧影」这条被塞进正脸参考位的提示词，
     * 和「正对镜头的正脸半身照」直接打架，生成出来的「正脸」是一张背影。
     */
    purpose?: 'scene' | 'identity_reference';
  } = {}
): string[] {
  const lines: string[] = [];
  const identityReference = options.purpose === 'identity_reference';
  // 人种排在最前面，而且无条件出现（空值走缺省）。它是唯一一个「不写就会每次重掷」的字段：
  // 别的长相字段留空，模型跟着参考图走；人种留空，成片里同一个角色的脸就在中式和欧美之间来回切。
  lines.push(`人种与地域面孔：${characterEthnicityText(spec)}。这一条是身份锚点，任何镜头、任何阶段都不允许改变，也不要往混血或欧美长相上靠。`);
  // 性别紧随其后而且单独成句。剧本经常不写性别，一旦漏掉，
  // 图片模型会拿描述里出现的其他人名去猜——男配角的描述里出现女主角的名字，猜出来就是个女的。
  if (spec.identity.gender) lines.push(`性别：${spec.identity.gender}。这一条是身份锚点，任何镜头都不允许改变。`);
  const identity = [
    spec.identity.faceShape && `脸型：${spec.identity.faceShape}`,
    spec.identity.boneStructure && `骨相：${spec.identity.boneStructure}`,
    spec.identity.brow && `眉形：${spec.identity.brow}`,
    spec.identity.eyes && `眼型：${spec.identity.eyes}`,
    spec.identity.nose && `鼻型：${spec.identity.nose}`,
    spec.identity.lips && `唇形：${spec.identity.lips}`,
    spec.identity.skinTone && `肤色：${spec.identity.skinTone}`,
    spec.identity.height && `身高：${spec.identity.height}`,
    spec.identity.bodyType && `体型：${spec.identity.bodyType}`,
    spec.identity.posture && `肩颈体态：${spec.identity.posture}`,
    spec.identity.permanentMarks && `永久识别特征：${spec.identity.permanentMarks}`
  ].filter(Boolean);
  if (identity.length) lines.push(`固定身份特征（不可随场景改变）：${identity.join('；')}。`);

  const hair = [
    spec.hair.color && `发色：${spec.hair.color}`,
    spec.hair.length && `发长：${spec.hair.length}`,
    spec.hair.texture && `发质：${spec.hair.texture}`,
    spec.hair.volume && `发量：${spec.hair.volume}`,
    spec.hair.hairline && `发际线：${spec.hair.hairline}`,
    spec.hair.part && `分缝：${spec.hair.part}`,
    spec.hair.bangs && `刘海：${spec.hair.bangs}`,
    spec.hair.baseStyle && `基础发型：${spec.hair.baseStyle}`
  ].filter(Boolean);
  if (hair.length) lines.push(`头发设定：${hair.join('；')}。`);
  if (spec.hair.forbiddenStyles.length) lines.push(`禁止出现的发型：${spec.hair.forbiddenStyles.join('、')}。`);

  const look = options.lookId ? spec.wardrobe.find((item) => item.id === options.lookId) : undefined;
  if (look) {
    const parts = [
      look.top && `上装：${look.top}`,
      look.bottom && `下装：${look.bottom}`,
      look.outerwear && `外套：${look.outerwear}`,
      look.shoes && `鞋子：${look.shoes}`,
      look.accessories && `配饰：${look.accessories}`,
      look.hairChange && `发型变化：${look.hairChange}`,
      look.makeup && `妆容：${look.makeup}`,
      look.palette.length && `主色盘：${look.palette.join('、')}`,
      look.silhouette && `服装轮廓：${look.silhouette}`
    ].filter(Boolean);
    if (parts.length) lines.push(`本场造型「${look.label}」：${parts.join('；')}。`);
    if (look.mustKeep.length) lines.push(`本场必须保留：${look.mustKeep.join('、')}。`);
    if (look.forbidden.length) lines.push(`本场禁止出现：${look.forbidden.join('、')}。`);
  }

  const expression = options.expressionId
    ? characterExpressionSlots(spec).find((item) => item.id === options.expressionId)
    : undefined;
  if (expression) {
    const parts = [
      expression.intensity ? `强度 ${expression.intensity}/5` : '',
      expression.brow && `眉毛：${expression.brow}`,
      expression.gaze && `眼神：${expression.gaze}`,
      expression.mouth && `嘴部：${expression.mouth}`
    ].filter(Boolean);
    lines.push(`表情「${expression.label}」${parts.length ? `：${parts.join('；')}` : ''}。只改变表情，五官结构、发型和肤色保持不变。`);
  }

  const signature = [
    spec.signature.silhouette && `身材轮廓：${spec.signature.silhouette}`,
    spec.signature.primaryColor && `主服装色：${spec.signature.primaryColor}`,
    spec.signature.props.length && `标志性道具：${spec.signature.props.join('、')}`
  ].filter(Boolean);
  if (signature.length) lines.push(`辨识特征（用于和其他角色区分）：${signature.join('；')}。`);

  // 身份锚点和禁止漂移项两边都要；出镜规则只对成片画面有意义。
  if (spec.shooting.identityAnchors.length) lines.push(`必须保持的身份锚点：${spec.shooting.identityAnchors.join('、')}。`);
  if (spec.shooting.driftBans.length) lines.push(`禁止漂移：${spec.shooting.driftBans.join('、')}。`);

  if (!identityReference) {
    if (spec.shooting.voiceOnly) lines.push('这个角色只有声音，不要让他出现在画面里。');
    else {
      if (!spec.shooting.allowFrontFace) lines.push('不允许出现正脸，只用背影、侧影或过肩视角。');
      if (!spec.shooting.allowFullBody) lines.push('不允许全身出镜，保持半身及以上景别。');
    }
    if (spec.shooting.cameraAngles.length) lines.push(`可使用的拍摄角度：${spec.shooting.cameraAngles.join('、')}。`);
    if (spec.shooting.shotSizes.length) lines.push(`景别范围：${spec.shooting.shotSizes.join('、')}。`);
    if (spec.signature.faceVisibilityRule) lines.push(`正脸/背影规则：${spec.signature.faceVisibilityRule}。`);
  }

  return lines;
}
