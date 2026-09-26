'use client';

import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { createBlankWorkspace } from '../lib/defaultWorkspace';
import type {
  AgentMessage,
  AgentRunResponse,
  PatchOperation,
  ProductionStageId,
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
  completeStageGeneration,
  failStageGeneration,
  markStageDraft,
  nextProductionStage,
  PRODUCTION_FLOW_PATH,
  writeProductionFlow
} from '../lib/productionFlow';
import {
  filterStagePatches,
  isProductionStageFile,
  sourceVersionsForStage,
  stageConfig,
  stageGenerationInstruction
} from '../lib/stageGeneration';
import { validateStageAssets } from '../lib/productionAssets';
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
import LeftRail, { type NavSection } from '../components/LeftRail';
import ContextSidebar, { type QueueEntry } from '../components/ContextSidebar';
import Inspector from '../components/Inspector';
import NavPage, { type NavPageKind } from '../components/NavPages';
import {
  AgentRuntime,
  ApprovalQueue,
  AssetPipeline,
  ExecutionLog,
  PlanList,
  StoryboardView,
  VideoGenHandoff,
  type VideoRenderState
} from '../components/runtime';
import {
  IconBolt,
  IconCamera,
  IconCheck,
  IconChevron,
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
  { id: 'delight', label: '乐', prompt: '开怀大笑，脸部放松，动作轻快' },
  { id: 'surprise', label: '惊讶', prompt: '睁大眼睛，轻微张口，身体短暂停顿' },
  { id: 'shy', label: '害羞', prompt: '脸颊微红，眼神躲闪，动作拘谨' },
  { id: 'nervous', label: '紧张', prompt: '肩膀收紧，频繁吞咽，眼神游移' },
  { id: 'awkward', label: '尴尬', prompt: '僵硬微笑，视线飘开，手部无处安放' },
  { id: 'confused', label: '疑惑', prompt: '眉头轻皱，歪头观察，反应迟疑' },
  { id: 'determined', label: '坚定', prompt: '目光稳定，下颌收紧，动作果断' },
  { id: 'tired', label: '疲惫', prompt: '眼皮沉重，动作变慢，身体松垮' },
  { id: 'proud', label: '得意', prompt: '挑眉偷笑，抬下巴，带一点小炫耀' },
  { id: 'fear', label: '恐惧', prompt: '瞳孔放大，身体后撤，呼吸急促' },
  { id: 'relieved', label: '释然', prompt: '长出一口气，表情放松，轻轻点头' },
  { id: 'gentle', label: '温柔', prompt: '眼神柔和，微笑克制，动作放慢' },
  { id: 'focused', label: '专注', prompt: '凝视目标，少眨眼，动作精准' },
  { id: 'wronged', label: '委屈', prompt: '嘴角下压，眼神闪躲，像忍住不说' },
  { id: 'panic', label: '慌张', prompt: '动作变快，左右张望，短促呼吸' }
] as const;

type CharacterExpressionId = (typeof CHARACTER_EXPRESSION_OPTIONS)[number]['id'];

const DEFAULT_CHARACTER_EXPRESSION_IDS: CharacterExpressionId[] = ['joy', 'anger', 'sadness', 'delight'];

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

type StageCamera = {
  x: number;
  y: number;
  zoom: number;
  label: string;
  hint: string;
};

