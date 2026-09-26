const fs = require('node:fs/promises');
const path = require('node:path');

const BASE_URL = process.env.VIDEOAGENT_BASE_URL || 'http://127.0.0.1:3001';
const OUT_DIR = path.join(process.cwd(), 'outputs', 'xiaopeng-love-history-3min-v2');
const REFS_PATH = path.join(OUT_DIR, 'reference-images.json');
const TOTAL_SECONDS = 180;
const SEGMENT_SECONDS = 15;
const SEGMENT_COUNT = 12;

const sources = [
  {
    title: '人民日报：表白墙是校园身份认同与吐槽地',
    url: 'https://www.peopleapp.com/rmharticle/30020528611',
    use: '大学段采用表白墙作为校园情感树洞与互助空间，不照搬原文。'
  },
  {
    title: '央视：表白墙成为情感社交、失物招领、拼车拼团平台',
    url: 'https://news.cctv.com/2019/09/23/ARTIafGg9sztJNTpR3Q5WWoh190923.shtml',
    use: '大学段把表白墙和失物招领合并成原创乌龙。'
  },
  {
    title: '中青在线：表白墙可承载表白交友、提问求助、吐槽提醒和失物招领',
    url: 'https://m.cyol.com/gb/articles/2024-07/07/content_JQ8gQdTZyb.html',
    use: '大学段保留校园墙的便利与风险意识，不出现挂人和隐私曝光。'
  }
];

const characterAnchor = [
  '小澎是同一个中国男孩逐渐长成青年，圆脸，短黑发，浓眉，笑起来露一颗小虎牙，紧张时会挠头。',
  '年龄必须随阶段变化：幼儿园五岁，小学十岁，初中十四岁，高中十七岁，大学二十一岁。',
  '每个阶段保留同一组脸部锚点，但身高、脸部成熟度、服装和气质必须符合年龄。',
  '贯穿红色小物件：幼儿园红书包，小学红铅笔盒，初中红水杯，高中红笔记本，大学红帆布包。',
  '所有未成年人阶段只表现清水校园好感、玩伴关系和尴尬喜剧，不出现亲吻、拥抱、成人化表达。'
].join('');

const visualRules = [
  '真人实拍校园短剧质感，竖屏，真实中国校园，自然光，普通学生，真实肤色和真实比例。',
  '禁止动画风、二次元、卡通、玩偶脸、三维渲染、夸张滤镜。',
  '画面内不得出现任何可读文字，包含字幕、招牌、横幅、海报、屏幕、书本、包装、英文、拼音、拉丁字母和乱码。',
  '所有信息由后期纯中文字幕和中文旁白表达。'
].join('');

const negativePrompt = [
  '英文字幕',
  '英文单词',
  '拼音',
  '拉丁字母',
  '乱码文字',
  '不可读文字',
  '可读招牌',
  '屏幕文字',
  '书本文字',
  '菜单文字',
  '包装文字',
  '动画风',
  '二次元',
  '卡通',
  '玩偶脸',
  '三维渲染',
  '夸张比例',
  '换脸',
  '换人',
  '脸部不一致',
  '多余手指',
  '畸形手指',
  '亲吻',
  '拥抱',
  '性暗示',
  '成人化儿童'
].join('，');

