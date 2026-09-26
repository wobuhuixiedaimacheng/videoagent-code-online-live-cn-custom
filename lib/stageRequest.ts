import type {
  AgentMessage,
  AgentRunRequest,
  GenreId,
  ProductionStageId,
  StageRequestMode,
  StageRequestTarget,
  WorkflowKind,
  WorkspaceSnapshot
} from './types';

export type BuildStageRunRequestInput = {
  stage: ProductionStageId;
  workspace: WorkspaceSnapshot;
  instruction: string;
  history: AgentMessage[];
  generationJobId: string;
  sourceVersions: Record<string, number>;
  workflow: WorkflowKind;
  genre?: GenreId;
  stageBatch?: AgentRunRequest['stageBatch'];
  stageRequestMode?: StageRequestMode;
  stageRequestTarget?: StageRequestTarget;
  requestedOutputFiles?: string[];
};

export function buildStageRunRequest(input: BuildStageRunRequestInput): AgentRunRequest {
  return {
    instruction: input.instruction,
    workspace: input.workspace,
    history: input.history,
    workflow: input.workflow,
    genre: input.genre || 'auto',
    stageBatch: input.stageBatch,
    productionStage: input.stage,
    generationJobId: input.generationJobId,
    sourceVersions: input.sourceVersions,
    stageRequestMode: input.stageRequestMode || 'initial',
    stageRequestTarget: input.stageRequestTarget || 'artifact',
    requestedOutputFiles: input.requestedOutputFiles
  };
}
