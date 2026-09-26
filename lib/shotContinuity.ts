import {
  DEFAULT_PHYSICS_MODE,
  clampDialogueShotDuration,
  clampShotDuration,
  countActionBeats,
  normalizePhysicsMode,
  targetShotSeconds,
  type PhysicsMode
} from './shotPhysics';

/**
 * 分镜的连续性状态传递。
 *
 * 起因是实测下来最刺眼的一类事故：成片里人物在第 3 个镜头换了张脸、第 7 个镜头换了件衣服、
 * 第 9 个镜头房间的门从左边挪到了右边。这些不是模型画得不好，是编排的问题——
 * 分镜按场景分批生成（见 storyboardBatch），每一批都在真空里写：
 * 第 2 批完全看不到第 1 批把人物留在了什么状态，于是它只能重新编一遍。
 * 编出来的每一份都自洽，拼起来就是变脸、换装、空间跳变。
 *
 * 这个文件干三件事，缺一不可：
 * 1. carryStoryboardContinuity：把上一镜的状态往下传，模型没写的字段由系统继承，而不是留空让下游猜；
 * 2. storyboardContinuityTail + continuityHandoffInstruction：把上一批的收尾状态写进下一批的提示词，
 *    这是「分批生成」和「连续性」唯一的接缝，不接上，前面两件事在批次边界上一律失效；
 * 3. checkStoryboardContinuity：拿相邻镜头对比，把跳变挡在确认之前——渲染之后再发现，钱已经花掉了。
 *
 * 和 sceneVisualSpec 里那套 checkSceneContinuity 是两回事，不要合并：
 * 那一套跑在 scenes.json 的 instance.shots 上，是场次画板给用户审查用的；
 * 真正被拿去出视频的是 storyboard.json，而它此前一个连续性字段都没有。
 *
 * 这个文件不碰 node:fs，可以直接进客户端 bundle。
 */

export type ShotHand = 'left' | 'right' | 'both' | 'none';
export type ShotAxisSide = 'left' | 'right' | 'unset';

/** 画面方向。用于走位、视线和运动方向三处的一致性判断。 */
export type ScreenDirection = 'left' | 'right' | 'center' | 'toward' | 'away' | 'unset';

export type ShotCastState = {
  characterId: string;
  /**
   * 这一镜用 characters.json 里 visual.wardrobe 的哪一套造型。
   *
   * 存 id 而不是存一段服装描述，是因为描述会漂：同一件「米色风衣」在十个镜头里
   * 会被十次改写成十个近义词，而模型对近义词的理解并不一致。id 指回角色圣经里
   * 那一条唯一的定义，出图和出视频时由 characterVisualPromptLines 展开成完整描述。
   */
  wardrobeId: string;
  hairstyle: string;
  /** 人物在画面里的位置，例如「画面左三分之一」。 */
  screenPosition: string;
  /** 视线朝向。正反打和对话镜头靠它对齐。 */
  eyeline: string;
  /** 身体朝向。和视线是两回事：可以背对镜头却回头看。 */
  facing: string;
  /** 运动方向。上一镜从画面右侧出画，下一镜就该从左侧入画，否则观众会以为人物掉头了。 */
  movementDirection: string;
  handProp: string;
  hand: ShotHand;
  /** 本镜结束时人物已离开这个空间。之后再出现就是穿帮，除非有回来的动作。 */
  exited: boolean;
};

export type ShotContinuity = {
  /**
   * 故事时期。「大学时期」「工作三年后」这类。
   *
   * 它决定人物的年龄外观和整体造型基线，跨场次持续有效，直到剧情明确翻篇。
   * 没有它，同一个人在回忆段落和当下段落会用同一套脸和同一套衣服，观众看不出这是两个时期。
   */
  timelineStage: string;
  /**
   * 第几段关系。短剧和情感向内容里，「第一任」和「第三任」是两个人、两套造型、两种氛围，
   * 但脚本里往往只写「男友」——不显式带上这个 id，分镜会把三段恋情写成同一个人。
   */
  relationshipId: string;
  cast: ShotCastState[];
  timeOfDay: string;
  lightDirection: string;
  axisSide: ShotAxisSide;
  /** 这一镜的收尾画面。下一镜的 previousEndFrame 就是它。 */
  endFrame: string;
  /**
   * 上一镜的收尾画面。一律由系统回填，不采信模型写的值——
   * 模型看不到上一镜（分批时更是如此），它写的只能是编的。
   */
  previousEndFrame: string;
  /** 这一镜是哪一镜的反打。填了才做视线互斥检查。 */
  reverseShotOf: string;
};

export type ContinuityShot = Record<string, unknown> & {
  id?: unknown;
  sourceSceneId?: unknown;
  continuity?: unknown;
};

