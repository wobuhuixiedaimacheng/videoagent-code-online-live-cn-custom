import type { ProductionStageId } from '../../lib/types';
import type {
  CanvasEdgeRelation,
  CanvasStickyPayload,
  CanvasNodeKind,
  CanvasSize,
  ProductionCanvasEdge,
  ProductionCanvasGraph,
  ProductionCanvasNode,
  StoryCanvasCard,
  StoryCanvasLane,
  StoryCanvasOutcome
} from './types';

/**
 * 泳道 → 图。
 *
 * 这一步是整套改造的地基：把「递归的 children 数组 + 渲染顺序」摊平成
 * nodes + edges。摊平之后，两件事才成立——
 *
 * 1. 关系是数据。以前的连线是「上一条泳道最后一张卡 → 下一条泳道第一张卡」，
 *    那画的是排版顺序，不是依赖：换个换行位置，箭头指的东西就变了。
 *    现在每条边都带 relation，说得出自己为什么存在。
 * 2. 位置是数据。节点自己知道 {x, y, width, height}，连线从坐标算，
 *    不再靠 getBoundingClientRect() 去量 DOM。
 *
 * 这个模块是纯函数，不碰 React、不碰 DOM，所以能直接跑单元测试。
 */

/**
 * 节点尺寸表。
 *
 * 定长而不是「让内容撑开」，是无限画布的硬要求：布局要在渲染之前算完，
 * 而内容撑开的高度只有渲染完才知道。一旦回头去量 DOM，就又回到了老路上。
 * 溢出的部分由 CSS 裁剪（行数截断 + overflow hidden）。
 */
export const NODE_SIZE: Record<CanvasNodeKind, CanvasSize> = {
  stage: { width: 312, height: 92 },
  group: { width: 312, height: 304 },
  script: { width: 312, height: 180 },
  character: { width: 312, height: 236 },
  scene: { width: 312, height: 304 },
  shot: { width: 264, height: 272 },
  video: { width: 312, height: 292 },
  note: { width: 312, height: 108 },
  empty: { width: 312, height: 156 },
  pending: { width: 312, height: 156 },
  finalcut: { width: 268, height: 176 },
  sticky: { width: 240, height: 168 }
};

export const FINAL_CUT_NODE_ID = 'finalcut';

/** 卡片所属阶段 → 节点类型。子卡自带 stage，所以镜头挂在场次下面也认得出自己是镜头。 */
const KIND_BY_STAGE: Record<ProductionStageId, CanvasNodeKind> = {
  script: 'script',
  character: 'character',
  scene: 'scene',
  storyboard: 'shot',
  video: 'video'
};

function cardStage(card: StoryCanvasCard, lane: StoryCanvasLane): ProductionStageId {
  return card.stage || lane.stage;
}

function cardKind(card: StoryCanvasCard, lane: StoryCanvasLane): CanvasNodeKind {
  return KIND_BY_STAGE[cardStage(card, lane)] || 'script';
}

export const stageNodeId = (stage: ProductionStageId) => `stage_${stage}`;
export const groupNodeId = (cardId: string) => `group_${cardId}`;

export type BuildGraphInput = {
  lanes: StoryCanvasLane[];
  /** 正在生成的阶段：画一张骨架节点，而不是一条假泳道。 */
  pendingStage?: ProductionStageId | null;
  /** 骨架上的进度文案，例如「分镜第 2/4 批」。 */
  pendingProgress?: string;
  /** 被用户收起的场景簇。收起时镜头节点不进图——不进图就不渲染，也不参与布局。 */
  collapsedGroupIds?: string[];
  /** 流水线终点：合出来的成片。给了就在最右边挂一个终点节点。 */
  outcome?: StoryCanvasOutcome | null;
  /**
   * 用户自己放在这张画布上的便签。
   * 它们带着自己的世界坐标进来，不参与阶段列排布，也不产生任何自动边。
   */
  stickies?: CanvasStickyNode[];
};

/** 一条便签 + 它在世界里的位置。位置是它自己的属性，不走 overrides。 */
export type CanvasStickyNode = CanvasStickyPayload & { position: { x: number; y: number } };

