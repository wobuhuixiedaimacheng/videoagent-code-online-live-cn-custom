const fs = require('node:fs/promises');
const path = require('node:path');

const BASE_URL = process.env.VIDEOAGENT_BASE_URL || 'http://127.0.0.1:3001';
const OUT_DIR = path.join(process.cwd(), 'outputs', 'xiaopeng-love-history-3min');
const MANIFEST_PATH = path.join(OUT_DIR, 'render-manifest.json');
const TOTAL_SECONDS = 180;
const SEGMENT_SECONDS = 15;
const RATE_LIMIT_WAIT_MS = 65000;

const characterAnchor = [
  '同一个中国男孩/青年小澎，圆脸，短黑发，浓眉，笑起来露一颗小虎牙，眼神认真但经常慌张，喜剧感强。',
  '年龄从幼儿园到大学逐渐变化，但脸型、眉眼、小虎牙、害羞挠头动作保持一致。',
  '贯穿红色小物件：幼儿园红书包，小学红铅笔盒，初中红水杯，高中红笔记本，大学红帆布包。',
  '所有画面是清水校园喜剧，不要亲密身体接触，不要成人化未成年人恋爱表达。'
].join(' ');

const visualStyle = [
  '真实手机短剧质感，9:16 竖屏，720p，自然光，明亮校园生活，轻微手持镜头，节奏搞笑但不夸张魔幻。',
  '每段 15 秒，镜头要有开头动作、中间误会、结尾笑点。中文环境，不要英文字幕、英文招牌、英文包装或不可读乱码文字。'
].join(' ');

const negativePrompt = [
  '不要英文字幕，不要英文菜单，不要英文招牌，不要英文包装，不要不可读乱码文字',
  '不要脸部不一致，不要换人，不要多余手指，不要畸形手指，不要未授权名人肖像',
  '不要亲吻，不要拥抱，不要性暗示，不要成人化儿童，不要校园霸凌，不要危险动作'
].join('，');

