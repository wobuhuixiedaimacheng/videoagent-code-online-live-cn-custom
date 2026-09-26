import { agentLoop } from './agentLoop';
import { callModel } from './modelGateway';
import { agentRoster, getSkillByWorkflow, missionAssetsFromWorkspace } from './workspace';
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

const AGENT_PROVIDER_TIMEOUT_MS = Number(process.env.AGENT_PROVIDER_TIMEOUT_MS || 90000);

const defaultWorkflowRules: Record<WorkflowKind, string> = {
  generate: '从目标生成完整 AIGC 内容资产包。',
  rewrite: '保留有效事实，重写旧稿结构和表达。',
  weekly: '生成一周内容计划，并形成可继续展开的任务队列。',
  brand: '理解品牌、受众、卖点、语气和禁用表达。',
  viral_ref: '把爆款参考拆成可复用的结构和表达方法。',
  topic: '基于品牌上下文和平台规则生成选题。',
  scene: '把内容拆成场景级任务和剪辑节奏。',
  script: '生成 Hook、叙事文案、口播、字幕、标题和封面文案。',
  shot: '生成视觉分镜、运镜、动作和构图建议。',
  prompt: '生成 AIGC 图片和视频素材提示词。',
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

function compactWorkspace(req: AgentRunRequest) {
  return req.workspace.files.map((file) => ({
    path: file.path,
    version: file.version,
    kind: file.kind,
    content: file.content.slice(0, 7000)
  }));
}

function inferWorkflow(req: AgentRunRequest): WorkflowKind {
  if (req.workflow) return req.workflow;
  const text = req.instruction.toLowerCase();
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
  if (text.includes('/prompt')) return 'prompt';
  if (text.includes('/platform')) return 'platform';
  if (text.includes('/compliance')) return 'compliance';
  if (text.includes('/approval')) return 'approval';
  return req.workspace.activeWorkflow || 'generate';
}

function isPureQuestion(req: AgentRunRequest) {
  const text = req.instruction.trim();
  if (!text) return true;
  const hasProductionIntent = /生成|写|做|产出|创建|补|改|拆|分镜|脚本|prompt|文案|视频|短剧|内容包|patch/i.test(text);
  if (hasProductionIntent) return false;
  return /[?？]$/.test(text) || /^(为什么|怎么|如何|是否|能不能|可以吗|啥|什么|where|why|how|what|can|could|should)\b/i.test(text);
}

function buildPrompt(req: AgentRunRequest) {
  const workflow = inferWorkflow(req);
  const skill = getSkillByWorkflow(workflow);
  return `你是 VideoAgent Code，一个 AI 原生 AIGC Mission Control 后端。

${OUTPUT_LANGUAGE_POLICY}

User instruction:
${req.instruction}

Workflow:
${workflow}
${defaultWorkflowRules[workflow]}

Selected skill:
${skill ? JSON.stringify(skill, null, 2) : 'Generic mission generation'}

Project metadata:
${JSON.stringify(
  {
    projectId: req.workspace.projectId,
    title: req.workspace.title,
    branch: req.workspace.branch,
    mode: req.workspace.mode,
    activeWorkflow: req.workspace.activeWorkflow,
    currentTimelineVersion: req.workspace.currentTimelineVersion,
    complianceStatus: req.workspace.complianceStatus
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
- Data Feedback Agent 只能记录人工选择、退回原因、偏好信号和假设。除非 workspace 文件里已有真实数据，否则不得虚构 CTR、ROI、转化率、投放金额或广告平台表现。

Canonical workspace files:
- profile.json
- brief.json
- viral_refs.json
- campaign_goal.json
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
- Editing Agent 必须落到 timeline.json。
- Data Feedback Agent 必须落到 feedback_report.json，且只能使用人工或明确提供的数据。
- Patch before/after 字段必须包含每个被修改文件的完整内容。
- 除非用户只是提问，否则必须至少包含一个 patchOperation。

${JSON_GUARD}`;
}

function safeJsonParse(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch (_) {}
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first >= 0 && last > first) return JSON.parse(trimmed.slice(first, last + 1));
  throw new Error('Model did not return valid JSON');
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
    rule: '生成脚本节奏、分镜、首帧提示、视频提示词、避免项和渲染任务时，必须使用当前视频规格。'
  };
}