/**
 * 一批分镜的收尾状态，交给下一批当上下文。
 * 只带「下一批必须知道才能接上」的东西，不带整批镜头——后者会把提示词撑爆，
 * 而分批的初衷恰恰是控制单次请求的体积。
 */
export type ContinuityTail = {
  shotId: string;
  sceneId: string;
  timelineStage: string;
  relationshipId: string;
  timeOfDay: string;
  lightDirection: string;
  axisSide: ShotAxisSide;
  endFrame: string;
  cast: ShotCastState[];
};

// ── 归一化 ───────────────────────────────────────────────────────────

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function hand(value: unknown): ShotHand {
  const raw = text(value).toLowerCase();
  return raw === 'left' || raw === 'right' || raw === 'both' ? raw : 'none';
}

function axisSide(value: unknown): ShotAxisSide {
  const raw = text(value).toLowerCase();
  return raw === 'left' || raw === 'right' ? raw : 'unset';
}

const DIRECTION_PATTERNS: Array<{ direction: ScreenDirection; pattern: RegExp }> = [
  { direction: 'left', pattern: /画面左|向左|朝左|左侧|左方|镜头左|左三分之一|frame left/i },
  { direction: 'right', pattern: /画面右|向右|朝右|右侧|右方|镜头右|右三分之一|frame right/i },
  { direction: 'toward', pattern: /看向镜头|面向镜头|朝向镜头|走向镜头|正对镜头|入画|靠近/i },
  { direction: 'away', pattern: /背向镜头|背对|远离镜头|走远|出画|离开画面/i },
  { direction: 'center', pattern: /画面中央|居中|正中/i }
];

/**
 * 从一句中文里读出画面方向。
 *
 * 读不出来就返回 unset 并跳过检查，而不是猜一个。这一点是刻意的：
 * 方向类告警只要有噪音就会被整体忽略，宁可漏报也不要误报。
 *
 * prefer 决定一句话里出现多个方向时取哪一个，这不是可有可无的选项：
 * 「从画面左侧走向右侧」里有两个方向，视线和光影要的是第一个（主体所在方位），
 * 运动方向要的是最后一个（去处）。取错的后果是把「向右走」读成「向左」，
 * 于是跳轴检查全部反着报——比不检查更糟。
 */
export function screenDirection(value: unknown, prefer: 'first' | 'last' = 'first'): ScreenDirection {
  const raw = text(value);
  if (!raw) return 'unset';

  let best: { direction: ScreenDirection; index: number } | null = null;
  for (const entry of DIRECTION_PATTERNS) {
    const global = new RegExp(entry.pattern.source, `${entry.pattern.flags.replace('g', '')}g`);
    for (const match of raw.matchAll(global)) {
      const index = match.index ?? 0;
      if (!best || (prefer === 'last' ? index > best.index : index < best.index)) {
        best = { direction: entry.direction, index };
      }
    }
  }
  return best?.direction ?? 'unset';
}

export function normalizeShotCastState(value: unknown): ShotCastState {
  const source = record(value);
  return {
    characterId: text(source.characterId) || text(source.id),
    wardrobeId: text(source.wardrobeId) || text(source.wardrobe_id) || text(source.lookId),
    hairstyle: text(source.hairstyle),
    screenPosition: text(source.screenPosition) || text(source.screen_position) || text(source.position),
    eyeline: text(source.eyeline) || text(source.gaze),
    facing: text(source.facing),
    movementDirection: text(source.movementDirection) || text(source.movement_direction),
    handProp: text(source.handProp),
    hand: hand(source.hand),
    exited: source.exited === true
  };
}

export function normalizeShotContinuity(value: unknown): ShotContinuity {
  const source = record(value);
  return {
    timelineStage: text(source.timelineStage) || text(source.timeline_stage),
    relationshipId: text(source.relationshipId) || text(source.relationship_id),
    cast: list(source.cast).map(normalizeShotCastState).filter((entry) => Boolean(entry.characterId)),
    timeOfDay: text(source.timeOfDay),
    lightDirection: text(source.lightDirection),
    axisSide: axisSide(source.axisSide),
    endFrame: text(source.endFrame),
    previousEndFrame: text(source.previousEndFrame) || text(source.previous_end_frame),
    reverseShotOf: text(source.reverseShotOf)
  };
}

// ── 状态传递 ─────────────────────────────────────────────────────────

/**
 * 尾帧描述。模型没写就从这一镜的动作和画面里派生一句，绝不留空：
 * 留空的代价是下一镜的 previousEndFrame 也是空的，整条链断在这里，
 * 而链断掉在界面上完全看不出来——用户只会在成片里看到画面跳。
 */
function deriveEndFrame(shot: ContinuityShot, continuity: ShotContinuity): string {
  if (continuity.endFrame) return continuity.endFrame;
  const action = text(shot.action);
  const visual = text(shot.visual);
  const base = action || visual;
  return base ? `承接上一镜动作结束时的画面：${base}` : '';
}

