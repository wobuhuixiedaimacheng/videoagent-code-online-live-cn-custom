import type { ProductionStageId, WorkspaceSnapshot } from './types';
import { getFile, upsertWorkspaceFile } from './workspace';

/**
 * 画布集合：一个项目里的所有画布，以及用户自己往上放的东西。
 *
 * 它属于**文档**，住在工作区里跟着项目归档；但它**不属于生产资产**。
 * 这条豁免不靠调用方自觉，靠两份既有白名单：
 *
 * 1. `.aigc/` 前缀被 isInternalWorkspaceFile 判定为内部文件，不算产物；
 * 2. 阶段上游依赖 STAGE_SOURCE_FILES 是白名单，只列 script.md / characters.json /
 *    scenes.json / storyboard.json——不在名单上的文件改多少次都进不了 sourceVersions。
 *
 * 所以新建一张画布、写一条便签、挪一个节点，都不会让下游变成「需重做」。
 *
 * 为什么布局也在这里、而不是留在原来的 canvas-layout.json：
 * **布局属于画布**。每张画布有自己的一套位置。拆成两个文件的话，生产画布的布局在一处、
 * 自定义画布的布局在另一处，同一件事有两个真源——迟早对不上。旧文件仍然会被读一次做迁移。
 */

/** 旧版布局文件。只读，用于一次性迁移。 */
export const LEGACY_CANVAS_LAYOUT_PATH = '.aigc/canvas-layout.json';
export const CANVAS_BOARDS_PATH = '.aigc/canvas-boards.json';
/**
 * 参与生成的便签会被汇成这个文件进模型上下文。
 *
 * 它不落盘、不进工作区版本，只在组装提示词那一刻合成出来——真源永远是
 * canvas-boards.json 里的便签本身。存两份的话，改了便签忘了改这里，
 * 模型看到的就是过期的要求，而界面上完全看不出来。
 */
export const CANVAS_NOTES_PATH = '.aigc/canvas-notes.md';

/** 生产画布的固定 id。它由生产流程自动生成，永远存在，不能删。 */
export const PRODUCTION_BOARD_ID = 'production';
export const PRODUCTION_BOARD_NAME = '生产画布';

export type CanvasPlacement = { x: number; y: number };

/** 便签的配色。只有四档，因为再多就没人分得清哪个是哪个意思了。 */
export type CanvasStickyTone = 'neutral' | 'accent' | 'warn' | 'danger';
export const STICKY_TONES: CanvasStickyTone[] = ['neutral', 'accent', 'warn', 'danger'];

/**
 * 这条便签作用到哪儿。
 *
 * - 'note'：只是写给人看的，不进任何提示词。默认值。
 * - 'all'：每个阶段生成时都带上。
 * - 具体阶段：只在那个阶段生成时带上。
 *
 * 默认必须是 'note'。反过来的话，用户随手写一句「这版不好看」就会被当成
 * 生成指令喂给模型——一条抱怨变成一条要求，比不生效糟得多。要它生效，
 * 就得有一次明确的动作。
 */
export const STICKY_SCOPES = ['note', 'all', 'script', 'character', 'scene', 'storyboard', 'video'] as const;
export type CanvasStickyScope = (typeof STICKY_SCOPES)[number];

export const STICKY_SCOPE_LABEL: Record<CanvasStickyScope, string> = {
  note: '只是笔记',
  all: '全部阶段',
  script: '剧本',
  character: '角色',
  scene: '场景',
  storyboard: '分镜',
  video: '视频'
};

/**
 * 用户手工放上去的一张便签。
 *
 * 它刻意**不是**产物卡：没有 stage、没有版本、不进审批链、不会被生成流程读取。
 * 让它长得像产物卡是危险的——用户会以为在这儿写一句「这一镜要特写」能影响生成，
 * 而实际上什么都不会发生。所以它在数据上和视觉上都必须是另一种东西。
 */
export type CanvasSticky = {
  id: string;
  title: string;
  body: string;
  tone: CanvasStickyTone;
  /** 参与哪个阶段的生成。默认 'note'——不参与。 */
  scope: CanvasStickyScope;
  position: CanvasPlacement;
};

export type CanvasBoardKind = 'production' | 'custom';

export type CanvasBoard = {
  id: string;
  name: string;
  kind: CanvasBoardKind;
  /** 生产节点被手动挪到哪儿。只有生产画布用得上，但每张画布各存各的。 */
  layout: Record<string, CanvasPlacement>;
  stickies: CanvasSticky[];
};

