import type { ProductionStageId } from '../../lib/types';
import { STAGE_ORDER, type CanvasLayoutOverrides, type ProductionCanvasGraph, type ProductionCanvasNode } from './types';

/**
 * 确定性阶段列布局。
 *
 * 第一版刻意不上 ELK / Dagre：生产流程本身是固定的五段状态机，
 * 横轴就是剧本 → 角色 → 场景 → 分镜 → 视频，纵轴就是同阶段的实体。
 * 这种结构下，自动布局算法给出的结果既不会更好，还会让「为什么这张卡跑到这儿」
 * 变成一个没人答得上来的问题。等跨层依赖真的复杂起来再换。
 *
 * 纯函数：同样的图 + 同样的 overrides，永远得到同样的坐标。
 */

/** 列间距。要放得下阶段之间的交接线，又不能让两列看起来没关系。 */
export const COLUMN_GAP = 104;
/** 同列上下两个节点之间的间距。 */
export const ROW_GAP = 28;
/** 阶段列头和第一张卡之间的间距。 */
export const STAGE_HEADER_GAP = 44;
/** 场景簇的内边距。 */
export const GROUP_PAD = 14;
/** 场景簇顶部留给标题条的高度。 */
export const GROUP_HEADER = 36;
/** 场次卡和它的镜头之间的间距。 */
export const GROUP_SPLIT_GAP = 34;
/** 镜头之间的间距。 */
export const SHOT_GAP = 16;
/**
 * 一列最多摞几个镜头。超过就换列。
 * 不限的话，一场十二个镜头会拉出三千像素的竖条，缩到能看全整簇时卡片已经糊了。
 */
export const SHOTS_PER_COLUMN = 3;
/** 阶段列内部换列的间距。 */
export const SUB_COLUMN_GAP = 24;
/**
 * 一个阶段列摞到多高就另起一列。
 *
 * 只按「个数」换列，遇到一场戏带七个镜头的簇会摞出七千像素；
 * 只按「高度」换列，一列里塞十几张矮卡又会变成一条细长面条。
 * 所以两个都要：先到先算。
 */
export const MAX_COLUMN_HEIGHT = 2400;
export const MAX_NODES_PER_COLUMN = 6;

export type LayoutInput = {
  graph: ProductionCanvasGraph;
  /** 用户手动挪过的位置，只对顶层节点生效。簇内的镜头跟着簇走。 */
  overrides?: CanvasLayoutOverrides;
};

export type LayoutResult = {
  nodes: ProductionCanvasNode[];
  /** 每个阶段列的世界坐标，切阶段时用来定位。 */
  columns: Array<{ stage: ProductionStageId; x: number; width: number }>;
};

