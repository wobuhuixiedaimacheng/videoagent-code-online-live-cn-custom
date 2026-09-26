import type {
  ProductionFlow,
  ProductionStageId,
  ProductionStageRecord,
  ProductionStageStatus,
  WorkspaceSnapshot
} from './types';
import { normalizeFinalCutState } from './videoStitch';

export type ConfirmStageInput = {
  stage: ProductionStageId;
  expectedDraftVersion: number;
  confirmationKey: string;
  confirmedAt: string;
  confirmedBy: string;
  nextGenerationJobId: string | null;
  sourceVersions: Record<string, number>;
};

export const PRODUCTION_FLOW_PATH = 'production_flow.json';
export const PRODUCTION_STAGE_ORDER: ProductionStageId[] = ['script', 'character', 'scene', 'storyboard', 'video'];

const STAGE_ASSET_PATH: Record<ProductionStageId, string> = {
  script: 'script.md',
  character: 'characters.json',
  scene: 'scenes.json',
  storyboard: 'storyboard.json',
  video: 'asset_prompts.json'
};

// 这个白名单必须和 ProductionStageStatus 一一对应。少一个的后果不是类型报错而是数据丢失：
// normalizeStageRecord 会把认不出的状态一律打回 'locked'，于是「质检中」的视频阶段
// 存盘再读回来就变成了「未解锁」，界面上整条流程凭空倒退回第一步。
const STAGE_STATUSES: ProductionStageStatus[] = [
  'locked',
  'generating',
  'ready_for_review',
  'confirmed',
  'stale',
  'rendering',
  'qa_pending',
  'qa_failed',
  'stitching',
  'completed',
  'failed'
];

function emptyStageRecord(status: ProductionStageStatus = 'locked', draftVersion: number | null = null): ProductionStageRecord {
  return {
    status,
    draftVersion,
    confirmedVersion: null,
    confirmedAt: null,
    confirmedBy: null,
    confirmationKey: null,
    generationJobId: null,
    sourceVersions: {},
    error: null
  };
}

function defaultFlow(workspace: WorkspaceSnapshot | null): ProductionFlow {
  const script = workspace?.files.find((file) => file.path === STAGE_ASSET_PATH.script);
  const stages = Object.fromEntries(
    PRODUCTION_STAGE_ORDER.map((stage) => [stage, emptyStageRecord()])
  ) as Record<ProductionStageId, ProductionStageRecord>;

  if (script) {
    stages.script = emptyStageRecord('ready_for_review', script.version);
  }

  return {
    schemaVersion: 1,
    currentStage: 'script',
    stages,
    videoJobs: [],
    finalCut: null
  };
}

function normalizeStageRecord(value: unknown): ProductionStageRecord {
  const record = value && typeof value === 'object' ? value as Partial<ProductionStageRecord> : {};
  return {
    status: STAGE_STATUSES.includes(record.status as ProductionStageStatus) ? record.status as ProductionStageStatus : 'locked',
    draftVersion: typeof record.draftVersion === 'number' ? record.draftVersion : null,
    confirmedVersion: typeof record.confirmedVersion === 'number' ? record.confirmedVersion : null,
    confirmedAt: typeof record.confirmedAt === 'string' ? record.confirmedAt : null,
    confirmedBy: typeof record.confirmedBy === 'string' ? record.confirmedBy : null,
    confirmationKey: typeof record.confirmationKey === 'string' ? record.confirmationKey : null,
    generationJobId: typeof record.generationJobId === 'string' ? record.generationJobId : null,
    sourceVersions: normalizeSourceVersions(record.sourceVersions),
    error: typeof record.error === 'string' ? record.error : null
  };
}

function normalizeSourceVersions(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, number] => typeof entry[1] === 'number')
  );
}