/**
 * 造型记忆：每个角色最近一次被写下来的造型和发型。
 *
 * 为什么不能只看上一镜：女主在第 1 场穿米色风衣，第 2 场整场没出现，第 3 场又回来了。
 * 只看上一镜的话，第 3 场查不到她，模型没写 wardrobeId 就等于重新开始——
 * 于是她换了件衣服，而剧情里根本没有换装这回事。这是跨场次换装漂移最常见的来法。
 */
type WardrobeMemory = Map<string, { wardrobeId: string; hairstyle: string }>;

function rememberCast(memory: WardrobeMemory, cast: ShotCastState[]): void {
  for (const entry of cast) {
    if (!entry.characterId) continue;
    const prior = memory.get(entry.characterId);
    memory.set(entry.characterId, {
      wardrobeId: entry.wardrobeId || prior?.wardrobeId || '',
      hairstyle: entry.hairstyle || prior?.hairstyle || ''
    });
  }
}

function mergeCast(
  previous: ShotCastState[],
  current: ShotCastState[],
  sameScene: boolean,
  memory: WardrobeMemory
): ShotCastState[] {
  const before = new Map(previous.map((entry) => [entry.characterId, entry]));
  return current.map((entry) => {
    const remembered = memory.get(entry.characterId);
    const prior = sameScene ? before.get(entry.characterId) : undefined;
    return {
      ...entry,
      // 造型和发型走全片记忆，不只看上一镜：换装是剧情事件，不是每一镜的自由发挥。
      // 模型不写就等于「没换」，而不是「随便给一套」——后者正是换装漂移的来源。
      wardrobeId: entry.wardrobeId || remembered?.wardrobeId || '',
      hairstyle: entry.hairstyle || remembered?.hairstyle || '',
      // 走位、视线和运动方向只在同一场次内继承。切到新场次时人物本来就该重新调度，
      // 硬继承会把「上一场站在左边」变成对下一场的约束，那是错的。
      screenPosition: entry.screenPosition || prior?.screenPosition || '',
      eyeline: entry.eyeline || prior?.eyeline || '',
      facing: entry.facing || prior?.facing || '',
      movementDirection: entry.movementDirection || prior?.movementDirection || '',
      handProp: entry.handProp || prior?.handProp || '',
      hand: entry.hand === 'none' && prior ? prior.hand : entry.hand,
      exited: entry.exited
    };
  });
}

/**
 * 上一镜在场、这一镜模型压根没提到的人。
 *
 * 不补进来的话，「三个人在客厅，这一镜只写了女主」会被下游读成「另外两个人消失了」，
 * 而模型确实经常只写当前说话的那个人。已经离场的人不补——他们的消失是剧情，不是遗漏。
 *
 * 只在同一场次内补。跨场次补人是错的：上一场客厅里有谁，和这一场办公室里有谁没有关系，
 * 硬补过去会凭空把上一场的人塞进下一场的画面。
 */
function inheritOffscreenCast(previous: ShotCastState[], current: ShotCastState[]): ShotCastState[] {
  const named = new Set(current.map((entry) => entry.characterId));
  const carried = previous.filter((entry) => !named.has(entry.characterId) && !entry.exited);
  return [...current, ...carried];
}

export type CarryContinuityOptions = {
  /** 上一批的收尾状态。第一批没有，传 undefined。 */
  tail?: ContinuityTail | null;
  /** sourceSceneId → sceneMasterId。用来判断「换场次但没换空间」，也写进产物供下游读。 */
  sceneMasterById?: Map<string, string> | Record<string, string>;
};

function masterIdFor(sceneId: string, options: CarryContinuityOptions): string {
  const source = options.sceneMasterById;
  if (!source || !sceneId) return '';
  if (source instanceof Map) return source.get(sceneId) || '';
  return text(source[sceneId]);
}

function tailToContinuity(tail: ContinuityTail): ShotContinuity {
  return {
    timelineStage: tail.timelineStage,
    relationshipId: tail.relationshipId,
    cast: tail.cast,
    timeOfDay: tail.timeOfDay,
    lightDirection: tail.lightDirection,
    axisSide: tail.axisSide,
    endFrame: tail.endFrame,
    previousEndFrame: '',
    reverseShotOf: ''
  };
}

/**
 * 按镜头顺序把连续性状态往下传，返回带完整 continuity 的镜头数组。
 *
 * 「传递」不是「覆盖」：模型显式写了的值一律保留，只补它没写的。
 * 反过来做（系统值优先）会让分镜彻底失去表达变化的能力——换装、转身、离场都写不出来了。
 */
