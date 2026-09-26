import { agentLoop } from './agentLoop';
import { characterContractIssues, describeCharacterIssues, repairCharactersContent } from './characterRepair';
import {
  describeSceneIssues,
  repairScenesContent,
  sceneContractIssues,
  scenesFromScript,
  scriptSections,
  type SceneRepairContext
} from './sceneRepair';
import { characterVisualDraftSkeleton } from './characterVisualSpec';
import { callModel } from './modelGateway';
import { describeUpstreamModelError } from './providerErrors';
import {
  allowedStageOutputFiles,
  filterStagePatches,
  stageConfig,
  stageGenerationInstruction,
  stageOutputFilesForWorkspace,
  stagePromptContextFiles,
  stageSourceFiles
} from './stageGeneration';
import { stagePromptWorkspace } from './stagePromptContext';
import { qaLedgerFromWorkspace, qaLedgerInstruction } from './qaLedger';
import {
  clampShotDuration,
  detectPhysicsRisks,
  normalizePhysicsMode,
  physicsNegativePrompt,
  physicsPromptDirective
} from './shotPhysics';
import { stageStyleInstruction, styleBookFromWorkspace } from './styleBook';
import { dialoguePromptDirective, isDialogueNarration, toDialogueNarration, voiceNegativePrompt } from './voiceMode';
import { InvalidStageOutputError, assertValidScriptStageBundle, isInternalStageInstruction } from './scriptStageValidation';
import { agentRoster, getSkillByWorkflow, missionAssetsFromWorkspace } from './workspace';
import { getRuntimeSkillDetail, skillAutoloadEvent } from './skillRuntime';
import { genreSkillAutoloadEvent, genreSkillPlan, genreSkillSection } from './genreSkillRouter';
import type {
  AgentEvent,
  AgentRunRequest,
  AgentRunResponse,
  AIGCAgentId,
  ComplianceCheck,
  MissionAsset,
  PatchOperation,
  PreviewScene,
  PreviewState,
  TemplateFallbackReason,
  ToolEvent,
  WorkflowKind
} from './types';

const JSON_GUARD = `Return only valid JSON. Do not wrap it in markdown. JSON shape:
{
  "assistantMessage": string,
  "plan": string[],
  "toolEvents": [{"toolName": string, "status": "pending"|"running"|"success"|"warning"|"failed"|"blocked"|"approval_required", "title": string, "summary": string}],
  "agentEvents": [{"agentId": "orchestrator"|"creative_director"|"brief"|"viral_ref"|"scene"|"script"|"shot"|"editor"|"prompt"|"platform"|"compliance"|"data"|"review", "agentName": string, "status": "pending"|"running"|"success"|"warning"|"blocked", "action": string, "output": string}],
  "assets": [{"type":"brief"|"reference"|"scene"|"script"|"shot"|"timeline"|"prompt"|"copy"|"compliance"|"feedback"|"calendar", "title": string, "status":"draft"|"ready"|"warning"|"blocked", "filePath": string, "summary": string}],
  "patchOperations": [{"filePath": string, "summary": string, "before": string, "after": string, "riskLevel": "low"|"medium"|"high", "requiresApproval": true}],
  "complianceChecks": [{"type":"ai_disclosure"|"marketing_claim"|"asset_rights"|"likeness_rights"|"sensitive_industry"|"platform_policy", "status":"pass"|"warning"|"blocked", "message": string}],
  "preview": {"title": string, "subtitle": string, "cta": string, "durationSeconds": number, "timelineVersion": number, "platform": string, "mode": "creator"|"smb", "workflow": string, "scenes": [{"id": string, "title": string, "visual": string, "subtitle": string, "durationSeconds": number}]},
  "notes": string[]
}`;

const OUTPUT_LANGUAGE_POLICY = `输出语言规则：
- 所有面向用户的内容必须使用简体中文，包括 assistantMessage、plan、toolEvents.title/summary、agentEvents.action/output、assets.title/summary、patchOperations.summary、complianceChecks.message、preview、notes，以及 patch 里的 Markdown 正文。
- JSON key、文件名、模型名、供应商名、平台专名和枚举值可以保留英文；除此之外，JSON value 也必须优先使用中文。
- asset_prompts.json 是给用户审查的视频生成任务包，不是纯机器参数。视频模型提示词、首帧提示、角色一致性提示和避免项都必须提供中文可审查文本。
- 如果下游视频模型后续需要英文提示词，只能在明确的可选字段里补充；主字段 prompt、renderTask、consistencyPrompt、negativePrompt 必须是中文。`;

const PROVIDER_SYSTEM_PROMPT =
  '你是严格输出 JSON 的 AI 原生 AIGC Mission Control 后端。不要输出 markdown，不要包含隐藏推理链。除 JSON key、文件名、模型名、供应商名和必要枚举值外，所有面向用户的值必须使用简体中文。';

/**
 * 和 agentMaxTokens 是一对：额度调大 → 输出更长 → 耗时更久。
 * 整集剧本在慢速中转上实测 85s+，90s 余量不够，一波动就被自己掐断。
 * 写成函数而不是模块常量：常量会在模块加载时固化，改了 .env 也要重启才生效。
 */
function agentTimeoutMs(): number {
  const configured = Number(process.env.AGENT_PROVIDER_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : 180000;
}

const defaultWorkflowRules: Record<WorkflowKind, string> = {
  generate: '从目标生成完整 AIGC 内容资产包。',
  rewrite: '保留有效事实，重写旧稿结构和表达。',
  weekly: '生成一周内容计划，并形成可继续展开的任务队列。',
  brand: '理解品牌、受众、卖点、语气和禁用表达。',
  viral_ref: '把爆款参考拆成可复用的结构和表达方法。',
  topic: '基于品牌上下文和平台规则生成选题。',
  scene: '把内容拆成场景级任务和剪辑节奏。',
  script: '生成 Hook、叙事文案、人物对白、字幕、标题和封面文案。',
  shot: '生成视觉分镜、运镜、动作和构图建议。',
  prompt: '生成 AIGC 图片和视频素材提示词。',
  motion_director: '由创意总监按需调用动态导演，把确认后的制作包整理成可审查的视频任务提示词。',
  platform: '适配小红书、抖音、TikTok 和 Instagram 的表达。',
  compliance: '检查营销承诺、平台风险、素材授权、肖像权和 AI 标识。',
  approval: '汇总变更、记录人工反馈，并准备可审批 patch。',
  competitor: '把竞品内容拆成可复用的内容策略。',
  hotspot: '把热点转成品牌安全的内容角度。',
  titles: '生成标题和封面文案变体。',
  cta: '生成评论区和线索收集 CTA 变体。',
  live_clip: '把直播素材转成短视频切片脚本。',
  image_note: '生成小红书图文笔记资产。',
  ad_variants: '按受众和卖点生成广告素材变体。',
  multiplatform: '把同一内容资产改写成多个平台版本。',
  calendar: '生成内容日历和可展开的 Mission 项。'
};

function id() {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * 上下文里单个文件的字符上限。
 *
 * 原来是 7000 且【静默】截断：一份 12 小节的三分钟剧本很容易超过它，
 * 模型看到的剧本会在半句话处断掉，而且没有任何迹象说明后面还有内容——
 * 于是它按看到的那半份剧本产出角色，人数和剧情都对不上，谁也不知道为什么。
 *
 * 但也不能干脆不设上限：用户上传和生成的图片是以 data:image/...;base64 的形式
 * 直接存在 characters.json / scenes.json 里的（单张上限 512KB，工作区上限 32MB）。
 * 一张 512KB 的图就是约 52 万字符，几张就能把上下文窗口撑爆、把 token 烧光，
 * 而模型从 base64 文本里根本读不出任何画面。
 *
 * 所以正确的顺序是：先把图片数据剥掉，再对剩下的纯文本放开。
 * 剥完之后真实文本通常只有几万字符，这个上限只是防失控的安全天花板，正常内容碰不到。
 */
const PROMPT_FILE_CHAR_LIMIT = 200000;

/** 内嵌图片数据。图片字节对文本模型没有任何信息量，只会挤掉真正要读的剧本。 */
const EMBEDDED_IMAGE_PATTERN = /data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g;

export function stripEmbeddedImageData(content: string): { content: string; stripped: number } {
  let stripped = 0;
  const next = content.replace(EMBEDDED_IMAGE_PATTERN, (match) => {
    stripped += match.length;
    // 保留「这里原本有一张图」这个事实，但一个字节的图像数据都不发。
    return '[已生成的图片数据，与你无关，图片字段一律按契约留空]';
  });
  return { content: next, stripped };
}

type PromptFile = {
  path: string;
  version: number;
  kind: string;
  content: string;
  truncated?: true;
  fullLength?: number;
  strippedImageChars?: number;
};

function compactWorkspace(req: AgentRunRequest): PromptFile[] {
  const sourceFiles = req.productionStage ? new Set(stagePromptContextFiles(req.productionStage)) : null;
  return req.workspace.files.filter((file) => !sourceFiles || sourceFiles.has(file.path)).map((file) => {
    const { content: text, stripped } = stripEmbeddedImageData(file.content);
    const truncated = text.length > PROMPT_FILE_CHAR_LIMIT;
    return {
      path: file.path,
      version: file.version,
      kind: file.kind,
      ...(stripped ? { strippedImageChars: stripped } : {}),
      ...(truncated ? { truncated: true as const, fullLength: text.length } : {}),
      content: truncated
        ? `${text.slice(0, PROMPT_FILE_CHAR_LIMIT)}\n\n[本文件在这里被截断，后面还有 ${text.length - PROMPT_FILE_CHAR_LIMIT} 个字符没有给你。不要假设内容到此为止，也不要因为看不到而漏掉后面出现的人物或段落。]`
        : text
    };
  });
}

/** 上下文里有文件被截断时的警告，交给调用方变成用户可见的 toolEvent。 */
function truncatedContextWarnings(req: AgentRunRequest): string[] {
  return compactWorkspace(req)
    .filter((file) => file.truncated)
    .map((file) => `${file.path} 剥掉图片数据后仍有 ${file.fullLength} 个字符，只有前 ${PROMPT_FILE_CHAR_LIMIT} 个字符进了模型上下文，后面的人物和段落模型看不到。`);
}

function assertStageSourceVersions(req: AgentRunRequest) {
  if (!req.productionStage) return;
  const expectedFiles = stageSourceFiles(req.productionStage);
  const requestedVersions = req.sourceVersions || {};
  const expectedSet = new Set(expectedFiles);

  for (const path of Object.keys(requestedVersions)) {
    if (!expectedSet.has(path)) {
      throw new Error(`productionStage ${req.productionStage} sourceVersions contains unexpected input: ${path}`);
    }
  }

  for (const path of expectedFiles) {
    const requestedVersion = requestedVersions[path];
    const workspaceFile = req.workspace.files.find((file) => file.path === path);
    if (!workspaceFile) {
      throw new Error(`productionStage ${req.productionStage} sourceVersions requires missing input: ${path}`);
    }
    if (typeof requestedVersion !== 'number' || workspaceFile.version !== requestedVersion) {
      throw new Error(`productionStage ${req.productionStage} sourceVersions mismatch for ${path}: requested ${String(requestedVersion)}, workspace ${workspaceFile.version}`);
    }
  }
}

function requestedStageOutputFiles(req: AgentRunRequest): string[] {
  if (!req.productionStage) return [];
  const mode = req.stageRequestMode || 'initial';
  const target = req.stageRequestTarget === 'stage' ? 'stage' : 'artifact';
  const expected = stageOutputFilesForWorkspace(req.productionStage, mode, req.workspace, target);
  if (!Array.isArray(req.requestedOutputFiles)) return expected;

  const requested = allowedStageOutputFiles(req.productionStage, req.requestedOutputFiles);
  const exactRequest = req.requestedOutputFiles.length === requested.length &&
    requested.length === expected.length &&
    expected.every((filePath, index) => requested[index] === filePath);
  if (!exactRequest) {
    throw new Error(`productionStage ${req.productionStage} output scope mismatch: expected ${expected.join(', ')}`);
  }
  return expected;
}

function inferWorkflow(req: AgentRunRequest): WorkflowKind {
  if (req.productionStage) return stageConfig(req.productionStage).workflow;
  if (req.workflow) return req.workflow;
  const text = req.instruction.toLowerCase();
  if (text.includes('/video-prompt') || text.includes('/motion') || text.includes('动态导演')) return 'motion_director';
  if (text.includes('/calendar') || text.includes('内容日历')) return 'calendar';
  if (text.includes('/weekly') || text.includes('一周') || text.includes('7 条') || text.includes('7条')) return 'weekly';
  if (text.includes('/revise') || text.includes('改写') || text.includes('爆改') || text.includes('旧稿')) return 'rewrite';
  if (text.includes('/competitor') || text.includes('竞品')) return 'competitor';
  if (text.includes('/hotspot') || text.includes('热点')) return 'hotspot';
  if (text.includes('/titles') || text.includes('标题')) return 'titles';
  if (text.includes('/cta') || text.includes('引流')) return 'cta';
  if (text.includes('/liveclip') || text.includes('直播')) return 'live_clip';
  if (text.includes('/note') || text.includes('图文')) return 'image_note';
  if (text.includes('/ads') || text.includes('广告')) return 'ad_variants';
  if (text.includes('/multi') || text.includes('多平台')) return 'multiplatform';
  if (text.includes('/brand')) return 'brand';
  if (text.includes('/viral')) return 'viral_ref';
  if (text.includes('/topic')) return 'topic';
  if (text.includes('/scene')) return 'scene';
  if (text.includes('/script')) return 'script';
  if (text.includes('/shot')) return 'shot';
  if (/(视频提示词|分时段运镜|动作编排|多模态参考|音乐卡点|一镜到底|视频续写|视频延长|视频编辑)/.test(text)) return 'motion_director';
  if (text.includes('/prompt')) return 'prompt';
  if (text.includes('/platform')) return 'platform';
  if (text.includes('/compliance')) return 'compliance';
  if (text.includes('/approval')) return 'approval';
  return req.workspace.activeWorkflow || 'generate';
}

function isPureQuestion(req: AgentRunRequest) {
  if (req.productionStage) return false;
  const text = req.instruction.trim();
  if (!text) return true;
  const hasProductionIntent = /生成|写|做|产出|创建|补|改|拆|分镜|脚本|prompt|文案|视频|短剧|内容包|patch/i.test(text);
  if (hasProductionIntent) return false;
  return /[?？]$/.test(text) || /^(为什么|怎么|如何|是否|能不能|可以吗|啥|什么|where|why|how|what|can|could|should)\b/i.test(text);
}

function buildPrompt(req: AgentRunRequest) {
  const workflow = inferWorkflow(req);
  const skill = getRuntimeSkillDetail(workflow);
  const genreSection = genreSkillSection(genreSkillPlan(req.genre, req.productionStage));
  const stageInstruction = req.productionStage
    ? stageGenerationInstruction(
        req.productionStage,
        JSON.stringify(videoSpecFromInstruction(req)),
        requestedStageOutputFiles(req),
        req.stageBatch
      ) + stageStyleInstruction(styleBookFromWorkspace(req.workspace), req.productionStage)
      // 账本原文也在脚本阶段的上下文文件里，但那是一坨 JSON。这里额外给一段聚合结论，
      // 因为「anatomy 被打回 7 次」比二百条原始记录更可能真的改变模型的写法。
      + (req.productionStage === 'script' ? qaLedgerInstruction(qaLedgerFromWorkspace(req.workspace)) : '')
    : '';
  return `你是 VideoAgent Code，一个 AI 原生 AIGC Mission Control 后端。

${OUTPUT_LANGUAGE_POLICY}

User instruction:
${req.instruction}

Workflow:
${workflow}
${defaultWorkflowRules[workflow]}

Selected skill:
${skill ? JSON.stringify(skill, null, 2) : 'Generic mission generation'}
${genreSection ? `\nGenre skills:\n${genreSection}\n` : ''}
Project metadata:
${JSON.stringify(
  {
    projectId: req.workspace.projectId,
    title: req.workspace.title,
    branch: req.workspace.branch,
    mode: req.workspace.mode,
    activeWorkflow: req.workspace.activeWorkflow,
    currentTimelineVersion: req.workspace.currentTimelineVersion,
    complianceStatus: req.workspace.complianceStatus,
    productionStage: req.productionStage || null,
    generationJobId: req.generationJobId || null,
    sourceVersions: req.sourceVersions || {},
    requestedOutputFiles: req.productionStage ? requestedStageOutputFiles(req) : []
  },
  null,
  2
)}

Workspace files:
${JSON.stringify(compactWorkspace(req), null, 2)}

AI Native product model:
- Mission：用户给出业务或内容目标。
- Context Stack：profile、brief、爆款参考、平台规则、素材库、campaign goal 和 memory。
- Agent Runtime 分两层：
  1. 垂直场景 SubAgent 先判断片种和制作上下文，例如营销、短剧、产品演示、解释型内容、生活方式或品牌视频。
  2. 横向生产 Agent 负责具体资产：创意方向、Brief、爆款拆解、场景、脚本、分镜、剪辑、提示词、平台适配、合规、反馈和 Review。
- AIGC Asset Pipeline：brief、references、scenes、script、storyboard、timeline、prompts、publish copy、compliance report、feedback report。
- 视频生产交接：场景 SubAgent 必须先产出可编辑制作包，包括脚本、人物设定、场景设定、分镜、动作、服装、眼神、对白和运镜说明。
- 视频生成准备 Agent 只接收已确认的制作包，并输出镜头任务、首帧提示、角色一致性提示、避免项和生成参数。
- 审批：持久写入必须以完整文件 patch 提交，并等待用户批准。
- 数据分析师只能记录人工选择、退回原因、偏好信号和假设。除非 workspace 文件里已有真实数据，否则不得虚构 CTR、ROI、转化率、投放金额或广告平台表现。

Canonical workspace files:
- profile.json
- brief.json
- viral_refs.json
- campaign_goal.json
- characters.json
- scenes.json
- script.md
- storyboard.json
- timeline.json
- asset_prompts.json
- publish_copy.json
- platform_rules.json
- asset_library.json
- compliance_report.json
- feedback_report.json
- video_spec.json
- production_flow.json
- .aigc/MEMORY.md

Rules:
- 不要声称已经生成真实 MP4、图片、社交媒体帖子或已完成外部发布。
- 不要从用户想法直接跳到最终视频。必须先生成可编辑脚本、分镜、人物和运镜细节，再准备视频生成任务。
- asset_prompts.json 只能代表“视频生成任务已准备”，不能证明视频已经渲染完成。
- 不要创建登录、账单、团队权限、OAuth 或真实连接器能力。
- 创作者模式强调人设、平台适配、内容节奏和互动。
- 小 B 模式强调卖点清楚、可信、低压转化和合规。
- 避免绝对化承诺、保证结果、未授权肖像/声音、隐性广告和未知授权素材。
- 每个可见 Agent 必须对应一个产出、检查或 patch。
- Creative Director 必须落到 brief.json 或 campaign_goal.json 里的方向约束。
- 剪辑师必须落到 timeline.json。
- 数据分析师必须落到 feedback_report.json，且只能使用人工或明确提供的数据。
- Patch before/after 字段必须包含每个被修改文件的完整内容。
- 除非用户只是提问，否则必须至少包含一个 patchOperation。

${stageInstruction}

${JSON_GUARD}`;
}

/** 阶段生成要一次吐出完整 brief + 目标 + 脚本，默认额度必须够装下一整集剧本。 */
function agentMaxTokens(): number {
  const configured = Number(process.env.AGENT_MODEL_MAX_TOKENS);
  return Number.isFinite(configured) && configured > 0 ? configured : 8000;
}

/**
 * 输出被截断时必须当场说清楚。否则半截 JSON 会一路流到解析器，
 * 报出「模型没返回合法 JSON」——一个和真实原因毫不相干的结论。
 */
function assertNotTruncated(finishReason: unknown, provider: string, note = '') {
  if (finishReason === 'length' || finishReason === 'max_tokens') {
    throw new Error(
      `${provider} 模型输出被截断：已达 max_tokens 上限（当前 ${agentMaxTokens()}）。` +
      `请调高环境变量 AGENT_MODEL_MAX_TOKENS，或把本轮目标拆小后重试。${note}`
    );
  }
}

/** 语法坏掉的 JSON 值得再花一次调用去修；截断和空内容重修一百次也是一样的结果。 */
const MALFORMED_JSON = Symbol.for('videoagent.malformedJson');

function isMalformedJsonError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as Record<symbol, unknown>)[MALFORMED_JSON]);
}

