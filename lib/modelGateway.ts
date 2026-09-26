import { describeUpstreamModelError } from './providerErrors';
import type { ModelMessage, ModelProvider, ModelToolCall, ModelTurn, ToolSchema } from './loopTypes';

type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
};

function parseArgs(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'object') return value as Record<string, unknown>;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch (_) {
    return {};
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chatTools(toolSchemas: ToolSchema[]) {
  return toolSchemas.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema
    }
  }));
}

/**
 * 不少中转站的上游模板硬性要求 system 只能是第 0 条，否则直接 400
 * "System message must be at the beginning."。agent loop 会在循环里不断追加消息，
 * 一旦哪一轮把 system 挤到后面，整轮请求就废了——所以发出前统一合并置顶。
 */
function hoistSystemMessage(messages: ChatMessage[]): ChatMessage[] {
  const systemIndexes = messages.map((message, index) => (message.role === 'system' ? index : -1)).filter((index) => index >= 0);
  if (systemIndexes.length === 0) return messages;
  if (systemIndexes.length === 1 && systemIndexes[0] === 0) return messages;

  const merged = systemIndexes
    .map((index) => messages[index].content || '')
    .filter(Boolean)
    .join('\n\n');
  const rest = messages.filter((message) => message.role !== 'system');
  return merged ? [{ role: 'system', content: merged }, ...rest] : rest;
}

function chatMessages(messages: ModelMessage[]): ChatMessage[] {
  const converted = messages.map((message): ChatMessage => {
    if (message.role === 'tool') {
      return {
        role: 'tool',
        tool_call_id: message.toolCallId || message.toolName || 'tool_call',
        content: message.content
      };
    }
    if (message.role === 'assistant' && message.toolCalls?.length) {
      return {
        role: 'assistant',
        content: message.content || null,
        tool_calls: message.toolCalls.map((toolCall) => ({
          id: toolCall.id,
          type: 'function',
          function: {
            name: toolCall.name,
            arguments: JSON.stringify(toolCall.args || {})
          }
        }))
      };
    }
    return { role: message.role, content: message.content };
  });
  return hoistSystemMessage(converted);
}

function providerOrder(preferred?: ModelProvider): ModelProvider[] {
  const configured: ModelProvider[] = [];
  const provider = (process.env.DEFAULT_PROVIDER || '').toLowerCase() as ModelProvider;
  const customConfigured = Boolean(process.env.CUSTOM_API_KEY && (process.env.CUSTOM_BASE_URL || process.env.OPENAI_BASE_URL));
  if (customConfigured) configured.push('custom');
  if (process.env.ANTHROPIC_API_KEY) configured.push('anthropic');
  if (process.env.OPENAI_API_KEY) configured.push('openai');

  const ordered = preferred ? [preferred, ...configured] : [provider, ...configured];
  return Array.from(new Set(ordered.filter((item): item is ModelProvider => ['custom', 'anthropic', 'openai'].includes(item))));
}

function anthropicMessages(messages: ModelMessage[]) {
  const system = messages.filter((message) => message.role === 'system').map((message) => message.content).join('\n\n');
  const converted = messages
    .filter((message) => message.role !== 'system')
    .map((message) => {
      if (message.role === 'tool') {
        return {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: message.toolCallId || message.toolName || 'tool_call',
              content: message.content
            }
          ]
        };
      }
      if (message.role === 'assistant' && message.toolCalls?.length) {
        return {
          role: 'assistant',
          content: [
            ...(message.content ? [{ type: 'text', text: message.content }] : []),
            ...message.toolCalls.map((toolCall) => ({
              type: 'tool_use',
              id: toolCall.id,
              name: toolCall.name,
              input: toolCall.args || {}
            }))
          ]
        };
      }
      return {
        role: message.role === 'assistant' ? 'assistant' : 'user',
        content: message.content
      };
    });
  return { system, messages: converted };
}

function anthropicTools(toolSchemas: ToolSchema[]) {
  return toolSchemas.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema
  }));
}