const arcs = [
  {
    id: 'kindergarten',
    title: '幼儿园：糖纸恋爱',
    result: '小澎和小雨成为午睡前互相保管贴纸的玩伴，第一段恋爱以抢小被子分手。',
    referencePrompt: '真人实拍角色参考图，中国幼儿园小男孩小澎五岁，明显幼儿体型，身高很矮，脸部稚嫩圆润，短黑发，浓眉，小虎牙，背红色小书包，害羞挠头，中国幼儿园活动区，自然光，真实比例，不像小学生，不像初中生，不像成年人，画面无任何文字'
  },
  {
    id: 'primary',
    title: '小学：橡皮同桌恋',
    result: '小澎和小夏从借橡皮发展成同桌默契，最后因为情书误交老师尴尬收场。',
    referencePrompt: '真人实拍角色参考图，中国小学四年级男孩小澎十岁，儿童体型，圆脸，短黑发，浓眉，小虎牙，穿朴素小学校服，抱红色铅笔盒，害羞挠头，中国小学走廊，自然光，真实比例，不像初中生，不像高中生，不像成年人，画面无任何文字'
  },
  {
    id: 'middle',
    title: '初中：水杯互助恋',
    result: '小澎和小禾从调座位翻车变成运动会互相加油，关系停在学习搭子和好朋友。',
    referencePrompt: '真人实拍角色参考图，普通中国初二男孩小澎十四岁，干净面部，干净双手，普通学生气质，圆脸，短黑发，浓眉，自然小虎牙，蓝白初中校服，双手拿红色水杯，中国中学校园，自然光，真实比例，健康清爽，画面无任何文字'
  },
  {
    id: 'high',
    title: '高中：广播站青春恋',
    result: '小澎和小周经历补课、广播事故和毕业合影，告白没有结果，但留下青春章节。',
    referencePrompt: '把参考人物重塑为同一个中国高中男孩小澎十七岁，短黑发浓眉小虎牙，穿高中校服，抱红笔记本，真实校园电影感，画面无任何文字'
  },
  {
    id: 'college',
    title: '大学：表白墙正式恋',
    result: '小澎和林晓从社团招新、表白墙失物招领乌龙到图书馆奶茶约会，终于成为真正的恋人。',
    referencePrompt: '真人实拍角色参考图，中国大学男生小澎二十一岁，圆脸短黑发浓眉小虎牙，背红帆布包，害羞挠头，真实校园广场，自然光，画面无任何文字'
  }
];

