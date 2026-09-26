/**
 * 镜头物理契约：一个字段（physicsMode），三处消费。
 *
 * 「霸总一掌把人推飞」和「人物穿模」在像素层面是同一类反物理信号，
 * 差别只在意图。分镜阶段不把意图记下来，后面的自动质检必然把爽点当 bug 干掉——
 * 这是这套模块存在的唯一理由，也是它必须被分镜提示词、视频提示词和质检
 * 三处共用同一份定义的原因：任何一处自己另写一套，三者立刻打架。
 */

export type PhysicsMode = 'realistic' | 'stylized' | 'surreal';

export const PHYSICS_MODES: PhysicsMode[] = ['realistic', 'stylized', 'surreal'];

/**
 * 缺省一律按最严的 realistic 处理。反过来（缺省放行）意味着模型漏填字段就等于关掉质检，
 * 而模型漏填恰恰是最常见的情况。
 */
export const DEFAULT_PHYSICS_MODE: PhysicsMode = 'realistic';

export function normalizePhysicsMode(value: unknown): PhysicsMode {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return (PHYSICS_MODES as string[]).includes(text) ? (text as PhysicsMode) : DEFAULT_PHYSICS_MODE;
}

export function physicsModeLabel(mode: PhysicsMode): string {
  if (mode === 'stylized') return '戏剧夸张';
  if (mode === 'surreal') return '超现实';
  return '写实';
}

/**
 * 漂移和融化是随时间累积的：realistic 镜头过了 5 秒左右崩坏概率陡增。
 * stylized/surreal 本来就不追求物理连续，可以放宽一点。
 */
const PHYSICS_DURATION_CAP: Record<PhysicsMode, number> = {
  realistic: 5,
  stylized: 6,
  surreal: 8
};

export function physicsDurationCap(mode: PhysicsMode): number {
  return PHYSICS_DURATION_CAP[mode];
}

/**
 * 拆镜头的目标时长，比上限更短。
 *
 * 「上限」和「该拆到多细」是两件事，以前共用 PHYSICS_DURATION_CAP 一个数：
 * 于是 15 秒小节按上限 5 秒拆成 3 个镜头，每个镜头塞满 5 秒里能发生的所有动作，
 * 观感上就是三段各自把一整段戏演完的长镜头，而不是分镜。
 * 按目标时长拆，一个镜头只装一个动作节拍，切点落在动作和景别变化上。
 */
const PHYSICS_TARGET_SHOT_SECONDS: Record<PhysicsMode, number> = {
  realistic: 3,
  stylized: 3.5,
  surreal: 4
};

export function targetShotSeconds(mode: PhysicsMode = DEFAULT_PHYSICS_MODE): number {
  return PHYSICS_TARGET_SHOT_SECONDS[mode];
}

/**
 * 「小节」是叙事单位（观众感知的一节），「镜头」是渲染单位（一次生成）。
 * 这两个概念以前在系统里是一个东西：规格说每小节 15 秒，物理上限说单镜头 5 秒，
 * 于是脚本按 15 秒一节写、分镜按一节一镜拆、渲染再被砍回 5 秒——三方各说各话。
 * 拆开之后关系是固定的：一个小节由 ceil(小节时长 / 目标时长) 个镜头拼成。
 */
export function shotsPerSegment(segmentSeconds: number, mode: PhysicsMode = DEFAULT_PHYSICS_MODE): number {
  const target = targetShotSeconds(mode);
  const value = Number(segmentSeconds);
  if (!Number.isFinite(value) || value <= 0) return 1;
  return Math.max(1, Math.ceil(value / target));
}

/** 整片的镜头总数。成本预估和脚本阶段的镜头预算都读这一个函数，避免两边各算一套。 */
export function estimateShotCount(totalSeconds: number, mode: PhysicsMode = DEFAULT_PHYSICS_MODE): number {
  const target = targetShotSeconds(mode);
  const value = Number(totalSeconds);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.max(1, Math.ceil(value / target));
}

export function clampShotDuration(durationSeconds: unknown, mode: PhysicsMode): number {
  const cap = physicsDurationCap(mode);
  const value = typeof durationSeconds === 'number' ? durationSeconds : Number(durationSeconds);
  if (!Number.isFinite(value) || value <= 0) return cap;
  return Math.min(cap, Math.max(1, value));
}

