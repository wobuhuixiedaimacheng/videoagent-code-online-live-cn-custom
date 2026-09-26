export type ScriptStageBundle = {
  briefJson: string;
  campaignGoalJson: string;
  scriptMarkdown: string;
};

export class InvalidStageOutputError extends Error {
  readonly code = 'invalid_stage_output';

  constructor(readonly issues: string[]) {
    super(`模型返回了未填充或未基于 Brief 的脚本阶段结果：${issues.join('；')}`);
    this.name = 'InvalidStageOutputError';
  }
}

const PLACEHOLDER_TERMS = [
  '根据',
  '待填写',
  '待补充',
  '待确认',
  '示例',
  '如：',
  '如:',
  '关键词',
  '核心卖点',
  '补充说明',
  '吸引眼球',
  '行业',
  '痛点',
  '解决方案',
  '核心主题',
  '目标受众',
  '行动号召',
  'CTA'
];

const GENERIC_ANCHORS = new Set([
  '产品',
  '品牌',
  '服务',
  '内容',
  '短视频',
  '视频',
  '核心主题',
  '主题',
  '目标',
  '用户',
  '受众',
  '活动',
  '方案'
]);

function withoutMarkdownLinks(content: string): string {
  return content
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[[^\]]+\]\([^)]*\)/g, '');
}

function placeholderFragments(content: string): string[] {
  const cleaned = withoutMarkdownLinks(content);
  const fragments: string[] = [];
  const semantic = new RegExp(PLACEHOLDER_TERMS.join('|'), 'i');
  for (const match of cleaned.matchAll(/\[([^\]\n]{1,240})\]/g)) {
    const inner = match[1].trim();
    if (semantic.test(inner)) fragments.push(inner);
  }
  for (const match of cleaned.matchAll(/\b(?:TODO|TBD|PLACEHOLDER)\b/gi)) fragments.push(match[0]);
  for (const match of cleaned.matchAll(/(?:待填写|待补充|待确认|根据\s*Brief\s*确定)/gi)) fragments.push(match[0]);
  return [...new Set(fragments)];
}

function parseObject(content: string, filePath: string, issues: string[]): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      issues.push(`${filePath} 必须是 JSON 对象`);
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    issues.push(`${filePath} 不是有效 JSON`);
    return null;
  }
}

