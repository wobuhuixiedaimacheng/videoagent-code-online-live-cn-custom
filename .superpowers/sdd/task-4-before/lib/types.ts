export type WorkspaceMode = 'creator' | 'smb';

export type WorkflowKind =
  | 'generate'
  | 'rewrite'
  | 'weekly'
  | 'brand'
  | 'viral_ref'
  | 'topic'
  | 'scene'
  | 'script'
  | 'shot'
  | 'prompt'
  | 'platform'
  | 'compliance'
  | 'approval'
  | 'competitor'
  | 'hotspot'
  | 'titles'
  | 'cta'
  | 'live_clip'
  | 'image_note'
  | 'ad_variants'
  | 'multiplatform'
  | 'calendar';

export type AIGCAgentId =
  | 'orchestrator'
  | 'creative_director'
  | 'brief'
  | 'viral_ref'
  | 'scene'
  | 'script'
  | 'shot'
  | 'editor'
  | 'prompt'
  | 'platform'
  | 'compliance'
  | 'data'
  | 'review';

export type WorkspaceFile = {
  path: string;
  kind: 'json' | 'markdown' | 'asset' | 'render' | 'config';
  content: string;
  version: number;
  updatedAt: string;
};

export type WorkspaceSnapshot = {
  projectId: string;
  title: string;
  branch: string;
  mode: WorkspaceMode;
  activeWorkflow: WorkflowKind;
  files: WorkspaceFile[];
  currentTimelineVersion: number;
  complianceStatus: 'pass' | 'warning' | 'blocked';
};

export type ProductionStageId = 'script' | 'character' | 'scene' | 'storyboard' | 'video';

export type ProductionStageStatus =
  | 'locked'
  | 'generating'
  | 'ready_for_review'
  | 'confirmed'
  | 'stale'
  | 'rendering'
  | 'completed'
  | 'failed';

export type ProductionStageRecord = {
  status: ProductionStageStatus;
  draftVersion: number | null;
  confirmedVersion: number | null;
  confirmedAt: string | null;
  confirmedBy: string | null;
  confirmationKey: string | null;
  generationJobId: string | null;
  sourceVersions: Record<string, number>;
  error: string | null;
};

export type ProductionFlow = {
  schemaVersion: 1;
  currentStage: ProductionStageId;
  stages: Record<ProductionStageId, ProductionStageRecord>;
  videoJobs: VideoRenderJob[];
};

export type VideoRenderJob = {
  id: string;
  promptId: string;
  status: 'ready' | 'submitting' | 'submitted' | 'polling' | 'completed' | 'failed';
  attempt: number;
  providerTaskId?: string;
  videoUrl?: string;
  progress?: number;
  error?: string;
};

export type AgentMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
};

export type ToolEvent = {
  id: string;
  toolName: string;
  status: 'pending' | 'running' | 'success' | 'warning' | 'failed' | 'blocked' | 'approval_required';
  title: string;
  summary?: string;
};

export type AgentEvent = {
  id: string;
  agentId: AIGCAgentId;
  agentName: string;
  status: 'pending' | 'running' | 'success' | 'warning' | 'blocked';
  action: string;
  output?: string;
};

export type AIGCSkill = {
  id: WorkflowKind;
  tier: 'P0' | 'P1';
  title: string;
  description: string;
  command: string;
  agentIds: AIGCAgentId[];
  outputFiles: string[];
};

export type MissionAsset = {
  id: string;
  type:
    | 'brief'
    | 'reference'
    | 'scene'
    | 'script'
    | 'shot'
    | 'timeline'
    | 'prompt'
    | 'copy'
    | 'compliance'
    | 'feedback'
    | 'calendar';
  title: string;
  status: 'draft' | 'ready' | 'warning' | 'blocked';
  filePath: string;
  summary: string;
};

export type ContextItem = {
  id: string;
  label: string;
  filePath: string;
  status: 'ready' | 'missing' | 'warning';
  summary: string;
};

export type AgentDefinition = {
  id: AIGCAgentId;
  name: string;
  role: string;
  description: string;
  accent: 'green' | 'blue' | 'amber' | 'red' | 'dark';
};

export type PatchOperation = {
  id: string;
  filePath: string;
  summary: string;
  before: string;
  after: string;
  riskLevel: 'low' | 'medium' | 'high';
  requiresApproval: boolean;
};

export type ComplianceCheck = {
  id: string;
  type: 'ai_disclosure' | 'marketing_claim' | 'asset_rights' | 'likeness_rights' | 'sensitive_industry' | 'platform_policy';
  status: 'pass' | 'warning' | 'blocked';
  message: string;
};

export type PreviewScene = {
  id: string;
  title: string;
  visual: string;
  subtitle: string;
  durationSeconds: number;
};

export type CharacterVariantAsset = {
  id: string;
  label: string;
  ageLabel: string;
  wardrobe: string;
  primaryImageUrl: string;
  multiViewImageUrl?: string;
  expressionSheetImageUrl?: string;
};

export type CharacterAsset = {
  id: string;
  name: string;
  role: string;
  required: boolean;
  description: string;
  consistencyPrompt: string;
  negativePrompt: string;
  faceAnchorVariantId: string;
  referenceStrategy: 'face_id' | 'multi_view' | 'replace_reference';
  expressionIds: string[];
  variants: CharacterVariantAsset[];
};

export type CharactersFile = { characters: CharacterAsset[] };

export type SceneAsset = PreviewScene & {
  location: string;
  timeOfDay: string;
  lighting: string;
  palette: string;
  characterIds: string[];
  prompt: string;
  referenceImageUrl: string;
};

export type PreviewState = {
  title: string;
  subtitle: string;
  cta: string;
  durationSeconds: number;
  timelineVersion: number;
  platform: string;
  mode: WorkspaceMode;
  workflow: WorkflowKind;
  scenes: PreviewScene[];
};

export type AgentRunRequest = {
  instruction: string;
  workspace: WorkspaceSnapshot;
  history: AgentMessage[];
  workflow?: WorkflowKind;
};

export type AgentRunResponse = {
  mode: 'live' | 'mock';
  provider: 'anthropic' | 'openai' | 'custom' | 'mock';
  assistantMessage: string;
  plan: string[];
  toolEvents: ToolEvent[];
  agentEvents: AgentEvent[];
  assets: MissionAsset[];
  patchOperations: PatchOperation[];
  complianceChecks: ComplianceCheck[];
  preview: PreviewState;
  notes: string[];
};
