/**
 * 场景「视觉设定」的数据模型。
 *
 * 场景卡上那句「客厅、咖啡店、街道」和角色卡上那句「黑色长发」是同一种失败：
 * 它只记住了地点名，没记住空间。于是同一个客厅在第 3 镜里落地窗在沙发右后方，
 * 到第 7 镜就跑到了左前方，沙发换了颜色，墙上的画换了一幅——
 * 观众看到的不是一个家，是七个长得有点像的房间。
 *
 * 反过来，把每个镜头都存成一个独立场景同样是错的：十二个镜头就有十二份
 * 互不相干的空间描述，谁也不是谁的依据，漂移反而被制度化了。
 *
 * 所以这里刻意拆成三级，而且分开存：
 *  - 场景母版 SceneMaster：固定空间。同一个地点只有一份，可锁定，锁上不给编辑；
 *  - 场次状态 SceneInstance：剧情变化。一份母版可以派生多个场次（清晨/争吵后/深夜）；
 *  - 镜头状态 SceneShotState：拍摄变化。镜头只能引用母版和场次，不许自带空间描述。
 *
 * 判断一个字段该放哪一级，只问一句：它变了，观众会觉得「换了个房间」还是
 * 「同一个房间，过了几小时」？前者进母版，后者进场次。
 *
 * 所有字段都可能是空的——场景数据来自模型生成，不保证写全。
 * 这里只做归一化，不做兜底编造：空就是空，让界面显示空状态，
 * 而不是塞一段看起来像模型写的默认文案。
 */

import { characterPaletteSwatch as paletteSwatch } from './characterVisualSpec';

/** 母版参考图的八个固定机位。缺图时是空串，界面显示上传/生成占位，不用随机网图。 */
export type SceneViewId =
  | 'panorama'
  | 'front'
  | 'reverse'
  | 'left'
  | 'right'
  | 'top'
  | 'detail'
  | 'empty';

/** 视觉审查的四个状态。和阶段状态机无关，这是单个场景自己的审查进度。 */
export type SceneReviewStatus = 'draft' | 'ready_for_review' | 'confirmed' | 'needs_changes';

export type SceneSpaceKind = 'interior' | 'exterior';
export type SceneAccessKind = 'public' | 'private';

/**
 * 空间身份锚点。3～6 条，逐条可锁定。
 * 「落地窗位于沙发右后方」这种句子才是锚点；「温馨」不是。
 */
export type SceneAnchor = {
  id: string;
  text: string;
  locked: boolean;
};

export type SceneMasterIdentity = {
  name: string;
  code: string;
  spaceKind: SceneSpaceKind;
  accessKind: SceneAccessKind;
  owner: string;
  geoCulture: string;
  purpose: string;
  tagline: string;
};

export type SceneMasterStructure = {
  area: string;
  layout: string;
  ceilingHeight: string;
  doors: string;
  windows: string;
  entries: string;
  activeZones: string;
  sightlines: string;
  depthLayers: string;
};

export type SceneMasterArt = {
  wall: string;
  floor: string;
  ceiling: string;
  doorWindowStyle: string;
  fixedFurniture: string;
  fixedLighting: string;
  fixedDecor: string;
  signatureProps: string;
  palette: string[];
  materials: string[];
  age: string;
  tidiness: string;
  livingTraces: string;
};

/**
 * 俯视平面图上的一块固定家具，坐标是 0–100 的相对值。
 *
 * 家具属于母版而不是场次：沙发的位置变了就是换了个房间，
 * 而人物走位每一场都不一样。这也是走位图能当「穿帮检查底图」的前提——
 * 底图不变，动的只有人。
 */
