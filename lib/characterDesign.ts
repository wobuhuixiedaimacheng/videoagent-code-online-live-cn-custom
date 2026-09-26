import { DEFAULT_CHARACTER_ETHNICITY } from './characterVisualSpec';

export type CharacterStageId = 'kindergarten' | 'primary' | 'middle' | 'high' | 'college' | 'base';

export type CharacterReferenceVariant = {
  id: CharacterStageId;
  label: string;
  ageLabel: string;
  wardrobe: string;
  imageUrl: string;
  sceneIds: string[];
};

type PromptLike = {
  id?: string;
  sceneId?: string;
  renderTask?: string;
  prompt?: string;
  referenceImageUrl?: string;
  referenceImages?: string[];
  [key: string]: unknown;
};

type QueueLike = {
  sceneId?: string;
  referenceImageUrl?: string;
  referenceImages?: string[];
  [key: string]: unknown;
};

export type CharacterPromptPackage = {
  prompts?: PromptLike[];
  renderQueue?: QueueLike[];
  [key: string]: unknown;
};

type CharacterDesignPromptInput = {
  characterName: string;
  role: string;
  description: string;
  consistency: string;
  negativePrompt?: string;
  stage: Pick<CharacterReferenceVariant, 'id' | 'label' | 'ageLabel' | 'wardrobe'>;
  /**
   * 人种与地域面孔。缺省是中国面孔——这句话以前是写死在提示词里的一个词，
   * 只影响定妆照这一张图，场景图和视频提示词完全拿不到，人种于是在下游被重掷。
   * 现在它是一个可传入的字段，和 characterVisualSpec 的身份锚点是同一个值。
   */
  ethnicity?: string;
  expressionPrompts?: string[];
  adjustment?: string;
  outputKind?: 'portrait' | 'multi_view' | 'expression_sheet';
  /**
   * 视觉设定画板压出来的提示词行（身份锚点、头发、造型、出镜约束）。
   * 传空数组等于沿用旧口径，所以老调用点不需要改。
   */
  visualLines?: string[];
  /** 覆盖默认的产出说明，用于四个固定参考位这种更具体的出图要求。 */
  outputInstructionOverride?: string;
};

export const CHARACTER_STAGE_DEFINITIONS: Array<Omit<CharacterReferenceVariant, 'imageUrl' | 'sceneIds'>> = [
  { id: 'kindergarten', label: '幼儿园', ageLabel: '5 岁', wardrobe: '幼儿园日常服装和红色书包' },
  { id: 'primary', label: '小学', ageLabel: '10 岁', wardrobe: '小学校服和红色铅笔盒' },
  { id: 'middle', label: '初中', ageLabel: '14 岁', wardrobe: '蓝白初中校服和红色水杯' },
  { id: 'high', label: '高中', ageLabel: '17 岁', wardrobe: '蓝白高中校服和红色笔记本' },
  { id: 'college', label: '大学', ageLabel: '21 岁', wardrobe: '干净大学生便装和红色帆布包' }
];

export const BASE_CHARACTER_VARIANT: CharacterReferenceVariant = {
  id: 'base',
  label: '角色主图',
  ageLabel: '年龄待确认',
  wardrobe: '服装按角色设定',
  imageUrl: '',
  sceneIds: []
};

export function characterStageIdFromText(value: string): CharacterStageId | undefined {
  const text = value.trim();
  if (!text) return undefined;
  return CHARACTER_STAGE_DEFINITIONS.find((stage) => text.includes(stage.label))?.id;
}

function firstReferenceImage(prompt: PromptLike) {
  if (prompt.referenceImageUrl?.trim()) return prompt.referenceImageUrl.trim();
  return (prompt.referenceImages || []).find((item) => item?.trim())?.trim() || '';
}

function characterStageIdForPrompt(prompt: PromptLike) {
  const taskStage = characterStageIdFromText(prompt.renderTask || '');
  if (taskStage) return taskStage;
  const promptLead = (prompt.prompt || '').split('\n').slice(0, 2).join(' ');
  return characterStageIdFromText(promptLead);
}

export function characterReferenceVariantsFromPrompts(prompts: CharacterPromptPackage): CharacterReferenceVariant[] {
  const collected = new Map<CharacterStageId, CharacterReferenceVariant>();

  for (const prompt of prompts.prompts || []) {
    const stageId = characterStageIdForPrompt(prompt);
    const imageUrl = firstReferenceImage(prompt);
    if (!stageId || !imageUrl) continue;
    const definition = CHARACTER_STAGE_DEFINITIONS.find((item) => item.id === stageId);
    if (!definition) continue;

    const sceneId = prompt.sceneId || prompt.id || '';
    const current = collected.get(stageId);
    if (current) {
      if (sceneId && !current.sceneIds.includes(sceneId)) current.sceneIds.push(sceneId);
      continue;
    }

    collected.set(stageId, {
      ...definition,
      imageUrl,
      sceneIds: sceneId ? [sceneId] : []
    });
  }

  return CHARACTER_STAGE_DEFINITIONS.flatMap((definition) => {
    const variant = collected.get(definition.id);
    return variant ? [variant] : [];
  });
}

