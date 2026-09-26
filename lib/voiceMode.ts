/**
 * 人声契约：一个概念，四处消费（剧本、分镜、视频提示词、negative）。
 *
 * 这套模块存在的原因是一次实测事故：字段名叫 narration、注释写着「当台词用」，
 * 但剧本阶段产出的是第三人称过去时的叙述（「小澎的第一段恋爱，开始于一颗糖」）。
 * 模型收到「把这句念出来」，只能生成画外音旁白——没有任何一个角色会这样介绍自己。
 * 于是十二段成片全是旁白，而产品里从没有人决定过要旁白。
 *
 * 结论：光在视频提示词里喊「不要旁白」没用，因为内容本身就是旁白。
 * 必须从剧本阶段就产出第一人称对白，四处措辞完全一致，否则模型会在最松的那一层钻空子。
 */

export type VoiceMode = 'dialogue' | 'narration' | 'silent';

export const VOICE_MODES: VoiceMode[] = ['dialogue', 'narration', 'silent'];

/**
 * 默认对白，不是旁白。旁白是需要显式声明的例外（口播带货、解说类片种），
 * 反过来（默认旁白）就是上面那次事故的成因。
 */
export const DEFAULT_VOICE_MODE: VoiceMode = 'dialogue';

export function normalizeVoiceMode(value: unknown): VoiceMode {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return (VOICE_MODES as string[]).includes(text) ? (text as VoiceMode) : DEFAULT_VOICE_MODE;
}

export function voiceModeLabel(mode: VoiceMode): string {
  if (mode === 'narration') return '旁白解说';
  if (mode === 'silent') return '无人声';
  return '人物对白';
}

/** 台词行的书写格式：必须带说话人，否则模型不知道该让谁开口，会退化成画外音。 */
export const DIALOGUE_LINE_FORMAT = '角色名：台词';

const DIALOGUE_LINE_PATTERN = /^\s*([^：:\n]{1,12})[：:]\s*(.+)$/;

/**
 * 「角色名：台词」这个格式本身留了个洞：说话人写成「旁白」就能绕过去。
 * 模型很擅长找这种空子——格式对了，内容还是旁白。所以说话人也要是白名单之外的真人名。
 */
const RESERVED_SPEAKER_PATTERN = /^(旁白|画外音|画外|解说|解说词|独白|内心独白|心声|字幕|口播|配音|叙述|叙述者|讲述|讲述人|narrator|voice\s*over|voiceover|v\.?o\.?|o\.?s\.?)$/i;

function isRealSpeaker(speaker: string): boolean {
  return Boolean(speaker.trim()) && !RESERVED_SPEAKER_PATTERN.test(speaker.trim());
}

export type DialogueLine = { speaker: string; line: string };

/**
 * 台词里的括注：（冷笑）、【第二章】、(sighs)、《某某》。
 *
 * 这些东西在剧本里是给人看的，到了视频模型手里是两种事故：
 * 要么被当成要念出来的字（角色真的会念「冷笑」两个字），
 * 要么被当成要画出来的字——而【 】在主流视频模型的提示词规范里就是字幕标记，
 * 写进台词等于主动要求模型往画面中间贴一行它画不好的汉字。
 */
const DIALOGUE_BRACKETED = /[（(【\[〔<][^）)】\]〕>\n]{0,40}[）)】\]〕>]/g;

/**
 * 书名号例外：《活着》是台词的一部分，不是括注。
 * 整段删掉会把「《活着》这本书我读过」变成「这本书我读过」——把话说漏了，
 * 比留着符号更糟。所以只去掉这一对符号本身，内容留下来照常念。
 */
const DIALOGUE_TITLE_MARKS = /[《》〈〉]/g;

/**
 * 台词允许出现的字符白名单。
 *
 * 用白名单而不是黑名单，是因为「奇奇怪怪的符号」本来就列不全：
 * 破折号、省略号、书名号、emoji、全角引号、零宽字符、各种私用区符号，
 * 黑名单每次只能补上已经出事的那一个。留下的只有汉字、假名、拉丁字母数字、
 * 和四个必须保留的中文标点——这四个决定断句和语气，去掉会让配音连成一片。
 */
const DIALOGUE_ALLOWED_CHARS = /[^一-鿿぀-ヿA-Za-z0-9，。！？、\s]/g;