const segments = [
  {
    id: 'xp_01_kindergarten_candy',
    title: '幼儿园：糖果表白乌龙',
    stage: '幼儿园',
    year: '4 岁',
    voiceover: '小澎第一次心动，是把糖递出去的一瞬间。下一秒，他发现糖纸还没拆。',
    prompt: '幼儿园教室，低矮彩色桌椅，同一个 4 岁小澎背红色小书包，圆脸短黑发小虎牙。他紧张地把一颗糖递给同桌女生，女生刚伸手，小澎又认真地把糖拿回来开始剥糖纸，表情像在做重大手术，旁边小朋友围观偷笑，结尾小澎把剥碎的糖纸递出去，女生一脸疑惑。'
  },
  {
    id: 'xp_02_kindergarten_wedding',
    title: '幼儿园：积木婚礼',
    stage: '幼儿园',
    year: '5 岁',
    voiceover: '他以为恋爱就是结婚。于是他准备了一场全班都没同意的婚礼。',
    prompt: '幼儿园活动区，同一个 5 岁小澎背红色小书包，用积木搭了一个歪歪扭扭的小拱门，认真把玩具戒指放进饭勺里，邀请同桌女生参加“婚礼游戏”。女生开心拿走积木去盖城堡，小澎保持主持人站姿愣住，老师路过忍笑，结尾小澎举着饭勺给玩具熊戴戒指，喜剧收束。'
  },
  {
    id: 'xp_03_primary_eraser',
    title: '小学：借橡皮战略',
    stage: '小学',
    year: '二年级',
    voiceover: '上小学后，小澎学会了搭讪：借橡皮。问题是他一天借了八次。',
    prompt: '小学教室，阳光窗边，同一个 8 岁小澎穿校服，保留圆脸短黑发小虎牙，桌上有红色铅笔盒。他假装写错字，害羞地向前桌女生借橡皮。女生递给他，小澎擦一下马上又写错，再借，再写错，桌面出现一堆橡皮屑。结尾老师拿着超大黑板擦走过来，小澎吓得坐直。'
  },
  {
    id: 'xp_04_primary_love_letter',
    title: '小学：情书交错',
    stage: '小学',
    year: '五年级',
    voiceover: '小澎第一次写情书，格式很工整，收件人很离谱。',
    prompt: '小学走廊，同一个 11 岁小澎穿校服，红色铅笔盒夹在胳膊下，紧张拿着一封粉色信纸。他准备放进女生书包，却被同学一撞，信纸飞进班主任教案夹。班主任在讲台上读到“你的笑像午餐里的鸡腿”，全班憋笑，小澎慢慢把脸埋进书本。'
  },
  {
    id: 'xp_05_middle_seat',
    title: '初中：座位调换灾难',
    stage: '初中',
    year: '初一',
    voiceover: '初中，小澎终于和喜欢的人同桌。只同桌了三分钟。',
    prompt: '初中教室，同一个 13 岁小澎，脸型眉眼和小虎牙一致，穿蓝白校服，桌上红色水杯。老师调座位，小澎被安排到喜欢的女生旁边，他压住笑意坐下，立刻把红水杯碰倒，水沿课本流向女生作业本。女生抬头，小澎手忙脚乱拿袖子擦，结尾老师又把他调到最后一排。'
  },
  {
    id: 'xp_06_middle_sports',
    title: '初中：运动会递水',
    stage: '初中',
    year: '初二',
    voiceover: '他准备在运动会上递水。结果递出了接力赛的速度。',
    prompt: '初中操场，运动会背景，同一个 14 岁小澎穿运动校服，拿着红色水杯，紧张站在跑道边等喜欢的女生跑完。他冲上去递水，却误跟着接力队伍跑了半圈，边跑边举水杯，大家喊加油。结尾女生已经坐在旁边喝同学递的水，小澎喘着气把水递给裁判。'
  },
  {
    id: 'xp_07_highschool_tutoring',
    title: '高中：补课心动',
    stage: '高中',
    year: '高一',
    voiceover: '高中后，小澎决定靠学习吸引人。可惜数学先吸引了他的眼泪。',
    prompt: '高中晚自习教室，同一个 16 岁小澎，短黑发浓眉小虎牙，穿高中校服，桌上红色笔记本。女生给他讲数学题，小澎认真点头，镜头推进到他笔记本，上面画满“我懂了”的小表情但公式全错。女生问懂了吗，小澎自信点头，下一秒把答案写成自己的名字，喜剧停顿。'
  },
  {
    id: 'xp_08_highschool_broadcast',
    title: '高中：广播站告白事故',
    stage: '高中',
    year: '高二',
    voiceover: '他终于鼓起勇气录告白。学校广播也很有勇气，直接全校播放。',
    prompt: '高中广播站，同一个 17 岁小澎拿着红色笔记本，对着话筒练习表白台词，脸红但认真。朋友误按播放键，走廊、操场、教室里的同学同时抬头听见“我想和你一起背单词”。小澎震惊捂住话筒，广播站玻璃外校长路过停住，结尾小澎装作维修设备。'
  },
  {
    id: 'xp_09_gaokao_graduation',
    title: '高考后：毕业合影',
    stage: '高中毕业',
    year: '高三',
    voiceover: '毕业那天，他想留下青春。摄影师留下了他的后脑勺。',
    prompt: '高中毕业校园，黄昏走廊，同一个 18 岁小澎穿校服外套，抱着红色笔记本，想和喜欢的女生合影。他调整发型露出小虎牙，倒计时拍照时被一群同学挤到镜头边缘，只剩半张脸和红笔记本入镜。女生笑着把照片给他看，小澎先尴尬后跟着大笑，青春喜剧感。'
  },
  {
    id: 'xp_10_college_club',
    title: '大学：社团招新',
    stage: '大学',
    year: '大一',
    voiceover: '上大学后，小澎决定成熟一点。成熟的第一步，是报了三个恋爱相关社团。',
    prompt: '大学社团招新广场，同一个 19 岁小澎成长为青年，仍然圆脸浓眉小虎牙，背红色帆布包。他在电影社、舞蹈社、辩论社摊位之间来回纠结，看到心动女生在电影社登记，他假装淡定走过去，却把自己名字写到“失物招领志愿者”表上，工作人员给他一堆钥匙，喜剧尴尬。'
  },
  {
    id: 'xp_11_college_date',
    title: '大学：第一次约会',
    stage: '大学',
    year: '大二',
    voiceover: '他终于约到了人。只是地点选得太像期末考试。',
    prompt: '大学图书馆门口，同一个 20 岁小澎背红色帆布包，穿干净卫衣，脸型眉眼小虎牙一致。他和女生约会，手里拿两杯奶茶，却把地点选在安静自习区。两人小声聊天，每句话都被旁边同学“嘘”。小澎想浪漫递奶茶，吸管包装响得像鞭炮，整排同学回头，结尾两人忍笑逃出图书馆。'
  },
  {
    id: 'xp_12_college_recap',
    title: '大学：恋爱史收束',
    stage: '大学',
    year: '大四',
    voiceover: '从糖纸到奶茶，小澎终于明白，恋爱不是不翻车，而是翻车后还能一起笑。',
    prompt: '大学操场夜晚，温暖灯光，同一个 22 岁小澎背红色帆布包，圆脸浓眉小虎牙保持一致。他和女生坐在看台上翻看从幼儿园糖纸、小学情书、红水杯、红笔记本到大学照片的小物件，画面快速闪回前面各阶段的搞笑瞬间。女生笑，小澎害羞挠头，最后两人一起看向操场灯光，温暖搞笑收束。'
  }
];

