# 19 · Seedance 2.0 Masterclass Round 3 — 8 个新视频教学补遗

> 续篇,补 [`15-seedance-masterclass.md`](./15-seedance-masterclass.md) 之外的 8 个新视频(`§第七批 Round 3`)。
> 8 个视频累计播放量 ~865K,均来自 YouTube 公开字幕/描述区,**禁止编造**。
> 重点:三类 reference 全能用法 / AI Anime 完整流程 / 3×3 网格绕过人脸过滤 / CapCut Video Studio 三模式 / 五段式骨架 + 摄像机语法 / BytePlus·ChatCut·Mitte 访问渠道。

---

## 目录

1. [三类 Reference 深度拆解(图片/音频/视频)](#1-三类-reference-深度拆解图片音频视频)
2. [AI Anime 四步法 + Higgsfield Elements 角色训练](#2-ai-anime-四步法--higgsfield-elements-角色训练)
3. [3×3 网格绕过人脸过滤 + 50 爆款 Prompt 类目](#3-33-网格绕过人脸过滤--50-爆款-prompt-类目)
4. [CapCut Video Studio:多镜头自动分割 + 视频扩展 30 秒](#4-capcut-video-studio多镜头自动分割--视频扩展-30-秒)
5. [CapCut Video Studio 三模式 / 画布 AI Agent 工作流](#5-capcut-video-studio-三模式--画布-ai-agent-工作流)
6. [CapCut 访问入口 + 首次测试技巧](#6-capcut-访问入口--首次测试技巧)
7. [全规格参数 + 五段式 Prompt 骨架 + 摄像机语法](#7-全规格参数--五段式-prompt-骨架--摄像机语法)
8. [多模态能力概览 + 访问渠道(BytePlus/ChatCut/Mitte)](#8-多模态能力概览--访问渠道byteplusatcutmitte)
9. [Round 3 视频清单](#9-round-3-视频清单)

---

## 1. 三类 Reference 深度拆解(图片/音频/视频)

来源:[TwcB2qX42iw](https://www.youtube.com/watch?v=TwcB2qX42iw) — *The Most Consistent AI Video Model Right Now!*(255K)

### 图片 reference

- **不只是人脸**:可以 `@` 某张图里的局部元素——某件衣服 / 某个背景 / 某个道具。Prompt 写法:
  ```
  the man in image1 wearing the overalls from image3, carrying the shirt from image4
  ```
- **最多 15 个 reference 同时使用**
- **多图 keyframe 动画**(替代 Start/End Frame):Text+Reference 模式可设置多张图为中间关键帧,AI 自动插值。结构:
  ```
  character walks from image4 to image2, then over to image5, then to image1
  ```
- **图片当成视觉风格引用**(stop-motion / 插画风等):
  ```
  using image1 as a reference for the visual style
  ```

### 音频 reference

- **Lip sync + 文字稿双重约束**:直接上传音频做 lip sync,AI 偶尔会听错词(如把 "seedance 2.0" 听成 "CGI 2.0")。把台词逐字写进 prompt,准确率大幅提升:
  ```
  The man in image1 is lip syncing to audio1; he says: "Welcome back to the channel..."
  ```
- **多角色 multi-person lip sync**:上传含两个声音的音频,Seedance 自动分配:
  ```
  the dialogue between the two characters is lip sync driven by audio1
  ```
- **音频作为背景音乐**:`using audio1 as background music` — AI 自动控制音量让对话仍可听清
- **声音克隆保 vocal 一致性**:录制约 15 秒声音样本作为 audio reference,**只写** `use the vocal qualities of audio1`(不指定台词),让不同场景同一角色保持嗓音一致
- **时长匹配关键**:给 10 秒说 10 秒台词量,别给 15 秒说 3 秒台词

### 视频 reference

- **摄像机运动模板**:`use that video as a reference for camera movement`
- **角色动作迁移**(可独立于摄像机):`use this video as a character motion reference for image1` — 只抽人物动作,背景可换
- **替换角色保运镜+环境**:`replace the character in the video with the dog`
- **风格+光影双迁移**:`using video1 as a style and lighting reference`

### 多 keyframe 漫游 prompt(完整原文)

```
Character walks from image4, which is where this whole video starts, to image2 (slightly right of the main studio area), then over to image5 (further right), and then finally to image1 (fully around to the back, pointing to a room full of monitors). While he walks seamlessly from scene to scene, he is saying "Let me show you around. This is the main studio, and over here we have studio B, and next is our famous wall of monitors. Now, if you'll excuse me, I'm tired of you." Then he walks away.
```

---

## 2. AI Anime 四步法 + Higgsfield Elements 角色训练

来源:[MGfcx_NXRww](https://www.youtube.com/watch?v=MGfcx_NXRww) — *Seedance 2.0 Creates AI Anime With Perfect Character Consistency*(35K)

### 四步生产流程

```
① 黑白分镜图(控制布局,Nano Banana)
② 上色获得一致色彩
③ (可选)添加动画运动注释
④ 用图片+元素 reference 生成视频(Seedance)
```

### Higgsfield Elements 角色训练

- **20 张训练**:上传约 20 张角色参考图(正面/侧面/不同表情)→ 创建独立 Element → 后续 prompt 里直接 `@Kai`,不用每次上传
- **比单张 reference 稳定**(AI 有更多数据可学)
- **角色状态分离**:每加新外观变化(疤痕/能量光效/服装变化)就**新建一个 Element**,而不是改旧的

### 漫画页多镜头单图生成

- 在单张 Nano Banana 图里生成多个格子("multi-panel manga page")
- 一次生成多个场景概念,比分开生成节省时间且更一致

### 动画注释提示词

- 用 Claude 在图上画箭头注释运动方向
- 第一段 prompt 定注释系统格式,第二段上传图+描述每个区域的运动意图
- 把带注释的图片上传进 Seedance 作为 reference

### Seedance prompt 结构(每个 clip 用相同开头)

```
1. 风格声明(如 "90s anime style, bold ink outlines")
2. 第一帧注释("do not use the uploaded image as a literal first frame")
3. 角色描述(含年龄/身高)
4. 声音风格(每次相同)
5. 时间轴提示("0-4s: ..., 4-9s: ...")
6. 收尾 "no music"
```

### 后期剪辑策略

- 每场景生成 2-4 次,从不同次结果里挑最好的几秒拼接
- 不要执着于单次生成完美

### 角色生成更多参考图 prompt(原文)

```
Show this anime character in a unique setting, 90s anime style, no text, close-up, natural background
```

---

## 3. 3×3 网格绕过人脸过滤 + 50 爆款 Prompt 类目

来源:[pbpzvmtpAZg](https://www.youtube.com/watch?v=pbpzvmtpAZg) — *NEW Method for Consistent Characters Using Your OWN Face (+50 Viral Prompts)*(23K)

### 3×3 网格法(主推方法)

- **机制**:Seedance 2.0 Omni 会拦截含真实人脸的参考图。把同一张脸复制成 3×3 九宫格图片上传,通过**降低单张脸的面积比例**让过滤器检测不到"主导人脸"
- **Prompt 写法**:之后 prompt 写 `use character at image1` 即可生成写实人脸视频

### 3D→写实法(备选)

- **预处理**:用 Nano Banana Pro 将真实照片转为 3D 风格:
  ```
  turn this into a highly detailed 3D drawing art character design with white background concept art
  ```
- **生成时拉回写实**:上传 3D 版作 reference,prompt 加关键词 `4K, photorealistic, live action, lifelike`
- **优势**:3D 版比照片版更容易通过过滤

### 敏感词替换原则

| 禁用 | 改用 |
|------|------|
| fight / battle / destroy | intense power confrontation |
| kill / brutal / attack | dramatic energy clash |
| punch / slash | powerful forces meeting |
| blood | epic visual impact |

### 动作包装技巧

- 纯粹暴力描述会被拦截
- 把行为包裹进**电影叙事语境**(加目的/文化背景/角色职责)就能绕过
- 示例:"向天空开枪" → "骑手在马背上穿越山地景观,高举旧步枪向灰色天空开一枪作为信号"

### 避免年龄词汇

- 禁用:`boy / girl / child / kid / young`
- 改用职责描述:`rider on a gray horse`

### Martini AI 3D 虚拟场景锁定

- 用 Martini 把生成的图片转成可在 3D 空间里移动摄像机的虚拟场景
- 从多角度截帧作为 Seedance reference
- 解决"场景间一致性"比"角色一致性"更难的问题
- 内置 timeline 剪辑

### 完整 Prompt 1(3D→写实,Ninja 海滩)

```
Use character at image1. He's arriving to a tropical beach after his ship sank. 4K, photorealistic, live action, lifelike
```

### 完整 Prompt 2(Transformers 多镜头,节选)

```
[0-2 seconds] One-take, camera follows closely throughout. Scene begins on the banks of the Seine in Paris (Image 2), buildings collapsing, thick smoke, water currents roaring, Eiffel Tower faintly visible in smoke.
[2-5 seconds] A male pilot in a white suit (Image 3) perilously straddles a giant mechanical structure. Camera zooms out, revealing he is riding a transforming fighter jet. Coat tails violently flapping in airflow as he tightly grips the mecha's components.
[5-7 seconds] Fighter jet speeds close to Paris street level, body undergoing complex mechanical reconfiguration. Wings fold back, engines reorganize into humanoid mecha core, fuselage extending to form sturdy metal skeletons and glowing pipelines.
[7-9 seconds] Transformation complete, giant mechanical behemoth stands in Paris streets. Machine raises head, back armor unfolds, revealing giant cannon barrel, energy accumulating. A devastating energy beam released with a roar, distant landmarks crumble into smoke.
[9-10 seconds] Pilot climbs into cockpit. Mecha takes humanoid form, engines ignite at full power, twin exhaust flames intensely orange-red. Machine flies up into clouds, outline of Paris rapidly shrinking below.
```

---

## 4. CapCut Video Studio:多镜头自动分割 + 视频扩展 30 秒

来源:[CfenG1mcb7c](https://www.youtube.com/watch?v=CfenG1mcb7c) — *I Just Tested Dreamina Seedance 2.0 in CapCut Video Studio*(50K)

### 核心技巧

- **POV + 多镜头一段描述就够**:Seedance 在 CapCut Video Studio 内理解"切镜"概念,即便很简单的 prompt 也能自动生成有建立镜头+近景的多镜头序列,模型自动分配镜头时长和转场
- **step-by-step 多镜头结构**:按顺序描述每个镜头 → 定义转场 → 下个镜头,**不需要时间戳**,AI 把总时长均匀分配;关键是用 "then" / 先后动作串联
- **Start + End Frame 接帧**:同时上传第一帧和最后一帧图片,只描述中间发生的事,Seedance 填充所有中间内容("café scene → people leaving")
- **视频扩展 30 秒上限**:上传最长 15 秒的视频,描述接下来发生什么或之前发生了什么,Seedance 再生成最多 15 秒延伸,最终拼出 30 秒连贯序列
- **图转视频物理场景**:上传静态图(如装满球的瓶子),prompt 描述物体和运动,Seedance 自动计算真实物理(球的弹跳/散落轨迹),无需在 prompt 里指定物理参数

### 多镜头动作场景 Prompt(原文)

```
A POV shot of a mage charging energy in a battlefield, forming a lightning sphere, then cutting to an opponent with a shield, and the impact creates a big explosion with particles
```

---

## 5. CapCut Video Studio 三模式 + 画布 AI Agent 工作流

来源:[MVlaJNaDXJs](https://www.youtube.com/watch?v=MVlaJNaDXJs) — *Ep.1 CapCut Video Studio Tutorial · 101*(351K)

### Video Studio 三模式

| 模式 | 用法 |
|------|------|
| **Image** | 手动选模型+参数 |
| **Video** | 手动选模型+时长 |
| **Auto** | AI Agent 自己决定最优生成方式(**新手用这个**) |

Auto 模式:AI 分析上传的素材/链接/想法后输出完整 video brief。

### Video Brief 可编辑

- Auto 模式生成 brief 后,在 generate 前可修改每个场景的风格/旁白/媒体类型
- **关键**:把 media type 选为 **"video clips"**(不是 "still images")才能生成动态内容

### 素材上传多元化

- 上传本地图片/视频
- 粘贴网页链接(CapCut 自动提取相关信息)
- 直接写创意想法
- 这些以"卡片"形式出现在画布上,然后在 prompt 里 `@` 指定卡片

### 场景 ratio 选择

- vertical 9:16(TikTok/Reels)
- 16:9(YouTube/宽屏)
- **必须在生成前设定,不能后改**

### 生成后 storyboard 编辑

- 每个场景卡片可单独 trim / 拖拽重排序 / 一键 regenerate(只重生这一段)
- 替换为素材库/自己上传的片段

### Smart Edits

- Elements 区开启 Smart Edits → 自动添加字幕高亮/音效/贴纸
- 可调 **Intensity** 控制密度

### 同一画布多版本

- 一个 Canvas 项目可包含多个 video brief 和 storyboard
- 用于测试不同思路,不会相互覆盖

### 自定义声音

- 内置 Voice Library 可选
- 也可录制/上传自己的声音制作 Custom Voice 克隆

---

## 6. CapCut 访问入口 + 首次测试技巧

来源:[4zjPITR553w](https://www.youtube.com/watch?v=4zjPITR553w) — *How to Use Seedance 2.0 in CapCut – First Impressions*(30K)

### 访问入口

```
capcut.com → 左侧 AI Studio → Video Studio
页面右上角看到 Seedance 2.0 标志(Powered by Dreamina)
```

### Video 模式设置面板

| 选项 | 可选值 |
|------|--------|
| duration | 5s / 15s |
| aspect ratio | 16:9 等 |
| resolution | 720p / 1080p |

### 生成失败 → 直接 Regenerate

- 测试中第一次生成经常返回 "could not generate AI video" 错误
- **不需要改 prompt**,直接点 Regenerate 通常第二次成功

### 15 秒 = 1000 credits

- 免费额度有限,15s 一次约 1000 credits
- **建议先用 5s 测试 prompt 方向**,验证后再用 15s

### 多镜头 Prompt(直接在 prompt 里描述动作序列,Seedance 自动分镜,无需时间戳)

```
Two cats kung fu fighting each other. They are wearing kung fu clothes. Hong Kong retro kung fu movie style. First cat says "It's time to meet your end." Second cat replies "Come at me, bro." They start fighting each other. Then the first cat hits the second cat with a hadouken. Second cat dodges and counters with a shoryuken.
```

---

## 7. 全规格参数 + 五段式 Prompt 骨架 + 摄像机语法

来源:[pbpzvmtpAZg](https://www.youtube.com/watch?v=pbpzvmtpAZg) — *Advanced Prompting Guide*(Google Doc 版,描述区文档)

### 硬参数上限

| 类型 | 上限 | 最佳实践 |
|------|------|----------|
| 总文件输入 | 12 个 | 优先放对输出影响最大的文件 |
| 图片 | 最多 9 张(推荐 0-5) | 用于角色外观/场景/风格锚定 |
| 视频 | 最多 3 段(总计 ≤15s) | 用于运动模板/摄像机路径 |
| 音频 | 最多 3 个 MP3(≤15s) | lip sync / 节奏 / 背景音乐 |
| 生成时长 | 4-15 秒 | 测试阶段先用 5s 省 credits |
| Prompt 字数 | **30-100 词最优** | 超过 100 词会"注意力漂移" |

### 五段式 Prompt 骨架(Five-Part Spine)

```
1. Subject  — 立刻写主体,不要先写背景。含 @tag 锁定身份 + 年龄/材质等具体词
2. Action   — 一个镜头一个主动词,现在时。禁止 "running and reloading while shouting" 这种复合
3. Camera   — 位置在 Action 之后。格式:Camera: [move] + [speed] + [subject lock]
              禁止在同一子句叠加 pan+zoom+dolly,复合运动必须用时间分段
4. Style    — 末尾,用一个强视觉锚(如 "Blade Runner aesthetic")
              不要堆砌通用形容词
5. Constraints — 否定语言明确禁止(no text overlays, no speed ramps, etc.)
```

### 摄像机分段写法示例(正确)

```
Start: slow dolly-in.
Then: gentle pan right for the final 2s
```

### Consistency / Creativity 滑块

- **Consistency 60 / Creativity 40 = 推荐 Pro Split**(身份锁定 + 允许物理自然流动)
- pixel-perfect 品牌复刻 → Consistency 拉满
- 纯概念探索 → Creativity 拉高

### 常见问题负向 Prompt 模板

```
No jitter, no wobble, no warping, no temporal flicker
No added props, no color shift, no logo morphing
No text overlays, no garbled text
No face changes, no flicker, high consistency, keep the same character, same clothing, same hairstyle
```

### 多镜头时间轴语法示例(Fantasy)

```
[0-5s] Wide shot, majestic knight in silver armor enters a dark cave with a torch, ethereal god rays filtering from entrance. Hard cut.
[5-10s] Close-up, knight's nervous eyes reflecting firelight. Subtle arc shot, shallow depth of field. Fade in.
[10-15s] Medium tracking shot, low-angle. He draws a sword glowing blue. Sound of crackling fire and echoing footsteps.
```

---

## 8. 多模态能力概览 + 访问渠道(BytePlus/ChatCut/Mitte)

来源:[5ib06crTeXk](https://www.youtube.com/watch?v=5ib06crTeXk) — *How To Access Seedance 2.0, an AI Video Model That Destroys Veo 4!*(32K)

### Seedance 2.0 模型能力总结

- 多模态输入(图片+视频+音频+文本同时输入)
- Reference 可复制摄像机运动 / 人物运动 / 视觉特效
- 角色一致性实际可用
- 4-15 秒生成 + 自动声效
- 无缝视频扩展和编辑
- **单次连续镜头(one-take continuous shot)** 能力

### 访问渠道(截至视频发布)

| 平台 | 入口 | 说明 |
|------|------|------|
| **BytePlus** | byteplus.com | ByteDance 官方企业入口,含 API |
| **ChatCut** | chatcut.io | 优惠码 `GONEWITHTHEWIND` |
| **Mitte.ai** | mitte.ai | 第三方平台 |
| CapCut Video Studio | capcut.com | 参见第 5-6 节 |

### 15 秒 one-take 的价值

- 同一角色的声音/外形在 15 秒内自动保持一致
- 不需手动拼接,适合 UGC 广告 + 短剧片段

### 中国平台 IP 限制

- 中文服务器版本对影视角色(IP)几乎无限制
- 但上传到社媒有法律风险,**不建议公开发布**

---

## 9. Round 3 视频清单

| ID | 标题 | 播放量 | 核心贡献 |
|----|------|--------|----------|
| [TwcB2qX42iw](https://www.youtube.com/watch?v=TwcB2qX42iw) | The Most Consistent AI Video Model Right Now! | 255K | 图片/音频/视频三类 reference 深度用法、多图 keyframe、声音克隆 vocal 一致性 |
| [MVlaJNaDXJs](https://www.youtube.com/watch?v=MVlaJNaDXJs) | Ep.1 CapCut Video Studio Tutorial · 101 | 351K | CapCut Video Studio 三模式 / 画布 AI Agent / Smart Edits |
| [MGfcx_NXRww](https://www.youtube.com/watch?v=MGfcx_NXRww) | Seedance 2.0 Creates AI Anime With Perfect Character Consistency | 35K | 四步 AI Anime 流程 / Higgsfield Elements 20 张训练 / 黑白→上色一致性 |
| [pbpzvmtpAZg](https://www.youtube.com/watch?v=pbpzvmtpAZg) | NEW Method: Consistent Characters + 50 Viral Prompts | 23K | 3×3 网格绕过人脸过滤 / 3D→写实 / 敏感词替换 / Advanced Guide 五段式 |
| [CfenG1mcb7c](https://www.youtube.com/watch?v=CfenG1mcb7c) | I Just Tested Dreamina Seedance 2.0 in CapCut Video Studio | 50K | step-by-step 多镜头 / Start+End Frame 接帧 / 视频扩展最多 30 秒 / 物理场景 |
| [5ib06crTeXk](https://www.youtube.com/watch?v=5ib06crTeXk) | How To Access Seedance 2.0, an AI Video Model That Destroys Veo 4! | 32K | 多模态能力总结 / byteplus·chatcut·mitte 三渠道 |
| [4zjPITR553w](https://www.youtube.com/watch?v=4zjPITR553w) | How to Use Seedance 2.0 in CapCut – First Impressions | 30K | CapCut 入口路径 / credits 消耗 / Regenerate 技巧 / 多镜头 prompt |
| [dRjN6Cr2Z00](https://www.youtube.com/watch?v=dRjN6Cr2Z00) | The Wildest AI Film You'll See Today! (Seedance 2.0) | 89K | 纯展示作品,无教程内容 |

---

## 与 methodology/15 的关系

- **15 章节** 已覆盖:Timeline Prompting / 5 种爆款格式 / VFX / 多模态基础 / Start+End Frame / 人脸网格(2×2)/ 视频延伸基础 / 角色一致性 5 步
- **19 章节(本文)** 补充:三类 reference 深度用法 / Higgsfield Elements 训练 / **3×3 网格**(2×2 升级)/ CapCut Video Studio 全流程 / 五段式骨架 / 视频扩展 30 秒 / BytePlus·ChatCut·Mitte 渠道
- 真实提示词原文进入 [`../prompts/data/incoming/seedance-round3.json`](../prompts/data/incoming/seedance-round3.json),ID 从 `sd-096` 起编号