/**
 * 把一句台词洗成「可以直接念、也不会被画出来」的样子。
 *
 * 顺序有讲究：先整段去括注（否则括注里的字会被白名单留下来变成台词的一部分），
 * 再过白名单，最后收拾标点。
 */
export function sanitizeDialogueLine(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return '';
  return value
    .replace(DIALOGUE_BRACKETED, '')
    .replace(DIALOGUE_TITLE_MARKS, '')
    // 破折号和省略号表示停顿，直接删掉会让前后两句连在一起，换成逗号保住节奏。
    .replace(/[—–\-]{1,}|\.{3,}|…+/g, '，')
    .replace(DIALOGUE_ALLOWED_CHARS, '')
    .replace(/\s+/g, '')
    // 上面几步会留下一串连着的标点（「，，。」），念出来是一段莫名其妙的停顿。
    .replace(/([，。！？、])[，。！？、]+/g, '$1')
    .replace(/^[，。！？、]+/, '')
    // 破折号在句尾很常见（「别说了——」），换成逗号之后就成了一句以逗号结尾的台词，
    // 配音会拖着不收。收成句号。
    .replace(/[，、]+$/, '。')
    .trim();
}

/** 多行台词整体清洗。空行和洗完变空的行一起丢掉。 */
export function sanitizeDialogueText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .split('\n')
    .map((line) => sanitizeDialogueLine(line))
    .filter(Boolean)
    .join('\n');
}

/**
 * narration 字段里可能是「小澎：你要吃糖吗？」也可能是裸台词。
 * 解析失败不报错——拿不到说话人时降级成「画面中的人物」，总好过整条台词丢掉。
 *
 * 台词正文在这里就洗干净，而不是留给每个调用点各洗一遍：
 * 漏掉任何一个调用点，那一条链路上的括注和特殊符号就会一路进到渲染请求里。
 */
export function parseDialogueLines(text: unknown): DialogueLine[] {
  if (typeof text !== 'string' || !text.trim()) return [];
  return text
    .split('\n')
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((raw) => {
      const match = raw.match(DIALOGUE_LINE_PATTERN);
      if (!match) return { speaker: '', line: sanitizeDialogueLine(raw) };
      // 「旁白：……」整行丢掉，不要降级成「画面中的人物开口说」——
      // 那等于把一句旁白硬塞给某个角色念，比原来的画外音更难看。
      if (!isRealSpeaker(match[1])) return { speaker: '', line: '' };
      return { speaker: match[1].trim(), line: sanitizeDialogueLine(match[2]) };
    })
    .filter((entry) => Boolean(entry.line));
}

/**
 * 中文普通话正常语速约每秒 4 到 5 个字，但一个镜头不能从头说到尾——
 * 得留出进入画面、反应和停顿的时间，所以按六成时长折算，再留一个下限。
 */
export function dialogueWordBudget(durationSeconds: unknown): number {
  const value = typeof durationSeconds === 'number' ? durationSeconds : Number(durationSeconds);
  const seconds = Number.isFinite(value) && value > 0 ? value : 5;
  return Math.max(8, Math.round(seconds * 0.6 * 4.5));
}

/**
 * 分镜阶段的硬校验：narration 要么为空，要么每一行都带说话人。
 *
 * 这一条必须卡在生成阶段，不能只靠视频提示词兜底。第三人称叙述句进到视频层已经晚了——
 * 「小澎的第一段恋爱，开始于一颗糖」被包装成「画面中的人物开口说：……」，
 * 模型只会让角色用第三人称念自己的名字，比原来的旁白更糟。
 */
export function isDialogueNarration(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value !== 'string') return false;
  if (!value.trim()) return true;
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .every((line) => {
      const match = line.match(DIALOGUE_LINE_PATTERN);
      return Boolean(match) && isRealSpeaker(match![1]);
    });
}

/**
 * 兜底模板用：不符合对白格式的一律降级成「这个镜头没人说话」，而不是原样透传。
 *
 * 丢掉一句台词听起来很粗暴，但两害相权：留着第三人称叙述句，成片里就是旁白或者
 * 角色用第三人称念自己名字；降级成无人声，最多是这个镜头安静，后期还能补。
 * 而且模板本来就是模型没交出合格产物时的降级路径，不该在这里做聪明的改写。
 */
export function toDialogueNarration(value: unknown): string {
  return isDialogueNarration(value) && typeof value === 'string' ? value : '';
}

