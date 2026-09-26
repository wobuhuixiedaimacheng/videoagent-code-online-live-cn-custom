'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Background,
  BackgroundVariant,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
  useStore,
  useStoreApi,
  type Edge,
  type Node
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { ProductionStageId } from '../../lib/types';
import { IconX } from '../icons';
import { NODE_SIZE, buildProductionGraph, edgesTouching, nodeIdsForStage } from './graph';
import { graphBounds, layoutProductionGraph } from './layout';
import { CanvasActionsContext, canvasNodeTypes, type CanvasActions } from './nodes';
import { readActiveBoardId, readCamera, writeActiveBoardId, writeCamera } from './storage';
import {
  PRODUCTION_BOARD_ID,
  createBoard,
  createSticky,
  removeBoard,
  updateBoard,
  type CanvasBoard,
  type CanvasStickyScope,
  type CanvasStickyTone
} from '../../lib/canvasBoards';
import type {
  CanvasLayoutOverrides,
  ProductionCanvasNode,
  StoryCanvasCard,
  StoryCanvasLane,
  StoryCanvasOutcome
} from './types';

export type ProductionCanvasProps = {
  /** 相机按项目分键存在会话里。没有它，切项目之后视口会串。 */
  projectId: string;
  /**
   * 这个项目的所有画布。第一张永远是生产画布（自动生成，删不掉），
   * 其余是用户自己建的。它属于文档，由工作区文件持有（.aigc/canvas-boards.json），
   * 所以这里是受控的：画布只负责产生新状态，存到哪儿由上层决定。
   */
  boards: CanvasBoard[];
  onBoardsChange: (next: CanvasBoard[]) => void;
  lanes: StoryCanvasLane[];
  /** 流水线终点：合出来的成片。null 表示这个工作区还没到需要摆终点的程度。 */
  outcome?: StoryCanvasOutcome | null;
  activeStage: ProductionStageId;
  selectedCardId: string;
  nextGeneratingStage: ProductionStageId | null;
  /** 分批生成时的进度，例如「分镜第 2/4 批」。空串表示这一轮不分批。 */
  generatingProgress?: string;
  reviewOpen: boolean;
  reviewTitle: string;
  reviewOwner: string;
  reviewContent: ReactNode;
  /** 'wide' 给角色视觉设定画板这类「左索引 + 中画板 + 底部矩阵」的三区布局用。 */
  reviewSize?: 'default' | 'wide';
  onOpenCard: (lane: StoryCanvasLane, card: StoryCanvasCard | null) => void;
  onCloseReview: () => void;
  onRegenerate: (lane: StoryCanvasLane) => void;
  onReplace: (lane: StoryCanvasLane) => void;
};

const MIN_ZOOM = 0.08;
const MAX_ZOOM = 2;
/** 低倍率下不画图、不画正文。缩到 0.3 的时候那些像素本来也读不出内容，只是在烧 GPU。 */
const LOD_FAR = 0.35;
const LOD_NEAR = 0.7;

function zoomTier(zoom: number): 'far' | 'mid' | 'near' {
  if (zoom < LOD_FAR) return 'far';
  if (zoom < LOD_NEAR) return 'mid';
  return 'near';
}

export default function ProductionCanvas(props: ProductionCanvasProps) {
  return (
    <ReactFlowProvider>
      <ProductionCanvasInner {...props} />
    </ReactFlowProvider>
  );
}

