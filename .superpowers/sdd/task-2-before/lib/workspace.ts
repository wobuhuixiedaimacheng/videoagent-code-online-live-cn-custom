import type {
  AgentDefinition,
  AgentEvent,
  AgentRunResponse,
  AIGCSkill,
  ComplianceCheck,
  ContextItem,
  MissionAsset,
  PatchOperation,
  PreviewScene,
  WorkflowKind,
  WorkspaceFile,
  WorkspaceMode,
  WorkspaceSnapshot
} from './types';

export type DiffRow = {
  kind: 'same' | 'remove' | 'add';
  text: string;
  key: string;
};

export type EntryCard = {
  workflow: WorkflowKind;
  title: string;
  shortTitle: string;
  description: string;
  command: string;
  accent: string;
};

export function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function now() {
  return new Date().toISOString();
}

export function diffLines(before: string, after: string): DiffRow[] {
  const a = before.split('\n');
  const b = after.split('\n');
  const rows: DiffRow[] = [];
  const max = Math.max(a.length, b.length);

  for (let i = 0; i < max; i++) {
    if (a[i] === b[i]) rows.push({ kind: 'same', text: a[i] || '', key: `s-${i}` });
    else {
      if (a[i] !== undefined) rows.push({ kind: 'remove', text: a[i], key: `r-${i}` });
      if (b[i] !== undefined) rows.push({ kind: 'add', text: b[i], key: `a-${i}` });
    }
  }

  return rows
    .filter((row, index, all) => {
      if (row.kind !== 'same') return true;
      return all[index - 1]?.kind !== 'same' || all[index + 1]?.kind !== 'same';
    })
    .slice(0, 140);
}

export function inferFileKind(path: string): WorkspaceFile['kind'] {
  if (path.endsWith('.md')) return 'markdown';
  if (path.includes('asset')) return 'asset';
  if (path.endsWith('.json')) return 'json';
  return 'config';
}

export function applyPatchToWorkspace(
  workspace: WorkspaceSnapshot,
  patches: PatchOperation[],
  status: WorkspaceSnapshot['complianceStatus']
): WorkspaceSnapshot {
  const files = [...workspace.files];

  for (const patch of patches) {
    const index = files.findIndex((file) => file.path === patch.filePath);
    const previous = files[index];
    const nextFile: WorkspaceFile = {
      path: patch.filePath,
      kind: previous?.kind || inferFileKind(patch.filePath),
      content: patch.after,
      version: (previous?.version || 0) + 1,
      updatedAt: now()
    };
    if (index >= 0) files[index] = nextFile;
    else files.push(nextFile);
  }

  const nextTimelineVersion = workspace.currentTimelineVersion + (patches.length ? 1 : 0);

  return {
    ...workspace,
    branch: `draft/v${nextTimelineVersion}`,
    currentTimelineVersion: nextTimelineVersion,
    complianceStatus: status,
    files
  };
}

export function overallStatus(result: AgentRunResponse | null): WorkspaceSnapshot['complianceStatus'] {
  if (!result) return 'warning';
  if (result.complianceChecks.some((check) => check.status === 'blocked')) return 'blocked';
  if (result.complianceChecks.some((check) => check.status === 'warning')) return 'warning';
  return 'pass';
}

