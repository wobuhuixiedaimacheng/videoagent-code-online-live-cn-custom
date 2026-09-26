import { DEFAULT_PHYSICS_MODE, shotsPerSegment, type PhysicsMode } from './shotPhysics';
import {
  carryStoryboardContinuity,
  continuityHandoffInstruction,
  resolveShotDuration,
  type ContinuityTail
} from './shotContinuity';

/**
 * 分镜按场景分批生成。
 *
 * 起因是实测：3 分钟片子按动作节拍拆成 60 个镜头、每个镜头 12 个字段之后，
 * 一次请求要吐四万多字符，直接撞 max_tokens 触发续写，跑十几分钟仍然降级成兜底模板。
 * 拆成几批小请求之后，每批的产出都稳稳落在单次响应能装下的范围内。
 *
 * 这个文件不碰 node:fs，可以直接进客户端 bundle。
 */

/**
 * 单批的目标镜头数。
 *
 * 定成 10 是实测值，不是拍脑袋：15 个镜头一批时生成本身没问题（15055 字符，远没到上限），
 * 但模型偶尔吐出语法错误的 JSON，自动修复要把整份产出【重新吐一遍】——
 * 15k 字符的重吐直接撞了 AGENT_MODEL_MAX_TOKENS=16000，于是修复本身失败，整批白跑。
 * 所以批次大小要按「修复也装得下」来定，而不是按「生成装得下」。
 */
export const TARGET_SHOTS_PER_BATCH = 10;

export type StageBatch = {
  sceneIds: string[];
  /** 从 1 开始，直接用于「第 2/4 批」这类面向用户的文案。 */
  index: number;
  total: number;
  /**
   * 上一批的收尾状态。分批生成里唯一的接缝：不带上它，每一批都在真空里
   * 重新设定一遍人物造型和走位，批次边界就是成片里变脸换装最集中的地方。
   * 第一批没有上一批，这里是 null。
   */
  continuityTail?: ContinuityTail | null;
};

export type StoryboardShot = Record<string, unknown> & { durationSeconds?: unknown };

/**
 * 按「每批大约多少个镜头」把场景分组。
 * 分组单位是场景不是镜头：同一场景拆出的镜头必须在同一批里生成，
 * 否则模型看不到这一场的其他镜头，接不上动作和景别。
 */
export function planStoryboardBatches(
  sceneIds: string[],
  segmentSeconds: number,
  mode: PhysicsMode = DEFAULT_PHYSICS_MODE
): StageBatch[] {
  const ids = sceneIds.filter((id) => typeof id === 'string' && id);
  if (!ids.length) return [];

  const shotsPerScene = Math.max(1, shotsPerSegment(segmentSeconds, mode));
  const scenesPerBatch = Math.max(1, Math.floor(TARGET_SHOTS_PER_BATCH / shotsPerScene));

  const batches: StageBatch[] = [];
  for (let start = 0; start < ids.length; start += scenesPerBatch) {
    batches.push({ sceneIds: ids.slice(start, start + scenesPerBatch), index: 0, total: 0 });
  }
  return batches.map((batch, position) => ({ ...batch, index: position + 1, total: batches.length }));
}

/**
 * 把各批的镜头按场景原顺序拼起来，重排全片时间轴，并把连续性状态贯通一遍。
 *
 * start/end 一律在这里重算，不采信模型给的值：每批只看得见自己那几个场景，
 * 第 2 批不可能知道自己该从第 45 秒开始，让它猜的结果就是全片时间轴对不上。
 *
 * 连续性也只能在这里贯通：单批之内模型自己能接上，但「上一批的最后一镜」和
 * 「这一批的第一镜」之间那道缝，只有拿到完整有序镜头列表之后才补得上。
 * sceneMasterById 由调用方从已确认的 scenes.json 传进来，用于把空间 id 落到每个镜头上。
 */
export function mergeStoryboardBatches(
  batches: Array<{ sceneIds: string[]; shots: StoryboardShot[] }>,
  orderedSceneIds: string[],
  sceneMasterById?: Map<string, string> | Record<string, string>
): StoryboardShot[] {
  const bySceneId = new Map<string, StoryboardShot[]>();
  const unscoped: StoryboardShot[] = [];

  for (const batch of batches) {
    const allowed = new Set(batch.sceneIds);
    for (const shot of batch.shots || []) {
      const sceneId = typeof shot.sourceSceneId === 'string' ? shot.sourceSceneId : '';
      // 模型偶尔会越界产出别批的场景。按本批声明的范围收口，否则合并后会出现重复镜头。
      if (sceneId && allowed.has(sceneId)) {
        const list = bySceneId.get(sceneId) || [];
        list.push(shot);
        bySceneId.set(sceneId, list);
      } else if (!sceneId) {
        unscoped.push(shot);
      }
    }
  }

  const ordered: StoryboardShot[] = [];
  for (const sceneId of orderedSceneIds) {
    ordered.push(...(bySceneId.get(sceneId) || []));
  }
  // 没写 sourceSceneId 的镜头不能丢：丢了就是用户看不到的静默缺片。
  ordered.push(...unscoped);

  // 先贯通连续性再排时间轴：时长可能由 resolveShotDuration 从戏剧动作推出来，
  // 反过来先排时间轴就会拿一个待定的时长去累计，全片时间轴跟着错。
  const carried = carryStoryboardContinuity(ordered, { sceneMasterById });

  let cursor = 0;
  return carried.map((shot) => {
    const durationSeconds = resolveShotDuration(shot);
    const start = Math.round(cursor * 10) / 10;
    cursor += durationSeconds;
    return { ...shot, durationSeconds, start, end: Math.round(cursor * 10) / 10 };
  });
}

