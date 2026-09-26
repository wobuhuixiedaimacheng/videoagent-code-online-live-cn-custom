import { memo } from 'react';
import type { ProductionStageId, ProductionStageStatus } from '../../lib/types';
import { IconCamera } from '../icons';
import type { StoryCanvasCard } from './types';

export const productionStageLabel: Record<ProductionStageId, string> = {
  script: '剧本',
  character: '角色',
  scene: '场景',
  storyboard: '分镜',
  video: '视频任务'
};

/** 状态说人话，不再让用户从边框颜色去猜。 */
export const productionStatusLabel: Record<ProductionStageStatus, string> = {
  locked: '未解锁',
  generating: '生成中',
  ready_for_review: '待确认',
  confirmed: '已确认',
  stale: '需重做',
  rendering: '渲染中',
  qa_pending: '质检中',
  qa_failed: '质检未过',
  stitching: '合成成片中',
  completed: '已完成',
  failed: '已中断'
};

type StoryCardProps = {
  card: StoryCanvasCard;
  stage: ProductionStageId;
  laneStatus: ProductionStageStatus;
  selected: boolean;
  onOpen: () => void;
};

/**
 * 一张产物卡。和改造前是同一套 DOM 和同一套 class，改的只有它现在住在世界坐标里：
 * 外框由布局给定，内容超出就截断，而不是反过来让内容把布局撑歪。
 *
 * 图片一律 lazy + async 解码。画布上一屏之外还挂着几十张图，同步解码会把
 * 平移的那一帧直接拖掉。
 */
function StoryCardView({ card, stage, laneStatus, selected, onOpen }: StoryCardProps) {
  return (
    <article
      className={`story-card ${card.portrait !== undefined ? 'split' : ''} ${selected ? 'selected' : ''}`}
      data-kind={stage}
    >
      <button type="button" className="story-card-main" onClick={onOpen}>
        <span className="story-card-kicker">
          {card.kicker || productionStageLabel[stage]}
          <em className={`story-card-status ${card.statusTone || ''}`}>
            {card.statusLabel || productionStatusLabel[laneStatus]}
          </em>
        </span>
        <strong>{card.title}</strong>
        {card.body && <p>{card.body}</p>}
        {card.tags && card.tags.length > 0 && (
          <span className="story-card-tags">
            {card.tags.map((tag) => <em key={tag}>{tag}</em>)}
          </span>
        )}
        {typeof card.progressPercent === 'number' && (
          <span className="story-card-progress" title={card.progressLabel}>
            <span className="story-card-progress-bar">
              <i style={{ width: `${Math.max(0, Math.min(100, card.progressPercent))}%` }} />
            </span>
            <em>{card.progressLabel || `${card.progressPercent}%`}</em>
          </span>
        )}
        {card.meta && <em className="story-card-meta">{card.meta}</em>}
      </button>

      {card.cast && card.cast.length > 0 && (
        <div className="story-card-cast" aria-label={`出场角色：${card.cast.map((person) => person.name).join('、')}`}>
          {card.cast.map((person) => (
            <span className="story-card-cast-item" key={person.id}>
              {person.avatar ? (
                <img src={person.avatar} alt="" aria-hidden="true" loading="lazy" decoding="async" />
              ) : (
                <i aria-hidden="true">{person.name.slice(0, 1)}</i>
              )}
              {person.name}
            </span>
          ))}
        </div>
      )}

      {card.portrait !== undefined && (
        <div className="story-card-portrait">
          {card.portrait ? (
            <img src={card.portrait} alt={`${card.title} 角色图`} loading="lazy" decoding="async" />
          ) : (
            <div className="story-card-empty">
              <IconCamera />
              <span>{card.emptyImageHint || '待生成'}</span>
            </div>
          )}
        </div>
      )}

      {card.images && (
        <div className="story-card-media" data-count={Math.min(card.images.length, 3)}>
          {card.images.length ? (
            card.images.slice(0, 3).map((src, index) => (
              <img
                key={`${card.id}-img-${index}`}
                src={src}
                alt={`${card.title} 画面 ${index + 1}`}
                loading="lazy"
                decoding="async"
              />
            ))
          ) : (
            <div className="story-card-empty">
              <IconCamera />
              <span>{card.emptyImageHint || '待生成画面'}</span>
            </div>
          )}
        </div>
      )}
      {/* 图的来路要标出来：镜头卡上那张常常是从场次继承的共用图，不标就是在冒充这一镜自己的首帧。 */}
      {card.imageNote && card.images?.length ? (
        <em className="story-card-image-note" title="这一镜还没有自己的首帧图，先用整场共用的场景图顶着">
          {card.imageNote}
        </em>
      ) : null}

      <footer className="story-card-foot">
        <button type="button" className="story-card-cta" onClick={onOpen}>
          {card.ctaLabel || '审查 →'}
        </button>
      </footer>
    </article>
  );
}

/**
 * memo 不是可选项：三百个节点的画布上，任何一次顶层 setState 都会重渲染整棵树。
 * 卡片本身不随相机变化，所以只要 props 没变就不该重画。
 */
export const StoryCard = memo(StoryCardView);