export const agentRoster: AgentDefinition[] = [
  {
    id: 'orchestrator',
    name: 'Orchestrator',
    role: '任务编排',
    description: '理解目标、读取上下文、先选择场景类型 Agent，再编排横向生产流水线。',
    accent: 'green'
  },
  {
    id: 'creative_director',
    name: 'Creative Director Agent',
    role: '创意方向',
    description: '确定传播角度、目标人群、内容张力、平台策略、成功标准和创作红线。',
    accent: 'dark'
  },
  {
    id: 'brief',
    name: 'Brief Agent',
    role: '品牌理解',
    description: '补全产品、受众、卖点、语气、禁用词和转化目标。',
    accent: 'blue'
  },
  {
    id: 'viral_ref',
    name: 'Viral Ref Agent',
    role: '爆款拆解',
    description: '抽取参考内容的 Hook、结构、情绪和转化路径。',
    accent: 'amber'
  },
  {
    id: 'scene',
    name: 'Scene Agent',
    role: '场景拆解',
    description: '把内容拆成 Hook、痛点、证明、卖点、信任和 CTA。',
    accent: 'green'
  },
  {
    id: 'script',
    name: 'Script Agent',
    role: '文案叙事',
    description: '生成 Hook、口播、字幕、标题、封面文案、CTA 和改稿版本。',
    accent: 'blue'
  },
  {
    id: 'shot',
    name: 'Shot Agent',
    role: '视觉画面',
    description: '输出画面结构、镜头、动作、构图、人物状态和素材需求。',
    accent: 'dark'
  },
  {
    id: 'editor',
    name: 'Editing Agent',
    role: '剪辑节奏',
    description: '拆解前 3 秒、节奏点、信息密度、停顿、转场和 CTA 出现时机。',
    accent: 'amber'
  },
  {
    id: 'prompt',
    name: 'Prompt Agent',
    role: '素材提示词',
    description: '为图片、视频、首图和 B-roll 生成提示词。',
    accent: 'amber'
  },
  {
    id: 'platform',
    name: 'Platform Agent',
    role: '平台适配',
    description: '适配小红书、抖音、TikTok、Instagram 的表达。',
    accent: 'blue'
  },
  {
    id: 'compliance',
    name: 'Compliance Agent',
    role: '品牌安全',
    description: '检查夸大宣传、敏感词、版权、肖像权、平台风险和品牌红线。',
    accent: 'red'
  },
  {
    id: 'data',
    name: 'Data Feedback Agent',
    role: '反馈学习',
    description: '记录人工选择、被拒原因、版本偏好和待验证假设，不虚构真实投放数据。',
    accent: 'blue'
  },
  {
    id: 'review',
    name: 'Review Agent',
    role: '审批写入',
    description: '汇总输出、指出弱点、生成可批准的项目变更。',
    accent: 'green'
  }
];