function normalizeFlow(value: unknown, workspace: WorkspaceSnapshot): ProductionFlow | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<ProductionFlow>;
  if (candidate.schemaVersion !== 1 || !candidate.stages || typeof candidate.stages !== 'object') return null;

  const stages = Object.fromEntries(
    PRODUCTION_STAGE_ORDER.map((stage) => [stage, normalizeStageRecord(candidate.stages?.[stage])])
  ) as Record<ProductionStageId, ProductionStageRecord>;
  const currentStage = PRODUCTION_STAGE_ORDER.includes(candidate.currentStage as ProductionStageId)
    ? candidate.currentStage as ProductionStageId
    : 'script';

  return {
    schemaVersion: 1,
    currentStage,
    stages,
    videoJobs: Array.isArray(candidate.videoJobs) ? candidate.videoJobs.map((job) => ({ ...job })) : [],
    finalCut: normalizeFinalCutState(candidate.finalCut)
  };
}

function cloneFlow(flow: ProductionFlow): ProductionFlow {
  return {
    ...flow,
    stages: Object.fromEntries(
      PRODUCTION_STAGE_ORDER.map((stage) => [
        stage,
        { ...flow.stages[stage], sourceVersions: { ...flow.stages[stage].sourceVersions } }
      ])
    ) as Record<ProductionStageId, ProductionStageRecord>,
    videoJobs: flow.videoJobs.map((job) => ({ ...job })),
    finalCut: flow.finalCut ? { ...flow.finalCut } : null
  };
}

function sameSourceVersions(left: Record<string, number>, right: Record<string, number>): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length && leftKeys.every((key) => left[key] === right[key]);
}

function stageAssetError(workspace: WorkspaceSnapshot, stage: ProductionStageId): string | null {
  const path = STAGE_ASSET_PATH[stage];
  const file = workspace.files.find((item) => item.path === path);
  if (!file) return `已确认阶段缺少规范文件：${path}`;
  if (!path.endsWith('.json')) return null;

  try {
    JSON.parse(file.content);
    return null;
  } catch {
    return `已确认阶段规范文件无法解析：${path}`;
  }
}

function validateConfirmedAssets(flow: ProductionFlow, workspace: WorkspaceSnapshot): ProductionFlow {
  const next = cloneFlow(flow);
  let invalidStage: ProductionStageId | null = null;

  for (const stage of PRODUCTION_STAGE_ORDER) {
    if (invalidStage) {
      next.stages[stage] = { ...next.stages[stage], status: 'stale', error: null };
      continue;
    }

    if (next.stages[stage].status !== 'confirmed') continue;
    const error = stageAssetError(workspace, stage);
    if (!error) continue;

    invalidStage = stage;
    next.currentStage = stage;
    next.stages[stage] = { ...next.stages[stage], status: 'failed', error };
  }

  return next;
}

export function productionFlowFromWorkspace(workspace: WorkspaceSnapshot | null): ProductionFlow {
  if (!workspace) return defaultFlow(null);
  const flowFile = workspace.files.find((file) => file.path === PRODUCTION_FLOW_PATH);
  if (!flowFile) return defaultFlow(workspace);

  // 这个 catch 只该兜「文件不是合法 JSON」。以前它把整段都包住，
  // 于是 RangeError 之类的真实故障被吞掉、再由 defaultFlow 在耗尽的栈上重新抛出，
  // 报错位置指向一个和病因毫无关系的地方，完全没法排查。
  let parsed: unknown;
  try {
    parsed = JSON.parse(flowFile.content);
  } catch {
    return defaultFlow(workspace);
  }

  const flow = normalizeFlow(parsed, workspace);
  return flow ? validateConfirmedAssets(flow, workspace) : defaultFlow(workspace);
}

export function visibleProductionStages(flow: ProductionFlow): ProductionStageId[] {
  return PRODUCTION_STAGE_ORDER.filter((stage) => flow.stages[stage].status !== 'locked');
}

export function canOpenProductionStage(flow: ProductionFlow, stage: ProductionStageId): boolean {
  return flow.stages[stage].status !== 'locked';
}

