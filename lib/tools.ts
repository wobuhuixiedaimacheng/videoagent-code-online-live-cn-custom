import { clampToolResult } from './contextCompact';
import { runSubagent } from './subagent';
import { listSkillManifests } from './workspace';
import { getRuntimeSkillDetail } from './skillRuntime';
import { getLocalSkillBody, loadLocalSkills } from './localSkills';
import { frameSizeFromSpec } from './videoFrameSize';
import type { LoopContext } from './agentLoop';
import type { AIGCAgentId, ComplianceCheck, PatchOperation, ToolEvent, WorkflowKind } from './types';
import type { ModelToolCall, ToolResult, ToolSchema } from './loopTypes';

type ToolHandler = (args: Record<string, unknown>, ctx: LoopContext) => Promise<ToolResult>;

function uid(prefix = 'tool') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function asRisk(value: unknown): PatchOperation['riskLevel'] {
  return ['low', 'medium', 'high'].includes(String(value)) ? (String(value) as PatchOperation['riskLevel']) : 'low';
}

function pushToolEvent(ctx: LoopContext, event: Omit<ToolEvent, 'id'>) {
  ctx.toolEvents.push({ id: uid(), ...event });
}

function currentFile(ctx: LoopContext, path: string) {
  const patch = [...ctx.patches].reverse().find((item) => item.filePath === path);
  if (patch) return patch.after;
  return ctx.req.workspace.files.find((file) => file.path === path)?.content || '';
}

function parseWorkflow(value: unknown, fallback: WorkflowKind): WorkflowKind {
  const text = String(value || fallback);
  const known: WorkflowKind[] = [
    'generate',
    'rewrite',
    'weekly',
    'brand',
    'viral_ref',
    'topic',
    'scene',
    'script',
    'shot',
    'prompt',
    'motion_director',
    'platform',
    'compliance',
    'approval',
    'competitor',
    'hotspot',
    'titles',
    'cta',
    'live_clip',
    'image_note',
    'ad_variants',
    'multiplatform',
    'calendar'
  ];
  return known.includes(text as WorkflowKind) ? (text as WorkflowKind) : fallback;
}

function parseAgentId(value: unknown): AIGCAgentId {
  const text = String(value || 'orchestrator');
  const known: AIGCAgentId[] = [
    'orchestrator',
    'creative_director',
    'brief',
    'viral_ref',
    'scene',
    'script',
    'shot',
    'editor',
    'prompt',
    'platform',
    'compliance',
    'data',
    'review'
  ];
  return known.includes(text as AIGCAgentId) ? (text as AIGCAgentId) : 'orchestrator';
}

function videoConfig() {
  const apiKey = process.env.VIDEO_API_KEY || process.env.CUSTOM_API_KEY || '';
  const baseUrl = (process.env.VIDEO_BASE_URL || process.env.CUSTOM_BASE_URL || 'https://apihub.agnes-ai.com/v1').replace(/\/$/, '');
  const model = process.env.VIDEO_MODEL || 'agnes-video-v2.0';
  return { apiKey, baseUrl, model };
}

function redact(text: string) {
  const { apiKey } = videoConfig();
  return apiKey ? text.replaceAll(apiKey, '[redacted]') : text;
}

const sizeFromSpec = frameSizeFromSpec;

function firstString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return firstString(value[0]);
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return firstString(object.url || object.video_url || object.output_url || object.file_url);
  }
  return '';
}

function normalizeVideoResponse(raw: unknown) {
  const value = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const data = value.data && typeof value.data === 'object' ? (value.data as Record<string, unknown>) : {};
  const output = value.output && typeof value.output === 'object' ? (value.output as Record<string, unknown>) : {};
  const videoUrl = firstString(
    value.videoUrl ||
      value.video_url ||
      value.url ||
      value.output_url ||
      value.remixed_from_video_id ||
      data.videoUrl ||
      data.video_url ||
      data.url ||
      output.videoUrl ||
      output.video_url ||
      output.url
  );

  return {
    ok: true,
    task_id: String(value.task_id || value.taskId || data.task_id || ''),
    video_id: String(value.video_id || value.videoId || data.video_id || ''),
    status: String(value.status || data.status || (videoUrl ? 'completed' : 'submitted')),
    progress: Number(value.progress ?? data.progress ?? (videoUrl ? 100 : 0)),
    videoUrl,
    raw: value
  };
}

