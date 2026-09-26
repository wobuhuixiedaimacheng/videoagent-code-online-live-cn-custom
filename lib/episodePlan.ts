/**
 * 成片总时长与小节拆分。
 *
 * 以前总时长写死在 app/page.tsx 的 VIDEO_RENDER_SEGMENT_* 三个常量里（15s × 12 = 3 分钟），
 * 首页选不了，脚本阶段永远按三分钟写。这里把它变成一份可算的计划，
 * UI 和 stageGenerationInstruction 都读同一个函数，避免两边各算一套。
 *
 * 这个文件不碰 node:fs，可以直接进客户端 bundle。
 */

/** 小节的目标时长。小节是叙事单位，不是渲染单位——渲染单位是镜头，见 shotPhysics。 */
export const EPISODE_SEGMENT_TARGET_SECONDS = 15;

/** 首页长度选择器的预设档位（秒）。 */
export const EPISODE_LENGTH_PRESETS = [30, 60, 180, 300];

export const EPISODE_SECONDS_MIN = 10;
export const EPISODE_SECONDS_MAX = 900;

/** 默认保持 3 分钟，和改造前写死的值一致，老项目读进来行为不变。 */
export const DEFAULT_EPISODE_SECONDS = 180;

const MAX_SEGMENTS = 60;

export type EpisodePlan = {
  /** 用户要的总时长，也是最终成片时长。 */
  totalSeconds: number;
  segmentCount: number;
  /** 由总时长和小节数反推，所以 segmentCount × segmentSeconds 精确等于 totalSeconds。 */
  segmentSeconds: number;
};

export function normalizeEpisodeSeconds(value: unknown): number {
  const seconds = Math.round(Number(value));
  if (!Number.isFinite(seconds)) return DEFAULT_EPISODE_SECONDS;
  return Math.min(EPISODE_SECONDS_MAX, Math.max(EPISODE_SECONDS_MIN, seconds));
}

/**
 * 小节数由总时长推出来，小节时长再由总时长除以小节数反推。
 * 反推这一步是为了让自定义秒数不被吞掉：选 50 秒就该拿到 50 秒的片子
 * （3 小节 × 16.7s），而不是被悄悄取整成 45 秒。
 */
export function episodePlan(episodeSeconds: unknown): EpisodePlan {
  const totalSeconds = normalizeEpisodeSeconds(episodeSeconds);
  const segmentCount = Math.min(
    MAX_SEGMENTS,
    Math.max(1, Math.round(totalSeconds / EPISODE_SEGMENT_TARGET_SECONDS))
  );
  return {
    totalSeconds,
    segmentCount,
    segmentSeconds: Math.round((totalSeconds / segmentCount) * 10) / 10
  };
}

/** 面向用户的时长文案。整分钟说「N 分钟」，否则说秒，不要让用户自己换算。 */
export function episodeLengthLabel(episodeSeconds: unknown): string {
  const seconds = normalizeEpisodeSeconds(episodeSeconds);
  if (seconds < 60) return `${seconds} 秒`;
  if (seconds % 60 === 0) return `${seconds / 60} 分钟`;
  return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
}