const segments = [
  {
    id: 'xp_v2_01_kindergarten_meet',
    arc: 'kindergarten',
    stage: '幼儿园',
    title: '糖果相识',
    age: '五岁',
    beat: '相识',
    narration: '小澎的第一段恋爱，开始于一颗还没剥开的糖。',
    subtitle: '五岁的小澎第一次心动，先把糖递出去，又严肃地拿回来剥糖纸。',
    visual: '幼儿园教室，小澎背红书包，把糖递给小雨，小雨刚伸手，小澎突然收回去认真剥糖纸，旁边小朋友围成一圈偷笑，老师在远处忍笑。',
    joke: '小澎把剥碎的糖纸递出去，小雨看着空手心发呆。'
  },
  {
    id: 'xp_v2_02_kindergarten_result',
    arc: 'kindergarten',
    stage: '幼儿园',
    title: '饭勺戒指',
    age: '五岁',
    beat: '误会和结果',
    narration: '他以为恋爱就是办婚礼，小雨以为那只是抢积木的新玩法。',
    subtitle: '小澎用积木搭拱门，小雨把拱门拆走盖城堡，第一段恋爱当场改成工程合作。',
    visual: '幼儿园活动区，小澎把玩具戒指放在饭勺里，认真邀请小雨玩婚礼游戏，小雨开心搬走积木搭城堡，小澎愣住后改给玩具熊戴戒指。',
    joke: '老师问他们在干什么，小澎认真回答：我们已经转型做建筑了。'
  },
  {
    id: 'xp_v2_03_primary_eraser',
    arc: 'primary',
    stage: '小学',
    title: '借橡皮靠近',
    age: '十岁',
    beat: '相识和靠近',
    narration: '小学的小澎学会了搭讪，方法很朴素：借橡皮。',
    subtitle: '他一天借了八次橡皮，小夏终于发现，他错的不是字，是战略。',
    visual: '小学教室，小澎穿校服，桌上放红铅笔盒，假装写错字向前桌小夏借橡皮，擦一下又写错，桌面堆满橡皮屑，小夏忍不住笑。',
    joke: '小夏递给他一块全新的橡皮，小澎紧张得把自己的名字也擦掉了。'
  },
  {
    id: 'xp_v2_04_primary_letter',
    arc: 'primary',
    stage: '小学',
    title: '情书误交',
    age: '十岁',
    beat: '冲突和结果',
    narration: '第一封情书，小澎格式很工整，投递路线很离谱。',
    subtitle: '信纸没有进小夏书包，进了班主任教案夹。',
    visual: '小学走廊，小澎夹着红铅笔盒，准备把粉色信纸放进小夏书包，被同学一撞，信纸飞进班主任教案夹。班主任翻开教案，小澎慢慢缩到课桌后面。',
    joke: '班主任只看了一眼，全班就知道今天午餐的鸡腿很像爱情。'
  },
  {
    id: 'xp_v2_05_middle_seat',
    arc: 'middle',
    stage: '初中',
    title: '同桌三分钟',
    age: '十四岁',
    beat: '相识和误会',
    narration: '初中，小澎终于和喜欢的人同桌，只同桌了三分钟。',
    subtitle: '老师刚调座位，小澎就把红水杯碰倒，爱情顺着作业本流走。',
    visual: '初中教室，小澎穿蓝白校服，桌上红水杯，老师宣布调座位，小澎坐到小禾旁边压住笑，下一秒水杯倒了，水流向小禾作业本。',
    joke: '小澎用袖子抢救作业本，小禾先愣住，随后递给他一包纸。'
  },
  {
    id: 'xp_v2_06_middle_sports',
    arc: 'middle',
    stage: '初中',
    title: '递水接力',
    age: '十四岁',
    beat: '补救和结果',
    narration: '为了补救，小澎决定在运动会递水，结果递出了接力赛。',
    subtitle: '他追着小禾递水，误入接力队伍，跑完半圈才发现自己不是运动员。',
    visual: '初中操场，小澎拿红水杯等小禾跑完，冲上前递水时被接力队伍带跑，边跑边举水杯，观众以为他在冲刺，小禾在终点笑到弯腰。',
    joke: '小澎把水递到裁判手里，裁判也愣了。'
  },
  {
    id: 'xp_v2_07_high_tutoring',
    arc: 'high',
    stage: '高中',
    title: '补课心动',
    age: '十七岁',
    beat: '靠近',
    narration: '高中后，小澎决定靠学习吸引人，数学先让他原形毕露。',
    subtitle: '小周给他讲题，他频频点头，笔记本上全是认真但错误的自信。',
    visual: '高中晚自习教室，小澎抱红笔记本，小周给他讲题，小澎认真点头，镜头扫过笔记本，公式写得乱七八糟，他还画了很多表示懂了的小表情。',
    joke: '小周问懂了吗，小澎把答案写成了自己的名字。'
  },
  {
    id: 'xp_v2_08_high_broadcast',
    arc: 'high',
    stage: '高中',
    title: '广播站事故',
    age: '十七岁',
    beat: '冲突',
    narration: '小澎终于鼓起勇气练告白，广播站替他鼓起了更大的勇气。',
    subtitle: '他对着话筒练习，全校突然听见他想和小周一起背单词。',
    visual: '高中广播站，小澎拿红笔记本对话筒练习，朋友误按播放键，走廊和操场同学同时抬头，小澎震惊捂住话筒，校长经过玻璃窗停住。',
    joke: '小澎装作维修设备，拿笔记本给话筒扇风。'
  },
  {
    id: 'xp_v2_09_high_graduation',
    arc: 'high',
    stage: '高中',
    title: '毕业合影',
    age: '十八岁',
    beat: '阶段结果',
    narration: '毕业那天，他想留下青春，摄影师留下了他的后脑勺。',
    subtitle: '小澎终于和小周合影，却被同学挤到边上，只剩半张脸和红笔记本。',
    visual: '高中毕业校园，黄昏，小澎抱红笔记本，和小周准备合影，同学们涌入镜头，小澎被挤到边缘，小周拿照片给他看，两人先尴尬后大笑。',
    joke: '小澎说这叫留白，小周说这叫你没进画。'
  },
  {
    id: 'xp_v2_10_college_club',
    arc: 'college',
    stage: '大学',
    title: '社团招新',
    age: '二十一岁',
    beat: '相识',
    narration: '大学的小澎决定成熟一点，成熟的第一步是先报错社团。',
    subtitle: '他想追随林晓加入电影社，结果把名字写到了失物招领志愿表。',
    visual: '大学社团招新广场，小澎背红帆布包，看见林晓在电影社摊位登记，假装淡定走过去，却在隔壁失物招领志愿表上写下名字，工作人员塞给他一串钥匙。',
    joke: '林晓问他报了什么，小澎看着钥匙说：我负责寻找爱情的下落。'
  },
  {
    id: 'xp_v2_11_college_wall',
    arc: 'college',
    stage: '大学',
    title: '表白墙乌龙',
    age: '二十一岁',
    beat: '误会和补救',
    narration: '表白墙让校园爱情更勇敢，也让小澎的红帆布包更出名。',
    subtitle: '林晓在表白墙找失主，小澎以为有人表白自己，兴奋了整整一下午。',
    visual: '大学食堂外，小澎背红帆布包看手机，表情从震惊到狂喜。镜头不展示手机文字，只拍他的反应。林晓拿着他落下的饭卡出现，小澎立刻尴尬。',
    joke: '小澎把头发整理三次，最后发现被寻找的是饭卡不是他本人。'
  },
  {
    id: 'xp_v2_12_college_date',
    arc: 'college',
    stage: '大学',
    title: '图书馆奶茶约会',
    age: '二十一岁',
    beat: '阶段结果',
    narration: '从糖纸到奶茶，小澎终于明白，恋爱不是不翻车，而是翻车后还能一起笑。',
    subtitle: '第一次正式约会选在图书馆，自习区安静到吸管包装都像放鞭炮。',
    visual: '大学图书馆门口，小澎背红帆布包拿两杯奶茶，和林晓走进安静自习区，小澎拆吸管包装声音太响，周围同学回头，两人忍笑逃到操场看台。',
    joke: '林晓接过奶茶，小澎小声说这次我没有把自己弄丢。'
  }
];