function fullPrompt(segment, index) {
  return [
    `第 ${index + 1}/12 段，3 分钟搞笑短剧《小澎的恋爱史》，本段 15 秒。`,
    characterAnchor,
    visualStyle,
    `本段标题：${segment.title}。阶段：${segment.stage}，年龄：${segment.year}。`,
    `旁白节奏：${segment.voiceover}`,
    `画面任务：${segment.prompt}`,
    '镜头语言：开头 3 秒建立场景，中间 8 秒制造误会，最后 4 秒给反应笑点；保持小澎同一人物，只随年龄自然变化。'
  ].join('\n');
}

async function readManifest() {
  try {
    return JSON.parse(await fs.readFile(MANIFEST_PATH, 'utf8'));
  } catch (_) {
    return {
      title: '小澎的恋爱史',
      targetDurationSeconds: TOTAL_SECONDS,
      segmentDurationSeconds: SEGMENT_SECONDS,
      segmentCount: segments.length,
      formula: `${TOTAL_SECONDS}s / ${SEGMENT_SECONDS}s = ${segments.length} 段`,
      characterAnchor,
      visualStyle,
      negativePrompt,
      segments: segments.map((segment, index) => ({
        ...segment,
        index: index + 1,
        durationSeconds: SEGMENT_SECONDS,
        prompt: fullPrompt(segment, index),
        render: { status: 'pending' }
      }))
    };
  }
}

async function writeManifest(manifest) {
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  await fs.writeFile(
    path.join(OUT_DIR, 'script.md'),
    [
      '# 小澎的恋爱史｜3 分钟搞笑短剧',
      '',
      `目标时长：${TOTAL_SECONDS} 秒。单段最长：${SEGMENT_SECONDS} 秒。生产拆分：${segments.length} 段。`,
      '',
      '## 人物一致性',
      characterAnchor,
      '',
      '## 12 段脚本',
      ...manifest.segments.flatMap((segment) => [
        '',
        `### ${String(segment.index).padStart(2, '0')}｜${segment.title}（${segment.durationSeconds}s）`,
        `阶段：${segment.stage} / ${segment.year}`,
        `旁白：${segment.voiceover}`,
        `画面：${segments[segment.index - 1].prompt}`
      ])
    ].join('\n')
  );
  await fs.writeFile(
    path.join(OUT_DIR, 'concat-list.txt'),
    manifest.segments
      .filter((segment) => segment.render?.localFile)
      .map((segment) => `file '${segment.render.localFile}'`)
      .join('\n')
  );
}