export function carryStoryboardContinuity(
  shots: ContinuityShot[],
  options: CarryContinuityOptions = {}
): ContinuityShot[] {
  let previousScene = options.tail?.sceneId || '';
  let previousContinuity: ShotContinuity | null = options.tail ? tailToContinuity(options.tail) : null;

  const memory: WardrobeMemory = new Map();
  if (options.tail) rememberCast(memory, options.tail.cast);

  return shots.map((shot) => {
    const sceneId = text(shot.sourceSceneId);
    const current = normalizeShotContinuity(shot.continuity);
    const sameScene = Boolean(sceneId) && sceneId === previousScene;

    let merged: ShotContinuity = current;
    if (previousContinuity) {
      const prior = previousContinuity;
      const cast = sameScene ? inheritOffscreenCast(prior.cast, current.cast) : current.cast;
      merged = {
        ...current,
        // 时期和关系跨场次一路传下去。这两个是故事状态，不是镜头状态：
        // 它们只在剧情翻篇时改变，而剧情翻篇一定是模型显式写出来的。
        timelineStage: current.timelineStage || prior.timelineStage,
        relationshipId: current.relationshipId || prior.relationshipId,
        cast: mergeCast(prior.cast, cast, sameScene, memory),
        timeOfDay: current.timeOfDay || (sameScene ? prior.timeOfDay : ''),
        lightDirection: current.lightDirection || (sameScene ? prior.lightDirection : ''),
        axisSide: current.axisSide !== 'unset' ? current.axisSide : sameScene ? prior.axisSide : 'unset',
        // 尾帧只在同一场次内接续。跨场次的「上一镜尾帧」是另一个空间的画面，
        // 拿它当参考等于把上一场的房间带进这一场——比不给参考更糟。
        previousEndFrame: sameScene ? prior.endFrame : ''
      };
    } else {
      merged = { ...current, cast: mergeCast([], current.cast, false, memory), previousEndFrame: '' };
    }

    merged.endFrame = deriveEndFrame(shot, merged);
    rememberCast(memory, merged.cast);

    previousScene = sceneId || previousScene;
    previousContinuity = merged;

    const masterId = masterIdFor(sceneId, options);
    return {
      ...shot,
      ...(masterId ? { sceneMasterId: masterId } : {}),
      continuity: merged
    };
  });
}

/**
 * 取一批分镜的收尾状态。空数组返回 null，调用方据此判断「这一批什么都没产出」。
 *
 * cast 取的是【整批累计】的造型记忆，不是最后一镜的 cast。
 * 只取最后一镜会漏掉「这一批出现过、但没出现在最后一镜里」的角色——
 * 而分批是按场景切的，最后一镜往往只有一两个人，剩下的人下一批就查不到造型了。
 */
export function storyboardContinuityTail(shots: ContinuityShot[]): ContinuityTail | null {
  const last = shots[shots.length - 1];
  if (!last) return null;
  const continuity = normalizeShotContinuity(last.continuity);

  const accumulated = new Map<string, ShotCastState>();
  for (const shot of shots) {
    for (const entry of normalizeShotContinuity(shot.continuity).cast) {
      if (!entry.characterId) continue;
      const prior = accumulated.get(entry.characterId);
      accumulated.set(entry.characterId, {
        ...entry,
        wardrobeId: entry.wardrobeId || prior?.wardrobeId || '',
        hairstyle: entry.hairstyle || prior?.hairstyle || ''
      });
    }
  }

  return {
    shotId: text(last.id),
    sceneId: text(last.sourceSceneId),
    timelineStage: continuity.timelineStage,
    relationshipId: continuity.relationshipId,
    timeOfDay: continuity.timeOfDay,
    lightDirection: continuity.lightDirection,
    axisSide: continuity.axisSide,
    endFrame: continuity.endFrame || deriveEndFrame(last, continuity),
    // 已离场的人不带进下一批：带过去只会让下一批以为他还在场上。
    // 造型记忆本身不受影响——他再出场时仍然穿着离场时那身衣服，那是靠 wardrobeId 传的。
    cast: Array.from(accumulated.values()).filter((entry) => !entry.exited)
  };
}

// ── 提示词 ───────────────────────────────────────────────────────────