function videoSpecFileFor(req: AgentRunRequest) {
  return JSON.stringify(videoSpecFromInstruction(req), null, 2);
}

function cleanInstruction(req: AgentRunRequest) {
  return req.instruction.split('[当前视频规格]')[0].trim() || '新的短视频创作任务';
}

function inferTopic(req: AgentRunRequest) {
  const text = cleanInstruction(req)
    .replace(/^\/\w+\s*/, '')
    .replace(/先帮我|帮我|请|我要|我想|生成|做一个|做成|视频|短视频/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, 48) || '新的短视频创作任务';
}

function inferPlatform(req: AgentRunRequest) {
  return videoSpecFromInstruction(req).platform || '小红书';
}

function inferAudience(req: AgentRunRequest) {
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
  const cta = /预约|咨询|体验|购买|下单|私信|评论/.test(cleanInstruction(req)) ? '引导用户采取低压行动' : '引导用户继续了解或互动';
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
      const filePath = String(p.filePath || 'script.md');
      const current = req.workspace.files.find((file) => file.path === filePath)?.content || '';
      const risk = ['low', 'medium', 'high'].includes(String(p.riskLevel))
        ? (String(p.riskLevel) as PatchOperation['riskLevel'])
        : 'low';
      return {
        id: id(),
        filePath,
        summary: String(p.summary || `Update ${filePath}`),
        before: String(p.before || current),
        after: String(p.after || current),
        riskLevel: risk,
        requiresApproval: p.requiresApproval !== false
      };
    })
    .filter((patch) => patch.after.trim().length > 0 && patch.after !== patch.before);

  if (!isPureQuestion(req)) {
    const ensurePatch = (filePath: string, after: string, summary: string, riskLevel: PatchOperation['riskLevel'] = 'low') => {
      if (patches.some((patch) => patch.filePath === filePath)) return;
      if (after === getFile(req, filePath)) return;
      patches = [...patches, makePatch(req, filePath, after, summary, riskLevel)];
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
    };
    const hasScenes = (content: string) => parseJson<{ scenes?: unknown[] }>(content, { scenes: [] }).scenes?.length || 0;
    const hasVideoTasks = (content: string) => {
      const parsed = parseJson<{
        prompts?: unknown[];
        renderQueue?: unknown[];
        characterConsistency?: { consistencyPrompt?: string; negativePrompt?: string };
      }>(content, {});
      return (
        Math.max(parsed.prompts?.length || 0, parsed.renderQueue?.length || 0) >= 3 &&
        Boolean(parsed.characterConsistency?.consistencyPrompt || parsed.characterConsistency?.negativePrompt)
      );
    };

    ensurePatch('script.md', scriptFor(req, workflow), '系统补齐缺失的脚本资产：在线模型未提交 script.md');
    ensureValidPatch('scenes.json', scenesFor(req, workflow), (content) => hasScenes(content) >= 3, '系统补齐缺失的场景资产：保证分镜和视频任务可审查', 'medium');
    ensureValidPatch('storyboard.json', storyboardFor(req, workflow), (content) => hasScenes(content) >= 3, '系统补齐缺失的分镜资产：保证逐镜画面可调整', 'medium');
    ensurePatch('timeline.json', timelineFor(req, workflow), '系统补齐缺失的剪辑节奏资产', 'medium');
    ensurePatch('video_spec.json', videoSpecFileFor(req), '系统补齐缺失的视频规格资产');
    ensureValidPatch('asset_prompts.json', assetPromptsFor(req, workflow), hasVideoTasks, '系统补齐缺失的视频生成任务包：保证镜头任务、角色一致性和避免项可审查', 'medium');
    ensurePatch('publish_copy.json', publishCopyFor(req, workflow), '系统补齐缺失的发布文案资产');
    ensurePatch('compliance_report.json', complianceFor(req, workflow), '系统补齐缺失的合规检查资产', 'medium');
    ensurePatch('feedback_report.json', feedbackFor(req, workflow), '系统补齐缺失的人工反馈结构');

    const ensuredFiles = [
      'script.md',
      'scenes.json',
      'storyboard.json',
      'timeline.json',
      'video_spec.json',
      'asset_prompts.json',
      'publish_copy.json',
      'compliance_report.json',
      'feedback_report.json'
    ].filter((filePath) => patches.some((patch) => patch.filePath === filePath));

    toolEvents.push({
      id: id(),
      toolName: 'ensure_production_package',
      status: 'warning',
      title: '补齐制作包交付物',
      summary: `已校验 ${ensuredFiles.length} 个核心资产，确保脚本、分镜、角色一致性和视频任务可审查`
    });
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

  const fallbackAssets = missionAssetsFromWorkspace(req.workspace);
  const assets: MissionAsset[] = assetsRaw.length
    ? assetsRaw.map((asset, index) => {
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

async function callAnthropic(req: AgentRunRequest): Promise<AgentRunResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is missing');
  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model,
      max_tokens: 5000,
      temperature: 0.2,
      system: PROVIDER_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildPrompt(req) }]
    })
  });
  if (!res.ok) throw new Error(`Anthropic API error ${res.status}: ${(await res.text()).slice(0, 500)}`);
  const json = await res.json();
  const text = Array.isArray(json.content) ? json.content.map((block: { text?: string }) => block?.text || '').join('\n') : '';
  return normalizeResponse(safeJsonParse(text), req, 'anthropic', 'live');
}

