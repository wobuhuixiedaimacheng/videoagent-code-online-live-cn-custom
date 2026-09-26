/**
 * scenes.json 的逐场次修补，以及从脚本里读回真实场次。
 *
 * 真实事故：脚本写了 12 个小节，每小节都标了地点——大学图书馆、校园操场、咖啡馆、
 * 公司茶水间、公寓客厅、公园长椅、餐厅、书店、街头、公寓阳台、朋友聚会、海边。
 * 模型也照着写了 12 个场次，但其中一个漏了 palette 之类的字段，
 * 于是 hasSceneDraft 判定整份文件不合格，直接换成内置通用模板——
 * 模板是「3 秒 Hook / 犹豫时刻 / 可信证明 / 动作承接 / 轻 CTA」这套营销节奏，
 * 而且 5 条共用同一个 location，于是 12 个不同地点的恋爱史，
 * 变成了 5 张全在同一间客厅里的卡片，和剧本毫无关系。
 *
 * 这和 characterRepair 里记的是同一个病根，同一个剧本：全有全无。
 * 一个场次缺一个字段，不该让另外十一个写对的场次陪葬。
 *
 * 补的边界和角色那边一致：
 *  - 可以补【策略类】字段：光线、色彩、字幕意图、图像提示词、时长。
 *    这些能从已有内容推出来，或者本来就是流程要求的固定话术。
 *  - 不许编【事实类】内容：这一场发生在哪、发生了什么。
 *    地点和画面补不出来的场次宁可丢掉并报出来，也不能安一个通用客厅上去——
 *    那正是模板兜底干过的事。
 */

type JsonRecord = Record<string, unknown>;

/** 和 agentProvider 的 hasSceneDraft 一一对应的场次级必填字段。 */
const REQUIRED_SCENE_FIELDS = [
  'id', 'title', 'visual', 'location', 'timeOfDay', 'lighting', 'palette',
  'scriptSegment', 'mainImagePrompt', 'prompt'
] as const;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function list(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}

function positive(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(text(value));
  return Number.isFinite(number) && number > 0 ? number : 0;
}

// ── 从脚本读回场次 ───────────────────────────────────────────────────

export type ScriptSection = {
  index: number;
  title: string;
  location: string;
  castNames: string[];
  body: string;
};

/** 「（女，20 岁）」「（男，21岁）」这类括号注释不是名字的一部分。 */
function cleanCastName(value: string): string {
  return value
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/^[-*\s•]+/, '')
    .trim();
}

/**
 * 把脚本按小节拆开，读出每一节的标题、地点和出场人物。
 *
 * 这不是「推断」，是读原文：脚本里写着 `**场景**：大学图书馆`，
 * 那这一场就在大学图书馆。模板兜底之所以荒唐，正是因为它从来没读过这一行。
 */
export function scriptSections(scriptMarkdown: string): ScriptSection[] {
  const source = typeof scriptMarkdown === 'string' ? scriptMarkdown : '';
  if (!source.trim()) return [];

  // 只认「小节/场/幕/段」这类叙事分节标题，避开「## 项目信息」「## 人物设定」这种元信息小节。
  const headingPattern = /^#{2,4}\s*(?:小节|场次|场|幕|段落|段)\s*([0-9一二三四五六七八九十]+)?\s*[：:.、]?\s*(.*)$/;
  const lines = source.split(/\r?\n/);
  const sections: ScriptSection[] = [];
  let current: { title: string; lines: string[] } | null = null;

  const flush = () => {
    if (!current) return;
    const block = current.lines.join('\n');
    const location = block.match(/\*{0,2}场景\*{0,2}\s*[：:]\s*(.+)/)?.[1]?.trim() || '';
    const castLine = block.match(/\*{0,2}人物\*{0,2}\s*[：:]\s*(.+)/)?.[1]?.trim() || '';
    // 先去掉括号注释再按逗号切：「陈女士（女，20 岁），林浩（男，21 岁）」里的逗号
    // 有一半在括号内部，顺序反过来会把一个人切成两半。
    const castNames = castLine
      .replace(/[（(][^）)]*[）)]/g, '')
      .split(/[，,、；;/]/)
      .map(cleanCastName)
      .filter(Boolean);
    const body = block
      .split(/\r?\n/)
      .filter((line) => !/\*{0,2}(?:场景|人物)\*{0,2}\s*[：:]/.test(line))
      .join('\n')
      .trim();
    sections.push({ index: sections.length + 1, title: current.title, location, castNames, body });
    current = null;
  };

  for (const line of lines) {
    const heading = line.match(headingPattern);
    if (heading) {
      flush();
      const title = (heading[2] || '').replace(/[（(][^）)]*[）)]\s*$/, '').trim();
      current = { title: title || `第 ${sections.length + 1} 场`, lines: [] };
      continue;
    }
    if (current) current.lines.push(line);
  }
  flush();

  // 一个地点都没标出来的，说明这份脚本不是分场写的，交给调用方回落。
  return sections.some((section) => section.location) ? sections : [];
}

