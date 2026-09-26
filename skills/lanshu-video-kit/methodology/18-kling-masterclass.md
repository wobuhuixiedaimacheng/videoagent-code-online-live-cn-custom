# 18 · Kling AI Masterclass — 26 YouTube 教学视频精炼

> 整合 26 个 YouTube 教学视频(累计播放量 6M+)的 Kling 方法论 + 真实提示词原文。
> Kling 是快手(Kuaishou)出品的 AI 视频生成模型,当前主要版本:Kling 2.6 / Kling 3.0 / Kling O1。
> **禁止编造**,所有内容均逐字提取自视频字幕或文档区。

---

## 目录

1. [核心 Prompt 公式(5 要素结构)](#1-核心-prompt-公式5-要素结构)
2. [Constraint Sandwich 约束三明治(O1 专用)](#2-constraint-sandwich-约束三明治o1-专用)
3. [Style Bible Line 风格圣经行](#3-style-bible-line-风格圣经行)
4. [Elements / Bind Elements 系统(跨镜头一致性)](#4-elements--bind-elements-系统跨镜头一致性)
5. [Multi-Shot 多镜头生成(6 shots within 15s)](#5-multi-shot-多镜头生成6-shots-within-15s)
6. [Motion Control 运动迁移 + Motion Library](#6-motion-control-运动迁移--motion-library)
7. [Motion Brush 运动笔刷](#7-motion-brush-运动笔刷)
8. [摄像机运动提示词完整列表](#8-摄像机运动提示词完整列表)
9. [Start / End Frame 高级用法](#9-start--end-frame-高级用法)
10. [Kling O1 (Omni-1) 高级功能](#10-kling-o1-omni-1-高级功能)
11. [OmniEdit 重新打光 / 换背景 / 换风格](#11-omniedit-重新打光--换背景--换风格)
12. [Multi-Elements Editor: Swap / Add / Delete](#12-multi-elements-editor-swap--add--delete)
13. [3×3 图像网格法(一 prompt 多角度/多帧)](#13-33-图像网格法一-prompt-多角度多帧)
14. [Character Sheet 角色一致性方法](#14-character-sheet-角色一致性方法)
15. [Image-to-Video 真人动作精准控制](#15-image-to-video-真人动作精准控制)
16. [7 种通用 Prompt 结构(Kling/Veo/Sora 通用)](#16-7-种通用-prompt-结构klingveo-sora-通用)
17. [Kling 3.0 与其他模型的差异化优势](#17-kling-30-与其他模型的差异化优势)
18. [参数设置建议(Pro 模式 + Relevance 滑块)](#18-参数设置建议pro-模式--relevance-滑块)
19. [已知限制与避坑](#19-已知限制与避坑)
20. [真实提示词原文(按来源逐字)](#20-真实提示词原文按来源逐字)
21. [附录:视频来源索引](#附录视频来源索引)

---

## 1. 核心 Prompt 公式(5 要素结构)

> 来源:[EWBsU0fSgPs](https://www.youtube.com/watch?v=EWBsU0fSgPs) — *STOP Wasting Credits & Become a Kling AI Master in 8 Minutes*(244K)
> 来源:[xoSbJFRnKMM](https://www.youtube.com/watch?v=xoSbJFRnKMM) — *STOP Wasting Credits & Master Kling AI in 10 Minutes*(60K)

**五段式电影提示词结构:**

```
1. Subject Description(主体描述):人物/物体的外观细节
2. Action(动作):正在发生什么
3. Environment(环境):场景背景
4. Lighting & Atmosphere(光线与氛围):打光、天气、情绪
5. Camera Movement(摄像机运动):镜头怎么动
```

**差 vs 好 对比(EWBsU0fSgPs 原文):**

差:`A man walking in a forest`

好:
```
A rugged explorer with a weathered face and brown leather jacket carefully navigates 
through a dense misty forest with towering pine trees. Golden sunlight filters through 
the canopy, creating dramatic shadows, photorealistic. The camera slowly tracks forward, 
following him from behind as he moves deeper into the woods.
```

**Image-to-Video 简化版**:主体已在图里,只需补充 3 项(动作 + 光线 + 摄像机):

```
Reading a book while occasionally turning pages and looking around. Warm afternoon 
sunlight filtering through trees. Slow push-in shot focusing on their peaceful expression.
```

---

## 2. Constraint Sandwich 约束三明治(O1 专用)

> 来源:[Em6pM_MPNmc](https://www.youtube.com/watch?v=Em6pM_MPNmc) — *Kling O1 Tutorial: 13 Features & Tips*(990K)

Kling O1 最优提示词格式(三明治结构):

```
1. Subject anchor(主体锚点):你的主体/元素
2. Shot + Action(镜头+动作):这一镜头里发生什么
3. Preserve constraints(保留约束):不想改变的内容
```

示例:
```
[A weathered samurai standing at the edge of a misty cliff]
[draws his sword slowly as wind moves through his robes, camera orbits left in slow motion]
[preserve camera motion and timing. Keep the character identity consistent. No color changes.]
```

---

## 3. Style Bible Line 风格圣经行

> 来源:[Em6pM_MPNmc](https://www.youtube.com/watch?v=Em6pM_MPNmc)

**定义**:一句描述整个项目视觉风格的固定句子,跨所有镜头的提示词复制粘贴使用。

**用法**:
- 每个镜头只改 Action 行
- Style Bible Line 保持不变
- 确保整部片的视觉一致性

**示例:**
```
Shot on ARRI Alexa, 2.39:1 anamorphic, filmic grain, warm desaturated tones, 
practical lighting only, cinematic depth of field.
```

---

## 4. Elements / Bind Elements 系统(跨镜头一致性)

> 来源:[Em6pM_MPNmc](https://www.youtube.com/watch?v=Em6pM_MPNmc) · [c8huoAtXGew](https://www.youtube.com/watch?v=c8huoAtXGew) — *Kling 3.0 Full Tutorial*(690K) · [HTBfxEqDCdU](https://www.youtube.com/watch?v=HTBfxEqDCdU)(143K) · [tqZ0JuUevwA](https://www.youtube.com/watch?v=tqZ0JuUevwA)(76K)

### 什么是 Elements

> 原文:「You can think of elements as individual assets in your generation that stay consistent between different shots. These can be characters, objects, props, or locations. Each element is actually made up of a bundle of separate images of the same object from multiple angles.」

**Elements = 把同一对象的多角度图像打包成一个可复用资产**,在所有镜头中保持一致。

### 创建 Elements(Kling 3.0)

1. 进入 Kling 视频生成界面
2. 点击 `Bind Elements` → `Create Element`
3. 上传角色多角度图(含正面、侧面、面部特写)
4. 命名元素(可选:上传声音预设)
5. 在 prompt 里写 `@元素名称` 引用

### 角色设计技巧(character turnaround)

> 来源:[c8huoAtXGew](https://www.youtube.com/watch?v=c8huoAtXGew)

> 原文:「When designing characters, I always add the keyword concept art to the end of my prompts. This allows for much more creative results. I then add the concept art back in as a reference and then ask for the real version of that character and I also use the keyword character turnaround. This is going to give me a 360 character sheet.」

```
[角色描述] concept art
```
→ 生成角色概念图后,加回参考图,加 `character turnaround` 生成 360° 角色表。

### Elements 三角度参考图(最佳实践)

> 来源:[tqZ0JuUevwA](https://www.youtube.com/watch?v=tqZ0JuUevwA) + [HTBfxEqDCdU](https://www.youtube.com/watch?v=HTBfxEqDCdU)

为同一角色创建 Elements 推荐包含:
- 正面特写(close-up)
- 全身正面(full body)
- 侧面(side profile)

> 字幕原文:「recommend having a close-up, a full body shot and a side profile… those are the most important ones」

**Angles 2.0 快速生成**:Higgsfield 上传基础图,点击「Generate from 12 best angles」(仅 2.4 credits),自动生成 12 个角度。

### Elements 在 Multi-Shot 中的引用语法

> 来源:[HTBfxEqDCdU](https://www.youtube.com/watch?v=HTBfxEqDCdU)

```
Shot 1: A windy day on the mountain. @Male says "Kling 3.0 can generate multi-shot scenes in one go"
Shot 2: Camera reveals second character. @Female says "Wait, you're telling me this is just from one image?"
Shot 3: Pans back to @Deadpool saying "Guys, come on. I don't have all day."
```

---

## 5. Multi-Shot 多镜头生成(6 shots within 15s)

> 来源:[c8huoAtXGew](https://www.youtube.com/watch?v=c8huoAtXGew) · [b_RghITuQQM](https://www.youtube.com/watch?v=b_RghITuQQM) — *Master Kling 3.0 in 25 Minutes*(173K) · [tqZ0JuUevwA](https://www.youtube.com/watch?v=tqZ0JuUevwA)

### 基本格式

> 原文(b_RghITuQQM):「Each shot: type of camera angle + what the character is doing + describe environment.」

**多镜头格式示例(Dan Kieft 原文):**
```
Shot 1: A wide two-shot of two people
Shot 2: A slow push in of a man in his 40s as he is chewing and looking down to his plate
Shot 3: A medium shot on my 9-year-old that's looking a bit confused
Shot 4: Switch back to the two of them
```

### 硬性限制

- 每个 shot **最多 500 字符**(Kling 限制)
- 每个 shot **最短 3 秒**
- **15 秒内最多 6 个 shots**(实测建议 4-5 个)
- Multi-Shot 模式下**不能同时使用** Start + End Frame
- 最多 4 个参考图,超过容易出现 glitch

### 无缝衔接技巧

> 原文:「A great trick is to have the action you ended your previous shot with start your next shot. This gives you more room in the edit and allows everything to flow together seamlessly.」

- 上一段视频的结束动作 = 下一段视频的开始动作
- 建议生成时长:10 秒(比 15 秒一致性更好)

### 用 ChatGPT 自动生成 Multi-Shot 提示词

> 来源:[tqZ0JuUevwA](https://www.youtube.com/watch?v=tqZ0JuUevwA) — *How to use Kling 3.0 for AI Filmmaking*(75K)

**完整 ChatGPT 元 Prompt(原文):**

```
Write me a multi-shot prompt that shows a bearded man in an otherworldly environment, 
he is fighting a huge beast and wins. Use a variety of camera angles to ensure the scene 
is dynamic and well paced. Write this as individual prompts so each can be directly 
dropped into an AI video generator. Be specific about character position and actions, 
as well as the lenses used for each shot. All action needs to happen with 15 seconds, 
with each shot lasting a minimum of 3 seconds. Ensure the bearded man is wearing a 
plain white t-shirt, grey backwards baseball cap, beige cargo trousers and white 
vintage trainers. Ensure each prompt is a maximum of 500 characters each.
```

---

## 6. Motion Control 运动迁移 + Motion Library

> 来源:[O-WFLK3em5I](https://www.youtube.com/watch?v=O-WFLK3em5I) — *Motion Control Full Beginner Tutorial*(99K) · [yUBGI_kUm-g](https://www.youtube.com/watch?v=yUBGI_kUm-g) — *Kling AI 3.0 Is Built for Viral Content (Motion Control)*(557K)

### 核心原理

> 原文:「Motion Control 不是风格迁移,是运动重建(reconstruction)。Image 定义外观,Reference Video 提供纯运动数据(body dynamics, timing, gestures, facial expressions, lip sync),Prompt 主要控制背景。」

**操作入口**:Dashboard → Video Generation → 模型选择下方 → Motion Control

### 两个核心模式

| 模式 | 适用场景 |
|------|---------|
| `Match Video` | 强制匹配参考视频的构图,完全复现动作序列 |
| `Match Image` | 把运动迁移到原图的姿势角度,保留原始照片构图 |

**选择原则**:
- 参考视频人物正面 + 图像侧面 → 用 `Match Image`(保留角度)
- 完全复现参考视频 → 用 `Match Video`

### 参考视频要求

- 时长:3–30 秒
- 无镜头切换
- 无摄像机运动
- 动作节奏不要过快

### Motion Library 预设(Kling 3.0)

> 来源:[yUBGI_kUm-g](https://www.youtube.com/watch?v=yUBGI_kUm-g)

界面左侧浏览"热门动作"(cute baby dance、expression challenge、fortune in motion 等),点击即可作为源视频。

**自定义动作上传**:从 Instagram 等平台下载舞蹈/动作视频,上传为 My Motions;Kling 复制动作序列到你的角色上,输出 **1080p + 原生音频**。

### Motion Transfer(用手机拍摄迁移)

> 来源:[Em6pM_MPNmc](https://www.youtube.com/watch?v=Em6pM_MPNmc)

> 原文:「For more pro-level control, you can even shoot something yourself on your phone, doing the exact camera movement you want on a short clip, and then apply that same camera motion to a new video generation.」

**用自己手机拍摄摄像机运动视频** → 直接把运动迁移到 AI 生成的镜头上。

### Motion Control 已知限制

- 人物**不能躺下**,坐姿也不稳定 → 改用普通 image-to-video + 文字描述
- 不要在 prompt 写 `camera is stationary` → 背景会完全冻结
- 不要在 prompt 塞太多元素(如 1 只狗+2 只企鹅+3 只猫 → AI 会合并生物)
- 触发的动作要细微、聚焦

### 4K 输出 + Team Workspace

> 来源:[yUBGI_kUm-g](https://www.youtube.com/watch?v=yUBGI_kUm-g)

- **4K 输出**:Kling 3.0 Omni 模式下可选 4K 分辨率;建议 9 秒以内保证质量
- **Team Workspace**:创建 Workspace → 邀请成员 → 分配角色;所有 Elements、Motions、生成历史在团队内共享

---

## 7. Motion Brush 运动笔刷

> 来源:[anACVZDNw6o](https://www.youtube.com/watch?v=anACVZDNw6o) — *How to Use Kling AI Tutorial*(145K)

- 手动绘制运动区域遮罩,指定方向(左/右/上/下)
- 同时提供 Start Image + End Image,让 Kling 自动过渡
- Virtual Try-On:上传模特图 + 服装图 → 模特穿上指定服装
- Style 选项:Cinematic、Anime、Classic、Grunge
- Lens 类型:Macro、Wide Angle、Fisheye、Anamorphic

---

## 8. 摄像机运动提示词完整列表

> 来源:[cHpgSf7LKEE](https://www.youtube.com/watch?v=cHpgSf7LKEE) — *EVERY Camera Movement Prompt in Kling 2.5*(144K)

| 关键词 | 效果 |
|--------|------|
| `fixed lens` | 完全静止镜头 |
| `zoom in` | 推近 |
| `camera pullback` | 拉远 |
| `fast` | 加速摄像机动作 |
| `rotating lens` | 环绕拍摄(arco shot),成功率极高 |
| `fpv` | 第一人称视角,适合穿越景观 |
| `follow` | 跟拍(人物背对走开) |
| `tracking shot` | 轨道跟拍 |
| `crane shot` | 从眼平高度升至俯视(吊臂镜头) |
| `bird's eye view` | 俯拍 |
| `pan` | 左右平移 |
| `tilt up` / `tilt down` | 上/下倾斜 |
| `dolly in` / `dolly out` | 推进/拉出(几何最稳定) |

### Scene Context 技巧(最重要)

> 来源:[cHpgSf7LKEE](https://www.youtube.com/watch?v=cHpgSf7LKEE)

单纯写摄像机动作不够,必须加**画面聚焦目标**:

- 错误:`camera zooms in as he turns and raises a pistol`
- 正确:`camera zooms in on his eyes as he turns and raises a pistol`

> 原理:告诉摄像机"朝什么方向移动" + "要展示什么内容",而不只是说动作。

### 颜色饱和度控制

摄像机大幅移动后 AI 会自动增强色彩饱和度 → 加 `muted colors` 保持与原图一致。

### 组合镜头

```
camera pull back and then tilt up to reveal what's in the sky
```
> 注意:离原始图像越远,一致性越差。

### 摄像机动作稳定性对比(室内动画实测)

> 来源:[TEj_4hpAk4w](https://www.youtube.com/watch?v=TEj_4hpAk4w) — *1 PROMPT Replaced 850 Renders*(116K)

| 摄像机动作 | 表现 |
|-----------|------|
| `dolly in` / `dolly out` | 最佳,深度处理好 |
| `truck`(横移) | 可用 |
| `pan`(水平旋转) | 几何会变形 |
| `tilt`(俯仰) | 细节高度幻觉 |
| `boom`(升降) | 产生故障感 |

**核心结论**:只有一张输入帧时,优先用 **Start + End Frame** 而不是纯摄像机 prompt,几何更稳定。

---

## 9. Start / End Frame 高级用法

> 来源:[TEj_4hpAk4w](https://www.youtube.com/watch?v=TEj_4hpAk4w) · [Em6pM_MPNmc](https://www.youtube.com/watch?v=Em6pM_MPNmc) · [0CjArtUh_Wg](https://www.youtube.com/watch?v=0CjArtUh_Wg)

### AI Transitions(AI 转场)

> 原文(Em6pM_MPNmc):「You can take the last frame of the first shot and the first frame of the second shot and add them both in Kling's image to video using start and end frame. Add a text prompt of what you want the transition to do.」

**工作流**:
1. 取第一段视频最后一帧
2. 取第二段视频第一帧
3. 放入 Image-to-Video 的 Start + End Frame
4. Prompt 描述转场动作
5. 生成中间连接段

### Scene Continuation(场景接续)

> 来源:[0CjArtUh_Wg](https://www.youtube.com/watch?v=0CjArtUh_Wg)

- 下载上一个 shot 的最后一帧
- 将其作为下一个 shot 的 Start Frame
- 结合 End Frame(用 Nano Banana 生成目标构图)

**Start/End Frame 去人过渡技巧**:先用 Nano Banana 把图中人物去掉(`remove the guy and close the door`),再以空帧为开始帧,人物帧为结束帧,Kling 自动填充过渡。

### 创意用法

- 室内家具飞入:Start = 家具悬浮空中,End = 家具就位
- 日夜流逝:Start = 白天,Prompt 描述变夜晚
- 焦点转移:直接在 prompt 描述焦点从哪里转到哪里
- 一定要**禁用音频功能**(节省 credits)

### Zoom Out 变通方案

> 来源:[i-Y9I33e_WA](https://www.youtube.com/watch?v=i-Y9I33e_WA)

Kling 原生 zoom out prompt 效果差;解决方案:用 Midjourney 的 zoom out 功能生成更宽角的图,作为 End Frame 上传,再让 Kling 做从原图到宽角图的过渡;**缺点:生成时间加倍**。

---

## 10. Kling O1 (Omni-1) 高级功能

> 来源:[Em6pM_MPNmc](https://www.youtube.com/watch?v=Em6pM_MPNmc) · [VWPrLusbFG4](https://www.youtube.com/watch?v=VWPrLusbFG4) · [m5WtZtI_MRg](https://www.youtube.com/watch?v=m5WtZtI_MRg)

O1 是第一个把文本、图像、视频三合一的统一模型,区别于标准 Kling 3.0。

### O1 的 10 项核心功能(来自 m5WtZtI_MRg)

1. **Previous & Next Shot**:上传已有视频,prompt「generate the next shot」或「generate the previous shot」,自动续写前后场景
2. **Video for Camera Movement**:用 3D 简单几何视频作为摄像机运动参考源
3. **Video for Action**:用真人动作视频驱动 AI 角色(慢动作效果最佳,快速动作有手部变形)
4. **Remove People/Objects**:`remove the people in the background from video 2`
5. **Virtual Try-On**:`replace the coat in video 1 to the coat in image 1`
6. **Change Backgrounds**:`change the background in video 1` + 目标环境描述
7. **Change Weather/Environment**:`change video 1 to winter day snow falling from the sky`
8. **Adding Special Effects**:`make the ground crack in video one. As dust and debris scatter, the character emerges from the hole`
9. **Change Camera Angles**:`generate another angle/composition aerial view topdown in video one`
10. **Start & End Frame**:支持 10 秒 1080p(比 Runway 同类功能长一倍)

### 参考图精细控制

> 来源:[Em6pM_MPNmc](https://www.youtube.com/watch?v=Em6pM_MPNmc)

> 原文:「A lot of people just add three to seven reference images and let it run. But if you want better results, you can actually assign each reference image a clear role in the prompt.」

```
reference image1 for lighting and color grading only
reference image2 for environment design
ignore the subjects in those references
```

### AI Video Editing(视频内容编辑)

> 原文:「You can think of this like Photoshop generative fill for video. Just upload your shot, explain what you want changed, and hit generate. You get an entirely new version of your video where the model preserves the motion and camera structure of your shot.」

支持:
- 移除元素:`remove the logo from the wall`
- 添加元素:`add a gun into the character's hand`
- 换服装/颜色:`change the character's jacket from black to red`
- 换视角:`convert to a close-up shot` / `convert to a wide shot`
- 换风格:`cinematic color grade with a filmic look. Preserve camera motion and timing.`

### Kling O1 vs Kling 2.5 Turbo 定位区别

> 来源:[TJRCHVAOZD4](https://www.youtube.com/watch?v=TJRCHVAOZD4)

- **O1**:主打「完全控制」
- **2.5 Turbo**:主打「快速电影感镜头」

---

## 11. OmniEdit 重新打光 / 换背景 / 换风格

> 来源:[HTBfxEqDCdU](https://www.youtube.com/watch?v=HTBfxEqDCdU)

Kling 3.0 OmniEdit 模型(区别于标准生成模型)支持对已有视频进行编辑:

- 换背景:`restyle @video but change the background to be a snowy mountain`
- 用图片驱动风格替换:`restyle @video with the style of @image`
- 适用场景:保留角色和产品,替换环境、打光或画风

---

## 12. Multi-Elements Editor: Swap / Add / Delete

> 来源:[xoSbJFRnKMM](https://www.youtube.com/watch?v=xoSbJFRnKMM)

Kling 2.0(目前也对应 1.6 模型)的多元素编辑器三个功能:

**Swap(替换)**:
```
swap black jacket from image for blue jacket from video
```

**Add(添加)**:
```
using the context of video seamlessly add golden retriever walking alongside the man from image
```

**Delete(删除)**:
```
delete the gun from the reference video
```

技巧:测试想法先用 5 秒视频,确认 prompt 有效再做全长。

### Restyle 功能

> 来源:[xoSbJFRnKMM](https://www.youtube.com/watch?v=xoSbJFRnKMM)

生成图后点 Restyle,输入:
```
transform the environment to nighttime with city lights and neon glow. Keep the same girl and pose
```
→ 保留主体,替换背景/时段;节省反复生成的积分。

---

## 13. 3×3 图像网格法(一 prompt 多角度/多帧)

> 来源:[OA5g63cBp7A](https://www.youtube.com/watch?v=OA5g63cBp7A) — *Create Seamless AI Films from One Prompt*(122K) · [_kYAkogj9WE](https://www.youtube.com/watch?v=_kYAkogj9WE)(416K)

一次生成包含 9 个不同摄像机角度的角色参考图,用作后续 Elements 或直接动画化。

### 必须添加的收尾行

```
Images stacked together with no grid lines and no borders. No Text
```

### 完整 Samurai 网格 Prompt(原文)

```
A cinematic 3×3 grid presenting multiple camera angles
A lone samurai wearing worn indigo robes and partial armor stands beside a quiet rural 
road near rice fields, with distant mountains and wooden villages fading into mist. 
A sheathed katana rests at his side, fabric subtly moving in the evening wind.
Each frame shows a distinct shot: extreme close-up, medium shot, over-the-shoulder, 
wide shot, high-angle top-down, low-angle, profile, three-quarter rear view, 
and full back view.
Natural lighting, muted earth tones, soft fog, minimal color saturation, shallow depth 
of field, cinematic framing. 
Consistent subject appearance across all frames, film-still aesthetic, professional 
cinematography reference sheet style, ultra-realistic photography.
Images stacked together with no grid lines and no borders. No Text
```

### 改造成叙事帧序列

把「每帧显示不同角度」改成具体情节描述,例如:

```
Cinematic 3x3 grid presenting a storytelling sequence. A samurai in layered dark armor 
with a katana. Scene 1: Samurai cautiously enters an abandoned village gate. 
Scene 2: Close-up of his eyes scanning the deserted street. Scene 3: He crouches, 
examining tracks in the dust. Scene 4: Wide shot — burnt buildings surround him. 
Scene 5: A shadow moves behind a broken wall. Scene 6: Bandits emerge from ruins, 
outnumbering him. Scene 7: Medium shot — samurai grips the katana hilt. 
Scene 8: Dynamic low angle — samurai draws his blade. Scene 9: Clash — swords meet 
in a burst of sparks.
```

---

## 14. Character Sheet 角色一致性方法

> 来源:[G01kghX152g](https://www.youtube.com/watch?v=G01kghX152g) — *This One Prompt Fixes AI Character Consistency*(231K) · [h5kjDJrHw_g](https://www.youtube.com/watch?v=h5kjDJrHw_g)(68K)

### 单 prompt 生成角色参考卡

用单一 prompt 生成**角色参考卡(Character Sheet)**:正面全身、侧面、3/4 视角、背面,加面部特写。

```
A character reference sheet showing [character description]. Full body front view, 
side profile, three-quarter view, and back view on the top row. Close-up face shots 
from front and profile on the bottom row. Hyperrealistic style, professional lighting, 
consistent appearance across all panels. Images stacked together with no grid lines 
and no borders and no text.
```

### 防脚部截断修正

```
remake this image, ensuring the entire top row shows full body views from head to toe. 
All subject in top row must be fully visible including feet with no cropping at the 
ankles, knees or head
```

### OpenArt 角色系统(h5kjDJrHw_g)

- 工具:**OpenArt 角色功能**(支持选择模型/4K/自由训练)
- 两种创建方式:①描述文字生成 → 选择最佳版本 → Build Character;②上传 1~4 张参考图
- 系统自动生成:正面全身、特写、全身、背面 4 张训练图
- **3D Editor**:可拖拽调整角色姿势(选预设动作 + 调整 + 调整相机角度 → Update Pose)
- **Position 功能**:上传环境图 → 拖动方块指定角色位置 → 角色精准出现在指定位置

### 多角色召唤语法

```
@Robin and @Leila at the ski center, standing on top of the ski mountain at @image1. 
They are posing for a photo together. @Robin is wearing this ski outfit @image2, 
while @Leila is wearing this one @image3.
```

---

## 15. Image-to-Video 真人动作精准控制

> 来源:[vqwaJZ5RVxU](https://www.youtube.com/watch?v=vqwaJZ5RVxU) — *How to Prompt for Realistic Human Motion in Kling*(114K)

### 核心原则:描述动作 ≠ 描述图像

- ❌ `a woman sitting on a sofa`
- ✅ `A husky puppy runs onto the woman's lap`

AI 根据动作描述推断角色该如何移动。

### Kling 擅长的动作类型

- 手部/手臂动作(阅读翻页、喝茶、手指指向)
- 全身动作
- 保持身体结构稳定的小幅运动

### Professional 模式的反直觉

- Pro 模式提升画质但**会压制大幅运动**,开 Pro 后角色动作变少甚至不动
- 解决方法:把 **Relevance & Creativity 滑块调至最高(0.9-1.0)** 强制模型遵从 prompt
- 代价:面部可能模糊/颜色变亮

### 多动作同时执行

```
kneeling and praying
```
标准模式 + 最大 Relevance,AI 可以同时执行。

### 头部/视线控制

可用 `looks left`、`turns to face us` 等 prompt 控制头部朝向;阴影随之变化(略有形变)。

### 当前 Kling 已知弱点

- 图生视频模式下**无法可靠控制摄像机运动**(zoom in / pan 等)
- 大幅运动 → 面部细节损失明显

---

## 16. 7 种通用 Prompt 结构(Kling/Veo/Sora 通用)

> 来源:[zzBmvzR-URg](https://www.youtube.com/watch?v=zzBmvzR-URg) — *The ONLY 7 Prompts You Need to Create Any AI Video*(231K)

### ① 电影 prompt

描述摄像机运动(静止、缩放、轨道旋转、手持摇晃、鸟瞰),用关键词如 `the camera rotates`、`the camera orbits`。

### ② 时间戳 prompt

```
[0-3s] the camera zooms in towards him
[3-5s] the camera tilts down to show him looking at this recording device
[5-8s] the camera tilts back up again to see him looking up towards the sky
```

### ③ 切镜 prompt

```
The astronaut turns and walks towards a spaceship. Cut to the boots of the astronaut 
walking along the terrain inside a cinematic film.
```

**注意**:切换前后场景不能差异过大,否则 AI 可能风格跳变(写实→3D 动画)。

### ④ GPT prompt 助手

把模型官方 prompt 文档(如 Kling/Veo 指南 PDF)上传到自定义 GPT 知识库;输入场景描述,GPT 自动补全细节。

**元 prompt**:
```
This provides optimized prompts for the user's ideas based on the documentation.
```

### ⑤ 锚定 prompt(Anchor Prompt)

用于防止 AI 忘掉重要视觉细节;在 prompt 中主动重复提及需要保留的外观特征,例如 `red embers and ash on him`;特别适合侧面/背面起始帧时补充被遮住的身体特征(如纹身、护甲有无)。

### ⑥ 图像 prompt(Image-to-Video)

用图像控制首帧 + 可选尾帧(Start and End Frame);多角色一致性靠多张参考图保持。

### ⑦ 负向 prompt

```
no windows
completely silent, no gunshots, no clicking, no trigger
```

比描述"正确状态"更直接高效。

---

## 17. Kling 3.0 与其他模型的差异化优势

> 来源:[c8huoAtXGew](https://www.youtube.com/watch?v=c8huoAtXGew) · [nUgx8ETiR1g](https://www.youtube.com/watch?v=nUgx8ETiR1g) · [z84WQAn6U0I](https://www.youtube.com/watch?v=z84WQAn6U0I) · [jQvHqKrGhy8](https://www.youtube.com/watch?v=jQvHqKrGhy8)

### Kling 3.0 vs Seedance / Sora / Veo 核心差异

| 能力 | Kling 3.0 表现 |
|---|---|
| **6 shots within 15s** | Multi-Shot 自动切分镜,单次生成多角度叙事(Seedance 仅支持时间轴) |
| **中文 prompt 原生支持** | 字幕直接说 Kling 是「中文最强」,支持西班牙语/日语 |
| **lip-sync 10秒内** | 对话集中前 10 秒,后 5 秒留无台词;Kling 3.0 多角色对话自动切镜 |
| **Elements 跨镜头一致性** | 把角色/物体打包成可复用资产,所有镜头一致 |
| **OmniEdit 视频编辑** | 像 Photoshop generative fill 一样编辑现有视频 |
| **Motion Library** | 内置热门动作预设,一键复用 |
| **Image-to-Video 优先** | jQvHqKrGhy8 字幕:「95% 的时间应用图生视频而非文生视频」 |

### Kling 3.0 镜头特性

> 来源:[nUgx8ETiR1g](https://www.youtube.com/watch?v=nUgx8ETiR1g)

- **可扩展性(scales with detail)**:给得越精确,执行越准确;简单场景用短 prompt,复杂 VFX 必须给详细 prompt
- **强关键帧 > 完美 prompt**:「Strong keyframe with a simple prompt will almost always outperform a perfect prompt with a weak image」
- 自动保持变形镜头(anamorphic)的光晕特性
- 理解 bokeh 为空间扭曲而非简单虚化
- **Auto Multi-Shot**:不写具体分镜,让 Kling 自行决定镜头切换

### 情绪驱动技巧

> 来源:[z84WQAn6U0I](https://www.youtube.com/watch?v=z84WQAn6U0I)

- prompt 只写情绪,不加对话,Kling 3.0 通常只有情绪表演,不会随机添加台词
- Kling 2.6 会对无对话场景随机加台词,**3.0 改善**

### Less is More 原则(图生视频)

> 来源:[jQvHqKrGhy8](https://www.youtube.com/watch?v=jQvHqKrGhy8)

- 提供好的起始帧后,prompt 越简越好
- 过度描述反而干扰 3.0 的自主细节添加
- **12 秒最佳时长**(虽然支持 15 秒,实测 12 秒以内质量最稳定)

---

## 18. 参数设置建议(Pro 模式 + Relevance 滑块)

> 来源:[EWBsU0fSgPs](https://www.youtube.com/watch?v=EWBsU0fSgPs) · [Mrq34YqIlV0](https://www.youtube.com/watch?v=Mrq34YqIlV0) · [i-Y9I33e_WA](https://www.youtube.com/watch?v=i-Y9I33e_WA)

| 参数 | 建议 |
|------|------|
| 模式 | Professional Mode(更高质量,信用消耗更多但值得) |
| Creativity 滑块 | 偏 Relevance 端 = 可预期结果;偏 Creativity 端 = AI 自由发挥 |
| 生成时长 | 10 秒比 15 秒一致性更好(Dan Kieft 实测) |
| Relevance 滑块 | 调到 **0.9-0.95**(4/5 档)最大遵循 prompt;不要拉满,过僵硬 |
| Negative Prompt | `blurry, distorted, unrealistic hands, warped faces, glitchy movement, pixelated, low quality, jerky camera, unnatural lighting` |

### Image-to-Video 工作流(画质最大化)

> 来源:[Mrq34YqIlV0](https://www.youtube.com/watch?v=Mrq34YqIlV0)

- 用 Midjourney 生原始图,加 `--sref` 风格参考图,**`--sw 15`**(默认 100 太高)
- 用 Magnific 对图像上采样后再导入 Kling
- 用 Topaz AI Video Upscaler 做 4K 上采样,AI Model 选 **Rhea**(比默认 Proteus 更好)

**动作关键词(避免形变)**:
```
subtle motion, static camera, slowly
```

### 文生视频摄像机控制

> 来源:[i-Y9I33e_WA](https://www.youtube.com/watch?v=i-Y9I33e_WA)

- 优先用界面上的 Camera Control 选项
- 若需要列表外的摄像机运动,在 prompt 最开头写入,格式:先写 shot type(ultra wide angle / close-up / low angle / aerial),或先写摄像机运动词
- **切记**:不要同时在 prompt 里写 shot type 和 camera movement,模型会混乱

---

## 19. 已知限制与避坑

> 来源:[b_RghITuQQM](https://www.youtube.com/watch?v=b_RghITuQQM) — Dan Kieft 实测 · 多视频汇总

| 问题 | 说明 | 解决方案 |
|------|------|---------|
| 10 秒后口型同步出错 | Kling 3.0 当前限制 | 对话放在前 10 秒,后 5 秒留给动作 |
| 超过 4 个参考图容易 glitch | | 控制在 3-4 张以内 |
| Multi-Shot 不能同时用 Start+End Frame | 功能互斥 | 二选一 |
| 摄像机大幅移动后颜色饱和度增强 | | 加 `muted colors` |
| Motion Control 人物躺下/坐姿不稳定 | | 改用普通 image-to-video |
| `camera is stationary` 导致背景完全冻结 | | 删除该词,改描述具体拍什么 |
| 持续降雨场景几秒后停雨 | Kling 3.0 已知问题 | 用 Start/End Frame 提示雨持续 |
| 文生视频脸部中远景变糊 | 3.0 仍有此问题 | 用图生视频 + Character Sheet 修正 |
| Kling 3.0 有时无视"不要讲话"指令 | | 改用「情绪驱动」prompt |
| 复杂文字渲染仍有问题 | | 文字单独叠 |
| Negative Prompt 解决 90% 故障 | xoSbJFRnKMM 实测 | `no distorted faces, no jittery movement` |
| 多角色 ≥3 容易错位/融合 | | 单 shot 最多 2-3 个主要角色 |

---

## 20. 真实提示词原文(按来源逐字)

### 来源 A:[EWBsU0fSgPs](https://www.youtube.com/watch?v=EWBsU0fSgPs) — 5 要素结构示例

#### A1 未来城市(完整 5 层)
```
A gleaming futuristic metropolis with towering glass skyscrapers and flying vehicles 
zooming between buildings. The city is bustling with activity as holographic 
advertisements illuminate the streets below. Neon lights reflect off wet pavement 
after a recent rainfall. The camera starts high above the city and gradually descends, 
moving through the layers of flying traffic to reveal the street level.
```

#### A2 山顶女性(图转视频)
```
The woman's hair and clothes gently move in the mountain breeze as she takes a deep 
breath of the fresh air. The clouds in the background drift slowly across the sky while 
distant birds soar between peaks. The camera gradually pulls back to reveal more of the 
majestic landscape surrounding her.
```

#### A3 咖啡杯(图转视频)
```
A coffee cup sits on a wooden window sill with soft light coming through the window. 
Outside, people walk by on the busy street, some rushing, others strolling. The camera 
slowly moves in a subtle arc around the cup, maintaining focus on the coffee cup while 
the background gradually blurs.
```

#### A4 Elements 商务演示
```
The businessman confidently presents to an unseen audience in the modern office space, 
gesturing with his hands as he speaks. The office environment remains static while he 
moves naturally. The camera slowly zooms in on him as he delivers his presentation.
```

#### A5 Elements 黄金猎犬
```
The golden retriever runs playfully along the shoreline, kicking up sand and water as 
its paws hit the wet beach. Its fur and ears bounce with each stride as it chases after 
an unseen object. Waves gently roll onto the shore in the background while seagulls fly 
overhead. The camera pans smoothly following the dog from the side as it runs from left 
to right across the frame.
```

---

### 来源 B:[4_ZdSLA_OTQ](https://www.youtube.com/watch?v=4_ZdSLA_OTQ) — Kling 2.6 原生音频

#### B1 超级英雄格斗
```
Spider-Man and Iron Man fighting in a barren wasteland, epic and cinematic.
```

#### B2 咖啡馆对话(原生音频)
```
Two friends sitting in a cozy cafe. One asks, did you ever finish that novel? 
The other replies, almost, I just can't seem to write the ending. 
Soft ambient cafe audio, warm lighting.
```

#### B3 雨天咖啡馆(情绪特写)
```
A cinematic rainy day cafe. Rain splashes against the window with a cool blue green tone. 
A blonde woman walks in slightly damp and sits down gazing directly at the camera 
and the woman says, "Some moments don't disappear. They just wait for you to return."
```

#### B4 屋顶追逐
```
A rooftop chase at sunset. A thief sprints across narrow rooftops as a camera follows 
from behind. They leap between buildings as pigeons scatter in the sky. 
Fast dynamic camera movement, cinematic atmosphere, audio of wind, and footsteps.
```

#### B5 宇航员失重
```
Astronaut drifting weightlessly in a space station. Slow pan outwards. 
Space station ambiance and sounds.
```

---

### 来源 C:[O-WFLK3em5I](https://www.youtube.com/watch?v=O-WFLK3em5I) — Motion Control

#### C1 击鼓(Motion Control)
```
The man wildly plays an invisible drum kit, striking the air with intense, 
energetic drumming motions.
```

#### C2 功夫(Motion Control)
```
The man performs a fast, continuous combo of kung fu fighting movements, striking the air 
with precise punches, sharp kicks, and flowing defensive blocks against invisible opponents.
```

---

### 来源 D:[cHpgSf7LKEE](https://www.youtube.com/watch?v=cHpgSf7LKEE) — 摄像机运动

#### D1 正确写法(含目标聚焦)
```
camera zooms in on his eyes as he turns and raises a pistol
```

#### D2 城市雨夜写实
```
A lone man wearing a black trench coat walks through a rain-soaked futuristic Tokyo 
street at night. Neon reflections glowing across the wet pavement. Cinematic handheld 
camera slowly tracking toward him.
```

---

### 来源 E:[xoSbJFRnKMM](https://www.youtube.com/watch?v=xoSbJFRnKMM) — 5 步框架

#### E1 商务女性咖啡馆
```
A confident businesswoman in her 30s wearing a cream blazer sits by a window, slowly 
sipping her latte while checking emails on her laptop. Modern cafe with large windows 
and minimalist decor. Warm morning sunlight streaming through the window, soft ambient 
cafe lighting. Medium shot that slowly pulls back to reveal the full cafe setting. 
Cinematic color grading.
```

#### E2 图生视频(简化版)
```
Reading a book while occasionally turning pages and looking around. Warm afternoon 
sunlight, filtering through trees, slow push in shot focusing on their peaceful expression.
```

---

### 来源 F:[P7pH_1zFKbE](https://www.youtube.com/watch?v=P7pH_1zFKbE) — Nano Banana Pro + Kling 广告

#### F1 LeBron 眼部特写
```
An extreme close-up of LeBron James' eyes locked in focus during a free throw. 
The sweat is glistening on his skin. Arena lights sharply reflected on his pupils. 
Ultra shallow depth of field isolating the eyes with a creamy bokeh.
```

#### F2 静止运动镜头
```
Focused eyes, blinking once, looking at the same place. Sweat is like dripping down from 
one eye and we have some very subtle skin shimmer from the sweat. Keep the camera almost 
still with a slight natural handheld motion.
```

#### F3 球变形过渡
```
Camera constantly following the ball, keeping it centered. Do not let the ball go left 
or backwards. Keep the motion smooth and steady.
```

#### F4 出手动作
```
Animate the player lifting the ball slightly higher and releasing it in a smooth 
controlled shooting motion.
```

---

### 来源 G:[VWPrLusbFG4](https://www.youtube.com/watch?v=VWPrLusbFG4) — Kling O1

#### G1 Start/End Frame 转场(原文)
```
Animate the transition between these frames. Keep the same character identity. 
Match the lighting. Cinematic slow drift.
```

#### G2 Kling 2.5 Turbo 文生视频
```
A neon lit alleyway. Slow handheld push in on a female character. Particles drifting 
through the light. Dramatic atmosphere.
```

---

### 来源 H:[m5WtZtI_MRg](https://www.youtube.com/watch?v=m5WtZtI_MRg) — Kling O1 10 项功能

#### H1 Next Shot 模板
```
Reference video source [video 1], generate the next shot. [A seagull suddenly flies into 
the frame, steals the woman's sandwich. She is startled, and the man continues to laugh.]
```

#### H2 添加特效
```
make the ground crack in video one. As dust and debris scatter, the character emerges 
from the hole in the ground as more dust comes out from within the hole.
```

#### H3 Start/End Frame 产品镜头
```
Pouring a drink into a glass transitions into a product shot. The neon lights glow and 
move in the background.
```

---

### 来源 I:[HTBfxEqDCdU](https://www.youtube.com/watch?v=HTBfxEqDCdU) — Kling 3.0 PRO

#### I1 Multi-Shot 简单版(3 镜头)
```
Shot 1: Man says "Hollywood is officially cooked."
Shot 2: Change angle to side profile. Man says "because now you can have multi-shot videos."
Shot 3: Change the angle again to a front closeup of the man. He says "from a single image."
```

#### I2 OmniEdit 背景替换
```
Restyle @video but change the background to be a snowy mountain.
```

#### I3 OmniEdit 风格图引导
```
Restyle @video with the style of @image.
```

---

### 来源 J:[0CjArtUh_Wg](https://www.youtube.com/watch?v=0CjArtUh_Wg) — 长动画视频

#### J1 Start/End Frame 过渡(开门进屋)
```
He grips the doorknob, turns it, and pushes through the door while saying "I'm home." 
He steps inside and slides his hands from the doorknob to the edge of the door, 
looking into the room.
```

#### J2 Scene Continuation(摄像机平移)
```
A man closed the door. Camera turns slowly. Pans towards the kid.
```

#### J3 Multi-Shot 三镜头叙事(父子)
```
Shot 1 (3s): A father tucks his young son into the bed. Gently brushes his hair. 
Both look sad.
Shot 2 (4s): The father stands up, turns off the light, opens the door, and walks out 
into the hallway. The door slowly closes.
Shot 3 (3s): @image2. The father leans against the wall besides the door and slowly 
slides down to sit on the floor.
```

---

### 来源 K:[nUgx8ETiR1g](https://www.youtube.com/watch?v=nUgx8ETiR1g) — Kling 3.0 压力测试

#### K1 F1 换胎(Multi-Shot)
```
Shot 1: Grip shot on the front tire of the car as it pulls in — camera is mounted on 
the tire, spinning alongside it.
Shot 2: The car pulls into the pit lane and stops. Wide shot.
Shot 3: Three tire changes happen simultaneously — medium tracking shot.
Shot 4: Grip shot on the front tire again as the car pulls away.
```

#### K2 PIT 追车
```
Grip shot on the roof of the police car, right behind the sirens. Both cars make the turn. 
The cop car catches up and performs a PIT maneuver. Raining. Nighttime. Cinematic.
```

---

### 来源 L:[h5kjDJrHw_g](https://www.youtube.com/watch?v=h5kjDJrHw_g) — OpenArt 角色

#### L1 OpenArt 角色生成
```
A natural portrait shot of an Asian woman in her 20s. She looks like a 20-year-old 
Gen Z influencer, beautiful, natural looking with professional studio lighting.
```

#### L2 多角色场景(滑雪)
```
@Robin and @Leila at the ski center, standing on top of the ski mountain at @image1. 
They are posing for a photo together. @Robin is wearing this ski outfit @image2, 
while @Leila is wearing this one @image3.
```

#### L3 Kling 2.6 视频(滑雪一致性)
```
Robin is going down the ski mountain on her skis, then she stops, and then she looks 
towards the camera. She stays perfectly consistent throughout the video. 
Wearing these exact clothes @image2.
```

---

### 来源 M:[tqZ0JuUevwA](https://www.youtube.com/watch?v=tqZ0JuUevwA) — AI Filmmaking 对话

#### M1 文生视频对话场景(Brooklyn Bridge)
```
Don't do this. I am begging you.
[Shot 1, Brooklyn Bridge, couple arguing, close-up on woman's face, 5s]
[Shot 2, reverse angle on man, 5s]
[Shot 3, wide establishing shot, 5s]
No music, no background dialogue.
```

---

### 来源 N:[zzBmvzR-URg](https://www.youtube.com/watch?v=zzBmvzR-URg) — 7 种结构

#### N1 时间戳结构
```
[0-3s] the camera zooms in towards him
[3-5s] the camera tilts down to show him looking at this recording device
[5-8s] the camera tilts back up again to see him looking up towards the sky
```

#### N2 切镜结构
```
The astronaut turns and walks towards a spaceship. Cut to the boots of the astronaut 
walking along the terrain inside a cinematic film.
```

#### N3 负向 prompt
```
completely silent and quiet and no gunshots, no clicking, no trigger
```

---

### 来源 O:[vqwaJZ5RVxU](https://www.youtube.com/watch?v=vqwaJZ5RVxU) — 真人动作

#### O1 触发新主体进入画面
```
A husky puppy runs onto the woman's lap
```

#### O2 多动作同时执行
```
kneeling and praying
```

---

### 来源 P:[jQvHqKrGhy8](https://www.youtube.com/watch?v=jQvHqKrGhy8) — 3.0 评测

#### P1 多摄像机序列
```
Camera performs a fast lateral pass left to right. Then a brief crash push in to the face. 
Then a quick pull back and the fast pass back right to the left. Robotic arm. 
Very snappy acceleration.
```

#### P2 Zoom + 慢动作细节化
```
A girl grabs one fried onion. The handheld camera zooms in and stops on the lips just 
as she takes the bite. Add a brief slow motion to the bite itself.
```

#### P3 三段 Multi-Shot 对话
```
Scene 1: Medium shot of the young man and woman standing by the fence at night. 
The man is speaking earnestly, his face illuminated by the warm light from the 
apartment building.

Scene 2: Reverse angle over the shoulder shot, focusing on the woman. She listens with 
a serious expression, then looks down and sighs before looking back up to respond.

Scene 3: Over the shoulder shot focusing on the man, he listens as the woman responds.
```

---

### 来源 Q:[anACVZDNw6o](https://www.youtube.com/watch?v=anACVZDNw6o) — 入门教程

#### Q1 文生视频(直升机场景)
```
Create a high resolution video depicting cinematic shots of a futuristic helicopter racing 
through a neon lit city at night. The scene is color graded with deep blues and fiery 
oranges, emphasizing the speed and intensity. The camera follows from a low angle rear 
perspective with fast motion blur, vibrant exhaust fumes that trail behind, amplifying 
the dynamic energy of the scene.
```

#### Q2 图生视频(鸟儿动画)
```
Cartoon style, two birds are chirping and flapping their wings. Colorful kids vibe.
```

---

### 来源 R:[_kYAkogj9WE](https://www.youtube.com/watch?v=_kYAkogj9WE) — 单图叙事

#### R1 主图生成(雾林模特)
```
A moody photorealistic close-up photograph of a model in a foggy forest. The background 
is softly blurred with a faint silhouette of a distant castle visible through the mist. 
Cinematic lighting, shallow depth of field, natural skin texture.
```

---

### 来源 S:[cGTBzed4S4w](https://www.youtube.com/watch?v=cGTBzed4S4w) — Stop Writing Prompts

#### S1 GPT 元提示词
```
This provides optimized prompts for the user's ideas based on the documentation.
```

#### S2 维多利亚码头女性
```
A woman stands alone on a fog-shrouded pier at dusk. She wears Victorian-era attire — 
a dark green coat with brass buttons, a fitted corset bodice, and a long layered skirt 
with subtle plaid. Her hair is swept up loosely with a few strands escaping in the sea 
breeze. She gazes out toward a large sailing vessel anchored in the distance, her 
expression contemplative. The pier is weathered wood, slick with moisture. Gas lanterns 
cast warm amber pools of light. Camera: slow push-in, medium close shot, focus shifts 
to her eyes at the end. Cinematic color grade, desaturated blues and greens with warm 
lantern highlights.
```

---

### 来源 T:[Mrq34YqIlV0](https://www.youtube.com/watch?v=Mrq34YqIlV0) — 极简动画

#### T1 MidJourney 原图(孙悟空)
```
Photo of The Monkey King Sun Wukong. Detailed fur and accessories. Muted cinematic colors. 
Shot on Cinestill film. --ar 16:9 --q 2
```

#### T2 Kling 动画(极简动作)
```
Animate an angry expression. Static camera.
```

---

### 来源 U:[z84WQAn6U0I](https://www.youtube.com/watch?v=z84WQAn6U0I) — 50 创意 prompt

#### U1 产品广告 + 旁白(Atomic)
```
Bathe in the golden hour. Atomic, crafted with the quiet power of Paris. 
Unleash the moment one sip at a time.
```

---

### 来源 V:[eMDDDdoUgT4](https://www.youtube.com/watch?v=eMDDDdoUgT4) — AE + Kling O1 VFX

#### V1 Kling O1 VFX 合成
```
Video 1: man walks through a field. An apocalyptic battlefield with scattered junk 
around the field as shown in image 1.
```

---

### 来源 W:[yUBGI_kUm-g](https://www.youtube.com/watch?v=yUBGI_kUm-g) — Motion Control 多元素

#### W1 多元素组合(刺客 + 双肩动物)
```
Close above the assassin with the orange cat sitting on his left shoulder, and the cute 
animal sitting on his right shoulder. A slow, consistent pan inward. Third Crusade, 
late 1100s, Middle East medieval setting.
```

---

### 来源 X:[i-Y9I33e_WA](https://www.youtube.com/watch?v=i-Y9I33e_WA) — 官方 Spells 解码

#### X1 图生视频摄像机跟随(官方结构)
```
the woman walks while the camera is following her
```

#### X2 文生视频 + shot type 开头(官方示例)
```
Aerial view. A female adventurer in a brown leather jacket and worn canvas pants stands 
at the edge of a cliff overlooking a vast canyon. She raises her right hand to shade 
her eyes and scans the horizon. Warm golden hour sunlight casts long shadows across 
the red rock formations. Morning light, adventure atmosphere, cinematic.
```

---

## 可直接复制的 Prompt 模板

### 模板 A:5 层标签结构(本仓库标准)

```
Scene: [环境 + 光线]
Characters: [角色描述,含年龄/服装/情绪]
Action: [Shot 1 (0-Xs) 动作描述 + 摄像机. Shot 2 (X-Ys) ...]
Camera: [总体运镜节奏]
Audio & Style: [音效/音乐 + 风格关键词]
Negative: [排除项]
```

### 模板 B:Multi-Shot 6 镜头(15s 内)

```
Shot 1 (0-3s): [type of camera angle] + [character action] + [environment]. 
  Audio: [具体音效].
Shot 2 (3-6s): [新角度] + [新动作]. Audio: [...].
Shot 3 (6-9s): [新角度] + [新动作]. Audio: [...].
Shot 4 (9-12s): [新角度] + [新动作]. Audio: [...].
Shot 5 (12-15s): [收尾]. Audio: [...].
[Each shot ≤ 500 characters, ≥ 3s.]
```

### 模板 C:Constraint Sandwich(O1 专用)

```
[Subject anchor]
[Shot + Action]
[Preserve constraints: camera motion, character identity, lighting, no color changes]
```

### 模板 D:Style Bible Line(跨镜头统一)

```
[每个镜头 prompt 顶部固定加这一行]
Style Bible: Shot on ARRI Alexa, 2.39:1 anamorphic, filmic grain, warm desaturated 
tones, practical lighting only, cinematic depth of field.

[然后才是该镜头独立动作]
```

### 模板 E:Elements 多角色多镜头

```
@CharacterA, @CharacterB at @LocationImage.
Shot 1: @CharacterA says "...". 
Shot 2: Camera reveals @CharacterB. @CharacterB says "...".
Shot 3: Wide two-shot. Both turn to camera.
```

### 模板 F:Anchor Prompt(防遗忘细节)

```
[原始 prompt]
The character has [特定细节1, 细节2, 细节3]. Throughout the shot, keep [细节] visible.
```

### 模板 G:7-类负向 prompt

```
completely silent and quiet and no gunshots, no clicking, no trigger
no distorted faces, no jittery movement
no windows
```

---

## 附录:视频来源索引

| ID | 标题 | 播放量 | 核心贡献 |
|----|------|--------|----------|
| [Em6pM_MPNmc](https://www.youtube.com/watch?v=Em6pM_MPNmc) | Kling O1 Tutorial: 13 Features & Tips | 990K | Constraint Sandwich、Style Bible、Elements、Motion Transfer、AI Video Editing |
| [c8huoAtXGew](https://www.youtube.com/watch?v=c8huoAtXGew) | Kling 3.0 Full Tutorial: Cinematic Short Films | 690K | Bind Elements、character turnaround、Multi-Shot 无缝衔接 |
| [TJRCHVAOZD4](https://www.youtube.com/watch?v=TJRCHVAOZD4) | Kling O1 on Artlist | 690K | O1 vs 2.5 Turbo 定位 |
| [4_ZdSLA_OTQ](https://www.youtube.com/watch?v=4_ZdSLA_OTQ) | Kling 2.6 Native Audio | 584K | 原生音频+视频一体生成、5 个完整提示词 |
| [yUBGI_kUm-g](https://www.youtube.com/watch?v=yUBGI_kUm-g) | Kling 3.0 Is Built for Viral (Motion Control) | 557K | Motion Library 预设、Elements 库多元素组合、Team Workspace、4K |
| [_kYAkogj9WE](https://www.youtube.com/watch?v=_kYAkogj9WE) | Create Seamless AI Films from One Image | 417K | 3×3 Grid 网格生成多角度、叙事帧 prompt |
| [cGTBzed4S4w](https://www.youtube.com/watch?v=cGTBzed4S4w) | The Secret to Better AI Videos: Stop Writing Prompts | 290K | GPT 训练官方文档→自动生成优化 prompt |
| [EWBsU0fSgPs](https://www.youtube.com/watch?v=EWBsU0fSgPs) | STOP Wasting Credits: Kling AI Master | 244K | 5 要素结构、Negative Prompt、参数设置 |
| [G01kghX152g](https://www.youtube.com/watch?v=G01kghX152g) | This One Prompt Fixes AI Character Consistency | 231K | Character Sheet 单 prompt 生成法 |
| [zzBmvzR-URg](https://www.youtube.com/watch?v=zzBmvzR-URg) | The ONLY 7 Prompts You Need | 231K | 7 种 prompt 结构 |
| [P7pH_1zFKbE](https://www.youtube.com/watch?v=P7pH_1zFKbE) | Cinematic AI Ads With Nano Banana Pro + Kling | 228K | 广告分镜流程、球形过渡技巧 |
| [Mrq34YqIlV0](https://www.youtube.com/watch?v=Mrq34YqIlV0) | Cinematic Ai Videos with Kling Ai | 228K | MidJourney→Magnific→Kling Pro、小动作关键词 |
| [b_RghITuQQM](https://www.youtube.com/watch?v=b_RghITuQQM) | Master Kling 3.0 in 25 Minutes | 173K | Multi-Shot 对话、References 三角度技巧、10s 口型限制 |
| [anACVZDNw6o](https://www.youtube.com/watch?v=anACVZDNw6o) | How to Use Kling AI Tutorial | 145K | 完整入门界面、Motion Brush 遮罩、Virtual Try-On |
| [cHpgSf7LKEE](https://www.youtube.com/watch?v=cHpgSf7LKEE) | EVERY Camera Movement Prompt in Kling 2.5 | 144K | 完整摄像机动作关键词表、Scene Context 技巧 |
| [HTBfxEqDCdU](https://www.youtube.com/watch?v=HTBfxEqDCdU) | Kling 3.0 Like A PRO | 143K | Elements @引用、Angles 2.0 12 角度、OmniEdit |
| [OA5g63cBp7A](https://www.youtube.com/watch?v=OA5g63cBp7A) | Create Seamless AI Films from One Prompt | 123K | 叙事帧 3×3 Grid、ChatGPT 改写镜头列表 |
| [TEj_4hpAk4w](https://www.youtube.com/watch?v=TEj_4hpAk4w) | 1 PROMPT Replaced 850 Renders | 116K | Start/End Frame 几何稳定性、摄像机动作稳定性排名 |
| [vqwaJZ5RVxU](https://www.youtube.com/watch?v=vqwaJZ5RVxU) | Realistic Human Motion in Kling | 114K | 动作描述 > 图像描述、Relevance 滑块、Pro 模式反直觉 |
| [7WcVWq-fcXc](https://www.youtube.com/watch?v=7WcVWq-fcXc) | Kling AI Guide (LoRA) | 114K | Kling LoRA 训练流程 |
| [0CjArtUh_Wg](https://www.youtube.com/watch?v=0CjArtUh_Wg) | Long AI Animation Videos Kling 3.0 | 111K | Start/End Frame 去人过渡、Scene Continuation 无缝接续 |
| [O-WFLK3em5I](https://www.youtube.com/watch?v=O-WFLK3em5I) | Motion Control Full Tutorial | 99K | Match Video vs Match Image、参考视频要求 |
| [nUgx8ETiR1g](https://www.youtube.com/watch?v=nUgx8ETiR1g) | Kling 3.0 Can Do Anything | 88K | prompt 细节可扩展性、强关键帧 > 完美 prompt |
| [jQvHqKrGhy8](https://www.youtube.com/watch?v=jQvHqKrGhy8) | Kling 3.0 Review | 81K | Less is More 原则、12 秒最佳时长、三段 Multi-Shot 对话 |
| [tqZ0JuUevwA](https://www.youtube.com/watch?v=tqZ0JuUevwA) | Kling 3.0 for AI Filmmaking | 76K | ChatGPT Multi-Shot 元 prompt 模板、500 字/3s 限制 |
| [h5kjDJrHw_g](https://www.youtube.com/watch?v=h5kjDJrHw_g) | 100% Consistent AI Characters | 68K | OpenArt 角色系统、3D Editor 姿势控制、多角色同帧 |
| [xoSbJFRnKMM](https://www.youtube.com/watch?v=xoSbJFRnKMM) | Master Kling AI in 10 Minutes | 61K | 5 步框架、Restyle 功能、Multi-Elements Editor |
| [i-Y9I33e_WA](https://www.youtube.com/watch?v=i-Y9I33e_WA) | Ultimate Cinematic Prompting Guide for Kling | 58K | 官方 Kling Spells 结构、Zoom Out 变通方案 |
| [VWPrLusbFG4](https://www.youtube.com/watch?v=VWPrLusbFG4) | How to Use Kling O1 | 56K | O1 全功能、Start/End Frame 10s 1080p |
| [eMDDDdoUgT4](https://www.youtube.com/watch?v=eMDDDdoUgT4) | AE + Nano Banana Pro + Kling O1 VFX | 51K | RotoBrush 3 + Kling O1 AI 元素合成 |
| [z84WQAn6U0I](https://www.youtube.com/watch?v=z84WQAn6U0I) | Kling 3.0 Ultimate Guide + 50 Prompts | 39K | 多语言对话、Storyboard Grid、情绪驱动技巧 |
| [m5WtZtI_MRg](https://www.youtube.com/watch?v=m5WtZtI_MRg) | These 10 Kling AI O1 Features | 33K | O1 10 大功能完整列表 |

---

## 与本仓库其他文档的关系

- 基础 5 要素 → [09-kling-公式.md](09-kling-公式.md)(本文档拓展)
- 6 模型对比 → [13-六大模型公式速查.md](13-六大模型公式速查.md)
- Seedance 对比 → [15-seedance-masterclass.md](15-seedance-masterclass.md)(同格式)
- 分镜时序 → [03-分镜时序.md](03-分镜时序.md)
- 运镜词典 → [05-运镜词典.md](05-运镜词典.md)

本文档专门聚焦 **Kling 3.0 / O1 YouTube 实战社区**的方法,与官方文档/Atlabs 博客形成三角验证。
