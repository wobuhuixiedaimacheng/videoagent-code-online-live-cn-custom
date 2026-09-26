import type { ProductionStageId, ProductionStageStatus } from '../../lib/types';

/**
 * 画布的数据契约。
 *
 * 这一层的存在理由只有一条：**布局数据和生产资产数据必须分开**。
 * 卡片里那些字段（标题、图、状态）是生产资产，来自 workspace 文件；
 * 这里的 position/size/parentId 是布局，属于「用户怎么摆」，不进资产版本。
 * 两者混在一起，就会出现「改了排版 = 改了产物」这种假变更。
 */

/** 画布上的一张产物卡：一个角色、一个场景、一个镜头，而不是一个抽象阶段。 */
export type StoryCanvasCard = {
  id: string;
  kicker?: string;
  title: string;
  body?: string;
  meta?: string;
  /** 2–3 个核心标签。多了就不是总览卡了。 */
  tags?: string[];
  /** 单张竖图（角色立绘）走左文右图布局。 */
  portrait?: string;
  /** 多张图（场景图、镜头图）走文字下方的图片网格。 */
  images?: string[];
  emptyImageHint?: string;
  /**
   * 产物自己的状态，覆盖泳道级状态。
   * 一条泳道里的五个角色可以各审各的：整条泳道说「待确认」，
   * 不代表其中每个角色都还没审完。
   */
  statusLabel?: string;
  statusTone?: string;
  progressPercent?: number;
  progressLabel?: string;
  /** 操作按钮文案。缺省是「审查 →」，有状态的产物按状态给不同动作。 */
  ctaLabel?: string;
  /**
   * 图片下面那句说明。用来标注这张图的来路——镜头卡上那张往往是从场次继承来的共用图，
   * 不标出来就是在冒充「这一镜自己的首帧」。
   */
  imageNote?: string;
  /**
   * 这张卡里出场的人。场次和镜头都只存角色 id，界面上要给脸：
   * 一场戏、一个镜头，谁在里面演，是比任何一句画面描述都先被读到的信息。
   */
  cast?: StoryCanvasPerson[];
  /**
   * 挂在这张卡下面的子产物（一场戏拆出来的镜头）。
   * 归一化成 nodes + edges 时，这里会变成 contains 边 + parentId，不再是渲染时的递归。
   */
  children?: StoryCanvasCard[];
  /** 展开条上的文案，例如「5 个镜头 · 15s」。 */
  childrenLabel?: string;
  /**
   * 这张卡真正属于哪个阶段。子卡挂在别的阶段的泳道下面（镜头挂在场次下面），
   * 不带上它，点开镜头会进场景的审查面板——挂在哪儿和是什么，是两件事。
   */
  stage?: ProductionStageId;

  /* ---- 下面三个字段是给图用的：把「关系」写成数据，而不是让画布去猜 ---- */

  /**
   * 这张卡依赖谁（卡 id）。例如一场戏依赖它出场的角色卡。
   * 以前的连线是「上一泳道最后一张 → 下一泳道第一张」，那是排版顺序，不是依赖。
   */
  dependsOn?: string[];
  /** 这张卡的图是从谁那里沿用的（卡 id）。对应 imageNote 那句「沿用场景图」。 */
  inheritsFrom?: string;
  /** 这个渲染任务渲的是哪一镜（卡 id）。 */
  renderOf?: string;
};

export type StoryCanvasPerson = {
  id: string;
  name: string;
  avatar?: string;
};

/** 一条泳道 = 一个阶段负责人交付的一批产物。归一化之后它变成一个 stage 节点 + 一列卡片节点。 */
export type StoryCanvasLane = {
  stage: ProductionStageId;
  emoji: string;
  owner: string;
  status: ProductionStageStatus;
  cards: StoryCanvasCard[];
  emptyHint?: string;
  /**
   * 这条泳道的产物挂在别处时说明去向（分镜挂到了场景卡下面）。
   * 有 note 的泳道不再显示「还没有可审查的产物」——那句话在这里是错的。
   */
  note?: string;
};

/**
 * 流水线的终点：合出来的那条成片。
 *
 * 它不是某个阶段的产物卡，所以不进 lanes——视频阶段没解锁时 lanes 里根本没有视频，
 * 而「最后要合成一条片子」这件事从第一分钟起就成立，终点该一直在那儿摆着。
 */
export type StoryCanvasOutcome = {
  title: string;
  /** 一句话说清现在卡在哪：等分镜确认、等片段渲染、正在合成、可以下载。 */
  body: string;
  meta?: string;
  statusLabel: string;
  /** 复用卡片状态色：ready / warning / danger / done。 */
  statusTone?: string;
  progressPercent?: number;
  /** 有成片文件时的下载地址。空表示还没有可下载的东西。 */
  fileUrl?: string;
  ctaLabel?: string;
};