async function callOpenAI(req: AgentRunRequest): Promise<AgentRunResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is missing');
  const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      input: [
        { role: 'system', content: PROVIDER_SYSTEM_PROMPT },
        { role: 'user', content: buildPrompt(req) }
      ]
    })
  });
  if (!res.ok) throw new Error(`OpenAI API error ${res.status}: ${(await res.text()).slice(0, 500)}`);
  const json = await res.json();
  const text =
    json.output_text ||
    (Array.isArray(json.output)
      ? json.output.flatMap((item: { content?: { text?: string }[] }) => item.content || []).map((c: { text?: string }) => c.text || '').join('\n')
      : '');
  return normalizeResponse(safeJsonParse(text), req, 'openai', 'live');
}

async function callCustomOpenAICompatible(req: AgentRunRequest): Promise<AgentRunResponse> {
  const apiKey = process.env.CUSTOM_API_KEY || process.env.OPENAI_API_KEY;
  const baseUrlRaw = process.env.CUSTOM_BASE_URL || process.env.OPENAI_BASE_URL;
  const model = process.env.CUSTOM_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';
  if (!apiKey) throw new Error('CUSTOM_API_KEY is missing');
  if (!baseUrlRaw) throw new Error('CUSTOM_BASE_URL is missing');

  const baseUrl = baseUrlRaw.replace(/\/$/, '');
  const endpoint = baseUrl.endsWith('/v1') ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;

  const res = await fetchWithProviderTimeout(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: PROVIDER_SYSTEM_PROMPT },
        { role: 'user', content: buildPrompt(req) }
      ]
    })
  }, { provider: 'Custom', model });
  if (!res.ok) throw new Error(`Custom API error ${res.status}: ${(await res.text()).slice(0, 500)}`);
  const json = await res.json();
  const text = json.choices?.[0]?.message?.content || json.output_text || '';
  return normalizeResponse(safeJsonParse(text), req, 'custom', 'live');
}

async function fetchWithProviderTimeout(endpoint: string, init: RequestInit, context: { provider: string; model: string }) {
  const controller = new AbortController();
  const timeout = windowlessTimeout(() => controller.abort(), AGENT_PROVIDER_TIMEOUT_MS);
  try {
    return await fetch(endpoint, { ...init, signal: controller.signal });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const cause = error instanceof Error && 'cause' in error ? error.cause as { code?: string; message?: string } | undefined : undefined;
    const detail =
      error instanceof Error && error.name === 'AbortError'
        ? `超过 ${Math.round(AGENT_PROVIDER_TIMEOUT_MS / 1000)} 秒未返回`
        : `网络错误：${cause?.code || cause?.message || message}`;
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
      updatedBy: 'Creative Director Agent',
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

function scenesFor(req: AgentRunRequest, workflow: WorkflowKind) {
  const mission = missionModel(req);
  const details = productionDetails(req);
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
        subtitle
      }))
    },
    null,
    2
  );
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

口播不要像广告。先说她为什么犹豫，再拍她看见了什么，最后只给一个动作。镜头之间要让眼神、衣服、人物和地点接得上。