export type ScenePlanBlock = {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SceneMaster = {
  id: string;
  /** 锁定后母版字段只读，防止有人在场次里顺手把门窗和家具改了。 */
  locked: boolean;
  reviewStatus: SceneReviewStatus;
  identity: SceneMasterIdentity;
  structure: SceneMasterStructure;
  art: SceneMasterArt;
  anchors: SceneAnchor[];
  /** 俯视平面图的家具块。空数组时走位图只画空房间，不编造家具。 */
  plan: ScenePlanBlock[];
  views: Record<SceneViewId, string>;
};

// ── 场次状态 ─────────────────────────────────────────────────────────

export type SceneStoryInfo = {
  episode: string;
  sceneNumber: string;
  storyTime: string;
  scriptPosition: string;
  goal: string;
  conflict: string;
  emotionStart: string;
  emotionEnd: string;
  mustConvey: string;
};

export type SceneEnvironmentState = {
  date: string;
  season: string;
  timeOfDay: string;
  weather: string;
  temperature: string;
  air: string;
  tidiness: string;
  usedBefore: string;
  storyChange: string;
};

export type SceneLightingState = {
  keySource: string;
  keyDirection: string;
  colorTemperature: string;
  contrastRange: string;
  contrast: string;
  ambient: string;
  practicals: string;
  windowLight: string;
  shadowDirection: string;
  effects: string[];
};

export type ScenePropState = {
  id: string;
  name: string;
  /** 本场新增，还是母版固定项被挪动。区分开，确认时才知道哪些要写回母版。 */
  origin: 'instance' | 'master';
  startPosition: string;
  endPosition: string;
  moved: boolean;
  damaged: string;
  consumable: string;
  /** 这条变化要不要继承到下一场。剧情造成的永久变化必须勾上，否则下一场会自动复位。 */
  inherit: boolean;
};

export type SceneFixtureState = {
  doors: string;
  windows: string;
  lights: string;
  furnitureMoved: string;
  inherited: string;
};

/** 俯视走位图上的一个点，x/y 都是 0–100 的相对坐标。 */
export type ScenePoint = { x: number; y: number };

export type SceneBlockingEntry = {
  characterId: string;
  start: ScenePoint;
  end: ScenePoint;
  enterFrom: string;
  exitTo: string;
  path: string;
  stance: string;
  facing: string;
  spacing: string;
  furnitureInteraction: string;
  propInteraction: string;
  beats: string[];
  dominant: boolean;
  occluded: string;
  mirrorRisk: string;
};

export type SceneSoundDesign = {
  roomTone: string;
  reverb: string;
  outdoor: string;
  distant: string;
  bodyFoley: string;
  propFoley: string;
  accent: string;
  music: string;
  silence: string;
  voiceOver: string;
};

// ── 镜头状态 ─────────────────────────────────────────────────────────

export type SceneCameraMoveId =
  | 'static'
  | 'push_in'
  | 'pull_out'
  | 'truck'
  | 'follow'
  | 'pan'
  | 'handheld'
  | 'orbit';

/** 越轴检查用的机位侧。unset 表示没标，检查会跳过而不是瞎报。 */
export type SceneAxisSide = 'left' | 'right' | 'unset';

export type SceneShotCharacterState = {
  characterId: string;
  present: boolean;
  /** 本镜头结束时人物已离开这个空间。之后的镜头里再出现就是穿帮。 */
  exited: boolean;
  position: string;
  facing: string;
  gaze: string;
  handProp: string;
  /** 道具在哪只手。同一个杯子换手是最典型的连续性事故。 */
  hand: 'left' | 'right' | 'both' | 'none';
  wardrobe: string;
  hairstyle: string;
};

export type SceneShotPropState = {
  name: string;
  position: string;
  count: number;
  /** 饮料液面：满 / 半 / 空。倒着变（空→满）在同一场里一定是错的。 */
  level: string;
};

export type SceneShotContinuity = {
  characters: SceneShotCharacterState[];
  props: SceneShotPropState[];
  doorState: string;
  windowState: string;
  lightState: string;
  /** 这一镜的光从哪来。和 lightState（开/关）是两回事：灯没动但光突然换边，同样是穿帮。 */
  lightDirection: string;
  furniture: string;
  decor: string;
  damage: string;
  timeOfDay: string;
  axisSide: SceneAxisSide;
  /** 这个镜头是哪个镜头的反打。填了才会做视线方向互斥检查。 */
  reverseShotOf: string;
};

export type SceneShotState = {
  id: string;
  code: string;
  line: string;
  shotSize: string;
  cameraAngle: string;
  cameraPosition: string;
  cameraHeight: string;
  cameraDirection: string;
  lens: string;
  cameraMove: SceneCameraMoveId;
  composition: string;
  foreground: string;
  midground: string;
  background: string;
  focalPoint: string;
  subjectPlacement: string;
  subjectGaze: string;
  depthOfField: string;
  durationSeconds: number;
  openFrame: string;
  endFrame: string;
  action: string;
  continuity: SceneShotContinuity;
};

/**
 * 走位图上的机位。angle 是朝向角度（0 = 朝画面右，顺时针增加），fov 是视野角度。
 * 有了它，走位图才能回答「这个机位看得到谁、会不会拍到镜子」，而不只是几个点。
 */
export type SceneCameraPlacement = {
  x: number;
  y: number;
  angle: number;
  fov: number;
};

export type SceneInstance = {
  story: SceneStoryInfo;
  environment: SceneEnvironmentState;
  lighting: SceneLightingState;
  props: ScenePropState[];
  fixtures: SceneFixtureState;
  blocking: SceneBlockingEntry[];
  camera: SceneCameraPlacement | null;
  sound: SceneSoundDesign;
  shots: SceneShotState[];
};

// ── 字段描述表（界面按它渲染，避免把清单写死在 JSX 里）─────────────────

export type SceneFieldDescriptor = {
  key: string;
  label: string;
  required: boolean;
  placeholder: string;
  multiline?: boolean;
};

export type SceneMasterGroupId = 'identity' | 'structure' | 'art' | 'anchors' | 'views';

export const SCENE_MASTER_GROUPS: Array<{ id: SceneMasterGroupId; label: string; hint: string }> = [
  { id: 'identity', label: '基础身份', hint: '这是什么空间、属于谁、一句话视觉定位' },
  { id: 'structure', label: '空间结构', hint: '门窗、动线和前中后景关系，决定机位能不能自洽' },
  { id: 'art', label: '固定美术', hint: '不随剧情改变的墙地顶、家具、灯具和色盘' },
  { id: 'anchors', label: '空间身份锚点', hint: '3～6 条不可随镜头改变的识别特征' },
  { id: 'views', label: '空间参考图', hint: '八个固定机位，缺图时上传或生成，不用随机网图' }
];

export const SCENE_VIEW_SLOTS: Array<{ id: SceneViewId; label: string; hint: string; prompt: string }> = [
  { id: 'panorama', label: '空间全景', hint: '空间主锚点', prompt: '这个空间的广角全景，一次看清整体布局、门窗位置和家具关系' },
  { id: 'front', label: '正向视角', hint: '主视线方向', prompt: '沿主要视线方向拍摄的正向视角，与全景保持同一空间结构' },
  { id: 'reverse', label: '反向视角', hint: '反打机位', prompt: '与正向视角完全相反的反打视角，展示背对方向的墙面与门窗' },
  { id: 'left', label: '左侧视角', hint: '左墙关系', prompt: '从空间左侧拍摄的视角，交代左墙、左侧家具与通道' },
  { id: 'right', label: '右侧视角', hint: '右墙关系', prompt: '从空间右侧拍摄的视角，交代右墙、右侧家具与通道' },
  { id: 'top', label: '俯视平面图', hint: '走位底图', prompt: '这个空间的俯视平面示意图，标出门、窗、主要家具的位置与朝向，线条简洁' },
  { id: 'detail', label: '关键局部', hint: '标志性道具', prompt: '标志性道具或装饰的近景局部，作为镜头里可复用的识别细节' },
  { id: 'empty', label: '空场参考图', hint: '无人基准', prompt: '完全没有人物的空场画面，只有空间本身，作为人物入场前的基准' }
];

export const SCENE_IDENTITY_FIELDS: SceneFieldDescriptor[] = [
  { key: 'name', label: '场景名称', required: true, placeholder: '例如：小澄家客厅' },
  { key: 'code', label: '场景编号', required: false, placeholder: '例如：S-01' },
  { key: 'owner', label: '所属人物', required: false, placeholder: '例如：小澄（独居）' },
  { key: 'geoCulture', label: '地理与文化背景', required: false, placeholder: '例如：中国南方二线城市，老小区改造房' },
  { key: 'purpose', label: '空间用途', required: true, placeholder: '例如：日常起居、待客、深夜独处' },
  { key: 'tagline', label: '一句话视觉定位', required: true, placeholder: '例如：被生活磨旧但仍被认真打理的暖调小客厅', multiline: true }
];

export const SCENE_STRUCTURE_FIELDS: SceneFieldDescriptor[] = [
  { key: 'area', label: '面积与尺度感', required: true, placeholder: '例如：约 18 平米，两人同框略显紧凑' },
  { key: 'layout', label: '平面布局', required: true, placeholder: '例如：长方形，入口在短边，沙发靠长边墙' },
  { key: 'ceilingHeight', label: '层高', required: false, placeholder: '例如：2.6 米，压迫感轻微' },
  { key: 'doors', label: '门的位置与开启方向', required: true, placeholder: '例如：入户门在画面左侧，向内开' },
  { key: 'windows', label: '窗户数量、位置与朝向', required: true, placeholder: '例如：一扇落地窗，位于沙发右后方，朝西' },
  { key: 'entries', label: '人物入口与出口', required: false, placeholder: '例如：入户门进出，阳台门通向室外' },
  { key: 'activeZones', label: '可活动区域', required: false, placeholder: '例如：沙发前地毯区、餐桌区、窗边' },
  { key: 'sightlines', label: '主要视线方向', required: true, placeholder: '例如：沙发朝向电视墙，落地窗在右后方' },
  { key: 'depthLayers', label: '前中后景关系', required: true, placeholder: '例如：前景矮柜，中景沙发与人物，背景落地窗' }
];

export const SCENE_ART_FIELDS: SceneFieldDescriptor[] = [
  { key: 'wall', label: '墙面颜色与材质', required: true, placeholder: '例如：米白乳胶漆，局部轻微泛黄' },
  { key: 'floor', label: '地面颜色与材质', required: true, placeholder: '例如：浅胡桃木地板，纹理明显' },
  { key: 'ceiling', label: '天花板', required: false, placeholder: '例如：白色平顶，无吊顶' },
  { key: 'doorWindowStyle', label: '门窗样式', required: false, placeholder: '例如：窄边黑框玻璃窗，白色木门' },
  { key: 'fixedFurniture', label: '固定家具', required: true, placeholder: '例如：墨绿色双人沙发、木质矮柜、圆形餐桌' },
  { key: 'fixedLighting', label: '固定灯具', required: true, placeholder: '例如：沙发左侧暖色落地灯、餐桌上方吊灯' },
  { key: 'fixedDecor', label: '固定装饰', required: false, placeholder: '例如：墙上一幅不对称抽象画' },
  { key: 'signatureProps', label: '标志性道具', required: false, placeholder: '例如：矮柜上固定摆放的白色花瓶' },
  { key: 'age', label: '新旧程度', required: false, placeholder: '例如：住了六年，家具有使用痕迹但不破败' },
  { key: 'tidiness', label: '整洁程度', required: false, placeholder: '例如：整体整洁，茶几上常有零散杂物' },
  { key: 'livingTraces', label: '空间生活痕迹', required: false, placeholder: '例如：沙发一侧坐塌，地毯边角起毛', multiline: true }
];

/** 锚点预设。给的是「怎么写」的样例，不是「写什么」的答案。 */
export const SCENE_ANCHOR_PRESETS = [
  '落地窗位于沙发右后方',
  '墨绿色双人沙发',
  '沙发左侧为暖色落地灯',
  '木质矮柜上固定摆放白色花瓶',
  '入口位于画面左侧',
  '墙上有一幅不对称抽象画'
];

export const SCENE_ANCHOR_MIN = 3;
export const SCENE_ANCHOR_MAX = 6;

export type SceneInstanceGroupId = 'story' | 'environment' | 'lighting' | 'props' | 'blocking' | 'sound';

export const SCENE_INSTANCE_GROUPS: Array<{ id: SceneInstanceGroupId; label: string; hint: string }> = [
  { id: 'story', label: '剧情信息', hint: '这一场要完成什么，情绪从哪走到哪' },
  { id: 'environment', label: '环境状态', hint: '时间、天气和空间被使用过的痕迹' },
  { id: 'lighting', label: '光影状态', hint: '主光方向必须和母版窗户位置对得上' },
  { id: 'props', label: '临时美术与道具', hint: '本场变量，以及要继承到下一场的永久变化' },
  { id: 'blocking', label: '人物调度', hint: '人物与空间的关系，不是空背景' },
  { id: 'sound', label: '声音与氛围', hint: '默认折叠，不抢主界面' }
];

export const SCENE_STORY_FIELDS: SceneFieldDescriptor[] = [
  { key: 'episode', label: '集数', required: false, placeholder: '例如：第 1 集' },
  { key: 'sceneNumber', label: '场次编号', required: true, placeholder: '例如：1-03' },
  { key: 'storyTime', label: '剧情时间', required: true, placeholder: '例如：约会当天傍晚 18:40' },
  { key: 'scriptPosition', label: '在剧本中的位置', required: false, placeholder: '例如：第二幕开场' },
  { key: 'goal', label: '场次目标', required: true, placeholder: '例如：让观众看出她其实在等一个不会来的人' },
  { key: 'conflict', label: '核心冲突', required: true, placeholder: '例如：想主动联系 vs 不想显得卑微' },
  { key: 'emotionStart', label: '情绪起点', required: true, placeholder: '例如：轻微期待' },
  { key: 'emotionEnd', label: '情绪终点', required: true, placeholder: '例如：强撑的平静' },
  { key: 'mustConvey', label: '本场必须传达的信息', required: true, placeholder: '例如：她已经等了两个小时，但不肯承认', multiline: true }
];

export const SCENE_ENVIRONMENT_FIELDS: SceneFieldDescriptor[] = [
  { key: 'date', label: '日期', required: false, placeholder: '例如：10 月 12 日' },
  { key: 'season', label: '季节', required: false, placeholder: '例如：初秋' },
  { key: 'timeOfDay', label: '时间段', required: true, placeholder: '例如：傍晚' },
  { key: 'weather', label: '天气', required: true, placeholder: '例如：阴，无雨' },
  { key: 'temperature', label: '室内外温度感', required: false, placeholder: '例如：室内偏凉，需要开一盏灯取暖感' },
  { key: 'air', label: '空气状态', required: false, placeholder: '例如：安静，有细小浮尘' },
  { key: 'tidiness', label: '空间整洁度', required: true, placeholder: '例如：茶几上两个杯子没收' },
  { key: 'usedBefore', label: '是否有人使用过', required: false, placeholder: '例如：有，沙发一侧有明显坐痕' },
  { key: 'storyChange', label: '剧情造成的环境变化', required: false, placeholder: '例如：争吵后地毯被踢歪', multiline: true }
];

export const SCENE_LIGHTING_FIELDS: SceneFieldDescriptor[] = [
  { key: 'keySource', label: '主光来源', required: true, placeholder: '例如：落地窗自然光' },
  { key: 'keyDirection', label: '主光方向', required: true, placeholder: '例如：从画面右后方进入' },
  { key: 'colorTemperature', label: '色温', required: true, placeholder: '例如：4200K 偏冷' },
  { key: 'contrastRange', label: '明暗关系', required: false, placeholder: '例如：人物受光，背景压暗' },
  { key: 'contrast', label: '对比度', required: false, placeholder: '例如：中高对比' },
  { key: 'ambient', label: '环境光', required: false, placeholder: '例如：墙面反射的柔和补光' },
  { key: 'practicals', label: '实景灯光', required: false, placeholder: '例如：落地灯开启，暖色 2700K' },
  { key: 'windowLight', label: '窗外光线', required: false, placeholder: '例如：天色将暗，窗外偏蓝' },
  { key: 'shadowDirection', label: '阴影方向', required: true, placeholder: '例如：人物影子落向画面左前方' }
];

/** 光影特效。写成可勾选项，避免用户在自由文本里写「电影感」。 */
export const SCENE_LIGHT_EFFECT_PRESETS = ['雾气', '雨丝', '灰尘颗粒', '逆光', '窗格光斑', '霓虹反射', '烛光跳动'];

export const SCENE_FIXTURE_FIELDS: SceneFieldDescriptor[] = [
  { key: 'doors', label: '门窗开关状态', required: true, placeholder: '例如：入户门关闭，阳台门半开' },
  { key: 'windows', label: '窗帘状态', required: false, placeholder: '例如：纱帘拉上，遮光帘收起' },
  { key: 'lights', label: '灯具开关状态', required: true, placeholder: '例如：落地灯开，吊灯关' },
  { key: 'furnitureMoved', label: '家具是否移动', required: false, placeholder: '例如：茶几被推开约 30cm' },
  { key: 'inherited', label: '需要继承到下一场的变化', required: false, placeholder: '例如：花瓶被打碎，后续场次不再出现', multiline: true }
];

export const SCENE_BLOCKING_FIELDS: SceneFieldDescriptor[] = [
  { key: 'enterFrom', label: '入场方向', required: false, placeholder: '例如：从画面左侧入户门进入' },
  { key: 'exitTo', label: '离场方向', required: false, placeholder: '例如：走向画面右后方阳台' },
  { key: 'path', label: '行走路线', required: false, placeholder: '例如：门口 → 沙发 → 窗边' },
  { key: 'stance', label: '站位与坐姿', required: true, placeholder: '例如：坐在沙发左侧，身体侧向窗' },
  { key: 'facing', label: '面向方向', required: true, placeholder: '例如：面朝画面右侧' },
  { key: 'spacing', label: '人物间距离', required: false, placeholder: '例如：两人相隔一个沙发座位' },
  { key: 'furnitureInteraction', label: '与家具的互动', required: false, placeholder: '例如：手撑在沙发扶手上' },
  { key: 'propInteraction', label: '与道具的互动', required: false, placeholder: '例如：右手一直握着杯子' },
  { key: 'occluded', label: '是否发生遮挡', required: false, placeholder: '例如：前景矮柜遮住小腿' },
  { key: 'mirrorRisk', label: '镜面或反射穿帮风险', required: false, placeholder: '例如：落地窗会反射摄影机位置' }
];

export const SCENE_SOUND_FIELDS: SceneFieldDescriptor[] = [
  { key: 'roomTone', label: '环境底噪', required: false, placeholder: '例如：冰箱低频嗡鸣' },
  { key: 'reverb', label: '空间混响', required: false, placeholder: '例如：小空间短混响，软装吸音' },
  { key: 'outdoor', label: '室外声音', required: false, placeholder: '例如：楼下偶尔的车声' },
  { key: 'distant', label: '远处声音', required: false, placeholder: '例如：隔壁电视的模糊人声' },
  { key: 'bodyFoley', label: '角色动作声', required: false, placeholder: '例如：起身时沙发皮革的挤压声' },
  { key: 'propFoley', label: '道具声音', required: false, placeholder: '例如：杯底磕在玻璃茶几上' },
  { key: 'accent', label: '剧情强调音', required: false, placeholder: '例如：手机震动，只响一声' },
  { key: 'music', label: '是否使用音乐', required: false, placeholder: '例如：不用配乐，只留环境声' },
  { key: 'silence', label: '刻意留白或静默', required: false, placeholder: '例如：她看向门口的三秒完全静音' },
  { key: 'voiceOver', label: '画外音来源和方向', required: false, placeholder: '例如：画外右侧传来邻居的说话声' }
];

export const SCENE_SHOT_SIZES = ['大特写', '特写', '近景', '中景', '中全景', '全景', '远景'];
export const SCENE_CAMERA_ANGLES = ['平视', '略俯', '俯拍', '略仰', '仰拍', '过肩', '主观视角'];
export const SCENE_CAMERA_HEIGHTS = ['地面高度', '坐姿视线', '站姿视线', '高于人物', '天花板视角'];
export const SCENE_LENS_PRESETS = ['广角（空间感强）', '标准（接近肉眼）', '中长焦（压缩背景）', '长焦（强压缩）'];
export const SCENE_COMPOSITION_PRESETS = ['居中构图', '三分法', '对称构图', '前景框架', '留白构图', '对角线构图'];
export const SCENE_DEPTH_OF_FIELD_PRESETS = ['大景深，前后都清晰', '中景深', '浅景深，背景虚化', '极浅景深，只有眼睛清晰'];

export const SCENE_CAMERA_MOVES: Array<{ id: SceneCameraMoveId; label: string; hint: string }> = [
  { id: 'static', label: '固定', hint: '机位不动，靠人物动作推进' },
  { id: 'push_in', label: '推进', hint: '向被摄主体靠近，强化情绪' },
  { id: 'pull_out', label: '拉远', hint: '拉开交代环境或抽离情绪' },
  { id: 'truck', label: '横移', hint: '平行于被摄主体横向移动' },
  { id: 'follow', label: '跟随', hint: '跟着人物走位移动' },
  { id: 'pan', label: '摇镜', hint: '机位不动，镜头水平转动' },
  { id: 'handheld', label: '手持', hint: '轻微晃动，增加临场感' },
  { id: 'orbit', label: '环绕', hint: '绕被摄主体运动，交代空间关系' }
];

/**
 * 生成一致性约束。
 * 这三组不是文案，它们会被拼进图片和视频提示词——所以写的是可执行的句子，
 * 不是「保持电影感」这种模型读不懂的形容词。
 */
export const SCENE_CONSISTENCY_CONTRACT = {
  mustKeep: [
    '空间结构与平面布局',
    '门窗位置与数量',
    '固定家具的位置与朝向',
    '空间核心色盘',
    '标志性装饰与道具',
    '光源逻辑（光从哪来）',
    '空间尺度与层高',
    '人物与空间的比例关系'
  ],
  mayChange: [
    '时间段与日期',
    '天气与窗外光线',
    '本场新增的临时道具',
    '灯具开关状态',
    '空间整洁度',
    '剧情造成的状态变化'
  ],
  driftBans: [
    '门窗数量变化',
    '房间面积突然变化',
    '家具左右翻转',
    '沙发、床、桌子位置随机改变',
    '墙体颜色变化',
    '装饰画随机更换',
    '室内外关系不一致',
    '光线方向与窗户位置矛盾',
    '同一场次色温随机变化'
  ]
} as const;

// ── 归一化 ───────────────────────────────────────────────────────────

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function textList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    const entry = text(item);
    if (!entry || seen.has(entry)) continue;
    seen.add(entry);
    out.push(entry);
  }
  return out;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function count(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(text(value));
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
}

