import {
  PHYSICS_QA_CHECK_LABELS,
  clampShotDuration,
  normalizePhysicsMode,
  physicsFailingSeverities,
  physicsModeLabel,
  physicsQaChecks
} from './shotPhysics';
import type { PhysicsIssueSeverity, PhysicsMode, PhysicsQaCheck } from './shotPhysics';

/**
 * 视频质检闸门。
 *
 * 在这之前，「模型成功返回了一段六根手指的视频」在系统里的状态是 completed，
 * 会直接推给用户——provider 重试只处理上游报错，不看画面。
 * 这个模块补的就是这一段：completed 之前先过质检，不合格的走质量重试，
 * 而质量重试和 provider 重试必须分开计数，否则一次限流会吃掉画面重渲的预算。
 */

export type VideoQaIssue = {
  check: PhysicsQaCheck;
  severity: PhysicsIssueSeverity;
  detail: string;
};

export type VideoQaStatus = 'passed' | 'failed' | 'skipped';

export type VideoQaVerdict = {
  status: VideoQaStatus;
  mode: PhysicsMode;
  issues: VideoQaIssue[];
  checkedFrames: number;
  note?: string;
};

/**
 * 每个镜头最多重渲 2 次。同一条 prompt 硬刷是在赌随机种子，期望收益极低，
 * 所以每次重试都必须换策略（见 applyQaRetryStrategy），刷满就退回分镜让人改。
 */
export const VIDEO_QA_MAX_ATTEMPTS = 2;

const SEVERITIES: PhysicsIssueSeverity[] = ['critical', 'major', 'minor'];

function normalizeSeverity(value: unknown): PhysicsIssueSeverity {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return (SEVERITIES as string[]).includes(text) ? (text as PhysicsIssueSeverity) : 'minor';
}

function normalizeCheck(value: unknown): PhysicsQaCheck | null {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return text in PHYSICS_QA_CHECK_LABELS ? (text as PhysicsQaCheck) : null;
}

/**
 * 模型返回的 issue 里，不属于当前模式检查范围的直接丢掉。
 * 这是「夸张不被误杀」真正落地的地方：stylized 镜头就算被报了 gravity 问题，
 * 也不该影响判定——那正是导演要的效果。
 */
export function normalizeVideoQaIssues(raw: unknown, mode: PhysicsMode): VideoQaIssue[] {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set(physicsQaChecks(mode));
  return raw.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const check = normalizeCheck(record.check);
    if (!check || !allowed.has(check)) return [];
    const detail = typeof record.detail === 'string' ? record.detail.trim() : '';
    return [{ check, severity: normalizeSeverity(record.severity), detail: detail || PHYSICS_QA_CHECK_LABELS[check] }];
  });
}

/**
 * 不看严重度、报了就算不合格的检查项。
 *
 * 严重度分级对大多数问题是对的：一个 minor 的光影瑕疵不值得烧一次重渲。
 * 但身份不成立不分轻重——「脸稍微有点不像」和「换了一张脸」对观众是同一件事，
 * 而质检模型很容易把逐帧的脸部抖动判成 minor（每一帧单看都像这个人），
 * 于是这类片段一路通过质检直接交付，正是用户反馈里最刺眼的那一条。
 */
const ZERO_TOLERANCE_CHECKS = new Set<PhysicsQaCheck>(['identity']);

/** 判定和摘要必须用同一个谓词，否则会出现「判了不合格但摘要里一条问题都不列」。 */
function isBlockingIssue(issue: VideoQaIssue, mode: PhysicsMode): boolean {
  return ZERO_TOLERANCE_CHECKS.has(issue.check) || physicsFailingSeverities(mode).includes(issue.severity);
}

export function evaluateVideoQa(issues: VideoQaIssue[], mode: PhysicsMode, checkedFrames: number): VideoQaVerdict {
  // 一帧都没抽到就没有判据。这时候判 failed 会把正常片段全部打回重渲，
  // 判 passed 又等于悄悄关掉质检——只能显式标成 skipped，让人知道这一段没被看过。
  if (checkedFrames <= 0) {
    return { status: 'skipped', mode, issues: [], checkedFrames: 0, note: '没有可用于质检的抽帧，本镜头未经画面检查。' };
  }
  const blocking = issues.filter((issue) => isBlockingIssue(issue, mode));
  return {
    status: blocking.length ? 'failed' : 'passed',
    mode,
    issues,
    checkedFrames
  };
}