function stripCodeFence(text: string): string {
  // 系统提示写了「不要 markdown」，弱模型照样套围栏。当成常态处理，别当成异常。
  const fenced = text.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
  return fenced ? fenced[1].trim() : text;
}

/**
 * 只按 JSON 词法扫一遍，回答两个问题：括号收没收干净、字符串闭没闭合。
 * 光看「有没有最后一个 }」会把「截断在嵌套对象之后」误判成格式错误——
 * 嵌套对象自己那个 } 就在结尾，看起来完全像闭合了。
 */
function scanJsonStructure(text: string): { depth: number; inString: boolean } {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{' || ch === '[') depth += 1;
    else if (ch === '}' || ch === ']') depth -= 1;
  }
  return { depth, inString };
}

const CONTROL_ESCAPES: Record<string, string> = {
  '\n': '\\n',
  '\r': '\\r',
  '\t': '\\t',
  '\b': '\\b',
  '\f': '\\f'
};

/**
 * 模型把整份 Markdown 塞进 patchOperations[].after 时，最常见的两种翻车：
 * 字符串里留了裸换行（JSON 禁止），以及数组/对象结尾多一个逗号。
 * 这两种都是纯语法噪音，本地就能修，没必要为它再花一次模型调用。
 */
function repairJsonText(text: string): string {
  let out = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        out += ch;
        escaped = false;
      } else if (ch === '\\') {
        out += ch;
        escaped = true;
      } else if (ch === '"') {
        out += ch;
        inString = false;
      } else if (CONTROL_ESCAPES[ch]) {
        out += CONTROL_ESCAPES[ch];
      } else if (ch < ' ') {
        // 其余控制字符没有对应转义，留着必然解析失败，直接丢。
      } else {
        out += ch;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === ',' && /^\s*[}\]]/.test(text.slice(i + 1))) continue;
    out += ch;
  }
  return out;
}

function jsonCandidates(trimmed: string): string[] {
  const candidates: string[] = [];
  const push = (value: string) => {
    const next = value.trim();
    if (next && !candidates.includes(next)) candidates.push(next);
  };
  push(trimmed);
  const unfenced = stripCodeFence(trimmed);
  push(unfenced);
  for (const base of [trimmed, unfenced]) {
    const first = base.indexOf('{');
    const last = base.lastIndexOf('}');
    if (first >= 0 && last > first) push(base.slice(first, last + 1));
  }
  for (const candidate of [...candidates]) push(repairJsonText(candidate));
  return candidates;
}

/** 只给开头 160 字符等于每次都要靠猜。把解析器报的位置和它两侧的原文一起带出来。 */
function parseErrorDetail(candidate: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const position = Number(message.match(/position (\d+)/)?.[1]);
  if (!Number.isFinite(position)) return message;
  const start = Math.max(0, position - 80);
  const end = Math.min(candidate.length, position + 80);
  return (
    `${message}\n出错位置前后：…${candidate.slice(start, position)}` +
    `⟪解析在这里失败⟫${candidate.slice(position, end)}…`
  );
}

function logRawModelOutput(text: string) {
  const capped = text.length > 20000 ? `${text.slice(0, 20000)}\n…（其余 ${text.length - 20000} 字符已截断）` : text;
  console.error(`[agentProvider] 模型 JSON 解析失败，原始输出（${text.length} 字符）↓\n${capped}`);
}

