import { createContext, memo, useContext, useEffect, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { IconRefresh, IconUpload, IconX } from '../icons';
import { StoryCard, productionStageLabel, productionStatusLabel } from './StoryCard';
import type { CanvasStickyPayload, ProductionCanvasNode, StoryCanvasLane } from './types';

/**
 * 节点回调走 context，不走 node.data。
 *
 * 放进 data 的话，父组件每渲染一次就会生成一批新函数，React Flow 会认为
 * 每个节点的 data 都变了，三百个节点全部重渲染——memo 直接失效。
 */
export type CanvasActions = {
  onOpenCard: (node: ProductionCanvasNode) => void;
  onOpenLane: (lane: StoryCanvasLane) => void;
  onRegenerate: (lane: StoryCanvasLane) => void;
  onReplace: (lane: StoryCanvasLane) => void;
  onToggleGroup: (cardId: string) => void;
  isCollapsed: (cardId: string) => boolean;
  /** 一条泳道里所有场景簇一起展开 / 收起。 */
  onToggleLaneGroups: (lane: StoryCanvasLane) => void;
  laneGroupsCollapsed: (lane: StoryCanvasLane) => boolean;
  /** 便签改内容。整条改，不做字段级 diff——便签就这么点东西。 */
  onStickyChange: (stickyId: string, patch: Partial<CanvasStickyPayload>) => void;
  onStickyRemove: (stickyId: string) => void;
};

const noop = () => undefined;
export const CanvasActionsContext = createContext<CanvasActions>({
  onOpenCard: noop,
  onOpenLane: noop,
  onRegenerate: noop,
  onReplace: noop,
  onToggleGroup: noop,
  isCollapsed: () => false,
  onToggleLaneGroups: noop,
  laneGroupsCollapsed: () => false,
  onStickyChange: noop,
  onStickyRemove: noop
});

export type CanvasNodeData = { node: ProductionCanvasNode };

/** 连接点。用户不能连线（后端流程是固定状态机，让人随便连只会造出假能力），所以句柄不可见也不可交互。 */
function EdgePorts() {
  return (
    <>
      <Handle type="target" position={Position.Left} isConnectable={false} className="canvas-port" />
      <Handle type="source" position={Position.Right} isConnectable={false} className="canvas-port" />
    </>
  );
}

function StageNodeView({ data }: NodeProps) {
  const { node } = data as unknown as CanvasNodeData;
  const actions = useContext(CanvasActionsContext);
  const lane = node.lane;
  if (!lane) return null;
  return (
    <div className={`canvas-stage-node ${lane.status}`}>
      <EdgePorts />
      <header>
        <span className="story-lane-emoji" aria-hidden="true">{lane.emoji}</span>
        <strong>{lane.owner}</strong>
        <em className="story-lane-status">{productionStatusLabel[lane.status]}</em>
      </header>
      <div className="canvas-stage-node-foot">
        <span className="story-lane-stage">{productionStageLabel[lane.stage]}</span>
        <div className="story-lane-actions">
          {lane.cards.some((card) => card.children?.length) && (
            <button
              type="button"
              className="story-lane-expand"
              onClick={() => actions.onToggleLaneGroups(lane)}
            >
              {actions.laneGroupsCollapsed(lane) ? '全部展开' : '全部收起'}
            </button>
          )}
          <button
            type="button"
            onClick={() => actions.onRegenerate(lane)}
            aria-label={`重新生成${productionStageLabel[lane.stage]}`}
          >
            <IconRefresh /> 重新生成
          </button>
          <button
            type="button"
            onClick={() => actions.onReplace(lane)}
            aria-label={`替换${productionStageLabel[lane.stage]}`}
          >
            <IconUpload /> 替换
          </button>
        </div>
      </div>
    </div>
  );
}

function CardNodeView({ data, selected }: NodeProps) {
  const { node } = data as unknown as CanvasNodeData;
  const actions = useContext(CanvasActionsContext);
  // stage 为 null 的节点（便签）不会走到这里；写出来是为了让类型和事实一致。
  if (!node.card || !node.lane || !node.stage) return null;
  return (
    <div className="canvas-card-node">
      <EdgePorts />
      <StoryCard
        card={node.card}
        stage={node.stage}
        laneStatus={node.lane.status}
        selected={Boolean(selected)}
        onOpen={() => actions.onOpenCard(node)}
      />
    </div>
  );
}

/**
 * 场景簇。它是场次卡和它的镜头共同的父节点：拖它，里面的所有东西
 * 连同连线一起走——因为镜头的坐标本来就是相对它的，没有任何一处需要「同步」。
 */
function GroupNodeView({ data }: NodeProps) {
  const { node } = data as unknown as CanvasNodeData;
  const actions = useContext(CanvasActionsContext);
  const collapsed = actions.isCollapsed(node.entityId);
  return (
    <div className={`canvas-group-node ${collapsed ? 'collapsed' : ''}`}>
      <button
        type="button"
        className="canvas-group-toggle"
        onClick={() => actions.onToggleGroup(node.entityId)}
        aria-expanded={!collapsed}
        aria-label={`${collapsed ? '展开' : '收起'}这一场的镜头：${node.childrenLabel || '子产物'}`}
      >
        <span className="story-tree-caret" aria-hidden="true">{collapsed ? '▸' : '▾'}</span>
        {node.childrenLabel || '子产物'}
      </button>
    </div>
  );
}

function NoteNodeView({ data }: NodeProps) {
  const { node } = data as unknown as CanvasNodeData;
  return (
    <div className="canvas-note-node">
      <EdgePorts />
      <p>{node.lane?.note}</p>
    </div>
  );
}

function EmptyNodeView({ data }: NodeProps) {
  const { node } = data as unknown as CanvasNodeData;
  const actions = useContext(CanvasActionsContext);
  const lane = node.lane;
  if (!lane) return null;
  return (
    <div className="canvas-card-node">
      <EdgePorts />
      <button type="button" className="story-card empty-card" onClick={() => actions.onOpenLane(lane)}>
        <span className="story-card-kicker">{productionStageLabel[lane.stage]}</span>
        <strong>还没有可审查的产物</strong>
        <p>{lane.emptyHint || '上一阶段确认后，这条泳道才会出现产物卡。'}</p>
      </button>
    </div>
  );
}

function PendingNodeView({ data }: NodeProps) {
  const { node } = data as unknown as CanvasNodeData;
  if (!node.stage) return null;
  return (
    <div className="canvas-card-node" role="status" aria-live="polite">
      <EdgePorts />
      <div className="story-card skeleton-card">
        <span className="story-card-kicker">{productionStageLabel[node.stage]}</span>
        <strong>{node.progressText || `正在生成${productionStageLabel[node.stage]}`}</strong>
        <p>上一版草稿不会作为本轮结果进入审批，完成后再显示新版本。</p>
      </div>
    </div>
  );
}

/**
 * 流水线的终点：那条合出来的成片。
 *
 * 它从第一分钟就摆在最右边，哪怕视频阶段还没解锁——终点一直可见，
 * 用户才知道这一路是奔着什么去的；等它真的有文件了，这里直接能下载。
 */
function FinalCutNodeView({ data }: NodeProps) {
  const { node } = data as unknown as CanvasNodeData;
  const outcome = node.outcome;
  if (!outcome) return null;
  return (
    <div className="canvas-finalcut-node">
      <EdgePorts />
      <span className="story-card-kicker">
        成片
        <em className={`story-card-status ${outcome.statusTone || ''}`}>{outcome.statusLabel}</em>
      </span>
      <strong>{outcome.title}</strong>
      <p>{outcome.body}</p>
      {typeof outcome.progressPercent === 'number' && (
        <span className="story-card-progress">
          <span className="story-card-progress-bar">
            <i style={{ width: `${Math.max(0, Math.min(100, outcome.progressPercent))}%` }} />
          </span>
          <em>{outcome.progressPercent}%</em>
        </span>
      )}
      {outcome.meta && <em className="story-card-meta">{outcome.meta}</em>}
      {outcome.fileUrl && (
        <a className="story-card-cta" href={outcome.fileUrl} download>
          {outcome.ctaLabel || '下载成片'}
        </a>
      )}
    </div>
  );
}

const STICKY_TONE_LABEL: Record<string, string> = {
  neutral: '默认',
  accent: '重点',
  warn: '待办',
  danger: '风险'
};

/** 便签上那枚标记的短文案。用 productionStageLabel 会读成「参与视频任务」，别扭。 */
const STICKY_SCOPE_BADGE: Record<string, string> = {
  all: '参与生成',
  script: '参与剧本',
  character: '参与角色',
  scene: '参与场景',
  storyboard: '参与分镜',
  video: '参与视频'
};

/** 和 lib/canvasBoards.ts 的 STICKY_SCOPES 一一对应。 */
const STICKY_SCOPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'note', label: '只是笔记' },
  { value: 'all', label: '参与全部阶段' },
  { value: 'script', label: '参与剧本生成' },
  { value: 'character', label: '参与角色生成' },
  { value: 'scene', label: '参与场景生成' },
  { value: 'storyboard', label: '参与分镜生成' },
  { value: 'video', label: '参与视频生成' }
];

