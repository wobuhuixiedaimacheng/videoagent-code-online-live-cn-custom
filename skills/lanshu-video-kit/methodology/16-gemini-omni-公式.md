# 16 · Gemini Omni 公式 — Google AI 官方 5 大 Prompting 技巧

> 来源:[Google AI 官方 X 推文(2026-05-26)](https://x.com/GoogleAI/status/2059381218660270435)
> 标题:*Mastering Gemini Omni: The Ultimate Video Prompting Guide*

Google 在 2026-05-19 发布 **Gemini Omni**(Omni Flash 首先上线),定位是跨模态统一模型(any-input-to-any-output),从视频开始。已可在 **Gemini App / Flow / GoogleFlowMusic / YouTube Shorts / YouTube Create** 多平台使用。

---

## Gemini Omni vs Veo 3.1 / Sora 2 怎么选

| 需求 | 推荐 |
|---|---|
| 跨模态 any-input(图片/视频/文字/音频/script → 视频) | **Gemini Omni** |
| 文字渲染在视频里(typography / 浮动 3D 文字) | **Gemini Omni** ⭐ |
| 中途改一个细节不重写 prompt(targeted edit) | **Gemini Omni** ⭐ |
| 改动作不破坏角色连续性 | **Gemini Omni** ⭐ |
| 极简 prompt 用文化锚点直接生成 | **Gemini Omni** |
| 强物理仿真 + 多人对话 + Storyboard | **Veo 3.1** |
| 电影质感 + Cameos + Shot List 分层 | **Sora 2** |

---

## Tip 1:利用 Real-World 知识 — 不要过度描述

**核心**:Gemini Omni 内置 Gemini 的深度世界知识(历史/科学/文化)。**用文化锚点 / 历史时代 / 科学术语直接当 prompt**,模型自动还原。

**反例(过度描述)**:
> A red planet surface, dusty, rocky terrain with a figure in a white suit with a glass helmet...

**正例(锚点 prompt)**:
> Astronaut's POV on Mars

Gemini Omni 自动渲染火星地貌 + EVA 服 + POV 视角。**省 prompt 长度 → 模型有更多算力分配给质量**。

**其他锚点示例**:
- `A marble rolling fast on a chain reaction style track, continuous smooth shot` (Rube Goldberg 锚点)
- `1980s synth-pop music video aesthetic` (年代锚点)
- `Studio Ghibli pastoral scene` (流派锚点)

---

## Tip 2:控制文字渲染(Gemini Omni 核心强项)

**Gemini Omni 不仅能渲染文字,还能精确控制**:
- Typography(字体/字重)
- 空间放置(2D 屏幕 / 3D hover)
- 动画风格(逐字出现 / 节拍同步 / 双重曝光)
- 复杂视觉效果(motion-tracked / leader lines)

**样板 A — 节拍逐词**:
```
word by word, one word on the screen at a time: did, you, know, that, this,
model, can, do, pretty, good, text!? Each word appears with a different
animated style, perfect pacing to a rhythm, sizzle reel.
```

**样板 B — 浮动 3D 文字(Intrusive Thoughts 风格)**:
```
Overlay motion-tracked, minimalist text commentary onto the physical
environment of the video. This text represents [the subject] deadpan,
immediate inner monologue that's observant, slightly absurd, and
life-contemplating. Think "intrusive thoughts." Clean, white, lowercase
sans-serif text (like Helvetica or Inter). The text hovers in 3D space,
connected to the subjects being commented on via ultra-thin, crisp,
white leader lines.
```

**关键词**:`motion-tracked` / `lower thirds` / `text overlay` / `3D space hover` / `leader lines` / `kinetic typography`

---

## Tip 3:像导演一样指挥摄影

Gemini Omni 对精确的摄影术语响应非常好。建议直接使用:

### Shots & Angles
- `One continuous shot` / `oner` — 一镜到底
- `static` / `locked off` / `fixed angle` — 固定机位

### Camera Movements
- `Push in` / `punch in` — 推近
- `pan left` / `pan right` — 摇镜
- `dolly zoom` — 移动变焦(经典眩晕效果)
- `whip pan` — 急摇
- `crash zoom` — 暴推

### Camera Styles
- `Natural smartphone zoom` — 手机自然拉近
- `vintage film camera` — 复古胶片
- `grainy webcam style` — 颗粒摄像头风
- `IMAX 65mm cinematic` — IMAX 质感

---

## Tip 4:迭代编辑(Edit Iteratively)— Gemini Omni 核心差异化

**最大差异化能力**:不需要重写整个 prompt,可以**针对单个细节做 targeted update**,模型保留视频核心结构。

**工作流**:
1. 第一次生成完整视频
2. 用极简 prompt 改一个细节
3. 模型保留其他元素只改你说的部分
4. 可叠加多次迭代

**示例**(同一基础视频上叠加 3 次编辑):
```
[Iteration 1] Transport the violin to a new environment
[Iteration 2] Make the violin invisible
[Iteration 3] Change the camera angle so it's looking over the violinist's shoulder
```

**关键词**:`change the X to Y` / `make X Z` / `transport X to W` / `swap A for B`

---

## Tip 5:中途改动作(Change Action on the Fly)

修改角色 pacing / emotion / interaction,**保持角色连续性不破坏**。

**示例**:
```
Make the character walk on their tiptoes
Speed up the pacing
Have them leap into the air
```

**关键词**:`make X verb` / `speed up / slow down` / `have them <action>` / `now they <action>`

---

## Gemini Omni Prompt 写作 4 步流程

```
Step 1: 用 Real-World 锚点写最简 prompt 生成初版
        (例:"Astronaut's POV on Mars")

Step 2: 加摄影术语 + 文字渲染细节(如需)
        (例:加 "one continuous shot, oner" / "text overlay: 'DAY 47'")

Step 3: 看输出,用 targeted edit prompt 改细节
        (例:"Change the lighting to dramatic golden hour")

Step 4: 必要时改动作
        (例:"Have the astronaut start running toward camera")
```

---

## 与其他 Google 模型对比

| 维度 | Veo 3.1 | Gemini Omni |
|---|---|---|
| 单段时长 | 8s(chained 148s) | 待官方确认 |
| 输入模态 | 文字 / 图片 | **any input(text/image/video/audio/script)** |
| 文字渲染 | 弱 | **业界强项** ⭐ |
| 迭代编辑 | 不支持(每次需重新 prompt) | **targeted updates** ⭐ |
| 动作中途改 | 不支持 | **支持(保连续性)** ⭐ |
| 多人对话 | 业界第一(原生音频)| 未明示 |
| API | Vertex AI / ai.google.dev | Gemini App / Flow / YouTube Shorts |
| 适合场景 | 电影感 + 对白 + 长片 chained | **创意快速迭代** + 文字视频 + 跨模态创作 |

---

## 参考资源

- Google AI 官方推文(本文唯一权威源):[Google AI on X — Mastering Gemini Omni](https://x.com/GoogleAI/status/2059381218660270435)
- 仓库 10 条 Gemini Omni prompts:`prompts/data/all-prompts.json` 中 `gm-001` ~ `gm-010`
- 跨模型对比:[methodology/10-跨模型对比.md](10-跨模型对比.md)
- Veo 3.1 公式(对比阅读):[methodology/12-veo-公式.md](12-veo-公式.md)

**注**:Gemini Omni 是 2026-05-19 才发布的新模型,prompt 库会随官方发布更多样板持续扩充。