## CTA
${mission.goal}。
`;
}

function storyboardFor(req: AgentRunRequest, workflow: WorkflowKind) {
  const parsed = parseJson<{ scenes?: Array<{ id?: string; start?: number; end?: number; narration?: string; visual?: string; subtitle?: string }> }>(
    scenesFor(req, workflow),
    { scenes: [] }
  );
  return JSON.stringify(
    {
      scenes: (parsed.scenes || []).map((scene) => ({
        id: scene.id,
        start: scene.start,
        end: scene.end,
        narration: scene.narration,
        visual: scene.visual,
        subtitle: scene.subtitle
      }))
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
      generatedBy: 'Editing Agent',
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

function assetPromptsFor(req: AgentRunRequest, workflow: WorkflowKind) {
  const videoSpec = videoSpecFromInstruction(req);
  const mission = missionModel(req);
  const details = productionDetails(req);
  const scenes = normalizeScenes(parseJson<{ scenes?: unknown[] }>(scenesFor(req, workflow), { scenes: [] }).scenes, []).slice(0, 5);
  const renderTasks = ['开场镜头', '痛点补充镜头', '证明点画面', '信任解释镜头', '行动引导镜头'];
  return JSON.stringify(
    {
      workflow,
      visualStyle: `${mission.topic} 的真实场景 + 清楚信息卡 + ${videoSpec.aspectRatio} 短视频节奏`,
      handoffTo: '视频生成准备 Agent',
      handoffRule: '只使用已确认的脚本、分镜、人物、动作、服装、眼神、对白和运镜说明。渲染任务真正成功前，不要声称已有视频文件。',
      renderSpec: videoSpec,
      characterConsistency: {
        primarySubject: details.character,
        consistencyPrompt: `同一个真实人物，脸型、发型、服装和眼神状态保持一致。人物设定：${details.character}。剧情设定：${details.plot}。画面围绕「${details.setting}」，保持真实手机短视频质感。`,
        negativePrompt: '不要畸形手指、不要脸部不一致、不要多余手指、不要不可读文字、不要夸张广告海报感、不要身材羞辱、不要疗效承诺、不要未授权名人肖像。'
      },
      prompts: scenes.map((scene, index) => ({
        id: `prompt_${String(index + 1).padStart(2, '0')}`,
        sceneId: scene.id,
        type: index === 1 || index === 2 ? 'image' : 'video',
        renderTask: renderTasks[index] || `第 ${index + 1} 个镜头任务`,
        durationSeconds: Math.min(Math.max(4, scene.durationSeconds), videoSpec.estimatedClipDurationSeconds),
        prompt: `${videoSpec.aspectRatio} ${videoSpec.resolutionTier}。${scene.title}：${scene.visual}。字幕意图：${scene.subtitle}。风格为真实手机短视频，自然光，围绕「${mission.topic}」，让「${mission.audience}」能快速理解场景和判断点。画面里出现的字幕、菜单、招牌、包装文字和旁白全部使用中文，禁止英文字幕、英文菜单、英文招牌、英文包装和英文旁白。`
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
      generatedBy: 'Data Feedback Agent',
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
    requiresApproval: true
  };
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
    { id: id(), type: 'script', title: '脚本', status: 'ready', filePath: 'script.md', summary: '生成口播、字幕、封面文案和 CTA' },
    { id: id(), type: 'shot', title: '分镜', status: 'ready', filePath: 'storyboard.json', summary: '生成镜头、动作、构图和节奏' },
    { id: id(), type: 'timeline', title: '剪辑节奏', status: 'ready', filePath: 'timeline.json', summary: '前 3 秒、节奏点、停顿、转场和 CTA 时机' },
    { id: id(), type: 'prompt', title: '视频规格', status: 'ready', filePath: 'video_spec.json', summary: '平台、画幅、清晰度、帧数、帧率和单段时长' },
    { id: id(), type: 'prompt', title: '视频生成任务包', status: 'warning', filePath: 'asset_prompts.json', summary: '已准备镜头任务、首帧提示、角色一致性和生成参数' },
    { id: id(), type: 'copy', title: '发布文案', status: 'ready', filePath: 'publish_copy.json', summary: '标题、caption、hashtags 和平台建议' },
    { id: id(), type: 'compliance', title: '合规报告', status: 'warning', filePath: 'compliance_report.json', summary: '营销承诺和素材授权需要人工确认' },
    { id: id(), type: 'feedback', title: '反馈记录', status: 'ready', filePath: 'feedback_report.json', summary: '人工选择、退回原因和待验证假设，不含虚构投放数据' }
  ];
}

function mockPatch(req: AgentRunRequest): AgentRunResponse {
  const workflow = inferWorkflow(req);
  const patches = [
    makePatch(req, 'brief.json', updatedBrief(req, workflow), '更新本次 Mission Brief 和工作流'),
    makePatch(req, 'viral_refs.json', viralRefsFor(req, workflow), '更新爆款参考拆解'),
    makePatch(req, 'scenes.json', scenesFor(req, workflow), '更新场景级任务拆解', 'medium'),
    makePatch(req, 'script.md', scriptFor(req, workflow), '生成或更新脚本资产'),
    makePatch(req, 'storyboard.json', storyboardFor(req, workflow), '更新分镜和镜头建议', 'medium'),
    makePatch(req, 'timeline.json', timelineFor(req, workflow), '更新剪辑节奏和 CTA 时机', 'medium'),
    makePatch(req, 'video_spec.json', videoSpecFileFor(req), '记录用户选择的视频生成规格'),
    makePatch(req, 'asset_prompts.json', assetPromptsFor(req, workflow), '生成素材提示词和授权提醒', 'medium'),
    makePatch(req, 'publish_copy.json', publishCopyFor(req, workflow), '生成标题、封面文案、发布文案和标签'),
    makePatch(req, 'compliance_report.json', complianceFor(req, workflow), '更新合规检查', 'medium'),
    makePatch(req, 'feedback_report.json', feedbackFor(req, workflow), '记录人工反馈结构和待验证假设'),
    makePatch(req, '.aigc/MEMORY.md', memoryFor(req, workflow), '更新 AIGC 项目记忆')
  ].filter((patch) => patch.after !== patch.before);

  const previewScenes = normalizeScenes(parseJson<{ scenes?: unknown[] }>(scenesFor(req, workflow), { scenes: [] }).scenes, []);

  return {
    mode: 'mock',
    provider: 'mock',
    assistantMessage: `我已经按「${workflowTitle(workflow)}」完成两层派工：垂直场景 SubAgent 先确定片种和制作上下文，横向生产流水线再生成方向、文案、视觉、剪辑节奏、品牌安全和反馈记录。现在等待你审查并批准写入。`,
    plan: [
      '读取产品 Brief、品牌记忆、爆款参考、平台规则和素材库',
      `匹配场景：${workflowTitle(workflow)}`,
      '主 Agent 先判断视频场景类型，并分配给对应垂直 SubAgent',
      'Creative Director Agent 确定传播角度、创意红线和成功标准',
      '文案、视觉和剪辑 Agent 生成脚本、人物设定、场景设定、动作、服装、眼神、对白、分镜和剪辑节奏',
      '视频生成准备 Agent 把确认后的制作包转成镜头任务、首帧提示和生成参数',
      'Data Feedback Agent 记录人工反馈结构和待验证假设，不虚构投放数据',
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
    assets: mockAssets(req, workflow),
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

export async function runVideoAgent(req: AgentRunRequest): Promise<AgentRunResponse> {
  const forceMock = process.env.VIDEOAGENT_FORCE_MOCK === 'true' || process.env.DEMO_MODE === '1';
  const provider = (process.env.DEFAULT_PROVIDER || '').toLowerCase();
  const customConfigured = Boolean(process.env.CUSTOM_API_KEY && (process.env.CUSTOM_BASE_URL || process.env.OPENAI_BASE_URL));
  if (forceMock) return mockPatch(req);
  if (process.env.AGENT_LOOP === '1') return agentLoop(req);
  if (provider === 'custom' && customConfigured) return callCustomOpenAICompatible(req);
  if (provider === 'anthropic' && process.env.ANTHROPIC_API_KEY) return callAnthropic(req);
  if (provider === 'openai' && process.env.OPENAI_API_KEY) return callOpenAI(req);

  if (customConfigured) return callCustomOpenAICompatible(req);
  if (process.env.ANTHROPIC_API_KEY) return callAnthropic(req);
  if (process.env.OPENAI_API_KEY) return callOpenAI(req);
  return mockPatch(req);
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
