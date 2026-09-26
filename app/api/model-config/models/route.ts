import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ModelListInput = {
  connection?: {
    baseUrl?: string;
    apiKey?: string;
  };
};

type ProviderModel = {
  id: string;
  name?: string;
  ownedBy?: string;
};

const defaultOpenAIBaseUrl = 'https://api.openai.com/v1';

function isLocalRequest(req: Request) {
  if (process.env.NODE_ENV !== 'production') return true;
  const host = req.headers.get('host') || '';
  return host.startsWith('localhost:') || host.startsWith('127.0.0.1:') || host.startsWith('[::1]:');
}

function normalizeBaseUrl(value: string) {
  const raw = value.trim();
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Base URL 只支持 http 或 https。');
  }
  url.hash = '';
  url.search = '';
  return url.toString().replace(/\/$/, '');
}

function normalizeOptionalBaseUrl(value?: string) {
  return value?.trim() ? normalizeBaseUrl(value) : '';
}

function sameBaseUrl(left: string, right?: string) {
  if (!right?.trim()) return false;
  try {
    return normalizeBaseUrl(left) === normalizeBaseUrl(right);
  } catch (_) {
    return false;
  }
}

function savedCustomBaseUrl() {
  const provider = (process.env.DEFAULT_PROVIDER || '').toLowerCase();
  return normalizeOptionalBaseUrl(process.env.CUSTOM_BASE_URL) || (provider === 'custom' ? normalizeOptionalBaseUrl(process.env.OPENAI_BASE_URL) : '');
}

function resolveModelBaseUrl(inputBaseUrl?: string) {
  return (
    normalizeOptionalBaseUrl(inputBaseUrl) ||
    savedCustomBaseUrl() ||
    normalizeOptionalBaseUrl(process.env.IMAGE_BASE_URL) ||
    normalizeOptionalBaseUrl(process.env.VIDEO_BASE_URL) ||
    normalizeOptionalBaseUrl(process.env.OPENAI_BASE_URL) ||
    defaultOpenAIBaseUrl
  );
}

function isPrivateHost(hostname: string) {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host === '::1') return true;
  if (host.startsWith('127.') || host.startsWith('10.') || host.startsWith('169.254.')) return true;
  if (host.startsWith('192.168.')) return true;
  const match = host.match(/^172\.(\d+)\./);
  return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31);
}

function assertSafeUrl(baseUrl: string, req: Request) {
  const parsed = new URL(baseUrl);
  if (!isLocalRequest(req) && isPrivateHost(parsed.hostname)) {
    throw new Error('线上环境不能读取内网或本机地址的模型列表。');
  }
}

function modelListUrl(baseUrl: string) {
  return `${baseUrl}/models`;
}

function providerApiKey(baseUrl: string, inputKey?: string) {
  if (inputKey?.trim()) return inputKey.trim();
  const customBaseUrl = savedCustomBaseUrl();
  if (customBaseUrl && sameBaseUrl(baseUrl, customBaseUrl)) return process.env.CUSTOM_API_KEY || process.env.IMAGE_API_KEY || process.env.VIDEO_API_KEY || '';
  if (sameBaseUrl(baseUrl, process.env.IMAGE_BASE_URL)) return process.env.IMAGE_API_KEY || process.env.CUSTOM_API_KEY || '';
  if (sameBaseUrl(baseUrl, process.env.VIDEO_BASE_URL)) return process.env.VIDEO_API_KEY || process.env.CUSTOM_API_KEY || '';
  if (sameBaseUrl(baseUrl, process.env.OPENAI_BASE_URL) || sameBaseUrl(baseUrl, defaultOpenAIBaseUrl)) return process.env.OPENAI_API_KEY || '';
  return '';
}

function toModel(item: unknown): ProviderModel | null {
  if (!item || typeof item !== 'object') return null;
  const record = item as Record<string, unknown>;
  const id = typeof record.id === 'string' ? record.id : typeof record.name === 'string' ? record.name : '';
  if (!id) return null;
  return {
    id,
    name: typeof record.name === 'string' ? record.name : undefined,
    ownedBy: typeof record.owned_by === 'string' ? record.owned_by : typeof record.ownedBy === 'string' ? record.ownedBy : undefined
  };
}

function parseModels(payload: unknown) {
  if (Array.isArray(payload)) return payload.map(toModel).filter(Boolean) as ProviderModel[];
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.data)) return record.data.map(toModel).filter(Boolean) as ProviderModel[];
  if (Array.isArray(record.models)) return record.models.map(toModel).filter(Boolean) as ProviderModel[];
  return [];
}

function uniqueModels(models: ProviderModel[]) {
  const seen = new Set<string>();
  return models.filter((model) => {
    if (seen.has(model.id)) return false;
    seen.add(model.id);
    return true;
  });
}

function classifyModels(models: ProviderModel[]) {
  const text: ProviderModel[] = [];
  const image: ProviderModel[] = [];
  const video: ProviderModel[] = [];

  for (const model of models) {
    const id = model.id.toLowerCase();
    if (/(image|dall|flux|stable|sdxl|imagen|midjourney)/.test(id)) {
      image.push(model);
    } else if (/(video|sora|veo|kling|pika|luma|runway|wan|hailuo|minimax)/.test(id)) {
      video.push(model);
    } else {
      text.push(model);
    }
  }

  return { text, image, video };
}

function redactSecret(text: string, secret: string) {
  if (!secret) return text;
  return text.split(secret).join('[REDACTED_API_KEY]');
}

function sanitizeProviderMessage(message: string, apiKey: string) {
  return redactSecret(message, apiKey).replace(/\bsk-[A-Za-z0-9_*.-]{12,}\b/g, '[REDACTED_API_KEY]');
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ModelListInput;
    const baseUrl = resolveModelBaseUrl(body.connection?.baseUrl);
    assertSafeUrl(baseUrl, req);

    const apiKey = providerApiKey(baseUrl, body.connection?.apiKey);
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: '请先输入 API Key，或先保存已有 key 后再读取模型。' },
        { status: 400 }
      );
    }

    const res = await fetch(modelListUrl(baseUrl), {
      method: 'GET',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${apiKey}`
      },
      cache: 'no-store'
    });

    const text = await res.text();
    let payload: unknown = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch (_) {
      payload = {};
    }

    if (!res.ok) {
      const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
      const nestedError = record.error && typeof record.error === 'object' ? (record.error as Record<string, unknown>) : {};
      const rawMessage = typeof nestedError.message === 'string' ? nestedError.message : typeof record.message === 'string' ? record.message : text || '读取模型列表失败';
      const message = sanitizeProviderMessage(rawMessage, apiKey);
      return NextResponse.json({ ok: false, error: message }, { status: res.status });
    }

    const models = uniqueModels(parseModels(payload)).sort((a, b) => a.id.localeCompare(b.id));
    const categories = classifyModels(models);
    return NextResponse.json({
      ok: true,
      baseUrl,
      models,
      categories,
      counts: {
        all: models.length,
        text: categories.text.length,
        image: categories.image.length,
        video: categories.video.length
      }
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : '读取模型列表失败' },
      { status: 400 }
    );
  }
}