/**
 * 台词标记。
 *
 * 主流视频模型的提示词规范里，`{ }` 是台词、`【 】` 是字幕、`( )` 是音乐、`< >` 是音效。
 * 这里以前用的是中文引号 `「 」`——它不在任何一份规范里，模型对它没有约定俗成的理解，
 * 于是有时把它当台词标记，有时把引号本身当成要画进画面的字符。
 * 用规范里的那一对，再配一句「标记不是要显示的字符」，两头都堵上。
 */
const DIALOGUE_MARK_OPEN = '{';
const DIALOGUE_MARK_CLOSE = '}';
const DIALOGUE_MARK_RULE =
  `${DIALOGUE_MARK_OPEN} ${DIALOGUE_MARK_CLOSE} 只是台词的标记，它本身和里面的标点都不许出现在画面上，不要把大括号、引号或任何符号画成字幕。`;

/** 四处共用的禁令主体。改这里，四处一起变。 */
const NO_VOICEOVER_RULE =
  '全片不使用旁白。禁止画外音、旁白、解说、第三人称叙述、上帝视角讲述和纪录片式解说词；'
  + '所有人声都必须由画面里看得见的人物开口说出来。';

/** 剧本阶段：从源头就不产出旁白文本。这一层管不住，后面三层都是补救。 */
export function dialogueScriptInstruction(mode: VoiceMode = DEFAULT_VOICE_MODE): string {
  if (mode === 'silent') {
    return `\n人声约束：本片没有任何人声。script.md 里不写台词也不写旁白，只写画面、动作和情绪，声音部分只描述环境音和音乐。`;
  }
  if (mode === 'narration') {
    return `\n人声约束：本片是旁白驱动。旁白文本必须是可以直接念出来的中文口语，不要写成书面说明文；人物不开口说话。`;
  }
  return `\n人声约束（这一段决定成片里是人在演还是有人在念，必须逐条执行）：
- ${NO_VOICEOVER_RULE}
- script.md 里禁止出现「旁白」「口播」「解说」「配音」「V.O.」「画外音」这类段落标题或字段；已经写了就是不合格，必须改写成对白。
- 每一句台词都要写成「${DIALOGUE_LINE_FORMAT}」的形式，说话人必须是本片已出场的角色本名。
- 台词必须是第一人称、当下时态、这个人物在这个情境下真的会说出口的话。
  反例（这是旁白，不是台词）：「小澎的第一段恋爱，开始于一颗还没剥开的糖。」
  正例（这是台词）：「小澎：这颗给你——等等，我先帮你剥。」
- 叙事信息（时间推移、背景交代、心理活动）不许用旁白交代，只能靠三种方式：让人物说出来、用画面表现、或者由后期字幕承担。
- 不要写内心独白当替代品：内心独白同样是画外音，模型分不出来。`;
}

/** 分镜阶段：narration 字段的真实契约。字段名是历史遗留，装的必须是对白。 */
export function dialogueStoryboardInstruction(mode: VoiceMode = DEFAULT_VOICE_MODE): string {
  if (mode === 'silent') {
    return '\n- narration：留空字符串。本片没有人声，不要给任何镜头编台词。';
  }
  if (mode === 'narration') {
    return '\n- narration：这个镜头的旁白文本，中文口语，可以直接念出来。';
  }
  return `\n人声约束（narration 字段装的是对白，不是旁白）：
- narration：这个镜头里人物说出口的台词，必须写成「${DIALOGUE_LINE_FORMAT}」，说话人是已确认 characters.json 里的角色本名。一个镜头有来回对话时用换行分成多行，每行一个说话人。
- ${NO_VOICEOVER_RULE}narration 里不许写第三人称叙述句。
- 字数按镜头时长卡死：每个镜头的 narration 总字数不超过 durationSeconds × 2.7（约等于说话占镜头六成时间）。5 秒镜头最多约 ${dialogueWordBudget(5)} 个字，也就是一到两句短台词。写超了模型会加速念或者念不完就切走。
- 说话人必须是角色本名。写成「旁白：……」「解说：……」「独白：……」「画外音：……」一律判不合格——换个字段名装旁白仍然是旁白。
- 这个镜头没人说话时，narration 写成空字符串，不要用旁白填补空白。
- 台词要能被画面支撑：说话的人必须在这个镜头里出现且看得见脸，不要给不在画面里的人写台词。`;
}