export const p0Skills: AIGCSkill[] = [
  {
    id: 'brand',
    tier: 'P0',
    title: '品牌理解',
    description: '读取产品、受众、语气、禁用词和卖点，建立上下文栈。',
    command: '/brand 读取当前产品和品牌记忆，补全受众、卖点、语气和禁用表达',
    agentIds: ['orchestrator', 'creative_director', 'brief'],
    outputFiles: ['profile.json', 'brief.json', '.aigc/MEMORY.md']
  },
  {
    id: 'viral_ref',
    tier: 'P0',
    title: '爆款拆解',
    description: '从参考内容拆出 Hook、结构、情绪、转化点。',
    command: '/viral 拆解当前爆款参考，提炼可复用结构，不直接搬运原文',
    agentIds: ['orchestrator', 'creative_director', 'viral_ref', 'review'],
    outputFiles: ['viral_refs.json', '.aigc/MEMORY.md']
  },
  {
    id: 'topic',
    tier: 'P0',
    title: '选题生成',
    description: '基于品牌和平台生成选题、角度、目标人群和 CTA。',
    command: '/topic 基于当前品牌和平台，生成 5 条可展开成短视频的选题',
    agentIds: ['orchestrator', 'creative_director', 'brief', 'viral_ref', 'platform', 'data'],
    outputFiles: ['publish_copy.json', 'campaign_goal.json']
  },
  {
    id: 'scene',
    tier: 'P0',
    title: '场景拆解',
    description: '把一条视频拆成 Hook / 痛点 / 证明 / 卖点 / CTA。',
    command: '/scene 把当前视频拆成 5 个场景，并标明每个场景的任务和输出资产',
    agentIds: ['orchestrator', 'creative_director', 'scene', 'script', 'shot', 'editor', 'compliance', 'data', 'review'],
    outputFiles: ['scenes.json', 'storyboard.json', 'timeline.json']
  },
  {
    id: 'script',
    tier: 'P0',
    title: '脚本生成',
    description: '生成口播、字幕、标题、封面文案和短视频正文。',
    command: '/script 基于当前场景生成口播、字幕、标题和封面文案',
    agentIds: ['orchestrator', 'creative_director', 'script', 'shot', 'editor', 'platform', 'compliance', 'data', 'review'],
    outputFiles: ['script.md', 'timeline.json', 'publish_copy.json']
  },
  {
    id: 'shot',
    tier: 'P0',
    title: '分镜生成',
    description: '生成镜头、动作、构图、节奏和素材需求。',
    command: '/shot 基于当前脚本生成分镜、画面、动作和镜头节奏',
    agentIds: ['orchestrator', 'creative_director', 'script', 'shot', 'editor', 'prompt', 'compliance', 'data', 'review'],
    outputFiles: ['storyboard.json', 'timeline.json', 'asset_prompts.json']
  },
  {
    id: 'prompt',
    tier: 'P0',
    title: '素材提示词',
    description: '为图片模型、视频模型、首图和 B-roll 输出提示词。',
    command: '/prompt 为每个场景生成图片和视频素材提示词，标记授权风险',
    agentIds: ['orchestrator', 'creative_director', 'shot', 'editor', 'prompt', 'compliance', 'data', 'review'],
    outputFiles: ['asset_prompts.json', 'timeline.json', 'compliance_report.json', 'feedback_report.json']
  },
  {
    id: 'platform',
    tier: 'P0',
    title: '平台适配',
    description: '把内容适配到小红书、抖音、TikTok、Instagram。',
    command: '/platform 把当前内容适配到小红书、抖音和 TikTok，分别生成标题和发布建议',
    agentIds: ['orchestrator', 'creative_director', 'script', 'editor', 'platform', 'compliance', 'data', 'review'],
    outputFiles: ['publish_copy.json', 'timeline.json', 'platform_rules.json', 'feedback_report.json']
  },
  {
    id: 'compliance',
    tier: 'P0',
    title: '合规检查',
    description: '检查夸大宣传、敏感词、版权、肖像权和平台风险。',
    command: '/compliance 检查当前内容的夸大表达、素材授权、平台风险和 AI 标识',
    agentIds: ['orchestrator', 'creative_director', 'compliance', 'review'],
    outputFiles: ['compliance_report.json']
  },
  {
    id: 'approval',
    tier: 'P0',
    title: '审批写入',
    description: '生成 patch，用户批准后才写入项目资产。',
    command: '/approval 汇总本次变更，生成可批准 patch，不要自动发布或覆盖外部文件',
    agentIds: ['orchestrator', 'data', 'review'],
    outputFiles: ['feedback_report.json', '.aigc/MEMORY.md']
  }
];