/** 分镜提示词里的 continuity 字段契约。和上面的归一化逐字对应，改一处要改两处。 */
export function storyboardContinuityInstruction(): string {
  return `
连续性状态（每个镜头必须带一个 continuity 对象，这一段决定成片里人物会不会变脸换装、空间会不会跳变）：
- timelineStage：这一镜属于哪个故事时期，例如「大学时期」「分手三年后」。同一时期的镜头逐字写同一个值，剧情翻篇了才换。
  漏了它，同一个人在回忆段落和当下段落会用同一套外观，观众看不出这是两个时期。
- relationshipId：这一镜属于第几段关系，例如 rel_01、rel_02。脚本里写「男友」而不写第几任时，
  必须靠这个字段把三段恋情区分开——不写，分镜会把三个不同的人写成同一个人，成片里三段恋情长着同一张脸。
- cast：这一镜出现的人物数组（包括在画面里但没有台词的人），每项：
  - characterId：characters.json 里已确认角色的 id。
  - wardrobeId：这一镜用该角色 visual.wardrobe 里的哪一套造型，逐字照抄那一套的 id。
    这里填 id，不要填服装描述——描述每写一次就漂一次，十个镜头会漂出十件不同的衣服。
    剧情没有换装动作时，逐字沿用上一镜的同一个 id。
  - hairstyle：发型状态。没有整理头发的动作就沿用上一镜。
  - screenPosition：人物在画面里的位置，例如「画面左三分之一」。
  - eyeline：视线朝向，例如「看向画面右侧的门」。互为正反打的两镜，视线必须相对，不能同朝一侧。
  - facing：身体朝向。和视线是两回事，可以背对镜头却回头看。
  - movementDirection：这一镜里人物的运动方向，例如「从画面左侧走向右侧」。静止不动填空字符串。
    上一镜从画面右侧出画，下一镜就该从画面左侧入画；写反了观众会以为人物掉头往回走。
  - handProp：手里拿着什么；hand：拿在哪只手，取值 "left"、"right"、"both"、"none"。
  - exited：布尔，本镜结束时这个人是否已经离开这个空间。离场了后面再出现就是穿帮。
- timeOfDay、lightDirection：这一镜的时间段和主光方向。同一场次内两者都不许变，除非这一镜里有开关灯或拉窗帘的动作。
- axisSide："left" 或 "right"，机位在轴线哪一侧；判断不了填 "unset"。同一场次内跳到另一侧且是固定机位，就是越轴。
- endFrame：这一镜结束时定格的画面，一句中文，写清人物位置、朝向和手上的东西。
  下一镜要靠它接住画面，所以写「她坐在沙发左侧，侧脸朝向窗，右手握着杯子」这种可执行的描述，不要写「气氛凝重」。
- reverseShotOf：如果这一镜是某一镜的反打，填那一镜的 id，否则填空字符串。
- previousEndFrame：固定填空字符串。这一栏由系统按上一镜的 endFrame 回填，你写的值会被覆盖。

continuity 不是装饰字段：系统会拿相邻两镜逐项对比，发现「同一场次里衣服换了但没有换装动作」
「人物已经离场却又出现在下一镜」「正反打两镜视线同朝一侧」这类冲突并挡住确认。所以要如实填，不要为了填满而编。`;
}

/**
 * 上一批收尾状态的交接段落。
 *
 * 这段话是分批生成里唯一的接缝。没有它，每一批都在真空里重新编一遍人物状态，
 * 前面所有 continuity 字段在批次边界上一律作废——而批次边界恰恰是跳变最集中的地方。
 */
export function continuityHandoffInstruction(tail: ContinuityTail | null | undefined): string {
  if (!tail) return '';
  const castLines = tail.cast.map((entry) => {
    const parts = [
      entry.wardrobeId && `造型 ${entry.wardrobeId}`,
      entry.hairstyle && `发型「${entry.hairstyle}」`,
      entry.screenPosition && `位于${entry.screenPosition}`,
      entry.eyeline && `视线${entry.eyeline}`,
      entry.facing && `身体${entry.facing}`,
      entry.movementDirection && `运动方向${entry.movementDirection}`,
      entry.handProp && `${entry.hand === 'left' ? '左手' : entry.hand === 'right' ? '右手' : ''}拿着${entry.handProp}`
    ].filter(Boolean);
    return `  - ${entry.characterId}：${parts.length ? parts.join('，') : '状态未标注'}。`;
  });

  const stateLines = [
    tail.timelineStage && `- 故事时期：${tail.timelineStage}。本批如果还在同一时期，timelineStage 逐字沿用这个值。`,
    tail.relationshipId && `- 当前关系：${tail.relationshipId}。本批如果还是这一段关系，relationshipId 逐字沿用这个值。`,
    tail.timeOfDay && `- 时间段：${tail.timeOfDay}。`,
    tail.lightDirection && `- 主光方向：${tail.lightDirection}。`,
    tail.axisSide !== 'unset' && `- 机位在轴线${tail.axisSide === 'left' ? '左' : '右'}侧。`
  ].filter(Boolean);

  return `
上一批的收尾状态（本批必须从这里接着写，不要重新设定人物）：
- 上一批最后一个镜头是 ${tail.shotId || '（未标注 id）'}，属于场景 ${tail.sceneId || '（未标注）'}。
- 它的收尾画面：${tail.endFrame || '（未标注）'}。
  本批第一个镜头如果和它同属一个场景，画面必须从这个状态接上：人物位置、朝向和手上的东西都不能凭空变。
${stateLines.join('\n')}${stateLines.length ? '\n' : ''}${castLines.length ? `- 人物离开上一批时的状态：\n${castLines.join('\n')}\n  这些人的 wardrobeId 和 hairstyle 在本批里逐字沿用，除非本批的剧情里明确有换装或整理头发的动作。\n  凭空换一套造型是本系统最常见的一类事故，代价是整段戏重渲。` : ''}`;
}