function seconds(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(text(value));
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function point(value: unknown): ScenePoint {
  const source = record(value);
  const axis = (raw: unknown) => {
    const number = typeof raw === 'number' ? raw : Number(text(raw));
    return Number.isFinite(number) ? Math.min(100, Math.max(0, Math.round(number))) : 50;
  };
  return { x: axis(source.x), y: axis(source.y) };
}

function reviewStatus(value: unknown): SceneReviewStatus {
  const raw = text(value);
  return raw === 'confirmed' || raw === 'needs_changes' || raw === 'ready_for_review' ? raw : 'draft';
}

function cameraMove(value: unknown): SceneCameraMoveId {
  const raw = text(value);
  const byId = SCENE_CAMERA_MOVES.find((item) => item.id === raw);
  if (byId) return byId.id;
  // 模型经常直接写中文运镜名，这里认下来，不要把「推进」丢成「固定」。
  return SCENE_CAMERA_MOVES.find((item) => raw.includes(item.label))?.id || 'static';
}

function axisSide(value: unknown): SceneAxisSide {
  const raw = text(value);
  if (raw === 'left' || raw.includes('左')) return 'left';
  if (raw === 'right' || raw.includes('右')) return 'right';
  return 'unset';
}

function handSide(value: unknown): SceneShotCharacterState['hand'] {
  const raw = text(value);
  if (raw === 'left' || raw.includes('左')) return 'left';
  if (raw === 'right' || raw.includes('右')) return 'right';
  if (raw === 'both' || raw.includes('双')) return 'both';
  return 'none';
}

export function scenePaletteSwatch(value: string): { hex: string; label: string } {
  return paletteSwatch(value);
}

export function emptySceneMaster(id = ''): SceneMaster {
  return {
    id,
    locked: false,
    reviewStatus: 'draft',
    identity: {
      name: '', code: '', spaceKind: 'interior', accessKind: 'private',
      owner: '', geoCulture: '', purpose: '', tagline: ''
    },
    structure: {
      area: '', layout: '', ceilingHeight: '', doors: '', windows: '',
      entries: '', activeZones: '', sightlines: '', depthLayers: ''
    },
    art: {
      wall: '', floor: '', ceiling: '', doorWindowStyle: '', fixedFurniture: '',
      fixedLighting: '', fixedDecor: '', signatureProps: '', palette: [], materials: [],
      age: '', tidiness: '', livingTraces: ''
    },
    anchors: [],
    plan: [],
    views: { panorama: '', front: '', reverse: '', left: '', right: '', top: '', detail: '', empty: '' }
  };
}

export function emptySceneInstance(): SceneInstance {
  return {
    story: {
      episode: '', sceneNumber: '', storyTime: '', scriptPosition: '',
      goal: '', conflict: '', emotionStart: '', emotionEnd: '', mustConvey: ''
    },
    environment: {
      date: '', season: '', timeOfDay: '', weather: '', temperature: '',
      air: '', tidiness: '', usedBefore: '', storyChange: ''
    },
    lighting: {
      keySource: '', keyDirection: '', colorTemperature: '', contrastRange: '', contrast: '',
      ambient: '', practicals: '', windowLight: '', shadowDirection: '', effects: []
    },
    props: [],
    fixtures: { doors: '', windows: '', lights: '', furnitureMoved: '', inherited: '' },
    blocking: [],
    camera: null,
    sound: {
      roomTone: '', reverb: '', outdoor: '', distant: '', bodyFoley: '',
      propFoley: '', accent: '', music: '', silence: '', voiceOver: ''
    },
    shots: []
  };
}

function normalizeAnchor(value: unknown, index: number): SceneAnchor {
  const source = record(value);
  // 模型经常把锚点写成纯字符串数组，这里两种形状都收。
  const raw = typeof value === 'string' ? value.trim() : text(source.text);
  return {
    id: text(source.id) || `anchor_${index + 1}`,
    text: raw,
    locked: source.locked === true
  };
}

function normalizePlanBlock(value: unknown, index: number): ScenePlanBlock {
  const source = record(value);
  const span = (raw: unknown) => {
    const number = typeof raw === 'number' ? raw : Number(text(raw));
    return Number.isFinite(number) ? Math.min(100, Math.max(0, number)) : 0;
  };
  return {
    id: text(source.id) || `block_${index + 1}`,
    label: text(source.label),
    x: span(source.x),
    y: span(source.y),
    width: span(source.width),
    height: span(source.height)
  };
}

function normalizeCamera(value: unknown): SceneCameraPlacement | null {
  if (!value || typeof value !== 'object') return null;
  const source = record(value);
  // 字段缺失和「填了 0」必须分开。Number('') 是 0，照单全收会把没写坐标的机位
  // 画成一个紧贴左上角的假机位——比不画更误导。
  const axis = (raw: unknown) => {
    if (typeof raw !== 'number' && !text(raw)) return -1;
    const number = typeof raw === 'number' ? raw : Number(text(raw));
    return Number.isFinite(number) ? Math.min(100, Math.max(0, number)) : -1;
  };
  const x = axis(source.x);
  const y = axis(source.y);
  // 没有坐标就不是机位。返回 null 让界面不画，而不是画一个默认在原点的假机位。
  if (x < 0 || y < 0) return null;
  const angle = Number(source.angle);
  const fov = Number(source.fov);
  return {
    x,
    y,
    angle: Number.isFinite(angle) ? angle : 0,
    fov: Number.isFinite(fov) && fov > 0 && fov < 180 ? fov : 50
  };
}

export function normalizeSceneMaster(value: unknown, fallbackId = ''): SceneMaster {
  const source = record(value);
  const identity = record(source.identity);
  const structure = record(source.structure);
  const art = record(source.art);
  const views = record(source.views);
  const empty = emptySceneMaster(text(source.id) || fallbackId);

  return {
    id: empty.id,
    locked: source.locked === true,
    reviewStatus: reviewStatus(source.reviewStatus),
    identity: {
      name: text(identity.name),
      code: text(identity.code),
      spaceKind: text(identity.spaceKind) === 'exterior' ? 'exterior' : 'interior',
      accessKind: text(identity.accessKind) === 'public' ? 'public' : 'private',
      owner: text(identity.owner),
      geoCulture: text(identity.geoCulture),
      purpose: text(identity.purpose),
      tagline: text(identity.tagline)
    },
    structure: {
      area: text(structure.area),
      layout: text(structure.layout),
      ceilingHeight: text(structure.ceilingHeight),
      doors: text(structure.doors),
      windows: text(structure.windows),
      entries: text(structure.entries),
      activeZones: text(structure.activeZones),
      sightlines: text(structure.sightlines),
      depthLayers: text(structure.depthLayers)
    },
    art: {
      wall: text(art.wall),
      floor: text(art.floor),
      ceiling: text(art.ceiling),
      doorWindowStyle: text(art.doorWindowStyle),
      fixedFurniture: text(art.fixedFurniture),
      fixedLighting: text(art.fixedLighting),
      fixedDecor: text(art.fixedDecor),
      signatureProps: text(art.signatureProps),
      palette: textList(art.palette),
      materials: textList(art.materials),
      age: text(art.age),
      tidiness: text(art.tidiness),
      livingTraces: text(art.livingTraces)
    },
    // 上限截断在归一化这层做：超过 6 条的锚点清单等于没有锚点，界面也放不下。
    anchors: list(source.anchors).map(normalizeAnchor).filter((anchor) => anchor.text).slice(0, SCENE_ANCHOR_MAX),
    plan: list(source.plan).map(normalizePlanBlock).filter((block) => block.width > 0 && block.height > 0),
    views: {
      panorama: text(views.panorama),
      front: text(views.front),
      reverse: text(views.reverse),
      left: text(views.left),
      right: text(views.right),
      top: text(views.top),
      detail: text(views.detail),
      empty: text(views.empty)
    }
  };
}

function normalizeProp(value: unknown, index: number): ScenePropState {
  const source = record(value);
  return {
    id: text(source.id) || `prop_${index + 1}`,
    name: text(source.name),
    origin: text(source.origin) === 'master' ? 'master' : 'instance',
    startPosition: text(source.startPosition),
    endPosition: text(source.endPosition),
    moved: source.moved === true,
    damaged: text(source.damaged),
    consumable: text(source.consumable),
    inherit: source.inherit === true
  };
}

function normalizeBlocking(value: unknown, index: number): SceneBlockingEntry {
  const source = record(value);
  return {
    characterId: text(source.characterId) || `cast_${index + 1}`,
    start: point(source.start),
    end: point(source.end),
    enterFrom: text(source.enterFrom),
    exitTo: text(source.exitTo),
    path: text(source.path),
    stance: text(source.stance),
    facing: text(source.facing),
    spacing: text(source.spacing),
    furnitureInteraction: text(source.furnitureInteraction),
    propInteraction: text(source.propInteraction),
    beats: textList(source.beats),
    dominant: source.dominant === true,
    occluded: text(source.occluded),
    mirrorRisk: text(source.mirrorRisk)
  };
}

function normalizeShotCharacter(value: unknown, index: number): SceneShotCharacterState {
  const source = record(value);
  return {
    characterId: text(source.characterId) || `cast_${index + 1}`,
    // 缺省在场：老数据没有这个字段，默认按缺席处理会让整条连续性检查失效。
    present: source.present !== false,
    exited: source.exited === true,
    position: text(source.position),
    facing: text(source.facing),
    gaze: text(source.gaze),
    handProp: text(source.handProp),
    hand: handSide(source.hand),
    wardrobe: text(source.wardrobe),
    hairstyle: text(source.hairstyle)
  };
}

function normalizeShotProp(value: unknown, index: number): SceneShotPropState {
  const source = record(value);
  return {
    name: text(source.name) || `道具 ${index + 1}`,
    position: text(source.position),
    count: count(source.count),
    level: text(source.level)
  };
}

export function normalizeSceneShot(value: unknown, index: number): SceneShotState {
  const source = record(value);
  const continuity = record(source.continuity);
  return {
    id: text(source.id) || `shot_${index + 1}`,
    code: text(source.code) || `SH-${String(index + 1).padStart(2, '0')}`,
    line: text(source.line),
    shotSize: text(source.shotSize),
    cameraAngle: text(source.cameraAngle),
    cameraPosition: text(source.cameraPosition),
    cameraHeight: text(source.cameraHeight),
    cameraDirection: text(source.cameraDirection),
    lens: text(source.lens),
    cameraMove: cameraMove(source.cameraMove),
    composition: text(source.composition),
    foreground: text(source.foreground),
    midground: text(source.midground),
    background: text(source.background),
    focalPoint: text(source.focalPoint),
    subjectPlacement: text(source.subjectPlacement),
    subjectGaze: text(source.subjectGaze),
    depthOfField: text(source.depthOfField),
    durationSeconds: seconds(source.durationSeconds),
    openFrame: text(source.openFrame),
    endFrame: text(source.endFrame),
    action: text(source.action),
    continuity: {
      characters: list(continuity.characters).map(normalizeShotCharacter),
      props: list(continuity.props).map(normalizeShotProp),
      doorState: text(continuity.doorState),
      windowState: text(continuity.windowState),
      lightState: text(continuity.lightState),
      lightDirection: text(continuity.lightDirection),
      furniture: text(continuity.furniture),
      decor: text(continuity.decor),
      damage: text(continuity.damage),
      timeOfDay: text(continuity.timeOfDay),
      axisSide: axisSide(continuity.axisSide),
      reverseShotOf: text(continuity.reverseShotOf)
    }
  };
}

export function normalizeSceneInstance(value: unknown): SceneInstance {
  const source = record(value);
  const story = record(source.story);
  const environment = record(source.environment);
  const lighting = record(source.lighting);
  const fixtures = record(source.fixtures);
  const sound = record(source.sound);

  return {
    story: {
      episode: text(story.episode),
      sceneNumber: text(story.sceneNumber),
      storyTime: text(story.storyTime),
      scriptPosition: text(story.scriptPosition),
      goal: text(story.goal),
      conflict: text(story.conflict),
      emotionStart: text(story.emotionStart),
      emotionEnd: text(story.emotionEnd),
      mustConvey: text(story.mustConvey)
    },
    environment: {
      date: text(environment.date),
      season: text(environment.season),
      timeOfDay: text(environment.timeOfDay),
      weather: text(environment.weather),
      temperature: text(environment.temperature),
      air: text(environment.air),
      tidiness: text(environment.tidiness),
      usedBefore: text(environment.usedBefore),
      storyChange: text(environment.storyChange)
    },
    lighting: {
      keySource: text(lighting.keySource),
      keyDirection: text(lighting.keyDirection),
      colorTemperature: text(lighting.colorTemperature),
      contrastRange: text(lighting.contrastRange),
      contrast: text(lighting.contrast),
      ambient: text(lighting.ambient),
      practicals: text(lighting.practicals),
      windowLight: text(lighting.windowLight),
      shadowDirection: text(lighting.shadowDirection),
      effects: textList(lighting.effects)
    },
    props: list(source.props).map(normalizeProp),
    fixtures: {
      doors: text(fixtures.doors),
      windows: text(fixtures.windows),
      lights: text(fixtures.lights),
      furnitureMoved: text(fixtures.furnitureMoved),
      inherited: text(fixtures.inherited)
    },
    blocking: list(source.blocking).map(normalizeBlocking),
    camera: normalizeCamera(source.camera),
    sound: {
      roomTone: text(sound.roomTone),
      reverb: text(sound.reverb),
      outdoor: text(sound.outdoor),
      distant: text(sound.distant),
      bodyFoley: text(sound.bodyFoley),
      propFoley: text(sound.propFoley),
      accent: text(sound.accent),
      music: text(sound.music),
      silence: text(sound.silence),
      voiceOver: text(sound.voiceOver)
    },
    shots: list(source.shots).map(normalizeSceneShot)
  };
}

// ── 完成度与审查状态 ─────────────────────────────────────────────────

export type SceneCompletenessCheck = {
  group: SceneMasterGroupId | SceneInstanceGroupId;
  label: string;
  done: boolean;
};

export type SceneCompleteness = {
  done: number;
  total: number;
  percent: number;
  missing: string[];
  checks: SceneCompletenessCheck[];
};

function fieldValue(source: unknown, key: string): string {
  return text((source as Record<string, unknown>)?.[key]);
}

/**
 * 母版完成度。只统计「不填就没法约束生成」的字段，
 * 选填字段不进分母——否则完成度永远到不了 100%，这个门槛就形同虚设。
 */
export function sceneMasterCompleteness(master: SceneMaster): SceneCompleteness {
  const checks: SceneCompletenessCheck[] = [];
  const add = (group: SceneMasterGroupId, label: string, done: boolean) => checks.push({ group, label, done });

  for (const field of SCENE_IDENTITY_FIELDS.filter((item) => item.required)) {
    add('identity', field.label, Boolean(fieldValue(master.identity, field.key)));
  }
  for (const field of SCENE_STRUCTURE_FIELDS.filter((item) => item.required)) {
    add('structure', field.label, Boolean(fieldValue(master.structure, field.key)));
  }
  for (const field of SCENE_ART_FIELDS.filter((item) => item.required)) {
    add('art', field.label, Boolean(fieldValue(master.art, field.key)));
  }
  add('art', '空间主色盘', master.art.palette.length > 0);
  add('art', '材质关键词', master.art.materials.length > 0);
  add('anchors', `至少 ${SCENE_ANCHOR_MIN} 条空间身份锚点`, master.anchors.length >= SCENE_ANCHOR_MIN);
  add('views', '空间全景参考图', Boolean(master.views.panorama));
  add('views', '俯视平面图', Boolean(master.views.top));

  const done = checks.filter((check) => check.done).length;
  return {
    done,
    total: checks.length,
    percent: checks.length ? Math.round((done / checks.length) * 100) : 0,
    missing: checks.filter((check) => !check.done).map((check) => check.label),
    checks
  };
}

/** 场次完成度。母版负责空间，这里只查「这一场和别的场有什么不同」是否说清楚了。 */
export function sceneInstanceCompleteness(instance: SceneInstance): SceneCompleteness {
  const checks: SceneCompletenessCheck[] = [];
  const add = (group: SceneInstanceGroupId, label: string, done: boolean) => checks.push({ group, label, done });

  for (const field of SCENE_STORY_FIELDS.filter((item) => item.required)) {
    add('story', field.label, Boolean(fieldValue(instance.story, field.key)));
  }
  for (const field of SCENE_ENVIRONMENT_FIELDS.filter((item) => item.required)) {
    add('environment', field.label, Boolean(fieldValue(instance.environment, field.key)));
  }
  for (const field of SCENE_LIGHTING_FIELDS.filter((item) => item.required)) {
    add('lighting', field.label, Boolean(fieldValue(instance.lighting, field.key)));
  }
  for (const field of SCENE_FIXTURE_FIELDS.filter((item) => item.required)) {
    add('props', field.label, Boolean(fieldValue(instance.fixtures, field.key)));
  }
  add('blocking', '至少 1 位人物的调度', instance.blocking.some((entry) => entry.stance && entry.facing));

  const done = checks.filter((check) => check.done).length;
  return {
    done,
    total: checks.length,
    percent: checks.length ? Math.round((done / checks.length) * 100) : 0,
    missing: checks.filter((check) => !check.done).map((check) => check.label),
    checks
  };
}

export type SceneAnchorGroup = {
  id: string;
  label: string;
  /** material 画材质小方块，color 画色块，text 只画文字 chip。 */
  kind: 'text' | 'material' | 'color';
  items: string[];
};

function chips(...values: string[]): string[] {
  return textList(values.flatMap((value) => value.split(/[、，,;；/]/)).map((item) => item.trim()));
}

/**
 * 把母版里那些「不可变」的字段按类别摊成 chip，作为锚点面板的速览。
 *
 * 自由文本的锚点句（「落地窗位于沙发右后方」）负责位置关系，这张表负责清点：
 * 有几扇门、几件固定家具、什么材质、什么色盘。审查时前者靠读，后者靠扫，
 * 缺哪一类一眼就能看出来，不用把整份母版翻一遍。
 */
export function sceneAnchorGroups(master: SceneMaster): SceneAnchorGroup[] {
  return [
    { id: 'openings', label: '门窗', kind: 'text' as const, items: chips(master.structure.doors, master.structure.windows, master.art.doorWindowStyle) },
    { id: 'furniture', label: '家具', kind: 'text' as const, items: chips(master.art.fixedFurniture, master.art.fixedLighting) },
    { id: 'materials', label: '材质', kind: 'material' as const, items: master.art.materials },
    { id: 'palette', label: '主色盘', kind: 'color' as const, items: master.art.palette },
    { id: 'props', label: '固定道具', kind: 'text' as const, items: chips(master.art.signatureProps, master.art.fixedDecor) }
  ].filter((group) => group.items.length > 0);
}

export type SceneSetupStatus = 'ready' | 'partial' | 'empty';

const SETUP_STATUS_LABEL: Record<SceneSetupStatus, string> = {
  ready: '已设定',
  partial: '待设定',
  empty: '未设定'
};

/** 左侧场景列表上的三档状态。比百分比更适合扫——扫的是「哪个还没弄」。 */
export function sceneSetupStatus(master: SceneMaster): { status: SceneSetupStatus; label: string } {
  const percent = sceneMasterCompleteness(master).percent;
  const status: SceneSetupStatus = percent >= 100 ? 'ready' : percent > 0 ? 'partial' : 'empty';
  return { status, label: SETUP_STATUS_LABEL[status] };
}

export type SceneReviewState = {
  status: SceneReviewStatus;
  label: string;
  actionLabel: string;
  completeness: SceneCompleteness;
  canSubmitReview: boolean;
};

const REVIEW_STATUS_LABEL: Record<SceneReviewStatus, string> = {
  draft: '待完善',
  ready_for_review: '待审查',
  confirmed: '已确认',
  needs_changes: '需修改'
};

const REVIEW_ACTION_LABEL: Record<SceneReviewStatus, string> = {
  draft: '补充设定',
  ready_for_review: '开始审查',
  confirmed: '查看设定',
  needs_changes: '继续修改'
};

export function sceneReviewStatusLabel(status: SceneReviewStatus): string {
  return REVIEW_STATUS_LABEL[status];
}

/**
 * 场景当前的真实审查状态。
 *
 * 存起来的 reviewStatus 只是「用户点过什么」，不等于「现在是什么」：
 * 必填字段没填完就还是待完善，已确认之后又被清空就退回需修改，
 * 有未解决的连续性冲突同样不能算已确认——否则「已确认」三个字什么都不保证。
 */
export function sceneReviewState(master: SceneMaster, continuityIssues = 0): SceneReviewState {
  const completeness = sceneMasterCompleteness(master);
  const clean = completeness.missing.length === 0 && continuityIssues === 0;
  const stored = master.reviewStatus;

  let status: SceneReviewStatus;
  if (stored === 'confirmed') status = clean ? 'confirmed' : 'needs_changes';
  else if (stored === 'needs_changes') status = 'needs_changes';
  else if (!clean) status = 'draft';
  else status = 'ready_for_review';

  return {
    status,
    label: REVIEW_STATUS_LABEL[status],
    actionLabel: REVIEW_ACTION_LABEL[status],
    completeness,
    canSubmitReview: clean && status !== 'confirmed'
  };
}

// ── 连续性检查 ───────────────────────────────────────────────────────

export type SceneContinuityField =
  | 'hand_prop'
  | 'prop_position'
  | 'prop_count'
  | 'drink_level'
  | 'door'
  | 'window'
  | 'light'
  | 'light_direction'
  | 'furniture'
  | 'decor'
  | 'damage'
  | 'time_light'
  | 'wardrobe'
  | 'hairstyle'
  | 'gaze'
  | 'axis'
  | 'exited_cast';

export type SceneContinuityIssue = {
  id: string;
  field: SceneContinuityField;
  label: string;
  severity: 'error' | 'warning';
  fromShotId: string;
  toShotId: string;
  message: string;
};

const HAND_LABEL: Record<SceneShotCharacterState['hand'], string> = {
  left: '左手', right: '右手', both: '双手', none: '未标注'
};

/** 方向词归一化。视线只需要判「左右是否相对」，不需要理解整句话。 */
function direction(value: string): 'left' | 'right' | 'front' | 'back' | '' {
  const raw = value.trim();
  if (!raw) return '';
  if (raw.includes('左')) return 'left';
  if (raw.includes('右')) return 'right';
  if (raw.includes('镜头') || raw.includes('正前') || raw.includes('前方')) return 'front';
  if (raw.includes('背') || raw.includes('后方')) return 'back';
  return '';
}

/** 这个镜头的动作里有没有解释某个状态变化。有解释就不是穿帮，是剧情。 */
function explains(shot: SceneShotState, keywords: string[]): boolean {
  const haystack = `${shot.action} ${shot.line} ${shot.openFrame} ${shot.endFrame}`;
  return keywords.some((keyword) => haystack.includes(keyword));
}

const DRINK_LEVEL_ORDER = ['空', '少', '半', '多', '满'];

/** 液面只能往下走。返回 -1 表示读不出档位，跳过检查。 */
function drinkLevelRank(value: string): number {
  return DRINK_LEVEL_ORDER.findIndex((level) => value.includes(level));
}

/**
 * 按镜头顺序做连续性对比。
 *
 * 只比相邻两个镜头，而且只报「上一镜是 A、这一镜变成 B、中间没有任何动作解释」的情况。
 * 把所有差异都报出来是没用的——每个镜头本来就该有变化，全量告警等于没有告警。
 */
export function checkSceneContinuity(shots: SceneShotState[]): SceneContinuityIssue[] {
  const issues: SceneContinuityIssue[] = [];
  const push = (
    field: SceneContinuityField,
    label: string,
    severity: SceneContinuityIssue['severity'],
    from: SceneShotState,
    to: SceneShotState,
    message: string
  ) => {
    issues.push({
      id: `${field}_${from.id}_${to.id}_${issues.length + 1}`,
      field, label, severity, fromShotId: from.id, toShotId: to.id, message
    });
  };

  const byId = new Map(shots.map((shot) => [shot.id, shot]));

  // 正反打的视线互斥检查跨镜头配对，不依赖相邻关系，单独走一遍。
  for (const shot of shots) {
    const pairId = shot.continuity.reverseShotOf;
    if (!pairId) continue;
    const pair = byId.get(pairId);
    if (!pair) continue;
    const here = direction(shot.subjectGaze);
    const there = direction(pair.subjectGaze);
    if (!here || !there) continue;
    if ((here === 'left' || here === 'right') && here === there) {
      push('gaze', '正反打视线方向', 'error', pair, shot,
        `${pair.code} 与 ${shot.code} 互为正反打，但两镜人物视线都朝${here === 'left' ? '左' : '右'}。正反打里两人视线必须相对。`);
    }
  }

  for (let index = 1; index < shots.length; index += 1) {
    const from = shots[index - 1];
    const to = shots[index];
    const a = from.continuity;
    const b = to.continuity;

    // 门窗和灯：状态变了但这一镜没有任何人去开关它。
    if (a.doorState && b.doorState && a.doorState !== b.doorState && !explains(to, ['门', '推开', '关上', '进', '出'])) {
      push('door', '门的状态', 'error', from, to,
        `${from.code} 里门是「${a.doorState}」，${to.code} 变成「${b.doorState}」，但这一镜没有开关门的动作。`);
    }
    if (a.windowState && b.windowState && a.windowState !== b.windowState && !explains(to, ['窗', '窗帘', '拉开', '拉上'])) {
      push('window', '窗户状态', 'warning', from, to,
        `${from.code} 里窗是「${a.windowState}」，${to.code} 变成「${b.windowState}」，中间没有对应动作。`);
    }
    if (a.lightState && b.lightState && a.lightState !== b.lightState && !explains(to, ['灯', '开灯', '关灯', '按下'])) {
      push('light', '灯光状态', 'warning', from, to,
        `${from.code} 里灯是「${a.lightState}」，${to.code} 变成「${b.lightState}」，中间没有开关灯的动作。`);
    }
    // 光源没动，光却换了边。这在成片里比灯的开关明显得多：整张脸的受光面翻过去了。
    if (a.lightDirection && b.lightDirection && direction(a.lightDirection) && direction(b.lightDirection)
      && direction(a.lightDirection) !== direction(b.lightDirection)
      && a.lightState === b.lightState && !explains(to, ['灯', '拉开', '窗帘', '转身', '换机位'])) {
      push('light_direction', '灯光方向', 'error', from, to,
        `${from.code} 的光来自「${a.lightDirection}」，${to.code} 变成「${b.lightDirection}」，但灯光状态没变。同一场次里光源方向不能翻边。`);
    }

    // 同一场次里时间不该跳。窗外从白天变夜晚是最刺眼的一种。
    if (a.timeOfDay && b.timeOfDay && a.timeOfDay !== b.timeOfDay) {
      push('time_light', '时间与光线', 'error', from, to,
        `同一场次内时间从「${a.timeOfDay}」跳到「${b.timeOfDay}」。同一场次的时间段必须一致。`);
    }

    // 固定美术漂移：家具和墙面装饰属于母版，场次里不该变。
    if (a.furniture && b.furniture && a.furniture !== b.furniture && !explains(to, ['搬', '推', '移动', '挪'])) {
      push('furniture', '家具位置', 'error', from, to,
        `${from.code} 的家具状态是「${a.furniture}」，${to.code} 变成「${b.furniture}」，但没有搬动动作。`);
    }
    if (a.decor && b.decor && a.decor !== b.decor) {
      push('decor', '墙面装饰', 'error', from, to,
        `${from.code} 的墙面装饰是「${a.decor}」，${to.code} 变成「${b.decor}」。装饰属于场景母版，不能随镜头更换。`);
    }

    // 破损只能变多，不能自己修好。
    if (a.damage && !b.damage) {
      push('damage', '环境破损', 'warning', from, to,
        `${from.code} 已经出现「${a.damage}」，${to.code} 又恢复完好。剧情造成的破损必须继承下去。`);
    }

    // 越轴：机位从轴线一侧跳到另一侧，中间没有过渡。
    if (a.axisSide !== 'unset' && b.axisSide !== 'unset' && a.axisSide !== b.axisSide && to.cameraMove === 'static') {
      push('axis', '前后镜头轴线', 'warning', from, to,
        `${from.code} 机位在轴线${a.axisSide === 'left' ? '左' : '右'}侧，${to.code} 跳到${b.axisSide === 'left' ? '左' : '右'}侧，中间没有运动镜头过渡，会造成越轴。`);
    }

    const castById = new Map(a.characters.map((item) => [item.characterId, item]));
    for (const cast of b.characters) {
      const before = castById.get(cast.characterId);
      if (!before) continue;

      // 已经离场的人又出现在后续镜头里。
      if (before.exited && cast.present && !explains(to, ['回来', '折返', '再次进', '推门'])) {
        push('exited_cast', '已离场人物', 'error', from, to,
          `${cast.characterId} 在 ${from.code} 已经离场，却出现在 ${to.code} 里。`);
      }
      if (!cast.present) continue;

      // 同一个道具换手，是最典型的连续性事故。
      if (
        before.handProp && cast.handProp && before.handProp === cast.handProp &&
        before.hand !== 'none' && cast.hand !== 'none' && before.hand !== cast.hand &&
        !explains(to, ['换手', '递', '接过', '放下'])
      ) {
        push('hand_prop', '道具持握手', 'error', from, to,
          `${from.code} 里「${before.handProp}」在${HAND_LABEL[before.hand]}，${to.code} 变到${HAND_LABEL[cast.hand]}，中间没有换手动作。`);
      }
      if (before.wardrobe && cast.wardrobe && before.wardrobe !== cast.wardrobe && !explains(to, ['换', '脱', '披', '穿'])) {
        push('wardrobe', '衣服状态', 'warning', from, to,
          `${cast.characterId} 的衣服从「${before.wardrobe}」变成「${cast.wardrobe}」，同一场次内没有换装动作。`);
      }
      if (before.hairstyle && cast.hairstyle && before.hairstyle !== cast.hairstyle && !explains(to, ['扎', '放下头发', '拨', '整理'])) {
        push('hairstyle', '发型状态', 'warning', from, to,
          `${cast.characterId} 的发型从「${before.hairstyle}」变成「${cast.hairstyle}」，中间没有对应动作。`);
      }
    }

    const propByName = new Map(a.props.map((item) => [item.name, item]));
    for (const prop of b.props) {
      const before = propByName.get(prop.name);
      if (!before) continue;
      if (before.position && prop.position && before.position !== prop.position && !explains(to, ['拿', '放', '移', '递', '推'])) {
        push('prop_position', '道具位置', 'warning', from, to,
          `「${prop.name}」从「${before.position}」移到「${prop.position}」，这一镜没有对应动作。`);
      }
      if (before.count && prop.count && before.count !== prop.count) {
        push('prop_count', '道具数量', 'warning', from, to,
          `「${prop.name}」数量从 ${before.count} 变成 ${prop.count}。`);
      }
      const beforeLevel = drinkLevelRank(before.level);
      const afterLevel = drinkLevelRank(prop.level);
      if (beforeLevel >= 0 && afterLevel > beforeLevel) {
        push('drink_level', '饮料液面', 'warning', from, to,
          `「${prop.name}」液面从「${before.level}」回到「${prop.level}」。同一场次内液面只能减少。`);
      }
    }
  }

  return issues;
}

export type SceneTimelineRow = {
  field: SceneContinuityField;
  label: string;
  value: string;
};

/**
 * 时间线卡片上逐镜显示的对比行。
 *
 * 连续性是「跨镜头对比」出来的，不是单镜头看出来的：把被追踪的状态直接印在每张卡上，
 * 顺着时间线扫一眼就能看出杯子从右手跳到了左手。
 * 只放这四行——追踪项全铺上去，卡片会变成表格，反而谁都不看。
 */
export function sceneTimelineRows(shot: SceneShotState): SceneTimelineRow[] {
  const c = shot.continuity;
  const prop = c.props[0];
  const gaze = shot.subjectGaze || c.characters.find((item) => item.gaze)?.gaze || '';
  const doorWindow = [c.doorState, c.windowState].filter(Boolean).join(' · ');
  return [
    { field: 'prop_position', label: prop?.name ? `${prop.name}位置` : '道具位置', value: prop?.position || '—' },
    { field: 'door', label: '门窗状态', value: doorWindow || '—' },
    { field: 'gaze', label: '人物视线', value: gaze || '—' },
    { field: 'light_direction', label: '灯光方向', value: c.lightDirection || c.lightState || '—' }
  ];
}

/** 镜头在场次内的起始时码，按前面所有镜头时长累加。 */
export function sceneShotTimecode(shots: SceneShotState[], index: number): string {
  const start = shots.slice(0, index).reduce((total, shot) => total + shot.durationSeconds, 0);
  const whole = Math.floor(start);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(Math.floor(whole / 3600))}:${pad(Math.floor((whole % 3600) / 60))}:${pad(whole % 60)}`;
}

/**
 * 光影和母版结构的矛盾检查。
 *
 * 这类冲突跨不了镜头——它在单个场次里就已经错了：窗户在右后方、主光却从左前来。
 * 模型对这种矛盾毫无察觉，只有把两句话摆在一起比较才看得见。
 */
export function checkSceneLightingAgainstMaster(master: SceneMaster, instance: SceneInstance): SceneContinuityIssue[] {
  const windowSide = direction(master.structure.windows);
  const keySide = direction(instance.lighting.keyDirection);
  if (!windowSide || !keySide) return [];
  if (windowSide === keySide) return [];
  if (!(windowSide === 'left' || windowSide === 'right') || !(keySide === 'left' || keySide === 'right')) return [];
  // 室内自然光才受窗户位置约束；实景灯做主光时方向本来就可以自由布置。
  if (master.identity.spaceKind === 'exterior') return [];
  if (!/窗|自然光|日光|天光/.test(instance.lighting.keySource)) return [];

  return [{
    id: `lighting_master_conflict_${master.id}`,
    field: 'time_light',
    label: '光线方向与窗户位置',
    severity: 'error',
    fromShotId: '',
    toShotId: '',
    message: `母版记录窗户在${windowSide === 'left' ? '左' : '右'}侧，本场主光却来自${keySide === 'left' ? '左' : '右'}侧。自然光做主光时，光线方向必须和窗户位置一致。`
  }];
}

// ── 提示词 ───────────────────────────────────────────────────────────

/**
 * 把母版压成提示词行。
 * 没填的字段直接不出现——宁可少一行，也不要写「未设定」去误导模型。
 */
export function sceneMasterPromptLines(master: SceneMaster): string[] {
  const lines: string[] = [];
  const { identity, structure, art } = master;

  const head = [
    identity.name && `场景：${identity.name}`,
    `${identity.spaceKind === 'exterior' ? '外景' : '内景'}，${identity.accessKind === 'public' ? '公共空间' : '私人空间'}`,
    identity.owner && `所属人物：${identity.owner}`,
    identity.purpose && `空间用途：${identity.purpose}`,
    identity.geoCulture && `地理与文化背景：${identity.geoCulture}`
  ].filter(Boolean);
  if (head.length) lines.push(`${head.join('；')}。`);
  if (identity.tagline) lines.push(`视觉定位：${identity.tagline}。`);

  const space = [
    structure.area && `面积与尺度：${structure.area}`,
    structure.layout && `平面布局：${structure.layout}`,
    structure.ceilingHeight && `层高：${structure.ceilingHeight}`,
    structure.doors && `门：${structure.doors}`,
    structure.windows && `窗：${structure.windows}`,
    structure.sightlines && `主要视线方向：${structure.sightlines}`,
    structure.depthLayers && `前中后景：${structure.depthLayers}`
  ].filter(Boolean);
  if (space.length) lines.push(`空间结构（不可改变）：${space.join('；')}。`);

  const dressing = [
    art.wall && `墙面：${art.wall}`,
    art.floor && `地面：${art.floor}`,
    art.ceiling && `天花板：${art.ceiling}`,
    art.doorWindowStyle && `门窗样式：${art.doorWindowStyle}`,
    art.fixedFurniture && `固定家具：${art.fixedFurniture}`,
    art.fixedLighting && `固定灯具：${art.fixedLighting}`,
    art.fixedDecor && `固定装饰：${art.fixedDecor}`,
    art.signatureProps && `标志性道具：${art.signatureProps}`,
    art.age && `新旧程度：${art.age}`,
    art.livingTraces && `生活痕迹：${art.livingTraces}`
  ].filter(Boolean);
  if (dressing.length) lines.push(`固定美术：${dressing.join('；')}。`);
  if (art.palette.length) lines.push(`空间主色盘：${art.palette.join('、')}。`);
  if (art.materials.length) lines.push(`材质关键词：${art.materials.join('、')}。`);
  if (master.anchors.length) {
    lines.push(`空间身份锚点（每一条都必须出现且位置不变）：${master.anchors.map((anchor) => anchor.text).join('；')}。`);
  }
  if (master.plan.length) {
    lines.push(`平面布局（俯视，画面左上为原点）：${master.plan
      .filter((block) => block.label)
      .map((block) => `${block.label}位于横向 ${Math.round(block.x)}%～${Math.round(block.x + block.width)}%、纵深 ${Math.round(block.y)}%～${Math.round(block.y + block.height)}%`)
      .join('；')}。`);
  }
  return lines;
}

/** 把场次压成提示词行。只写「这一场和母版有什么不同」，空间本身交给母版那几行。 */
export function sceneInstancePromptLines(instance: SceneInstance): string[] {
  const lines: string[] = [];
  const { environment, lighting, fixtures } = instance;

  const env = [
    environment.season && `季节：${environment.season}`,
    environment.timeOfDay && `时间段：${environment.timeOfDay}`,
    environment.weather && `天气：${environment.weather}`,
    environment.temperature && `温度感：${environment.temperature}`,
    environment.air && `空气：${environment.air}`,
    environment.tidiness && `整洁度：${environment.tidiness}`,
    environment.storyChange && `剧情造成的变化：${environment.storyChange}`
  ].filter(Boolean);
  if (env.length) lines.push(`本场环境状态：${env.join('；')}。`);

  const light = [
    lighting.keySource && `主光来源：${lighting.keySource}`,
    lighting.keyDirection && `主光方向：${lighting.keyDirection}`,
    lighting.colorTemperature && `色温：${lighting.colorTemperature}`,
    lighting.contrastRange && `明暗关系：${lighting.contrastRange}`,
    lighting.contrast && `对比度：${lighting.contrast}`,
    lighting.ambient && `环境光：${lighting.ambient}`,
    lighting.practicals && `实景灯光：${lighting.practicals}`,
    lighting.windowLight && `窗外光线：${lighting.windowLight}`,
    lighting.shadowDirection && `阴影方向：${lighting.shadowDirection}`
  ].filter(Boolean);
  if (light.length) lines.push(`本场光影：${light.join('；')}。`);
  if (lighting.effects.length) lines.push(`画面效果：${lighting.effects.join('、')}。`);

  const state = [
    fixtures.doors && `门窗开关：${fixtures.doors}`,
    fixtures.windows && `窗帘：${fixtures.windows}`,
    fixtures.lights && `灯具开关：${fixtures.lights}`,
    fixtures.furnitureMoved && `家具移动：${fixtures.furnitureMoved}`
  ].filter(Boolean);
  if (state.length) lines.push(`本场门窗与灯具状态：${state.join('；')}。`);

  const props = instance.props.filter((prop) => prop.name);
  if (props.length) {
    lines.push(`本场道具：${props.map((prop) => {
      const detail = [prop.startPosition && `起始位置 ${prop.startPosition}`, prop.damaged && `破损：${prop.damaged}`, prop.consumable && `状态：${prop.consumable}`]
        .filter(Boolean)
        .join('，');
      return detail ? `${prop.name}（${detail}）` : prop.name;
    }).join('；')}。`);
  }

  const blocking = instance.blocking.filter((entry) => entry.stance || entry.facing);
  if (blocking.length) {
    lines.push(`人物调度：${blocking.map((entry) => {
      const detail = [entry.stance, entry.facing && `面朝${entry.facing}`, entry.propInteraction]
        .filter(Boolean)
        .join('，');
      return `${entry.characterId}（${detail}）`;
    }).join('；')}。`);
  }
  return lines;
}

/**
 * 景别 → 人物在画面里应该占多少。
 *
 * 这张表是「场景和人物占比不对」那类反馈的直接解药。只写「特写」不够：
 * 模型对景别词的理解很松，同一个「特写」它可能给你一张半身。把占比和取景范围
 * 写成具体的话，它才知道该把镜头推到哪里，也才不会把一个人塞进广角房间图里。
 */
/** 收尾成一句话：已经有句末标点就不再补，避免拼出「……。。」。 */
function sentence(text: string): string {
  return /[。！？]$/.test(text.trim()) ? text.trim() : `${text.trim()}。`;
}

const SHOT_SIZE_FRAMING: Array<{ pattern: RegExp; framing: string }> = [
  { pattern: /大特写|极特写/, framing: '人物面部占满画面，只取五官局部，不要拍到肩膀和环境' },
  { pattern: /特写/, framing: '人物头部占画面高度的 70% 以上，取景到肩膀为止，背景几乎不可见' },
  { pattern: /中近景|近景/, framing: '人物胸部以上占画面高度的一半以上，背景只露出很小一部分且明显虚化' },
  { pattern: /中景/, framing: '人物腰部以上占画面高度的三分之二左右，背景是可辨认但不抢戏的环境' },
  { pattern: /全景/, framing: '人物全身完整入画，人物高度约占画面高度的三分之二，脚不要出画' },
  { pattern: /远景/, framing: '人物全身在画面中较小，用来交代人物与空间的关系，但人物仍然是视觉重心' }
];

/**
 * 取这一镜【开始时】的景别，而不是表里排在最前面的那一个。
 *
 * 分镜实际写出来的是「全景转中景」「中景转近景」这种过渡景别——它违反了「一个镜头
 * 只有一个景别」，但它确实存在于已有数据里，而且短期内还会继续出现。
 * 按表的顺序匹配会踩中一个隐蔽的错误：「全景转中景」里 /中景/ 排在 /全景/ 前面，
 * 于是取到的是这一镜【结束】时的景别——而我们要约束的是首帧，正好取反。
 * 所以按在字符串里出现的位置取最靠前的那个。
 */
export function shotSizeFramingHint(shotSize: string): string {
  const text = shotSize.trim();
  if (!text) return '';
  let best: { at: number; framing: string } | null = null;
  for (const item of SHOT_SIZE_FRAMING) {
    const at = text.search(item.pattern);
    // 同一个位置上以先匹配到的为准：表是按从紧到松排的，「大特写」排在「特写」前面，
    // 两者都命中位置 0 时要的是更具体的那一个。
    if (at >= 0 && (!best || at < best.at)) best = { at, framing: item.framing };
  }
  if (!best) return '';
  // 过渡景别要说清楚这句话约束的是首帧，否则模型会以为整镜都保持这个占比，
  // 推镜和拉镜就被压掉了——那是把一个格式问题修成了一个创作问题。
  const transitional = /转|再|然后|到/.test(text);
  return transitional ? `${best.framing}（这是镜头开始时的取景，之后按运镜自然变化）` : best.framing;
}

/**
 * 把镜头压成提示词行。这里只写机位和画面，空间和场次交给上面两组。
 *
 * 这个函数写好之后有很长一段时间没有任何调用点：景别、机位高度、焦段、构图、
 * 人物画面位置全都停在数据模型里，一个字都没进过图片和视频提示词。
 * 于是模型只能自己决定人物在画面里占多大——「这个角度看场景和人物不可能这么呈现」
 * 就是这么来的。改动它的时候记得：它现在同时喂场景图和视频两条链路。
 */
export function sceneShotPromptLines(shot: SceneShotState): string[] {
  const lines: string[] = [];
  const camera = [
    shot.shotSize && `景别：${shot.shotSize}`,
    shot.cameraAngle && `拍摄角度：${shot.cameraAngle}`,
    shot.cameraPosition && `机位：${shot.cameraPosition}`,
    shot.cameraHeight && `机位高度：${shot.cameraHeight}`,
    shot.cameraDirection && `镜头方向：${shot.cameraDirection}`,
    shot.lens && `焦段：${shot.lens}`,
    shot.composition && `构图：${shot.composition}`,
    shot.depthOfField && `景深：${shot.depthOfField}`
  ].filter(Boolean);
  // 运镜要排在最后，而且只在这一镜确实有机位信息时才写。
  // normalizeSceneShot 会把缺省的 cameraMove 补成 static，无条件输出的话，
  // 一条什么都没填的镜头也会产出「镜头：运镜：固定。」——纯噪音，还看着像是有人设计过。
  if (camera.length) lines.push(`镜头：${[...camera, `运镜：${sceneCameraMoveLabel(shot.cameraMove)}`].join('；')}。`);

  const framing = shotSizeFramingHint(shot.shotSize);
  if (framing) lines.push(`取景与人物占比：${framing}。人物和空间的比例、透视和视高必须和这个景别一致，不要把人物按另一个景别的大小贴进画面。`);

  const layers = [
    shot.foreground && `前景：${shot.foreground}`,
    shot.midground && `中景：${shot.midground}`,
    shot.background && `背景：${shot.background}`,
    shot.focalPoint && `视觉中心：${shot.focalPoint}`,
    shot.subjectPlacement && `人物画面位置：${shot.subjectPlacement}`,
    shot.subjectGaze && `人物视线：${shot.subjectGaze}`
  ].filter(Boolean);
  if (layers.length) lines.push(`画面层次：${layers.join('；')}。`);

  // 这几段文本大多已经自带句号，无条件再补一个会拼出「……。。」。
  // 以前这些行没有任何调用点，看不出来；现在它们要进渲染请求了。
  if (shot.action) lines.push(sentence(`动作：${shot.action}`));
  if (shot.openFrame) lines.push(sentence(`起始画面：${shot.openFrame}`));
  if (shot.endFrame) lines.push(sentence(`结束画面：${shot.endFrame}`));
  return lines;
}

/** 生成约束段落。图片和视频提示词都拼这一段，保证两边说的是同一套规则。 */
export function sceneConsistencyPromptLines(master: SceneMaster): string[] {
  const anchors = master.anchors.map((anchor) => anchor.text).filter(Boolean);
  return [
    `必须保持：${SCENE_CONSISTENCY_CONTRACT.mustKeep.join('、')}。`,
    anchors.length ? `以下识别特征逐条保持不变：${anchors.join('；')}。` : '',
    `允许随剧情变化：${SCENE_CONSISTENCY_CONTRACT.mayChange.join('、')}。`,
    `禁止出现：${SCENE_CONSISTENCY_CONTRACT.driftBans.join('、')}。`
  ].filter(Boolean);
}

export function sceneCameraMoveLabel(id: SceneCameraMoveId): string {
  return SCENE_CAMERA_MOVES.find((item) => item.id === id)?.label || '固定';
}

// ── 老数据派生 ───────────────────────────────────────────────────────

export type SceneMasterSeed = {
  id: string;
  title: string;
  location: string;
  visual: string;
  palette: string;
  lighting: string;
  timeOfDay: string;
};

/** 地点归一化。「小澄家客厅」「小澄家 · 客厅」「小澄家客厅（傍晚）」是同一个空间。 */
function locationKey(value: string): string {
  return value.replace(/[\s·、,，.。/\-—（）()【】]/g, '').replace(/(清晨|白天|傍晚|夜里|深夜|早上|中午|下午|晚上)$/, '');
}

/**
 * 由地点算出稳定的母版 id。
 *
 * 不能用「第几个」当 id：同一份数据被读两次（一次归一化场次、一次取母版列表）
 * 传入的子集不一样，序号就会错位，场次会被挂到别人的母版上。
 * 用内容哈希，两次调用得到的是同一个 id。
 */
function derivedMasterId(key: string): string {
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  }
  return `scene_master_${hash.toString(36)}`;
}

/**
 * 从老的扁平场景列表里派生母版。
 *
 * 老工作区的 scenes.json 只有 location/lighting/palette 这几个字段，一个母版都没有。
 * 不派生就意味着所有历史项目打开画板都是空的，用户只能重新生成整个场景阶段——
 * 而重新生成会覆盖他已经审过的内容。所以这里按地点聚合，先给出一份能用的母版骨架，
 * 缺的字段留空由界面提示补齐，不编造。
 */
export function deriveSceneMasters(seeds: SceneMasterSeed[]): {
  masters: SceneMaster[];
  masterIdByScene: Record<string, string>;
} {
  const groups = new Map<string, { master: SceneMaster; sceneIds: string[] }>();
  const masterIdByScene: Record<string, string> = {};

  for (const seed of seeds) {
    const label = seed.location.trim() || seed.title.trim();
    if (!label || !seed.id) continue;
    const key = locationKey(label) || label;
    let group = groups.get(key);
    if (!group) {
      const master = emptySceneMaster(derivedMasterId(key));
      master.identity.name = label;
      master.identity.code = `S-${String(groups.size + 1).padStart(2, '0')}`;
      // 「街道」「广场」这类一眼可判的外景先标出来，其余保持内景默认值等用户确认。
      master.identity.spaceKind = /街|路|广场|公园|门口|户外|天台|操场|海边|山/.test(label) ? 'exterior' : 'interior';
      master.identity.accessKind = /家|房间|卧室|办公室|车内/.test(label) ? 'private' : 'public';
      master.identity.tagline = seed.visual.trim();
      master.art.palette = textList(seed.palette.split(/[、，,;；/]/));
      group = { master, sceneIds: [] };
      groups.set(key, group);
    }
    group.sceneIds.push(seed.id);
    masterIdByScene[seed.id] = group.master.id;
  }

  return { masters: Array.from(groups.values()).map((group) => group.master), masterIdByScene };
}

/** 母版某个机位参考图的完整提示词。八张必须来自同一空间，所以母版行全量带上。 */
export function buildSceneViewPrompt(master: SceneMaster, viewId: SceneViewId): string {
  const slot = SCENE_VIEW_SLOTS.find((item) => item.id === viewId);
  if (!slot) return '';
  const isPlan = viewId === 'top';
  return [
    isPlan
      ? `${master.identity.name || '这个场景'}的俯视平面示意图。${slot.prompt}。`
      : `${master.identity.name || '这个场景'}的${slot.label}参考图。${slot.prompt}。`,
    ...sceneMasterPromptLines(master),
    isPlan ? '' : '画面里不要出现任何人物，只拍空间本身。',
    ...sceneConsistencyPromptLines(master),
    '画面不要生成任何可读文字，不要英文、拼音、字幕、水印、标志或乱码。'
  ].filter(Boolean).join('\n');
}
