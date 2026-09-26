import { callModel } from './modelGateway';
import { agentRoster } from './workspace';
import type { LoopContext } from './agentLoop';
import type { AIGCAgentId } from './types';
import type { ModelMessage } from './loopTypes';

export type SubagentResult = {
  agentId: AIGCAgentId;
  agentName: string;
  status: 'success' | 'warning' | 'blocked';
  output: string;
};

export async function runSubagent(role: AIGCAgentId, task: string, parent: LoopContext): Promise<SubagentResult> {
  const agent = agentRoster.find((item) => item.id === role) || agentRoster.find((item) => item.id === 'orchestrator');
  const agentName = agent?.name || role;
  const messages: ModelMessage[] = [
    {
      role: 'system',
      content: `你是 VideoAgent 的 ${agentName}。你在隔离上下文中完成一个窄任务，只返回可交给父 agent 的简体中文工作成果。不要声称已写入文件，不要声称已渲染视频。`
    },
    {
      role: 'user',
      content: `父任务: ${parent.req.instruction}\n\n你的任务: ${task}\n\n项目: ${parent.req.workspace.title}\nworkflow: ${parent.workflow}`
    }
  ];

  try {
    const turn = await callModel(messages, [], { preferredProvider: parent.provider === 'mock' ? undefined : parent.provider });
    return {
      agentId: role,
      agentName,
      status: 'success',
      output: turn.content.trim() || `${agentName} 已完成任务，但没有返回详细文本。`
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      agentId: role,
      agentName,
      status: 'warning',
      output: `${agentName} 子任务未能调用在线模型：${message.slice(0, 240)}`
    };
  }
}
