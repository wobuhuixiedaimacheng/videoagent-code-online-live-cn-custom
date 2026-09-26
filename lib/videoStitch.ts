/**
 * 把已完成的镜头片段合成为单一成片文件。
 *
 * 这里只放纯逻辑（清单、参数、错误翻译、进度换算），fs / child_process 全部留在
 * app/api/video/stitch/route.ts。分开的理由和 videoRenderBatch 一样：合成的判断规则
 * 需要能被单测直接盯住，而不是靠跑一次真实 ffmpeg 才知道对不对。
 */

export type FinalCutStatus = 'stitching' | 'completed' | 'failed';

/** ffmpeg 干活的两条路：直接拼流（快）和重编码（慢但能吃下参数不一致的片段）。 */
export type FinalCutEncodeMode = 'copy' | 'reencode';

export type FinalCutPhase = 'downloading' | 'stitching' | 'done';

export type StitchClip = {
  promptId: string;
  /** 镜头在成片里的序号，从 1 开始。顺序错了成片就是废的，所以它是必填项。 */
  shotNumber: number;
  url: string;
  durationSeconds?: number;
};

export type FinalCutState = {
  jobId: string;
  status: FinalCutStatus;
  phase?: FinalCutPhase;
  /** 0-100。下载占前 40%，合成占后 60%——下载 36 段的耗时并不比合成短。 */
  progress?: number;
  clipCount?: number;
  downloadedCount?: number;
  encodeMode?: FinalCutEncodeMode;
  fileName?: string;
  fileUrl?: string;
  sizeBytes?: number;
  durationSeconds?: number;
  error?: string;
  /** 拼流失败回退到重编码时留一句，让用户知道成片是被重新压过的。 */
  note?: string;
  startedAt?: string;
  completedAt?: string;
};

const DOWNLOAD_PROGRESS_SHARE = 0.4;

export function ffmpegMissingMessage(): string {
  return [
    '没有找到 ffmpeg，无法合成成片。片段本身都还在，装好后回来直接点合成即可。',
    'macOS：brew install ffmpeg',
    '或者在 .env.local 里用 FFMPEG_PATH 指向已有的 ffmpeg 可执行文件。'
  ].join('\n');
}

/**
 * 合成前的完整性闸门。
 *
 * 缺一个镜头就合成，产出的是一条“看起来正常、其实少了一段”的片子——用户很可能直接拿去用。
 * 宁可挡住，也不要交付这种成片。
 */
export function validateStitchClips(
  clips: StitchClip[],
  expectedShotCount: number
): { ok: boolean; error: string } {
  if (!clips.length) {
    return { ok: false, error: '没有可合成的片段。' };
  }
  const invalid = clips.filter((clip) => !isPlayableUrl(clip.url));
  if (invalid.length) {
    return {
      ok: false,
      error: `以下镜头的片段地址无效，不能合成：${invalid.map((clip) => clip.promptId || `#${clip.shotNumber}`).join('、')}。`
    };
  }
  if (expectedShotCount > 0 && clips.length < expectedShotCount) {
    const missing = expectedShotCount - clips.length;
    return {
      ok: false,
      error: `还有 ${missing} 个镜头没有完成的片段，合成会漏掉它们。请先把这些镜头跑完或重试。`
    };
  }
  const shotNumbers = clips.map((clip) => clip.shotNumber);
  const duplicated = shotNumbers.filter((value, index) => shotNumbers.indexOf(value) !== index);
  if (duplicated.length) {
    return { ok: false, error: `镜头序号重复：${Array.from(new Set(duplicated)).join('、')}。顺序无法确定，不能合成。` };
  }
  return { ok: true, error: '' };
}

function isPlayableUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  return trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:video/');
}

/** 按镜头序号排序。调用方给的顺序不可信——重试过的镜头会被追加到数组末尾。 */
export function orderedStitchClips(clips: StitchClip[]): StitchClip[] {
  return [...clips].sort((a, b) => a.shotNumber - b.shotNumber);
}

/**
 * concat 清单里的一条。给了 outpoint 就只取这个片段的前 outpoint 秒——
 * 自动剪辑判定「结尾挂着没有信息的余量」时用它把尾巴切掉。
 */
export type ConcatEntry = {
  filePath: string;
  /** 从片段开头算起保留多少秒。不填表示整段都要。 */
  outpointSeconds?: number;
};