function byArc(arcId, refs) {
  return refs?.[arcId]?.url || '';
}

function renderPrompt(segment, refs) {
  const reference = byArc(segment.arc, refs);
  return {
    id: segment.id,
    sceneId: segment.id,
    type: 'video',
    renderTask: `${segment.stage}｜${segment.title}`,
    durationSeconds: SEGMENT_SECONDS,
    ...(reference ? { referenceImageUrl: reference, mode: 'ti2vid' } : {}),
    prompt: [
      `第 ${segments.findIndex((item) => item.id === segment.id) + 1}/${SEGMENT_COUNT} 段，短剧《小澎的恋爱史》，${segment.stage}阶段，${segment.age}。`,
      `本段功能：${segment.beat}。`,
      characterAnchor,
      visualRules,
      `画面：${segment.visual}`,
      `笑点：${segment.joke}`,
      '镜头节奏：前三秒建立场景，中间八秒推进误会或行动，最后四秒给表情反应和笑点。',
      '画面中不要出现任何可读文字，不要生成字幕，不要英文，不要拼音，不要拉丁字母。'
    ].join('\n')
  };
}

function json(value) {
  return JSON.stringify(value, null, 2);
}

function file(pathName, kind, version, content) {
  return {
    path: pathName,
    kind,
    version,
    updatedAt: new Date().toISOString(),
    content
  };
}

async function readRefs() {
  try {
    return JSON.parse(await fs.readFile(REFS_PATH, 'utf8'));
  } catch (_) {
    return {};
  }
}

async function writeRefs(refs) {
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(REFS_PATH, json(refs));
}

async function generateImage(prompt, images = []) {
  const response = await fetch(`${BASE_URL}/api/image/render`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt, images, size: '768x1024' })
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok || body.ok === false || !body.imageUrl) {
    throw new Error(body.error || text || `Image render failed with ${response.status}`);
  }
  return body.imageUrl;
}

async function generateReferences() {
  const refs = await readRefs();
  let previous = refs.college?.url || '';
  if (!previous) {
    previous = await generateImage(arcs.find((arc) => arc.id === 'college').referencePrompt);
    refs.college = { url: previous, generatedAt: new Date().toISOString() };
    await writeRefs(refs);
  }

  for (const arcId of ['high']) {
    if (refs[arcId]?.url) {
      previous = refs[arcId].url;
      continue;
    }
    const arc = arcs.find((item) => item.id === arcId);
    const url = await generateImage(arc.referencePrompt, [previous]);
    refs[arcId] = { url, generatedAt: new Date().toISOString() };
    previous = url;
    await writeRefs(refs);
  }

  for (const arcId of ['middle', 'primary', 'kindergarten']) {
    if (refs[arcId]?.url) continue;
    const arc = arcs.find((item) => item.id === arcId);
    const url = await generateImage(arc.referencePrompt);
    refs[arcId] = { url, generatedAt: new Date().toISOString() };
    await writeRefs(refs);
  }
  return refs;
}