type CanvasBoardsFile = { version: 1; boards: CanvasBoard[] };

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function textOf(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function placementOf(value: unknown): CanvasPlacement | null {
  const candidate = value as { x?: unknown; y?: unknown };
  if (isFiniteNumber(candidate?.x) && isFiniteNumber(candidate?.y)) {
    return { x: candidate.x, y: candidate.y };
  }
  return null;
}

function parseLayout(value: unknown): Record<string, CanvasPlacement> {
  const layout: Record<string, CanvasPlacement> = {};
  if (!value || typeof value !== 'object') return layout;
  for (const [id, point] of Object.entries(value as Record<string, unknown>)) {
    const placement = placementOf(point);
    if (placement) layout[id] = placement;
  }
  return layout;
}

function parseSticky(value: unknown): CanvasSticky | null {
  const candidate = value as Partial<CanvasSticky> | null;
  const id = textOf(candidate?.id);
  const position = placementOf(candidate?.position);
  // 没有 id 或者坐标坏了的便签，救不回来也定位不了，只能丢。
  if (!id || !position) return null;
  const tone = candidate?.tone;
  const scope = candidate?.scope;
  return {
    id,
    title: textOf(candidate?.title),
    body: textOf(candidate?.body),
    tone: STICKY_TONES.includes(tone as CanvasStickyTone) ? (tone as CanvasStickyTone) : 'neutral',
    // 认不出来的 scope 一律回落到「只是笔记」：宁可不生效，也不能凭猜把它变成指令。
    scope: STICKY_SCOPES.includes(scope as CanvasStickyScope) ? (scope as CanvasStickyScope) : 'note',
    position
  };
}

function parseBoard(value: unknown): CanvasBoard | null {
  const candidate = value as Partial<CanvasBoard> | null;
  const id = textOf(candidate?.id);
  if (!id) return null;
  const kind: CanvasBoardKind = candidate?.kind === 'production' ? 'production' : 'custom';
  return {
    id,
    name: textOf(candidate?.name) || (kind === 'production' ? PRODUCTION_BOARD_NAME : '未命名画布'),
    kind,
    layout: parseLayout(candidate?.layout),
    stickies: Array.isArray(candidate?.stickies)
      ? candidate.stickies.map(parseSticky).filter((sticky): sticky is CanvasSticky => Boolean(sticky))
      : []
  };
}

function emptyProductionBoard(layout: Record<string, CanvasPlacement> = {}): CanvasBoard {
  return {
    id: PRODUCTION_BOARD_ID,
    name: PRODUCTION_BOARD_NAME,
    kind: 'production',
    layout,
    stickies: []
  };
}

function safeParse(raw: string | undefined): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * 读出一个项目的所有画布。
 *
 * 生产画布一定在第一个，而且一定存在——它是生产流程自动生成的那一张，
 * 不是用户建出来的，所以「一个项目至少有一张画布」这件事不该依赖任何写入。
 */
export function canvasBoardsFromWorkspace(workspace: WorkspaceSnapshot | null): CanvasBoard[] {
  const parsed = safeParse(getFile(workspace, CANVAS_BOARDS_PATH)?.content) as CanvasBoardsFile | null;
  const raw = Array.isArray(parsed?.boards) ? parsed.boards : null;

  if (!raw) {
    // 还没有画布文件：把旧版 canvas-layout.json 里的位置迁进生产画布，一次性。
    const legacy = safeParse(getFile(workspace, LEGACY_CANVAS_LAYOUT_PATH)?.content) as
      | { nodes?: unknown }
      | null;
    return [emptyProductionBoard(parseLayout(legacy?.nodes))];
  }

  const boards = raw.map(parseBoard).filter((board): board is CanvasBoard => Boolean(board));
  const production = boards.find((board) => board.kind === 'production');
  const rest = boards.filter((board) => board.kind !== 'production');
  return [production || emptyProductionBoard(), ...rest];
}

function serialize(boards: CanvasBoard[]): string {
  // 排序 key，内容才稳定：不排序的话，同一份布局换个插入顺序就会被判成「变了」，
  // 于是版本号 +1、防抖归档再跑一次——一次没有任何实际改动的写盘。
  const normalized = boards.map((board) => {
    const layout: Record<string, CanvasPlacement> = {};
    for (const id of Object.keys(board.layout).sort()) layout[id] = board.layout[id];
    return { id: board.id, name: board.name, kind: board.kind, layout, stickies: board.stickies };
  });
  const file: CanvasBoardsFile = { version: 1, boards: normalized };
  return JSON.stringify(file, null, 2);
}

/** 写回工作区。内容没变就原样返回，不碰版本号。 */
export function writeCanvasBoards(
  workspace: WorkspaceSnapshot,
  boards: CanvasBoard[]
): WorkspaceSnapshot {
  const content = serialize(boards);
  if (getFile(workspace, CANVAS_BOARDS_PATH)?.content === content) return workspace;
  return upsertWorkspaceFile(workspace, CANVAS_BOARDS_PATH, content, 'config');
}

/** 生成一个不和现有 id 冲突的 id。不用随机数，纯计数——同样的输入得到同样的结果，好测。 */
export function nextId(prefix: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  let index = 1;
  while (used.has(`${prefix}${index}`)) index += 1;
  return `${prefix}${index}`;
}

/** 新建一张空白画布。名字重复时自动加序号——两张都叫「新画布」的话，切换器就没法用了。 */
export function createBoard(boards: CanvasBoard[], name?: string): CanvasBoard {
  const id = nextId('board_', boards.map((board) => board.id));
  const base = (name || '').trim() || '新画布';
  const names = new Set(boards.map((board) => board.name));
  let finalName = base;
  let index = 2;
  while (names.has(finalName)) {
    finalName = `${base} ${index}`;
    index += 1;
  }
  return { id, name: finalName, kind: 'custom', layout: {}, stickies: [] };
}

/** 连着加便签时的错位步长。 */
const STICKY_CASCADE_STEP = 26;

/**
 * 新便签落在给定位置；那儿已经有一张就往右下错开，直到空出来为止。
 *
 * 不错开的话，连点两次「＋ 便签」会得到两张完全重叠的便签——屏幕上看起来
 * 只加了一张，用户会以为第二次点击没生效，然后接着点。
 */
export function createSticky(board: CanvasBoard, position: CanvasPlacement): CanvasSticky {
  const taken = new Set(board.stickies.map((sticky) => `${sticky.position.x},${sticky.position.y}`));
  let { x, y } = position;
  // 上限只是防死循环：叠到第 40 张还没空位，说明用户是故意堆在一起的。
  for (let step = 0; step < 40 && taken.has(`${x},${y}`); step += 1) {
    x += STICKY_CASCADE_STEP;
    y += STICKY_CASCADE_STEP;
  }
  return {
    id: nextId('sticky_', board.stickies.map((sticky) => sticky.id)),
    title: '',
    body: '',
    tone: 'neutral',
    scope: 'note',
    position: { x, y }
  };
}

/**
 * 这个阶段生成时要带上的便签。
 *
 * 跨画布收集：用户在规划画布上写的要求，标了就该算数——「写在哪张纸上」
 * 和「要不要照做」是两件事。空便签不进：一条什么都没写的备注只会占上下文。
 */
export function stickiesForStage(boards: CanvasBoard[], stage: ProductionStageId): CanvasSticky[] {
  const picked: CanvasSticky[] = [];
  for (const board of boards) {
    for (const sticky of board.stickies) {
      if (sticky.scope !== 'all' && sticky.scope !== stage) continue;
      if (!sticky.title.trim() && !sticky.body.trim()) continue;
      picked.push(sticky);
    }
  }
  return picked;
}

/**
 * 把参与生成的便签渲染成一段给模型看的 markdown。
 * 没有可用便签时返回空串——空的「画布备注」章节只会让模型以为用户什么都没说。
 */
export function renderCanvasNotes(boards: CanvasBoard[], stage: ProductionStageId): string {
  const picked = stickiesForStage(boards, stage);
  if (!picked.length) return '';
  const lines = picked.map((sticky, index) => {
    const head = sticky.title.trim() || `备注 ${index + 1}`;
    const body = sticky.body.trim();
    return body ? `${index + 1}. **${head}**：${body}` : `${index + 1}. **${head}**`;
  });
  return [
    '# 画布备注（用户手写，优先级高于你的自行判断）',
    '',
    '下面每一条都是用户写在画布上、并且明确标记为「参与本阶段生成」的要求。',
    '没有标记的便签不会出现在这里，所以出现在这里的每一条都要照做；',
    '和其他上下文冲突时以这里为准，做不到的要在说明里讲清楚为什么。',
    '',
    ...lines,
    ''
  ].join('\n');
}

/** 改一张画布，返回新的画布数组。找不到就原样返回，不静默新建。 */
export function updateBoard(
  boards: CanvasBoard[],
  boardId: string,
  update: (board: CanvasBoard) => CanvasBoard
): CanvasBoard[] {
  let changed = false;
  const next = boards.map((board) => {
    if (board.id !== boardId) return board;
    changed = true;
    return update(board);
  });
  return changed ? next : boards;
}

/** 删除一张画布。生产画布删不掉——它是生产流程的视图，不是用户建出来的东西。 */
export function removeBoard(boards: CanvasBoard[], boardId: string): CanvasBoard[] {
  const target = boards.find((board) => board.id === boardId);
  if (!target || target.kind === 'production') return boards;
  return boards.filter((board) => board.id !== boardId);
}