export const p1Skills: AIGCSkill[] = [
  {
    id: 'rewrite',
    tier: 'P1',
    title: '旧稿爆改',
    description: '诊断旧稿，保留真实细节，改掉硬广表达。',
    command: '/revise 把当前旧稿改成更像真实经验分享，保留可执行分镜',
    agentIds: ['orchestrator', 'creative_director', 'viral_ref', 'script', 'editor', 'platform', 'compliance'],
    outputFiles: ['script.md', 'storyboard.json', 'timeline.json', 'publish_copy.json']
  },
  {
    id: 'competitor',
    tier: 'P1',
    title: '竞品内容拆解',
    description: '拆竞品选题、结构、卖点和可借鉴表达。',
    command: '/competitor 拆解竞品内容结构，提炼可借鉴的选题、Hook 和 CTA',
    agentIds: ['orchestrator', 'creative_director', 'viral_ref', 'brief', 'review'],
    outputFiles: ['viral_refs.json', 'campaign_goal.json']
  },
  {
    id: 'hotspot',
    tier: 'P1',
    title: '热点追踪',
    description: '把热点转成适合品牌/账号的内容角度。',
    command: '/hotspot 基于当前品牌定位生成 5 个热点借势角度，避免硬蹭',
    agentIds: ['orchestrator', 'creative_director', 'brief', 'platform', 'compliance'],
    outputFiles: ['publish_copy.json', 'compliance_report.json']
  },
  {
    id: 'titles',
    tier: 'P1',
    title: '批量生成标题',
    description: '生成多平台标题、封面文案和 A/B 版本。',
    command: '/titles 为当前内容生成 20 个标题和封面文案，按平台分组',
    agentIds: ['orchestrator', 'script', 'platform'],
    outputFiles: ['publish_copy.json']
  },
  {
    id: 'cta',
    tier: 'P1',
    title: '评论区引流 CTA',
    description: '生成轻量、可信、不过度营销的转化动作。',
    command: '/cta 给当前内容生成评论区引流 CTA，避免夸大承诺和强推销',
    agentIds: ['orchestrator', 'script', 'compliance'],
    outputFiles: ['publish_copy.json', 'compliance_report.json']
  },
  {
    id: 'live_clip',
    tier: 'P1',
    title: '直播切片脚本',
    description: '把直播片段转成短视频切片结构。',
    command: '/liveclip 把直播片段整理成短视频切片脚本和标题',
    agentIds: ['orchestrator', 'scene', 'script', 'shot', 'editor'],
    outputFiles: ['scenes.json', 'script.md', 'storyboard.json', 'timeline.json']
  },
  {
    id: 'image_note',
    tier: 'P1',
    title: '图文笔记生成',
    description: '生成小红书图文笔记结构、首图文案和图片提示词。',
    command: '/note 把当前主题生成一篇小红书图文笔记，包含首图、正文和图片提示词',
    agentIds: ['orchestrator', 'script', 'prompt', 'platform'],
    outputFiles: ['script.md', 'asset_prompts.json', 'publish_copy.json']
  },
  {
    id: 'ad_variants',
    tier: 'P1',
    title: '广告素材变体',
    description: '生成不同人群、卖点、钩子的广告素材版本。',
    command: '/ads 基于当前卖点生成 6 个广告素材变体，区分人群和转化点',
    agentIds: ['orchestrator', 'brief', 'script', 'prompt', 'compliance'],
    outputFiles: ['script.md', 'asset_prompts.json', 'compliance_report.json']
  },
  {
    id: 'multiplatform',
    tier: 'P1',
    title: '多平台一键改写',
    description: '把同一内容改写成小红书、抖音、TikTok 版本。',
    command: '/multi 把当前内容改写成小红书、抖音和 TikTok 三个平台版本',
    agentIds: ['orchestrator', 'platform', 'script', 'review'],
    outputFiles: ['publish_copy.json', 'script.md']
  },
  {
    id: 'calendar',
    tier: 'P1',
    title: '内容日历',
    description: '生成一周/一月内容节奏和可展开任务队列。',
    command: '/calendar 生成一周内容日历，每天给目标、选题、形式和 CTA',
    agentIds: ['orchestrator', 'creative_director', 'brief', 'viral_ref', 'platform', 'data'],
    outputFiles: ['campaign_goal.json', 'publish_copy.json', 'feedback_report.json']
  }
];

export const allSkills = [...p0Skills, ...p1Skills];

export function getSkillByWorkflow(workflow: WorkflowKind) {
  return allSkills.find((skill) => skill.id === workflow);
}

export function listSkillManifests() {
  return allSkills.map((skill) => ({
    id: skill.id,
    title: skill.title,
    command: skill.command,
    tier: skill.tier
  }));
}

export function getSkillDetail(workflow: WorkflowKind) {
  return getSkillByWorkflow(workflow) || null;
}