async function listFiles(_args: Record<string, unknown>, ctx: LoopContext): Promise<ToolResult> {
  const files = ctx.req.workspace.files.map((file) => ({ path: file.path, version: file.version, kind: file.kind }));
  pushToolEvent(ctx, {
    toolName: 'list_files',
    status: 'success',
    title: '读取文件清单',
    summary: `已读取 ${files.length} 个 workspace 文件`
  });
  return { ok: true, status: 'success', content: JSON.stringify(files, null, 2), data: files };
}

async function readFile(args: Record<string, unknown>, ctx: LoopContext): Promise<ToolResult> {
  const path = asString(args.path).trim();
  if (!path) {
    pushToolEvent(ctx, { toolName: 'read_file', status: 'failed', title: '读取文件失败', summary: '缺少 path' });
    return { ok: false, status: 'failed', content: 'read_file requires path' };
  }
  const file = ctx.req.workspace.files.find((item) => item.path === path);
  const content = currentFile(ctx, path);
  const clamped = clampToolResult(content, ctx.budget);
  pushToolEvent(ctx, {
    toolName: 'read_file',
    status: file ? (clamped.length < content.length ? 'warning' : 'success') : 'warning',
    title: `读取 ${path}`,
    summary: file ? (clamped.length < content.length ? '文件内容过长，已压缩返回' : '已读取文件内容') : 'workspace 中没有这个文件'
  });
  return {
    ok: Boolean(file),
    status: file ? 'success' : 'warning',
    content: JSON.stringify({ path, content: clamped, truncated: clamped.length < content.length }, null, 2),
    data: { path, content: clamped }
  };
}

/** 找不到目标时回给模型的东西：workflow 清单 + 技能库索引，让它知道还能读什么，而不是干瞪眼重试。 */
function skillDiscoveryIndex() {
  return {
    workflowSkills: listSkillManifests(),
    librarySkills: loadLocalSkills().map((skill) => ({
      skillId: skill.id,
      name: skill.name,
      stage: skill.stage,
      description: skill.description
    }))
  };
}

async function readSkill(args: Record<string, unknown>, ctx: LoopContext): Promise<ToolResult> {
  const skillId = asString(args.skillId).trim();

  // 带 skillId 就是读技能库正文（片种路由给出的候选走这条路），否则还是按 workflow 读内建 skill。
  if (skillId) {
    const loaded = getLocalSkillBody(skillId);
    if (!loaded) {
      pushToolEvent(ctx, {
        toolName: 'read_skill',
        status: 'warning',
        title: `读取技能库 ${skillId}`,
        summary: '技能库里没有这个 skillId，已返回可用技能索引'
      });
      const index = skillDiscoveryIndex();
      return { ok: false, status: 'warning', content: JSON.stringify(index, null, 2), data: index };
    }
    const clamped = clampToolResult(loaded.body, ctx.budget);
    const truncated = clamped.length < loaded.body.length;
    pushToolEvent(ctx, {
      toolName: 'read_skill',
      status: truncated ? 'warning' : 'success',
      title: `读取技能库「${loaded.skill.name}」`,
      summary: truncated ? '技能正文过长，已压缩返回' : `${loaded.skill.packTitle} / ${loaded.skill.stage} 已按需展开`
    });
    const data = {
      skillId: loaded.skill.id,
      name: loaded.skill.name,
      stage: loaded.skill.stage,
      description: loaded.skill.description,
      repo: loaded.skill.repo,
      license: loaded.skill.license,
      instructions: clamped,
      truncated
    };
    return { ok: true, status: 'success', content: JSON.stringify(data, null, 2), data };
  }

  const workflow = parseWorkflow(args.workflow, ctx.workflow);
  const detail = getRuntimeSkillDetail(workflow);
  pushToolEvent(ctx, {
    toolName: 'read_skill',
    status: detail ? 'success' : 'warning',
    title: `读取 ${workflow} skill`,
    summary: detail ? `${detail.title} 已按需展开` : '未找到对应 skill，返回 skill 清单'
  });
  const fallback = skillDiscoveryIndex();
  return {
    ok: Boolean(detail),
    status: detail ? 'success' : 'warning',
    content: JSON.stringify(detail || fallback, null, 2),
    data: detail || fallback
  };
}

