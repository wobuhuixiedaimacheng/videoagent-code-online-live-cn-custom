import { listSkillManifests } from './workspace';
import { getRuntimeSkillDetail } from './skillRuntime';
import { genreSkillPlan, genreSkillSection } from './genreSkillRouter';
import type { AgentRunRequest, WorkflowKind } from './types';
import type { ToolSchema } from './loopTypes';

export const OUTPUT_LANGUAGE_POLICY = `输出语言规则：
- 所有面向用户的内容必须使用简体中文，包括 assistantMessage、plan、toolEvents.title/summary、agentEvents.action/output、assets.title/summary、patchOperations.summary、complianceChecks.message、preview、notes，以及 patch 里的 Markdown 正文。
- JSON key、文件名、模型名、供应商名、平台专名和枚举值可以保留英文；除此之外，JSON value 也必须优先使用中文。
- asset_prompts.json 是给用户审查的视频生成任务包，不是纯机器参数。视频模型提示词、首帧提示、角色一致性提示和避免项都必须提供中文可审查文本。
- 如果下游视频模型后续需要英文提示词，只能在明确的可选字段里补充；主字段 prompt、renderTask、consistencyPrompt、negativePrompt 必须是中文。`;

export const PROVIDER_SYSTEM_PROMPT =
  '你是严格输出 JSON 的 AI 原生 AIGC Mission Control 后端。不要输出 markdown，不要包含隐藏推理链。除 JSON key、文件名、模型名、供应商名和必要枚举值外，所有面向用户的值必须使用简体中文。';

export const defaultWorkflowRules: Record<WorkflowKind, string> = {
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

export function inferWorkflow(req: AgentRunRequest): WorkflowKind {
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

export function isPureQuestion(req: AgentRunRequest) {
  const text = req.instruction.trim();
  if (!text) return true;
  const hasProductionIntent = /生成|写|做|产出|创建|补|改|拆|分镜|脚本|prompt|文案|视频|短剧|内容包|patch/i.test(text);
  if (hasProductionIntent) return false;
  return /[?？]$/.test(text) || /^(为什么|怎么|如何|是否|能不能|可以吗|啥|什么|where|why|how|what|can|could|should)\b/i.test(text);
}

function instructionField(instruction: string, field: string) {
  const match = instruction.match(new RegExp(`${field}:\\s*([^\\n]+)`, 'i'));
  return match?.[1]?.trim();
}

export function videoSpecFromInstruction(req: AgentRunRequest) {
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

export function buildSkillSection(workflow: WorkflowKind) {
  const skill = getRuntimeSkillDetail(workflow);
  if (!skill) return '当前没有选中的专项 skill。';
  return JSON.stringify(skill, null, 2);
}

function compactHistory(req: AgentRunRequest) {
  return req.history.slice(-6).map((message) => ({
    role: message.role,
    content: message.content.slice(0, 1200)
  }));
}

export function buildSystemPrompt(req: AgentRunRequest, opts: { tools: ToolSchema[] }) {
  const workflow = inferWorkflow(req);
  const toolNames = opts.tools.map((tool) => tool.name).join(', ');
  const genreSection = genreSkillSection(genreSkillPlan(req.genre, req.productionStage));
  return `你是 VideoAgent Code 的真 agent runtime，不是一次性 JSON 生成器。

${OUTPUT_LANGUAGE_POLICY}

当前用户指令:
${req.instruction}

当前 workflow:
${workflow}
${defaultWorkflowRules[workflow]}

项目元信息:
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

最近历史:
${JSON.stringify(compactHistory(req), null, 2)}

可用 skill 清单:
${JSON.stringify(listSkillManifests(), null, 2)}

当前选中 skill 详情:
${buildSkillSection(workflow)}
${genreSection ? `\n片种技能:\n${genreSection}\n` : ''}
AI Native 产品模型:
- Mission：用户给出业务或内容目标。
- Context Stack：profile、brief、爆款参考、平台规则、素材库、campaign goal 和 memory。
- Agent Runtime 分两层：垂直场景 SubAgent 判断片种和制作上下文；横向生产 Agent 负责方向、Brief、参考、场景、脚本、分镜、剪辑、提示词、平台适配、合规、反馈和 Review。
- 视频生产交接：先产出可编辑制作包，再准备视频生成任务。
- 审批：持久写入必须以完整文件 patch 提交，并等待用户批准。

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

工具使用纪律:
- 可用工具: ${toolNames}
- 你必须先用 list_files 了解 workspace，再按需 read_file 或 read_skill。不要要求系统把全量文件塞进 prompt。
- 需要产出或修改资产时，只能调用 write_file。write_file 只生成待审批 PatchOperation，不会直接落盘。
- 写入前后内容必须是完整文件内容，不是 diff 片段。
- 生产类任务至少要写入一个核心资产文件；脚本类任务优先写 script.md，视频任务同时考虑 storyboard.json、timeline.json、asset_prompts.json。
- 需要风险判断时调用 run_compliance。
- 除非 render_video 工具真实成功，不得声称已经生成真实 MP4、图片或外部发布。
- 不得虚构 CTR、ROI、投放金额、平台表现或未提供的数据。
- 工具完成后，基于 tool_result 决定下一步；不要把工具调用写成普通文字。
- 当你已经完成必要工具调用后，最终回复用简体中文总结本轮真实完成了什么、还需要用户审查什么。`;
}