async function callAnthropicModel(messages: ModelMessage[], toolSchemas: ToolSchema[]): Promise<ModelTurn> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is missing');
  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';
  const converted = anthropicMessages(messages);
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model,
      max_tokens: Number(process.env.AGENT_MODEL_MAX_TOKENS || 5000),
      temperature: 0.2,
      system: converted.system,
      messages: converted.messages,
      tools: anthropicTools(toolSchemas)
    })
  });
  if (!res.ok) throw new Error(`Anthropic API error ${res.status}: ${(await res.text()).slice(0, 500)}`);
  const json = await res.json();
  const contentBlocks = Array.isArray(json.content) ? json.content : [];
  const content = contentBlocks.map((block: { text?: string }) => block?.text || '').filter(Boolean).join('\n');
  const toolCalls: ModelToolCall[] = contentBlocks
    .filter((block: { type?: string }) => block?.type === 'tool_use')
    .map((block: { id?: string; name?: string; input?: unknown }, index: number) => ({
      id: block.id || `tool_${index + 1}`,
      name: block.name || 'unknown',
      args: parseArgs(block.input)
    }));
  return {
    provider: 'anthropic',
    content,
    toolCalls,
    stopReason: json.stop_reason === 'tool_use' || toolCalls.length ? 'tool_use' : json.stop_reason === 'max_tokens' ? 'length' : 'end',
    usage: {
      inputTokens: Number(json.usage?.input_tokens || 0),
      outputTokens: Number(json.usage?.output_tokens || 0)
    }
  };
}

async function callChatCompletions(
  provider: Extract<ModelProvider, 'openai' | 'custom'>,
  messages: ModelMessage[],
  toolSchemas: ToolSchema[]
): Promise<ModelTurn> {
  const apiKey = provider === 'custom' ? process.env.CUSTOM_API_KEY || process.env.OPENAI_API_KEY : process.env.OPENAI_API_KEY;
  const baseUrlRaw =
    provider === 'custom'
      ? process.env.CUSTOM_BASE_URL || process.env.OPENAI_BASE_URL
      : process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const model =
    provider === 'custom'
      ? process.env.CUSTOM_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini'
      : process.env.OPENAI_MODEL || 'gpt-4.1-mini';
  if (!apiKey) throw new Error(`${provider === 'custom' ? 'CUSTOM_API_KEY' : 'OPENAI_API_KEY'} is missing`);
  if (!baseUrlRaw) throw new Error(`${provider === 'custom' ? 'CUSTOM_BASE_URL' : 'OPENAI_BASE_URL'} is missing`);

  const baseUrl = baseUrlRaw.replace(/\/$/, '');
  const endpoint = baseUrl.endsWith('/v1') ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: chatMessages(messages),
      tools: chatTools(toolSchemas),
      tool_choice: 'auto'
    })
  });
  if (!res.ok) {
    throw new Error(
      describeUpstreamModelError({
        provider: provider === 'custom' ? 'Custom' : 'OpenAI',
        model,
        status: res.status,
        body: await res.text()
      })
    );
  }
  const json = await res.json();
  const choice = json.choices?.[0] || {};
  const message = choice.message || {};
  const toolCalls: ModelToolCall[] = Array.isArray(message.tool_calls)
    ? message.tool_calls.map((toolCall: { id?: string; function?: { name?: string; arguments?: string } }, index: number) => ({
        id: toolCall.id || `tool_${index + 1}`,
        name: toolCall.function?.name || 'unknown',
        args: parseArgs(toolCall.function?.arguments)
      }))
    : [];
  return {
    provider,
    content: String(message.content || ''),
    toolCalls,
    stopReason: choice.finish_reason === 'tool_calls' || toolCalls.length ? 'tool_use' : choice.finish_reason === 'length' ? 'length' : 'end',
    usage: {
      inputTokens: Number(json.usage?.prompt_tokens || 0),
      outputTokens: Number(json.usage?.completion_tokens || 0),
      totalTokens: Number(json.usage?.total_tokens || 0)
    }
  };
}

async function callProvider(provider: ModelProvider, messages: ModelMessage[], toolSchemas: ToolSchema[]) {
  if (provider === 'anthropic') return callAnthropicModel(messages, toolSchemas);
  return callChatCompletions(provider, messages, toolSchemas);
}

export async function callModel(
  messages: ModelMessage[],
  toolSchemas: ToolSchema[],
  opts: { preferredProvider?: ModelProvider; retries?: number } = {}
): Promise<ModelTurn> {
  const failures: string[] = [];
  for (const provider of providerOrder(opts.preferredProvider)) {
    const attempts = Math.max(1, opts.retries ?? Number(process.env.AGENT_PROVIDER_RETRIES || 2));
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        return await callProvider(provider, messages, toolSchemas);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(`${provider}#${attempt}: ${message}`);
        if (attempt < attempts) await sleep(300 * attempt);
      }
    }
  }
  throw new Error(`No model provider succeeded. ${failures.join(' | ') || 'No provider configured.'}`);
}