function scanJsonPlaceholders(value: unknown, filePath: string, issues: string[], keyPath = ''): void {
  if (typeof value === 'string') {
    const fragments = placeholderFragments(value);
    if (fragments.length) issues.push(`${filePath}${keyPath ? ` ${keyPath}` : ''} 含占位内容：${fragments.join('、')}`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanJsonPlaceholders(item, filePath, issues, `${keyPath}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      scanJsonPlaceholders(item, filePath, issues, keyPath ? `${keyPath}.${key}` : key);
    }
  }
}

function scanJsonInternalInstructions(value: unknown, filePath: string, issues: string[], keyPath = ''): void {
  if (typeof value === 'string') {
    if (isInternalStageInstruction(value)) {
      issues.push(`${filePath}${keyPath ? ` ${keyPath}` : ''} 含内部阶段控制指令`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanJsonInternalInstructions(item, filePath, issues, `${keyPath}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      scanJsonInternalInstructions(item, filePath, issues, keyPath ? `${keyPath}.${key}` : key);
    }
  }
}

function isConcrete(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length >= 2 && placeholderFragments(value).length === 0;
}

export function isInternalStageInstruction(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const text = value.trim();
  if (!text) return false;
  if (/\b(?:productionStage|stageRequestMode|requestedOutputFiles|generationJobId)\b/i.test(text)) return true;
  const namesStageFile = /(?:^|[\s，,；;：:、“”'"`])(?:brief\.json|campaign_goal\.json|script\.md)(?:$|[\s，,；;：:。、”'"`])/i.test(text);
  const hasControlVerb = /(?:只重写|只修改|只补齐|重写|改写|修改|补齐|输出完整|保留已确认|不要改动|不得改动|仅输出|只输出)/i.test(text);
  const controlsMissionBrief = /Mission\s*Brief/i.test(text) && /(?:保留|确认|重写|改写|修改|输出)/i.test(text);
  return (namesStageFile && hasControlVerb) || controlsMissionBrief;
}

function hasConcreteField(record: Record<string, unknown>, fields: string[]): boolean {
  return fields.some((field) => isConcrete(record[field]));
}

function normalizeAnchor(value: string): string {
  return value.trim().replace(/^[「『“”'"\s]+|[」』“”'"。！？!?，,；;：:\s]+$/g, '');
}

function concreteAnchors(record: Record<string, unknown>, fields: string[]): string[] {
  return [...new Set(fields
    .map((field) => record[field])
    .filter(isConcrete)
    .map(normalizeAnchor)
    .filter((value) => value.length >= 2 && value.length <= 48 && !GENERIC_ANCHORS.has(value) && !isInternalStageInstruction(value))
  )];
}

function primaryIdentityCandidates(brief: Record<string, unknown>, campaign: Record<string, unknown>): string[] {
  const priority = ['productName', 'product', 'topic', 'brand', 'title'];
  for (const field of priority) {
    const identity = concreteAnchors(brief, [field]);
    if (identity.length) return identity;
  }
  for (const field of [...priority, 'mission']) {
    const identity = concreteAnchors(campaign, [field]);
    if (identity.length) return identity;
  }
  return [];
}

export function validateScriptStageBundle(bundle: ScriptStageBundle): string[] {
  const issues: string[] = [];
  const brief = parseObject(bundle.briefJson, 'brief.json', issues);
  const campaign = parseObject(bundle.campaignGoalJson, 'campaign_goal.json', issues);

  if (brief) {
    scanJsonPlaceholders(brief, 'brief.json', issues);
    scanJsonInternalInstructions(brief, 'brief.json', issues);
    if (!hasConcreteField(brief, ['topic', 'title', 'productName', 'product', 'brand'])) {
      issues.push('brief.json 缺少具体的产品、品牌或主题主身份');
    }
  }
  if (campaign) {
    scanJsonPlaceholders(campaign, 'campaign_goal.json', issues);
    scanJsonInternalInstructions(campaign, 'campaign_goal.json', issues);
    for (const field of ['goal', 'audience', 'platform']) {
      if (!isConcrete(campaign[field])) issues.push(`campaign_goal.json 缺少具体的 ${field}`);
    }
  }

  const script = bundle.scriptMarkdown.trim();
  const scriptPlaceholders = placeholderFragments(script);
  if (scriptPlaceholders.length) issues.push(`script.md 含占位内容：${scriptPlaceholders.join('、')}`);
  const compactLength = script.replace(/\s/g, '').length;
  const substantiveLines = script.split('\n').filter((line) => line.replace(/[#>*_`\-\s]/g, '').length >= 8);
  const substantiveLength = script.replace(/[#>*_`\-\s]/g, '').length;
  if (compactLength < 60 || substantiveLines.length < 2 || substantiveLength < 40) {
    issues.push('script.md 内容过短，至少需要 60 个非空白字符和两行实质内容');
  }

  if (brief && campaign) {
    const primaryIdentities = primaryIdentityCandidates(brief, campaign);
    if (primaryIdentities.length && !primaryIdentities.some((identity) => script.includes(identity))) {
      issues.push(`script.md 未保留 Brief 的主身份（产品、品牌或主题）：${primaryIdentities.join('、')}`);
    }
  }

  return [...new Set(issues)];
}

export function assertValidScriptStageBundle(bundle: ScriptStageBundle): void {
  const issues = validateScriptStageBundle(bundle);
  if (issues.length) throw new InvalidStageOutputError(issues);
}