const TIME_WORDS = ['清晨', '早晨', '上午', '中午', '下午', '傍晚', '黄昏', '夜里', '深夜', '晚上', '午夜', '白天'];

/**
 * 从文本里读时间段。
 *
 * 先找明确的时间词，再退到「夜/晚」这类单字信号——「（望夜空）」里没有任何一个
 * 完整时间词，但它显然不是白天，判成白天会让这一场的光线和色彩整个反过来。
 * 两轮都读不出来才返回空，由调用方决定兜底。
 */
export function timeOfDayFromText(...sources: string[]): string {
  for (const source of sources) {
    const hit = TIME_WORDS.find((word) => source.includes(word));
    if (hit) return hit;
  }
  for (const source of sources) {
    if (/夜|晚|星|月光/.test(source)) return '夜里';
  }
  return '';
}

const NIGHT_WORDS = ['夜里', '深夜', '晚上', '午夜'];

/** 光线和色彩由时间段和内外景推出来，属于策略类，可以补。 */
export function lightingFor(timeOfDay: string, location: string): string {
  const outdoor = /街|路|广场|公园|海|操场|户外|天台|阳台|门口|山/.test(location);
  if (NIGHT_WORDS.some((word) => timeOfDay.includes(word))) {
    return outdoor ? '夜间环境光与路灯混合，人物面部保留可辨识的补光' : '室内灯光为主光，窗外压暗，保留真实明暗层次';
  }
  if (timeOfDay.includes('傍晚') || timeOfDay.includes('黄昏')) {
    return outdoor ? '低角度暖色夕照，长投影' : '窗外暖色斜射光，室内保留柔和阴影';
  }
  return outdoor ? '自然日光，柔和不过曝' : '窗边自然光为主，室内保留真实环境层次';
}

export function paletteFor(timeOfDay: string): string {
  if (NIGHT_WORDS.some((word) => timeOfDay.includes(word))) return '低饱和冷色调，暖色点光源作为对比';
  if (timeOfDay.includes('傍晚') || timeOfDay.includes('黄昏')) return '暖橙与低饱和中性色';
  return '自然暖色与低饱和中性色';
}

// ── 契约检查 ─────────────────────────────────────────────────────────

export type SceneContractIssue = { scene: string; field: string };

/**
 * 逐条列出哪一场缺哪个字段。用于告诉用户「模型到底漏了什么」，
 * 而不是只丢一句「结构校验未通过」让人去猜。
 */
export function sceneContractIssues(value: unknown): SceneContractIssue[] {
  const root = isRecord(value) ? value : {};
  const scenes = Array.isArray(root.scenes) ? root.scenes : [];
  const issues: SceneContractIssue[] = [];

  scenes.forEach((entry, index) => {
    if (!isRecord(entry)) {
      issues.push({ scene: `第 ${index + 1} 场`, field: '整个对象不是合法结构' });
      return;
    }
    const label = text(entry.title) || `第 ${index + 1} 场`;
    for (const field of REQUIRED_SCENE_FIELDS) {
      if (!text(entry[field])) issues.push({ scene: label, field });
    }
    if (!list(entry.characterIds).length) issues.push({ scene: label, field: 'characterIds' });
    if (!text(entry.subtitle)) issues.push({ scene: label, field: 'subtitle' });
    if (!positive(entry.durationSeconds)) issues.push({ scene: label, field: 'durationSeconds' });
  });

  if (!scenes.length) issues.push({ scene: '整份文件', field: 'scenes 数组为空' });
  return issues;
}