async function writeFile(args: Record<string, unknown>, ctx: LoopContext): Promise<ToolResult> {
  const path = asString(args.path || args.filePath).trim();
  const after = asString(args.after);
  if (!path || !after.trim()) {
    pushToolEvent(ctx, {
      toolName: 'write_file',
      status: 'failed',
      title: '生成 patch 失败',
      summary: 'write_file 需要 path 和完整 after 内容'
    });
    return { ok: false, status: 'failed', content: 'write_file requires path and full after content' };
  }
  const patch: PatchOperation = {
    id: uid('patch'),
    filePath: path,
    summary: asString(args.summary, `更新 ${path}`),
    before: currentFile(ctx, path),
    after,
    riskLevel: asRisk(args.riskLevel),
    requiresApproval: true
  };
  if (patch.before === patch.after) {
    pushToolEvent(ctx, {
      toolName: 'write_file',
      status: 'warning',
      title: `跳过 ${path}`,
      summary: 'after 与当前内容一致，没有生成 patch'
    });
    return { ok: true, status: 'warning', content: JSON.stringify({ skipped: true, path }, null, 2) };
  }
  ctx.patches.push(patch);
  pushToolEvent(ctx, {
    toolName: 'write_file',
    status: 'approval_required',
    title: `准备 ${path} patch`,
    summary: patch.summary
  });
  return { ok: true, status: 'approval_required', content: JSON.stringify({ patchId: patch.id, filePath: path }, null, 2), data: patch };
}

function complianceChecksFor(ctx: LoopContext, paths: string[]): ComplianceCheck[] {
  const targetPaths = paths.length ? paths : ctx.patches.map((patch) => patch.filePath);
  const text = targetPaths.map((path) => `${path}\n${currentFile(ctx, path)}`).join('\n\n');
  const checks: ComplianceCheck[] = [];
  const absoluteClaim = /保证|一定|全网最低|稳赚|快速瘦身|治愈|疗效|100%|百分百/.test(text);
  checks.push({
    id: uid('check'),
    type: 'marketing_claim',
    status: absoluteClaim ? 'warning' : 'pass',
    message: absoluteClaim ? '发现可能的绝对化、疗效或夸大承诺，需要人工改写。' : '未发现明显绝对化营销承诺。'
  });
  const renderedClaim = /已生成.*(MP4|视频文件|成片)|已经渲染|视频已完成/.test(text);
  checks.push({
    id: uid('check'),
    type: 'platform_policy',
    status: renderedClaim ? 'blocked' : 'pass',
    message: renderedClaim ? '内容声称已生成或渲染真实视频，但 render_video 未成功证明，必须删除。' : '未发现虚构真实渲染完成的表述。'
  });
  checks.push({
    id: uid('check'),
    type: 'asset_rights',
    status: /名人|真人声音|竞品画面|未授权/.test(text) ? 'warning' : 'pass',
    message: /名人|真人声音|竞品画面|未授权/.test(text)
      ? '涉及人物、声音、竞品或授权素材，需要人工确认权利边界。'
      : '未发现明显授权风险关键词。'
  });
  return checks;
}

async function runCompliance(args: Record<string, unknown>, ctx: LoopContext): Promise<ToolResult> {
  const paths = Array.isArray(args.paths) ? args.paths.map(String).filter(Boolean) : [];
  const checks = complianceChecksFor(ctx, paths);
  ctx.compliance.push(...checks);
  const blocked = checks.some((check) => check.status === 'blocked');
  const warning = checks.some((check) => check.status === 'warning');
  pushToolEvent(ctx, {
    toolName: 'run_compliance',
    status: blocked ? 'blocked' : warning ? 'warning' : 'success',
    title: '运行合规检查',
    summary: blocked ? '发现阻断项' : warning ? '发现需要人工确认的风险' : '基础合规检查通过'
  });
  return { ok: !blocked, status: blocked ? 'blocked' : warning ? 'warning' : 'success', content: JSON.stringify(checks, null, 2), data: checks };
}