/**
 * 把泳道结构归一化成图。同样的输入永远得到同样的输出，节点顺序稳定：
 * 父节点一定排在子节点前面（React Flow 要求 parentId 指向的节点先出现）。
 */
export function buildProductionGraph(input: BuildGraphInput): ProductionCanvasGraph {
  const {
    lanes,
    pendingStage = null,
    pendingProgress = '',
    collapsedGroupIds = [],
    outcome = null,
    stickies = []
  } = input;
  const collapsed = new Set(collapsedGroupIds);
  const nodes: ProductionCanvasNode[] = [];
  const edges: ProductionCanvasEdge[] = [];

  const pushCard = (
    card: StoryCanvasCard,
    lane: StoryCanvasLane,
    parentId?: string
  ): ProductionCanvasNode => {
    const kind = cardKind(card, lane);
    const node: ProductionCanvasNode = {
      id: card.id,
      kind,
      stage: cardStage(card, lane),
      entityId: card.id,
      parentId,
      position: { x: 0, y: 0 },
      size: NODE_SIZE[kind],
      locked: true,
      card,
      lane
    };
    nodes.push(node);
    return node;
  };

  for (const lane of lanes) {
    nodes.push({
      id: stageNodeId(lane.stage),
      kind: 'stage',
      stage: lane.stage,
      entityId: lane.stage,
      position: { x: 0, y: 0 },
      size: NODE_SIZE.stage,
      locked: true,
      card: null,
      lane
    });

    for (const card of lane.cards) {
      const children = card.children || [];
      if (!children.length) {
        pushCard(card, lane);
        continue;
      }
      // 有子产物的卡长成一个「簇」：场次卡和它的镜头共用一个父节点。
      // 拖父节点，整簇一起走——这是 parentId 而不是「拖的时候顺手算一下」该负责的事。
      const groupId = groupNodeId(card.id);
      const isCollapsed = collapsed.has(card.id);
      nodes.push({
        id: groupId,
        kind: 'group',
        stage: cardStage(card, lane),
        entityId: card.id,
        position: { x: 0, y: 0 },
        size: NODE_SIZE.group,
        locked: true,
        card: null,
        lane,
        childrenLabel: card.childrenLabel
      });
      pushCard(card, lane, groupId);
      if (isCollapsed) continue;
      for (const child of children) {
        pushCard(child, lane, groupId);
        edges.push({
          id: `contains_${card.id}_${child.id}`,
          source: card.id,
          target: child.id,
          relation: 'contains',
          primary: true
        });
      }
    }

    if (!lane.cards.length) {
      const kind: CanvasNodeKind = lane.note ? 'note' : 'empty';
      nodes.push({
        id: `${kind}_${lane.stage}`,
        kind,
        stage: lane.stage,
        entityId: '',
        position: { x: 0, y: 0 },
        size: NODE_SIZE[kind],
        locked: true,
        card: null,
        lane
      });
    }
  }

  if (pendingStage) {
    nodes.push({
      id: `pending_${pendingStage}`,
      kind: 'pending',
      stage: pendingStage,
      entityId: '',
      position: { x: 0, y: 0 },
      size: NODE_SIZE.pending,
      locked: true,
      card: null,
      lane: null,
      progressText: pendingProgress
    });
  }

  // 阶段之间的交接：锚在阶段节点上，和「这条泳道里有几张卡、最后一张排在哪」无关。
  for (let index = 0; index < lanes.length - 1; index += 1) {
    const from = lanes[index];
    const to = lanes[index + 1];
    edges.push({
      id: `handoff_${from.stage}_${to.stage}`,
      source: stageNodeId(from.stage),
      target: stageNodeId(to.stage),
      relation: 'handoff',
      primary: true
    });
  }

  if (outcome) {
    nodes.push({
      id: FINAL_CUT_NODE_ID,
      kind: 'finalcut',
      // 终点归到最后一个阶段名下只是为了让「聚焦视频阶段」能框到它；
      // 布局里它单独成列，不参与阶段列的排布。
      stage: 'video',
      entityId: FINAL_CUT_NODE_ID,
      position: { x: 0, y: 0 },
      size: NODE_SIZE.finalcut,
      locked: true,
      card: null,
      lane: null,
      outcome
    });
    // 从最后一条泳道收口。挂到每一个镜头上会拉出几十条汇聚线，
    // 那是把「所有片段合成一条」这件事画成了一团麻，而不是画清楚。
    const last = lanes[lanes.length - 1];
    if (last) {
      edges.push({
        id: `handoff_${last.stage}_finalcut`,
        source: stageNodeId(last.stage),
        target: FINAL_CUT_NODE_ID,
        relation: 'handoff',
        primary: true
      });
    }
  }

  /*
   * 用户便签。
   *
   * stage 是 null，不是某个阶段——这不是偷懒，是它本来就不属于任何阶段。
   * 标了「参与某阶段生成」的便签也一样：它是写给那个阶段的**要求**，
   * 不是那个阶段的**产物**，两者混在一起会让它被当成可审查的资产。
   *
   * 也不产生任何边：便签和产物之间的关系是人脑子里的，画布不该替他编一条出来。
   */
  for (const sticky of stickies) {
    nodes.push({
      id: sticky.id,
      kind: 'sticky',
      stage: null,
      entityId: sticky.id,
      position: { x: sticky.position.x, y: sticky.position.y },
      size: NODE_SIZE.sticky,
      locked: false,
      card: null,
      lane: null,
      sticky: {
        id: sticky.id,
        title: sticky.title,
        body: sticky.body,
        tone: sticky.tone,
        scope: sticky.scope
      }
    });
  }

  const ids = new Set(nodes.map((node) => node.id));
  // 卡片自己声明的关系。声明不了的就不画——画一条猜出来的边，比不画更糟。
  for (const node of nodes) {
    const card = node.card;
    if (!card) continue;
    // 方向 = 数据流向：被依赖的在前，依赖它的在后。角色 → 场次，和阅读方向一致；
    // 反过来画会让每条依赖边都从右边绕回左边，十几条就没法看了。
    for (const source of card.dependsOn || []) {
      pushRelation(edges, ids, source, node.id, 'depends_on');
    }
    if (card.inheritsFrom) pushRelation(edges, ids, card.inheritsFrom, node.id, 'inherits');
    if (card.renderOf) pushRelation(edges, ids, card.renderOf, node.id, 'renders');
  }

  return { nodes, edges: dedupeEdges(edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target))) };
}