function assetPrompts(refs) {
  return {
    visualStyle: visualRules,
    handoffTo: 'Agnes Video V2.0',
    handoffRule: '每次只提交一个十五秒小节；使用参考图时走图生视频；整片由十二个小节后期拼接。',
    characterConsistency: {
      primarySubject: '小澎',
      consistencyPrompt: characterAnchor,
      negativePrompt
    },
    characters: [
      {
        id: 'xiaopeng',
        name: '小澎',
        role: '贯穿主角',
        description: '从五岁到二十一岁的同一个中国男孩逐渐长成青年，喜剧感强，认真但经常翻车。',
        appearance: '圆脸，短黑发，浓眉，小虎牙，紧张时挠头。',
        consistencyPrompt: characterAnchor,
        negativePrompt
      },
      {
        id: 'stage_partners',
        name: '阶段恋爱对象',
        role: '每个阶段的关系对象',
        description: '小雨、小夏、小禾、小周、林晓分别承担五段完整关系，均为清水校园喜剧表达。',
        consistencyPrompt: '每位关系对象只在对应阶段稳定出现，不要混淆年龄、服装和场景。',
        negativePrompt: '成人化未成年人，亲密身体接触，隐私曝光，校园霸凌'
      }
    ],
    prompts: segments.map((segment) => renderPrompt(segment, refs)),
    renderQueue: segments.map((segment, index) => {
      const reference = byArc(segment.arc, refs);
      return {
        id: `render_${String(index + 1).padStart(2, '0')}`,
        sceneId: segment.id,
        status: reference ? 'ready_with_reference' : 'needs_reference_image',
        ...(reference ? { referenceImageUrl: reference, mode: 'ti2vid' } : {})
      };
    }),
    renderSpec: {
      platform: '小红书',
      generationMode: 'image_to_video',
      aspectRatio: '9:16',
      resolutionTier: '720p',
      targetDurationSeconds: SEGMENT_SECONDS,
      numFrames: 361,
      frameRate: 24,
      episodeTotalSeconds: TOTAL_SECONDS,
      episodeSegmentSeconds: SEGMENT_SECONDS,
      episodeSegmentCount: SEGMENT_COUNT
    },
    reuseNotes: [
      '每个阶段是一段完整关系，不是单个暗恋笑点。',
      '画面内禁止生成文字，后期只叠纯中文字幕。',
      '如参考图未生成，不允许宣称人物一致性已解决。'
    ]
  };
}

function brief() {
  return {
    topic: '小澎的恋爱史',
    contentGoal: '做一条三分钟纯中文搞笑校园短剧，从幼儿园到大学，每个阶段都有一段完整恋爱。',
    platform: '小红书',
    audience: '喜欢轻喜剧、校园回忆和短剧反转的中文观众',
    tone: '好笑、真实、清水、节奏快',
    constraints: [
      '总时长三分钟',
      '十二段，每段十五秒',
      '人物年龄必须变化但脸部锚点一致',
      '画面内不出现英文或乱码',
      '未成年人阶段不出现成人化恋爱表达'
    ]
  };
}

function scenes() {
  let start = 0;
  return {
    scenes: segments.map((segment, index) => {
      const current = {
        id: segment.id,
        title: `${String(index + 1).padStart(2, '0')}｜${segment.stage}｜${segment.title}`,
        role: segment.beat,
        visual: segment.visual,
        subtitle: segment.subtitle,
        narration: segment.narration,
        start,
        end: start + SEGMENT_SECONDS
      };
      start += SEGMENT_SECONDS;
      return current;
    })
  };
}

