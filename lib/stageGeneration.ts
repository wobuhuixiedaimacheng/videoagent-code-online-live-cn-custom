import type { PatchOperation, ProductionStageId, StageRequestMode, StageRequestTarget, WorkflowKind, WorkspaceSnapshot } from './types';
import { PHYSICS_MODES, physicsGuardrailInstruction, scriptConstraintInstruction, targetShotSeconds } from './shotPhysics';
import { storyboardBatchInstruction, type StageBatch } from './storyboardBatch';
import { storyboardContinuityInstruction } from './shotContinuity';
import { STYLE_BOOK_PATH } from './styleBook';
import { QA_LEDGER_PATH } from './qaLedger';
import { CANVAS_NOTES_PATH } from './canvasBoards';
import {
  dialogueAssetPromptInstruction,
  dialogueScriptInstruction,
  dialogueStoryboardInstruction
} from './voiceMode';

export type StageGenerationConfig = {
  workflow: WorkflowKind;
  outputFiles: string[];
};

const STAGE_CONFIG = {
  script: { workflow: 'script', outputFiles: ['brief.json', 'campaign_goal.json', 'script.md'] },
  character: { workflow: 'prompt', outputFiles: ['characters.json'] },
  scene: { workflow: 'scene', outputFiles: ['scenes.json'] },
  storyboard: { workflow: 'shot', outputFiles: ['storyboard.json', 'timeline.json'] },
  video: { workflow: 'motion_director', outputFiles: ['asset_prompts.json', 'video_spec.json'] }
} as const;

// 只放上游「产物」。assertStageSourceVersions 要求这里每个文件都存在且版本对得上，
// 而风格是可选配置（可以一个都没选），所以 style.json 不进这张表，只进 prompt 上下文。
const STAGE_SOURCE_FILES: Record<ProductionStageId, string[]> = {
  script: [],
  character: ['script.md'],
  scene: ['script.md', 'characters.json'],
  storyboard: ['script.md', 'characters.json', 'scenes.json'],
  video: ['script.md', 'characters.json', 'scenes.json', 'storyboard.json']
};

// 不含 style.json：剧本阶段产出文字，视觉风格对它没有约束力。
const SCRIPT_PROMPT_CONTEXT_FILES = [
  'brief.json',
  'script.md',
  'campaign_goal.json',
  'profile.json',
  '.aigc/MEMORY.md',
  'platform_rules.json',
  'viral_refs.json',
  'asset_library.json',
  'feedback_report.json',
  // 质检账本必须出现在脚本阶段的上下文里，否则打回记录就只是一份没人看的日志。
  QA_LEDGER_PATH,
  // 用户标记为「参与生成」的画布便签。它是人直接写下的要求，不该只停在界面上。
  CANVAS_NOTES_PATH
];

export function stageSourceFiles(stage: ProductionStageId): string[] {
  return [...STAGE_SOURCE_FILES[stage]];
}

export function stagePromptContextFiles(stage: ProductionStageId): string[] {
  /*
   * 风格和画布便签只影响可见的上下文，不参与 sourceVersions 的存在性与版本校验。
   *
   * 这一层区分是整套设计的关键：「影响生成」和「是生产资产」是两件事。
   * 便签能改变模型看到什么，但改一条便签不该把已经确认的下游标成「需重做」——
   * 那是 script.md 这类真上游才有的权力。
   */
  return stage === 'script'
    ? [...SCRIPT_PROMPT_CONTEXT_FILES]
    : [...stageSourceFiles(stage), STYLE_BOOK_PATH, CANVAS_NOTES_PATH];
}

export function stageConfig(stage: ProductionStageId): StageGenerationConfig {
  const config = STAGE_CONFIG[stage];
  return { workflow: config.workflow, outputFiles: [...config.outputFiles] };
}

export function stageOutputFilesForRequest(stage: ProductionStageId, mode: StageRequestMode = 'initial'): string[] {
  if (stage === 'script' && mode !== 'initial') return ['script.md'];
  return stageConfig(stage).outputFiles;
}

export function stageOutputFilesForWorkspace(
  stage: ProductionStageId,
  mode: StageRequestMode,
  workspace: WorkspaceSnapshot,
  target: StageRequestTarget = 'artifact'
): string[] {
  const scoped = stageOutputFilesForRequest(stage, mode);
  if (stage !== 'script' || mode === 'initial') return scoped;
  if (target === 'stage') return stageConfig(stage).outputFiles;

  const committedFiles = new Set(workspace.files.map((file) => file.path));
  return committedFiles.has('brief.json') && committedFiles.has('campaign_goal.json')
    ? scoped
    : stageConfig(stage).outputFiles;
}

