import type { AgentRunRequest, PatchOperation, ProductionStageId, WorkspaceSnapshot } from './types';
import { productionFlowFromWorkspace, PRODUCTION_STAGE_ORDER } from './productionFlow';
import { stageConfig, stagePromptContextFiles } from './stageGeneration';
import { validateScriptStageBundle } from './scriptStageValidation';
import { PENDING_PATCHES_PATH, readPendingPatches } from './workspaceDrafts';
import { applyPatchToWorkspace, upsertWorkspaceFile } from './workspace';
import { CANVAS_NOTES_PATH, canvasBoardsFromWorkspace, renderCanvasNotes } from './canvasBoards';

export type StagePromptWorkspaceResult = {
  workspace: WorkspaceSnapshot;
  warnings: string[];
};

function fileContent(workspace: WorkspaceSnapshot, filePath: string): string {
  return workspace.files.find((file) => file.path === filePath)?.content || '';
}

function stagesForFile(filePath: string): ProductionStageId[] {
  return PRODUCTION_STAGE_ORDER.filter((stage) => stageConfig(stage).outputFiles.includes(filePath));
}

function isTrustedPatch(
  patch: PatchOperation,
  req: AgentRunRequest,
  currentStageJobId: string | null
): { trusted: boolean; warning?: string } {
  const stage = req.productionStage;
  if (!stage || !stageConfig(stage).outputFiles.includes(patch.filePath)) {
    return { trusted: false };
  }

  if (patch.origin?.kind === 'agent_stage') {
    if (patch.origin.productionStage !== stage) {
      return { trusted: false, warning: `忽略错误 stage 草稿：${patch.filePath}` };
    }
    if (!currentStageJobId || patch.origin.generationJobId !== currentStageJobId) {
      return { trusted: false, warning: `忽略错误 job 草稿：${patch.filePath}` };
    }
    return { trusted: true };
  }

  if (patch.origin?.kind === 'manual') {
    if (patch.origin.productionStage !== stage) {
      return { trusted: false, warning: `忽略错误 stage 的手动草稿：${patch.filePath}` };
    }
    if (!currentStageJobId || patch.origin.generationJobId !== currentStageJobId) {
      return { trusted: false, warning: `忽略错误 job 的手动草稿：${patch.filePath}` };
    }
    return { trusted: true };
  }

  const flow = productionFlowFromWorkspace(req.workspace);
  const record = flow.stages[stage];
  const safeLegacy =
    stagesForFile(patch.filePath).length === 1 &&
    (record.status === 'ready_for_review' || record.status === 'failed') &&
    Boolean(record.generationJobId) &&
    patch.before === fileContent(req.workspace, patch.filePath);
  return safeLegacy
    ? { trusted: true }
    : { trusted: false, warning: `忽略无法确认来源的旧草稿：${patch.filePath}` };
}

function promptOnlyWorkspace(workspace: WorkspaceSnapshot, stage: ProductionStageId): WorkspaceSnapshot {
  const allowed = new Set(stagePromptContextFiles(stage));
  return {
    ...workspace,
    files: workspace.files.filter((file) => allowed.has(file.path) && file.path !== PENDING_PATCHES_PATH)
  };
}

export function stagePromptWorkspace(req: AgentRunRequest): StagePromptWorkspaceResult {
  const stage = req.productionStage;
  if (!stage) return { workspace: req.workspace, warnings: [] };

  const warnings: string[] = [];
  let workspace = req.workspace;
  if (stage === 'script' && (req.stageRequestMode === 'regenerate' || req.stageRequestMode === 'revise')) {
    const flow = productionFlowFromWorkspace(req.workspace);
    const currentStageJobId = flow.stages.script.generationJobId;
    const requestedDraftFiles = new Set(
      Array.isArray(req.requestedOutputFiles)
        ? req.requestedOutputFiles.filter((filePath) => stageConfig('script').outputFiles.includes(filePath))
        : stageConfig('script').outputFiles
    );
    const trusted = readPendingPatches(req.workspace).filter((patch) => {
      if (!requestedDraftFiles.has(patch.filePath)) return false;
      const decision = isTrustedPatch(patch, req, currentStageJobId);
      if (decision.warning) warnings.push(decision.warning);
      return decision.trusted;
    });
    if (trusted.length) {
      const proposed = applyPatchToWorkspace(req.workspace, trusted, req.workspace.complianceStatus);
      const scriptIssues = validateScriptStageBundle({
        briefJson: fileContent(proposed, 'brief.json'),
        campaignGoalJson: fileContent(proposed, 'campaign_goal.json'),
        scriptMarkdown: fileContent(proposed, 'script.md')
      });
      const poisonedIssues = scriptIssues.filter((issue) => /占位|内部阶段控制指令|控制指令/.test(issue));
      const isScriptOnly = requestedDraftFiles.size === 1 && requestedDraftFiles.has('script.md');
      const rejectedIssues = isScriptOnly ? scriptIssues : poisonedIssues;
      if (rejectedIssues.length) {
        warnings.push(`隔离无效或冲突旧草稿：${rejectedIssues.join('；')}`);
      } else {
        workspace = proposed;
      }
    }
  }

  return { workspace: promptOnlyWorkspace(withCanvasNotes(workspace, stage), stage), warnings };
}

/**
 * 把用户标记为「参与生成」的便签合成成一个只在提示词里存在的文件。
 *
 * 合成而不是落盘：真源是 canvas-boards.json 里的便签本身。存成第二份文件的话，
 * 改了便签忘了同步这里，模型看到的就是过期的要求——而界面上完全看不出来。
 * 没有可用便签时不生成这个文件，免得模型看到一个空章节，误以为用户什么都没交代。
 */
function withCanvasNotes(workspace: WorkspaceSnapshot, stage: ProductionStageId): WorkspaceSnapshot {
  const notes = renderCanvasNotes(canvasBoardsFromWorkspace(workspace), stage);
  if (!notes) return workspace;
  return upsertWorkspaceFile(workspace, CANVAS_NOTES_PATH, notes, 'markdown');
}
