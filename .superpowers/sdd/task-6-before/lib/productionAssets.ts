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
      variants: index === selectedPrimaryIndex ? characterVariants(stageReferences) : []
    };
  });
}

function normalizedCharacters(value: JsonRecord | null): CharacterAsset[] {
  if (!Array.isArray(value?.characters)) return [];
  return value.characters.filter(isRecord).map((character) => ({
    id: stringValue(character.id),
    name: stringValue(character.name),
    role: stringValue(character.role),
    required: character.required === true,
    description: stringValue(character.description),
    consistencyPrompt: stringValue(character.consistencyPrompt),
    negativePrompt: stringValue(character.negativePrompt),
    faceAnchorVariantId: stringValue(character.faceAnchorVariantId),
    referenceStrategy: character.referenceStrategy === 'multi_view' || character.referenceStrategy === 'replace_reference'
      ? character.referenceStrategy
      : 'face_id',
    expressionIds: stringList(character.expressionIds),
    variants: Array.isArray(character.variants) ? character.variants.filter(isRecord).map((variant) => ({
      id: stringValue(variant.id),
      label: stringValue(variant.label),
      ageLabel: stringValue(variant.ageLabel),
      wardrobe: stringValue(variant.wardrobe),
      primaryImageUrl: stringValue(variant.primaryImageUrl),
      ...(stringValue(variant.multiViewImageUrl) ? { multiViewImageUrl: stringValue(variant.multiViewImageUrl) } : {}),
      ...(stringValue(variant.expressionSheetImageUrl) ? { expressionSheetImageUrl: stringValue(variant.expressionSheetImageUrl) } : {})
    })) : []
  }));
}

function normalizedScenes(value: JsonRecord | null): SceneAsset[] {
  if (!Array.isArray(value?.scenes)) return [];
  return value.scenes.filter(isRecord).map((scene) => ({
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
    referenceImageUrl: stringValue(scene.referenceImageUrl)
  }));
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
    return requiredCharacters.flatMap((character) => {
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
    return scenes.filter((scene) => !scene.referenceImageUrl)
      .map((scene) => `${scene.title || scene.id || '未命名场景'} 尚未生成主图`);
  }

  if (stage === 'storyboard') {
    const state = jsonFileState(workspace, 'storyboard.json');
    if (state.status === 'missing') return ['分镜资产文件尚未生成'];
    if (state.status === 'invalid') return ['分镜资产文件无法解析'];
    const shots = Array.isArray(state.value.scenes) ? state.value.scenes.filter(isRecord) : [];
    if (!shots.length) return ['分镜资产列表为空'];
    return shots.filter((shot) => typeof shot.durationSeconds !== 'number' || shot.durationSeconds <= 0)
      .map((shot) => `${stringValue(shot.title) || stringValue(shot.id) || '未命名镜头'} 缺少有效时长`);
  }

  return [];
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
