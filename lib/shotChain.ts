/**
 * 场次内的镜头续接调度。
 *
 * 问题：一个 15 秒的场次拆成 5 个镜头之后，这 5 个镜头此前是【并发提交】的，
 * 而且每一个都拿【同一张场景主图】当首帧。于是同一场戏的 5 段视频各自从同一个静止画面出发，
 * 各演各的——人物位置在每段开头都被重置回场景图那个姿势，剪在一起就是每 3 秒跳一次。
 *
 * 解法是把「同一场次的镜头」串成一条链：上一镜渲染完成后抽出尾帧，当作下一镜的首帧。
 * 这样做的代价看起来是牺牲并发，其实不是：并发度从「任意 2 个镜头」变成「任意 2 条链」，
 * 同一时刻在跑的渲染数量没变，只是不再允许同一场戏内部乱序。真实项目里场次数远多于 2，
 * 所以总时长基本不变。
 *
 * 这个文件只做纯粹的顺序推演，不碰 DOM、不碰 fetch，方便直接测。
 * 抽帧和提交在 app/page.tsx 里，因为抽帧要用 <video> + canvas。
 */

/** 终态：这一镜不会再变了，链可以往下走。 */
export const CHAIN_TERMINAL_STATUSES = new Set(['completed', 'failed', 'qa_failed']);
const TERMINAL_STATUSES = CHAIN_TERMINAL_STATUSES;

/** 在途：上游正在处理，链必须等。 */
const IN_FLIGHT_STATUSES = new Set(['submitting', 'submitted', 'polling', 'qa_pending']);

export type ShotChain = {
  /** 这条链属于哪个场次。没有 sourceSceneId 的镜头会各自成为一条单元素链。 */
  sceneId: string;
  /** 按镜头顺序排列的 job id。 */
  jobIds: string[];
};

export type ChainJobInput = {
  id: string;
  promptId: string;
};

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function lookup(source: Map<string, string> | Record<string, string> | undefined, key: string): string {
  if (!source || !key) return '';
  if (source instanceof Map) return source.get(key) || '';
  return text(source[key]);
}

/**
 * 把 job 列表按场次分成若干条链，链内保持原有顺序。
 *
 * 顺序直接沿用传进来的 job 顺序，不重排：那个顺序来自 asset_prompts.json 的 prompts 数组，
 * 而它又来自合并后的 storyboard.json——已经是全片时间轴顺序了。在这里再排一次
 * 只会引入第二套顺序，两套一旦不一致，尾帧就会接到错误的镜头上。
 */
export function planShotChains(
  jobs: ChainJobInput[],
  sceneIdByPromptId?: Map<string, string> | Record<string, string>
): ShotChain[] {
  const chains: ShotChain[] = [];
  const byScene = new Map<string, ShotChain>();

  for (const job of jobs) {
    const jobId = text(job.id);
    if (!jobId) continue;
    const sceneId = lookup(sceneIdByPromptId, text(job.promptId));
    // 没有场次归属的镜头自成一条链：把它们并到一起会让不相干的镜头互相等待，
    // 而且会拿上一个镜头的尾帧去接一个完全无关的画面。
    if (!sceneId) {
      chains.push({ sceneId: '', jobIds: [jobId] });
      continue;
    }
    const existing = byScene.get(sceneId);
    if (existing) {
      existing.jobIds.push(jobId);
      continue;
    }
    const chain: ShotChain = { sceneId, jobIds: [jobId] };
    byScene.set(sceneId, chain);
    chains.push(chain);
  }

  return chains;
}

export function chainForJob(chains: ShotChain[], jobId: string): ShotChain | undefined {
  return chains.find((chain) => chain.jobIds.includes(jobId));
}

/** 这一镜在自己那条链里的位置，从 1 开始。找不到返回 0。 */
export function chainPosition(chains: ShotChain[], jobId: string): number {
  const chain = chainForJob(chains, jobId);
  return chain ? chain.jobIds.indexOf(jobId) + 1 : 0;
}