/** 视频阶段：写进 asset_prompts.json 每条 prompt 的要求。 */
export function dialogueAssetPromptInstruction(mode: VoiceMode = DEFAULT_VOICE_MODE): string {
  if (mode === 'silent') {
    return '- prompt 里必须写明「本镜头没有人声，只有环境音和情绪音乐，画面中没有人开口说话，也不要任何画外音或旁白」。';
  }
  if (mode === 'narration') {
    return `- prompt 里必须逐字照抄对应镜头的 narration，写成「本镜头旁白，用中文普通话完整念出、一字不改：${DIALOGUE_MARK_OPEN}……${DIALOGUE_MARK_CLOSE}」。${DIALOGUE_MARK_RULE}`;
  }
  return `- prompt 里必须写明这个镜头的台词，逐字照抄已确认 storyboard.json 里同一 sceneId 的 narration，并写清楚是谁开口：「本镜头台词，由画面中的某某角色开口说出，能看见他/她在说话，用中文普通话完整念出、一字不改：${DIALOGUE_MARK_OPEN}……${DIALOGUE_MARK_CLOSE}」。${DIALOGUE_MARK_RULE}
- 台词正文里不要写括注、破折号、省略号、书名号、方括号和 emoji：（冷笑）这类提示模型会当成要念的字或者要画的字，方括号和【】更是主流视频模型的字幕标记，写进去就是要求它往画面上贴字。情绪和停顿写进画面描述，不要写进台词。
- ${NO_VOICEOVER_RULE}每条 prompt 都要带上这句禁令，不要因为镜头里只有一个人就省掉。
- 对应镜头的 narration 为空时，写成「本镜头没有人说话，只保留环境音和情绪音乐，不要任何画外音、旁白或解说」。
- 不要自己另编台词，也不要把台词翻译成英文——不给台词模型就会自己即兴，实测会先说一段英文再转中文。`;
}

/**
 * 追加给视频模型的正向指令。这是唯一直接进入渲染请求的一层，
 * 也是最后一道闸——前面三层但凡漏了，只有这里还能拦住。
 */
export function dialoguePromptDirective(narration: unknown, mode: VoiceMode = DEFAULT_VOICE_MODE): string {
  if (mode === 'silent') {
    return '本镜头没有人声：画面中没有人开口说话，只保留环境音和情绪音乐，不要任何画外音、旁白或解说。';
  }

  const lines = parseDialogueLines(narration);
  if (!lines.length) {
    return '本镜头没有人说话：不要让人物开口，只保留环境音和情绪音乐，不要任何画外音、旁白、解说或第三人称叙述。';
  }

  if (mode === 'narration') {
    return `本镜头旁白，用中文普通话完整念出、一字不改，不要翻译成英文，也不要显示成画面文字：${DIALOGUE_MARK_OPEN}${lines.map((entry) => entry.line).join('')}${DIALOGUE_MARK_CLOSE}。${DIALOGUE_MARK_RULE}`;
  }

  const spoken = lines
    .map((entry) => `${entry.speaker ? `画面中的${entry.speaker}` : '画面中的人物'}开口说${DIALOGUE_MARK_OPEN}${entry.line}${DIALOGUE_MARK_CLOSE}`)
    .join('；');

  return `本镜头台词由画面里的人物当场说出，必须看得见说话的人在张嘴，口型和台词对得上：${spoken}。用中文普通话完整念出、一字不改，不要翻译成英文，也不要显示成画面文字。${DIALOGUE_MARK_RULE}${NO_VOICEOVER_RULE}画面里没有人在说话的时间段就保持环境音，不要用旁白填补。`;
}

/** negative 兜底。正向指令被模型忽略时，这一层还能压住画外音。 */
export function voiceNegativePrompt(mode: VoiceMode = DEFAULT_VOICE_MODE): string {
  if (mode === 'narration') return '不要英文配音、不要中英夹杂、不要机械音、不要画面文字';
  if (mode === 'silent') return '不要人声、不要对白、不要旁白、不要画外音、不要解说、不要画面文字';
  return '不要旁白、不要画外音、不要解说词、不要第三人称叙述、不要纪录片解说、不要无人开口时出现人声、不要口型对不上台词、不要英文配音、不要中英夹杂';
}