export function allowedStageOutputFiles(stage: ProductionStageId, requestedOutputFiles?: string[]): string[] {
  const configured = stageConfig(stage).outputFiles;
  if (!Array.isArray(requestedOutputFiles)) return configured;
  const requested = new Set(requestedOutputFiles);
  return configured.filter((filePath) => requested.has(filePath));
}

export function sourceVersionsForStage(workspace: WorkspaceSnapshot, stage: ProductionStageId): Record<string, number> {
  const sourceFiles = new Set(stageSourceFiles(stage));
  return Object.fromEntries(
    workspace.files
      .filter((file) => sourceFiles.has(file.path))
      .map((file) => [file.path, file.version])
  );
}

/**
 * 规格是以 JSON 文本形式传进来的，而脚本阶段要靠里面的小节参数算镜头预算。
 * 解析失败一律回落到默认值，不抛错：规格读不出来的代价是约束段落用默认数字，
 * 而抛错的代价是整个脚本阶段跑不动——后者严重得多。
 */
function segmentPlanFromSpecText(videoSpecText: string): { segmentSeconds: number; segmentCount: number } {
  const fallback = { segmentSeconds: 15, segmentCount: 12 };
  try {
    const spec = JSON.parse(videoSpecText) as Record<string, unknown>;
    const seconds = Number(spec.episodeSegmentSeconds);
    const count = Number(spec.episodeSegmentCount);
    return {
      segmentSeconds: Number.isFinite(seconds) && seconds > 0 ? seconds : fallback.segmentSeconds,
      segmentCount: Number.isFinite(count) && count > 0 ? count : fallback.segmentCount
    };
  } catch {
    return fallback;
  }
}