function safeJsonParse(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('模型返回了空内容，没有可解析的结果。');

  const attempts: { candidate: string; error: unknown }[] = [];
  for (const candidate of jsonCandidates(trimmed)) {
    try {
      return JSON.parse(candidate);
    } catch (error) {
      attempts.push({ candidate, error });
    }
  }

  logRawModelOutput(trimmed);

  const body = stripCodeFence(trimmed);
  const scan = scanJsonStructure(body);
  // 结构没收干净 = 几乎必然是被截断，而不是模型"不会输出 JSON"。
  if (/^[{[]/.test(body) && (scan.depth > 0 || scan.inString)) {
    throw new Error(
      `模型输出被截断：收到 ${trimmed.length} 个字符，JSON 没有闭合。` +
      `请调高 AGENT_MODEL_MAX_TOKENS（当前 ${agentMaxTokens()}）或把本轮目标拆小。结尾片段：…${trimmed.slice(-120)}`
    );
  }

  const diagnostic = attempts.find(({ candidate }) => /^[{[]/.test(candidate)) || attempts[0];
  const failure = new Error(
    `模型没有返回合法 JSON（共 ${trimmed.length} 个字符）。开头片段：${trimmed.slice(0, 160)}…` +
    (diagnostic ? `\n解析器报错：${parseErrorDetail(diagnostic.candidate, diagnostic.error)}` : '')
  );
  (failure as unknown as Record<symbol, unknown>)[MALFORMED_JSON] = true;
  throw failure;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function getFile(req: AgentRunRequest, path: string) {
  return req.workspace.files.find((file) => file.path === path)?.content || '';
}

function parseJson<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T;
  } catch (_) {
    return fallback;
  }
}

function instructionField(instruction: string, field: string) {
  const match = instruction.match(new RegExp(`${field}:\\s*([^\\n]+)`, 'i'));
  return match?.[1]?.trim();
}

function videoSpecFromInstruction(req: AgentRunRequest) {
  const instruction = req.instruction;
  const numFrames = Number(instructionField(instruction, 'num_frames') || 121);
  const frameRate = Number(instructionField(instruction, 'frame_rate') || 24);
  return {
    provider: instructionField(instruction, 'provider') || 'Agnes Video V2.0',
    platform: instructionField(instruction, 'platform') || (req.workspace.mode === 'smb' ? '抖音' : '小红书'),
    generationMode: instructionField(instruction, 'generation_mode') || 'image_to_video',
    aspectRatio: instructionField(instruction, 'aspect_ratio') || '9:16',
    resolutionTier: instructionField(instruction, 'resolution_tier') || '720p',
    sizeHint: instructionField(instruction, 'size_hint') || '720 x 1280',
    numFrames,
    frameRate,
    estimatedClipDurationSeconds: Number(instructionField(instruction, 'estimated_clip_duration_seconds') || (numFrames / frameRate).toFixed(1)),
    // 小节是叙事单位，镜头是渲染单位。脚本阶段要靠这两个数算出镜头预算，
    // 所以必须进规格对象——只留在指令文本里的话，stageGenerationInstruction 读不到。
    episodeSegmentSeconds: Number(instructionField(instruction, 'episode_segment_seconds') || 15),
    episodeSegmentCount: Number(instructionField(instruction, 'episode_segment_count') || 12),
    rule: '生成脚本节奏、分镜、首帧提示、视频提示词、避免项和渲染任务时，必须使用当前视频规格。'
  };
}

function videoSpecFileFor(req: AgentRunRequest) {
  return JSON.stringify(videoSpecFromInstruction(req), null, 2);
}

function cleanInstruction(req: AgentRunRequest) {
  const cleaned = req.instruction
    .split('阶段隔离规则：')[0]
    .split('[当前视频规格]')[0]
    .trim();
  return !cleaned || isInternalStageInstruction(cleaned) ? '新的短视频创作任务' : cleaned;
}

function contextString(req: AgentRunRequest, filePath: string, fields: string[]): string {
  const record = parseJson<Record<string, unknown>>(getFile(req, filePath), {});
  for (const field of fields) {
    const value = record[field];
    if (typeof value !== 'string') continue;
    const cleaned = value.trim();
    if (
      !cleaned ||
      isInternalStageInstruction(cleaned) ||
      /\[[^\]]*(?:待|根据|示例|如[:：]|关键词|主题|受众|卖点)[^\]]*\]|^(?:待填写|待补充|待确认)$/i.test(cleaned)
    ) continue;
    return cleaned;
  }
  return '';
}

function inferTopic(req: AgentRunRequest) {
  const contextual = contextString(req, 'brief.json', ['productName', 'product', 'brand', 'topic', 'title']);
  if (contextual) return contextual.slice(0, 48);
  const instruction = cleanInstruction(req);
  if (isInternalStageInstruction(instruction)) return '新的短视频创作任务';
  const text = instruction
    .replace(/^\/\w+\s*/, '')
    .replace(/先帮我|帮我|请|我要|我想|生成|做一个|做成|视频|短视频/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, 48) || '新的短视频创作任务';
}

function inferPlatform(req: AgentRunRequest) {
  return contextString(req, 'campaign_goal.json', ['platform']) ||
    contextString(req, 'brief.json', ['platform']) ||
    videoSpecFromInstruction(req).platform ||
    '小红书';
}

function inferAudience(req: AgentRunRequest) {
  const contextual = contextString(req, 'campaign_goal.json', ['audience']) ||
    contextString(req, 'brief.json', ['audience']);
  if (contextual) return contextual;
  const instruction = cleanInstruction(req);
  const match = instruction.match(/(?:给|面向|针对)([^，。,.]{2,32})(?:看|用户|受众|人群)?/);
  return match?.[1]?.trim() || (req.workspace.mode === 'smb' ? '有明确需求但还在观望的潜在客户' : '对这个主题感兴趣的目标观众');
}

function inferRedLines(req: AgentRunRequest) {
  const instruction = cleanInstruction(req);
  const values = ['避免夸大承诺', '避免未授权素材', '避免过度营销'];
  if (/身材焦虑/.test(instruction)) values.unshift('避免身材焦虑');
  if (/疗效|焦虑|医疗|治愈|改善/.test(instruction)) values.unshift('避免疗效承诺');
  if (/价格|折扣|最低/.test(instruction)) values.unshift('避免绝对化价格承诺');
  return Array.from(new Set(values)).slice(0, 5);
}

function instructionSection(req: AgentRunRequest, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = cleanInstruction(req).match(new RegExp(`${escaped}[：:]\\s*([^\\n]+)`, 'i'));
  return match?.[1]?.trim() || '';
}

function productionDetails(req: AgentRunRequest) {
  const mission = missionModel(req);
  const setting = instructionSection(req, '场景') || `${mission.topic} 的真实使用或决策场景`;
  const character =
    instructionSection(req, '主角') || `${mission.audience} 中的一个真实用户或讲述者，表情自然，服装和发型跨镜头保持一致`;
  const plot = instructionSection(req, '剧情') || '先呈现犹豫，再给具体证明，最后用一个低压行动收束';
  return { setting, character, plot };
}

function missionModel(req: AgentRunRequest) {
  const topic = inferTopic(req);
  const platform = inferPlatform(req);
  const audience = inferAudience(req);
  const redLines = inferRedLines(req);
  const cta = contextString(req, 'campaign_goal.json', ['goal']) ||
    contextString(req, 'brief.json', ['offer', 'contentGoal']) ||
    (/预约|咨询|体验|购买|下单|私信|评论/.test(cleanInstruction(req)) ? '引导用户采取低压行动' : '引导用户继续了解或互动');
  return {
    topic,
    mission: topic,
    platform,
    audience,
    goal: cta,
    tone: req.workspace.mode === 'smb' ? '真实、清楚、低压力，不像硬广' : '真实、具体、有判断，不堆空话',
    redLines
  };
}

function workflowTitle(workflow: WorkflowKind) {
  return getSkillByWorkflow(workflow)?.title || (workflow === 'generate' ? '新建 AIGC 内容包' : defaultWorkflowRules[workflow]);
}

function normalizeScenes(value: unknown, fallback: PreviewScene[]): PreviewScene[] {
  if (!Array.isArray(value)) return fallback;
  const scenes = value
    .map((scene, index) => {
      const s = scene as Record<string, unknown>;
      return {
        id: String(s.id || `scene_${index + 1}`),
        title: String(s.title || s.narration || `Scene ${index + 1}`),
        visual: String(s.visual || '待生成画面建议'),
        subtitle: String(s.subtitle || s.role || '待生成字幕'),
        // narration 是要念出来的台词，不能像 subtitle 那样兜底成占位文案——
        // 拿不到就该留空，让下游明确「这个镜头没词」，而不是让模型去念「待生成字幕」。
        narration: String(s.narration || s.scriptSegment || '').trim(),
        physicsMode: normalizePhysicsMode(s.physicsMode),
        durationSeconds: Number(s.durationSeconds || Math.max(3, Number(s.end || 0) - Number(s.start || 0) || 6))
      };
    })
    .filter((scene) => scene.title.trim() || scene.visual.trim());
  return scenes.length ? scenes : fallback;
}

function scenesFromWorkspace(req: AgentRunRequest): PreviewScene[] {
  const scenesFile = parseJson<{ scenes?: unknown[] }>(getFile(req, 'scenes.json'), { scenes: [] });
  const storyboard = parseJson<{ scenes?: unknown[] }>(getFile(req, 'storyboard.json'), { scenes: [] });
  return normalizeScenes(scenesFile.scenes, normalizeScenes(storyboard.scenes, []));
}

function agentName(agentId: AIGCAgentId) {
  return agentRoster.find((agent) => agent.id === agentId)?.name || agentId;
}

function normalizeAgentId(value: unknown): AIGCAgentId {
  const text = String(value);
  return agentRoster.some((agent) => agent.id === text) ? (text as AIGCAgentId) : 'orchestrator';
}

function defaultAgentEvents(workflow: WorkflowKind): AgentEvent[] {
  const skill = getSkillByWorkflow(workflow);
  const agentIds: AIGCAgentId[] = skill?.agentIds?.length
    ? ['orchestrator', ...skill.agentIds.filter((agentId) => agentId !== 'orchestrator'), 'review']
    : ['orchestrator', 'creative_director', 'brief', 'scene', 'script', 'shot', 'editor', 'prompt', 'platform', 'compliance', 'data', 'review'];
  const unique = Array.from(new Set(agentIds));
  return unique.map((agentId, index) => ({
    id: id(),
    agentId,
    agentName: agentName(agentId),
    status: index < Math.max(2, unique.length - 2) ? 'success' : index === unique.length - 2 ? 'running' : 'pending',
    action:
      agentId === 'orchestrator'
        ? '读取上下文栈，先判断场景类型，再编排生产流水线'
        : agentId === 'creative_director'
          ? '确定传播角度、创意边界和成功标准'
          : agentId === 'editor'
            ? '拆解前 3 秒、节奏点、停顿、转场和 CTA 时机'
            : agentId === 'data'
              ? '记录人工反馈、退回原因和待验证假设'
        : agentId === 'review'
          ? '等待汇总 patch 和审批建议'
          : `执行 ${agentName(agentId)} 的 AIGC 子任务`,
    output: index < unique.length - 1 ? `${agentName(agentId)} 已产生可审查输出` : undefined
  }));
}

function normalizeResponse(
  raw: unknown,
  req: AgentRunRequest,
  originalReq: AgentRunRequest,
  provider: AgentRunResponse['provider'],
  mode: AgentRunResponse['mode']
): AgentRunResponse {
  const value = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const workflow = inferWorkflow(req);

  const toolEventsRaw = Array.isArray(value.toolEvents) ? value.toolEvents : [];
  const patchesRaw = Array.isArray(value.patchOperations) ? value.patchOperations : [];
  const checksRaw = Array.isArray(value.complianceChecks) ? value.complianceChecks : [];
  const agentEventsRaw = Array.isArray(value.agentEvents) ? value.agentEvents : [];
  const assetsRaw = Array.isArray(value.assets) ? value.assets : [];

  const toolEvents: ToolEvent[] = toolEventsRaw.map((event) => {
    const e = event as Record<string, unknown>;
    const status = ['pending', 'running', 'success', 'warning', 'failed', 'blocked', 'approval_required'].includes(String(e.status))
      ? (String(e.status) as ToolEvent['status'])
      : 'success';
    return {
      id: id(),
      toolName: String(e.toolName || 'agent_step'),
      status,
      title: String(e.title || e.toolName || 'Agent step'),
      summary: String(e.summary || '')
    };
  });

  let patches: PatchOperation[] = patchesRaw
    .map((patch) => {
      const p = patch as Record<string, unknown>;
      const filePath = typeof p.filePath === 'string' ? p.filePath.trim() : '';
      const current = originalReq.workspace.files.find((file) => file.path === filePath)?.content || '';
      const risk = ['low', 'medium', 'high'].includes(String(p.riskLevel))
        ? (String(p.riskLevel) as PatchOperation['riskLevel'])
        : 'low';
      return {
        id: id(),
        filePath,
        summary: String(p.summary || `Update ${filePath}`),
        before: current,
        after: typeof p.after === 'string' ? p.after : '',
        riskLevel: risk,
        requiresApproval: p.requiresApproval !== false,
        origin: originalReq.productionStage ? {
          kind: 'agent_stage' as const,
          productionStage: originalReq.productionStage,
          generationJobId: originalReq.generationJobId
        } : undefined
      };
    })
    .filter((patch) => patch.filePath.length > 0 && patch.after.trim().length > 0 && patch.after !== patch.before);

  if (req.productionStage) {
    patches = dedupePatchesByFilePath(filterStagePatches(req.productionStage, patches, requestedStageOutputFiles(req)));
  }

  if (!isPureQuestion(req)) {
    const allowedOutputFiles = req.productionStage ? new Set(requestedStageOutputFiles(req)) : null;
    // 记录哪些文件是模板兜底出来的，末尾据此生成一条说人话的 toolEvent。
    const templateFallbacks: Array<{ filePath: string; reason: TemplateFallbackReason }> = [];
    const markTemplateFallback = (patch: PatchOperation, reason: TemplateFallbackReason) => {
      patch.origin = { ...(patch.origin || { kind: 'agent_stage' }), templateFallback: reason };
      templateFallbacks.push({ filePath: patch.filePath, reason });
    };
    const ensurePatch = (filePath: string, after: string, summary: string, riskLevel: PatchOperation['riskLevel'] = 'low') => {
      if (allowedOutputFiles && !allowedOutputFiles.has(filePath)) return;
      if (patches.some((patch) => patch.filePath === filePath)) return;
      if (after === getFile(originalReq, filePath)) return;
      const patch = makePatch(originalReq, filePath, after, summary, riskLevel);
      markTemplateFallback(patch, 'missing');
      patches = [...patches, patch];
    };
    const ensureValidPatch = (
      filePath: string,
      after: string,
      isValid: (content: string) => boolean,
      summary: string,
      riskLevel: PatchOperation['riskLevel'] = 'medium'
    ) => {
      const patch = patches.find((item) => item.filePath === filePath);
      if (!patch) {
        ensurePatch(filePath, after, summary, riskLevel);
        return;
      }
      if (isValid(patch.after)) return;
      patch.after = after;
      patch.summary = summary;
      patch.riskLevel = riskLevel;
      markTemplateFallback(patch, 'invalid');
    };
    /**
     * 角色阶段不做「全有全无」的整份替换。
     *
     * 真实事故：脚本写了陈女士 28 岁、前任A、现任B 三个人，模型也照着写了三个角色，
     * 但其中一个漏了 faceIdStrategy，hasCharacters 判定整份不合格，直接换成内置模板——
     * 主角变成「对这个主题感兴趣的目标观众…」、年龄档变成写死的儿童 8 岁，
     * 角色图照着这份模板生成出一个 8 岁小孩，和剧本毫无关系。
     *
     * 一个角色缺一个字段，不该让另外两个写对的角色陪葬。所以这里先逐角色补齐，
     * 真的救不回来（解析不了、没有 characters 数组、一个有名字的角色都没有）才用模板。
     */
    const ensureRepairedCharacters = () => {
      const filePath = 'characters.json';
      if (allowedOutputFiles && !allowedOutputFiles.has(filePath)) return;
      const patch = patches.find((item) => item.filePath === filePath);
      if (!patch) {
        ensurePatch(filePath, charactersFor(req), '系统补齐角色阶段角色资产', 'medium');
        return;
      }
      if (hasCharacters(patch.after)) return;

      const repaired = repairCharactersContent(patch.after);
      if (repaired && hasCharacters(repaired.content)) {
        patch.after = repaired.content;
        patch.riskLevel = 'medium';
        patch.summary = [
          `模型产出缺字段，已逐个角色补齐：${describeCharacterIssues(repaired.filled)}`,
          repaired.dropped ? `另有 ${repaired.dropped} 个没有名字的角色被丢弃。` : ''
        ].filter(Boolean).join(' ');
        markTemplateFallback(patch, 'repaired');
        return;
      }

      const issues = describeCharacterIssues(characterContractIssues(parseJson<unknown>(patch.after, null)));
      patch.after = charactersFor(req);
      patch.riskLevel = 'medium';
      patch.summary = issues
        ? `模型产出无法修复（${issues}），已替换为内置模板`
        : '系统补齐角色阶段角色资产';
      markTemplateFallback(patch, 'invalid');
    };

    /**
     * 场景阶段同样不做「全有全无」的整份替换。
     *
     * 真实事故：脚本 12 个小节各有各的地点（大学图书馆、校园操场、咖啡馆、公寓客厅、海边…），
     * 模型也照着写了 12 个场次，但其中一个漏了 palette，hasSceneDraft 判定整份不合格，
     * 直接换成内置模板——模板是「3 秒 Hook / 犹豫时刻 / 可信证明 / 动作承接 / 轻 CTA」
     * 这套通用营销节奏，而且 5 条共用同一个 location，
     * 于是 12 个地点的恋爱史变成了 5 张全在同一间客厅里的卡片。
     *
     * 和角色阶段是同一个病根，修法也一样：先逐场次补齐，真的救不回来才用模板。
     */
    const ensureRepairedScenes = () => {
      const filePath = 'scenes.json';
      if (allowedOutputFiles && !allowedOutputFiles.has(filePath)) return;
      const context = sceneRepairContext(req);
      const patch = patches.find((item) => item.filePath === filePath);
      if (!patch) {
        ensurePatch(filePath, scenesFor(req, workflow), '系统补齐场景阶段场景资产', 'medium');
        return;
      }
      if (hasSceneDraft(patch.after)) return;

      const repaired = repairScenesContent(patch.after, context);
      if (repaired && hasSceneDraft(repaired.content)) {
        patch.after = repaired.content;
        patch.riskLevel = 'medium';
        patch.summary = [
          `模型产出缺字段，已逐个场次补齐：${describeSceneIssues(repaired.filled)}`,
          repaired.dropped ? `另有 ${repaired.dropped} 个认不出地点和画面的场次被丢弃。` : ''
        ].filter(Boolean).join(' ');
        markTemplateFallback(patch, 'repaired');
        return;
      }

      const issues = describeSceneIssues(sceneContractIssues(parseJson<unknown>(patch.after, null)));
      patch.after = scenesFor(req, workflow);
      patch.riskLevel = 'medium';
      patch.summary = issues
        ? `模型产出无法修复（${issues}），已替换为按脚本或内置模板生成的场次`
        : '系统补齐场景阶段场景资产';
      markTemplateFallback(patch, 'invalid');
    };

    const hasScenes = (content: string) => parseJson<{ scenes?: unknown[] }>(content, { scenes: [] }).scenes?.length || 0;
    const hasVideoTasks = (content: string) => hasVideoTaskPackage(req, content);

    if (req.productionStage) {
      const stage = req.productionStage;
      if (stage === 'script') {
        ensurePatch('brief.json', updatedBrief(req, workflow), '系统补齐脚本阶段 Brief');
        ensurePatch('campaign_goal.json', campaignGoalFor(req, workflow), '系统补齐脚本阶段目标');
        ensurePatch('script.md', scriptFor(req, workflow), '系统补齐脚本阶段脚本');
      } else if (stage === 'character') {
        ensureRepairedCharacters();
      } else if (stage === 'scene') {
        ensureRepairedScenes();
      } else if (stage === 'storyboard') {
        ensureValidPatch('storyboard.json', storyboardFor(req, workflow), hasStoryboardDraft, '系统补齐分镜阶段分镜资产', 'medium');
        ensurePatch('timeline.json', timelineFor(req, workflow), '系统补齐分镜阶段剪辑节奏', 'medium');
      } else {
        ensurePatch('video_spec.json', videoSpecFileFor(req), '系统补齐视频阶段规格');
        ensureValidPatch('asset_prompts.json', assetPromptsFor(req, workflow), hasVideoTasks, '系统补齐视频阶段生成任务包', 'medium');
      }
      patches = dedupePatchesByFilePath(filterStagePatches(stage, patches, requestedStageOutputFiles(req)));
      if (stage === 'script') {
        const proposed = (filePath: string) =>
          patches.find((patch) => patch.filePath === filePath)?.after || getFile(req, filePath) || getFile(originalReq, filePath);
        assertValidScriptStageBundle({
          briefJson: proposed('brief.json'),
          campaignGoalJson: proposed('campaign_goal.json'),
          scriptMarkdown: proposed('script.md')
        });
      }
      // 上下文被截断是「模型为什么少写了人」的头号原因，必须说出来而不是让人猜。
      for (const warning of truncatedContextWarnings(req)) {
        toolEvents.push({
          id: id(),
          toolName: 'context_truncated',
          status: 'warning',
          title: '上游文件太长，已被截断后才进模型',
          summary: warning
        });
      }
      const stageFallbacks = templateFallbacks.filter((item) => patches.some((patch) => patch.filePath === item.filePath));
      toolEvents.push({
        id: id(),
        toolName: 'ensure_stage_output',
        status: stageFallbacks.length ? 'warning' : 'success',
        title: stageFallbacks.length ? '模型产出不合格，已用内置模板兜底' : '校验当前阶段交付物',
        summary: stageFallbacks.length
          ? `${stageFallbacks.map((item) => `${item.filePath}（${item.reason === 'missing' ? '模型未产出' : '结构校验未通过'}）`).join('、')} 由内置模板生成，不是模型输出，请逐条核对后再批准。`
          : requestedStageOutputFiles(req).length
            ? `模型产出通过校验：${requestedStageOutputFiles(req).join('、')}`
            : '当前请求没有获准写入的阶段文件'
      });
    } else {
      ensurePatch('script.md', scriptFor(req, workflow), '系统补齐缺失的脚本资产：在线模型未提交 script.md');
      ensureValidPatch('scenes.json', scenesFor(req, workflow), (content) => hasScenes(content) >= 3, '系统补齐缺失的场景资产：保证分镜和视频任务可审查', 'medium');
      ensureValidPatch('storyboard.json', storyboardFor(req, workflow), (content) => hasScenes(content) >= 3, '系统补齐缺失的分镜资产：保证逐镜画面可调整', 'medium');
      ensurePatch('timeline.json', timelineFor(req, workflow), '系统补齐缺失的剪辑节奏资产', 'medium');
      ensurePatch('video_spec.json', videoSpecFileFor(req), '系统补齐缺失的视频规格资产');
      ensureValidPatch('asset_prompts.json', assetPromptsFor(req, workflow), hasVideoTasks, '系统补齐缺失的视频生成任务包：保证镜头任务、角色一致性和避免项可审查', 'medium');
      ensurePatch('publish_copy.json', publishCopyFor(req, workflow), '系统补齐缺失的发布文案资产');
      ensurePatch('compliance_report.json', complianceFor(req, workflow), '系统补齐缺失的合规检查资产', 'medium');
      ensurePatch('feedback_report.json', feedbackFor(req, workflow), '系统补齐缺失的人工反馈结构');
      const ensuredFiles = ['script.md', 'scenes.json', 'storyboard.json', 'timeline.json', 'video_spec.json', 'asset_prompts.json', 'publish_copy.json', 'compliance_report.json', 'feedback_report.json']
        .filter((filePath) => patches.some((patch) => patch.filePath === filePath));
      toolEvents.push({
        id: id(),
        toolName: 'ensure_production_package',
        status: 'warning',
        title: '补齐制作包交付物',
        summary: `已校验 ${ensuredFiles.length} 个核心资产，确保脚本、分镜、角色一致性和视频任务可审查`
      });
    }
  }

  const checks: ComplianceCheck[] = checksRaw.map((check) => {
    const c = check as Record<string, unknown>;
    const type = ['ai_disclosure', 'marketing_claim', 'asset_rights', 'likeness_rights', 'sensitive_industry', 'platform_policy'].includes(String(c.type))
      ? (String(c.type) as ComplianceCheck['type'])
      : 'marketing_claim';
    const status = ['pass', 'warning', 'blocked'].includes(String(c.status)) ? (String(c.status) as ComplianceCheck['status']) : 'warning';
    return { id: id(), type, status, message: String(c.message || '需要人工确认') };
  });

  const agentEvents: AgentEvent[] = agentEventsRaw.length
    ? agentEventsRaw.map((event) => {
        const e = event as Record<string, unknown>;
        const status = ['pending', 'running', 'success', 'warning', 'blocked'].includes(String(e.status))
          ? (String(e.status) as AgentEvent['status'])
          : 'success';
        const agentId = normalizeAgentId(e.agentId);
        return {
          id: id(),
          agentId,
          agentName: String(e.agentName || agentName(agentId)),
          status,
          action: String(e.action || `执行 ${agentName(agentId)} 子任务`),
          output: e.output ? String(e.output) : undefined
        };
      })
    : defaultAgentEvents(workflow);

  const stageOutputFiles = req.productionStage ? new Set(requestedStageOutputFiles(req)) : null;
  const scopedAssetsRaw = stageOutputFiles
    ? assetsRaw.filter((asset) => stageOutputFiles.has(String((asset as Record<string, unknown>).filePath || '')))
    : assetsRaw;
  const fallbackAssets = req.productionStage ? [] : missionAssetsFromWorkspace(req.workspace);
  const assets: MissionAsset[] = scopedAssetsRaw.length
    ? scopedAssetsRaw.map((asset, index) => {
        const a = asset as Record<string, unknown>;
        const type = ['brief', 'reference', 'scene', 'script', 'shot', 'timeline', 'prompt', 'copy', 'compliance', 'feedback', 'calendar'].includes(String(a.type))
          ? (String(a.type) as MissionAsset['type'])
          : 'script';
        const status = ['draft', 'ready', 'warning', 'blocked'].includes(String(a.status)) ? (String(a.status) as MissionAsset['status']) : 'draft';
        return {
          id: id(),
          type,
          title: String(a.title || `Asset ${index + 1}`),
          status,
          filePath: String(a.filePath || 'script.md'),
          summary: String(a.summary || '')
        };
      })
    : patches.length
      ? patches.map((patch, index) => ({
          id: id(),
          type: patch.filePath.includes('feedback')
            ? 'feedback'
            : patch.filePath.includes('timeline')
              ? 'timeline'
              : patch.filePath.includes('compliance')
                ? 'compliance'
                : patch.filePath.includes('asset')
                  ? 'prompt'
                  : patch.filePath.includes('scene')
                    ? 'scene'
                    : 'script',
          title: patch.filePath,
          status: patch.riskLevel === 'high' ? 'warning' : 'ready',
          filePath: patch.filePath,
          summary: patch.summary || `更新 ${patch.filePath}`
        }))
      : fallbackAssets;

  const previewRaw = value.preview && typeof value.preview === 'object' ? (value.preview as Record<string, unknown>) : {};
  const fallbackScenes = scenesFromWorkspace(req);
  const preview: PreviewState = {
    title: String(previewRaw.title || workflowTitle(workflow)),
    subtitle: String(previewRaw.subtitle || '目标驱动，Agent 自动拆任务并生成 AIGC 内容资产'),
    cta: String(previewRaw.cta || '先审查，再批准写入'),
    durationSeconds: Number(previewRaw.durationSeconds || 38),
    timelineVersion: Number(previewRaw.timelineVersion || req.workspace.currentTimelineVersion + (patches.length ? 1 : 0)),
    platform: String(previewRaw.platform || (req.workspace.mode === 'smb' ? '抖音 / 小红书' : '小红书 / 抖音 / TikTok')),
    mode: previewRaw.mode === 'smb' ? 'smb' : req.workspace.mode,
    workflow,
    scenes: normalizeScenes(previewRaw.scenes, fallbackScenes)
  };

  return {
    mode,
    provider,
    assistantMessage: String(value.assistantMessage || '我已经读取上下文栈，主 Agent 完成两层派工：先匹配场景类型 Agent，再进入方向、文案、视觉、剪辑、品牌安全和反馈流水线。现在等待你审查并批准写入。'),
    plan: asStringArray(value.plan).length
      ? asStringArray(value.plan)
      : ['读取 Context Stack', '主 Agent 判断视频场景类型', '分配给垂直场景 SubAgent', '进入横向生产流水线', '生成可编辑电影制作包与剪辑节奏', '准备视频生成任务和反馈记录', '等待批准写入'],
    toolEvents: toolEvents.length
      ? toolEvents
      : [
          { id: id(), toolName: 'read_context_stack', status: 'success', title: '读取上下文栈', summary: '已读取 Brief、品牌记忆、参考样本、平台规则和素材库' },
          { id: id(), toolName: 'route_scene_subagent', status: 'success', title: '匹配场景类型', summary: '已先判断片种和制作上下文，再进入生产流水线' },
          { id: id(), toolName: 'route_skill', status: 'success', title: '匹配生产流水线', summary: defaultWorkflowRules[workflow] },
          { id: id(), toolName: 'propose_patch', status: 'approval_required', title: '准备 patch', summary: '等待用户批准后写入项目资产' }
        ],
    agentEvents,
    assets,
    patchOperations: patches,
    complianceChecks: checks.length
      ? checks
      : [{ id: id(), type: 'marketing_claim', status: 'warning', message: '请人工确认营销表达没有夸大承诺。' }],
    preview,
    notes: asStringArray(value.notes)
  };
}

async function callAnthropic(req: AgentRunRequest, originalReq: AgentRunRequest = req): Promise<AgentRunResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is missing');
  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model,
      max_tokens: agentMaxTokens(),
      temperature: 0.2,
      system: PROVIDER_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildPrompt(req) }]
    })
  });
  if (!res.ok) throw new Error(`Anthropic API error ${res.status}: ${(await res.text()).slice(0, 500)}`);
  const json = await res.json();
  assertNotTruncated(json.stop_reason, 'Anthropic');
  const text = Array.isArray(json.content) ? json.content.map((block: { text?: string }) => block?.text || '').join('\n') : '';
  return normalizeResponse(safeJsonParse(text), req, originalReq, 'anthropic', 'live');
}