function pushRelation(
  edges: ProductionCanvasEdge[],
  ids: Set<string>,
  source: string,
  target: string,
  relation: CanvasEdgeRelation
) {
  if (!ids.has(source) || !ids.has(target) || source === target) return;
  edges.push({ id: `${relation}_${source}_${target}`, source, target, relation, primary: false });
}

function dedupeEdges(edges: ProductionCanvasEdge[]): ProductionCanvasEdge[] {
  const seen = new Set<string>();
  return edges.filter((edge) => {
    if (seen.has(edge.id)) return false;
    seen.add(edge.id);
    return true;
  });
}

/** 一个节点相关的边：选中它时才把次级依赖画出来，平时屏幕上只有主干。 */
export function edgesTouching(edges: ProductionCanvasEdge[], nodeId: string): Set<string> {
  const touched = new Set<string>();
  for (const edge of edges) {
    if (edge.source === nodeId || edge.target === nodeId) touched.add(edge.id);
  }
  return touched;
}

/**
 * 一个阶段对应哪些节点。切阶段时用它做 fitView——
 * 「聚焦到分镜」应该框住那些镜头，而不是滚到某个像素位置。
 */
export function nodeIdsForStage(nodes: ProductionCanvasNode[], stage: ProductionStageId): string[] {
  const ids = nodes.filter((node) => node.stage === stage).map((node) => node.id);
  // 镜头挂在场景簇里：只框镜头会把簇的边框切掉一半，连同它的父节点一起框。
  const parents = new Set(
    nodes.filter((node) => node.stage === stage && node.parentId).map((node) => node.parentId as string)
  );
  return [...new Set([...ids, ...parents])];
}
