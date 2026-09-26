import { parseDialogueLines } from './voiceMode';

/**
 * 字幕轨与响度统一。
 *
 * 两件事放在一个文件里，因为它们是同一次 ffmpeg 调用的两个参数，而且都只在合成那一步生效。
 *
 * 字幕：视频模型渲不出可读汉字，所以整条流水线从脚本阶段起就在反复要求「画面里不要出现文字」。
 * 那句要求的另一半一直没做——字幕得由后期加回来。没有这一步，成片是一条没有字幕的短剧，
 * 而中文短视频没有字幕基本等于不能发。
 *
 * 响度：每个镜头是独立一次生成，音量各不相同。拼起来之后观众要一路调音量，
 * 这个问题在片段单独试看时完全暴露不出来——它只在成片里出现，所以必须在合成这一步解决。
 *
 * 这个文件只拼字符串，不碰 fs 也不起进程，方便直接测。
 */

export type SubtitleCue = {
  index: number;
  startSeconds: number;
  endSeconds: number;
  text: string;
};

export type SubtitleSourceShot = {
  /** 这一镜说出口的台词，格式「角色名：台词」。空表示这一镜没有字幕。 */
  dialogue?: unknown;
  durationSeconds?: unknown;
};

/**
 * 每行最多几个汉字。
 *
 * 竖屏短剧的安全区大约就是这个宽度：再长会顶到画面两边，在手机上要么被裁，
 * 要么小到看不清。两行是上限——三行会盖住人物的脸，而人物的脸是这类片子的全部内容。
 */
export const SUBTITLE_LINE_CHARS = 18;
export const SUBTITLE_MAX_LINES = 2;