async function callOpenAI(req: AgentRunRequest, originalReq: AgentRunRequest = req): Promise<AgentRunResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is missing');
  const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      max_output_tokens: agentMaxTokens(),
      input: [
        { role: 'system', content: PROVIDER_SYSTEM_PROMPT },
        { role: 'user', content: buildPrompt(req) }
      ]
    })
  });
  if (!res.ok) throw new Error(`OpenAI API error ${res.status}: ${(await res.text()).slice(0, 500)}`);
  const json = await res.json();
  // Responses API 用 incomplete + reason 表达截断。
  if (json.status === 'incomplete') assertNotTruncated(json.incomplete_details?.reason, 'OpenAI');
  const text =
    json.output_text ||
    (Array.isArray(json.output)
      ? json.output.flatMap((item: { content?: { text?: string }[] }) => item.content || []).map((c: { text?: string }) => c.text || '').join('\n')
      : '');
  return normalizeResponse(safeJsonParse(text), req, originalReq, 'openai', 'live');
}

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };
type ChatReply = { text: string; finishReason: unknown; reasoningContent: unknown };

function customTarget(): RepairTarget {
  const apiKey = process.env.CUSTOM_API_KEY || process.env.OPENAI_API_KEY;
  const baseUrlRaw = process.env.CUSTOM_BASE_URL || process.env.OPENAI_BASE_URL;
  const model = process.env.CUSTOM_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';
  if (!apiKey) throw new Error('CUSTOM_API_KEY is missing');
  if (!baseUrlRaw) throw new Error('CUSTOM_BASE_URL is missing');
  const baseUrl = baseUrlRaw.replace(/\/$/, '');
  return {
    apiKey,
    model,
    endpoint: baseUrl.endsWith('/v1') ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`
  };
}

async function customChat(
  target: RepairTarget,
  messages: ChatMessage[],
  options: { temperature?: number; label?: string } = {}
): Promise<ChatReply> {
  const provider = options.label ? `Custom(${options.label})` : 'Custom';
  const res = await fetchWithProviderTimeout(target.endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${target.apiKey}` },
    body: JSON.stringify({
      model: target.model,
      // 不传的话就吃中转站的默认额度，常见只有 1024/2048，整集剧本必然被腰斩。
      max_tokens: agentMaxTokens(),
      temperature: options.temperature ?? 0.2,
      messages
    })
  }, { provider, model: target.model });
  if (!res.ok) {
    throw new Error(describeUpstreamModelError({
      provider, model: target.model, status: res.status, body: await res.text()
    }));
  }
  const json = await res.json();
  const message = json.choices?.[0]?.message || {};
  return {
    text: message.content || json.output_text || '',
    finishReason: json.choices?.[0]?.finish_reason,
    reasoningContent: message.reasoning_content
  };
}

/** 单次输出的额度上限。抬高它只是把墙往后挪一格，续写才是把墙拆掉。 */
function continuationRounds(): number {
  const configured = Number(process.env.AGENT_CONTINUATION_ROUNDS);
  return Number.isFinite(configured) && configured >= 0 ? configured : 3;
}

/**
 * 续写回来的片段经常带两种噪音：重开一个 ```json 围栏，以及把上一段的结尾又抄一遍。
 * 直接拼接会得到一份必然解析失败的 JSON，那时错误信息只会指向语法，和真实原因差了十万八千里。
 */
function joinContinuation(accumulated: string, chunk: string): string {
  let next = chunk.replace(/^\s*```(?:json|JSON)?\s*/, '').replace(/```\s*$/, '');
  const window = accumulated.slice(-400);
  for (let size = Math.min(window.length, next.length); size >= 24; size -= 1) {
    if (next.startsWith(window.slice(window.length - size))) {
      next = next.slice(size);
      break;
    }
  }
  return accumulated + next;
}

/**
 * 一集剧本的完整 JSON 不一定装得进单次额度，而额度和超时是一对：调大额度就要跟着调超时。
 * 续写让「装不下」变成「多跑一轮」，而不是让用户去猜该把 AGENT_MODEL_MAX_TOKENS 设成多少。
 */
async function completeTruncatedReply(
  target: RepairTarget,
  messages: ChatMessage[],
  first: ChatReply
): Promise<string> {
  let text = first.text;
  let finishReason = first.finishReason;
  const rounds = continuationRounds();

  for (let round = 0; round < rounds && (finishReason === 'length' || finishReason === 'max_tokens'); round += 1) {
    console.warn(`[agentProvider] 输出撞上 max_tokens，发起第 ${round + 1} 轮续写（已累计 ${text.length} 字符）。`);
    const next = await customChat(target, [
      ...messages,
      { role: 'assistant', content: text },
      {
        role: 'user',
        content:
          '上一条回复在 max_tokens 处被截断了。请紧接着截断处继续输出剩余内容：' +
          '不要重复任何已经输出过的字符，不要重新开头，不要加 markdown 围栏，不要任何解释，只输出续写部分。'
      }
    ], { label: '续写' });
    if (!next.text.trim()) break;
    text = joinContinuation(text, next.text);
    finishReason = next.finishReason;
  }

  assertNotTruncated(
    finishReason,
    'Custom',
    rounds
      ? `本轮已自动续写 ${rounds} 次、累计 ${text.length} 字符仍未写完，说明目标确实过大；也可以调高 AGENT_CONTINUATION_ROUNDS。`
      : ''
  );
  return text;
}

async function callCustomOpenAICompatible(req: AgentRunRequest, originalReq: AgentRunRequest = req): Promise<AgentRunResponse> {
  const target = customTarget();
  const messages: ChatMessage[] = [
    { role: 'system', content: PROVIDER_SYSTEM_PROMPT },
    { role: 'user', content: buildPrompt(req) }
  ];

  const first = await customChat(target, messages);
  assertNotReasoningOnly(first.text, first.reasoningContent);
  const text = await completeTruncatedReply(target, messages, first);
  const value = await parseWithModelRepair(text, target);
  return normalizeResponse(value, req, originalReq, 'custom', 'live');
}

type RepairTarget = { apiKey: string; endpoint: string; model: string };