export function fileBadge(path: string) {
  if (path.endsWith('.md')) return 'MD';
  if (path.includes('profile')) return 'DNA';
  if (path.includes('brief')) return 'BRF';
  if (path.includes('viral')) return 'REF';
  if (path.includes('campaign')) return 'GOAL';
  if (path.includes('scene')) return 'SCN';
  if (path.includes('storyboard')) return 'SHOT';
  if (path.includes('timeline')) return 'CUT';
  if (path.includes('asset')) return 'AST';
  if (path.includes('publish')) return 'PUB';
  if (path.includes('platform')) return 'RULE';
  if (path.includes('compliance')) return 'SAFE';
  if (path.includes('feedback')) return 'FB';
  if (path.endsWith('.json')) return '{}';
  return '·';
}

export function statusLabel(status: string) {
  const map: Record<string, string> = {
    pass: '通过',
    warning: '警告',
    blocked: '阻断',
    success: '成功',
    failed: '失败',
    running: '运行中',
    pending: '等待中',
    approval_required: '待批准',
    draft: '草稿',
    ready: '就绪',
    missing: '缺失',
    mock: '本地模式',
    anthropic: 'Anthropic',
    openai: 'OpenAI',
    custom: '自定义模型',
    creator: '创作者',
    smb: '小 B 商家',
    generate: '新建内容',
    rewrite: '旧稿爆改',
    weekly: '一周选题',
    brand: '品牌理解',
    viral_ref: '爆款拆解',
    topic: '选题生成',
    scene: '场景拆解',
    script: '脚本生成',
    shot: '分镜生成',
    prompt: '素材提示词',
    platform: '平台适配',
    compliance: '合规检查',
    approval: '审批写入',
    competitor: '竞品拆解',
    hotspot: '热点追踪',
    titles: '批量标题',
    cta: '评论区 CTA',
    live_clip: '直播切片',
    image_note: '图文笔记',
    ad_variants: '广告变体',
    multiplatform: '多平台改写',
    calendar: '内容日历'
  };
  return map[status] || status;
}

export function checkTypeLabel(type: ComplianceCheck['type']) {
  const map: Record<ComplianceCheck['type'], string> = {
    ai_disclosure: 'AI 标识',
    marketing_claim: '营销话术',
    asset_rights: '素材授权',
    likeness_rights: '肖像 / 声音授权',
    sensitive_industry: '敏感行业',
    platform_policy: '平台规则'
  };
  return map[type] || type;
}

export function workflowLabel(workflow: WorkflowKind) {
  return statusLabel(workflow);
}

export function modeLabel(mode: WorkspaceMode) {
  return statusLabel(mode);
}

export function assetStatusLabel(status: MissionAsset['status']) {
  return statusLabel(status);
}

export function agentStatusClass(status: AgentEvent['status']) {
  return `agent-${status}`;
}

export function entryCards(mode: WorkspaceMode): EntryCard[] {
  const target = mode === 'creator' ? '账号内容' : '产品/服务营销';
  return [
    {
      workflow: 'generate',
      title: '新建 AIGC 内容包',
      shortTitle: '新建内容',
      description: `输入一个想法、产品或活动，生成 ${target} 的脚本、分镜、素材提示词和发布文案。`,
      command:
        mode === 'creator'
          ? '/new 把我的内容想法生成短视频资产包，逐条拆场景，并输出素材提示词和发布文案'
          : '/new 把我的产品或服务卖点做成短视频资产包，语气真实可信，不要硬广',
      accent: 'green'
    },
    {
      workflow: 'rewrite',
      title: '旧稿 / 爆款结构改写',
      shortTitle: '旧稿爆改',
      description: '粘贴旧稿或描述爆款结构，Agent 先诊断问题，再给可批准改稿。',
      command:
        mode === 'creator'
          ? '/revise 这条稿子开头太像广告，帮我改成更像真实创作者经验分享，并保留可执行分镜'
          : '/revise 这条宣传稿太硬，帮我改得更像用户能听懂的场景化表达',
      accent: 'blue'
    },
    {
      workflow: 'weekly',
      title: '生成一周内容计划',
      shortTitle: '一周选题',
      description: '基于账号定位或品牌方向生成 7 条选题，每条都能继续展开成完整内容资产。',
      command:
        mode === 'creator'
          ? '/weekly 基于我的账号定位，生成一周小红书/抖音短视频选题，每条给角度和可展开脚本方向'
          : '/weekly 基于我的产品和服务，生成一周短视频营销选题，每条给目标客户、卖点角度和 CTA',
      accent: 'amber'
    }
  ];
}