export function replaceCharacterStageReference<T extends CharacterPromptPackage>(
  prompts: T,
  stageId: CharacterStageId,
  imageUrl: string
): T {
  const nextPrompts = (prompts.prompts || []).map((prompt) => {
    const promptStage = characterStageIdForPrompt(prompt);
    if (promptStage !== stageId) return { ...prompt };
    return {
      ...prompt,
      referenceImageUrl: imageUrl,
      referenceImages: undefined
    };
  });
  const affectedSceneIds = new Set(
    nextPrompts
      .filter((prompt) => characterStageIdForPrompt(prompt) === stageId)
      .map((prompt) => prompt.sceneId || prompt.id || '')
      .filter(Boolean)
  );
  const nextQueue = (prompts.renderQueue || []).map((entry) =>
    entry.sceneId && affectedSceneIds.has(entry.sceneId)
      ? { ...entry, referenceImageUrl: imageUrl, referenceImages: undefined, status: 'ready_with_reference' }
      : { ...entry }
  );

  return {
    ...prompts,
    prompts: nextPrompts,
    renderQueue: nextQueue
  } as T;
}

function sanitizeImagePromptSafetyText(value?: string) {
  if (!value?.trim()) return '';
  const policySensitive = /亲吻|拥抱|性暗示|成人化|色情|裸体|未成年人|儿童/;
  return value
    .split(/(?<=[。！？；;])|[,，]/)
    .map((item) => item.trim())
    .filter((item) => item && !policySensitive.test(item))
    .join('，')
    .replace(/[，,]+$/, '');
}

export function buildCharacterDesignPrompt(input: CharacterDesignPromptInput) {
  const outputKind = input.outputKind || 'portrait';
  const outputInstruction = input.outputInstructionOverride?.trim() ||
    (outputKind === 'multi_view'
      ? '生成同一角色多视角设定板：正面、四十五度、侧面和背面，全身比例一致，所有视角必须是同一个人。'
      : outputKind === 'expression_sheet'
        ? `生成同一角色表情板，每格保持同一张脸，只改变表情。表情范围：${(input.expressionPrompts || []).join('；') || '自然微笑、紧张、惊讶、尴尬'}。`
        : '生成真人实拍角色定妆照，竖版三比四，清晰正脸、半身到全身，站姿自然，方便作为后续视频 Face ID 和首帧参考。');

  const ethnicity = input.ethnicity?.trim() || DEFAULT_CHARACTER_ETHNICITY;
  // visualLines 来自 characterVisualPromptLines，它自己就会写人种。
  // 两边都写会在同一条提示词里出现两句一模一样的话，所以这里只在没人写过时补上——
  // 但一定要补：走这个分支的调用点（角色主图、多视角、表情板）恰恰是没传 visualLines 的那几个。
  const ethnicityLine = (input.visualLines || []).some((line) => line.includes('人种'))
    ? ''
    : `人种与地域面孔：${ethnicity}。这一条是身份锚点，不允许改变，也不要往混血或欧美长相上靠。`;

  return [
    `真人实拍角色定妆照。角色：${input.characterName}，身份：${input.role}。`,
    ethnicityLine,
    `当前阶段：${input.stage.label}，年龄：${input.stage.ageLabel}，服装和贯穿物件：${input.stage.wardrobe}。`,
    `人物描述：${input.description}。`,
    `身份一致性：${sanitizeImagePromptSafetyText(input.consistency)}。必须保留同一人的脸型、眉眼、鼻型、嘴型、发际线、肤色和辨识特征，只允许年龄、身高和服装随阶段自然变化。`,
    ...(input.visualLines || []).filter((line) => Boolean(line?.trim())),
    outputInstruction,
    input.expressionPrompts?.length ? `允许的表情控制：${input.expressionPrompts.join('；')}。` : '',
    input.adjustment?.trim() ? `用户补充调整：${input.adjustment.trim()}。` : '',
    // 「仅用于普通校园角色设计」是小澎那部校园片留下的写死文案，
    // 到了职场剧、家庭剧里它既不成立也会把画风往学生气上带，换成中性表述。
    // 人种已经在上面单独成句了，这里不再重复写死「中国人」——写死会盖掉外籍/混血角色的设定。
    '真实皮肤纹理，自然光，比例正常，干净背景，人物完整无遮挡。人物状态健康、自然、符合真实年龄，仅用于常规影视角色设定。',
    // 参考位和定妆照都只要一个人。真实事故：「现任」的正脸参考位生成出并排两个人，
    // 这种图当身份锚点会直接把后面每个镜头的脸带偏。
    outputKind === 'expression_sheet' ? '' : '画面中只能出现这一个人物，不要出现第二个人、不要并排多人、不要镜像分身。',
    '禁止动画、二次元、卡通、玩偶、三维渲染、换脸、多人拼脸、畸形手指和夸张滤镜。',
    sanitizeImagePromptSafetyText(input.negativePrompt) ? `额外避免：${sanitizeImagePromptSafetyText(input.negativePrompt)}。` : '',
    '画面不要生成任何可读文字，不要英文、拼音、字幕、水印、标志或乱码。'
  ]
    .filter(Boolean)
    .join('\n');
}

export function characterImageErrorText(value: unknown) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (/content_policy_violation|unable to generate this content/i.test(text)) {
    return '图片模型拒绝了当前描述。系统已去掉容易误触审核的词，请重新生成。';
  }
  if (/IMAGE_API_KEY|图片模型.*配置/i.test(text)) {
    return '图片模型尚未配置，请先在模型设置中填写图片模型连接。';
  }
  return text || '角色图生成失败，请稍后重试。';
}
