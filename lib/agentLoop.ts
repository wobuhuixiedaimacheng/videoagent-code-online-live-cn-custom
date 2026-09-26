import { autoCompact, clampToolResult, createTokenBudget, microCompact } from './contextCompact';
import { callModel } from './modelGateway';
import { buildSystemPrompt, defaultWorkflowRules, inferWorkflow, isPureQuestion } from './prompt';
import { executeToolCalls, TOOL_SCHEMAS } from './tools';
import { agentRoster, inferFileKind, missionAssetsFromWorkspace } from './workspace';
import type {
  AgentEvent,
  AgentRunRequest,
  AgentRunResponse,
  ComplianceCheck,
  MissionAsset,
  PatchOperation,
  PreviewScene,
  PreviewState,
  ToolEvent,
  WorkflowKind,
  WorkspaceSnapshot
} from './types';
import type { ModelMessage, ModelProvider, ModelTurn, TokenBudget } from './loopTypes';

export type LoopContext = {
  req: AgentRunRequest;
  workflow: WorkflowKind;
  messages: ModelMessage[];
  patches: PatchOperation[];
  toolEvents: ToolEvent[];
  agentEvents: AgentEvent[];
  compliance: ComplianceCheck[];
  budget: TokenBudget;
  provider: AgentRunResponse['provider'];
  plan: string[];
  notes: string[];
};

function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function agentName(agentId: AgentEvent['agentId']) {
  return agentRoster.find((agent) => agent.id === agentId)?.name || agentId;
}

function workflowTitle(workflow: WorkflowKind) {
  return workflow === 'generate' ? '新建 AIGC 内容包' : defaultWorkflowRules[workflow];
}

function parseJson<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T;
  } catch (_) {
    return fallback;
  }
}

function normalizeScenes(value: unknown, fallback: PreviewScene[]): PreviewScene[] {
  if (!Array.isArray(value)) return fallback;
  const scenes = value
    .map((scene, index) => {
      const item = scene as Record<string, unknown>;
      return {
        id: String(item.id || `scene_${index + 1}`),
        title: String(item.title || item.narration || `Scene ${index + 1}`),
        visual: String(item.visual || '待生成画面建议'),
        subtitle: String(item.subtitle || item.role || '待生成字幕'),
        durationSeconds: Number(item.durationSeconds || Math.max(3, Number(item.end || 0) - Number(item.start || 0) || 6))
      };
    })
    .filter((scene) => scene.title.trim() || scene.visual.trim());
  return scenes.length ? scenes : fallback;
}

function patchedWorkspace(ctx: LoopContext): WorkspaceSnapshot {
  const files = [...ctx.req.workspace.files];
  for (const patch of ctx.patches) {
    const index = files.findIndex((file) => file.path === patch.filePath);
    const nextFile = {
      path: patch.filePath,
      kind: index >= 0 ? files[index].kind : inferFileKind(patch.filePath),
      content: patch.after,
      version: (index >= 0 ? files[index].version : 0) + 1,
      updatedAt: new Date().toISOString()
    };
    if (index >= 0) files[index] = nextFile;
    else files.push(nextFile);
  }
  return {
    ...ctx.req.workspace,
    files,
    activeWorkflow: ctx.workflow,
    currentTimelineVersion: ctx.req.workspace.currentTimelineVersion + (ctx.patches.length ? 1 : 0),
    complianceStatus: ctx.compliance.some((check) => check.status === 'blocked')
      ? 'blocked'
      : ctx.compliance.some((check) => check.status === 'warning')
        ? 'warning'
        : ctx.req.workspace.complianceStatus
  };
}

function scenesFrom(ctx: LoopContext) {
  const workspace = patchedWorkspace(ctx);
  const scenesFile = parseJson<{ scenes?: unknown[] }>(workspace.files.find((file) => file.path === 'scenes.json')?.content || '', { scenes: [] });
  const storyboard = parseJson<{ scenes?: unknown[] }>(workspace.files.find((file) => file.path === 'storyboard.json')?.content || '', { scenes: [] });
  return normalizeScenes(scenesFile.scenes, normalizeScenes(storyboard.scenes, []));
}