export function stageGenerationInstruction(
  stage: ProductionStageId,
  videoSpecText: string,
  requestedOutputFiles?: string[],
  batch?: StageBatch
): string {
  const outputFiles = allowedStageOutputFiles(stage, requestedOutputFiles);
  const outputRule = outputFiles.length
    ? `只允许提交 ${outputFiles.join('、')} 的完整文件 patch`
    : '本次请求没有获准写入的文件，不得提交任何文件 patch';
  const common = `\n阶段隔离规则：本次 productionStage 固定为 ${stage}。${outputRule}；不得通过按钮文案、用户措辞或其他线索推断或切换阶段，也不得补齐其他制作包文件。`;

  if (stage === 'character') {
    // 字段名必须和 agentProvider 的 hasCharacters 校验一一对应。漏任何一个，
    // 模型按剧本写出来的角色会被整份丢弃、替换成通用模板，用户只会看到一份和剧情无关的设定。
    return `${common}
characters.json 必须是 JSON 对象，顶层只有 characters 一个数组。
覆盖范围：脚本里每一个有台词、有出镜或被明确描写的人物都必须各占一个角色对象，一个都不能漏。第一人称脚本里的「我」「我们」同样是人物，而且通常就是主角——不要因为正文只描写别人就把叙述者跳过。双人关系题材（恋爱、闺蜜、师徒、搭档等）至少要有两个角色对象。角色的 name 逐字照抄脚本人物设定里给出的姓名，不要改写、不要加括号注释，也不要换回「前任A」这类代号——名字对不上，脚本人物和角色资产就没法互相核对，界面会报「脚本里声明了但角色阶段没产出」。
脚本没给姓名、只写了「前任A」「便利店店员」「男主」这类称呼或标签时，你随机起一个具体的中文姓名（姓＋名，例如「周叙」「苏晚」「林岩」），不要沿用称呼，也不要用「我」「他」「叙述者」这类代词——称呼和代词都没法当角色名贯穿全片。随机起的名字要和本片其他角色明显区分（不同姓、不同音），并和这个角色的性别、年龄、身份相称。
名字是你起的，就必须在同一个角色对象里填 scriptAlias：逐字照抄脚本里对这个人的原始称呼（「前任A」「便利店店员」）。这是脚本人物和角色资产之间唯一的对照线索——不填，人物名册核对会同时报出两条互相矛盾的警告：「前任A」被当成漏做的角色，「周叙」被当成脚本里没有的人。脚本已经给了姓名时，scriptAlias 填空字符串。主要人物作为必需角色，required 填 true；数组里至少要有一个必需角色。
每个角色对象必须包含下列全部字段，且都不能为空：
- id：英文小写加下划线的短 id，例如 lead_01。
- name：角色中文姓名。脚本给了就照抄，没给就按上面的规则随机起一个并填 scriptAlias。
- role：角色定位，例如 主角、女主、配角。
- required：布尔值，主要角色为 true。
- description：这个角色在本片里的作用和性格，中文。
- variants：非空数组，按脚本里真实出现的年龄或阶段拆分。每个变体必须有 id、label、ageLabel、wardrobe、primaryImagePrompt 五个非空字段，另加一个 primaryImageUrl 且固定为空字符串——主图由后续图片生成阶段回填，不要编造图片地址。
- faceAnchorVariantId：必须等于 variants 里某个变体的 id，作为 Face ID 锚点。
- referenceStrategy：只能是 face_id、multi_view、replace_reference 三者之一。
- faceIdStrategy：一句中文，说明这张脸怎么复用到其他变体和镜头。
- expressionIds：非空数组，取值只能从 喜悦、愤怒、悲伤、恐惧、惊讶、厌恶、害羞、紧张、疑惑、尴尬、期待、平静 里选。
- expressionRange：中文表情范围说明。
- consistencyPrompt：中文一致性提示词，锁定脸型、发型、肤色、体态和眼神。
- imagePrompt：角色主图的中文提示词。
- negativePrompt：中文避免项。
以上任何一个字段缺失或为空，整份 characters.json 都会被判为不合格并替换成通用模板，你针对这个剧本写的角色设定会全部作废。宁可写得朴素，也必须每个字段都填上。

每个角色还必须带一个 visual 对象，它是角色视觉设定画板的数据来源，用户要在画板上逐项审查。没有它，用户进去看到的是一张空表，只能自己手填几十个字段。
visual 不参与上面那条「整份文件作废」的判定（少写它不会让你其他角色设定白写），但请当成必写项：全部用中文，且写到可执行的精度——发型要写成「自然黑色、锁骨下 8cm、中等发量、顺直、四六侧分、无刘海」，不能写「黑色长发」。
所有字段都从剧本里的这个人推出来，剧本没交代的就留空字符串，不要编：编出来的设定看着很确定，其实和剧情无关，比留空更糟。结构如下：
- tagline：一句话定位；tags：2–3 个核心标签数组。
- identity：固定身份特征，不随场景改变。字段 gender、faceShape、boneStructure、forehead、brow、eyes、nose、lips、skinTone、height、bodyType、posture、permanentMarks。
  其中 gender（性别呈现，例如「男性」「女性」）必须为每个角色显式写出，一个都不能省。剧本的人物设定小节里写了性别的，逐字照抄，不要另行发挥；老脚本没写、只有「陈女士第一段恋爱的对象」这种称呼时，才根据剧情关系推断并写死。漏了这一条，后面的图片模型会拿描述里出现的其他人名去猜性别：男配角的描述里出现女主角的名字，生成出来就是个女的，整条角色线从第一张图就错了。
- hair：color、length、texture、volume、hairline、part、bangs、baseStyle，外加 variableStyles 和 forbiddenStyles 两个数组。
- wardrobe：按剧情分的造型数组，不要只给一套衣服。每套含 id、label（如 日常通勤、约会、居家、情绪低谷、重要冲突、结尾状态）、sceneUsage、top、bottom、outerwear、shoes、accessories、hairChange、makeup、palette（颜色数组）、silhouette、mustKeep、forbidden。
- expressions：数组，id 从 neutral、slight_smile、laugh、awkward、suppressed、sad、angry、relieved 里取，每项含 intensity（1–5 的数字）、brow、gaze、mouth、sceneUsage。
- shooting：allowFrontFace、allowFullBody、voiceOnly（布尔），cameraAngles、shotSizes、identityAnchors、driftBans（数组）。
- signature：silhouette、primaryColor、props（数组）、faceVisibilityRule。同一部片里的不同角色，signature 必须彼此拉开——脸型、头型发型、体态、主服装色和标志性道具不要写成雷同的，否则观众在背影和远景里分不出谁是谁。特别注意几个只出背影或只有声音的配角：他们的区分度全靠头型、肩线、主色和道具，写雷同了成片里就是同一个人反复出现。
visual 里的所有图片字段一律留空字符串，不要编造图片地址。`;
  }
  if (stage === 'scene') {
    // 前 11 个字段对应 agentProvider 的 hasSceneDraft；subtitle 和 durationSeconds 是分镜阶段的硬依赖：
    // storyboardFor 里 isConfirmedStoryboardSource 不过就直接抛错，整个分镜请求会 500，不是降级成模板。
    const scenePlan = segmentPlanFromSpecText(videoSpecText);
    return `${common}
scenes.json 必须是 JSON 对象，顶层有两个数组：sceneMasters（场景母版）和 scenes（场次状态）。这是一对多关系，不是同一个东西。

【为什么要分两层】同一个客厅会在不同时间、不同剧情下反复出现。空间本身写一次，放进 sceneMasters；每次出现的差异写进 scenes。
把空间描述抄进每一个场次，会让同一个客厅出现十几份互相矛盾的描述，成片里就是十几个长得有点像的房间。

数量和时长：本片按 ${scenePlan.segmentCount} 个小节 × ${scenePlan.segmentSeconds} 秒设计，所以场次数应当接近 ${scenePlan.segmentCount} 个，每个场次的 durationSeconds 在 ${scenePlan.segmentSeconds} 秒上下，全片时长合计约 ${scenePlan.segmentSeconds * scenePlan.segmentCount} 秒。
场次是【叙事单位】，不是渲染单位——不需要为了迁就模型的单镜头时长上限把场次切碎，下一步的分镜阶段会把每个场次再拆成若干个镜头。
一个场次对应一个连续的地点和时间段；地点或时间变了就是新场次，同一地点里的机位和景别变化不算。
反过来，两个场次发生在同一个地点时，它们必须引用同一个 sceneMasters 条目，不要为它们各建一份母版。

一、sceneMasters 每个母版对象包含：
- id：英文小写加下划线的短 id，例如 scene_master_livingroom。
- identity：{ name（场景中文名）、code（编号如 S-01）、spaceKind（只能是 "interior" 或 "exterior"）、accessKind（只能是 "public" 或 "private"）、owner（所属人物，无主人填空串）、geoCulture（地理与文化背景）、purpose（空间用途）、tagline（一句话视觉定位）}。
- structure：{ area（面积与尺度感）、layout（平面布局）、ceilingHeight（层高）、doors（门的位置和开启方向）、windows（窗户数量、位置和朝向）、entries（人物入口与出口）、activeZones（可活动区域）、sightlines（主要视线方向）、depthLayers（前景/中景/背景关系）}。
- art：{ wall、floor、ceiling、doorWindowStyle、fixedFurniture（固定家具）、fixedLighting（固定灯具）、fixedDecor（固定装饰）、signatureProps（标志性道具）、palette（空间主色盘，字符串数组）、materials（材质关键词，字符串数组）、age（新旧程度）、tidiness（整洁程度）、livingTraces（空间生活痕迹）}。
- anchors：3 到 6 条空间身份锚点，每条是 { id、text、locked: false }。
  text 必须是可验证的位置关系句，例如「落地窗位于沙发右后方」「木质矮柜上固定摆放白色花瓶」「入口位于画面左侧」。
  「高级感」「温馨」「电影感」「压抑」这类形容词不是锚点，写了等于没写——模型无法据此判断画错了没有。
- views：固定写 { "panorama": "", "front": "", "reverse": "", "left": "", "right": "", "top": "", "detail": "", "empty": "" }，全部空字符串。参考图由后续图片生成阶段回填，不要编造图片地址。

二、scenes 每个场次对象必须包含下列全部字段，且都不能为空：
- id：英文小写加下划线的短 id，例如 scene_01，按顺序编号。
- sceneMasterId：这一场发生在哪个母版里，逐字照抄那个母版的 id。同一地点的多个场次必须填同一个值。
- title：场次中文标题，建议写成「地点·状态」，例如「小澄家客厅·争吵后」。
- visual：这个场次画面上发生什么，中文。
- location：地点，与所属母版的 identity.name 一致。
- timeOfDay：时间，例如 清晨、傍晚、夜里。
- lighting：光线描述。
- palette：色彩基调。
- characterIds：非空数组，元素必须是 characters.json 里已确认角色的 id，不能凭空造新角色。
- scriptSegment：这个场次对应的脚本原文段落。
- mainImagePrompt：场次主图的中文提示词。只写这一场的状态差异，空间本身交给母版，不要重复描述墙面家具。
- prompt：给图像/视频模型的完整中文提示词。
- subtitle：这个场次的字幕意图，中文。
- durationSeconds：正数，这个场次的时长（秒）。
另外每个场次带一个 referenceImageUrl 且固定为空字符串。

三、scenes 每个场次还要带一个 instance 对象，装「这一场和母版有什么不同」：
- instance.story：{ episode、sceneNumber、storyTime、scriptPosition、goal（场次目标）、conflict（核心冲突）、emotionStart（情绪起点）、emotionEnd（情绪终点）、mustConvey（本场必须传达的信息）}。
- instance.environment：{ date、season、timeOfDay、weather、temperature（室内外温度感）、air（空气状态）、tidiness（空间整洁度）、usedBefore（是否有人使用过）、storyChange（剧情造成的环境变化）}。
- instance.lighting：{ keySource（主光来源）、keyDirection（主光方向）、colorTemperature（色温）、contrastRange（明暗关系）、contrast（对比度）、ambient（环境光）、practicals（实景灯光）、windowLight（窗外光线）、shadowDirection（阴影方向）、effects（字符串数组，如 雾气、逆光、灰尘颗粒，没有就空数组）}。
  keyDirection 必须和母版 structure.windows 里写的窗户方位对得上。窗在右后方、主光却从左前来，是会被系统判为冲突的硬错误。
- instance.fixtures：{ doors（门窗开关状态）、windows（窗帘状态）、lights（灯具开关状态）、furnitureMoved（家具是否移动）、inherited（需要继承到下一场的变化）}。
- instance.props：数组，本场道具。每条 { id、name、origin（"instance" 表示本场新增，"master" 表示母版固定项被挪动）、startPosition（初始位置）、endPosition（结束位置）、moved（布尔）、damaged（破损，没有填空串）、consumable（食物饮料状态）、inherit（布尔，这条变化要不要继承到下一场）}。
- instance.blocking：数组，出场人物的调度，每个出场角色一条。{ characterId（必须是 characters.json 里的 id）、start 和 end（都是 { x, y }，0–100 的俯视图相对坐标，x 向右、y 向下）、enterFrom（入场方向）、exitTo（离场方向）、path（行走路线）、stance（站位与坐姿）、facing（面向方向）、spacing（人物间距离）、furnitureInteraction、propInteraction、beats（动作关键节点，字符串数组）、dominant（布尔，是否处于视觉主导位置）、occluded（是否发生遮挡）、mirrorRisk（镜面或反射穿帮风险）}。
  场景不是空背景，人物和空间的关系必须写出来。
- instance.sound：{ roomTone（环境底噪）、reverb（空间混响）、outdoor、distant、bodyFoley（角色动作声）、propFoley（道具声音）、accent（剧情强调音）、music（是否使用音乐）、silence（是否需要刻意留白或静默）、voiceOver（画外音来源和方向）}。
- instance.shots：数组，这个场次拆出的镜头。镜头只描述拍摄方式，绝对不要在镜头里再写一遍空间长什么样——空间由母版负责。
  每条 { id、code（如 SH-01）、line（对应台词或剧情动作）、shotSize（景别）、cameraAngle（拍摄角度）、cameraPosition（摄像机位置）、cameraHeight（摄像机高度）、cameraDirection（镜头方向）、lens（焦段或透视感）、cameraMove（只能是 static、push_in、pull_out、truck、follow、pan、handheld、orbit 之一，分别是 固定/推进/拉远/横移/跟随/摇镜/手持/环绕）、composition（构图方式）、foreground、midground、background、focalPoint（画面视觉中心）、subjectPlacement（人物画面位置）、subjectGaze（人物视线方向）、depthOfField（景深）、durationSeconds（正数）、openFrame（起始画面）、endFrame（结束画面）、action（这一镜发生的动作）}。
  每条镜头再带一个 continuity 对象，用于自动连续性检查：{ characters（数组，每项 { characterId、present（布尔）、exited（布尔，本镜结束时是否已离场）、position、facing、gaze、handProp（手里拿着什么）、hand（"left"/"right"/"both"/"none"）、wardrobe、hairstyle }）、props（数组，每项 { name、position、count（数字）、level（饮料液面：满/半/空）}）、doorState、windowState、lightState、furniture、decor、damage、timeOfDay、axisSide（"left" 或 "right"，机位在轴线哪一侧）、reverseShotOf（如果这一镜是某镜的反打，填那一镜的 id，否则空串）}。
  continuity 不是装饰字段：系统会拿相邻两镜对比，发现「杯子上一镜在右手、这一镜在左手且没有换手动作」「门上一镜关着、这一镜开着但没人开门」「同一场次里时间从白天跳到夜晚」这类冲突并挡住确认。所以状态要如实填，动作要写清楚。

以上 scenes 数组里 sceneMasterId 之前列出的 13 个字段任何一个缺失或为空，整份 scenes.json 都会被判为不合格并替换成通用模板；其中 subtitle 和 durationSeconds 缺失还会让下一步的分镜阶段直接报错，所以一个都不能省。
sceneMasters 和 instance 写得越完整，后面出图和出视频时空间漂移越少；写不出来的字段填空字符串，不要编造，也不要用形容词凑数。`;
  }
  if (stage === 'video') {
    // hasVideoTaskPackage 在 video 阶段卡得最死：两个数组的长度必须精确等于已确认镜头数，
    // 且每条 prompt 的 type 必须是 'video'。条数对不上就整份作废，所以这里必须把规则说明白。
    return `${common}
只使用已确认的 script.md、characters.json、scenes.json、storyboard.json 及请求携带的 sourceVersions，不得重写上游资产，也不得新增上游没有的镜头。当前视频规格：${videoSpecText || '未提供，使用请求中的规格。'}

asset_prompts.json 必须是 JSON 对象，且满足下面三条硬要求，任何一条不满足整份文件都会被替换成通用模板：
1. prompts 数组的条数，必须精确等于已确认 storyboard.json 的镜头数（storyboard.json 为空时才用 scenes.json 的场景数）。不能多，不能少，不能合并镜头。
2. renderQueue 数组的条数必须和 prompts 完全相同，并按相同顺序一一对应。
3. 每一条 prompt 的 type 字段必须是字符串 "video"，本阶段不允许出现 "image"。

各字段要求：
- prompts 每条包含：id（如 prompt_01，按顺序补零）、sceneId（对应镜头 id）、sourceSceneId、type（固定 "video"）、renderTask（这个镜头的任务名，中文）、durationSeconds（正数，取自对应镜头）、physicsMode（逐字照抄已确认 storyboard.json 里同一 sceneId 的 physicsMode，只能是 ${PHYSICS_MODES.join('、')} 之一）、prompt（完整中文提示词，只写画面、动作、运镜和声音氛围）、negativePrompt（这个镜头的中文避免项）。
- sceneId 和 sourceSceneId 是两个不同的东西，不要写成一样：sceneId 是 storyboard.json 里那个【镜头】的 id，sourceSceneId 逐字照抄同一个镜头对象的 sourceSceneId 字段，指向它所属的【场景】。
  场景参考图是按 sourceSceneId 找的。这个字段漏了或写成镜头 id，这条镜头就找不到场景图，只能退化成用人物头像去生成，画面里的环境会整个丢失。上游镜头没有 sourceSceneId 时（老的制作包），照抄 sceneId 即可。
- physicsMode 不是装饰字段，它决定这个镜头的画面质检用什么判据：realistic 会卡重力、光影和受力，stylized 放行夸张的力量和位移但仍然卡手指和穿模，surreal 只卡人物一致性。抄错会导致爽点镜头被判成崩坏并重渲，或者真正的崩坏被放行。上游镜头没写这个字段时填 "realistic"，不要自己发挥。
- 单镜头单动作：prompt 里只描写一个连续动作，不要写「一边……一边……」这类复合动作；上游镜头描述里如果有，拆成主动作保留、次要动作删掉。
- prompt 里绝对不能写字幕意图、标题文案、屏幕文字或任何要求画面显示文字的内容。视频模型渲染不出可读汉字，写进去只会在画面上变成乱码；字幕一律由后期添加。相反要明确写出「画面内不出现任何文字，招牌菜单包装一律无字或虚化」。
${dialogueAssetPromptInstruction()}
- renderQueue 每条包含：id（如 render_01）、sceneId（与 prompts 同序对应）、status（固定 "prompt_ready"）、requiresApproval（true）。
- characterConsistency：对象，必须包含 consistencyPrompt 和 negativePrompt 两个非空中文字符串，直接沿用已确认 characters.json 里主角色的对应字段，不要另写一套。

video_spec.json 也必须一并提交，内容就是上面「当前视频规格」的完整 JSON 对象，字段包括 provider、platform、generationMode、aspectRatio、resolutionTier、sizeHint、numFrames、frameRate、estimatedClipDurationSeconds、episodeSegmentSeconds、episodeSegmentCount 和 rule。规格由请求给定，你只负责原样落成文件，不要自行改数值。`;
  }
  if (stage === 'storyboard') {
    // durationSeconds 是 hasStoryboardDraft 唯一的硬校验；其余字段是视频阶段和剪辑面板要读的，
    // 缺了不会当场判不合格，但会在下一阶段变成空白提示词。
    return `${common}${storyboardBatchInstruction(batch)}
storyboard.json 和 timeline.json 必须只从已确认的脚本、角色和场景继续拆解，不得新增上游没有的情节或角色。

storyboard.json：JSON 对象，顶层只有 scenes 一个非空数组。这个数组装的是【镜头】，不是场景。

镜头数和场景数不是一一对应的——这是本阶段最重要的一条。一个场景通常装不进一个镜头：
单镜头有硬性时长上限（见下面的物理护栏），超过上限的场景必须拆成多个镜头，
所以镜头总数一般明显大于场景数。把一个 15 秒的场景原样写成一个 15 秒的镜头，
等于这一阶段什么也没做——那不是分镜，只是把场景改了个名字。

拆分规则：按【动作节拍】拆，不是按时长上限凑数。
一个镜头只装一个动作节拍：人物做完一个动作、或景别/机位发生一次变化，就该切下一个镜头。
目标单镜头时长 ${targetShotSeconds('realistic')} 秒左右（stylized ${targetShotSeconds('stylized')} 秒、surreal ${targetShotSeconds('surreal')} 秒），
所以每个场景大致拆成 ceil(场景时长 ÷ 目标时长) 个镜头，一个 15 秒场景通常是 5 个镜头而不是 3 个。
任何一个镜头都不得超过下面物理护栏给出的时长上限，但「不超上限」不等于「拆得够细」：
一个镜头里出现两个以上动作（例如「她转身、走到窗边、拉开窗帘」），就是没拆完，必须继续切。
同一场景拆出来的这些镜头，durationSeconds 之和必须等于原场景的时长。

每个镜头对象必须包含：
- id：全片唯一，用「场景 id + 镜头序号」的形式，例如 scene_01_shot_01、scene_01_shot_02。不要复用场景 id，否则同一场景拆出的镜头会互相覆盖。
- sourceSceneId：这个镜头来自 scenes.json 里的哪个场景，逐字照抄那个场景的 id。
  这个字段是镜头找回场景参考图的唯一依据，漏了或写错，这个镜头会退化成没有场景、只有人物的画面。
- title：镜头中文标题。同一场景拆出的多个镜头要有各自的标题，不要全部复用场景标题。
- durationSeconds：必须是大于 0 的数字。这一条是硬校验，任何一个镜头缺失或写成 0、字符串，整份 storyboard.json 都会被替换成通用模板。
- start 和 end：数字，单位秒，按全片时间轴累计连续（不是每个场景各自从 0 开始），end - start 应等于 durationSeconds。
- visual：这个镜头的画面内容，中文。同一场景拆出的镜头，visual 必须各写各的——写成同一段等于没拆。
- subtitle：字幕意图，中文。
- scriptSegment：对应的脚本原文段落。同一场景拆出的多个镜头可以引用同一段原文。
- physicsMode：只能是 ${PHYSICS_MODES.join('、')} 之一，含义见下面的物理可行性护栏。缺省会被当成 realistic 处理。

下面这七个字段是分镜审查面板逐栏显示的内容，漏一个用户那边就是一栏「未标注」，
只能自己去猜这个镜头到底怎么拍。它们不参与「整份作废」的判定，但请当成必写项：
- characterIds：字符串数组，这一镜出现的角色，元素必须是 characters.json 里已确认角色的 id。画面里没有人物时给空数组，不要省略这个字段。
- shotSize：景别，中文，取值用 远景、全景、中景、中近景、近景、特写、大特写 之一。一个镜头只有一个景别——景别变了就是下一个镜头。
  这一栏会被逐字翻译成「人物该占画面多少」交给视频模型，所以它不是标签而是硬约束：
  写「特写」就是头部占画面七成以上、背景几乎看不见，写「全景」就是全身入画。景别和 visual 里描述的画面必须对得上，
  写着「特写」却在 visual 里描述半个房间，模型只能二选一，选错的那一半就是成片里「这个角度不可能这么呈现」。
- cameraMove：这一镜的运镜，中文，取值用 固定、推进、拉远、横移、跟随、摇镜、手持、环绕 之一。
  必须逐镜判断，不要整片抄同一个值：全片每个镜头都写「推进」，等于没有运镜设计。
- cameraAngle：拍摄角度，中文，取值用 平视、略俯、俯拍、略仰、仰拍、过肩、主观视角 之一。
- cameraHeight：机位高度，中文，取值用 地面高度、坐姿视线、站姿视线、高于人物、天花板视角 之一。
  角度和高度决定人物与空间的透视关系。两栏都空着时，模型会按它自己习惯的广角高机位来拍，
  人和房间的比例就会不成立——这两栏和景别是同一个问题的三个面，要一起写。
- subjectPlacement：人物在画面里的位置与占比，中文一句，例如「女主在画面左三分之一，头顶留白约一成，肩线在画面下缘」。
- action：这一镜里发生的动作，中文，写成可执行的一句：谁、做什么、动作从哪到哪结束。
  这一栏和 visual 的分工是：visual 写画面看起来是什么样，action 写这几秒里发生了什么变化。两者不要写成同一句。
- dialogue：这一镜的台词原文。没有台词就填空字符串，不要把旁白或字幕意图塞进来。
- firstFrameReference：这一镜首帧该参考什么，中文一句，例如「沿用 scene_01 场景母版的窗边机位，人物位于画面左三分之一」。
  没有明确参考时描述首帧构图，不要留「未标注」，也不要编造图片地址。
- composition：构图与视觉层次，中文一句，写清主体在画面里的位置、前后景关系和视觉重心。

另外这三个字段决定镜头「厚不厚」，写不出来可以填空字符串，但不要用形容词凑数：
- depthOfField：景深与焦点，例如「浅景深，焦点在她的手，背景书架虚化」。
- lightingNote：这一镜的光线方向和质感，必须和所属场景 instance.lighting 的主光方向一致，不能自己另起一套。
- emotionBeat：这一镜在情绪线上的位置，例如「压抑到临界，还没爆发」。这是剪辑节奏的依据，不是形容词。
${storyboardContinuityInstruction()}
${dialogueStoryboardInstruction()}
${physicsGuardrailInstruction()}

timeline.json：JSON 对象，包含 principle（本片剪辑原则，中文）和 beats 非空数组。每个 beat 包含 id、sceneId（对应镜头 id）、start、end（数字，秒）、role（如 hook、proof、cta）、pacing（如 fast、steady）、editNote（中文剪辑说明）。`;
  }
  return `${common}
脚本阶段使用的 brief.json、campaign_goal.json 和 script.md 必须保持同一创意方向；本次只能提交上面明确允许的文件，并严格使用以下顶层字段契约：
- brief.json：JSON 对象，至少包含 topic、audience、offer；可补充 title、contentGoal、platform、tone、constraints。topic 必须是产品、品牌或主题的本名，越短越好，不要写成营销短语——正例：「保温杯」「三顿半咖啡」「通勤穿搭」；反例：「国产高颜值保温杯种草」「咖啡测评攻略」「通勤穿搭推荐指南」。带「种草、测评、攻略、推荐、开箱、指南、分享」这类营销后缀的一律不合格。
- campaign_goal.json：JSON 对象，必须包含 goal、audience、platform；goal 必须是具体行动目标。
- script.md：完整 Markdown 脚本，正文里必须至少出现一次和 brief.json 的 topic 完全一致的字符串——逐字照抄，不能改写、不能拆开、不能中间插字。例如 topic 是「保温杯」，正文里就必须出现「保温杯」三个字连在一起。并包含具体 Hook、正文、对白/字幕和 CTA。
- 人物必须自洽：如果脚本里写了「人物设定」这类角色小节，它必须覆盖正文里出现过的每一个有名字或代号的人物，一个都不能少。正文写到「周叙」，人物设定里就必须有「周叙」。
  这一条不是格式洁癖。下游的角色阶段读的是正文而不是人物设定小节，正文里多出来的人它会照样生成，而这些人没有任何外貌依据，只能由模型凭空编——编出来的人还要参与全片的角色一致性质检。
  人物设定写不下那么多人，说明该砍的是正文里的人物数量，不是省略他们的设定。
- 人物设定里的每个人都必须有姓名：写具体的中文姓名（例如「林岩」「周叙」「苏晚」），不要用「前任A」「前任B」「现任」「男主」「女生」「店员」这类代号或职能标签，正文、对白提示和字幕里也统一用这个姓名。
  代号省的是写脚本的事，代价全在后面：角色名会被逐字写进图片提示词的开头（「角色：前任A，身份：前男友」），「前任A」和「前任B」之间只差一个字母，模型分不出这是两个不同的人；到了分镜和全片角色一致性质检，区分这几个人的依据同样只有那一个字母。
  出场顺序和人物关系不靠名字表达，写进名字后面的描述里——「第一任男友，大学同学」。只出声音、只出背影、不露脸的配角同样要有姓名，他们一样要单独出图、单独过一致性质检。
  用户的指令和 Brief 里没给名字是常态，这时候你直接随机起——起和角色性别、年龄、身份相称的中文姓名，本片内彼此不同姓、不同音。不要留空等用户来定，不要拿代号占位，也不要回头问用户叫什么。
- 人物设定里的每个人都必须写明性别：在姓名后面的描述里显式写出「男」或「女」，一个都不能省。
  性别写进描述，不要写进姓名——写「- **陈女士**：女，30岁，都市女性」，不要写成「- **陈女士（女）**：30岁」。姓名要和后续角色资产逐字对齐，名字里多带括号会让一致性检查认不出这个人。
  只出声音、只出背影、不露脸的配角同样要写，这些人恰恰最容易被猜错。下游角色阶段的性别是必填字段，脚本不写它就只能从剧情关系里猜，而描述里出现的其他人名会把它带偏：「陈女士第一段恋爱的对象，29岁，性格温和」这句话里「女」出现了两次、「男」一次没有，于是这个男配角的第一张正脸就生成成了女的，后面每个镜头都跟着这张脸错下去。
${dialogueScriptInstruction()}
${scriptConstraintInstruction(segmentPlanFromSpecText(videoSpecText))}
patchOperations 的 after 必须是上述完整文件的字符串内容，不得把文件内容包装成额外嵌套对象。三个文件均不得包含方括号模板、TODO、TBD、“待填写”、“根据 Brief 确定”、“示例”或“如：”等占位内容。`;
}

export function filterStagePatches(
  stage: ProductionStageId,
  patches: PatchOperation[],
  requestedOutputFiles?: string[]
): PatchOperation[] {
  const allowed = new Set(allowedStageOutputFiles(stage, requestedOutputFiles));
  return patches.filter((patch) => allowed.has(patch.filePath));
}

export function isProductionStageFile(path: string): boolean {
  return Object.values(STAGE_CONFIG).some((config) => (config.outputFiles as readonly string[]).includes(path));
}
