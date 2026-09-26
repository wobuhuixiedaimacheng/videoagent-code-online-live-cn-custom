import { NextResponse } from 'next/server';
import {
  aspectRatioFromSpec,
  resolutionTierFromSpec,
  resolveFrameSize,
  unsupportedFrameSizeMessage
} from '../../../../lib/videoFrameSize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type VideoRenderRequest = {
  prompt?: string;
  negativePrompt?: string;
  image?: string | string[];
  mode?: string;
  keyframes?: string[];
  /**
   * 身份锚点图：只用来锁人脸，不是画面里的某一帧。
   * 和 image / keyframes 分开传，否则「场景图 + 两张人脸」会被当成三帧关键帧序列，
   * 视频就变成从场景渐变到人脸特写。
   */
  identityImages?: string[];
  spec?: Record<string, unknown>;
};

/**
 * 身份参考图挂在 extra_body 的哪个键上。
 *
 * 上游是 litellm 中转，extra_body 会被透传给底层模型，键名由底层模型定。
 * `reference_images` 是实测确认可用的那个：真实提交没有触发下面的降级重发。
 * 仍然保留环境变量和自动降级——中转站换底层模型时键名可能跟着变，
 * 那时的代价应该是「锁脸这一层没生效」，而不是「整批镜头渲染失败」。
 */
function identityReferenceField() {
  return process.env.VIDEO_IDENTITY_REFERENCE_FIELD?.trim() || 'reference_images';
}

/**
 * 上游是不是在抱怨我们多传了一个它不认识的字段。
 *
 * 只认这一类错误：其它 400（提示词违规、图片地址不可达、画幅不支持）去掉参考图重发
 * 同样会失败，重发一次纯属浪费一次调用和一次等待。
 */
function rejectsUnknownField(status: number, body: string, field: string): boolean {
  if (status !== 400 && status !== 422) return false;
  if (body.includes(field)) return true;
  return /unknown|unexpected|unrecognized|not (a )?(valid|permitted|allowed)|extra fields|additional properties/i.test(body);
}

const AGNES_MIN_NUM_FRAMES = 81;
const AGNES_MAX_NUM_FRAMES_BY_TIER: Record<string, number> = {
  '480p': 961,
  '720p': 409,
  '1080p': 169
};
const SUCCESSFUL_PROVIDER_STATUSES = new Set(['completed', 'succeeded', 'success', 'done']);
const FAILED_PROVIDER_STATUSES = new Set(['failed', 'failure', 'error', 'rejected', 'cancelled', 'canceled', 'aborted']);

function videoConfig() {
  const apiKey = process.env.VIDEO_API_KEY || process.env.CUSTOM_API_KEY || '';
  const baseUrl = (process.env.VIDEO_BASE_URL || process.env.CUSTOM_BASE_URL || 'https://apihub.agnes-ai.com/v1').replace(/\/$/, '');
  const model = process.env.VIDEO_MODEL || 'agnes-video-v2.0';
  return { apiKey, baseUrl, model };
}

function redact(text: string) {
  const { apiKey } = videoConfig();
  return apiKey ? text.replaceAll(apiKey, '[redacted]') : text;
}

function sizeFromSpec(spec: Record<string, unknown> = {}) {
  return resolveFrameSize(aspectRatioFromSpec(spec), resolutionTierFromSpec(spec));
}

function numberFromSpec(value: unknown, fallback: number) {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function maxFramesForSpec(spec: Record<string, unknown> = {}) {
  const tier = String(spec.resolutionTier || spec.resolution || '720p');
  return AGNES_MAX_NUM_FRAMES_BY_TIER[tier] || AGNES_MAX_NUM_FRAMES_BY_TIER['720p'];
}

function normalizeAgnesNumFrames(frames: number, maxFrames: number) {
  const bounded = Math.min(maxFrames, Math.max(AGNES_MIN_NUM_FRAMES, Math.round(frames)));
  return Math.min(maxFrames, Math.max(AGNES_MIN_NUM_FRAMES, Math.round((bounded - 1) / 8) * 8 + 1));
}

function roundFrameRate(frameRate: number) {
  return Math.min(60, Math.max(1, Math.round(frameRate * 10) / 10));
}

function timingFromSpec(spec: Record<string, unknown> = {}) {
  const frameRate = roundFrameRate(numberFromSpec(spec.frameRate || spec.frame_rate, 24));
  const targetDuration = numberFromSpec(spec.targetDurationSeconds || spec.target_duration_seconds, 0);
  const maxFrames = maxFramesForSpec(spec);
  if (targetDuration > 0 && targetDuration * frameRate > maxFrames) {
    // 以前这里是「保时长、压帧率」：720p 要 30 秒就变成 13.6fps，成片肉眼可见地卡，
    // 而且调用方拿不到任何提示，只会以为模型质量差。现在反过来——保帧率、截时长，
    // 并把实际截到几秒回报出去，让上层能显示出来。
    return {
      numFrames: maxFrames,
      frameRate,
      cappedDurationSeconds: Math.round((maxFrames / frameRate) * 10) / 10
    };
  }
  return {
    numFrames: normalizeAgnesNumFrames(numberFromSpec(spec.numFrames || spec.num_frames, 121), maxFrames),
    frameRate,
    cappedDurationSeconds: 0
  };
}

function firstString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return firstString(value[0]);
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return firstString(object.url || object.video_url || object.output_url || object.file_url);
  }
  return '';
}