// ── 连续性检查 ───────────────────────────────────────────────────────

export type StoryboardContinuityField =
  | 'wardrobe'
  | 'hairstyle'
  | 'exited_cast'
  | 'eyeline'
  | 'screen_direction'
  | 'hand_prop'
  | 'time_light'
  | 'light_direction'
  | 'axis'
  | 'timeline_stage'
  | 'relationship'
  | 'scene_master';

export type StoryboardContinuityIssue = {
  id: string;
  field: StoryboardContinuityField;
  label: string;
  severity: 'error' | 'warning';
  fromShotId: string;
  toShotId: string;
  message: string;
};

/** 这一镜的文字里有没有解释这次变化的动作。有就不报——变化本身不是问题，无来由的变化才是。 */
function explains(shot: ContinuityShot, keywords: string[]): boolean {
  const haystack = [shot.action, shot.visual, shot.dialogue, shot.scriptSegment]
    .map((value) => text(value))
    .join('\n');
  return keywords.some((keyword) => haystack.includes(keyword));
}

function shotLabel(shot: ContinuityShot, fallback: string): string {
  return text(shot.title) || text(shot.id) || fallback;
}

/**
 * 相邻镜头对比。
 *
 * 只报「上一镜是 A、这一镜变成 B、而且这一镜里没有任何动作解释这个变化」的情况。
 * 把所有差异都报出来等于没有告警：每个镜头本来就该有变化。
 */
