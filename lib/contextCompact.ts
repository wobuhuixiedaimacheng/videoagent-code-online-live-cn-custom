import type { ModelMessage, TokenBudget } from './loopTypes';

function estimateTokens(text: string) {
  return Math.ceil(text.length / 3);
}

export function createTokenBudget(): TokenBudget {
  const max = Number(process.env.AGENT_TOKEN_BUDGET || 24000);
  const perToolResult = Number(process.env.AGENT_TOOL_RESULT_BUDGET || 3000);
  return { max, perToolResult, used: 0 };
}

export function clampToolResult(text: string, budget: TokenBudget) {
  const maxChars = Math.max(1200, budget.perToolResult * 3);
  if (text.length <= maxChars) {
    budget.used += estimateTokens(text);
    return text;
  }
  const head = text.slice(0, Math.floor(maxChars * 0.65));
  const tail = text.slice(-Math.floor(maxChars * 0.25));
  const compacted = `${head}\n\n[内容过长，已压缩，省略 ${text.length - head.length - tail.length} 个字符]\n\n${tail}`;
  budget.used += estimateTokens(compacted);
  return compacted;
}

export function microCompact(messages: ModelMessage[]) {
  const result: ModelMessage[] = [];
  for (const message of messages) {
    if (message.role === 'tool' && message.content.length > 4000) {
      result.push({
        ...message,
        content: `${message.content.slice(0, 2400)}\n\n[早期工具结果已微压缩]\n\n${message.content.slice(-800)}`
      });
    } else {
      result.push(message);
    }
  }
  return result;
}

export function autoCompact(messages: ModelMessage[], budget: TokenBudget) {
  const total = messages.reduce((sum, message) => sum + estimateTokens(message.content), 0);
  budget.used = total;
  if (total < budget.max * 0.8) return messages;

  const system = messages.find((message) => message.role === 'system');
  const recent = messages.filter((message) => message.role !== 'system').slice(-10);
  const older = messages.filter((message) => message.role !== 'system').slice(0, -10);
  const summary = older
    .map((message) => `${message.role}${message.toolName ? `:${message.toolName}` : ''}: ${message.content.slice(0, 260)}`)
    .join('\n');

  return [
    ...(system ? [system] : []),
    {
      role: 'user' as const,
      content: `以下是早期上下文自动压缩摘要，只保留决策相关事实:\n${summary.slice(0, 5000)}`
    },
    ...recent
  ];
}
