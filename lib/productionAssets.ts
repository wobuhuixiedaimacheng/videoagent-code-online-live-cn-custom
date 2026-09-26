import { buildCharacterDesignPrompt, type CharacterStageId } from './characterDesign';
import { checkStoryboardContinuity } from './shotContinuity';
import {
  CHARACTER_VIEW_ANGLES,
  characterEthnicityText,
  characterVisualBrief,
  characterVisualPromptLines,
  normalizeCharacterVisualSpec,
  type CharacterViewAngleId,
  type CharacterVisualSpec
} from './characterVisualSpec';
import {
  buildSceneViewPrompt,
  checkSceneContinuity,
  checkSceneLightingAgainstMaster,
  deriveSceneMasters,
  normalizeSceneInstance,
  normalizeSceneMaster,
  normalizeSceneShot,
  sceneConsistencyPromptLines,
  sceneInstancePromptLines,
  sceneMasterPromptLines,
  sceneShotPromptLines,
  SCENE_VIEW_SLOTS,
  type SceneContinuityIssue,
  type SceneMaster,
  type SceneViewId
} from './sceneVisualSpec';
import type {
  CharacterAsset,
  CharacterVariantAsset,
  CharactersFile,
  ProductionStageId,
  SceneAsset,
  WorkspaceFile,
  WorkspaceSnapshot
} from './types';

type JsonRecord = Record<string, unknown>;

type JsonFileState =
  | { status: 'missing' }
  | { status: 'invalid'; file: WorkspaceFile }
  | { status: 'valid'; file: WorkspaceFile; value: JsonRecord };

type LegacyPrompt = {
  id?: string;
  sceneId?: string;
  renderTask?: string;
  prompt?: string;
  referenceImageUrl?: string;
  referenceImages?: unknown;
};

type StageDefinition = Pick<CharacterVariantAsset, 'id' | 'label' | 'ageLabel' | 'wardrobe'>;

export type StageImageJob = {
  /** 'shot' = 单个镜头自己的首帧图，assetId 是 storyboard.json 里的镜头 id。 */
  stage: 'character' | 'scene' | 'shot';
  assetId: string;
  variantId?: string;
  kind?: 'portrait' | 'multi_view' | 'expression_sheet';
  /**
   * 填了就表示这张图是场景【母版】的某个机位参考图，assetId 是母版 id 而不是场次 id。
   * 母版图和场次主图必须分开写：写串了会让八个机位覆盖掉某一场的主图。
   */
  viewId?: SceneViewId;
  /** 填了就表示这张图是角色的【身份参考位】，写进 visual.identity.views 而不是变体主图。 */
  identityViewId?: CharacterViewAngleId;
  prompt: string;
  negativePrompt: string;
  /** 多视角要以已生成的主图为参考，否则四个视角会是四张不同的脸。 */
  referenceImages?: string[];
};

const CHARACTER_VARIANTS: StageDefinition[] = [
  { id: 'kindergarten', label: '幼儿园', ageLabel: '5 岁', wardrobe: '幼儿园日常服装和红色书包' },
  { id: 'primary', label: '小学', ageLabel: '10 岁', wardrobe: '小学校服和红色铅笔盒' },
  { id: 'middle', label: '初中', ageLabel: '14 岁', wardrobe: '蓝白初中校服和红色水杯' },
  { id: 'high', label: '高中', ageLabel: '17 岁', wardrobe: '蓝白高中校服和红色笔记本' },
  { id: 'college', label: '大学', ageLabel: '21 岁', wardrobe: '干净大学生便装和红色帆布包' }
];

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(stringValue).filter(Boolean) : [];
}

const CANONICAL_EXPRESSION_IDS = new Set([
  'joy', 'anger', 'sadness', 'fear', 'surprise', 'disgust', 'shy', 'nervous', 'confused', 'awkward', 'expectant', 'calm'
]);

const EXPRESSION_ID_ALIASES: Record<string, string> = {
  joy: 'joy', '喜悦': 'joy', '开心': 'joy', '高兴': 'joy',
  anger: 'anger', '愤怒': 'anger', '生气': 'anger',
  sadness: 'sadness', '悲伤': 'sadness', '难过': 'sadness',
  fear: 'fear', '恐惧': 'fear', '害怕': 'fear',
  surprise: 'surprise', '惊讶': 'surprise',
  disgust: 'disgust', '厌恶': 'disgust',
  shy: 'shy', '害羞': 'shy',
  nervous: 'nervous', '紧张': 'nervous',
  confused: 'confused', '疑惑': 'confused', '困惑': 'confused',
  awkward: 'awkward', '尴尬': 'awkward',
  expectant: 'expectant', '期待': 'expectant', '期盼': 'expectant',
  calm: 'calm', '平静': 'calm', '冷静': 'calm'
};

function canonicalExpressionIds(value: unknown): string[] {
  const canonical = stringList(value).map((item) => {
    const normalized = item.trim().toLowerCase();
    return EXPRESSION_ID_ALIASES[normalized] || (CANONICAL_EXPRESSION_IDS.has(normalized) ? normalized : '');
  }).filter(Boolean);
  return [...new Set(canonical)];
}

function jsonFileState(workspace: WorkspaceSnapshot | null, path: string): JsonFileState {
  const file = workspace?.files.find((item) => item.path === path);
  if (!file) return { status: 'missing' };
  try {
    const parsed: unknown = JSON.parse(file.content);
    return isRecord(parsed) ? { status: 'valid', file, value: parsed } : { status: 'invalid', file };
  } catch {
    return { status: 'invalid', file };
  }
}

function sameJson(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((item, index) => sameJson(item, right[index]));
  }
  if (isRecord(left) || isRecord(right)) {
    if (!isRecord(left) || !isRecord(right)) return false;
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return leftKeys.length === rightKeys.length && leftKeys.every((key, index) => key === rightKeys[index] && sameJson(left[key], right[key]));
  }
  return false;
}

function writeJsonFile(workspace: WorkspaceSnapshot, path: string, content: JsonRecord): WorkspaceSnapshot {
  const current = jsonFileState(workspace, path);
  if (current.status === 'valid' && sameJson(current.value, content)) return workspace;
  if (current.status === 'invalid') return workspace;

  const existing = current.status === 'missing' ? undefined : current.file;
  const nextFile: WorkspaceFile = {
    path,
    kind: 'json',
    content: JSON.stringify(content, null, 2),
    version: (existing?.version || 0) + 1,
    updatedAt: new Date().toISOString()
  };
  const index = workspace.files.findIndex((item) => item.path === path);
  const files = [...workspace.files];
  if (index >= 0) files[index] = nextFile;
  else files.push(nextFile);
  return { ...workspace, files };
}

function firstReferenceImage(value: LegacyPrompt): string {
  const direct = stringValue(value.referenceImageUrl);
  if (direct) return direct;
  return stringList(value.referenceImages)[0] || '';
}

function stageIdForPrompt(prompt: LegacyPrompt): string {
  const renderTask = stringValue(prompt.renderTask);
  const taskStage = CHARACTER_VARIANTS.find((stage) => renderTask.includes(stage.label))?.id;
  if (taskStage) return taskStage;
  const promptLead = stringValue(prompt.prompt).split('\n').slice(0, 2).join(' ');
  return CHARACTER_VARIANTS.find((stage) => promptLead.includes(stage.label))?.id || '';
}