export function nextProductionStage(stage: ProductionStageId): ProductionStageId | null {
  const index = PRODUCTION_STAGE_ORDER.indexOf(stage);
  return PRODUCTION_STAGE_ORDER[index + 1] || null;
}

export function beginStageGeneration(
  flow: ProductionFlow,
  stage: ProductionStageId,
  generationJobId: string,
  sourceVersions: Record<string, number>
): ProductionFlow {
  const record = flow.stages[stage];
  if (
    record.status === 'generating' &&
    record.generationJobId === generationJobId &&
    sameSourceVersions(record.sourceVersions, sourceVersions)
  ) {
    return flow;
  }

  const stageIndex = PRODUCTION_STAGE_ORDER.indexOf(stage);
  if (stageIndex > 0) {
    const predecessor = PRODUCTION_STAGE_ORDER[stageIndex - 1];
    if (flow.stages[predecessor].status !== 'confirmed') {
      throw new Error('当前阶段尚未解锁');
    }
  }

  const next = cloneFlow(flow);
  next.currentStage = stage;
  next.stages[stage] = {
    ...next.stages[stage],
    status: 'generating',
    generationJobId,
    sourceVersions: { ...sourceVersions },
    error: null
  };
  return next;
}

export function completeStageGeneration(
  flow: ProductionFlow,
  stage: ProductionStageId,
  generationJobId: string,
  sourceVersions: Record<string, number>
): { accepted: boolean; flow: ProductionFlow } {
  const record = flow.stages[stage];
  if (
    record.status !== 'generating' ||
    record.generationJobId !== generationJobId ||
    !sameSourceVersions(record.sourceVersions, sourceVersions)
  ) {
    return { accepted: false, flow };
  }

  const next = cloneFlow(flow);
  next.currentStage = stage;
  next.stages[stage] = {
    ...next.stages[stage],
    status: 'ready_for_review',
    draftVersion: (next.stages[stage].draftVersion || 0) + 1,
    error: null
  };
  return { accepted: true, flow: next };
}

export function failStageGeneration(
  flow: ProductionFlow,
  stage: ProductionStageId,
  generationJobId: string,
  error: string
): ProductionFlow {
  const record = flow.stages[stage];
  if (record.status !== 'generating' || record.generationJobId !== generationJobId) return flow;

  const next = cloneFlow(flow);
  next.currentStage = stage;
  next.stages[stage] = {
    ...next.stages[stage],
    status: 'failed',
    error
  };
  return next;
}

/** 已经提交到上游、或已经渲染完成的镜头 —— 这些是花过钱的，清空即永久损失。 */
function hasBillableVideoJobs(flow: ProductionFlow): boolean {
  return (flow.videoJobs || []).some((job) => job.status === 'completed' || Boolean(job.providerTaskId));
}

/**
 * 只针对 generating：这个状态的生成跑在页面进程里，刷新就永久丢了，没有任何外部句柄能恢复。
 * video 阶段一度被整个排除在外，本意是保护正在渲染的批次——但渲染中的状态是 rendering，
 * 本来就不在筛选范围内。排除的实际效果是：视频任务提示词生成一旦被刷新打断，
 * 就永远停在「正在生成视频任务」，而刷新恰恰是唯一的恢复入口，于是怎么刷都出不来。
 */
export function interruptUnrecoverableStageGenerations(flow: ProductionFlow): ProductionFlow {
  const interruptedStages = PRODUCTION_STAGE_ORDER.filter(
    (stage) => flow.stages[stage].status === 'generating'
  );
  if (interruptedStages.length === 0) return flow;

  const next = cloneFlow(flow);
  for (const stage of interruptedStages) {
    // 视频阶段一旦已经有付过钱的产出，就绝不能提示「请重新生成」：用户照做会走
    // prepareVideoTaskDraft，那一步 videoJobs 直接清空，已经渲染完的片段和它们的
    // 上游任务 ID 一起消失，钱白花且再也找不回来。这种脏 generating 交回渲染态，
    // 由 videoBatchStatus 按 job 的真实情况接管。
    if (stage === 'video' && hasBillableVideoJobs(flow)) {
      next.stages.video = { ...next.stages.video, status: 'rendering', error: null };
      continue;
    }
    next.stages[stage] = {
      ...next.stages[stage],
      status: 'failed',
      error: '上次生成已中断，请重新生成'
    };
  }
  next.currentStage = interruptedStages.includes(flow.currentStage)
    ? flow.currentStage
    : interruptedStages[0];
  return next;
}

