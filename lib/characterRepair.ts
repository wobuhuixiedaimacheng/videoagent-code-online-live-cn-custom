/**
 * characters.json 的逐角色修补。
 *
 * 真实事故：脚本里写了「陈女士 28 岁职场女性 / 前任A 29 岁 / 现任B 30 岁」，
 * 模型也照着写出了三个角色，但其中一个漏了 faceIdStrategy 之类的字段，
 * 于是 hasCharacters 判定整份文件不合格，直接换成内置通用模板——
 * 主角变成「对这个主题感兴趣的目标观众…」，年龄档变成写死的儿童 8 岁 / 少年 16 岁，
 * 角色图照着这份模板生成出一个 8 岁小孩，和剧本完全无关。
 *
 * 全有全无是这里的病根：一个角色缺一个字段，另外两个写得再好也一起作废。
 * 所以这个模块只做一件事——把模型写对的部分留下，只补它漏掉的字段。
 *
 * 补的边界很清楚：
 *  - 可以补【策略类】字段：一致性提示词、Face ID 策略、表情范围、避免项。
 *    这些是流程要求的固定话术，不是关于「这个人是谁」的事实。
 *  - 不许编【事实类】内容：人名、身份、外貌、年龄。补不出来的角色宁可丢掉并报出来，
 *    也不能凭空发明一个人——那正是模板兜底干过的事。
 */

type JsonRecord = Record<string, unknown>;

/** 和 agentProvider 的 hasCharacters 一一对应的角色级必填字段。 */
const REQUIRED_CHARACTER_FIELDS = [
  'id', 'name', 'role', 'description', 'faceAnchorVariantId', 'referenceStrategy',
  'faceIdStrategy', 'consistencyPrompt', 'negativePrompt', 'expressionRange', 'imagePrompt'
] as const;

const REQUIRED_VARIANT_FIELDS = ['id', 'label', 'ageLabel', 'wardrobe', 'primaryImagePrompt'] as const;

const DEFAULT_EXPRESSION_IDS = [
  '喜悦', '愤怒', '悲伤', '恐惧', '惊讶', '厌恶', '害羞', '紧张', '疑惑', '尴尬', '期待', '平静'
];

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function list(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}

/** 从人物描述里取出「28岁」这类年龄。取不到就返回空——绝不猜一个年龄档出来。 */
export function ageLabelFromText(...sources: string[]): string {
  for (const source of sources) {
    const match = source.match(/(\d{1,2})\s*(?:岁|周岁)/);
    if (match) return `${match[1]} 岁`;
  }
  return '';
}

function slugId(name: string, index: number): string {
  // 中文名没法转成有意义的英文 id，用稳定序号即可；重要的是同一份文件内唯一且稳定。
  return `role_${String(index + 1).padStart(2, '0')}`;
}

export type CharacterContractIssue = { character: string; field: string };

/**
 * 逐条列出哪个角色缺哪个字段。用于告诉用户「模型到底漏了什么」，
 * 而不是只丢一句「结构校验未通过」让人去猜。
 */
export function characterContractIssues(value: unknown): CharacterContractIssue[] {
  const root = isRecord(value) ? value : {};
  const characters = Array.isArray(root.characters) ? root.characters : [];
  const issues: CharacterContractIssue[] = [];

  characters.forEach((entry, index) => {
    if (!isRecord(entry)) {
      issues.push({ character: `第 ${index + 1} 个角色`, field: '整个对象不是合法结构' });
      return;
    }
    const label = text(entry.name) || `第 ${index + 1} 个角色`;
    for (const field of REQUIRED_CHARACTER_FIELDS) {
      if (!text(entry[field])) issues.push({ character: label, field });
    }
    if (typeof entry.required !== 'boolean') issues.push({ character: label, field: 'required' });
    if (!list(entry.expressionIds).length) issues.push({ character: label, field: 'expressionIds' });

    const variants = Array.isArray(entry.variants) ? entry.variants : [];
    if (!variants.length) {
      issues.push({ character: label, field: 'variants（一个变体都没有）' });
      return;
    }
    variants.forEach((variant, variantIndex) => {
      if (!isRecord(variant)) {
        issues.push({ character: label, field: `变体 ${variantIndex + 1} 不是合法结构` });
        return;
      }
      for (const field of REQUIRED_VARIANT_FIELDS) {
        if (!text(variant[field])) {
          issues.push({ character: label, field: `变体「${text(variant.label) || variantIndex + 1}」的 ${field}` });
        }
      }
    });
  });

  if (!characters.length) issues.push({ character: '整份文件', field: 'characters 数组为空' });
  else if (!characters.some((entry) => isRecord(entry) && entry.required === true)) {
    issues.push({ character: '整份文件', field: '没有任何一个必需角色（required: true）' });
  }
  return issues;
}

export function describeCharacterIssues(issues: CharacterContractIssue[], limit = 6): string {
  if (!issues.length) return '';
  const shown = issues.slice(0, limit).map((issue) => `${issue.character} 缺 ${issue.field}`);
  const rest = issues.length - shown.length;
  return shown.join('；') + (rest > 0 ? `；另有 ${rest} 处` : '');
}

export type CharacterRepairResult = {
  content: string;
  /** 补齐了哪些字段，给用户核对用。 */
  filled: CharacterContractIssue[];
  /** 名字都没有、无法认定是谁的角色会被丢掉，必须说出来。 */
  dropped: number;
};

