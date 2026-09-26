import { CHARACTER_VIEW_ANGLES } from './characterVisualSpec';
import { DEFAULT_PHYSICS_MODE, estimateShotCount, physicsDurationCap, type PhysicsMode } from './shotPhysics';
import { VIDEO_QA_MAX_ATTEMPTS } from './videoQa';

/**
 * 渲染成本预估。
 *
 * 代码里到处是防重复计费的注释（videoRenderBatch 里就有三处），说明烧钱是真痛点；
 * 但工作台在用户做决定的那一刻不显示任何成本——脚本阶段写「180 秒 / 12 小节 / 7 个角色」时，
 * 没有任何地方告诉他这等于三十多次渲染外加重渲。等看到账单，脚本已经确认好几轮了。
 *
 * 这里刻意只算「次数」不算「金额」：单价随供应商和档位变，写死会过期，
 * 而次数是这套流水线自己能确定的量，也已经足够改变用户的写作行为。
 */

export type RenderBudget = {
  /** 镜头数，等于渲染的最少次数——每个镜头至少要渲一次。 */
  shotCount: number;
  /** 全部一次过的次数。 */
  minRenders: number;
  /** 每个镜头都用满质检重渲配额时的次数。 */
  maxRenders: number;
  shotCapSeconds: number;
};

export function estimateRenderBudget(options: {
  totalSeconds: number;
  mode?: PhysicsMode;
  qaMaxAttempts?: number;
}): RenderBudget {
  const mode = options.mode || DEFAULT_PHYSICS_MODE;
  const attempts = Number.isFinite(options.qaMaxAttempts) && (options.qaMaxAttempts as number) >= 0
    ? (options.qaMaxAttempts as number)
    : VIDEO_QA_MAX_ATTEMPTS;
  const shotCount = estimateShotCount(options.totalSeconds, mode);
  return {
    shotCount,
    minRenders: shotCount,
    maxRenders: shotCount * (1 + attempts),
    shotCapSeconds: physicsDurationCap(mode)
  };
}

/** 给规格面板和脚本确认前那一行用。写成一句话，不占版面。 */
export function renderBudgetSummary(budget: RenderBudget): string {
  if (!budget.shotCount) return '时长未定，暂无法预估渲染量';
  return `≈${budget.shotCount} 个镜头（单镜头上限 ${budget.shotCapSeconds}s）· 预计渲染 ${budget.minRenders}–${budget.maxRenders} 次（含质检重渲余量）`;
}

/** 每个角色固定要出的参考图张数：四个身份参考位 + 一张表情板。 */
export const CHARACTER_REFERENCE_IMAGES_PER_CHARACTER = CHARACTER_VIEW_ANGLES.length + 1;

/**
 * 角色阶段的出图张数。
 *
 * 单列出来是因为它刚刚翻了一倍多：四个身份参考位和表情板从「画板上按需点」
 * 改成了自动生成。这个改动是对的（按需的实际结果是绝大多数角色只有一张正脸），
 * 但翻倍的开销必须写在用户看得见的地方——静默烧钱正是这套代码里反复警惕的那件事。
 */
export function estimateCharacterImageCount(input: {
  characterCount: number;
  variantsPerCharacter?: number;
}): number {
  const characters = Math.max(0, Math.round(Number(input.characterCount) || 0));
  const variants = Math.max(1, Math.round(Number(input.variantsPerCharacter) || 1));
  if (!characters) return 0;
  // 每个变体一张主图加一张多视角设定板；身份参考位和表情板按角色算，不按变体算。
  return characters * (variants * 2 + CHARACTER_REFERENCE_IMAGES_PER_CHARACTER);
}

export function characterImageBudgetSummary(input: {
  characterCount: number;
  variantsPerCharacter?: number;
}): string {
  const total = estimateCharacterImageCount(input);
  if (!total) return '角色未定，暂无法预估出图量';
  return `≈${total} 张角色图（每个角色 ${CHARACTER_REFERENCE_IMAGES_PER_CHARACTER} 张身份参考位与表情板，加上每个造型的主图和多视角设定板）`;
}
