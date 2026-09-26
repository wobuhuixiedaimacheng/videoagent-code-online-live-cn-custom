import type { PatchOperation, ProductionStageId, WorkspaceSnapshot } from './types';
import { applyPatchToWorkspace, upsertWorkspaceFile } from './workspace';
import {
  confirmFlowStage,
  productionFlowFromWorkspace,
  type ConfirmStageInput,
  writeProductionFlow
} from './productionFlow';

export const PENDING_PATCHES_PATH = '.aigc/pending_patches.json';

function isPatchOperation(value: unknown): value is PatchOperation {
  if (!value || typeof value !== 'object') return false;
  const patch = value as Partial<PatchOperation>;
  const origin = patch.origin;
  const validStages: ProductionStageId[] = ['script', 'character', 'scene', 'storyboard', 'video'];
  const validOrigin = origin === undefined || Boolean(
    origin &&
    typeof origin === 'object' &&
    (origin.kind === 'agent_stage' || origin.kind === 'manual') &&
    (origin.productionStage === undefined || validStages.includes(origin.productionStage)) &&
    (origin.generationJobId === undefined || typeof origin.generationJobId === 'string') &&
    (origin.templateFallback === undefined ||
      origin.templateFallback === 'missing' ||
      origin.templateFallback === 'invalid' ||
      origin.templateFallback === 'repaired')
  );
  return (
    typeof patch.id === 'string' &&
    typeof patch.filePath === 'string' &&
    typeof patch.summary === 'string' &&
    typeof patch.before === 'string' &&
    typeof patch.after === 'string' &&
    (patch.riskLevel === 'low' || patch.riskLevel === 'medium' || patch.riskLevel === 'high') &&
    typeof patch.requiresApproval === 'boolean' &&
    validOrigin
  );
}

export function readPendingPatches(workspace: WorkspaceSnapshot | null): PatchOperation[] {
  const content = workspace?.files.find((file) => file.path === PENDING_PATCHES_PATH)?.content;
  if (!content) return [];

  try {
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed.filter(isPatchOperation) : [];
  } catch {
    return [];
  }
}

export function savePendingPatches(workspace: WorkspaceSnapshot, patches: PatchOperation[]): WorkspaceSnapshot {
  return upsertWorkspaceFile(workspace, PENDING_PATCHES_PATH, JSON.stringify(patches, null, 2), 'json');
}

export function appendPendingPatches(workspace: WorkspaceSnapshot, patches: PatchOperation[]): WorkspaceSnapshot {
  const latestByFile = new Map<string, PatchOperation>();
  for (const patch of readPendingPatches(workspace)) latestByFile.set(patch.filePath, patch);
  for (const patch of patches) latestByFile.set(patch.filePath, patch);
  return savePendingPatches(workspace, [...latestByFile.values()]);
}

export function pendingPatchesForFiles(workspace: WorkspaceSnapshot, filePaths: string[]): PatchOperation[] {
  const paths = new Set(filePaths);
  return readPendingPatches(workspace).filter((patch) => paths.has(patch.filePath));
}

export function autopilotPatchesForRun(
  workspace: WorkspaceSnapshot,
  currentRunPatches: PatchOperation[]
): PatchOperation[] {
  const currentRunIds = new Set(
    currentRunPatches.filter((patch) => patch.riskLevel === 'low').map((patch) => patch.id)
  );
  return readPendingPatches(workspace).filter(
    (patch) => patch.riskLevel === 'low' && currentRunIds.has(patch.id)
  );
}

export function applyPatchesForPreview(
  workspace: WorkspaceSnapshot | null,
  patches: PatchOperation[]
): WorkspaceSnapshot | null {
  if (!workspace || !patches.length) return workspace;
  return applyPatchToWorkspace(workspace, patches, workspace.complianceStatus);
}

export function consumePendingPatches(
  workspace: WorkspaceSnapshot,
  filePaths: string[],
  complianceStatus: WorkspaceSnapshot['complianceStatus'] = workspace.complianceStatus
): { workspace: WorkspaceSnapshot; applied: PatchOperation[] } {
  const paths = new Set(filePaths);
  const pending = readPendingPatches(workspace);
  const applied = pending.filter((patch) => paths.has(patch.filePath));
  if (!applied.length) return { workspace, applied };

  const remaining = pending.filter((patch) => !paths.has(patch.filePath));
  const withAppliedPatches = applyPatchToWorkspace(workspace, applied, complianceStatus);
  return { workspace: savePendingPatches(withAppliedPatches, remaining), applied };
}

export function confirmStageInWorkspace(
  workspace: WorkspaceSnapshot,
  input: ConfirmStageInput & { outputFiles: string[] }
): { workspace: WorkspaceSnapshot; applied: PatchOperation[] } {
  const flow = productionFlowFromWorkspace(workspace);
  const generationJobId = flow.stages[input.stage].generationJobId;
  const outputFiles = new Set(input.outputFiles);
  const stagePatches = readPendingPatches(workspace).filter((patch) => outputFiles.has(patch.filePath));
  if (!generationJobId || !stagePatches.length) {
    throw new Error('当前阶段没有可确认的待审 patch');
  }
  const invalidOrigin = stagePatches.find((patch) =>
    !patch.origin ||
    patch.origin.productionStage !== input.stage ||
    patch.origin.generationJobId !== generationJobId
  );
  if (invalidOrigin) {
    throw new Error(`待审 patch 不属于当前 generation job：${invalidOrigin.filePath}`);
  }
  const consumed = consumePendingPatches(workspace, input.outputFiles);
  const confirmedFlow = confirmFlowStage(productionFlowFromWorkspace(consumed.workspace), input);
  return { workspace: writeProductionFlow(consumed.workspace, confirmedFlow), applied: consumed.applied };
}
