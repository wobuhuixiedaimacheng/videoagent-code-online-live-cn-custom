import type { CharacterVisualSpec } from './characterVisualSpec';
import type { SceneInstance, SceneMaster } from './sceneVisualSpec';
import type { PhysicsMode } from './shotPhysics';
import type { StageBatch } from './storyboardBatch';
import type { VideoQaRetryStrategy, VideoQaVerdict } from './videoQa';
import type { FinalCutState } from './videoStitch';

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
  | 'motion_director'
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

/**
 * 用户在派发面板上选的片种。这不是 WorkflowKind：workflow 说的是「这一步在做什么」，
 * genre 说的是「整个项目是什么类型的片子」，两者正交，同一个 genre 会横跨五个阶段。
 * 真源在 lib/genreSkillRouter，UI 的选项列表也从那里读。
 */
export type GenreId = 'auto' | 'product' | 'drama' | 'rewrite' | 'note' | 'weekly' | 'multi' | 'videogen';

export type ProductionStageStatus =
  | 'locked'
  | 'generating'
  | 'ready_for_review'
  | 'confirmed'
  | 'stale'
  | 'rendering'
  // 片段渲染完了但还没过画面质检。它和 completed 的区别是实打实的：
  // 没有这一档，一段六根手指的视频会直接以「已完成」推给用户。
  | 'qa_pending'
  | 'qa_failed'
  // 片段都过了，正在被 ffmpeg 拼成单一成片文件。它和 rendering 是两件事：
  // 合成不再向模型要任何东西，失败了也不会浪费已经付过的渲染费。
  | 'stitching'
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
  /** 最近一次成片合成。null 表示片段齐了但还没合成过。 */
  finalCut?: FinalCutState | null;
};

export type VideoRenderJob = {
  id: string;
  promptId: string;
  status: 'ready' | 'submitting' | 'submitted' | 'polling' | 'qa_pending' | 'qa_failed' | 'completed' | 'failed';
  /** provider 侧的提交次数，只被限流和网络抖动消耗。 */
  attempt: number;
  /** 画面质检不通过导致的重渲次数。必须和 attempt 分开：一次 429 不该吃掉画面重渲的预算。 */
  qaAttempt?: number;
  providerTaskId?: string;
  videoUrl?: string;
  progress?: number;
  error?: string;
  /** 来自 storyboard.json 的镜头意图。质检拿它决定判据松紧，缺省按最严的 realistic 处理。 */
  physicsMode?: PhysicsMode;
  durationSeconds?: number;
  /** 质检重渲时追加到提示词末尾的策略指令。存指令而不是整条提示词，提交时的拼装逻辑才不会失效。 */
  qaDirective?: string;
  /**
   * 这一次重渲用的是哪种策略。
   *
   * 只存指令文本是不够的：reanchor 要求把身份锚点图提到首帧，那是提交时才做的事，
   * 光靠追加在提示词末尾的一句话改不动参考图——而参考图恰恰是身份漂移的成因。
   */
  qaStrategy?: VideoQaRetryStrategy;
  qa?: VideoQaVerdict;
};

export type AgentMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  /** 缺省即普通消息；'handoff' 是阶段交接播报，渲染成独立样式。旧消息没有这个字段。 */
  kind?: 'handoff';
  handoff?: {
    fromStage: ProductionStageId;
    toStage: ProductionStageId;
  };
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

export type StageRequestMode = 'initial' | 'regenerate' | 'revise';
export type StageRequestTarget = 'stage' | 'artifact';

export type PatchOrigin = {
  kind: 'agent_stage' | 'manual';
  productionStage?: ProductionStageId;
  generationJobId?: string;
  /**
   * 模型没交出合格产物时，内容改由内置中文模板兜底生成。
   * 这类 patch 和真实模型输出长得一样，必须显式标出来，
   * 否则用户会把一份跟自己业务无关的通用文案当成 AI 写的。
   * 'missing' = 模型完全没产出这个文件；'invalid' = 产出了但没通过结构校验。
   */
  templateFallback?: TemplateFallbackReason;
};

/**
 * 'missing' = 模型完全没产出这个文件；'invalid' = 产出了但救不回来，整份换成模板；
 * 'repaired' = 模型产出的主体内容留着，只补了它漏掉的字段——人物仍然来自剧本，
 * 和前两种「内容与业务无关」有本质区别，不能混成同一句提示。
 */