/**
 * 把模型产出里能用的部分留下，只补缺的字段。
 *
 * 返回 null 表示这份产出救不回来（解析不了、没有 characters 数组、或者一个有名字的角色都没有）——
 * 那种情况才轮到内置模板兜底。
 */
export function repairCharactersContent(rawContent: string): CharacterRepairResult | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.characters)) return null;

  const filled: CharacterContractIssue[] = [];
  const note = (character: string, field: string) => filled.push({ character, field });

  const source = parsed.characters.filter(isRecord);
  // 人名是「这个人是谁」的事实，补不出来。没有名字的角色直接丢掉并报数。
  const named = source.filter((entry) => text(entry.name));
  const dropped = parsed.characters.length - named.length;
  if (!named.length) return null;

  const usedIds = new Set<string>();
  const characters = named.map((entry, index) => {
    const name = text(entry.name);
    let id = text(entry.id);
    if (!id || usedIds.has(id)) {
      id = slugId(name, index);
      note(name, 'id');
    }
    usedIds.add(id);

    const role = text(entry.role) || (index === 0 ? '主角' : '配角');
    if (!text(entry.role)) note(name, 'role');

    const description = text(entry.description) || text(entry.appearance) || `${name}（${role}）`;
    if (!text(entry.description)) note(name, 'description');

    // 年龄从模型自己写的描述里抠，抠不到就写「按剧本设定」——绝不套用写死的年龄档。
    const age = ageLabelFromText(description, text(entry.appearance), name);

    const rawVariants = (Array.isArray(entry.variants) ? entry.variants : []).filter(isRecord);
    const variantSource = rawVariants.length ? rawVariants : [{}];
    if (!rawVariants.length) note(name, 'variants');

    const usedVariantIds = new Set<string>();
    const variants = variantSource.map((variant, variantIndex) => {
      let variantId = text(variant.id);
      if (!variantId || usedVariantIds.has(variantId)) variantId = `v${variantIndex + 1}`;
      usedVariantIds.add(variantId);
      const label = text(variant.label) || '本片形象';
      const ageLabel = text(variant.ageLabel) || age || '按剧本设定';
      const wardrobe = text(variant.wardrobe) || '按剧本设定的日常服装';
      const primaryImagePrompt = text(variant.primaryImagePrompt) ||
        `${name}，${role}，${description}，${ageLabel}，${wardrobe}，正面半身主图，自然光，真实生活场景，保留稳定五官特征。`;
      if (!text(variant.ageLabel)) note(name, `变体「${label}」的 ageLabel`);
      if (!text(variant.primaryImagePrompt)) note(name, `变体「${label}」的 primaryImagePrompt`);
      return {
        ...variant,
        id: variantId,
        label,
        ageLabel,
        wardrobe,
        primaryImagePrompt,
        primaryImageUrl: text(variant.primaryImageUrl)
      };
    });

    const faceAnchorVariantId = variants.some((variant) => variant.id === text(entry.faceAnchorVariantId))
      ? text(entry.faceAnchorVariantId)
      : variants[variants.length - 1].id;
    if (faceAnchorVariantId !== text(entry.faceAnchorVariantId)) note(name, 'faceAnchorVariantId');

    const referenceStrategy = ['face_id', 'multi_view', 'replace_reference'].includes(text(entry.referenceStrategy))
      ? text(entry.referenceStrategy)
      : 'face_id';
    if (referenceStrategy !== text(entry.referenceStrategy)) note(name, 'referenceStrategy');

    const expressionIds = list(entry.expressionIds).length ? list(entry.expressionIds) : DEFAULT_EXPRESSION_IDS;
    if (!list(entry.expressionIds).length) note(name, 'expressionIds');

    const faceIdStrategy = text(entry.faceIdStrategy) ||
      '先确认主图的 Face ID，再把同一张脸复用到全部变体和镜头。';
    if (!text(entry.faceIdStrategy)) note(name, 'faceIdStrategy');

    const expressionRange = text(entry.expressionRange) ||
      `${expressionIds.join('、')}；保持克制、可审查，不使用夸张表情。`;
    if (!text(entry.expressionRange)) note(name, 'expressionRange');

    const consistencyPrompt = text(entry.consistencyPrompt) ||
      `${name} 在不同场景和镜头中保持脸型、五官、发型、发际线、肤色、体态和眼神特征一致；只允许服装随场景切换。`;
    if (!text(entry.consistencyPrompt)) note(name, 'consistencyPrompt');

    const imagePrompt = text(entry.imagePrompt) ||
      `${name}，${role}，${description}，真实手机短视频人物主图，中文可审查描述，避免商业海报感。`;
    if (!text(entry.imagePrompt)) note(name, 'imagePrompt');

    const negativePrompt = text(entry.negativePrompt) ||
      '不要换脸、不要五官漂移、不要畸形手指、不要多余肢体、不要不可读文字、不要未授权名人肖像。';
    if (!text(entry.negativePrompt)) note(name, 'negativePrompt');

    return {
      ...entry,
      id,
      name,
      role,
      required: entry.required === true,
      description,
      faceAnchorVariantId,
      referenceStrategy,
      faceIdStrategy,
      expressionIds,
      expressionRange,
      consistencyPrompt,
      imagePrompt,
      negativePrompt,
      variants
    };
  });

  // 一个必需角色都没有时，把第一个提成主角：下游 validateStageAssets 卡这一条。
  if (!characters.some((character) => character.required)) {
    characters[0].required = true;
    note(text(characters[0].name), 'required');
  }

  return {
    content: JSON.stringify({ ...parsed, characters }, null, 2),
    filled,
    dropped
  };
}