function legacyPrompts(value: JsonRecord | null): LegacyPrompt[] {
  return Array.isArray(value?.prompts) ? value.prompts.filter(isRecord) as LegacyPrompt[] : [];
}

function legacyQueue(value: JsonRecord | null): LegacyPrompt[] {
  return Array.isArray(value?.renderQueue) ? value.renderQueue.filter(isRecord) as LegacyPrompt[] : [];
}

function referencesByScene(value: JsonRecord | null): Map<string, string> {
  const references = new Map<string, string>();
  for (const item of [...legacyPrompts(value), ...legacyQueue(value)]) {
    const sceneId = stringValue(item.sceneId) || stringValue(item.id);
    const imageUrl = firstReferenceImage(item);
    if (sceneId && imageUrl && !references.has(sceneId)) references.set(sceneId, imageUrl);
  }
  return references;
}

function referencesByStage(value: JsonRecord | null): Map<string, string> {
  const references = new Map<string, string>();
  for (const item of [...legacyPrompts(value), ...legacyQueue(value)]) {
    const stageId = stageIdForPrompt(item);
    const imageUrl = firstReferenceImage(item);
    if (stageId && imageUrl && !references.has(stageId)) references.set(stageId, imageUrl);
  }
  return references;
}

function characterVariants(references: Map<string, string>): CharacterVariantAsset[] {
  return CHARACTER_VARIANTS.map((stage) => ({ ...stage, primaryImageUrl: references.get(stage.id) || '' }));
}

function normalizedName(value: unknown): string {
  return stringValue(value).replace(/\s+/g, ' ').toLowerCase();
}

function missingLegacyField(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === 'string' && !value.trim()) || (Array.isArray(value) && value.length === 0);
}

function legacyRecordCompleteness(character: JsonRecord): number {
  return Object.values(character).filter((value) => !missingLegacyField(value)).length;
}

function mergeLegacyCharacters(existing: JsonRecord, candidate: JsonRecord): JsonRecord {
  const existingHasId = Boolean(stringValue(existing.id));
  const candidateHasId = Boolean(stringValue(candidate.id));
  const candidateIsPreferred = candidateHasId !== existingHasId
    ? candidateHasId
    : legacyRecordCompleteness(candidate) > legacyRecordCompleteness(existing);
  const preferred = candidateIsPreferred ? candidate : existing;
  const fallback = candidateIsPreferred ? existing : candidate;
  const merged: JsonRecord = {};
  for (const key of new Set([...Object.keys(fallback), ...Object.keys(preferred)])) {
    merged[key] = missingLegacyField(preferred[key]) ? fallback[key] : preferred[key];
  }
  return merged;
}

function legacyCharacters(value: JsonRecord | null): JsonRecord[] {
  const candidates = [
    ...(Array.isArray(value?.characters) ? value.characters.filter(isRecord) : []),
    ...(Array.isArray(value?.roles) ? value.roles.filter(isRecord) : [])
  ];
  const merged: JsonRecord[] = [];
  const idIndexes = new Map<string, number>();
  const nameIndexes = new Map<string, number>();

  for (const character of candidates) {
    const id = stringValue(character.id);
    const name = normalizedName(character.name);
    let index = id ? idIndexes.get(id) : undefined;
    if (index === undefined && name) {
      const nameIndex = nameIndexes.get(name);
      if (nameIndex !== undefined) {
        const existingHasId = Boolean(stringValue(merged[nameIndex].id));
        if (!id || !existingHasId) index = nameIndex;
      }
    }

    if (index === undefined) {
      index = merged.length;
      merged.push({ ...character });
    } else {
      merged[index] = mergeLegacyCharacters(merged[index], character);
    }

    const mergedId = stringValue(merged[index].id);
    const mergedName = normalizedName(merged[index].name);
    if (mergedId) idIndexes.set(mergedId, index);
    if (mergedName && !nameIndexes.has(mergedName)) nameIndexes.set(mergedName, index);
  }

  return merged;
}

function hasPrimaryMarker(character: JsonRecord): boolean {
  return character.required === true || character.primary === true || character.isPrimary === true ||
    character.protagonist === true || stringValue(character.role).includes('主角');
}

function legacyCharacterAssets(value: JsonRecord | null): CharacterAsset[] {
  const sourceCharacters = legacyCharacters(value);
  const consistency = isRecord(value?.characterConsistency) ? value.characterConsistency : {};
  const primarySubject = normalizedName(consistency.primarySubject);
  const primaryIndex = primarySubject
    ? sourceCharacters.findIndex((character) => normalizedName(character.name) === primarySubject || normalizedName(character.id) === primarySubject)
    : -1;
  const markedPrimaryIndex = sourceCharacters.findIndex(hasPrimaryMarker);
  const selectedPrimaryIndex = primaryIndex >= 0 ? primaryIndex : markedPrimaryIndex >= 0 ? markedPrimaryIndex : 0;
  const stageReferences = referencesByStage(value);

  return sourceCharacters.map((source, index) => {
    const name = stringValue(source.name) || `角色 ${index + 1}`;
    const description = stringValue(source.description) || stringValue(source.appearance);
    const consistencyPrompt = stringValue(source.consistencyPrompt) || stringValue(consistency.consistencyPrompt);
    const negativePrompt = stringValue(source.negativePrompt) || stringValue(consistency.negativePrompt);

    return {
      id: stringValue(source.id) || `character-${index + 1}`,
      name,
      role: stringValue(source.role),
      required: index === selectedPrimaryIndex,
      description,
      consistencyPrompt,
      negativePrompt,
      faceAnchorVariantId: 'college',
      referenceStrategy: 'face_id',
      expressionIds: [],
      variants: index === selectedPrimaryIndex ? characterVariants(stageReferences) : [],
      visual: normalizeCharacterVisualSpec(source.visual)
    };
  });
}

function normalizedCharacters(value: JsonRecord | null): CharacterAsset[] {
  if (!Array.isArray(value?.characters)) return [];
  return value.characters.filter(isRecord).map((character) => ({
    id: stringValue(character.id),
    name: stringValue(character.name),
    ...(stringValue(character.scriptAlias) ? { scriptAlias: stringValue(character.scriptAlias) } : {}),
    role: stringValue(character.role),
    required: character.required === true,
    description: stringValue(character.description),
    consistencyPrompt: stringValue(character.consistencyPrompt),
    negativePrompt: stringValue(character.negativePrompt),
    faceAnchorVariantId: stringValue(character.faceAnchorVariantId),
    referenceStrategy: character.referenceStrategy === 'multi_view' || character.referenceStrategy === 'replace_reference'
      ? character.referenceStrategy
      : 'face_id',
    expressionIds: canonicalExpressionIds(character.expressionIds),
    variants: Array.isArray(character.variants) ? character.variants.filter(isRecord).map((variant) => ({
      id: stringValue(variant.id),
      label: stringValue(variant.label),
      ageLabel: stringValue(variant.ageLabel),
      wardrobe: stringValue(variant.wardrobe),
      primaryImageUrl: stringValue(variant.primaryImageUrl),
      ...(stringValue(variant.multiViewImageUrl) ? { multiViewImageUrl: stringValue(variant.multiViewImageUrl) } : {}),
      ...(stringValue(variant.expressionSheetImageUrl) ? { expressionSheetImageUrl: stringValue(variant.expressionSheetImageUrl) } : {})
    })) : [],
    // 老工作区没有 visual，归一化成空设定而不是 undefined：
    // 界面读到的永远是同一个形状，空字段各自走自己的空状态。
    visual: normalizeCharacterVisualSpec(character.visual)
  }));
}