export type VideoQaRetryStrategy = 'reanchor' | 'shorten' | 'simplify';

export type VideoQaDecision = {
  retry: boolean;
  strategy: VideoQaRetryStrategy | null;
  reason: string;
};

export function classifyVideoQaVerdict(
  verdict: VideoQaVerdict,
  qaAttempt: number,
  maxAttempts: number = VIDEO_QA_MAX_ATTEMPTS
): VideoQaDecision {
  if (verdict.status !== 'failed') {
    return { retry: false, strategy: null, reason: '' };
  }
  if (qaAttempt >= maxAttempts) {
    return {
      retry: false,
      strategy: null,
      reason: `画面质检连续 ${maxAttempts} 次未通过：${videoQaIssueSummary(verdict)}。建议回到分镜阶段改写这个镜头（拆分动作、改成特写或缩短时长），继续重渲大概率还是同样的结果。`
    };
  }
  // 策略按「这一次是什么坏了」挑，而不是只按第几次重试。
  // 身份漂移用「缩短时长」是治不好的：时长不是它的成因，参考图才是。
  // 原来两次重试都不碰人脸参考，等于烧掉两次渲染去赌随机种子。
  const strategy: VideoQaRetryStrategy = hasIdentityIssue(verdict)
    ? (qaAttempt === 0 ? 'reanchor' : 'simplify')
    : (qaAttempt === 0 ? 'shorten' : 'simplify');
  return {
    retry: true,
    strategy,
    reason: `画面质检未通过：${videoQaIssueSummary(verdict)}。第 ${qaAttempt + 1} 次重渲改用${STRATEGY_LABEL[strategy]}策略。`
  };
}

/** 这一次不合格里有没有身份问题。有的话重渲要换策略——不是换随机种子。 */
export function hasIdentityIssue(verdict: VideoQaVerdict): boolean {
  return verdict.issues.some((issue) => issue.check === 'identity');
}

const STRATEGY_LABEL: Record<VideoQaRetryStrategy, string> = {
  reanchor: '重新锁脸 + 单人正面',
  shorten: '缩短时长 + 单动作',
  simplify: '特写降级 + 单主体'
};

const STRATEGY_DIRECTIVE: Record<VideoQaRetryStrategy, string> = {
  // 这一条要配合渲染侧把身份锚点图提到首帧，光靠文字压不住已经漂掉的脸。
  reanchor: '重渲要求：人物必须严格按参考图的五官、脸型、肤色和人种呈现，不要重新设计这张脸。'
    + '把人物放到画面中央，正面或四十五度面向镜头，画面里只保留这一个人清晰入画；'
    + '减小头部转动和表情幅度，去掉运镜变化——脸在画面里转得越多、动得越大，模型越容易换一张脸。',
  shorten: '重渲要求：只保留一个最关键的动作，动作幅度减小，去掉所有次要动作和运镜变化，人物保持在画面中央。',
  simplify: '重渲要求：改成上半身或局部特写，画面里只保留一个主体，背景大幅虚化；不要出现完整肢体的大幅运动，不要多人同框。'
};

/**
 * 重渲时追加到提示词末尾的一段指令。
 *
 * 刻意只返回「要追加的话」而不是整条改写后的提示词：真正提交时的提示词是由
 * 任务包重新拼装的（带参考图、台词、规格），把整条 prompt 存在 job 上会让这些拼装逻辑失效。
 */
export function videoQaRetryDirective(strategy: VideoQaRetryStrategy, issues: VideoQaIssue[] = []): string {
  const issueLine = issues.length
    ? `上一次渲染出现的问题必须避免：${issues.map((issue) => `${PHYSICS_QA_CHECK_LABELS[issue.check]}——${issue.detail}`).join('；')}。`
    : '';
  return `${issueLine}${STRATEGY_DIRECTIVE[strategy]}`;
}

/**
 * 时长每次砍到六成（不低于 2 秒）。绝大多数崩坏是随时间累积的，
 * 砍时长是单条最有效的补救——比换随机种子重刷有用得多。
 */
export function videoQaRetryDuration(durationSeconds: number, mode: PhysicsMode): number {
  return clampShotDuration(Math.max(2, Math.round(durationSeconds * 0.6)), mode);
}

