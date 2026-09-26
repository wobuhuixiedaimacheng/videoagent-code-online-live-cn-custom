import { hasActionVerb } from './shotPhysics';
import { dramaticShotDuration } from './shotContinuity';
import { parseDialogueLines } from './voiceMode';

/**
 * 自动剪辑：在合成之前挑出该删和该缩的镜头。
 *
 * 成片里最刺眼的两类冗余，都是这套流水线自己制造出来的：
 * 1. 重复台词——分镜按场景分批生成，相邻两批常常各自把同一句关键台词写一遍；
 *    每一批单看都合理，拼起来就是同一句话说两遍。
 * 2. 空镜堆积——「一个镜头只装一个动作节拍」这条护栏会让模型用空镜去填时长，
 *    连着三四个没有人物、没有台词的环境镜头，观众感觉片子在原地打转。
 * 还有第三类：镜头时长是按上限给的，而不是按这几秒真要演完的东西给的，
 * 于是每个镜头结尾都挂着一两秒没有信息的余量。
 *
 * 这个模块【只产出决策，不直接删片子】。理由和整个工作台一致：删掉的镜头是花钱渲出来的，
 * 而「这个空镜是废镜还是导演留的呼吸」只有人能判断。所以输出是一份可审查的清单，
 * 由用户决定采纳哪几条——自动执行的版本迟早会删掉某个用户特意留的静默。
 *
 * 这个文件不碰 node:fs，可以直接进客户端 bundle。
 */

export type AutoCutAction = 'keep' | 'drop' | 'trim' | 'flag';

export type AutoCutReason =
  | 'duplicate_dialogue'
  | 'consecutive_empty'
  | 'empty_share'
  | 'overlong_for_content';

export type AutoCutShot = Record<string, unknown> & {
  id?: unknown;
  durationSeconds?: unknown;
};

export type AutoCutDecision = {
  shotId: string;
  /** 在成片里的序号，从 1 开始。审查面板按它定位镜头。 */
  shotNumber: number;
  action: AutoCutAction;
  reason?: AutoCutReason;
  /** 面板上那一行的标题，中文短句。 */
  label: string;
  /** 为什么这么判。写成用户能核对的句子，不是「置信度 0.87」。 */
  detail: string;
  originalDurationSeconds: number;
  /** action 为 trim 时的建议时长；其余情况等于原时长。 */
  durationSeconds: number;
};

export type AutoCutPlan = {
  decisions: AutoCutDecision[];
  /** 采纳全部建议之后的成片时长。 */
  plannedSeconds: number;
  originalSeconds: number;
};

// ── 阈值 ─────────────────────────────────────────────────────────────

/**
 * 空镜占比的告警线。
 *
 * 不设成 0：空镜是正当的剪辑语言，全片一个不留会让片子喘不过气。
 * 四分之一是实测下来「开始显得拖」的位置——再往上，用户的第一反应就是「怎么老在拍空房间」。
 */
export const EMPTY_SHOT_SHARE_LIMIT = 0.25;

/**
 * 超时多少才建议缩。
 *
 * 卡得太紧会把每个镜头都标上「建议缩短 0.3 秒」，那种清单没人会看。
 * 只有超出内容所需 40% 且至少多出 1 秒，才值得占用一行审查位。
 */