function normalizedScenes(value: JsonRecord | null): SceneAsset[] {
  if (!Array.isArray(value?.scenes)) return [];
  const scenes = value.scenes.filter(isRecord).map((scene) => ({
    ...scene,
    id: stringValue(scene.id),
    title: stringValue(scene.title),
    visual: stringValue(scene.visual),
    subtitle: stringValue(scene.subtitle),
    durationSeconds: typeof scene.durationSeconds === 'number' ? scene.durationSeconds : 0,
    location: stringValue(scene.location),
    timeOfDay: stringValue(scene.timeOfDay),
    lighting: stringValue(scene.lighting),
    palette: stringValue(scene.palette),
    characterIds: stringList(scene.characterIds),
    prompt: stringValue(scene.prompt),
    referenceImageUrl: stringValue(scene.referenceImageUrl),
    sceneMasterId: stringValue(scene.sceneMasterId),
    instance: normalizeSceneInstance(scene.instance)
  }));

  // 老工作区一条 sceneMasterId 都没有。按地点派生一遍再回填，
  // 界面才能直接进画板，而不是逼用户重新生成整个场景阶段。
  const orphans = scenes.filter((scene) => !scene.sceneMasterId);
  if (!orphans.length) return scenes;
  const { masterIdByScene } = deriveSceneMasters(orphans.map(sceneMasterSeed));
  return scenes.map((scene) =>
    scene.sceneMasterId ? scene : { ...scene, sceneMasterId: masterIdByScene[scene.id] || '' }
  );
}

function sceneMasterSeed(scene: SceneAsset) {
  return {
    id: scene.id,
    title: scene.title,
    location: scene.location,
    visual: scene.visual,
    palette: scene.palette,
    lighting: scene.lighting,
    timeOfDay: scene.timeOfDay
  };
}

/**
 * 场景母版。存在 scenes.json 的 sceneMasters 里；老工作区没有这个数组，
 * 就按场次的地点现场派生一份，保证界面永远有可用的母版索引。
 */
export function sceneMastersFromWorkspace(workspace: WorkspaceSnapshot | null): SceneMaster[] {
  const state = jsonFileState(workspace, 'scenes.json');
  if (state.status !== 'valid') return [];
  const stored = Array.isArray(state.value.sceneMasters)
    ? state.value.sceneMasters.filter(isRecord).map((master, index) => normalizeSceneMaster(master, `scene_master_${index + 1}`))
    : [];
  const scenes = normalizedScenes(state.value);
  const known = new Set(stored.map((master) => master.id));
  const orphans = scenes.filter((scene) => !known.has(scene.sceneMasterId));
  if (!orphans.length) return stored;
  const derived = deriveSceneMasters(orphans.map(sceneMasterSeed)).masters
    .filter((master) => !known.has(master.id));
  return [...stored, ...derived];
}

function migratedScenes(value: JsonRecord, assetPrompts: JsonRecord | null, primaryCharacter: CharacterAsset | undefined): JsonRecord {
  const promptBySceneId = new Map(legacyPrompts(assetPrompts).map((prompt) => [
    stringValue(prompt.sceneId) || stringValue(prompt.id),
    stringValue(prompt.prompt)
  ]));
  const references = referencesByScene(assetPrompts);
  const scenes = (Array.isArray(value.scenes) ? value.scenes : []).filter(isRecord).map((scene) => {
    const id = stringValue(scene.id);
    const start = typeof scene.start === 'number' ? scene.start : 0;
    const end = typeof scene.end === 'number' ? scene.end : 0;
    const durationSeconds = typeof scene.durationSeconds === 'number' ? scene.durationSeconds : Math.max(0, end - start);
    const existingCharacterIds = stringList(scene.characterIds);
    const visual = stringValue(scene.visual);
    const prompt = stringValue(scene.prompt) || promptBySceneId.get(id) || '';
    const canAssignPrimary = Boolean(primaryCharacter?.id && primaryCharacter.name && (visual.includes(primaryCharacter.name) || prompt.includes(primaryCharacter.name)));
    return {
      ...scene,
      id,
      title: stringValue(scene.title),
      visual,
      subtitle: stringValue(scene.subtitle),
      durationSeconds,
      location: stringValue(scene.location),
      timeOfDay: stringValue(scene.timeOfDay),
      lighting: stringValue(scene.lighting),
      palette: stringValue(scene.palette),
      characterIds: existingCharacterIds.length ? existingCharacterIds : canAssignPrimary ? [primaryCharacter!.id] : [],
      prompt,
      referenceImageUrl: stringValue(scene.referenceImageUrl) || references.get(id) || ''
    };
  });
  return { ...value, scenes };
}

export function charactersFromWorkspace(workspace: WorkspaceSnapshot | null): CharacterAsset[] {
  const state = jsonFileState(workspace, 'characters.json');
  return state.status === 'valid' ? normalizedCharacters(state.value) : [];
}

export function productionScenesFromWorkspace(workspace: WorkspaceSnapshot | null): SceneAsset[] {
  const state = jsonFileState(workspace, 'scenes.json');
  return state.status === 'valid' ? normalizedScenes(state.value) : [];
}

export type SceneContinuityReport = {
  sceneId: string;
  sceneTitle: string;
  masterId: string;
  issues: SceneContinuityIssue[];
};

/**
 * 按场次跑一遍连续性检查。
 *
 * 检查只在同一个场次内部做——跨场次的差异是剧情，不是穿帮。
 * 唯一的例外是光影和母版结构的矛盾，那个在单场次里就已经错了。
 */
export function sceneContinuityReports(workspace: WorkspaceSnapshot | null): SceneContinuityReport[] {
  const masters = new Map(sceneMastersFromWorkspace(workspace).map((master) => [master.id, master]));
  return productionScenesFromWorkspace(workspace).flatMap((scene) => {
    const master = masters.get(scene.sceneMasterId);
    const issues = [
      ...checkSceneContinuity(scene.instance.shots),
      ...(master ? checkSceneLightingAgainstMaster(master, scene.instance) : [])
    ];
    return issues.length
      ? [{ sceneId: scene.id, sceneTitle: scene.title, masterId: scene.sceneMasterId, issues }]
      : [];
  });
}

export function sceneContinuityIssues(workspace: WorkspaceSnapshot | null): SceneContinuityIssue[] {
  return sceneContinuityReports(workspace).flatMap((report) => report.issues);
}

export function migrateLegacyProductionAssets(workspace: WorkspaceSnapshot): WorkspaceSnapshot {
  const assetPrompts = jsonFileState(workspace, 'asset_prompts.json');
  const characters = jsonFileState(workspace, 'characters.json');
  const scenes = jsonFileState(workspace, 'scenes.json');
  const assetPromptsValue = assetPrompts.status === 'valid' ? assetPrompts.value : null;
  let next = workspace;

  if (characters.status === 'missing' && assetPromptsValue) {
    next = writeJsonFile(next, 'characters.json', { characters: legacyCharacterAssets(assetPromptsValue) } satisfies CharactersFile);
  }

  if (scenes.status !== 'valid') return next;
  const normalizedCharactersFile = jsonFileState(next, 'characters.json');
  const availableCharacters = normalizedCharactersFile.status === 'valid'
    ? normalizedCharacters(normalizedCharactersFile.value)
    : assetPromptsValue ? legacyCharacterAssets(assetPromptsValue) : [];
  const primaryCharacter = availableCharacters.find((character) => character.required);
  return writeJsonFile(next, 'scenes.json', migratedScenes(scenes.value, assetPromptsValue, primaryCharacter));
}