/**
 * 有人在镜头里开口说话时的时长上限，比通用上限更短。
 *
 * 说话的镜头有两个别的镜头没有的特点：脸在画面里占得大，而且嘴一直在动。
 * 前者让身份漂移无处可藏，后者让模型每一帧都在重画五官——这正是「脸一直在抖、
 * 一直在变脸型」最容易发生的地方。所以只对有台词的镜头收紧，
 * 而不是把 realistic 的上限整体从 5 秒砍到 4 秒：后者会让全片镜头数增加两成半，
 * 渲染成本跟着涨，而没有台词的空镜并不需要这个约束。
 */
export const DIALOGUE_SHOT_DURATION_CAP = 4;

export function clampDialogueShotDuration(durationSeconds: unknown, mode: PhysicsMode): number {
  return Math.min(clampShotDuration(durationSeconds, mode), DIALOGUE_SHOT_DURATION_CAP);
}

export function exceedsPhysicsDurationCap(durationSeconds: unknown, mode: PhysicsMode): boolean {
  const value = typeof durationSeconds === 'number' ? durationSeconds : Number(durationSeconds);
  return Number.isFinite(value) && value > physicsDurationCap(mode);
}

export type PhysicsRiskCode = 'contact' | 'fight' | 'gait' | 'hands' | 'crowd' | 'material';

export type PhysicsRiskRule = {
  code: PhysicsRiskCode;
  label: string;
  pattern: RegExp;
  /** 给分镜 Agent 的改写方向。真实剧组也这么干：演员做不到的动作靠借位和剪辑省掉。 */
  rewrite: string;
};

/**
 * 这些不是「不许拍」的黑名单，是「模型现在拍不好」的清单。
 * 绕开它们发生在渲染之前，一分钱 GPU 都不烧，是整套方案里性价比最高的一层。
 */
export const PHYSICS_RISK_RULES: PhysicsRiskRule[] = [
  {
    code: 'contact',
    label: '人物接触',
    pattern: /拥抱|抱住|抱紧|搂|握手|牵手|接吻|亲吻|搀扶|拉住|扶住|递给|递过|靠在.{0,4}肩/,
    rewrite: '拆成两个单人镜头加反打，接触发生的那一瞬间切走，用声音和反应交代'
  },
  {
    code: 'fight',
    label: '打斗动作',
    pattern: /打斗|对打|厮打|扭打|格斗|出拳|挥拳|踢向|踹|推搡|推开|巴掌|耳光|摔倒|扑倒|抓住.{0,4}衣领/,
    rewrite: '只拍上半身或局部特写配音效，或者拆成「起手 → 黑场 → 结果」两个镜头'
  },
  {
    code: 'gait',
    label: '全身连续动作',
    pattern: /奔跑|跑步|快跑|追赶|跳舞|舞蹈|起舞|跳跃|翻滚|转圈|全身入画|全景.{0,6}(走|跑)/,
    rewrite: '换成半身或腿部局部景别，或者用固定机位让人物走进走出画面，不跟拍全身'
  },
  {
    code: 'hands',
    label: '手部精细操作',
    pattern: /倒(水|酒|茶|咖啡)|点(烟|火|蜡烛)|翻(书|页|阅)|系(鞋带|扣子|领带)|穿针|打字|弹(琴|吉他)|切(菜|水果)|拧开|剥开/,
    rewrite: '改成手部大特写，画面里只留手和道具，主体越少模型压力越小；或者直接切到操作完成后的结果镜头'
  },
  {
    code: 'crowd',
    label: '多人同框',
    pattern: /三个人|四个人|五个人|人群|众人|一群人|围观|大家一起|同时(走|跑|站起)/,
    rewrite: '前景只保留一个人清晰，其余压成虚焦背景或直接出画'
  },
  {
    code: 'material',
    label: '难渲染材质',
    pattern: /水流|流水|喷泉|波浪|溅起|镜子|镜面|反射|倒影|玻璃杯|透明|烟雾|火焰|燃烧/,
    rewrite: '换道具或换机位避开，实在要保留就让它只出现在虚焦背景里，不进焦点'
  }
];

export type PhysicsRisk = {
  code: PhysicsRiskCode;
  label: string;
  rewrite: string;
};

export function detectPhysicsRisks(...texts: unknown[]): PhysicsRisk[] {
  const haystack = texts
    .filter((text): text is string => typeof text === 'string' && Boolean(text.trim()))
    .join('\n');
  if (!haystack) return [];
  return PHYSICS_RISK_RULES
    .filter((rule) => rule.pattern.test(haystack))
    .map((rule) => ({ code: rule.code, label: rule.label, rewrite: rule.rewrite }));
}