function positive(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

/**
 * 字幕正文：只要说出口的字，不要说话人前缀。
 *
 * 「林岩：走吧」直接烧进画面会变成一条像剧本一样的字幕。说话人靠画面交代，
 * 这是中文短剧字幕的通行做法，不是省略。
 */
export function subtitleTextFor(dialogue: unknown): string {
  return parseDialogueLines(dialogue)
    .map((line) => line.line.trim())
    .filter(Boolean)
    .join(' ');
}

/** 按字数折行。中文没有词边界，只能按字数切——这也是中文字幕通行的做法。 */
export function wrapSubtitleText(value: string, lineChars = SUBTITLE_LINE_CHARS): string {
  const text = value.trim();
  if (!text) return '';
  const lines: string[] = [];
  for (let index = 0; index < text.length; index += lineChars) {
    lines.push(text.slice(index, index + lineChars));
  }
  // 超过两行时把尾巴并进第二行，宁可第二行挤一点，也不要三行盖住人物的脸。
  if (lines.length > SUBTITLE_MAX_LINES) {
    const head = lines.slice(0, SUBTITLE_MAX_LINES - 1);
    return [...head, lines.slice(SUBTITLE_MAX_LINES - 1).join('')].join('\n');
  }
  return lines.join('\n');
}

function formatTimestamp(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const secs = Math.floor(clamped % 60);
  const millis = Math.round((clamped - Math.floor(clamped)) * 1000);
  const pad = (value: number, width = 2) => String(value).padStart(width, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)},${pad(millis, 3)}`;
}

/**
 * 按【最终】片段顺序和时长排字幕时间轴。
 *
 * 必须用剪辑之后的时长，不能用 storyboard 里那份：自动剪辑删掉一个镜头之后，
 * 后面每一句字幕都会往前挪，用原始时长排出来的字幕整条都是错位的——
 * 而错位的字幕比没有字幕更糟，观众会以为配音出了问题。
 */
export function buildSubtitleCues(shots: SubtitleSourceShot[]): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  let cursor = 0;

  for (const shot of shots) {
    const duration = positive(shot.durationSeconds, 3);
    const text = wrapSubtitleText(subtitleTextFor(shot.dialogue));
    if (text) {
      cues.push({
        index: cues.length + 1,
        startSeconds: Math.round(cursor * 100) / 100,
        endSeconds: Math.round((cursor + duration) * 100) / 100,
        text
      });
    }
    cursor += duration;
  }

  return cues;
}

export function buildSrt(cues: SubtitleCue[]): string {
  if (!cues.length) return '';
  return cues
    .map((cue) => `${cue.index}\n${formatTimestamp(cue.startSeconds)} --> ${formatTimestamp(cue.endSeconds)}\n${cue.text}\n`)
    .join('\n');
}

// ── 烧录参数 ─────────────────────────────────────────────────────────

/**
 * 字幕字体。
 *
 * 必须显式指定：libass 找不到能显示汉字的字体时不会报错，它会把每个汉字画成一个方框，
 * 而那份成片看起来「有字幕」，直到有人真的去看才发现全是豆腐块。
 * 默认值按平台给，装了别的字体可以用 FFMPEG_SUBTITLE_FONT 覆盖。
 */
export function defaultSubtitleFont(platform: string): string {
  return platform === 'darwin' ? 'PingFang SC' : 'Noto Sans CJK SC';
}

export type SubtitleStyleOptions = {
  fontName: string;
  /** 相对画面高度的字号。竖屏短剧的常规值，太小在手机上看不清。 */
  fontSize?: number;
  marginVertical?: number;
};

/**
 * force_style 串。
 *
 * 描边和半透明底衬都是必须的：短剧画面亮度变化很大，纯白字幕在浅色背景上直接消失。
 * BorderStyle=1 是描边+阴影，Outline=3 在竖屏上是肉眼刚好能分辨的粗度。
 */
export function subtitleForceStyle(options: SubtitleStyleOptions): string {
  return [
    `FontName=${options.fontName}`,
    `FontSize=${options.fontSize ?? 20}`,
    'PrimaryColour=&H00FFFFFF',
    'OutlineColour=&H00000000',
    'BorderStyle=1',
    'Outline=3',
    'Shadow=0',
    'Alignment=2',
    `MarginV=${options.marginVertical ?? 48}`
  ].join(',');
}

/**
 * subtitles 滤镜的值。
 *
 * 路径里的单引号、冒号和反斜杠都要转义：ffmpeg 的滤镜串用冒号分隔参数，
 * 一个带冒号的项目名就能让整条滤镜解析失败，而报错信息完全指不到路径上。
 */
export function subtitleFilter(subtitlePath: string, style: SubtitleStyleOptions): string {
  const escaped = subtitlePath
    .replaceAll('\\', '\\\\')
    .replaceAll(':', '\\:')
    .replaceAll("'", "\\'");
  return `subtitles='${escaped}':force_style='${subtitleForceStyle(style)}'`;
}

/**
 * 响度统一滤镜。
 *
 * -16 LUFS 是中文短视频平台的通行投放响度；TP=-1.5 留出真峰值余量，
 * 不留的话转码到平台自己的格式时会削顶。
 *
 * 用的是单遍 loudnorm，不是精确的双遍：双遍要先跑一次完整分析，
 * 对一条三分钟的片子意味着合成时间翻倍，而单遍的偏差在人耳上听不出来。
 */
export const LOUDNESS_TARGET_LUFS = -16;

export function loudnormFilter(): string {
  return `loudnorm=I=${LOUDNESS_TARGET_LUFS}:TP=-1.5:LRA=11`;
}

/**
 * 字幕烧不进去时的降级说明。
 *
 * libass 没编进 ffmpeg、或者系统里没有中文字体时，烧录会失败。
 * 这时候要产出的仍然是一条能看的成片，只是没有字幕——但必须说出来，
 * 否则用户拿到一条没字幕的片子，会以为字幕功能压根没做。
 */
export function subtitleBurnFailedNote(fontName: string): string {
  return `字幕没能烧进画面，本次成片不含字幕（片子本身是完整的，音画都在）。`
    + `常见原因是这台机器的 ffmpeg 没有编入 libass，或者系统里没有「${fontName}」这个字体。`
    + `换一个装了 libass 的 ffmpeg，或用 FFMPEG_SUBTITLE_FONT 指定一个已装的中文字体，重新合成即可带上字幕。`;
}