export const pipelineSteps = [
  { path: 'profile.json', label: 'DNA' },
  { path: 'brief.json', label: 'Brief' },
  { path: 'viral_refs.json', label: 'Refs' },
  { path: 'scenes.json', label: 'Scenes' },
  { path: 'script.md', label: 'Script' },
  { path: 'storyboard.json', label: 'Shots' },
  { path: 'timeline.json', label: 'Edit' },
  { path: 'asset_prompts.json', label: 'Prompts' },
  { path: 'publish_copy.json', label: 'Publish' },
  { path: 'compliance_report.json', label: 'Risk' },
  { path: 'feedback_report.json', label: 'Feedback' }
];

export function getFile(workspace: WorkspaceSnapshot | null, path: string) {
  return workspace?.files.find((file) => file.path === path);
}

export function parseJsonFile<T>(workspace: WorkspaceSnapshot | null, path: string, fallback: T): T {
  const content = getFile(workspace, path)?.content;
  if (!content) return fallback;
  try {
    return JSON.parse(content) as T;
  } catch (_) {
    return fallback;
  }
}

export function contextStack(workspace: WorkspaceSnapshot | null): ContextItem[] {
  const items = [
    { id: 'brief', label: '产品 Brief', filePath: 'brief.json', summary: '产品、受众、卖点和 CTA' },
    { id: 'memory', label: '品牌记忆', filePath: '.aigc/MEMORY.md', summary: '语气、禁用词、历史偏好' },
    { id: 'refs', label: '爆款样本', filePath: 'viral_refs.json', summary: 'Hook、结构和情绪模板' },
    { id: 'rules', label: '平台规则', filePath: 'platform_rules.json', summary: '小红书、抖音、TikTok 表达边界' },
    { id: 'assets', label: '素材库', filePath: 'asset_library.json', summary: '产品素材、参考、授权状态' },
    { id: 'goal', label: 'Campaign Goal', filePath: 'campaign_goal.json', summary: '转化目标、数量和权限模式' },
    { id: 'feedback', label: '反馈记录', filePath: 'feedback_report.json', summary: '人工选择、退回原因和待验证假设' }
  ];

  return items.map((item) => {
    const exists = Boolean(getFile(workspace, item.filePath));
    return {
      ...item,
      status: exists ? ('ready' as const) : ('missing' as const)
    };
  });
}

export function sceneAssets(workspace: WorkspaceSnapshot | null): PreviewScene[] {
  const parsed = parseJsonFile<{
    scenes?: Array<{
      id?: string;
      title?: string;
      role?: string;
      visual?: string;
      subtitle?: string;
      start?: number;
      end?: number;
      narration?: string;
    }>;
  }>(workspace, 'scenes.json', { scenes: [] });

  return (parsed.scenes || []).slice(0, 8).map((scene, index) => ({
    id: scene.id || `scene_${index + 1}`,
    title: scene.title || scene.narration || `Scene ${index + 1}`,
    visual: scene.visual || '待生成画面建议',
    subtitle: scene.subtitle || scene.role || '待生成字幕',
    durationSeconds: Math.max(3, Number(scene.end || 0) - Number(scene.start || 0) || 6)
  }));
}