async function renderVideo(args: Record<string, unknown>, ctx: LoopContext): Promise<ToolResult> {
  const { apiKey, baseUrl, model } = videoConfig();
  if (!apiKey) {
    pushToolEvent(ctx, {
      toolName: 'render_video',
      status: 'failed',
      title: '视频渲染未提交',
      summary: '缺少 VIDEO_API_KEY，不能声称已生成真实视频'
    });
    return { ok: false, status: 'failed', content: 'VIDEO_API_KEY is required before submitting video generation.' };
  }
  const prompt = asString(args.prompt).trim();
  if (!prompt) {
    pushToolEvent(ctx, { toolName: 'render_video', status: 'failed', title: '视频渲染未提交', summary: '缺少 prompt' });
    return { ok: false, status: 'failed', content: 'prompt is required' };
  }
  const spec = args.spec && typeof args.spec === 'object' ? (args.spec as Record<string, unknown>) : {};
  const size = sizeFromSpec(spec);
  pushToolEvent(ctx, { toolName: 'render_video', status: 'running', title: '提交视频渲染', summary: '正在调用视频生成接口' });
  try {
    const response = await fetch(`${baseUrl}/videos`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        prompt,
        negative_prompt: asString(args.negativePrompt) || undefined,
        width: size.width,
        height: size.height,
        num_frames: Number(spec.numFrames || spec.num_frames || 121),
        frame_rate: Number(spec.frameRate || spec.frame_rate || 24)
      })
    });
    const text = await response.text();
    const json = text ? JSON.parse(text) : {};
    if (!response.ok) {
      const message = typeof json?.error === 'string' ? json.error : JSON.stringify(json || {}).slice(0, 500);
      pushToolEvent(ctx, { toolName: 'render_video', status: 'failed', title: '视频渲染失败', summary: redact(message || `Video API error ${response.status}`) });
      return { ok: false, status: 'failed', content: redact(message || `Video API error ${response.status}`) };
    }
    const normalized = normalizeVideoResponse(json);
    pushToolEvent(ctx, {
      toolName: 'render_video',
      status: 'success',
      title: '视频渲染已提交',
      summary: normalized.videoUrl ? '视频接口返回了可用 URL' : '视频任务已提交，等待后续轮询'
    });
    return { ok: true, status: 'success', content: JSON.stringify(normalized, null, 2), data: normalized };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    pushToolEvent(ctx, { toolName: 'render_video', status: 'failed', title: '视频渲染失败', summary: redact(message) });
    return { ok: false, status: 'failed', content: redact(message) };
  }
}

async function spawnSubagent(args: Record<string, unknown>, ctx: LoopContext): Promise<ToolResult> {
  const role = parseAgentId(args.role);
  const task = asString(args.task, '完成当前 workflow 的专项审查和产出建议');
  const result = await runSubagent(role, task, ctx);
  ctx.agentEvents.push({
    id: uid('agent'),
    agentId: result.agentId,
    agentName: result.agentName,
    status: result.status,
    action: task,
    output: result.output
  });
  pushToolEvent(ctx, {
    toolName: 'spawn_subagent',
    status: result.status,
    title: `运行 ${result.agentName}`,
    summary: result.output.slice(0, 180)
  });
  return { ok: result.status !== 'blocked', status: result.status, content: JSON.stringify(result, null, 2), data: result };
}

export const TOOL_HANDLERS: Record<string, ToolHandler> = {
  list_files: listFiles,
  read_file: readFile,
  read_skill: readSkill,
  write_file: writeFile,
  run_compliance: runCompliance,
  render_video: renderVideo,
  spawn_subagent: spawnSubagent
};

export const READ_ONLY_TOOLS = new Set(['list_files', 'read_file', 'read_skill']);

