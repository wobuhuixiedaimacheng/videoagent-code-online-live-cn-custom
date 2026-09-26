import type { PatchOperation, ProductionStageId, WorkspaceSnapshot } from './types';
import { productionFlowFromWorkspace, PRODUCTION_STAGE_ORDER } from './productionFlow';
import { stageConfig } from './stageGeneration';
import { validateScriptStageBundle } from './scriptStageValidation';
import { applyPatchToWorkspace } from './workspace';

/**
 * 一条草稿被隔离的真实原因，按阶段和文件挂好。
 * 界面以前只能显示一句写死的兜底文案（「检测到占位内容或不完整的历史结果」），
 * 而隔离条件里根本没有占位内容检测——用户看到的是一个猜错的原因。
 */
export type QuarantineNote = {
  filePath: string;
  stage: ProductionStageId;
  reason: string;
};

export type PendingPatchReviewState = {
  reviewable: PatchOperation[];
  superseded: PatchOperation[];
  quarantined: PatchOperation[];
  quarantineNotes: QuarantineNote[];
  issues: string[];
};

function productionStageForFile(filePath: string): ProductionStageId | null {
  return PRODUCTION_STAGE_ORDER.find((stage) => stageConfig(stage).outputFiles.includes(filePath)) || null;
}

export function patchesOwnedByCurrentStageJob(
  workspace: WorkspaceSnapshot,
  patches: PatchOperation[],
  stage: ProductionStageId
): PatchOperation[] {
  const record = productionFlowFromWorkspace(workspace).stages[stage];
  if (!record.generationJobId) return [];
  const outputFiles = new Set(stageConfig(stage).outputFiles);
  return patches.filter((patch) =>
    outputFiles.has(patch.filePath) &&
    Boolean(patch.origin) &&
    patch.origin?.productionStage === stage &&
    patch.origin?.generationJobId === record.generationJobId
  );
}

function belongsToActiveReviewJob(
  patch: PatchOperation,
  stage: ProductionStageId,
  workspace: WorkspaceSnapshot
): boolean {
  const flow = productionFlowFromWorkspace(workspace);
  const record = flow.stages[stage];
  if (flow.currentStage !== stage || record.status !== 'ready_for_review') return false;

  if (!patch.origin) return false;
  if (patch.origin.productionStage && patch.origin.productionStage !== stage) return false;

  if (patch.origin.kind === 'agent_stage') {
    return Boolean(
      record.generationJobId &&
      patch.origin.productionStage === stage &&
      patch.origin.generationJobId === record.generationJobId
    );
  }

  return Boolean(
    record.generationJobId &&
    patch.origin.productionStage === stage &&
    patch.origin.generationJobId === record.generationJobId
  );
}

function fileContent(workspace: WorkspaceSnapshot, filePath: string): string {
  return workspace.files.find((file) => file.path === filePath)?.content || '';
}

function validateCandidateScriptBundle(
  workspace: WorkspaceSnapshot,
  patches: PatchOperation[]
): string[] {
  const candidate = applyPatchToWorkspace(workspace, patches, workspace.complianceStatus);
  return validateScriptStageBundle({
    briefJson: fileContent(candidate, 'brief.json'),
    campaignGoalJson: fileContent(candidate, 'campaign_goal.json'),
    scriptMarkdown: fileContent(candidate, 'script.md')
  });
}

export function classifyPendingPatchesForReview(
  workspace: WorkspaceSnapshot,
  patches: PatchOperation[]
): PendingPatchReviewState {
  const reviewable: PatchOperation[] = [];
  const superseded: PatchOperation[] = [];
  const quarantined: PatchOperation[] = [];
  const quarantineNotes: QuarantineNote[] = [];
  const scriptCandidates: PatchOperation[] = [];
  const legacyScriptCandidates: PatchOperation[] = [];
  const issues: string[] = [];

  for (const patch of patches) {
    const stage = productionStageForFile(patch.filePath);
    if (!stage) {
      reviewable.push(patch);
      continue;
    }

    if (!patch.origin) {
      quarantined.push(patch);
      quarantineNotes.push({ filePath: patch.filePath, stage, reason: '这份草稿缺少可验证的生成来源' });
      if (stage === 'script') legacyScriptCandidates.push(patch);
      else issues.push(`历史草稿缺少可验证来源：${patch.filePath}`);
      continue;
    }

    if (patch.origin.kind === 'manual' && (!patch.origin.productionStage || !patch.origin.generationJobId)) {
      quarantined.push(patch);
      quarantineNotes.push({ filePath: patch.filePath, stage, reason: '这份手动草稿缺少完整的 stage/job 来源' });
      issues.push(`历史手动草稿缺少完整 stage/job 来源：${patch.filePath}`);
      continue;
    }

    if (!belongsToActiveReviewJob(patch, stage, workspace)) {
      superseded.push(patch);
      continue;
    }

    if (stage === 'script') scriptCandidates.push(patch);
    else reviewable.push(patch);
  }

  if (legacyScriptCandidates.length) {
    issues.push('历史脚本草稿缺少可验证来源，必须重新生成后才能审批');
    issues.push(...validateCandidateScriptBundle(workspace, legacyScriptCandidates));
  }

  const currentIssues = scriptCandidates.length
    ? validateCandidateScriptBundle(workspace, scriptCandidates)
    : [];
  issues.push(...currentIssues);
  if (currentIssues.length) {
    quarantined.push(...scriptCandidates);
    for (const patch of scriptCandidates) {
      quarantineNotes.push({
        filePath: patch.filePath,
        stage: 'script',
        reason: `脚本没有通过一致性校验：${currentIssues.join('；')}`
      });
    }
  } else {
    reviewable.push(...scriptCandidates);
  }

  return { reviewable, superseded, quarantined, quarantineNotes, issues };
}