export function markStageDraft(
  flow: ProductionFlow,
  input: { stage: ProductionStageId; generationJobId: string; sourceVersions: Record<string, number> }
): ProductionFlow {
  const stageIndex = PRODUCTION_STAGE_ORDER.indexOf(input.stage);
  const current = flow.stages[input.stage];
  const isCurrentGeneration =
    current.status === 'generating' &&
    current.generationJobId === input.generationJobId &&
    sameSourceVersions(current.sourceVersions, input.sourceVersions);
  if (!isCurrentGeneration) return flow;

  const next = cloneFlow(flow);
  next.currentStage = input.stage;
  next.stages[input.stage] = {
    ...current,
    status: 'ready_for_review',
    draftVersion: (current.draftVersion || 0) + 1,
    confirmedVersion: null,
    confirmedAt: null,
    confirmedBy: null,
    confirmationKey: null,
    generationJobId: input.generationJobId,
    sourceVersions: { ...input.sourceVersions },
    error: null
  };

  for (let index = stageIndex + 1; index < PRODUCTION_STAGE_ORDER.length; index += 1) {
    const stage = PRODUCTION_STAGE_ORDER[index];
    if (next.stages[stage].status !== 'locked') {
      next.stages[stage] = { ...next.stages[stage], status: 'stale', error: null };
    }
  }

  return next;
}

export function confirmFlowStage(flow: ProductionFlow, input: ConfirmStageInput): ProductionFlow {
  const current = flow.stages[input.stage];
  if (current.confirmationKey === input.confirmationKey) return flow;
  if (current.status !== 'ready_for_review') {
    throw new Error('当前阶段不处于待确认状态');
  }
  if (current.draftVersion !== input.expectedDraftVersion) {
    throw new Error('草稿版本已经变化，请刷新后重试');
  }

  const next = cloneFlow(flow);
  next.stages[input.stage] = {
    ...next.stages[input.stage],
    status: 'confirmed',
    confirmedVersion: input.expectedDraftVersion,
    confirmedAt: input.confirmedAt,
    confirmedBy: input.confirmedBy,
    confirmationKey: input.confirmationKey,
    sourceVersions: { ...input.sourceVersions },
    error: null
  };

  const downstream = nextProductionStage(input.stage);
  if (!downstream) {
    next.currentStage = input.stage;
    return next;
  }

  next.currentStage = downstream;
  next.stages[downstream] = {
    ...next.stages[downstream],
    status: 'generating',
    generationJobId: input.nextGenerationJobId,
    sourceVersions: { ...input.sourceVersions },
    error: null
  };
  return next;
}

export function writeProductionFlow(workspace: WorkspaceSnapshot, flow: ProductionFlow): WorkspaceSnapshot {
  const existingIndex = workspace.files.findIndex((file) => file.path === PRODUCTION_FLOW_PATH);
  const existing = workspace.files[existingIndex];
  const nextFile = {
    path: PRODUCTION_FLOW_PATH,
    kind: 'json' as const,
    content: JSON.stringify(flow, null, 2),
    version: (existing?.version || 0) + 1,
    updatedAt: new Date().toISOString()
  };
  const files = [...workspace.files];
  if (existingIndex >= 0) files[existingIndex] = nextFile;
  else files.push(nextFile);
  return { ...workspace, files };
}

export function updateProductionFlow(
  workspace: WorkspaceSnapshot,
  update: (flow: ProductionFlow) => ProductionFlow
): WorkspaceSnapshot {
  return writeProductionFlow(workspace, update(productionFlowFromWorkspace(workspace)));
}