export type TemplateFallbackReason = 'missing' | 'invalid' | 'repaired';

export type PatchOperation = {
  id: string;
  filePath: string;
  summary: string;
  before: string;
  after: string;
  riskLevel: 'low' | 'medium' | 'high';
  requiresApproval: boolean;
  origin?: PatchOrigin;
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
  /**
   * 这个镜头里人物说出口的中文台词，格式「角色名：台词」，多句用换行分隔。
   * 字段名是历史遗留（曾经装的是旁白口播），装的必须是对白——写成第三人称叙述，
   * 模型只能生成画外音，全片就会变成旁白片。缺了模型会自己即兴配音。
   */
  narration?: string;
  /**
   * 这个镜头的物理意图。夸张（stylized）和缺陷（realistic 下的崩坏）在画面上是同一类信号，
   * 只有分镜阶段记下意图，后面的自动质检才不会把爽点当 bug 干掉。
   */
  physicsMode?: PhysicsMode;
  /**
   * 这个镜头是从 scenes.json 里哪一场拆出来的。
   * 镜头是场次的下级，不是和场次并列的另一串东西——丢了这个字段，
   * 界面上二十个镜头就摊成一条没有归属的长队，用户看不出哪几个镜头在讲同一场。
   * 只有分镜产物有值；场次自己读出来时是空的。
   */
  sourceSceneId?: string;
  /**
   * 这一镜（或这一场）里出场的角色 id。界面上要把人挂到画面旁边，
   * 光有一句「陈雅琴面部近景」读不出这一镜到底谁在演。
   */
  characterIds?: string[];
  /**
   * 这个镜头自己的首帧图。空的时候只能退回场次主图——那是一场共用的一张，
   * 取景不一定对得上这一镜的景别，所以界面上必须标明是继承来的，不能冒充。
   */
  shotImageUrl?: string;
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
  /**
   * 脚本里对这个人的原始称呼（「前任A」「便利店店员」），只有在 name 是角色阶段起的名字时才有值。
   * 脚本人物名册和角色资产之间就靠它对照：没有它，随机起的名字在脚本里查无此人。
   */
  scriptAlias?: string;
  role: string;
  required: boolean;
  description: string;
  consistencyPrompt: string;
  negativePrompt: string;
  faceAnchorVariantId: string;
  referenceStrategy: 'face_id' | 'multi_view' | 'replace_reference';
  expressionIds: string[];
  variants: CharacterVariantAsset[];
  /**
   * 视觉设定画板的全部字段。角色卡上那句一句话描述撑不住一致性审查，
   * 身份锚点、头发、场景造型、表情库和出镜约束都存在这里。
   * 老工作区没有这个字段，读的时候会归一化成一份空设定，界面走空状态。
   */
  visual: CharacterVisualSpec;
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
  /**
   * 这一场用的是哪份场景母版。空间描述只存在母版里，场次不许自带一份——
   * 否则同一个客厅会有十二份互相漂移的描述，谁也不是谁的依据。
   * 老工作区没有这个字段，读的时候按地点自动派生母版并回填。
   */
  sceneMasterId: string;
  /**
   * 场次状态：剧情、环境、光影、临时道具、人物调度、声音和镜头。
   * 只装「这一场和母版有什么不同」，空间本身不重复存。
   */
  instance: SceneInstance;
};

/**
 * scenes.json 的顶层形状。
 * sceneMasters 固定空间，scenes 是这些空间派生出的场次——两者是一对多，不是同一个实体。
 */
export type ScenesFile = {
  sceneMasters: SceneMaster[];
  scenes: SceneAsset[];
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
  genre?: GenreId;
  /**
   * 分镜按场景分批生成时，本轮只处理这一批场景。见 lib/storyboardBatch。
   * continuityTail 是上一批的收尾状态，跟着请求过网络，让本批接着上一批写而不是重新设定人物。
   */
  stageBatch?: StageBatch;
  productionStage?: ProductionStageId;
  generationJobId?: string;
  sourceVersions?: Record<string, number>;
  stageRequestMode?: StageRequestMode;
  stageRequestTarget?: StageRequestTarget;
  requestedOutputFiles?: string[];
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

/** 服务端项目档案（data/projects/）在列表接口里露出的摘要。 */
export type ProjectSummary = {
  projectId: string;
  title: string;
  mode: string;
  savedAt: string;
  currentStage: string;
  fileCount: number;
  messageCount: number;
};