function ProductionCanvasInner({
  projectId,
  boards,
  onBoardsChange,
  lanes,
  outcome = null,
  activeStage,
  selectedCardId,
  nextGeneratingStage,
  generatingProgress = '',
  reviewOpen,
  reviewTitle,
  reviewOwner,
  reviewContent,
  reviewSize = 'default',
  onOpenCard,
  onCloseReview,
  onRegenerate,
  onReplace
}: ProductionCanvasProps) {
  const { fitView, zoomIn, zoomOut, setViewport, getViewport } = useReactFlow();
  const store = useStoreApi();

  /**
   * 只记「被用户手动收起的是哪几个」，不记展开的。
   * 默认展开：镜头是这一步要审的东西，默认藏起来等于把用户刚要看的内容锁在一次点击后面。
   * 反过来记的话，重新生成一版分镜之后 id 全变，所有节点会莫名其妙全部收起。
   */
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<string[]>([]);
  const [layoutMode, setLayoutMode] = useState(false);
  const [focusedNodeId, setFocusedNodeId] = useState('');
  const [renamingBoardId, setRenamingBoardId] = useState('');

  /* ---------------- 当前画布：会话状态，和相机同一层 ---------------- */

  const [activeBoardId, setActiveBoardId] = useState(PRODUCTION_BOARD_ID);
  useEffect(() => {
    const stored = readActiveBoardId(projectId);
    setActiveBoardId(stored || PRODUCTION_BOARD_ID);
  }, [projectId]);

  // 存着的画布可能已经被删了（或者换了项目），落不到实处就回生产画布。
  const activeBoard =
    boards.find((board) => board.id === activeBoardId) || boards[0] || null;
  const activeBoardKey = activeBoard?.id || PRODUCTION_BOARD_ID;
  const isProductionBoard = activeBoard?.kind === 'production';

  const selectBoard = useCallback(
    (boardId: string) => {
      setActiveBoardId(boardId);
      writeActiveBoardId(projectId, boardId);
      setFocusedNodeId('');
      setRenamingBoardId('');
    },
    [projectId]
  );

  /*
   * 倍率从 store 里选，而且只选「取整后的百分比」。
   * 直接订阅 transform 会让整个画布跟着每一帧平移重渲染；只取整数百分比的话，
   * 平移时它根本不变（不重渲染），缩放时也最多变几十次。
   *
   * 顺带兜住非有限值：fitView 在「容器还没量出尺寸」或者「要框的节点集为空」这两种情况下
   * 会算出 NaN/Infinity——屏幕上就是一个「Na%」和一块空白画布，而且看不出是谁的问题。
   */
  const zoomPercent = useStore((state) =>
    Number.isFinite(state.transform[2]) ? Math.round(state.transform[2] * 100) : 100
  );
  const tier = zoomTier(zoomPercent / 100);

  /* ---------------- 图与布局：纯计算，和相机完全无关 ---------------- */

  /*
   * 自定义画布上没有生产节点：它是一张空白的纸，只有用户自己放的东西。
   * 把生产节点也画上去的话，两张画布就成了同一张的两个副本，「另建一张」就没有意义了。
   */
  const stickies = useMemo(
    () =>
      (activeBoard?.stickies || []).map((sticky) => ({
        id: sticky.id,
        title: sticky.title,
        body: sticky.body,
        tone: sticky.tone,
        scope: sticky.scope,
        position: sticky.position
      })),
    [activeBoard]
  );

  const graph = useMemo(
    () =>
      buildProductionGraph({
        lanes: isProductionBoard ? lanes : [],
        pendingStage: isProductionBoard ? nextGeneratingStage : null,
        pendingProgress: generatingProgress,
        collapsedGroupIds: collapsedNodeIds,
        outcome: isProductionBoard ? outcome : null,
        stickies
      }),
    [isProductionBoard, lanes, nextGeneratingStage, generatingProgress, collapsedNodeIds, outcome, stickies]
  );

  const layout = useMemo(
    () => layoutProductionGraph({ graph, overrides: activeBoard?.layout || {} }),
    [graph, activeBoard]
  );

  const activeId = focusedNodeId || selectedCardId;

  const computedNodes = useMemo<Node[]>(
    () =>
      layout.nodes.map((node) => ({
        id: node.id,
        type: node.kind,
        position: node.position,
        parentId: node.parentId,
        // 簇内的镜头不能被拖出簇外：它属于这一场，位置是从属关系，不是自由摆放。
        extent: node.parentId ? ('parent' as const) : undefined,
        draggable: layoutMode && !node.parentId && node.kind !== 'pending',
        selectable: node.kind !== 'group',
        selected: node.id === activeId,
        /*
         * 尺寸直接给 React Flow，而不是等它量完 DOM 再说。
         * 这正是「布局是数据」的意思：视口裁剪和 fitView 在第一帧就能算，
         * 不用先渲染一遍、量一遍、再排一遍。
         *
         * measured 必须一起给。受控模式下每次整体替换节点数组，都会把 React Flow
         * 之前量出来的 measured 抹掉；而 DOM 尺寸没变，ResizeObserver 就不会再触发，
         * measured 于是永远回不来。后果很隐蔽：fitView 因为算不出包围盒而静默不动，
         * 视口裁剪因为不知道节点多大而把所有节点都渲染出来——两个功能一起坏，
         * 但页面看起来完全正常。
         */
        width: node.size.width,
        height: node.size.height,
        measured: { width: node.size.width, height: node.size.height },
        zIndex: node.kind === 'group' ? 0 : 1,
        data: { node } as unknown as Record<string, unknown>
      })),
    [layout, layoutMode, activeId]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(computedNodes);
  useEffect(() => setNodes(computedNodes), [computedNodes, setNodes]);

  /**
   * 主干边（阶段交接、场次包含镜头）常显；依赖、继承、渲染这些次级边默认不画，
   * 只在选中相关节点时出现——十几个场次乘上出场角色，全画出来就是一盘意大利面。
   */
  const edges = useMemo<Edge[]>(() => {
    const touched = activeId ? edgesTouching(graph.edges, activeId) : new Set<string>();
    return graph.edges
      .filter((edge) => edge.primary || touched.has(edge.id))
      .map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: edge.relation === 'handoff' ? 'default' : 'smoothstep',
        className: `canvas-edge ${edge.relation}`,
        markerEnd: { type: MarkerType.ArrowClosed, width: 13, height: 13 },
        animated: false,
        selectable: false,
        focusable: false,
        deletable: false
      }));
  }, [graph.edges, activeId]);

  /* ---------------- 相机：会话状态，按项目分键 ---------------- */

  const cameraSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoredKeyRef = useRef('');
  const hasNodes = layout.nodes.length > 0;
  // 恢复视口那一趟要读最新的布局，但它不该因为布局重算而重跑一遍。
  const layoutRef = useRef(layout.nodes);
  layoutRef.current = layout.nodes;

  // 换项目：布局、收起状态、相机全部重置成这个项目自己的，不带上一个项目的痕迹。
  useEffect(() => {
    /*
     * 先把还没落盘的那次相机保存丢掉。
     *
     * 相机是防抖写的，定时器里捏着的是**上一个项目的 id**，而 getViewport() 读的是
     * **当前**视口——换项目那一刻它要是还活着，就会把 B 项目的位置写进 A 项目的键里，
     * A 项目下次打开直接跳到一个陌生的地方。这正是「切项目后视口串了」的成因，
     * 而且它只在切换后的头 200ms 内成立，肉眼几乎抓不到。
     */
    if (cameraSaveTimer.current) clearTimeout(cameraSaveTimer.current);
    setCollapsedNodeIds([]);
    setFocusedNodeId('');
    restoredKeyRef.current = '';
  }, [projectId]);

  // 换画布也要重新恢复一次视口：另一张画布的世界是另一个坐标系。
  useEffect(() => {
    if (cameraSaveTimer.current) clearTimeout(cameraSaveTimer.current);
    restoredKeyRef.current = '';
  }, [activeBoardKey]);

  /*
   * 等 React Flow 认下所有节点的尺寸再恢复视口。
   * 少了这道门，fitView 会在节点还没进入 store 的那一帧跑掉——它会安静地什么都不做，
   * 用户看到的是「画布停在原点，右下角缩略图却显示内容在别处」。
   */
  const nodesInitialized = useNodesInitialized();
  const restoreKey = `${projectId}::${activeBoardKey}`;
  useEffect(() => {
    if (!nodesInitialized || restoredKeyRef.current === restoreKey) return;
    // 空画布也要认下来，否则新建一张之后它会一直等「有节点」，视口永远停在上一张的位置。
    if (!hasNodes && isProductionBoard) return;
    restoredKeyRef.current = restoreKey;
    const camera = readCamera(projectId, activeBoardKey);
    if (camera) {
      void setViewport(camera);
      return;
    }
    if (!hasNodes) {
      // 全新的空白画布：把原点摆到视口中间，用户加的第一张便签才不会落在角落里。
      void setViewport({ x: 0, y: 0, zoom: 1 });
      return;
    }
    // 没存过视口就框住当前阶段，而不是整张图：几十个节点的全图视角要压到 15% 才装得下，
    // 那个倍率上什么都读不出来，用户看到的是一屏色块。
    const ids = isProductionBoard ? nodeIdsForStage(layoutRef.current, activeStage) : [];
    if (ids.length) void fitView({ nodes: ids.map((id) => ({ id })), padding: 0.2, minZoom: 0.45, maxZoom: 1 });
    else void fitView({ padding: 0.18, minZoom: 0.45, maxZoom: 1 });
  }, [nodesInitialized, restoreKey, projectId, activeBoardKey, hasNodes, isProductionBoard, fitView, setViewport, activeStage]);

  const onMoveEnd = useCallback(() => {
    // 还没为这个项目 + 画布恢复过视口，就不存：这时候屏幕上多半还是上一张的画面。
    if (!projectId || restoredKeyRef.current !== restoreKey) return;
    if (cameraSaveTimer.current) clearTimeout(cameraSaveTimer.current);
    const owner = projectId;
    const board = activeBoardKey;
    cameraSaveTimer.current = setTimeout(() => writeCamera(owner, board, getViewport()), 200);
  }, [projectId, activeBoardKey, restoreKey, getViewport]);

  useEffect(() => () => {
    if (cameraSaveTimer.current) clearTimeout(cameraSaveTimer.current);
  }, []);

  /* ---------------- 聚焦：切阶段 = 框住那个阶段的节点，不是滚到某个像素 ---------------- */

  const focusStage = useCallback(
    (stage: ProductionStageId, duration = 420) => {
      const ids = nodeIdsForStage(layout.nodes, stage);
      if (!ids.length) return;
      /*
       * minZoom 不是可选的。一个带 8 场戏、36 个镜头的场景阶段，世界尺寸接近 4000×2000，
       * 严格 fitView 会落到 15% ——那个倍率上一个字都读不出来，「聚焦」聚了个寂寞。
       * 所以聚焦的定义是「进到能读的倍率并对准这个阶段」，看不全就平移，这也是画布该有的用法。
       */
      void fitView({ nodes: ids.map((id) => ({ id })), padding: 0.2, duration, minZoom: 0.45, maxZoom: 1 });
    },
    [fitView, layout.nodes]
  );

  const previousStageRef = useRef<ProductionStageId | null>(null);
  useEffect(() => {
    if (!hasNodes || !isProductionBoard) return;
    // 首次不动：这一趟要么恢复上次的视口，要么 fitView 全图，抢在它前面聚焦会打架。
    if (previousStageRef.current === null) {
      previousStageRef.current = activeStage;
      return;
    }
    if (previousStageRef.current === activeStage) return;
    previousStageRef.current = activeStage;
    focusStage(activeStage);
  }, [activeStage, hasNodes, isProductionBoard, focusStage]);

  /* ---------------- 交互 ---------------- */

  const actions = useMemo<CanvasActions>(
    () => ({
      onOpenCard: (node: ProductionCanvasNode) => {
        // stage 为 null 的只有便签，它没有审查面板可进。
        if (!node.card || !node.lane || !node.stage) return;
        // 子卡挂在别人的泳道下面，但审查要进它自己那个阶段。
        const lane = node.stage !== node.lane.stage ? { ...node.lane, stage: node.stage } : node.lane;
        setFocusedNodeId(node.id);
        onOpenCard(lane, node.card);
      },
      onOpenLane: (lane: StoryCanvasLane) => onOpenCard(lane, null),
      onRegenerate,
      onReplace,
      onToggleGroup: (cardId: string) =>
        setCollapsedNodeIds((prev) =>
          prev.includes(cardId) ? prev.filter((id) => id !== cardId) : [...prev, cardId]
        ),
      isCollapsed: (cardId: string) => collapsedNodeIds.includes(cardId),
      onToggleLaneGroups: (lane: StoryCanvasLane) => {
        const ids = lane.cards.filter((card) => card.children?.length).map((card) => card.id);
        if (!ids.length) return;
        const allCollapsed = ids.every((id) => collapsedNodeIds.includes(id));
        setCollapsedNodeIds((prev) =>
          allCollapsed
            ? prev.filter((id) => !ids.includes(id))
            : [...new Set([...prev, ...ids])]
        );
      },
      laneGroupsCollapsed: (lane: StoryCanvasLane) => {
        const ids = lane.cards.filter((card) => card.children?.length).map((card) => card.id);
        return ids.length > 0 && ids.every((id) => collapsedNodeIds.includes(id));
      },
      onStickyChange: (stickyId, patch) => {
        onBoardsChange(
          updateBoard(boards, activeBoardKey, (board) => ({
            ...board,
            stickies: board.stickies.map((sticky) =>
              sticky.id === stickyId
                ? {
                    ...sticky,
                    ...patch,
                    tone: (patch.tone as CanvasStickyTone) || sticky.tone,
                    scope: (patch.scope as CanvasStickyScope) || sticky.scope
                  }
                : sticky
            )
          }))
        );
      },
      onStickyRemove: (stickyId) => {
        onBoardsChange(
          updateBoard(boards, activeBoardKey, (board) => ({
            ...board,
            stickies: board.stickies.filter((sticky) => sticky.id !== stickyId)
          }))
        );
      }
    }),
    [onOpenCard, onRegenerate, onReplace, collapsedNodeIds, boards, activeBoardKey, onBoardsChange]
  );

  const onNodeDragStop = useCallback(
    (_event: unknown, node: Node) => {
      // 簇里的镜头跟着簇走，位置是从属关系，不单独记。
      if (node.parentId) return;
      const kind = (node.data as unknown as { node?: ProductionCanvasNode })?.node?.kind;
      const point = { x: node.position.x, y: node.position.y };

      if (kind === 'sticky') {
        // 便签的位置是它自己的属性，不是「对自动排版的覆盖」——它压根没被自动排过版。
        onBoardsChange(
          updateBoard(boards, activeBoardKey, (board) => ({
            ...board,
            stickies: board.stickies.map((sticky) =>
              sticky.id === node.id ? { ...sticky, position: point } : sticky
            )
          }))
        );
        return;
      }

      /*
       * 顺手清掉已经不存在的节点。
       * 重新生成一版分镜之后卡片 id 全变，不清理的话这个文件只增不减——
       * 而它现在是要跟着项目归档走的，攒几十轮就成了一份没人看得懂的坐标垃圾。
       */
      const alive = new Set(layout.nodes.filter((item) => !item.parentId).map((item) => item.id));
      onBoardsChange(
        updateBoard(boards, activeBoardKey, (board) => {
          const layoutNext = { ...board.layout, [node.id]: point };
          for (const id of Object.keys(layoutNext)) {
            if (!alive.has(id)) delete layoutNext[id];
          }
          return { ...board, layout: layoutNext };
        })
      );
    },
    [boards, activeBoardKey, onBoardsChange, layout.nodes]
  );

  const resetLayout = useCallback(() => {
    onBoardsChange(updateBoard(boards, activeBoardKey, (board) => ({ ...board, layout: {} })));
    window.requestAnimationFrame(() => fitView({ padding: 0.18, duration: 320, maxZoom: 1 }));
  }, [boards, activeBoardKey, onBoardsChange, fitView]);

  /* ---------------- 画布与便签的增删改 ---------------- */

  const addSticky = useCallback(() => {
    if (!activeBoard) return;
    /*
     * 落在当前视口正中，而不是世界原点。
     * 放原点的话，用户平移到别处再点「加便签」，新便签会出现在屏幕外——
     * 看起来就是「点了没反应」。
     *
     * 视口尺寸从 React Flow 的 store 里读，不去量 DOM：它本来就一直跟着容器变，
     * 再量一遍既多余，也会把「画布不测量 DOM」这条约束开一个口子。
     */
    const { width, height, transform } = store.getState();
    const [tx, ty, zoom] = transform;
    const center = { x: (width / 2 - tx) / zoom, y: (height / 2 - ty) / zoom };
    const sticky = createSticky(activeBoard, {
      x: Math.round(center.x - NODE_SIZE.sticky.width / 2),
      y: Math.round(center.y - NODE_SIZE.sticky.height / 2)
    });
    onBoardsChange(
      updateBoard(boards, activeBoard.id, (board) => ({ ...board, stickies: [...board.stickies, sticky] }))
    );
    setFocusedNodeId(sticky.id);
  }, [activeBoard, boards, onBoardsChange, store]);

  const addBoard = useCallback(() => {
    const board = createBoard(boards);
    onBoardsChange([...boards, board]);
    selectBoard(board.id);
    setRenamingBoardId(board.id);
  }, [boards, onBoardsChange, selectBoard]);

  const renameBoard = useCallback(
    (boardId: string, name: string) => {
      const trimmed = name.trim();
      setRenamingBoardId('');
      if (!trimmed) return;
      onBoardsChange(updateBoard(boards, boardId, (board) => ({ ...board, name: trimmed })));
    },
    [boards, onBoardsChange]
  );

  const deleteBoard = useCallback(
    (board: CanvasBoard) => {
      // 删掉的是用户自己写的内容，不能默默执行。
      const count = board.stickies.length;
      const message = count
        ? `删除画布「${board.name}」？上面的 ${count} 张便签会一起删掉，撤不回来。`
        : `删除画布「${board.name}」？`;
      if (!window.confirm(message)) return;
      onBoardsChange(removeBoard(boards, board.id));
      selectBoard(PRODUCTION_BOARD_ID);
    },
    [boards, onBoardsChange, selectBoard]
  );

  useEffect(() => {
    if (!reviewOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseReview();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [reviewOpen, onCloseReview]);

  const onPaneKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.target !== event.currentTarget) return;
      if (event.key === '=' || event.key === '+') zoomIn({ duration: 160 });
      else if (event.key === '-' || event.key === '_') zoomOut({ duration: 160 });
      else if (event.key === '0') fitView({ padding: 0.18, duration: 260, maxZoom: 1 });
      else return;
      event.preventDefault();
    },
    [zoomIn, zoomOut, fitView]
  );

  // 抽屉打开时画布在遮罩之下：既不该被点到，也不该被 Tab 到。
  const boardInert = reviewOpen ? ({ inert: '' } as Record<string, string>) : {};
  const empty = !hasNodes;
  const bounds = graphBounds(layout.nodes);

  return (
    <section className="story-canvas" aria-label="渐进式视频生产画板">
      <div
        className={`canvas-surface lod-${tier} ${layoutMode ? 'layout-mode' : ''}`}
        {...boardInert}
        onKeyDown={onPaneKeyDown}
      >
        <CanvasActionsContext.Provider value={actions}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={canvasNodeTypes}
            onNodesChange={onNodesChange}
            onNodeDragStop={onNodeDragStop}
            onMoveEnd={onMoveEnd}
            onPaneClick={() => setFocusedNodeId('')}
            minZoom={MIN_ZOOM}
            maxZoom={MAX_ZOOM}
            /* 视口之外的节点不进 DOM。三百个节点里通常只有十几个在屏幕上。 */
            onlyRenderVisibleElements
            nodesDraggable={layoutMode}
            nodesConnectable={false}
            /* 用户不能改依赖边：后端生产阶段是固定状态机，前端放开连线只会造出
               「看起来改了、实际上没改」的假能力。 */
            edgesFocusable={false}
            elevateNodesOnSelect={false}
            deleteKeyCode={null}
            multiSelectionKeyCode={null}
            selectionOnDrag={false}
            /* 触控板两指 = 平移，捏合 / Ctrl+滚轮 = 以光标为中心缩放，空白处拖拽 = 平移。 */
            panOnScroll
            zoomOnScroll={false}
            zoomOnPinch
            zoomOnDoubleClick={false}
            panOnDrag
            proOptions={{ hideAttribution: false }}
          >
            <Background variant={BackgroundVariant.Dots} gap={28} size={1} color="rgba(255,255,255,0.09)" />
            {!empty && (
              <MiniMap
                pannable
                zoomable
                ariaLabel="画布缩略图"
                maskColor="rgba(6, 8, 11, 0.72)"
                nodeClassName={(node) => `canvas-minimap-node ${node.type || ''}`}
              />
            )}
          </ReactFlow>
        </CanvasActionsContext.Provider>

        <div className="canvas-boards" role="tablist" aria-label="画布">
          {boards.map((board) => {
            const active = board.id === activeBoardKey;
            if (renamingBoardId === board.id) {
              return (
                <input
                  key={board.id}
                  className="canvas-board-rename"
                  autoFocus
                  defaultValue={board.name}
                  aria-label="画布名称"
                  onBlur={(event) => renameBoard(board.id, event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur();
                    if (event.key === 'Escape') setRenamingBoardId('');
                  }}
                />
              );
            }
            return (
              <span key={board.id} className={`canvas-board-chip ${active ? 'on' : ''}`}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => selectBoard(board.id)}
                  onDoubleClick={() => board.kind === 'custom' && setRenamingBoardId(board.id)}
                  title={board.kind === 'custom' ? '双击改名' : '生产流程自动生成的画布'}
                >
                  {board.name}
                </button>
                {/* 生产画布是生产流程的视图，不是用户建出来的东西，所以删不掉。 */}
                {board.kind === 'custom' && active && (
                  <button
                    type="button"
                    className="canvas-board-delete"
                    aria-label={`删除画布「${board.name}」`}
                    onClick={() => deleteBoard(board)}
                  >
                    <IconX />
                  </button>
                )}
              </span>
            );
          })}
          <button type="button" className="canvas-board-add" onClick={addBoard} aria-label="新建画布">
            ＋ 新建画布
          </button>
        </div>

        <div className="canvas-toolbar" role="toolbar" aria-label="画布视图控制">
          <button type="button" onClick={() => zoomOut({ duration: 160 })} aria-label="缩小">−</button>
          <span className="canvas-zoom-readout" aria-live="off">{zoomPercent}%</span>
          <button type="button" onClick={() => zoomIn({ duration: 160 })} aria-label="放大">+</button>
          <span className="canvas-toolbar-sep" aria-hidden="true" />
          <button type="button" onClick={() => fitView({ padding: 0.18, duration: 320, maxZoom: 1 })}>
            适应全部
          </button>
          {isProductionBoard && (
            <button type="button" onClick={() => focusStage(activeStage)}>聚焦当前阶段</button>
          )}
          <span className="canvas-toolbar-sep" aria-hidden="true" />
          <button type="button" onClick={addSticky} title="在视口中间放一张便签。便签不参与生成，只是给人看的。">
            ＋ 便签
          </button>
          <button
            type="button"
            className={layoutMode ? 'on' : ''}
            aria-pressed={layoutMode}
            onClick={() => setLayoutMode((prev) => !prev)}
            title="打开后才能拖动节点。默认锁定是为了避免把画布当成可以随便改依赖的地方。"
          >
            布局模式
          </button>
          {Object.keys(activeBoard?.layout || {}).length > 0 && (
            <button type="button" onClick={resetLayout}>重置布局</button>
          )}
        </div>

        {empty && (
          <p className="canvas-empty-hint">
            {isProductionBoard
              ? '还没有可展示的产物。生成第一版之后，这里会出现产物卡。'
              : '空白画布。点工具条上的「＋ 便签」开始往上放东西。'}
          </p>
        )}
        <span className="canvas-scale-readout" aria-hidden="true">
          {Math.round(bounds.width)} × {Math.round(bounds.height)} 世界单位 · {layout.nodes.length} 个节点
        </span>
      </div>

      {reviewContent && (
        <>
          <div
            className={`story-review-scrim ${reviewOpen ? 'open' : ''}`}
            onClick={onCloseReview}
            aria-hidden="true"
          />
          {/* 审查抽屉活在屏幕坐标里，不进画布的变换：缩放不该把表单缩成马赛克，
              也不该让按钮的点击热区跟着漂。 */}
          <aside
            className={`story-review ${reviewSize} ${reviewOpen ? 'open' : ''}`}
            role="dialog"
            aria-label={`${reviewTitle}审查`}
            aria-hidden={!reviewOpen}
          >
            <header className="story-review-head">
              <div>
                <small>{reviewOwner}</small>
                <strong>{reviewTitle}</strong>
              </div>
              <button type="button" onClick={onCloseReview} aria-label="收起审查面板">
                <IconX />
              </button>
            </header>
            <div className="story-review-body">{reviewContent}</div>
          </aside>
        </>
      )}
    </section>
  );
}