/**
 * concat demuxer 的清单。ffmpeg 只认单引号包裹，而路径里真出现单引号时
 * 必须写成 '\'' —— 少了这步，一个带撇号的项目名就能让整批合成失败。
 *
 * 仍然接受纯字符串数组：老调用点和老测试不用改。
 */
export function buildConcatManifest(entries: Array<string | ConcatEntry>): string {
  return entries
    .map((entry) => {
      const item: ConcatEntry = typeof entry === 'string' ? { filePath: entry } : entry;
      const line = `file '${item.filePath.replaceAll("'", "'\\''")}'`;
      const outpoint = Number(item.outpointSeconds);
      if (!Number.isFinite(outpoint) || outpoint <= 0) return line;
      // inpoint 必须显式写 0：只给 outpoint 时，部分 ffmpeg 版本会把它当成绝对时间戳，
      // 而片段的起始时间戳并不保证是 0（它们来自不同次生成）。
      return `${line}\ninpoint 0\noutpoint ${Math.round(outpoint * 1000) / 1000}`;
    })
    .join('\n') + '\n';
}

/**
 * 有裁剪就必须重编码。
 *
 * concat demuxer 的 outpoint 在 -c copy 下只能切在关键帧上，而生成出来的片段
 * 关键帧间隔往往就是整段——「切掉结尾 1.5 秒」在拼流模式下的实际效果经常是什么都没切。
 * 一个看起来生效、实际没生效的剪辑功能，比没有这个功能更糟。
 */
export function stitchRequiresReencode(input: {
  entries?: Array<string | ConcatEntry>;
  subtitlePath?: string;
  normalizeLoudness?: boolean;
}): boolean {
  if (input.subtitlePath) return true;
  if (input.normalizeLoudness) return true;
  return (input.entries || []).some(
    (entry) => typeof entry !== 'string' && Number(entry.outpointSeconds) > 0
  );
}

export function buildStitchArgs(input: {
  manifestPath: string;
  outputPath: string;
  mode: FinalCutEncodeMode;
  frameRate?: number;
  /** 字幕文件路径。给了就烧进画面——视频模型渲不出汉字，字幕只能在这一步加回来。 */
  subtitleFilterValue?: string;
  /** 响度统一滤镜。片段来自不同次生成，音量各不相同，只有成片里才听得出来。 */
  audioFilterValue?: string;
}): string[] {
  const base = [
    '-hide_banner',
    '-nostdin',
    '-y',
    // 片段来自不同次生成，时间戳不连续是常态。不重建 PTS 的话，成片进度条会跳。
    '-fflags',
    '+genpts',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    input.manifestPath
  ];
  // 滤镜和 -c copy 互斥：拼流模式下根本没有解码后的帧可供叠字幕或调响度。
  // 调用方应当先用 stitchRequiresReencode 决定 mode，这里只是最后一道保险。
  const filtered = Boolean(input.subtitleFilterValue || input.audioFilterValue);
  if (input.mode === 'copy' && !filtered) {
    return [...base, '-c', 'copy', '-movflags', '+faststart', input.outputPath];
  }
  const frameRate = Number.isFinite(input.frameRate) && Number(input.frameRate) > 0 ? Number(input.frameRate) : 24;
  return [
    ...base,
    ...(input.subtitleFilterValue ? ['-vf', input.subtitleFilterValue] : []),
    ...(input.audioFilterValue ? ['-af', input.audioFilterValue] : []),
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '20',
    '-pix_fmt',
    'yuv420p',
    '-r',
    String(frameRate),
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-movflags',
    '+faststart',
    input.outputPath
  ];
}

/** ffprobe 参数：拿成片真实时长，用来在界面上显示，而不是把各段标称时长加起来糊弄。 */
export function buildProbeArgs(filePath: string): string[] {
  return [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    filePath
  ];
}

const FFMPEG_TIME_PATTERN = /time=(\d+):(\d{2}):(\d{2})(?:\.(\d+))?/;

/** 从 ffmpeg 的 stderr 进度行里取已处理秒数。拿不到就返回 null，让调用方保持上一次的进度。 */
export function parseFfmpegProgressSeconds(line: string): number | null {
  const match = FFMPEG_TIME_PATTERN.exec(line);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const fraction = match[4] ? Number(`0.${match[4]}`) : 0;
  if (![hours, minutes, seconds].every(Number.isFinite)) return null;
  return hours * 3600 + minutes * 60 + seconds + fraction;
}