export function checkStoryboardContinuity(shots: ContinuityShot[]): StoryboardContinuityIssue[] {
  const issues: StoryboardContinuityIssue[] = [];
  const push = (
    field: StoryboardContinuityField,
    label: string,
    severity: StoryboardContinuityIssue['severity'],
    from: ContinuityShot,
    to: ContinuityShot,
    message: string
  ) => {
    issues.push({
      id: `${field}_${text(from.id) || issues.length}_${text(to.id) || issues.length}_${issues.length + 1}`,
      field,
      label,
      severity,
      fromShotId: text(from.id),
      toShotId: text(to.id),
      message
    });
  };

  const byId = new Map(shots.filter((shot) => text(shot.id)).map((shot) => [text(shot.id), shot]));

  // 正反打的视线互斥：跨镜头配对，不依赖相邻关系，单独走一遍。
  for (const shot of shots) {
    const continuity = normalizeShotContinuity(shot.continuity);
    if (!continuity.reverseShotOf) continue;
    const pair = byId.get(continuity.reverseShotOf);
    if (!pair) continue;
    const pairContinuity = normalizeShotContinuity(pair.continuity);
    const here = screenDirection(continuity.cast[0]?.eyeline);
    const there = screenDirection(pairContinuity.cast[0]?.eyeline);
    if ((here === 'left' || here === 'right') && here === there) {
      push('eyeline', '正反打视线', 'error', pair, shot,
        `${shotLabel(pair, '上一镜')} 与 ${shotLabel(shot, '这一镜')} 互为反打，但两镜视线都朝${here === 'left' ? '左' : '右'}。正反打里两人视线必须相对。`);
    }
  }

  // 时期只能往前走。回忆段落要显式换 timelineStage，不能靠倒着退回旧值。
  const stageOrder: string[] = [];
  for (const shot of shots) {
    const stage = normalizeShotContinuity(shot.continuity).timelineStage;
    if (stage && stageOrder[stageOrder.length - 1] !== stage) stageOrder.push(stage);
  }

  for (let index = 1; index < shots.length; index += 1) {
    const from = shots[index - 1];
    const to = shots[index];
    const a = normalizeShotContinuity(from.continuity);
    const b = normalizeShotContinuity(to.continuity);
    const sameScene = Boolean(text(from.sourceSceneId)) && text(from.sourceSceneId) === text(to.sourceSceneId);

    // 同一场次却换了空间母版：这一定是数据错了，不是剧情。
    const masterA = text(from.sceneMasterId);
    const masterB = text(to.sceneMasterId);
    if (sameScene && masterA && masterB && masterA !== masterB) {
      push('scene_master', '场景母版', 'error', from, to,
        `同一场次 ${text(to.sourceSceneId)} 里，场景母版从「${masterA}」变成「${masterB}」。同一场次只能有一个空间。`);
    }

    if (a.timelineStage && b.timelineStage && a.timelineStage !== b.timelineStage) {
      const backwards = stageOrder.indexOf(b.timelineStage) < stageOrder.indexOf(a.timelineStage);
      if (backwards && !explains(to, ['回忆', '闪回', '想起', '多年前', '当年'])) {
        push('timeline_stage', '故事时期', 'warning', from, to,
          `时期从「${a.timelineStage}」退回「${b.timelineStage}」，但这一镜没有回忆或闪回的交代。`);
      }
    }

    if (a.relationshipId && b.relationshipId && a.relationshipId !== b.relationshipId && sameScene) {
      push('relationship', '关系段落', 'error', from, to,
        `同一场次里关系从「${a.relationshipId}」跳到「${b.relationshipId}」。换一段关系必须换场次。`);
    }

    if (sameScene) {
      if (a.timeOfDay && b.timeOfDay && a.timeOfDay !== b.timeOfDay) {
        push('time_light', '时间与光线', 'error', from, to,
          `同一场次内时间从「${a.timeOfDay}」跳到「${b.timeOfDay}」。同一场次的时间段必须一致。`);
      }
      const lightA = screenDirection(a.lightDirection);
      const lightB = screenDirection(b.lightDirection);
      if (lightA !== 'unset' && lightB !== 'unset' && lightA !== lightB
        && !explains(to, ['灯', '窗帘', '拉开', '换机位', '转身'])) {
        push('light_direction', '灯光方向', 'error', from, to,
          `主光方向从「${a.lightDirection}」翻到「${b.lightDirection}」，这一镜没有对应的灯光或机位动作。同一场次里受光面不能翻边。`);
      }
      if (a.axisSide !== 'unset' && b.axisSide !== 'unset' && a.axisSide !== b.axisSide
        && text(to.cameraMove) === '固定') {
        push('axis', '轴线', 'warning', from, to,
          `机位从轴线${a.axisSide === 'left' ? '左' : '右'}侧跳到${b.axisSide === 'left' ? '左' : '右'}侧，中间没有运动镜头过渡，会造成越轴。`);
      }
    }

    const castById = new Map(a.cast.map((entry) => [entry.characterId, entry]));
    for (const cast of b.cast) {
      const before = castById.get(cast.characterId);
      if (!before) continue;

      if (before.exited && !cast.exited && !explains(to, ['回来', '折返', '再次进', '推门', '返回'])) {
        push('exited_cast', '已离场人物', 'error', from, to,
          `${cast.characterId} 在上一镜已经离场，却出现在这一镜里，中间没有回来的动作。`);
      }

      // 换装是本系统最贵的一类事故：一旦漏掉，这一段戏全部要重渲。
      // 所以同场次内判 error，跨场次判 warning——后者可能是合理的剧情换装。
      if (before.wardrobeId && cast.wardrobeId && before.wardrobeId !== cast.wardrobeId
        && !explains(to, ['换', '脱', '披', '穿', '解开'])) {
        push('wardrobe', '服装造型', sameScene ? 'error' : 'warning', from, to,
          sameScene
            ? `${cast.characterId} 的造型在同一场次内从「${before.wardrobeId}」变成「${cast.wardrobeId}」，中间没有换装动作。`
            : `${cast.characterId} 的造型从「${before.wardrobeId}」变成「${cast.wardrobeId}」，剧情里没有交代换装。确认这是有意为之，否则成片里会变成无来由的换衣服。`);
      }

      if (before.hairstyle && cast.hairstyle && before.hairstyle !== cast.hairstyle
        && !explains(to, ['扎', '放下头发', '拨', '整理', '剪'])) {
        push('hairstyle', '发型', sameScene ? 'error' : 'warning', from, to,
          `${cast.characterId} 的发型从「${before.hairstyle}」变成「${cast.hairstyle}」，中间没有对应动作。`);
      }

      if (before.handProp && cast.handProp && before.handProp === cast.handProp
        && before.hand !== 'none' && cast.hand !== 'none' && before.hand !== cast.hand
        && !explains(to, ['换手', '递', '接过', '放下'])) {
        push('hand_prop', '道具持握手', 'error', from, to,
          `「${before.handProp}」从${before.hand === 'left' ? '左手' : '右手'}换到${cast.hand === 'left' ? '左手' : '右手'}，中间没有换手动作。`);
      }

      if (!sameScene) continue;
      // 运动方向翻转：上一镜往右走、这一镜往左走，中间没有转身，观众会以为人物掉头。
      // 这里读的是「去处」而不是「起点」：中文写运动一律把目的地放在最后。
      const moveA = screenDirection(before.movementDirection, 'last');
      const moveB = screenDirection(cast.movementDirection, 'last');
      const flipped = (moveA === 'left' && moveB === 'right') || (moveA === 'right' && moveB === 'left');
      if (flipped && !explains(to, ['转身', '回头', '掉头', '折返', '停下'])) {
        push('screen_direction', '运动方向', 'warning', from, to,
          `${cast.characterId} 的运动方向从「${before.movementDirection}」翻到「${cast.movementDirection}」，中间没有转身或停下的动作。`);
      }
    }
  }

  return issues;
}

