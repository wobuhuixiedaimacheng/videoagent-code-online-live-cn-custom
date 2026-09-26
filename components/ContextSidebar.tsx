'use client';

import type { ContextItem } from '../lib/types';
import {
  IconBrain,
  IconList,
  IconPlug,
  IconStack,
  IconTarget,
  IconX
} from './icons';

export type QueueEntry = {
  id: string;
  label: string;
  hint: string;
  state: 'running' | 'done' | 'warn' | 'idle';
  active?: boolean;
};

export type MissionSummary = {
  title: string;
  platform: string;
  audience: string;
  goal: string;
  tone: string;
};

type Props = {
  mission: MissionSummary;
  queue: QueueEntry[];
  contextStack: ContextItem[];
  tools: Array<{ label: string; on: boolean }>;
  memory: string;
  onQueueSelect: (id: string) => void;
  onContextSelect: (item: ContextItem) => void;
  onClose?: () => void;
};

export default function ContextSidebar({
  mission,
  queue,
  contextStack,
  tools,
  memory,
  onQueueSelect,
  onContextSelect,
  onClose
}: Props) {
  return (
    <aside className="context" aria-label="上下文侧栏">
      <div className="context-head">
        <div>
          <strong>生产上下文</strong>
          <div className="sub">当前 Mission 使用的业务上下文</div>
        </div>
        {onClose && (
          <button type="button" className="close mobile-only" onClick={onClose} aria-label="关闭侧栏">
            <IconX />
          </button>
        )}
      </div>

      <div className="context-scroll">
        <div className="ctx-block">
          <div className="ctx-title">
            <IconTarget /> 当前 Mission
          </div>
          <div className="mission-card">
            <div className="label">Mission</div>
            <h3>{mission.title}</h3>
            <div className="mission-meta">
              <div className="row">
                <span>平台</span>
                <strong>{mission.platform}</strong>
              </div>
              <div className="row">
                <span>受众</span>
                <strong>{mission.audience}</strong>
              </div>
              <div className="row">
                <span>目标</span>
                <strong>{mission.goal}</strong>
              </div>
              <div className="row">
                <span>语气</span>
                <strong>{mission.tone}</strong>
              </div>
            </div>
          </div>
        </div>

        <div className="ctx-block">
          <div className="ctx-title">
            <IconList /> 任务队列
          </div>
          {queue.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`queue-item ${item.active ? 'active' : ''}`}
              onClick={() => onQueueSelect(item.id)}
            >
              <span className={`queue-dot ${item.state}`} />
              <span className="qt">
                <strong>{item.label}</strong>
                <small>{item.hint}</small>
              </span>
            </button>
          ))}
        </div>

        <div className="ctx-block">
          <div className="ctx-title">
            <IconStack /> Context Stack
          </div>
          {contextStack.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`ctx-row ${item.status === 'ready' ? 'ready' : ''}`}
              onClick={() => onContextSelect(item)}
            >
              <span className="ctx-badge">{badgeFor(item.filePath)}</span>
              <span className="ctx-info">
                <strong>{item.label}</strong>
                <small>{item.summary}</small>
              </span>
              <span className={`ctx-state ${item.status}`}>
                {item.status === 'ready' ? '已读取' : item.status === 'warning' ? '待确认' : '未建立'}
              </span>
            </button>
          ))}
        </div>

        <div className="ctx-block">
          <div className="ctx-title">
            <IconPlug /> 已连接工具
          </div>
          {tools.map((tool) => (
            <div key={tool.label} className="tool-chip">
              <IconPlug />
              {tool.label}
              <span className={`dot ${tool.on ? '' : 'off'}`} />
            </div>
          ))}
        </div>

        <div className="ctx-block">
          <div className="ctx-title">
            <IconBrain /> 记忆摘要
          </div>
          <div className="memory-note">{memory}</div>
        </div>
      </div>
    </aside>
  );
}

function badgeFor(path: string) {
  if (path.includes('brief')) return 'BRF';
  if (path.includes('MEMORY')) return 'MEM';
  if (path.includes('viral')) return 'REF';
  if (path.includes('platform')) return 'RULE';
  if (path.includes('asset')) return 'AST';
  if (path.includes('campaign')) return 'GOAL';
  if (path.includes('feedback')) return 'FB';
  return '{}';
}
