import type { ProductionStageId, WorkspaceSnapshot } from './types';

export const STYLE_BOOK_PATH = 'style.json';

/**
 * 受视觉风格影响的阶段。script 产出的是文字，不吃视觉风格；
 * 漂移检查也只在这几个阶段之间做。
 */
export const VISUAL_STAGES: ProductionStageId[] = ['character', 'scene', 'storyboard', 'video'];

export type StylePreset = {
  id: string;
  label: string;
  hint: string;
};

export type StyleBook = {
  schemaVersion: 1;
  /** 项目默认风格；阶段没有显式覆盖时全部继承它。 */
  global: StylePreset | null;
  /** 显式覆盖。只有用户主动为某阶段选了别的风格才会有值。 */
  stages: Partial<Record<ProductionStageId, StylePreset>>;
};

export type ResolvedStyle = {
  style: StylePreset | null;
  /** 'stage' = 该阶段显式覆盖；'global' = 继承项目默认；'none' = 还没选。 */
  source: 'stage' | 'global' | 'none';
};

export const STYLE_PRESETS: StylePreset[] = [
  { id: 'real', label: '写实生活感', hint: '自然光、真实场景' },
  { id: 'cinematic', label: '电影质感', hint: '高级调色、景深' },
  { id: 'anime', label: '二次元 / 动画', hint: '插画、动漫风' },
  { id: 'ad', label: '广告大片', hint: '强对比、产品特写' },
  { id: 'minimal', label: '极简干净', hint: '留白、克制' },
  { id: 'retro', label: '复古胶片', hint: '颗粒、暖调' }
];

export function emptyStyleBook(): StyleBook {
  return { schemaVersion: 1, global: null, stages: {} };
}

/** 自定义风格词：用户输入的任意描述，不在预设表里。 */
export function customStyle(text: string): StylePreset | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  return { id: `custom:${trimmed}`, label: trimmed, hint: '自定义风格词' };
}

export function isCustomStyle(style: StylePreset): boolean {
  return style.id.startsWith('custom:');
}

function normalizeStyle(value: unknown): StylePreset | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<StylePreset>;
  if (typeof record.id !== 'string' || !record.id.trim()) return null;
  if (typeof record.label !== 'string' || !record.label.trim()) return null;
  return {
    id: record.id,
    label: record.label,
    hint: typeof record.hint === 'string' ? record.hint : ''
  };
}

function normalizeBook(value: unknown): StyleBook | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<StyleBook>;
  if (candidate.schemaVersion !== 1) return null;

  const stages: Partial<Record<ProductionStageId, StylePreset>> = {};
  const rawStages = candidate.stages && typeof candidate.stages === 'object' ? candidate.stages : {};
  for (const stage of VISUAL_STAGES) {
    const style = normalizeStyle((rawStages as Record<string, unknown>)[stage]);
    if (style) stages[stage] = style;
  }

  return { schemaVersion: 1, global: normalizeStyle(candidate.global), stages };
}

export function styleBookFromWorkspace(workspace: WorkspaceSnapshot | null): StyleBook {
  const file = workspace?.files.find((item) => item.path === STYLE_BOOK_PATH);
  if (!file) return emptyStyleBook();
  try {
    return normalizeBook(JSON.parse(file.content)) || emptyStyleBook();
  } catch {
    return emptyStyleBook();
  }
}

/** 和 writeProductionFlow 同样自己维护文件版本，保持本模块零依赖、可单测。 */
export function writeStyleBook(workspace: WorkspaceSnapshot, book: StyleBook): WorkspaceSnapshot {
  const existingIndex = workspace.files.findIndex((file) => file.path === STYLE_BOOK_PATH);
  const existing = workspace.files[existingIndex];
  const nextFile = {
    path: STYLE_BOOK_PATH,
    kind: 'config' as const,
    content: JSON.stringify(book, null, 2),
    version: (existing?.version || 0) + 1,
    updatedAt: new Date().toISOString()
  };
  const files = [...workspace.files];
  if (existingIndex >= 0) files[existingIndex] = nextFile;
  else files.push(nextFile);
  return { ...workspace, files };
}

export function setGlobalStyle(book: StyleBook, style: StylePreset | null): StyleBook {
  return { ...book, global: style, stages: { ...book.stages } };
}

/** 传 null 表示取消覆盖，该阶段回到继承项目默认。 */
export function setStageStyle(book: StyleBook, stage: ProductionStageId, style: StylePreset | null): StyleBook {
  const stages = { ...book.stages };
  if (style) stages[stage] = style;
  else delete stages[stage];
  return { ...book, stages };
}

export function resolveStageStyle(book: StyleBook, stage: ProductionStageId): ResolvedStyle {
  const override = book.stages[stage];
  if (override) return { style: override, source: 'stage' };
  if (book.global) return { style: book.global, source: 'global' };
  return { style: null, source: 'none' };
}

/**
 * 风格漂移：视觉阶段之间生效了不同的风格。
 * 这是 prompt 字符串拼接方案永远抓不到的问题——角色是二次元、场景是实拍，
 * 两边各自都"正确"，合起来才是坏的。返回空数组表示没有漂移。
 */
export function styleDriftWarnings(book: StyleBook): string[] {
  const resolved = VISUAL_STAGES
    .map((stage) => ({ stage, ...resolveStageStyle(book, stage) }))
    .filter((item): item is { stage: ProductionStageId; style: StylePreset; source: 'stage' | 'global' } =>
      item.style !== null);
  if (resolved.length < 2) return [];

  const byId = new Map<string, { label: string; stages: ProductionStageId[] }>();
  for (const item of resolved) {
    const entry = byId.get(item.style.id) || { label: item.style.label, stages: [] };
    entry.stages.push(item.stage);
    byId.set(item.style.id, entry);
  }
  if (byId.size < 2) return [];

  const groups = Array.from(byId.values())
    .map((entry) => `${entry.stages.map(visualStageLabel).join('、')}用「${entry.label}」`)
    .join('，');
  return [`视觉风格不统一：${groups}。跨阶段风格不一致会让角色和场景对不上，确认这是有意为之。`];
}

const VISUAL_STAGE_LABEL: Record<string, string> = {
  character: '角色',
  scene: '场景',
  storyboard: '分镜',
  video: '视频'
};

export function visualStageLabel(stage: ProductionStageId): string {
  return VISUAL_STAGE_LABEL[stage] || stage;
}

/**
 * 注入给模型的风格约束。空字符串表示这一阶段不需要风格约束
 * （没选风格，或者是 script 这种不吃视觉风格的阶段）。
 */
export function stageStyleInstruction(book: StyleBook, stage: ProductionStageId): string {
  if (!VISUAL_STAGES.includes(stage)) return '';
  const { style, source } = resolveStageStyle(book, stage);
  if (!style) return '';

  const origin = source === 'stage' ? '本阶段指定' : '项目统一';
  const hint = style.hint ? `（${style.hint}）` : '';
  return `\n视觉风格锁定：${style.label}${hint}。这是${origin}的风格，本阶段所有图片提示词都必须落在这个风格里，不得自行改成其他画风。`;
}