const TRIM_RATIO = 1.4;
const TRIM_MIN_GAP_SECONDS = 1;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function positive(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function shotDialogue(shot: AutoCutShot): string {
  return text(shot.dialogue) || text(shot.narration);
}

function shotAction(shot: AutoCutShot): string {
  return text(shot.action) || text(shot.visual);
}

/**
 * 台词的比较键。
 *
 * 说话人要带上：两个角色说同一句「我没事」是对手戏，不是重复。
 * 标点和空白全部去掉：模型在不同批次里对同一句台词的标点处理经常不一致，
 * 带标点比较会让绝大多数真重复漏掉。
 */
/**
 * 短台词不参与重复判定的字数下限。
 *
 * 「嗯」「好」「走吧」「对不起」在一部剧里出现十次是正常的写作，不是生成事故。
 * 卡在 6 个字：到这个长度，两处一字不差地重复几乎只可能是分批生成的产物，
 * 而不是有人特意写的回响——真要回响，台词一定会有变化。
 */
const DEDUPE_MIN_CHARS = 6;

export function dialogueKey(value: unknown): string {
  return parseDialogueLines(value)
    .flatMap((line) => {
      const spoken = line.line.replace(/[\s，。！？、；：""''「」『』（）()…—\-~～]/g, '');
      return spoken.length >= DEDUPE_MIN_CHARS ? [`${line.speaker}:${spoken}`] : [];
    })
    .join('|');
}

/**
 * 这一镜是不是空镜：没有人说话，画面里也没有人物动作。
 *
 * 判据里刻意不看「有没有 characterIds」——有人物但一动不动地站着，
 * 在成片里和空镜是同一个效果，而那种镜头恰恰是模型用来填时长的主力。
 */
/** 描述里明说了这是空镜。有这几个词就不用再靠动词表去猜。 */
const EMPTY_SHOT_PATTERN = /空镜|空景|空荡|空无一人|无人|环境镜|氛围镜|静物|风景/;

export function isEmptyShot(shot: AutoCutShot): boolean {
  if (shotDialogue(shot)) return false;
  const action = shotAction(shot);
  if (!action) return true;
  // 有人物动作就不是空镜。hasActionVerb 用的是和物理护栏同一份动词表，
  // 这里跟着用，避免出现「护栏认为有动作、剪辑认为是空镜」这种自相矛盾。
  if (hasActionVerb(action)) return false;

  // 但光靠「没匹配到动词」判空镜是不够的：那份动词表是为物理护栏挑的，
  // 覆盖不了所有动作，「她拉开窗帘」就一个词都匹配不上。
  // 而误判的方向恰恰是最危险的那个——系统会建议删掉一个真有内容的镜头。
  // 所以要第二个独立信号：画面里根本没有人物，或者描述本身就写明是空镜。
  const characterIds = Array.isArray(shot.characterIds) ? shot.characterIds.filter(Boolean) : [];
  return characterIds.length === 0 || EMPTY_SHOT_PATTERN.test(action);
}

function suggestedSeconds(shot: AutoCutShot): number {
  return dramaticShotDuration({
    dialogue: shotDialogue(shot),
    action: shot.action,
    visual: shot.visual,
    shotSize: shot.shotSize,
    physicsMode: shot.physicsMode
  });
}

function decision(
  shot: AutoCutShot,
  shotNumber: number,
  patch: Partial<AutoCutDecision> & Pick<AutoCutDecision, 'action' | 'label' | 'detail'>
): AutoCutDecision {
  const original = positive(shot.durationSeconds, 3);
  return {
    shotId: text(shot.id) || `shot_${shotNumber}`,
    shotNumber,
    originalDurationSeconds: original,
    durationSeconds: original,
    ...patch
  };
}

/**
 * 跑一遍自动剪辑，返回逐镜决策。
 *
 * 每个镜头最多产出一条决策，而且按严重程度取最重的那一条：
 * 一个既是重复台词又超时的镜头，建议是「删掉」，再给它加一行「建议缩短」纯属噪音。
 */
export function planAutoCut(shots: AutoCutShot[]): AutoCutPlan {
  const list = shots.filter((shot) => shot && typeof shot === 'object');
  const originalSeconds = list.reduce((total, shot) => total + positive(shot.durationSeconds, 3), 0);

  const emptyFlags = list.map(isEmptyShot);
  const emptySeconds = list.reduce(
    (total, shot, index) => total + (emptyFlags[index] ? positive(shot.durationSeconds, 3) : 0),
    0
  );
  const emptyShareTooHigh = originalSeconds > 0 && emptySeconds / originalSeconds > EMPTY_SHOT_SHARE_LIMIT;

  const seenDialogue = new Map<string, number>();
  const decisions: AutoCutDecision[] = [];

  list.forEach((shot, index) => {
    const shotNumber = index + 1;
    const key = dialogueKey(shotDialogue(shot));

    // 1. 重复台词。保留第一次说的那一遍——后面那一遍是分批生成的重复产物，
    //    不是剧作上有意的回响（真要回响，台词会有变化）。
    if (key) {
      const firstSeen = seenDialogue.get(key);
      if (firstSeen) {
        decisions.push(decision(shot, shotNumber, {
          action: 'drop',
          reason: 'duplicate_dialogue',
          label: '重复台词',
          detail: `这一镜的台词和第 ${firstSeen} 镜完全相同。分镜按场景分批生成时，相邻两批常常各自把同一句关键台词写一遍，成片里就是同一句话说两遍。保留先说的那一遍。`
        }));
        return;
      }
      seenDialogue.set(key, shotNumber);
    }

    // 2. 连续空镜。单个空镜是正当的剪辑语言，连着两个就是在原地打转。
    if (emptyFlags[index] && index > 0 && emptyFlags[index - 1]) {
      decisions.push(decision(shot, shotNumber, {
        action: 'drop',
        reason: 'consecutive_empty',
        label: '连续空镜',
        detail: `第 ${shotNumber - 1} 镜和这一镜都没有台词也没有人物动作。连着两个空镜观众会觉得片子停住了，保留前一个就够。`
      }));
      return;
    }

    // 3. 空镜占比过高。这一条不建议删具体某一镜——该删哪几个是创作判断，
    //    但整体比例失衡必须说出来，否则用户只会觉得「片子有点闷」而找不到原因。
    if (emptyFlags[index] && emptyShareTooHigh) {
      decisions.push(decision(shot, shotNumber, {
        action: 'flag',
        reason: 'empty_share',
        label: '空镜偏多',
        detail: `全片空镜合计 ${Math.round(emptySeconds)} 秒，占 ${Math.round((emptySeconds / originalSeconds) * 100)}%，超过 ${Math.round(EMPTY_SHOT_SHARE_LIMIT * 100)}% 的建议上限。这一镜是其中之一，请确认它是不是必要的呼吸。`
      }));
      return;
    }

    // 4. 时长超出内容所需。切点落在动作和台词上，而不是把镜头拉到时长上限。
    const suggested = suggestedSeconds(shot);
    const original = positive(shot.durationSeconds, 3);
    if (original > suggested * TRIM_RATIO && original - suggested >= TRIM_MIN_GAP_SECONDS) {
      decisions.push(decision(shot, shotNumber, {
        action: 'trim',
        reason: 'overlong_for_content',
        label: '结尾有余量',
        detail: `这一镜有 ${original} 秒，但里面的台词和动作只需要约 ${suggested} 秒演完，结尾挂着约 ${Math.round((original - suggested) * 10) / 10} 秒没有信息的余量。建议在动作结束处切。`,
        durationSeconds: suggested
      }));
      return;
    }

    decisions.push(decision(shot, shotNumber, { action: 'keep', label: '保留', detail: '' }));
  });

  const plannedSeconds = decisions.reduce(
    (total, item) => total + (item.action === 'drop' ? 0 : item.durationSeconds),
    0
  );

  return {
    decisions,
    plannedSeconds: Math.round(plannedSeconds * 10) / 10,
    originalSeconds: Math.round(originalSeconds * 10) / 10
  };
}

/** 只要需要用户看一眼的那些。keep 不进审查清单，否则一百个镜头就是一百行。 */
export function actionableAutoCutDecisions(plan: AutoCutPlan): AutoCutDecision[] {
  return plan.decisions.filter((item) => item.action !== 'keep');
}

/** 面板顶上那一句。没有可剪的就明说，不要让用户对着空列表猜是不是坏了。 */
export function autoCutSummary(plan: AutoCutPlan): string {
  const actionable = actionableAutoCutDecisions(plan);
  if (!actionable.length) return '自动剪辑没有发现重复台词、连续空镜或明显的时长余量。';

  const drops = actionable.filter((item) => item.action === 'drop');
  const trims = actionable.filter((item) => item.action === 'trim');
  const flags = actionable.filter((item) => item.action === 'flag');
  const parts = [
    drops.length ? `建议删掉 ${drops.length} 个镜头` : '',
    trims.length ? `缩短 ${trims.length} 个镜头` : '',
    flags.length ? `${flags.length} 个镜头需要你确认` : ''
  ].filter(Boolean);

  const saved = Math.round((plan.originalSeconds - plan.plannedSeconds) * 10) / 10;
  return `${parts.join('、')}。全部采纳后成片从 ${plan.originalSeconds} 秒变成 ${plan.plannedSeconds} 秒，省下 ${saved} 秒。`;
}

export type AutoCutClip = {
  promptId: string;
  shotNumber: number;
  url: string;
  durationSeconds?: number;
};

/**
 * 把决策落到待合成的片段列表上。
 *
 * 只处理 drop 和 trim；flag 一律原样保留——它的语义是「你来看一眼」，
 * 系统替用户做决定就违背了这个模块存在的前提。
 *
 * shotNumber 会重排成连续序号：留着空档会让 validateStitchClips 的重复/缺失检查
 * 报出一堆莫名其妙的错，而那些检查本身是对的，不该为剪辑让路。
 */
export function applyAutoCutToClips(clips: AutoCutClip[], decisions: AutoCutDecision[]): AutoCutClip[] {
  const byShotNumber = new Map(decisions.map((item) => [item.shotNumber, item]));
  return clips
    .filter((clip) => byShotNumber.get(clip.shotNumber)?.action !== 'drop')
    .sort((a, b) => a.shotNumber - b.shotNumber)
    .map((clip, index) => {
      const found = byShotNumber.get(clip.shotNumber);
      return {
        ...clip,
        shotNumber: index + 1,
        durationSeconds: found?.action === 'trim' ? found.durationSeconds : clip.durationSeconds
      };
    });
}