/** 排一次版。输入不变，输出的每个坐标都不变。 */
export function layoutProductionGraph({ graph, overrides = {} }: LayoutInput): LayoutResult {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const childrenOf = new Map<string, ProductionCanvasNode[]>();
  for (const node of graph.nodes) {
    if (!node.parentId) continue;
    const bucket = childrenOf.get(node.parentId);
    if (bucket) bucket.push(node);
    else childrenOf.set(node.parentId, [node]);
  }

  // 先把每个簇内部排好，簇的尺寸才定得下来，列宽才算得出来。
  const sized = new Map<string, { width: number; height: number }>();
  for (const node of graph.nodes) {
    if (node.kind !== 'group') continue;
    sized.set(node.id, layoutGroupInterior(node, childrenOf.get(node.id) || []));
  }

  // 终点不参与阶段列：它属于「整条流水线」，不属于其中任何一段。
  const outcomeNode = graph.nodes.find((node) => node.kind === 'finalcut');
  /*
   * 便签也不参与阶段列，但理由不一样：终点是「属于整条线」，便签是「不属于这条线」。
   * 它的坐标是用户自己放的，本来就是最终答案，不需要也不应该被自动排版算一遍。
   */
  const topLevel = graph.nodes.filter(
    (node) => !node.parentId && node.kind !== 'finalcut' && node.kind !== 'sticky'
  );
  const stages = [...new Set(topLevel.map((node) => node.stage))]
    .filter((stage): stage is ProductionStageId => Boolean(stage))
    .sort((a, b) => STAGE_ORDER.indexOf(a) - STAGE_ORDER.indexOf(b));

  const columns: LayoutResult['columns'] = [];
  let cursorX = 0;
  for (const stage of stages) {
    const columnNodes = topLevel.filter((node) => node.stage === stage);
    for (const node of columnNodes) node.size = sized.get(node.id) || node.size;

    const header = columnNodes.find((node) => node.kind === 'stage');
    const body = columnNodes.filter((node) => node !== header);
    const contentTop = header ? header.size.height + STAGE_HEADER_GAP : 0;

    // 先分包：一个阶段列可能要摞三十几张卡，摞成一条竖线的话，
    // 「适应全部」就只能把倍率压到看不清任何字的程度。
    const packs: ProductionCanvasNode[][] = [[]];
    let packHeight = 0;
    for (const node of body) {
      const current = packs[packs.length - 1];
      const overflows =
        current.length >= MAX_NODES_PER_COLUMN ||
        (current.length > 0 && packHeight + node.size.height > MAX_COLUMN_HEIGHT);
      if (overflows) {
        packs.push([node]);
        packHeight = node.size.height + ROW_GAP;
        continue;
      }
      current.push(node);
      packHeight += node.size.height + ROW_GAP;
    }

    let subX = cursorX;
    for (const pack of packs) {
      if (!pack.length) continue;
      const packWidth = Math.max(...pack.map((node) => node.size.width));
      let cursorY = contentTop;
      for (const node of pack) {
        // 子列内居中：场景簇比一张卡宽得多，左对齐会让整列看起来是歪的。
        node.position = { x: subX + (packWidth - node.size.width) / 2, y: cursorY };
        cursorY += node.size.height + ROW_GAP;
      }
      subX += packWidth + SUB_COLUMN_GAP;
    }

    const width = Math.max(
      header ? header.size.width : 0,
      subX > cursorX ? subX - cursorX - SUB_COLUMN_GAP : 0
    );
    if (header) header.position = { x: cursorX + (width - header.size.width) / 2, y: 0 };

    columns.push({ stage, x: cursorX, width });
    cursorX += width + COLUMN_GAP;
  }

  // 终点排在所有阶段列右边，纵向对着整张图的中线——它是被所有列汇进来的那一个。
  if (outcomeNode) {
    const bottom = topLevel.reduce(
      (max, node) => Math.max(max, node.position.y + node.size.height),
      outcomeNode.size.height
    );
    outcomeNode.position = { x: cursorX, y: Math.max(0, (bottom - outcomeNode.size.height) / 2) };
  }

  // 手动位置最后覆盖：它是用户的意图，不该被自动排版按回去。
  for (const [id, point] of Object.entries(overrides)) {
    const node = byId.get(id);
    if (!node || node.parentId) continue;
    // 便签的位置存在它自己身上，不走 overrides；这里挡一道，免得两个真源打架。
    if (node.kind === 'sticky') continue;
    node.position = { x: point.x, y: point.y };
  }

  return { nodes: graph.nodes, columns };
}

/**
 * 簇内部：场次卡在左，镜头在右边摞成若干列。
 * 坐标相对簇原点——和 React Flow 的 parentId 语义一致，所以拖簇的时候
 * 镜头不需要任何额外计算就跟着走。
 */
function layoutGroupInterior(group: ProductionCanvasNode, children: ProductionCanvasNode[]) {
  const parent = children.find((child) => child.entityId === group.entityId && child.kind !== 'shot');
  const shots = children.filter((child) => child !== parent);
  const parentSize = parent?.size || group.size;

  if (parent) parent.position = { x: GROUP_PAD, y: GROUP_HEADER };

  if (!shots.length) {
    return {
      width: GROUP_PAD * 2 + parentSize.width,
      height: GROUP_HEADER + parentSize.height + GROUP_PAD
    };
  }

  const shotWidth = shots[0].size.width;
  const shotHeight = shots[0].size.height;
  const shotsX = GROUP_PAD + parentSize.width + GROUP_SPLIT_GAP;
  const rows = Math.min(shots.length, SHOTS_PER_COLUMN);
  const columnCount = Math.ceil(shots.length / SHOTS_PER_COLUMN);

  shots.forEach((shot, index) => {
    const column = Math.floor(index / SHOTS_PER_COLUMN);
    const row = index % SHOTS_PER_COLUMN;
    shot.position = {
      x: shotsX + column * (shotWidth + SHOT_GAP),
      y: GROUP_HEADER + row * (shotHeight + SHOT_GAP)
    };
  });

  const shotsWidth = columnCount * shotWidth + (columnCount - 1) * SHOT_GAP;
  const shotsHeight = rows * shotHeight + (rows - 1) * SHOT_GAP;
  return {
    width: shotsX + shotsWidth + GROUP_PAD,
    height: GROUP_HEADER + Math.max(parentSize.height, shotsHeight) + GROUP_PAD
  };
}

/** 世界坐标包围盒。用来做「适应全部」和空画布时的兜底视口。 */
export function graphBounds(nodes: ProductionCanvasNode[]) {
  const roots = nodes.filter((node) => !node.parentId);
  if (!roots.length) return { x: 0, y: 0, width: 0, height: 0 };
  const minX = Math.min(...roots.map((node) => node.position.x));
  const minY = Math.min(...roots.map((node) => node.position.y));
  const maxX = Math.max(...roots.map((node) => node.position.x + node.size.width));
  const maxY = Math.max(...roots.map((node) => node.position.y + node.size.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