export function validateStageAssets(stage: ProductionStageId, workspace: WorkspaceSnapshot): string[] {
  if (stage === 'character') {
    const state = jsonFileState(workspace, 'characters.json');
    if (state.status === 'missing') return ['角色资产文件尚未生成'];
    if (state.status === 'invalid') return ['角色资产文件无法解析'];
    const characters = normalizedCharacters(state.value);
    if (!characters.length) return ['角色资产列表为空'];
    const requiredCharacters = characters.filter((character) => character.required);
    if (!requiredCharacters.length) return ['至少需要一个必需角色'];
    // 逐个角色查，不只查必需角色：交给场景阶段之前，脚本里的每个人都得有主图。
    return characters.flatMap((character) => {
      if (!character.variants.length) return [`${character.name}尚未生成主图`];
      return character.variants
        .filter((variant) => !variant.primaryImageUrl)
        .map((variant) => `${character.name}的${variant.label}主图尚未生成`);
    });
  }

  if (stage === 'scene') {
    const state = jsonFileState(workspace, 'scenes.json');
    if (state.status === 'missing') return ['场景资产文件尚未生成'];
    if (state.status === 'invalid') return ['场景资产文件无法解析'];
    const scenes = normalizedScenes(state.value);
    if (!scenes.length) return ['场景资产列表为空'];
    return [
      ...scenes
        .filter((scene) => coreScene(scene as unknown as JsonRecord) && !scene.referenceImageUrl)
        .map((scene) => `${scene.title || scene.id || '未命名场景'} 尚未生成主图`),
      // 连续性冲突必须挡在确认之前：过了这一关就要拿去出图和出视频了。
      //
      // 母版完成度（锚点条数、八个机位参考图）刻意不在这里拦：它是画板自己的审查进度，
      // 老工作区的母版是按地点现场派生的，锚点天然为空。拿它挡确认，等于所有历史项目
      // 都必须先重新生成整个场景阶段才能往下走——而重新生成会覆盖用户已经审过的内容。
      // 完成度和风险数量在场景卡和画板上显示，由用户决定补到什么程度。
      ...sceneContinuityIssues(workspace)
        .filter((issue) => issue.severity === 'error')
        .map((issue) => `连续性冲突：${issue.message}`)
    ];
  }

  if (stage === 'storyboard') {
    const state = jsonFileState(workspace, 'storyboard.json');
    if (state.status === 'missing') return ['分镜资产文件尚未生成'];
    if (state.status === 'invalid') return ['分镜资产文件无法解析'];
    const shots = Array.isArray(state.value.scenes) ? state.value.scenes.filter(isRecord) : [];
    if (!shots.length) return ['分镜资产列表为空'];
    return [
      ...shots.filter((shot) => typeof shot.durationSeconds !== 'number' || shot.durationSeconds <= 0)
        .map((shot) => `${stringValue(shot.title) || stringValue(shot.id) || '未命名镜头'} 缺少有效时长`),
      // 机位缺失（景别 / 拍摄角度 / 机位高度）刻意【不】挡在这里，尽管它确实决定
      // 「人物和空间以什么比例、什么透视呈现」，空着就是用户反馈里那句
      // 「按正常视角看，这个场景和人物不可能是这个角度」。
      //
      // 不挡的理由是这一条挡了也没有出路：分镜面板是只读的，唯一能补上机位的动作是
      // 再调一次模型（storyboardFramingGaps + 「补齐镜头机位」）；而机位全空最常见的场合
      // 恰恰是模型刚刚失败、分镜退回降级模板的时候——降级模板只搬运不推断，
      // 上游场次里又没有 instance.shots 可搬，于是它永远填不出这三栏。
      // 拦在这里等于「模型一失败就把人锁死在分镜阶段」。
      // 所以改成确认按钮上方的显著提示 + 一键补齐，看得见、能补，但不制造死路。
      // 连续性冲突挡在确认之前。过了这一关就要按镜头逐条烧 GPU 了，
      // 而「同一场戏里衣服换了」这类问题在成片里只能整段重渲，一次都补不回来。
      // 只挡 error：warning 里有相当一部分是合理的剧情变化，拿它卡住确认会让用户没法往下走。
      ...checkStoryboardContinuity(shots)
        .filter((issue) => issue.severity === 'error')
        .map((issue) => `连续性冲突（${issue.label}）：${issue.message}`)
    ];
  }

  return [];
}

/**
 * 决定「人物和空间以什么比例、什么透视呈现」的三栏。
 *
 * 少一栏，视频模型就自己补一栏，而它补出来的默认值是广角高机位——
 * 这正是用户反馈里「按正常视角看，场景跟人物不可能是这个角度」的来源。
 * 构图和人物画面位置也重要，但它们是描述性的，缺了还能靠这三栏兜住，所以不进闸。
 */
const SHOT_FRAMING_FIELDS: Array<{ key: string; label: string }> = [
  { key: 'shotSize', label: '景别' },
  { key: 'cameraAngle', label: '拍摄角度' },
  { key: 'cameraHeight', label: '机位高度' }
];

export type ShotFramingGap = {
  id: string;
  title: string;
  missing: string[];
};

/** 哪些镜头缺机位、各缺哪几栏。确认闸和「补齐镜头机位」读的是同一份判断。 */
export function shotsMissingFraming(shots: JsonRecord[]): ShotFramingGap[] {
  return shots.flatMap((shot) => {
    const missing = SHOT_FRAMING_FIELDS.filter((field) => !stringValue(shot[field.key])).map((field) => field.label);
    if (!missing.length) return [];
    return [{
      id: stringValue(shot.id),
      title: stringValue(shot.title) || stringValue(shot.id) || '未命名镜头',
      missing
    }];
  });
}

/**
 * 「只补机位」真正生效的地方。
 *
 * 提示词里写「其余字段一个字都不要改」是拦不住的：patch 机制要求模型吐回整份
 * storyboard.json，而模型一旦重新生成整份文件就会顺手重写画面描述。实测 10 个镜头
 * 全部被改写，而且是【减信息】的改写——
 *   「大学图书馆，陈女士低头翻书，轻声说话。窗边自然光，自然暖色调」
 * 被压成「大学图书馆窗边，陈女士低头翻书，轻声说话。」，光线和色调整个没了。
 * 用户审过的画面就这样被一次「只补机位」的操作悄悄改掉。
 *
 * 所以合并在客户端做：模型的产出只取这几栏，其余一律以已确认的那份为准。
 * 模型多给的镜头直接丢掉，少给的镜头保持原样——这一步之后，
 * 「只补机位」才真的只补机位。
 */
const MERGEABLE_FRAMING_FIELDS = ['shotSize', 'cameraAngle', 'cameraHeight', 'composition', 'subjectPlacement', 'lens', 'depthOfField'];