export function storyboardScenes(workspace: WorkspaceSnapshot | null): PreviewScene[] {
  const scenes = sceneAssets(workspace);
  if (scenes.length) return scenes;

  const parsed = parseJsonFile<{
    scenes?: Array<{ id?: string; visual?: string; subtitle?: string; start?: number; end?: number; narration?: string }>;
  }>(workspace, 'storyboard.json', { scenes: [] });

  return (parsed.scenes || []).slice(0, 5).map((scene, index) => ({
    id: scene.id || `s${index + 1}`,
    title: scene.narration || `镜头 ${index + 1}`,
    visual: scene.visual || '待生成画面建议',
    subtitle: scene.subtitle || '待生成字幕',
    durationSeconds: Math.max(3, Number(scene.end || 0) - Number(scene.start || 0) || 6)
  }));
}

export function missionAssetsFromWorkspace(workspace: WorkspaceSnapshot | null): MissionAsset[] {
  const scenes = sceneAssets(workspace);
  const base: MissionAsset[] = [
    {
      id: 'asset_brief',
      type: 'brief',
      title: '产品 Brief',
      status: getFile(workspace, 'brief.json') ? 'ready' : 'draft',
      filePath: 'brief.json',
      summary: '受众、产品、卖点、平台和 CTA'
    },
    {
      id: 'asset_refs',
      type: 'reference',
      title: '爆款参考',
      status: getFile(workspace, 'viral_refs.json') ? 'ready' : 'draft',
      filePath: 'viral_refs.json',
      summary: 'Hook、结构、情绪和可复用模板'
    },
    {
      id: 'asset_script',
      type: 'script',
      title: '脚本',
      status: getFile(workspace, 'script.md') ? 'ready' : 'draft',
      filePath: 'script.md',
      summary: '口播、字幕、标题和 CTA'
    },
    {
      id: 'asset_shots',
      type: 'shot',
      title: '分镜',
      status: getFile(workspace, 'storyboard.json') ? 'ready' : 'draft',
      filePath: 'storyboard.json',
      summary: '镜头、画面、动作和节奏'
    },
    {
      id: 'asset_timeline',
      type: 'timeline',
      title: '剪辑节奏',
      status: getFile(workspace, 'timeline.json') ? 'ready' : 'draft',
      filePath: 'timeline.json',
      summary: '前 3 秒、节奏点、停顿、转场和 CTA 时机'
    },
    {
      id: 'asset_prompts',
      type: 'prompt',
      title: '素材提示词',
      status: getFile(workspace, 'asset_prompts.json') ? 'warning' : 'draft',
      filePath: 'asset_prompts.json',
      summary: '图片、视频、首图和 B-roll 提示词'
    },
    {
      id: 'asset_copy',
      type: 'copy',
      title: '发布文案',
      status: getFile(workspace, 'publish_copy.json') ? 'ready' : 'draft',
      filePath: 'publish_copy.json',
      summary: '标题、封面、caption、hashtags'
    },
    {
      id: 'asset_compliance',
      type: 'compliance',
      title: '合规报告',
      status: workspace?.complianceStatus === 'blocked' ? 'blocked' : workspace?.complianceStatus === 'pass' ? 'ready' : 'warning',
      filePath: 'compliance_report.json',
      summary: '夸大表达、素材授权、平台风险和 AI 标识'
    },
    {
      id: 'asset_feedback',
      type: 'feedback',
      title: '反馈记录',
      status: getFile(workspace, 'feedback_report.json') ? 'ready' : 'draft',
      filePath: 'feedback_report.json',
      summary: '记录人工选择、被拒原因和下一轮待验证假设'
    }
  ];

  const sceneItems = scenes.slice(0, 5).map((scene, index): MissionAsset => ({
    id: `asset_${scene.id}`,
    type: 'scene',
    title: scene.title || `Scene ${index + 1}`,
    status: 'ready',
    filePath: 'scenes.json',
    summary: scene.subtitle || scene.visual
  }));

  return [...base, ...sceneItems];
}