export const TOOL_SCHEMAS: ToolSchema[] = [
  {
    name: 'list_files',
    description: '列出当前内存 workspace 的文件路径、版本和类型。只读。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'read_file',
    description: '读取当前内存 workspace 中的单个文件内容。只读，结果可能按预算压缩。',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'workspace 文件路径，例如 script.md' } },
      required: ['path'],
      additionalProperties: false
    }
  },
  {
    name: 'read_skill',
    description:
      '读取 skill 全文。只读。给 skillId 就读技能库里的候选技能（片种候选清单里那些），给 workflow 就读当前 workflow 的内建 skill；两个都不给会返回可用技能索引。',
    inputSchema: {
      type: 'object',
      properties: {
        workflow: { type: 'string', description: 'WorkflowKind，例如 script、scene、prompt、motion_director、calendar' },
        skillId: {
          type: 'string',
          description: '技能库 skillId，例如 lanshu-video-kit/skills/kling-prompter。优先于 workflow。'
        }
      },
      additionalProperties: false
    }
  },
  {
    name: 'write_file',
    description: '生成完整文件 patch。不会直接落盘，用户批准后才写入 workspace。',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        after: { type: 'string', description: '完整的新文件内容，不是 diff' },
        summary: { type: 'string' },
        riskLevel: { type: 'string', enum: ['low', 'medium', 'high'] }
      },
      required: ['path', 'after', 'summary'],
      additionalProperties: false
    }
  },
  {
    name: 'run_compliance',
    description: '对已读取或已准备 patch 的资产做基础合规检查。',
    inputSchema: {
      type: 'object',
      properties: { paths: { type: 'array', items: { type: 'string' } } },
      additionalProperties: false
    }
  },
  {
    name: 'render_video',
    description: '调用真实视频生成接口提交渲染任务。只有成功返回后才能声称已提交真实视频任务。',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string' },
        negativePrompt: { type: 'string' },
        spec: { type: 'object', additionalProperties: true }
      },
      required: ['prompt'],
      additionalProperties: false
    }
  },
  {
    name: 'spawn_subagent',
    description: '为一个窄任务运行隔离上下文的专项 agent，并把真实输出带回父 loop。',
    inputSchema: {
      type: 'object',
      properties: {
        role: {
          type: 'string',
          enum: ['orchestrator', 'creative_director', 'brief', 'viral_ref', 'scene', 'script', 'shot', 'editor', 'prompt', 'platform', 'compliance', 'data', 'review']
        },
        task: { type: 'string' }
      },
      required: ['role', 'task'],
      additionalProperties: false
    }
  }
];

async function runTool(call: ModelToolCall, ctx: LoopContext): Promise<ToolResult> {
  const handler = TOOL_HANDLERS[call.name];
  if (!handler) {
    pushToolEvent(ctx, {
      toolName: call.name,
      status: 'failed',
      title: `未知工具 ${call.name}`,
      summary: '模型请求了未注册工具'
    });
    return { ok: false, status: 'failed', content: `Unknown tool: ${call.name}` };
  }
  try {
    return await handler(call.args || {}, ctx);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    pushToolEvent(ctx, {
      toolName: call.name,
      status: 'failed',
      title: `${call.name} 执行失败`,
      summary: message.slice(0, 240)
    });
    return { ok: false, status: 'failed', content: message };
  }
}

export async function executeToolCalls(toolCalls: ModelToolCall[], ctx: LoopContext) {
  const results = new Map<string, ToolResult>();
  const readonly = toolCalls
    .filter((call) => READ_ONLY_TOOLS.has(call.name))
    .map(async (call) => {
      results.set(call.id, await runTool(call, ctx));
    });

  let sideEffects = Promise.resolve();
  for (const call of toolCalls.filter((item) => !READ_ONLY_TOOLS.has(item.name))) {
    sideEffects = sideEffects.then(async () => {
      results.set(call.id, await runTool(call, ctx));
    });
  }

  await Promise.all([...readonly, sideEffects]);
  return toolCalls.map((call) => ({
    call,
    result: results.get(call.id) || { ok: false, status: 'failed' as const, content: 'Tool did not return a result' }
  }));
}
