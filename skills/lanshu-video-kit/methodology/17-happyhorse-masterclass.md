# 17 · HappyHorse 1.0 Masterclass — 7+ YouTube 视频精炼

> 整合 30 个 YouTube 教学视频 + Alibaba Cloud 官方 Google Doc 的方法论 + 真实提示词。
> 全部标注 video ID 可点击。**禁止编造**,所有内容均逐字提取自视频字幕或官方原文档。
>
> HappyHorse 是阿里巴巴 ATH 部门 2025 年 11 月发布的 AI 视频模型,由前快手 VP **张迪(Kling 1.0/2.0 架构师)**带队;15B 参数 Unified Single Stream Transformer,**原生音视频联合生成**(无需后期对齐)。

---

## 目录

1. 核心公式(6 要素黄金公式 / 五要素补充)
2. 单镜头 20 词规则与垃圾词过滤
3. 情绪转物理动作规则
4. 参考图系统(@tag Omni Reference)
5. 多镜头 Timeline Prompting(时间码分段)
6. 音频工程(AUDIO 区块 / 多语言 Lip-Sync)
7. 三种生成模式(I2V / T2V / R2V)对比
8. 工作流(GPT Image 2 + Storyboard + 分段长视频)
9. HappyHorse vs Seedance 2.0 / Veo 3.1 差异化(必读)
10. 实战避坑清单
11. 可直接复制的 Prompt 模板
12. 视频来源索引

---

## 1. 核心 Prompt 公式(6 要素黄金公式)