type ProductionDecision = {
  title: string;
  question: string;
  nextStage: StudioStageId;
  continueLabel: string;
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
const VIDEO_POLL_INTERVAL_MS = 65000;
const VIDEO_POLL_MAX_ATTEMPTS = 60;
const VIDEO_RENDER_SEGMENT_SECONDS = 15;
const VIDEO_RENDER_SEGMENT_COUNT = 12;
const VIDEO_RENDER_TOTAL_SECONDS = VIDEO_RENDER_SEGMENT_SECONDS * VIDEO_RENDER_SEGMENT_COUNT;
const VIDEO_RENDER_MAX_TARGET_SECONDS = VIDEO_RENDER_SEGMENT_SECONDS;
const VIDEO_MAX_NUM_FRAMES = 409;
const VIDEO_FAILED_STATUSES = ['failed', 'failure', 'error', 'cancelled', 'canceled'];

const defaultVideoSpec: VideoSpec = {
  provider: 'Agnes Video V2.0',
  platform: '小红书',
  generationMode: 'image_to_video',
  aspectRatio: '9:16',
  resolution: '720p',
  numFrames: 361,
  fps: 24,
  cameraMove: 'push',
  frameLock: 'first'
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

const taskAgentOptions: Array<{ id: string; label: string; hint: string }> = [
  { id: 'auto', label: '自动派发', hint: '主 Agent 判断任务类型' },
  { id: 'product', label: '产品营销视频', hint: '卖点、信任、转化' },
  { id: 'drama', label: '短剧 / 剧情视频', hint: 'Hook、冲突、反转' },
  { id: 'rewrite', label: '旧稿改写', hint: '先诊断再改写' },
  { id: 'note', label: '图文笔记', hint: '封面、正文、标签' },
  { id: 'weekly', label: '一周内容计划', hint: '7 天选题与角度' },
  { id: 'multi', label: '多平台改写', hint: '小红书 / 抖音 / TikTok' },
  { id: 'videogen', label: '视频生成准备', hint: '镜头任务与生成参数' }
];

const styleOptions: Array<{ id: string; label: string; hint: string }> = [
  { id: 'real', label: '写实生活感', hint: '自然光、真实场景' },
  { id: 'cinematic', label: '电影质感', hint: '高级调色、景深' },
  { id: 'anime', label: '二次元 / 动画', hint: '插画、动漫风' },
  { id: 'ad', label: '广告大片', hint: '强对比、产品特写' },
  { id: 'minimal', label: '极简干净', hint: '留白、克制' },
  { id: 'retro', label: '复古胶片', hint: '颗粒、暖调' }
];

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

const stageCameras: Record<StudioStageId, StageCamera> = {
  overview: {
    x: 0,
    y: 0,
    zoom: 0.62,
    label: '总览视角',
    hint: '查看从目标到视频任务的完整资产链路。'
  },
  script: {
    x: -130,
    y: -12,
    zoom: 0.88,
    label: '剧本视角',
    hint: '聚焦脚本资产，确认 Hook、冲突、CTA 和平台语气。'
  },
  character: {
    x: -350,
    y: -112,
    zoom: 0.78,
    label: '角色视角',
    hint: '聚焦角色一致性、素材引用和可复用主体设定。'
  },
  scene: {
    x: -520,
    y: -260,
    zoom: 0.68,
    label: '场景视角',
    hint: '聚焦地点、道具、灯光和视觉证据。'
  },
  storyboard: {
    x: -805,
    y: -76,
    zoom: 0.74,
    label: '分镜视角',
    hint: '聚焦镜头顺序、动作、构图和时长。'
  },
  video: {
    x: -1045,
    y: -204,
    zoom: 0.8,
    label: '视频视角',
    hint: '聚焦生成任务、首帧策略、角色一致性和 renderQueue。'
  }
};

function studioStageName(stage: StudioStageId) {
  return studioStages.find((item) => item.id === stage)?.label || '节点';
}

function productionStageForFile(filePath: string): ProductionStageId | null {
  const stages: ProductionStageId[] = ['script', 'character', 'scene', 'storyboard', 'video'];
  return stages.find((stage) => stageConfig(stage).outputFiles.includes(filePath)) || null;
}

function stageCameraStyle(camera: StageCamera): CSSProperties {
  return {
    '--camera-x': `${camera.x}px`,
    '--camera-y': `${camera.y}px`,
    '--camera-zoom': camera.zoom
  } as CSSProperties;
}

function decisionCardForNode(node: StudioCanvasNode): ProductionDecision {
  const templates: Record<StudioStageId, Omit<ProductionDecision, 'title' | 'revisionPrompt'>> = {
    overview: {
      question: '先确认这次 Mission 要走哪种生产配方，再让下游资产展开。',
      nextStage: 'script',
      continueLabel: '确认目标，继续写剧本',
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
      nextStage: 'character',
      continueLabel: '确认剧本，继续抽角色',
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
      nextStage: 'scene',
      continueLabel: '确认角色，继续场景设计',
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
      nextStage: 'storyboard',
      continueLabel: '确认场景，继续分镜设计',
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
      nextStage: 'video',
      continueLabel: '确认分镜，继续视频准备',
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
      nextStage: 'video',
      continueLabel: '确认视频任务',
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
    if (hasPendingFile(pendingPatches, ['brief.json', 'campaign_goal.json', 'profile.json']) || missionRev > scriptRev) {
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

function demoStorageKey(demoId: string) {
  return `videoagent-demo-workspace:${demoId}`;
}

function demoIdFromQuery() {
  return new URLSearchParams(window.location.search).get('demo');
}

function ensureProductionFlow(workspace: WorkspaceSnapshot): WorkspaceSnapshot {
  if (workspace.files.some((file) => file.path === PRODUCTION_FLOW_PATH)) return workspace;
  return writeProductionFlow(workspace, productionFlowFromWorkspace(workspace));
}

function readStoredWorkspace(storageKey: string): WorkspaceSnapshot | null {
  const saved = window.localStorage.getItem(storageKey);
  if (!saved) return null;
  try {
    const parsed: unknown = JSON.parse(saved);
    if (!isWorkspaceSnapshot(parsed)) return null;
    const hasRequiredFiles =
      parsed.files.some((file) => file.path === '.aigc/MEMORY.md') &&
      parsed.files.some((file) => file.path === PRODUCTION_FLOW_PATH);
    const flowFile = parsed.files.find((file) => file.path === PRODUCTION_FLOW_PATH);
    if (hasRequiredFiles && flowFile) {
      JSON.parse(flowFile.content);
      return parsed;
    }
  } catch (_) {}
  return null;
}

function safeLoadWorkspace(): WorkspaceSnapshot {
  const projectId = window.localStorage.getItem(activeWorkspaceProjectKey);
  if (projectId) {
    const restored = readStoredWorkspace(workspaceStorageKey(projectId));
    if (restored) return restored;
  }
  return createBlankWorkspace('smb');
}

function shouldRestoreSavedMessages(workspace: WorkspaceSnapshot) {
  return workspace.files.some((file) => !isInternalWorkspaceFile(file.path));
}

function safeLoadSpec(): VideoSpec {
  const saved = window.localStorage.getItem(specKey);
  if (!saved) return defaultVideoSpec;
  try {
    const parsed = JSON.parse(saved) as Partial<VideoSpec>;
    if (
      parsed.provider === 'Agnes Video V2.0' &&
      parsed.platform &&
      parsed.generationMode &&
      parsed.aspectRatio &&
      parsed.resolution &&
      parsed.numFrames &&
      parsed.fps
    ) {
      return { ...defaultVideoSpec, ...parsed } as VideoSpec;
    }
  } catch (_) {}
  return defaultVideoSpec;
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
  const platforms = uniqueStrings([brief.platform, campaign.primaryPlatform, ...(campaign.secondaryPlatforms || []), ...(profile.platforms || [])]);
  const redLines = uniqueStrings([...(brief.constraints || []), ...(profile.bannedExpressions || []), ...(profile.marketingRedLines || [])]).slice(0, 4);

  return {
    title: campaign.mission || brief.topic || (workspace?.files.some((file) => !isInternalWorkspaceFile(file.path) && file.path !== '.aigc/MEMORY.md') ? workspace.title : '') || '待创建 Mission',
    platform: platforms.slice(0, 3).join(' / ') || '待选择平台',
    audience: brief.audience || profile.targetCustomer || profile.targetAudience || '待确认受众',
    goal: campaign.conversionGoal || brief.offer || brief.contentGoal || '先用聊天描述你要做的视频',
    tone: brief.tone || profile.tone || '待确认语气',
    redLines: redLines.length ? redLines : ['待确认禁用表达', '待确认素材授权', '待确认平台规则'],
    isBlank: !workspace || workspace.files.length <= 1
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

function clampVideoDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.min(VIDEO_RENDER_MAX_TARGET_SECONDS, Math.max(1, Math.round(seconds)));
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
episode_segment_seconds: ${VIDEO_RENDER_SEGMENT_SECONDS}
episode_segment_count: ${VIDEO_RENDER_SEGMENT_COUNT}
episode_total_seconds: ${VIDEO_RENDER_TOTAL_SECONDS}

规格要求：
- 输出必须围绕这个视频规格生成脚本、分镜、首帧/多图/关键帧提示词和 render task。
- 第一版成片策略固定为 720p / 24fps / 每小节约 ${VIDEO_RENDER_SEGMENT_SECONDS}s / ${VIDEO_RENDER_SEGMENT_COUNT} 小节拼成约 ${Math.round(VIDEO_RENDER_TOTAL_SECONDS / 60)} 分钟；不要把 3 分钟需求塞进单条视频。
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

function isMostlyEnglishText(value?: string) {
  const text = (value || '').trim();
  if (!text) return false;
  const latinCount = (text.match(/[A-Za-z]/g) || []).length;
  const chineseCount = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  return latinCount > 12 && chineseCount === 0;
}

function reviewText(value: string | undefined, fallback: string) {
  if (!value) return fallback;
  if (isMostlyEnglishText(value)) return '旧版本英文提示词，需要重新生成中文版本后再审查。';
  return value;
}

function textField(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return value.map((item) => textField(item)).filter(Boolean).join('；');
  if (typeof value === 'number') return String(value);
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

function referenceImagesForPrompt(prompt: VideoPromptEntry | null | undefined) {
  if (!prompt) return [];
  const entry = prompt as Record<string, unknown>;
  return uniqueTexts([
    ...textListField(entry.referenceImageUrl),
    ...textListField(entry.referenceImage),
    ...textListField(entry.referenceImages),
    ...textListField(entry.imageUrl),
    ...textListField(entry.image),
    ...textListField(entry.images),
    ...textListField(entry.firstFrameUrl),
    ...textListField(entry.firstFrame),
    ...textListField(entry.keyframes)
  ]);
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
    '英文字幕、英文单词、拼音、拉丁字母、乱码文字、不可读文字、可读招牌、屏幕文字、书本文字、菜单文字、包装文字',
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
    negativePrompt: textField(entry.negativePrompt) ? reviewText(textField(entry.negativePrompt), '') : undefined
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
      negativePrompt: character.negativePrompt ? reviewText(character.negativePrompt, '') : undefined
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
  const [workflow, setWorkflow] = useState<WorkflowKind>('generate');
  const [videoSpec, setVideoSpec] = useState<VideoSpec>(defaultVideoSpec);
  const [videoRender, setVideoRender] = useState<VideoRenderState>({ status: 'idle' });
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
  const [autopilot, setAutopilot] = useState(false);
  const [activeTab, setActiveTab] = useState<StudioStageId>('overview');
  const [homeMenu, setHomeMenu] = useState<'spec' | 'skill' | 'agent' | 'style' | null>(null);
  const [taskAgent, setTaskAgent] = useState('auto');
  const [modelPanelOpen, setModelPanelOpen] = useState(false);
  const [roleExpressionDrafts, setRoleExpressionDrafts] = useState<Record<string, CharacterExpressionId[]>>({});
  const [roleAdjustmentDrafts, setRoleAdjustmentDrafts] = useState<Record<string, string>>({});
  const [roleReferenceStrategyDrafts, setRoleReferenceStrategyDrafts] = useState<Record<string, CharacterReferenceStrategyId>>({});
  const [roleDesignDrafts, setRoleDesignDrafts] = useState<Record<string, CharacterDesignRender>>({});
  const [roleActiveVariantDrafts, setRoleActiveVariantDrafts] = useState<Record<string, string>>({});
  const [roleFaceAnchorDrafts, setRoleFaceAnchorDrafts] = useState<Record<string, string>>({});
  const [roleDesignPreviewKinds, setRoleDesignPreviewKinds] = useState<Record<string, CharacterDesignOutputKind>>({});
  const [roleDesignNotice, setRoleDesignNotice] = useState('');
  const videoPollTimerRef = useRef<number | null>(null);
  const stageGenerationJobRef = useRef(new Map<ProductionStageId, string>());
  const activeStageGenerationCountRef = useRef(0);
  const confirmationInFlightRef = useRef(new Set<string>());
  const demoWorkspaceId = typeof window === 'undefined' ? null : demoIdFromQuery();

  useEffect(() => {
    let cancelled = false;

    async function loadDemoWorkspaceFromQuery() {
      const demoId = demoIdFromQuery();
      if (!demoId) return false;
      const savedDemo = readStoredWorkspace(demoStorageKey(demoId));
      if (savedDemo) {
        setWorkspace(savedDemo);
        setWorkflow(savedDemo.activeWorkflow);
        setVideoSpec(defaultVideoSpec);
        setInstruction('');
        setMessages([initialAssistantMessage(savedDemo.mode)]);
        return true;
      }
      const res = await fetch(`/api/demo-workspace/${encodeURIComponent(demoId)}`);
      const data = (await res.json()) as { ok?: boolean; error?: string; workspace?: WorkspaceSnapshot };
      if (!res.ok || !data.workspace) throw new Error(data.error || '制作包加载失败');
      if (cancelled) return true;
      const demoWorkspace = ensureProductionFlow(data.workspace);
      const demoMessages: AgentMessage[] = [
        {
          id: uid('msg'),
          role: 'assistant',
          content: '小澎的恋爱史 V2 制作包已载入。当前工作区包含 12 个十五秒视频任务、五阶段参考图、纯中文字幕规则和完整恋爱弧线。',
          createdAt: now()
        }
      ];
      window.localStorage.setItem(demoStorageKey(demoId), JSON.stringify(demoWorkspace));
      window.localStorage.setItem(messagesKey, JSON.stringify(demoMessages));
      setWorkspace(demoWorkspace);
      setWorkflow(demoWorkspace.activeWorkflow);
      setVideoSpec(defaultVideoSpec);
      setInstruction('');
      setMessages(demoMessages);
      setActiveTab('overview');
      setNavSection('mission');
      setRoleDesignDrafts({});
      setRoleActiveVariantDrafts({});
      setRoleFaceAnchorDrafts({});
      setRoleDesignPreviewKinds({});
      setRoleDesignNotice('');
      return true;
    }

    function loadStoredWorkspace() {
      const loaded = ensureProductionFlow(safeLoadWorkspace());
      const savedMessages = window.localStorage.getItem(messagesKey);
      const loadedSpec = safeLoadSpec();
      setWorkspace(loaded);
      setWorkflow(loaded.activeWorkflow);
      setVideoSpec(loadedSpec);
      setInstruction('');
      setMessages(shouldRestoreSavedMessages(loaded) && savedMessages ? JSON.parse(savedMessages) : [initialAssistantMessage(loaded.mode)]);
    }

    void loadDemoWorkspaceFromQuery()
      .then((loadedDemo) => {
        if (!cancelled && !loadedDemo) loadStoredWorkspace();
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '制作包加载失败');
          loadStoredWorkspace();
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
    window.localStorage.setItem(storageKey, JSON.stringify(workspace));
    if (!demoId) window.localStorage.setItem(activeWorkspaceProjectKey, workspace.projectId);
  }, [workspace]);

  useEffect(() => {
    if (messages.length) window.localStorage.setItem(messagesKey, JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    window.localStorage.setItem(specKey, JSON.stringify(videoSpec));
  }, [videoSpec]);

  useEffect(() => {
    setAutopilot(window.localStorage.getItem('videoagent-autopilot') === '1');
  }, []);

  useEffect(() => {
    window.localStorage.setItem('videoagent-autopilot', autopilot ? '1' : '0');
  }, [autopilot]);

  useEffect(() => {
    return () => {
      if (videoPollTimerRef.current) window.clearTimeout(videoPollTimerRef.current);
    };
  }, []);

  const pendingPatches = useMemo(() => readPendingPatches(workspace), [workspace]);

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

  const brief = useMemo(() => missionBriefFromWorkspace(proposedWorkspace), [proposedWorkspace]);
  const hasWorkspaceAssets = Boolean(
    proposedWorkspace?.files.some((file) => !isInternalWorkspaceFile(file.path) && file.path !== '.aigc/MEMORY.md')
  );
  const assets = useMemo(
    () => (hasWorkspaceAssets ? missionAssetsFromWorkspace(proposedWorkspace) : []),
    [proposedWorkspace, hasWorkspaceAssets]
  );
  const scenes = useMemo(
    () => (hasWorkspaceAssets ? sceneAssets(proposedWorkspace) : []),
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

  async function requestStageDraft(
    stage: ProductionStageId,
    baseWorkspace: WorkspaceSnapshot,
    generationJobId = uid(`${stage}-job`),
    requestText = '',
    history = messages.slice(-10),
    revision = false
  ) {
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

    stageGenerationJobRef.current.set(stage, generationJobId);
    setWorkspace(generationWorkspace);
    activeStageGenerationCountRef.current += 1;
    setLoading(true);
    setError('');
    setLastRun(null);
    setVideoRender({ status: 'idle' });

    try {
      const response = await fetch('/api/agent/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          instruction: [requestText, stageGenerationInstruction(stage, buildSpecInstruction(videoSpec))].filter(Boolean).join('\n\n'),
          workspace: baseWorkspace,
          history,
          workflow: stageConfig(stage).workflow,
          productionStage: stage,
          generationJobId,
          sourceVersions
        })
      });
      const result = await response.json() as AgentRunResponse & { error?: string };
      if (!response.ok) throw new Error(result.error || `${studioStageName(stage)}生成失败`);
      const scopedPatches = filterStagePatches(stage, result.patchOperations);
      if (stageGenerationJobRef.current.get(stage) !== generationJobId) return;
      setWorkspace((current) => {
        if (!current) return current;
        if (stageGenerationJobRef.current.get(stage) !== generationJobId) return current;
        const flow = productionFlowFromWorkspace(current);
        const completion = completeStageGeneration(flow, stage, generationJobId, sourceVersions);
        if (!completion.accepted) return current;
        const nextFlow = revision
          ? markStageDraft(flow, { stage, generationJobId, sourceVersions })
          : completion.flow;
        return writeProductionFlow(appendPendingPatches(current, scopedPatches), nextFlow);
      });
      setLastRun({ ...result, patchOperations: scopedPatches });
      setMessages((prev) => [...prev, { id: uid('msg'), role: 'assistant', content: result.assistantMessage, createdAt: now() }]);
      focusStudioStage(stage);
      const firstPatch = scopedPatches[0];
      if (firstPatch) setSelectedPatchId(firstPatch.id);
    } catch (err) {
      if (stageGenerationJobRef.current.get(stage) !== generationJobId) return;
      const message = err instanceof Error ? err.message : `${studioStageName(stage)}生成失败`;
      setWorkspace((current) => {
        if (!current || stageGenerationJobRef.current.get(stage) !== generationJobId) return current;
        return writeProductionFlow(
          current,
          failStageGeneration(productionFlowFromWorkspace(current), stage, generationJobId, message)
        );
      });
      setError(message);
      setMessages((prev) => [...prev, { id: uid('msg'), role: 'system', content: `请求失败：${message}`, createdAt: now() }]);
    } finally {
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
      title: brief.isBlank ? displayText.slice(0, 32) || workspace.title : workspace.title,
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
    if (productionStages.size > 0) {
      const productionStage = [...productionStages][0];
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

  async function confirmProductionStage(stage: ProductionStageId) {
    if (!workspace || !proposedWorkspace) return;
    const flow = productionFlowFromWorkspace(workspace);
    const record = flow.stages[stage];
    if (record.status !== 'ready_for_review' || record.draftVersion === null) return;

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
      const transaction = confirmStageInWorkspace(workspace, {
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

  function resetProject(mode = workspace?.mode || 'creator') {
    const next = ensureProductionFlow(createBlankWorkspace(mode));
    setWorkspace(next);
    setMessages([initialAssistantMessage(mode)]);
    setLastRun(null);
    setVideoRender({ status: 'idle' });
    setWorkflow('generate');
    setInstruction('');
    setSelectedPatchId('');
    setSelectedAssetId('');
    setSelectedSceneId('');
    setSelectedNodeId('node_mission');
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
    setError('');
  }

  function resetDemoWorkspace() {
    const demoId = demoIdFromQuery();
    if (!demoId) return;
    window.localStorage.removeItem(demoStorageKey(demoId));
    window.location.reload();
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
  const modelWriteBlocked = modelConfig?.writable === false && !modelConfig?.authRequired;
  const modelTokenMissing = Boolean(modelConfig?.authRequired && !modelAdminToken.trim() && !modelConfig.writable);
  const warningChecks = lastRun?.complianceChecks.filter((check) => check.status !== 'pass') || [];
  const approvalReady = pendingPatches.filter((patch) => patch.riskLevel === 'low').length;
  const expectedTaskCount = Math.max(5, videoCards.length, scenes.length, assetPrompts.prompts?.length || 0, assetPrompts.renderQueue?.length || 0);
  const visibleTaskCount = videoCards.length;
  const renderTaskCount = Math.max(assetPrompts.renderQueue?.length || 0, assetPrompts.prompts?.length || 0, videoCards.length, scenes.length);
  const missingTaskCount = Math.max(0, expectedTaskCount - visibleTaskCount);
  const provider = health?.provider.selectedProvider;
  const online = Boolean(provider && provider !== 'mock');
  const runStatus: 'idle' | 'running' | 'done' | 'error' = loading ? 'running' : error ? 'error' : lastRun ? 'done' : 'idle';
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
  const generatedCharacterAssets = characterAssetsFromPrompts(assetPrompts);
  const committedCharacterAssets = characterAssetsFromPrompts(committedPrompts);
  const visibleCharacterAssets = generatedCharacterAssets.length ? generatedCharacterAssets : committedCharacterAssets;
  const stagedCharacterReferences = characterReferenceVariantsFromPrompts(assetPrompts);
  const fullExpressionPalette = CHARACTER_EXPRESSION_OPTIONS.map((option) => option.label).join('、');
  const handoffReady =
    Boolean(getFile(workspace, 'asset_prompts.json')) && pendingPatches.length === 0 && complianceStatus !== 'blocked';
  const handoffMissing = !getFile(workspace, 'asset_prompts.json')
    ? '当前还没有已确认的素材提示词制作包，先让 Agent 产出并审批通过。'
    : complianceStatus === 'blocked'
    ? '合规检查阻断，请先处理风险后再交接。'
    : pendingPatches.length
    ? `还有 ${pendingPatches.length} 个 patch 待审批，确认后才会交接。`
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
  const selectedAssetTitle = selectedAsset?.title || (selectedAssetFileName === 'script.md' ? '脚本正文' : '成果文件');
  const selectedAssetIsScript = selectedAssetFileName === 'script.md' || selectedAsset?.type === 'script';
  const activeInspectorPatch =
    activeTab === 'video'
      ? selectedPatch
      : selectedAssetPatch || (selectedPatch?.filePath === selectedAsset?.filePath ? selectedPatch : undefined);
  const inspectorDiff = activeInspectorPatch ? diffLines(activeInspectorPatch.before, activeInspectorPatch.after).slice(0, 80) : null;
  const inspectorFileName = activeInspectorPatch?.filePath || selectedAssetFileName;
  const inspectorFileBody = activeInspectorPatch?.after || selectedAssetBody || scriptPreview;
  const storyboard = storyboardScenes(proposedWorkspace);
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
  const hasCharacterPackage = Boolean(visibleCharacterAssets.length || characterPackage?.primarySubject || characterPackage?.consistencyPrompt);
  const studioStageLabel = studioStages.find((stage) => stage.id === activeTab)?.label || '总览';
  const activeStageCamera = stageCameras[activeTab];
  const cameraStyle = stageCameraStyle(activeStageCamera);
  const patchCountFor = (paths: string[]) => pendingPatches.filter((patch) => paths.includes(patch.filePath)).length;
  const missionPatchCount = patchCountFor(['brief.json', 'campaign_goal.json', 'profile.json']);
  const scriptPatchCount = patchCountFor(['script.md']);
  const characterPatchCount = patchCountFor(['asset_prompts.json', 'asset_library.json']);
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
    return roleExpressionDrafts[characterId] || DEFAULT_CHARACTER_EXPRESSION_IDS;
  }

  function selectedExpressionOptionsFor(characterId: string) {
    const ids = new Set(selectedExpressionIdsFor(characterId));
    return CHARACTER_EXPRESSION_OPTIONS.filter((option) => ids.has(option.id));
  }

  function selectedReferenceStrategyFor(characterId: string) {
    const strategyId = roleReferenceStrategyDrafts[characterId] || 'face_id';
    return CHARACTER_REFERENCE_STRATEGIES.find((strategy) => strategy.id === strategyId) || CHARACTER_REFERENCE_STRATEGIES[0];
  }

  function characterDesignKey(characterId: string, variantId: string, outputKind: CharacterDesignOutputKind) {
    return `${characterId}:${variantId}:${outputKind}`;
  }

  function characterVariantsFor(character: CharacterAssetCard, index?: number): CharacterReferenceVariant[] {
    const primaryCharacter = index === 0 || character.id === visibleCharacterAssets[0]?.id || character.role.includes('主角');
    if (primaryCharacter && stagedCharacterReferences.length) return stagedCharacterReferences;
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
    if (outputKind === 'portrait' && variant.imageUrl) {
      return { imageUrl: variant.imageUrl, status: 'ready', source: 'existing' };
    }
    return { imageUrl: '', status: 'idle' };
  }

  function faceAnchorVariantFor(character: CharacterAssetCard, index?: number) {
    const variants = characterVariantsFor(character, index);
    const selectedId = roleFaceAnchorDrafts[character.id];
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

  async function regenerateCharacterDesign(
    character: CharacterAssetCard,
    variant: CharacterReferenceVariant,
    outputKind: CharacterDesignOutputKind = 'portrait',
    characterIndex?: number
  ) {
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
        body: JSON.stringify({
          prompt: buildCharacterDesignPrompt({
            characterName: character.name,
            role: character.role,
            description: character.description,
            consistency: character.consistency,
            negativePrompt: character.negativePrompt,
            stage: variant,
            expressionPrompts: selectedExpressions.map((item) => item.prompt),
            adjustment: roleAdjustmentDrafts[character.id],
            outputKind
          }),
          images: referenceImages,
          size: outputKind === 'multi_view' ? '1024x768' : '768x1024'
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
      setRoleDesignNotice(`已生成「${character.name} · ${variant.label}」角色资产。确认后再应用到视频任务。`);
    } catch (err) {
      const message = characterImageErrorText(err instanceof Error ? err.message : '角色图生成失败');
      updateCharacterDesignRender(character.id, variant.id, outputKind, {
        imageUrl: current.imageUrl,
        status: 'error',
        error: message,
        source: current.source
      });
      setRoleDesignNotice(`生成失败：${message}`);
    }
  }

  function replaceCharacterDesign(character: CharacterAssetCard, variant: CharacterReferenceVariant, file?: File) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setRoleDesignNotice('替换失败：请选择图片文件。');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const imageUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!imageUrl) return;
      updateCharacterDesignRender(character.id, variant.id, 'portrait', {
        imageUrl,
        status: 'ready',
        source: 'uploaded'
      });
      setRoleDesignPreviewKinds((prev) => ({ ...prev, [character.id]: 'portrait' }));
      setRoleDesignNotice(`已替换「${character.name} · ${variant.label}」角色主图，尚未应用到视频任务。`);
    };
    reader.onerror = () => setRoleDesignNotice('替换失败：图片读取失败。');
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
    if (!workspace || !imageUrl) return;
    const sourceWorkspace = proposedWorkspace || workspace;
    const before = getFile(sourceWorkspace, 'asset_prompts.json')?.content || JSON.stringify(assetPrompts, null, 2);
    const current = safeParseJson<AssetPrompts>(before, {});
    const next =
      variant.id === 'base'
        ? {
            ...current,
            characters: (current.characters || []).map((entry) =>
              entry.id === character.id || entry.name === character.name
                ? { ...entry, referenceImageUrl: imageUrl, referenceImages: undefined }
                : entry
            ),
            prompts: (current.prompts || []).map((entry) => ({ ...entry, referenceImageUrl: imageUrl, referenceImages: undefined })),
            renderQueue: (current.renderQueue || []).map((entry) => ({ ...entry, referenceImageUrl: imageUrl, referenceImages: undefined, status: 'ready_with_reference' }))
          }
        : replaceCharacterStageReference(current, variant.id, imageUrl);
    const summary = `将「${character.name} · ${variant.label}」角色图应用到对应视频任务`;
    const patch: PatchOperation = {
      id: uid('patch'),
      filePath: 'asset_prompts.json',
      summary,
      before,
      after: JSON.stringify(next, null, 2),
      riskLevel: 'low',
      requiresApproval: true
    };
    setWorkspace((current) => current ? appendPendingPatches(current, [patch]) : current);
    setSelectedPatchId(patch.id);
    setSelectedNodeId('node_character');
    setRoleDesignNotice(`已生成待审 Patch：${summary}。审批后才会替换视频参考图。`);
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
          sourceFile: 'asset_prompts.json',
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

  function characterControlSummaryForPrompt() {
    if (!visibleCharacterAssets.length) return '';
    const lines = visibleCharacterAssets.map((character) => {
      const strategy = selectedReferenceStrategyFor(character.id);
      const selectedExpressions = selectedExpressionOptionsFor(character.id);
      const expressionDetail = selectedExpressions.length
        ? selectedExpressions.map((option) => `${option.label}=${option.prompt}`).join('；')
        : `按剧情从表情池选择：${fullExpressionPalette}`;
      const adjustment = roleAdjustmentDrafts[character.id]?.trim();
      return [
        `- ${character.name}（${character.role}）：参考策略=${strategy.label}；${strategy.prompt}。`,
        `  表情控制：${expressionDetail}。`,
        adjustment ? `  用户补充调整：${adjustment}。` : '',
        `  一致性要求：${snippet(character.consistency, 2)}。`
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
  const canvasNodes: StudioCanvasNode[] = [
    {
      id: 'node_mission',
      stage: 'overview',
      label: '故事目标',
      title: brief.title,
      summary: brief.goal,
      status: missionPatchCount || missionNotice.state !== 'current' ? 'warning' : brief.isBlank ? 'draft' : 'ready',
      owner: 'Creative Director',
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
      owner: 'Script Agent',
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
      owner: 'Character Agent',
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
      owner: 'Scene Agent',
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
      owner: 'Storyboard Agent',
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
      owner: 'Video Generation Agent',
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
  const selectedNode = canvasNodes.find((node) => node.id === selectedNodeId) || canvasNodes.find((node) => node.stage === activeTab) || canvasNodes[0];
  const selectedDecision = selectedNode ? decisionCardForNode(selectedNode) : null;
  const selectedNodePatches = selectedNode ? pendingPatches.filter((patch) => patchTouchesNode(patch, selectedNode)) : [];
  const selectedNodePatchIds = selectedNodePatches.map((patch) => patch.id);
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

  function firstRenderablePrompt() {
    const prompt = committedPrompts.prompts?.find((item) => item.type !== 'image' && item.prompt) || committedPrompts.prompts?.find((item) => item.prompt);
    return prompt || null;
  }

  function renderableVideoPrompts() {
    return (committedPrompts.prompts || []).filter((item) => item.prompt && item.type !== 'image');
  }

  function targetDurationSeconds() {
    return clampVideoDuration(VIDEO_RENDER_SEGMENT_SECONDS);
  }

  function specForTargetDuration(seconds: number) {
    const baseSpec = committedPrompts.renderSpec || {};
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

  function buildVideoRenderPrompt(fallbackPrompt: NonNullable<ReturnType<typeof firstRenderablePrompt>>, seconds: number) {
    const duration = numberFromValue(fallbackPrompt.durationSeconds);
    const taskLine = `${fallbackPrompt.renderTask || '当前镜头'} ${duration ? `(${duration}s)` : ''}：${fallbackPrompt.prompt}`;
    return [
      `请生成整条视频中的一个中文小节，目标时长约 ${seconds}s。`,
      `这是约 ${Math.round(VIDEO_RENDER_TOTAL_SECONDS / 60)} 分钟成片的第一个小节；后续会生成 ${VIDEO_RENDER_SEGMENT_COUNT} 个小节并拼接成片。`,
      '本次只提交一个镜头任务；不要把 12 个小节混在一次视频生成请求里。',
      '必须把下面的镜头任务组织成这一小节内的连续叙事，不要试图一次生成整条长视频。',
      '不要让视频模型生成任何可读文字；字幕、标题和旁白由后期纯中文字幕添加。',
      '禁止英文、拼音、拉丁字母、乱码、可读招牌、屏幕文字、书本文字和包装文字。',
      committedPrompts.characterConsistency?.consistencyPrompt
        ? `人物一致性：${committedPrompts.characterConsistency.consistencyPrompt}`
        : '',
      characterControlSummaryForPrompt(),
      committedPrompts.characterConsistency?.negativePrompt
        ? `避免项：${chineseOnlyVideoNegativePrompt(committedPrompts.characterConsistency.negativePrompt)}。`
        : `避免项：${chineseOnlyVideoNegativePrompt('不要脸部不一致')}。`,
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

  function scheduleVideoPoll(videoId: string, attempt: number) {
    if (!videoId || attempt > VIDEO_POLL_MAX_ATTEMPTS) return;
    clearVideoPollTimer();
    videoPollTimerRef.current = window.setTimeout(() => void pollVideoRender(videoId, attempt), VIDEO_POLL_INTERVAL_MS);
  }

  async function pollVideoRender(videoId = videoRender.videoId || '', attempt = 1) {
    if (!videoId) return;
    clearVideoPollTimer();
    setVideoRender((prev) => ({ ...prev, status: 'polling', error: '' }));
    try {
      const res = await fetch(`/api/video/render?video_id=${encodeURIComponent(videoId)}`);
      const data = (await res.json()) as VideoRenderApiResponse;
      if (!res.ok) throw new Error(data.error || '视频状态查询失败');
      const status = String(data.status || '').toLowerCase();
      const failed = VIDEO_FAILED_STATUSES.includes(status);
      const nextVideoId = data.video_id || data.videoId || videoId;
      const hasVideoUrl = Boolean(data.videoUrl);
      const progress = typeof data.progress === 'number' ? data.progress : undefined;
      const shouldContinue = !hasVideoUrl && !failed && attempt < VIDEO_POLL_MAX_ATTEMPTS;
      setVideoRender({
        status: hasVideoUrl ? 'completed' : failed ? 'failed' : 'submitted',
        videoId: nextVideoId,
        videoUrl: data.videoUrl || '',
        progress,
        error: failed
          ? videoErrorText(data.error || data.raw?.error) || '视频生成失败'
          : !shouldContinue && !hasVideoUrl
            ? '自动刷新已暂停，可点击“刷新状态”继续查询。'
            : ''
      });
      if (shouldContinue) scheduleVideoPoll(nextVideoId, attempt + 1);
    } catch (err) {
      const message = err instanceof Error ? err.message : '视频状态查询失败';
      setVideoRender((prev) => ({ ...prev, status: 'failed', error: message }));
    }
  }

  async function submitVideoRender() {
    const prompt = firstRenderablePrompt();
    if (!prompt?.prompt) {
      setVideoRender({ status: 'failed', error: '还没有可提交的视频镜头任务。先准备视频任务。' });
      return;
    }
    const targetDuration = targetDurationSeconds();
    const referenceImages = referenceImagesForPrompt(prompt);
    const renderSpec = specForTargetDuration(targetDuration);
    const renderMode = videoModeForPrompt(prompt, renderSpec, referenceImages);
    setVideoRender({ status: 'submitting' });
    try {
      const res = await fetch('/api/video/render', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prompt: buildVideoRenderPrompt(prompt, targetDuration),
          negativePrompt: chineseOnlyVideoNegativePrompt(committedPrompts.characterConsistency?.negativePrompt),
          image: referenceImages.length === 1 && renderMode !== 'keyframes' ? referenceImages[0] : undefined,
          keyframes: referenceImages.length > 1 || renderMode === 'keyframes' ? referenceImages : undefined,
          mode: renderMode,
          spec: renderSpec
        })
      });
      const data = (await res.json()) as VideoRenderApiResponse;
      if (!res.ok) throw new Error(data.error || '视频生成提交失败');
      const nextVideoId = data.video_id || data.task_id || '';
      const status = String(data.status || '').toLowerCase();
      const failed = VIDEO_FAILED_STATUSES.includes(status);
      setVideoRender({
        status: data.videoUrl ? 'completed' : failed ? 'failed' : 'submitted',
        videoId: nextVideoId,
        videoUrl: data.videoUrl || '',
        progress: typeof data.progress === 'number' ? data.progress : undefined,
        error: failed ? videoErrorText(data.error || data.raw?.error) || '视频生成失败' : ''
      });
      if (nextVideoId && !data.videoUrl && !failed) scheduleVideoPoll(nextVideoId, 1);
    } catch (err) {
      const message = err instanceof Error ? err.message : '视频生成提交失败';
      setVideoRender({ status: 'failed', error: message });
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
  function selectCanvasNode(node: StudioCanvasNode) {
    setSelectedNodeId(node.id);
    setActiveTab(node.stage);
    setNodeRevisionText('');
    if (node.assetId) selectAsset(node.assetId);
    if (node.sceneId) selectScene(node.sceneId);
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
    void requestStageDraft(stage, workspace, undefined, revisionText, [...messages, userMessage].slice(-10), true);
  }
  function regenerateProductionStage(node: StudioCanvasNode) {
    if (!workspace) return;
    const stage: ProductionStageId = node.stage === 'overview' ? 'script' : node.stage;
    const flow = productionFlowFromWorkspace(workspace);
    const revision = flow.stages[stage].status === 'confirmed';
    void requestStageDraft(stage, workspace, undefined, node.action, messages.slice(-10), revision);
  }
  function continueFromDecision() {
    if (!selectedNode) return;
    const stage: ProductionStageId = selectedNode.stage === 'overview' ? 'script' : selectedNode.stage;
    void confirmProductionStage(stage);
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
          <button type="button" className="btn primary sm" onClick={continueFromDecision}>
            <IconCheck /> 确认并继续
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
    void requestStageDraft('storyboard', workspace, undefined, prompts[kind], messages.slice(-10), true);
  }
  function navigate(section: NavSection) {
    if (section === 'new') {
      resetProject(workspace?.mode || 'smb');
      setNavSection('mission');
      return;
    }
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
            value={modelDraft.baseUrl}
            onChange={(event) => updateModelDraft({ baseUrl: event.target.value })}
            placeholder="服务商 Base URL，例如 https://.../v1"
          />
        </label>
        <label className="field full">
          API Key
          <input
            type="password"
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
            type="button"
            className="btn primary"
            onClick={() => void saveModelConfig()}
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
    navSection === 'projects' || navSection === 'agents' || navSection === 'automation' || navSection === 'knowledge'
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
        onToggleMode={() => resetProject(workspace.mode === 'creator' ? 'smb' : 'creator')}
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
            onBack={() => setNavSection('mission')}
            onStart={startFromNav}
            onNewProject={() => {
              resetProject(workspace.mode);
              setNavSection('mission');
            }}
          />
        ) : homeMode ? (
          <div className="home-view">
            <div className="home-top">
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
                            className="hp-style"
                            onClick={() => {
                              setInstruction(`${instruction}\n视觉风格：${style.label}（${style.hint}）`.trim());
                              setHomeMenu(null);
                            }}
                          >
                            <strong>{style.label}</strong>
                            <small>{style.hint}</small>
                          </button>
                        ))}
                      </div>
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
              <button type="button" className="btn" onClick={() => resetProject(workspace.mode)}>
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
          <div className="studio-workbench">
            <aside className="studio-assistant">
              <div className="studio-assistant-head">
                <span className={`ms-status ${runStatus}`}>
                  <span className="dot" />
                  {runStatusLabel}
                </span>
                <h2>制作助理</h2>
                <p>{brief.title}</p>
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
                <button type="button" className="assistant-action" onClick={() => setActiveTab('video')}>
                  <IconFilm /> 查看视频任务
                </button>
                <button type="button" className="assistant-action" onClick={() => setModelPanelOpen(true)}>
                  <IconGauge /> 模型与规格
                </button>
              </div>
            </aside>

            <section className="studio-main">
              <header className="studio-topbar">
                <div className="studio-title">
                  <small>创作空间</small>
                  <strong>{brief.title}</strong>
                </div>
                <nav className="studio-stage-nav" role="tablist" aria-label="创作阶段">
                  {studioStages.map((stage) => (
                    <button
                      key={stage.id}
                      type="button"
                      role="tab"
                      aria-label={`聚焦${stage.label}阶段`}
                      className={activeTab === stage.id ? 'active' : ''}
                      onClick={() => focusStudioStage(stage.id)}
                    >
                      {stage.label}
                    </button>
                  ))}
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
                  <button type="button" className="btn" onClick={() => resetProject(workspace.mode)}>
                    <IconPlus /> 新建
                  </button>
                </div>
              </header>

              <div className="studio-canvas">
                <section className="asset-canvas" aria-label="资产画布">
                  <div className="asset-canvas-head">
                    <div>
                      <small>Mission Map</small>
                      <strong>资产依赖图</strong>
                    </div>
                    <div className="map-legend" aria-label="节点状态说明">
                      <span><i className="ready" /> 已确认</span>
                      <span><i className="warning" /> 待审</span>
                      <span><i className="stale" /> 过期</span>
                      <span><i className="needs_review" /> 重审</span>
                      <span><i className="draft" /> 待生成</span>
                    </div>
                  </div>
                  <div className="canvas-viewport">
                    <div className="canvas-path" style={cameraStyle}>
                      {canvasNodes.map((node, index) => {
                        const nodeLibraryKey = libraryKeyFor(node);
                        const nodeInLibrary = libraryKeys.has(nodeLibraryKey);
                        const nodePendingLibrary = pendingLibraryItems.some((item) => libraryItemKey(item) === nodeLibraryKey);
                        const nodeCanEnterLibrary =
                          isNodeStableForLibrary(node, workspace) && !nodeInLibrary && !nodePendingLibrary;
                        return (
                          <div className={`canvas-step stage-${node.stage}`} key={node.id}>
                            <div className="canvas-node-shell">
                              <button
                                type="button"
                                className={`canvas-node ${node.status} ${node.dependencyState} ${selectedNode?.id === node.id ? 'selected' : ''} ${node.patchCount ? 'has-patch' : ''}`}
                                onClick={() => selectCanvasNode(node)}
                              >
                                <span className="node-meta">
                                  <span className="node-label">{node.label}</span>
                                  <span className="node-owner">{node.owner}</span>
                                </span>
                                <strong>{node.title}</strong>
                                <small>{node.summary}</small>
                                <span className="node-foot">
                                  <span>{nodeStatusText(node.status, node.patchCount, node.dependencyState)}</span>
                                  {typeof node.childCount === 'number' && <span>{node.childCount} 项</span>}
                                </span>
                              </button>
                              <div className="node-asset-actions" aria-label={`${node.label}资产操作`}>
                                <button type="button" onClick={() => selectCanvasNode(node)} title={`预览${node.label}资产`}>
                                  <IconList /> 预览
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    selectCanvasNode(node);
                                    regenerateProductionStage(node);
                                  }}
                                  title={`重新生成${node.label}`}
                                >
                                  <IconRefresh /> 重新生成
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    selectCanvasNode(node);
                                    setNodeRevisionText(`替换资产「${node.title}」：请只修改 ${node.filePath}，并说明对下游的影响。`);
                                  }}
                                  title={`替换${node.label}资产`}
                                >
                                  <IconStack /> 替换资产
                                </button>
                                <button
                                  type="button"
                                  disabled={!nodeCanEnterLibrary}
                                  onClick={() => proposeAssetLibraryPatch(node)}
                                  title={nodeCanEnterLibrary ? `将${node.label}入库` : '只有稳定节点才能入库'}
                                >
                                  <IconGitMerge /> 入库
                                </button>
                              </div>
                            </div>
                            {index < canvasNodes.length - 1 && (
                              <span className={`canvas-link ${node.status}`}>
                                <span>{canvasEdgeLabel(node.stage)}</span>
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div className="canvas-camera-hud">
                      <span>{activeStageCamera.label}</span>
                      <strong>{Math.round(activeStageCamera.zoom * 100)}%</strong>
                      <small>{activeStageCamera.hint}</small>
                    </div>
                  </div>
                  {selectedNode && (
                    <div className="canvas-selection">
                      <span>{selectedNode.label}</span>
                      <strong>{nodeStatusReason(selectedNode)}</strong>
                      <small>{selectedNode.dependencyReason}</small>
                    </div>
                  )}
                  <div className="asset-proof-strip" aria-label="已生成资产预览">
                    <article className="script-proof-card">
                      <div className="proof-card-head">
                        <span>已生成脚本</span>
                        <strong>{hasScriptOutput ? `${scriptLineCount} 行正文` : '待生成'}</strong>
                      </div>
                      <pre>{hasScriptOutput ? scriptProofPreview : '脚本正文还没有生成。先让制作助理写入 script.md，再审查开头、冲突、台词和 CTA。'}</pre>
                      <button type="button" className="btn sm" onClick={revealScriptOutput}>
                        <IconScript /> 查看全文
                      </button>
                    </article>
                    <div className="character-proof-list">
                      {visibleCharacterAssets.length ? (
                        visibleCharacterAssets.slice(0, 2).map((character) => (
                          <article className="character-proof-card" key={character.id}>
                            <span>{character.role}</span>
                            <strong>{character.name}</strong>
                            <p>{character.description}</p>
                            <button type="button" className="btn primary sm" onClick={() => void confirmProductionStage('character')}>
                              <IconCheck /> 确认角色
                            </button>
                          </article>
                        ))
                      ) : (
                        <article className="character-proof-card empty-proof">
                          <span>角色</span>
                          <strong>待生成角色卡</strong>
                          <p>角色还没有从剧本中抽取出来。先生成或补齐 asset_prompts.json。</p>
                          <button type="button" className="btn sm" onClick={() => focusStudioStage('character')}>
                            <IconUsers /> 查看角色
                          </button>
                        </article>
                      )}
                    </div>
                  </div>
                </section>

                <section className="studio-board">
                  <div className="studio-board-head">
                    <div>
                      <small>{studioStageLabel}</small>
                      <h1>{activeTab === 'overview' ? previewInfo.hook : selectedAssetTitle}</h1>
                    </div>
                    {pendingPatches.length > 0 && (
                      <span className="package-review-badge">
                        <IconGitMerge /> {pendingPatches.length} 个 patch 待审
                      </span>
                    )}
                  </div>

                  {pendingPatches.length > 0 && (
                    <section className="package-review-panel" aria-label="制作包待审">
                      <div className="package-review-head">
                        <div>
                          <small>Patch Review</small>
                          <strong>制作包待审</strong>
                          <span>先审查每个文件改动，再决定合并或拒绝。</span>
                        </div>
                        <div className="package-review-actions">
                          {lowRiskPatchIds.length > 0 && lowRiskPatchIds.length < pendingPatches.length && (
                            <button type="button" className="btn sm" onClick={() => approvePatchIds(lowRiskPatchIds)}>
                              <IconCheck /> 合并低风险 {lowRiskPatchIds.length}
                            </button>
                          )}
                          <button type="button" className="btn sm primary" onClick={() => approvePatchIds(allPendingPatchIds)}>
                            <IconGitMerge /> 合并全部 {pendingPatches.length}
                          </button>
                        </div>
                      </div>
                      <div className="package-review-stages" aria-label="待审阶段">
                        {patchReviewStageCounts.map((stage) => (
                          <span key={stage.id}>
                            {stage.label}
                            <strong>{stage.count}</strong>
                          </span>
                        ))}
                      </div>
                      <div className="package-review-list">
                        {pendingPatches.map((patch) => (
                          <article className={`package-patch-row ${selectedPatch?.id === patch.id ? 'selected' : ''}`} key={patch.id}>
                            <button type="button" className="package-patch-main" onClick={() => setSelectedPatchId(patch.id)}>
                              <span className={`package-patch-risk ${patch.riskLevel}`}>{patchRiskLabel(patch.riskLevel)}</span>
                              <span className="package-patch-copy">
                                <strong>{patch.filePath}</strong>
                                <small>{patch.summary}</small>
                              </span>
                              <span className="package-patch-stage">{studioStageName(patchReviewStage(patch))}</span>
                            </button>
                            <div className="package-patch-actions">
                              <button type="button" className="btn sm danger" onClick={() => rejectPatchIds([patch.id])}>
                                <IconX /> 拒绝
                              </button>
                              <button type="button" className="btn sm primary" onClick={() => approvePatchIds([patch.id])}>
                                <IconGitMerge /> 合并
                              </button>
                            </div>
                          </article>
                        ))}
                      </div>
                    </section>
                  )}

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
                    <div className="studio-script-preview">
                      <pre className="script-output">{selectedAssetBody}</pre>
                    </div>
                  )}

                  {activeTab === 'character' && (
                    <div className="studio-character-preview">
                      <div className="character-stage-head">
                        <small>Character Design</small>
                        <strong>{visibleCharacterAssets.length ? '角色设计台' : '角色设定待生成'}</strong>
                        <p>先看到并调整真实角色图，再确认 Face ID、年龄阶段、多视角和表情资产。未经确认的角色图不会静默替换视频任务。</p>
                      </div>
                      {roleDesignNotice && <div className="character-design-notice">{roleDesignNotice}</div>}
                      {visibleCharacterAssets.length ? (
                        <div className="character-asset-grid">
                          {visibleCharacterAssets.map((character, characterIndex) => {
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
                                      onClick={() => setRoleFaceAnchorDrafts((prev) => ({ ...prev, [character.id]: activeVariant.id }))}
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
                                          onClick={() => setRoleReferenceStrategyDrafts((prev) => ({ ...prev, [character.id]: strategy.id }))}
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
                                            onClick={() => toggleCharacterExpression(character.id, expression.id)}
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
                                        onClick={() => setNodeRevisionText(`我要修改角色「${character.name}」：请只修改 asset_prompts.json 中这个角色的身份、外观、一致性提示词、参考策略和表情要求，不要改动已生成脚本。`)}
                                      >
                                        <IconWand /> 修改文字设定
                                      </button>
                                      <button
                                        type="button"
                                        className="btn primary sm"
                                        disabled={!portraitRender.imageUrl}
                                        onClick={() => proposeCharacterReferencePatch(character, activeVariant, portraitRender.imageUrl)}
                                      >
                                        <IconGitMerge /> 应用到视频任务
                                      </button>
                                      <button
                                        type="button"
                                        className="btn sm"
                                        onClick={() => {
                                          void confirmProductionStage('character');
                                        }}
                                      >
                                        <IconCheck /> 确认并继续场景
                                      </button>
                                    </div>
                                  </section>
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="empty">
                          角色资产会从已确认剧本中抽取。请让制作助理补齐角色外观、服装、表情、风格和跨镜头一致性。
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === 'scene' && (
                    <div className="studio-scene-grid">
                      {scenes.length ? scenes.map((scene) => (
                        <button key={scene.id} type="button" className={`scene-tile ${activeScene?.id === scene.id ? 'active' : ''}`} onClick={() => selectScene(scene.id)}>
                          <strong>{scene.title}</strong>
                          <span>{scene.subtitle || scene.visual}</span>
                        </button>
                      )) : <div className="empty">场景资产会在剧本和分镜完成后出现。</div>}
                    </div>
                  )}

                  {activeTab === 'storyboard' && (
                    <StoryboardView
                      shots={storyboard}
                      selectedId={activeScene?.id || ''}
                      cameraMove={cameraMoveLabel(videoSpec.cameraMove)}
                      onSelect={selectScene}
                      onRewrite={rewriteShot}
                    />
                  )}

                  {activeTab === 'video' && (
                    <div className="video-stage">
                      <div className="video-stage-head">
                        <h2>视频生成准备</h2>
                        <p>把已确认的脚本、分镜和素材提示词整理成视频模型任务</p>
                      </div>
                      <VideoGenHandoff
                        ready={handoffReady}
                        missing={handoffMissing}
                        data={{
                          visualStyle: committedPrompts.visualStyle,
                          renderSpec: {
                            ...(committedPrompts.renderSpec || {}),
                            cameraMove: cameraMoveLabel(videoSpec.cameraMove),
                            frameLock: frameLockLabel(videoSpec.frameLock)
                          },
                          character: committedPrompts.characterConsistency,
                          prompts: committedPrompts.prompts,
                          renderQueue: committedPrompts.renderQueue
                        }}
                        renderState={videoRender}
                        onRender={() => void submitVideoRender()}
                        onPoll={() => void pollVideoRender()}
                        onPrepare={() => workspace && void requestStageDraft(
                          'video',
                          workspace,
                          undefined,
                          '请基于已确认的制作包，重新准备可提交给视频模型的镜头级生成任务、首帧提示、角色一致性提示和渲染参数。不要声称已渲染 MP4。',
                          messages.slice(-10),
                          true
                        )}
                      />
                    </div>
                  )}
                </section>
              </div>
            </section>

            <aside className="studio-current">
              <div className="studio-current-head">
                <small>当前节点检查器</small>
                <h2>{selectedNode?.label || studioStageLabel}</h2>
                <p>{selectedNode?.filePath || selectedAssetFileName}</p>
              </div>

              {selectedNode && (
                <section className="studio-inspector-panel node-detail-panel">
                  <div className="studio-inspector-title">
                    <IconLayers />
                    <div>
                      <strong>{selectedNode.title}</strong>
                      <small>{selectedNode.owner} · {nodeStatusText(selectedNode.status, selectedNode.patchCount, selectedNode.dependencyState)}</small>
                    </div>
                  </div>
                  <div className={`dependency-health ${selectedNode.dependencyState}`}>
                    <span>{dependencyStateText(selectedNode.dependencyState)}</span>
                    <strong>{selectedNode.dependencySource}</strong>
                    <p>{selectedNode.dependencyReason}</p>
                  </div>
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
                    />
                    <div className="node-revision-actions">
                      <button type="button" className="btn sm" onClick={() => setNodeRevisionText(selectedNode.action)}>
                        <IconSparkles /> 填入建议
                      </button>
                      <button type="submit" className="btn primary sm" disabled={loading}>
                        <IconSend /> 提交节点修改
                      </button>
                    </div>
                  </form>
                </section>
              )}

              {selectedNodePatches.length > 0 && (
                <section className="studio-inspector-panel node-patch-panel">
                  <div className="studio-inspector-title">
                    <IconGitMerge />
                    <div>
                      <strong>当前节点 patch</strong>
                      <small>{selectedNodePatches.length} 个改动等待审批</small>
                    </div>
                  </div>
                  <ApprovalQueue
                    patches={selectedNodePatches}
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

              {activeTab === 'script' && selectedAssetBody.trim() && (
                <section className="studio-inspector-panel script-review-panel">
                  <div className="studio-inspector-title">
                    <IconScript />
                    <div>
                      <strong>{selectedAssetTitle}</strong>
                      <small>{selectedAssetFileName}</small>
                    </div>
                  </div>
                  <pre className="script-output">{selectedAssetBody}</pre>
                </section>
              )}

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
                    patches={pendingPatches}
                    selectedId={selectedPatch?.id || ''}
                    onSelect={(id) => setSelectedPatchId(id)}
                    onApprove={(id) => approvePatchIds([id])}
                    onReject={(id) => rejectPatchIds([id])}
                  />
                </section>
              )}

              {activeTab !== 'script' && activeTab !== 'video' && (
                <section className="studio-inspector-panel">
                  <div className="studio-inspector-title">
                    <IconStack />
                    <div>
                      <strong>{selectedAssetTitle}</strong>
                      <small>{selectedAssetFileName}</small>
                    </div>
                  </div>
                  <pre className="script-output">{selectedAssetBody || previewInfo.sub}</pre>
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
                  <div className="settings-grid" style={{ marginTop: 14 }}>
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
                  </div>
                </div>
              </details>
            </aside>
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
            <div className="settings-grid">{renderModelSettingsFields('panel-model', true)}</div>
          </div>
        </div>
      )}

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