/** 链里紧跟在这一镜后面的那个 job id。已经是最后一镜返回空串。 */
export function nextInChain(chains: ShotChain[], jobId: string): string {
  const chain = chainForJob(chains, jobId);
  if (!chain) return '';
  const index = chain.jobIds.indexOf(jobId);
  return index >= 0 ? chain.jobIds[index + 1] || '' : '';
}

/** 这一镜的前一镜。链首返回空串——链首没有尾帧可接，只能用场景主图。 */
export function previousInChain(chains: ShotChain[], jobId: string): string {
  const chain = chainForJob(chains, jobId);
  if (!chain) return '';
  const index = chain.jobIds.indexOf(jobId);
  return index > 0 ? chain.jobIds[index - 1] : '';
}

/**
 * 现在可以提交哪些镜头。
 *
 * 每条链只挑一个：链内第一个还没提交过、且前面所有镜头都已到终态的那个。
 * 前一镜还在途就等着——尾帧要等它渲完才有。
 *
 * 这一个函数同时覆盖三种入口，不需要各写一套：
 * 首次提交（全部 ready）、页面刷新后续跑（部分 completed）、失败重试（个别回到 ready）。
 * 分别实现的话，三条路里总有一条会忘记「前一镜还在途」这件事，然后并发提交回来。
 */
export function readyChainJobIds(
  chains: ShotChain[],
  statusByJobId: Map<string, string> | Record<string, string>
): string[] {
  const ready: string[] = [];

  for (const chain of chains) {
    for (const jobId of chain.jobIds) {
      const status = lookup(statusByJobId, jobId);
      if (TERMINAL_STATUSES.has(status)) continue;
      // 在途的镜头占住这条链，后面的都要等。
      if (IN_FLIGHT_STATUSES.has(status)) break;
      if (status === 'ready') ready.push(jobId);
      // 不管这一镜是 ready 还是状态读不出来，这条链本轮到此为止：
      // 一条链同一时刻只允许有一个镜头在跑，这正是串起来的意义。
      break;
    }
  }

  return ready;
}

/**
 * 上一镜的尾帧能不能拿来当这一镜的首帧。
 *
 * 三个条件缺一不可，而且都是负面经验换来的：
 * - 必须同属一条链：跨场次接尾帧等于把上一场的房间带进这一场；
 * - 上一镜必须真的渲出了片子：failed 的镜头没有尾帧，qa_failed 的尾帧是坏画面，
 *   拿一张六根手指的尾帧去接下一镜，等于把缺陷复制到整条链的剩余部分；
 * - 这一镜不能是锁脸重渲：那时候要把身份锚点图提到首帧，尾帧上那张脸恰恰已经是错的。
 */
export function canChainFromTail(input: {
  previousStatus?: string;
  previousVideoUrl?: string;
  qaStrategy?: string;
}): boolean {
  if (input.qaStrategy === 'reanchor') return false;
  if (!text(input.previousVideoUrl)) return false;
  return text(input.previousStatus) === 'completed';
}

/**
 * 上游是不是在抱怨我们传的那张内联图片。
 *
 * 尾帧是 data: URI（浏览器抽帧只能拿到 base64，没有可上传的图床），
 * 而中转站认不认 data: URI 是没有文档的。认不出来时的代价必须是「这一镜没接上尾帧」，
 * 而不是「这一镜渲染失败」——和身份参考图字段名那处降级是同一个道理。
 */
export function rejectsInlineFrame(status: number, body: string): boolean {
  if (status !== 400 && status !== 413 && status !== 422) return false;
  return /data:image|base64|image.{0,20}(too large|invalid|unsupported|not supported)|payload too large|unsupported image/i.test(body);
}

/** 降级时给用户的一句话。说清楚丢的是哪一层，以及成片上会看到什么。 */
export function inlineFrameDegradedNote(): string {
  return '视频模型不接受内联的尾帧图片，本批已改用场景主图当首帧提交：'
    + '同一场戏的各个镜头仍然会各自从场景主图开始，动作衔接要靠提示词里的文字描述兜底。';
}
