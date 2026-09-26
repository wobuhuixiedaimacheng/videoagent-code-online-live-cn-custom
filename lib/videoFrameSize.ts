/**
 * 画幅 → 像素尺寸的唯一一份表。
 *
 * 这张表以前在 app/api/video/render/route.ts 和 lib/tools.ts 里各存了一份，两份都只有三种画幅，
 * 而 UI 的下拉框提供五种（多出 4:3 和 3:4）。两边对不上的后果不是报错，是 `|| table['9:16']['720p']`
 * 这个兜底——用户选了 4:3，系统一声不吭地渲出 9:16，规格面板上写的东西等于没生效。
 *
 * 所以这里做两件事：把 UI 已经在承诺的五种画幅补全，以及把「认不出就悄悄换一个」改成认不出就报错。
 * 静默兜底比报错难查得多：报错至少会指向这一行，兜底只会让人以为是模型不听话。
 */

export type FrameSize = { width: number; height: number };

export const VIDEO_FRAME_SIZES: Record<string, Record<string, FrameSize>> = {
  '9:16': {
    '480p': { width: 480, height: 854 },
    '720p': { width: 720, height: 1280 },
    '1080p': { width: 1080, height: 1920 }
  },
  '16:9': {
    '480p': { width: 854, height: 480 },
    '720p': { width: 1280, height: 720 },
    '1080p': { width: 1920, height: 1080 }
  },
  '1:1': {
    '480p': { width: 480, height: 480 },
    '720p': { width: 720, height: 720 },
    '1080p': { width: 1080, height: 1080 }
  },
  '4:3': {
    '480p': { width: 640, height: 480 },
    '720p': { width: 960, height: 720 },
    '1080p': { width: 1440, height: 1080 }
  },
  '3:4': {
    '480p': { width: 480, height: 640 },
    '720p': { width: 720, height: 960 },
    '1080p': { width: 1080, height: 1440 }
  }
};

export const SUPPORTED_ASPECT_RATIOS = Object.keys(VIDEO_FRAME_SIZES);
export const SUPPORTED_RESOLUTION_TIERS = Object.keys(VIDEO_FRAME_SIZES['9:16']);

export function aspectRatioFromSpec(spec: Record<string, unknown> = {}): string {
  return String(spec.aspectRatio || spec.aspect_ratio || '9:16');
}

export function resolutionTierFromSpec(spec: Record<string, unknown> = {}): string {
  return String(spec.resolutionTier || spec.resolution || '720p');
}

/** 认不出的画幅或清晰度一律返回 null，由调用方决定是报 400 还是抛错——但都不许静默兜底。 */
export function resolveFrameSize(aspectRatio: string, tier: string): FrameSize | null {
  return VIDEO_FRAME_SIZES[aspectRatio]?.[tier] || null;
}

export function unsupportedFrameSizeMessage(aspectRatio: string, tier: string): string {
  if (!VIDEO_FRAME_SIZES[aspectRatio]) {
    return `不支持的画幅 ${aspectRatio}，可选值：${SUPPORTED_ASPECT_RATIOS.join('、')}`;
  }
  return `画幅 ${aspectRatio} 不支持清晰度 ${tier}，可选值：${SUPPORTED_RESOLUTION_TIERS.join('、')}`;
}

/** 给 lib/tools.ts 这类没有 HTTP 语境的调用方用：直接抛，不兜底。 */
export function frameSizeFromSpec(spec: Record<string, unknown> = {}): FrameSize {
  const aspectRatio = aspectRatioFromSpec(spec);
  const tier = resolutionTierFromSpec(spec);
  const size = resolveFrameSize(aspectRatio, tier);
  if (!size) throw new Error(unsupportedFrameSizeMessage(aspectRatio, tier));
  return size;
}