export function describeSceneIssues(issues: SceneContractIssue[], limit = 6): string {
  if (!issues.length) return '';
  const shown = issues.slice(0, limit).map((issue) => `${issue.scene} 缺 ${issue.field}`);
  const rest = issues.length - shown.length;
  return shown.join('；') + (rest > 0 ? `；另有 ${rest} 处` : '');
}

// ── 逐场次修补 ───────────────────────────────────────────────────────

export type SceneRepairContext = {
  /** characters.json 里已确认的角色，用来把出场人物从正文里认回来。 */
  characters: Array<{ id: string; name: string; required?: boolean }>;
  /** script.md 原文，用来补 scriptSegment 和地点。 */
  script: string;
  /** 每个场次的目标时长（秒），用于补 durationSeconds。 */
  segmentSeconds: number;
};

export type SceneRepairResult = {
  content: string;
  /** 补齐了哪些字段，给用户核对用。 */
  filled: SceneContractIssue[];
  /** 地点和画面都认不出来、无法认定是哪一场的场次会被丢掉，必须说出来。 */
  dropped: number;
};

/** 把出场角色从本场文本里认回来。认不出来才退到必需角色，并记一笔。 */
function castForScene(haystack: string, context: SceneRepairContext): { ids: string[]; guessed: boolean } {
  const matched = context.characters.filter((character) => character.name && haystack.includes(character.name));
  if (matched.length) return { ids: matched.map((character) => character.id), guessed: false };
  const fallback = context.characters.find((character) => character.required) || context.characters[0];
  return { ids: fallback ? [fallback.id] : [], guessed: true };
}

/**
 * 把模型产出里能用的部分留下，只补缺的字段。
 *
 * 返回 null 表示这份产出救不回来（解析不了、没有 scenes 数组、或者一个能认定地点/画面的
 * 场次都没有）——那种情况才轮到模板兜底。
 */