function timeline() {
  return {
    totalSeconds: TOTAL_SECONDS,
    segmentSeconds: SEGMENT_SECONDS,
    segmentCount: SEGMENT_COUNT,
    arcs: arcs.map((arc) => ({
      id: arc.id,
      title: arc.title,
      result: arc.result,
      segments: segments.filter((segment) => segment.arc === arc.id).map((segment) => segment.id)
    })),
    cutPlan: segments.map((segment, index) => ({
      index: index + 1,
      sceneId: segment.id,
      in: index * SEGMENT_SECONDS,
      out: (index + 1) * SEGMENT_SECONDS,
      caption: segment.subtitle
    }))
  };
}

function scriptMarkdown() {
  return [
    '# 小澎的恋爱史｜三分钟纯中文搞笑短剧',
    '',
    `总时长：${TOTAL_SECONDS} 秒。拆分：${SEGMENT_COUNT} 段，每段 ${SEGMENT_SECONDS} 秒。`,
    '',
    '## 结构原则',
    '',
    '- 每个阶段都有一段完整关系：相识或靠近、误会或冲突、补救、阶段结果。',
    '- 未成年人阶段只表现清水好感和校园玩伴关系。',
    '- 画面内不生成任何可读文字，所有字幕由后期纯中文添加。',
    '',
    '## 人物一致性',
    '',
    characterAnchor,
    '',
    '## 五段恋爱弧线',
    '',
    ...arcs.flatMap((arc) => [`### ${arc.title}`, arc.result, '']),
    '## 十二段脚本',
    '',
    ...segments.flatMap((segment, index) => [
      `### ${String(index + 1).padStart(2, '0')}｜${segment.stage}｜${segment.title}`,
      `阶段功能：${segment.beat}`,
      `旁白：${segment.narration}`,
      `纯中文字幕：${segment.subtitle}`,
      `画面：${segment.visual}`,
      `笑点：${segment.joke}`,
      ''
    ]),
    '## 调研来源',
    '',
    ...sources.map((source) => `- ${source.title}：${source.url}。使用方式：${source.use}`)
  ].join('\n');
}

function publishCopy() {
  return {
    titles: ['小澎的恋爱史，从糖纸翻车到奶茶约会', '三分钟看完一个男孩从幼儿园到大学的恋爱史', '每段恋爱都翻车，但小澎从没缺席'],
    coverText: '小澎的恋爱史',
    caption: '从幼儿园送糖，到大学表白墙乌龙。每个阶段都有一段完整恋爱，每一段都认真翻车。',
    hashtags: ['小澎的恋爱史', '校园短剧', '搞笑短剧', '青春回忆', '纯中文短剧'],
    platformNotes: {
      小红书: '封面突出“小澎的恋爱史”和五阶段时间线，评论区引导观众说自己最尴尬的校园心动瞬间。',
      抖音: '前三秒直接用“他五岁就开始认真翻车”做钩子，字幕保持短句。'
    }
  };
}

function complianceReport(refs) {
  return {
    status: Object.keys(refs).length >= 5 ? 'pass' : 'warning',
    checks: [
      { id: 'language', status: 'pass', message: '制作包、旁白和字幕均为中文；视频提示词禁止画面内文字。' },
      { id: 'minor_safety', status: 'pass', message: '未成年人阶段只表现清水好感、玩伴关系和尴尬喜剧。' },
      { id: 'character_consistency', status: Object.keys(refs).length >= 5 ? 'pass' : 'warning', message: '五阶段参考图齐备后才能进入图生视频一致性生产。' },
      { id: 'source_use', status: 'pass', message: '网络素材只使用校园母题，不复制原段子。' }
    ]
  };
}

function assetLibrary(refs) {
  return {
    assets: arcs.map((arc) => ({
      id: `xiaopeng_ref_${arc.id}`,
      type: 'character',
      title: `${arc.title}参考图`,
      sourceFile: 'asset_prompts.json',
      summary: refs[arc.id]?.url ? `已生成参考图：${refs[arc.id].url}` : '参考图待生成',
      scope: arc.id,
      createdAt: refs[arc.id]?.generatedAt || new Date().toISOString()
    }))
  };
}