来源:[4hhpIyznnaw](https://www.youtube.com/watch?v=4hhpIyznnaw) — *Happy Horse is Better Than Seedance 2.0, But ONLY If You Do This!*

**完整公式:**
```
[Subject] + [Action] + [Environment] + [Style] + [Camera] + [Audio]
```

**单镜头模板(原文):**
```
[Subject] is [Action] in [Scene/Environment]. [Camera Movement], [Style/Composition]. AUDIO: [Audio/Ambiance].
```

**带参考图版本(原文):**
```
Reference @character1 for the [Subject]'s appearance, and @Image2 for the environment.
Fully reference @Video1 for all camera movements and character actions.
[Subject] is [Action] in [Scene/Environment]. [Camera Movement], [Style/Composition].
AUDIO: [Audio/Ambiance].
```

**多镜头版本(带时间码,原文):**
```
Reference Setup: Use @character1 for the main character's appearance, @Image2 for the setting,
and fully reference @Video1 for camera motion and pacing. Preserve character appearance from input image.
Scene Setup: [Overall environment, lighting, and global style details]
SHOT 1 (0:00-0:05): [Camera angle/movement]. @character1 does [first action].
SHOT 2 (0:06-0:10): [New camera angle/movement]. @character1 does [next action].
AUDIO: [Specific background sounds, foley effects, and exact "dialogue in quotes"]
```

### 五要素补充版(摄像机优先)

来源:[SkjumXCTnbQ](https://www.youtube.com/watch?v=SkjumXCTnbQ) — *Tips for the Most Cinematic Camera Movement in TopMediai*

```
Subject + Action/Transformation + Environment + Camera + Atmosphere/Lighting
```

核心洞察(原文):
> "The biggest problem with AI video is not quality but direction. Most people just write 'a robot walking in city cinematic' and hope it turns out cool."

**摄像机关键词完整清单(原文逐字):**
```
cinematic tracking shot · FPV drone shot · orbit camera · handheld realism
slow push in · impossible camera transition · weight angle lens · anamorphic lens
```

---

## 2. 单镜头 20 词规则与"垃圾词"过滤

来源:[4hhpIyznnaw](https://www.youtube.com/watch?v=4hhpIyznnaw) · [JVWTwKrus9c](https://www.youtube.com/watch?v=JVWTwKrus9c)

简单单镜头保持在 **20 词以内**,覆盖:主体 + 动作 + 场景 + 摄像机。超过反而导致空间混乱。

> "Don't use ChatGPT/Claude to write 3000-word prompts. Happy Horse breaks down when prompts get too verbose."

### 禁用"垃圾词"(Slop Words)

删除:`beautiful` / `epic` / `stunning` / `masterpiece`

换成具体描述:
- `beautiful lighting` → `golden hour sidelighting`
- `epic atmosphere` → `neon reflections on wet pavement`

### 渐进动作原则

来源:[SkjumXCTnbQ](https://www.youtube.com/watch?v=SkjumXCTnbQ)
> "The important tip is not to give too many actions at once. AI is more stable if the action is gradual."

---

## 3. 情绪转物理动作规则

来源:[4hhpIyznnaw](https://www.youtube.com/watch?v=4hhpIyznnaw)

HappyHorse **不理解抽象情绪**,必须转换为具体物理动作:

| 错误写法 | 正确写法 |
|---------|---------|
| `He feels conflicted.` | `He slowly turns to the camera and narrows his eyes.` |
| `A lonely man full of regret.` | `A man staring at an empty glass with slumped shoulders.` |
| `A girl feeling lost.` | `Close-up of a woman with a neutral face and a very slow blink.` |
| `He is sad.` | `He looks down and blinks slowly.` |

### 对话场景的"附加动作"优势

来源:[L7hUBvxYEo8](https://www.youtube.com/watch?v=L7hUBvxYEo8) — *Stop Wasting Money on AI Videos*

HappyHorse 在多角色对话中会自动加入"小动作":
> "When the character drinks coffee, he doesn't just mechanically pick up the cup and drink; he also gives the other person a glance. This small gesture is actually very important because it makes the scene feel like a moment that would happen in real life."

**连续动作的三要素规则:**
1. **动作顺序**:必须明确列出每个小动作的先后顺序,而非笼统描述氛围
   - 示例:`look down at the phone → look up at the other person → take a sip of coffee while briefly glancing at them → put the cup down`
2. **镜头与空间**:气氛感用中景/特写;情节清晰用侧前方中景,保留桌子和对面人物
3. **另一方的反应**:多角色场景必须明确描述对方行为

---

## 4. 参考图系统(@tag Omni Reference)

来源:[4hhpIyznnaw](https://www.youtube.com/watch?v=4hhpIyznnaw) · [_Y4siSt-dG8](https://www.youtube.com/watch?v=_Y4siSt-dG8) — *Alibaba's New AI Video Model Tested*

### 核心规则(The Ultimate Happy Horse Checklist — 原文)

1. **每张参考图只放一个主体**(不需要多角度角色表,一张正面干净图即可)
2. **上传了参考图后,不要在 prompt 里描述外观**——AI 已经看到了,字数留给动作和摄像机
3. **标签方式**:`@character1`、`@character2`(主体),`@Image3`(环境),`@Video1`(动作/摄像机)
4. **最多支持 9 个参考图**
5. **环境参考图里不要放主角**——让 AI 专注背景本身
6. **特定道具**(如自行车)也要单独一张参考图

### 已知限制

来源:[JVWTwKrus9c](https://www.youtube.com/watch?v=JVWTwKrus9c)
- 当前仅支持首帧(无尾帧)
- 宽高比:9:16 到 16:9
- 最长 15 秒
- 最多 4 个并发生成

### 多角色对话中的 @tag 分配逻辑(Timeline Mapping)

来源:[4hhpIyznnaw](https://www.youtube.com/watch?v=4hhpIyznnaw)

HappyHorse 的音频分配基于 **action 块的出现顺序**:谁先出现在动作描述里,就自动匹配第一句引号对话。

```
@image2 runs up. @image1 turns her head back.
→ 自动分配:第一句引号 → @image2,第二句引号 → @image1
```

### 平台变体

来源:[aKjV3iL0Nqo](https://www.youtube.com/watch?v=aKjV3iL0Nqo)(JXP) · [W-epbrFWMbk](https://www.youtube.com/watch?v=W-epbrFWMbk)(Flashboards)

| 平台 | 模式 | 上限 |
|------|------|------|
| JXP | Text / Image / Reference / Video Edit | 参考图 9 张,文件 < 20 MB,无 PAG Alpha |
| Flashboards | Happy Horse Reference / Video Edit | 9 张参考图;Video Edit:1 视频 + 5 张图 |
| Alibaba Cloud Model Studio | I2V / T2V / R2V | R2V 最多 9 张 |

---

## 5. 多镜头 Timeline Prompting

来源:[4hhpIyznnaw](https://www.youtube.com/watch?v=4hhpIyznnaw) · [U4M_bEJIGPI](https://www.youtube.com/watch?v=U4M_bEJIGPI)

### 时间码分段格式

```
SHOT 1 (0:00-0:05): [Camera angle]. [Character] does [action].
SHOT 2 (0:06-0:10): [New camera]. [Character] does [next action].
SHOT 3 (0:11-0:15): [Camera]. [Resolution action].
AUDIO: [环境音, "对白必须加引号"]
```

### 一条 Prompt 输出视频 + 音效 + 口型同步(Pollo AI)

来源:[U4M_bEJIGPI](https://www.youtube.com/watch?v=U4M_bEJIGPI)

Pollo AI 集成 HappyHorse,单次 prompt 同时输出:视频 + 自然音效 + 口型同步语音(三合一)。
工作流:先用 Pollo AI 生成角色图,再用 HappyHorse 动画化。

### "迷你电影"思维(HappyHorse 与 Kling/Seedance 的最大区别)

来源:[gSLMDB4Uj28](https://www.youtube.com/watch?v=gSLMDB4Uj28) — *The New #1 AI Video Tool Just Dropped*

> "In most tools, you describe a shot. In Happy Horse, you have to describe it as a mini movie. It's not 'girl walking in neon Tokyo, cinematic lighting.' It's a sequence of events with continuity, motion, and progression."

### Timestamp 控制 Motion Design 序列

来源:[vU42JgrVo2Y](https://www.youtube.com/watch?v=vU42JgrVo2Y) — Curious Refuge

在 prompt 中使用时间戳语法精确定义每段时间的视觉状态,让 AI 视频模型按指定节奏完成 motion design 序列。HappyHorse 的 `SHOT 1 (0:00-0:05)` 即同类技巧。

---

## 6. 音频工程(AUDIO 区块 + 多语言 Lip-Sync)

来源:[4hhpIyznnaw](https://www.youtube.com/watch?v=4hhpIyznnaw) · [UN7bJDvqclg](https://www.youtube.com/watch?v=UN7bJDvqclg)

### AUDIO: 显式标记规则

- 所有声音指令放在单独的 `AUDIO:` 区块(放在 prompt 最末尾)
- **对白必须加英文引号** `" "` → 触发口型同步
- 具体描述音效:`Heavy breathing, pedaling, traffic whoosh, wind rush, tire squeal`
- 不要只写 `sound effects`

### 多语言 Lip-Sync(7 种语言)

来源:[qp7T6VzL8Lo](https://www.youtube.com/watch?v=qp7T6VzL8Lo)

支持:英语 / 普通话 / 广东话 / 日语 / 韩语等 7 种语言;Lip sync 精度到**单个音素**(phoneme level)。

来源:[UN7bJDvqclg](https://www.youtube.com/watch?v=UN7bJDvqclg)
三语 Lip-Sync 实测 Prompt(英 / 普通话 / 西班牙语,原文):
```
You shouldn't have come here tonight. It was a mistake.
Nǐ yǐwéi nǐ neng táo diào ma? Bié tài tiānzhēn le.
Ahora, el silencio es lo único que te queda.
```

### Sync Audio-Visual 的独特优势

来源:[OPElYdtdgkQ](https://www.youtube.com/watch?v=OPElYdtdgkQ)
> "One of the strongest features of Happy Horse is synced audio... the dialogue, the lip movement, the voice, and the room tone feel more connected to the actual scene."

### 竞技场技巧(从 Arena 抽到 HappyHorse)

来源:[mmk9C6bkV_c](https://www.youtube.com/watch?v=mmk9C6bkV_c)
> "If you want a better chance of getting the Happy Horse model, switch to 'with audio', as not as many models have access to audio."

---

## 7. 三种生成模式对比

来源:[MIeRMIT3nYA](https://www.youtube.com/watch?v=MIeRMIT3nYA) — *HappyHorse 1.0 Created My Childhood Game in Real Life*

| 模式 | 代号 | 控制程度 | 适用场景 |
|------|------|---------|---------|
| Image to Video | I2V | 中 | 单张静态图 → 动态镜头,测试面部稳定性 |
| Text to Video | T2V | 低 | 纯文字重建场景,测试模型世界观构建能力 |
| Reference to Video | R2V | 高 | 多张参考图合并,测试角色 + 服装 + 环境联合一致性 |

**R2V 多参考图 Prompt 示例(原文):**
```
The prince walking forward through the castle grounds, cloak moving in the wind,
guards in the distance, banners shifting, sunlight cutting through the clouds,
and the camera following with a smooth cinematic track.
```
设置:1080p,16:9,15 秒,参考图 4 张(角色脸、服装全身、城堡外景、黄金光照)

**T2V 文生视频示例(中世纪庭院,原文):**
```
Giant stone towers, guards, villagers, horses, market carts, banners, smoke,
golden sunrise light, and a slow cinematic tracking camera moving into the environment.
```

---

## 8. 工作流方法论(Storyboard 先行 + 分段长视频)

### Prompt Lab JSON 自动生成

来源:[q4rhf7msTkA](https://www.youtube.com/watch?v=q4rhf7msTkA)
- 进入 Prompt Lab → 选 video tab → 选时长(推荐 6 秒起测)→ 选 "detailed" 输出模式
- 只填写基本想法 → AI 自动产出高细节 JSON prompt → 复制回 video tab 生成

关键原文:
> "Just like Seedance 2, if you give it a vague prompt, you're not going to get good results. Your prompt needs to be detailed, very detailed."

### Storyboard 分段生成长视频(最长 45 秒)

来源:[RSEnVScjkCA](https://www.youtube.com/watch?v=RSEnVScjkCA) — *Happy Horse + GPT Image 2 Combo*

1. 用 GPT Image 2 生成完整故事板(16 帧静态图)
2. 故事板图片作为 Reference 上传给 HappyHorse
3. 分段生成:每次指定 `scene 1 to scene 5` → `scene 6 to 10` → `scene 11 to 16`
4. 最后合并(最长可达 45 秒)

> "To generate a longer cinematic video with better consistency, we need to generate the sequence in multiple parts."

### 简洁 Storyboard 引用格式

来源:[UN7bJDvqclg](https://www.youtube.com/watch?v=UN7bJDvqclg)
```
generate a video based on a storyboard at image one
```

### Freepik / Magnific Prompt Editor 技巧

来源:[gSLMDB4Uj28](https://www.youtube.com/watch?v=gSLMDB4Uj28)
```
Make it more detailed, cinematic multi-shot, specifically for happy horse 1.0,
and best prompt adherence strategies.
```
平台会自动将简单 prompt 扩展为带时间戳的多镜头结构。

### 四步 Pro Workflow

来源:[SkjumXCTnbQ](https://www.youtube.com/watch?v=SkjumXCTnbQ)
```
Step 1: 用 GPT 生成 prompt
Step 2: AI 图像生成关键帧
Step 3: Happy Horse 1.0 制作动态视频
Step 4: CapCut 或 Premiere 做声音设计 — bass hit / whoosh / rumble 等占电影感的一半
```

---

## 9. HappyHorse vs Seedance 2.0 / Veo 3.1(必读差异化)

来源:[qp7T6VzL8Lo](https://www.youtube.com/watch?v=qp7T6VzL8Lo) · [rQ0JlCIK6HA](https://www.youtube.com/watch?v=rQ0JlCIK6HA)

### 架构差异

> "It's something called a unified single stream transformer. Most AI models have a video team and an audio team... they work separately and then try to sync their work up at the end. This model is like having one single creator who imagines the sights and the sounds together at the exact same time from the very beginning."

### 关键差异表

| 维度 | HappyHorse 1.0 | Seedance 2.0 | Veo 3.1 |
|------|----------------|--------------|---------|
| 团队 | Alibaba ATH(张迪,Kling 架构师) | ByteDance Seed | Google DeepMind |
| 参数 | 15B | 未公开 | 未公开 |
| 原生音频 | ✅ 联合生成(unified single stream) | ⚠️ 后期合成 | ✅ 联合生成 |
| 单镜词数限制 | **20 词内**(超过空间混乱) | 可写到 4000 字符 | 中等 |
| Prompt 思维 | "迷你电影"(序列事件) | 单镜头描述 | 单镜头描述 |
| 参考图上限 | 9 | 9 | 较少 |
| 最长时长 | 15s | 15s | 8s |
| Lip-Sync 语言 | 7 种(含粤语) | 多语言 | 多语言 |
| 复杂叙事鲁棒性 | ⚠️ 多阶段叙事易出错 | ✅ 强 | ✅ 强 |
| 价格 | 显著便宜 | 中等 | 较贵 |

### 综合评价(原文)

来源:[rQ0JlCIK6HA](https://www.youtube.com/watch?v=rQ0JlCIK6HA)
> "From a temporal coherence and cinematic control perspective, Seedance 2 remains the more mature and reliable model. Happy Horse still struggles with maintaining believable motion over time, preserving visual logic between shots, and executing more ambitious cinematic instructions without drifting or collapsing into artifacts."
> "Happy Horse is much cheaper than Seedance 2. It is a model to watch, especially Happy Horse version 2."

### Leaderboard 数据

来源:[mmk9C6bkV_c](https://www.youtube.com/watch?v=mmk9C6bkV_c)
- Artificial Analysis Video Arena:HappyHorse Elo 比 Seedance 2.0 高约 100 分
- 多镜头(Multi-shot)是显著强项
- 快速动作存在 warping/mushiness,但能自我修正
- Alibaba 官方确认计划开源(GitHub + Hugging Face)

### 失败边界(连续缩放 + 多阶段叙事)

来源:[MO6UGe4w0BM](https://www.youtube.com/watch?v=MO6UGe4w0BM)

**测试 1 — 连续缩放(原文):**
```
A satellite view of planet Earth, diving down into a drone view of New York City,
pushing through an office building window, and finally ending on a tight close-up
of a person scrolling through TikTok.
```
> "The scale is often completely off... the fine details on the phone screen become garbled."

**测试 2 — 多阶段序列(原文):**
```
A princess in a glittery white dress is running from a massive dragon in a dense forest.
The dragon breathes fire, the ground ignites, and the princess has to jump onto
drifting debris to cross a river while the dragon roars in frustration.
```
> "The physics are often completely wrong... the dragon actually runs ahead of the princess, which completely breaks the narrative."

**实用结论**:复杂逻辑顺序 + 连续缩放 → 用 Seedance 2.0;短时序 + 原生音视频 → 用 HappyHorse。

---

## 10. 实战避坑清单

| 问题 | 来源 | 解决方案 |
|------|------|----------|
| 空间混乱、构图奇怪 | [JVWTwKrus9c](https://www.youtube.com/watch?v=JVWTwKrus9c) | 短提示词,单镜头不超过 20 词 |
| 角色外观不一致 | [4hhpIyznnaw](https://www.youtube.com/watch?v=4hhpIyznnaw) | 上传参考图后不要在 prompt 里描述外观 |
| 对话口型不同步 | [4hhpIyznnaw](https://www.youtube.com/watch?v=4hhpIyznnaw) | 对白必须加英文引号,放在 `AUDIO:` 区块 |
| 场景过于"AI 感" | [4hhpIyznnaw](https://www.youtube.com/watch?v=4hhpIyznnaw) | 删除 beautiful/epic/stunning,改用具体光线描述 |
| 抽象情绪无法表达 | [4hhpIyznnaw](https://www.youtube.com/watch?v=4hhpIyznnaw) | 把情绪转化为具体物理动作(见 §3) |
| 多角色对话分配错乱 | [4hhpIyznnaw](https://www.youtube.com/watch?v=4hhpIyznnaw) | 先写谁先说话,按顺序排 @tag 出现位置 |
| 人脸上传被拒(Pollo AI) | [_Y4siSt-dG8](https://www.youtube.com/watch?v=_Y4siSt-dG8) | 使用 edit video 模式外科式修改 |
| 连续缩放尺度失真 | [MO6UGe4w0BM](https://www.youtube.com/watch?v=MO6UGe4w0BM) | 避免极端尺度跳跃,改用 Seedance |
| 多阶段叙事顺序错乱 | [MO6UGe4w0BM](https://www.youtube.com/watch?v=MO6UGe4w0BM) | 分段生成,每段 ≤ 3 个连续动作 |
| 文件上传失败(>20MB / PAG Alpha) | [aKjV3iL0Nqo](https://www.youtube.com/watch?v=aKjV3iL0Nqo) | 压缩或转格式,去掉 alpha 通道 |
| 复杂 Prompt 失效 | [W-epbrFWMbk](https://www.youtube.com/watch?v=W-epbrFWMbk) | I2V 模式补强;复杂场景换 Seedance |

---

## 11. 可直接复制的 Prompt 模板

### 模板 A:6 要素单镜头(最常用)

```
[Subject] is [Action] in [Scene/Environment]. [Camera Movement], [Style/Composition]. AUDIO: [Audio/Ambiance].
```

### 模板 B:带参考图单镜头

```
Reference @character1 for the [Subject]'s appearance, and @Image2 for the environment.
Fully reference @Video1 for all camera movements and character actions.
[Subject] is [Action] in [Scene/Environment]. [Camera Movement], [Style/Composition].
AUDIO: [Audio/Ambiance].
```

### 模板 C:多镜头时间码

```
Reference Setup: Use @character1 for the main character's appearance, @Image2 for the setting,
and fully reference @Video1 for camera motion and pacing.
Scene Setup: [Overall environment, lighting, and global style details]
SHOT 1 (0:00-0:05): [Camera angle/movement]. @character1 does [first action].
SHOT 2 (0:06-0:10): [New camera angle/movement]. @character1 does [next action].
AUDIO: [Specific background sounds, foley effects, and exact "dialogue in quotes"]
```

### 模板 D:对话场景(单镜头 + 多动作)

```
[Subject1] [action 1] → [action 2] → [action 3 while glancing at @character2] → [action 4].
[Subject2] [reaction: e.g., quietly listens, slight nod].
[Camera shot]. [Lighting].
AUDIO: [ambient sound], "[Subject1 line]". "[Subject2 line]".
```

### 模板 E:UGC 广告

```
[Person description] in [setting], natural lighting, [imperfection detail e.g. subtle acne texture].
[They apply/use product] and say, "[Quoted dialogue]." Casual, authentic UGC style.
Natural [body part] movement, realistic [background detail].
AUDIO: Their voice, soft room tone, no music.
```

### 模板 F:Storyboard 分段生成

```
Generate scenes [N1] to [N2] from the storyboard reference.
[Style descriptor]. [POV / camera style].
Consistent character appearance, realistic [setting] moments.
```

### 模板 G:摄像机优先五要素

```
Subject: [主体].
Action: [动作或变形].
Environment: [环境].
Camera: [运镜词,从清单中选 2 个组合,如 orbit camera + FPV drone].
Atmosphere: [光线 + 氛围,如 golden atmosphere + volumetric light].
```

### 模板 H:产品广告(Pollo AI 集成)

```
Turn this [product] into a premium cinematic advertisement, dynamic camera rotation,
dramatic lighting, dust particles, [energy descriptor], fast push-in,
high-contrast product reveal.
```

---

## 12. 视频来源索引

| ID | 标题 | 播放量 | 核心贡献 |
|----|------|--------|----------|
| [4hhpIyznnaw](https://www.youtube.com/watch?v=4hhpIyznnaw) | Happy Horse Better Than Seedance IF You Do This | 2K | 6 要素黄金公式 / 情绪转物理 / @tag 规则 / Google Doc 完整 prompt |
| [JVWTwKrus9c](https://www.youtube.com/watch?v=JVWTwKrus9c) | Happy Horse: The Seedance Killer? | 40K | 20 词规则 / 当前限制 / Omni Reference 规则 |
| [U4M_bEJIGPI](https://www.youtube.com/watch?v=U4M_bEJIGPI) | Pollo AI + Happy Horse: One Prompt → Video+Audio | 23K | 三合一生成(视频+音效+口型)/ 多语言 |
| [_Y4siSt-dG8](https://www.youtube.com/watch?v=_Y4siSt-dG8) | Alibaba's New AI Video Model: 5 Tests | 16K | 5 项完整压力测试 / edit video 功能 |
| [tcCu24bnL7M](https://www.youtube.com/watch?v=tcCu24bnL7M) | Meet HappyHorse (Alibaba Cloud) | 4M | 官方 4 大能力 / 1080p / Native Audio-Visual Sync |
| [q4rhf7msTkA](https://www.youtube.com/watch?v=q4rhf7msTkA) | New #1 Ranked AI Video Generator | 1.7K | Prompt Lab JSON 自动生成 / Director's Cut Grid |
| [MIeRMIT3nYA](https://www.youtube.com/watch?v=MIeRMIT3nYA) | Created My Childhood Game in Real Life | 32K | I2V/T2V/R2V 三模式对比 |
| [rQ0JlCIK6HA](https://www.youtube.com/watch?v=rQ0JlCIK6HA) | Happy Horse vs Seedance — Same Prompts | 13.5K | 张迪身份 / 规格参数 / 综合对比结论 |
| [L7hUBvxYEo8](https://www.youtube.com/watch?v=L7hUBvxYEo8) | Stop Wasting Money on AI Videos | 4K | 连续动作三要素 / 对话场景小动作优势 |
| [mmk9C6bkV_c](https://www.youtube.com/watch?v=mmk9C6bkV_c) | beats Seedance 2.0 on Leaderboards | 21.6K | 竞技场技巧 / Elo 数据 / 开源计划 |
| [W-epbrFWMbk](https://www.youtube.com/watch?v=W-epbrFWMbk) | The Real Winner | 14.9K | Flashboards 工作流 / Storyboard 先行 |
| [UN7bJDvqclg](https://www.youtube.com/watch?v=UN7bJDvqclg) | 15 Prompts (Who Wins?) | 9.6K | 多语言 Lip-Sync 三语测试 / Storyboard 简洁引用 |
| [OPElYdtdgkQ](https://www.youtube.com/watch?v=OPElYdtdgkQ) | I Tested HappyHorse Inside Pollo AI | 83.8K | UGC 广告三连测 / Sync Audio-Visual 特性 |
| [RSEnVScjkCA](https://www.youtube.com/watch?v=RSEnVScjkCA) | Happy Horse + GPT Image 2 Combo | 52.7K | Storyboard 分段长视频工作流(45s)/ WWE/地堡/融合多组 prompt |
| [gSLMDB4Uj28](https://www.youtube.com/watch?v=gSLMDB4Uj28) | The New #1 AI Video Tool Just Dropped | 1.9K | "迷你电影"思维 / Freepik Prompt Editor |
| [aKjV3iL0Nqo](https://www.youtube.com/watch?v=aKjV3iL0Nqo) | HappyHorse 1.0 on JXP | 862 | JXP 四模式详解 / 图片规格 |
| [qp7T6VzL8Lo](https://www.youtube.com/watch?v=qp7T6VzL8Lo) | NEW King of AI Video | 497 | Unified Single Stream Transformer / 15B / 7 语言音素级 lip sync |
| [MO6UGe4w0BM](https://www.youtube.com/watch?v=MO6UGe4w0BM) | Ranked #1... But is it Actually Good? | 98 | 失败边界分析(连续缩放 + 多阶段叙事) |
| [SkjumXCTnbQ](https://www.youtube.com/watch?v=SkjumXCTnbQ) | Tips for Cinematic Camera Movement | 648 | 五要素公式 / 摄像机关键词 8 个 / 四步 Pro Workflow |
| [vU42JgrVo2Y](https://www.youtube.com/watch?v=vU42JgrVo2Y) | Is Seedance 2.0 Already Outdated? (Curious Refuge) | 22.8K | Timestamps 控制 Motion Design |

**官方文档:** [Alibaba Cloud HappyHorse Google Doc](https://www.youtube.com/watch?v=4hhpIyznnaw) (link in video description, 4hhpIyznnaw)

---

## 与本仓库其他文档的关系

- 6 要素公式 → [01-基础公式.md](01-基础公式.md) / [02-进阶公式.md](02-进阶公式.md)
- 多镜头时间码 → [03-分镜时序.md](03-分镜时序.md)
- 摄像机关键词 → [05-运镜词典.md](05-运镜词典.md)
- 约束词清单 → [06-约束词清单.md](06-约束词清单.md)
- AUDIO 区块规范 → [07-特殊字符规范.md](07-特殊字符规范.md)
- 与 Seedance / Veo 对比 → [10-跨模型对比.md](10-跨模型对比.md) / [15-seedance-masterclass.md](15-seedance-masterclass.md)
- Veo Omni Reference 类比 → [12-veo-公式.md](12-veo-公式.md) / [16-gemini-omni-公式.md](16-gemini-omni-公式.md)

本文档专门聚焦 **HappyHorse 1.0 YouTube 教学社区**的方法,与 Seedance 2.0 Masterclass(§15)、Imagine.art / Atlas Cloud / CrePal 官方文档形成三角验证。