export function repairScenesContent(rawContent: string, context: SceneRepairContext): SceneRepairResult | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.scenes)) return null;

  const sections = scriptSections(context.script);
  const filled: SceneContractIssue[] = [];
  const note = (scene: string, field: string) => filled.push({ scene, field });

  const source = parsed.scenes.filter(isRecord);
  // 地点和画面是「这一场是什么」的事实。两个都没有、脚本里也对不上，就没法认定，丢掉。
  const usable = source.filter((entry, index) => {
    if (text(entry.location) || text(entry.visual) || text(entry.scriptSegment)) return true;
    return Boolean(sections[index]?.location);
  });
  const dropped = source.length - usable.length;
  if (!usable.length) return null;

  const usedIds = new Set<string>();
  const scenes = usable.map((entry, index) => {
    const section = sections[index];
    const label = text(entry.title) || section?.title || `第 ${index + 1} 场`;

    let id = text(entry.id);
    if (!id || usedIds.has(id)) {
      id = `scene_${String(index + 1).padStart(2, '0')}`;
      note(label, 'id');
    }
    usedIds.add(id);

    const title = text(entry.title) || section?.title || `第 ${index + 1} 场`;
    if (!text(entry.title)) note(label, 'title');

    // 地点优先用模型写的，其次读脚本原文里的「场景：」——都不算编造。
    const location = text(entry.location) || section?.location || '';
    if (!text(entry.location)) note(label, 'location');

    const scriptSegment = text(entry.scriptSegment) || section?.body || '';
    if (!text(entry.scriptSegment)) note(label, 'scriptSegment');

    const visual = text(entry.visual) || scriptSegment.split(/\r?\n/).find(Boolean) || `${location}的一段剧情`;
    if (!text(entry.visual)) note(label, 'visual');

    const timeOfDay = text(entry.timeOfDay) || timeOfDayFromText(visual, scriptSegment, title) || '白天';
    if (!text(entry.timeOfDay)) note(label, 'timeOfDay');

    const lighting = text(entry.lighting) || lightingFor(timeOfDay, location);
    if (!text(entry.lighting)) note(label, 'lighting');

    const palette = text(entry.palette) || paletteFor(timeOfDay);
    if (!text(entry.palette)) note(label, 'palette');

    let characterIds = list(entry.characterIds);
    if (!characterIds.length) {
      const cast = castForScene(`${scriptSegment}\n${visual}\n${(section?.castNames || []).join('\n')}`, context);
      characterIds = cast.ids;
      note(label, cast.guessed ? 'characterIds（正文里认不出人物，已退到主角）' : 'characterIds');
    }

    const subtitle = text(entry.subtitle) ||
      scriptSegment.split(/[\n。！？]/).map((item) => item.trim()).find(Boolean) ||
      visual;
    if (!text(entry.subtitle)) note(label, 'subtitle');

    const durationSeconds = positive(entry.durationSeconds) ||
      Math.max(0, positive(entry.end) - positive(entry.start)) ||
      context.segmentSeconds;
    if (!positive(entry.durationSeconds)) note(label, 'durationSeconds');

    const composed = [location, visual].filter(Boolean).join('，');
    const mainImagePrompt = text(entry.mainImagePrompt) || text(entry.prompt) ||
      `${composed}。时间：${timeOfDay}。光线：${lighting}。色彩：${palette}。真实手机短视频质感，中文可审查画面说明。`;
    if (!text(entry.mainImagePrompt)) note(label, 'mainImagePrompt');

    const prompt = text(entry.prompt) || mainImagePrompt;
    if (!text(entry.prompt)) note(label, 'prompt');

    return {
      ...entry,
      id,
      title,
      visual,
      location,
      timeOfDay,
      lighting,
      palette,
      characterIds,
      scriptSegment,
      subtitle,
      durationSeconds,
      mainImagePrompt,
      prompt,
      referenceImageUrl: text(entry.referenceImageUrl)
    };
  });

  return {
    content: JSON.stringify({ ...parsed, scenes }, null, 2),
    filled,
    dropped
  };
}

/**
 * 完全没有模型产出时，按脚本小节直接生成场次。
 *
 * 这仍然是兜底，但兜的是「读脚本」而不是「换成一份通用营销模板」：
 * 脚本写了 12 个地点就出 12 个场次，每个场次是它自己的地点。
 * 脚本本身没分场时返回空数组，交给调用方回落到通用模板。
 */
export function scenesFromScript(context: SceneRepairContext): string {
  const sections = scriptSections(context.script);
  if (!sections.length) return '';

  const scenes = sections.map((section, index) => {
    const location = section.location || `第 ${index + 1} 场地点`;
    const visual = section.body.split(/\r?\n/).find(Boolean) || `${location}的一段剧情`;
    const timeOfDay = timeOfDayFromText(section.body, section.title) || '白天';
    const lighting = lightingFor(timeOfDay, location);
    const palette = paletteFor(timeOfDay);
    const cast = castForScene(`${section.body}\n${section.castNames.join('\n')}`, context);
    const prompt = `${location}，${visual}。时间：${timeOfDay}。光线：${lighting}。色彩：${palette}。真实手机短视频质感，中文可审查画面说明。`;
    return {
      id: `scene_${String(index + 1).padStart(2, '0')}`,
      title: section.title || `第 ${index + 1} 场`,
      visual,
      location,
      timeOfDay,
      lighting,
      palette,
      characterIds: cast.ids,
      scriptSegment: section.body,
      subtitle: section.body.split(/[\n。！？]/).map((item) => item.trim()).find(Boolean) || visual,
      durationSeconds: context.segmentSeconds,
      mainImagePrompt: prompt,
      prompt,
      referenceImageUrl: ''
    };
  });

  return JSON.stringify({ scenes }, null, 2);
}