function stringList(value: unknown): string[] {
  if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
  if (Array.isArray(value)) return value.flatMap((item) => stringList(item));
  return [];
}

function providerError(value: Record<string, unknown>, data: Record<string, unknown>, output: Record<string, unknown>) {
  return firstString(value.error || value.message || data.error || data.message || output.error || output.message);
}

function normalizedProviderStatus(status: unknown, videoUrl: string): 'completed' | 'failed' | 'submitted' {
  const normalized = typeof status === 'string' ? status.trim().toLowerCase() : '';
  if (SUCCESSFUL_PROVIDER_STATUSES.has(normalized)) return videoUrl ? 'completed' : 'failed';
  if (FAILED_PROVIDER_STATUSES.has(normalized)) return 'failed';
  return videoUrl ? 'completed' : 'submitted';
}

function normalizeVideoResponse(raw: unknown) {
  const value = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const data = value.data && typeof value.data === 'object' ? (value.data as Record<string, unknown>) : {};
  const output = value.output && typeof value.output === 'object' ? (value.output as Record<string, unknown>) : {};
  const videoUrl = firstString(
    value.videoUrl ||
      value.video_url ||
      value.url ||
      value.output_url ||
      value.remixed_from_video_id ||
      data.videoUrl ||
      data.video_url ||
      data.url ||
      output.videoUrl ||
      output.video_url ||
      output.url
  );

  const providerStatus = value.status || data.status || (videoUrl ? 'completed' : 'submitted');
  const status = normalizedProviderStatus(providerStatus, videoUrl);
  const upstreamError = providerError(value, data, output);

  return {
    ok: true,
    task_id: String(value.task_id || value.taskId || data.task_id || ''),
    video_id: String(value.video_id || value.videoId || value.id || data.video_id || data.videoId || data.id || ''),
    status,
    progress: Number(value.progress ?? data.progress ?? (videoUrl ? 100 : 0)),
    videoUrl,
    error: status === 'failed'
      ? upstreamError || (SUCCESSFUL_PROVIDER_STATUSES.has(String(providerStatus).trim().toLowerCase())
        ? 'Video provider completed without a video URL.'
        : 'Video provider reported a failed terminal status.')
      : '',
    raw: value
  };
}