/**
 * 「边走边转头边说话」是一个镜头里塞三个动作。模型会把三个动作糊在一起，
 * 结果就是关节反折和融化。单镜头单动作是最便宜的一条硬约束。
 */
const MULTI_ACTION_PATTERN = /一边.{1,12}一边|边.{1,8}边.{1,8}(说|走|看|笑|哭)|同时.{1,10}(并|又|还)|然后.{1,12}(接着|随后|又)/;

/**
 * 上面那条正则只认显式的连接词。但中文写分镜最常见的复合动作根本不用连接词，
 * 而是纯逗号并列：「女主猛地回头，攥紧防狼喷雾，对准身后的人」——三个动作，一个连接词都没有，
 * 旧实现完全检测不到，等于这条护栏漏掉了大半。
 */
const ACTION_VERB_PATTERN = /(回头|转身|转头|抬头|低头|起身|站起|坐下|蹲下|伸手|抬手|举起|放下|拿起|掏出|递过|递给|攥紧|握紧|对准|指向|后退|上前|迈步|摇头|点头|张嘴|闭眼|睁眼|皱眉|微笑|大笑|痛哭|喊出|推开|拉住|扔向|甩出|摔下|拍打|踢向|挥拳|走向|跑向|停下|回身)/;

/**
 * 阈值取 3 而不是 2：一个主动作加一个细微的伴随动作（「他坐下，皱眉」）在实拍和生成里都成立，
 * 卡到 2 会把大量正常镜头误判成违规，护栏一旦噪音太大就会被整体忽略。
 */
const MAX_CLAUSE_ACTIONS = 2;

function commaSeparatedActionCount(visual: string): number {
  return visual
    .split(/[，,、；;]/)
    .filter((clause) => ACTION_VERB_PATTERN.test(clause))
    .length;
}

/**
 * 这一镜里有几个动作节拍。
 *
 * 和 hasMultipleActions 共用同一份动词表，不另写一套：镜头时长该给多少秒，
 * 判据必须和「这一镜是不是塞了太多动作」完全一致，否则会出现
 * 「按护栏算是三个动作、按时长算只值一个动作」这种两边打架的情况。
 * 显式连接词（一边…一边）本身就说明至少两个节拍，所以给它兜一个下限 2。
 */
export function countActionBeats(visual: unknown): number {
  if (typeof visual !== 'string' || !visual.trim()) return 0;
  const beats = Math.max(1, commaSeparatedActionCount(visual));
  return MULTI_ACTION_PATTERN.test(visual) ? Math.max(2, beats) : beats;
}

/**
 * 这段描述里有没有人物动作。
 *
 * 和 countActionBeats 是两个问题，不能合并：countActionBeats 服务的是「这一镜该给几秒」，
 * 所以它对任何非空描述都至少返回 1（再静的镜头也要占时长）；
 * 而这里问的是「画面里有没有人在动」，答案必须能是「没有」——空镜判定全靠它。
 */
export function hasActionVerb(visual: unknown): boolean {
  return typeof visual === 'string' && ACTION_VERB_PATTERN.test(visual);
}

export function hasMultipleActions(visual: unknown): boolean {
  if (typeof visual !== 'string') return false;
  if (MULTI_ACTION_PATTERN.test(visual)) return true;
  return commaSeparatedActionCount(visual) > MAX_CLAUSE_ACTIONS;
}

export type PhysicsQaCheck = 'anatomy' | 'identity' | 'clipping' | 'gravity' | 'lighting' | 'morphing';

export const PHYSICS_QA_CHECK_LABELS: Record<PhysicsQaCheck, string> = {
  // 脚必须点名。质检模型是照着这句话去看画面的，只写「手指数量、反关节」，
  // 它就真的只看手——鞋头露脚趾这种画面能一路通过质检直接交付。
  anatomy: '肢体与解剖（手指数量、反关节、多余肢体，以及脚部：脚趾数量、赤脚、脚趾从鞋子里露出、鞋子与脚穿模）',
  identity: '角色一致性（脸型、发型、服装、人种是否同一个人，特别注意中式面孔有没有变成欧美或混血长相）',
  clipping: '穿模与碰撞（人物或道具穿过实体）',
  gravity: '重力与受力（反重力悬浮、无支撑站立、碰撞无反作用）',
  lighting: '光影一致性（影子方向与光源是否吻合）',
  morphing: '时空连续性（画面元素中途变形、融化、突变）'
};