export type TimelineBeat = Record<string, unknown>;

/** 剪辑节拍和镜头一一对应，所以时间轴直接抄合并后的镜头，不再让模型跨批对齐。 */
export function mergeTimelineBatches(
  batches: Array<{ principle?: unknown; beats?: TimelineBeat[] }>,
  mergedShots: StoryboardShot[]
): { principle: string; beats: TimelineBeat[] } {
  const principle =
    batches.map((batch) => batch.principle).find((value) => typeof value === 'string' && value.trim()) ||
    '按镜头顺序推进，开场留人、中段给证明、结尾收束。';

  const beatByShotId = new Map<string, TimelineBeat>();
  for (const batch of batches) {
    for (const beat of batch.beats || []) {
      const sceneId = typeof beat.sceneId === 'string' ? beat.sceneId : '';
      if (sceneId && !beatByShotId.has(sceneId)) beatByShotId.set(sceneId, beat);
    }
  }

  const beats = mergedShots.map((shot, position) => {
    const shotId = typeof shot.id === 'string' ? shot.id : `shot_${position + 1}`;
    const source = beatByShotId.get(shotId) || {};
    // 分镜阶段已经逐镜写了 emotionBeat 和 cameraMove，剪辑说明直接用它们拼，
    // 比让模型再产一份 timeline 既省一次深层嵌套 JSON，也不会和分镜说两套话。
    const derivedNote = [
      typeof shot.title === 'string' && shot.title ? `「${shot.title}」` : '',
      typeof shot.cameraMove === 'string' && shot.cameraMove ? `${shot.cameraMove}` : '',
      typeof shot.emotionBeat === 'string' && shot.emotionBeat ? shot.emotionBeat : ''
    ].filter(Boolean).join(' · ');
    return {
      ...source,
      id: `beat_${String(position + 1).padStart(2, '0')}`,
      sceneId: shotId,
      start: shot.start,
      end: shot.end,
      role: typeof source.role === 'string' && source.role ? source.role : position === 0 ? 'hook' : 'body',
      pacing: typeof source.pacing === 'string' && source.pacing ? source.pacing : 'steady',
      editNote:
        typeof source.editNote === 'string' && source.editNote
          ? source.editNote
          : derivedNote || '按镜头动作节拍切入切出。'
    };
  });

  return { principle: String(principle), beats };
}

/**
 * 进 prompt 的那一段：告诉模型本轮只负责哪几个场景，并且不要产 timeline.json。
 *
 * 不产 timeline 不是为了省 token，是实测两次都挂在同一个地方：模型在 timeline.json 的
 * after 那个「JSON 字符串里套 JSON」的深层嵌套收尾时，稳定多吐一个 `}`，整批因非法 JSON 作废
 * （12714 字符那次和 15055 字符那次都一样，所以不是体积问题）。
 * 剪辑节拍本来就和镜头一一对应、start/end 也由 mergeTimelineBatches 重算，让模型再产一遍纯属自找麻烦。
 * 注意只能靠提示词说，不能收窄 requestedOutputFiles——服务端要求它和阶段配置逐项相等。
 */
export function storyboardBatchInstruction(batch: StageBatch | undefined): string {
  if (!batch || !batch.sceneIds.length) return '';
  return `
本轮是分镜的第 ${batch.index}/${batch.total} 批，只负责这些场景：${batch.sceneIds.join('、')}。
storyboard.json 的 scenes 数组里只放这些场景拆出的镜头，一个别的场景都不要带上——
带上了会和其他批次重复，合并时被丢弃，等于白写。
本轮不要产出 timeline.json：剪辑节拍和镜头一一对应，由系统在合并时按最终镜头顺序生成。
start 和 end 只需在本批内从 0 开始累计，全片时间轴由系统在合并时统一重排，不用你跨批对齐。
${continuityHandoffInstruction(batch.continuityTail)}`;
}
