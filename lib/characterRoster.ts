/**
 * 脚本「人物设定」小节 与 实际生成的角色之间的一致性检查。
 *
 * 真实事故：某个脚本的人物设定只写了前任A/B/C和现任四个人，正文却从第2节一路用到第8节，
 * 出现了前任A到前任G。角色阶段读的是正文（提示词明确要求「一个都不能漏」），
 * 于是老老实实生成了 8 个配角，其中 D/E/F/G 的长相、年龄、气质全部由模型凭空编造——
 * 而这四个编出来的人还要参与全片的角色一致性质检。
 *
 * 整个过程没有任何一处报警，用户是靠肉眼数卡片才发现 4 变成了 8。
 * 角色阶段默默补齐是对的（不补齐下游会断档），但补齐这件事本身必须说出来。
 *
 * 这里刻意不去解析人物设定小节的内部结构：Markdown 里人名的写法太多
 * （`**小澎**：`、`- 前任A：`、`1. 小澎 —— `），正则解析必然漏。
 * 反过来做要稳得多：characters.json 里的名字是结构化的，拿它去人物设定小节里查存在性即可。
 */

/** 常见的角色小节标题。命中任意一个就认为脚本声明了人物名册。 */
const ROSTER_HEADINGS = ['人物设定', '人物介绍', '出场人物', '人物表', '人物', '角色设定', '角色介绍', '角色表', '角色'];

const HEADING_PATTERN = /^\s{0,3}#{1,6}\s*(.+?)\s*$/;

/**
 * 取出人物小节的正文（不含标题行），没有这一节时返回 null。
 * 返回 null 和返回空字符串含义不同：前者是「脚本没声明名册」，不该报不一致；
 * 后者是「声明了但里面什么都没写」，该报。
 */
