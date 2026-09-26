import { NextResponse } from 'next/server';
import { normalizePhysicsMode } from '../../../../lib/shotPhysics';
import { evaluateVideoQa, parseVideoQaResponse, videoQaInstruction } from '../../../../lib/videoQa';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type VideoQaRequestBody = {
  frames?: unknown;
  physicsMode?: unknown;
  shotTitle?: unknown;
  narration?: unknown;
};

/**
 * 抽帧上限。质检是每个镜头一次视觉模型调用，全帧分析会把成本翻两个数量级。
 *
 * 原来是 6 帧，理由是「手指、穿模、换脸都不是只出现一帧的问题」。这对前两项成立，
 * 对脸不成立：脸部抖动是【相邻帧之间】的微小变化，6 帧在一个 4 到 5 秒的镜头里
 * 相当于每 0.8 秒才取一帧，两帧之间隔得太远，判定模型只会觉得「都是同一个人」，
 * 抖动就整段漏检。12 帧把间隔压到 0.4 秒以内，才看得出这张脸在变。
 * 成本仍然是每镜头一次调用，只是这一次调用多带几张图。
 */
const MAX_QA_FRAMES = 12;

function qaConfig() {
  const apiKey = process.env.QA_API_KEY || process.env.CUSTOM_API_KEY || process.env.OPENAI_API_KEY || '';
  const baseUrlRaw = process.env.QA_BASE_URL || process.env.CUSTOM_BASE_URL || process.env.OPENAI_BASE_URL || '';
  const model = process.env.QA_VISION_MODEL || process.env.CUSTOM_MODEL || process.env.OPENAI_MODEL || '';
  return { apiKey, baseUrl: baseUrlRaw.replace(/\/$/, ''), model };
}

function qaEnabled() {
  const { apiKey, baseUrl, model } = qaConfig();
  return Boolean(apiKey && baseUrl && model);
}

function redact(text: string) {
  const { apiKey } = qaConfig();
  return apiKey ? text.replaceAll(apiKey, '[redacted]') : text;
}

function normalizeFrames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((frame): frame is string => typeof frame === 'string' && Boolean(frame.trim()))
    .map((frame) => frame.trim())
    .filter((frame) => frame.startsWith('data:image/') || frame.startsWith('http://') || frame.startsWith('https://'))
    .slice(0, MAX_QA_FRAMES);
}

function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 200) : undefined;
}

export async function GET() {
  // 客户端拿这个决定要不要把渲染完成的片段落到 qa_pending。
  // 没配视觉模型时必须让它知道，否则片段会永远卡在待质检。
  return NextResponse.json({ ok: true, enabled: qaEnabled(), maxFrames: MAX_QA_FRAMES });
}

export async function POST(request: Request) {
  try {
    const { apiKey, baseUrl, model } = qaConfig();
    const body = (await request.json()) as VideoQaRequestBody;
    const physicsMode = normalizePhysicsMode(body.physicsMode);
    const frames = normalizeFrames(body.frames);

    // 没配模型、或者一帧都没抽到，都返回 skipped 而不是报错。
    // 质检不可用不该把整批片段判成失败——那比不做质检还糟。
    if (!qaEnabled()) {
      return NextResponse.json({
        ok: true,
        verdict: {
          ...evaluateVideoQa([], physicsMode, 0),
          note: '未配置画面质检模型（QA_VISION_MODEL / CUSTOM_MODEL），本镜头未经画面检查。'
        }
      });
    }
    if (!frames.length) {
      return NextResponse.json({ ok: true, verdict: evaluateVideoQa([], physicsMode, 0) });
    }

    const endpoint = baseUrl.endsWith('/v1') ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 800,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'text',
              text: videoQaInstruction(physicsMode, {
                shotTitle: optionalText(body.shotTitle),
                narration: optionalText(body.narration)
              })
            },
            ...frames.map((frame) => ({ type: 'image_url' as const, image_url: { url: frame } }))
          ]
        }]
      })
    });

    const text = await response.text();
    if (!response.ok) {
      return NextResponse.json(
        { ok: false, error: redact(text.slice(0, 500) || `QA model error ${response.status}`) },
        { status: response.status }
      );
    }

    const json = text ? JSON.parse(text) : {};
    const content = json?.choices?.[0]?.message?.content;
    const issues = parseVideoQaResponse(typeof content === 'string' ? content : JSON.stringify(content ?? ''), physicsMode);
    return NextResponse.json({ ok: true, verdict: evaluateVideoQa(issues, physicsMode, frames.length) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown video QA error';
    return NextResponse.json({ ok: false, error: redact(message) }, { status: 500 });
  }
}