export function mergeShotFraming(beforeJson: string, afterJson: string): string {
  let before: JsonRecord;
  let after: JsonRecord;
  try {
    before = JSON.parse(beforeJson) as JsonRecord;
    after = JSON.parse(afterJson) as JsonRecord;
  } catch {
    // 解析不了就原样退回模型那份，交给上游既有的校验去处理。
    return afterJson;
  }
  if (!Array.isArray(before.scenes) || !Array.isArray(after.scenes)) return afterJson;

  const framingById = new Map<string, JsonRecord>();
  for (const shot of after.scenes) {
    if (!isRecord(shot)) continue;
    const id = stringValue(shot.id);
    if (id) framingById.set(id, shot);
  }

  const scenes = before.scenes.map((shot) => {
    if (!isRecord(shot)) return shot;
    const filled = framingById.get(stringValue(shot.id));
    if (!filled) return shot;
    const patch: JsonRecord = {};
    for (const key of MERGEABLE_FRAMING_FIELDS) {
      const value = stringValue(filled[key]);
      // 只补空栏：已经填过的机位是用户审过的，模型的新意见不该盖掉它。
      if (value && !stringValue(shot[key])) patch[key] = value;
    }
    return Object.keys(patch).length ? { ...shot, ...patch } : shot;
  });

  return JSON.stringify({ ...before, scenes }, null, 2);
}

/** 分镜阶段的机位缺口。UI 拿它决定要不要显示「补齐镜头机位」。 */
export function storyboardFramingGaps(workspace: WorkspaceSnapshot | null): ShotFramingGap[] {
  const state = jsonFileState(workspace, 'storyboard.json');
  if (state.status !== 'valid' || !Array.isArray(state.value.scenes)) return [];
  return shotsMissingFraming(state.value.scenes.filter(isRecord));
}

function promptLines(...lines: string[]): string {
  return lines.map((line) => line.trim()).filter(Boolean).join('\n');
}

function coreScene(scene: JsonRecord): boolean {
  return scene.core !== false && scene.isCore !== false;
}

export function missingCharacterImageJobs(workspace: WorkspaceSnapshot): StageImageJob[] {
  const state = jsonFileState(workspace, 'characters.json');
  if (state.status !== 'valid' || !Array.isArray(state.value.characters)) return [];

  return state.value.characters.flatMap((character) => {
    // 配角也要出图：只给必需角色生成，会让模型标成配角的人物一张图都没有。
    if (!isRecord(character) || !Array.isArray(character.variants)) return [];
    const characterPrompt = stringValue(character.imagePrompt) || stringValue(character.prompt);
    const consistencyPrompt = stringValue(character.consistencyPrompt);
    const negativePrompt = stringValue(character.negativePrompt);
    // 视觉设定画板里锁下来的身份锚点必须进主图提示词，否则用户在画板上填的
    // 脸型、发际线、分缝方向全停在界面里，生成出来的还是模型自由发挥的那张脸。
    const visualLines = characterVisualPromptLines(normalizeCharacterVisualSpec(character.visual));
    return character.variants.flatMap((variant) => {
      if (!isRecord(variant) || !stringValue(variant.id) || stringValue(variant.primaryImageUrl)) return [];
      const prompt = promptLines(
        stringValue(variant.primaryImagePrompt) || characterPrompt,
        `年龄：${stringValue(variant.ageLabel)}。服装：${stringValue(variant.wardrobe)}。`,
        consistencyPrompt ? `角色一致性：${consistencyPrompt}。` : '',
        ...visualLines
      );
      return prompt ? [{
        stage: 'character' as const,
        assetId: stringValue(character.id),
        variantId: stringValue(variant.id),
        kind: 'portrait' as const,
        prompt,
        negativePrompt
      }] : [];
    });
  }).filter((job) => Boolean(job.assetId));
}

/**
 * 多视角设定板：每个已经有主图的变体各出一张。必须排在主图之后跑——
 * 它要把该变体的主图和 Face ID 锚点图一起当参考传给图片模型，否则四个视角会是四张脸。
 */
export function missingCharacterMultiViewJobs(workspace: WorkspaceSnapshot): StageImageJob[] {
  const state = jsonFileState(workspace, 'characters.json');
  if (state.status !== 'valid' || !Array.isArray(state.value.characters)) return [];

  return state.value.characters.flatMap((character) => {
    // 和主图保持同一口径：配角同样要有多视角设定板。
    if (!isRecord(character) || !Array.isArray(character.variants)) return [];
    const variants = character.variants.filter(isRecord);
    const anchorId = stringValue(character.faceAnchorVariantId);
    const anchorImage = stringValue(
      variants.find((variant) => stringValue(variant.id) === anchorId)?.primaryImageUrl
    );

    return variants.flatMap((variant) => {
      const variantId = stringValue(variant.id);
      const primaryImageUrl = stringValue(variant.primaryImageUrl);
      // 主图还没出来的先跳过，等下一轮；已经有多视角的不重复花钱。
      if (!variantId || !primaryImageUrl || stringValue(variant.multiViewImageUrl)) return [];

      const prompt = buildCharacterDesignPrompt({
        characterName: stringValue(character.name),
        role: stringValue(character.role),
        description: stringValue(character.description),
        consistency: stringValue(character.consistencyPrompt),
        negativePrompt: stringValue(character.negativePrompt),
        // 多视角设定板同样要锁人种：四个视角本来就是最容易各画各的地方。
        ethnicity: characterEthnicityText(normalizeCharacterVisualSpec(character.visual)),
        stage: {
          id: variantId as CharacterStageId,
          label: stringValue(variant.label),
          ageLabel: stringValue(variant.ageLabel),
          wardrobe: stringValue(variant.wardrobe)
        },
        outputKind: 'multi_view'
      });

      return [{
        stage: 'character' as const,
        assetId: stringValue(character.id),
        variantId,
        kind: 'multi_view' as const,
        prompt,
        negativePrompt: stringValue(character.negativePrompt),
        referenceImages: [...new Set([primaryImageUrl, anchorImage].filter(Boolean))]
      }];
    });
  }).filter((job) => Boolean(job.assetId));
}

/**
 * 出场角色的锚点图 + 形象描述。
 *
 * 场景图原本是纯文生图，提示词里只有一串角色 ID（"xiao_peng_01、first_love_01"），
 * 模型既拿不到脸也读不懂 ID，只能现编一张脸。而视频阶段又拿场景图当首帧——
 * 人物一致性从这一步就断了，后面怎么补都是徒劳。
 * 多视角早就用 referenceImages 解决过同一个问题（"否则四个视角会是四张不同的脸"），
 * 场景图只是漏了。
 */
function sceneCastReferences(workspace: WorkspaceSnapshot, characterIds: string[]) {
  if (!characterIds.length) return { images: [] as string[], brief: '' };
  const cast = charactersFromWorkspace(workspace).filter((character) => characterIds.includes(character.id));
  const images: string[] = [];
  const brief: string[] = [];
  for (const character of cast) {
    const variants = character.variants || [];
    const anchor = variants.find((variant) => variant.id === character.faceAnchorVariantId) || variants[0];
    if (anchor?.primaryImageUrl) images.push(anchor.primaryImageUrl);
    const consistency = character.consistencyPrompt.trim();
    // 辨识度标识排在一致性提示词之后：几个角色的一致性提示词往往写得很像，
    // 真正把人区分开的是头型、色盘和标志性道具这几项。
    const detail = [consistency, characterVisualBrief(character.visual)].filter(Boolean).join('；');
    brief.push(detail ? `${character.name}（${character.role || '出场角色'}）：${detail}` : character.name);
  }
  return { images: Array.from(new Set(images)), brief: brief.join('；') };
}