function assetsFrom(ctx: LoopContext): MissionAsset[] {
  if (!ctx.patches.length) return missionAssetsFromWorkspace(ctx.req.workspace);
  const workspace = patchedWorkspace(ctx);
  const assets = missionAssetsFromWorkspace(workspace);
  const patchAssets = ctx.patches.map((patch): MissionAsset => ({
    id: uid('asset'),
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
              : patch.filePath.includes('storyboard')
                ? 'shot'
                : patch.filePath.includes('publish')
                  ? 'copy'
                  : patch.filePath.includes('brief')
                    ? 'brief'
                    : 'script',
    title: patch.filePath,
    status: patch.riskLevel === 'high' ? 'warning' : 'ready',
    filePath: patch.filePath,
    summary: patch.summary
  }));
  const merged = new Map<string, MissionAsset>();
  [...assets, ...patchAssets].forEach((asset) => merged.set(asset.filePath + asset.title, asset));
  return Array.from(merged.values());
}

function previewFrom(ctx: LoopContext): PreviewState {
  const scenes = scenesFrom(ctx);
  return {
    title: workflowTitle(ctx.workflow),
    subtitle: ctx.patches.length ? '真 agent loop 已通过工具生成待审批资产' : '真 agent loop 已运行，但本轮没有生成 patch',
    cta: ctx.patches.length ? '审查并批准写入' : '补充目标或重试',
    durationSeconds: scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0) || 38,
    timelineVersion: ctx.req.workspace.currentTimelineVersion + (ctx.patches.length ? 1 : 0),
    platform: ctx.req.workspace.mode === 'smb' ? '抖音 / 小红书' : '小红书 / 抖音 / TikTok',
    mode: ctx.req.workspace.mode,
    workflow: ctx.workflow,
    scenes
  };
}

function defaultAgentEvents(ctx: LoopContext): AgentEvent[] {
  if (ctx.agentEvents.length) return ctx.agentEvents;
  const agentIds: AgentEvent['agentId'][] = ['orchestrator'];
  if (ctx.patches.some((patch) => patch.filePath.includes('brief') || patch.filePath.includes('campaign'))) agentIds.push('creative_director');
  if (ctx.patches.some((patch) => patch.filePath.includes('script'))) agentIds.push('script');
  if (ctx.patches.some((patch) => patch.filePath.includes('storyboard'))) agentIds.push('shot');
  if (ctx.patches.some((patch) => patch.filePath.includes('timeline'))) agentIds.push('editor');
  if (ctx.patches.some((patch) => patch.filePath.includes('asset_prompts'))) agentIds.push('prompt');
  if (ctx.compliance.length) agentIds.push('compliance');
  agentIds.push('review');
  return Array.from(new Set(agentIds)).map((agentId, index) => ({
    id: uid('agent'),
    agentId,
    agentName: agentName(agentId),
    status: index === agentIds.length - 1 && ctx.patches.length ? 'pending' : 'success',
    action: agentId === 'review' ? '等待用户审查并批准 patch' : `根据真实工具结果执行 ${agentName(agentId)} 任务`,
    output: agentId === 'review' ? undefined : `${agentName(agentId)} 的可见状态来自本轮工具调用和 patch`
  }));
}

