'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createBlankWorkspace } from '../lib/defaultWorkspace';
import { OVERVIEW_OWNER, handoffText, stageOwner, stageOwnerLabel, stageOwnerName } from '../lib/agentHandoff';
import type { StylePreset } from '../lib/styleBook';
import {
  STYLE_PRESETS,
  VISUAL_STAGES,
  customStyle,
  resolveStageStyle,
  setGlobalStyle,
  setStageStyle,
  styleBookFromWorkspace,
  styleDriftWarnings,
  writeStyleBook
} from '../lib/styleBook';
import type {
  AgentMessage,
  AgentRunResponse,
  CharacterAsset,
  GenreId,
  PatchOperation,
  PreviewScene,
  ProductionStageId,
  ProductionStageRecord,
  ProductionStageStatus,
  ProjectSummary,
  StageRequestMode,
  StageRequestTarget,
  WorkflowKind,
  WorkspaceMode,
  WorkspaceSnapshot
} from '../lib/types';
import {
  agentRoster,
  allSkills,
  contextStack,
  diffLines,
  getFile,
  isInternalWorkspaceFile,
  isWorkspaceSnapshot,
  missionAssetsFromWorkspace,
  modeLabel,
  overallStatus,
  parseJsonFile,
  pipelineSteps,
  sceneAssets,
  statusLabel,
  storyboardScenes,
  uid
} from '../lib/workspace';
import {
  appendPendingPatches,
  applyPatchesForPreview,
  autopilotPatchesForRun,
  confirmStageInWorkspace,
  consumePendingPatches,
  readPendingPatches,
  savePendingPatches
} from '../lib/workspaceDrafts';
import {
  productionFlowFromWorkspace,
  beginStageGeneration,
  canOpenProductionStage,
  completeStageGeneration,
  failStageGeneration,
  interruptUnrecoverableStageGenerations,
  markStageDraft,
  nextProductionStage,
  PRODUCTION_FLOW_PATH,
  updateProductionFlow,
  visibleProductionStages,
  writeProductionFlow
} from '../lib/productionFlow';
import {
  classifyVideoSubmitError,
  createVideoRenderJobs,
  dropVideoJobsForPrompt,
  finalizeVideoSubmission,
  isRetryableVideoError,
  normalizeVideoProviderStatus,
  preserveCompletedVideoJobs,
  qaPendingVideoJobs,
  requeueVideoJobForQaRetry,
  resumableVideoJobs,
  retryableVideoJobs,
  submittableVideoJobs,
  unrecoverableRestoredVideoJobIds,
  resubmittableRestoredVideoJobs,
  updateVideoRenderJob,
  timeoutPendingVideoJobIds,
  videoBatchStatus,
  videoJobStatusFromProvider,
  videoRecoveryBatchKey,
  videoStageStatus,
  type VideoRenderJob
} from '../lib/videoRenderBatch';
import {
  classifyVideoQaVerdict,
  videoQaIssueSummary,
  videoQaRetryDirective,
  videoQaRetryDuration,
  type VideoQaVerdict
} from '../lib/videoQa';
import {
  ffmpegMissingMessage,
  finalCutStatusLabel,
  isFinalCutInFlight,
  normalizeFinalCutState,
  validateStitchClips,
  type FinalCutState,
  type StitchClip
} from '../lib/videoStitch';
import {
  clampDialogueShotDuration,
  clampShotDuration,
  estimateShotCount,
  normalizePhysicsMode,
  physicsDurationCap,
  physicsModeLabel,
  physicsNegativePrompt,
  shotsPerSegment,
  targetShotSeconds,
  type PhysicsMode
} from '../lib/shotPhysics';
import {
  filterStagePatches,
  isProductionStageFile,
  sourceVersionsForStage,
  stageConfig,
  stageOutputFilesForWorkspace
} from '../lib/stageGeneration';
import { buildStageRunRequest } from '../lib/stageRequest';
import { GENRE_OPTIONS } from '../lib/genreOptions';
import {
  mergeStoryboardBatches,
  mergeTimelineBatches,
  planStoryboardBatches,
  type StageBatch
} from '../lib/storyboardBatch';
import {
  carryStoryboardContinuity,
  normalizeShotContinuity,
  storyboardContinuityTail,
  type ContinuityTail
} from '../lib/shotContinuity';
import {
  CHAIN_TERMINAL_STATUSES,
  canChainFromTail,
  inlineFrameDegradedNote,
  nextInChain,
  planShotChains,
  readyChainJobIds,
  rejectsInlineFrame,
  type ShotChain
} from '../lib/shotChain';
import {
  DEFAULT_EPISODE_SECONDS,
  EPISODE_LENGTH_PRESETS,
  EPISODE_SECONDS_MAX,
  EPISODE_SECONDS_MIN,
  episodeLengthLabel,
  episodePlan,
  normalizeEpisodeSeconds
} from '../lib/episodePlan';
import { characterImageBudgetSummary, estimateRenderBudget, renderBudgetSummary } from '../lib/renderBudget';
import {
  actionableAutoCutDecisions,
  applyAutoCutToClips,
  autoCutSummary,
  planAutoCut
} from '../lib/autoCut';
import { qaLedgerFromWorkspace, recordQaFailure, writeQaLedger } from '../lib/qaLedger';
import {
  missingFromRoster,
  rosterGapWarning,
  rosterNamesMissingFromAssets,
  rosterShortfallWarning
} from '../lib/characterRoster';
import {
  decodeWorkspaceEnvelope,
  encodeWorkspaceEnvelope,
  isQuotaExceededError,
  localStorageByteLength,
  recoveryNoticeFor,
  workspaceRecoveryKey
} from '../lib/workspaceStorage';
import { classifyPendingPatchesForReview, patchesOwnedByCurrentStageJob } from '../lib/stageReviewState';
import {
  applyStageImageResult,
  charactersFromWorkspace,
  characterIdentityViewInstruction,
  missingCharacterExpressionSheetJobs,
  missingCharacterFrontViewJobs,
  missingCharacterIdentityViewJobs,
  missingCharacterImageJobs,
  missingCharacterMultiViewJobs,
  missingSceneImageJobs,
  missingSceneViewJobs,
  mergeShotFraming,
  missingShotImageJobs,
  productionScenesFromWorkspace,
  sceneContinuityReports,
  sceneMastersFromWorkspace,
  storyboardFramingGaps,
  validateStageAssets,
  type StageImageJob
} from '../lib/productionAssets';
import {
  buildSceneViewPrompt,
  normalizeSceneShot,
  sceneShotPromptLines,
  type SceneMaster,
  type SceneViewId
} from '../lib/sceneVisualSpec';
import { sanitizeDialogueText } from '../lib/voiceMode';
import {
  modelReadMessage,
  optionsForLayer,
  pickLayerModel,
  type AvailableModelOptions,
  type ModelLayer,
  type ProviderModelOption
} from '../lib/modelConfig';
import {
  BASE_CHARACTER_VARIANT,
  buildCharacterDesignPrompt,
  characterImageErrorText,
  characterReferenceVariantsFromPrompts,
  replaceCharacterStageReference,
  type CharacterReferenceVariant
} from '../lib/characterDesign';
import {
  CHARACTER_VIEW_ANGLES,
  characterEthnicityText,
  characterExpressionSlots,
  characterReviewState,
  characterVisualPromptLines,
  emptyCharacterVisualSpec,
  normalizeCharacterVisualSpec,
  type CharacterReviewStatus,
  type CharacterVisualSpec
} from '../lib/characterVisualSpec';
import CharacterDesignBoard, {
  characterSlotKey,
  type CharacterBoardEntry,
  type CharacterBoardTabId,
  type CharacterImageSlot,
  type CharacterSlotState
} from '../components/CharacterDesignBoard';
import LeftRail, { type NavSection } from '../components/LeftRail';
import ContextSidebar, { type QueueEntry } from '../components/ContextSidebar';
import Inspector from '../components/Inspector';
import NavPage, { type NavPageKind } from '../components/NavPages';
import SceneVisualBoard from '../components/SceneVisualBoard';
import { canvasBoardsFromWorkspace, writeCanvasBoards } from '../lib/canvasBoards';
import ProductionCanvas from '../components/canvas/ProductionCanvas';
import type {
  StoryCanvasCard,
  StoryCanvasLane,
  StoryCanvasOutcome,
  StoryCanvasPerson
} from '../components/canvas/types';
import ProjectHistory from '../components/ProjectHistory';
import {
  AgentRuntime,
  ApprovalQueue,
  AssetPipeline,
  ExecutionLog,
  PlanList,
  StoryboardView,
  VideoGenHandoff
} from '../components/runtime';
import {
  IconAlert,
  IconBolt,
  IconCamera,
  IconCheck,
  IconChevron,
  IconClock,
  IconCopy,
  IconCpu,
  IconDownload,
  IconFilm,
  IconGauge,
  IconGitMerge,
  IconLayers,
  IconList,
  IconUsers,
  IconPanelLeft,
  IconPanelRight,
  IconPlus,
  IconRefresh,
  IconScript,
  IconSend,
  IconShieldCheck,
  IconSparkles,
  IconStack,
  IconUpload,
  IconWand,
  IconX
} from '../components/icons';

type Health = {
  ok: boolean;
  provider: {
    selectedProvider: string;
    customBaseUrl?: string;
    text?: ModelLayerStatus;
    image?: ModelLayerStatus;
    video?: ModelLayerStatus;
  };
};

type ModelLayerStatus = {
  provider?: string;
  configured?: boolean;
  model?: string;
  baseUrl?: string;
};

type ModelConfigStatus = {
  ok: boolean;
  writable: boolean;
  authRequired?: boolean;
  mode?: string;
  provider: Health['provider'];
};

type ModelConfigDraft = {
  baseUrl: string;
  apiKey: string;
  textModel: string;
  imageModel: string;
  videoModel: string;
};

type BriefFile = {
  contentGoal?: string;
  platform?: string;
  audience?: string;
  topic?: string;
  offer?: string;
  tone?: string;
  constraints?: string[];
};

type CampaignGoal = {
  title?: string;
  topic?: string;
  goal?: string;
  audience?: string;
  platform?: string;
  mission?: string;
  conversionGoal?: string;
  primaryPlatform?: string;
  secondaryPlatforms?: string[];
  contentUnitCount?: number;
};

type ProfileFile = {
  accountName?: string;
  brandName?: string;
  targetAudience?: string;
  targetCustomer?: string;
  tone?: string;
  bannedExpressions?: string[];
  marketingRedLines?: string[];
  platforms?: string[];
};

type PublishCopy = {
  titles?: string[];
  coverText?: string;
  caption?: string;
  hashtags?: string[];
  platformNotes?: Record<string, string>;
};

type CharacterPromptEntry = {
  id?: string;
  name?: string;
  title?: string;
  role?: string;
  description?: string;
  appearance?: string;
  outfit?: string;
  style?: string;
  voice?: string;
  consistencyPrompt?: string;
  prompt?: string;
  negativePrompt?: string;
  referenceImageUrl?: string;
  referenceImages?: string[];
};

type AssetPrompts = {
  visualStyle?: string;
  handoffTo?: string;
  handoffRule?: string;
  characterConsistency?: { primarySubject?: string; consistencyPrompt?: string; negativePrompt?: string };
  characters?: CharacterPromptEntry[];
  roles?: CharacterPromptEntry[];
  prompts?: Array<{
    id?: string;
    sceneId?: string;
    type?: string;
    renderTask?: string;
    durationSeconds?: number;
    prompt?: string;
    referenceImageUrl?: string;
    referenceImages?: string[];
    mode?: string;
    /** 镜头的物理意图，来自 storyboard.json。质检拿它决定判据松紧。 */
    physicsMode?: string;
    /**
     * 这一条 prompt 所属的「场景」id。
     * sceneId 指向的是镜头，而一个场景会被拆成多个镜头，两者不再相等——
     * 场景参考图只能靠这个字段找回来。老工作区没有这个字段，回落到 sceneId。
     */
    sourceSceneId?: string;
    negativePrompt?: string;
  }>;
  renderQueue?: Array<{
    id?: string;
    sceneId?: string;
    status?: string;
    referenceImageUrl?: string;
    referenceImages?: string[];
    mode?: string;
  }>;
  reuseNotes?: string[];
  renderSpec?: Record<string, unknown>;
};

type VideoPromptEntry = NonNullable<AssetPrompts['prompts']>[number];

type CharacterAssetCard = {
  id: string;
  name: string;
  role: string;
  description: string;
  consistency: string;
  source: string;
  negativePrompt?: string;
  faceAnchorVariantId?: string;
  expressionIds?: string[];
  referenceStrategy?: CharacterReferenceStrategyId;
  variants?: Array<CharacterReferenceVariant & {
    multiViewImageUrl?: string;
    expressionSheetImageUrl?: string;
  }>;
  /** 视觉设定画板的全部字段。老工作区读出来是一份空设定，不会是 undefined。 */
  visual: CharacterVisualSpec;
};

type CharacterDesignOutputKind = 'portrait' | 'multi_view' | 'expression_sheet';

type CharacterDesignRender = {
  imageUrl: string;
  status: 'idle' | 'generating' | 'ready' | 'error';
  error?: string;
  source?: 'existing' | 'generated' | 'uploaded';
};

const CHARACTER_EXPRESSION_OPTIONS = [
  { id: 'joy', label: '喜', prompt: '开心微笑，眼神明亮，嘴角自然上扬' },
  { id: 'anger', label: '怒', prompt: '生气皱眉，眼神有压迫感，嘴唇收紧' },
  { id: 'sadness', label: '哀', prompt: '难过低落，眼眶微红，表情克制' },
  { id: 'fear', label: '恐惧', prompt: '瞳孔放大，身体后撤，呼吸急促' },
  { id: 'surprise', label: '惊讶', prompt: '睁大眼睛，轻微张口，身体短暂停顿' },
  { id: 'disgust', label: '厌恶', prompt: '轻皱鼻子，嘴角下压，反应克制' },
  { id: 'shy', label: '害羞', prompt: '脸颊微红，眼神躲闪，动作拘谨' },
  { id: 'nervous', label: '紧张', prompt: '肩膀收紧，频繁吞咽，眼神游移' },
  { id: 'awkward', label: '尴尬', prompt: '僵硬微笑，视线飘开，手部无处安放' },
  { id: 'confused', label: '疑惑', prompt: '眉头轻皱，歪头观察，反应迟疑' },
  { id: 'expectant', label: '期待', prompt: '眼神向前，嘴角轻抬，等待回应' },
  { id: 'calm', label: '平静', prompt: '呼吸稳定，表情放松，目光自然' }
] as const;

type CharacterExpressionId = (typeof CHARACTER_EXPRESSION_OPTIONS)[number]['id'];

const DEFAULT_CHARACTER_EXPRESSION_IDS: CharacterExpressionId[] = CHARACTER_EXPRESSION_OPTIONS.map((item) => item.id);
const MAX_PERSISTED_IMAGE_BYTES = 512 * 1024;
const MAX_WORKSPACE_PERSISTED_BYTES = 3 * 1024 * 1024;
/**
 * 磁盘档案（data/projects/）的软上限。localStorage 缓存超 3MB 只是跳过缓存，
 * 但档案要防止无限膨胀拖垮读写——超过这个数才真正拒收新图。
 */
const MAX_WORKSPACE_ARCHIVE_BYTES = 32 * 1024 * 1024;

type StageRun = {
  generationJobId: string;
  token: number;
  controller: AbortController;
  revision: boolean;
};

const STAGE_RUN_ORDER: ProductionStageId[] = ['script', 'character', 'scene', 'storyboard', 'video'];

const CHARACTER_REFERENCE_STRATEGIES = [
  {
    id: 'face_id',
    label: 'Face ID 锁脸',
    hint: '优先保持同一张主脸',
    prompt: '使用同一张 Face ID 主脸作为连续镜头身份锚点，五官、脸型、发际线、痣和肤色保持一致'
  },
  {
    id: 'multi_view',
    label: '多视角',
    hint: '补齐正侧背角度',
    prompt: '参考同一角色的正面、侧面、半身和全身视角，换角度时不换人、不换发型、不换身材比例'
  },
  {
    id: 'replace_reference',
    label: '替换参考',
    hint: '允许用户换参考图',
    prompt: '等待用户替换角色参考图后再渲染；如未替换，沿用当前角色描述和一致性提示词'
  }
] as const;

type CharacterReferenceStrategyId = (typeof CHARACTER_REFERENCE_STRATEGIES)[number]['id'];

type MissionBrief = {
  title: string;
  platform: string;
  audience: string;
  goal: string;
  tone: string;
  redLines: string[];
  isBlank: boolean;
};

type GenerationMode = 'text_to_video' | 'image_to_video' | 'multi_image' | 'keyframes';
type AspectRatio = '9:16' | '16:9' | '1:1' | '4:3' | '3:4';
type ResolutionTier = '480p' | '720p' | '1080p';
type FramePreset = 81 | 121 | 169 | 241 | 361 | 409 | 441;
type FrameRate = 24 | 30;
type CameraMove =
  | 'fixed'
  | 'push'
  | 'pull'
  | 'pan'
  | 'tilt'
  | 'orbit'
  | 'tracking'
  | 'master_push_left'
  | 'master_push_right';
type FrameLock = 'auto' | 'first' | 'first_last';

type VideoSpec = {
  provider: 'Agnes Video V2.0';
  platform: string;
  generationMode: GenerationMode;
  aspectRatio: AspectRatio;
  resolution: ResolutionTier;
  numFrames: FramePreset;
  fps: FrameRate;
  cameraMove: CameraMove;
  frameLock: FrameLock;
  /** 成片总时长（秒）。小节数和小节时长都由它推出来，见 lib/episodePlan。 */
  episodeSeconds: number;
};

type StudioStageId = 'overview' | 'script' | 'character' | 'scene' | 'storyboard' | 'video';
type DependencyState = 'current' | 'needs_review' | 'stale';

type StudioCanvasNode = {
  id: string;
  stage: StudioStageId;
  label: string;
  title: string;
  summary: string;
  status: 'ready' | 'warning' | 'draft' | 'blocked';
  owner: string;
  filePath: string;
  dependency: string;
  impact: string;
  review: string;
  action: string;
  patchCount: number;
  dependencyState: DependencyState;
  dependencyReason: string;
  dependencySource: string;
  childCount?: number;
  assetId?: string;
  sceneId?: string;
};

type ProductionDecision = {
  title: string;
  question: string;
  revisionPrompt: string;
  options: Array<{
    label: string;
    description: string;
    instruction: string;
  }>;
};

type AssetLibraryItem = {
  id: string;
  type: StudioStageId;
  title: string;
  sourceFile: string;
  summary: string;
  scope: string;
  createdAt: string;
  imageUrl?: string;
  characterId?: string;
  stageId?: string;
  assetKind?: CharacterDesignOutputKind;
};

type AssetLibraryFile = {
  assets?: AssetLibraryItem[];
};

type VideoRenderApiResponse = {
  status?: string;
  task_id?: string;
  video_id?: string;
  videoId?: string;
  videoUrl?: string;
  progress?: number;
  error?: string;
  /**
   * 上游不认身份参考图字段、服务端已经去掉它重发时带回来的一句说明。
   * 这一层静默降级会让人物一致性退回「只有文字约束」，不说一声等于藏了一个坑。
   */
  identityReferenceNote?: string;
  raw?: { error?: unknown };
};

type ImageRenderApiResponse = {
  ok?: boolean;
  imageUrl?: string;
  error?: string;
};

const activeWorkspaceProjectKey = 'videoagent-active-workspace-project';
const messagesKey = 'videoagent-chat-studio-messages-v2';
const specKey = 'videoagent-chat-studio-video-spec-v2';
// 上游图片队列打满时的退避：20s、40s、60s，再不行才判失败。
const STAGE_IMAGE_RETRY_WAIT_MS = 20000;
const STAGE_IMAGE_MAX_ATTEMPTS = 4;
const VIDEO_POLL_INTERVAL_MS = 65000;
const VIDEO_POLL_MAX_ATTEMPTS = 60;
/** 抽帧只是 seek + drawImage，正常在百毫秒级；超过这个时间基本是跨域或链接失效。 */
const VIDEO_QA_FRAME_TIMEOUT_MS = 15000;
/**
 * 抽帧数。
 *
 * 原来是首/中/尾三帧，理由是「质检看的是结构性错误」。手指和穿模确实三帧就够，
 * 脸不够：一个 4 到 5 秒的镜头取三帧，两帧之间隔了一秒半，判定模型看到的是三张
 * 各自都很正常的脸，得出的结论必然是「同一个人」。而用户在成片里看到的是这张脸
 * 一直在抖、在变形——那是相邻帧之间的变化，间隔一秒半根本采样不到。
 * 十帧把间隔压到半秒以内，这类抖动才进得了判定模型的视野。
 * 代价是每次质检多带七张图（仍然是一次调用），换的是这一类问题不再整段漏检。
 */
const VIDEO_QA_FRAME_COUNT = 10;
const VIDEO_SUBMISSION_INTERRUPTED_ERROR = '提交中断且没有可恢复任务 ID，请核对后重试';
/**
 * ready 表示任务建好了但一次网络请求都没发出去过——刷新页面就会撞上它。
 * 这种情况重试既不会重复提交，也不会重复计费，和「发出去了但拿不到任务 ID」
 * 完全是两回事，提示语必须区分开，否则用户只会看到一句无从下手的「中断」。
 */
const VIDEO_NEVER_SUBMITTED_ERROR = '上次提交被页面刷新打断，这些镜头还没有提交过。点「重试失败镜头」即可继续，不会重复生成。';
// 总时长以前写死在这里（15s × 12 = 3 分钟），现在由 videoSpec.episodeSeconds 决定，
// 小节数和小节时长统一走 lib/episodePlan 推。这里不再留常量，免得又出现两套算法。
const VIDEO_MAX_NUM_FRAMES = 409;

const defaultVideoSpec: VideoSpec = {
  provider: 'Agnes Video V2.0',
  platform: '小红书',
  generationMode: 'image_to_video',
  aspectRatio: '9:16',
  resolution: '720p',
  numFrames: 361,
  fps: 24,
  cameraMove: 'push',
  frameLock: 'first',
  episodeSeconds: DEFAULT_EPISODE_SECONDS
};

const platformOptions = ['小红书', '抖音', 'TikTok', 'Instagram Reels', '视频号', 'YouTube Shorts', 'B 站'];

const cameraMoveOptions: Array<{ id: CameraMove; label: string; tier: '基础' | '大师' | '固定' }> = [
  { id: 'fixed', label: '固定机位', tier: '固定' },
  { id: 'push', label: '推进', tier: '基础' },
  { id: 'pull', label: '拉远', tier: '基础' },
  { id: 'pan', label: '水平摇镜', tier: '基础' },
  { id: 'tilt', label: '垂直摇镜', tier: '基础' },
  { id: 'orbit', label: '旋转环绕', tier: '基础' },
  { id: 'tracking', label: '跟随运镜', tier: '基础' },
  { id: 'master_push_left', label: '左旋推进', tier: '大师' },
  { id: 'master_push_right', label: '右旋推进', tier: '大师' }
];

const frameLockOptions: Array<{ id: FrameLock; label: string; hint: string }> = [
  { id: 'auto', label: '自动', hint: '不锁帧，模型自由起片' },
  { id: 'first', label: '锁首帧', hint: '先定首帧再生成动作' },
  { id: 'first_last', label: '锁首尾帧', hint: '首尾帧之间补间变化' }
];

// 真源在 lib/genreOptions，和 lib/genreSkillRouter 的路由表共用同一批 id：
// 选项和路由表一旦对不上，用户会选到一个永远不触发任何技能的片种，而界面上看不出来。
const taskAgentOptions = GENRE_OPTIONS;

// 风格预设的真源在 lib/styleBook，避免 UI 和写进 style.json 的值各说各话。
const styleOptions = STYLE_PRESETS;

function cameraMoveLabel(move: CameraMove) {
  return cameraMoveOptions.find((item) => item.id === move)?.label || move;
}
function frameLockLabel(lock: FrameLock) {
  return frameLockOptions.find((item) => item.id === lock)?.label || lock;
}

function videoErrorText(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    if (typeof object.message === 'string') return object.message;
    if (typeof object.error === 'string') return object.error;
  }
  return '';
}

const generationModes: Array<{ id: GenerationMode; label: string; hint: string }> = [
  { id: 'image_to_video', label: '图生视频', hint: '先锁首帧，再生成动作' },
  { id: 'text_to_video', label: '文生视频', hint: '只用文字 prompt 起片' },
  { id: 'multi_image', label: '多图视频', hint: '多张图之间做转场' },
  { id: 'keyframes', label: '关键帧', hint: '首尾帧控制变化' }
];

const aspectOptions: Array<{ id: AspectRatio; label: string; use: string }> = [
  { id: '9:16', label: '9:16', use: '竖屏短视频' },
  { id: '16:9', label: '16:9', use: '横屏视频' },
  { id: '1:1', label: '1:1', use: '方形内容' },
  { id: '4:3', label: '4:3', use: '传统横版' },
  { id: '3:4', label: '3:4', use: '竖版图文感' }
];

const resolutionOptions: ResolutionTier[] = ['480p', '720p', '1080p'];
const framePresets: FramePreset[] = [81, 121, 169, 241, 361, 409, 441];
const fpsOptions: FrameRate[] = [24, 30];

const defaultModelDraft: ModelConfigDraft = {
  baseUrl: '',
  apiKey: '',
  textModel: 'gpt-4.1-mini',
  imageModel: '',
  videoModel: 'agnes-video-v2.0'
};

const emptyModelOptions: AvailableModelOptions = {
  all: [],
  text: [],
  image: [],
  video: []
};

const visibleWorkflows: WorkflowKind[] = ['generate', 'script', 'shot', 'prompt', 'rewrite', 'platform', 'compliance'];

const studioStages: Array<{ id: StudioStageId; label: string }> = [
  { id: 'overview', label: '总览' },
  { id: 'script', label: '剧本' },
  { id: 'character', label: '角色' },
  { id: 'scene', label: '场景' },
  { id: 'storyboard', label: '分镜' },
  { id: 'video', label: '视频' }
];

function studioStageName(stage: StudioStageId) {
  return studioStages.find((item) => item.id === stage)?.label || '节点';
}

function productionStageForFile(filePath: string): ProductionStageId | null {
  const stages: ProductionStageId[] = ['script', 'character', 'scene', 'storyboard', 'video'];
  return stages.find((stage) => stageConfig(stage).outputFiles.includes(filePath)) || null;
}

function decisionCardForNode(node: StudioCanvasNode): ProductionDecision {
  const templates: Record<StudioStageId, Omit<ProductionDecision, 'title' | 'revisionPrompt'>> = {
    overview: {
      question: '先确认这次 Mission 要走哪种生产配方，再让下游资产展开。',
      options: [
        {
          label: '产品卖点视频',
          description: '围绕痛点、证明、卖点和 CTA 组织短视频。',
          instruction: '按产品卖点视频路径补齐 Mission Brief，突出目标客户、核心痛点、可信证据和 CTA。'
        },
        {
          label: '旧稿爆改',
          description: '先诊断旧稿问题，再产出可发布版本。',
          instruction: '按旧稿爆改路径审查现有内容，指出弱点后只改写需要改动的资产。'
        },
        {
          label: '一周内容计划',
          description: '把一个业务目标拆成连续内容资产。',
          instruction: '按一周内容计划路径拆出 7 个选题，并标明每条内容的目标、Hook 和资产需求。'
        }
      ]
    },
    script: {
      question: '剧本确认后，选择下游如何从脚本抽取可复用资产。',
      options: [
        {
          label: '直接抽角色',
          description: '从当前脚本提炼主体、身份、动作和情绪。',
          instruction: '基于当前 script.md 提取角色设定，保留脚本正文不变。'
        },
        {
          label: '先压缩脚本',
          description: '先降低台词密度，再进入角色和场景。',
          instruction: '只优化 script.md 的节奏和口播密度，保持 Mission Brief 不变。'
        },
        {
          label: '平台改写',
          description: '先适配平台表达，再进入画面资产。',
          instruction: '只把 script.md 改写为当前平台更自然的表达，明确保留 CTA 和合规边界。'
        }
      ]
    },
    character: {
      question: '角色是后续一致性的锚点，先决定使用现有资产还是重新生成。',
      options: [
        {
          label: '复用资产库',
          description: '优先从已批准资产里找主体，减少风格漂移。',
          instruction: '检查 asset_library.json 是否有可复用角色；如有，只引用稳定资产并补充一致性提示词。'
        },
        {
          label: '重新生成角色',
          description: '为当前 Mission 单独生成角色一致性设定。',
          instruction: '只补齐角色一致性设定，包括外观、服装、表情、动作和避免项。'
        },
        {
          label: '真人实拍统一',
          description: '把角色约束改成真实营销视频口径。',
          instruction: '将角色一致性改为真人实拍短视频口径，避免动画化描述。'
        }
      ]
    },
    scene: {
      question: '场景决定视觉证据，先选“主图优先”还是“多视图优先”。',
      options: [
        {
          label: '先出主图',
          description: '先锁空间、灯光、产品位置和氛围。',
          instruction: '只补齐 scenes.json 的主场景描述和首图提示词，暂不展开镜头。'
        },
        {
          label: '多视图准备',
          description: '为同一场景准备正反侧或局部细节。',
          instruction: '为每个核心场景补充多视角素材需求，保持角色和产品位置一致。'
        },
        {
          label: '替换素材',
          description: '用已有图片或品牌素材约束场景。',
          instruction: '根据 asset_library.json 或用户上传素材替换场景参考，并说明授权风险。'
        }
      ]
    },
    storyboard: {
      question: '分镜进入视频前，选择更快的多图参考还是更可控的镜头板。',
      options: [
        {
          label: '多图参考',
          description: '更快进入视频任务，适合短营销片。',
          instruction: '按多图参考路径整理 storyboard.json 和 asset_prompts.json，每个镜头绑定关键参考图。'
        },
        {
          label: '宫格分镜',
          description: '先把镜头板做清楚，控制更强。',
          instruction: '按宫格分镜路径补齐镜头顺序、构图、动作、字幕和时长。'
        },
        {
          label: '关键帧',
          description: '用首尾帧控制变化，适合强动作镜头。',
          instruction: '按关键帧路径标注每个镜头的首帧、尾帧和过渡动作。'
        }
      ]
    },
    video: {
      question: '视频阶段只准备可提交任务，不在工作台里假装已经渲染成片。',
      options: [
        {
          label: '图生视频',
          description: '锁首帧再生成动作，适合产品与人物一致性。',
          instruction: '按图生视频路径整理首帧、角色一致性、镜头 prompt 和 renderQueue。'
        },
        {
          label: '多图视频',
          description: '用多张图控制镜头间过渡。',
          instruction: '按多图视频路径整理多图参考、转场动作和负面提示词。'
        },
        {
          label: '关键帧',
          description: '用首尾帧控制动作变化。',
          instruction: '按关键帧路径补齐首尾帧提示词、动作变化和时长参数。'
        }
      ]
    }
  };
  const template = templates[node.stage];
  return {
    ...template,
    title: `${node.label}生产决策`,
    revisionPrompt: `我要修改「${node.title}」：${node.action}`
  };
}

function nodeStatusText(status: StudioCanvasNode['status'], patchCount = 0, dependencyState: DependencyState = 'current') {
  if (patchCount > 0) return `${patchCount} 个 patch 待审`;
  if (dependencyState === 'stale') return '依赖已过期';
  if (dependencyState === 'needs_review') return '下游需重审';
  if (status === 'ready') return '已确认';
  if (status === 'warning') return '需审查';
  if (status === 'blocked') return '被阻断';
  return '待生成';
}

function productionStageStatusText(status: ProductionStageStatus) {
  const labels: Record<ProductionStageStatus, string> = {
    locked: '待生成',
    generating: '生成中',
    ready_for_review: '待审',
    confirmed: '已确认',
    stale: '需重审',
    rendering: '生成中',
    qa_pending: '质检中',
    qa_failed: '质检未过',
    stitching: '合成中',
    completed: '已完成',
    failed: '失败'
  };
  return labels[status];
}

/** 画布上的视频任务卡直接写清这条任务在渲染队列里的处境。 */
function videoJobStatusLabel(job?: VideoRenderJob) {
  if (!job) return '未提交';
  if (job.status === 'completed') {
    // 「已完成但没质检过」和「已完成且质检通过」对用户是两件事，不能都写成「片段已完成」。
    return job.qa?.status === 'skipped' ? '片段已完成（未质检）' : '片段已完成';
  }
  if (job.status === 'qa_pending') return '画面质检中';
  if (job.status === 'qa_failed') return `质检未通过（${physicsModeLabel(normalizePhysicsMode(job.physicsMode))}）`;
  if (job.status === 'failed') return '生成失败';
  if (job.status === 'submitting') {
    return job.qaAttempt ? `质检重渲提交中（第 ${job.qaAttempt} 次）` : '提交中';
  }
  if (job.status === 'submitted' || job.status === 'polling') {
    return `生成中${typeof job.progress === 'number' ? ` ${job.progress}%` : ''}`;
  }
  return '待提交';
}

function nodeStatusReason(node: StudioCanvasNode) {
  if (node.patchCount > 0) return '该节点已有待审批改动，批准前不要把它当成已落地资产。';
  if (node.status === 'ready') return '该节点已有可审查资产，可以继续向下游生产。';
  if (node.status === 'warning') return '该节点已有草稿或生成任务，但还需要人工确认风险和一致性。';
  if (node.status === 'blocked') return '该节点存在阻断项，下游生成应暂停。';
  return '该节点还没有形成资产，下游只是占位。';
}

function dependencyStateText(state: DependencyState) {
  if (state === 'stale') return '依赖已过期';
  if (state === 'needs_review') return '下游需重审';
  return '依赖正常';
}

function canvasEdgeLabel(stage: StudioStageId) {
  const map: Record<StudioStageId, string> = {
    overview: '锁定目标后写剧本',
    script: '从脚本抽角色',
    character: '角色约束场景',
    scene: '场景拆成分镜',
    storyboard: '分镜进入视频任务',
    video: ''
  };
  return map[stage];
}

function safeParseJson<T>(content: string | undefined, fallback: T): T {
  if (!content) return fallback;
  try {
    return JSON.parse(content) as T;
  } catch (_) {
    return fallback;
  }
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function fileRevision(workspace: WorkspaceSnapshot | null, path: string) {
  const file = getFile(workspace, path);
  if (!file) return 0;
  const time = Date.parse(file.updatedAt || '');
  return Math.max(file.version || 0, Number.isFinite(time) ? time / 1000 : 0);
}

function maxFileRevision(workspace: WorkspaceSnapshot | null, paths: string[]) {
  return Math.max(0, ...paths.map((path) => fileRevision(workspace, path)));
}

function hasPendingFile(patches: PatchOperation[], paths: string[]) {
  return patches.some((patch) => paths.includes(patch.filePath));
}

function dependencyNotice(
  stage: StudioStageId,
  workspace: WorkspaceSnapshot | null,
  pendingPatches: PatchOperation[]
): { state: DependencyState; reason: string; source: string } {
  const missionRev = maxFileRevision(workspace, ['brief.json', 'campaign_goal.json', 'profile.json']);
  const scriptRev = maxFileRevision(workspace, ['script.md']);
  const characterRev = maxFileRevision(workspace, ['asset_prompts.json', 'asset_library.json']);
  const sceneRev = maxFileRevision(workspace, ['scenes.json']);
  const storyboardRev = maxFileRevision(workspace, ['storyboard.json', 'timeline.json']);
  const videoRev = maxFileRevision(workspace, ['asset_prompts.json']);

  if (stage === 'overview') {
    return { state: 'current', source: '用户目标', reason: 'Mission Brief 是上游源头，后续节点都依赖它。' };
  }
  if (stage === 'script') {
    if (hasPendingFile(pendingPatches, ['profile.json']) || missionRev > scriptRev) {
      return { state: 'stale', source: 'Mission Brief', reason: '目标、受众或平台已经更新，脚本需要重新确认。' };
    }
    return { state: 'current', source: 'Mission Brief', reason: '脚本与当前目标保持一致。' };
  }
  if (stage === 'character') {
    if (hasPendingFile(pendingPatches, ['script.md']) || scriptRev > characterRev) {
      return { state: 'stale', source: 'script.md', reason: '脚本有新改动，角色身份、动作和一致性提示词需要复核。' };
    }
    return { state: 'current', source: 'script.md', reason: '角色设定匹配当前脚本。' };
  }
  if (stage === 'scene') {
    if (hasPendingFile(pendingPatches, ['script.md']) || scriptRev > sceneRev) {
      return { state: 'stale', source: 'script.md', reason: '脚本段落变化会影响场景拆分和画面证据。' };
    }
    if (hasPendingFile(pendingPatches, ['asset_prompts.json', 'asset_library.json']) || characterRev > sceneRev) {
      return { state: 'needs_review', source: '角色设定', reason: '角色或素材约束更新，场景需要检查人物、道具和授权一致性。' };
    }
    return { state: 'current', source: 'script.md / 角色设定', reason: '场景与当前脚本和角色设定一致。' };
  }
  if (stage === 'storyboard') {
    if (hasPendingFile(pendingPatches, ['scenes.json']) || sceneRev > storyboardRev || scriptRev > storyboardRev) {
      return { state: 'stale', source: 'scenes.json', reason: '场景或脚本已经更新，分镜顺序、画面和时长需要重算。' };
    }
    if (hasPendingFile(pendingPatches, ['asset_prompts.json', 'asset_library.json']) || characterRev > storyboardRev) {
      return { state: 'needs_review', source: '角色 / 素材约束', reason: '角色或素材变化会影响镜头里的主体一致性。' };
    }
    return { state: 'current', source: 'scenes.json', reason: '分镜与当前场景和角色约束一致。' };
  }
  if (hasPendingFile(pendingPatches, ['storyboard.json', 'timeline.json', 'script.md', 'scenes.json'])) {
    return { state: 'stale', source: '分镜 / 时间线', reason: '上游生产包有待审改动，视频任务不能直接交接。' };
  }
  if (Math.max(scriptRev, sceneRev, storyboardRev) > videoRev) {
    return { state: 'stale', source: '上游制作包', reason: '脚本、场景或分镜比视频任务更新，需重新准备 renderQueue。' };
  }
  return { state: 'current', source: 'asset_prompts.json', reason: '视频任务与当前制作包一致。' };
}

function patchTouchesNode(patch: PatchOperation, node: StudioCanvasNode) {
  if (patch.filePath === node.filePath) return true;
  if (patch.filePath === 'asset_library.json' && patch.summary.includes(node.title)) return true;
  if (node.stage === 'overview') return ['brief.json', 'campaign_goal.json', 'profile.json'].includes(patch.filePath);
  if (node.stage === 'character') return patch.filePath === 'asset_prompts.json' || patch.filePath === 'asset_library.json';
  if (node.stage === 'storyboard') return patch.filePath === 'storyboard.json' || patch.filePath === 'timeline.json';
  if (node.stage === 'video') return patch.filePath === 'asset_prompts.json' || patch.filePath === 'timeline.json';
  return false;
}

function patchReviewStage(patch: PatchOperation): StudioStageId {
  if (['brief.json', 'campaign_goal.json', 'profile.json'].includes(patch.filePath)) return 'overview';
  if (patch.filePath === 'script.md') return 'script';
  if (patch.filePath === 'asset_prompts.json' || patch.filePath === 'asset_library.json') return 'character';
  if (patch.filePath === 'scenes.json') return 'scene';
  if (patch.filePath === 'storyboard.json' || patch.filePath === 'timeline.json') return 'storyboard';
  if (patch.filePath === 'video_spec.json') return 'video';
  return 'overview';
}

function patchRiskLabel(risk: PatchOperation['riskLevel']) {
  if (risk === 'high') return '高风险';
  if (risk === 'medium') return '中风险';
  return '低风险';
}

function libraryKeyFor(node: StudioCanvasNode) {
  return `${node.stage}:${node.filePath}:${node.title}`;
}

function libraryItemKey(item: AssetLibraryItem) {
  return `${item.type}:${item.sourceFile}:${item.title}`;
}

function isNodeStableForLibrary(node: StudioCanvasNode, workspace: WorkspaceSnapshot | null) {
  return node.status === 'ready' && node.dependencyState === 'current' && node.patchCount === 0 && Boolean(getFile(workspace, node.filePath));
}

function buildLibraryItem(node: StudioCanvasNode): AssetLibraryItem {
  return {
    id: `lib_${node.stage}_${Date.now()}`,
    type: node.stage,
    title: node.title,
    sourceFile: node.filePath,
    summary: node.summary,
    scope: `${node.owner} · ${dependencyStateText(node.dependencyState)}`,
    createdAt: now()
  };
}

function buildNodeRevisionInstruction(node: StudioCanvasNode, request: string) {
  const userRequest = request.trim() || node.action;
  return [
    `只修改 Mission Map 的「${node.label} / ${node.title}」节点。`,
    `目标文件：${node.filePath}。`,
    `节点依赖：${node.dependency}。`,
    `下游影响：${node.impact}。`,
    `用户修改要求：${userRequest}`,
    '必须保持其它节点的既有内容不变；如果必须联动修改下游文件，要在 patch summary 里写清楚原因。',
    '只提交待审批 patch，不要声称已经渲染视频或已经发布。'
  ].join('\n');
}

function now() {
  return new Date().toISOString();
}

function initialAssistantMessage(mode: WorkspaceMode): AgentMessage {
  return {
    id: uid('msg'),
    role: 'assistant',
    content:
      mode === 'smb'
        ? '我是创意总监 Agent。你说清楚要卖什么、给谁看、不能碰什么红线，我会边聊边把视频脚本、分镜、素材提示词、发布文案和 patch 写出来。'
        : '我是创意总监 Agent。你可以像和剪辑搭档聊天一样描述想法，我会边聊边把视频脚本、分镜、素材提示词、发布文案和 patch 写出来。',
    createdAt: now()
  };
}

function workspaceStorageKey(projectId: string) {
  return `videoagent-workspace:${projectId}`;
}

const progressiveDemoSeedVersions: Record<string, string> = {
  'xiaopeng-v2': 'progressive-v1'
};

function demoStorageKey(demoId: string) {
  const seedVersion = progressiveDemoSeedVersions[demoId];
  return seedVersion
    ? `videoagent-demo-workspace:${demoId}:${seedVersion}`
    : `videoagent-demo-workspace:${demoId}`;
}

function demoIdFromQuery() {
  return new URLSearchParams(window.location.search).get('demo');
}

function ensureProductionFlow(workspace: WorkspaceSnapshot): WorkspaceSnapshot {
  const withFlow = workspace.files.some((file) => file.path === PRODUCTION_FLOW_PATH)
    ? workspace
    : writeProductionFlow(workspace, productionFlowFromWorkspace(workspace));
  const flow = productionFlowFromWorkspace(withFlow);
  const recoveredFlow = interruptUnrecoverableStageGenerations(flow);
  return recoveredFlow === flow ? withFlow : writeProductionFlow(withFlow, recoveredFlow);
}

function currentStageDraftWorkspace(
  workspace: WorkspaceSnapshot,
  stage: ProductionStageId
): WorkspaceSnapshot {
  return applyPatchesForPreview(
    workspace,
    patchesOwnedByCurrentStageJob(workspace, readPendingPatches(workspace), stage)
  ) || workspace;
}

/** 把读不懂的原文搬去恢复位，而不是丢掉——那可能是用户唯一一份数据。 */
function quarantineStoredWorkspace(storageKey: string, raw: string) {
  if (!raw) return;
  try {
    window.localStorage.setItem(workspaceRecoveryKey(storageKey), raw);
    window.localStorage.removeItem(storageKey);
  } catch (_) {
    // 配额已满时留着原 key 不动，仍然好过删掉。
  }
}

type StoredWorkspaceResult = {
  workspace: WorkspaceSnapshot | null;
  notice: string;
};

function readStoredWorkspaceResult(storageKey: string): StoredWorkspaceResult {
  const decoded = decodeWorkspaceEnvelope(window.localStorage.getItem(storageKey));
  if (!decoded.ok) {
    if (decoded.reason === 'empty') return { workspace: null, notice: '' };
    quarantineStoredWorkspace(storageKey, decoded.raw);
    return { workspace: null, notice: recoveryNoticeFor(decoded.reason, storageKey) };
  }
  try {
    const parsed = decoded.workspace;
    if (isWorkspaceSnapshot(parsed)) {
      const hasRequiredFiles =
        parsed.files.some((file) => file.path === '.aigc/MEMORY.md') &&
        parsed.files.some((file) => file.path === PRODUCTION_FLOW_PATH);
      const flowFile = parsed.files.find((file) => file.path === PRODUCTION_FLOW_PATH);
      if (hasRequiredFiles && flowFile) {
        JSON.parse(flowFile.content);
        return { workspace: parsed, notice: '' };
      }
    }
  } catch (_) {}
  const raw = window.localStorage.getItem(storageKey) || '';
  quarantineStoredWorkspace(storageKey, raw);
  return { workspace: null, notice: recoveryNoticeFor('unparsable', storageKey) };
}

function readStoredWorkspace(storageKey: string): WorkspaceSnapshot | null {
  return readStoredWorkspaceResult(storageKey).workspace;
}

function safeLoadWorkspace(): StoredWorkspaceResult {
  const projectId = window.localStorage.getItem(activeWorkspaceProjectKey);
  if (projectId) {
    const restored = readStoredWorkspaceResult(workspaceStorageKey(projectId));
    if (restored.workspace) return restored;
    return { workspace: null, notice: restored.notice };
  }
  return { workspace: null, notice: '' };
}

/**
 * 「当前项目」指针丢了不等于没有存档：旧版只有缓存写成功才记指针，超限项目的
 * 兄弟 key 可能还躺在 localStorage 里。全前缀扫一遍，按保存时间从新到旧返回。
 */
function readAllStoredWorkspaces(): Array<{ workspace: WorkspaceSnapshot; savedAt: string }> {
  const found: Array<{ workspace: WorkspaceSnapshot; savedAt: string }> = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key || !key.startsWith('videoagent-workspace:') || key.endsWith(':corrupted')) continue;
    const decoded = decodeWorkspaceEnvelope(window.localStorage.getItem(key));
    if (!decoded.ok) continue;
    const candidate = decoded.workspace;
    if (!isWorkspaceSnapshot(candidate)) continue;
    if (!candidate.files.some((file) => file.path === PRODUCTION_FLOW_PATH)) continue;
    found.push({ workspace: candidate, savedAt: decoded.savedAt });
  }
  found.sort((a, b) => (a.savedAt < b.savedAt ? 1 : a.savedAt > b.savedAt ? -1 : 0));
  return found;
}

function shouldRestoreSavedMessages(workspace: WorkspaceSnapshot) {
  return workspace.files.some((file) => !isInternalWorkspaceFile(file.path));
}

function sanitizeStoredSpec(value: unknown): VideoSpec {
  if (!value || typeof value !== 'object') return defaultVideoSpec;
  const parsed = value as Partial<VideoSpec>;
  if (
    parsed.provider === 'Agnes Video V2.0' &&
    parsed.platform &&
    parsed.generationMode &&
    parsed.aspectRatio &&
    parsed.resolution &&
    parsed.numFrames &&
    parsed.fps
  ) {
    // episodeSeconds 是后加的字段，老存档里没有，归一化会给回默认的 3 分钟；
    // 存了非法值（负数、字符串、超范围）也在这里夹住，不带进生成指令。
    return {
      ...defaultVideoSpec,
      ...parsed,
      episodeSeconds: normalizeEpisodeSeconds(parsed.episodeSeconds)
    } as VideoSpec;
  }
  return defaultVideoSpec;
}

function safeLoadSpec(): VideoSpec {
  const saved = window.localStorage.getItem(specKey);
  if (!saved) return defaultVideoSpec;
  try {
    return sanitizeStoredSpec(JSON.parse(saved));
  } catch (_) {}
  return defaultVideoSpec;
}

/** 空白项目不值得进历史档案；有任何非内部文件或用户发过话才算「做过东西」。 */
function workspaceHasUserContent(workspace: WorkspaceSnapshot, messages: AgentMessage[]): boolean {
  return (
    workspace.files.some((file) => !isInternalWorkspaceFile(file.path)) ||
    messages.some((message) => message.role === 'user')
  );
}

type ServerProjectRecord = {
  projectId: string;
  savedAt: string;
  workspace: WorkspaceSnapshot;
  messages: AgentMessage[];
  videoSpec?: unknown;
};

async function fetchProjectList(): Promise<ProjectSummary[]> {
  const res = await fetch('/api/projects');
  const data = (await res.json()) as { ok?: boolean; projects?: ProjectSummary[] };
  if (!res.ok || !data.ok || !Array.isArray(data.projects)) throw new Error('项目列表读取失败');
  return data.projects;
}

async function fetchProjectRecord(projectId: string): Promise<ServerProjectRecord | null> {
  try {
    const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { ok?: boolean; project?: ServerProjectRecord };
    if (!data.ok || !data.project || !isWorkspaceSnapshot(data.project.workspace)) return null;
    return {
      ...data.project,
      messages: Array.isArray(data.project.messages) ? data.project.messages : []
    };
  } catch (_) {
    return null;
  }
}

/**
 * 渲染兜底归档：不走 effect、不走挂载流程，组件每次渲染都直接调度。
 * 之所以需要它：自动保存曾因「挂载门闩 + Fast Refresh 不重放挂载」整个哑掉，
 * 用户项目只活在页面内存里。渲染是唯一保证发生的事——Fast Refresh 推完新代码
 * 立刻重渲染，正在生成的项目每次 setWorkspace 也重渲染，这张网怎么都兜得住。
 * 平时 effect 通道正常时它只是多写一次相同内容，服务端原子写幂等，无损。
 */
const renderArchiveState = { timer: 0, lastFingerprint: '', inFlight: false };

function scheduleRenderArchive(
  workspace: WorkspaceSnapshot | null,
  messages: AgentMessage[],
  videoSpec: VideoSpec
) {
  if (typeof window === 'undefined' || !workspace) return;
  if (demoIdFromQuery()) return;
  if (!workspaceHasUserContent(workspace, messages)) return;
  const fingerprint =
    `${workspace.projectId}:${workspace.files.length}:` +
    `${workspace.files.reduce((sum, file) => sum + file.version, 0)}:${messages.length}`;
  if (fingerprint === renderArchiveState.lastFingerprint) return;
  if (renderArchiveState.timer) window.clearTimeout(renderArchiveState.timer);
  renderArchiveState.timer = window.setTimeout(() => {
    renderArchiveState.timer = 0;
    if (renderArchiveState.inFlight) return;
    renderArchiveState.inFlight = true;
    pushProjectRecord(workspace, messages, videoSpec, now())
      .then(() => {
        renderArchiveState.lastFingerprint = fingerprint;
      })
      .catch(() => undefined)
      .finally(() => {
        renderArchiveState.inFlight = false;
      });
  }, 1200);
}

async function pushProjectRecord(
  workspace: WorkspaceSnapshot,
  messages: AgentMessage[],
  videoSpec: VideoSpec,
  savedAt: string
): Promise<void> {
  const res = await fetch(`/api/projects/${encodeURIComponent(workspace.projectId)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ workspace, messages, videoSpec, savedAt })
  });
  if (!res.ok) {
    let detail = '';
    try {
      const data = (await res.json()) as { error?: string };
      detail = data.error || '';
    } catch (_) {}
    throw new Error(detail || `保存失败（HTTP ${res.status}）`);
  }
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 5) return '夜深了';
  if (hour < 12) return '早上好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

function shortTime(value: string) {
  try {
    return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  } catch (_) {
    return '';
  }
}

function uniqueStrings(values: Array<string | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean) as string[]));
}

function inferWorkflowFromCommand(text: string, fallback: WorkflowKind): WorkflowKind {
  const value = text.toLowerCase();
  if (value.includes('/calendar') || value.includes('内容日历')) return 'calendar';
  if (value.includes('/weekly') || value.includes('一周')) return 'weekly';
  if (value.includes('/revise') || value.includes('改写') || value.includes('爆改') || value.includes('旧稿')) return 'rewrite';
  if (value.includes('/competitor') || value.includes('竞品')) return 'competitor';
  if (value.includes('/hotspot') || value.includes('热点')) return 'hotspot';
  if (value.includes('/titles') || value.includes('标题')) return 'titles';
  if (value.includes('/cta') || value.includes('引流')) return 'cta';
  if (value.includes('/liveclip') || value.includes('直播')) return 'live_clip';
  if (value.includes('/note') || value.includes('图文')) return 'image_note';
  if (value.includes('/ads') || value.includes('广告')) return 'ad_variants';
  if (value.includes('/multi') || value.includes('多平台')) return 'multiplatform';
  if (value.includes('/brand')) return 'brand';
  if (value.includes('/viral')) return 'viral_ref';
  if (value.includes('/topic')) return 'topic';
  if (value.includes('/scene')) return 'scene';
  if (value.includes('/script') || value.includes('脚本')) return 'script';
  if (value.includes('/shot') || value.includes('分镜')) return 'shot';
  if (value.includes('/prompt') || value.includes('提示词')) return 'prompt';
  if (value.includes('/platform') || value.includes('平台')) return 'platform';
  if (value.includes('/compliance') || value.includes('合规')) return 'compliance';
  if (value.includes('/approval') || value.includes('批准')) return 'approval';
  return fallback;
}

function missionBriefFromWorkspace(workspace: WorkspaceSnapshot | null): MissionBrief {
  const brief = parseJsonFile<BriefFile>(workspace, 'brief.json', {});
  const campaign = parseJsonFile<CampaignGoal>(workspace, 'campaign_goal.json', {});
  const profile = parseJsonFile<ProfileFile>(workspace, 'profile.json', {});
  const platforms = uniqueStrings([brief.platform, campaign.platform, campaign.primaryPlatform, ...(campaign.secondaryPlatforms || []), ...(profile.platforms || [])]);
  const redLines = uniqueStrings([...(brief.constraints || []), ...(profile.bannedExpressions || []), ...(profile.marketingRedLines || [])]).slice(0, 4);

  return {
    title: campaign.title || campaign.topic || campaign.mission || brief.topic || (workspace?.files.some((file) => !isInternalWorkspaceFile(file.path)) ? workspace.title : '') || '待创建 Mission',
    platform: platforms.slice(0, 3).join(' / ') || '待选择平台',
    audience: brief.audience || campaign.audience || profile.targetCustomer || profile.targetAudience || '待确认受众',
    goal: campaign.goal || campaign.conversionGoal || brief.offer || brief.contentGoal || '先用聊天描述你要做的视频',
    tone: brief.tone || profile.tone || '待确认语气',
    redLines: redLines.length ? redLines : ['待确认禁用表达', '待确认素材授权', '待确认平台规则'],
    isBlank: !workspace || !workspace.files.some((file) => !isInternalWorkspaceFile(file.path))
  };
}

function videoDuration(spec: VideoSpec) {
  return Math.round((spec.numFrames / spec.fps) * 10) / 10;
}

function numberFromValue(value: unknown) {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : 0;
}

function durationFromText(text = '') {
  const match = text.match(/(\d{1,3}(?:\.\d+)?)\s*(秒|s|sec|secs|second|seconds)/i);
  return match ? Number(match[1]) : 0;
}

function normalizeAgnesNumFrames(frames: number) {
  const bounded = Math.min(VIDEO_MAX_NUM_FRAMES, Math.max(81, Math.round(frames)));
  return Math.min(VIDEO_MAX_NUM_FRAMES, Math.max(81, Math.round((bounded - 1) / 8) * 8 + 1));
}

function roundFrameRate(frameRate: number) {
  return Math.min(60, Math.max(1, Math.round(frameRate * 10) / 10));
}

function timingForTargetDuration(seconds: number, preferredFrameRate: number, existingFrames: number) {
  const preferredFrames = normalizeAgnesNumFrames(seconds * preferredFrameRate);
  const safeExistingFrames = existingFrames ? normalizeAgnesNumFrames(existingFrames) : 0;
  const numFrames = Math.max(safeExistingFrames, preferredFrames);
  if (seconds * preferredFrameRate <= VIDEO_MAX_NUM_FRAMES) {
    return { numFrames, frameRate: preferredFrameRate };
  }
  return { numFrames: VIDEO_MAX_NUM_FRAMES, frameRate: roundFrameRate(VIDEO_MAX_NUM_FRAMES / seconds) };
}

function sizeHint(spec: VideoSpec) {
  const map: Record<AspectRatio, Record<ResolutionTier, string>> = {
    '16:9': { '480p': '854 x 480', '720p': '1280 x 720', '1080p': '1920 x 1080' },
    '9:16': { '480p': '480 x 854', '720p': '720 x 1280', '1080p': '1080 x 1920' },
    '1:1': { '480p': '480 x 480', '720p': '720 x 720', '1080p': '1080 x 1080' },
    '4:3': { '480p': '640 x 480', '720p': '960 x 720', '1080p': '1440 x 1080' },
    '3:4': { '480p': '480 x 640', '720p': '720 x 960', '1080p': '1080 x 1440' }
  };
  return map[spec.aspectRatio][spec.resolution];
}

function buildSpecInstruction(spec: VideoSpec) {
  const mode = generationModes.find((item) => item.id === spec.generationMode);
  const plan = episodePlan(spec.episodeSeconds);
  const shotsPerSeg = shotsPerSegment(plan.segmentSeconds);
  return `[当前视频规格]
provider: ${spec.provider}
platform: ${spec.platform}
generation_mode: ${spec.generationMode} (${mode?.label || spec.generationMode})
aspect_ratio: ${spec.aspectRatio}
resolution_tier: ${spec.resolution}
size_hint: ${sizeHint(spec)}
num_frames: ${spec.numFrames}
frame_rate: ${spec.fps}
camera_move: ${spec.cameraMove} (${cameraMoveLabel(spec.cameraMove)})
frame_lock: ${spec.frameLock} (${frameLockLabel(spec.frameLock)})
estimated_clip_duration_seconds: ${videoDuration(spec)}
episode_segment_seconds: ${plan.segmentSeconds}
episode_segment_count: ${plan.segmentCount}
episode_total_seconds: ${plan.totalSeconds}

规格要求：
- 输出必须围绕这个视频规格生成脚本、分镜、首帧/多图/关键帧提示词和 render task。
- 成片总时长是用户选的 ${episodeLengthLabel(plan.totalSeconds)}（${plan.totalSeconds}s），按 ${plan.segmentCount} 个小节 × 约 ${plan.segmentSeconds}s 组织；不要把整片需求塞进单条视频，也不要自行改这个总时长。
- 小节是叙事单位，镜头才是渲染单位：一个 ${plan.segmentSeconds}s 小节要拆成 ${shotsPerSeg} 个镜头（目标单镜头 ${targetShotSeconds('realistic')}s，硬上限 ${physicsDurationCap('realistic')}s），全片合计约 ${shotsPerSeg * plan.segmentCount} 个镜头。不要把小节当成一个镜头写。
- 不要声称已经生成 MP4。只提交可审查的 production package 和 patch。
- prompt 结构优先包含 subject, action, scene, camera movement, lighting, style。
- 如果规格和平台冲突，先指出风险，再给推荐修正。`;
}

function snippet(content = '', maxLines = 10) {
  return content
    .split('\n')
    .filter((line) => line.trim().length)
    .slice(0, maxLines)
    .join('\n');
}

/**
 * 去掉镜头标题里重复的场次前缀（「办公室·回忆开始 - 陈雅琴翻看相册」→「陈雅琴翻看相册」）。
 * 只在标题确实以这个场次名开头、且剥掉之后还剩得下东西时才剥：
 * 剥成空字符串等于把这张卡的标题弄没了，那还不如留着重复。
 */
function stripScenePrefix(title: string, sceneTitle: string) {
  if (!title || !sceneTitle || !title.startsWith(sceneTitle)) return title;
  const rest = title.slice(sceneTitle.length).replace(/^\s*[-—–·:：|]\s*/, '').trim();
  return rest || title;
}

function isMostlyEnglishText(value?: unknown) {
  // 模型返回的 JSON 不一定是字符串：prompt 经常是 {subject, action, scene} 这种对象，
  // 直接 .trim() 会在运行时炸掉整个页面，所以统一先用 textField 收敛成字符串。
  const text = textField(value);
  if (!text) return false;
  const latinCount = (text.match(/[A-Za-z]/g) || []).length;
  const chineseCount = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  return latinCount > 12 && chineseCount === 0;
}

function reviewText(value: unknown, fallback: string) {
  const text = textField(value);
  if (!text) return fallback;
  if (isMostlyEnglishText(text)) return '旧版本英文提示词，需要重新生成中文版本后再审查。';
  return text;
}

function textField(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return value.map((item) => textField(item)).filter(Boolean).join('；');
  if (typeof value === 'number') return String(value);
  // 模型把结构化提示词写成对象时，把可读字段拼起来，而不是丢成空字符串。
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>)
      .map((item) => textField(item))
      .filter(Boolean)
      .join('；');
  }
  return '';
}

function textListField(value: unknown): string[] {
  if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
  if (Array.isArray(value)) return value.flatMap((item) => textListField(item));
  return [];
}

function uniqueTexts(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

const IMAGE_URL_KEYS = ['url', 'imageUrl', 'image_url', 'src', 'uri', 'href', 'referenceImageUrl'];
/** 模型用来标注「这张是人脸锚点」的说法：形象锚点 / 人物形象锚点 / 小澎形象锚点 / character anchor… */
const IDENTITY_REFERENCE_PATTERN = /锚点|形象|人物|角色|identity|character|face|portrait/i;

/**
 * 模型会把参考图写成 {url, purpose} 这种带标注的对象，靠 purpose 区分
 * 「场景参考」和「人物形象锚点」。textListField 碰到对象一律返回空数组，
 * 于是角色锚点图被整批静默丢弃，只剩场景图当首帧——视频里的脸来自场景图而非
 * 确认过的角色主图，人物一致性必然崩。
 */
function imageUrlListField(value: unknown): string[] {
  if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
  if (Array.isArray(value)) return value.flatMap((item) => imageUrlListField(item));
  if (value && typeof value === 'object') {
    const entry = value as Record<string, unknown>;
    for (const key of IMAGE_URL_KEYS) {
      const found = imageUrlListField(entry[key]);
      if (found.length) return found;
    }
  }
  return [];
}

const REFERENCE_IMAGE_FIELDS = [
  'referenceImageUrl',
  'referenceImage',
  'referenceImages',
  'imageUrl',
  'image',
  'images',
  'firstFrameUrl',
  'firstFrame',
  'keyframes'
];

/**
 * 拆成两组，因为它们喂给视频模型的方式完全不同：
 * frames 决定首帧/关键帧构图，identities 只用来锁人脸。
 * 混在一起会让「场景图 + 两张人脸」被当成三帧关键帧序列，视频就成了场景渐变到人脸特写。
 */
function partitionReferenceImages(prompt: VideoPromptEntry | null | undefined) {
  const frames: string[] = [];
  const identities: string[] = [];
  if (!prompt) return { frames, identities };
  const entry = prompt as Record<string, unknown>;
  const collect = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(collect);
      return;
    }
    const urls = imageUrlListField(value);
    if (!urls.length) return;
    const purpose = value && typeof value === 'object' && !Array.isArray(value)
      ? textField(
          (value as Record<string, unknown>).purpose ||
            (value as Record<string, unknown>).role ||
            (value as Record<string, unknown>).label ||
            (value as Record<string, unknown>).kind
        )
      : '';
    (IDENTITY_REFERENCE_PATTERN.test(purpose) ? identities : frames).push(...urls);
  };
  REFERENCE_IMAGE_FIELDS.forEach((field) => collect(entry[field]));
  const uniqueFrames = uniqueTexts(frames);
  return {
    frames: uniqueFrames,
    identities: uniqueTexts(identities).filter((url) => !uniqueFrames.includes(url))
  };
}

/**
 * 换掉这一镜的构图参考图，但保留身份锚点。
 *
 * 直接 `referenceImages: [shotImage]` 会把模型标注过的人脸锚点一起抹掉——
 * 那正是上一轮好不容易接进渲染请求的东西，一行覆盖就又没了。
 * 所以只丢构图用的那些（纯字符串、以及 purpose 不是身份的对象），锚点原样留下。
 */
function withShotFirstFrame(prompt: VideoPromptEntry, shotImage: string): VideoPromptEntry {
  const entry = prompt as Record<string, unknown>;
  const keptIdentities = Array.isArray(entry.referenceImages)
    ? entry.referenceImages.filter((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
        const record = item as Record<string, unknown>;
        const purpose = textField(record.purpose || record.role || record.label || record.kind);
        return IDENTITY_REFERENCE_PATTERN.test(purpose);
      })
    : [];
  return {
    ...prompt,
    referenceImageUrl: shotImage,
    referenceImages: [shotImage, ...keptIdentities]
  } as VideoPromptEntry;
}

function referenceImagesForPrompt(prompt: VideoPromptEntry | null | undefined) {
  const { frames, identities } = partitionReferenceImages(prompt);
  return [...frames, ...identities];
}

function videoModeForPrompt(prompt: VideoPromptEntry | null | undefined, spec: Record<string, unknown>, referenceImages: string[]) {
  const entry = (prompt || {}) as Record<string, unknown>;
  const explicitMode = textField(entry.mode || entry.videoMode || entry.generationMode);
  const specMode = textField(spec.mode || spec.generationMode);
  const mode = explicitMode || specMode;
  if (mode === 'keyframes' || mode === 'multi_image' || referenceImages.length > 1) return 'keyframes';
  if ((mode === 'image_to_video' || mode === 'ti2vid' || referenceImages.length === 1) && referenceImages.length) return 'ti2vid';
  return '';
}

function chineseOnlyVideoNegativePrompt(extra?: string) {
  return [
    extra,
    '任何文字、字幕、标题卡、水印、英文单词、拼音、拉丁字母、乱码文字、不可读文字、可读招牌、屏幕文字、书本文字、菜单文字、包装文字',
    // 音频和画面是两条独立通道：只压住画面上的英文，模型照样会开口说英文。
    '英文语音、英文对白、英文旁白、英文歌词、外语配音、中英夹杂、机器音、口音混杂',
    // 人种要单独列，而且要把「欧美脸」写成具体的词。只写「换脸、脸部不一致」拦不住它：
    // 模型并不认为把中国面孔画成混血是「换了一个人」，它认为那还是同一个角色。
    '欧美面孔、西方长相、白人面孔、黑人面孔、混血脸、中途改变人种、五官西化、深邃眼窝高鼻梁的欧化长相',
    // 脚和手一样是末端肢体，模型渲不好；鞋子还多一层——它经常把鞋渲成半透明或者裸足。
    '赤脚、脚趾从鞋子里露出、多余脚趾、畸形脚部、鞋子变形、鞋子与脚穿模',
    '动画风、二次元、卡通、玩偶脸、三维渲染、夸张比例、换脸、换人、脸部不一致、多余手指、畸形手指'
  ]
    .filter(Boolean)
    .join('，');
}

function normalizeCharacterCard(entry: CharacterPromptEntry, index: number, source: string): CharacterAssetCard {
  const name = textField(entry.name) || textField(entry.title) || textField(entry.role) || `角色 ${index + 1}`;
  const role = textField(entry.role) || textField(entry.title) || source;
  const description =
    textField(entry.description) ||
    textField(entry.appearance) ||
    [textField(entry.outfit), textField(entry.style), textField(entry.voice)].filter(Boolean).join('；') ||
    textField(entry.prompt) ||
    '角色描述待补齐。';
  return {
    id: textField(entry.id) || `${source}_${index}`,
    name: reviewText(name, `角色 ${index + 1}`),
    role: reviewText(role, source),
    description: reviewText(description, '角色描述待补齐。'),
    consistency: reviewText(textField(entry.consistencyPrompt) || textField(entry.prompt), '角色一致性待补齐。'),
    source,
    negativePrompt: textField(entry.negativePrompt) ? reviewText(textField(entry.negativePrompt), '') : undefined,
    // 这一支读的是老 asset_prompts.json，里面不会有视觉设定；归一化成空设定，界面走空状态。
    visual: normalizeCharacterVisualSpec((entry as Record<string, unknown>).visual)
  };
}

function characterAssetsFromPrompts(prompts: AssetPrompts) {
  const explicitCharacters = [
    ...(prompts.characters || []).map((entry, index) => normalizeCharacterCard(entry, index, 'characters')),
    ...(prompts.roles || []).map((entry, index) => normalizeCharacterCard(entry, index, 'roles'))
  ];
  if (explicitCharacters.length) return explicitCharacters;

  const character = prompts.characterConsistency;
  if (!character?.primarySubject && !character?.consistencyPrompt && !character?.negativePrompt) return [];
  return [
    {
      id: 'character_primary',
      name: reviewText(character.primarySubject, '主角色'),
      role: '主角色',
      description: reviewText(character.consistencyPrompt, '从角色一致性提示词生成的主角色资产。'),
      consistency: reviewText(character.consistencyPrompt, '角色一致性待补齐。'),
      source: 'characterConsistency',
      negativePrompt: character.negativePrompt ? reviewText(character.negativePrompt, '') : undefined,
      visual: emptyCharacterVisualSpec()
    }
  ];
}

function renderTaskLabel(value: string | undefined, fallback: string) {
  const map: Record<string, string> = {
    hook_video: '开场镜头',
    pain_broll: '痛点补充镜头',
    proof_visual: '证明点画面',
    trust_scene: '信任解释镜头',
    cta_visual: '行动引导镜头'
  };
  if (!value) return fallback;
  return map[value] || reviewText(value, fallback);
}

function specValueLabel(key: string, value: unknown) {
  const text = String(value);
  const map: Record<string, Record<string, string>> = {
    platform: {
      xiaohongshu: '小红书',
      douyin: '抖音'
    },
    generationMode: {
      image_to_video: '图生视频',
      text_to_video: '文生视频',
      multi_image: '多图视频',
      keyframes: '关键帧'
    }
  };
  return map[key]?.[text] || text;
}

function formatAssetPromptsReview(data: AssetPrompts) {
  const prompts = data.prompts || [];
  const spec = data.renderSpec || {};
  const character = data.characterConsistency || {};
  const specText = [
    spec.platform ? `平台：${specValueLabel('platform', spec.platform)}` : '',
    spec.aspectRatio ? `画幅：${specValueLabel('aspectRatio', spec.aspectRatio)}` : '',
    spec.resolutionTier ? `清晰度：${specValueLabel('resolutionTier', spec.resolutionTier)}` : '',
    spec.generationMode ? `生成方式：${specValueLabel('generationMode', spec.generationMode)}` : ''
  ].filter(Boolean);

  const lines = [
    '# 视频生成任务预览',
    '',
    data.visualStyle ? `## 视觉方向\n${reviewText(data.visualStyle, '待生成视觉方向')}` : '',
    specText.length ? `## 生成规格\n${specText.join(' / ')}` : '',
    character.primarySubject || character.consistencyPrompt || character.negativePrompt
      ? [
          '## 角色一致性',
          character.primarySubject ? `主体：${reviewText(character.primarySubject, '待生成主体说明')}` : '',
          character.consistencyPrompt ? `一致性：${reviewText(character.consistencyPrompt, '待生成角色一致性说明')}` : '',
          character.negativePrompt ? `避免项：${reviewText(character.negativePrompt, '待生成避免项')}` : ''
        ]
          .filter(Boolean)
          .join('\n')
      : '',
    prompts.length
      ? [
          '## 镜头任务',
          ...prompts.map((item, index) =>
            [
              `${index + 1}. ${renderTaskLabel(item.renderTask, `镜头 ${index + 1}`)}${item.durationSeconds ? `（${item.durationSeconds}s）` : ''}`,
              item.prompt ? `   ${reviewText(item.prompt, '待生成镜头提示词')}` : ''
            ]
              .filter(Boolean)
              .join('\n')
          )
        ].join('\n')
      : '## 镜头任务\n还没有镜头任务。先让系统把当前制作包整理成视频模型可用的任务。',
    data.reuseNotes?.length ? `## 注意事项\n${data.reuseNotes.map((item) => `- ${item}`).join('\n')}` : ''
  ].filter(Boolean);

  return lines.join('\n\n');
}

function providerLabel(provider?: string) {
  if (!provider || provider === 'mock') return '本地模式';
  return statusLabel(provider);
}

function providerHint(provider?: string) {
  if (!provider || provider === 'mock') return '未配置在线模型，当前使用本地生成器';
  return '在线模型已连接';
}

function draftFromConfig(config: ModelConfigStatus, current: ModelConfigDraft): ModelConfigDraft {
  const text = config.provider.text;
  const image = config.provider.image;
  const video = config.provider.video;
  const baseUrl = config.provider.customBaseUrl || image?.baseUrl || video?.baseUrl || current.baseUrl;
  return {
    ...current,
    baseUrl,
    apiKey: '',
    textModel: text?.model || current.textModel,
    imageModel: image?.model || current.imageModel,
    videoModel: video?.model || current.videoModel,
  };
}

export default function Page() {
  const [workspace, setWorkspace] = useState<WorkspaceSnapshot | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [instruction, setInstruction] = useState('');
  const [customStyleText, setCustomStyleText] = useState('');
  const [workflow, setWorkflow] = useState<WorkflowKind>('generate');
  const [videoSpec, setVideoSpec] = useState<VideoSpec>(defaultVideoSpec);
  // 渲染即兜底归档（见 scheduleRenderArchive 注释）：只调度、防抖、幂等，渲染期间无副作用。
  scheduleRenderArchive(workspace, messages, videoSpec);
  // 总时长现在是用户可调的，成本预估必须跟着变——否则选了 5 分钟还显示 3 分钟的渲染量。
  const currentRenderBudget = useMemo(
    () => estimateRenderBudget({ totalSeconds: episodePlan(videoSpec.episodeSeconds).totalSeconds }),
    [videoSpec.episodeSeconds]
  );
  const [selectedPatchId, setSelectedPatchId] = useState('');
  const [lastRun, setLastRun] = useState<AgentRunResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const [modelConfig, setModelConfig] = useState<ModelConfigStatus | null>(null);
  const [modelDraft, setModelDraft] = useState<ModelConfigDraft>(defaultModelDraft);
  const [availableModels, setAvailableModels] = useState<AvailableModelOptions>(emptyModelOptions);
  const [modelAdminToken, setModelAdminToken] = useState('');
  const [savingModelConfig, setSavingModelConfig] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelConfigMessage, setModelConfigMessage] = useState('');
  const [error, setError] = useState('');
  const [navSection, setNavSection] = useState<NavSection>('mission');
  const [contextOpen, setContextOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [contextDocked, setContextDocked] = useState(false);
  const [inspectorDocked, setInspectorDocked] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState('');
  const [selectedSceneId, setSelectedSceneId] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState('node_mission');
  const [nodeRevisionText, setNodeRevisionText] = useState('');
  /** 画布是主视角，审查面板按需滑出：点开一张产物卡才展开这一阶段的审查。 */
  const [canvasReviewOpen, setCanvasReviewOpen] = useState(false);
  const [selectedCanvasCardId, setSelectedCanvasCardId] = useState('');
  /** 记住上一次已经弹过审查的「阶段+状态+草稿版本」，避免同一件事反复打断用户。 */
  const reviewSignalRef = useRef('');
  const [autopilot, setAutopilot] = useState(false);
  /**
   * 工作台两侧栏的显隐。制作助理和节点检查器都是辅助视角，画布才是主视角；
   * 用户想把注意力全给画布时可以收起，选择按浏览器记住，不写进项目档案。
   */
  const [assistantHidden, setAssistantHidden] = useState(false);
  const [inspectorHidden, setInspectorHidden] = useState(false);
  /**
   * 偏好在点击时就落盘，不另开一个 useEffect 去同步。首屏读偏好的 effect 和写偏好的 effect
   * 在同一次挂载里按声明顺序执行，写的那个会拿初始值把刚读出来的偏好覆盖掉，
   * 严格模式下二次挂载读到的就是被覆盖后的值——刷新一次，用户收起的栏又自己弹回来了。
   */
  const togglePanelHidden = (panel: 'assistant' | 'inspector', hidden: boolean) => {
    if (panel === 'assistant') setAssistantHidden(hidden);
    else setInspectorHidden(hidden);
    window.localStorage.setItem(`videoagent-${panel}-hidden`, hidden ? '1' : '0');
  };
  const [activeTab, setActiveTab] = useState<StudioStageId>('overview');
  const [homeMenu, setHomeMenu] = useState<'spec' | 'skill' | 'agent' | 'style' | 'length' | null>(null);
  // 自定义秒数输入框的草稿。直接写进 videoSpec 会让「删到空再重打」中途被 clamp 成 10。
  const [episodeSecondsDraft, setEpisodeSecondsDraft] = useState('');
  // 分批生成时的进度文案。没有它，用户面对的是一个卡好几分钟、什么都不说的转圈。
  const [stageBatchProgress, setStageBatchProgress] = useState('');
  const [taskAgent, setTaskAgent] = useState<GenreId>('auto');
  const [modelPanelOpen, setModelPanelOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [projectList, setProjectList] = useState<ProjectSummary[]>([]);
  const [projectListLoading, setProjectListLoading] = useState(false);
  const [projectSyncedAt, setProjectSyncedAt] = useState('');
  const [roleExpressionDrafts, setRoleExpressionDrafts] = useState<Record<string, CharacterExpressionId[]>>({});
  const [roleAdjustmentDrafts, setRoleAdjustmentDrafts] = useState<Record<string, string>>({});
  const [roleReferenceStrategyDrafts, setRoleReferenceStrategyDrafts] = useState<Record<string, CharacterReferenceStrategyId>>({});
  const [roleDesignDrafts, setRoleDesignDrafts] = useState<Record<string, CharacterDesignRender>>({});
  const [roleActiveVariantDrafts, setRoleActiveVariantDrafts] = useState<Record<string, string>>({});
  const [roleFaceAnchorDrafts, setRoleFaceAnchorDrafts] = useState<Record<string, string>>({});
  const [roleDesignPreviewKinds, setRoleDesignPreviewKinds] = useState<Record<string, CharacterDesignOutputKind>>({});
  const [roleDesignNotice, setRoleDesignNotice] = useState('');
  const [sceneDesignNotice, setSceneDesignNotice] = useState('');
  /** 视觉设定画板：当前进入的角色、当前展开的模块，以及各图片位的生成状态。 */
  const [characterBoardId, setCharacterBoardId] = useState('');
  const [characterBoardTab, setCharacterBoardTab] = useState<CharacterBoardTabId>('identity');
  const [characterSlotStates, setCharacterSlotStates] = useState<Record<string, CharacterSlotState>>({});
  const [scriptDraft, setScriptDraft] = useState('');
  const [videoConfirming, setVideoConfirming] = useState(false);
  const [stitchStarting, setStitchStarting] = useState(false);
  /**
   * 用户勾选采纳的自动剪辑建议（按镜头 id）。
   * 缺省一个都不勾：删掉的镜头是花钱渲出来的，而「这个空镜是废镜还是导演留的呼吸」
   * 只有人能判断。默认全勾的版本迟早会删掉某个用户特意留的静默。
   */
  const [acceptedAutoCutIds, setAcceptedAutoCutIds] = useState<string[]>([]);
  // null = 还没探过这台机器上有没有 ffmpeg。探一次缓存住。
  const [stitchProbe, setStitchProbe] = useState<{ available: boolean; hint: string } | null>(null);
  const finalCutPollTimerRef = useRef<number | null>(null);
  const videoPollTimerRef = useRef<number | null>(null);
  const videoBatchRunRef = useRef(0);
  // 当前有轮询循环在跑的那一批的 token。0 = 没有循环在跑。
  // 用来保证「每提交完一个镜头就尝试开轮询」不会开出 12 个并行循环。
  const videoPollLoopRef = useRef(0);
  const videoRecoveryKeyRef = useRef('');
  const videoSubmissionInFlightRef = useRef(false);
  // null = 还没问过后端质检是否可用。问一次缓存住，别让每个镜头都去探一遍。
  const videoQaEnabledRef = useRef<boolean | null>(null);
  const videoQaInFlightRef = useRef(new Set<string>());
  /** 当前这一批的场次链。同一场次的镜头串行跑，上一镜的尾帧接给下一镜。 */
  const videoChainsRef = useRef<ShotChain[]>([]);
  /** 正在被推进的下一镜，防止同一个镜头被两条路径同时提交（重复计费）。 */
  const chainAdvanceInFlightRef = useRef(new Set<string>());
  /**
   * 上游是否已经明确拒绝过内联尾帧。
   * 拒过一次就整批不再尝试：每试一次就是一次白等，而结论对整批是同一个。
   */
  const inlineFrameRejectedRef = useRef(false);
  const workspaceRef = useRef<WorkspaceSnapshot | null>(null);
  const messagesRef = useRef<AgentMessage[]>([]);
  const videoSpecRef = useRef<VideoSpec>(defaultVideoSpec);
  /** 写档串行化：同一个项目文件不并发写，永远写「排队时刻的最新快照」。 */
  const projectSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const stageGenerationJobRef = useRef(new Map<ProductionStageId, string>());
  const stageRunRef = useRef(new Map<ProductionStageId, StageRun>());
  const stageRunTokenRef = useRef(new Map<ProductionStageId, number>());
  const activeStageGenerationCountRef = useRef(0);
  const confirmationInFlightRef = useRef(new Set<string>());
  const demoWorkspaceId = typeof window === 'undefined' ? null : demoIdFromQuery();

  function focusInitialProductionStage(snapshot: WorkspaceSnapshot) {
    const stage = productionFlowFromWorkspace(snapshot).currentStage;
    setActiveTab(stage);
    setSelectedNodeId(`node_${stage}`);
  }

  useEffect(() => {
    let cancelled = false;

    async function loadDemoWorkspaceFromQuery() {
      const demoId = demoIdFromQuery();
      if (!demoId) return false;
      const savedDemo = readStoredWorkspace(demoStorageKey(demoId));
      if (savedDemo) {
        const restoredDemo = ensureProductionFlow(savedDemo);
        setWorkspace(restoredDemo);
        setWorkflow(restoredDemo.activeWorkflow);
        setVideoSpec(defaultVideoSpec);
        setInstruction('');
        setMessages([initialAssistantMessage(restoredDemo.mode)]);
        focusInitialProductionStage(restoredDemo);
        return true;
      }
      const res = await fetch(`/api/demo-workspace/${encodeURIComponent(demoId)}`);
      const data = (await res.json()) as { ok?: boolean; error?: string; workspace?: WorkspaceSnapshot };
      if (!res.ok || !data.workspace) throw new Error(data.error || '制作包加载失败');
      if (cancelled) return true;
      const demoWorkspace = ensureProductionFlow(data.workspace);
      // 这句以前写死成「12 个十五秒视频任务」，只对 xiaopeng-v2 那一份成立。
      // 分镜改成按时长拆分之后，镜头数不再等于场景数，写死的数字会直接和用户看到的对不上。
      const demoShotCount = storyboardScenes(demoWorkspace).length;
      const demoSceneCount = productionScenesFromWorkspace(demoWorkspace).length;
      const demoMessages: AgentMessage[] = [
        {
          id: uid('msg'),
          role: 'assistant',
          content: `${demoWorkspace.title || '制作包'} 已载入。当前工作区包含 ${demoSceneCount} 个场景、${demoShotCount} 个镜头，以及对应的参考图和中文字幕规则。`,
          createdAt: now()
        }
      ];
      try {
        window.localStorage.setItem(demoStorageKey(demoId), encodeWorkspaceEnvelope(demoWorkspace, now()));
        window.localStorage.setItem(messagesKey, JSON.stringify(demoMessages));
      } catch (err) {
        setError(
          isQuotaExceededError(err)
            ? '浏览器存储空间已满，演示项目没有缓存到本地，但可以正常浏览。'
            : '演示项目未能缓存到浏览器，但可以正常浏览。'
        );
      }
      setWorkspace(demoWorkspace);
      setWorkflow(demoWorkspace.activeWorkflow);
      setVideoSpec(defaultVideoSpec);
      setInstruction('');
      setMessages(demoMessages);
      focusInitialProductionStage(demoWorkspace);
      setNavSection('mission');
      setRoleDesignDrafts({});
      setRoleActiveVariantDrafts({});
      setRoleFaceAnchorDrafts({});
      setRoleDesignPreviewKinds({});
      setRoleDesignNotice('');
      return true;
    }

    function applyServerProject(record: ServerProjectRecord) {
      const loaded = ensureProductionFlow(record.workspace);
      setWorkspace(loaded);
      setWorkflow(loaded.activeWorkflow);
      setVideoSpec(sanitizeStoredSpec(record.videoSpec));
      setInstruction('');
      setMessages(record.messages.length ? record.messages : [initialAssistantMessage(loaded.mode)]);
      setProjectSyncedAt(record.savedAt);
      focusInitialProductionStage(loaded);
      try {
        window.localStorage.setItem(activeWorkspaceProjectKey, loaded.projectId);
      } catch (_) {}
    }

    function loadStoredWorkspace() {
      const restored = safeLoadWorkspace();
      let recovered = restored.workspace;
      // 指针没指到存档时，扫全部存量 key：最新的恢复到屏幕，其余直接迁移入档。
      if (!recovered) {
        const strays = readAllStoredWorkspaces();
        if (strays.length) {
          recovered = strays[0].workspace;
          for (const stray of strays.slice(1)) {
            void pushProjectRecord(stray.workspace, [], defaultVideoSpec, stray.savedAt || now()).catch(() => undefined);
          }
        }
      }
      const loaded = ensureProductionFlow(recovered || createBlankWorkspace('smb'));
      if (restored.notice) setError(restored.notice);
      const savedMessages = window.localStorage.getItem(messagesKey);
      const loadedSpec = safeLoadSpec();
      setWorkspace(loaded);
      setWorkflow(loaded.activeWorkflow);
      setVideoSpec(loadedSpec);
      setInstruction('');
      let restoredMessages: AgentMessage[] = [initialAssistantMessage(loaded.mode)];
      if (shouldRestoreSavedMessages(loaded) && savedMessages) {
        try {
          const parsed = JSON.parse(savedMessages) as AgentMessage[];
          if (Array.isArray(parsed) && parsed.length) restoredMessages = parsed;
        } catch (_) {}
      }
      setMessages(restoredMessages);
      focusInitialProductionStage(loaded);
      // 只活在浏览器里的存量项目第一时间补写进磁盘档案，之后清缓存、换浏览器都不丢。
      if (workspaceHasUserContent(loaded, restoredMessages)) {
        void pushProjectRecord(loaded, restoredMessages, loadedSpec, now())
          .then(() => setProjectSyncedAt(now()))
          .catch(() => undefined);
      }
    }

    async function loadPersistedWorkspace() {
      // Fast Refresh 会带着内存里的最新工作区重放这个挂载流程。那份数据可能比任何
      // 存档都新（甚至从没进过 localStorage）——先把它归档，然后原样保留，绝不覆盖。
      const inMemory = workspaceRef.current;
      if (inMemory && workspaceHasUserContent(inMemory, messagesRef.current) && !demoIdFromQuery()) {
        void persistActiveProjectToServer();
        void refreshProjectList();
        return;
      }
      // 磁盘档案是真源，localStorage 只是缓存：3MB 上限超了缓存就不写，档案不受限。
      let list: ProjectSummary[] = [];
      try {
        list = await fetchProjectList();
      } catch (_) {}
      if (cancelled) return;
      setProjectList(list);
      const storedActiveId = window.localStorage.getItem(activeWorkspaceProjectKey) || '';
      const candidates = [...new Set([storedActiveId, ...list.map((item) => item.projectId)])].filter(Boolean);
      for (const projectId of candidates) {
        const record = await fetchProjectRecord(projectId);
        if (cancelled) return;
        if (record) {
          applyServerProject(record);
          return;
        }
      }
      loadStoredWorkspace();
    }

    void loadDemoWorkspaceFromQuery()
      .then(async (loadedDemo) => {
        if (!cancelled && !loadedDemo) await loadPersistedWorkspace();
      })
      .catch(async (err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '制作包加载失败');
          await loadPersistedWorkspace().catch(() => loadStoredWorkspace());
        }
      });

    fetch('/api/health')
      .then((res) => res.json())
      .then(setHealth)
      .catch(() => undefined);
    fetch('/api/model-config')
      .then((res) => res.json())
      .then((data: ModelConfigStatus) => {
        setModelConfig(data);
        setHealth({ ok: data.ok, provider: data.provider });
        setModelDraft((prev) => draftFromConfig(data, prev));
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!workspace) return;
    const demoId = demoIdFromQuery();
    const storageKey = demoId ? demoStorageKey(demoId) : workspaceStorageKey(workspace.projectId);
    const payload = encodeWorkspaceEnvelope(workspace, now());
    const size = localStorageByteLength(payload);
    // 正式项目的真源在磁盘档案（data/projects/），localStorage 只是加速缓存：
    // 超限或配额满时静默跳过即可。demo 工作区不进档案，超限仍要明说。
    if (size > MAX_WORKSPACE_PERSISTED_BYTES) {
      if (demoId) {
        setError(
          `演示工作区体积 ${(size / 1024 / 1024).toFixed(1)}MB 已超过浏览器缓存上限，本次修改没有保存，刷新页面会还原演示内容。`
        );
      }
      return;
    }
    try {
      window.localStorage.setItem(storageKey, payload);
      if (!demoId) window.localStorage.setItem(activeWorkspaceProjectKey, workspace.projectId);
    } catch (err) {
      if (demoId) {
        setError(
          isQuotaExceededError(err)
            ? '浏览器存储空间已满，演示工作区的修改没有缓存，刷新页面会还原演示内容。'
            : '演示工作区未能缓存到浏览器，刷新页面会还原演示内容。'
        );
      }
    }
  }, [workspace]);

  useEffect(() => {
    if (messages.length) window.localStorage.setItem(messagesKey, JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    videoSpecRef.current = videoSpec;
  }, [videoSpec]);

  /**
   * 服务端归档：工作区、消息或参数一变，防抖 800ms 后写进 data/projects/<projectId>.json。
   * 这份档案没有 3MB 上限，关网页、清缓存、换浏览器都还在——它才是「历史没保存」的答案。
   *
   * 这里刻意没有「加载完成」门闩：曾经用一个挂载时才打开的 ref 拦截过早写入，
   * 结果 Fast Refresh 换了代码却没跑挂载流程，门闩永远关着，自动保存整个哑掉。
   * 真正要防的只是「把空白盖到档案上」，hasUserContent 本身就是那道门。
   */
  useEffect(() => {
    if (!workspace) return;
    if (demoIdFromQuery()) return;
    if (!workspaceHasUserContent(workspace, messages)) return;
    const timer = window.setTimeout(() => {
      void persistActiveProjectToServer();
    }, 800);
    return () => window.clearTimeout(timer);
  }, [workspace, messages, videoSpec]);

  useEffect(() => {
    window.localStorage.setItem(specKey, JSON.stringify(videoSpec));
  }, [videoSpec]);

  useEffect(() => {
    setAutopilot(window.localStorage.getItem('videoagent-autopilot') === '1');
    setAssistantHidden(window.localStorage.getItem('videoagent-assistant-hidden') === '1');
    setInspectorHidden(window.localStorage.getItem('videoagent-inspector-hidden') === '1');
  }, []);

  /**
   * 画布是主视角，但「轮到你了」不能藏在画布后面：当前阶段一旦落到需要人做决定的
   * 状态（待确认 / 需重做 / 已中断），审查抽屉自动滑出一次。只有阶段、状态或草稿版本
   * 变化才会再次弹出，用户手动收起后不会被同一件事重复打断。
   */
  useEffect(() => {
    if (!workspace) return;
    const flow = productionFlowFromWorkspace(workspace);
    const stage: ProductionStageId = activeTab === 'overview' ? flow.currentStage : activeTab;
    const record = flow.stages[stage];
    const needsAction = record.status === 'ready_for_review' || record.status === 'stale' || record.status === 'failed';
    const signal = needsAction ? `${stage}:${record.status}:${record.draftVersion ?? ''}` : '';
    if (signal && signal !== reviewSignalRef.current) setCanvasReviewOpen(true);
    reviewSignalRef.current = signal;
  }, [workspace, activeTab]);

  useEffect(() => {
    window.localStorage.setItem('videoagent-autopilot', autopilot ? '1' : '0');
  }, [autopilot]);


  useEffect(() => {
    return () => {
      videoBatchRunRef.current += 1;
      videoPollLoopRef.current = 0;
      if (videoPollTimerRef.current) window.clearTimeout(videoPollTimerRef.current);
      if (finalCutPollTimerRef.current) window.clearTimeout(finalCutPollTimerRef.current);
    };
  }, []);

  /**
   * 合成跑在服务端，刷新页面不会打断它，但轮询会断。不接回来的话，
   * 用户看到的就是一个永远停在某个百分比的进度条，而成片其实早就好了。
   */
  useEffect(() => {
    if (!workspace) return;
    const finalCut = productionFlowFromWorkspace(workspace).finalCut;
    if (!isFinalCutInFlight(finalCut) || finalCutPollTimerRef.current) return;
    pollFinalCut(finalCut!.jobId);
  }, [workspace]);

  /** 片段一齐就探一次 ffmpeg，好让合成按钮在用户点它之前就知道自己能不能用。 */
  useEffect(() => {
    if (!workspace || activeTab !== 'video' || stitchProbe) return;
    const flow = productionFlowFromWorkspace(workspace);
    const prompts = normalizedVideoPrompts(parseJsonFile<AssetPrompts>(workspace, 'asset_prompts.json', {}));
    if (videoBatchStatus(flow.videoJobs as VideoRenderJob[], prompts.length) !== 'clips_ready') return;
    void probeStitchSupport();
  }, [workspace, activeTab, stitchProbe]);

  useEffect(() => {
    workspaceRef.current = workspace;
  }, [workspace]);

  useEffect(() => {
    if (!workspace) return;
    const allBatchJobs = productionFlowFromWorkspace(workspace).videoJobs as VideoRenderJob[];
    if (videoSubmissionInFlightRef.current) return;
    // 质检把镜头打回 ready 去重渲时，它看起来和「刷新打断、从没提交过」一模一样。
    // 不挡住这里，同一个镜头会被质检重渲和续跑各提交一次——重复生成，重复计费。
    if (videoQaInFlightRef.current.size) return;
    if (unrecoverableRestoredVideoJobIds(allBatchJobs).length) {
      setWorkspace((current) => {
        if (!current) return current;
        return updateProductionFlow(current, (flow) => {
          const interruptedIds = new Set(unrecoverableRestoredVideoJobIds(flow.videoJobs as VideoRenderJob[]));
          if (!interruptedIds.size) return flow;
          const nextJobs = (flow.videoJobs as VideoRenderJob[]).map((job) => interruptedIds.has(job.id)
            ? {
                ...job,
                status: 'failed' as const,
                // 从没提交过 vs 提交了但没拿到任务 ID：前者重试完全安全，后者才有重复生成的风险。
                error: job.status === 'ready' ? VIDEO_NEVER_SUBMITTED_ERROR : VIDEO_SUBMISSION_INTERRUPTED_ERROR
              }
            : job
          );
          const batch = videoBatchStatus(nextJobs);
          return {
            ...flow,
            currentStage: 'video',
            stages: {
              ...flow.stages,
              video: {
                ...flow.stages.video,
                status: batch === 'failed' ? 'failed' : 'rendering',
                error: batch === 'clips_ready' ? '全部片段已完成，等待合成为单一成片文件。' : null
              }
            },
            videoJobs: nextJobs
          };
        });
      });
      return;
    }
    // 刷新打断提交后，把还没发出去的镜头接着提交完，而不是让用户看着一堆「中断」。
    // 用户点「确认视频任务并开始生成」时的意图就是把这一批跑完，续跑正是兑现这个意图。
    const readyJobs = resubmittableRestoredVideoJobs(allBatchJobs);
    if (readyJobs.length) {
      const data = parseJsonFile<AssetPrompts>(workspace, 'asset_prompts.json', {});
      if (!(data.prompts || []).length) {
        // 任务包都没了，续跑无从谈起，只能标失败让用户重新准备。
        setWorkspace((current) => current && updateProductionFlow(current, (flow) => ({
          ...flow,
          videoJobs: (flow.videoJobs as VideoRenderJob[]).map((job) => job.status === 'ready'
            ? { ...job, status: 'failed' as const, error: VIDEO_NEVER_SUBMITTED_ERROR }
            : job)
        })));
        return;
      }
      const resumeToken = videoBatchRunRef.current + 1;
      videoBatchRunRef.current = resumeToken;
      videoSubmissionInFlightRef.current = true;
      // 传整批而不是 readyJobs：续跑同样要按场次链来，已经完成的前序镜头决定了
      // 哪些 ready 现在就能提交、哪些还得等前一镜。只传 ready 的那些等于把并发放回来了。
      void submitChainedVideoJobs(allBatchJobs, resumeToken, data, async (body) => fetch('/api/video/render', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      })).finally(() => {
        videoSubmissionInFlightRef.current = false;
      });
      return;
    }

    // 刷新时正好卡在质检中的片段：视频已经渲染出来了，重新抽帧送检就行，不用重渲。
    // 不接这一段的话，它们会永远停在「画面质检中」，而重渲按钮又不认这个状态。
    const pendingQaJobs = qaPendingVideoJobs(allBatchJobs);
    if (pendingQaJobs.length) {
      const qaToken = videoBatchRunRef.current;
      pendingQaJobs.forEach((job) => void runVideoQaForJob(qaToken, job));
    }

    const resumableJobs = resumableVideoJobs(allBatchJobs);
    const hasActiveBatchJobs = allBatchJobs.some((job) => job.status === 'submitting' || job.status === 'submitted' || job.status === 'polling');
    if (!hasActiveBatchJobs) {
      videoRecoveryKeyRef.current = '';
      return;
    }
    if (!resumableJobs.length) return;
    const recoveryKey = videoRecoveryBatchKey(workspace.projectId, allBatchJobs);
    if (videoRecoveryKeyRef.current === recoveryKey) return;
    const batchToken = videoBatchRunRef.current + 1;
    videoBatchRunRef.current = batchToken;
    videoRecoveryKeyRef.current = recoveryKey;
    scheduleVideoBatchPoll(batchToken, 1);
  }, [workspace]);

  const storedPendingPatches = useMemo(() => readPendingPatches(workspace), [workspace]);
  const patchReviewState = useMemo(
    () => workspace
      ? classifyPendingPatchesForReview(workspace, storedPendingPatches)
      : { reviewable: [], superseded: [], quarantined: [], quarantineNotes: [], issues: [] },
    [workspace, storedPendingPatches]
  );
  const pendingPatches = patchReviewState.reviewable;

  // 托管模式：运行完成后自动合并低风险 patch（高风险仍需人工确认）
  useEffect(() => {
    if (!autopilot || !workspace || !lastRun) return;
    const lowRisk = autopilotPatchesForRun(workspace, lastRun.patchOperations)
      .filter((patch) => !isProductionStageFile(patch.filePath));
    if (!lowRisk.length) return;
    const status = overallStatus(lastRun);
    setWorkspace((current) => current
      ? consumePendingPatches(
        { ...current, activeWorkflow: lastRun.preview.workflow },
        lowRisk.map((patch) => patch.filePath),
        status
      ).workspace
      : current);
    setMessages((prev) => [
      ...prev,
      { id: uid('msg'), role: 'assistant', content: `托管模式已自动合并 ${lowRisk.length} 个低风险 patch，高风险变更仍等待你确认。`, createdAt: now() }
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autopilot, lastRun, pendingPatches, workspace]);

  const proposedWorkspace = useMemo(
    () => applyPatchesForPreview(workspace, pendingPatches),
    [workspace, pendingPatches]
  );

  /**
   * 项目的所有画布，来自已确认的工作区。
   *
   * 它是文档状态，所以住在 .aigc/canvas-boards.json 里跟着项目归档；但它不是生产资产——
   * `.aigc/` 前缀让它不算产物，STAGE_SOURCE_FILES 白名单让它进不了任何阶段的
   * sourceVersions。这两条一起保证：挪一张卡片、写一条便签、新建一张画布，
   * 都不会把下游标成「需重做」。
   */
  const canvasBoards = useMemo(() => canvasBoardsFromWorkspace(workspace), [workspace]);

  const brief = useMemo(() => missionBriefFromWorkspace(proposedWorkspace), [proposedWorkspace]);
  const committedBrief = useMemo(() => missionBriefFromWorkspace(workspace), [workspace]);
  const hasWorkspaceAssets = Boolean(
    proposedWorkspace?.files.some((file) => !isInternalWorkspaceFile(file.path) && file.path !== '.aigc/MEMORY.md') ||
    storedPendingPatches.some((patch) => isProductionStageFile(patch.filePath))
  );
  const assets = useMemo(
    () => (hasWorkspaceAssets ? missionAssetsFromWorkspace(proposedWorkspace) : []),
    [proposedWorkspace, hasWorkspaceAssets]
  );
  const scenes = useMemo(
    () => (hasWorkspaceAssets ? productionScenesFromWorkspace(proposedWorkspace) : []),
    [proposedWorkspace, hasWorkspaceAssets]
  );
  const publishCopy = useMemo(() => parseJsonFile<PublishCopy>(proposedWorkspace, 'publish_copy.json', {}), [proposedWorkspace]);
  const assetPrompts = useMemo(() => parseJsonFile<AssetPrompts>(proposedWorkspace, 'asset_prompts.json', {}), [proposedWorkspace]);
  const scriptFile = getFile(proposedWorkspace, 'script.md');
  const scriptPatch = pendingPatches.find((patch) => patch.filePath === 'script.md');
  const scriptBody = scriptFile?.content || scriptPatch?.after || '';
  const hasScriptOutput = Boolean(scriptBody.trim());
  const scriptProofPreview = snippet(scriptBody, 12);
  const scriptLineCount = scriptBody.split('\n').filter((line) => line.trim()).length;
  const scriptPreview = snippet(scriptFile?.content || '', 14);

  useEffect(() => {
    setScriptDraft(scriptBody);
  }, [scriptBody]);
  const selectedPatch = pendingPatches.find((patch) => patch.id === selectedPatchId) || pendingPatches[0];
  const allPendingPatchIds = useMemo(() => pendingPatches.map((patch) => patch.id), [pendingPatches]);
  const lowRiskPatchIds = useMemo(
    () => pendingPatches.filter((patch) => patch.riskLevel === 'low').map((patch) => patch.id),
    [pendingPatches]
  );
  const patchReviewStageCounts = useMemo(
    () =>
      studioStages
        .map((stage) => ({
          ...stage,
          count: pendingPatches.filter((patch) => patchReviewStage(patch) === stage.id).length
        }))
        .filter((stage) => stage.count > 0),
    [pendingPatches]
  );
  const complianceStatus = hasWorkspaceAssets ? workspace?.complianceStatus || 'warning' : 'pass';

  const videoCards = scenes.slice(0, 5).map((scene, index) => ({
    id: scene.id,
    number: String(index + 1).padStart(2, '0'),
    title: publishCopy.titles?.[index] || scene.title || `视频 ${index + 1}`,
    subtitle: scene.subtitle,
    visual: scene.visual,
    duration: scene.durationSeconds || Math.ceil(videoDuration(videoSpec))
  }));

  function beginStageRun(stage: ProductionStageId, generationJobId: string, revision = false): StageRun {
    stageRunRef.current.get(stage)?.controller.abort();
    const token = (stageRunTokenRef.current.get(stage) || 0) + 1;
    const run: StageRun = { generationJobId, token, controller: new AbortController(), revision };
    stageRunTokenRef.current.set(stage, token);
    stageRunRef.current.set(stage, run);
    stageGenerationJobRef.current.set(stage, generationJobId);
    return run;
  }

  function isCurrentStageRun(stage: ProductionStageId, generationJobId: string, token: number): boolean {
    const run = stageRunRef.current.get(stage);
    return Boolean(
      run && !run.controller.signal.aborted && run.generationJobId === generationJobId && run.token === token &&
      stageGenerationJobRef.current.get(stage) === generationJobId
    );
  }

  function abortStageRunsFrom(stage: ProductionStageId) {
    const start = STAGE_RUN_ORDER.indexOf(stage);
    for (const candidate of STAGE_RUN_ORDER.slice(Math.max(0, start))) {
      stageRunRef.current.get(candidate)?.controller.abort();
      stageRunTokenRef.current.set(candidate, (stageRunTokenRef.current.get(candidate) || 0) + 1);
      stageGenerationJobRef.current.delete(candidate);
    }
  }

  function failCurrentStageRun(stage: ProductionStageId, run: StageRun, message: string) {
    setWorkspace((current) => {
      if (!current || !isCurrentStageRun(stage, run.generationJobId, run.token)) return current;
      return writeProductionFlow(
        current,
        failStageGeneration(productionFlowFromWorkspace(current), stage, run.generationJobId, message)
      );
    });
  }

  function beginManualStageRun(stage: ProductionStageId): StageRun | null {
    if (!workspace) return null;
    abortStageRunsFrom(stage);
    const generationJobId = uid(`${stage}-manual`);
    const run = beginStageRun(stage, generationJobId);
    setWorkspace((current) => {
      if (!current || !isCurrentStageRun(stage, generationJobId, run.token)) return current;
      try {
        const flow = productionFlowFromWorkspace(current);
        const sourceVersions = sourceVersionsForStage(current, stage);
        return writeProductionFlow(current, beginStageGeneration(flow, stage, generationJobId, sourceVersions));
      } catch (err) {
        run.controller.abort();
        setError(err instanceof Error ? err.message : `${studioStageName(stage)}草稿修改失败`);
        return current;
      }
    });
    return run;
  }

  function fitsWorkspacePersistence(workspace: WorkspaceSnapshot): boolean {
    return localStorageByteLength(encodeWorkspaceEnvelope(workspace, '')) <= MAX_WORKSPACE_ARCHIVE_BYTES;
  }

  function canPersistUploadedDataUrl(imageUrl: string): boolean {
    if (!workspace) return false;
    const current = localStorageByteLength(encodeWorkspaceEnvelope(workspace, ''));
    return current + localStorageByteLength(imageUrl) * 2 <= MAX_WORKSPACE_ARCHIVE_BYTES;
  }

  function delayUnlessAborted(ms: number, signal?: AbortSignal) {
    return new Promise<void>((resolve) => {
      if (signal?.aborted) return resolve();
      const onAbort = () => {
        window.clearTimeout(timer);
        resolve();
      };
      const timer = window.setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  async function requestStageImage(job: StageImageJob, signal?: AbortSignal): Promise<string> {
    const response = await fetch('/api/image/render', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal,
      body: JSON.stringify({
        prompt: job.prompt,
        negativePrompt: job.negativePrompt,
        ...(job.referenceImages?.length ? { images: job.referenceImages } : {})
      })
    });
    const data = await response.json().catch(() => ({})) as ImageRenderApiResponse;
    if (!response.ok) throw new Error(data.error || `图片服务请求失败（${response.status}）`);
    if (data.error) throw new Error(data.error);
    if (!data.imageUrl?.trim()) throw new Error('图片服务没有返回 imageUrl');
    return data.imageUrl;
  }

  /**
   * 「image queue is full, please retry later」是上游容量打满时的回应，意思就是等会儿再来。
   * 之前一次就判死：整批 12 张场景图会卡在中途，前面几张已经花掉的钱也跟着作废。
   * 视频提交那边早就按限流退避处理了，图片这条路径漏了。
   */
  async function renderStageImage(job: StageImageJob, signal?: AbortSignal): Promise<string> {
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= STAGE_IMAGE_MAX_ATTEMPTS; attempt += 1) {
      try {
        return await requestStageImage(job, signal);
      } catch (err) {
        if (signal?.aborted) throw err;
        const message = err instanceof Error ? err.message : '图片生成失败';
        if (!isRetryableVideoError(message) || attempt === STAGE_IMAGE_MAX_ATTEMPTS) throw err;
        lastError = err;
        await delayUnlessAborted(STAGE_IMAGE_RETRY_WAIT_MS * attempt, signal);
        if (signal?.aborted) throw err;
      }
    }
    throw lastError instanceof Error ? lastError : new Error('图片生成失败');
  }

  function persistSettledStageImages(
    stage: 'character' | 'scene',
    jobs: StageImageJob[],
    results: PromiseSettledResult<string>[],
    run: StageRun
  ) {
    if (!isCurrentStageRun(stage, run.generationJobId, run.token)) return;
    const fulfilled = results.flatMap((result, index) =>
      result.status === 'fulfilled' && isCurrentStageRun(stage, run.generationJobId, run.token)
        ? [{ ...jobs[index], imageUrl: result.value }]
        : []
    );
    if (!fulfilled.length) return;

    setWorkspace((current) => {
      if (!current || !isCurrentStageRun(stage, run.generationJobId, run.token)) return current;
      const flow = productionFlowFromWorkspace(current);
      if (flow.stages[stage].generationJobId !== run.generationJobId) return current;
      const proposed = currentStageDraftWorkspace(current, stage);
      const next = fulfilled.reduce((draft, result) => applyStageImageResult(draft, result), proposed);
      const filePath = stage === 'character' ? 'characters.json' : 'scenes.json';
      const after = getFile(next, filePath)?.content;
      if (!after || after === getFile(proposed, filePath)?.content) return current;
      const patch: PatchOperation = {
        id: uid('patch'),
        filePath,
        summary: stage === 'character' ? '写入已生成角色图草稿' : '写入已生成场景图草稿',
        before: getFile(current, filePath)?.content || '',
        after,
        riskLevel: 'low',
        requiresApproval: true,
        origin: {
          kind: 'agent_stage',
          productionStage: stage,
          generationJobId: run.generationJobId
        }
      };
      return appendPendingPatches(current, [patch]);
    });
  }

  function finishStageImageGeneration(
    stage: 'character' | 'scene',
    run: StageRun,
    failures: string[]
  ) {
    setWorkspace((current) => {
      if (!current || !isCurrentStageRun(stage, run.generationJobId, run.token)) return current;
      const flow = productionFlowFromWorkspace(current);
      const record = flow.stages[stage];
      if (record.generationJobId !== run.generationJobId || record.status !== 'generating') return current;
      const proposed = currentStageDraftWorkspace(current, stage);
      const missing = stage === 'character' ? missingCharacterImageJobs(proposed) : missingSceneImageJobs(proposed);
      if (failures.length || missing.length) {
        const message = failures[0] || validateStageAssets(stage, proposed)[0] || '仍有必需图片尚未生成';
        return writeProductionFlow(current, failStageGeneration(flow, stage, run.generationJobId, message));
      }
      if (run.revision) {
        return writeProductionFlow(current, markStageDraft(flow, {
          stage, generationJobId: run.generationJobId, sourceVersions: record.sourceVersions
        }));
      }
      const completion = completeStageGeneration(flow, stage, run.generationJobId, record.sourceVersions);
      return completion.accepted ? writeProductionFlow(current, completion.flow) : current;
    });
  }

  /**
   * 图片批次循环随时可能因为 abort 或换任务中途退出。以前这几个出口是裸 return，
   * 阶段状态就永远停在 generating——后端早已空闲，前端还在转圈，只能靠刷新页面让
   * interruptUnrecoverableStageGenerations 兜底。这里当场收尾，不拖到下次加载。
   */
  function abandonStageImageGeneration(stage: 'character' | 'scene', run: StageRun) {
    setWorkspace((current) => {
      if (!current) return current;
      const flow = productionFlowFromWorkspace(current);
      const record = flow.stages[stage];
      // 已经被更新的一次生成接管时不要插手，那一次会自己收尾。
      if (record.generationJobId !== run.generationJobId || record.status !== 'generating') return current;
      return writeProductionFlow(
        current,
        failStageGeneration(flow, stage, run.generationJobId, `${studioStageName(stage)}图生成已中断，请重新生成`)
      );
    });
  }

  async function generateMissingStageImages(
    stage: 'character' | 'scene',
    draftWorkspace: WorkspaceSnapshot,
    run: StageRun
  ) {
    if (!isCurrentStageRun(stage, run.generationJobId, run.token)) {
      abandonStageImageGeneration(stage, run);
      return;
    }
    if (health && health.provider.image?.configured === false) {
      finishStageImageGeneration(stage, run, ['图片模型尚未配置，请先在模型设置中填写图片模型连接。']);
      return;
    }
    // 场景阶段先出母版全景，再出场次主图：场次图要拿全景当空间参考，顺序反了母版就白建了。
    // 只自动跑全景这一张——另外七个机位是每个母版 ×7 张的开销，交给画板上的按钮按需生成，
    // 缺图时界面显示上传/生成占位，不会静默烧钱。
    const jobs = stage === 'character'
      ? missingCharacterImageJobs(draftWorkspace)
      : missingSceneViewJobs(draftWorkspace).filter((job) => job.viewId === 'panorama');
    const pendingSceneImages = stage === 'scene' ? missingSceneImageJobs(draftWorkspace).length : 0;
    if (!jobs.length && !pendingSceneImages && stage !== 'character') {
      const issues = validateStageAssets(stage, draftWorkspace);
      finishStageImageGeneration(stage, run, issues);
      return;
    }

    const failures: string[] = [];
    // 本地跟着落一份：多视角要拿刚生成的主图当参考，不能等 React 状态回流。
    let draft = draftWorkspace;

    /** 跑完一批返回 true；被中止或被接管返回 false，由调用方停下。 */
    async function runJobBatches(batchJobs: StageImageJob[]): Promise<boolean> {
      for (let index = 0; index < batchJobs.length; index += 2) {
        if (!isCurrentStageRun(stage, run.generationJobId, run.token)) {
          abandonStageImageGeneration(stage, run);
          return false;
        }
        const batch = batchJobs.slice(index, index + 2);
        const results = await Promise.allSettled(batch.map((job) => renderStageImage(job, run.controller.signal)));
        // 先落盘再判断是否退出：这一批已经真的生成出来了，不该因为中途换任务白扔。
        persistSettledStageImages(stage, batch, results, run);
        results.forEach((result, offset) => {
          if (result.status === 'fulfilled') {
            draft = applyStageImageResult(draft, { ...batch[offset], imageUrl: result.value });
          } else {
            failures.push(characterImageErrorText(result.reason instanceof Error ? result.reason.message : String(result.reason)));
          }
        });
        if (!isCurrentStageRun(stage, run.generationJobId, run.token)) {
          abandonStageImageGeneration(stage, run);
          return false;
        }
      }
      return true;
    }

    if (!await runJobBatches(jobs)) return;

    // 主图齐了再出多视角设定板，每个变体一张，参考图取自刚生成的主图。
    if (stage === 'character' && !await runJobBatches(missingCharacterMultiViewJobs(draft))) return;

    // 正脸身份参考位跟着一起出：它是身份主锚点，也是提交视觉审查的必填项，
    // 不自动生成的话每个角色进画板都是一张空占位，用户只能对着空表填。
    if (stage === 'character' && !await runJobBatches(missingCharacterFrontViewJobs(draft))) return;

    // 剩下三个角度和表情板必须排在正脸之后：它们都拿正脸当参考图，
    // 提前跑就只能靠变体主图，侧脸和全身会各自往不同的长相上漂。
    //
    // 这三张以前是「画板上按需点」——而实际结果是绝大多数角色只有一张正脸，
    // 因为谁都不会为每个配角手动点三次。「多角度参考」那一层于是在真实项目里等于不存在。
    if (stage === 'character' && !await runJobBatches(
      missingCharacterIdentityViewJobs(draft, ['three_quarter', 'profile', 'full_body'])
    )) return;
    if (stage === 'character' && !await runJobBatches(missingCharacterExpressionSheetJobs(draft))) return;

    // 场次主图排在母版全景之后重算：这时它才拿得到全景当参考图。
    if (stage === 'scene' && !await runJobBatches(missingSceneImageJobs(draft))) return;

    finishStageImageGeneration(stage, run, failures);
  }

  async function generateMissingCharacterImages(workspace: WorkspaceSnapshot, run: StageRun) {
    await generateMissingStageImages('character', workspace, run);
  }

  async function generateMissingSceneImages(workspace: WorkspaceSnapshot, run: StageRun) {
    await generateMissingStageImages('scene', workspace, run);
  }

  /**
   * 场次 id → 场景母版 id。
   * 分镜的镜头只写 sourceSceneId，空间身份存在母版里；不把这层映射带下去，
   * 连续性检查就没法发现「同一场次里空间换了」，视频阶段也拿不到空间 id。
   */
  function sceneMasterMap(baseWorkspace: WorkspaceSnapshot): Map<string, string> {
    const source = safeParseJson<{ scenes?: Array<{ id?: unknown; sceneMasterId?: unknown }> }>(
      getFile(baseWorkspace, 'scenes.json')?.content || '',
      {}
    );
    return new Map(
      (source.scenes || [])
        .filter((scene) => typeof scene.id === 'string' && typeof scene.sceneMasterId === 'string' && scene.sceneMasterId)
        .map((scene) => [scene.id as string, scene.sceneMasterId as string])
    );
  }

  /**
   * 分镜阶段的批次计划。返回长度 ≤1 表示不用分批，走原来的单次请求。
   * 场景顺序就是 scenes.json 的顺序，合并时按它排回去。
   */
  function storyboardBatchPlan(
    stage: ProductionStageId,
    baseWorkspace: WorkspaceSnapshot,
    spec: VideoSpec
  ): StageBatch[] {
    if (stage !== 'storyboard') return [];
    const source = safeParseJson<{ scenes?: Array<{ id?: unknown }> }>(
      getFile(baseWorkspace, 'scenes.json')?.content || '',
      {}
    );
    const sceneIds = (source.scenes || [])
      .map((scene) => scene.id)
      .filter((id): id is string => typeof id === 'string' && Boolean(id));
    return planStoryboardBatches(sceneIds, episodePlan(spec.episodeSeconds).segmentSeconds);
  }

  /**
   * 单批超时。实测正常一批约 40 秒；但中转站偶尔会把某一批挂死，
   * 服务端连日志都不打一行，而串行链路会就这么无限等下去——
   * 用户看到的是一个永远停在「第 2/6 批」的转圈，比报错难受得多。
   */
  const STORYBOARD_BATCH_TIMEOUT_MS = 180000;

  async function withBatchTimeout<T>(task: Promise<T>, label: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        task,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`${label}超过 ${Math.round(STORYBOARD_BATCH_TIMEOUT_MS / 1000)} 秒没有响应，已中止。请重新生成。`)),
            STORYBOARD_BATCH_TIMEOUT_MS
          );
        })
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * 逐批请求再合并成一份 storyboard.json + timeline.json。
   * 串行不是保守：并发几批会同时压在同一个中转站上，而这里的瓶颈本来就是单次响应长度，
   * 拆小之后每批只要几十秒，串行总时长已经比原来的续写快得多。
   */
  async function runStoryboardInBatches(
    batches: StageBatch[],
    runOnce: (batch?: StageBatch) => Promise<AgentRunResponse & { error?: string }>,
    baseWorkspace: WorkspaceSnapshot,
    run: StageRun,
    generationJobId: string,
    stage: ProductionStageId
  ): Promise<AgentRunResponse> {
    const orderedSceneIds = batches.flatMap((batch) => batch.sceneIds);
    const shotBatches: Array<{ sceneIds: string[]; shots: Record<string, unknown>[] }> = [];
    const timelineBatches: Array<{ principle?: unknown; beats?: Record<string, unknown>[] }> = [];
    const sceneMasterById = sceneMasterMap(baseWorkspace);
    let last: AgentRunResponse | null = null;
    // 上一批的收尾状态。串行的真正理由在这里：并发跑几批就没有「上一批」可言，
    // 每一批都会在真空里重新设定人物造型和走位，批次边界就成了变脸换装的高发区。
    let continuityTail: ContinuityTail | null = null;

    for (const batch of batches) {
      if (!isCurrentStageRun(stage, generationJobId, run.token)) throw new Error('这一轮生成已被更新的一次生成取代。');
      setStageBatchProgress(`分镜第 ${batch.index}/${batch.total} 批（${batch.sceneIds.length} 个场景）`);
      // 挂死的那一批要当场抛出来，而不是让整条串行链无限等下去。
      // 显式标注返回类型：本批的产出要用来算下一批的 continuityTail，而 continuityTail
      // 又是本批请求的入参，类型推断会在这里绕成一个环（TS7022）。
      const result: AgentRunResponse & { error?: string } = await withBatchTimeout(
        runOnce({ ...batch, continuityTail }),
        `分镜第 ${batch.index}/${batch.total} 批`
      );
      last = result;

      const storyboardPatch = result.patchOperations.find((patch) => patch.filePath === 'storyboard.json');
      // 某一批没产出分镜就当场停：继续跑下去只会拼出一份少了几场戏的分镜，
      // 而少掉的那几场在界面上完全看不出来。
      if (!storyboardPatch) {
        throw new Error(`分镜第 ${batch.index}/${batch.total} 批没有产出镜头（场景 ${batch.sceneIds.join('、')}），请重新生成。`);
      }
      const batchShots = safeParseJson<{ scenes?: Record<string, unknown>[] }>(storyboardPatch.after, {}).scenes || [];
      shotBatches.push({ sceneIds: batch.sceneIds, shots: batchShots });
      // 先在本批内把状态贯通一遍再取尾：模型往往只在第一个镜头写全 cast，
      // 直接取最后一镜的原始值会拿到一份缺了大半人物的状态交给下一批。
      continuityTail = storyboardContinuityTail(
        carryStoryboardContinuity(batchShots, { tail: continuityTail, sceneMasterById })
      ) || continuityTail;
      // 分批时不向模型要 timeline，但老路径或模型自作主张给了就收下当参考。
      const timelinePatch = result.patchOperations.find((patch) => patch.filePath === 'timeline.json');
      if (timelinePatch) {
        const parsed = safeParseJson<{ principle?: unknown; beats?: Record<string, unknown>[] }>(timelinePatch.after, {});
        timelineBatches.push({ principle: parsed.principle, beats: parsed.beats || [] });
      }
    }
    setStageBatchProgress('');

    const mergedShots = mergeStoryboardBatches(shotBatches, orderedSceneIds, sceneMasterById);
    if (!mergedShots.length) throw new Error('分镜各批都没有产出镜头，请重新生成。');
    const mergedTimeline = mergeTimelineBatches(timelineBatches, mergedShots);

    const before = (filePath: string) => getFile(baseWorkspace, filePath)?.content || '';
    const merged = last as AgentRunResponse;
    return {
      ...merged,
      // 合并后的 patch 才是要进审批的东西；各批自己的 patch 只是中间产物，不能留下。
      patchOperations: [
        {
          id: uid('patch'),
          filePath: 'storyboard.json',
          summary: `分镜分 ${batches.length} 批生成，合计 ${mergedShots.length} 个镜头`,
          before: before('storyboard.json'),
          after: JSON.stringify({ scenes: mergedShots }, null, 2),
          riskLevel: 'medium',
          requiresApproval: true,
          // 合并 patch 是重新造的对象，来源戳必须自己补回来。
          // 漏掉这一行的后果不是报错，而是审查页把这份真实产出当成来源不明的历史草稿隔离，
          // 只给一个「重新生成」——短片走单次请求那条路不受影响，所以只有长片会中招。
          origin: { kind: 'agent_stage', productionStage: stage, generationJobId }
        },
        {
          id: uid('patch'),
          filePath: 'timeline.json',
          summary: `剪辑节奏按合并后的 ${mergedTimeline.beats.length} 个镜头重排`,
          before: before('timeline.json'),
          after: JSON.stringify(mergedTimeline, null, 2),
          riskLevel: 'medium',
          requiresApproval: true,
          origin: { kind: 'agent_stage', productionStage: stage, generationJobId }
        }
      ],
      assistantMessage: `已分 ${batches.length} 批生成分镜，合计 ${mergedShots.length} 个镜头。${merged.assistantMessage || ''}`
    };
  }

  /**
   * 不分批的那条路径（片子短到一批就够）同样要把连续性贯通一遍。
   *
   * 漏掉这里的后果很隐蔽：30 秒的片子只有一次请求，于是它是整个系统里唯一一条
   * 完全没有连续性状态的分镜——而用户最常拿来试水的恰恰是短片。
   * 这里只补状态，不重排时长和时间轴：单次请求里模型自己就能把全片时间轴排对，
   * 再改一遍只会和它打架。
   */
  function withCarriedContinuity(
    stage: ProductionStageId,
    result: AgentRunResponse,
    baseWorkspace: WorkspaceSnapshot
  ): AgentRunResponse {
    if (stage !== 'storyboard') return result;
    const index = result.patchOperations.findIndex((patch) => patch.filePath === 'storyboard.json');
    if (index < 0) return result;

    const patch = result.patchOperations[index];
    const parsed = safeParseJson<{ scenes?: Record<string, unknown>[] }>(patch.after, {});
    if (!parsed.scenes?.length) return result;

    const carried = carryStoryboardContinuity(parsed.scenes, { sceneMasterById: sceneMasterMap(baseWorkspace) });
    const patchOperations = [...result.patchOperations];
    patchOperations[index] = {
      ...patch,
      after: JSON.stringify({ ...parsed, scenes: carried }, null, 2)
    };
    return { ...result, patchOperations };
  }

  async function requestStageDraft(
    stage: ProductionStageId,
    baseWorkspace: WorkspaceSnapshot,
    generationJobId = uid(`${stage}-job`),
    requestText = '',
    history = messages.slice(-10),
    stageRequestMode: StageRequestMode = 'initial',
    stageRequestTarget: StageRequestTarget = 'artifact',
    requestedOutputFiles = stageOutputFilesForWorkspace(stage, stageRequestMode, baseWorkspace, stageRequestTarget),
    /**
     * 落盘前对产出做一次改写。
     *
     * 存在的理由只有一个：有些「只改某几栏」的请求，靠提示词是约束不住的——
     * patch 机制要求模型吐回整份文件，而模型一旦重新生成整份文件就会顺手改掉别的字段。
     * 想守住「只改这几栏」，就必须在客户端把产出裁回去。
     */
    transformPatches?: (patches: PatchOperation[], base: WorkspaceSnapshot) => PatchOperation[]
  ) {
    focusStudioStage(stage);
    const revision = stageRequestMode !== 'initial';
    const sourceVersions = sourceVersionsForStage(baseWorkspace, stage);
    let generationWorkspace: WorkspaceSnapshot;

    try {
      const flow = productionFlowFromWorkspace(baseWorkspace);
      const nextFlow = beginStageGeneration(flow, stage, generationJobId, sourceVersions);
      generationWorkspace = nextFlow === flow ? baseWorkspace : writeProductionFlow(baseWorkspace, nextFlow);
    } catch (err) {
      const message = err instanceof Error ? err.message : `${studioStageName(stage)}生成失败`;
      setError(message);
      setMessages((prev) => [...prev, { id: uid('msg'), role: 'system', content: `请求失败：${message}`, createdAt: now() }]);
      return;
    }

    const run = beginStageRun(stage, generationJobId, revision);
    setWorkspace(generationWorkspace);
    activeStageGenerationCountRef.current += 1;
    setLoading(true);
    setError('');
    setLastRun(null);

    try {
      const runOnce = async (stageBatch?: StageBatch) => {
        const response = await fetch('/api/agent/run', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          signal: run.controller.signal,
          body: JSON.stringify(buildStageRunRequest({
            stage,
            instruction: [requestText.trim(), buildSpecInstruction(videoSpec)].filter(Boolean).join('\n\n'),
            workspace: baseWorkspace,
            history,
            workflow: stageConfig(stage).workflow,
            genre: taskAgent,
            stageBatch,
            generationJobId,
            sourceVersions,
            stageRequestMode: stageRequestMode,
            stageRequestTarget,
            // 不按批收窄 requestedOutputFiles：服务端 requestedStageOutputFiles 要求它和阶段
            // 配置逐项相等，收窄会直接抛 output scope mismatch。让模型别产 timeline 是靠
            // 提示词说的，模型真不产时服务端会用模板补一份，客户端再用派生版覆盖掉。
            requestedOutputFiles
          }))
        });
        const payload = await response.json() as AgentRunResponse & { error?: string };
        if (!response.ok) throw new Error(payload.error || `${studioStageName(stage)}生成失败`);
        return payload;
      };

      // 分镜按场景分批：一次全片的请求会撞 max_tokens（实测 3 分钟片子累计四万多字符），
      // 续写要跑十几分钟还未必成功。拆成几批小请求，每批的产出都在单次响应装得下的范围内。
      const batches = storyboardBatchPlan(stage, baseWorkspace, videoSpec);
      const result = batches.length > 1
        ? await runStoryboardInBatches(batches, runOnce, baseWorkspace, run, generationJobId, stage)
        : withCarriedContinuity(stage, await runOnce(), baseWorkspace);
      const scopedPatches = transformPatches
        ? transformPatches(filterStagePatches(stage, result.patchOperations, requestedOutputFiles), baseWorkspace)
        : filterStagePatches(stage, result.patchOperations, requestedOutputFiles);
      if (!scopedPatches.length) throw new Error(`${studioStageName(stage)}没有产生可审查的新 patch，请重新生成。`);
      if (!isCurrentStageRun(stage, generationJobId, run.token)) return;
      const imageStage = stage === 'character' || stage === 'scene';
      const textDraftWorkspace = appendPendingPatches(generationWorkspace, scopedPatches);
      // 产出写不进工作区时必须说清楚。以前这里是几个裸 return：patch 被悄悄丢掉，
      // 后面照样发"已生成"的成功消息，最后由图片循环报一句"角色资产文件尚未生成"——
      // 界面于是自相矛盾，用户完全无从判断到底发生了什么。
      let writeRejection: string | null = null;
      setWorkspace((current) => {
        if (!current) return current;
        if (!isCurrentStageRun(stage, generationJobId, run.token)) {
          writeRejection = '这一轮生成已被中止或被更新的一次生成取代。';
          return current;
        }
        const flow = productionFlowFromWorkspace(current);
        const record = flow.stages[stage];
        if (imageStage) {
          if (record.generationJobId !== generationJobId) {
            writeRejection = '这一轮产出已被更新的一次生成取代。';
            return current;
          }
          writeRejection = null;
          return appendPendingPatches(current, scopedPatches);
        }
        const completion = completeStageGeneration(flow, stage, generationJobId, sourceVersions);
        if (!completion.accepted) {
          writeRejection = record.generationJobId !== generationJobId
            ? '这一轮产出已被更新的一次生成取代。'
            : record.status !== 'generating'
              ? `阶段状态已经是「${record.status}」，不再接受本轮产出。`
              : '上游文件版本在生成期间发生了变化。';
          return current;
        }
        writeRejection = null;
        const nextFlow = revision
          ? markStageDraft(flow, { stage, generationJobId, sourceVersions })
          : completion.flow;
        return writeProductionFlow(appendPendingPatches(current, scopedPatches), nextFlow);
      });

      // 上面的 updater 由 React 在本次同步块之后执行，让出一个宏任务再读结论。
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      if (writeRejection) {
        const message = `${studioStageName(stage)}产出未能写入：${writeRejection}请重新生成。`;
        failCurrentStageRun(stage, run, message);
        setError(message);
        setMessages((prev) => [...prev, { id: uid('msg'), role: 'system', content: message, createdAt: now() }]);
        return;
      }
      setLastRun({ ...result, patchOperations: scopedPatches });
      setMessages((prev) => [...prev, { id: uid('msg'), role: 'assistant', content: result.assistantMessage, createdAt: now() }]);
      if (imageStage) {
        const draft = currentStageDraftWorkspace(textDraftWorkspace, stage);
        if (stage === 'character') await generateMissingCharacterImages(draft, run);
        else await generateMissingSceneImages(draft, run);
      }
      focusStudioStage(stage);
      const firstPatch = scopedPatches[0];
      if (firstPatch) setSelectedPatchId(firstPatch.id);
    } catch (err) {
      if (!isCurrentStageRun(stage, generationJobId, run.token)) return;
      if (run.controller.signal.aborted) return;
      const message = err instanceof Error ? err.message : `${studioStageName(stage)}生成失败`;
      failCurrentStageRun(stage, run, message);
      setError(message);
      setMessages((prev) => [...prev, { id: uid('msg'), role: 'system', content: `请求失败：${message}`, createdAt: now() }]);
    } finally {
      // 无论成功、失败还是被新一轮取代，进度都要清掉——留在屏幕上会变成一句永远停在
      // 「第 3/4 批」的假状态。
      setStageBatchProgress('');
      activeStageGenerationCountRef.current = Math.max(0, activeStageGenerationCountRef.current - 1);
      setLoading(activeStageGenerationCountRef.current > 0);
    }
  }

  async function runAgent(text = instruction, selectedWorkflow = workflow) {
    if (!workspace || !text.trim()) return;

    const displayText = text.trim();
    const nextWorkflow = inferWorkflowFromCommand(displayText, selectedWorkflow);
    const requestWorkspace: WorkspaceSnapshot = {
      ...workspace,
      title: committedBrief.isBlank ? displayText.slice(0, 32) || workspace.title : workspace.title,
      activeWorkflow: nextWorkflow
    };
    const userMessage: AgentMessage = { id: uid('msg'), role: 'user', content: displayText, createdAt: now() };
    const history = [...messages, userMessage].slice(-10);

    setWorkflow(nextWorkflow);
    setMessages((prev) => [...prev, userMessage]);
    setInstruction('');
    await requestStageDraft('script', requestWorkspace, undefined, displayText, history);
  }

  function approvePatchIds(patchIds: string[]) {
    if (!workspace) return;
    const patches = pendingPatches.filter((patch) => patchIds.includes(patch.id));
    if (!patches.length) return;
    const productionStages = new Set(patches.map((patch) => productionStageForFile(patch.filePath)).filter(Boolean));
    const productionStage = [...productionStages][0];
    if (productionStage === 'video') {
      const message = '视频任务 patch 只能通过“确认视频任务并开始生成”提交。';
      setError(message);
      setMessages((prev) => [...prev, { id: uid('msg'), role: 'system', content: message, createdAt: now() }]);
      return;
    }
    if (productionStages.size > 0) {
      const mixedWithNonProduction = patches.some((patch) => !productionStageForFile(patch.filePath));
      if (productionStages.size !== 1 || mixedWithNonProduction || !productionStage) {
        const message = '生产阶段 patch 不能与其它 patch 一起合并，请按阶段确认。';
        setError(message);
        setMessages((prev) => [...prev, { id: uid('msg'), role: 'system', content: message, createdAt: now() }]);
        return;
      }
      void confirmProductionStage(productionStage);
      return;
    }
    setWorkspace((current) => current
      ? consumePendingPatches(
        current,
        patches.map((patch) => patch.filePath),
        current.complianceStatus
      ).workspace
      : current);
    setMessages((prev) => [...prev, { id: uid('msg'), role: 'assistant', content: `已合并 ${patches.length} 个 patch。`, createdAt: now() }]);
  }

  function rejectPatchIds(patchIds: string[]) {
    const patches = pendingPatches.filter((patch) => patchIds.includes(patch.id));
    if (!patches.length) return;
    const productionStages = new Set(patches.map((patch) => productionStageForFile(patch.filePath)).filter(Boolean));
    if (productionStages.size > 0) {
      const message = '生产阶段 patch 不能通过通用队列拒绝；请使用“我要修改”或“重新生成”。';
      setError(message);
      setMessages((prev) => [...prev, { id: uid('msg'), role: 'system', content: message, createdAt: now() }]);
      return;
    }
    const ids = patches.map((patch) => patch.id);
    setWorkspace((current) => current
      ? savePendingPatches(current, readPendingPatches(current).filter((patch) => !ids.includes(patch.id)))
      : current);
    setMessages((prev) => [...prev, { id: uid('msg'), role: 'assistant', content: `已拒绝 ${ids.length} 个 patch，文件未变化。`, createdAt: now() }]);
  }

  // 风格写进 style.json，不再拼进 instruction 字符串——拼接的风格会在多轮对话里被稀释掉。
  function appendQaLedgerEntry(entry: Parameters<typeof recordQaFailure>[1]) {
    setWorkspace((prev) => (prev ? writeQaLedger(prev, recordQaFailure(qaLedgerFromWorkspace(prev), entry)) : prev));
  }

  function applyGlobalStyle(style: StylePreset | null) {
    setWorkspace((prev) => (prev ? writeStyleBook(prev, setGlobalStyle(styleBookFromWorkspace(prev), style)) : prev));
  }

  function applyStageStyle(stage: ProductionStageId, style: StylePreset | null) {
    setWorkspace((prev) => (prev ? writeStyleBook(prev, setStageStyle(styleBookFromWorkspace(prev), stage, style)) : prev));
  }

  async function confirmProductionStage(stage: ProductionStageId) {
    if (!workspace || !proposedWorkspace) return;
    if (stage === 'video') {
      setError('通用确认不能消费视频任务 patch；请使用唯一的最终确认入口。');
      return;
    }
    const flow = productionFlowFromWorkspace(workspace);
    const record = flow.stages[stage];
    if (record.status !== 'ready_for_review' || record.draftVersion === null) return;
    const currentStagePatches = pendingPatches.filter((patch) => productionStageForFile(patch.filePath) === stage);
    if (!currentStagePatches.length) {
      setError(`当前${studioStageName(stage)}没有可确认的待审 patch，请先重新生成。`);
      return;
    }

    const confirmationKey = `${stage}:${record.draftVersion}:${workspace.projectId}`;
    if (confirmationInFlightRef.current.has(confirmationKey)) return;
    confirmationInFlightRef.current.add(confirmationKey);

    try {
      const issues = validateStageAssets(stage, proposedWorkspace);
      if (issues.length) {
        setError(issues.join('；'));
        return;
      }

      const nextStage = nextProductionStage(stage);
      const nextJobId = nextStage ? uid(`${nextStage}-job`) : null;
      const nextSourceVersions = nextStage ? sourceVersionsForStage(proposedWorkspace, nextStage) : {};
      const reviewWorkspace = savePendingPatches(workspace, pendingPatches);
      const transaction = confirmStageInWorkspace(reviewWorkspace, {
        stage,
        outputFiles: stageConfig(stage).outputFiles,
        expectedDraftVersion: record.draftVersion,
        confirmationKey,
        confirmedAt: now(),
        confirmedBy: 'local-user',
        nextGenerationJobId: nextJobId,
        sourceVersions: nextSourceVersions
      });
      setWorkspace(transaction.workspace);
      if (nextStage && nextJobId) {
        // 交接对用户可见：上一阶段负责人把项目交给下一阶段负责人，而不是下一批产物凭空出现。
        setMessages((prev) => [...prev, {
          id: uid('msg'),
          role: 'system',
          kind: 'handoff',
          handoff: { fromStage: stage, toStage: nextStage },
          content: handoffText(stage, nextStage),
          createdAt: now()
        }]);
        focusStudioStage(nextStage);
        await requestStageDraft(nextStage, transaction.workspace, nextJobId);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : `${studioStageName(stage)}确认失败`;
      setError(message);
      setMessages((prev) => [...prev, { id: uid('msg'), role: 'system', content: `确认失败：${message}`, createdAt: now() }]);
    } finally {
      confirmationInFlightRef.current.delete(confirmationKey);
    }
  }

  /** 把当前项目立即写进磁盘档案。成功返回 true；失败时报错并返回 false，调用方别急着清缓存。 */
  function persistActiveProjectToServer(): Promise<boolean> {
    const snapshot = workspaceRef.current;
    if (!snapshot || demoIdFromQuery()) return Promise.resolve(false);
    const messagesNow = messagesRef.current;
    const specNow = videoSpecRef.current;
    if (!workspaceHasUserContent(snapshot, messagesNow)) return Promise.resolve(false);
    const savedAt = now();
    const run = projectSaveQueueRef.current.then(() => pushProjectRecord(snapshot, messagesNow, specNow, savedAt));
    projectSaveQueueRef.current = run.then(
      () => undefined,
      () => undefined
    );
    return run.then(
      () => {
        setProjectSyncedAt(savedAt);
        return true;
      },
      (err) => {
        setError(
          `项目没能保存到本机档案（data/projects）：${err instanceof Error ? err.message : '未知错误'}。请别关闭页面，稍后重试。`
        );
        return false;
      }
    );
  }

  async function refreshProjectList() {
    setProjectListLoading(true);
    try {
      setProjectList(await fetchProjectList());
    } catch (_) {
      // 列表读不出来不打断创作；重开历史面板会再试一次。
    } finally {
      setProjectListLoading(false);
    }
  }

  function openHistoryPanel() {
    setHistoryOpen(true);
    void refreshProjectList();
  }

  /** 离开当前项目（新建 / 切换）前先归档；没内容的空白项目不值得占一份档案。 */
  async function archiveProjectBeforeLeaving(): Promise<boolean> {
    const snapshot = workspaceRef.current;
    if (!snapshot || demoIdFromQuery()) return true;
    if (!workspaceHasUserContent(snapshot, messagesRef.current)) return true;
    return persistActiveProjectToServer();
  }

  async function resetProject(mode = workspace?.mode || 'creator', options?: { archivePrevious?: boolean }) {
    // 旧项目先落盘再离开——「新建」曾经直接删掉旧项目的浏览器存档，历史就是这么丢的。
    const archived = options?.archivePrevious === false ? true : await archiveProjectBeforeLeaving();
    const next = ensureProductionFlow(createBlankWorkspace(mode));
    // 档案落盘后才清浏览器缓存 key（占配额）；没落盘就留着，至少还有一份。
    const previousProjectId = workspace?.projectId;
    if (previousProjectId && previousProjectId !== next.projectId && archived) {
      try {
        window.localStorage.removeItem(workspaceStorageKey(previousProjectId));
      } catch (_) {}
    }
    setProjectSyncedAt('');
    void refreshProjectList();
    setWorkspace(next);
    setMessages([initialAssistantMessage(mode)]);
    setLastRun(null);
    setWorkflow('generate');
    setInstruction('');
    setSelectedPatchId('');
    setSelectedAssetId('');
    setSelectedSceneId('');
    focusInitialProductionStage(next);
    setNodeRevisionText('');
    setRoleDesignDrafts({});
    setRoleActiveVariantDrafts({});
    setRoleFaceAnchorDrafts({});
    setRoleDesignPreviewKinds({});
    setRoleDesignNotice('');
    setContextOpen(false);
    setInspectorOpen(false);
    setContextDocked(false);
    setInspectorDocked(false);
    // 归档失败的报错要留在屏幕上，别让「新建」顺手把它抹掉。
    if (archived) setError('');
  }

  function resetDemoWorkspace() {
    const demoId = demoIdFromQuery();
    if (!demoId) return;
    window.localStorage.removeItem(demoStorageKey(demoId));
    window.location.reload();
  }

  async function openProjectFromHistory(projectId: string) {
    if (workspace && projectId === workspace.projectId) {
      setHistoryOpen(false);
      return;
    }
    // 当前项目没归档成功就不切走：报错已经在屏幕上，先别造成第二份丢失。
    if (!(await archiveProjectBeforeLeaving())) return;
    const record = await fetchProjectRecord(projectId);
    if (!record) {
      setError('这个项目的档案读取失败，可能已被移动或损坏（data/projects 目录）。');
      return;
    }
    // 从演示页切去真实项目时把 ?demo= 摘掉，否则归档逻辑会一直以为自己在演示模式。
    if (demoIdFromQuery()) {
      const url = new URL(window.location.href);
      url.searchParams.delete('demo');
      window.history.replaceState(null, '', url.toString());
    }
    const loaded = ensureProductionFlow(record.workspace);
    setWorkspace(loaded);
    setWorkflow(loaded.activeWorkflow);
    setVideoSpec(sanitizeStoredSpec(record.videoSpec));
    setInstruction('');
    setMessages(record.messages.length ? record.messages : [initialAssistantMessage(loaded.mode)]);
    setLastRun(null);
    setSelectedPatchId('');
    setSelectedAssetId('');
    setSelectedSceneId('');
    setNodeRevisionText('');
    setRoleDesignDrafts({});
    setRoleActiveVariantDrafts({});
    setRoleFaceAnchorDrafts({});
    setRoleDesignPreviewKinds({});
    setRoleDesignNotice('');
    setProjectSyncedAt(record.savedAt);
    focusInitialProductionStage(loaded);
    setNavSection('mission');
    setHistoryOpen(false);
    try {
      window.localStorage.setItem(activeWorkspaceProjectKey, loaded.projectId);
    } catch (_) {}
  }

  async function deleteProjectFromHistory(projectId: string) {
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({})));
        throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
      }
    } catch (err) {
      setError(`删除项目失败：${err instanceof Error ? err.message : '未知错误'}`);
      return;
    }
    try {
      window.localStorage.removeItem(workspaceStorageKey(projectId));
    } catch (_) {}
    if (workspace && workspace.projectId === projectId) {
      // 删的是当前打开的项目：切成空白工作区，并且不要把刚删掉的内容又归档回去。
      await resetProject(workspace.mode, { archivePrevious: false });
    }
    void refreshProjectList();
  }

  function updateSpec(next: Partial<VideoSpec>) {
    setVideoSpec((prev) => ({ ...prev, ...next }));
  }

  function updateModelDraft(next: Partial<ModelConfigDraft>) {
    setModelDraft((prev) => ({ ...prev, ...next }));
  }

  async function loadAvailableModels() {
    setLoadingModels(true);
    setModelConfigMessage('');
    try {
      const res = await fetch('/api/model-config/models', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          connection: {
            baseUrl: modelDraft.baseUrl,
            apiKey: modelDraft.apiKey
          }
        })
      });
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        models?: ProviderModelOption[];
        categories?: Partial<AvailableModelOptions>;
        counts?: { all: number; text: number; image: number; video: number };
      };
      if (!res.ok || !data.ok) throw new Error(data.error || '读取模型列表失败');

      const nextOptions: AvailableModelOptions = {
        all: data.models || [],
        text: data.categories?.text || [],
        image: data.categories?.image || [],
        video: data.categories?.video || []
      };
      setAvailableModels(nextOptions);
      setModelDraft((prev) => ({
        ...prev,
        textModel: pickLayerModel(prev.textModel, nextOptions.text, nextOptions.all),
        imageModel: pickLayerModel(prev.imageModel, nextOptions.image, nextOptions.all),
        videoModel: pickLayerModel(prev.videoModel, nextOptions.video, nextOptions.all)
      }));
      setModelConfigMessage(modelReadMessage(data.counts));
    } catch (err) {
      setModelConfigMessage(err instanceof Error ? err.message : '读取模型列表失败');
    } finally {
      setLoadingModels(false);
    }
  }

  async function saveModelConfig() {
    setSavingModelConfig(true);
    setModelConfigMessage('');
    try {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (modelAdminToken.trim()) headers['x-model-config-token'] = modelAdminToken.trim();
      const res = await fetch('/api/model-config', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          connection: {
            baseUrl: modelDraft.baseUrl,
            apiKey: modelDraft.apiKey
          },
          text: {
            model: modelDraft.textModel
          },
          image: {
            model: modelDraft.imageModel
          },
          video: {
            model: modelDraft.videoModel
          }
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '模型配置保存失败');
      setModelConfig(data);
      setHealth({ ok: data.ok, provider: data.provider });
      setModelDraft((prev) => ({ ...draftFromConfig(data, prev), apiKey: '' }));
      setModelConfigMessage('已保存，同一套连接已应用到文本、图片和视频模型。');
    } catch (err) {
      setModelConfigMessage(err instanceof Error ? err.message : '模型配置保存失败');
    } finally {
      setSavingModelConfig(false);
    }
  }

  function applyQuickCommand(command: string) {
    setInstruction(command);
  }

  if (!workspace) return <main className="loading-screen">正在加载...</main>;

  const hasUserConversation = messages.some((message) => message.role === 'user');
  const hasOutput = hasWorkspaceAssets;
  const focusMode = hasUserConversation && !hasOutput;
  const visibleMessages = (hasUserConversation ? messages : messages.slice(0, 1)).slice(-6);
  const latestUserMessage = [...messages].reverse().find((message) => message.role === 'user');
  const styleBook = styleBookFromWorkspace(workspace);
  const projectStyle = styleBook.global;
  const styleWarnings = styleDriftWarnings(styleBook);
  const modelWriteBlocked = modelConfig?.writable === false && !modelConfig?.authRequired;
  const modelTokenMissing = Boolean(modelConfig?.authRequired && !modelAdminToken.trim() && !modelConfig.writable);
  const warningChecks = lastRun?.complianceChecks.filter((check) => check.status !== 'pass') || [];
  const genericPendingPatches = pendingPatches.filter((patch) => productionStageForFile(patch.filePath) !== 'video');
  const approvalReady = genericPendingPatches.filter((patch) => patch.riskLevel === 'low').length;
  const expectedTaskCount = Math.max(5, videoCards.length, scenes.length, assetPrompts.prompts?.length || 0, assetPrompts.renderQueue?.length || 0);
  const visibleTaskCount = videoCards.length;
  const renderTaskCount = Math.max(assetPrompts.renderQueue?.length || 0, assetPrompts.prompts?.length || 0, videoCards.length, scenes.length);
  const missingTaskCount = Math.max(0, expectedTaskCount - visibleTaskCount);
  const provider = health?.provider.selectedProvider;
  const online = Boolean(provider && provider !== 'mock');
  const runStatus: 'idle' | 'running' | 'done' | 'error' = loading ? 'running' : lastRun ? 'done' : error ? 'error' : 'idle';
  const runStatusLabel = runStatus === 'running' ? '执行中' : runStatus === 'error' ? '执行失败' : runStatus === 'done' ? '本轮已完成' : '待输入目标';

  const ctxStack = contextStack(proposedWorkspace);
  const queueEntries: QueueEntry[] = videoCards.length
    ? videoCards.map((card, index) => ({
        id: card.id,
        label: card.title,
        hint: `${card.duration}s · ${statusLabel(complianceStatus)}`,
        state: loading ? 'running' : 'done',
        active: selectedSceneId ? selectedSceneId === card.id : index === 0
      }))
    : [
        {
          id: 'await',
          label: brief.isBlank ? '等待第一条 Mission' : '准备组织生产',
          hint: '输入内容目标后自动建立任务队列',
          state: 'idle'
        }
      ];

  const pipeline = pipelineSteps.map((step) => {
    const exists = Boolean(getFile(proposedWorkspace, step.path));
    return { label: step.label, ready: exists, warn: step.path === 'asset_prompts.json' && exists };
  });

  const tools = [
    { label: online ? '在线生成模型' : '本地生成器', on: online },
    { label: '平台规则库', on: Boolean(getFile(proposedWorkspace, 'platform_rules.json')) },
    { label: '素材库', on: Boolean(getFile(proposedWorkspace, 'asset_library.json')) }
  ];
  const memorySummary =
    snippet(getFile(proposedWorkspace, '.aigc/MEMORY.md')?.content || '', 4) ||
    '品牌记忆会记录语气、禁用词、定位和历史偏好；审批写入后在这里沉淀。';

  const committedPrompts = parseJsonFile<AssetPrompts>(workspace, 'asset_prompts.json', {});
  const characterAssetIssues = proposedWorkspace ? validateStageAssets('character', proposedWorkspace) : ['角色资产文件尚未生成'];
  const sceneAssetIssues = proposedWorkspace ? validateStageAssets('scene', proposedWorkspace) : ['场景资产文件尚未生成'];
  // 画板读的是草稿工作区：用户刚补的锚点和刚生成的机位图要立刻出现在界面上，
  // 等确认之后再回读已提交版本，等于每次编辑都看不到自己改了什么。
  const sceneMasters = sceneMastersFromWorkspace(proposedWorkspace);
  const productionScenes = productionScenesFromWorkspace(proposedWorkspace);
  const sceneContinuity = sceneContinuityReports(proposedWorkspace);
  const visibleCharacterAssets = charactersFromWorkspace(proposedWorkspace).map((character: CharacterAsset) => ({
    id: character.id,
    name: character.name,
    scriptAlias: character.scriptAlias,
    role: character.role,
    description: character.description,
    consistency: character.consistencyPrompt,
    source: 'characters.json',
    negativePrompt: character.negativePrompt,
    faceAnchorVariantId: character.faceAnchorVariantId,
    expressionIds: character.expressionIds,
    referenceStrategy: character.referenceStrategy,
    variants: character.variants.map((variant) => ({
      id: variant.id as CharacterReferenceVariant['id'],
      label: variant.label,
      ageLabel: variant.ageLabel,
      wardrobe: variant.wardrobe,
      imageUrl: variant.primaryImageUrl,
      sceneIds: [],
      multiViewImageUrl: variant.multiViewImageUrl,
      expressionSheetImageUrl: variant.expressionSheetImageUrl
    })),
    visual: character.visual
  }));
  // 角色阶段按正文补齐人物是对的（不补齐下游会断档），但补齐这件事必须说出来——
  // 否则用户只能靠肉眼数卡片，才发现脚本里定义了 4 个人、实际生成了 8 个。
  // 这是警告不是阻断：多出来的角色是正文要求的，该改的是脚本，不是把这些人删掉。
  // 比对连 scriptAlias 一起传：角色阶段给没名字的人随机起的名字，在脚本里只以原始称呼出现。
  const rosterCharacters = visibleCharacterAssets.map((character) => ({
    name: character.name,
    scriptAlias: character.scriptAlias
  }));
  const characterRosterAlert = rosterGapWarning(missingFromRoster(scriptBody, rosterCharacters));
  /**
   * 自动剪辑方案。
   *
   * 刻意不用 useMemo：这一段位于组件里若干个提前 return 之后，挂 hook 会让
   * 前后两次渲染的 hook 数量对不上（React 直接抛 "Rendered more hooks than during
   * the previous render"，整页白屏）。planAutoCut 只是对几十个镜头跑一遍正则，
   * 每次渲染重算的代价远小于把它挪到组件顶部所需要的改动量。
   */
  const autoCutPlan = planAutoCut(
    safeParseJson<{ scenes?: Record<string, unknown>[] }>(
      getFile(proposedWorkspace, 'storyboard.json')?.content || '',
      {}
    ).scenes || []
  );
  const autoCutSuggestions = actionableAutoCutDecisions(autoCutPlan);
  const acceptedAutoCutDecisions = autoCutPlan.decisions.filter(
    (item) => item.action !== 'flag' && acceptedAutoCutIds.includes(item.shotId)
  );
  // 出图张数按实际角色数和变体数算，不写死：七个角色和一个角色差着五倍的钱。
  const characterImageBudget = characterImageBudgetSummary({
    characterCount: visibleCharacterAssets.length,
    variantsPerCharacter: Math.max(
      1,
      ...visibleCharacterAssets.map((character) => character.variants.length || 1)
    )
  });
  // 反方向：脚本人物设定写了三个人，角色阶段只产出一个，以前界面上一句话都没有。
  const characterRosterShortfall = rosterShortfallWarning(
    rosterNamesMissingFromAssets(scriptBody, rosterCharacters),
    visibleCharacterAssets.length
  );
  /**
   * 这份 characters.json 是不是内置模板兜底出来的。
   *
   * 真实事故：模型产出没过 hasCharacters 的 13 项字段校验，整份文件被换成通用模板——
   * 主角变成「对这个主题感兴趣的目标观众…」、年龄档变成儿童 8 岁，和剧本毫无关系，
   * 而角色图还照着这份模板生成了。原来只有审批面板里有一条警告，
   * 用户看的是画板，于是把一份跟自己剧本无关的设定当成模型写的，接着往上补设定。
   */
  const characterTemplateFallback = pendingPatches.find(
    (patch) => patch.filePath === 'characters.json'
  )?.origin?.templateFallback;
  /**
   * 场景阶段同样要在画板上说清楚这份数据从哪来。
   *
   * 真实事故：脚本 12 个小节各有地点，模型产出漏了一个字段被整份判废，
   * 换成内置的「3 秒 Hook / 犹豫时刻 / 可信证明…」营销模板，而模板 5 条共用同一个 location，
   * 于是用户看到 5 张全在同一间客厅里的卡片，只能自己来问「为什么不是随机生成的场景」。
   * 警告只写在审批面板里没用——用户看的是画板。
   */
  const sceneTemplateFallback = pendingPatches.find(
    (patch) => patch.filePath === 'scenes.json'
  )?.origin?.templateFallback;
  const sceneFallbackNotice =
    sceneTemplateFallback === 'repaired'
      ? '模型漏了一些字段，系统已逐个场次补齐。地点和剧情来自你的剧本，只有缺失的字段是补的——确认前请核对光线、色彩和时长。'
      : sceneTemplateFallback === 'missing'
        ? '模型没有产出 scenes.json。当前场次是按剧本小节的「场景：」直接生成的骨架，只有地点和原文可信，画面描述需要重新生成。'
        : sceneTemplateFallback === 'invalid'
          ? '模型产出的 scenes.json 连逐个场次补齐都救不回来。当前显示的是按剧本或内置模板生成的场次，请先重新生成场景，不要在这份数据上继续补设定。'
          : '';
  const fullExpressionPalette = CHARACTER_EXPRESSION_OPTIONS.map((option) => option.label).join('、');
  // 必须排除视频阶段的全部产出文件，不能只排 asset_prompts.json：
  // video_spec.json 同样是本阶段的产出，把它算成「上游 patch」会锁死交接面板，
  // 而唯一能消费它的最终确认入口恰恰在这块被锁掉的面板里——形成无解死锁。
  const videoStageOutputFiles = new Set(stageConfig('video').outputFiles);
  const nonVideoPendingPatches = pendingPatches.filter((patch) => !videoStageOutputFiles.has(patch.filePath));
  const handoffReady =
    Boolean(getFile(proposedWorkspace, 'asset_prompts.json')) && nonVideoPendingPatches.length === 0 && complianceStatus !== 'blocked';
  const handoffMissing = !getFile(proposedWorkspace, 'asset_prompts.json')
    ? '当前还没有已确认的素材提示词制作包，先让 Agent 产出并审批通过。'
    : complianceStatus === 'blocked'
    ? '合规检查阻断，请先处理风险后再交接。'
    : nonVideoPendingPatches.length
    ? `还有 ${nonVideoPendingPatches.length} 个上游 patch 待审批，确认后才会交接。`
    : '';

  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId) || assets[0];
  const selectedFile = selectedAsset ? getFile(proposedWorkspace, selectedAsset.filePath) : undefined;
  const selectedAssetPatch = selectedAsset ? pendingPatches.find((patch) => patch.filePath === selectedAsset.filePath) : undefined;
  const selectedAssetFileName = selectedAssetPatch?.filePath || selectedAsset?.filePath || 'script.md';
  const selectedAssetRawBody = selectedAssetPatch?.after || selectedFile?.content || (selectedAssetFileName === 'script.md' ? scriptBody : '');
  const selectedAssetBody =
    selectedAssetFileName === 'asset_prompts.json'
      ? formatAssetPromptsReview(assetPrompts)
      : selectedAssetRawBody;
  const selectedAssetIsScript = selectedAssetFileName === 'script.md' || selectedAsset?.type === 'script';
  const activeInspectorPatch =
    activeTab === 'video'
      ? selectedPatch
      : selectedAssetPatch || (selectedPatch?.filePath === selectedAsset?.filePath ? selectedPatch : undefined);
  const inspectorDiff = activeInspectorPatch ? diffLines(activeInspectorPatch.before, activeInspectorPatch.after).slice(0, 80) : null;
  const inspectorFileName = activeInspectorPatch?.filePath || selectedAssetFileName;
  const inspectorFileBody = activeInspectorPatch?.after || selectedAssetBody || scriptPreview;
  const storyboard = storyboardScenes(proposedWorkspace);
  // 分镜里存的是 id，审查面板要显示的是名字。查表建在这里，卡片渲染时逐个 find 会 O(镜头×角色)。
  // 不用 useMemo：这一行在组件的提前 return 之后，包 hook 会变成条件 hook，
  // React 直接抛「Rendered more hooks than during the previous render」白屏。
  const storyboardCharacterNames = new Map(
    (safeParseJson<{ characters?: Array<{ id?: unknown; name?: unknown }> }>(
      getFile(proposedWorkspace, 'characters.json')?.content || '',
      {}
    ).characters || [])
      .filter((item) => typeof item.id === 'string' && typeof item.name === 'string')
      .map((item) => [item.id as string, item.name as string])
  );
  const storyboardSceneTitles = new Map(
    (safeParseJson<{ scenes?: Array<{ id?: unknown; title?: unknown }> }>(
      getFile(proposedWorkspace, 'scenes.json')?.content || '',
      {}
    ).scenes || [])
      .filter((item) => typeof item.id === 'string' && typeof item.title === 'string')
      .map((item) => [item.id as string, item.title as string])
  );
  // 查不到就原样回传 id：显示 scene_01 至少能让用户看出是引用错了，空字符串只会让人以为没填。
  const storyboardCharacterName = (id: string) => storyboardCharacterNames.get(id) || id;
  const storyboardSceneTitle = (id: string) => (id ? storyboardSceneTitles.get(id) || id : '');
  const activeScene = scenes.find((scene) => scene.id === selectedSceneId) || scenes[0];
  const previewInfo = {
    hook: publishCopy.titles?.[0] || activeScene?.title || brief.title || '把一句视频目标变成可审查资产',
    sub: activeScene?.subtitle || brief.goal,
    cta: publishCopy.coverText || 'CTA 待生成',
    platform: videoSpec.platform,
    durationLabel: `${videoDuration(videoSpec)}s`
  };
  const scriptAsset = assets.find((asset) => asset.filePath === 'script.md' || asset.type === 'script');
  const promptAsset = assets.find((asset) => asset.filePath === 'asset_prompts.json' || asset.type === 'prompt');
  const shotAsset = assets.find((asset) => asset.type === 'shot' || asset.filePath === 'storyboard.json');
  const sceneAsset = assets.find((asset) => asset.type === 'scene') || assets.find((asset) => asset.filePath === 'scenes.json');
  const timelineAsset = assets.find((asset) => asset.filePath === 'timeline.json' || asset.type === 'timeline');
  const characterPackage = assetPrompts.characterConsistency || committedPrompts.characterConsistency;
  const hasCharacterPackage = Boolean(visibleCharacterAssets.length);
  const studioStageLabel = studioStages.find((stage) => stage.id === activeTab)?.label || '总览';
  const patchCountFor = (paths: string[]) => pendingPatches.filter((patch) => paths.includes(patch.filePath)).length;
  const missionPatchCount = patchCountFor(['brief.json', 'campaign_goal.json', 'profile.json']);
  const scriptPatchCount = patchCountFor(['script.md']);
  const characterPatchCount = patchCountFor(['characters.json', 'asset_library.json']);
  const scenePatchCount = patchCountFor(['scenes.json']);
  const storyboardPatchCount = patchCountFor(['storyboard.json', 'timeline.json']);
  const videoPatchCount = patchCountFor(['asset_prompts.json', 'timeline.json']);
  const missionNotice = dependencyNotice('overview', proposedWorkspace, pendingPatches);
  const scriptNotice = dependencyNotice('script', proposedWorkspace, pendingPatches);
  const characterNotice = dependencyNotice('character', proposedWorkspace, pendingPatches);
  const sceneNotice = dependencyNotice('scene', proposedWorkspace, pendingPatches);
  const storyboardNotice = dependencyNotice('storyboard', proposedWorkspace, pendingPatches);
  const videoNotice = dependencyNotice('video', proposedWorkspace, pendingPatches);

  function selectedExpressionIdsFor(characterId: string) {
    return roleExpressionDrafts[characterId] || visibleCharacterAssets.find((character) => character.id === characterId)?.expressionIds || DEFAULT_CHARACTER_EXPRESSION_IDS;
  }

  function selectedExpressionOptionsFor(characterId: string) {
    const ids = new Set(selectedExpressionIdsFor(characterId));
    return CHARACTER_EXPRESSION_OPTIONS.filter((option) => ids.has(option.id));
  }

  function selectedReferenceStrategyFor(characterId: string) {
    const strategyId = roleReferenceStrategyDrafts[characterId] || visibleCharacterAssets.find((character) => character.id === characterId)?.referenceStrategy || 'face_id';
    return CHARACTER_REFERENCE_STRATEGIES.find((strategy) => strategy.id === strategyId) || CHARACTER_REFERENCE_STRATEGIES[0];
  }

  function characterDesignKey(characterId: string, variantId: string, outputKind: CharacterDesignOutputKind) {
    return `${characterId}:${variantId}:${outputKind}`;
  }

  function characterVariantsFor(character: CharacterAssetCard, index?: number): CharacterReferenceVariant[] {
    if (character.variants?.length) return character.variants;
    return [{ ...BASE_CHARACTER_VARIANT, sceneIds: [] }];
  }

  function activeCharacterVariantFor(character: CharacterAssetCard, index?: number) {
    const variants = characterVariantsFor(character, index);
    const selectedId = roleActiveVariantDrafts[character.id];
    return variants.find((variant) => variant.id === selectedId) || variants[0];
  }

  function characterDesignRenderFor(
    character: CharacterAssetCard,
    variant: CharacterReferenceVariant,
    outputKind: CharacterDesignOutputKind
  ): CharacterDesignRender {
    const draft = roleDesignDrafts[characterDesignKey(character.id, variant.id, outputKind)];
    if (draft) return draft;
    const storedVariant = variant as CharacterReferenceVariant & { multiViewImageUrl?: string; expressionSheetImageUrl?: string };
    const imageUrl = outputKind === 'portrait'
      ? variant.imageUrl
      : outputKind === 'multi_view'
        ? storedVariant.multiViewImageUrl || ''
        : storedVariant.expressionSheetImageUrl || '';
    if (imageUrl) return { imageUrl, status: 'ready', source: 'existing' };
    return { imageUrl: '', status: 'idle' };
  }

  function faceAnchorVariantFor(character: CharacterAssetCard, index?: number) {
    const variants = characterVariantsFor(character, index);
    const selectedId = roleFaceAnchorDrafts[character.id] || character.faceAnchorVariantId;
    return variants.find((variant) => variant.id === selectedId) || variants.find((variant) => variant.imageUrl) || variants[0];
  }

  function resolvedCharacterImage(
    character: CharacterAssetCard,
    variant: CharacterReferenceVariant,
    outputKind: CharacterDesignOutputKind = 'portrait'
  ) {
    return characterDesignRenderFor(character, variant, outputKind).imageUrl;
  }

  function toggleCharacterExpression(characterId: string, expressionId: CharacterExpressionId) {
    setRoleExpressionDrafts((prev) => {
      const current = prev[characterId] || DEFAULT_CHARACTER_EXPRESSION_IDS;
      const next = current.includes(expressionId)
        ? current.filter((id) => id !== expressionId)
        : [...current, expressionId];
      return { ...prev, [characterId]: next };
    });
  }

  function updateCharacterDesignRender(
    characterId: string,
    variantId: string,
    outputKind: CharacterDesignOutputKind,
    next: CharacterDesignRender
  ) {
    const key = characterDesignKey(characterId, variantId, outputKind);
    setRoleDesignDrafts((prev) => ({ ...prev, [key]: next }));
  }

  function persistManualStageImage(
    result: StageImageJob & { imageUrl: string },
    summary: string,
    run: StageRun | null = null
  ) {
    if (!workspace) return;
    // 镜头首帧图属于分镜阶段的产物，但它自己不是一个制作阶段。
    // 这一层映射必须显式写出来：stage 直接当 ProductionStageId 用会让 'shot' 落到
    // flow.stages['shot'] 上，那是个 undefined，整条写入会静默什么都不做。
    const productionStage: ProductionStageId = result.stage === 'shot' ? 'storyboard' : result.stage;
    const editBase = currentStageDraftWorkspace(workspace, productionStage);
    const activeRun = run || beginManualStageRun(productionStage);
    if (!activeRun) return;
    setWorkspace((current) => {
      if (!current) return current;
      if (!isCurrentStageRun(productionStage, activeRun.generationJobId, activeRun.token)) return current;
      const flow = productionFlowFromWorkspace(current);
      const record = flow.stages[productionStage];
      if (record.status !== 'generating' || record.generationJobId !== activeRun.generationJobId) return current;
      const proposed = editBase;
      const draft = applyStageImageResult(proposed, result);
      const filePath = result.stage === 'character' ? 'characters.json'
        : result.stage === 'shot' ? 'storyboard.json'
        : 'scenes.json';
      const after = getFile(draft, filePath)?.content;
      if (!after || after === getFile(proposed, filePath)?.content) return current;
      const patch: PatchOperation = {
        id: uid('patch'),
        filePath,
        summary,
        before: getFile(current, filePath)?.content || '',
        after,
        riskLevel: 'low',
        requiresApproval: true,
        origin: {
          kind: 'manual',
          productionStage,
          generationJobId: activeRun.generationJobId
        }
      };
      const withPatch = appendPendingPatches(current, [patch]);
      const finalized = writeProductionFlow(withPatch, markStageDraft(flow, {
        stage: productionStage,
        generationJobId: activeRun.generationJobId,
        sourceVersions: record.sourceVersions
      }));
      if (!fitsWorkspacePersistence(finalized)) {
        setError('项目体积已超过 32MB 档案上限，这张图没有写入。请删除部分旧参考图或换小图。');
        return current;
      }
      return finalized;
    });
  }

  function persistCharacterMetadata(
    characterId: string,
    /** 传函数时，它在写入那一刻针对文件里的最新角色对象求值，不会用到过期的渲染快照。 */
    change: Record<string, unknown> | ((character: Record<string, unknown>) => Record<string, unknown>),
    summary: string,
    /** 已经在跑的手动 run。异步生成完再开一条新 run 会把自己那条 abort 掉。 */
    existingRun: StageRun | null = null
  ) {
    if (!workspace) return;
    const editBase = currentStageDraftWorkspace(workspace, 'character');
    const run = existingRun || beginManualStageRun('character');
    if (!run) return;
    setWorkspace((current) => {
      if (!current || !isCurrentStageRun('character', run.generationJobId, run.token)) return current;
      const flow = productionFlowFromWorkspace(current);
      const record = flow.stages.character;
      if (record.status !== 'generating' || record.generationJobId !== run.generationJobId) return current;
      const proposed = editBase;
      const before = getFile(current, 'characters.json')?.content || '';
      const source = safeParseJson<{ characters?: Array<Record<string, unknown>> }>(getFile(proposed, 'characters.json')?.content || '', {});
      if (!Array.isArray(source.characters)) return current;
      let changed = false;
      const characters = source.characters.map((character) => {
        if (character.id !== characterId) return character;
        changed = true;
        return { ...character, ...(typeof change === 'function' ? change(character) : change) };
      });
      if (!changed) return current;
      const after = JSON.stringify({ ...source, characters }, null, 2);
      if (after === getFile(proposed, 'characters.json')?.content) return current;
      const withPatch = appendPendingPatches(current, [{
        id: uid('patch'),
        filePath: 'characters.json',
        summary,
        before,
        after,
        riskLevel: 'low',
        requiresApproval: true,
        origin: {
          kind: 'manual',
          productionStage: 'character',
          generationJobId: run.generationJobId
        }
      }]);
      const next = writeProductionFlow(withPatch, markStageDraft(flow, {
        stage: 'character', generationJobId: run.generationJobId, sourceVersions: record.sourceVersions
      }));
      if (!fitsWorkspacePersistence(next)) {
        setError('项目体积已超过 32MB 档案上限，这张图没有写入。请删除部分旧参考图或换小图。');
        return current;
      }
      return next;
    });
  }

  /**
   * 视觉设定的唯一写回口。和表情、参考策略走同一条路：
   * 改动落成 characters.json 的待审 patch，不静默生效——
   * 身份锚点被人改掉却没人看见，是这套流程最不能接受的一件事。
   */
  function persistCharacterVisual(
    characterId: string,
    mutate: (current: CharacterVisualSpec) => CharacterVisualSpec,
    summary: string,
    run: StageRun | null = null
  ) {
    // mutate 在写入那一刻针对文件里的最新 visual 执行。传整份对象进来的话，
    // 同一次渲染里连续改两个字段，后一个会把前一个盖掉——用户填了两格只存下一格。
    persistCharacterMetadata(
      characterId,
      (character) => ({ visual: mutate(normalizeCharacterVisualSpec(character.visual)) }),
      summary,
      run
    );
  }

  function characterBoardEntry(characterId: string) {
    return visibleCharacterAssets.find((character) => character.id === characterId);
  }

  function updateCharacterReviewStatus(characterId: string, status: CharacterReviewStatus) {
    const character = characterBoardEntry(characterId);
    if (!character) return;
    const state = characterReviewState(character.visual);
    // 必填字段没填完就不许提交审查、也不许直接确认：让一份缺脸型、缺色盘的设定被标成
    // 「已确认」，等于把这三个字变成没有含义的按钮——而且 characterReviewState 会立刻
    // 把它降级回「需修改」，用户点了一下什么都没得到，只会更困惑。
    if ((status === 'ready_for_review' || status === 'confirmed') && state.completeness.missing.length > 0) {
      setRoleDesignNotice(
        `「${character.name}」还差 ${state.completeness.missing.length} 项必填字段，不能提交视觉审查：${state.completeness.missing.join('、')}。`
      );
      return;
    }
    const label = status === 'confirmed' ? '已确认' : status === 'needs_changes' ? '需修改' : '待审查';
    persistCharacterVisual(
      characterId,
      (current) => ({ ...current, reviewStatus: status }),
      `将「${character.name}」视觉设定标记为${label}`
    );
    setRoleDesignNotice(`「${character.name}」的视觉设定已标记为${label}。确认写入后才会应用到下游。`);
  }

  function characterVisualSlotLabel(character: CharacterAssetCard, slot: CharacterImageSlot) {
    if (slot.kind === 'view') return CHARACTER_VIEW_ANGLES.find((angle) => angle.id === slot.id)?.label || '身份参考位';
    if (slot.kind === 'look') return character.visual.wardrobe.find((look) => look.id === slot.id)?.label || '场景造型';
    return characterExpressionSlots(character.visual).find((item) => item.id === slot.id)?.label || '表情';
  }

  /** 三种图片位的提示词都从同一份视觉设定压出来，保证四个角度、六套造型、八个表情是同一个人。 */
  function characterVisualSlotPrompt(
    character: CharacterAssetCard,
    variant: CharacterReferenceVariant,
    slot: CharacterImageSlot
  ) {
    const look = slot.kind === 'look' ? character.visual.wardrobe.find((item) => item.id === slot.id) : undefined;
    const label = characterVisualSlotLabel(character, slot);
    // 身份参考位的措辞和自动补图循环共用同一份定义：两边各写一套，
    // 手动补的那张和自动生成的那三张就会在「要不要保持同一个人」上说得不一样。
    const outputInstructionOverride = slot.kind === 'view'
      ? characterIdentityViewInstruction(slot.id)
      : look
        ? `生成这个角色在「${look.label}」造型下的站姿全身定妆照。只更换服装造型，脸型、五官、发际线和肤色保持不变。`
        : `生成这个角色的「${label}」表情特写，胸部以上构图。同一张脸只改变表情，五官结构、发型、肤色和年龄感不允许变化。`;

    return buildCharacterDesignPrompt({
      characterName: character.name,
      role: character.role,
      description: character.description,
      consistency: character.consistency,
      negativePrompt: character.negativePrompt,
      stage: variant,
      adjustment: roleAdjustmentDrafts[character.id],
      visualLines: characterVisualPromptLines(character.visual, {
        lookId: slot.kind === 'look' ? slot.id : undefined,
        expressionId: slot.kind === 'expression' ? slot.id : undefined,
        // 四个身份参考位是设定板，不该继承「只用背影」这类成片出镜规则。
        purpose: slot.kind === 'view' ? 'identity_reference' : 'scene'
      }),
      outputInstructionOverride
    });
  }

  function applyCharacterVisualImage(
    visual: CharacterVisualSpec,
    slot: CharacterImageSlot,
    imageUrl: string
  ): CharacterVisualSpec {
    if (slot.kind === 'view') {
      return { ...visual, identity: { ...visual.identity, views: { ...visual.identity.views, [slot.id]: imageUrl } } };
    }
    if (slot.kind === 'look') {
      return { ...visual, wardrobe: visual.wardrobe.map((look) => (look.id === slot.id ? { ...look, imageUrl } : look)) };
    }
    const expressions = characterExpressionSlots(visual)
      .map((item) => (item.id === slot.id ? { ...item, imageUrl } : item))
      .filter((item) => item.intensity || item.brow || item.gaze || item.mouth || item.sceneUsage || item.imageUrl);
    return { ...visual, expressions };
  }

  async function generateCharacterVisualImage(characterId: string, slot: CharacterImageSlot) {
    const character = characterBoardEntry(characterId);
    if (!character) return;
    const key = characterSlotKey(characterId, slot);
    const run = beginManualStageRun('character');
    if (!run) return;

    const variant = activeCharacterVariantFor(character);
    const anchorVariant = faceAnchorVariantFor(character);
    // 身份锚点图必须进参考：不带参考图生成侧脸和表情，出来的就是另一个人。
    const referenceImages = Array.from(new Set(
      [
        character.visual.identity.views.front,
        resolvedCharacterImage(character, anchorVariant, 'portrait'),
        resolvedCharacterImage(character, variant, 'portrait')
      ].map((item) => item?.trim()).filter(Boolean)
    ));
    const label = characterVisualSlotLabel(character, slot);

    setCharacterSlotStates((prev) => ({ ...prev, [key]: { status: 'generating' } }));
    setRoleDesignNotice(`正在生成「${character.name} · ${label}」参考图…`);

    try {
      const res = await fetch('/api/image/render', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: run.controller.signal,
        body: JSON.stringify({
          prompt: characterVisualSlotPrompt(character, variant, slot),
          negativePrompt: character.negativePrompt || '',
          images: referenceImages
        })
      });
      const data = (await res.json()) as ImageRenderApiResponse;
      if (!res.ok || !data.imageUrl) throw new Error(characterImageErrorText(data.error || '图片模型没有返回参考图'));
      const renderedImageUrl = data.imageUrl;

      setCharacterSlotStates((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      persistCharacterVisual(
        characterId,
        (current) => applyCharacterVisualImage(current, slot, renderedImageUrl),
        `写入「${character.name} · ${label}」参考图草稿`,
        run
      );
      setRoleDesignNotice(`已生成「${character.name} · ${label}」参考图。确认后才会应用到下游。`);
    } catch (err) {
      if (run.controller.signal.aborted || !isCurrentStageRun('character', run.generationJobId, run.token)) return;
      const message = characterImageErrorText(err instanceof Error ? err.message : '参考图生成失败');
      setCharacterSlotStates((prev) => ({ ...prev, [key]: { status: 'error', message } }));
      failCurrentStageRun('character', run, message);
      setRoleDesignNotice(`生成失败：${message}`);
    }
  }

  function uploadCharacterVisualImage(characterId: string, slot: CharacterImageSlot, file: File) {
    const character = characterBoardEntry(characterId);
    if (!character) return;
    const key = characterSlotKey(characterId, slot);
    const label = characterVisualSlotLabel(character, slot);
    if (!file.type.startsWith('image/')) {
      setCharacterSlotStates((prev) => ({ ...prev, [key]: { status: 'error', message: '请选择图片文件。' } }));
      return;
    }
    if (file.size <= 0 || file.size > MAX_PERSISTED_IMAGE_BYTES) {
      setCharacterSlotStates((prev) => ({
        ...prev,
        [key]: { status: 'error', message: `图片需大于 0 且不超过 ${MAX_PERSISTED_IMAGE_BYTES / 1024 / 1024}MB。` }
      }));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const imageUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!imageUrl || !canPersistUploadedDataUrl(imageUrl)) {
        const message = imageUrl
          ? '项目体积已超过 32MB 档案上限，这张图没有写入。请删除部分旧参考图或换小图。'
          : '图片读取失败。';
        setCharacterSlotStates((prev) => ({ ...prev, [key]: { status: 'error', message } }));
        return;
      }
      setCharacterSlotStates((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      persistCharacterVisual(
        characterId,
        (current) => applyCharacterVisualImage(current, slot, imageUrl),
        `上传「${character.name} · ${label}」参考图草稿`
      );
      setRoleDesignNotice(`已上传「${character.name} · ${label}」参考图，尚未应用到下游。`);
    };
    reader.onerror = () => {
      setCharacterSlotStates((prev) => ({ ...prev, [key]: { status: 'error', message: '图片读取失败。' } }));
    };
    reader.readAsDataURL(file);
  }

  async function regenerateCharacterDesign(
    character: CharacterAssetCard,
    variant: CharacterReferenceVariant,
    outputKind: CharacterDesignOutputKind = 'portrait',
    characterIndex?: number
  ) {
    const run = beginManualStageRun('character');
    if (!run) return;
    const current = characterDesignRenderFor(character, variant, outputKind);
    const portrait = characterDesignRenderFor(character, variant, 'portrait');
    const anchorVariant = faceAnchorVariantFor(character, characterIndex);
    const anchorImage = resolvedCharacterImage(character, anchorVariant, 'portrait');
    const referenceImages = Array.from(
      new Set(
        [outputKind === 'portrait' ? current.imageUrl : portrait.imageUrl, anchorImage]
          .map((item) => item?.trim())
          .filter(Boolean)
      )
    );
    const selectedExpressions = selectedExpressionOptionsFor(character.id);

    updateCharacterDesignRender(character.id, variant.id, outputKind, {
      imageUrl: current.imageUrl,
      status: 'generating',
      source: current.source
    });
    setRoleDesignPreviewKinds((prev) => ({ ...prev, [character.id]: outputKind }));
    setRoleDesignNotice(`正在生成「${character.name} · ${variant.label}」${outputKind === 'portrait' ? '角色主图' : outputKind === 'multi_view' ? '多视角设定' : '表情板'}…`);

    try {
      const res = await fetch('/api/image/render', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: run.controller.signal,
        body: JSON.stringify({
          prompt: buildCharacterDesignPrompt({
            characterName: character.name,
            role: character.role,
            description: character.description,
            consistency: character.consistency,
            negativePrompt: character.negativePrompt,
            stage: variant,
            // 这个分支不传 visualLines，人种就只能从这里进去。漏了它，角色主图和表情板
            // 会各自重掷一次人种，后面每个镜头都得跟着这张错的锚点图走。
            ethnicity: characterEthnicityText(character.visual),
            expressionPrompts: selectedExpressions.map((item) => item.prompt),
            adjustment: roleAdjustmentDrafts[character.id],
            outputKind
          }),
          negativePrompt: character.negativePrompt || '',
          images: referenceImages
        })
      });
      const data = (await res.json()) as ImageRenderApiResponse;
      if (!res.ok || !data.imageUrl) throw new Error(characterImageErrorText(data.error || '图片模型没有返回角色图'));

      updateCharacterDesignRender(character.id, variant.id, outputKind, {
        imageUrl: data.imageUrl,
        status: 'ready',
        source: 'generated'
      });
      if (outputKind === 'portrait' && !roleFaceAnchorDrafts[character.id]) {
        setRoleFaceAnchorDrafts((prev) => ({ ...prev, [character.id]: variant.id }));
      }
      if (variant.id !== 'base') {
        persistManualStageImage({
          stage: 'character', assetId: character.id, variantId: variant.id, kind: outputKind,
          prompt: '', negativePrompt: character.negativePrompt || '', imageUrl: data.imageUrl
        }, `写入「${character.name} · ${variant.label}」角色图草稿`, run);
      }
      setRoleDesignNotice(`已生成「${character.name} · ${variant.label}」角色资产。确认后再应用到视频任务。`);
    } catch (err) {
      if (run.controller.signal.aborted || !isCurrentStageRun('character', run.generationJobId, run.token)) return;
      const message = characterImageErrorText(err instanceof Error ? err.message : '角色图生成失败');
      updateCharacterDesignRender(character.id, variant.id, outputKind, {
        imageUrl: current.imageUrl,
        status: 'error',
        error: message,
        source: current.source
      });
      failCurrentStageRun('character', run, message);
      setRoleDesignNotice(`生成失败：${message}`);
    }
  }

  function replaceCharacterDesign(character: CharacterAssetCard, variant: CharacterReferenceVariant, file?: File) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setRoleDesignNotice('替换失败：请选择图片文件。');
      return;
    }
    if (file.size <= 0 || file.size > MAX_PERSISTED_IMAGE_BYTES) {
      setRoleDesignNotice(`替换失败：图片需大于 0 且不超过 ${MAX_PERSISTED_IMAGE_BYTES / 1024 / 1024}MB。`);
      return;
    }
    const run = beginManualStageRun('character');
    if (!run) return;
    const reader = new FileReader();
    reader.onload = () => {
      const imageUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!imageUrl) {
        const message = '替换失败：图片读取失败。';
        failCurrentStageRun('character', run, message);
        setRoleDesignNotice(message);
        return;
      }
      if (!isCurrentStageRun('character', run.generationJobId, run.token)) return;
      if (!canPersistUploadedDataUrl(imageUrl)) {
        const message = '项目体积已超过 32MB 档案上限，这张图没有写入。请删除部分旧参考图或换小图。';
        failCurrentStageRun('character', run, message);
        setRoleDesignNotice(message);
        return;
      }
      updateCharacterDesignRender(character.id, variant.id, 'portrait', {
        imageUrl,
        status: 'ready',
        source: 'uploaded'
      });
      setRoleDesignPreviewKinds((prev) => ({ ...prev, [character.id]: 'portrait' }));
      if (variant.id !== 'base') {
        persistManualStageImage({
          stage: 'character', assetId: character.id, variantId: variant.id, kind: 'portrait',
          prompt: '', negativePrompt: character.negativePrompt || '', imageUrl
        }, `替换「${character.name} · ${variant.label}」角色主图草稿`, run);
      }
      setRoleDesignNotice(`已替换「${character.name} · ${variant.label}」角色主图，尚未应用到视频任务。`);
    };
    reader.onerror = () => {
      const message = '替换失败：图片读取失败。';
      failCurrentStageRun('character', run, message);
      setRoleDesignNotice(message);
    };
    reader.readAsDataURL(file);
  }

  function sceneImageJob(sceneId: string): StageImageJob | null {
    const source = safeParseJson<{ scenes?: Array<Record<string, unknown>> }>(getFile(proposedWorkspace, 'scenes.json')?.content || '', {});
    const scene = source.scenes?.find((item) => item.id === sceneId);
    if (!scene) return null;
    const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
    const list = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).join('、') : '';
    // 和批量生成保持同一口径：出场角色的锚点图必须跟着进图生图，
    // 否则重新生成的场景图又是一张现编的脸，视频首帧一用就前功尽弃。
    const castIds = Array.isArray(scene.characterIds)
      ? scene.characterIds.filter((id): id is string => typeof id === 'string')
      : [];
    const cast = charactersFromWorkspace(proposedWorkspace).filter((character) => castIds.includes(character.id));
    const castAnchors = uniqueTexts(
      cast.map((character) => {
        const variants = character.variants || [];
        const anchor = variants.find((variant) => variant.id === character.faceAnchorVariantId) || variants[0];
        return anchor?.primaryImageUrl || '';
      })
    );
    const castBrief = cast
      .map((character) => {
        const consistency = textField(character.consistencyPrompt);
        return consistency ? `${character.name}（${character.role || '出场角色'}）：${consistency}` : character.name;
      })
      .join('；');
    const prompt = [
      text(scene.mainImagePrompt) || text(scene.prompt) || text(scene.visual),
      `地点：${text(scene.location)}。时间：${text(scene.timeOfDay)}。光线：${text(scene.lighting)}。色彩：${text(scene.palette)}。`,
      castBrief
        ? `出场角色的长相必须与参考图完全一致，不要重新设计人物——${castBrief}。`
        : list(scene.characterIds) ? `出场角色：${list(scene.characterIds)}。` : ''
    ].filter(Boolean).join('\n');
    return prompt
      ? {
          stage: 'scene',
          assetId: sceneId,
          prompt,
          negativePrompt: text(scene.negativePrompt),
          ...(castAnchors.length ? { referenceImages: castAnchors } : {})
        }
      : null;
  }

  async function regenerateSceneImage(sceneId: string) {
    const job = sceneImageJob(sceneId);
    if (!job) {
      setError('场景缺少可生成的主图提示词。');
      return;
    }
    const run = beginManualStageRun('scene');
    if (!run) return;
    try {
      const imageUrl = await renderStageImage(job, run.controller.signal);
      if (!isCurrentStageRun('scene', run.generationJobId, run.token)) return;
      persistManualStageImage({ ...job, imageUrl }, '写入重新生成的场景图草稿', run);
    } catch (err) {
      if (run.controller.signal.aborted || !isCurrentStageRun('scene', run.generationJobId, run.token)) return;
      const message = characterImageErrorText(err instanceof Error ? err.message : '场景图生成失败');
      failCurrentStageRun('scene', run, message);
      setError(message);
    }
  }

  function replaceSceneImageFile(sceneId: string, file?: File) {
    if (!file || !file.type.startsWith('image/')) {
      setError('替换失败：请选择图片文件。');
      return;
    }
    if (file.size <= 0 || file.size > MAX_PERSISTED_IMAGE_BYTES) {
      setError(`替换失败：图片需大于 0 且不超过 ${MAX_PERSISTED_IMAGE_BYTES / 1024 / 1024}MB。`);
      return;
    }
    const run = beginManualStageRun('scene');
    if (!run) return;
    const reader = new FileReader();
    reader.onload = () => {
      const imageUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!imageUrl) {
        const message = '替换失败：图片读取失败。';
        failCurrentStageRun('scene', run, message);
        setError(message);
        return;
      }
      if (!isCurrentStageRun('scene', run.generationJobId, run.token)) return;
      if (!canPersistUploadedDataUrl(imageUrl)) {
        const message = '项目体积已超过 32MB 档案上限，这张图没有写入。请删除部分旧参考图或换小图。';
        failCurrentStageRun('scene', run, message);
        setError(message);
        return;
      }
      const job = sceneImageJob(sceneId);
      if (!job) {
        setError('场景缺少可写入的草稿。');
        return;
      }
      persistManualStageImage({ ...job, imageUrl }, '替换场景图草稿', run);
    };
    reader.onerror = () => {
      const message = '替换失败：图片读取失败。';
      failCurrentStageRun('scene', run, message);
      setError(message);
    };
    reader.readAsDataURL(file);
  }

  /**
   * 把画板上的母版编辑写成待审 patch。
   *
   * 走的是和角色设定同一条路：编辑落在草稿工作区，生成一条 scenes.json 的 patch，
   * 确认阶段时才合入。母版可能还没落盘（老工作区是按地点现场派生的），
   * 所以这里整份 sceneMasters 都要写出去，否则第一次编辑就会丢。
   */
  function persistSceneMasterChange(masterId: string, change: Partial<SceneMaster>, summary: string) {
    if (!workspace) return;
    const editBase = currentStageDraftWorkspace(workspace, 'scene');
    const run = beginManualStageRun('scene');
    if (!run) return;
    const nextMasters = sceneMastersFromWorkspace(editBase).map((master) =>
      master.id === masterId ? { ...master, ...change } : master
    );
    if (!nextMasters.some((master) => master.id === masterId)) return;
    // 场次的 sceneMasterId 一并落盘，否则下次读取又要重新派生，编辑会挂到新 id 上。
    const masterIdByScene = new Map(
      productionScenesFromWorkspace(editBase).map((scene) => [scene.id, scene.sceneMasterId])
    );

    setWorkspace((current) => {
      if (!current || !isCurrentStageRun('scene', run.generationJobId, run.token)) return current;
      const flow = productionFlowFromWorkspace(current);
      const record = flow.stages.scene;
      if (record.status !== 'generating' || record.generationJobId !== run.generationJobId) return current;
      const source = safeParseJson<{ scenes?: Array<Record<string, unknown>> }>(getFile(editBase, 'scenes.json')?.content || '', {});
      if (!Array.isArray(source.scenes)) return current;
      const after = JSON.stringify({
        ...source,
        sceneMasters: nextMasters,
        scenes: source.scenes.map((scene) => {
          const id = typeof scene.id === 'string' ? scene.id : '';
          return typeof scene.sceneMasterId === 'string' && scene.sceneMasterId
            ? scene
            : { ...scene, sceneMasterId: masterIdByScene.get(id) || '' };
        })
      }, null, 2);
      if (after === getFile(editBase, 'scenes.json')?.content) return current;
      const withPatch = appendPendingPatches(current, [{
        id: uid('patch'),
        filePath: 'scenes.json',
        summary,
        before: getFile(current, 'scenes.json')?.content || '',
        after,
        riskLevel: 'low',
        requiresApproval: true,
        origin: { kind: 'manual', productionStage: 'scene', generationJobId: run.generationJobId }
      }]);
      const next = writeProductionFlow(withPatch, markStageDraft(flow, {
        stage: 'scene', generationJobId: run.generationJobId, sourceVersions: record.sourceVersions
      }));
      if (!fitsWorkspacePersistence(next)) {
        setError('项目体积已超过 32MB 档案上限，这次修改没有写入。请删除部分旧参考图或换小图。');
        return current;
      }
      return next;
    });
  }

  function sceneMasterViewJob(masterId: string, viewId: SceneViewId): StageImageJob | null {
    const master = sceneMastersFromWorkspace(proposedWorkspace).find((item) => item.id === masterId);
    if (!master) return null;
    const prompt = buildSceneViewPrompt(master, viewId);
    if (!prompt) return null;
    // 全景之外的七个机位必须拿全景当参考，否则八张图会是八个不同的房间。
    const panorama = master.views.panorama;
    return {
      stage: 'scene',
      assetId: masterId,
      viewId,
      prompt,
      negativePrompt: '',
      ...(viewId !== 'panorama' && panorama ? { referenceImages: [panorama] } : {})
    };
  }

  async function regenerateSceneMasterView(masterId: string, viewId: SceneViewId) {
    const job = sceneMasterViewJob(masterId, viewId);
    if (!job) {
      setSceneDesignNotice('这个场景母版还没有可用的空间设定，先补齐结构和固定美术再生成参考图。');
      return;
    }
    const run = beginManualStageRun('scene');
    if (!run) return;
    setSceneDesignNotice('正在生成空间参考图…会按母版的结构、美术和锚点约束出图。');
    try {
      const imageUrl = await renderStageImage(job, run.controller.signal);
      if (!isCurrentStageRun('scene', run.generationJobId, run.token)) return;
      persistManualStageImage({ ...job, imageUrl }, '写入场景母版参考图草稿', run);
      setSceneDesignNotice('已生成空间参考图，确认场景阶段后才会应用到下游。');
    } catch (err) {
      if (run.controller.signal.aborted || !isCurrentStageRun('scene', run.generationJobId, run.token)) return;
      const message = characterImageErrorText(err instanceof Error ? err.message : '场景参考图生成失败');
      failCurrentStageRun('scene', run, message);
      setSceneDesignNotice(`生成失败：${message}`);
    }
  }

  function replaceSceneMasterViewFile(masterId: string, viewId: SceneViewId, file?: File) {
    if (!file || !file.type.startsWith('image/')) {
      setSceneDesignNotice('上传失败：请选择图片文件。');
      return;
    }
    if (file.size <= 0 || file.size > MAX_PERSISTED_IMAGE_BYTES) {
      setSceneDesignNotice(`上传失败：图片需大于 0 且不超过 ${MAX_PERSISTED_IMAGE_BYTES / 1024 / 1024}MB。`);
      return;
    }
    const run = beginManualStageRun('scene');
    if (!run) return;
    const reader = new FileReader();
    reader.onload = () => {
      const imageUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!imageUrl) {
        const message = '上传失败：图片读取失败。';
        failCurrentStageRun('scene', run, message);
        setSceneDesignNotice(message);
        return;
      }
      if (!isCurrentStageRun('scene', run.generationJobId, run.token)) return;
      if (!canPersistUploadedDataUrl(imageUrl)) {
        const message = '项目体积已超过 32MB 档案上限，这张图没有写入。请删除部分旧参考图或换小图。';
        failCurrentStageRun('scene', run, message);
        setSceneDesignNotice(message);
        return;
      }
      const job = sceneMasterViewJob(masterId, viewId);
      if (!job) {
        setSceneDesignNotice('这个场景母版还没有可写入的草稿。');
        return;
      }
      persistManualStageImage({ ...job, imageUrl }, '上传场景母版参考图草稿', run);
      setSceneDesignNotice('已上传空间参考图，尚未应用到下游。');
    };
    reader.onerror = () => {
      const message = '上传失败：图片读取失败。';
      failCurrentStageRun('scene', run, message);
      setSceneDesignNotice(message);
    };
    reader.readAsDataURL(file);
  }

  async function copyCharacterDesign(imageUrl: string) {
    if (!imageUrl) return;
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const ClipboardItemClass = (window as typeof window & { ClipboardItem?: typeof ClipboardItem }).ClipboardItem;
      if (navigator.clipboard.write && ClipboardItemClass) {
        await navigator.clipboard.write([new ClipboardItemClass({ [blob.type || 'image/png']: blob })]);
        setRoleDesignNotice('角色图已复制到剪贴板。');
        return;
      }
    } catch (_) {
      // Cross-origin images may block binary clipboard access; URL copy remains useful.
    }
    await navigator.clipboard.writeText(imageUrl);
    setRoleDesignNotice('角色图链接已复制。');
  }

  async function downloadCharacterDesign(imageUrl: string, fileName: string) {
    if (!imageUrl) return;
    try {
      const response = await fetch(imageUrl);
      if (!response.ok) throw new Error('download failed');
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = fileName;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
      setRoleDesignNotice('角色图已开始下载。');
    } catch (_) {
      window.open(imageUrl, '_blank', 'noopener,noreferrer');
      setRoleDesignNotice('角色图已在新窗口打开，可从浏览器保存。');
    }
  }

  function proposeCharacterReferencePatch(character: CharacterAssetCard, variant: CharacterReferenceVariant, imageUrl: string) {
    if (!imageUrl || variant.id === 'base') return;
    const summary = `写入「${character.name} · ${variant.label}」角色主图草稿`;
    persistManualStageImage({
      stage: 'character', assetId: character.id, variantId: variant.id, kind: 'portrait',
      prompt: '', negativePrompt: character.negativePrompt || '', imageUrl
    }, summary);
    setSelectedNodeId('node_character');
    setRoleDesignNotice(`已生成待审 Patch：${summary}。确认角色阶段后才会进入场景。`);
  }

  function proposeCharacterLibraryPatch(
    character: CharacterAssetCard,
    variant: CharacterReferenceVariant,
    imageUrl: string,
    outputKind: CharacterDesignOutputKind
  ) {
    if (!workspace || !imageUrl) return;
    const sourceWorkspace = proposedWorkspace || workspace;
    const before = getFile(sourceWorkspace, 'asset_library.json')?.content || JSON.stringify({ assets: [] }, null, 2);
    const current = safeParseJson<AssetLibraryFile>(before, { assets: [] });
    const duplicate = (current.assets || []).some((item) => item.imageUrl === imageUrl || item.summary.includes(imageUrl));
    if (duplicate) {
      setRoleDesignNotice('这张角色图已经在资产库中。');
      return;
    }
    const title = `${character.name} · ${variant.label}${outputKind === 'portrait' ? '角色主图' : outputKind === 'multi_view' ? '多视角设定' : '表情板'}`;
    const next: AssetLibraryFile = {
      assets: [
        ...(current.assets || []),
        {
          id: `lib_character_${Date.now()}`,
          type: 'character',
          title,
          sourceFile: 'characters.json',
          summary: `已生成角色资产：${imageUrl}`,
          scope: variant.id,
          createdAt: now(),
          imageUrl,
          characterId: character.id,
          stageId: variant.id,
          assetKind: outputKind
        }
      ]
    };
    const patch: PatchOperation = {
      id: uid('patch'),
      filePath: 'asset_library.json',
      summary: `将「${title}」加入资产库`,
      before,
      after: JSON.stringify(next, null, 2),
      riskLevel: 'low',
      requiresApproval: true
    };
    setWorkspace((current) => current ? appendPendingPatches(current, [patch]) : current);
    setSelectedPatchId(patch.id);
    setSelectedNodeId('node_character');
    setRoleDesignNotice(`已生成资产库待审 Patch：${title}。`);
  }

  /**
   * 挑本镜头该穿哪套造型。
   *
   * 造型里存着上装、下装、外套、鞋子、配饰，但这些字段只有传了 lookId 才会进提示词——
   * 之前这里一直没传，于是「鞋子：黑色乐福鞋」这类信息一次都没到过视频模型手上。
   * 模型不知道脚上是什么，就自己发挥：用户看到的是鞋头那里露出脚趾。
   *
   * 匹配依据是造型自己的 sceneUsage（「适用什么场景」），这本来就是这个字段的用途。
   * 匹配不上时退回第一套写完整的造型——给一套具体的衣服，永远好过一个字都不给。
   */
  function lookIdForShot(visual: CharacterVisualSpec, context: string, declaredId = '') {
    const usable = visual.wardrobe.filter((look) => look.top || look.bottom || look.shoes);
    if (!usable.length) return undefined;
    // 分镜连续性里写死的那套造型优先。文本匹配是它不在时的退路，不是并列的第二意见：
    // 靠 sceneUsage 猜出来的造型每一镜都可能猜出不同答案，而这正是「同一场戏里换了件衣服」的来源。
    // 但要先确认这个 id 真的存在——模型偶尔会写一个 wardrobe 里根本没有的 id，
    // 照单全收的结果是这一镜一个字的服装描述都没有，比猜错更糟。
    if (declaredId && usable.some((look) => look.id === declaredId)) return declaredId;
    if (context) {
      const matched = usable.find((look) => {
        const usage = look.sceneUsage.trim();
        return usage && (context.includes(usage) || usage.split(/[、，,；;]/).some((word) => word.trim().length > 1 && context.includes(word.trim())));
      });
      if (matched) return matched.id;
    }
    return usable[0].id;
  }

  function characterControlSummaryForPrompt(shotContext = '', wardrobeByCharacter?: Map<string, string>) {
    if (!visibleCharacterAssets.length) return '';
    const lines = visibleCharacterAssets.map((character) => {
      const strategy = selectedReferenceStrategyFor(character.id);
      const selectedExpressions = selectedExpressionOptionsFor(character.id);
      const expressionDetail = selectedExpressions.length
        ? selectedExpressions.map((option) => `${option.label}=${option.prompt}`).join('；')
        : `按剧情从表情池选择：${fullExpressionPalette}`;
      const adjustment = roleAdjustmentDrafts[character.id]?.trim();
      // 视觉设定画板里锁下来的身份锚点、发型、造型和出镜约束必须一起下发，
      // 否则用户在画板上填的东西只影响角色图，到了镜头提示词又全没了。
      const visualLines = characterVisualPromptLines(character.visual, {
        lookId: lookIdForShot(character.visual, shotContext, wardrobeByCharacter?.get(character.id) || '')
      }).map((line) => `  ${line}`);
      return [
        `- ${character.name}（${character.role}）：参考策略=${strategy.label}；${strategy.prompt}。`,
        `  表情控制：${expressionDetail}。`,
        adjustment ? `  用户补充调整：${adjustment}。` : '',
        `  一致性要求：${snippet(character.consistency, 2)}。`,
        ...visualLines
      ]
        .filter(Boolean)
        .join('\n');
    });
    return [
      '角色视频前调整：以下设置来自角色阶段用户确认，必须影响视频画面。',
      `全局表情池：${fullExpressionPalette}。表情要真人化、短剧化，禁止动画脸、二次元夸张表情和换脸。`,
      ...lines
    ].join('\n');
  }

  /** 二级画板的角色索引数据。缩略图优先用年龄阶段主图，没有就退回正脸参考位。 */
  const characterBoardEntries: CharacterBoardEntry[] = visibleCharacterAssets.map((character, characterIndex) => ({
    id: character.id,
    name: character.name,
    role: character.role,
    description: character.description,
    thumbnail:
      characterDesignRenderFor(character, activeCharacterVariantFor(character, characterIndex), 'portrait').imageUrl ||
      character.visual.identity.views.front,
    visual: character.visual
  }));
  // 角色被删掉或换了一批之后，画板要退回第一个角色，而不是空着。
  const activeBoardCharacterId = visibleCharacterAssets.some((character) => character.id === characterBoardId)
    ? characterBoardId
    : visibleCharacterAssets[0]?.id || '';
  const activeBoardCharacterIndex = visibleCharacterAssets.findIndex((character) => character.id === activeBoardCharacterId);
  const activeBoardCharacters = activeBoardCharacterIndex >= 0 ? [visibleCharacterAssets[activeBoardCharacterIndex]] : [];
  const canvasNodes: StudioCanvasNode[] = [
    {
      id: 'node_mission',
      stage: 'overview',
      label: '故事目标',
      title: brief.title,
      summary: brief.goal,
      status: missionPatchCount || missionNotice.state !== 'current' ? 'warning' : brief.isBlank ? 'draft' : 'ready',
      owner: `${OVERVIEW_OWNER.emoji} ${OVERVIEW_OWNER.name}`,
      filePath: 'brief.json',
      dependency: '来自用户目标、平台、受众和约束。',
      impact: '会影响剧本方向、角色选择、场景风格和发布文案。',
      review: '确认目标、受众、平台、语气和不能碰的红线。',
      action: '补齐当前 Mission 的目标、受众、平台、语气、禁用表达和 CTA，不要改动已有脚本正文。',
      patchCount: missionPatchCount,
      dependencyState: missionNotice.state,
      dependencyReason: missionNotice.reason,
      dependencySource: missionNotice.source
    },
    {
      id: 'node_script',
      stage: 'script',
      label: '剧本',
      title: scriptAsset?.title || '脚本正文',
      summary: scriptBody.trim() ? snippet(scriptBody, 3) : '等待生成脚本正文',
      status: scriptPatchCount || scriptNotice.state !== 'current' ? 'warning' : scriptBody.trim() ? 'ready' : 'draft',
      owner: stageOwnerLabel('script'),
      filePath: 'script.md',
      dependency: '依赖 Mission Brief 和平台规格。',
      impact: '会影响角色设定、场景拆分、分镜节奏和视频任务。',
      review: '确认开头钩子、冲突推进、台词密度、CTA 和平台合规。',
      action: '只重写 script.md，保留已确认的 Mission Brief；输出完整脚本正文并标注场景段落。',
      patchCount: scriptPatchCount,
      dependencyState: scriptNotice.state,
      dependencyReason: scriptNotice.reason,
      dependencySource: scriptNotice.source,
      assetId: scriptAsset?.id
    },
    {
      id: 'node_character',
      stage: 'character',
      label: '角色',
      title: visibleCharacterAssets[0]?.name || characterPackage?.primarySubject || '角色设定',
      summary: visibleCharacterAssets.length
        ? `${visibleCharacterAssets.length} 个角色可确认：${visibleCharacterAssets.map((item) => item.name).slice(0, 2).join('、')}`
        : characterPackage?.consistencyPrompt || '等待角色一致性设定',
      status: characterPatchCount || characterNotice.state !== 'current' ? 'warning' : hasCharacterPackage ? 'ready' : 'draft',
      owner: stageOwnerLabel('character'),
      filePath: 'asset_prompts.json',
      dependency: '依赖剧本中的人物、身份、动作和情绪。',
      impact: '会影响首帧、多图参考、角色一致性和每个镜头提示词。',
      review: '确认人物外观、服装、表情、音色占位、避免项和授权风险。',
      action: '只补齐角色一致性设定，包括主体描述、一致性提示词和避免项；如需素材库引用，单独写清楚。',
      patchCount: characterPatchCount,
      dependencyState: characterNotice.state,
      dependencyReason: characterNotice.reason,
      dependencySource: characterNotice.source,
      childCount: visibleCharacterAssets.length || undefined,
      assetId: promptAsset?.id
    },
    {
      id: 'node_scene',
      stage: 'scene',
      label: '场景',
      title: activeScene?.title || sceneAsset?.title || '场景资产',
      summary: activeScene?.visual || sceneAsset?.summary || '等待场景与画面设定',
      status: scenePatchCount || sceneNotice.state !== 'current' ? 'warning' : scenes.length ? 'ready' : 'draft',
      owner: stageOwnerLabel('scene'),
      filePath: 'scenes.json',
      dependency: '依赖剧本段落和角色行动。',
      impact: '会影响分镜构图、灯光、道具、地点一致性和镜头任务。',
      review: '确认每个场景的空间、时间、视觉证据和可生成性。',
      action: '只补齐 scenes.json，按剧本拆出场景标题、画面、字幕/旁白摘要和时长建议。',
      patchCount: scenePatchCount,
      dependencyState: sceneNotice.state,
      dependencyReason: sceneNotice.reason,
      dependencySource: sceneNotice.source,
      childCount: scenes.length,
      assetId: sceneAsset?.id,
      sceneId: activeScene?.id
    },
    {
      id: 'node_storyboard',
      stage: 'storyboard',
      label: '分镜',
      title: shotAsset?.title || '分镜故事板',
      summary: storyboard.length ? `${storyboard.length} 个镜头 · ${videoSpec.aspectRatio} · ${cameraMoveLabel(videoSpec.cameraMove)}` : '等待拆分镜头',
      status: storyboardPatchCount || storyboardNotice.state !== 'current' ? 'warning' : storyboard.length ? 'ready' : 'draft',
      owner: stageOwnerLabel('storyboard'),
      filePath: 'storyboard.json',
      dependency: '依赖场景、角色和视频规格。',
      impact: '会影响时间线、镜头 prompt、运镜和视频模型 render queue。',
      review: '确认镜头顺序、动作、构图、运镜和每镜头时长。',
      action: '只补齐 storyboard.json 和必要 timeline.json，按镜头写清画面、动作、字幕、运镜和时长。',
      patchCount: storyboardPatchCount,
      dependencyState: storyboardNotice.state,
      dependencyReason: storyboardNotice.reason,
      dependencySource: storyboardNotice.source,
      childCount: storyboard.length,
      assetId: shotAsset?.id || timelineAsset?.id,
      sceneId: activeScene?.id
    },
    {
      id: 'node_video',
      stage: 'video',
      label: '视频',
      title: handoffReady ? '视频任务就绪' : '视频生成准备',
      summary: renderTaskCount ? `${renderTaskCount} 个镜头任务 · ${videoSpec.resolution} · ${frameLockLabel(videoSpec.frameLock)}` : '等待素材提示词和渲染参数',
      status: videoNotice.state !== 'current' ? 'warning' : handoffReady ? 'ready' : videoPatchCount || promptAsset ? 'warning' : 'draft',
      owner: stageOwnerLabel('video'),
      filePath: 'asset_prompts.json',
      dependency: '依赖已确认的脚本、角色、场景和分镜。',
      impact: '会影响最终提交给视频模型的镜头任务和渲染参数。',
      review: '确认镜头级 prompt、首帧/多图策略、避免项和生成规格。',
      action: '只整理 asset_prompts.json，输出镜头级视频任务、角色一致性、避免项、首帧策略和 renderQueue；不要声称已生成 MP4。',
      patchCount: videoPatchCount,
      dependencyState: videoNotice.state,
      dependencyReason: videoNotice.reason,
      dependencySource: videoNotice.source,
      childCount: renderTaskCount,
      assetId: promptAsset?.id
    }
  ];
  const productionFlow = productionFlowFromWorkspace(workspace);
  const activeProductionStage: ProductionStageId = activeTab === 'overview' ? productionFlow.currentStage : activeTab;
  const productionReviewHeading: Record<ProductionStageId, string> = {
    script: '脚本审查',
    character: '角色审查',
    scene: '场景审查',
    storyboard: '分镜审查',
    video: '视频任务审查'
  };
  const nextGeneratingStage = productionFlow.stages[productionFlow.currentStage].status === 'generating'
    ? productionFlow.currentStage
    : null;
  const activeStageReviewablePatches = pendingPatches.filter(
    (patch) => productionStageForFile(patch.filePath) === activeProductionStage
  );
  const activeStageHasQuarantinedDraft = activeStageReviewablePatches.length === 0 && patchReviewState.quarantined.some(
    (patch) => productionStageForFile(patch.filePath) === activeProductionStage
  );
  /**
   * 隔离原因照实说。写死一句「检测到占位内容」会在最常见的那种隔离上撒谎——
   * 那条路径压根没检查内容，只查了来源戳，而用户手里往往是一份完整的真实产出。
   */
  const activeStageQuarantineReason = (() => {
    const notes = patchReviewState.quarantineNotes.filter((note) => note.stage === activeProductionStage);
    if (!notes.length) return '这份历史草稿没有通过来源校验，';
    const reasons = Array.from(new Set(notes.map((note) => note.reason))).join('；');
    const files = Array.from(new Set(notes.map((note) => note.filePath))).join('、');
    return `${reasons}（${files}），`;
  })();
  const activeProductionRecord = productionFlow.stages[activeProductionStage];
  const activeStageFailed = activeProductionRecord.status === 'failed';
  const stageReviewSuppressed = nextGeneratingStage === activeProductionStage || activeStageFailed;
  /**
   * 右栏这一列到底占不占位：生成中/失败时本来就没有可审查的内容（stageReviewSuppressed），
   * 再叠加用户手动收起。两者合并成一个状态，免得布局和渲染各判各的、对不上。
   */
  const inspectorCollapsed = stageReviewSuppressed || inspectorHidden;
  const workbenchClassName = `studio-workbench${assistantHidden ? ' assistant-hidden' : ''}${inspectorCollapsed ? ' inspector-suppressed' : ''}`;
  /**
   * 画布上每个阶段展开成一条泳道，泳道里是这一阶段真实产出的每一件产物
   * （每个角色、每个场景、每个镜头），而不是一张概括整阶段的抽象卡。
   */
  /**
   * 角色 id → 头像和姓名。场次和镜头里只存 id，卡片上要给脸。
   * 查不到的 id 原样显示：显示 lead_01 至少能看出是引用错了，静默丢掉只会让人以为这场没人。
   */
  const castLookup = new Map(characterBoardEntries.map((entry) => [entry.id, entry]));
  const castFor = (ids?: string[]): StoryCanvasPerson[] =>
    (ids || []).map((id) => {
      const entry = castLookup.get(id);
      return { id, name: entry?.name || id, avatar: entry?.thumbnail || '' };
    });

  /**
   * 一张镜头卡。挂在场次卡下面，但它属于分镜阶段——stage 带上去，
   * 否则点开镜头会进场景的审查面板。
   */
  function shotCard(shot: PreviewScene, shotIndex: number, scene?: (typeof scenes)[number]): StoryCanvasCard {
    // 镜头自己的首帧优先。没有就退回场次主图，并且必须标明是继承来的：
    // 那张图一场共用一张，取景不一定对得上这一镜的景别，冒充成「这一镜的首帧」是在骗审查的人。
    const ownFrame = shot.shotImageUrl || '';
    const inherited = !ownFrame && scene?.referenceImageUrl ? scene.referenceImageUrl : '';
    // 镜头没标角色时退回这一场的出场角色：一个人都不显示，比显示一个近似值更容易被读成「这镜没人」。
    const castIds = shot.characterIds?.length ? shot.characterIds : scene?.characterIds || [];
    return {
      id: `card_shot_${shot.id}`,
      stage: 'storyboard',
      kicker: `镜头 ${String(shotIndex + 1).padStart(2, '0')}`,
      // 父节点已经写了场次名，标题里再重复一遍「场次名 - 」只会挤掉镜头本身在讲什么。
      title: stripScenePrefix(shot.title, scene?.title || ''),
      body: shot.visual || shot.subtitle,
      meta: `${shot.durationSeconds}s · ${cameraMoveLabel(videoSpec.cameraMove)}`,
      images: ownFrame || inherited ? [ownFrame || inherited] : [],
      emptyImageHint: '首帧待生成',
      imageNote: inherited ? '沿用场景图' : '',
      cast: castFor(castIds),
      // 关系写成数据，画布才不用去猜：这一镜依赖哪些角色卡、它的图是不是从场次那儿借来的。
      dependsOn: castIds.map((id) => `card_character_${id}`),
      inheritsFrom: inherited && scene ? `card_scene_${scene.id}` : undefined
    };
  }

  function storyCardsForStage(stage: ProductionStageId): StoryCanvasCard[] {
    const source = canvasNodes.find((node) => node.stage === stage);
    const record = productionFlow.stages[stage];
    if (stage === 'script') {
      if (!scriptBody.trim()) return [];
      return [{
        id: 'card_script',
        kicker: '剧本',
        title: scriptAsset?.title || '脚本正文',
        body: snippet(scriptBody, 14),
        meta: `${scriptLineCount} 行 · ${scenes.length || storyboard.length || 0} 场`
      }];
    }
    if (stage === 'character') {
      // 一级卡只回答「这个人是谁、审到哪一步」：一句话定位、2–3 个标签、缩略图、
      // 完成度和状态。完整的视觉设定在点开后的画板里，不往这张小卡片上堆。
      return visibleCharacterAssets.map((character, characterIndex) => {
        const variant = activeCharacterVariantFor(character, characterIndex);
        const review = characterReviewState(character.visual);
        return {
          id: `card_character_${character.id}`,
          kicker: character.role || '角色',
          title: character.name,
          body: character.visual.tagline || snippet(character.description || character.consistency, 2),
          tags: character.visual.tags.slice(0, 3),
          portrait: characterDesignRenderFor(character, variant, 'portrait').imageUrl
            || character.visual.identity.views.front,
          emptyImageHint: '主视觉待生成',
          meta: variant.ageLabel ? `${variant.label} · ${variant.ageLabel}` : variant.label,
          statusLabel: review.label,
          statusTone: review.status,
          progressPercent: review.completeness.percent,
          progressLabel: `设定完成度 ${review.completeness.percent}%`,
          // 「已确认」的角色再显示「审查」是在骗人：它已经审完了。
          ctaLabel: review.actionLabel
        };
      });
    }
    if (stage === 'scene') {
      // 镜头是场次拆出来的，storyboard.json 里一路带着 sourceSceneId，合并时也按场次排过序。
      // 这层父子关系直接长成树：场次是父节点，它的镜头挂在下面，不再分成两条互不相认的泳道。
      const shotIndexById = new Map(storyboard.map((shot, index) => [shot.id, index]));
      return scenes.map((scene) => {
        const shots = storyboard.filter((shot) => shot.sourceSceneId === scene.id);
        const shotSeconds = shots.reduce((total, shot) => total + shot.durationSeconds, 0);
        return {
          id: `card_scene_${scene.id}`,
          kicker: '场景',
          title: scene.title,
          body: scene.visual || scene.subtitle,
          images: scene.referenceImageUrl ? [scene.referenceImageUrl] : [],
          emptyImageHint: '场景图待生成',
          meta: [scene.location, scene.timeOfDay].filter(Boolean).join(' · '),
          // 一场戏先被读到的是「谁在里面演」，不是地点和光线。
          cast: castFor(scene.characterIds),
          dependsOn: (scene.characterIds || []).map((id) => `card_character_${id}`),
          children: shots.map((shot) => shotCard(shot, shotIndexById.get(shot.id) ?? 0, scene)),
          childrenLabel: shots.length ? `${shots.length} 个镜头 · ${Math.round(shotSeconds)}s` : '还没有镜头'
        };
      });
    }
    if (stage === 'storyboard') {
      // 镜头已经挂在场景卡下面了。这里再摆一遍二十张一模一样的卡，只会让人以为是两批东西。
      return [];
    }
    const videoPrompts = normalizedVideoPrompts(assetPrompts);
    if (videoPrompts.length) {
      // 渲染任务渲的是哪一镜，storyboard.json 里就有；对不上的不硬连，宁可少一条边。
      const shotIds = new Set(storyboard.map((shot) => shot.id));
      return videoPrompts.map((prompt, promptIndex) => {
        const job = (productionFlow.videoJobs as VideoRenderJob[]).find((item) => item.promptId === prompt.id);
        const references = referenceImagesForPrompt(prompt);
        return {
          id: `card_video_${prompt.id || promptIndex}`,
          kicker: `任务 ${String(promptIndex + 1).padStart(2, '0')}`,
          title: prompt.renderTask || prompt.sceneId || `镜头任务 ${promptIndex + 1}`,
          body: prompt.prompt || '',
          images: references.length ? references : undefined,
          meta: `${videoSpec.resolution} · ${videoJobStatusLabel(job)}`,
          renderOf: prompt.sceneId && shotIds.has(prompt.sceneId) ? `card_shot_${prompt.sceneId}` : undefined
        };
      });
    }
    return source && record.status !== 'locked'
      ? [{ id: source.id, kicker: studioStageName(stage), title: source.title, body: source.summary }]
      : [];
  }

  /**
   * 「待确认」的意思是有草稿在等审查，所以它配上一张空泳道时，一定有别的原因——
   * 文件没落盘、JSON 解析不了、或者结构对但列表是空的。这三种以前显示同一句
   * 「还没有产物，可以先生成一版」，用户只能去点重新生成，而后两种重新生成大概率复现。
   *
   * validateStageAssets 本来就能分辨这三种，只是以前只在点确认的那一刻才跑。
   * 这里把它提前到渲染时跑一次：纯读取，不改状态机，所以不会影响任何流转。
   */
  function emptyHintForStage(stage: ProductionStageId, record: ProductionStageRecord, ownerName: string) {
    if (record.error) return record.error;
    if (record.status === 'ready_for_review' && proposedWorkspace) {
      const issues = validateStageAssets(stage, proposedWorkspace);
      if (issues.length) return `${studioStageName(stage)}标记为待确认，但产物不可用：${issues.join('；')}`;
    }
    return `${studioStageName(stage)}还没有产物，可以让${ownerName}先生成一版。`;
  }

  const storyLanes: StoryCanvasLane[] = visibleProductionStages(productionFlow).filter(
    (stage) => stage !== nextGeneratingStage && !(activeStageFailed && stage === activeProductionStage)
  ).map((stage) => {
    const owner = stageOwner(stage);
    const record = productionFlow.stages[stage];
    return {
      stage,
      emoji: owner.emoji,
      owner: owner.name,
      status: record.status,
      cards: storyCardsForStage(stage),
      emptyHint: emptyHintForStage(stage, record, owner.name),
      // 分镜的产物挂在场景卡下面了。这条泳道保留是因为它自己的状态、重新生成和替换还在这儿，
      // 但不能显示「还没有可审查的产物」——那是假的，二十个镜头就在上面。
      note:
        stage === 'storyboard' && storyboard.length
          ? `${storyboard.length} 个镜头挂在上方 ${scenes.length} 个场景下，点场景卡上的展开条查看。`
          : undefined
    };
  });
  /**
   * 流水线的终点：那条要合出来的成片。
   *
   * 它一直挂在画布最右边，视频阶段没解锁时也在。终点只在最后才出现的话，
   * 用户在前面四个阶段里看到的就是一条不知道通向哪儿的流水线——
   * 而「这些镜头最后要合成一条片子」恰恰是整个画布唯一的目的。
   */
  const storyOutcome: StoryCanvasOutcome = (() => {
    const finalCut = productionFlow.finalCut;
    const jobs = productionFlow.videoJobs as VideoRenderJob[];
    const doneJobs = jobs.filter((job) => job.status === 'completed').length;
    const base = { title: '合并视频', ctaLabel: '下载成片' };

    if (finalCut?.status === 'completed' && finalCut.fileUrl) {
      const minutes = finalCut.durationSeconds ? `${Math.round(finalCut.durationSeconds)}s` : '';
      return {
        ...base,
        body: finalCut.note || '所有片段已合成为一条成片。',
        meta: [finalCut.fileName, minutes].filter(Boolean).join(' · '),
        statusLabel: '已完成',
        statusTone: 'done',
        fileUrl: finalCut.fileUrl
      };
    }
    if (finalCut?.status === 'failed') {
      return {
        ...base,
        body: finalCut.error || '合成失败，片段本身还在，可以重试。',
        statusLabel: '合成失败',
        statusTone: 'danger'
      };
    }
    if (isFinalCutInFlight(finalCut)) {
      return {
        ...base,
        body: finalCutStatusLabel(finalCut),
        statusLabel: '合成中',
        statusTone: 'warning',
        progressPercent: finalCut?.progress
      };
    }
    if (jobs.length && doneJobs === jobs.length) {
      return { ...base, body: `${jobs.length} 个片段都渲染完了，可以合成成片。`, statusLabel: '待合成', statusTone: 'ready' };
    }
    if (jobs.length) {
      return {
        ...base,
        body: `${doneJobs}/${jobs.length} 个片段已渲染完成。`,
        statusLabel: '等片段',
        statusTone: 'warning',
        progressPercent: Math.round((doneJobs / jobs.length) * 100)
      };
    }
    // 还没有渲染任务：说清楚在等什么，而不是显示一个空的终点。
    return {
      ...base,
      body: storyboard.length
        ? `等 ${storyboard.length} 个镜头确认后进入视频渲染，再合成成片。`
        : '等分镜拆好之后，这里会合成整片。',
      statusLabel: '未开始',
      statusTone: ''
    };
  })();

  const productionStageLockReason = (stage: ProductionStageId) => {
    const index = ['script', 'character', 'scene', 'storyboard', 'video'].indexOf(stage);
    const predecessor = index > 0 ? ['script', 'character', 'scene', 'storyboard', 'video'][index - 1] : null;
    return predecessor ? `未解锁：请先确认${studioStageName(predecessor as ProductionStageId)}` : '未解锁：等待脚本生成';
  };
  const selectedNode = canvasNodes.find((node) => node.id === selectedNodeId) || canvasNodes.find((node) => node.stage === activeTab) || canvasNodes[0];
  const selectedProductionStage: ProductionStageId = selectedNode?.stage === 'overview' ? 'script' : selectedNode?.stage || 'script';
  const selectedProductionRecord = productionFlow.stages[selectedProductionStage];
  const selectedDecision = selectedNode ? decisionCardForNode(selectedNode) : null;
  const selectedNodePatches = selectedNode ? pendingPatches.filter((patch) => patchTouchesNode(patch, selectedNode)) : [];
  const genericSelectedNodePatches = selectedNodePatches.filter((patch) => productionStageForFile(patch.filePath) !== 'video');
  const selectedNodePatchIds = genericSelectedNodePatches.map((patch) => patch.id);
  const committedAssetLibrary = parseJsonFile<AssetLibraryFile>(workspace, 'asset_library.json', { assets: [] });
  const proposedAssetLibrary = parseJsonFile<AssetLibraryFile>(proposedWorkspace, 'asset_library.json', { assets: [] });
  const libraryItems = committedAssetLibrary.assets || [];
  const proposedLibraryItems = proposedAssetLibrary.assets || [];
  const libraryKeys = new Set(libraryItems.map(libraryItemKey));
  const pendingLibraryItems = proposedLibraryItems.filter((item) => !libraryKeys.has(libraryItemKey(item)));
  const stableLibraryCandidates = canvasNodes.filter((node) => isNodeStableForLibrary(node, workspace));
  const selectedNodeLibraryKey = selectedNode ? libraryKeyFor(selectedNode) : '';
  const selectedNodeInLibrary = Boolean(selectedNode && libraryKeys.has(selectedNodeLibraryKey));
  const selectedNodePendingLibrary = Boolean(
    selectedNode && pendingLibraryItems.some((item) => libraryItemKey(item) === selectedNodeLibraryKey)
  );
  const selectedNodeCanEnterLibrary = Boolean(
    selectedNode && isNodeStableForLibrary(selectedNode, workspace) && !selectedNodeInLibrary && !selectedNodePendingLibrary
  );

  /** 没有场景图时退回角色的 Face ID 锚点主图，保证首帧至少锁得住人物。 */
  function characterAnchorPortrait(): string {
    for (const character of charactersFromWorkspace(proposedWorkspace)) {
      const variants = character.variants || [];
      const anchor = variants.find((variant) => variant.id === character.faceAnchorVariantId) || variants[0];
      if (anchor?.primaryImageUrl) return anchor.primaryImageUrl;
    }
    return '';
  }

  function normalizedVideoPrompts(data: AssetPrompts): VideoPromptEntry[] {
    // 首帧参考图来自已确认的场景主图：模型不写这个字段，也不该编造图片地址。
    // 不在这里按 sceneId 回填，图生视频模式下每个镜头都会卡在「缺少参考图，不能提交」，
    // 而场景图其实早就生成好了，只是没人把它接过来。
    const sceneImageById = new Map(
      scenes
        .filter((scene) => scene.id && scene.referenceImageUrl)
        .map((scene) => [scene.id, scene.referenceImageUrl])
    );
    // 镜头自己的首帧优先于场次主图。一场拆成多个景别不同的镜头时，共用那张场次图
    // 只有一个取景，却要同时当特写和全景的首帧——而图生视频里首帧的构图权重
    // 远高于提示词，「这一镜是特写」那句话会被首帧按回去。
    const shotImageById = new Map(
      safeParseJson<{ scenes?: Array<Record<string, unknown>> }>(
        getFile(proposedWorkspace, 'storyboard.json')?.content,
        {}
      ).scenes?.flatMap((shot) => {
        const id = textField(shot.id);
        const url = textField(shot.shotImageUrl);
        return id && url ? [[id, url] as const] : [];
      }) || []
    );
    const anchorPortrait = characterAnchorPortrait();

    return (data.prompts || [])
      .map((prompt, index) => ({
        ...prompt,
        id: textField(prompt.id) || `video-prompt-${index + 1}`,
        prompt: textField(prompt.prompt)
      }))
      .filter((prompt) => prompt.type === 'video' && Boolean(prompt.prompt))
      .map((prompt) => {
        // 镜头首帧要盖掉已有的构图引用：任务包里那个 referenceImageUrl 通常就是共用的场次图，
        // 按「已经有参考图了」跳过，等于这个功能生成出来的图永远用不上。
        const shotImage = shotImageById.get(prompt.sceneId || prompt.id || '');
        if (shotImage) return withShotFirstFrame(prompt, shotImage);
        if (referenceImagesForPrompt(prompt).length) return prompt;
        // sourceSceneId 优先：一个场景拆成多个镜头之后，sceneId 指的是镜头，
        // 拿它查场景图会全部落空，每个镜头都退化成只用角色头像，画面明显变差。
        // 回落到 sceneId 是为了老工作区——它们的镜头 id 就等于场景 id。
        const fallback = sceneImageById.get(prompt.sourceSceneId || prompt.sceneId || '') || anchorPortrait;
        return fallback ? { ...prompt, referenceImageUrl: fallback } : prompt;
      });
  }

  /**
   * 这里以前用的是 clampVideoDuration，上限 15 秒——也就是整套物理时长上限在首渲时完全没生效，
   * 只有质检重渲才会走到被 clampShotDuration 砍过的 job.durationSeconds。
   * 结果是：分镜被要求写 5 秒，渲染实际按 15 秒发，崩坏率天然偏高，而首渲恰恰是最该守住的一次。
   */
  function targetDurationSeconds(prompt?: VideoPromptEntry, mode: PhysicsMode = 'realistic') {
    return clampShotDuration(numberFromValue(prompt?.durationSeconds), mode);
  }

  function specForTargetDuration(seconds: number, data: AssetPrompts) {
    const baseSpec = data.renderSpec || {};
    const frameRate = numberFromValue(baseSpec.frameRate || baseSpec.frame_rate) || videoSpec.fps;
    const existingFrames = numberFromValue(baseSpec.numFrames || baseSpec.num_frames || videoSpec.numFrames);
    const timing = timingForTargetDuration(seconds, frameRate, existingFrames);
    return {
      ...baseSpec,
      numFrames: timing.numFrames,
      frameRate: timing.frameRate,
      targetDurationSeconds: seconds
    };
  }

  /**
   * 从镜头自己的身份锚点图反查本镜头到底谁出场，只注入这几个人的一致性描述。
   * 之前所有镜头共用 characterConsistency 里那一份全局描述——那份描述其实只刻画了主角，
   * 于是「小澎和新人初次对视」这种镜头也在要求男角色「鹅蛋脸、黑色长发、纤细匀称」，
   * 而每个角色自己写好的 consistencyPrompt 一次都没被用上。
   */
  function shotCharacterConsistency(identityUrls: string[]) {
    if (!identityUrls.length) return { positive: '', negative: '' };
    const byImage = new Map<string, CharacterAsset>();
    for (const character of charactersFromWorkspace(proposedWorkspace)) {
      for (const variant of character.variants || []) {
        if (variant.primaryImageUrl) byImage.set(variant.primaryImageUrl, character);
        if (variant.multiViewImageUrl) byImage.set(variant.multiViewImageUrl, character);
      }
    }
    const cast = identityUrls.map((url) => byImage.get(url)).filter(Boolean) as CharacterAsset[];
    const seen = new Set<string>();
    const positive: string[] = [];
    const negative: string[] = [];
    for (const character of cast) {
      if (seen.has(character.id)) continue;
      seen.add(character.id);
      const consistency = textField(character.consistencyPrompt);
      if (consistency) positive.push(`- ${character.name}（${character.role || '出场角色'}）：${consistency}`);
      const avoid = textField(character.negativePrompt);
      if (avoid) negative.push(avoid);
    }
    return { positive: positive.join('\n'), negative: uniqueTexts(negative).join('，') };
  }

  /**
   * 本镜头要说的中文台词，取自已确认 storyboard.json 的 narration。
   * 不传这一句，模型就只能凭画面即兴配音——实测会先说一段英文再转中文。
   */
  function shotNarration(sceneId: string) {
    const shot = storyboardShot(sceneId);
    // 这条路径不走 parseDialogueLines，所以清洗要在这里做一次，
    // 否则 storyboard 里的括注和破折号会原样进到渲染请求里。
    return sanitizeDialogueText(textField(shot?.narration) || textField(shot?.scriptSegment));
  }

  /** 已确认 storyboard.json 里这一镜的原始记录。台词和机位都从它身上取。 */
  function storyboardShot(sceneId: string): Record<string, unknown> | undefined {
    if (!sceneId) return undefined;
    const storyboard = safeParseJson<{ scenes?: Array<Record<string, unknown>> }>(
      getFile(proposedWorkspace, 'storyboard.json')?.content,
      {}
    );
    return (storyboard.scenes || []).find((scene) => textField(scene.id) === sceneId);
  }

  /**
   * 这一镜的机位与取景。
   *
   * 分镜阶段一直在产出 shotSize、cameraMove、composition、depthOfField 这些字段，
   * 但它们从来没进过视频请求——模型每一镜都在自己决定景别和人物占比，
   * 「这个角度看场景和人物不可能这么呈现」就是这么来的。
   * 借 normalizeSceneShot 把分镜记录归一化成镜头状态，再复用场景画板那套措辞，
   * 图片和视频两条链路说的就是同一套话。
   */
  function shotFramingLines(sceneId: string) {
    const shot = storyboardShot(sceneId);
    return shot ? sceneShotPromptLines(normalizeSceneShot(shot, 0)) : [];
  }

  /**
   * 这一镜每个角色该穿哪套造型，取自分镜阶段贯通下来的 continuity。
   *
   * 这是整条连续性链的收口：前面把 wardrobeId 一路传到分镜产物里，
   * 如果视频提示词不读它，那些字段就只是躺在 JSON 里的装饰，成片照样换装。
   */
  function shotWardrobeIds(sceneId: string): Map<string, string> {
    const continuity = normalizeShotContinuity(storyboardShot(sceneId)?.continuity);
    return new Map(
      continuity.cast
        .filter((entry) => entry.characterId && entry.wardrobeId)
        .map((entry) => [entry.characterId, entry.wardrobeId])
    );
  }

  /**
   * 上一镜收尾时的画面，写进这一镜的提示词。
   *
   * 这一句是「动作不衔接」最便宜的一层解药：模型看不到上一段视频，
   * 但它能读懂「上一镜结束时她坐在沙发左侧、右手握着杯子」，
   * 于是这一镜的首帧至少不会从一个完全无关的姿势开始。
   * 真正的首尾帧续接要等渲染调度层把上一段的尾帧图接进来，那是另一件事。
   */
  function shotContinuityLines(sceneId: string): string[] {
    const continuity = normalizeShotContinuity(storyboardShot(sceneId)?.continuity);
    const cast = continuity.cast
      .filter((entry) => !entry.exited && (entry.screenPosition || entry.eyeline || entry.movementDirection))
      .map((entry) => `  - ${entry.characterId}：${[
        entry.screenPosition && `位于${entry.screenPosition}`,
        entry.eyeline && `视线${entry.eyeline}`,
        entry.facing && `身体${entry.facing}`,
        entry.movementDirection && `运动方向${entry.movementDirection}`
      ].filter(Boolean).join('，')}。`);

    return [
      continuity.previousEndFrame
        ? `上一镜结束时的画面：${continuity.previousEndFrame}。本镜头必须从这个状态接着演，人物的位置、朝向和手上的东西都不能凭空变。`
        : '',
      cast.length ? `本镜头的人物走位与视线：\n${cast.join('\n')}` : ''
    ].filter(Boolean);
  }

  function buildVideoRenderPrompt(fallbackPrompt: VideoPromptEntry, seconds: number, data: AssetPrompts) {
    const duration = numberFromValue(fallbackPrompt.durationSeconds);
    const taskLine = `${fallbackPrompt.renderTask || '当前镜头'} ${duration ? `(${duration}s)` : ''}：${fallbackPrompt.prompt}`;
    const { identities } = partitionReferenceImages(fallbackPrompt);
    const shotCast = shotCharacterConsistency(identities);
    const sceneId = textField(fallbackPrompt.sceneId);
    const narration = shotNarration(sceneId);
    const framing = shotFramingLines(sceneId);
    // 每个镜头都自称「第一个小节」的话，模型拿到的叙事位置全是错的。
    const allPrompts = normalizedVideoPrompts(data);
    const episode = episodePlan(videoSpec.episodeSeconds);
    const segmentTotal = allPrompts.length || episode.segmentCount;
    const segmentIndex = Math.max(0, allPrompts.findIndex((item) => item.id === fallbackPrompt.id)) + 1;
    return [
      `请生成整条视频中的一个中文小节，目标时长约 ${seconds}s。`,
      `这是 ${episodeLengthLabel(episode.totalSeconds)}成片的第 ${segmentIndex} 个小节，全片共 ${segmentTotal} 个小节，最后拼接成片。`,
      `本次只提交一个镜头任务；不要把 ${segmentTotal} 个小节混在一次视频生成请求里。`,
      '必须把下面的镜头任务组织成这一小节内的连续叙事，不要试图一次生成整条长视频。',
      '画面里不得出现任何文字：不要字幕、不要标题卡、不要弹幕、不要水印，招牌菜单包装书本一律做成无字或虚化。字幕和标题全部由后期添加，不归视频模型负责。',
      '禁止英文、拼音、拉丁字母、乱码、可读招牌、屏幕文字、书本文字和包装文字。',
      // 音频是独立通道，不写死语言模型就会自己即兴——实测会先冒出一段英文再转中文。
      '音频要求：所有人声一律使用中文普通话，包含对白、旁白、自语和背景人声。禁止英文、外语、中英夹杂和英文歌词，开头结尾也不允许出现任何英文语音。',
      // 只说「要讲中文」不给词，模型照样自己编；把已确认的口播原文交给它才是真正的兜底。
      // 但要洗过再给：括注、破折号、省略号、书名号原样递进去，模型要么念出来，
      // 要么画到画面上——「字幕中间出现奇奇怪怪的符号」就是这么来的。
      narration
        ? `本小节的中文台词，用普通话完整念出，一字不改，不要增删、不要翻译、不要复述成英文，也不要把它显示成画面文字：\n{${narration}}\n大括号只是台词标记，它本身不许出现在画面上。`
        : '本小节没有台词：只保留环境音和情绪音乐，不要让任何人物开口说话，也不要加旁白。',
      // 镜头级角色描述优先：它对应的是本镜头真正出场的人。拿不到时才退回全局那一份。
      shotCast.positive
        ? `本镜头出场角色，必须严格贴合各自的形象设定：\n${shotCast.positive}`
        : data.characterConsistency?.consistencyPrompt
          ? `人物一致性：${data.characterConsistency.consistencyPrompt}`
          : '',
      // 造型优先用分镜连续性里定死的 wardrobeId，匹配不上才退回按 sceneUsage 猜。
      characterControlSummaryForPrompt(
        [fallbackPrompt.renderTask, fallbackPrompt.prompt, textField(storyboardShot(sceneId)?.title)].filter(Boolean).join(' '),
        shotWardrobeIds(sceneId)
      ),
      // 机位和取景排在镜头任务前面：它约束的是「怎么拍」，镜头任务写的是「拍什么」。
      // 顺序反过来模型会先把画面想好，再把景别当成一个可以商量的修饰词。
      framing.length
        ? `本镜头的机位与取景（必须严格执行，这是首帧构图的依据）：\n${framing.join('\n')}`
        : '',
      // 承接上一镜：模型看不到上一段视频，但它读得懂上一镜结束时人在哪、朝哪。
      ...shotContinuityLines(sceneId),
      `避免项：${chineseOnlyVideoNegativePrompt(
        shotCast.negative || textField(data.characterConsistency?.negativePrompt) || '不要脸部不一致'
      )}。`,
      `镜头任务：\n${taskLine}`
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  function clearVideoPollTimer() {
    if (videoPollTimerRef.current) {
      window.clearTimeout(videoPollTimerRef.current);
      videoPollTimerRef.current = null;
    }
  }

  function updateVideoJobsForBatch(batchToken: number, id: string, patch: Partial<VideoRenderJob>) {
    setWorkspace((current) => {
      if (!current || batchToken !== videoBatchRunRef.current) return current;
      return updateProductionFlow(current, (flow) => {
        const nextJobs = updateVideoRenderJob(flow.videoJobs as VideoRenderJob[], id, patch);
        if (nextJobs === flow.videoJobs) return flow;
        const batch = videoBatchStatus(nextJobs);
        return {
          ...flow,
          currentStage: 'video',
          stages: {
            ...flow.stages,
            video: {
              ...flow.stages.video,
              // 「渲染中」和「质检中」对用户是两件事：后者卡住时不说清楚，用户会以为系统死了。
              status: videoStageStatus(nextJobs),
              error: batch === 'clips_ready' ? '全部片段已完成，等待合成为单一成片文件。' : null
            }
          },
          videoJobs: nextJobs
        };
      });
    });
    // 链的推进挂在这一个收口点上，而不是分散到质检、轮询、提交失败三处：
    // 分散挂的话总有一条路会忘记推进，那一场戏剩下的镜头就永远停在 ready，
    // 界面上表现为「卡住不动」，用户完全看不出发生了什么。
    if (patch.status && CHAIN_TERMINAL_STATUSES.has(patch.status)) {
      void advanceShotChain(batchToken, id, patch);
    }
  }

  function scheduleVideoBatchPoll(batchToken: number, attempt: number) {
    if (batchToken !== videoBatchRunRef.current || attempt > VIDEO_POLL_MAX_ATTEMPTS) {
      videoPollLoopRef.current = 0;
      return;
    }
    clearVideoPollTimer();
    videoPollLoopRef.current = batchToken;
    videoPollTimerRef.current = window.setTimeout(() => void pollVideoRenderBatch(batchToken, attempt), VIDEO_POLL_INTERVAL_MS);
  }

  /**
   * 一批 12 个镜头、提交并发只有 2，如果等整批提交完才开轮询，最早提交出去的镜头
   * 会在「生成中 0%」上冻十几分钟——它其实早就在渲染了，只是没人去查。
   * 所以每有一个镜头拿到任务 ID 就把轮询循环拉起来，后续提交复用同一个循环。
   */
  function startVideoBatchPollingIfIdle(batchToken: number) {
    if (batchToken !== videoBatchRunRef.current) return;
    if (videoPollLoopRef.current === batchToken) return;
    scheduleVideoBatchPoll(batchToken, 1);
  }

  async function pollVideoRenderBatch(batchToken: number, attempt = 1) {
    if (batchToken !== videoBatchRunRef.current) {
      videoPollLoopRef.current = 0;
      return;
    }
    clearVideoPollTimer();
    const flow = productionFlowFromWorkspace(workspaceRef.current);
    const pollingJobs = (flow.videoJobs as VideoRenderJob[]).filter(
      (job) => (job.status === 'submitted' || job.status === 'polling') && Boolean(job.providerTaskId)
    );
    if (!pollingJobs.length) {
      // 提交还没跑完时轮询可能扑空（例如唯一提交出去的镜头刚好已完成）。
      // 这时候直接退出，剩下的镜头就再也没人查了，必须保持循环活着。
      if (videoSubmissionInFlightRef.current) {
        scheduleVideoBatchPoll(batchToken, attempt + 1);
        return;
      }
      videoPollLoopRef.current = 0;
      return;
    }

    const outcomes = await Promise.all(pollingJobs.map(async (job) => {
      if (batchToken !== videoBatchRunRef.current || !job.providerTaskId) return { id: job.id, pending: false };
      updateVideoJobsForBatch(batchToken, job.id, { status: 'polling', error: '' });
      let httpStatus: number | undefined;
      try {
        const res = await fetch(`/api/video/render?video_id=${encodeURIComponent(job.providerTaskId)}`);
        httpStatus = res.status;
        const data = (await res.json()) as VideoRenderApiResponse;
        if (!res.ok) throw new Error(data.error || '视频状态查询失败');
        if (batchToken !== videoBatchRunRef.current) return { id: job.id, pending: false };
        const normalizedStatus = normalizeVideoProviderStatus(data.status, data.videoUrl);
        const videoUrl = data.videoUrl || job.videoUrl || '';
        const jobStatus = videoJobStatusFromProvider(normalizedStatus, await videoQaAvailable());
        updateVideoJobsForBatch(batchToken, job.id, {
          status: jobStatus,
          providerTaskId: data.video_id || data.videoId || job.providerTaskId,
          videoUrl,
          progress: typeof data.progress === 'number' ? data.progress : job.progress,
          error: jobStatus === 'failed'
            ? videoErrorText(data.error || data.raw?.error) || '视频生成失败'
            : ''
        });
        // 上游说渲染完了只是「接口跑完了」。画面有没有崩，要抽帧看过才算数。
        if (jobStatus === 'qa_pending') void runVideoQaForJob(batchToken, { ...job, videoUrl });
        return { id: job.id, pending: normalizedStatus === 'submitted' };
      } catch (err) {
        if (batchToken !== videoBatchRunRef.current) return { id: job.id, pending: false };
        const message = err instanceof Error ? err.message : '视频状态查询失败';
        // 限流或网络抖动时任务其实还在渲染，保持 polling 等下一轮；只有明确的错误才判死。
        if (isRetryableVideoError(message, httpStatus)) {
          updateVideoJobsForBatch(batchToken, job.id, {
            status: 'polling',
            error: `状态查询暂时失败，将在下一轮重试：${message}`
          });
          return { id: job.id, pending: true };
        }
        updateVideoJobsForBatch(batchToken, job.id, { status: 'failed', error: message });
        return { id: job.id, pending: false };
      }
    }));

    if (batchToken !== videoBatchRunRef.current) {
      videoPollLoopRef.current = 0;
      return;
    }
    if (attempt < VIDEO_POLL_MAX_ATTEMPTS) {
      scheduleVideoBatchPoll(batchToken, attempt + 1);
      return;
    }
    videoPollLoopRef.current = 0;
    for (const jobId of timeoutPendingVideoJobIds(outcomes)) {
      updateVideoJobsForBatch(batchToken, jobId, { status: 'failed', error: '视频状态轮询超时，请重试此镜头。' });
    }
  }

  /**
   * 抽帧走浏览器：Vercel 上没有 ffmpeg，服务端抽帧要么装二进制要么另起服务，
   * 而 <video> + canvas 在客户端本来就能做。跨域视频会污染 canvas，
   * 这时候抽不出帧——那属于「这段没被检查过」，由 QA 接口判成 skipped，不能悄悄当合格放行。
   */
  /**
   * 抽这一段视频的最后一帧，给下一镜当首帧。
   *
   * 不能复用 extractVideoFrames：它取的是各段的中点（duration * (i+0.5)/count），
   * 永远取不到结尾——而续接要的恰恰是结尾那一帧。
   * 往回退 0.08 秒是因为最后一帧经常是编码器补的黑场或重复帧，直接 seek 到 duration
   * 有相当概率抽到一张黑图，拿它当首帧比不接更糟。
   */
  async function extractVideoTailFrame(videoUrl: string): Promise<string> {
    if (typeof document === 'undefined' || !videoUrl) return '';
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.preload = 'auto';
    video.src = videoUrl;

    try {
      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error('视频元数据加载超时')), VIDEO_QA_FRAME_TIMEOUT_MS);
        video.onloadeddata = () => { window.clearTimeout(timer); resolve(); };
        video.onerror = () => { window.clearTimeout(timer); reject(new Error('视频无法加载')); };
      });

      const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
      if (!duration) return '';
      const canvas = document.createElement('canvas');
      // 尾帧是要当首帧用的，比质检抽帧需要更高的分辨率：512 宽喂回去会让下一镜整体变糊。
      const scale = Math.min(1, 1024 / (video.videoWidth || 1024));
      canvas.width = Math.max(1, Math.round((video.videoWidth || 1024) * scale));
      canvas.height = Math.max(1, Math.round((video.videoHeight || 1024) * scale));
      const context = canvas.getContext('2d');
      if (!context) return '';

      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error('抽帧超时')), VIDEO_QA_FRAME_TIMEOUT_MS);
        video.onseeked = () => { window.clearTimeout(timer); resolve(); };
        video.currentTime = Math.max(0, duration - 0.08);
      });
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.85);
    } catch (_) {
      // 跨域视频会污染 canvas，这时抽不出尾帧。那属于「这一镜没接上」，
      // 由调用方退回场景主图，不能因此判这一镜失败。
      return '';
    } finally {
      video.removeAttribute('src');
      video.load();
    }
  }

  async function extractVideoFrames(videoUrl: string, count = 3): Promise<string[]> {
    if (typeof document === 'undefined' || !videoUrl) return [];
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.preload = 'auto';
    video.src = videoUrl;

    try {
      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error('视频元数据加载超时')), VIDEO_QA_FRAME_TIMEOUT_MS);
        video.onloadeddata = () => { window.clearTimeout(timer); resolve(); };
        video.onerror = () => { window.clearTimeout(timer); reject(new Error('视频无法加载')); };
      });

      const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
      if (!duration) return [];
      const canvas = document.createElement('canvas');
      // 质检看的是结构性错误（手指、穿模、换脸），不是画质，512 宽足够而且省 token。
      const scale = Math.min(1, 512 / (video.videoWidth || 512));
      canvas.width = Math.max(1, Math.round((video.videoWidth || 512) * scale));
      canvas.height = Math.max(1, Math.round((video.videoHeight || 512) * scale));
      const context = canvas.getContext('2d');
      if (!context) return [];

      const targets = Array.from({ length: count }, (_, index) => duration * ((index + 0.5) / count));
      const frames: string[] = [];
      for (const target of targets) {
        try {
          await new Promise<void>((resolve, reject) => {
            const timer = window.setTimeout(() => reject(new Error('抽帧超时')), VIDEO_QA_FRAME_TIMEOUT_MS);
            video.onseeked = () => { window.clearTimeout(timer); resolve(); };
            video.currentTime = Math.min(target, Math.max(0, duration - 0.05));
          });
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          frames.push(canvas.toDataURL('image/jpeg', 0.7));
        } catch (_) {
          break;
        }
      }
      return frames;
    } catch (_) {
      return [];
    } finally {
      video.removeAttribute('src');
      video.load();
    }
  }

  /** 质检没配好就退回旧行为（渲染成功即完成），但要让用户在片段上看到「未质检」。 */
  async function videoQaAvailable(): Promise<boolean> {
    if (videoQaEnabledRef.current !== null) return videoQaEnabledRef.current;
    try {
      const res = await fetch('/api/video/qa');
      const data = (await res.json()) as { enabled?: boolean };
      videoQaEnabledRef.current = Boolean(data.enabled);
    } catch (_) {
      videoQaEnabledRef.current = false;
    }
    return videoQaEnabledRef.current;
  }

  async function postVideoRender(body: ReturnType<typeof requestForVideoJob>) {
    return fetch('/api/video/render', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
  }

  /**
   * 一个片段的质检闸门：抽帧 → 送检 → 通过则落成 completed，不通过则换策略重渲。
   *
   * 三件事是刻意的：
   * 1. 质检自身出错（接口挂了、抽不到帧）一律放行并标注，不能因为我们的质检坏了就判用户的片子死刑；
   * 2. 重渲计数走 qaAttempt，和 provider 的 attempt 完全分开；
   * 3. 每次重渲都换策略，不重复提交同一条提示词。
   */
  async function runVideoQaForJob(batchToken: number, job: VideoRenderJob) {
    if (batchToken !== videoBatchRunRef.current || !job.videoUrl) return;
    if (videoQaInFlightRef.current.has(job.id)) return;
    videoQaInFlightRef.current.add(job.id);
    try {
      const physicsMode = normalizePhysicsMode(job.physicsMode);
      const frames = await extractVideoFrames(job.videoUrl, VIDEO_QA_FRAME_COUNT);
      if (batchToken !== videoBatchRunRef.current) return;

      let verdict: VideoQaVerdict | null = null;
      try {
        const res = await fetch('/api/video/qa', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            frames,
            physicsMode,
            shotTitle: job.promptId,
            narration: ''
          })
        });
        const data = (await res.json()) as { ok?: boolean; verdict?: VideoQaVerdict; error?: string };
        if (res.ok && data.verdict) verdict = data.verdict;
      } catch (_) {
        verdict = null;
      }
      if (batchToken !== videoBatchRunRef.current) return;

      if (!verdict || verdict.status === 'skipped') {
        updateVideoJobsForBatch(batchToken, job.id, {
          status: 'completed',
          progress: 100,
          qa: verdict || { status: 'skipped', mode: physicsMode, issues: [], checkedFrames: 0, note: '质检服务不可用，本镜头未经画面检查。' },
          error: ''
        });
        return;
      }

      if (verdict.status === 'passed') {
        updateVideoJobsForBatch(batchToken, job.id, { status: 'completed', progress: 100, qa: verdict, error: '' });
        return;
      }

      const decision = classifyVideoQaVerdict(verdict, job.qaAttempt ?? 0);
      // 每一次打回都记进账本，包括还能重试的那些——只记刷满的那种会漏掉「重渲一次救回来了」的样本，
      // 而那正是判断哪种策略真的有效所需要的对照。
      appendQaLedgerEntry({
        sceneId: job.promptId,
        verdict,
        attempt: job.qaAttempt ?? 0,
        strategy: decision.strategy,
        exhausted: !decision.retry
      });
      if (!decision.retry || !decision.strategy) {
        updateVideoJobsForBatch(batchToken, job.id, { status: 'qa_failed', qa: verdict, error: decision.reason });
        return;
      }

      const directive = videoQaRetryDirective(decision.strategy, verdict.issues);
      const duration = videoQaRetryDuration(job.durationSeconds || targetDurationSeconds(undefined, physicsMode), physicsMode);
      const patch = requeueVideoJobForQaRetry(job, directive, duration, decision.reason, decision.strategy);
      updateVideoJobsForBatch(batchToken, job.id, patch);

      const data = parseJsonFile<AssetPrompts>(workspaceRef.current, 'asset_prompts.json', {});
      await submitVideoRenderJobs([{ ...job, ...patch } as VideoRenderJob], batchToken, data, postVideoRender);
    } finally {
      videoQaInFlightRef.current.delete(job.id);
    }
  }

  function requestForVideoJob(job: VideoRenderJob, data: AssetPrompts, tailFrame = '') {
    const prompt = normalizedVideoPrompts(data).find((item) => item.id === job.promptId);
    if (!prompt?.prompt) throw new Error(`镜头 ${job.promptId} 缺少可提交提示词`);
    const { frames, identities } = partitionReferenceImages(prompt);
    // 只有构图用的图才参与 mode 判定。身份锚点是用来锁脸的，把它算进关键帧数量，
    // 「场景图 + 两张人脸」就会被当成三帧关键帧序列，视频变成场景渐变到人脸特写。
    //
    // 但「不当关键帧」被误做成了「干脆不发」：身份锚点图以前只用来拼一段文字描述，
    // 一张都没进过渲染请求。于是视频这一层锁脸完全靠文字，唯一的视觉锚点是场景图——
    // 场景图上的脸一漂，后面每个镜头都跟着漂，这就是「脸在中式和欧美之间来回切」。
    // 现在它们照常走独立字段下发（见 identityImages），只是不参与 mode 判定。
    //
    // 锁脸重渲是唯一的例外：这时候场景图上那张脸已经是错的，
    // 继续拿它当首帧等于让模型照着错的脸再画一遍，所以直接把身份锚点图提到首帧。
    //
    // 上一镜的尾帧优先于场景主图：同一场戏的每个镜头都从场景主图那个静止姿势重新出发，
    // 正是「每 3 秒跳一次」的直接成因。尾帧抽不出来（跨域污染 canvas）时自然退回场景主图，
    // 所以这里不需要额外的兜底分支。
    const reanchor = job.qaStrategy === 'reanchor' && identities.length > 0;
    const framing = reanchor
      ? identities.slice(0, 1)
      : tailFrame
        ? [tailFrame]
        : (frames.length ? frames : identities.slice(0, 1));
    if (!framing.length) throw new Error(`镜头 ${job.promptId} 缺少参考图`);
    const identityImages = identities.filter((url) => !framing.includes(url));
    const physicsMode = normalizePhysicsMode(job.physicsMode ?? prompt.physicsMode);
    // 质检重渲时时长以 job 上被砍过的那个为准；首渲才用任务包里的原始时长。
    const requestedDuration = job.qaAttempt && job.durationSeconds
      ? clampShotDuration(job.durationSeconds, physicsMode)
      : targetDurationSeconds(prompt, physicsMode);
    // 有台词的镜头再收一道：脸占得大、嘴一直在动，是身份漂移最藏不住的地方。
    const targetDuration = shotNarration(textField(prompt.sceneId))
      ? clampDialogueShotDuration(requestedDuration, physicsMode)
      : requestedDuration;
    const renderSpec = specForTargetDuration(targetDuration, data);
    const renderMode = videoModeForPrompt(prompt, renderSpec, framing);
    const basePrompt = buildVideoRenderPrompt(prompt, targetDuration, data);
    return {
      // 策略指令追加在拼装好的提示词末尾，而不是替换它——参考图、台词、规格都还要照常生效。
      prompt: job.qaDirective ? `${basePrompt}\n\n${job.qaDirective}` : basePrompt,
      negativePrompt: chineseOnlyVideoNegativePrompt(
        [physicsNegativePrompt(physicsMode), prompt.negativePrompt, data.characterConsistency?.negativePrompt]
          .filter(Boolean)
          .join('')
      ),
      image: framing.length === 1 && renderMode !== 'keyframes' ? framing[0] : undefined,
      keyframes: framing.length > 1 || renderMode === 'keyframes' ? framing : undefined,
      // 和 image / keyframes 分开的字段：这些图是用来锁脸的，不是画面里的某一帧。
      identityImages: identityImages.length ? identityImages : undefined,
      mode: renderMode,
      spec: renderSpec
    };
  }

  /** 退避期间如果用户重新准备了任务包，batchToken 会变，等待应当立刻放弃。 */
  function waitUnlessBatchChanged(delayMs: number, batchToken: number) {
    return new Promise<void>((resolve) => {
      const step = 500;
      let waited = 0;
      const tick = () => {
        if (waited >= delayMs || batchToken !== videoBatchRunRef.current) return resolve();
        waited += step;
        window.setTimeout(tick, step);
      };
      tick();
    });
  }

  async function submitVideoRenderJobs(
    jobs: VideoRenderJob[],
    batchToken: number,
    data: AssetPrompts,
    postRender: (body: ReturnType<typeof requestForVideoJob>) => Promise<Response>,
    tailFrameByJobId?: Map<string, string>
  ) {
    const queue = [...jobs];
    const submitNext = async () => {
      while (queue.length && batchToken === videoBatchRunRef.current) {
        const job = queue.shift();
        if (!job) return;
        let attempt = job.attempt;
        // 上游拒过一次内联尾帧之后，这一轮剩下的镜头就别再试了：每试一次就是一次白等。
        let tailFrame = inlineFrameRejectedRef.current ? '' : (tailFrameByJobId?.get(job.id) || '');
        // 限流 / 抖动会重试；只有真正的拒绝才落成 failed。
        while (batchToken === videoBatchRunRef.current) {
          attempt += 1;
          const localAttempt = attempt - job.attempt;
          updateVideoJobsForBatch(batchToken, job.id, { status: 'submitting', attempt, error: '', progress: 0 });
          let httpStatus: number | undefined;
          try {
            const res = await postRender(requestForVideoJob(job, data, tailFrame));
            httpStatus = res.status;
            const rawBody = await res.text();
            const result = (rawBody ? JSON.parse(rawBody) : {}) as VideoRenderApiResponse;
            // 上游不认内联的 data: URI 尾帧时，去掉它重发一次并说明降级——
            // 猜错一个没有文档的输入格式，代价应该是「这一镜没接上尾帧」，
            // 而不是「这一镜渲染失败」。和身份参考图字段名那处是同一套降级doctrine。
            if (!res.ok && tailFrame && rejectsInlineFrame(res.status, rawBody)) {
              inlineFrameRejectedRef.current = true;
              tailFrame = '';
              setError(inlineFrameDegradedNote());
              attempt -= 1;
              continue;
            }
            if (!res.ok) throw new Error(result.error || '视频生成提交失败');
            if (batchToken !== videoBatchRunRef.current) return;
            const providerTaskId = result.video_id || result.videoId || result.task_id || '';
            // 服务端因为上游不认字段而去掉了身份参考图：这一批的人物一致性只剩文字约束。
            // 说一次就够（整批的字段名是同一个），但必须说，否则这是一层看不见的降级。
            if (result.identityReferenceNote) setError(result.identityReferenceNote);
            const normalizedStatus = normalizeVideoProviderStatus(result.status, result.videoUrl);
            const submission = finalizeVideoSubmission(normalizedStatus, providerTaskId);
            const jobStatus = videoJobStatusFromProvider(submission.status, await videoQaAvailable());
            updateVideoJobsForBatch(batchToken, job.id, {
              status: jobStatus,
              attempt,
              providerTaskId,
              videoUrl: result.videoUrl || '',
              progress: typeof result.progress === 'number' ? result.progress : 0,
              error: jobStatus === 'failed'
                ? videoErrorText(result.error || result.raw?.error) || (submission.missingProviderTaskId ? '视频服务没有返回可轮询任务 ID' : '视频生成失败')
                : ''
            });
            // 极少数情况下提交请求直接返回成片，这条路径同样要过质检，不能绕开。
            if (jobStatus === 'qa_pending') void runVideoQaForJob(batchToken, { ...job, videoUrl: result.videoUrl || '' });
            // 这个镜头已经在上游排队了，立刻开始查它的状态，不用等剩下的镜头提交完。
            if (jobStatus === 'submitted') startVideoBatchPollingIfIdle(batchToken);
            break;
          } catch (err) {
            if (batchToken !== videoBatchRunRef.current) return;
            const message = err instanceof Error ? err.message : '视频生成提交失败';
            const decision = classifyVideoSubmitError(message, httpStatus, localAttempt);
            if (!decision.retry) {
              updateVideoJobsForBatch(batchToken, job.id, { status: 'failed', attempt, error: message });
              break;
            }
            updateVideoJobsForBatch(batchToken, job.id, {
              status: 'submitting',
              attempt,
              error: `${decision.rateLimited ? '触发限流' : '提交暂时失败'}，${Math.round(decision.delayMs / 1000)}s 后重试：${message}`
            });
            await waitUnlessBatchChanged(decision.delayMs, batchToken);
          }
        }
      }
    };
    await Promise.all([submitNext(), submitNext()]);
    startVideoBatchPollingIfIdle(batchToken);
  }

  /**
   * 把同一场次的镜头串起来，并只提交每条链当前该跑的那一个。
   *
   * 这个函数是首尾帧续接的调度中心，三个入口共用它：首次提交、页面刷新后续跑、失败重试。
   * 分别实现的话，三条路里总有一条会忘记「前一镜还在途」，并发就又回来了。
   */
  async function submitChainedVideoJobs(
    jobs: VideoRenderJob[],
    batchToken: number,
    data: AssetPrompts,
    postRender: (body: ReturnType<typeof requestForVideoJob>) => Promise<Response>
  ) {
    const chains = planShotChains(jobs, sceneIdByPromptId(data));
    videoChainsRef.current = chains;
    const jobById = new Map(jobs.map((job) => [job.id, job]));
    const readyIds = readyChainJobIds(chains, new Map(jobs.map((job) => [job.id, job.status])));
    const ready = readyIds.map((id) => jobById.get(id)).filter(Boolean) as VideoRenderJob[];
    if (!ready.length) return;
    // 链首没有上一镜，尾帧一律为空——这一轮不会有任何抽帧开销。
    await submitVideoRenderJobs(ready, batchToken, data, postRender, new Map());
  }

  /** promptId → 它属于哪个场次。链就是按这个分的。 */
  function sceneIdByPromptId(data: AssetPrompts): Map<string, string> {
    return new Map(
      (data.prompts || [])
        .map((prompt) => [textField(prompt.id), textField(prompt.sourceSceneId) || textField(prompt.sceneId)] as const)
        .filter(([promptId, sceneId]) => Boolean(promptId) && Boolean(sceneId))
    );
  }

  /**
   * 某一镜到终态之后，把它那条链往下推一格。
   *
   * 上一镜正常完成就抽尾帧接上；失败或质检没过就不接，但【仍然要往下推】——
   * 一个镜头挂掉就让整场戏剩下的镜头永远不提交，是比不接尾帧严重得多的问题，
   * 而且在界面上表现为「卡住不动」，用户完全看不出发生了什么。
   */
  async function advanceShotChain(
    batchToken: number,
    finishedJobId: string,
    finishedPatch: Partial<VideoRenderJob>
  ) {
    if (batchToken !== videoBatchRunRef.current) return;
    const chains = videoChainsRef.current;
    const nextId = nextInChain(chains, finishedJobId);
    if (!nextId || chainAdvanceInFlightRef.current.has(nextId)) return;
    chainAdvanceInFlightRef.current.add(nextId);

    try {
      // workspaceRef 是在 useEffect 里同步的，比这次 patch 慢一个渲染周期。
      // 让出一个宏任务再读，否则读到的是这一镜【完成之前】的状态。
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      if (batchToken !== videoBatchRunRef.current) return;

      const jobs = productionFlowFromWorkspace(workspaceRef.current).videoJobs as VideoRenderJob[];
      const finished = jobs.find((job) => job.id === finishedJobId);
      const next = jobs.find((job) => job.id === nextId);
      if (!next || next.status !== 'ready') return;

      // patch 是这次状态变化的权威来源；工作区里那份只用来补 patch 没带的字段
      // （质检通过的那个 patch 里没有 videoUrl，它是轮询阶段写进去的）。
      const previousStatus = finishedPatch.status || finished?.status;
      const previousVideoUrl = finishedPatch.videoUrl || finished?.videoUrl;

      const data = parseJsonFile<AssetPrompts>(workspaceRef.current, 'asset_prompts.json', {});
      const tailFrames = new Map<string, string>();
      if (!inlineFrameRejectedRef.current && canChainFromTail({
        previousStatus,
        previousVideoUrl,
        qaStrategy: next.qaStrategy
      })) {
        const tail = await extractVideoTailFrame(previousVideoUrl || '');
        if (tail) tailFrames.set(nextId, tail);
      }
      if (batchToken !== videoBatchRunRef.current) return;
      await submitVideoRenderJobs([next], batchToken, data, postVideoRender, tailFrames);
    } finally {
      chainAdvanceInFlightRef.current.delete(nextId);
    }
  }

  function invalidateVideoBatch() {
    videoBatchRunRef.current += 1;
    videoRecoveryKeyRef.current = '';
    videoPollLoopRef.current = 0;
    videoChainsRef.current = [];
    chainAdvanceInFlightRef.current.clear();
    inlineFrameRejectedRef.current = false;
    clearVideoPollTimer();
  }

  function hasActiveVideoJobs(snapshot: WorkspaceSnapshot | null) {
    return resumableVideoJobs(productionFlowFromWorkspace(snapshot).videoJobs as VideoRenderJob[]).length > 0 ||
      productionFlowFromWorkspace(snapshot).videoJobs.some((job) => job.status === 'submitting');
  }

  function prepareVideoTaskDraft() {
    if (!workspace) return;
    if (hasActiveVideoJobs(workspace)) {
      setError('视频任务正在提交或生成，完成或失败后才能更新视频任务。');
      return;
    }
    invalidateVideoBatch();
    const baseWorkspace = updateProductionFlow(workspace, (flow) => ({ ...flow, currentStage: 'video', videoJobs: [] }));
    workspaceRef.current = baseWorkspace;
    setWorkspace(baseWorkspace);
    void requestStageDraft(
      'video',
      baseWorkspace,
      undefined,
      '请基于已确认的制作包，重新准备可提交给视频模型的镜头级生成任务、首帧提示、角色一致性提示和渲染参数。不要声称已渲染 MP4。',
      messages.slice(-10),
      'regenerate'
    );
  }

  function saveVideoTaskDraft(
    promptId: string,
    summary: string,
    transform: (data: AssetPrompts) => AssetPrompts
  ) {
    if (!workspace) return;
    if (hasActiveVideoJobs(workspace)) {
      setError('视频任务正在提交或生成，完成或失败后才能修改镜头。');
      return;
    }
    const base = currentStageDraftWorkspace(workspace, 'video');
    const before = getFile(workspace, 'asset_prompts.json')?.content || '';
    const source = parseJsonFile<AssetPrompts>(base, 'asset_prompts.json', {});
    const nextData = transform(source);
    const after = JSON.stringify(nextData, null, 2);
    if (after === getFile(base, 'asset_prompts.json')?.content) return;
    invalidateVideoBatch();
    setWorkspace((current) => {
      if (!current) return current;
      const flow = productionFlowFromWorkspace(current);
      const record = flow.stages.video;
      const generationJobId = uid('video-manual');
      const nextFlow = {
        ...flow,
        currentStage: 'video' as const,
        stages: {
          ...flow.stages,
          video: {
            ...record,
            status: 'ready_for_review' as const,
            draftVersion: Math.max(record.draftVersion || 0, record.confirmedVersion || 0) + 1,
            confirmedVersion: null,
            confirmedAt: null,
            confirmedBy: null,
            confirmationKey: null,
            generationJobId,
            error: null
          }
        },
        videoJobs: dropVideoJobsForPrompt(flow.videoJobs as VideoRenderJob[], promptId)
      };
      const patch: PatchOperation = {
        id: uid('patch'),
        filePath: 'asset_prompts.json',
        summary,
        before,
        after,
        riskLevel: 'low',
        requiresApproval: true,
        origin: {
          kind: 'manual',
          productionStage: 'video',
          generationJobId
        }
      };
      return writeProductionFlow(appendPendingPatches(current, [patch]), nextFlow);
    });
  }

  function updateVideoTaskPrompt(promptId: string, prompt: string) {
    const nextPrompt = prompt.trim();
    if (!nextPrompt) {
      setError('镜头提示词不能为空。');
      return;
    }
    saveVideoTaskDraft(promptId, `修改镜头 ${promptId} 的视频提示词`, (data) => ({
      ...data,
      prompts: (data.prompts || []).map((item) => item.id === promptId ? { ...item, prompt: nextPrompt } : item)
    }));
  }

  function reprepareVideoTask(promptId: string) {
    saveVideoTaskDraft(promptId, `重新准备镜头 ${promptId} 的视频任务`, (data) => {
      const prompt = (data.prompts || []).find((item) => item.id === promptId);
      if (!prompt) return data;
      const queue = data.renderQueue || [];
      const found = queue.some((item) => item.id === promptId);
      return {
        ...data,
        prompts: (data.prompts || []).map((item) => item.id === promptId ? { ...item } : item),
        renderQueue: found
          ? queue.map((item) => item.id === promptId ? { ...item, status: 'ready', preparedAt: now() } : item)
          : [...queue, {
              id: promptId,
              sceneId: prompt.sceneId,
              status: 'ready',
              preparedAt: now(),
              referenceImageUrl: prompt.referenceImageUrl,
              referenceImages: prompt.referenceImages,
              mode: prompt.mode
            }]
      };
    });
  }

  function replaceVideoTaskReference(promptId: string, file?: File) {
    if (!file || !file.type.startsWith('image/')) {
      setError('替换失败：请选择图片文件。');
      return;
    }
    if (file.size <= 0 || file.size > MAX_PERSISTED_IMAGE_BYTES) {
      setError(`替换失败：图片需大于 0 且不超过 ${MAX_PERSISTED_IMAGE_BYTES / 1024 / 1024}MB。`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const imageUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!imageUrl) {
        setError('替换失败：图片读取失败。');
        return;
      }
      if (!canPersistUploadedDataUrl(imageUrl)) {
        setError('项目体积已超过 32MB 档案上限，这张图没有写入。请删除部分旧参考图或换小图。');
        return;
      }
      saveVideoTaskDraft(promptId, `替换镜头 ${promptId} 的参考图`, (data) => ({
        ...data,
        prompts: (data.prompts || []).map((item) => item.id === promptId
          ? { ...item, referenceImageUrl: imageUrl, referenceImages: [imageUrl] }
          : item),
        renderQueue: (data.renderQueue || []).map((item) => item.id === promptId
          ? { ...item, referenceImageUrl: imageUrl, referenceImages: [imageUrl] }
          : item)
      }));
    };
    reader.onerror = () => setError('替换失败：图片读取失败。');
    reader.readAsDataURL(file);
  }

  /* ---------- 成片合成 ---------- */

  function clearFinalCutPollTimer() {
    if (finalCutPollTimerRef.current) {
      window.clearTimeout(finalCutPollTimerRef.current);
      finalCutPollTimerRef.current = null;
    }
  }

  function writeFinalCut(state: FinalCutState | null) {
    setWorkspace((current) => current && updateProductionFlow(current, (flow) => ({
      ...flow,
      currentStage: 'video',
      stages: {
        ...flow.stages,
        video: {
          ...flow.stages.video,
          // 合成中要挡住改镜头和重复提交，所以阶段状态必须跟着走一档。
          status: state?.status === 'stitching'
            ? ('stitching' as const)
            : state?.status === 'completed'
              ? ('completed' as const)
              : flow.stages.video.status === 'stitching'
                ? ('rendering' as const)
                : flow.stages.video.status,
          error: state?.status === 'failed' ? state.error || '合成失败。' : null
        }
      },
      finalCut: state
    })));
  }

  /** 只在 clips_ready 之后才需要知道有没有 ffmpeg，探一次就够。 */
  async function probeStitchSupport() {
    if (stitchProbe) return stitchProbe;
    try {
      const response = await fetch('/api/video/stitch');
      const json = await response.json();
      const probe = { available: Boolean(json?.available), hint: typeof json?.hint === 'string' ? json.hint : '' };
      setStitchProbe(probe);
      return probe;
    } catch {
      const probe = { available: false, hint: '无法确认本机是否有 ffmpeg，合成暂不可用。' };
      setStitchProbe(probe);
      return probe;
    }
  }

  function pollFinalCut(jobId: string, attempt = 0) {
    clearFinalCutPollTimer();
    // 合成最长按 40 分钟算：36 段 720p 走重编码的实测量级在十几分钟，留足余量。
    if (attempt > 800) {
      writeFinalCut({ jobId, status: 'failed', error: '合成超时，没有等到结果。请重试。' });
      return;
    }
    finalCutPollTimerRef.current = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/video/stitch?job_id=${encodeURIComponent(jobId)}`);
        const json = await response.json();
        if (!response.ok || !json?.ok) {
          writeFinalCut({ jobId, status: 'failed', error: json?.error || '查不到合成任务的状态。' });
          return;
        }
        const state = normalizeFinalCutState(json.state);
        if (!state) {
          writeFinalCut({ jobId, status: 'failed', error: '合成任务返回了无法识别的状态。' });
          return;
        }
        writeFinalCut(state);
        if (state.status === 'stitching') pollFinalCut(jobId, attempt + 1);
        else if (state.status === 'failed') setError(state.error || '合成失败。');
      } catch (error) {
        writeFinalCut({
          jobId,
          status: 'failed',
          error: error instanceof Error ? error.message : '查询合成状态时出错。'
        });
      }
    }, 3000);
  }

  async function startFinalCut() {
    if (!workspace || stitchStarting) return;
    const flow = productionFlowFromWorkspace(workspace);
    if (isFinalCutInFlight(flow.finalCut)) return;

    const probe = await probeStitchSupport();
    if (!probe.available) {
      setError(probe.hint || ffmpegMissingMessage());
      return;
    }

    const prompts = normalizedVideoPrompts(parseJsonFile<AssetPrompts>(workspace, 'asset_prompts.json', {}));
    const jobs = flow.videoJobs as VideoRenderJob[];
    // 顺序取自任务包里的镜头顺序，不是 videoJobs 的数组顺序——重试过的镜头会被追加到末尾，
    // 照着 job 数组拼出来的成片，镜头顺序是乱的。
    const clips: StitchClip[] = prompts.flatMap((prompt, index) => {
      const promptId = prompt.id?.trim() || `video-prompt-${index + 1}`;
      const job = jobs.find((item) => item.promptId === promptId);
      if (job?.status !== 'completed' || !job.videoUrl) return [];
      return [{ promptId, shotNumber: index + 1, url: job.videoUrl, durationSeconds: job.durationSeconds }];
    });

    const validation = validateStitchClips(clips, prompts.length);
    if (!validation.ok) {
      setError(validation.error);
      return;
    }

    // 自动剪辑：用户在面板上勾了哪几条就采纳哪几条。一条都没勾时 acceptedAutoCuts 是空数组，
    // 片段原样进合成——这个模块只产出决策，永远不替用户删掉花钱渲出来的镜头。
    const finalClips = applyAutoCutToClips(clips, acceptedAutoCutDecisions);
    // 字幕跟着【剪辑之后】的顺序和时长走：删掉一个镜头之后，后面每一句字幕都会往前挪。
    // 台词从分镜里取：prompt.sceneId 指的是分镜里的镜头 id，storyboardShot 就是按它查的。
    const subtitles = finalClips.map((clip) => {
      const sceneId = textField(prompts.find((item) => item.id === clip.promptId)?.sceneId);
      return {
        dialogue: textField(storyboardShot(sceneId)?.dialogue) || shotNarration(sceneId),
        durationSeconds: clip.durationSeconds
      };
    });

    setStitchStarting(true);
    try {
      const response = await fetch('/api/video/stitch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clips: finalClips,
          // 采纳了删镜建议之后，成片的镜头数本来就该少于任务包里的条数，
          // 仍然拿 prompts.length 去卡完整性会把每一次剪辑都判成「漏了镜头」。
          expectedShotCount: finalClips.length,
          frameRate: videoSpec.fps,
          projectTitle: workspace.title,
          subtitles,
          normalizeLoudness: true
        })
      });
      const json = await response.json();
      if (!response.ok || !json?.ok) {
        setError(json?.error || `合成启动失败（HTTP ${response.status}）。`);
        return;
      }
      const state = normalizeFinalCutState(json.state);
      if (!state) {
        setError('合成任务启动了，但返回的状态无法识别。');
        return;
      }
      writeFinalCut(state);
      pollFinalCut(state.jobId);
    } catch (error) {
      setError(error instanceof Error ? error.message : '合成启动失败。');
    } finally {
      setStitchStarting(false);
    }
  }

  async function confirmVideoTasksAndStartRendering() {
    if (!workspace || videoSubmissionInFlightRef.current) return;
    const flow = productionFlowFromWorkspace(workspace);
    const record = flow.stages.video;
    const draftWorkspace = currentStageDraftWorkspace(workspace, 'video');
    const draftData = parseJsonFile<AssetPrompts>(draftWorkspace, 'asset_prompts.json', {});
    const prompts = normalizedVideoPrompts(draftData);
    const missingReferences = prompts.filter((prompt) => referenceImagesForPrompt(prompt).length === 0);
    if (record.status !== 'ready_for_review') {
      setError('视频任务必须处于待确认状态；有修改时请重新最终确认。');
      return;
    }
    if (!prompts.length) {
      setError('没有可提交的视频镜头任务。请先准备 video 类型且提示词非空的任务。');
      return;
    }
    if (missingReferences.length) {
      setError(`以下镜头缺少参考图，不能提交：${missingReferences.map((item) => item.id).join('、')}。`);
      return;
    }

    videoSubmissionInFlightRef.current = true;
    setVideoConfirming(true);
    try {
      const confirmation = confirmStageInWorkspace(workspace, {
        stage: 'video',
        outputFiles: ['asset_prompts.json'],
        expectedDraftVersion: record.draftVersion || 0,
        confirmationKey: uid('video-confirm'),
        confirmedAt: now(),
        confirmedBy: 'local-user',
        nextGenerationJobId: null,
        sourceVersions: record.sourceVersions
      });
      const confirmedData = parseJsonFile<AssetPrompts>(confirmation.workspace, 'asset_prompts.json', {});
      const freshJobs = createVideoRenderJobs((confirmedData.prompts || []).map((item, index) => ({
        ...item,
        id: item.id?.trim() || `video-prompt-${index + 1}`
      })));
      if (!freshJobs.length) throw new Error('确认后的任务包没有可提交的视频镜头。');
      // 只改了一个镜头就重烧全部镜头是纯粹的浪费：带上一轮已完成的片段，只提交缺的那些。
      const jobs = preserveCompletedVideoJobs(freshJobs, flow.videoJobs as VideoRenderJob[]);
      const jobsToSubmit = submittableVideoJobs(jobs);
      const batchToken = videoBatchRunRef.current + 1;
      videoBatchRunRef.current = batchToken;
      videoRecoveryKeyRef.current = '';
      videoPollLoopRef.current = 0;
      clearVideoPollTimer();
      const batch = videoBatchStatus(jobs, freshJobs.length);
      const persisted = updateProductionFlow(confirmation.workspace, (currentFlow) => ({
        ...currentFlow,
        currentStage: 'video',
        stages: {
          ...currentFlow.stages,
          video: {
            ...currentFlow.stages.video,
            status: 'rendering' as const,
            error: batch === 'clips_ready' ? '全部片段已完成，等待合成为单一成片文件。' : null
          }
        },
        videoJobs: jobs
      }));
      workspaceRef.current = persisted;
      setWorkspace(persisted);
      if (!jobsToSubmit.length) return;
      // 按场次串行提交，不再一次把全部镜头推给上游：同一场戏的镜头要靠上一镜的尾帧接住，
      // 并发提交就没有「上一镜」可言。并发度从「任意 2 个镜头」变成「任意 2 条链」，
      // 同一时刻在跑的渲染数量没变。
      await submitChainedVideoJobs(jobsToSubmit, batchToken, confirmedData, async (body) => fetch('/api/video/render', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : '确认视频任务失败');
    } finally {
      videoSubmissionInFlightRef.current = false;
      setVideoConfirming(false);
    }
  }

  async function retryFailedVideoTasks() {
    if (!workspace || videoSubmissionInFlightRef.current) return;
    const flow = productionFlowFromWorkspace(workspace);
    const failedJobs = retryableVideoJobs(flow.videoJobs as VideoRenderJob[]);
    if (!failedJobs.length) {
      setError('当前没有可重试的失败镜头。');
      return;
    }
    const data = parseJsonFile<AssetPrompts>(workspace, 'asset_prompts.json', {});
    videoSubmissionInFlightRef.current = true;
    setVideoConfirming(true);
    const batchToken = videoBatchRunRef.current + 1;
    videoBatchRunRef.current = batchToken;
    videoRecoveryKeyRef.current = '';
    videoPollLoopRef.current = 0;
    clearVideoPollTimer();
    // 手动重试是用户的明确决定，给一份新的质检重渲预算；上一轮的降级指令也一并清掉，
    // 否则被砍成特写的镜头会永远是特写。
    //
    // 状态要显式回到 ready：链式调度只认 ready，直接把 failed 的 job 丢进去会一个都不提交。
    const resetIds = new Set(failedJobs.map((job) => job.id));
    resetIds.forEach((id) => updateVideoJobsForBatch(batchToken, id, {
      qaAttempt: 0, qaDirective: undefined, status: 'ready', error: ''
    }));
    // planShotChains 要看到整批，不只是失败的那几个：链上已经完成的前序镜头
    // 决定了失败镜头能不能拿到尾帧，也决定了它现在该不该提交。
    const allJobs = (flow.videoJobs as VideoRenderJob[]).map((job) => resetIds.has(job.id)
      ? { ...job, qaAttempt: 0, qaDirective: undefined, status: 'ready' as const, error: '' }
      : job);
    try {
      await submitChainedVideoJobs(allJobs, batchToken, data, async (body) => fetch('/api/video/render', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      }));
    } finally {
      videoSubmissionInFlightRef.current = false;
      setVideoConfirming(false);
    }
  }

  function selectAsset(id: string) {
    setSelectedAssetId(id);
    const asset = assets.find((item) => item.id === id);
    const patch = asset ? pendingPatches.find((item) => item.filePath === asset.filePath) : undefined;
    if (patch) setSelectedPatchId(patch.id);
    if (asset?.type === 'script') setActiveTab('script');
    if (asset?.type === 'scene') setActiveTab('scene');
    if (asset?.type === 'shot' || asset?.type === 'timeline') setActiveTab('storyboard');
    // 只切页签，和上面三支保持一致。这里绝对不能调 tryFocusStudioStage：
    // 它会走到 focusStudioStage，而 focusStudioStage 在 video 阶段又会回头 selectAsset(promptAsset)，
    // 三个函数首尾相接成死循环——视频阶段点「审查」必然爆栈。
    if (asset?.type === 'prompt') setActiveTab('video');
  }
  function focusStudioStage(stage: StudioStageId) {
    setActiveTab(stage);
    const stageNode = canvasNodes.find((node) => node.stage === stage) || canvasNodes[0];
    setSelectedNodeId(stageNode.id);
    setNodeRevisionText('');
    if (stage === 'script' && scriptAsset) selectAsset(scriptAsset.id);
    if (stage === 'scene' && sceneAsset) selectAsset(sceneAsset.id);
    if (stage === 'storyboard' && (shotAsset || timelineAsset)) selectAsset((shotAsset || timelineAsset)?.id || '');
    if (stage === 'video' && promptAsset) selectAsset(promptAsset.id);
  }
  function tryFocusStudioStage(stage: StudioStageId) {
    if (!workspace) return;
    if (stage !== 'overview' && !canOpenProductionStage(productionFlowFromWorkspace(workspace), stage)) {
      setError(productionStageLockReason(stage));
      return;
    }
    setError('');
    focusStudioStage(stage);
    // 从顶部阶段导航进来的意图就是「我要看这一阶段」，直接展开审查面板。
    setSelectedCanvasCardId('');
    setCanvasReviewOpen(true);
  }
  function selectCanvasNode(node: StudioCanvasNode) {
    setSelectedNodeId(node.id);
    setNodeRevisionText('');
    if (node.assetId) selectAsset(node.assetId);
    if (node.sceneId) selectScene(node.sceneId);
    /**
     * 页签必须在 selectAsset 之后再设一次，而且以节点自己的 stage 为准。
     *
     * 真实事故：角色节点的 assetId 指向 asset_prompts.json（角色一致性写在那份文件里），
     * 而 selectAsset 看到 type === 'prompt' 就会 setActiveTab('video')。
     * 于是点任何一张角色卡，页签先被设成 character 又立刻被改成 video——
     * 抽屉里出现的是「视频任务审查」，角色审查界面根本打不开。
     * selectAsset 按资产类型切页签是给资产列表用的；从画布点进来时，节点的 stage 才是权威。
     */
    setActiveTab(node.stage);
    const nodePatch = pendingPatches.find((patch) => patchTouchesNode(patch, node));
    if (nodePatch) setSelectedPatchId(nodePatch.id);
  }
  function selectScene(id: string) {
    setSelectedSceneId(id);
  }
  function revealScriptOutput() {
    const asset = assets.find((item) => item.filePath === 'script.md' || item.type === 'script');
    const patch = pendingPatches.find((item) => item.filePath === 'script.md');
    if (asset) setSelectedAssetId(asset.id);
    if (patch) setSelectedPatchId(patch.id);
    setActiveTab('script');
    setSelectedNodeId('node_script');
    setNodeRevisionText('');
  }
  function submitNodeRevision() {
    if (!selectedNode || !workspace) return;
    const stage: ProductionStageId = selectedNode.stage === 'overview' ? 'script' : selectedNode.stage;
    const revisionText = buildNodeRevisionInstruction(selectedNode, nodeRevisionText);
    const userMessage: AgentMessage = { id: uid('msg'), role: 'user', content: revisionText, createdAt: now() };
    setMessages((prev) => [...prev, userMessage]);
    setNodeRevisionText('');
    const requestedOutputFiles = selectedNode.stage === 'overview'
      ? stageConfig('script').outputFiles
      : stageOutputFilesForWorkspace(stage, 'revise', workspace);
    const stageRequestTarget: StageRequestTarget = selectedNode.stage === 'overview' ? 'stage' : 'artifact';
    void requestStageDraft(stage, workspace, undefined, revisionText, [...messages, userMessage].slice(-10), 'revise', stageRequestTarget, requestedOutputFiles);
  }
  function regenerateProductionStage(node: StudioCanvasNode) {
    if (!workspace) return;
    const stage: ProductionStageId = node.stage === 'overview' ? 'script' : node.stage;
    const flow = productionFlowFromWorkspace(workspace);
    if ((stage === 'character' || stage === 'scene') && flow.stages[stage].status === 'failed') {
      const retryDraft = currentStageDraftWorkspace(workspace, stage);
      const generationJobId = uid(`${stage}-image-retry`);
      const sourceVersions = flow.stages[stage].sourceVersions;
      try {
        const retryWorkspace = writeProductionFlow(workspace, beginStageGeneration(flow, stage, generationJobId, sourceVersions));
        const run = beginStageRun(stage, generationJobId);
        setWorkspace(retryWorkspace);
        activeStageGenerationCountRef.current += 1;
        setLoading(true);
        setError('');
        void (stage === 'character'
          ? generateMissingCharacterImages(retryDraft, run)
          : generateMissingSceneImages(retryDraft, run)
        ).finally(() => {
          activeStageGenerationCountRef.current = Math.max(0, activeStageGenerationCountRef.current - 1);
          setLoading(activeStageGenerationCountRef.current > 0);
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : `${studioStageName(stage)}图片重试失败`);
      }
      return;
    }
    const requestedOutputFiles = node.stage === 'overview'
      ? stageConfig('script').outputFiles
      : stageOutputFilesForWorkspace(stage, 'regenerate', workspace);
    const stageRequestTarget: StageRequestTarget = node.stage === 'overview' ? 'stage' : 'artifact';
    void requestStageDraft(stage, workspace, undefined, '', messages.slice(-10), 'regenerate', stageRequestTarget, requestedOutputFiles);
  }

  function saveScriptDraft() {
    if (!workspace) return;
    const nextBody = scriptDraft.trim();
    if (!nextBody) {
      setError('脚本正文不能为空。');
      return;
    }
    const editBase = currentStageDraftWorkspace(workspace, 'script');
    const run = beginManualStageRun('script');
    if (!run) return;
    const patchId = uid('patch');
    setWorkspace((current) => {
      if (!current || !isCurrentStageRun('script', run.generationJobId, run.token)) return current;
      const flow = productionFlowFromWorkspace(current);
      const record = flow.stages.script;
      if (record.status !== 'generating' || record.generationJobId !== run.generationJobId) return current;
      const before = getFile(current, 'script.md')?.content || '';
      if (nextBody === getFile(editBase, 'script.md')?.content) return current;
      const patch: PatchOperation = {
        id: patchId,
        filePath: 'script.md',
        summary: '保存脚本正文修改，等待阶段确认',
        before,
        after: nextBody,
        riskLevel: 'low',
        requiresApproval: true,
        origin: {
          kind: 'manual',
          productionStage: 'script',
          generationJobId: run.generationJobId
        }
      };
      const pending = [...readPendingPatches(current).filter((item) => item.filePath !== 'script.md'), patch];
      return writeProductionFlow(
        savePendingPatches(current, pending),
        markStageDraft(flow, { stage: 'script', generationJobId: run.generationJobId, sourceVersions: record.sourceVersions })
      );
    });
    setSelectedPatchId(patchId);
  }
  function renderProductionDecision(decision: ProductionDecision) {
    return (
      <section className="production-decision-card" aria-label="生产决策卡">
        <div className="production-decision-head">
          <small>Production Decision</small>
          <strong>{decision.title}</strong>
          <p>{decision.question}</p>
        </div>
        <div className="decision-options" aria-label="选择制作路径">
          {decision.options.map((option) => (
            <button
              type="button"
              key={option.label}
              onClick={() => setNodeRevisionText(option.instruction)}
            >
              <span>{option.label}</span>
              <small>{option.description}</small>
            </button>
          ))}
        </div>
        <div className="production-decision-actions">
          <button type="button" className="btn sm" onClick={() => setNodeRevisionText(decision.revisionPrompt)}>
            <IconWand /> 我要修改
          </button>
          <button type="button" className="btn sm" onClick={() => focusStudioStage(selectedProductionStage)}>
            <IconLayers /> 返回当前阶段审查
          </button>
        </div>
      </section>
    );
  }
  function proposeAssetLibraryPatch(node: StudioCanvasNode) {
    if (!workspace || !isNodeStableForLibrary(node, workspace)) return;
    const sourceWorkspace = proposedWorkspace || workspace;
    const before =
      getFile(sourceWorkspace, 'asset_library.json')?.content ||
      JSON.stringify({ assets: [] }, null, 2);
    const current = safeParseJson<AssetLibraryFile>(before, { assets: [] });
    const currentItems = current.assets || [];
    if (currentItems.some((item) => libraryItemKey(item) === libraryKeyFor(node))) return;
    const next: AssetLibraryFile = {
      assets: [...currentItems, buildLibraryItem(node)]
    };
    const patch: PatchOperation = {
      id: uid('patch'),
      filePath: 'asset_library.json',
      summary: `将「${node.title}」作为稳定${studioStageName(node.stage)}资产加入资产库`,
      before,
      after: JSON.stringify(next, null, 2),
      riskLevel: 'low',
      requiresApproval: true
    };
    setWorkspace((current) => current ? appendPendingPatches(current, [patch]) : current);
    setSelectedPatchId(patch.id);
    setSelectedNodeId(node.id);
    setMessages((prev) => [
      ...prev,
      { id: uid('msg'), role: 'assistant', content: `已生成资产库 patch：${patch.summary}。合并后才会写入 asset_library.json。`, createdAt: now() }
    ]);
  }
  function openSelectedAssetInspector() {
    if (selectedAssetPatch) setSelectedPatchId(selectedAssetPatch.id);
    setInspectorOpen(true);
    setInspectorDocked(true);
  }
  /**
   * 一次把所有缺机位的镜头补齐。
   *
   * 分镜面板是只读的，所以「缺机位就挡住确认」如果没有这个出口，唯一的出路是
   * 重跑整个分镜——那会覆盖用户已经审过的画面、台词和动作拆分，代价远大于收益。
   * 这里只让模型补这三栏，并明确要求不要动别的字段。
   */
  function fillShotFraming() {
    if (!workspace) return;
    const gaps = storyboardFramingGaps(workspace);
    if (!gaps.length) return;
    // 把镜头逐个点名，模型才知道该补哪几条；不点名它会顺手重写整份分镜。
    const list = gaps.map((gap) => `${gap.id}（缺${gap.missing.join('、')}）`).join('；');
    void requestStageDraft(
      'storyboard',
      workspace,
      undefined,
      `只补齐下列镜头缺失的机位字段，其余字段和其余镜头一个字都不要改：${list}。\n`
        + 'shotSize 取值用 远景、全景、中景、中近景、近景、特写、大特写 之一；'
        + 'cameraAngle 取值用 平视、略俯、俯拍、略仰、仰拍、过肩、主观视角 之一；'
        + 'cameraHeight 取值用 地面高度、坐姿视线、站姿视线、高于人物、天花板视角 之一。\n'
        + '按每个镜头已有的 visual 和 action 判断该用什么机位，不要整片填同一个值——'
        + '全片都是「中景 / 平视 / 站姿视线」等于没有机位设计，和空着的效果一样。\n'
        + '顺带把 composition（主体在画面里的位置、前后景关系）和 subjectPlacement（人物位置与占比）也填上，这两栏不强制但很有用。',
      messages.slice(-10),
      'revise',
      'artifact',
      undefined,
      // 上面那句「一个字都不要改」拦不住模型：实测 10 个镜头的 visual 全被重写，
      // 而且是减信息的重写（「窗边自然光，自然暖色调」直接没了）。
      // 所以在落盘前把产出裁回去，只留机位那几栏。
      (patches, base) => patches.map((patch) => {
        if (patch.filePath !== 'storyboard.json') return patch;
        const before = getFile(base, 'storyboard.json')?.content;
        return before ? { ...patch, before, after: mergeShotFraming(before, patch.after) } : patch;
      })
    );
  }

  /**
   * 按镜头生成首帧图。
   *
   * 默认一场共用一张场次主图，而一场会拆成多个景别不同的镜头——那张图只有一个取景，
   * 却要同时当特写和全景的首帧。图生视频里首帧的构图权重远高于文字，
   * 于是提示词里那句「这一镜是特写」会被首帧按回去。
   *
   * 刻意做成用户显式触发：图片生成次数从「场次数」变成「镜头数」，
   * 一集 12 场 60 镜就是 5 倍开销，不该混在自动流程里静默发生。
   */
  async function generateShotFirstFrames() {
    if (!workspace) return;
    const jobs = missingShotImageJobs(currentStageDraftWorkspace(workspace, 'storyboard'));
    if (!jobs.length) {
      setError('每个镜头都已经有自己的首帧图了。');
      return;
    }
    const run = beginManualStageRun('storyboard');
    if (!run) return;
    const failures: string[] = [];
    // 两张一批：和场景图那条路径同一个并发口径，避免把上游图片队列打满。
    for (let index = 0; index < jobs.length; index += 2) {
      if (!isCurrentStageRun('storyboard', run.generationJobId, run.token)) return;
      const batch = jobs.slice(index, index + 2);
      const results = await Promise.allSettled(batch.map((job) => renderStageImage(job, run.controller.signal)));
      results.forEach((result, offset) => {
        if (result.status === 'fulfilled') {
          persistManualStageImage({ ...batch[offset], imageUrl: result.value }, `写入镜头 ${batch[offset].assetId} 的首帧图`, run);
        } else {
          failures.push(characterImageErrorText(result.reason instanceof Error ? result.reason.message : String(result.reason)));
        }
      });
    }
    if (failures.length) setError(`${failures.length} 个镜头的首帧图生成失败：${uniqueTexts(failures).slice(0, 2).join('；')}`);
  }

  function rewriteShot(id: string, kind: 'visual' | 'camera' | 'action') {
    if (!workspace) return;
    setSelectedSceneId(id);
    const shot = storyboard.find((item) => item.id === id) || scenes.find((item) => item.id === id);
    const label = shot?.title || id;
    const prompts: Record<typeof kind, string> = {
      visual: `只重写分镜「${label}」的画面描述和构图，保持其它镜头不变，并同步更新 storyboard.json 和素材 prompt。`,
      camera: `只调整分镜「${label}」的运镜方式（当前 ${cameraMoveLabel(videoSpec.cameraMove)}），给更贴合内容的镜头运动，不动其它镜头。`,
      action: `只重写分镜「${label}」的主体动作和表演节奏，保持画面和其它镜头不变。`
    };
    void requestStageDraft('storyboard', workspace, undefined, prompts[kind], messages.slice(-10), 'revise');
  }
  function navigate(section: NavSection) {
    if (section === 'new') {
      void resetProject(workspace?.mode || 'smb');
      setNavSection('mission');
      return;
    }
    // 「项目」页就是历史档案的家：每次进来都拉一遍最新列表。
    if (section === 'projects') void refreshProjectList();
    setNavSection(section);
  }
  function startFromNav(text: string) {
    setNavSection('mission');
    setInstruction(text);
    setContextOpen(false);
  }
  function toggleContext() {
    setContextOpen((value) => !value);
    setContextDocked((value) => !value);
  }
  function toggleInspector() {
    setInspectorOpen((value) => !value);
    setInspectorDocked((value) => !value);
  }

  function modelOptions(layer: ModelLayer) {
    return optionsForLayer(availableModels, layer);
  }

  function renderModelOptionRow(options: ProviderModelOption[], selected: string, onPick: (modelId: string) => void) {
    if (!options.length) {
      return <small className="model-option-empty">读取模型后显示候选；也可直接手动输入。</small>;
    }

    return (
      <div className="model-option-row">
        {options.map((model) => (
          <button
            key={model.id}
            type="button"
            className={`model-option ${selected === model.id ? 'on' : ''}`}
            onClick={() => onPick(model.id)}
          >
            {model.id}
          </button>
        ))}
      </div>
    );
  }

  function renderModelSettingsFields(idPrefix: string, includeTestIds = false) {
    return (
      <>
        <label className="field full">
          Base URL
          <input
            name={`${idPrefix}-base-url`}
            value={modelDraft.baseUrl}
            onChange={(event) => updateModelDraft({ baseUrl: event.target.value })}
            placeholder="服务商 Base URL，例如 https://.../v1"
          />
        </label>
        <label className="field full">
          API Key
          <input
            type="password"
            name={`${idPrefix}-api-key`}
            autoComplete="off"
            value={modelDraft.apiKey}
            onChange={(event) => updateModelDraft({ apiKey: event.target.value })}
            placeholder="API Key，留空则不覆盖已有 key"
          />
        </label>
        <label className="field">
          文本模型
          <input
            data-testid={includeTestIds ? 'text-model-input' : undefined}
            value={modelDraft.textModel}
            onChange={(event) => updateModelDraft({ textModel: event.target.value })}
            placeholder="例如 agnes-1.5-flash"
          />
          {renderModelOptionRow(modelOptions('text'), modelDraft.textModel, (modelId) => updateModelDraft({ textModel: modelId }))}
        </label>
        <label className="field">
          图片模型
          <input
            data-testid={includeTestIds ? 'image-model-input' : undefined}
            value={modelDraft.imageModel}
            onChange={(event) => updateModelDraft({ imageModel: event.target.value })}
            placeholder="例如 agnes-image-2.1-flash"
          />
          {renderModelOptionRow(modelOptions('image'), modelDraft.imageModel, (modelId) => updateModelDraft({ imageModel: modelId }))}
        </label>
        <label className="field full">
          视频模型
          <input
            data-testid={includeTestIds ? 'video-model-input' : undefined}
            value={modelDraft.videoModel}
            onChange={(event) => updateModelDraft({ videoModel: event.target.value })}
            placeholder="例如 agnes-video-v2.0"
          />
          {renderModelOptionRow(modelOptions('video'), modelDraft.videoModel, (modelId) => updateModelDraft({ videoModel: modelId }))}
        </label>
        <div className="settings-actions">
          <button
            type="button"
            className="btn"
            onClick={() => void loadAvailableModels()}
            disabled={loadingModels || !modelDraft.baseUrl.trim()}
          >
            <IconRefresh /> {loadingModels ? '读取中' : '读取可用模型'}
          </button>
          <button
            type="submit"
            className="btn primary"
            disabled={savingModelConfig || modelWriteBlocked || modelTokenMissing}
          >
            {savingModelConfig ? '保存中' : '保存配置'}
          </button>
        </div>
        <p className="settings-msg">{modelConfigMessage || '可手动输入模型 ID；读取可用模型只用于补全候选，不是唯一添加方式。'}</p>
      </>
    );
  }

  const navPageKind: NavPageKind | null =
    navSection === 'projects' ||
    navSection === 'agents' ||
    navSection === 'automation' ||
    navSection === 'skills' ||
    navSection === 'knowledge'
      ? navSection
      : null;
  const homeMode = !hasUserConversation && !hasOutput && !navPageKind;
  const fullCanvas = homeMode || focusMode || Boolean(navPageKind);
  const studioMode = hasOutput && !homeMode && !focusMode && !navPageKind;
  const appFullCanvas = fullCanvas || studioMode;
  const appClass = [
    'app',
    fullCanvas ? 'home' : '',
    studioMode ? 'studio-mode' : '',
    !appFullCanvas && !contextDocked ? 'context-closed' : '',
    !appFullCanvas && !inspectorDocked ? 'inspector-closed' : '',
    contextOpen ? 'context-open' : '',
    inspectorOpen ? 'inspector-open' : ''
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <main className={appClass}>
      <LeftRail
        active={navSection}
        onNavigate={navigate}
        modeLabel={modeLabel(workspace.mode)}
        onToggleMode={() => void resetProject(workspace.mode === 'creator' ? 'smb' : 'creator')}
      />

      {!appFullCanvas && (
        <ContextSidebar
          mission={{
            title: brief.title,
            platform: brief.platform,
            audience: brief.audience,
            goal: brief.goal,
            tone: brief.tone
          }}
          queue={queueEntries}
          contextStack={ctxStack}
          tools={tools}
          memory={memorySummary}
          onQueueSelect={selectScene}
          onContextSelect={(item) => setInstruction(`请打开并补全 ${item.label}（${item.filePath}），用于本轮生产上下文。`)}
          onClose={() => setContextOpen(false)}
        />
      )}

      <section className="main">
        {navPageKind ? (
          <NavPage
            section={navPageKind}
            projectTitle={brief.title}
            assets={assets}
            pipeline={pipeline}
            contextStack={ctxStack}
            history={projectList}
            historyLoading={projectListLoading}
            activeProjectId={workspace.projectId}
            stageName={(stage) => studioStageName(stage as StudioStageId)}
            onBack={() => setNavSection('mission')}
            onStart={startFromNav}
            onNewProject={() => {
              void resetProject(workspace.mode);
              setNavSection('mission');
            }}
            onOpenHistoryProject={(id) => void openProjectFromHistory(id)}
            onDeleteHistoryProject={(id) => void deleteProjectFromHistory(id)}
          />
        ) : homeMode ? (
          <div className="home-view">
            <div className="home-top">
              <button type="button" className="btn" onClick={() => navigate('projects')} title="打开历史项目档案">
                <IconClock /> 历史项目
              </button>
              <div className="mode-switch" role="group" aria-label="创作模式">
                <button type="button" className={autopilot ? '' : 'on'} onClick={() => setAutopilot(false)} title="协作：逐步确认，每个 patch 人工审批">
                  <IconUsers /> 协作
                </button>
                <button type="button" className={autopilot ? 'on' : ''} onClick={() => setAutopilot(true)} title="托管：自动合并低风险变更，高风险仍需确认">
                  <IconBolt /> 托管
                </button>
              </div>
              <button
                type="button"
                data-testid="model-settings-trigger"
                className={`provider-pill ${online ? 'online' : ''}`}
                title={`${providerHint(provider)}，点击配置模型`}
                onClick={() => setModelPanelOpen(true)}
              >
                <span className="dot" />
                <span className="ptxt">{providerLabel(provider)}</span>
              </button>
            </div>

            <div className="home-scroll">
              <div className="home-inner">
                <div className="home-greeting">
                  <span className="home-mark">
                    <IconSparkles />
                  </span>
                  <h1>{greeting()}，{workspace.mode === 'creator' ? '创作者' : '老板'}！</h1>
                </div>
                <p className="home-sub">
                  描述一个内容目标，主 Agent 自动派发专项 Agent，产出脚本、分镜、素材提示词、发布文案与合规检查。
                </p>

                <div className="home-composer-wrap">
                  <form
                    className="home-composer"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void runAgent();
                    }}
                  >
                    <textarea
                      value={instruction}
                      onChange={(event) => setInstruction(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                          event.preventDefault();
                          void runAgent();
                        }
                      }}
                      placeholder="输入想法、产品、活动或参考，试试 脚本 / 分镜 / Prompt / 合规，和 Agent 一起创作…"
                      aria-label="给主 Agent 发送内容目标"
                    />
                    <div className="home-composer-bar">
                      <div className="home-tools">
                        <button
                          type="button"
                          className="home-tool icon-only"
                          title="添加参考：粘贴链接或描述"
                          onClick={() => setInstruction(`${instruction}\n参考：`.trimStart())}
                        >
                          <IconPlus />
                        </button>
                        <button type="button" className="home-tool" onClick={() => setInstruction(`${instruction}\n先写脚本（口播 / 字幕 / 标题 / CTA）`.trim())}>
                          <IconScript /> 剧本
                        </button>
                        <button
                          type="button"
                          className={`home-tool ${homeMenu === 'skill' ? 'on' : ''}`}
                          onClick={() => setHomeMenu((m) => (m === 'skill' ? null : 'skill'))}
                        >
                          <IconSparkles /> 场景
                          <IconChevron style={{ width: 11, height: 11, transform: 'rotate(90deg)' }} />
                        </button>
                        <button
                          type="button"
                          className={`home-tool ${homeMenu === 'length' ? 'on' : ''}`}
                          title="成片总时长"
                          onClick={() => setHomeMenu((m) => (m === 'length' ? null : 'length'))}
                        >
                          <IconClock /> {episodeLengthLabel(videoSpec.episodeSeconds)}
                          <IconChevron style={{ width: 11, height: 11, transform: 'rotate(90deg)' }} />
                        </button>
                        <button
                          type="button"
                          className={`home-tool ${homeMenu === 'agent' ? 'on' : ''}`}
                          onClick={() => setHomeMenu((m) => (m === 'agent' ? null : 'agent'))}
                        >
                          <IconCpu /> {taskAgentOptions.find((a) => a.id === taskAgent)?.label || 'Agent'}
                          <IconChevron style={{ width: 11, height: 11, transform: 'rotate(90deg)' }} />
                        </button>
                        <button
                          type="button"
                          className={`home-tool ${homeMenu === 'style' ? 'on' : ''}`}
                          onClick={() => setHomeMenu((m) => (m === 'style' ? null : 'style'))}
                        >
                          <IconWand /> 风格
                          <IconChevron style={{ width: 11, height: 11, transform: 'rotate(90deg)' }} />
                        </button>
                        <button
                          type="button"
                          className="home-tool"
                          title="使用素材库素材"
                          onClick={() => setInstruction(`${instruction}\n使用我素材库里的素材，注意授权状态`.trim())}
                        >
                          <IconStack /> 资产
                        </button>
                        <button
                          type="button"
                          className={`home-spec-chip clickable ${homeMenu === 'spec' ? 'on' : ''}`}
                          title="点击修改视频规格"
                          onClick={() => setHomeMenu((m) => (m === 'spec' ? null : 'spec'))}
                        >
                          <IconGauge /> {videoSpec.platform} · {videoSpec.aspectRatio} · {cameraMoveLabel(videoSpec.cameraMove)}
                          <IconChevron style={{ width: 11, height: 11, transform: 'rotate(90deg)' }} />
                        </button>
                      </div>
                      <button className="send-btn" type="submit" disabled={loading || !instruction.trim()} aria-label="发送">
                        <IconSend />
                      </button>
                    </div>
                  </form>

                  {homeMenu === 'spec' && (
                    <div className="home-popover">
                      <div className="hp-grid">
                        <label className="field">
                          平台
                          <select value={videoSpec.platform} onChange={(event) => updateSpec({ platform: event.target.value })}>
                            {platformOptions.map((item) => (
                              <option key={item}>{item}</option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          画幅
                          <select value={videoSpec.aspectRatio} onChange={(event) => updateSpec({ aspectRatio: event.target.value as AspectRatio })}>
                            {aspectOptions.map((item) => (
                              <option key={item.id} value={item.id}>{item.id} · {item.use}</option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          运镜
                          <select value={videoSpec.cameraMove} onChange={(event) => updateSpec({ cameraMove: event.target.value as CameraMove })}>
                            {cameraMoveOptions.map((item) => (
                              <option key={item.id} value={item.id}>{item.label}（{item.tier}）</option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          首尾帧
                          <select value={videoSpec.frameLock} onChange={(event) => updateSpec({ frameLock: event.target.value as FrameLock })}>
                            {frameLockOptions.map((item) => (
                              <option key={item.id} value={item.id}>{item.label} · {item.hint}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                      {/* 成本要出现在做决定的那一刻。放在规格面板底部，是因为改时长和改档位都在这里发生。 */}
                      <div className="hp-budget">{renderBudgetSummary(currentRenderBudget)}</div>
                    </div>
                  )}

                  {homeMenu === 'length' && (
                    <div className="home-popover">
                      <div className="hp-menu-title">成片总时长</div>
                      <div className="hp-skill-list">
                        {EPISODE_LENGTH_PRESETS.map((seconds) => (
                          <button
                            key={seconds}
                            type="button"
                            className={`hp-opt ${normalizeEpisodeSeconds(videoSpec.episodeSeconds) === seconds ? 'on' : ''}`}
                            onClick={() => {
                              updateSpec({ episodeSeconds: seconds });
                              setEpisodeSecondsDraft('');
                            }}
                          >
                            <span className="hp-opt-body">
                              <strong>{episodeLengthLabel(seconds)}</strong>
                              <small>{episodePlan(seconds).segmentCount} 小节 · 约 {estimateShotCount(seconds)} 个镜头</small>
                            </span>
                            {normalizeEpisodeSeconds(videoSpec.episodeSeconds) === seconds && <IconCheck />}
                          </button>
                        ))}
                      </div>
                      <label className="field">
                        自定义秒数（{EPISODE_SECONDS_MIN}–{EPISODE_SECONDS_MAX}）
                        <input
                          type="number"
                          min={EPISODE_SECONDS_MIN}
                          max={EPISODE_SECONDS_MAX}
                          value={episodeSecondsDraft}
                          placeholder={String(normalizeEpisodeSeconds(videoSpec.episodeSeconds))}
                          onChange={(event) => setEpisodeSecondsDraft(event.target.value)}
                          // 输入过程中不写 spec：边打字边 clamp 会让「120」在打到「1」时就跳成 10。
                          onBlur={() => {
                            if (!episodeSecondsDraft.trim()) return;
                            updateSpec({ episodeSeconds: normalizeEpisodeSeconds(episodeSecondsDraft) });
                            setEpisodeSecondsDraft('');
                          }}
                          onKeyDown={(event) => {
                            if (event.key !== 'Enter') return;
                            event.currentTarget.blur();
                          }}
                        />
                      </label>
                      {/* 时长直接决定渲染次数，成本必须和选择放在同一屏 */}
                      <div className="hp-budget">
                        {episodePlan(videoSpec.episodeSeconds).segmentCount} 小节 × 约 {episodePlan(videoSpec.episodeSeconds).segmentSeconds}s · {renderBudgetSummary(currentRenderBudget)}
                      </div>
                    </div>
                  )}

                  {homeMenu === 'skill' && (
                    <div className="home-popover">
                      <div className="hp-skill-list">
                        {allSkills.map((skill) => (
                          <button
                            key={skill.id}
                            type="button"
                            className="hp-skill"
                            onClick={() => {
                              setInstruction(skill.command);
                              setHomeMenu(null);
                            }}
                          >
                            <span className={`np-skill-tier ${skill.tier === 'P0' ? 'p0' : 'p1'}`}>{skill.tier}</span>
                            <span className="hp-skill-body">
                              <strong>{skill.title}</strong>
                              <small>{skill.description}</small>
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {homeMenu === 'agent' && (
                    <div className="home-popover">
                      <div className="hp-menu-title">派给哪个专项任务 Agent</div>
                      <div className="hp-skill-list">
                        {taskAgentOptions.map((agent) => (
                          <button
                            key={agent.id}
                            type="button"
                            className={`hp-opt ${taskAgent === agent.id ? 'on' : ''}`}
                            onClick={() => {
                              setTaskAgent(agent.id);
                              if (agent.id !== 'auto') {
                                setInstruction(`${instruction}\n指定专项任务 Agent：${agent.label}（${agent.hint}）`.trim());
                              }
                              setHomeMenu(null);
                            }}
                          >
                            <span className="hp-opt-body">
                              <strong>{agent.label}</strong>
                              <small>{agent.hint}</small>
                            </span>
                            {taskAgent === agent.id && <IconCheck />}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {homeMenu === 'style' && (
                    <div className="home-popover">
                      <div className="hp-menu-title">视觉风格预设</div>
                      <div className="hp-style-grid">
                        {styleOptions.map((style) => (
                          <button
                            key={style.id}
                            type="button"
                            className={`hp-style ${projectStyle?.id === style.id ? 'on' : ''}`}
                            onClick={() => {
                              applyGlobalStyle(style);
                              setHomeMenu(null);
                            }}
                          >
                            <strong>{style.label}</strong>
                            <small>{style.hint}</small>
                          </button>
                        ))}
                      </div>
                      <form
                        className="hp-style-custom"
                        onSubmit={(event) => {
                          event.preventDefault();
                          const style = customStyle(customStyleText);
                          if (!style) return;
                          applyGlobalStyle(style);
                          setCustomStyleText('');
                          setHomeMenu(null);
                        }}
                      >
                        <input
                          value={customStyleText}
                          onChange={(event) => setCustomStyleText(event.target.value)}
                          placeholder="没有想要的？直接写风格词"
                          aria-label="自定义视觉风格词"
                        />
                        <button type="submit" disabled={!customStyleText.trim()}>使用</button>
                      </form>
                      {projectStyle && (
                        <button type="button" className="hp-style-clear" onClick={() => { applyGlobalStyle(null); setHomeMenu(null); }}>
                          清除风格（当前：{projectStyle.label}）
                        </button>
                      )}
                    </div>
                  )}

                  {homeMenu && <div className="menu-scrim" onClick={() => setHomeMenu(null)} />}
                </div>

                <div className="home-row-head">
                  <h2>快速开始</h2>
                </div>
                <div className="home-cards">
                  <button type="button" className="home-card enter" onClick={() => applyQuickCommand('把我的产品/想法做成一条短视频内容包，先给脚本和分镜')}>
                    <span className="enter-plus">
                      <IconPlus />
                    </span>
                    <strong>进入创作</strong>
                    <small>从一句目标开始</small>
                  </button>
                  {[
                    { t: '新建内容包', d: '想法 → 脚本 / 分镜 / 素材 prompt / 文案', c: '把我的产品/想法做成一条短视频内容包，先给脚本和分镜', Icon: IconSparkles },
                    { t: '旧稿爆改', d: '粘贴旧稿，先诊断再给可审批改稿', c: '把这条旧稿改成更自然的短视频脚本、分镜和素材 prompt', Icon: IconScript },
                    { t: '一周内容计划', d: '7 条选题，每条可展开成完整资产', c: '基于我的账号/品牌，生成一周短视频选题，每条给角度和 CTA', Icon: IconList }
                  ].map(({ t, d, c, Icon }) => (
                    <button key={t} type="button" className="home-card" onClick={() => applyQuickCommand(c)}>
                      <span className="hc-icon">
                        <Icon />
                      </span>
                      <strong>{t}</strong>
                      <small>{d}</small>
                    </button>
                  ))}
                </div>

                <div className="home-row-head">
                  <h2>亮点功能</h2>
                </div>
                <div className="home-features">
                  {[
                    { t: '爆款拆解', d: '拆参考的 Hook、结构与转化路径', c: '拆解我给的爆款参考，提炼可复用的 Hook、结构和情绪，不要直接搬运原文', Icon: IconSparkles, tone: 'a' },
                    { t: '分镜故事板', d: '逐镜画面、运镜与节奏，可单镜重写', c: '把这条视频拆成逐镜分镜，给画面、动作、运镜和时长', Icon: IconFilm, tone: 'b', tag: 'New' },
                    { t: '多平台改写', d: '一条内容适配小红书 / 抖音 / TikTok', c: '把这条内容改写成小红书、抖音、TikTok 三个版本', Icon: IconStack, tone: 'c' },
                    { t: '视频生成准备', d: '镜头任务、首帧、角色一致性和生成参数', c: '基于已确认的制作包，准备可提交给视频模型的镜头任务、首帧提示、角色一致性提示和生成参数', Icon: IconWand, tone: 'd' }
                  ].map(({ t, d, c, Icon, tone, tag }) => (
                    <button key={t} type="button" className={`home-feature tone-${tone}`} onClick={() => applyQuickCommand(c)}>
                      {tag && <span className="feat-tag">{tag}</span>}
                      <span className="feat-icon">
                        <Icon />
                      </span>
                      <strong>{t}</strong>
                      <small>{d}</small>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : focusMode ? (
          <div className="focus-view">
            <div className="focus-top">
              <button
                type="button"
                data-testid="model-settings-trigger"
                className={`provider-pill ${online ? 'online' : ''}`}
                title={`${providerHint(provider)}，点击配置模型`}
                onClick={() => setModelPanelOpen(true)}
              >
                <span className="dot" />
                <span className="ptxt">{providerLabel(provider)}</span>
              </button>
              <button type="button" className="btn" onClick={openHistoryPanel}>
                <IconClock /> 历史
              </button>
              <button type="button" className="btn" onClick={() => void resetProject(workspace.mode)}>
                <IconPlus /> 新建
              </button>
              {demoWorkspaceId && (
                <button type="button" className="btn" onClick={resetDemoWorkspace}>
                  <IconRefresh /> 重置 Demo
                </button>
              )}
            </div>

            <div className="focus-scroll">
              <div className="focus-inner">
                <section className="focus-panel">
                  <span className={`ms-status ${runStatus}`}>
                    <span className="dot" />
                    {runStatusLabel}
                  </span>
                  <h1>{loading ? '正在创建 Mission' : error ? '创建失败' : '继续描述 Mission'}</h1>
                  <p>{error || '先聚焦目标本身。脚本、分镜和审批会在生成完成后出现。'}</p>

                  {latestUserMessage && (
                    <div className="focus-request">
                      <small>本轮目标</small>
                      <strong>{latestUserMessage.content}</strong>
                    </div>
                  )}

                  {loading && (
                    <div className="focus-running" aria-live="polite">
                      <IconCpu />
                      <span>正在拆解任务、生成脚本和制作包</span>
                      <span className="typing">
                        <i />
                        <i />
                        <i />
                      </span>
                    </div>
                  )}

                  <form
                    className="focus-composer"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void runAgent();
                    }}
                  >
                    <textarea
                      value={instruction}
                      onChange={(event) => setInstruction(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                          event.preventDefault();
                          void runAgent();
                        }
                      }}
                      placeholder="补充平台、受众、风格或不能碰的红线…"
                      aria-label="给主 Agent 发送内容目标"
                      disabled={loading}
                    />
                    <div className="focus-composer-bar">
                      <div className="pill-row">
                        <button type="button" className="pill" onClick={() => setInstruction(`${instruction}\n先写脚本`.trim())} disabled={loading}>
                          <IconScript /> 脚本
                        </button>
                        <button type="button" className="pill" onClick={() => setInstruction(`${instruction}\n补分镜和镜头节奏`.trim())} disabled={loading}>
                          <IconFilm /> 分镜
                        </button>
                        <button type="button" className="pill" onClick={() => setInstruction(`${instruction}\n生成首帧和视频 prompt`.trim())} disabled={loading}>
                          <IconWand /> Prompt
                        </button>
                      </div>
                      <button className="send-btn" type="submit" disabled={loading || !instruction.trim()} aria-label="发送">
                        <IconSend />
                      </button>
                    </div>
                  </form>
                </section>
              </div>
            </div>
          </div>
        ) : (
          <div className={workbenchClassName}>
            {!assistantHidden && <aside className="studio-assistant">
              <div className="studio-assistant-head">
                <span className={`ms-status ${runStatus}`}>
                  <span className="dot" />
                  {runStatusLabel}
                </span>
                <h2>制作助理</h2>
                <p>{committedBrief.title}</p>
              </div>

              <div className="studio-assistant-stream" role="log" aria-live="polite" aria-label="制作过程">
                {visibleMessages.map((message) => (
                  message.kind === 'handoff' && message.handoff ? (
                    <div className="assistant-handoff" key={message.id}>
                      <p>{message.content}</p>
                      <small>{studioStageName(message.handoff.toStage)}阶段开始</small>
                    </div>
                  ) : (
                    <article className={`assistant-msg ${message.role}`} key={message.id}>
                      <strong>{message.role === 'user' ? '我' : message.role === 'system' ? '系统' : '制作助理'}</strong>
                      <p>{message.content}</p>
                    </article>
                  )
                ))}
              </div>

              <form
                className="studio-assistant-composer"
                onSubmit={(event) => {
                  event.preventDefault();
                  void runAgent();
                }}
              >
                <textarea
                  value={instruction}
                  onChange={(event) => setInstruction(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void runAgent();
                    }
                  }}
                  placeholder="输入目标、参考、风格、资产需求…"
                  aria-label="给制作助理发送内容目标"
                />
                <div className="studio-assistant-footer">
                  <div className="studio-assistant-actions">
                    <button type="button" className="assist-chip" onClick={() => setInstruction(`${instruction}\n参考图/素材：`.trimStart())}>
                      <IconPlus /> 图片
                    </button>
                    <button type="button" className="assist-chip" onClick={() => (scriptBody.trim() ? revealScriptOutput() : setInstruction(`${instruction}\n先写剧本`.trim()))}>
                      <IconScript /> 剧本
                    </button>
                    <button type="button" className="assist-chip" onClick={() => setInstruction(`${instruction}\n补角色设定和一致性提示词`.trim())}>
                      <IconUsers /> 角色
                    </button>
                    <button type="button" className="assist-chip" onClick={() => setInstruction(`${instruction}\n补场景和分镜节奏`.trim())}>
                      <IconFilm /> 场景
                    </button>
                    <button type="button" className="assist-chip" onClick={() => setInstruction(`${instruction}\n整理可提交给视频模型的素材提示词`.trim())}>
                      <IconWand /> 技能
                    </button>
                  </div>
                  <button className="studio-send" type="submit" disabled={loading || !instruction.trim()} aria-label="发送">
                    <IconSend />
                  </button>
                </div>
              </form>

              <div className="studio-assistant-section">
                <strong>当前制作包</strong>
                <div className="assistant-metrics">
                  <span>{assets.length} 资产</span>
                  <span>{storyboard.length || scenes.length} 镜头</span>
                  <span>{pendingPatches.length} 待审</span>
                </div>
              </div>

              <div className="studio-assistant-section production-recipes">
                <strong>制作配方</strong>
                {[
                  { label: '产品卖点视频', text: '按产品卖点视频配方，补齐目标客户、痛点、证据、CTA、脚本、场景和视频任务。' },
                  { label: '旧稿爆改', text: '按旧稿爆改配方，先指出当前内容问题，再提交可审批的改写 patch。' },
                  { label: '一周内容计划', text: '按一周内容计划配方，生成 7 条可继续展开的视频选题和资产需求。' },
                  { label: '竞品拆解', text: '按竞品拆解配方，提炼对方 Hook、结构、卖点证据和我们可复用但不抄袭的打法。' },
                  { label: '视频生成准备', text: '按视频生成准备配方，整理镜头任务、首帧、多图参考、角色一致性和 renderQueue。' }
                ].map((recipe) => (
                  <button
                    type="button"
                    className="assistant-action"
                    key={recipe.label}
                    onClick={() => setInstruction(recipe.text)}
                  >
                    <IconSparkles /> {recipe.label}
                  </button>
                ))}
              </div>

              <div className="studio-assistant-section">
                <strong>快捷动作</strong>
                <button type="button" className="assistant-action" onClick={() => setInstruction('把当前内容整理成完整剧本、角色、场景、分镜和视频生成任务。')}>
                  <IconSparkles /> 补齐制作包
                </button>
                <button type="button" className="assistant-action" onClick={() => tryFocusStudioStage('video')}>
                  <IconFilm /> 查看视频任务
                </button>
                <button type="button" className="assistant-action" onClick={() => setModelPanelOpen(true)}>
                  <IconGauge /> 模型与规格
                </button>
              </div>
            </aside>}

            <section className="studio-main">
              <header className="studio-topbar">
                <button
                  type="button"
                  className={`studio-panel-toggle ${assistantHidden ? 'collapsed' : ''}`}
                  aria-pressed={!assistantHidden}
                  aria-label={assistantHidden ? '展开制作助理' : '收起制作助理'}
                  title={assistantHidden ? '展开制作助理' : '收起制作助理'}
                  onClick={() => togglePanelHidden('assistant', !assistantHidden)}
                >
                  <IconPanelLeft />
                </button>
                <div className="studio-title">
                  <small>创作空间</small>
                  <strong>{committedBrief.title}</strong>
                </div>
                <nav className="studio-stage-nav" role="tablist" aria-label="创作阶段">
                  {studioStages.map((stage) => {
                    const stageOpen = stage.id === 'overview' || canOpenProductionStage(productionFlow, stage.id);
                    const lockReason = stage.id === 'overview' ? '' : productionStageLockReason(stage.id);
                    return (
                      <button
                        key={stage.id}
                        type="button"
                        role="tab"
                        aria-label={stageOpen ? `聚焦${stage.label}阶段` : lockReason}
                        aria-disabled={!stageOpen}
                        disabled={!stageOpen}
                        title={stageOpen ? `聚焦${stage.label}阶段` : lockReason}
                        className={activeTab === stage.id ? 'active' : ''}
                        onClick={() => focusStudioStage(stage.id)}
                      >
                        {stage.label}{!stageOpen && <small>未解锁</small>}
                      </button>
                    );
                  })}
                </nav>
                <div className="studio-top-actions">
                  <div className="mode-switch" role="group" aria-label="创作模式">
                    <button type="button" className={autopilot ? '' : 'on'} onClick={() => setAutopilot(false)}>
                      <IconUsers /> 协作
                    </button>
                    <button type="button" className={autopilot ? 'on' : ''} onClick={() => setAutopilot(true)}>
                      <IconBolt /> 托管
                    </button>
                  </div>
                  <button
                    type="button"
                    data-testid="model-settings-trigger"
                    className={`provider-pill ${online ? 'online' : ''}`}
                    title={`${providerHint(provider)}，点击配置模型`}
                    onClick={() => setModelPanelOpen(true)}
                  >
                    <span className="dot" />
                    <span className="ptxt">{providerLabel(provider)}</span>
                  </button>
                  <button type="button" className="btn" onClick={openHistoryPanel}>
                    <IconClock /> 历史
                  </button>
                  <button type="button" className="btn" onClick={() => void resetProject(workspace.mode)}>
                    <IconPlus /> 新建
                  </button>
                  <button
                    type="button"
                    className={`studio-panel-toggle ${inspectorCollapsed ? 'collapsed' : ''}`}
                    aria-pressed={!inspectorCollapsed}
                    disabled={stageReviewSuppressed}
                    aria-label={inspectorHidden ? '展开节点检查器' : '收起节点检查器'}
                    title={stageReviewSuppressed
                      ? '本阶段生成中或已失败，检查器暂时没有可审查的内容'
                      : inspectorHidden ? '展开节点检查器' : '收起节点检查器'}
                    onClick={() => togglePanelHidden('inspector', !inspectorHidden)}
                  >
                    <IconPanelRight />
                  </button>
                </div>
              </header>

              {error && (
                <div className="studio-error-banner" role="alert">
                  <span>{error}</span>
                  <button type="button" aria-label="关闭错误提示" onClick={() => setError('')}>
                    <IconX />
                  </button>
                </div>
              )}

              <div className={`studio-canvas story-canvas-host ${error ? 'with-error-banner' : ''}`}>
                <ProductionCanvas
                  /* 相机是会话状态，按项目分键：不带 projectId，切项目之后视口会串到上一个项目的位置。 */
                  projectId={workspace.projectId}
                  /*
                   * 布局是文档状态，住在已确认的工作区里，跟着项目归档走。
                   * 读已确认的那一份而不是 proposedWorkspace：待审 patch 是产物草稿，
                   * 拿它当布局的来源，会让「审批通过 / 驳回」顺手把用户摆好的画布也改了。
                   */
                  boards={canvasBoards}
                  onBoardsChange={(next) =>
                    setWorkspace((prev) => (prev ? writeCanvasBoards(prev, next) : prev))
                  }
                  lanes={storyLanes}
                  outcome={storyOutcome}
                  activeStage={activeProductionStage}
                  selectedCardId={selectedCanvasCardId}
                  nextGeneratingStage={nextGeneratingStage}
                  generatingProgress={stageBatchProgress}
                  reviewOpen={canvasReviewOpen}
                  reviewTitle={productionReviewHeading[activeProductionStage]}
                  reviewOwner={stageOwnerLabel(activeProductionStage)}
                  reviewSize={activeProductionStage === 'character' ? 'wide' : 'default'}
                  onOpenCard={(lane, card) => {
                    const source = canvasNodes.find((item) => item.stage === lane.stage);
                    if (source) selectCanvasNode(source);
                    else focusStudioStage(lane.stage);
                    setSelectedCanvasCardId(card?.id || '');
                    // 点哪张角色卡，画板就进哪个角色——否则总是停在第一个人身上。
                    const characterId = card?.id?.startsWith('card_character_') ? card.id.slice('card_character_'.length) : '';
                    if (lane.stage === 'character' && characterId) setCharacterBoardId(characterId);
                    setCanvasReviewOpen(true);
                  }}
                  onCloseReview={() => setCanvasReviewOpen(false)}
                  onRegenerate={(lane) => {
                    const source = canvasNodes.find((item) => item.stage === lane.stage);
                    if (source) regenerateProductionStage(source);
                  }}
                  onReplace={(lane) => {
                    const source = canvasNodes.find((item) => item.stage === lane.stage);
                    if (!source) return;
                    selectCanvasNode(source);
                    setCanvasReviewOpen(true);
                    setNodeRevisionText(`替换资产「${source.title}」：请只修改 ${source.filePath}，并说明对下游的影响。`);
                  }}
                  reviewContent={nextGeneratingStage === activeProductionStage ? null : <>
                <section className="production-review-workspace">
                  <div className="studio-board-head">
                    <div>
                      <small>{studioStageLabel}</small>
                      <h1>{activeTab === 'overview' ? previewInfo.hook : productionReviewHeading[activeProductionStage]}</h1>
                    </div>
                    {!activeStageFailed && pendingPatches.length > 0 && (
                      <span className="package-review-badge">
                        <IconGitMerge /> {pendingPatches.length} 个 patch 待审
                      </span>
                    )}
                  </div>

                  {activeTab !== 'overview' && VISUAL_STAGES.includes(activeProductionStage) && (
                    <div className="stage-style-bar">
                      <label htmlFor="stage-style-select">
                        <IconWand /> 视觉风格
                      </label>
                      <select
                        id="stage-style-select"
                        value={styleBook.stages[activeProductionStage]?.id || ''}
                        onChange={(event) => {
                          const picked = STYLE_PRESETS.find((item) => item.id === event.target.value) || null;
                          applyStageStyle(activeProductionStage, picked);
                        }}
                      >
                        <option value="">
                          {projectStyle ? `继承项目风格：${projectStyle.label}` : '未设定风格'}
                        </option>
                        {STYLE_PRESETS.map((style) => (
                          <option key={style.id} value={style.id}>{style.label}</option>
                        ))}
                      </select>
                      <small>
                        {(() => {
                          const resolved = resolveStageStyle(styleBook, activeProductionStage);
                          if (!resolved.style) return '还没选风格，模型会自由发挥画风。';
                          return resolved.source === 'stage'
                            ? `本阶段单独指定「${resolved.style.label}」`
                            : `继承项目风格「${resolved.style.label}」`;
                        })()}
                      </small>
                    </div>
                  )}

                  {styleWarnings.map((warning) => (
                    <div className="stage-style-drift" role="status" key={warning}>
                      <IconWand /> {warning}
                    </div>
                  ))}

                  {activeStageFailed ? (
                    <div className="production-failed-review" role="alert">
                      <IconRefresh />
                      <strong>{studioStageName(activeProductionStage)}生成已中断</strong>
                      <p>{activeProductionRecord.error || '本轮生成没有完成，旧草稿不会恢复为当前审查结果。'}</p>
                      <button
                        type="button"
                        className="btn primary"
                        onClick={() => {
                          const source = canvasNodes.find((node) => node.stage === activeProductionStage);
                          if (source) regenerateProductionStage(source);
                        }}
                      >
                        <IconRefresh /> 重新生成{studioStageName(activeProductionStage)}
                      </button>
                    </div>
                  ) : activeStageHasQuarantinedDraft ? (
                    <div className="production-quarantined-review" role="alert">
                      <IconShieldCheck />
                      <strong>旧草稿已隔离</strong>
                      <p>{activeStageQuarantineReason}这一版不会进入预览和审批。请重新生成{studioStageName(activeProductionStage)}。</p>
                      <button
                        type="button"
                        className="btn primary"
                        onClick={() => {
                          const source = canvasNodes.find((node) => node.stage === activeProductionStage);
                          if (source) regenerateProductionStage(source);
                        }}
                      >
                        <IconRefresh /> 重新生成{studioStageName(activeProductionStage)}
                      </button>
                    </div>
                  ) : <>
                  {activeTab === 'overview' && (
                    <div className="studio-overview-grid">
                      <div className="studio-kpi accent">
                        <strong>{visibleTaskCount}/{expectedTaskCount}</strong>
                        <span>{missingTaskCount ? `${missingTaskCount} 个任务待补齐` : '视频任务'}</span>
                      </div>
                      <div className="studio-kpi">
                        <strong>{assets.length}</strong>
                        <span>项目资产</span>
                      </div>
                      <div className="studio-kpi">
                        <strong>{pendingPatches.length}</strong>
                        <span>待审写入</span>
                      </div>
                      <div className={`studio-kpi ${warningChecks.length ? 'warn' : ''}`}>
                        <strong>{warningChecks.length}</strong>
                        <span>风险提醒</span>
                      </div>
                    </div>
                  )}

                  {activeTab === 'script' && (
                    <section className="production-script-review">
                      <label htmlFor="production-script-body">完整脚本</label>
                      <textarea
                        id="production-script-body"
                        value={scriptDraft}
                        onChange={(event) => setScriptDraft(event.target.value)}
                        placeholder="脚本正文会显示在这里。"
                      />
                      <div className="production-review-actions">
                        <button type="button" className="btn sm" onClick={saveScriptDraft} disabled={!scriptDraft.trim()}>
                          <IconGitMerge /> 保存修改
                        </button>
                        <button type="button" className="btn primary" onClick={() => void confirmProductionStage('script')}>
                          <IconCheck /> 确认脚本，交给{stageOwnerName('character')}
                        </button>
                      </div>
                    </section>
                  )}

                  {activeTab === 'character' && (
                    <div className="studio-character-preview">
                      <div className="character-stage-head">
                        <small>Character Design</small>
                        <strong>{visibleCharacterAssets.length ? '角色设计台' : '角色设定待生成'}</strong>
                        <p>先看到并调整真实角色图，再确认 Face ID、年龄阶段、多视角和表情资产。未经确认的角色图不会静默替换视频任务。</p>
                      </div>
                      {characterTemplateFallback === 'repaired' && (
                        <div className="character-template-alert warn" role="status">
                          <IconAlert />
                          <div>
                            <strong>模型漏了一些字段，系统已逐个角色补齐</strong>
                            <p>
                              人物本身来自你的剧本，只有缺失的字段是系统补的。补齐项写在这条待审 patch 的说明里，
                              确认前请核对一下——尤其是年龄和服装，补出来的值只是占位。
                            </p>
                          </div>
                        </div>
                      )}
                      {(characterTemplateFallback === 'missing' || characterTemplateFallback === 'invalid') && (
                        <div className="character-template-alert" role="alert">
                          <IconAlert />
                          <div>
                            <strong>这份角色设定不是按你的剧本生成的</strong>
                            <p>
                              {characterTemplateFallback === 'missing'
                                ? '模型没有产出 characters.json，'
                                : '模型产出的 characters.json 连逐个角色补齐都救不回来，'}
                              当前显示的是内置通用模板：角色名、年龄档和人物描述都与剧本无关，据此生成的角色图同样无效。
                              请先重新生成角色，不要在这份数据上继续补设定。
                            </p>
                            <button
                              type="button"
                              className="btn sm"
                              onClick={() => {
                                const source = canvasNodes.find((node) => node.stage === 'character');
                                if (source) regenerateProductionStage(source);
                              }}
                            >
                              <IconRefresh /> 重新生成角色
                            </button>
                          </div>
                        </div>
                      )}
                      {characterRosterShortfall && (
                        <div className="character-template-alert" role="alert">
                          <IconAlert />
                          <div>
                            <strong>角色数量和剧本对不上</strong>
                            <p>{characterRosterShortfall}</p>
                            <button
                              type="button"
                              className="btn sm"
                              onClick={() => {
                                const source = canvasNodes.find((node) => node.stage === 'character');
                                if (source) regenerateProductionStage(source);
                              }}
                            >
                              <IconRefresh /> 重新生成角色
                            </button>
                          </div>
                        </div>
                      )}
                      {characterRosterAlert && (
                        <div className="character-template-alert warn" role="status">
                          <IconAlert />
                          <div><p>{characterRosterAlert}</p></div>
                        </div>
                      )}
                      {/* 出图张数写在用户看得见的地方：四个身份参考位和表情板改成自动生成之后，
                          角色阶段的开销翻了一倍多，静默烧钱正是这套流水线反复警惕的那件事。 */}
                      {visibleCharacterAssets.length > 0 && (
                        <div className="character-design-notice">{characterImageBudget}</div>
                      )}
                      {roleDesignNotice && <div className="character-design-notice">{roleDesignNotice}</div>}
                      <CharacterDesignBoard
                        characters={characterBoardEntries}
                        activeId={activeBoardCharacterId}
                        onSelectCharacter={(characterId) => setCharacterBoardId(characterId)}
                        activeTab={characterBoardTab}
                        onSelectTab={(tab) => setCharacterBoardTab(tab)}
                        slotStates={characterSlotStates}
                        onVisualChange={persistCharacterVisual}
                        onGenerateImage={(characterId, slot) => void generateCharacterVisualImage(characterId, slot)}
                        onUploadImage={uploadCharacterVisualImage}
                        onSubmitReview={(characterId) => updateCharacterReviewStatus(characterId, 'ready_for_review')}
                        onConfirmReview={(characterId) => updateCharacterReviewStatus(characterId, 'confirmed')}
                        onRequestChanges={(characterId) => updateCharacterReviewStatus(characterId, 'needs_changes')}
                        emptyHint="角色资产会从已确认剧本中抽取。请让制作助理补齐角色外观、服装、表情、风格和跨镜头一致性。"
                        imageWorkspace={
                          <div className="character-asset-grid">
                            {activeBoardCharacters.map((character, boardIndex) => {
                            const characterIndex = activeBoardCharacterIndex >= 0 ? activeBoardCharacterIndex : boardIndex;
                            const selectedExpressions = selectedExpressionIdsFor(character.id);
                            const selectedStrategy = selectedReferenceStrategyFor(character.id);
                            const variants = characterVariantsFor(character, characterIndex);
                            const activeVariant = activeCharacterVariantFor(character, characterIndex);
                            const faceAnchorVariant = faceAnchorVariantFor(character, characterIndex);
                            const requestedPreviewKind = roleDesignPreviewKinds[character.id] || 'portrait';
                            const requestedRender = characterDesignRenderFor(character, activeVariant, requestedPreviewKind);
                            const portraitRender = characterDesignRenderFor(character, activeVariant, 'portrait');
                            const previewImageUrl = requestedRender.imageUrl || portraitRender.imageUrl;
                            const faceImageUrl = resolvedCharacterImage(character, faceAnchorVariant, 'portrait');
                            const previewKindLabel =
                              requestedPreviewKind === 'portrait' ? '角色主图' : requestedPreviewKind === 'multi_view' ? '多视角设定' : '表情板';
                            return (
                              <article className="character-asset-card" key={character.id}>
                                <header className="character-asset-heading">
                                  <div>
                                    <span>{character.role}</span>
                                    <strong>{character.name}</strong>
                                  </div>
                                  <p>{character.description}</p>
                                </header>

                                <div className="character-design-layout">
                                  <aside className="character-face-id">
                                    <div className="character-face-preview">
                                      {faceImageUrl ? (
                                        <img src={faceImageUrl} alt={`${character.name} Face ID`} />
                                      ) : (
                                        <div className="character-image-empty"><IconCamera /><span>待生成</span></div>
                                      )}
                                      <span>Face ID</span>
                                    </div>
                                    <div>
                                      <strong>{faceAnchorVariant.label}</strong>
                                      <small>{faceAnchorVariant.ageLabel} · 身份锚点</small>
                                    </div>
                                    <button
                                      type="button"
                                      className="btn sm"
                                      disabled={!portraitRender.imageUrl || faceAnchorVariant.id === activeVariant.id}
                                      onClick={() => {
                                        setRoleFaceAnchorDrafts((prev) => ({ ...prev, [character.id]: activeVariant.id }));
                                        persistCharacterMetadata(character.id, { faceAnchorVariantId: activeVariant.id }, `更新「${character.name}」Face ID 年龄锚点`);
                                      }}
                                    >
                                      <IconCamera /> {faceAnchorVariant.id === activeVariant.id ? '当前 Face ID' : '设为 Face ID'}
                                    </button>
                                  </aside>

                                  <section className="character-design-workspace">
                                    <div className={`character-design-visual ${requestedRender.status}`}>
                                      {previewImageUrl ? (
                                        <img src={previewImageUrl} alt={`${character.name}${activeVariant.label}${previewKindLabel}`} />
                                      ) : (
                                        <div className="character-image-empty">
                                          <IconCamera />
                                          <strong>还没有角色图</strong>
                                          <span>点击“重新生成”创建第一张角色设计</span>
                                        </div>
                                      )}
                                      <div className="character-visual-badges">
                                        <span>{activeVariant.label} · {activeVariant.ageLabel}</span>
                                        <span>{previewKindLabel}</span>
                                      </div>
                                      {requestedRender.status === 'generating' && (
                                        <div className="character-generating-overlay">
                                          <IconRefresh />
                                          <strong>角色设计生成中</strong>
                                          <span>会保留当前 Face ID 与年龄约束</span>
                                        </div>
                                      )}
                                    </div>
                                    {requestedRender.status === 'error' && <div className="character-render-error">{requestedRender.error}</div>}

                                    <div className="character-stage-variants" aria-label={`${character.name} 年龄阶段`}>
                                      {variants.map((variant) => {
                                        const variantImage = resolvedCharacterImage(character, variant, 'portrait');
                                        const active = variant.id === activeVariant.id;
                                        const faceAnchor = variant.id === faceAnchorVariant.id;
                                        return (
                                          <button
                                            type="button"
                                            key={variant.id}
                                            className={active ? 'active' : ''}
                                            aria-pressed={active}
                                            onClick={() => {
                                              setRoleActiveVariantDrafts((prev) => ({ ...prev, [character.id]: variant.id }));
                                              setRoleDesignPreviewKinds((prev) => ({ ...prev, [character.id]: 'portrait' }));
                                            }}
                                          >
                                            <span className="character-stage-thumb">
                                              {variantImage ? <img src={variantImage} alt="" /> : <IconCamera />}
                                            </span>
                                            <span><strong>{variant.label}</strong><small>{variant.ageLabel}</small></span>
                                            {faceAnchor && <em>Face ID</em>}
                                          </button>
                                        );
                                      })}
                                    </div>

                                    <div className="character-design-menu" aria-label={`${character.name} 角色图操作`}>
                                      <button
                                        type="button"
                                        disabled={requestedRender.status === 'generating'}
                                        onClick={() => void regenerateCharacterDesign(character, activeVariant, requestedPreviewKind, characterIndex)}
                                      >
                                        <IconRefresh /> <span>{previewImageUrl ? '重新生成' : '生成角色设计'}</span>
                                      </button>
                                      <label>
                                        <IconUpload /> <span>替换</span>
                                        <input
                                          type="file"
                                          accept="image/*"
                                          onChange={(event) => {
                                            replaceCharacterDesign(character, activeVariant, event.target.files?.[0]);
                                            event.target.value = '';
                                          }}
                                        />
                                      </label>
                                      <button type="button" disabled={!previewImageUrl} onClick={() => void copyCharacterDesign(previewImageUrl)}>
                                        <IconCopy /> <span>复制</span>
                                      </button>
                                      <button
                                        type="button"
                                        disabled={!previewImageUrl}
                                        onClick={() => void downloadCharacterDesign(previewImageUrl, `${character.name}-${activeVariant.label}-${previewKindLabel}.png`)}
                                      >
                                        <IconDownload /> <span>下载</span>
                                      </button>
                                    </div>

                                    <div className="character-derived-actions">
                                      <button type="button" className="btn sm" onClick={() => void regenerateCharacterDesign(character, activeVariant, 'multi_view', characterIndex)}>
                                        <IconLayers /> 生成多视角
                                      </button>
                                      <button type="button" className="btn sm" onClick={() => void regenerateCharacterDesign(character, activeVariant, 'expression_sheet', characterIndex)}>
                                        <IconSparkles /> 生成表情板
                                      </button>
                                      <button
                                        type="button"
                                        className="btn sm"
                                        disabled={!previewImageUrl}
                                        onClick={() => proposeCharacterLibraryPatch(character, activeVariant, previewImageUrl, requestedPreviewKind)}
                                      >
                                        <IconPlus /> 加入资产库
                                      </button>
                                    </div>
                                  </section>

                                  <section className="character-preflight-panel">
                                    <div className="character-control-head">
                                      <div>
                                        <small>视频前角色调整</small>
                                        <strong>参考策略与表情范围</strong>
                                      </div>
                                      <span>{selectedExpressions.length}/{CHARACTER_EXPRESSION_OPTIONS.length} 表情</span>
                                    </div>

                                    <div className="character-reference-row" aria-label={`${character.name} 参考策略`}>
                                      {CHARACTER_REFERENCE_STRATEGIES.map((strategy) => (
                                        <button
                                          key={strategy.id}
                                          type="button"
                                          className={`character-reference-btn ${selectedStrategy.id === strategy.id ? 'active' : ''}`}
                                          aria-pressed={selectedStrategy.id === strategy.id}
                                          title={strategy.hint}
                                          onClick={() => {
                                            setRoleReferenceStrategyDrafts((prev) => ({ ...prev, [character.id]: strategy.id }));
                                            persistCharacterMetadata(character.id, { referenceStrategy: strategy.id }, `更新「${character.name}」参考策略`);
                                          }}
                                        >
                                          {strategy.id === 'face_id' ? <IconCamera /> : strategy.id === 'multi_view' ? <IconLayers /> : <IconWand />}
                                          <span>{strategy.label}</span>
                                        </button>
                                      ))}
                                    </div>

                                    <div className="character-expression-grid" aria-label={`${character.name} 表情选项`}>
                                      {CHARACTER_EXPRESSION_OPTIONS.map((expression) => {
                                        const active = selectedExpressions.includes(expression.id);
                                        return (
                                          <button
                                            key={expression.id}
                                            type="button"
                                            className={`character-expression-chip ${active ? 'active' : ''}`}
                                            aria-pressed={active}
                                            title={expression.prompt}
                                            onClick={() => {
                                              const current = selectedExpressionIdsFor(character.id);
                                              const next = current.includes(expression.id)
                                                ? current.filter((id) => id !== expression.id)
                                                : [...current, expression.id];
                                              toggleCharacterExpression(character.id, expression.id);
                                              persistCharacterMetadata(character.id, { expressionIds: next }, `更新「${character.name}」表情范围`);
                                            }}
                                          >
                                            {expression.label}
                                          </button>
                                        );
                                      })}
                                    </div>

                                    <label className="character-adjustment-field">
                                      <span>补充角色调整要求</span>
                                      <textarea
                                        value={roleAdjustmentDrafts[character.id] || ''}
                                        onChange={(event) => setRoleAdjustmentDrafts((prev) => ({ ...prev, [character.id]: event.target.value }))}
                                        placeholder={`例如：${character.name} 进入大学阶段后更成熟，但眉眼、发型和体型不要变。`}
                                        rows={3}
                                      />
                                    </label>

                                    <div className="character-asset-consistency">
                                      <small>角色一致性</small>
                                      <p>{character.consistency}</p>
                                    </div>
                                    {character.negativePrompt && (
                                      <details className="character-negative">
                                        <summary>查看避免项</summary>
                                        <p>{character.negativePrompt}</p>
                                      </details>
                                    )}

                                    <div className="character-asset-actions">
                                      <button
                                        type="button"
                                        className="btn sm"
                                        onClick={() => setNodeRevisionText(`我要修改角色「${character.name}」：请只修改 characters.json 中这个角色的身份、外观、一致性提示词、参考策略和表情要求，不要改动已生成脚本。`)}
                                      >
                                        <IconWand /> 修改文字设定
                                      </button>
                                      <button
                                        type="button"
                                        className="btn primary sm"
                                        disabled={!portraitRender.imageUrl}
                                        onClick={() => proposeCharacterReferencePatch(character, activeVariant, portraitRender.imageUrl)}
                                      >
                                        <IconGitMerge /> 写入角色草稿
                                      </button>
                                    </div>
                                  </section>
                                </div>
                              </article>
                            );
                            })}
                          </div>
                        }
                      />
                      <div className="production-review-actions stage-confirmation">
                        <button
                          type="button"
                          className="btn primary"
                          disabled={characterAssetIssues.length > 0}
                          title={characterAssetIssues[0] || ''}
                          onClick={() => void confirmProductionStage('character')}
                        >
                          <IconCheck /> 确认角色，交给{stageOwnerName('scene')}
                        </button>
                        {characterAssetIssues[0] && <small>{characterAssetIssues[0]}</small>}
                        {characterRosterAlert && <small className="stage-alert">{characterRosterAlert}</small>}
                      </div>
                    </div>
                  )}

                  {activeTab === 'scene' && (
                    <div className="studio-scene-stage">
                      <SceneVisualBoard
                        masters={sceneMasters}
                        scenes={productionScenes}
                        characters={charactersFromWorkspace(proposedWorkspace)}
                        continuityReports={sceneContinuity}
                        busy={activeProductionRecord.status === 'generating'}
                        notice={sceneDesignNotice || sceneFallbackNotice}
                        onUpdateMaster={persistSceneMasterChange}
                        onRegenerateSceneImage={(sceneId) => void regenerateSceneImage(sceneId)}
                        onReplaceSceneImage={replaceSceneImageFile}
                        onRegenerateMasterView={(masterId, viewId) => void regenerateSceneMasterView(masterId, viewId)}
                        onReplaceMasterView={replaceSceneMasterViewFile}
                        onRequestRevision={setNodeRevisionText}
                      />
                      <div className="scene-confirmation">
                        <button type="button" className="btn primary sm" disabled={sceneAssetIssues.length > 0} title={sceneAssetIssues[0] || ''} onClick={() => void confirmProductionStage('scene')}>
                          <IconCheck /> 确认场景，交给{stageOwnerName('storyboard')}
                        </button>
                        {sceneAssetIssues[0] && <small>{sceneAssetIssues[0]}</small>}
                      </div>
                    </div>
                  )}

                  {activeTab === 'storyboard' && (
                    <div className="production-storyboard-review">
                      <div className="storyboard">
                        {storyboard.map((shot, index) => {
                          const record = safeParseJson<{ scenes?: Array<Record<string, unknown>> }>(getFile(proposedWorkspace, 'storyboard.json')?.content || '', {})
                            .scenes?.find((item) => item.id === shot.id) || {};
                          const value = (key: string, fallback = '未标注') => typeof record[key] === 'string' && record[key] ? record[key] as string : fallback;
                          // characterIds 存的是角色 id，直接显示 lead_01 对审查没用，换回姓名。
                          const characterNames = Array.isArray(record.characterIds)
                            ? record.characterIds
                                .filter((item): item is string => typeof item === 'string')
                                .map((id) => storyboardCharacterName(id))
                                .join('、')
                            : '';
                          // 生成指令要求的是 sourceSceneId；sceneId 只是老数据的兼容读法。
                          const sceneName = storyboardSceneTitle(
                            value('sourceSceneId', value('sceneId', ''))
                          ) || shot.title;
                          return (
                            <article className="production-storyboard-card" key={shot.id}>
                              <header><span>镜头 {String(index + 1).padStart(2, '0')}</span><strong>{shot.durationSeconds}s</strong></header>
                              <dl>
                                <div><dt>脚本段落</dt><dd>{value('scriptSegment', shot.subtitle || shot.title)}</dd></div>
                                <div><dt>角色</dt><dd>{characterNames || '未标注'}</dd></div>
                                <div><dt>场景</dt><dd>{sceneName}</dd></div>
                                <div><dt>景别</dt><dd>{value('shotSize')}</dd></div>
                                {/* 兜底显示的是全局默认运镜，标出来，免得被当成模型逐镜给的设计 */}
                                <div><dt>运镜</dt><dd>{value('cameraMove', `${cameraMoveLabel(videoSpec.cameraMove)}（全局默认）`)}</dd></div>
                                <div><dt>动作</dt><dd>{value('action', shot.visual)}</dd></div>
                                <div><dt>对白</dt><dd>{value('dialogue', '无台词')}</dd></div>
                                <div><dt>构图</dt><dd>{value('composition')}</dd></div>
                                <div><dt>景深</dt><dd>{value('depthOfField')}</dd></div>
                                <div><dt>光线</dt><dd>{value('lightingNote')}</dd></div>
                                <div><dt>情绪节拍</dt><dd>{value('emotionBeat')}</dd></div>
                                <div><dt>首帧引用</dt><dd>{value('firstFrameReference', value('referenceImageUrl'))}</dd></div>
                              </dl>
                              <button type="button" className="btn sm" onClick={() => rewriteShot(shot.id, 'visual')}><IconWand /> 修改镜头</button>
                            </article>
                          );
                        })}
                      </div>
                      {storyboardFramingGaps(proposedWorkspace).length > 0 && (
                        <div className="storyboard-framing-alert">
                          <strong>{storyboardFramingGaps(proposedWorkspace).length} 个镜头缺少机位信息</strong>
                          <p>
                            景别、拍摄角度、机位高度这三栏决定人物和空间的比例与透视。空着的话视频模型会自行决定视角，
                            成片里常见的表现是「按正常视角看，这个场景和人物不可能是这个角度」。
                          </p>
                          <button type="button" className="btn sm" onClick={fillShotFraming}>
                            <IconWand /> 补齐镜头机位
                          </button>
                        </div>
                      )}
                      <div className="storyboard-framing-alert">
                        <strong>按镜头生成首帧图（可选）</strong>
                        <p>
                          默认一场共用一张场次主图。同一场里景别不同的镜头共用它时，那张图只有一个取景，
                          而图生视频里首帧的构图权重高于提示词——「这一镜是特写」会被首帧按回去。
                          按镜头出图能解决这个问题，代价是图片生成次数从场次数变成镜头数
                          （当前 {storyboard.length} 个镜头）。
                        </p>
                        <button type="button" className="btn sm" onClick={() => void generateShotFirstFrames()}>
                          <IconWand /> 按镜头生成首帧图
                        </button>
                      </div>
                      <div className="production-review-actions stage-confirmation">
                        <button type="button" className="btn primary" onClick={() => void confirmProductionStage('storyboard')}>
                          <IconCheck /> 确认分镜，交给{stageOwnerName('video')}
                        </button>
                      </div>
                    </div>
                  )}

                  {activeTab === 'video' && (
                    <div className="video-stage">
                      <div className="video-stage-head">
                        <h2>视频生成准备</h2>
                        <p>把已确认的脚本、分镜和素材提示词整理成视频模型任务</p>
                      </div>
                      {autoCutSuggestions.length > 0 && (
                        <div className="auto-cut-panel">
                          <div className="auto-cut-head">
                            <h3>自动剪辑建议</h3>
                            <p>{autoCutSummary(autoCutPlan)}</p>
                          </div>
                          <ul className="auto-cut-list">
                            {autoCutSuggestions.map((item) => (
                              <li key={item.shotId} className={`auto-cut-item ${item.action}`}>
                                <label>
                                  {/* flag 只是提醒，没有可执行的动作，所以不给勾选框——
                                      给了会让用户以为勾上系统就替他决定了。 */}
                                  {item.action !== 'flag' && (
                                    <input
                                      type="checkbox"
                                      checked={acceptedAutoCutIds.includes(item.shotId)}
                                      disabled={isFinalCutInFlight(productionFlow.finalCut) || stitchStarting}
                                      onChange={(event) => setAcceptedAutoCutIds((prev) => event.target.checked
                                        ? [...prev, item.shotId]
                                        : prev.filter((id) => id !== item.shotId))}
                                    />
                                  )}
                                  <span className="auto-cut-label">
                                    第 {item.shotNumber} 镜 · {item.label}
                                    {item.action === 'trim' && `（${item.originalDurationSeconds}s → ${item.durationSeconds}s）`}
                                    {item.action === 'drop' && `（删掉 ${item.originalDurationSeconds}s）`}
                                  </span>
                                </label>
                                <p className="auto-cut-detail">{item.detail}</p>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <VideoGenHandoff
                        ready={handoffReady}
                        missing={handoffMissing}
                        data={{
                          visualStyle: assetPrompts.visualStyle,
                          renderSpec: {
                            ...(assetPrompts.renderSpec || {}),
                            cameraMove: cameraMoveLabel(videoSpec.cameraMove),
                            frameLock: frameLockLabel(videoSpec.frameLock)
                          },
                          character: assetPrompts.characterConsistency,
                          prompts: normalizedVideoPrompts(assetPrompts),
                          renderQueue: assetPrompts.renderQueue
                        }}
                        jobs={productionFlow.videoJobs}
                        batchStatus={videoBatchStatus(
                          productionFlow.videoJobs as VideoRenderJob[],
                          normalizedVideoPrompts(assetPrompts).length
                        )}
                        stageStatus={productionFlow.stages.video.status}
                        confirming={videoConfirming}
                        editingDisabled={hasActiveVideoJobs(workspace) || isFinalCutInFlight(productionFlow.finalCut)}
                        finalCut={productionFlow.finalCut || null}
                        stitchAvailable={stitchProbe?.available ?? true}
                        stitchHint={stitchProbe?.hint || ''}
                        stitchStarting={stitchStarting}
                        onStitch={() => void startFinalCut()}
                        onPrepare={prepareVideoTaskDraft}
                        onConfirmVideoTasks={() => void confirmVideoTasksAndStartRendering()}
                        onRetryFailed={() => void retryFailedVideoTasks()}
                        onUpdatePrompt={updateVideoTaskPrompt}
                        onReplaceReference={replaceVideoTaskReference}
                        onReprepareShot={reprepareVideoTask}
                      />
                    </div>
                  )}
                  </>}
                </section>
                  </>}
                />
              </div>
            </section>

            {!inspectorCollapsed && <aside className="studio-current">
              <div className="studio-current-head">
                <small>当前节点检查器</small>
                <h2>{selectedNode?.label || studioStageLabel}</h2>
                <p>{selectedProductionRecord.status === 'generating'
                  ? '新版本返回后开放审查'
                  : selectedProductionRecord.status === 'failed'
                    ? '请先重新生成，再进入审查'
                    : selectedNode?.filePath || selectedAssetFileName}</p>
              </div>

              {selectedProductionRecord.status !== 'generating' && selectedProductionRecord.status !== 'failed' && <>
              {selectedNode && (
                <section className="studio-inspector-panel node-detail-panel">
                  <div className="studio-inspector-title">
                    <IconLayers />
                    <div>
                      <strong>{selectedNode.title}</strong>
                          <small>{selectedNode.owner} · {productionStageStatusText(selectedProductionRecord.status)}</small>
                    </div>
                  </div>
                  <div className={`dependency-health ${selectedNode.dependencyState}`}>
                    <span>{dependencyStateText(selectedNode.dependencyState)}</span>
                    <strong>{selectedNode.dependencySource}</strong>
                    <p>{selectedNode.dependencyReason}</p>
                  </div>
                  <dl className="production-confirmation-record" aria-label="阶段确认记录">
                    <div><dt>已确认版本</dt><dd>{selectedProductionRecord.confirmedVersion ?? '未确认'}</dd></div>
                    <div><dt>确认时间</dt><dd>{selectedProductionRecord.confirmedAt || '未确认'}</dd></div>
                    <div><dt>确认人</dt><dd>{selectedProductionRecord.confirmedBy || '未确认'}</dd></div>
                    <div><dt>来源版本</dt><dd>{Object.entries(selectedProductionRecord.sourceVersions).map(([path, version]) => `${path}@${version}`).join('，') || '无'}</dd></div>
                  </dl>
                  {selectedDecision && renderProductionDecision(selectedDecision)}
                  <div className="node-detail-grid">
                    <div>
                      <span>依赖</span>
                      <p>{selectedNode.dependency}</p>
                    </div>
                    <div>
                      <span>下游影响</span>
                      <p>{selectedNode.impact}</p>
                    </div>
                    <div>
                      <span>审查重点</span>
                      <p>{selectedNode.review}</p>
                    </div>
                  </div>
                  <form
                    className="node-revision-box"
                    onSubmit={(event) => {
                      event.preventDefault();
                      submitNodeRevision();
                    }}
                  >
                    <label htmlFor="node-revision-input">只改这个节点</label>
                    <textarea
                      id="node-revision-input"
                      value={nodeRevisionText}
                      onChange={(event) => setNodeRevisionText(event.target.value)}
                      placeholder={selectedNode.action}
                      disabled={loading}
                    />
                    <div className="node-revision-actions">
                      <button type="button" className="btn sm" disabled={loading} onClick={() => setNodeRevisionText(selectedNode.action)}>
                        <IconSparkles /> 填入建议
                      </button>
                      <button type="submit" className="btn primary sm" disabled={loading}>
                        <IconSend /> 提交节点修改
                      </button>
                    </div>
                  </form>
                </section>
              )}

              {genericSelectedNodePatches.length > 0 && (
                <section className="studio-inspector-panel node-patch-panel">
                  <div className="studio-inspector-title">
                    <IconGitMerge />
                    <div>
                      <strong>当前节点 patch</strong>
                      <small>{genericSelectedNodePatches.length} 个改动等待审批</small>
                    </div>
                  </div>
                  <ApprovalQueue
                    patches={genericSelectedNodePatches}
                    selectedId={selectedPatch?.id || ''}
                    onSelect={(id) => setSelectedPatchId(id)}
                    onApprove={(id) => approvePatchIds([id])}
                    onReject={(id) => rejectPatchIds([id])}
                  />
                  {selectedNodePatchIds.length > 1 && (
                    <button type="button" className="btn primary full" onClick={() => approvePatchIds(selectedNodePatchIds)}>
                      <IconGitMerge /> 合并当前节点全部
                    </button>
                  )}
                </section>
              )}

              <section className="studio-inspector-panel asset-library-panel">
                <div className="studio-inspector-title">
                  <IconStack />
                  <div>
                    <strong>资产库</strong>
                    <small>{libraryItems.length} 个已入库 · {pendingLibraryItems.length} 个待审入库 · {stableLibraryCandidates.length} 个稳定候选</small>
                  </div>
                </div>
                {selectedNode && (
                  <div className={`library-save-card ${selectedNodeCanEnterLibrary ? 'ready' : ''}`}>
                    <span>{selectedNode.label}</span>
                    <strong>
                      {selectedNodeInLibrary
                        ? '当前节点已入库'
                        : selectedNodePendingLibrary
                          ? '入库 patch 待审批'
                          : selectedNodeCanEnterLibrary
                            ? '当前节点可入库'
                            : '当前节点暂不能入库'}
                    </strong>
                    <p>
                      {selectedNodeInLibrary
                        ? '资产库已有同名同源资产。'
                        : selectedNodePendingLibrary
                          ? '已生成 asset_library.json patch，合并后才会成为正式复用资产。'
                        : selectedNodeCanEnterLibrary
                          ? '该节点已确认、无待审改动且依赖正常，可以生成 asset_library.json patch。'
                          : selectedNode
                            ? `${nodeStatusText(selectedNode.status, selectedNode.patchCount, selectedNode.dependencyState)}。先处理依赖或审批，再沉淀为复用资产。`
                            : ''}
                    </p>
                    <button
                      type="button"
                      className="btn primary sm"
                      disabled={!selectedNodeCanEnterLibrary}
                      onClick={() => selectedNode && proposeAssetLibraryPatch(selectedNode)}
                    >
                      <IconGitMerge /> 提议入库
                    </button>
                  </div>
                )}
                <div className="library-list">
                  {libraryItems.length || pendingLibraryItems.length ? (
                    [...pendingLibraryItems.map((item) => ({ ...item, pending: true })), ...libraryItems.map((item) => ({ ...item, pending: false }))]
                      .slice(-4)
                      .reverse()
                      .map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`library-item ${item.pending ? 'pending' : ''}`}
                        onClick={() => {
                          const node = canvasNodes.find((entry) => libraryKeyFor(entry) === libraryItemKey(item));
                          if (node) selectCanvasNode(node);
                        }}
                      >
                        <span>{item.pending ? '待审入库' : studioStageName(item.type)}</span>
                        <strong>{item.title}</strong>
                        <small>{item.sourceFile}</small>
                      </button>
                    ))
                  ) : (
                    <div className="empty compact">还没有稳定资产。只有已确认、无待审、依赖正常的节点才能入库。</div>
                  )}
                </div>
              </section>

              {activeTab === 'video' && (
                <section className="studio-inspector-panel">
                  <div className="studio-inspector-title">
                    <IconGitMerge />
                    <div>
                      <strong>待审批队列</strong>
                      <small>{approvalReady} 个低风险可批准</small>
                    </div>
                  </div>
                  <ApprovalQueue
                    patches={genericPendingPatches}
                    selectedId={selectedPatch?.id || ''}
                    onSelect={(id) => setSelectedPatchId(id)}
                    onApprove={(id) => approvePatchIds([id])}
                    onReject={(id) => rejectPatchIds([id])}
                  />
                </section>
              )}

              <details className="fold studio-fold">
                <summary>
                  <IconGauge style={{ width: 17, height: 17, color: 'var(--text-3)' }} />
                  <div>
                    <strong>模型与视频规格</strong>
                    <div>
                      <small>
                        {videoSpec.platform} · {videoSpec.aspectRatio} · {videoSpec.resolution} · {cameraMoveLabel(videoSpec.cameraMove)} · {frameLockLabel(videoSpec.frameLock)}
                      </small>
                    </div>
                  </div>
                  <span className="chev">
                    <IconChevron />
                  </span>
                </summary>
                <div className="fold-body">
                  <form
                    className="settings-grid model-settings-form"
                    style={{ marginTop: 14 }}
                    autoComplete="off"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void saveModelConfig();
                    }}
                  >
                    <label className="field">
                      平台
                      <select value={videoSpec.platform} onChange={(event) => updateSpec({ platform: event.target.value })}>
                        {platformOptions.map((item) => (
                          <option key={item}>{item}</option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      生成模式
                      <select
                        value={videoSpec.generationMode}
                        onChange={(event) => updateSpec({ generationMode: event.target.value as GenerationMode })}
                      >
                        {generationModes.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.label} · {item.hint}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      运镜
                      <select value={videoSpec.cameraMove} onChange={(event) => updateSpec({ cameraMove: event.target.value as CameraMove })}>
                        {cameraMoveOptions.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.label}（{item.tier}）
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      首尾帧
                      <select value={videoSpec.frameLock} onChange={(event) => updateSpec({ frameLock: event.target.value as FrameLock })}>
                        {frameLockOptions.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.label} · {item.hint}
                          </option>
                        ))}
                      </select>
                    </label>
                    {renderModelSettingsFields('inline-model')}
                  </form>
                </div>
              </details>
              </>}
            </aside>}
          </div>
        )}
      </section>

      {!appFullCanvas && (
        <Inspector
          preview={previewInfo}
          scenes={scenes}
          activeSceneId={activeScene?.id || ''}
          onSceneSelect={selectScene}
          fileName={inspectorFileName}
          fileBody={inspectorFileBody}
          diff={inspectorDiff}
          checks={lastRun?.complianceChecks || []}
          selectedPatch={selectedPatch || null}
          onApprove={(id) => approvePatchIds([id])}
          onReject={(id) => rejectPatchIds([id])}
          onRewrite={(text) => void runAgent(text)}
          onClose={() => setInspectorOpen(false)}
        />
      )}

      {modelPanelOpen && (
        <div className="model-scrim" onClick={() => setModelPanelOpen(false)} />
      )}

      {modelPanelOpen && (
        <div className="model-dialog-wrap" role="dialog" aria-modal="true" aria-label="模型设置">
          <div className="model-dialog">
            <div className="model-dialog-head">
              <div>
                <strong>自定义模型</strong>
                <small>同一套连接可分别指定文本、图片和视频模型</small>
              </div>
              <button type="button" className="btn sm" onClick={() => setModelPanelOpen(false)}>
                关闭
              </button>
            </div>
            <form
              className="settings-grid model-settings-form"
              autoComplete="off"
              onSubmit={(event) => {
                event.preventDefault();
                void saveModelConfig();
              }}
            >
              {renderModelSettingsFields('panel-model', true)}
            </form>
          </div>
        </div>
      )}

      <ProjectHistory
        open={historyOpen}
        projects={projectList}
        loading={projectListLoading}
        activeProjectId={workspace?.projectId || ''}
        syncedAt={projectSyncedAt}
        stageName={(stage) => studioStageName(stage as StudioStageId)}
        onOpenProject={(id) => void openProjectFromHistory(id)}
        onDeleteProject={(id) => void deleteProjectFromHistory(id)}
        onClose={() => setHistoryOpen(false)}
      />

      {(contextOpen || inspectorOpen) && (
        <div
          className="scrim"
          onClick={() => {
            setContextOpen(false);
            setInspectorOpen(false);
          }}
        />
      )}
    </main>
  );
}