/**
 * 母版的八个机位参考图。
 *
 * 必须排在场次主图之前跑：场次主图要拿母版全景当参考，否则每一场都会现编一个空间，
 * 母版就只是一份没人看的表单。全景之外的七个机位又要以全景为参考，
 * 道理和角色多视角一样——不给参考，八张图就是八个不同的房间。
 */
export function missingSceneViewJobs(workspace: WorkspaceSnapshot): StageImageJob[] {
  return sceneMastersFromWorkspace(workspace).flatMap((master) => {
    const panorama = master.views.panorama;
    return SCENE_VIEW_SLOTS.flatMap((slot) => {
      if (master.views[slot.id]) return [];
      // 全景还没出来时先只跑全景，其余机位等下一轮拿到参考再跑。
      if (slot.id !== 'panorama' && !panorama) return [];
      const prompt = buildSceneViewPrompt(master, slot.id);
      return prompt ? [{
        stage: 'scene' as const,
        assetId: master.id,
        viewId: slot.id,
        prompt,
        negativePrompt: '',
        ...(slot.id === 'panorama' ? {} : { referenceImages: [panorama] })
      }] : [];
    });
  });
}

/**
 * 这一场的空间参考图，按景别挑机位。
 *
 * 全景是「这个房间长什么样」的主锚点，但它是广角，透视和视高都属于广角。
 * 近景和特写拿它当参考，模型会把人物按广角的比例贴进去——人和空间的占比、
 * 视高、透视三样一起错，正是「按正常视角看，这个场景和人物不可能这么呈现」。
 * 近景优先用正向视角（主视线方向的常规机位），全景/远景才用广角全景。
 */
function spaceReferenceViews(master: SceneMaster | undefined, shotSize: string): string[] {
  if (!master) return [];
  const { panorama, front } = master.views;
  const tight = /特写|近景|中景/.test(shotSize);
  const preferred = tight ? [front, panorama] : [panorama, front];
  // 只取一张：两张空间参考会让模型在两个机位之间折中，得到第三个不存在的机位。
  return preferred.filter(Boolean).slice(0, 1);
}

export function missingSceneImageJobs(workspace: WorkspaceSnapshot): StageImageJob[] {
  const state = jsonFileState(workspace, 'scenes.json');
  if (state.status !== 'valid' || !Array.isArray(state.value.scenes)) return [];
  const mastersById = new Map(sceneMastersFromWorkspace(workspace).map((master) => [master.id, master]));
  const scenes = normalizedScenes(state.value);

  return state.value.scenes.flatMap((scene, index) => {
    if (!isRecord(scene) || !coreScene(scene) || !stringValue(scene.id) || stringValue(scene.referenceImageUrl)) return [];
    const normalized = scenes[index];
    const master = normalized ? mastersById.get(normalized.sceneMasterId) : undefined;
    const characterIds = stringList(scene.characterIds);
    const cast = sceneCastReferences(workspace, characterIds);
    const instanceLines = normalized ? sceneInstancePromptLines(normalized.instance) : [];
    // 场次主图是这一场的开场画面，也是视频阶段的首帧，所以它的取景要按第一个镜头来。
    // 不给景别，模型只能自己决定人物在画面里占多大——而这张图之后会被整场沿用，
    // 一张比例不对的首帧会把这一场每个镜头都带偏。
    const openingShot = normalized?.instance.shots[0];
    const shotLines = openingShot ? sceneShotPromptLines(openingShot) : [];
    const prompt = promptLines(
      stringValue(scene.mainImagePrompt) || stringValue(scene.prompt),
      // 母版在前、场次在后：先把空间钉死，再说这一场有什么不同。
      ...(master ? sceneMasterPromptLines(master) : []),
      ...instanceLines,
      ...shotLines,
      // 老场次没有 instance，时间和光线只存在于这几个扁平字段里。
      // 有了母版就不写这一行会让「傍晚、自然光」整个丢掉，画面时间随机漂移。
      instanceLines.length
        ? ''
        : `地点：${stringValue(scene.location)}。时间：${stringValue(scene.timeOfDay)}。光线：${stringValue(scene.lighting)}。色彩：${stringValue(scene.palette)}。`,
      cast.brief
        ? `出场角色的长相必须与参考图完全一致，不要重新设计人物——${cast.brief}。`
        : characterIds.length ? `出场角色：${characterIds.join('、')}。` : '',
      ...(master ? sceneConsistencyPromptLines(master) : [])
    );
    // 空间参考图排在人脸参考之前：图生图里靠前的参考对构图影响更大，
    // 而这张图的作用首先是「同一个房间」，其次才是「同一张脸」。
    // 但空间参考图不能一律用广角全景：拿一张广角房间图当特写的构图参考，
    // 模型只能把人硬塞进这个广角透视里，出来就是「这个角度不可能这么呈现」。
    const references = [...spaceReferenceViews(master, openingShot?.shotSize || ''), ...cast.images];
    return prompt ? [{
      stage: 'scene' as const,
      assetId: stringValue(scene.id),
      prompt,
      negativePrompt: stringValue(scene.negativePrompt),
      ...(references.length ? { referenceImages: references } : {})
    }] : [];
  });
}

/**
 * 按镜头出首帧图。
 *
 * 场次主图是一场一张，而一场会拆成多个景别不同的镜头——真实数据里镜头 01「中景转近景」
 * 和镜头 02「全景转中景」共用同一张图。那张图只有一个取景，却要同时当两个景别的首帧：
 * 图生视频里首帧的构图权重远高于文字，于是「这一镜是特写」这句话被首帧按回去，
 * 人物和空间的比例就成了两个镜头里都不对的那一个。
 *
 * 这里给每个镜头出自己的首帧，取景按这一镜的机位来。代价是图片生成次数从「场次数」
 * 变成「镜头数」（一集 12 场 60 镜就是 5 倍），所以它是用户显式触发的，不进自动流程。
 */
export function missingShotImageJobs(workspace: WorkspaceSnapshot): StageImageJob[] {
  const state = jsonFileState(workspace, 'storyboard.json');
  if (state.status !== 'valid' || !Array.isArray(state.value.scenes)) return [];
  const mastersById = new Map(sceneMastersFromWorkspace(workspace).map((master) => [master.id, master]));
  const scenesById = new Map(productionScenesFromWorkspace(workspace).map((scene) => [scene.id, scene]));

  return state.value.scenes.filter(isRecord).flatMap((shot) => {
    const shotId = stringValue(shot.id);
    // 已经有自己的首帧就不重复花钱。referenceImageUrl 不算——那是从场次继承来的共用图，
    // 拿它当「已经有了」会让这个功能永远不生成任何东西。
    if (!shotId || stringValue(shot.shotImageUrl)) return [];

    const scene = scenesById.get(stringValue(shot.sourceSceneId) || stringValue(shot.sceneId));
    const master = scene ? mastersById.get(scene.sceneMasterId) : undefined;
    // 角色优先取这一镜自己标的；镜头没标就退回所属场次的出场角色。
    const characterIds = stringList(shot.characterIds).length ? stringList(shot.characterIds) : (scene?.characterIds || []);
    const cast = sceneCastReferences(workspace, characterIds);
    const shotState = normalizeSceneShot(shot, 0);

    const prompt = promptLines(
      // 这一镜的画面在前：它才是这张图要画的内容，空间和机位是约束。
      stringValue(shot.visual) || stringValue(shot.action) || stringValue(shot.title),
      ...(master ? sceneMasterPromptLines(master) : []),
      ...(scene ? sceneInstancePromptLines(scene.instance) : []),
      ...sceneShotPromptLines(shotState),
      cast.brief
        ? `出场角色的长相必须与参考图完全一致，不要重新设计人物——${cast.brief}。`
        : characterIds.length ? `出场角色：${characterIds.join('、')}。` : '',
      '这是这一个镜头的首帧画面，不是整场的示意图：严格按上面的景别和机位取景。',
      '画面不要生成任何可读文字，不要英文、拼音、字幕、水印、标志或乱码。',
      ...(master ? sceneConsistencyPromptLines(master) : [])
    );
    const references = [...spaceReferenceViews(master, shotState.shotSize), ...cast.images];
    return prompt ? [{
      stage: 'shot' as const,
      assetId: shotId,
      prompt,
      negativePrompt: stringValue(shot.negativePrompt),
      ...(references.length ? { referenceImages: references } : {})
    }] : [];
  });
}