/**
 * 本地救不动的坏 JSON，再花一次调用让模型自己修——比让用户重跑整个阶段便宜得多。
 * 只对语法错误生效：截断和空内容重修一次也是一样的结果，那一次纯属浪费。
 */
async function parseWithModelRepair(text: string, target: RepairTarget): Promise<unknown> {
  try {
    return safeJsonParse(text);
  } catch (error) {
    if (process.env.AGENT_JSON_REPAIR === '0' || !isMalformedJsonError(error)) throw error;
    const reason = error instanceof Error ? error.message : String(error);
    let repaired = '';
    try {
      repaired = await requestJsonRepair(text, reason, target);
    } catch (repairError) {
      throw new Error(`${reason}\n（已尝试自动重修，但修复调用本身失败：${(repairError as Error).message}）`);
    }
    try {
      const value = safeJsonParse(repaired);
      console.warn('[agentProvider] 模型首轮 JSON 非法，已用一次修复调用救回。');
      return value;
    } catch (secondError) {
      throw new Error(`${reason}\n（已自动重修一次，仍然非法：${(secondError as Error).message}）`);
    }
  }
}

async function requestJsonRepair(broken: string, reason: string, target: RepairTarget): Promise<string> {
  const res = await fetchWithProviderTimeout(target.endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${target.apiKey}` },
    body: JSON.stringify({
      model: target.model,
      max_tokens: agentMaxTokens(),
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: '你是 JSON 修复器。只输出修复后的合法 JSON 本体，不要解释，不要 markdown 围栏。'
        },
        {
          role: 'user',
          content:
            `下面的文本本应是合法 JSON，但解析失败：${reason.slice(0, 500)}\n` +
            '严格保留原有内容和语义，只修复语法：转义字符串里的换行和引号、删掉多余逗号、补齐缺失的括号和分隔符。\n\n' +
            broken.slice(0, 60000)
        }
      ]
    })
  }, { provider: 'Custom(JSON 修复)', model: target.model });
  if (!res.ok) {
    throw new Error(describeUpstreamModelError({
      provider: 'Custom(JSON 修复)', model: target.model, status: res.status, body: await res.text()
    }));
  }
  const json = await res.json();
  assertNotTruncated(json.choices?.[0]?.finish_reason, 'Custom(JSON 修复)');
  const message = json.choices?.[0]?.message || {};
  return message.content || json.output_text || '';
}

/**
 * 推理模型会把额度先花在 reasoning_content 上。额度不够时它照样返回 200，
 * 但正文是空的——报「模型返回了空内容」只会让人去查 JSON 格式，方向完全错了。
 */
function assertNotReasoningOnly(text: string, reasoningContent: unknown) {
  if (text.trim() || typeof reasoningContent !== 'string' || !reasoningContent.trim()) return;
  throw new Error(
    `模型把额度全部用在了推理上，没有返回正文（推理内容 ${reasoningContent.length} 个字符）。` +
    `这是推理型模型的典型表现：请调高环境变量 AGENT_MODEL_MAX_TOKENS（当前 ${agentMaxTokens()}），` +
    '或换一个非推理模型。'
  );
}

async function fetchWithProviderTimeout(endpoint: string, init: RequestInit, context: { provider: string; model: string }) {
  const controller = new AbortController();
  const timeout = windowlessTimeout(() => controller.abort(), agentTimeoutMs());
  try {
    return await fetch(endpoint, { ...init, signal: controller.signal });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const cause = error instanceof Error && 'cause' in error ? error.cause as { code?: string; message?: string } | undefined : undefined;
    if (error instanceof Error && error.name === 'AbortError') {
      // 超时的可操作解法和网络错误完全不同，别混成同一句话。
      throw new Error(
        `${context.provider} 模型请求超时：${context.model} @ ${endpoint} ` +
        `超过 ${Math.round(agentTimeoutMs() / 1000)} 秒未返回。` +
        `可以调高环境变量 AGENT_PROVIDER_TIMEOUT_MS 再等久一点，` +
        `或调低 AGENT_MODEL_MAX_TOKENS（当前 ${agentMaxTokens()}）让输出短一些，` +
        '也可以换一个更快的模型服务——长内容在慢速中转上很容易撞上这个上限。'
      );
    }
    const detail = `网络错误：${cause?.code || cause?.message || message}`;
    throw new Error(`${context.provider} 模型请求失败：${context.model} @ ${endpoint} ${detail}。请切换文本模型或检查模型服务。`);
  } finally {
    clearTimeout(timeout);
  }
}

function windowlessTimeout(callback: () => void, delay: number) {
  return setTimeout(callback, delay);
}

function updatedBrief(req: AgentRunRequest, workflow: WorkflowKind) {
  const brief = parseJson<Record<string, unknown>>(getFile(req, 'brief.json'), {});
  const mission = missionModel(req);
  return JSON.stringify(
    {
      ...brief,
      workflow,
      contentGoal: workflow === 'weekly' || workflow === 'calendar' ? '生成内容日历，并把重点选题展开成可执行内容资产' : '从目标生成 AIGC 视频内容资产包',
      platform: mission.platform,
      audience: mission.audience,
      topic: mission.topic,
      offer: mission.goal,
      tone: mission.tone,
      constraints: mission.redLines,
      lastInstruction: cleanInstruction(req),
      updatedBy: '创意总监',
      operatingModel: 'Creative Director foreground, specialist agents behind the scenes',
      creativeDirection: {
        audiencePromise: `让${mission.audience}快速理解这条内容为什么和自己有关。`,
        tension: workflow === 'rewrite' ? '旧稿信息可能有用，但表达顺序需要重组。' : '不能只堆卖点，必须先建立场景和可信度。',
        redLines: mission.redLines
      },
      approvalMode: 'write_after_approval'
    },
    null,
    2
  );
}

function viralRefsFor(req: AgentRunRequest, workflow: WorkflowKind) {
  const mission = missionModel(req);
  return JSON.stringify(
    {
      workflow,
      references: [
        {
          id: 'ref_01',
          platform: mission.platform,
          pattern: workflow === 'competitor' ? '竞品痛点切入 + 证明点 + 低压 CTA' : '场景开头 + 顾虑回应 + 具体证明 + 低压行动',
          hook: workflow === 'rewrite' ? '旧稿不是废了，是缺一个用户愿意听下去的结构。' : `如果你正在考虑${mission.topic}，先别急着看卖点。`,
          reusableStructure: ['具体场景', '用户顾虑', '可信证明', '轻 CTA']
        },
        {
          id: 'ref_02',
          platform: mission.platform,
          pattern: '问题直击 + 三个理由 + 一个行动',
          hook: `${mission.audience}最需要的不是更多信息，而是一个清楚的判断顺序。`,
          reusableStructure: ['一句痛点', '三个理由', '一个行动']
        }
      ],
      extractedBy: 'Viral Reference Agent'
    },
    null,
    2
  );
}

/** 修补和兜底都要读同一份上下文：已确认角色、脚本原文、每节目标时长。 */
function sceneRepairContext(req: AgentRunRequest): SceneRepairContext {
  const characters = parseJson<{ characters?: Array<Record<string, unknown>> }>(getFile(req, 'characters.json'), {})
    .characters || [];
  return {
    characters: characters
      .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
      .map((entry) => ({
        id: typeof entry.id === 'string' ? entry.id : '',
        name: typeof entry.name === 'string' ? entry.name : '',
        required: entry.required === true
      }))
      .filter((entry) => entry.id),
    script: getFile(req, 'script.md'),
    segmentSeconds: videoSpecFromInstruction(req).episodeSegmentSeconds || 15
  };
}

function scenesFor(req: AgentRunRequest, workflow: WorkflowKind) {
  const mission = missionModel(req);
  const details = productionDetails(req);

  // 脚本自己写了分场（`**场景**：大学图书馆`）时，兜底就按脚本出场次。
  // 下面那份通用模板 5 条共用同一个 location，套到一个 12 地点的剧本上，
  // 出来的是 5 张全在同一间屋子里的卡片——那比没有还糟。
  const fromScript = scenesFromScript(sceneRepairContext(req));
  if (fromScript) return fromScript;
  const hook =
    workflow === 'rewrite'
      ? '你的旧稿不是不能用，而是缺一个用户愿意听下去的开头。'
      : `如果你正在考虑${mission.topic}，先看这一条。`;
  const rows = [
    [
      'scene_01',
      'hook',
      '3 秒 Hook',
      0,
      4,
      hook,
      `${details.setting}。${details.character}。镜头先给环境和人物状态，眼神、服装和发型从第一镜开始锁定。`,
      '先建立相关性'
    ],
    [
      'scene_02',
      'pain',
      '犹豫时刻',
      4,
      11,
      `${mission.audience}通常卡住的不是信息少，而是不知道怎么判断。`,
      `${details.plot}。这一镜只拍“犹豫/观察/停顿”的动作，不提前跳到结论。`,
      '说出用户顾虑'
    ],
    [
      'scene_03',
      'proof',
      '可信证明',
      11,
      22,
      `把${mission.topic}拆成 3 个可验证的具体点，而不是堆形容词。`,
      `${details.plot}。用近景呈现可验证细节，例如价格、流程、手部动作、物品或关键证据。`,
      '具体证明而不是空话'
    ],
    [
      'scene_04',
      'trust',
      '动作承接',
      22,
      31,
      `明确哪些适合、哪些不适合，降低过度营销感。`,
      `${details.character}。同一个人物继续完成剧情动作，镜头承接上一镜，避免突然换人、换衣服或换地点。`,
      '先讲边界再行动'
    ],
    [
      'scene_05',
      'cta',
      '轻 CTA',
      31,
      38,
      `${mission.goal}，但只保留一个清楚动作。`,
      `${details.plot}。收束到一个低压行动，保留同一人物、同一套衣服和前后剧情连通。`,
      '一个低压行动'
    ]
  ];

  return JSON.stringify(
    {
      scenes: rows.map(([sceneId, role, title, start, end, narration, visual, subtitle]) => ({
        id: sceneId,
        role,
        title,
        start,
        end,
        narration,
        visual,
        subtitle,
        location: details.setting,
        timeOfDay: '白天',
        lighting: '自然柔光，保留真实环境层次',
        palette: '自然暖色与低饱和中性色',
        characterIds: ['lead_01'],
        scriptSegment: narration,
        mainImagePrompt: `${details.setting}，${details.character}，${visual}。真实手机短视频质感，自然光，中文可审查画面说明。`,
        prompt: `${details.setting}，${details.character}，${visual}。真实手机短视频质感，自然光，中文可审查画面说明。`,
        referenceImageUrl: ''
      }))
    },
    null,
    2
  );
}

function campaignGoalFor(req: AgentRunRequest, workflow: WorkflowKind) {
  const mission = missionModel(req);
  return JSON.stringify({
    workflow,
    audience: mission.audience,
    platform: mission.platform,
    goal: mission.goal,
    redLines: mission.redLines
  }, null, 2);
}

function charactersFor(req: AgentRunRequest) {
  const details = productionDetails(req);
  const mission = missionModel(req);
  const script = getFile(req, 'script.md');
  const schoolStages = [
    ['kindergarten', '幼儿园', '5 岁', '幼儿园日常服装和红色书包'],
    ['primary', '小学', '10 岁', '小学校服和红色铅笔盒'],
    ['middle', '初中', '14 岁', '蓝白初中校服和红色水杯'],
    ['high', '高中', '17 岁', '蓝白高中校服和红色笔记本'],
    ['college', '大学', '21 岁', '干净大学生便装和红色帆布包']
  ];
  const hasSchoolTimeline = schoolStages.every(([, label]) => script.includes(label));
  const variantDefinitions = hasSchoolTimeline ? schoolStages : [
    ['child', '儿童', '8 岁', '舒适日常童装'],
    ['teen', '少年', '16 岁', '简洁校服或休闲装'],
    ['adult', '成年', '26 岁', '与场景相符的干净日常服装']
  ];
  const ageVariants = variantDefinitions.map(([id, label, ageLabel, wardrobe]) => ({
    id,
    label,
    ageLabel,
    wardrobe,
    primaryImageUrl: '',
    primaryImagePrompt: `${details.character}，${ageLabel}，${wardrobe}，正面半身主图，自然光，真实生活场景，保留稳定五官特征。`
  }));

  return JSON.stringify({
    characters: [{
      id: 'lead_01',
      name: details.character,
      role: '主角',
      required: true,
      description: `围绕「${mission.topic}」完成${details.plot}的主要人物。`,
      faceAnchorVariantId: hasSchoolTimeline ? 'college' : 'adult',
      referenceStrategy: 'face_id',
      faceIdStrategy: '先确认成年主图的 Face ID，再复用到全部年龄变体和镜头。',
      expressionIds: ['喜悦', '愤怒', '悲伤', '恐惧', '惊讶', '厌恶', '害羞', '紧张', '疑惑', '尴尬', '期待', '平静'],
      expressionRange: '喜悦、愤怒、悲伤、恐惧、惊讶、厌恶、害羞、紧张、疑惑、尴尬、期待和平静；保持克制、可审查，不使用夸张表情。',
      consistencyPrompt: `同一角色在不同年龄变体、场景和镜头中保持脸型、发型、肤色、体态和眼神特征一致；服装只按年龄变体切换。`,
      imagePrompt: `${details.character}，${details.setting}，真实手机短视频人物主图，中文可审查描述，避免商业海报感。`,
      negativePrompt: '不要换脸、不要五官漂移、不要畸形手指、不要多余肢体、不要不可读文字、不要未授权名人肖像。',
      variants: ageVariants,
      // 兜底模板不知道这个人长什么样，所以 visual 只给结构和策略默认值，
      // 长相字段一律留空——编一份看着很确定、其实和剧本无关的脸，比空着更糟。
      visual: characterVisualDraftSkeleton()
    }]
  }, null, 2);
}

function scriptFor(req: AgentRunRequest, workflow: WorkflowKind) {
  const mission = missionModel(req);
  const details = productionDetails(req);
  if (workflow === 'weekly' || workflow === 'calendar') {
    return `# 一周 AIGC 内容日历

## 本周主题
围绕「${mission.topic}」连续生产 7 条可展开的内容资产。

## 7 条选题
1. ${mission.topic}：先解决一个最具体的使用场景。
2. ${mission.audience}最常见的 3 个顾虑。
3. 这个选择适合谁，不适合谁。
4. 用真实流程讲清楚，不靠夸张承诺。
5. 3 个证明点，分别对应场景、体验和边界。
6. 一条低压转化视频，只保留一个行动。
7. 把评论区问题整理成下一条内容。

## 可展开首条 Hook
如果你正在考虑${mission.topic}，先看这一条。

## CTA
选中任意一天，让 Agent 继续拆成脚本、分镜、素材提示词和发布文案。
`;
  }

  if (workflow === 'rewrite') {
    return `# 旧稿爆改短视频

## 诊断
原稿最大的问题不是信息不够，而是太像介绍，缺少用户正在经历的具体场景。

## Hook
你的旧稿不是不能用，而是缺一个用户愿意听下去的开头。

## Body
先别急着重写整篇。真正应该保留的是那些具体事实：用户是谁、担心什么、你怎么解决、为什么可信。

Agent 会把硬广表达改成场景化表达，同时同步更新分镜、素材提示词和风险提醒。

## CTA
如果你也有一段旧稿，可以先让 Agent 诊断，再决定哪些地方要改。
`;
  }

  if (workflow === 'image_note') {
    return `# 小红书图文笔记

## 首图文案
${mission.topic}，先别急着下判断

## 正文
如果你正在考虑${mission.topic}，先别急着看卖点。

真正影响判断的，往往是你有没有看清楚场景、流程、边界和适合人群。

我的判断顺序是：先看自己是不是目标人群，再看流程是否清楚，最后看行动成本是不是足够低。

## CTA
想继续拆成脚本和分镜，可以让 Agent 生成下一版。
`;
  }

  return `# ${workflowTitle(workflow)}

## Hook
${details.setting}，别急着讲卖点，先拍这个人为什么停下来。

## Body
主角设定先锁住：${details.character}。

剧情按这个顺序走：${details.plot}。

对白不要像广告。先说她为什么犹豫，再拍她看见了什么，最后只给一个动作。镜头之间要让眼神、衣服、人物和地点接得上。

## CTA
${mission.goal}。
`;
}

/**
 * 从已确认场次里取出第一个镜头的机位，作为降级分镜的取景依据。
 *
 * 只搬运，不推断：场次画板没填过机位就返回空对象，让下游按「没有机位信息」处理，
 * 而不是编一个「中景平视」出来——编出来的机位和 visual 对不上，比没有更难查。
 */
function sourceSceneFraming(scene: Record<string, unknown>): Record<string, string> {
  const instance = scene.instance;
  if (!instance || typeof instance !== 'object') return {};
  const shots = (instance as Record<string, unknown>).shots;
  const first = Array.isArray(shots) && shots[0] && typeof shots[0] === 'object'
    ? (shots[0] as Record<string, unknown>)
    : null;
  if (!first) return {};
  const carried: Record<string, string> = {};
  for (const key of ['shotSize', 'cameraAngle', 'cameraHeight', 'cameraMove', 'lens', 'composition', 'subjectPlacement', 'depthOfField']) {
    const value = first[key];
    if (typeof value === 'string' && value.trim()) carried[key] = value.trim();
  }
  return carried;
}

function storyboardFor(req: AgentRunRequest, workflow: WorkflowKind) {
  if (req.productionStage === 'storyboard') {
    const confirmedScenes = parseJson<{ scenes?: Array<Record<string, unknown>> }>(getFile(req, 'scenes.json'), {}).scenes;
    if (!confirmedScenes?.length || !confirmedScenes.every(isConfirmedStoryboardSource)) {
      throw new Error('confirmed scenes.json is unusable for storyboard generation');
    }
    // 分批生成时兜底模板也只能产出本批的场景，否则每一批都补齐全片，
    // 合并后会出现 N 份重复镜头。
    const batchSceneIds = req.stageBatch?.sceneIds;
    const scopedScenes = batchSceneIds?.length
      ? confirmedScenes.filter((scene) => batchSceneIds.includes(String(scene.id)))
      : confirmedScenes;
    return JSON.stringify({
      scenes: (scopedScenes.length ? scopedScenes : confirmedScenes).map((scene) => {
        // 兜底模板一律给 realistic：把日常镜头误标成 stylized 等于替用户关掉质检，
        // 而模板本来就是模型没交出合格产物时的降级路径，这里不该做聪明的推断。
        const physicsMode = normalizePhysicsMode(scene.physicsMode);
        const risks = detectPhysicsRisks(scene.visual, scene.scriptSegment);
        return {
          id: scene.id,
          // 场次画板上填过的机位直接带过来。这不是推断，是把已有数据接上：
          // 缺了这几栏，视频阶段就拿不到景别，模型自己决定人物占画面多大——
          // 而降级路径本来就更需要这层约束，模型这时已经交过一次不合格的产物了。
          ...sourceSceneFraming(scene),
          // 模板产出的镜头也要能被分镜面板逐栏读出来。这几个字段能从已确认场景直接推出，
          // 不填的话降级路径里用户看到的是满屏「未标注」，比信息少更糟——像是数据丢了。
          sourceSceneId: scene.id,
          title: scene.title,
          start: scene.start,
          end: scene.end,
          durationSeconds: clampShotDuration(sourceSceneDuration(scene), physicsMode),
          // 归一化不能省：模板要能通过 hasStoryboardDraft 自己的校验，
          // 否则只是把模型产出换成同样不合格的模板，还白白盖掉了更好的那一份。
          narration: toDialogueNarration(isNonEmptyString(scene.narration) ? scene.narration : scene.scriptSegment),
          visual: scene.visual,
          subtitle: scene.subtitle,
          scriptSegment: scene.scriptSegment,
          characterIds: Array.isArray(scene.characterIds) ? scene.characterIds : [],
          action: isNonEmptyString(scene.visual) ? scene.visual : '',
          dialogue: isNonEmptyString(scene.subtitle) ? scene.subtitle : '',
          physicsMode,
          // 只做提示不做改写：模板没有能力重写画面，但要让用户知道这个镜头模型大概率拍不好。
          ...(risks.length ? { physicsRiskNotes: risks.map((risk) => `${risk.label}：${risk.rewrite}`) } : {})
        };
      })
    }, null, 2);
  }
  const parsed = parseJson<{ scenes?: Array<{ id?: string; start?: number; end?: number; narration?: string; visual?: string; subtitle?: string; physicsMode?: unknown }> }>(
    scenesFor(req, workflow),
    { scenes: [] }
  );
  return JSON.stringify(
    {
      scenes: (parsed.scenes || []).map((scene) => {
        const physicsMode = normalizePhysicsMode(scene.physicsMode);
        return {
          id: scene.id,
          title: scene.id || '未命名镜头',
          start: scene.start,
          end: scene.end,
          durationSeconds: clampShotDuration(Math.max(1, Number(scene.end || 0) - Number(scene.start || 0) || 6), physicsMode),
          narration: toDialogueNarration(scene.narration),
          visual: scene.visual,
          subtitle: scene.subtitle,
          physicsMode
        };
      })
    },
    null,
    2
  );
}

function timelineFor(req: AgentRunRequest, workflow: WorkflowKind) {
  const smb = req.workspace.mode === 'smb';
  return JSON.stringify(
    {
      workflow,
      generatedBy: '剪辑师',
      principle:
        workflow === 'rewrite'
          ? '先用旧稿里最具体的事实抓住注意力，再删除铺垫和空泛卖点。'
          : smb
            ? '先回答真实顾虑，再讲流程和边界，CTA 保持轻。'
            : '前三秒给反常识判断，中段用具体证明，结尾用低压 CTA。',
      beats: [
        {
          id: 'beat_01',
          sceneId: 'scene_01',
          start: 0,
          end: 4,
          role: 'hook',
          pacing: 'fast',
          editNote: smb ? '开场直接说顾客最担心的问题。' : '1 秒内出现反常识判断和封面关键词。'
        },
        {
          id: 'beat_02',
          sceneId: 'scene_02',
          start: 4,
          end: 11,
          role: 'pain',
          pacing: 'medium',
          editNote: '用 2-3 个短镜头压缩痛点，不展开解释。'
        },
        {
          id: 'beat_03',
          sceneId: 'scene_03',
          start: 11,
          end: 22,
          role: 'proof',
          pacing: 'structured',
          editNote: '每个证明点只给一个可视化关键词，字幕避免堆满屏幕。'
        },
        {
          id: 'beat_04',
          sceneId: 'scene_04',
          start: 22,
          end: 31,
          role: 'trust',
          pacing: 'slow_down',
          editNote: '刻意放慢，让用户感觉是在解释边界，不是在强卖。'
        },
        {
          id: 'beat_05',
          sceneId: 'scene_05',
          start: 31,
          end: 38,
          role: 'cta',
          pacing: 'clear',
          editNote: 'CTA 只保留一个动作，不能加绝对化承诺。'
        }
      ],
      reviewChecks: ['前三秒是否足够明确', '字幕是否遮挡画面重点', 'CTA 是否过早或过强', '信息密度是否让用户能看懂']
    },
    null,
    2
  );
}

/**
 * 有词就交给模型当对白念，没词就明确要求闭嘴——两种情况都不能让它自由发挥。
 * 措辞统一由 voiceMode 提供：这里自己另写一套，就会和剧本、分镜、negative 三层打架。
 */
function audioLine(narration?: string) {
  return dialoguePromptDirective(narration);
}

function assetPromptsFor(req: AgentRunRequest, workflow: WorkflowKind) {
  const videoSpec = videoSpecFromInstruction(req);
  const mission = missionModel(req);
  const details = productionDetails(req);
  const isVideoStage = req.productionStage === 'video';
  const confirmedVideoSources = ['script.md', 'characters.json', 'scenes.json', 'storyboard.json'];
  const confirmedScript = getFile(req, 'script.md');
  const confirmedCharacters = parseJson<{ characters?: Array<{ name?: string; consistencyPrompt?: string; negativePrompt?: string }> }>(
    getFile(req, 'characters.json'),
    {}
  ).characters || [];
  const confirmedScenes = normalizeScenes(
    parseJson<{ scenes?: unknown[] }>(getFile(req, 'scenes.json'), { scenes: [] }).scenes,
    []
  );
  const confirmedStoryboardScenes = normalizeScenes(
    parseJson<{ scenes?: unknown[] }>(getFile(req, 'storyboard.json'), { scenes: [] }).scenes,
    []
  );
  const scenes = isVideoStage
    ? (confirmedStoryboardScenes.length ? confirmedStoryboardScenes : confirmedScenes)
    : normalizeScenes(parseJson<{ scenes?: unknown[] }>(scenesFor(req, workflow), { scenes: [] }).scenes, []).slice(0, 5);
  const primaryCharacter = confirmedCharacters[0];
  const primarySubject = isVideoStage
    ? primaryCharacter?.name || '已确认主角色'
    : details.character;
  const scriptExcerpt = confirmedScript.trim().slice(0, 300);
  const renderTasks = ['开场镜头', '痛点补充镜头', '证明点画面', '信任解释镜头', '行动引导镜头'];
  return JSON.stringify(
    {
      workflow,
      visualStyle: isVideoStage
        ? `已确认制作包的真实场景 + 清楚信息卡 + ${videoSpec.aspectRatio} 短视频节奏`
        : `${mission.topic} 的真实场景 + 清楚信息卡 + ${videoSpec.aspectRatio} 短视频节奏`,
      handoffTo: '视频生成准备 Agent',
      handoffRule: '只使用已确认的脚本、分镜、人物、动作、服装、眼神、对白和运镜说明。渲染任务真正成功前，不要声称已有视频文件。',
      confirmedSourceVersions: isVideoStage
        ? Object.fromEntries(confirmedVideoSources.map((path) => [path, req.sourceVersions?.[path] ?? null]))
        : {},
      ...(isVideoStage ? {
        confirmedSourceInputs: {
          scriptExcerpt,
          characterCount: confirmedCharacters.length,
          sceneCount: confirmedScenes.length,
          storyboardSceneCount: confirmedStoryboardScenes.length
        }
      } : {}),
      renderSpec: videoSpec,
      characterConsistency: {
        primarySubject,
        consistencyPrompt: primaryCharacter?.consistencyPrompt || (isVideoStage
          ? '以已确认 characters.json 的 Face ID、年龄变体、服装和表情范围为唯一角色一致性依据。'
          : `同一个真实人物，脸型、发型、服装和眼神状态保持一致。人物设定：${details.character}。剧情设定：${details.plot}。画面围绕「${details.setting}」，保持真实手机短视频质感。`),
        negativePrompt: primaryCharacter?.negativePrompt || '不要畸形手指、不要脸部不一致、不要多余手指、不要不可读文字、不要夸张广告海报感、不要身材羞辱、不要疗效承诺、不要未授权名人肖像。'
      },
      prompts: scenes.map((scene, index) => ({
        id: `prompt_${String(index + 1).padStart(2, '0')}`,
        sceneId: scene.id,
        type: isVideoStage ? 'video' : index === 1 || index === 2 ? 'image' : 'video',
        renderTask: renderTasks[index] || `第 ${index + 1} 个镜头任务`,
        physicsMode: normalizePhysicsMode(scene.physicsMode),
        negativePrompt: `${physicsNegativePrompt(normalizePhysicsMode(scene.physicsMode))}${voiceNegativePrompt()}。${primaryCharacter?.negativePrompt || ''}`,
        // 时长同时受两个上限约束：视频规格的单段上限，和这个镜头物理模式的上限。
        // 后者更常生效——realistic 镜头拖到 6 秒以上，融化和漂移的概率会陡增。
        durationSeconds: clampShotDuration(
          Math.min(Math.max(4, scene.durationSeconds), videoSpec.estimatedClipDurationSeconds),
          normalizePhysicsMode(scene.physicsMode)
        ),
        // 不要把 scene.subtitle 写进提示词。它是「字幕意图」，一旦进了提示词，
        // 视频模型就会真的往画面里画字——而它画不出可读的汉字，结果只能是乱码。
        // 字幕走后期，模型这边只要求「画面零文字 + 中文普通话人声」。
        prompt: isVideoStage
          ? `${videoSpec.aspectRatio} ${videoSpec.resolutionTier}。${scene.title}：${scene.visual}。严格沿用已确认脚本和分镜，不新增上游未确认情节。${scriptExcerpt ? `已确认脚本摘要：${scriptExcerpt}。` : ''}${physicsPromptDirective(normalizePhysicsMode(scene.physicsMode))}${audioLine(scene.narration)}画面里不得出现任何文字：不要字幕、标题卡、水印，招牌菜单包装书本一律无字或虚化。人声一律中文普通话，禁止英文、外语和中英夹杂。`
          : `${videoSpec.aspectRatio} ${videoSpec.resolutionTier}。${scene.title}：${scene.visual}。风格为真实手机短视频，自然光，围绕「${mission.topic}」，让「${mission.audience}」能快速理解场景和判断点。${physicsPromptDirective(normalizePhysicsMode(scene.physicsMode))}${audioLine(scene.narration)}画面里不得出现任何文字：不要字幕、标题卡、水印，招牌菜单包装书本一律无字或虚化。人声一律中文普通话，禁止英文、外语和中英夹杂。`
      })),
      renderQueue: scenes.map((scene, index) => ({
        id: `render_${String(index + 1).padStart(2, '0')}`,
        sceneId: scene.id,
        status: 'prompt_ready',
        spec: videoSpec,
        requiresApproval: true
      })),
      reuseNotes: [
        workflow === 'rewrite' ? '先复用旧稿里的真实细节，再重写表达结构。' : '先复用品牌/账号 DNA，再生成新素材提示词。',
        '所有人物、品牌、产品、门店、素材必须确认授权；当前只生成提示词，不声称已经渲染。'
      ]
    },
    null,
    2
  );
}

function publishCopyFor(req: AgentRunRequest, workflow: WorkflowKind) {
  const weekly = workflow === 'weekly' || workflow === 'calendar';
  const mission = missionModel(req);
  return JSON.stringify(
    {
      titles: weekly
        ? [`${mission.topic}：一周内容地图`, '别每天临时想选题了', '7 条内容，从同一个定位长出来']
        : workflow === 'titles'
          ? [`${mission.topic}，先看这一条`, `${mission.audience}最容易忽略的判断点`, `别急着做${mission.topic}，先确认这 3 件事`, `${mission.topic}适合谁，不适合谁`]
          : workflow === 'rewrite'
            ? ['旧稿不是废了，是缺结构', '把硬广改成真实表达', 'AI 改稿前，先让它诊断']
            : [`${mission.topic}，先看这一条`, `${mission.audience}最容易卡住的点`, `先看流程，再决定要不要行动`],
      coverText: weekly ? '一周内容地图' : workflow === 'rewrite' ? '旧稿爆改前后对比' : `${mission.topic}，先看这一条`,
      caption: weekly
        ? '用品牌/账号 DNA 生成一周内容计划，每条都可以继续展开成脚本、分镜和发布文案。'
        : `这条内容先把${mission.audience}的真实顾虑讲清楚，再给具体流程、边界和一个低压行动。`,
      hashtags: [`#${mission.topic.replace(/\s/g, '').slice(0, 12)}`, '#短视频脚本', '#AI创作', `#${mission.platform}`],
      weeklyIdeas: weekly
        ? ['具体场景', '用户顾虑', '流程拆解', '适合人群', '风险边界', '低压 CTA', '评论区问题']
        : [],
      platformNotes: {
        小红书: '标题更像经验分享，避免过度广告感。',
        抖音: '前三秒直接进入场景和痛点，CTA 保持轻量。',
        TikTok: '表达更直接，减少中文平台黑话。'
      }
    },
    null,
    2
  );
}