/**
 * 关键的一张表：夸张镜头放行重力和光影，但解剖学畸变、身份漂移和穿模在任何模式下都是缺陷——
 * 没有哪个导演想要六根手指的霸总。
 */
const PHYSICS_QA_CHECKS: Record<PhysicsMode, PhysicsQaCheck[]> = {
  realistic: ['anatomy', 'identity', 'clipping', 'gravity', 'lighting', 'morphing'],
  stylized: ['anatomy', 'identity', 'clipping', 'morphing'],
  surreal: ['anatomy', 'identity', 'morphing']
};

export function physicsQaChecks(mode: PhysicsMode): PhysicsQaCheck[] {
  return [...PHYSICS_QA_CHECKS[mode]];
}

export type PhysicsIssueSeverity = 'critical' | 'major' | 'minor';

const PHYSICS_FAILING_SEVERITIES: Record<PhysicsMode, PhysicsIssueSeverity[]> = {
  realistic: ['critical', 'major'],
  stylized: ['critical', 'major'],
  surreal: ['critical']
};

export function physicsFailingSeverities(mode: PhysicsMode): PhysicsIssueSeverity[] {
  return [...PHYSICS_FAILING_SEVERITIES[mode]];
}

/**
 * 手一直写在这里，脚一直没写——直到成片里出现了「鞋头那里露出脚趾」。
 * 脚和手是同一类问题（末端肢体，模型训练信号弱），但脚上还多一层：
 * 鞋子是穿在脚上的物体，模型经常把鞋渲成半透明或者干脆渲成裸足。
 * 人种同理，写在这里是因为它必须出现在每一条 negative 里，而不是只在某一层。
 */
const BASE_NEGATIVE_PROMPT = '不要多余手指、不要缺指、不要畸形手部、不要反关节、不要多余肢体、不要畸形脚部、不要多余脚趾、不要赤脚、不要脚趾从鞋子里露出、不要鞋子变形或与脚穿模、不要脸部变形或融化、不要人物中途换脸换发型换衣服、不要中途改变人种、不要欧美面孔或混血脸、不要肢体穿过实体、不要画面文字或水印';

const MODE_NEGATIVE_PROMPT: Record<PhysicsMode, string> = {
  realistic: '不要反重力悬浮、不要无支撑站立、不要影子方向与光源不符、不要物体凭空出现或消失、不要液体逆流',
  stylized: '不要人物比例中途改变、不要背景建筑结构突变',
  surreal: '不要人物身份在镜头内被替换'
};

export function physicsNegativePrompt(mode: PhysicsMode): string {
  return `${BASE_NEGATIVE_PROMPT}、${MODE_NEGATIVE_PROMPT[mode]}。`;
}

/** 给视频提示词追加的一句正向物理约束。夸张镜头只约束身体本身，不约束受力结果。 */
export function physicsPromptDirective(mode: PhysicsMode): string {
  if (mode === 'surreal') {
    return '本镜头允许非现实设定（法术、意识空间、飞行等），但人物必须始终是同一个人，五官、发型和服装不得在镜头内改变，手指数量和肢体结构保持正常。';
  }
  if (mode === 'stylized') {
    return '本镜头是有意为之的戏剧夸张，力量、位移和滞空可以超出现实，但人体结构必须正确：手指数量正常、关节不反折、肢体不穿过实体，人物全程是同一个人。';
  }
  return '本镜头必须完全符合真实物理：重力、支撑、碰撞和受力都要成立，影子方向与光源一致，人体结构正确，一个镜头只完成一个连续动作，不要中途叠加第二个动作。';
}

/**
 * 脚本阶段的约束段落。
 *
 * 以前这些约束只挂在分镜阶段，脚本 Agent 在真空里写作，写完之后由分镜去「补救」——
 * 于是牵手、拥抱、满屏大屏幕、七个没人设的配角全都是在脚本里种下、到渲染阶段才炸的。
 * 约束左移的代价只是提示词长一点，收益是后面四个阶段的返工大部分消失。
 *
 * 这里刻意只给方向不给硬闸：脚本阶段判不合格会直接卡住创作，
 * 而这些约束里没有哪一条值得用「整份作废」去换。真正的硬校验留在分镜和视频阶段。
 */
