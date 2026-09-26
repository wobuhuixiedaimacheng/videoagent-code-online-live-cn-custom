import { clampShotDuration, normalizePhysicsMode } from './shotPhysics';
import type { VideoRenderJob as ProductionVideoRenderJob } from './types';
import type { VideoQaRetryStrategy } from './videoQa';

export type VideoRenderJob = ProductionVideoRenderJob & {
  prompt: string;
};

const SUCCESSFUL_PROVIDER_STATUSES = new Set(['completed', 'succeeded', 'success', 'done']);
const FAILED_PROVIDER_STATUSES = new Set(['failed', 'failure', 'error', 'rejected', 'cancelled', 'canceled', 'aborted']);

export type VideoPromptInput = {
  id?: string;
  type?: string;
  prompt?: string;
  physicsMode?: string;
  durationSeconds?: number;
};

export function createVideoRenderJobs(prompts: VideoPromptInput[]): VideoRenderJob[] {
  const promptIds = new Set<string>();

  return prompts.flatMap((prompt, index) => {
    const promptId = prompt.id?.trim() || `video-prompt-${index + 1}`;
    if (prompt.type !== 'video' || !prompt.prompt?.trim() || promptIds.has(promptId)) return [];
    promptIds.add(promptId);
    const physicsMode = normalizePhysicsMode(prompt.physicsMode);
    return [{
      id: `video-${promptId}`,
      promptId,
      prompt: prompt.prompt.trim(),
      status: 'ready' as const,
      attempt: 0,
      qaAttempt: 0,
      physicsMode,
      durationSeconds: clampShotDuration(prompt.durationSeconds, physicsMode),
      progress: 0
    }];
  });
}

export function updateVideoRenderJob(
  jobs: VideoRenderJob[],
  id: string,
  patch: Partial<VideoRenderJob>
): VideoRenderJob[] {
  const index = jobs.findIndex((job) => job.id === id);
  if (index < 0) return jobs;

  const current = jobs[index];
  const next = {
    ...current,
    ...patch,
    id: current.id,
    promptId: current.promptId
  };
  if (Object.keys(next).every((key) => next[key as keyof VideoRenderJob] === current[key as keyof VideoRenderJob])) {
    return jobs;
  }

  return jobs.map((job) => job.id === id ? next : job);
}

/** qa_failed 也归这里：它同样是「这个镜头要重来」，只是原因是画面而不是上游报错。 */
export function retryableVideoJobs(jobs: VideoRenderJob[]): VideoRenderJob[] {
  return jobs.filter((job) => job.status === 'failed' || job.status === 'qa_failed');
}

/** 渲染完成、等着抽帧送检的片段。 */
export function qaPendingVideoJobs(jobs: VideoRenderJob[]): VideoRenderJob[] {
  return jobs.filter((job) => job.status === 'qa_pending' && Boolean(job.videoUrl));
}

/**
 * 编辑单个镜头只让那个镜头的片段失效，其余已完成片段必须原样保留。
 * 整包重新准备（prepareVideoTaskDraft）才清空全部 job。
 */
export function dropVideoJobsForPrompt(jobs: VideoRenderJob[], promptId: string): VideoRenderJob[] {
  const next = jobs.filter((job) => job.promptId !== promptId);
  return next.length === jobs.length ? jobs : next;
}

/**
 * 重新确认任务包时，把上一轮已经渲染成功的片段带过来，
 * 避免为了改一个镜头而重复提交（并重复计费）全部镜头。
 */
export function preserveCompletedVideoJobs(
  freshJobs: VideoRenderJob[],
  previousJobs: VideoRenderJob[]
): VideoRenderJob[] {
  const completed = new Map(
    previousJobs
      .filter((job) => job.status === 'completed' && Boolean(job.videoUrl))
      .map((job) => [job.promptId, job])
  );
  return freshJobs.map((job) => {
    const done = completed.get(job.promptId);
    if (!done) return job;
    return { ...done, id: job.id, promptId: job.promptId, prompt: job.prompt };
  });
}

/**
 * qa_pending 的片段已经在上游渲染成功了，只是还没送检。
 * 把它算进待提交会让同一个镜头再渲一遍——重复计费，而且旧的那段还在。
 */
export function submittableVideoJobs(jobs: VideoRenderJob[]): VideoRenderJob[] {
  return jobs.filter((job) => job.status !== 'completed' && job.status !== 'qa_pending');
}