function complianceFor(req: AgentRunRequest, workflow: WorkflowKind) {
  const mission = missionModel(req);
  return JSON.stringify(
    {
      overallStatus: 'warning',
      workflow,
      checks: [
        {
          type: 'marketing_claim',
          status: 'warning',
          message: `${mission.redLines.join('、')}。`
        },
        {
          type: 'asset_rights',
          status: 'warning',
          message: '所有人物、品牌、产品、门店、竞品画面和声音素材必须确认授权或替换。'
        },
        {
          type: 'ai_disclosure',
          status: 'pass',
          message: '导出或发布时建议保留 AI 辅助生成说明。'
        }
      ]
    },
    null,
    2
  );
}

function feedbackFor(req: AgentRunRequest, workflow: WorkflowKind) {
  return JSON.stringify(
    {
      workflow,
      generatedBy: '数据分析师',
      source: 'manual_feedback_only',
      realAdDataConnected: false,
      instructionSignals: {
        originalInstruction: req.instruction,
        inferredMode: req.workspace.mode,
        selectedWorkflow: workflow,
        selectedVideoSpec: videoSpecFromInstruction(req)
      },
      manualFeedbackSchema: [
        { field: 'selectedDirection', description: '用户最终选择的创意方向、Hook 或版本。' },
        { field: 'rejectedReason', description: '用户退回的原因，例如太硬广、太空泛、画面不可执行。' },
        { field: 'rewriteRequest', description: '用户要求哪个 Agent 局部重写。' },
        { field: 'approvalDecision', description: '用户批准或拒绝写入哪些文件。' }
      ],
      currentLearnings: [
        '当前没有真实投放数据，不能声称 CTR、ROI、转化率或平台表现。',
        '优先记录人工选择和退回原因，为下一轮 Brief、文案、视觉和剪辑生成提供依据。'
      ],
      nextHypotheses: [
        workflow === 'rewrite' ? '保留旧稿真实细节比完全重写更容易获得用户批准。' : '反常识 Hook 需要具体证明支撑，否则会显得标题党。',
        req.workspace.mode === 'smb' ? '小 B 场景里，流程透明可能比折扣承诺更能建立信任。' : '创作者场景里，真实经验口吻可能比营销口吻更安全。'
      ]
    },
    null,
    2
  );
}