export function scriptConstraintInstruction(options: {
  segmentSeconds: number;
  segmentCount: number;
  mode?: PhysicsMode;
}): string {
  const mode = options.mode || DEFAULT_PHYSICS_MODE;
  const cap = physicsDurationCap(mode);
  const perSegment = shotsPerSegment(options.segmentSeconds, mode);
  const totalSeconds = options.segmentSeconds * options.segmentCount;
  const totalShots = perSegment * options.segmentCount;

  const riskLines = PHYSICS_RISK_RULES
    .map((rule) => `  - ${rule.label}：${rule.rewrite}。`)
    .join('\n');

  return `
可拍摄性约束（脚本阶段就要遵守，不要留给分镜去补救）：
- 渲染的原子单位是「镜头」，不是「小节」。单个镜头最长 ${cap} 秒（${physicsModeLabel(mode)}），这是模型的硬上限，不是建议值。
- 本片约 ${totalSeconds} 秒 = ${options.segmentCount} 个小节 × ${options.segmentSeconds} 秒，每个小节最终会被拆成约 ${perSegment} 个镜头，全片合计约 ${totalShots} 个镜头。
  这个数字只用来控制信息密度：一个 ${cap} 秒的镜头只够放一句短台词加一个动作，所以一个小节最多承载 ${perSegment} 句短台词或 ${perSegment} 个动作，放不下一整段对话。
  **但不要在脚本里逐条列出这些镜头**——不要写「镜头 1（5 秒）」这类分镜表，也不要写镜头统计。脚本按小节组织即可，拆镜头是分镜阶段的产物，在这里写等于越界，还会让脚本长到无法生成。
- 每个镜头只做一个连续动作。「猛地回头，攥紧喷雾，对准来人」是三个动作，必须拆成三个镜头或者只保留一个。
- 镜头内不换景别、不换机位、不换场景。景别变化本身就意味着切一刀。
- 画面里不能出现任何文字。屏幕内容、招牌、聊天记录、数据大屏这些都渲不出可读汉字，靠它们承载信息的情节要重写；字幕由后期叠加，可以正常写在脚本里。
- 下列动作模型目前拍不好，写的时候就绕开，不要指望分镜能救：
${riskLines}

角色成本（直接决定这片子要重渲多少次）：
- 每多一个需要露脸且反复出现的角色，就多一份身份漂移风险，而角色一致性在任何模式下都是不放行的死检查项。
- 只出现一两次的功能性角色，写成不需要露脸的形态——背影、侧影、只有手、只有声音、戴帽子口罩。一句「路人：连帽衫，背影看不清脸」就能把这个角色的一致性风险降到零。
- 需要露脸的主要角色控制在 3 个以内；确实需要更多人物时，让他们分别出现在不同小节，避免多人同框。`;
}

/** 分镜阶段提示词里的物理护栏段落。和质检共用同一份定义，避免两边各写一套。 */
export function physicsGuardrailInstruction(): string {
  const riskLines = PHYSICS_RISK_RULES
    .map((rule) => `  - ${rule.label}（${rule.pattern.source.split('|').slice(0, 3).join('、')} 等）：${rule.rewrite}。`)
    .join('\n');

  return `
物理可行性护栏（这一段决定成片会不会崩坏，必须逐条执行）：
- 每个镜头必须带 physicsMode 字段，取值只能是 realistic、stylized、surreal 三者之一：
  - realistic：日常对话、走动、拿取、情绪特写等应当完全符合现实物理的镜头。默认用这个。
  - stylized：有意为之的戏剧夸张，例如一掌把人推飞、甩巴掌后画面震动、气场爆发。爽点镜头写这个，后续质检会放宽重力和光影，但仍然会卡手指和穿模。
  - surreal：题材设定本身就不现实，例如修仙、法术、意识空间、梦境。
  写错这个字段的代价是双向的：把爽点写成 realistic，它会被质检判成崩坏打回重渲；把日常镜头写成 surreal，真正的崩坏就没人拦得住。
- 时长上限按模式卡死：realistic 不超过 ${PHYSICS_DURATION_CAP.realistic} 秒，stylized 不超过 ${PHYSICS_DURATION_CAP.stylized} 秒，surreal 不超过 ${PHYSICS_DURATION_CAP.surreal} 秒。超过上限的内容拆成两个镜头，不要靠拉长单镜头解决。
- 单镜头单动作：一个镜头只允许一个主体动作。禁止「一边走一边转头说话」这类复合描述，拆成前后两个镜头。
- 镜头内不得切换景别：不要在一个镜头里从全景推到特写，机位变化拆成两个镜头。
- 下列动作模型目前拍不好，visual 里应主动改写规避，而不是照直描写：
${riskLines}
  改写是分镜的正常工作，不是偷工减料——真实剧组同样靠借位和剪辑省掉演员做不到的动作。`;
}
