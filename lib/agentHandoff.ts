import type { ProductionStageId } from './types';

/**
 * 阶段负责人。和 agentRoster 是两套东西：roster 描述可被调用的能力单元，
 * 这里描述的是「这一阶段由谁对用户负责」，用于画布 owner 和交接播报。
 */
export type StageOwner = {
  emoji: string;
  name: string;
};

export const OVERVIEW_OWNER: StageOwner = { emoji: '🎯', name: '创意总监' };

export const STAGE_OWNER: Record<ProductionStageId, StageOwner> = {
  script: { emoji: '✍️', name: '编剧' },
  character: { emoji: '👤', name: '角色设计师' },
  scene: { emoji: '🏙️', name: '场景设计师' },
  storyboard: { emoji: '🎞️', name: '分镜师' },
  video: { emoji: '🎬', name: '视频导演' }
};

export function stageOwner(stage: ProductionStageId): StageOwner {
  return STAGE_OWNER[stage];
}

export function stageOwnerName(stage: ProductionStageId): string {
  return STAGE_OWNER[stage].name;
}

/** 画布节点的 owner 展示名，带 emoji 便于和聊天流里的交接播报对上。 */
export function stageOwnerLabel(stage: ProductionStageId): string {
  const owner = STAGE_OWNER[stage];
  return `${owner.emoji} ${owner.name}`;
}

/**
 * 交接播报文案。上一阶段确认后由上一阶段负责人「邀请」下一阶段负责人，
 * 让用户看见流水线是谁交给谁，而不是凭空冒出下一批产物。
 */
export function handoffText(from: ProductionStageId, to: ProductionStageId): string {
  const source = STAGE_OWNER[from];
  const target = STAGE_OWNER[to];
  return `${source.emoji} @${source.name} 邀请 ${target.emoji} @${target.name} 加入了群聊`;
}