// queue.?full / video_queue_full 是上游容量打满时的回应，语义就是「等会儿再来」。
// 漏掉它的代价是实打实的：整批 12 个镜头里那个撞上队列满的会被判永久失败，
// 而它旁边 11 个正常渲染完了——用户拿到 11 段成片，卡在最后一段上。
const RATE_LIMIT_PATTERN = /rate.?limit|too\s*many|429|quota|concurren|queue.{0,4}(is\s*)?full|queue_full/i;
const TRANSIENT_PATTERN = /timeout|timed out|abort|network|fetch failed|socket|ECONNRESET|ETIMEDOUT|EAI_AGAIN|bad gateway|gateway timeout|service unavailable|temporarily|try again|50[234]/i;

export const VIDEO_SUBMIT_MAX_ATTEMPTS = 4;
export const VIDEO_RATE_LIMIT_WAIT_MS = 65000;

export function isRateLimitedVideoError(message: unknown, httpStatus?: number): boolean {
  if (httpStatus === 429) return true;
  const text = message instanceof Error ? message.message : typeof message === 'string' ? message : '';
  return RATE_LIMIT_PATTERN.test(text);
}

/**
 * 限流和网络抖动不是「这个镜头废了」，只是「等会儿再说」。
 * 之前主应用把两者都判成永久 failed，一次 429 就烧掉一个正在渲染的镜头。
 */
export function isRetryableVideoError(message: unknown, httpStatus?: number): boolean {
  if (isRateLimitedVideoError(message, httpStatus)) return true;
  if (httpStatus === 408 || (typeof httpStatus === 'number' && httpStatus >= 500 && httpStatus < 600)) return true;
  const text = message instanceof Error ? message.message : typeof message === 'string' ? message : '';
  return TRANSIENT_PATTERN.test(text);
}

export type VideoRetryDecision = {
  retry: boolean;
  delayMs: number;
  rateLimited: boolean;
};

export function classifyVideoSubmitError(
  message: unknown,
  httpStatus: number | undefined,
  attempt: number,
  maxAttempts: number = VIDEO_SUBMIT_MAX_ATTEMPTS
): VideoRetryDecision {
  const rateLimited = isRateLimitedVideoError(message, httpStatus);
  const retryable = isRetryableVideoError(message, httpStatus);
  if (!retryable || attempt >= maxAttempts) return { retry: false, delayMs: 0, rateLimited };
  // 限流必须等满窗口，否则下一次只是再换一个 429；其余抖动指数退避即可。
  const delayMs = rateLimited ? VIDEO_RATE_LIMIT_WAIT_MS : Math.min(30000, 4000 * 2 ** (attempt - 1));
  return { retry: true, delayMs, rateLimited };
}

export function pendingVideoJobs(jobs: VideoRenderJob[]): VideoRenderJob[] {
  return jobs.filter((job) => job.status === 'ready');
}

export function resumableVideoJobs(jobs: VideoRenderJob[]): VideoRenderJob[] {
  return jobs.filter(
    (job) => (job.status === 'submitted' || job.status === 'polling') && Boolean(job.providerTaskId)
  );
}

/**
 * 提交发出去了却没拿到任务 ID：无法判断上游到底有没有受理，自动重发有重复生成的风险，
 * 只能交给人工确认。ready 不属于这里——它一次网络请求都没发过，见 resubmittableRestoredVideoJobs。
 */
export function unrecoverableRestoredVideoJobIds(jobs: VideoRenderJob[]): string[] {
  return jobs
    .filter((job) => (
      (job.status === 'submitting' || job.status === 'submitted' || job.status === 'polling') && !job.providerTaskId
    ))
    .map((job) => job.id);
}

/**
 * ready = 任务建好了但一次都没提交过。提交 12 个镜头时并发只有 2，任何时刻都有约 10 个
 * 躺在 ready，页面一刷新就全中招。既然从没发出去，续跑既不会重复生成也不会重复计费——
 * 把它们判成「中断」纯属自找麻烦。
 */
export function resubmittableRestoredVideoJobs(jobs: VideoRenderJob[]): VideoRenderJob[] {
  return jobs.filter((job) => job.status === 'ready');
}

export function timeoutPendingVideoJobIds(outcomes: Array<{ id: string; pending: boolean }>): string[] {
  return outcomes.filter((outcome) => outcome.pending).map((outcome) => outcome.id);
}