export async function POST(request: Request) {
  try {
    const { apiKey, baseUrl, model } = videoConfig();
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: 'VIDEO_API_KEY is required before submitting video generation.' }, { status: 400 });
    }

    const body = (await request.json()) as VideoRenderRequest;
    const prompt = body.prompt?.trim();
    if (!prompt) {
      return NextResponse.json({ ok: false, error: 'prompt is required' }, { status: 400 });
    }

    // 认不出的画幅以前会静默回落成 9:16 720p：用户在规格面板选了 4:3，拿到手的是竖屏，
    // 而且没有任何地方提示过。宁可 400 打回去，也不要渲出一条规格对不上的片子。
    const size = sizeFromSpec(body.spec);
    if (!size) {
      const spec = body.spec || {};
      return NextResponse.json(
        { ok: false, error: unsupportedFrameSizeMessage(aspectRatioFromSpec(spec), resolutionTierFromSpec(spec)) },
        { status: 400 }
      );
    }
    const spec = body.spec || {};
    const timing = timingFromSpec(spec);
    const referenceImages = [...stringList(body.keyframes), ...stringList(body.image)];
    const mode = typeof body.mode === 'string' ? body.mode.trim() : '';
    const keyframeMode = mode === 'keyframes' || referenceImages.length > 1;
    const upstreamBody: Record<string, unknown> = {
      model,
      prompt,
      negative_prompt: body.negativePrompt || undefined,
      width: size.width,
      height: size.height,
      num_frames: timing.numFrames,
      frame_rate: timing.frameRate
    };
    if (referenceImages.length === 1 && !keyframeMode) {
      upstreamBody.image = referenceImages[0];
      if (mode) upstreamBody.mode = mode;
    } else if (referenceImages.length > 0 || keyframeMode) {
      upstreamBody.extra_body = {
        image: referenceImages,
        mode: mode || 'keyframes'
      };
    }

    // 身份锚点图挂在 extra_body 的独立键上，绝不混进 image / keyframes——
    // 混进去它们就成了关键帧，视频会从场景渐变到人脸特写。
    const identityImages = stringList(body.identityImages);
    const identityField = identityReferenceField();
    if (identityImages.length) {
      upstreamBody.extra_body = {
        ...(upstreamBody.extra_body as Record<string, unknown> | undefined),
        [identityField]: identityImages
      };
    }

    const post = (payload: Record<string, unknown>) => fetch(`${baseUrl}/videos`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    let response = await post(upstreamBody);
    let text = await response.text();
    let degradedNote = '';

    // 上游不认这个字段时，去掉它重发一次。猜错键名的代价应该是「锁脸这一层没生效」，
    // 而不是「这一批镜头全部渲染失败」——后者是用真金白银在赌一个我们没有文档的字段名。
    if (!response.ok && identityImages.length && rejectsUnknownField(response.status, text, identityField)) {
      const { [identityField]: _dropped, ...restExtra } = (upstreamBody.extra_body || {}) as Record<string, unknown>;
      const retryBody = { ...upstreamBody };
      if (Object.keys(restExtra).length) retryBody.extra_body = restExtra;
      else delete retryBody.extra_body;
      response = await post(retryBody);
      text = await response.text();
      degradedNote = `视频模型不接受身份参考图字段「${identityField}」，本次已去掉它重新提交：这一镜的人物一致性只由提示词文字约束。`
        + '若上游有对应的字段名，用环境变量 VIDEO_IDENTITY_REFERENCE_FIELD 指定即可恢复锁脸。';
    }

    const json = text ? JSON.parse(text) : {};

    if (!response.ok) {
      const message = typeof json?.error === 'string' ? json.error : JSON.stringify(json || {}).slice(0, 500);
      return NextResponse.json({ ok: false, error: redact(message || `Video API error ${response.status}`) }, { status: response.status });
    }

    const normalized = normalizeVideoResponse(json);
    // 时长被清晰度上限截短时必须回报。截短本身是对的（好过压帧率把画面搞卡），
    // 但不说一声就又变成一次静默兜底。
    return NextResponse.json({
      ...normalized,
      ...(timing.cappedDurationSeconds ? { cappedDurationSeconds: timing.cappedDurationSeconds } : {}),
      ...(degradedNote ? { identityReferenceNote: degradedNote } : {})
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown video render error';
    return NextResponse.json({ ok: false, error: redact(message) }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const { apiKey, baseUrl, model } = videoConfig();
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: 'VIDEO_API_KEY is required before checking video generation.' }, { status: 400 });
    }

    const url = new URL(request.url);
    const videoId = url.searchParams.get('video_id') || '';
    if (!videoId) {
      return NextResponse.json({ ok: false, error: 'video_id is required' }, { status: 400 });
    }

    const rootUrl = baseUrl.replace(/\/v1$/, '');
    const statusUrl = `${rootUrl}/agnesapi?video_id=${encodeURIComponent(videoId)}&model_name=${encodeURIComponent(model)}`;
    const response = await fetch(statusUrl, {
      method: 'GET',
      headers: { authorization: `Bearer ${apiKey}` }
    });
    const text = await response.text();
    const json = text ? JSON.parse(text) : {};

    if (!response.ok) {
      const message = typeof json?.error === 'string' ? json.error : JSON.stringify(json || {}).slice(0, 500);
      return NextResponse.json({ ok: false, error: redact(message || `Video API error ${response.status}`) }, { status: response.status });
    }

    return NextResponse.json(normalizeVideoResponse(json));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown video status error';
    return NextResponse.json({ ok: false, error: redact(message) }, { status: 500 });
  }
}