function assembleResponse(ctx: LoopContext, final?: ModelTurn): AgentRunResponse {
  const fallbackMessage = ctx.patches.length
    ? `真 agent loop 已完成 ${ctx.patches.length} 个待审批 patch。请先审查再写入。`
    : isPureQuestion(ctx.req)
      ? '真 agent loop 已完成上下文读取并回答问题。'
      : '真 agent loop 已运行，但模型没有调用 write_file 生成可审批资产。请缩小任务或重试。';
  const checks = ctx.compliance.length
    ? ctx.compliance
    : [
        {
          id: uid('check'),
          type: 'marketing_claim' as const,
          status: 'warning' as const,
          message: '本轮未运行完整合规检查，请人工确认营销承诺和素材授权。'
        }
      ];
  return {
    mode: ctx.provider === 'mock' ? 'mock' : 'live',
    provider: ctx.provider,
    assistantMessage: final?.content?.trim() || fallbackMessage,
    plan: ctx.plan.length ? ctx.plan : ['读取 workspace 文件清单', '按需读取上下文文件或 skill', '通过 write_file 生成待审批 patch', '运行合规检查', '等待用户批准写入'],
    toolEvents: ctx.toolEvents.length
      ? ctx.toolEvents
      : [
          {
            id: uid('tool'),
            toolName: 'agent_loop',
            status: 'failed',
            title: 'agent loop 未完成工具调用',
            summary: '模型调用失败或没有可用 provider'
          }
        ],
    agentEvents: defaultAgentEvents(ctx),
    assets: assetsFrom(ctx),
    patchOperations: ctx.patches,
    complianceChecks: checks,
    preview: previewFrom(ctx),
    notes: ctx.notes
  };
}

function providerFromTurn(turn: ModelTurn): ModelProvider {
  return turn.provider;
}

export async function agentLoop(req: AgentRunRequest): Promise<AgentRunResponse> {
  const workflow = inferWorkflow(req);
  const budget = createTokenBudget();
  const ctx: LoopContext = {
    req,
    workflow,
    messages: [],
    patches: [],
    toolEvents: [],
    agentEvents: [],
    compliance: [],
    budget,
    provider: 'mock',
    plan: ['读取 workspace 文件清单', '按需读取上下文和 skill', '生成待审批资产 patch', '运行合规检查', '汇总给用户审查'],
    notes: ['AGENT_LOOP=1：当前响应来自真 agent loop。']
  };

  ctx.messages = [
    { role: 'system', content: buildSystemPrompt(req, { tools: TOOL_SCHEMAS }) },
    { role: 'user', content: req.instruction }
  ];

  const maxSteps = Math.max(2, Number(process.env.AGENT_MAX_STEPS || 12));
  let finalTurn: ModelTurn | undefined;

  for (let step = 0; step < maxSteps; step++) {
    ctx.messages = autoCompact(microCompact(ctx.messages), ctx.budget);
    let turn: ModelTurn;
    try {
      turn = await callModel(ctx.messages, TOOL_SCHEMAS, {
        preferredProvider: ctx.provider === 'mock' ? undefined : (ctx.provider as ModelProvider)
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.toolEvents.push({
        id: uid('tool'),
        toolName: 'call_model',
        status: 'failed',
        title: '模型调用失败',
        summary: message.slice(0, 240)
      });
      ctx.notes.push(`模型/provider 调用失败，已返回结构化错误而不是 500：${message.slice(0, 300)}`);
      return assembleResponse(ctx);
    }

    ctx.provider = providerFromTurn(turn);
    ctx.notes = ctx.notes.filter((note) => !note.startsWith('provider='));
    ctx.notes.push(`provider=${turn.provider}`);
    finalTurn = turn;
    ctx.messages.push({ role: 'assistant', content: turn.content, toolCalls: turn.toolCalls });

    if (!turn.toolCalls.length || turn.stopReason !== 'tool_use') break;

    const results = await executeToolCalls(turn.toolCalls, ctx);
    for (const { call, result } of results) {
      ctx.messages.push({
        role: 'tool',
        toolCallId: call.id,
        toolName: call.name,
        content: clampToolResult(result.content, ctx.budget)
      });
    }
  }

  if (finalTurn?.stopReason === 'tool_use') {
    ctx.toolEvents.push({
      id: uid('tool'),
      toolName: 'agent_loop',
      status: 'warning',
      title: '达到 agent loop 步数上限',
      summary: `已达到 AGENT_MAX_STEPS=${maxSteps}，返回当前已产生的真实工具结果`
    });
    ctx.notes.push('agent loop 达到步数上限，可能需要继续运行或缩小任务。');
  }

  return assembleResponse(ctx, finalTurn);
}
