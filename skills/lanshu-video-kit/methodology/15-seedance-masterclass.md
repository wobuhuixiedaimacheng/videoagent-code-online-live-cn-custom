# 15 · Seedance 2.0 Masterclass — 10 YouTube 视频精炼

> 整合 10 个 YouTube 教学视频(累计播放量 500K+)的方法论 + 真实提示词。
> 全部标注 video ID 可点击。**禁止编造**,所有内容均逐字提取自视频字幕或文档区。

---

## 完整公式(9 要素)

来源:[tZReV23ncuc](https://www.youtube.com/watch?v=tZReV23ncuc) — *The ULTIMATE Seedance 2.0 Prompting Guide*

```
Subject + Action + Scene + Camera + Lighting + Style + Audio + Quality Suffix + Constraints
```

### 三个难度级别(都用足球场景演示)

**Level 1 — Easy(单图 + 一段描述)**
```
Image 1 as the first frame. The boy in a blue jersey dribbles forward.
Medium tracking shot. Warm afternoon sunlight. Cinematic texture with film grain.
[Audio:] boots on grass, ball thud, crowd murmur.
4K, ultra HD, rich detail, sharp clarity, cinematic textures, stable picture.
Maintaining face and clothing consistency without distortion or high detail.
Generate the video without subtitles.
```

**Level 2 — Medium(Multi-shot,带时间戳)**
```
Shot 1 [0s–5s]: Boy dribbles past a defender. Medium tracking shot.
  Audio: boots on grass.
Shot 2 [5s–10s]: He strikes a pass. Wide shot.
  Audio: crack of the ball.
Shot 3 [10s–15s]: Ball sails into the distance. Close-up.
  Audio: crowd building.
```

**Level 3 — Hard(双图 Start+End Frame + 5-shot)**
```
Image 1 (first frame): Player receives a pass, ball at his feet.
Image 2 (last frame): Ball hitting the back of the net.

Shot 1: Tracking shot moving backwards as he runs at us.
Shot 2: Low-angle wide with a whip pan following his direction change.
  Audio: ball on grass.
Shot 3: Tight side tracking shot with slight orbit as he nutmegs a defender.
  Audio: crowd swell.
Shot 4: Close-up with a rack focus — shifts from his face to the goalkeeper.
  Audio: crowd gasp, heartbeat.
Shot 5: Dolly in following the ball into the net.
  Audio: eruption.
```

### ⭐ 质量后缀(每条 prompt 都要加)

```
4K, ultra HD, rich detail, sharp clarity, cinematic textures, stable picture.
Maintaining face and clothing consistency without distortion or high detail.
Generate the video without subtitles.
```

---

## Timeline Prompting(时间轴提示词法)

来源:[ZghLm9MXVIY](https://www.youtube.com/watch?v=ZghLm9MXVIY) *Full Course* · [lkL8mlpVScY](https://www.youtube.com/watch?v=lkL8mlpVScY) *Master in 25min*

### 结构

```
[前半:上下文]
- Subject(主体:外貌、服装)
- Wardrobe(服装细节)
- Environment(环境)
- Mood(情绪基调)
- Music(背景音乐)
- Color logic(色彩逻辑)
- Style(风格)

[后半:逐 Shot 描述]
[0s–2s] Shot 1: ...
[2s–5s] Shot 2: ...
...(15s 内最多 10 个 shot)
```

### 关键技巧

- 每个 shot 加 **timestamp**,模型理解节奏
- 上传图片用 **`@image1` / `@image2`** 标签(Higgsfield 中 `@` 触发媒体选择)
- 太多细节 AI 会跳过 → 适当精简
- **Rule(规则语)**:把反复出错的固化为约束
  ```
  RULE: The selected card must always be an ace of hearts.
  RULE: The woman in the red dress is the one who plays the card back.
  ```
- **Negative Prompt**:排除不需要元素

---

## 角色一致性方法论(5 步)

来源:[ZghLm9MXVIY](https://www.youtube.com/watch?v=ZghLm9MXVIY) · [lkL8mlpVScY](https://www.youtube.com/watch?v=lkL8mlpVScY) · [DqWmHvIIcww](https://www.youtube.com/watch?v=DqWmHvIIcww)

### Step 1: 制作角色表(Character Sheet)

用 **Nano Banana 2** 生成多角度角色图:
```
Create multiple different angles of this character: front-facing, left profile,
right profile, back of the head, side of the head. Clean white background.
```

头盔场景另做带头盔版本:
```
Add the same astronaut helmet to all of the images.
Make sure the face is still visible, no light reflection on the helmet.
```

### Step 2: GPT Image 2 vs Nano Banana

- **GPT Image 2 效果更好**(作者明确推荐)
- 输入一张**高清正面自拍** → GPT Image 2 生成多角度
- ⚠️ 远景模糊的照片效果差 — AI 会填猜测细节,导致脸不像

### Step 3: 换装不换脸

```
But change his outfit to [服装描述].
```
示例:`But change his outfit to old-fashioned priest outfit.`

### Step 4: 更新角色表

每当角色**换装、脸部有变化**,必须重新制作角色表。
常见错误:不更新 → 后续场景前后不一致。

### Step 5: 角色数量限制

- 超过 **3 个角色** 容易出错(错位、融合)
- 单 shot 最多 **2-3 个主要角色**

---

## 5 种爆款视频格式

来源:[PsQovs2FwqQ](https://www.youtube.com/watch?v=PsQovs2FwqQ) — *Complete Breakdown: Every Format Going Viral*

### Format 1 — Transformation(变形)

**核心结构**:`Normal → Chaos → Back to Normal`

示例:女孩吃汉堡 → 怪物袭击 → 女孩继续吃汉堡

**要点**:
- 反差 + 短时间 = 算法友好(反复观看)
- I2V 适合固定角色;T2V 适合一次性病毒视频
- 怪物要真实感:加 **`No 3D, no cartoon, no VFX`**

### Format 2 — Orbs / First-Person Power Fantasy

**核心**:持续第一视角 + 手部特效 + 物理感
**Seedance 优势**:几乎唯一稳定保持第一视角的模型(手部可见 + 反应真实)

### Format 3 — POV(主观镜头)

**核心约束(必加)**:
```
No cuts, no zooms, natural head movement only.
```
不加这行 → Seedance 默认切换摄像角度 → 打破沉浸感

### Format 4 — Fight Scenes(格斗)

- Seedance 能自动生成风格、张力、编排,不只是动作
- 用 Claude 增强 prompt → 超长详细分镜
- **避坑**:角色数量 ≤ 3,否则鬼影或动作错乱

### Format 5 — Animation(动画)

极简 prompt 也能出大片:
```
fight over 3D person with a TV person
```
输出:完整格斗场景 + 自定义角色 + 地点 + 慢动作 — 全部 AI 自创

**动画迁移**:上传参考视频 + 自己角色图,Seedance 把动作迁移到指定角色。

---

## VFX / 特效技巧

来源:[PypS8xF5lfo](https://www.youtube.com/watch?v=PypS8xF5lfo) · [tYJQusOS2jI](https://www.youtube.com/watch?v=tYJQusOS2jI) · [rXtuzDMLa_Y](https://www.youtube.com/watch?v=rXtuzDMLa_Y) · [MOkjfFIIb6E](https://www.youtube.com/watch?v=MOkjfFIIb6E)

### VFX 插入(在自己真实视频里加特效)

**工作流**:拍摄手机视频 → 截关键帧 → 上传 Seedance + 描述效果

**示例**:
```
As soon as the car door opens in the video, a zombie starts to crawl out of the car.
```
```
the arm and hand in @video_1 start to get covered in shiny black goo, black tendrils crawl up the arm
```

### 视频转视频(V2V)

```
Have video 2 be on the monitor screen of video 1.
```

### 浮动 3D 文字(替代 After Effects)

上传 location 图 + 3D 文字 reference,prompt:
```
Add this text floating in 3D inside the scene.
There should be a shadow underneath the text where it's floating.
```

### Bullet Time(冻结环绕)

**核心动作**:相机在冻结的时间里 orbit 主体

**Snap Stop-Time(原创者 Chris First):**
```
Arri Alexa Mini, 35mm lens.
[0s–3s]: Subject walking forward naturally.
[At the snap]: A subtle spherical shockwave bursts from his fingertips,
  time freezes instantly, camera orbits 180° around the frozen moment.
[5s–15s]: Camera slowly explores the frozen scene, then time resumes.
```

### Speed Ramp(慢动作)

```
Frame rate ramps from 24fps to 48fps then into slow motion.
Core illusion: [描述镜头的视觉把戏].
```

---

## 多模态输入(Omni Reference)

来源:[tYJQusOS2jI](https://www.youtube.com/watch?v=tYJQusOS2jI) · [lkL8mlpVScY](https://www.youtube.com/watch?v=lkL8mlpVScY)

**Omni Reference = 同时上传多个"原料":**
- Character sheet(角色表)
- Location image(场景)
- Second character sheet
- Object / product image
- Audio file

**在 Higgsfield prompt 框用 `@` 标签引用:**
```
@image1 character (young man in blue jacket) enters the restaurant.
@image2 character (woman in red dress) is already seated.
@image3 (fortune cookie) is placed on the table between them.
```

**Audio + Character + Video 三合一**:
1. Higgsfield Audio 模块生成 15 秒对话音频
2. 上传:角色图 + 角色图 + 音频文件
3. prompt 里写出角色台词
4. Seedance 自动做口型同步

---

## Start Frame / End Frame 用法

来源:[ZghLm9MXVIY](https://www.youtube.com/watch?v=ZghLm9MXVIY) · [MOkjfFIIb6E](https://www.youtube.com/watch?v=MOkjfFIIb6E) · [tZReV23ncuc](https://www.youtube.com/watch?v=tZReV23ncuc)

### Start Frame 最佳用法

生成有某个好镜头 → **截图该帧** → 作为下一段 start frame 重新生成 → 制作长视频的核心方法。

### First Frame + Last Frame = "填中间"

来源:[MOkjfFIIb6E](https://www.youtube.com/watch?v=MOkjfFIIb6E)(原创者 Framer)

**极简 Prompt**:
```
Show me what happens in between. Use multiple camera angles.
```

两张图(开始帧 + 结束帧)上传,Seedance 自动创造中间叙事。

---

## 省 Credits 策略

来源:[lkL8mlpVScY](https://www.youtube.com/watch?v=lkL8mlpVScY) — *Stop Wasting Credits*

| 场景 | 建议 |
|---|---|
| 测试新 prompt | **480p** + **4s** 最省 |
| 基本确定 prompt,看质量 | **720p** |
| 最终输出 | **1080p** |

**口诀**:480p 测 prompt → 720p 看质量 → 1080p 出成品

---

## 绕过人脸检测限制

来源:[PypS8xF5lfo](https://www.youtube.com/watch?v=PypS8xF5lfo) · [VIIyjq5DI0I](https://www.youtube.com/watch?v=VIIyjq5DI0I) · [DqWmHvIIcww](https://www.youtube.com/watch?v=DqWmHvIIcww)

### 方法 1:2×2 人脸网格(通用)

```
Create a 2x2 grid of this person's face with different angles.
```
上传网格图而非单张人脸 → 大多数通过审核

### 方法 2:Character Sheet 降真实度(Dreamina / CapCut 专用)

**Step 1 — Nano Banana 处理:**
```
Convert this character sheet into a slightly stylized game character render.
Keep the face highly recognizable. Preserve facial features, bone structure,
realistic proportions, and subtle skin detail. Reduce photorealism slightly.
```

**Step 2 — 视频 prompt 补回真实感关键词:**
```
photorealistic live action, lifelike, realistic skin texture, hyperrealistic skin texture
```

核心逻辑:character sheet 看起来像游戏角色(过审)→ prompt 关键词让输出仍写实。

---

## 视频延伸与接续

来源:[PypS8xF5lfo](https://www.youtube.com/watch?v=PypS8xF5lfo)

### 基础延伸

```
Extend.
```

加剧情:
```
Extend the video. He farts and she gets angry.
```

### 角色 + 声音一致性接续

上传上一段视频 + 新 prompt + 新剧情 → Seedance 读取角色外观和声音风格,保持一致续写。

**理论上可无限接续 → 制作长视频系列**

---

## Claude Skill 辅助提示词生成

来源:[tYJQusOS2jI](https://www.youtube.com/watch?v=tYJQusOS2jI) · [lkL8mlpVScY](https://www.youtube.com/watch?v=lkL8mlpVScY)

**使用方式**:
1. 下载视频描述里的 Claude Skill(Video Prompt Builder)
2. Claude 里安装:Customize → Skills → + → Create Skill → Upload
3. 把 start frame 图片 + 自然语言描述发给 Claude
4. Claude 自动生成帧级别详细 prompt(含 hex 色彩、粒子、摄影术语)

### 字符数限制

- Seedance 限制:**≤ 4000 字符**(Higgsfield ≤ 3000-3500)
- 超限处理:`Make this under 3000 characters. [粘贴长 prompt]`
- **终极省字技巧**:`Translate this prompt into Chinese.` — 中文版字符数大幅减少且 Seedance 能理解

---

## 实战避坑清单

| 问题 | 解决方案 | 来源 |
|---|---|---|
| 同一角色多镜头脸不一致 | 每次换装/换场景更新角色表 | ZghLm9MXVIY |
| 头盔场景头盔突然消失 | 用带头盔的角色表作 start frame | ZghLm9MXVIY |
| 多角色出现两个自己 | Start frame 包含所有角色明确位置 | ZghLm9MXVIY |
| 超过 3 个角色 → 崩坏 | 单场景最多 2-3 个主角 | lkL8mlpVScY |
| POV 中途切换视角 | 加 `No cuts, no zooms, natural head movement only` | PsQovs2FwqQ |
| 怪物/皮肤太塑料 | 加 `No 3D, no cartoon, no VFX` | PsQovs2FwqQ |
| 视频上传失败 | HandBrake 压成标准 MP4 | PypS8xF5lfo |
| 人脸上传被拒 | 2×2 网格 / 降真实度角色表 | DqWmHvIIcww |
| Prompt 超字符限制 | 翻译成中文 / Claude 压缩 | MOkjfFIIb6E |
| AI 乱切镜头 | 加 `This is one continuous take. No multiple camera angles.` | lkL8mlpVScY |
| 生成不理想 | 多次 regenerate,取最好片段拼接 | ZghLm9MXVIY |
| 音频太模糊 | 不要说"sound effects",说具体音效:`metallic clink of a coin hitting a stone` | tZReV23ncuc |

---

## 可直接复制的 Prompt 模板

### 模板 A:爆款变形视频

```
[主角描述] is [正常行为].
A [威胁元素] suddenly [攻击行为].
[主角] immediately [夸张应对].
[主角] then returns to [正常行为], completely unbothered.
No 3D, no cartoon, no VFX. Ultrarealistic.
4K, stable picture, maintaining character consistency.
```

### 模板 B:第一视角力量幻想

```
First-person POV. Location: @image1.
[能量类型, e.g., ice powers / electric powers].
[威胁出现].
Hands crackle with [能量], [攻击方式].
No cuts, no zooms, natural hand movement only.
Ultrarealistic, 4K, stable picture.
```

### 模板 C:多镜头时间轴

```
Subject: [角色描述] (@image1 as reference)
Environment: [场景]
Mood: [情绪]
Color logic: [色彩]
Style: cinematic, [风格]

Shot 1 [0s–3s]: [动作]. [Camera]. Audio: [具体音效].
Shot 2 [3s–8s]: [动作]. [Camera]. Audio: [...].
Shot 3 [8s–15s]: [动作]. [Camera]. Audio: [...].

4K, ultra HD, rich detail, sharp clarity, cinematic textures, stable picture.
Maintaining face and clothing consistency without distortion.
Generate the video without subtitles.
```

### 模板 D:角色表降真实度(绕过人脸过滤)

**Nano Banana 处理:**
```
Convert this character sheet into a slightly stylized game character render.
Keep the face highly recognizable. Preserve facial features, bone structure,
realistic proportions, and subtle skin detail. Reduce photorealism slightly.
```

**视频 prompt 必加关键词:**
```
photorealistic live action, lifelike, realistic skin texture
```

### 模板 E:Bullet Time

```
@image1 as first frame.
Arri Alexa Mini, 35mm lens.
[0s–2s]: Subject [动作].
[2s–8s]: At [高潮动作], time freezes.
  Camera orbits 180° slowly around the frozen scene.
  Spherical shockwave ripples outward.
[8s–15s]: Time resumes, [后续动作].
Ultrarealistic, 4K, cinematic textures, stable picture.
```

### 模板 F:视频延伸接续

```
[Upload: 上一段视频]
Extend the video. [描述接下来发生的事].
Maintain the same characters, voices, and visual style.
```

### 模板 G:First/Last Frame 叙事生成

```
[Upload: image1 = 起始帧]
[Upload: image2 = 结束帧]
Show me what happens in between. Use multiple camera angles.
```

### 模板 H:产品广告

```
@image1 (product) @image2 (character/talent) @image3 (location)
Create a product ad for @image1.
[Shot 1, 0s–5s]: Character picks up product, examines with curiosity.
[Shot 2, 5s–10s]: Close-up of product features.
[Shot 3, 10s–15s]: Character uses product, reacts positively.
Influencer style, warm lighting, cinematic.
4K, stable picture, maintaining product and character consistency.
```

---

## 视频来源索引(权威源清单)

| ID | 标题 | 播放量 | 核心贡献 |
|----|------|--------|----------|
| [ZghLm9MXVIY](https://www.youtube.com/watch?v=ZghLm9MXVIY) | Full Course | 106K | 角色表 / Timeline / Cinema Studio 3.0 |
| [PsQovs2FwqQ](https://www.youtube.com/watch?v=PsQovs2FwqQ) | Every Format Going Viral | 93.6K | 5 种爆款 / POV 约束 / 极简 prompt |
| [PypS8xF5lfo](https://www.youtube.com/watch?v=PypS8xF5lfo) | 100+ Prompts | 81.6K | 动作迁移 / 产品广告 / VFX / 延伸 |
| [VIIyjq5DI0I](https://www.youtube.com/watch?v=VIIyjq5DI0I) | Bypass Face (CapCut) | 64.9K | CapCut / 角色表绕过人脸 |
| [lkL8mlpVScY](https://www.youtube.com/watch?v=lkL8mlpVScY) | Master in 25min | 52.6K | 省 Credits / Claude MD / 质量后缀 |
| [tYJQusOS2jI](https://www.youtube.com/watch?v=tYJQusOS2jI) | Full Prompting Tutorial | 50.9K | Claude Skill / Omni Reference / 3D 文字 |
| [tZReV23ncuc](https://www.youtube.com/watch?v=tZReV23ncuc) | ULTIMATE Guide | — | 9 要素 / 三难度 / 声音技巧 |
| [MOkjfFIIb6E](https://www.youtube.com/watch?v=MOkjfFIIb6E) | Insane Prompts & Tricks | 36.9K | Snap 时停 / First-Last Frame / Speed Ramp |
| [rXtuzDMLa_Y](https://www.youtube.com/watch?v=rXtuzDMLa_Y) | 50 Prompts | 22.1K | Bullet Time / Multi-shot 标注 |
| [DqWmHvIIcww](https://www.youtube.com/watch?v=DqWmHvIIcww) | 50 Viral Prompts | — | 50 个 prompt 案例 / 降真实度 |

**Higgsfield 官方 prompt 文档**:
- [seedance-2-0-higgsfieldai](https://higgsfield.ai/s/seedance-2-0-higgsfieldai-kQBLPo)
- [100+ Prompts Google Doc](https://docs.google.com/document/d/1DyulbGoZMY0dfXQrrph0KThf9XzmGU7Ceo7HFdyFbns/edit)
- [50 Viral Google Doc](https://docs.google.com/document/d/1Q9-oa6zlZeg4eq5xn_axpApuWdcczj60GDG_Fpd27Bk/edit)

**ChatGPT/Gemini 辅助工具(免登录)**:
- ChatGPT 版:[Noble Goose Seedance 2.0 Prompt Generator](https://chatgpt.com/g/g-699c708c68fc8191ba77c93e558043c2-noble-goose-seedance-2-0-prompt-generator)
- Gemini 版:[Gemini Gem](https://gemini.google.com/gem/1V9B8SGPytX0E3oz0DVzYpq3RAiHa87Bl)

---

## 与本仓库其他文档的关系

- 基础公式 → [02-进阶公式.md](02-进阶公式.md)(火山方舟 8 要素 + 本文 9 要素互补)
- 分镜时序 → [03-分镜时序.md](03-分镜时序.md)
- 运镜词典 → [05-运镜词典.md](05-运镜词典.md)
- 约束词清单 → [06-约束词清单.md](06-约束词清单.md)
- 特殊字符规范 → [07-特殊字符规范.md](07-特殊字符规范.md)
- 避坑 12 问 → [08-避坑12问.md](08-避坑12问.md)

本文档专门聚焦 **YouTube 实战社区**的方法,与 Atlas Cloud / Imagine.art / 火山方舟官方公式形成三角验证。