/**
 * 节点类型。
 * - stage：阶段列头，带负责人、状态、重新生成/替换。它是 handoff 链的锚点。
 * - group：场景簇，一张场次卡 + 挂在它下面的镜头。拖它，里面的东西一起走。
 * - script / character / scene / shot / video：五种产物卡。分开是因为尺寸和 LOD 规则不同。
 * - note / empty / pending：泳道级的说明、空态、生成中骨架。
 * - finalcut：整条流水线的终点，那条合出来的成片。它不属于任何一个阶段列——
 *   阶段是「谁在做」，成片是「做出来的那一个东西」，两者混在一起会让终点在
 *   视频阶段未解锁时整个消失，而它恰恰是最该一直看得见的那个节点。
 * - sticky：用户自己放上去的便签。它不属于生产流水线的任何一部分，所以既没有 stage，
 *   也不产生任何自动边——它是「人写在画布上的话」，不是产物。
 */
export type CanvasNodeKind =
  | 'stage'
  | 'group'
  | 'script'
  | 'character'
  | 'scene'
  | 'shot'
  | 'video'
  | 'note'
  | 'empty'
  | 'pending'
  | 'finalcut'
  | 'sticky';

/**
 * 边的语义。画布不再用「谁排在谁后面」推关系，每条边都要说得出自己是什么：
 * - handoff：阶段之间的交接（剧本 → 角色 → 场景 → 分镜 → 视频）。
 * - contains：包含（阶段包含它的产物；场次包含它的镜头）。
 * - depends_on：依赖（这场戏用到这个角色）。
 * - inherits：继承（这一镜的首帧沿用场次图）。
 * - renders：渲染（这个视频任务渲的是这一镜）。
 */
export type CanvasEdgeRelation = 'handoff' | 'contains' | 'depends_on' | 'inherits' | 'renders';

export type CanvasSize = { width: number; height: number };
export type CanvasPoint = { x: number; y: number };

/**
 * 世界坐标里的一个节点。position 相对父节点（没有父节点就是相对世界原点），
 * 和 React Flow 的 parentId 语义一致。
 */
export type ProductionCanvasNode = {
  id: string;
  kind: CanvasNodeKind;
  /**
   * 这个节点属于哪个生产阶段。镜头节点挂在场景簇下面，但它的 stage 是 storyboard。
   *
   * null 表示「不属于任何阶段」，目前只有便签是这样。这里不能拿某个阶段当占位值：
   * 填成 'script' 的话，「聚焦剧本阶段」会连用户随手写的便签一起框进去。
   */
  stage: ProductionStageId | null;
  /** 对应的业务实体 id（角色 id、场次 id、镜头 id…）。空串表示这是纯结构节点。 */
  entityId: string;
  parentId?: string;
  position: CanvasPoint;
  size: CanvasSize;
  /** 锁定的节点不能拖。默认全锁，开「布局模式」才解锁顶层节点。 */
  locked: boolean;
  /** 卡片节点带产物数据；stage/group/note 节点为 null。 */
  card: StoryCanvasCard | null;
  /** stage / note / empty / pending 节点用的泳道数据。 */
  lane: StoryCanvasLane | null;
  /** 展开条文案，只有 group 有。 */
  childrenLabel?: string;
  /** pending 骨架上的进度文案。 */
  progressText?: string;
  /** finalcut 节点的数据。 */
  outcome?: StoryCanvasOutcome;
  /** sticky 节点的数据。 */
  sticky?: CanvasStickyPayload;
};

/** 便签在画布上的呈现数据。真源在工作区的 .aigc/canvas-boards.json 里。 */
export type CanvasStickyPayload = {
  id: string;
  title: string;
  body: string;
  tone: string;
  /** 参与哪个阶段的生成。'note' 表示只写给人看。 */
  scope: string;
};

export type ProductionCanvasEdge = {
  id: string;
  source: string;
  target: string;
  relation: CanvasEdgeRelation;
  /**
   * 主干边（handoff / contains）常显；次级边（depends_on / inherits / renders）默认隐藏，
   * 只在选中相关节点时才画出来——否则十几个场次乘上出场角色，屏幕上就是一盘意大利面。
   */
  primary: boolean;
};

export type ProductionCanvasGraph = {
  nodes: ProductionCanvasNode[];
  edges: ProductionCanvasEdge[];
};

/** 用户手动挪过的节点位置。属于文档，不属于生产资产。 */
export type CanvasLayoutOverrides = Record<string, CanvasPoint>;

/** 相机。属于会话，不属于文档——所以它不进 undo 历史，也不跟项目资产一起存版本。 */
export type CanvasCamera = { x: number; y: number; zoom: number };

export const STAGE_ORDER: ProductionStageId[] = ['script', 'character', 'scene', 'storyboard', 'video'];
