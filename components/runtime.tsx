'use client';

import { useEffect, useRef, useState } from 'react';
import type {
  AgentDefinition,
  AgentEvent,
  AIGCAgentId,
  MissionAsset,
  PatchOperation,
  PreviewScene,
  ProductionStageStatus,
  ToolEvent,
  VideoRenderJob
} from '../lib/types';
import { finalCutStatusLabel, type FinalCutState } from '../lib/videoStitch';
import {
  IconAlert,
  IconCamera,
  IconCheck,
  IconCheckCircle,
  IconClock,
  IconDownload,
  IconFilm,
  IconGitMerge,
  IconLayers,
  IconLoader,
  IconRefresh,
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
        <div>还没有分镜。发出需求后，结构编剧与分镜师会把视频拆成逐镜画面、动作和运镜。</div>
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
    referenceImageUrl?: string;
    referenceImages?: string[];
    mode?: string;
  }>;
  renderQueue?: Array<{
    id?: string;
    sceneId?: string;
    status?: string;
    referenceImageUrl?: string;
    referenceImages?: string[];
    mode?: string;
  }>;
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

/* ---------- Continuous clip reel ---------- */

type ReelClip = {
  promptId: string;
  label: string;
  url: string;
  shotNumber: number;
  durationSeconds?: number;
};

/**
 * 逐个点开 12 个小播放器，永远听不出段落之间的音量跳变、音色漂移和硬切接缝——
 * 那些问题只在连续播放时才存在。真正的 ffmpeg 合成还没做，这里先用顺序播放
 * 让用户（和我们自己）在产品里就能听到接近成片的效果，而不是等拿到成片才发现。
 */
function ClipReel({ clips, totalShots }: { clips: ReelClip[]; totalShots: number }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  /** 换段时是否要接着播。用户第一次点播放前保持 false，避免被浏览器自动播放策略拦截。 */
  const resumeRef = useRef(false);
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [broken, setBroken] = useState<Record<string, boolean>>({});

  // 重新准备某个镜头会让已完成片段变少，旧下标会指到不存在的片段上。
  useEffect(() => {
    setCurrent((index) => (index > clips.length - 1 ? Math.max(0, clips.length - 1) : index));
  }, [clips.length]);

  const active: ReelClip | undefined = clips[current];
  const activeUrl = active?.url;

  // 换 src 之后必须显式 load()，否则部分浏览器还在放上一段的解码缓冲。
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeUrl) return;
    video.load();
    if (resumeRef.current) void video.play().catch(() => undefined);
  }, [activeUrl]);

  if (!clips.length) return null;

  function advanceFrom(index: number) {
    const next = index + 1;
    if (next < clips.length) {
      resumeRef.current = true;
      setCurrent(next);
      return;
    }
    resumeRef.current = false;
    setPlaying(false);
  }

  function jumpTo(index: number) {
    if (index === current) {
      void videoRef.current?.play().catch(() => undefined);
      return;
    }
    resumeRef.current = true;
    setCurrent(index);
  }

  const totalSeconds = clips.reduce((sum, clip) => sum + (clip.durationSeconds || 0), 0);
  const skipped = totalShots - clips.length;

  return (
    <div className="clip-reel">
      <div className="clip-reel-head">
        <strong>
          <IconFilm /> 连续预览
        </strong>
        <span className="clip-reel-count">
          {clips.length} / {totalShots} 段可连播
          {totalSeconds > 0 ? ` · 约 ${Math.round(totalSeconds)}s` : ''}
        </span>
      </div>

      <p className="clip-reel-hint">
        按顺序连续播放已完成片段，用来检查段落接缝：音量是否忽大忽小、音色是否跳变、画面是否接得上。
        这不是最终合成文件，片段之间没有做任何过渡处理。
        {skipped > 0 ? ` 还有 ${skipped} 段未完成，连播时会跳过。` : ''}
      </p>

      <video
        ref={videoRef}
        className="clip-reel-video"
        src={activeUrl}
        controls
        playsInline
        preload="auto"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => advanceFrom(current)}
        onError={() => {
          if (!active) return;
          setBroken((state) => ({ ...state, [active.promptId]: true }));
          if (resumeRef.current) advanceFrom(current);
        }}
      />

      <div className="clip-reel-now">
        正在播放 <b>第 {active?.shotNumber} 段</b>
        {active?.label ? ` · ${active.label}` : ''}
        {active && broken[active.promptId] ? ' · 该片段加载失败，生成链接可能已过期' : ''}
      </div>

      <div className="clip-reel-chapters">
        {clips.map((clip, index) => (
          <button
            type="button"
            key={clip.promptId}
            className={`clip-reel-chapter${index === current ? ' active' : ''}${broken[clip.promptId] ? ' broken' : ''}`}
            title={clip.label}
            onClick={() => jumpTo(index)}
          >
            {clip.shotNumber}
          </button>
        ))}
      </div>

      <div className="handoff-actions">
        <button type="button" className="btn sm" onClick={() => jumpTo(0)}>
          <IconFilm /> 从第 1 段连播
        </button>
        <span className="clip-reel-state">{playing ? '连播中' : '已暂停'}</span>
      </div>
    </div>
  );
}

