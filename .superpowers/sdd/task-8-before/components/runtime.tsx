'use client';

import type {
  AgentDefinition,
  AgentEvent,
  AIGCAgentId,
  MissionAsset,
  PatchOperation,
  PreviewScene,
  ToolEvent
} from '../lib/types';
import {
  IconAlert,
  IconCamera,
  IconCheck,
  IconCheckCircle,
  IconClock,
  IconFilm,
  IconGitMerge,
  IconLoader,
  IconShield,
  IconWand,
  IconX
} from './icons';

/* ---------- Plan ---------- */
export function PlanList({ plan }: { plan: string[] }) {
  if (!plan.length) {
    return <div className="empty">主 Agent 还没有生成执行计划。发出第一条创作需求即可。</div>;
  }
  return (
    <div className="plan-list">
      {plan.map((step, index) => (
        <div className="plan-step" key={index}>
          <span className="plan-num">{index + 1}</span>
          <p>{step}</p>
        </div>
      ))}
    </div>
  );
}

/* ---------- Agent runtime ---------- */
const L1: AIGCAgentId[] = ['orchestrator', 'creative_director'];
const L4: AIGCAgentId[] = [];

function statusIcon(status: AgentEvent['status']) {
  if (status === 'success') return <IconCheck />;
  if (status === 'running') return <IconLoader className="spin" />;
  if (status === 'warning') return <IconAlert />;
  if (status === 'blocked') return <IconX />;
  return <IconClock />;
}

function statusText(status: AgentEvent['status']) {
  return status === 'success'
    ? '完成'
    : status === 'running'
    ? '运行中'
    : status === 'warning'
    ? '提醒'
    : status === 'blocked'
    ? '阻断'
    : '等待';
}

type RuntimeRow = {
  id: string;
  name: string;
  action: string;
  accent: AgentDefinition['accent'];
  status: AgentEvent['status'];
};

export function AgentRuntime({
  events,
  roster,
  running
}: {
  events: AgentEvent[];
  roster: AgentDefinition[];
  running: boolean;
}) {
  const accentOf = (id: AIGCAgentId) => roster.find((a) => a.id === id)?.accent || 'green';
  const roleOf = (id: AIGCAgentId) => roster.find((a) => a.id === id)?.role || '';

  const rows: RuntimeRow[] = events.length
    ? events.map((e) => ({
        id: e.id,
        name: e.agentName,
        action: e.output || e.action,
        accent: accentOf(e.agentId),
        status: e.status
      }))
    : roster.map((a) => ({
        id: a.id,
        name: a.name,
        action: a.description,
        accent: a.accent,
        status: 'pending' as const
      }));

  const idOf = (row: RuntimeRow) => (row.id.startsWith('evt') ? findAgentId(events, row.id) : (row.id as AIGCAgentId));

  const orchestrator = rows.filter((r) => L1.includes(idOf(r)));
  const production = rows.filter((r) => !L1.includes(idOf(r)) && !L4.includes(idOf(r)));

  return (
    <div>
      <RuntimeLayer
        tier="L1"
        title="主 Agent · 编排调度"
        hint="理解目标、读取上下文、派发与验收"
        rows={orchestrator.length ? orchestrator : rows.slice(0, 2)}
      />
      <RuntimeLayer
        tier="L2"
        title="生产能力 Agent · 横向流水线"
        hint={running ? '正在组织生产' : `${production.length} 个能力待命`}
        rows={production}
      />
    </div>
  );
}

function findAgentId(events: AgentEvent[], rowId: string): AIGCAgentId {
  return events.find((e) => e.id === rowId)?.agentId || 'orchestrator';
}