/** 换策略而不是换随机种子。同 prompt 重试是在赌种子，期望收益极低。 */
export function applyQaRetryStrategy(
  prompt: string,
  durationSeconds: number,
  strategy: VideoQaRetryStrategy,
  mode: PhysicsMode,
  issues: VideoQaIssue[] = []
): { prompt: string; durationSeconds: number } {
  return {
    prompt: `${prompt.trim()}\n${videoQaRetryDirective(strategy, issues)}`,
    durationSeconds: videoQaRetryDuration(durationSeconds, mode)
  };
}

export function videoQaIssueSummary(verdict: VideoQaVerdict): string {
  if (!verdict.issues.length) return '无具体问题记录';
  const blocking = verdict.issues.filter((issue) => isBlockingIssue(issue, verdict.mode));
  return (blocking.length ? blocking : verdict.issues)
    .map((issue) => `${PHYSICS_QA_CHECK_LABELS[issue.check].split('（')[0]}（${issue.detail}）`)
    .join('；');
}

export type VideoQaRequest = {
  frames: string[];
  physicsMode?: string;
  shotTitle?: string;
  narration?: string;
};

/**
 * 问具体问题，不要问「这个视频好吗」。开放式提问下视觉模型几乎总是回答「不错」，
 * 逐项打勾才问得出六根手指。
 */
export function videoQaInstruction(mode: PhysicsMode, context: { shotTitle?: string; narration?: string } = {}): string {
  const checks = physicsQaChecks(mode);
  const checkLines = checks.map((check, index) => `${index + 1}. ${check}：${PHYSICS_QA_CHECK_LABELS[check]}`).join('\n');
  const relaxed = (['gravity', 'lighting', 'clipping'] as PhysicsQaCheck[]).filter((check) => !checks.includes(check));
  const relaxedLine = relaxed.length
    ? `\n本镜头的创作意图是「${physicsModeLabel(mode)}」，因此不要报告以下方面的问题，它们是有意为之的艺术处理：${relaxed.map((check) => PHYSICS_QA_CHECK_LABELS[check]).join('、')}。夸张的力量、位移、滞空和光效都属于正常，不是缺陷。`
    : '';

  return `你在给一段 AI 生成的短剧镜头做画面质检。下面是这个镜头按时间顺序抽出的若干帧。${context.shotTitle ? `镜头内容：${context.shotTitle}。` : ''}${context.narration ? `台词：${context.narration}。` : ''}

逐项检查以下方面，只报告你在画面里确实看到的问题，不要推测、不要因为画质一般就报问题：
${checkLines}${relaxedLine}

身份这一项要按【相邻帧两两对比】来看，不要每帧单独看。
逐帧单看时，每一帧都像是一个正常的人，问题只有在把相邻两帧放在一起时才暴露：
脸型宽了一点、眼距变了、鼻梁高了、下颌线换了形状、中式面孔往欧美或混血长相偏了一点。
观众看到的是连续画面，这种逐帧的微小变化在成片里就是「这张脸一直在抖、一直在变」。
所以：只要相邻两帧的同一个人对不上，就报 identity，哪怕每一帧单看都很正常。

severity 判定标准：
- critical：观众一眼就会看出来的硬伤，例如手指数量明显不对、多出一条手臂、人物穿过实体、换了一张脸。
- major：认真看就能发现的问题，例如关节角度不自然、前后帧服装细节不一致。
- minor：需要逐帧比对才能发现的轻微瑕疵。
  注意：identity 不适用「轻微就不用报」这条——脸只要在帧之间变了就要报出来，
  严重度按你的判断填，但不要因为觉得「差别不大」就不报。

只输出一个 JSON 对象，不要任何解释文字、不要代码块围栏：
{"issues":[{"check":"anatomy|identity|clipping|gravity|lighting|morphing","severity":"critical|major|minor","detail":"用一句中文说明在第几帧看到了什么"}]}
画面没有问题时输出 {"issues":[]}。`;
}

/** 模型经常会在 JSON 外面包一层代码块或客套话，这里做一次宽松抽取。 */
export function parseVideoQaResponse(text: unknown, mode: unknown): VideoQaIssue[] {
  const normalizedMode = normalizePhysicsMode(mode);
  const raw = typeof text === 'string' ? text : '';
  const fenced = raw.replace(/```json/gi, '```').split('```');
  const candidates = [raw, ...fenced];
  for (const candidate of candidates) {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start < 0 || end <= start) continue;
    try {
      const parsed = JSON.parse(candidate.slice(start, end + 1)) as { issues?: unknown };
      if (parsed && typeof parsed === 'object') return normalizeVideoQaIssues(parsed.issues, normalizedMode);
    } catch (_) {
      continue;
    }
  }
  return [];
}