function formatBytes(bytes?: number) {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatClock(seconds?: number) {
  if (!seconds || seconds <= 0) return '';
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)} 分 ${String(total % 60).padStart(2, '0')} 秒`;
}

/**
 * 成片区。
 *
 * 片段全部完成之后，这里是唯一的下一步。在它存在之前，用户跑完 36 段会停在
 * 一个只写着「可用上方连续预览检查接缝」的状态卡上，界面上最显眼的按钮却还是
 * 「确认视频任务并开始生成」——点下去必然报错。
 */
export function FinalCutPanel({
  clipsReady,
  clipCount,
  finalCut,
  available,
  hint,
  starting,
  onStitch
}: {
  clipsReady: boolean;
  clipCount: number;
  finalCut: FinalCutState | null;
  available: boolean;
  hint: string;
  starting: boolean;
  onStitch: () => void;
}) {
  const stitching = finalCut?.status === 'stitching';
  const completed = finalCut?.status === 'completed';
  const failed = finalCut?.status === 'failed';
  if (!clipsReady && !finalCut) return null;

  return (
    <div className={`final-cut-panel ${finalCut?.status || (clipsReady ? 'idle' : '')}`}>
      <div className="final-cut-head">
        <strong>
          <IconLayers /> 成片合成
        </strong>
        <span className="final-cut-state">{finalCutStatusLabel(finalCut)}</span>
      </div>

      {stitching && (
        <>
          <div className="shot-progress-bar">
            <i style={{ width: `${finalCut?.progress || 0}%` }} />
          </div>
          <p className="handoff-subject">
            {finalCut?.progress || 0}% · 合成期间不要修改镜头。这一步只在本机做，不再向模型付费。
          </p>
        </>
      )}

      {completed && (
        <>
          <video controls preload="metadata" src={finalCut?.fileUrl} style={{ width: '100%', maxHeight: 360, background: '#000' }} />
          <div className="final-cut-meta">
            {[
              formatClock(finalCut?.durationSeconds),
              formatBytes(finalCut?.sizeBytes),
              finalCut?.clipCount ? `${finalCut.clipCount} 段拼接` : '',
              finalCut?.encodeMode === 'reencode' ? '重编码' : '直接拼流（无重压损失）'
            ]
              .filter(Boolean)
              .map((text) => <span className="spec-chip" key={text}><strong>{text}</strong></span>)}
          </div>
          {finalCut?.note && <p className="handoff-subject">{finalCut.note}</p>}
        </>
      )}

      {failed && <p className="final-cut-error">{finalCut?.error || '合成失败。'}</p>}

      {!available && <pre className="handoff-prompt neg">{hint}</pre>}

      <div className="handoff-actions" style={{ flexWrap: 'wrap' }}>
        <button
          type="button"
          className={`btn sm ${completed ? '' : 'primary'}`}
          onClick={onStitch}
          disabled={!available || stitching || starting || !clipsReady}
          title={
            !available
              ? '这台机器上没有 ffmpeg，合成不可用'
              : !clipsReady
                ? '还有镜头没有完成的片段，合成会漏掉它们'
                : ''
          }
        >
          {completed || failed ? <IconRefresh /> : <IconFilm />}
          {starting || stitching
            ? '合成中'
            : completed
              ? '重新合成'
              : failed
                ? '重试合成'
                : `合成完整视频（${clipCount} 段）`}
        </button>
        {completed && finalCut?.fileUrl && (
          <a className="btn sm primary" href={`${finalCut.fileUrl}&download=1`} download={finalCut.fileName || 'final-cut.mp4'}>
            <IconDownload /> 下载成片
          </a>
        )}
      </div>
    </div>
  );
}

export function VideoGenHandoff({
  ready,
  missing,
  data,
  onPrepare,
  jobs,
  batchStatus,
  stageStatus,
  confirming,
  editingDisabled,
  finalCut,
  stitchAvailable,
  stitchHint,
  stitchStarting,
  onStitch,
  onConfirmVideoTasks,
  onRetryFailed,
  onUpdatePrompt,
  onReplaceReference,
  onReprepareShot
}: {
  ready: boolean;
  missing: string;
  data: HandoffData;
  onPrepare: () => void;
  jobs: VideoRenderJob[];
  batchStatus: 'rendering' | 'failed' | 'clips_ready';
  stageStatus: ProductionStageStatus;
  confirming: boolean;
  editingDisabled: boolean;
  finalCut: FinalCutState | null;
  stitchAvailable: boolean;
  stitchHint: string;
  stitchStarting: boolean;
  onStitch: () => void;
  onConfirmVideoTasks: () => void;
  onRetryFailed: () => void;
  onUpdatePrompt: (promptId: string, prompt: string) => void;
  onReplaceReference: (promptId: string, file?: File) => void;
  onReprepareShot: (promptId: string) => void;
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

  // asset_prompts.json 是模型写的，字段类型不能假设：referenceImages 里混进对象或数字时，
  // 用 value?.trim() 判空会直接抛 "value.trim is not a function"，整个视频面板白屏。
  const isFilledString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
  const prompts = (data.prompts || []).filter((shot) => shot.type === 'video' && isFilledString(shot.prompt));
  const character = data.character || {};
  const spec = data.renderSpec || {};
  const taskCount = prompts.length;
  const failedJobs = jobs.filter((job) => job.status === 'failed');
  const jobFor = (promptId: string | undefined) => jobs.find((job) => job.promptId === promptId);
  const referencesFor = (shot: NonNullable<HandoffData['prompts']>[number]) =>
    Array.from(new Set([shot.referenceImageUrl, ...(Array.isArray(shot.referenceImages) ? shot.referenceImages : [])].filter(isFilledString)));
  const jobLabel = (job?: VideoRenderJob) => {
    if (!job) return '待最终确认';
    if (job.status === 'completed') return '片段已完成';
    if (job.status === 'failed') return '生成失败';
    if (job.status === 'submitting') return '提交中';
    if (job.status === 'submitted' || job.status === 'polling') return `生成中${typeof job.progress === 'number' ? ` ${job.progress}%` : ''}`;
    return '等待提交';
  };

  // 12 个镜头卡片每张都有 420px 高，光靠卡片里那行小字根本没法一眼看出整批跑到哪了。
  const jobPhase = (job?: VideoRenderJob): 'pending' | 'submitting' | 'rendering' | 'completed' | 'failed' => {
    if (!job || job.status === 'ready') return 'pending';
    if (job.status === 'completed') return 'completed';
    if (job.status === 'failed') return 'failed';
    if (job.status === 'submitting') return 'submitting';
    return 'rendering';
  };
  const shotProgress = prompts.map((shot, index) => {
    const job = jobFor(shot.id || `video-prompt-${index + 1}`);
    return {
      index,
      label: shot.renderTask || `镜头 ${index + 1}`,
      phase: jobPhase(job),
      percent: typeof job?.progress === 'number' ? job.progress : 0,
      error: job?.error || ''
    };
  });
  const countOf = (phase: string) => shotProgress.filter((item) => item.phase === phase).length;
  const completedCount = countOf('completed');

  // 连播只收已完成且真的拿到 URL 的片段，并保持镜头原始顺序——顺序错了，接缝检查就没意义。
  const reelClips: ReelClip[] = prompts.flatMap((shot, index) => {
    const promptId = shot.id || `video-prompt-${index + 1}`;
    const job = jobFor(promptId);
    if (job?.status !== 'completed' || !isFilledString(job.videoUrl)) return [];
    return [{
      promptId,
      label: shot.renderTask || `镜头 ${index + 1}`,
      url: job.videoUrl,
      shotNumber: index + 1,
      durationSeconds: shot.durationSeconds
    }];
  });
  const phaseText: Record<string, string> = {
    pending: '待提交',
    submitting: '提交中',
    rendering: '生成中',
    completed: '已完成',
    failed: '失败'
  };

  /**
   * 「确认视频任务并开始生成」只在阶段真的待确认时才可点。
   *
   * 这个按钮以前只看有没有任务、是否在提交、缺不缺参考图，于是渲染完成之后它依然是
   * 一颗亮着的主按钮——用户点下去才被 confirmVideoTasksAndStartRendering 拦住，
   * 收到一句「视频任务必须处于待确认状态」。能不能点是这里就知道的事，
   * 不该留到点完再用红条告诉用户。
   */
  const confirmable = stageStatus === 'ready_for_review';
  const confirmBlockedReason = confirmable
    ? ''
    : stageStatus === 'generating'
      ? '任务包还在生成，等它出来再确认。'
      : stageStatus === 'rendering' || stageStatus === 'qa_pending'
        ? '这一批已经在生成片段了。要改镜头请先改，改完会重新回到待确认。'
        : stageStatus === 'stitching'
          ? '正在合成成片，等它跑完。'
          : batchStatus === 'clips_ready'
            ? '这一批片段已经全部完成，下一步是合成成片。改过镜头才需要重新确认。'
            : stageStatus === 'completed'
              ? '这一批已经完成。改过镜头才需要重新确认。'
              : '当前阶段不处于待确认状态。修改任意镜头会重新回到待确认。';
  const confirmLabel = confirmable
    ? '确认视频任务并开始生成'
    : stageStatus === 'rendering' || stageStatus === 'qa_pending'
      ? '片段生成中'
      : stageStatus === 'stitching'
        ? '成片合成中'
        : batchStatus === 'clips_ready' || stageStatus === 'completed'
          ? '这一批已确认'
          : '等待任务包就绪';

  return (
    <div>
      <div className="handoff-note">
        <IconAlert />
        <span>
          {batchStatus === 'clips_ready'
            ? '全部小节已生成。先用下方连续预览检查接缝，确认没问题后在「成片合成」里拼成单一视频文件。'
            : '这里还不是成片视频，只是生成前准备。会先生成约 15 秒小节，全部小节完成后再合成完整视频。'}
        </span>
      </div>

      {jobs.length > 0 && (
        <div className={`shot-progress-panel ${batchStatus}`}>
          <div className="shot-progress-head">
            <strong>镜头生成进度</strong>
            <span className="shot-progress-count">已完成 {completedCount} / {shotProgress.length}</span>
          </div>
          <div className="shot-progress-bar">
            <i style={{ width: `${shotProgress.length ? (completedCount / shotProgress.length) * 100 : 0}%` }} />
          </div>
          <div className="shot-progress-legend">
            {(['rendering', 'submitting', 'pending', 'failed'] as const)
              .filter((phase) => countOf(phase) > 0)
              .map((phase) => (
                <span key={phase} className={`shot-progress-tag ${phase}`}>
                  {phaseText[phase]} {countOf(phase)}
                </span>
              ))}
          </div>
          <div className="shot-progress-grid">
            {shotProgress.map((item) => (
              <div
                key={item.index}
                className={`shot-progress-cell ${item.phase}`}
                title={`${item.label}：${phaseText[item.phase]}${item.error ? `｜${item.error}` : ''}`}
              >
                <b>{item.index + 1}</b>
                <span>
                  {phaseText[item.phase]}
                  {item.phase === 'rendering' && item.percent > 0 ? ` ${item.percent}%` : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <ClipReel clips={reelClips} totalShots={prompts.length} />

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
          prompts.map((shot, index) => {
            const promptId = shot.id || `video-prompt-${index + 1}`;
            const job = jobFor(promptId);
            const references = referencesFor(shot);
            const missingReference = references.length === 0;
            return (
            <div className="shot-card" key={promptId} style={{ minHeight: 420, display: 'grid', alignContent: 'start', gap: 10 }}>
              <div className="shot-top">
                <span className="shot-type video">
                  <IconFilm /> 视频镜头
                </span>
                <strong>{shot.renderTask || `镜头 ${index + 1}`}</strong>
                <small>{shot.durationSeconds ? `${shot.durationSeconds}s` : ''}</small>
              </div>
              <div className="handoff-subject">模式：{shot.mode || '待指定'} · {missingReference ? '缺少参考图' : `已绑定 ${references.length} 张参考图`}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
                {references.map((reference) => (
                  <img key={reference} src={reference} alt={`${shot.renderTask || `镜头 ${index + 1}`}参考图`} style={{ width: '100%', height: 132, objectFit: 'cover' }} />
                ))}
              </div>
              <textarea
                aria-label={`${shot.renderTask || `镜头 ${index + 1}`}提示词`}
                defaultValue={shot.prompt}
                onBlur={(event) => onUpdatePrompt(promptId, event.currentTarget.value)}
                disabled={editingDisabled}
                style={{ width: '100%', minHeight: 112, resize: 'vertical' }}
              />
              <div className="handoff-subject">{jobLabel(job)}{job?.error ? `：${job.error}` : ''}</div>
              {job?.videoUrl && <video controls src={job.videoUrl} style={{ width: '100%', maxHeight: 180 }} />}
              <div className="handoff-actions" style={{ flexWrap: 'wrap' }}>
                <label className="btn sm" aria-disabled={editingDisabled} style={editingDisabled ? { opacity: 0.55, pointerEvents: 'none' } : undefined}>
                  <IconCamera /> 替换参考图
                  <input type="file" accept="image/*" hidden disabled={editingDisabled} onChange={(event) => onReplaceReference(promptId, event.target.files?.[0])} />
                </label>
                <button type="button" className="btn sm" disabled={editingDisabled} onClick={() => onReprepareShot(promptId)}>
                  <IconFilm /> 重新准备此镜头
                </button>
              </div>
            </div>
            );
          })
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
          <button type="button" className="btn sm" onClick={onPrepare} disabled={editingDisabled}>
            <IconFilm /> {taskCount ? '更新视频任务' : '准备视频任务'}
          </button>
          <button
            type="button"
            className="btn sm primary"
            onClick={onConfirmVideoTasks}
            disabled={!confirmable || !taskCount || confirming || Boolean(missing)}
            title={confirmBlockedReason}
          >
            <IconCheck /> {confirming ? '确认并提交中' : confirmLabel}
          </button>
          {failedJobs.length > 0 && (
            <button type="button" className="btn sm" onClick={onRetryFailed} disabled={confirming}>
              <IconFilm /> 重试失败镜头（{failedJobs.length}）
            </button>
          )}
        </div>
      </div>

      {jobs.length > 0 && batchStatus !== 'clips_ready' && (
        <div className={`video-render-card ${batchStatus}`}>
          <strong>{batchStatus === 'failed' ? '存在失败镜头，已完成片段会被保留' : '正在生成镜头片段'}</strong>
        </div>
      )}

      <FinalCutPanel
        clipsReady={batchStatus === 'clips_ready'}
        clipCount={reelClips.length}
        finalCut={finalCut}
        available={stitchAvailable}
        hint={stitchHint}
        starting={stitchStarting}
        onStitch={onStitch}
      />
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
            <strong>
              {patch.filePath}
              {patch.origin?.templateFallback && (
                <span
                  className={`patch-fallback-tag ${patch.origin.templateFallback === 'repaired' ? 'repaired' : ''}`}
                  title={patch.origin.templateFallback === 'repaired'
                    ? '主体内容来自模型，只补齐了它漏掉的字段，请核对补齐项'
                    : '内容由内置模板生成，不是模型输出，请逐条核对后再合并'}
                >
                  {patch.origin.templateFallback === 'repaired' ? '已补齐字段' : '模板兜底'}
                </span>
              )}
            </strong>
            <small>{patch.summary}</small>
            {patch.origin?.templateFallback && (
              <small className="patch-fallback-note">
                {patch.origin.templateFallback === 'missing'
                  ? '模型没有产出这个文件，以下内容由内置模板生成，很可能与你的业务无关。'
                  : patch.origin.templateFallback === 'repaired'
                    ? '人物本身来自模型和你的剧本，只有缺失字段是系统补的，请核对这些补齐项。'
                    : '模型产出未通过结构校验，已被内置模板替换，很可能与你的业务无关。'}
              </small>
            )}
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