async function submitSegment(segment) {
  const response = await fetch(`${BASE_URL}/api/video/render`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      prompt: segment.prompt,
      negativePrompt,
      spec: {
        aspectRatio: '9:16',
        resolutionTier: '720p',
        generationMode: 'text_to_video',
        targetDurationSeconds: SEGMENT_SECONDS,
        frameRate: 24,
        numFrames: 361,
        episodeSegmentSeconds: SEGMENT_SECONDS,
        episodeSegmentCount: segments.length,
        episodeTotalSeconds: TOTAL_SECONDS
      }
    })
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok || body.ok === false) {
    throw new Error(`${segment.id} submit failed: ${body.error || text || response.status}`);
  }
  return {
    submittedAt: new Date().toISOString(),
    status: body.status || 'submitted',
    progress: body.progress || 0,
    taskId: body.task_id || '',
    videoId: body.video_id || '',
    videoUrl: body.videoUrl || '',
    raw: body.raw || body
  };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function submitSegmentWithRetry(segment) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await submitSegment(segment);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/rate limit|rate_limit/i.test(message) || attempt === 3) throw error;
      console.log(`rate limited, wait ${Math.round(RATE_LIMIT_WAIT_MS / 1000)}s before retry ${attempt + 1}: ${segment.id}`);
      await wait(RATE_LIMIT_WAIT_MS);
    }
  }
  throw new Error(`${segment.id} submit failed after retries`);
}

async function pollSegment(segment) {
  const videoId = segment.render?.videoId;
  if (!videoId) return segment.render;
  const response = await fetch(`${BASE_URL}/api/video/render?video_id=${encodeURIComponent(videoId)}`);
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok || body.ok === false) {
    return {
      ...segment.render,
      status: 'failed',
      error: body.error || text || String(response.status),
      checkedAt: new Date().toISOString()
    };
  }
  return {
    ...segment.render,
    checkedAt: new Date().toISOString(),
    status: body.status || segment.render.status,
    progress: Number.isFinite(Number(body.progress)) ? Number(body.progress) : segment.render.progress || 0,
    videoUrl: body.videoUrl || segment.render.videoUrl || '',
    normalizedVideoId: body.video_id || '',
    rawStatus: body.raw || body
  };
}

async function main() {
  const mode = process.argv[2] || 'submit-missing';
  const manifest = await readManifest();

  if (mode === 'submit-missing') {
    for (const segment of manifest.segments) {
      if (segment.render?.videoId) continue;
      console.log(`submit ${String(segment.index).padStart(2, '0')} ${segment.title}`);
      segment.render = await submitSegmentWithRetry(segment);
      await writeManifest(manifest);
    }
  }

  if (mode === 'poll' || mode === 'submit-missing') {
    for (const segment of manifest.segments) {
      if (!segment.render?.videoId || segment.render.videoUrl) continue;
      console.log(`poll ${String(segment.index).padStart(2, '0')} ${segment.title}`);
      segment.render = await pollSegment(segment);
      await writeManifest(manifest);
    }
  }

  const completed = manifest.segments.filter((segment) => segment.render?.videoUrl).length;
  const failed = manifest.segments.filter((segment) => segment.render?.status === 'failed').length;
  console.log(JSON.stringify({
    manifest: MANIFEST_PATH,
    total: manifest.segments.length,
    submitted: manifest.segments.filter((segment) => segment.render?.videoId).length,
    completed,
    failed,
    pending: manifest.segments.length - completed - failed
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