function workspace(refs) {
  const asset = assetPrompts(refs);
  return {
    projectId: 'va_xiaopeng_v2',
    title: '小澎的恋爱史｜三分钟搞笑短剧',
    branch: 'draft/xiaopeng-love-history-v2',
    mode: 'creator',
    activeWorkflow: 'prompt',
    currentTimelineVersion: 1,
    complianceStatus: Object.keys(refs).length >= 5 ? 'pass' : 'warning',
    files: [
      file('.aigc/MEMORY.md', 'markdown', 1, '# 小澎恋爱史制作记忆\n\n- 三分钟，十二个十五秒小节。\n- 每个阶段必须是一段完整关系。\n- 纯中文字幕，画面内不生成文字。\n- 小澎年龄变化但脸部锚点一致。\n'),
      file('brief.json', 'json', 1, json(brief())),
      file('script.md', 'markdown', 1, scriptMarkdown()),
      file('scenes.json', 'json', 1, json(scenes())),
      file('storyboard.json', 'json', 1, json(scenes())),
      file('timeline.json', 'json', 1, json(timeline())),
      file('asset_prompts.json', 'json', 1, json(asset)),
      file('asset_library.json', 'json', 1, json(assetLibrary(refs))),
      file('publish_copy.json', 'json', 1, json(publishCopy())),
      file('compliance_report.json', 'json', 1, json(complianceReport(refs)))
    ]
  };
}

function reviewHtml(refs) {
  const rows = segments
    .map((segment, index) => {
      const ref = byArc(segment.arc, refs);
      return `<tr><td>${index + 1}</td><td>${segment.stage}</td><td>${segment.title}</td><td>${segment.beat}</td><td>${segment.subtitle}</td><td>${ref ? `<a href="${ref}">参考图</a>` : '待生成'}</td></tr>`;
    })
    .join('\n');
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>小澎的恋爱史 V2 制作审查</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; background: #f6f7f5; color: #17221b; }
    main { max-width: 1180px; margin: 0 auto; padding: 32px; }
    h1 { font-size: 34px; margin: 0 0 8px; }
    p { color: #5d6962; line-height: 1.65; }
    .grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin: 24px 0; }
    .card { background: white; border: 1px solid #dfe6e1; border-radius: 8px; padding: 16px; }
    .card strong { display: block; margin-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; background: white; border: 1px solid #dfe6e1; border-radius: 8px; overflow: hidden; }
    th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #edf1ee; vertical-align: top; }
    th { background: #102419; color: white; }
    a { color: #0a8f58; }
  </style>
</head>
<body>
  <main>
    <h1>小澎的恋爱史 V2</h1>
    <p>三分钟，十二段，每段十五秒。五个阶段各有完整恋爱弧线，纯中文后期字幕，画面内不生成任何可读文字。</p>
    <section class="grid">
      ${arcs.map((arc) => `<div class="card"><strong>${arc.title}</strong><p>${arc.result}</p></div>`).join('\n')}
    </section>
    <table>
      <thead><tr><th>段落</th><th>阶段</th><th>标题</th><th>功能</th><th>中文字幕</th><th>参考图</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </main>
</body>
</html>`;
}

async function writePackage(refs) {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const asset = assetPrompts(refs);
  await fs.writeFile(path.join(OUT_DIR, 'production-package.md'), scriptMarkdown());
  await fs.writeFile(path.join(OUT_DIR, 'script.md'), scriptMarkdown());
  await fs.writeFile(path.join(OUT_DIR, 'asset_prompts.json'), json(asset));
  await fs.writeFile(path.join(OUT_DIR, 'workspace.json'), json(workspace(refs)));
  await fs.writeFile(path.join(OUT_DIR, 'review.html'), reviewHtml(refs));
}

async function main() {
  const mode = process.argv[2] || 'write';
  if (mode === 'regenerate-younger') {
    const refs = await readRefs();
    delete refs.middle;
    delete refs.primary;
    delete refs.kindergarten;
    await writeRefs(refs);
  }
  const refs = mode === 'generate-refs' || mode === 'regenerate-younger' ? await generateReferences() : await readRefs();
  await writePackage(refs);
  console.log(
    JSON.stringify(
      {
        outDir: OUT_DIR,
        references: Object.keys(refs).length,
        segments: SEGMENT_COUNT,
        totalSeconds: TOTAL_SECONDS,
        workspace: path.join(OUT_DIR, 'workspace.json')
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
