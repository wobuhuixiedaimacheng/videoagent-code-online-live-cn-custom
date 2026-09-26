import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ImageRenderRequest = {
  prompt?: string;
  negativePrompt?: string;
  images?: string[];
  image?: string | string[];
  size?: string;
};

function imageConfig() {
  const apiKey = process.env.IMAGE_API_KEY || process.env.CUSTOM_API_KEY || '';
  const baseUrl = (process.env.IMAGE_BASE_URL || process.env.CUSTOM_BASE_URL || 'https://apihub.agnes-ai.com/v1').replace(/\/$/, '');
  const model = process.env.IMAGE_MODEL || 'agnes-image-2.1-flash';
  return { apiKey, baseUrl, model };
}

function redact(text: string) {
  const { apiKey } = imageConfig();
  return apiKey ? text.replaceAll(apiKey, '[redacted]') : text;
}

function stringList(value: unknown): string[] {
  if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
  if (Array.isArray(value)) return value.flatMap((item) => stringList(item));
  return [];
}

function firstString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return firstString(value[0]);
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return firstString(object.url || object.image_url || object.output_url || object.b64_json);
  }
  return '';
}

function normalizeImageResponse(raw: unknown) {
  const value = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const data = Array.isArray(value.data) ? value.data : [];
  const imageUrl = firstString(value.imageUrl || value.image_url || value.url || value.output_url || data);
  return {
    ok: true,
    imageUrl,
    raw: value
  };
}

export async function POST(request: Request) {
  try {
    const { apiKey, baseUrl, model } = imageConfig();
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: 'IMAGE_API_KEY is required before submitting image generation.' }, { status: 400 });
    }

    const body = (await request.json()) as ImageRenderRequest;
    const prompt = body.prompt?.trim();
    const negativePrompt = body.negativePrompt?.trim();
    if (!prompt) {
      return NextResponse.json({ ok: false, error: 'prompt is required' }, { status: 400 });
    }

    const images = [...stringList(body.images), ...stringList(body.image)];
    const upstreamBody: Record<string, unknown> = {
      model,
      prompt,
      ...(negativePrompt ? { negative_prompt: negativePrompt } : {}),
      size: body.size || '768x1024',
      extra_body: {
        ...(images.length ? { image: images } : {}),
        response_format: 'url'
      }
    };

    const response = await fetch(`${baseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(upstreamBody)
    });
    const text = await response.text();
    const json = text ? JSON.parse(text) : {};

    if (!response.ok) {
      const message = typeof json?.error === 'string' ? json.error : JSON.stringify(json || {}).slice(0, 500);
      return NextResponse.json({ ok: false, error: redact(message || `Image API error ${response.status}`) }, { status: response.status });
    }

    return NextResponse.json(normalizeImageResponse(json));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown image render error';
    return NextResponse.json({ ok: false, error: redact(message) }, { status: 500 });
  }
}