export function finalCutProgress(input: {
  phase: FinalCutPhase;
  downloadedCount?: number;
  clipCount?: number;
  encodedSeconds?: number;
  totalSeconds?: number;
}): number {
  if (input.phase === 'done') return 100;
  const clipCount = input.clipCount || 0;
  if (input.phase === 'downloading') {
    if (!clipCount) return 0;
    const ratio = Math.min(1, Math.max(0, (input.downloadedCount || 0) / clipCount));
    return Math.round(ratio * DOWNLOAD_PROGRESS_SHARE * 100);
  }
  const totalSeconds = input.totalSeconds || 0;
  if (totalSeconds <= 0) return Math.round(DOWNLOAD_PROGRESS_SHARE * 100);
  const ratio = Math.min(1, Math.max(0, (input.encodedSeconds || 0) / totalSeconds));
  return Math.round((DOWNLOAD_PROGRESS_SHARE + ratio * (1 - DOWNLOAD_PROGRESS_SHARE)) * 100);
}

/**
 * ffmpeg 的 stderr 又长又吵，原样丢给用户等于没说。这里把几种真实会遇到的失败
 * 翻成能照着做的一句话，翻不出来的才回落到原文尾部——回落必须保留原文，
 * 否则遇到没预料过的失败就彻底断线索了。
 */
export function describeFfmpegFailure(stderr: string, exitCode: number | null): string {
  const text = (stderr || '').trim();
  const lower = text.toLowerCase();
  if (lower.includes('unsafe file name') || lower.includes('-safe 0')) {
    return '合成失败：ffmpeg 拒绝了片段路径。这是参数问题，不是片段问题，请反馈这条错误。';
  }
  if (lower.includes('does not contain any stream')) {
    return '合成失败：有片段里没有视频流，多半是下载到的文件损坏。重试失败镜头后再合成。';
  }
  if (lower.includes('invalid data found when processing input')) {
    return '合成失败：有片段的文件内容不是有效视频，多半是下载中断或上游返回了错误页。重试合成即可重新下载。';
  }
  if (lower.includes('no such file or directory')) {
    return '合成失败：中间文件在合成前就不见了。请重试一次。';
  }
  if (lower.includes('height not divisible by 2') || lower.includes('width not divisible by 2')) {
    return '合成失败：片段分辨率是奇数，H.264 不接受。请用重编码模式重试。';
  }
  const tail = text.split('\n').filter(Boolean).slice(-4).join('\n');
  return `合成失败（ffmpeg 退出码 ${exitCode ?? '未知'}）：${tail || '没有输出错误信息。'}`;
}

export function normalizeFinalCutState(raw: unknown): FinalCutState | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const jobId = typeof value.jobId === 'string' ? value.jobId.trim() : '';
  const status = value.status;
  if (!jobId) return null;
  if (status !== 'stitching' && status !== 'completed' && status !== 'failed') return null;
  const state: FinalCutState = { jobId, status };
  if (value.phase === 'downloading' || value.phase === 'stitching' || value.phase === 'done') state.phase = value.phase;
  if (typeof value.progress === 'number' && Number.isFinite(value.progress)) {
    state.progress = Math.min(100, Math.max(0, Math.round(value.progress)));
  }
  for (const key of ['clipCount', 'downloadedCount', 'sizeBytes', 'durationSeconds'] as const) {
    const number = value[key];
    if (typeof number === 'number' && Number.isFinite(number)) state[key] = number;
  }
  if (value.encodeMode === 'copy' || value.encodeMode === 'reencode') state.encodeMode = value.encodeMode;
  for (const key of ['fileName', 'fileUrl', 'error', 'note', 'startedAt', 'completedAt'] as const) {
    const text = value[key];
    if (typeof text === 'string' && text.trim()) state[key] = text;
  }
  return state;
}

/** 成片是否还在跑。跑着的时候不能改镜头，也不能重复点合成。 */
export function isFinalCutInFlight(state: FinalCutState | null | undefined): boolean {
  return state?.status === 'stitching';
}

export function finalCutStatusLabel(state: FinalCutState | null | undefined): string {
  if (!state) return '尚未合成';
  if (state.status === 'completed') return '成片已生成';
  if (state.status === 'failed') return '合成失败';
  if (state.phase === 'downloading') {
    return `正在取回片段 ${state.downloadedCount || 0}/${state.clipCount || 0}`;
  }
  return '正在合成成片';
}