/** 写入某个镜头自己的首帧图。共用的 referenceImageUrl 原样保留，作为退路。 */
export function replaceShotImage(workspace: WorkspaceSnapshot, shotId: string, imageUrl: string): WorkspaceSnapshot {
  const state = jsonFileState(workspace, 'storyboard.json');
  if (state.status !== 'valid' || !Array.isArray(state.value.scenes)) return workspace;
  const scenes = state.value.scenes.map((shot) => {
    if (!isRecord(shot) || stringValue(shot.id) !== shotId || stringValue(shot.shotImageUrl) === imageUrl) return shot;
    return { ...shot, shotImageUrl: imageUrl };
  });
  return writeJsonFile(workspace, 'storyboard.json', { ...state.value, scenes });
}

export function applyStageImageResult(
  workspace: WorkspaceSnapshot,
  result: StageImageJob & { imageUrl: string }
): WorkspaceSnapshot {
  const imageUrl = stringValue(result.imageUrl);
  if (!imageUrl) return workspace;
  if (result.stage === 'shot') return replaceShotImage(workspace, result.assetId, imageUrl);
  if (result.stage === 'character') {
    // 身份参考位写进 visual.identity.views，不是变体主图——写串了会把角色主图覆盖掉。
    if (result.identityViewId) return replaceCharacterIdentityView(workspace, result.assetId, result.identityViewId, imageUrl);
    if (!result.variantId || !result.kind) return workspace;
    return replaceCharacterVariantImage(workspace, result.assetId, result.variantId, result.kind, imageUrl);
  }
  if (result.viewId) return replaceSceneMasterView(workspace, result.assetId, result.viewId, imageUrl);
  return replaceSceneImage(workspace, result.assetId, imageUrl);
}

/**
 * 写入母版的某个机位参考图。
 *
 * 母版可能还没落盘（老工作区是现场派生的），所以这里要把派生结果一起写进去，
 * 否则第一张图生成完就找不到归属，静默丢失。
 */
export function replaceSceneMasterView(
  workspace: WorkspaceSnapshot,
  masterId: string,
  viewId: SceneViewId,
  imageUrl: string
): WorkspaceSnapshot {
  const state = jsonFileState(workspace, 'scenes.json');
  if (state.status !== 'valid') return workspace;
  const masters = sceneMastersFromWorkspace(workspace);
  if (!masters.some((master) => master.id === masterId)) return workspace;
  const next = masters.map((master) =>
    master.id === masterId ? { ...master, views: { ...master.views, [viewId]: imageUrl } } : master
  );
  // 场次的 sceneMasterId 也一并落盘，否则下次读取又要重新派生一遍。
  const scenes = normalizedScenes(state.value);
  const masterIdByScene = new Map(scenes.map((scene) => [scene.id, scene.sceneMasterId]));
  const storedScenes = Array.isArray(state.value.scenes) ? state.value.scenes : [];
  return writeJsonFile(workspace, 'scenes.json', {
    ...state.value,
    sceneMasters: next,
    scenes: storedScenes.map((scene) =>
      isRecord(scene) && !stringValue(scene.sceneMasterId)
        ? { ...scene, sceneMasterId: masterIdByScene.get(stringValue(scene.id)) || '' }
        : scene
    )
  });
}

/** 把身份参考位写进 visual.identity.views。老角色没有 visual 时先归一化出一份再写。 */
export function replaceCharacterIdentityView(
  workspace: WorkspaceSnapshot,
  characterId: string,
  viewId: CharacterViewAngleId,
  imageUrl: string
): WorkspaceSnapshot {
  const state = jsonFileState(workspace, 'characters.json');
  if (state.status !== 'valid' || !Array.isArray(state.value.characters)) return workspace;
  let updated = false;
  const characters = state.value.characters.map((character) => {
    if (!isRecord(character) || stringValue(character.id) !== characterId) return character;
    const visual = normalizeCharacterVisualSpec(character.visual);
    if (visual.identity.views[viewId] === imageUrl) return character;
    updated = true;
    return {
      ...character,
      visual: { ...visual, identity: { ...visual.identity, views: { ...visual.identity.views, [viewId]: imageUrl } } }
    };
  });
  if (!updated) return workspace;
  return writeJsonFile(workspace, 'characters.json', { ...state.value, characters });
}

/** 身份参考位的出图说明。画板上的手动按钮和自动补图循环共用这一份，避免两边各写一套措辞。 */
export function characterIdentityViewInstruction(viewId: CharacterViewAngleId): string {
  const angle = CHARACTER_VIEW_ANGLES.find((item) => item.id === viewId);
  if (!angle) return '';
  return `${angle.prompt}。这是角色身份参考位，必须和参考图是同一个人，不允许换脸、换发型或改变身材比例。`;
}

/** 表情板的出图说明。表情池取自视觉设定，没填就退回一组通用表情。 */
export function characterExpressionSheetInstruction(spec: CharacterVisualSpec): string {
  const labels = spec.expressions.map((item) => item.label).filter(Boolean);
  return `生成同一角色的表情板，每格保持同一张脸，只改变表情，五官结构、发型、肤色和年龄感不允许变化。`
    + `表情范围：${labels.length ? labels.join('、') : '平静、微笑、紧张、惊讶、难过、生气'}。`;
}

/** 角色一致的那几个字段每次出图都要重复取，抽出来避免三处各写一遍。 */
function characterImageContext(character: JsonRecord) {
  const variants = Array.isArray(character.variants) ? character.variants.filter(isRecord) : [];
  const anchorId = stringValue(character.faceAnchorVariantId);
  const anchor = variants.find((variant) => stringValue(variant.id) === anchorId) || variants[0];
  return {
    characterId: stringValue(character.id),
    visual: normalizeCharacterVisualSpec(character.visual),
    anchor,
    anchorImage: stringValue(anchor?.primaryImageUrl),
    negativePrompt: stringValue(character.negativePrompt),
    stage: {
      id: stringValue(anchor?.id) as CharacterStageId,
      label: stringValue(anchor?.label),
      ageLabel: stringValue(anchor?.ageLabel),
      wardrobe: stringValue(anchor?.wardrobe)
    }
  };
}

