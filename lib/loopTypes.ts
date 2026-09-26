import type { AgentRunResponse } from './types';

export type ModelProvider = Exclude<AgentRunResponse['provider'], 'mock'>;

export type ModelToolCall = {
  id: string;
  name: string;
  args: Record<string, unknown>;
};

export type ModelMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  toolName?: string;
  toolCalls?: ModelToolCall[];
};

export type ToolSchema = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type ToolResult = {
  ok: boolean;
  status: 'success' | 'warning' | 'failed' | 'blocked' | 'approval_required';
  content: string;
  data?: unknown;
  summary?: string;
};

export type ModelTurn = {
  provider: ModelProvider;
  content: string;
  toolCalls: ModelToolCall[];
  stopReason: 'tool_use' | 'end' | 'length' | 'error';
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
};

export type TokenBudget = {
  max: number;
  perToolResult: number;
  used: number;
};