function RuntimeLayer({
  tier,
  title,
  hint,
  rows
}: {
  tier: string;
  title: string;
  hint: string;
  rows: RuntimeRow[];
}) {
  if (!rows.length) return null;
  return (
    <div className="runtime-layer">
      <div className="layer-head">
        <span className="layer-tier">{tier}</span>
        <strong>{title}</strong>
        <small>{hint}</small>
      </div>
      <div className="agent-rows">
        {rows.map((row) => (
          <div className="agent-row" key={row.id}>
            <span className={`agent-avatar ${row.accent}`}>{row.name.slice(0, 1)}</span>
            <span className="agent-main">
              <strong>{row.name}</strong>
              <small>{row.action}</small>
            </span>
            <span className={`agent-status agent-${row.status}`}>
              {statusIcon(row.status)}
              {statusText(row.status)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- AIGC asset pipeline ---------- */
export function AssetPipeline({
  steps,
  assets,
  selectedId,
  onSelect
}: {
  steps: Array<{ label: string; ready: boolean; warn?: boolean }>;
  assets: MissionAsset[];
  selectedId: string;
  onSelect: (asset: MissionAsset) => void;
}) {
  return (
    <div>
      <div className="pipeline">
        {steps.map((step, index) => (
          <div key={index} className={`pipe-node ${step.warn ? 'warn' : step.ready ? 'ready' : ''}`}>
            <span className="pipe-dot">{step.ready ? <IconCheck style={{ width: 14, height: 14 }} /> : index + 1}</span>
            <span>{step.label}</span>
          </div>
        ))}
      </div>
      {assets.length > 0 && (
        <div className="asset-grid" style={{ marginTop: 14 }}>
          {assets.map((asset) => (
            <button
              key={asset.id}
              type="button"
              className={`asset-card ${selectedId === asset.id ? 'selected' : ''}`}
              onClick={() => onSelect(asset)}
            >
              <div className="ac-top">
                <span className="ac-badge">{asset.filePath.split('.').pop()?.slice(0, 3).toUpperCase()}</span>
                <strong>{asset.title}</strong>
                <span className={`status-pip ${asset.status}`}>{statusPip(asset.status)}</span>
              </div>
              <small>{asset.summary}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function statusPip(status: MissionAsset['status']) {
  return status === 'ready' ? '就绪' : status === 'warning' ? '待查' : status === 'blocked' ? '阻断' : '草稿';
}

/* ---------- Execution log ---------- */
export function ExecutionLog({ events }: { events: ToolEvent[] }) {
  if (!events.length) {
    return <div className="empty">工具调用时间线会在 Mission 运行后出现，可检查每一步产出从哪里来。</div>;
  }
  return (
    <div className="log">
      {events.map((event, index) => (
        <div className={`log-row ${event.status}`} key={event.id}>
          <span className="lt">{String(index + 1).padStart(2, '0')}</span>
          <span className="lk">{event.toolName}</span>
          <span className="lm">
            {event.title}
            {event.summary ? ` · ${event.summary}` : ''}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ---------- Storyboard view (分镜故事板) ---------- */
export function StoryboardView({
  shots,
  selectedId,
  cameraMove,
  onSelect,
  onRewrite
}: {
  shots: PreviewScene[];
  selectedId: string;
  cameraMove: string;
  onSelect: (id: string) => void;
  onRewrite: (id: string, kind: 'visual' | 'camera' | 'action') => void;
}) {
  if (!shots.length) {
    return (
      <div className="empty">
        <IconFilm />
        <div>还没有分镜。发出需求后，Scene 与 Shot Agent 会把视频拆成逐镜画面、动作和运镜。</div>
      </div>
    );
  }
  return (
    <div className="storyboard">
      {shots.map((shot, index) => (
        <div
          key={shot.id}
          className={`sb-card ${selectedId === shot.id ? 'selected' : ''}`}
          onClick={() => onSelect(shot.id)}
        >
          <div className="sb-frame">
            <span className="sb-num">{String(index + 1).padStart(2, '0')}</span>
            <span className="sb-dur">{shot.durationSeconds}s</span>
            <span className="sb-cam">
              <IconCamera /> {cameraMove}
            </span>
          </div>
          <div className="sb-body">
            <div className="sb-field">
              <small>画面</small>
              <p>{shot.visual}</p>
            </div>
            <div className="sb-field">
              <small>字幕 / 旁白</small>
              <p>{shot.subtitle || shot.title}</p>
            </div>
          </div>
          <div className="sb-acts">
            <button
              type="button"
              className="pill"
              onClick={(e) => {
                e.stopPropagation();
                onRewrite(shot.id, 'visual');
              }}
            >
              <IconWand /> 改画面
            </button>
            <button
              type="button"
              className="pill"
              onClick={(e) => {
                e.stopPropagation();
                onRewrite(shot.id, 'camera');
              }}
            >
              <IconCamera /> 改运镜
            </button>
            <button
              type="button"
              className="pill"
              onClick={(e) => {
                e.stopPropagation();
                onRewrite(shot.id, 'action');
              }}
            >
              <IconFilm /> 改动作
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- Video generation handoff ---------- */
export type HandoffData = {
  visualStyle?: string;
  renderSpec?: Record<string, unknown>;
  character?: { primarySubject?: string; consistencyPrompt?: string; negativePrompt?: string };
  prompts?: Array<{
    id?: string;
    sceneId?: string;
    type?: string;
    renderTask?: string;
    durationSeconds?: number;
    prompt?: string;
  }>;
  renderQueue?: Array<{ id?: string; sceneId?: string; status?: string }>;
};

export type VideoRenderState = {
  status: 'idle' | 'submitting' | 'submitted' | 'polling' | 'completed' | 'failed';
  videoId?: string;
  videoUrl?: string;
  progress?: number;
  error?: string;
};

const SPEC_FIELDS: Array<{ key: string; label: string }> = [
  { key: 'aspectRatio', label: '画幅' },
  { key: 'resolutionTier', label: '分辨率' },
  { key: 'numFrames', label: '帧数' },
  { key: 'frameRate', label: '帧率' },
  { key: 'estimatedClipDurationSeconds', label: '单条时长(s)' },
  { key: 'generationMode', label: '生成模式' },
  { key: 'cameraMove', label: '运镜' },
  { key: 'frameLock', label: '首尾帧' }
];

export function VideoGenHandoff({
  ready,
  missing,
  data,
  onPrepare,
  onRender,
  onPoll,
  renderState
}: {
  ready: boolean;
  missing: string;
  data: HandoffData;
  onPrepare: () => void;
  onRender?: () => void;
  onPoll?: () => void;
  renderState?: VideoRenderState;
}) {
  if (!ready) {
    return (
      <div className="handoff-lock">
        <IconShield />
        <strong>先确认制作包</strong>
        <p>确认脚本、分镜和素材提示词后，才能准备视频模型任务。{missing}</p>
      </div>
    );
  }

  const prompts = data.prompts || [];
  const character = data.character || {};
  const spec = data.renderSpec || {};
  const taskCount = Math.max(data.renderQueue?.length || 0, prompts.length);

  return (
    <div>
      <div className="handoff-note">
        <IconAlert />
        <span>
          这里还不是成片视频，只是生成前准备。第一版会先生成约 15 秒小节，全部小节确认后再合成完整视频。
        </span>
      </div>

      {SPEC_FIELDS.some((f) => spec[f.key] != null) && (
        <div className="spec-chips">
          {SPEC_FIELDS.filter((f) => spec[f.key] != null).map((f) => (
            <span className="spec-chip" key={f.key}>
              <small>{f.label}</small>
              <strong>{String(spec[f.key])}</strong>
            </span>
          ))}
        </div>
      )}

      {(character.consistencyPrompt || character.negativePrompt) && (
        <div className="handoff-block">
          <div className="handoff-block-head">
            <IconWand /> 角色一致性 / 避免项
          </div>
          {character.primarySubject && <p className="handoff-subject">{character.primarySubject}</p>}
          {character.consistencyPrompt && (
            <pre className="handoff-prompt pos">{character.consistencyPrompt}</pre>
          )}
          {character.negativePrompt && <pre className="handoff-prompt neg">— {character.negativePrompt}</pre>}
        </div>
      )}

      <div className="shot-list">
        {prompts.length ? (
          prompts.map((shot, index) => (
            <div className="shot-card" key={shot.id || index}>
              <div className="shot-top">
                <span className={`shot-type ${shot.type === 'image' ? 'image' : 'video'}`}>
                  {shot.type === 'image' ? <IconCamera /> : <IconFilm />}
                  {shot.type === 'image' ? '首帧图' : '视频镜头'}
                </span>
                <strong>{shot.renderTask || `镜头 ${index + 1}`}</strong>
                <small>{shot.durationSeconds ? `${shot.durationSeconds}s` : ''}</small>
              </div>
              <pre className="shot-prompt">{shot.prompt}</pre>
            </div>
          ))
        ) : (
          <div className="handoff-empty">
            <IconFilm />
            <span>还没有镜头任务。点击下方按钮，把当前制作包整理成视频模型可用的任务。</span>
          </div>
        )}
      </div>

      <div className="handoff-foot">
        <span className="render-status">
          <IconClock /> {taskCount ? `已准备 ${taskCount} 个镜头任务` : '待准备视频任务'}
        </span>
        <div className="handoff-actions">
          <button type="button" className="btn sm" onClick={onPrepare}>
            <IconFilm /> {taskCount ? '更新视频任务' : '准备视频任务'}
          </button>
          {onRender && (
            <button
              type="button"
              className="btn sm primary"
              onClick={onRender}
              disabled={!taskCount || renderState?.status === 'submitting' || renderState?.status === 'polling'}
            >
              <IconFilm /> {renderState?.status === 'submitting' ? '提交中' : '生成本节视频'}
            </button>
          )}
        </div>
      </div>

      {renderState && renderState.status !== 'idle' && (
        <div className={`video-render-card ${renderState.status}`}>
          <div>
            <strong>
              {renderState.status === 'completed'
                ? '视频已生成'
                : renderState.status === 'failed'
                  ? '生成失败'
                  : '视频任务已提交'}
            </strong>
            <p>
              {renderState.error ||
                (renderState.videoId ? `任务 ID：${renderState.videoId}` : '正在把镜头任务提交给视频模型。')}
              {typeof renderState.progress === 'number' ? ` · ${renderState.progress}%` : ''}
            </p>
          </div>
          <div className="handoff-actions">
            {renderState.videoUrl && (
              <a className="btn sm primary" href={renderState.videoUrl} target="_blank" rel="noreferrer">
                查看视频
              </a>
            )}
            {onPoll && renderState.videoId && renderState.status !== 'completed' && (
              <button type="button" className="btn sm" onClick={onPoll} disabled={renderState.status === 'polling'}>
                刷新状态
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Approval queue ---------- */
export function ApprovalQueue({
  patches,
  selectedId,
  onSelect,
  onApprove,
  onReject
}: {
  patches: PatchOperation[];
  selectedId: string;
  onSelect: (id: string) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  if (!patches.length) {
    return (
      <div className="empty">
        <IconCheckCircle />
        <div>没有待审批的写入。系统不会静默覆盖项目资产。</div>
      </div>
    );
  }
  return (
    <div>
      {patches.map((patch) => (
        <div
          key={patch.id}
          className={`approval-row ${selectedId === patch.id ? 'selected' : ''}`}
          onClick={() => onSelect(patch.id)}
        >
          <span className={`approval-risk ${patch.riskLevel}`} />
          <span className="approval-main">
            <strong>{patch.filePath}</strong>
            <small>{patch.summary}</small>
          </span>
          <span className="approval-acts">
            <button
              type="button"
              className="btn sm danger"
              onClick={(e) => {
                e.stopPropagation();
                onReject(patch.id);
              }}
            >
              <IconX /> 拒绝
            </button>
            <button
              type="button"
              className="btn sm primary"
              onClick={(e) => {
                e.stopPropagation();
                onApprove(patch.id);
              }}
            >
              <IconGitMerge /> 合并
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}