export function characterRosterSection(scriptMarkdown: unknown): string | null {
  if (typeof scriptMarkdown !== 'string' || !scriptMarkdown.trim()) return null;
  const lines = scriptMarkdown.split(/\r?\n/);

  let startIndex = -1;
  let headingDepth = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(HEADING_PATTERN);
    if (!match) continue;
    const title = match[1].replace(/[*_`#\s]/g, '');
    if (ROSTER_HEADINGS.some((heading) => title.includes(heading))) {
      startIndex = index + 1;
      headingDepth = (lines[index].match(/#/g) || []).length;
      break;
    }
  }
  if (startIndex < 0) return null;

  const body: string[] = [];
  for (let index = startIndex; index < lines.length; index += 1) {
    const match = lines[index].match(HEADING_PATTERN);
    // 同级或更高级的标题意味着这一节结束；更深一级的子标题仍属于本节。
    if (match && (lines[index].match(/#/g) || []).length <= headingDepth) break;
    body.push(lines[index]);
  }
  return body.join('\n');
}

/**
 * 一个角色在脚本里可能出现的写法：正式姓名，外加脚本里对他的原始称呼。
 *
 * 角色阶段现在会给脚本没起名的人随机起名（「前任A」→「周叙」），这个名字在脚本里查无此人。
 * 只按 name 比对的话，下面两条核对会同时误报：一条说角色阶段凭空多做了「周叙」，
 * 另一条说「前任A」漏做了——同一个人，两条互相矛盾的警告。
 * 所以比对时姓名和 scriptAlias 任意一个对上，就算这个人在脚本里有据可查。
 *
 * 仍然接受纯字符串，老调用点和只有姓名的场合不需要改。
 */
export type RosterCharacter = string | { name?: unknown; scriptAlias?: unknown };

function nameForms(entry: RosterCharacter): string[] {
  const values = typeof entry === 'string' ? [entry] : [entry?.name, entry?.scriptAlias];
  return values
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.replace(/\s/g, ''))
    .filter(Boolean);
}

/** 报给用户看的那个名字，永远是角色资产上的正式姓名。 */
function primaryName(entry: RosterCharacter): string {
  const value = typeof entry === 'string' ? entry : entry?.name;
  return typeof value === 'string' ? value.trim() : '';
}

/** 返回在人物小节里查不到的角色名。脚本没有人物小节时返回空数组——无从比较，不是错误。 */
export function missingFromRoster(scriptMarkdown: unknown, characters: RosterCharacter[]): string[] {
  const section = characterRosterSection(scriptMarkdown);
  if (section === null) return [];
  const haystack = section.replace(/\s/g, '');
  return characters
    .filter((entry) => Boolean(primaryName(entry)))
    .filter((entry) => !nameForms(entry).some((form) => haystack.includes(form)))
    .map((entry) => primaryName(entry));
}

/**
 * 给用户看的一句话。措辞刻意指向脚本而不是角色阶段：
 * 多出来的角色是正文要求的，该改的是脚本，不是把这些人删掉。
 */
export function rosterGapWarning(missing: string[]): string {
  if (!missing.length) return '';
  return `脚本正文里有 ${missing.length} 个人物没有写进人物设定：${missing.join('、')}。这些角色的形象由模型凭空生成，没有脚本依据，且会全程参与角色一致性质检。建议回到剧本补全人物设定，或删减正文里的人物数量。`;
}

/**
 * 人物设定小节里声明的人名。
 *
 * 上面 missingFromRoster 查的是「生成了脚本里没有的人」，反过来那一半一直没人查：
 * 脚本人物设定写了陈女士、前任A、现任B 三个人，角色阶段只产出 1 个，
 * 界面上就是一张卡片，谁也没提醒少了两个人。
 *
 * 这里只用最保守的写法去认名字——行首的列表符号或加粗标签，后面跟冒号或破折号。
 * 认不出来的就漏掉：这条只用来提醒，漏报只是少一句提示，误报会让用户去找不存在的问题。
 */
const ROSTER_ENTRY_PATTERNS = [
  /^\s*[-*+]\s*\**([^：:—\-*\n]{1,20}?)\**\s*[：:—]/,
  /^\s*\d+[.、)]\s*\**([^：:—\n]{1,20}?)\**\s*[：:—]/,
  /^\s*\*\*([^*\n]{1,20}?)\*\*\s*[：:—]/
];

/** 不是人名的常见小标题，避免把它们当成角色报出来。 */
const NON_NAME_LABELS = /^(年龄|性别|外貌|外观|身高|体型|服装|穿着|性格|职业|身份|背景|关系|设定|说明|备注|台词|声音|人设|形象|发型|妆容|道具)$/;

export function rosterNamesFromScript(scriptMarkdown: unknown): string[] {
  const section = characterRosterSection(scriptMarkdown);
  if (!section) return [];
  const names: string[] = [];
  for (const line of section.split(/\r?\n/)) {
    for (const pattern of ROSTER_ENTRY_PATTERNS) {
      const match = line.match(pattern);
      const name = match?.[1]?.trim();
      if (!name || NON_NAME_LABELS.test(name) || names.includes(name)) continue;
      names.push(name);
      break;
    }
  }
  return names;
}

/** 人物设定里声明了、但角色资产里找不到的人名。 */
export function rosterNamesMissingFromAssets(scriptMarkdown: unknown, characters: RosterCharacter[]): string[] {
  const declared = rosterNamesFromScript(scriptMarkdown);
  if (!declared.length) return [];
  // 姓名和原始称呼都进 haystack：脚本写「前任A」、角色资产叫「周叙」时，这个人是做了的。
  const haystack = characters.flatMap(nameForms).join('|');
  return declared.filter((name) => !haystack.includes(name.replace(/\s/g, '')));
}

/**
 * 「脚本里有、角色资产里没有」的提醒。
 * 和 rosterGapWarning 方向相反：那条说多了人，这条说少了人。
 */
export function rosterShortfallWarning(missing: string[], generatedCount: number): string {
  if (!missing.length) return '';
  return `脚本人物设定里声明了 ${missing.length + generatedCount} 个人物，角色阶段只产出了 ${generatedCount} 个，少了：${missing.join('、')}。缺席的人物在后续场景和分镜里没有形象依据，模型会临时编一张脸。请重新生成角色，或回到剧本删掉不出场的人物。`;
}