/**
 * 用户自己放上去的便签。
 *
 * 它刻意长得和产物卡不一样：虚线边、纸张色、没有「审查 →」。
 * 做成产物卡的样子是危险的——用户会以为在这儿写一句「这一镜要特写」能影响生成，
 * 而实际上什么都不会发生。看起来像什么，就会被当成什么用。
 *
 * 编辑是就地改，但**失焦才提交**：每敲一个字就写一次工作区的话，
 * 版本号会跟着字数涨，防抖归档也会被打成连发。
 */
function StickyNodeView({ data, selected }: NodeProps) {
  const { node } = data as unknown as CanvasNodeData;
  const actions = useContext(CanvasActionsContext);
  const sticky = node.sticky;
  const [title, setTitle] = useState(sticky?.title ?? '');
  const [body, setBody] = useState(sticky?.body ?? '');

  // 外部改了（撤销、换画布、别处编辑）就跟上，但不要打断正在输入的那一次。
  useEffect(() => {
    setTitle(sticky?.title ?? '');
    setBody(sticky?.body ?? '');
  }, [sticky?.id, sticky?.title, sticky?.body]);

  if (!sticky) return null;
  const commit = () => {
    if (title === sticky.title && body === sticky.body) return;
    actions.onStickyChange(sticky.id, { title, body });
  };

  return (
    <div
      className={`canvas-sticky-node tone-${sticky.tone} ${selected ? 'selected' : ''} ${
        sticky.scope === 'note' ? '' : 'live'
      }`}
    >
      <div className="canvas-sticky-head">
        {sticky.scope !== 'note' && (
          <em className="canvas-sticky-live" title="这条便签会作为用户要求进入生成提示词">
            {STICKY_SCOPE_BADGE[sticky.scope] || '参与生成'}
          </em>
        )}
        {/* nodrag：在输入框里拖选文字，不该把整张便签一起拖走。 */}
        <input
          className="canvas-sticky-title nodrag"
          value={title}
          placeholder="便签标题"
          aria-label="便签标题"
          onChange={(event) => setTitle(event.target.value)}
          onBlur={commit}
        />
        <button
          type="button"
          className="canvas-sticky-remove nodrag"
          aria-label={`删除便签${sticky.title ? `「${sticky.title}」` : ''}`}
          onClick={() => actions.onStickyRemove(sticky.id)}
        >
          <IconX />
        </button>
      </div>
      {/* nowheel：在便签里滚动正文，不该变成缩放整块画布。 */}
      <textarea
        className="canvas-sticky-body nodrag nowheel"
        value={body}
        placeholder="写点什么…这张便签不参与生成，只是给人看的。"
        aria-label="便签正文"
        onChange={(event) => setBody(event.target.value)}
        onBlur={commit}
      />
      <div className="canvas-sticky-foot">
        {/*
          参与生成的便签必须一眼看得出来。看不出来的话，用户不知道哪几条正在
          影响模型，改坏了也查不到是谁改的。
        */}
        <select
          className="canvas-sticky-scope nodrag"
          value={sticky.scope}
          aria-label="这条便签作用到哪个阶段"
          title="标记为参与生成后，这条便签会作为用户要求进入对应阶段的提示词。"
          onChange={(event) => actions.onStickyChange(sticky.id, { scope: event.target.value })}
        >
          {STICKY_SCOPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <div className="canvas-sticky-tones" role="group" aria-label="便签配色">
        {Object.keys(STICKY_TONE_LABEL).map((tone) => (
          <button
            key={tone}
            type="button"
            className={`canvas-sticky-tone tone-${tone} nodrag ${sticky.tone === tone ? 'on' : ''}`}
            aria-label={STICKY_TONE_LABEL[tone]}
            aria-pressed={sticky.tone === tone}
            title={STICKY_TONE_LABEL[tone]}
            onClick={() => actions.onStickyChange(sticky.id, { tone })}
          />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * nodeTypes 必须定义在组件外面。放在渲染函数里，每次渲染都是一个新对象，
 * React Flow 会把所有节点当成换了类型，整块画布重建。
 */
export const canvasNodeTypes = {
  stage: memo(StageNodeView),
  group: memo(GroupNodeView),
  script: memo(CardNodeView),
  character: memo(CardNodeView),
  scene: memo(CardNodeView),
  shot: memo(CardNodeView),
  video: memo(CardNodeView),
  note: memo(NoteNodeView),
  empty: memo(EmptyNodeView),
  pending: memo(PendingNodeView),
  sticky: memo(StickyNodeView),
  finalcut: memo(FinalCutNodeView)
};