/**
 * 身份参考位的补图任务。
 *
 * 四个角度（正脸、3/4 侧脸、纯侧脸、全身）本来只有正脸自动跑，另外三个留给画板上的按钮——
 * 而实际结果是绝大多数角色只有一张正脸：谁都不会为每个配角手动点三次。
 * 于是「多角度参考」这一层在真实项目里等于不存在，视频阶段能拿到的身份锚点永远只有一个正面。
 *
 * 现在四个角度一起自动跑，但顺序是有依赖的，不能一把并发：
 * 正脸是身份主锚点，另外三个角度必须拿【已经生成好的正脸】当参考图，
 * 否则四个角度就是四张脸——这正是多视角设定板当初要解决的同一个问题。
 * 所以调用方要先跑 ['front'] 这一轮，再跑剩下三个。
 */
export function missingCharacterIdentityViewJobs(
  workspace: WorkspaceSnapshot,
  viewIds: CharacterViewAngleId[] = CHARACTER_VIEW_ANGLES.map((angle) => angle.id)
): StageImageJob[] {
  const state = jsonFileState(workspace, 'characters.json');
  if (state.status !== 'valid' || !Array.isArray(state.value.characters)) return [];
  const wanted = CHARACTER_VIEW_ANGLES.filter((angle) => viewIds.includes(angle.id));
  if (!wanted.length) return [];

  return state.value.characters.flatMap((character) => {
    if (!isRecord(character)) return [];
    const { characterId, visual, anchorImage, negativePrompt, stage } = characterImageContext(character);
    if (!characterId) return [];
    /**
     * 没写性别就不生成——宁可留一个空占位，也不能掷硬币。
     *
     * 真实事故：男配角「前任A」的描述是「陈女士第一段恋爱的对象，29岁，性格温和」，
     * 提示词里「男」出现 0 次而「女」出现了（来自女主角的名字），
     * 于是身份主锚点生成成了一张女性正脸，后面每个镜头都会跟着这张脸错下去。
     * 性别是必填字段，缺了就让界面显示占位并卡住视觉审查，由人来补。
     */
    if (!visual.identity.gender) return [];
    // 主图还没出来的先跳过，等下一轮：没有参考图的正脸会是另一张脸。
    if (!anchorImage) return [];

    const visualLines = characterVisualPromptLines(visual, { purpose: 'identity_reference' });

    return wanted.flatMap((angle) => {
      if (visual.identity.views[angle.id]) return [];
      // 正脸之外的角度必须等正脸出来。这不是保守，是这三张图唯一的身份依据：
      // 只拿变体主图当参考，侧脸和全身会各自往不同的长相上漂。
      if (angle.id !== 'front' && !visual.identity.views.front) return [];

      return [{
        stage: 'character' as const,
        assetId: characterId,
        identityViewId: angle.id,
        prompt: buildCharacterDesignPrompt({
          characterName: stringValue(character.name),
          role: stringValue(character.role),
          description: stringValue(character.description),
          consistency: stringValue(character.consistencyPrompt),
          negativePrompt,
          stage,
          visualLines,
          outputInstructionOverride: characterIdentityViewInstruction(angle.id)
        }),
        negativePrompt,
        referenceImages: Array.from(new Set(
          [visual.identity.views.front, anchorImage].filter(Boolean)
        ))
      }];
    });
  });
}

/** 老名字保留：只跑正脸这一轮。调用点靠它表达「先出主锚点」这层顺序依赖。 */
export function missingCharacterFrontViewJobs(workspace: WorkspaceSnapshot): StageImageJob[] {
  return missingCharacterIdentityViewJobs(workspace, ['front']);
}

/**
 * 表情板的补图任务。
 *
 * 只给 Face ID 锚点变体出一张，不是每个变体一张：表情板约束的是「同一张脸怎么变表情」，
 * 而锚点变体那张脸就是全片的身份依据。每个年龄段各出一张表情板，成本翻几倍，
 * 换来的信息量却几乎重复。
 *
 * 排在正脸之后跑：拿正脸当参考图，表情板才和身份锚点是同一个人。
 */
export function missingCharacterExpressionSheetJobs(workspace: WorkspaceSnapshot): StageImageJob[] {
  const state = jsonFileState(workspace, 'characters.json');
  if (state.status !== 'valid' || !Array.isArray(state.value.characters)) return [];

  return state.value.characters.flatMap((character) => {
    if (!isRecord(character)) return [];
    const { characterId, visual, anchor, anchorImage, negativePrompt, stage } = characterImageContext(character);
    const variantId = stringValue(anchor?.id);
    if (!characterId || !variantId || !anchorImage) return [];
    if (stringValue(anchor?.expressionSheetImageUrl)) return [];
    if (!visual.identity.gender) return [];
    // 只有声音的角色不出表情板：他根本不会出现在画面里，这一张纯属白花钱。
    if (visual.shooting.voiceOnly) return [];

    return [{
      stage: 'character' as const,
      assetId: characterId,
      variantId,
      kind: 'expression_sheet' as const,
      prompt: buildCharacterDesignPrompt({
        characterName: stringValue(character.name),
        role: stringValue(character.role),
        description: stringValue(character.description),
        consistency: stringValue(character.consistencyPrompt),
        negativePrompt,
        stage,
        visualLines: characterVisualPromptLines(visual, { purpose: 'identity_reference' }),
        outputInstructionOverride: characterExpressionSheetInstruction(visual)
      }),
      negativePrompt,
      referenceImages: Array.from(new Set([visual.identity.views.front, anchorImage].filter(Boolean)))
    }];
  });
}

export function replaceCharacterVariantImage(
  workspace: WorkspaceSnapshot,
  characterId: string,
  variantId: string,
  kind: 'portrait' | 'multi_view' | 'expression_sheet',
  imageUrl: string
): WorkspaceSnapshot {
  const state = jsonFileState(workspace, 'characters.json');
  if (state.status === 'invalid') return workspace;
  const assetPrompts = jsonFileState(workspace, 'asset_prompts.json');
  const source = state.status === 'valid'
    ? state.value
    : state.status === 'missing' && assetPrompts.status === 'valid'
      ? { characters: legacyCharacterAssets(assetPrompts.value) }
      : null;
  if (!source || !Array.isArray(source.characters)) return workspace;

  const field = kind === 'portrait' ? 'primaryImageUrl' : kind === 'multi_view' ? 'multiViewImageUrl' : 'expressionSheetImageUrl';
  let updated = false;
  const characters = source.characters.map((character) => {
    if (!isRecord(character) || stringValue(character.id) !== characterId || !Array.isArray(character.variants)) return character;
    const variants = character.variants.map((variant) => {
      if (!isRecord(variant) || stringValue(variant.id) !== variantId || stringValue(variant[field]) === imageUrl) return variant;
      updated = true;
      return { ...variant, [field]: imageUrl };
    });
    return updated ? { ...character, variants } : character;
  });
  if (!updated) return workspace;
  return writeJsonFile(workspace, 'characters.json', { ...source, characters });
}

export function replaceSceneImage(workspace: WorkspaceSnapshot, sceneId: string, imageUrl: string): WorkspaceSnapshot {
  const state = jsonFileState(workspace, 'scenes.json');
  if (state.status !== 'valid' || !Array.isArray(state.value.scenes)) return workspace;
  let updated = false;
  const scenes = state.value.scenes.map((scene) => {
    if (!isRecord(scene) || stringValue(scene.id) !== sceneId || stringValue(scene.referenceImageUrl) === imageUrl) return scene;
    updated = true;
    return { ...scene, referenceImageUrl: imageUrl };
  });
  if (!updated) return workspace;
  return writeJsonFile(workspace, 'scenes.json', { ...state.value, scenes });
}