// ── 时长 ─────────────────────────────────────────────────────────────

/** 中文普通话语速。和 voiceMode.dialogueWordBudget 用的是同一个数，改要一起改。 */
const CHARS_PER_SECOND = 4.5;

/** 说话之外的进出画和反应时间。没有它，一句十个字的台词会被算成 2.2 秒的镜头，切得太碎。 */
const DIALOGUE_PADDING_SECONDS = 1.2;

/** 多一个动作节拍多给多少秒。 */
const SECONDS_PER_EXTRA_BEAT = 0.8;

/** 景别对时长的影响：特写信息量小，收得快；全景要交代空间，给得多一点。 */
const SHOT_SIZE_FACTOR: Array<{ pattern: RegExp; factor: number }> = [
  { pattern: /大特写|特写/, factor: 0.85 },
  { pattern: /远景|全景/, factor: 1.15 }
];

/** 再短也要让观众看清这是什么。低于这个值的镜头在成片里是闪帧，不是镜头。 */
export const MIN_SHOT_SECONDS = 1.5;

function dialogueSeconds(dialogue: string): number {
  // 只数说出口的字：说话人前缀和标点不占时间，把它们算进去会让镜头系统性偏长。
  const spoken = dialogue
    .split('\n')
    .map((line) => line.replace(/^[^：:]{1,12}[：:]/, ''))
    .join('')
    .replace(/[\s，。！？、；：""''「」『』（）()…—-]/g, '');
  return spoken.length ? spoken.length / CHARS_PER_SECOND + DIALOGUE_PADDING_SECONDS : 0;
}

/**
 * 由戏剧动作决定的镜头时长。
 *
 * 这个函数存在的理由，是「每个镜头一律 15 秒」和「每个镜头一律砍到 5 秒」是同一个错误的两面：
 * 时长本来就该由这一镜要演完的东西决定。一句两个字的台词配 5 秒，画面就得靠模型自己找事做，
 * 找出来的往往是多余的小动作和表情漂移；一句三十个字的台词配 3 秒，话说不完就切走。
 *
 * 上限仍然由 shotPhysics 卡死——那是模型的物理上限，不是创作选择，
 * 所以这里算出来的值一律再过一次 clamp，而不是反过来去顶开上限。
 */
export function dramaticShotDuration(input: {
  dialogue?: unknown;
  action?: unknown;
  visual?: unknown;
  shotSize?: unknown;
  physicsMode?: unknown;
}): number {
  const mode: PhysicsMode = normalizePhysicsMode(input.physicsMode ?? DEFAULT_PHYSICS_MODE);
  const dialogue = text(input.dialogue);
  const speech = dialogueSeconds(dialogue);

  const beats = Math.max(1, countActionBeats(text(input.action) || text(input.visual)));
  const action = targetShotSeconds(mode) + (beats - 1) * SECONDS_PER_EXTRA_BEAT;

  // 台词和动作是并行发生的，取较长的那个，不是相加：人一边说一边做是常态。
  const raw = Math.max(speech, action);
  const factor = SHOT_SIZE_FACTOR.find((entry) => entry.pattern.test(text(input.shotSize)))?.factor ?? 1;
  const scaled = Math.max(MIN_SHOT_SECONDS, raw * factor);

  const capped = dialogue ? clampDialogueShotDuration(scaled, mode) : clampShotDuration(scaled, mode);
  return Math.round(capped * 10) / 10;
}

/**
 * 模型没给时长（或给了个 0、给了个字符串）时才用推导值。
 *
 * 反过来做——一律用推导值覆盖模型——会让分镜彻底失去控制节奏的能力：
 * 导演故意留的三秒静默会被这个函数算成 1.5 秒，而那三秒正是这一镜的全部意义。
 */
export function resolveShotDuration(shot: ContinuityShot, physicsMode?: unknown): number {
  const declared = Number(shot.durationSeconds);
  const mode = normalizePhysicsMode(physicsMode ?? shot.physicsMode);
  if (Number.isFinite(declared) && declared > 0) {
    // 下限在这里也要卡。clampShotDuration 的下限是 1 秒，而 1 秒的片段在成片里是闪帧不是镜头：
    // 模型偶尔会把「快速切一下」写成 0.8 秒，渲出来只有二十几帧，观众根本没看清就过去了。
    const bounded = Math.max(MIN_SHOT_SECONDS, clampShotDuration(declared, mode));
    return Math.round(bounded * 10) / 10;
  }
  return dramaticShotDuration({
    dialogue: shot.dialogue,
    action: shot.action,
    visual: shot.visual,
    shotSize: shot.shotSize,
    physicsMode: mode
  });
}