export function videoRecoveryBatchKey(projectId: string, jobs: VideoRenderJob[]): string {
  // 带上 qaAttempt：质检重渲会换 prompt 重新提交，这是一次新的批次，
  // 不带的话恢复逻辑会认为「还是上次那批」而跳过。
  return `${projectId}:${jobs.map((job) => `${job.id}@${job.attempt}.${job.qaAttempt ?? 0}`).sort().join('|')}`;
}

/**
 * 质检不合格的片段回到队列重渲：换掉 prompt 和时长（策略由 videoQa 决定），
 * 清掉上一轮的 providerTaskId 和 videoUrl，qaAttempt +1，provider 的 attempt 不动。
 */
export function requeueVideoJobForQaRetry(
  job: VideoRenderJob,
  qaDirective: string,
  durationSeconds: number,
  reason: string,
  qaStrategy?: VideoQaRetryStrategy
): Partial<VideoRenderJob> {
  return {
    status: 'ready',
    qaDirective,
    qaStrategy,
    durationSeconds,
    qaAttempt: (job.qaAttempt ?? 0) + 1,
    providerTaskId: '',
    videoUrl: '',
    progress: 0,
    qa: undefined,
    error: reason
  };
}

/**
 * 视频阶段自己的状态。批次状态只有三档（rendering / failed / clips_ready），
 * 不足以让用户区分「还在渲染」和「渲染完了正在看画面」——后者卡住时用户会以为系统死了。
 * 优先级：上游硬失败 > 质检未过 > 质检中 > 渲染中。
 */
export function videoStageStatus(jobs: VideoRenderJob[]): 'rendering' | 'qa_pending' | 'qa_failed' | 'failed' {
  if (jobs.some((job) => job.status === 'failed')) return 'failed';
  if (jobs.some((job) => job.status === 'qa_failed')) return 'qa_failed';
  if (jobs.some((job) => job.status === 'qa_pending')) return 'qa_pending';
  return 'rendering';
}

export function normalizeVideoProviderStatus(status: unknown, videoUrl?: string): 'completed' | 'failed' | 'submitted' {
  const normalized = typeof status === 'string' ? status.trim().toLowerCase() : '';
  if (SUCCESSFUL_PROVIDER_STATUSES.has(normalized)) return videoUrl ? 'completed' : 'failed';
  if (FAILED_PROVIDER_STATUSES.has(normalized)) return 'failed';
  return videoUrl ? 'completed' : 'submitted';
}

/**
 * provider 说「渲染成功」不等于这段片子能给用户看。上游只保证接口跑完了，
 * 六根手指、穿模、换脸在它眼里全是 completed。所以成功的片段一律先落到 qa_pending，
 * 由画面质检决定它能不能变成 completed。质检不可用时（没配视觉模型、抽帧失败）
 * 才退回直接 completed —— 这种降级必须是显式的，不能是默认路径。
 */
export function videoJobStatusFromProvider(
  normalizedStatus: 'completed' | 'failed' | 'submitted',
  qaEnabled: boolean
): 'qa_pending' | 'completed' | 'failed' | 'submitted' {
  if (normalizedStatus === 'completed') return qaEnabled ? 'qa_pending' : 'completed';
  return normalizedStatus;
}

export function finalizeVideoSubmission(
  normalizedStatus: 'completed' | 'failed' | 'submitted',
  providerTaskId: string
): { status: 'completed' | 'failed' | 'submitted'; missingProviderTaskId: boolean } {
  const missingProviderTaskId = normalizedStatus === 'submitted' && !providerTaskId;
  return {
    status: missingProviderTaskId ? 'failed' : normalizedStatus,
    missingProviderTaskId
  };
}

/**
 * expectedJobCount 是当前任务包里的镜头总数。
 * 编辑某个镜头会移除它的 job，此时 jobs 会少于镜头数——
 * 不带这个参数就会把「11 个完成 + 1 个待确认」误判成 clips_ready，
 * 对用户谎称全部片段已完成。
 */
export function videoBatchStatus(
  jobs: VideoRenderJob[],
  expectedJobCount: number = jobs.length
): 'rendering' | 'failed' | 'clips_ready' {
  const coversEveryShot = expectedJobCount > 0 && jobs.length >= expectedJobCount;
  // completed 现在的含义是「渲染成功且通过画面质检」。qa_pending 还没看过画面，
  // 归到 rendering 里继续等，不能算成片就绪。
  if (coversEveryShot && jobs.every((job) => job.status === 'completed')) return 'clips_ready';
  if (jobs.some((job) => job.status === 'failed' || job.status === 'qa_failed')) return 'failed';
  return 'rendering';
}