function memoryFor(req: AgentRunRequest, workflow: WorkflowKind) {
  return `# AIGC Project Memory

- Last workflow: ${workflow}
- Last instruction: ${req.instruction}
- Product direction: AI Native AIGC Mission Control, not generic WorkBuddy clone.
- Agent structure: vertical scene-type SubAgents select the production context; horizontal production agents create direction, copy, visuals, edit rhythm, safety review, feedback memory, and approval-ready patches.
- P0 runtime agents are visible and accountable.
- Local fallback generates editable assets from the user instruction; online providers should replace it in production.
- Data Feedback Agent records only manual choices, rejection reasons, and hypotheses until real ad data is explicitly connected.
- All persistent writes require patch approval.
- Avoid absolute marketing claims, unauthorized likeness, hidden ads, and unknown asset licenses.
`;
}

function makePatch(req: AgentRunRequest, filePath: string, after: string, summary: string, riskLevel: PatchOperation['riskLevel'] = 'low'): PatchOperation {
  return {
    id: id(),
    filePath,
    summary,
    before: getFile(req, filePath),
    after,
    riskLevel,
    requiresApproval: true,
    origin: req.productionStage ? {
      kind: 'agent_stage',
      productionStage: req.productionStage,
      generationJobId: req.generationJobId
    } : undefined
  };
}

function dedupePatchesByFilePath(patches: PatchOperation[]): PatchOperation[] {
  const uniqueReversed: PatchOperation[] = [];
  const seen = new Set<string>();
  for (let index = patches.length - 1; index >= 0; index -= 1) {
    const patch = patches[index];
    if (seen.has(patch.filePath)) continue;
    seen.add(patch.filePath);
    uniqueReversed.push(patch);
  }
  return uniqueReversed.reverse();
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasCharacters(content: string) {
  const parsed = parseJson<{ characters?: Array<Record<string, unknown>> }>(content, {});
  const characters = parsed.characters || [];
  return characters.length > 0 && characters.some((character) => character.required === true) && characters.every((character) => {
    const variants = Array.isArray(character.variants) ? character.variants as Array<Record<string, unknown>> : [];
    return typeof character.required === 'boolean' &&
      isNonEmptyString(character.id) &&
      isNonEmptyString(character.name) &&
      isNonEmptyString(character.role) &&
      isNonEmptyString(character.description) &&
      isNonEmptyString(character.faceAnchorVariantId) &&
      isNonEmptyString(character.referenceStrategy) &&
      isNonEmptyString(character.faceIdStrategy) &&
      isNonEmptyString(character.consistencyPrompt) &&
      isNonEmptyString(character.negativePrompt) &&
      Array.isArray(character.expressionIds) && character.expressionIds.length > 0 &&
      isNonEmptyString(character.expressionRange) &&
      isNonEmptyString(character.imagePrompt) &&
      variants.length > 0 && variants.every((variant) =>
        isNonEmptyString(variant.id) &&
        isNonEmptyString(variant.label) &&
        isNonEmptyString(variant.ageLabel) &&
        isNonEmptyString(variant.wardrobe) &&
        isNonEmptyString(variant.primaryImagePrompt)
      );
  });
}

function hasSceneDraft(content: string) {
  const parsed = parseJson<{ scenes?: Array<Record<string, unknown>> }>(content, {});
  return Boolean(parsed.scenes?.length) && Boolean(parsed.scenes?.every((scene) =>
    isNonEmptyString(scene.id) &&
    isNonEmptyString(scene.title) &&
    isNonEmptyString(scene.visual) &&
    isNonEmptyString(scene.location) &&
    isNonEmptyString(scene.timeOfDay) &&
    isNonEmptyString(scene.lighting) &&
    isNonEmptyString(scene.palette) &&
    Array.isArray(scene.characterIds) && scene.characterIds.length > 0 && scene.characterIds.every(isNonEmptyString) &&
    isNonEmptyString(scene.scriptSegment) &&
    isNonEmptyString(scene.mainImagePrompt) &&
    isNonEmptyString(scene.prompt)
  ));
}

function isConfirmedStoryboardSource(scene: Record<string, unknown>) {
  return isNonEmptyString(scene.id) &&
    isNonEmptyString(scene.title) &&
    isNonEmptyString(scene.visual) &&
    isNonEmptyString(scene.subtitle) &&
    isNonEmptyString(scene.scriptSegment) &&
    sourceSceneDuration(scene) > 0;
}

function sourceSceneDuration(scene: Record<string, unknown>) {
  if (typeof scene.durationSeconds === 'number' && scene.durationSeconds > 0) return scene.durationSeconds;
  const start = typeof scene.start === 'number' ? scene.start : 0;
  const end = typeof scene.end === 'number' ? scene.end : 0;
  return end > start ? end - start : 0;
}

function hasStoryboardDraft(content: string) {
  const parsed = parseJson<{ scenes?: Array<Record<string, unknown>> }>(content, {});
  // narration 必须是「角色名：台词」或空。写成第三人称叙述就是旁白，
  // 到视频阶段再拦已经晚了——那时只能让角色用第三人称念自己的名字。
  return Boolean(parsed.scenes?.length) && Boolean(parsed.scenes?.every((scene) =>
    typeof scene.durationSeconds === 'number' && scene.durationSeconds > 0 && isDialogueNarration(scene.narration)
  ));
}

function confirmedVideoSceneCount(req: AgentRunRequest) {
  const storyboard = parseJson<{ scenes?: unknown[] }>(getFile(req, 'storyboard.json'), { scenes: [] }).scenes;
  const scenes = parseJson<{ scenes?: unknown[] }>(getFile(req, 'scenes.json'), { scenes: [] }).scenes;
  return Array.isArray(storyboard) && storyboard.length ? storyboard.length : Array.isArray(scenes) ? scenes.length : 0;
}

function hasVideoTaskPackage(req: AgentRunRequest, content: string) {
  const parsed = parseJson<{
    prompts?: Array<Record<string, unknown>>;
    renderQueue?: Array<Record<string, unknown>>;
    characterConsistency?: { consistencyPrompt?: string; negativePrompt?: string };
  }>(content, {});
  const prompts = parsed.prompts || [];
  const renderQueue = parsed.renderQueue || [];
  if (req.productionStage === 'video') {
    const expectedCount = confirmedVideoSceneCount(req);
    return prompts.length === expectedCount &&
      renderQueue.length === expectedCount &&
      prompts.every((prompt) => prompt.type === 'video') &&
      Boolean(parsed.characterConsistency?.consistencyPrompt || parsed.characterConsistency?.negativePrompt);
  }
  return Math.max(prompts.length, renderQueue.length) >= 3 &&
    Boolean(parsed.characterConsistency?.consistencyPrompt || parsed.characterConsistency?.negativePrompt);
}

function stageFallbackPatches(req: AgentRunRequest, workflow: WorkflowKind, originalReq: AgentRunRequest = req): PatchOperation[] {
  if (!req.productionStage) return [];
  const allowed = new Set(requestedStageOutputFiles(req));
  const patchFor = (filePath: string, after: string, summary: string, riskLevel: PatchOperation['riskLevel'] = 'low') =>
    makePatch(originalReq, filePath, after, summary, riskLevel);

  if (req.productionStage === 'script') {
    return [
      patchFor('brief.json', updatedBrief(req, workflow), '生成脚本阶段 Brief'),
      patchFor('campaign_goal.json', campaignGoalFor(req, workflow), '生成脚本阶段目标'),
      patchFor('script.md', scriptFor(req, workflow), '生成脚本阶段脚本')
    ].filter((patch) => allowed.has(patch.filePath));
  }
  if (req.productionStage === 'character') {
    return [patchFor('characters.json', charactersFor(req), '生成角色阶段角色资产', 'medium')]
      .filter((patch) => allowed.has(patch.filePath));
  }
  if (req.productionStage === 'scene') {
    return [patchFor('scenes.json', scenesFor(req, workflow), '生成场景阶段场景资产', 'medium')]
      .filter((patch) => allowed.has(patch.filePath));
  }
  if (req.productionStage === 'storyboard') {
    return [
      patchFor('storyboard.json', storyboardFor(req, workflow), '生成分镜阶段分镜资产', 'medium'),
      patchFor('timeline.json', timelineFor(req, workflow), '生成分镜阶段剪辑节奏', 'medium')
    ].filter((patch) => allowed.has(patch.filePath));
  }
  return [
    patchFor('asset_prompts.json', assetPromptsFor(req, workflow), '生成视频阶段任务包', 'medium'),
    patchFor('video_spec.json', videoSpecFileFor(req), '生成视频阶段规格')
  ].filter((patch) => allowed.has(patch.filePath));
}

function mockAgentEvents(workflow: WorkflowKind): AgentEvent[] {
  const base = defaultAgentEvents(workflow);
  const mapped: AgentEvent[] = base.map((event, index): AgentEvent => ({
    ...event,
    status: index < base.length - 2 ? 'success' : index === base.length - 2 ? 'warning' : 'pending',
      output:
      event.agentId === 'creative_director'
        ? '已确定传播角度、创意红线和成功标准'
        : event.agentId === 'editor'
          ? '已生成 timeline.json：前 3 秒、节奏点、停顿、转场和 CTA 时机'
          : event.agentId === 'data'
            ? '已生成 feedback_report.json：人工反馈结构和待验证假设'
      : event.agentId === 'compliance'
        ? '发现 2 个需要人工确认的营销/素材风险'
        : event.agentId === 'prompt'
          ? '视频生成准备 Agent 已准备镜头任务、首帧提示、角色一致性和生成参数'
        : event.agentId === 'review'
          ? '等待用户批准后写入 workspace'
          : event.output || `${event.agentName} 已完成`
  }));
  return mapped.some((event) => event.agentId === 'prompt')
    ? mapped
    : [
        ...mapped.slice(0, Math.max(1, mapped.length - 1)),
        {
          id: id(),
          agentId: 'prompt',
          agentName: '视频生成准备 Agent',
          status: 'warning',
          action: '接收确认后的制作包，准备镜头级视频生成任务',
          output: '已生成镜头任务、首帧提示、角色一致性说明和待提交的生成队列'
        },
        ...mapped.slice(Math.max(1, mapped.length - 1))
      ];
}

function mockAssets(req: AgentRunRequest, workflow: WorkflowKind): MissionAsset[] {
  const scenes = normalizeScenes(parseJson<{ scenes?: unknown[] }>(scenesFor(req, workflow), { scenes: [] }).scenes, []);
  return [
    { id: id(), type: 'brief', title: '产品 Brief', status: 'ready', filePath: 'brief.json', summary: '受众、卖点、平台和 CTA 已更新' },
    { id: id(), type: 'reference', title: '爆款参考', status: 'ready', filePath: 'viral_refs.json', summary: '提炼反常识 Hook、痛点、证明和轻 CTA' },
    ...scenes.slice(0, 5).map((scene): MissionAsset => ({
      id: id(),
      type: 'scene',
      title: scene.title,
      status: 'ready',
      filePath: 'scenes.json',
      summary: scene.subtitle
    })),
    { id: id(), type: 'script', title: '脚本', status: 'ready', filePath: 'script.md', summary: '生成人物对白、字幕、封面文案和 CTA' },
    { id: id(), type: 'shot', title: '分镜', status: 'ready', filePath: 'storyboard.json', summary: '生成镜头、动作、构图和节奏' },
    { id: id(), type: 'timeline', title: '剪辑节奏', status: 'ready', filePath: 'timeline.json', summary: '前 3 秒、节奏点、停顿、转场和 CTA 时机' },
    { id: id(), type: 'prompt', title: '视频规格', status: 'ready', filePath: 'video_spec.json', summary: '平台、画幅、清晰度、帧数、帧率和单段时长' },
    { id: id(), type: 'prompt', title: '视频生成任务包', status: 'warning', filePath: 'asset_prompts.json', summary: '已准备镜头任务、首帧提示、角色一致性和生成参数' },
    { id: id(), type: 'copy', title: '发布文案', status: 'ready', filePath: 'publish_copy.json', summary: '标题、caption、hashtags 和平台建议' },
    { id: id(), type: 'compliance', title: '合规报告', status: 'warning', filePath: 'compliance_report.json', summary: '营销承诺和素材授权需要人工确认' },
    { id: id(), type: 'feedback', title: '反馈记录', status: 'ready', filePath: 'feedback_report.json', summary: '人工选择、退回原因和待验证假设，不含虚构投放数据' }
  ];
}

function mockPatch(req: AgentRunRequest, originalReq: AgentRunRequest = req): AgentRunResponse {
  const workflow = inferWorkflow(req);
  const genericPatches = [
    makePatch(originalReq, 'brief.json', updatedBrief(req, workflow), '更新本次 Mission Brief 和工作流'),
    makePatch(originalReq, 'viral_refs.json', viralRefsFor(req, workflow), '更新爆款参考拆解'),
    makePatch(originalReq, 'scenes.json', scenesFor(req, workflow), '更新场景级任务拆解', 'medium'),
    makePatch(originalReq, 'script.md', scriptFor(req, workflow), '生成或更新脚本资产'),
    makePatch(originalReq, 'storyboard.json', storyboardFor(req, workflow), '更新分镜和镜头建议', 'medium'),
    makePatch(originalReq, 'timeline.json', timelineFor(req, workflow), '更新剪辑节奏和 CTA 时机', 'medium'),
    makePatch(originalReq, 'video_spec.json', videoSpecFileFor(req), '记录用户选择的视频生成规格'),
    makePatch(originalReq, 'asset_prompts.json', assetPromptsFor(req, workflow), '生成素材提示词和授权提醒', 'medium'),
    makePatch(originalReq, 'publish_copy.json', publishCopyFor(req, workflow), '生成标题、封面文案、发布文案和标签'),
    makePatch(originalReq, 'compliance_report.json', complianceFor(req, workflow), '更新合规检查', 'medium'),
    makePatch(originalReq, 'feedback_report.json', feedbackFor(req, workflow), '记录人工反馈结构和待验证假设'),
    makePatch(originalReq, '.aigc/MEMORY.md', memoryFor(req, workflow), '更新 AIGC 项目记忆')
  ].filter((patch) => patch.after !== patch.before);
  const patches = req.productionStage
    ? stageFallbackPatches(req, workflow, originalReq).filter((patch) => patch.after !== patch.before)
    : genericPatches;

  if (req.productionStage === 'script') {
    const proposed = (filePath: string) =>
      patches.find((patch) => patch.filePath === filePath)?.after || getFile(req, filePath) || getFile(originalReq, filePath);
    assertValidScriptStageBundle({
      briefJson: proposed('brief.json'),
      campaignGoalJson: proposed('campaign_goal.json'),
      scriptMarkdown: proposed('script.md')
    });
  }

  const previewScenes = normalizeScenes(parseJson<{ scenes?: unknown[] }>(scenesFor(req, workflow), { scenes: [] }).scenes, []);

  return {
    mode: 'mock',
    provider: 'mock',
    assistantMessage: `我已经按「${workflowTitle(workflow)}」完成两层派工：垂直场景 SubAgent 先确定片种和制作上下文，横向生产流水线再生成方向、文案、视觉、剪辑节奏、品牌安全和反馈记录。现在等待你审查并批准写入。`,
    plan: [
      '读取产品 Brief、品牌记忆、爆款参考、平台规则和素材库',
      `匹配场景：${workflowTitle(workflow)}`,
      '主 Agent 先判断视频场景类型，并分配给对应垂直 SubAgent',
      '创意总监确定传播角度、创意红线和成功标准',
      '文案、视觉和剪辑 Agent 生成脚本、人物设定、场景设定、动作、服装、眼神、对白、分镜和剪辑节奏',
      '视频生成准备 Agent 把确认后的制作包转成镜头任务、首帧提示和生成参数',
      '数据分析师记录人工反馈结构和待验证假设，不虚构投放数据',
      '汇总为可审批 patch，等待用户批准'
    ],
    toolEvents: [
      { id: id(), toolName: 'read_context_stack', status: 'success', title: '读取上下文栈', summary: '已读取 Brief、品牌记忆、参考样本、平台规则和素材库' },
      { id: id(), toolName: 'route_scene_subagent', status: 'success', title: '匹配垂直场景 Agent', summary: '已先判断片种和制作上下文，再进入资产生产' },
      { id: id(), toolName: 'route_aigc_skill', status: 'success', title: '匹配横向生产流水线', summary: defaultWorkflowRules[workflow] },
      { id: id(), toolName: 'dispatch_agents', status: 'success', title: '分配专门 Agent', summary: mockAgentEvents(workflow).map((event) => event.agentName).join(' / ') },
      { id: id(), toolName: 'generate_production_package', status: 'success', title: '生成制作包', summary: '已准备脚本、人物、场景、分镜和运镜说明' },
      { id: id(), toolName: 'generate_edit_timeline', status: 'success', title: '生成剪辑节奏', summary: '已准备 Hook、节奏点、转场和 CTA 时机' },
      { id: id(), toolName: 'prepare_video_generation', status: 'warning', title: '准备视频生成任务', summary: '已准备镜头任务和生成参数；尚未渲染 MP4' },
      { id: id(), toolName: 'record_feedback_schema', status: 'success', title: '记录反馈结构', summary: '已准备人工反馈结构和待验证假设；不声称真实投放数据' },
      { id: id(), toolName: 'risk_scan', status: 'warning', title: '风险扫描', summary: '营销承诺和素材授权需要人工确认' },
      { id: id(), toolName: 'propose_patch', status: 'approval_required', title: '等待批准', summary: `已准备 ${patches.length} 个完整文件 patch` }
    ],
    agentEvents: mockAgentEvents(workflow),
    assets: req.productionStage
      ? patches.map((patch) => ({
          id: id(),
          type: patch.filePath.includes('scene') ? 'scene' : patch.filePath.includes('storyboard') ? 'shot' : patch.filePath.includes('timeline') ? 'timeline' : patch.filePath.includes('prompt') || patch.filePath.includes('video') || patch.filePath.includes('character') ? 'prompt' : 'script',
          title: patch.filePath,
          status: patch.riskLevel === 'high' ? 'warning' : 'ready',
          filePath: patch.filePath,
          summary: patch.summary
        }))
      : mockAssets(req, workflow),
    patchOperations: patches,
    complianceChecks: [
      {
        id: id(),
        type: 'marketing_claim',
        status: 'warning',
        message: req.workspace.mode === 'smb' ? '避免“快速瘦身”“改善焦虑”“保证有效”等身材焦虑或疗效承诺。' : '避免“保证省钱”“一定转化”“全网最低”等绝对化承诺。'
      },
      {
        id: id(),
        type: 'asset_rights',
        status: 'warning',
        message: '真实人物、品牌、产品、场地、竞品画面和声音素材必须确认授权或替换。'
      },
      { id: id(), type: 'ai_disclosure', status: 'pass', message: '建议保留 AI 辅助生成说明。' }
    ],
    preview: {
      title: workflowTitle(workflow),
      subtitle: workflow === 'rewrite' ? '先诊断，再爆改，再审批' : '目标驱动，Agent 自动生成 AIGC 内容资产',
      cta: workflow === 'weekly' || workflow === 'calendar' ? '选一条继续展开' : '批准后写入项目',
      durationSeconds: 38,
      timelineVersion: req.workspace.currentTimelineVersion + 1,
      platform: req.workspace.mode === 'smb' ? '抖音 / 小红书' : '小红书 / 抖音 / TikTok',
      mode: req.workspace.mode,
      workflow,
      scenes: previewScenes
    },
    notes: ['当前是本地 fallback。配置 ANTHROPIC_API_KEY、OPENAI_API_KEY 或 CUSTOM_API_KEY 后会走真实在线模型。']
  };
}

/** 把校验器报的问题原样转达给模型，并逐条说清怎么改，而不是让它再猜一次。 */
function stageRetryInstruction(issues: string[]): string {
  return `重要：你上一轮的产出没有通过阶段校验，被拒绝的原因是：
${issues.map((issue) => `- ${issue}`).join('\n')}

请针对上面每一条逐个修正，然后重新输出本阶段的完整文件。特别注意：
- 如果提示「未保留 Brief 的主身份」，说明 script.md 正文里没有出现和 brief.json 的 topic 一字不差的字符串。把 topic 改短成产品或主题本名（例如「保温杯」而不是「国产高颜值保温杯种草」），并确保正文里原样出现它。
- 如果提示「含占位内容」，把方括号模板、TODO、待填写之类的内容替换成真实具体的内容。
- 不要重复上一轮同样的问题。`;
}

export async function runVideoAgent(req: AgentRunRequest): Promise<AgentRunResponse> {
  const authoritativeReq: AgentRunRequest = req.productionStage
    ? { ...req, requestedOutputFiles: requestedStageOutputFiles(req) }
    : req;
  assertStageSourceVersions(authoritativeReq);
  const promptContext = stagePromptWorkspace(authoritativeReq);
  const promptReq: AgentRunRequest = promptContext.workspace === authoritativeReq.workspace
    ? authoritativeReq
    : { ...authoritativeReq, workspace: promptContext.workspace };
  const forceMock = process.env.VIDEOAGENT_FORCE_MOCK === 'true' || process.env.DEMO_MODE === '1';
  const provider = (process.env.DEFAULT_PROVIDER || '').toLowerCase();
  const customConfigured = Boolean(process.env.CUSTOM_API_KEY && (process.env.CUSTOM_BASE_URL || process.env.OPENAI_BASE_URL));

  async function callSelectedProvider(pReq: AgentRunRequest): Promise<AgentRunResponse> {
    if (forceMock) return mockPatch(pReq, authoritativeReq);
    if (process.env.AGENT_LOOP === '1' && !authoritativeReq.productionStage) return agentLoop(authoritativeReq);
    if (provider === 'custom' && customConfigured) return callCustomOpenAICompatible(pReq, authoritativeReq);
    if (provider === 'anthropic' && process.env.ANTHROPIC_API_KEY) return callAnthropic(pReq, authoritativeReq);
    if (provider === 'openai' && process.env.OPENAI_API_KEY) return callOpenAI(pReq, authoritativeReq);
    if (customConfigured) return callCustomOpenAICompatible(pReq, authoritativeReq);
    if (process.env.ANTHROPIC_API_KEY) return callAnthropic(pReq, authoritativeReq);
    if (process.env.OPENAI_API_KEY) return callOpenAI(pReq, authoritativeReq);
    return mockPatch(pReq, authoritativeReq);
  }

  let response: AgentRunResponse;
  let stageRetryNote = '';
  try {
    response = await callSelectedProvider(promptReq);
  } catch (error) {
    // 阶段校验不通过时，把具体问题喂回给模型再给一次机会。
    // 重试的代价远低于让用户白等一轮再从头来过；校验标准本身一点不放宽。
    if (forceMock || !(error instanceof InvalidStageOutputError)) throw error;
    stageRetryNote = `上一轮产出未通过阶段校验，已带着具体问题重试一次：${error.issues.join('；')}`;
    response = await callSelectedProvider({
      ...promptReq,
      instruction: `${promptReq.instruction}\n\n${stageRetryInstruction(error.issues)}`
    });
  }

  if (stageRetryNote) {
    response = { ...response, notes: [...response.notes, stageRetryNote] };
  }

  if (promptContext.warnings.length) {
    response = { ...response, notes: [...response.notes, ...promptContext.warnings] };
  }

  if (authoritativeReq.productionStage && response.patchOperations.length === 0) {
    throw new Error(`${authoritativeReq.productionStage} 阶段没有产生可审查的新 patch`);
  }

  // 片种事件排在 workflow 事件前面：用户是先选的片种，时间线按因果顺序读才讲得通。
  const genrePlan = genreSkillPlan(promptReq.genre, promptReq.productionStage);
  const autoloads = [genreSkillAutoloadEvent(genrePlan), skillAutoloadEvent(inferWorkflow(promptReq))].filter(
    (event): event is Omit<ToolEvent, 'id'> => Boolean(event)
  );
  const fresh = autoloads.filter((event) => !response.toolEvents.some((existing) => existing.title === event.title));
  const genreNotes = genrePlan?.notes || [];
  if (!fresh.length && !genreNotes.length) return response;
  return {
    ...response,
    notes: genreNotes.length ? [...response.notes, ...genreNotes] : response.notes,
    toolEvents: [...fresh.map((event) => ({ id: id(), ...event })), ...response.toolEvents]
  };
}

export function getProviderStatus() {
  const forceMock = process.env.VIDEOAGENT_FORCE_MOCK === 'true' || process.env.DEMO_MODE === '1';
  const provider = (process.env.DEFAULT_PROVIDER || '').toLowerCase();
  const customConfigured = Boolean(process.env.CUSTOM_API_KEY && (process.env.CUSTOM_BASE_URL || process.env.OPENAI_BASE_URL));
  const anthropicConfigured = Boolean(process.env.ANTHROPIC_API_KEY);
  const openaiConfigured = Boolean(process.env.OPENAI_API_KEY);
  let selectedProvider = 'mock';
  if (!forceMock) {
    if (provider === 'custom' && customConfigured) selectedProvider = 'custom';
    else if (provider === 'anthropic' && anthropicConfigured) selectedProvider = 'anthropic';
    else if (provider === 'openai' && openaiConfigured) selectedProvider = 'openai';
    else if (customConfigured) selectedProvider = 'custom';
    else if (anthropicConfigured) selectedProvider = 'anthropic';
    else if (openaiConfigured) selectedProvider = 'openai';
  }
  return {
    forceMock,
    anthropicConfigured,
    openaiConfigured,
    customConfigured,
    customBaseUrl: process.env.CUSTOM_BASE_URL || process.env.OPENAI_BASE_URL || '',
    selectedProvider,
    text: {
      provider: selectedProvider,
      configured: selectedProvider !== 'mock',
      model:
        selectedProvider === 'anthropic'
          ? process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5'
          : selectedProvider === 'custom'
            ? process.env.CUSTOM_MODEL || process.env.OPENAI_MODEL || ''
            : selectedProvider === 'openai'
              ? process.env.OPENAI_MODEL || 'gpt-4.1-mini'
              : ''
    },
    image: {
      provider: process.env.IMAGE_PROVIDER || '',
      configured: Boolean(process.env.IMAGE_API_KEY),
      model: process.env.IMAGE_MODEL || '',
      baseUrl: process.env.IMAGE_BASE_URL || ''
    },
    video: {
      provider: process.env.VIDEO_PROVIDER || '',
      configured: Boolean(process.env.VIDEO_API_KEY),
      model: process.env.VIDEO_MODEL || '',
      baseUrl: process.env.VIDEO_BASE_URL || ''
    }
  };
}

export { callModel };
