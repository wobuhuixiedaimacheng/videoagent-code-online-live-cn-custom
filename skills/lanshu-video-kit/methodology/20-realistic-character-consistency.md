# 20 · 写实 AI 角色 / 网红 / 数字人物一致性大师课

> 整合 **20 个 YouTube 教学视频**(Batch C 10 + Batch D 10,累计播放 **5M+**),专门覆盖
> 「**AI 网红 / 数字 Persona / 角色跨场景一致性**」这一垂直主题。
> 注:本批视频字幕大多 IP 被锁,内容基于视频描述 / 章节 / 拉取到的 Google Docs prompt pack 整理。

---

## 为什么需要单独一篇

仓库 methodology/15-19 聚焦于**单家视频模型的 prompt 写法**(Seedance / HappyHorse / Kling / Veo / Gemini Omni)。
但**"做一个会动会说话的 AI 网红"** 是一个**跨工具流水线**问题 — 单靠任何一家视频模型都不够。

完整流水线大致是:

```
[基础图]                [一致性扩展]              [驱动]                 [声音 + 后期]
MidJourney v6  ──┐
Flux Dev/Kontext ┼─→ Nano Banana Pro ──→ Kling 2.6 / VEO 3 / ──→ ElevenLabs 配音
GPT Image 2      │   (Character Sheet)      Seedance 2.0           DaVinci Resolve
Ideogram         ┘                          (Image-to-Video)       (剪辑)
```

每一环都有自己的 prompt 公式 + 注意点,这篇统一梳理。

---

## §1 角色一致性的 5 种主流技术

### 技术 1 — Character Sheet(角色卡)

来源:[NpfEKTXBxrY](https://www.youtube.com/watch?v=NpfEKTXBxrY) — *She Isn't Real (DEFINITIVE AI Influencer Tutorial)*(219K 播放)

**做法**:用 Nano Banana Pro 生成多角度(正脸 / 侧脸 / 半身 / 全身)角色参考卡作为后续所有图的统一锚点。生活场景图(咖啡馆 / 户外 / 工作室)从这张卡延伸。

**Nano Banana 多角度 prompt**:
```
Create multiple different angles of this character: front-facing, left profile,
right profile, back of the head, side of the head. Clean white background.
```

> 同样的方法在 [methodology/15 Seedance Masterclass](15-seedance-masterclass.md) §3 也提到过 — 是 video-gen 圈和 influencer 圈共通的基本功。

### 技术 2 — Omni Reference(多图同时参考)

来源:[fxiDS2C9XYA](https://www.youtube.com/watch?v=fxiDS2C9XYA) — *Exactly How AI Influencers Like Aitana Lopez Make Crazy Money*(237K 播放)
工具:OpenArt Flux Dev + Flux Kontext

- Flux Kontext 支持同时输入 **4 张参考图**(不同角度 / 服装)做 omni 参考
- 生成新场景时自动综合所有参考保持角色一致
- 强度参数 **Composition Reference 0.17** 是作者实测出的最稳值

### 技术 3 — OpenArt 内置角色锁定

来源:[kifmKZJA-KE](https://www.youtube.com/watch?v=kifmKZJA-KE)(534K 播放)

- OpenArt 平台内置 "character lock" 功能
- **11 分钟可完成**从 0 到 1 创建一个面部固定的 AI 网红
- 适合不会调 prompt 的入门用户

### 技术 4 — 3×3 角度网格

来源:[pbpzvmtpAZg](https://www.youtube.com/watch?v=pbpzvmtpAZg) — *50 Viral Prompts*(23K 播放)

- 把面部不同角度排成 3×3 网格(9 张图合并成 1 张)
- 上传网格图替代单张正脸,**绕过人脸过滤**同时保持一致性
- 也可以做成"叙事帧序列"(同一角色 9 个时刻)

> 与 methodology/15 提到的 **2×2 网格**对比,3×3 是更新的主推方法 — 稳定性 + 角度覆盖都更好。

### 技术 5 — Face Swap

来源:[H2wv0Sog0jo](https://www.youtube.com/watch?v=H2wv0Sog0jo)(245K 播放)
工具:Krea AI Face Swap

- 用 Krea AI Face Swap **跨场景换脸**保持同一面孔
- 适合多场景视频里的统一角色
- 缺点:皮肤纹理在极端特写下可能露馅(配合 Enhancor V3 修复)

---

## §2 写实人像 Prompt 5 段公式(Dan Kieft Prompt Pack)

> 来源:[fxiDS2C9XYA](https://www.youtube.com/watch?v=fxiDS2C9XYA) Dan Kieft Google Docs Prompt Pack(D10,字幕不可用但 Prompt 原文已拉取)

写实 AI 人像 prompt 由 5 个段落构成:

```
Subject Description (Who):
  e.g. "beautiful 20-year-old woman, East Asian, subtle makeup, modern streetwear"

Pose & Framing (What):
  e.g. "candid shot, sitting at a coffee shop table, looking sideways, soft smile"

Camera & Style (Realism):
  e.g. "photo taken on Fujifilm X100V, 35mm film lens, depth of field, bokeh background, unfiltered"

Skin/Face Details (Avoid AI plastic look):
  e.g. "realistic skin texture, natural imperfections, soft lighting, no over-smoothing, pores visible"

Aesthetic Style (Vibe):
  e.g. "Instagram fashion photography, warm tones, natural light, urban background, professional composition"
```

**完整示范 prompt(原文)**:
```
Beautiful 20-year-old East Asian woman, minimalist makeup, wearing beige
streetwear jacket, candid moment sitting at a cafe table, looking sideways
with soft smile. Shot on Fujifilm X100V, 35mm film, realistic lighting,
natural skin texture, unfiltered, pores visible, soft background bokeh,
Instagram aesthetic, professional urban street photography, warm tones.
```

**关键技巧**:
- **相机型号是杀手锏** — `Fujifilm X100V` / `Fujifilm X-T30` / `Leica Q3` 触发模型的"真实摄影"先验
- **`unfiltered` / `pores visible`** 反 AI 塑料感
- **`Instagram aesthetic`** / **`summer Instagram aesthetic`** 一句话定调

---

## §3 真实 prompt 原文档案

### §3.1 OpenArt 完整角色 Prompt(C4)
来源:[rZW5UjFmJ7w](https://www.youtube.com/watch?v=rZW5UjFmJ7w)(333K 播放)
```
A stylish woman with shoulder length, brown hair, tan skin, and a relaxed,
fit build. She's wearing jeans and a white crop top shirt. She is fit and
attractive with a nice smile. She wears small a gold thin chain necklace.
Her vibe is laid-back and confident, with a natural, effortless charm.
```

### §3.2 多角度旋转一致性 Prompt(C4)
```
rotate her slightly to see a different angle while maintaining the exact
face, expression, hair, outfit and background.
```
> 💡 这是 Nano Banana / Flux Kontext 通用的"小角度旋转"指令,保住面部+服装+背景同时换角度。

### §3.3 GPT Image 2 生成新面部 Prompt(D2)
来源:[9b6qXrRkWxo](https://www.youtube.com/watch?v=9b6qXrRkWxo)(829K 播放)
```
Generate a new, realistic female face inspired by the uploaded image.
Preserve subtle facial structure and vibe, but create clearly different
features, identity, and expression. High detail, natural skin texture,
soft lighting, photorealistic.
```
> 💡 关键句:`inspired by` + `preserve vibe but create clearly different identity` — 创作"灵感相似但不抄"的新角色,合规避免肖像权问题。

### §3.4 Dan Kieft 核心人像 Prompt(D10)
```
Stylish 21-year-old Southern European woman, soft natural freckles, almond
eyes, high cheekbones, fuller lips, slightly tanned skin, subtle glowy makeup.
Wearing a white cropped linen blouse with long sleeves, tied at the waist,
and high-waisted flowy beige trousers. Relaxed hair in a loose low bun with
wispy strands, sunglasses on head. Smiling casually while sitting at a
rustic outdoor cafe with white walls and blue windows in the background.
Shot on Fujifilm X-T30, 35mm lens, soft golden hour light, realistic skin
texture, unfiltered, summer Instagram aesthetic.
```

### §3.5 品牌合作图像 Prompt — Starbucks 场景(D10)
```
Same woman, standing outside a cozy urban coffee shop, wearing a beige
ribbed knit long-sleeve crop top and high-waisted white trousers. Holding a
large Starbucks cup near her lips with one hand, logo clearly visible. Her
other hand rests on her hip casually. Soft confident gaze, minimal glowy
makeup, hair tied in a relaxed low bun with loose strands framing her face.
Golden hour sunlight casting warm highlights, bokeh city background, shot
on Fujifilm X100V, 35mm lens, natural texture, Instagram brand collab aesthetic
```
> 💡 `Same woman` 锚定角色;**品牌名直接写**(`Starbucks cup` + `logo clearly visible`)。

### §3.6 品牌合作视频 Prompt — Kling 2.1 推近(D10)
```
The camera pushes in slowly from a medium to a close-up as she lifts the
Starbucks cup to take a sip, then lowers it with a soft smile while glancing
toward the side. Her hand stays in her pocket, posture relaxed but confident.
The street behind her softly blurs as warm lights inside the cafe begin to
glow subtly.
```
> 💡 真正的视频驱动 prompt:**镜头推进 + 角色动作 + 背景虚化变化** 三层叙事。本仓库已收录为 `kl-156`(参见 prompts/data/all-prompts.json)。

---

## §4 工具生态对比(20 视频整合)

### 图像生成(基础图)
| 工具 | 强项 | 弱点 |
|---|---|---|
| **MidJourney v6** | 写实人像最自然 / 美学顶级 | 闭源 / 不可控性强 |
| **Nano Banana Pro** | 角色一致性 + 多角度延伸 | 极端特写细节会糊 |
| **OpenArt Flux Dev/Kontext** | Omni Reference 4 图同时 | 学习曲线陡 |
| **GPT Image 2** | API 接入方便 / "灵感相似但不同人" | 写实度略低 |
| **Ideogram** | 文字 + 一致性同时 | 价格高 |
| **Higgsfield Soul 2** | Nano Banana 2 的电影定制版 | 仅 Higgsfield 平台 |
| **KORA Pro (Enhancor)** | 极端特写写实度提升 | 单独使用价值有限 |

### 图像后处理
- **Fal AI + Topaz** — 超分辨率(Fal AI 工具链)
- **Magnific** — 写实细节增强(VEO 后续接 Magnific 是常见组合)
- **Enhancor V3** — 皮肤纹理修复(解决"AI 塑料感")

### 视频驱动(图转视频)
| 工具 | 强项 | 典型用法 |
|---|---|---|
| **Kling 2.6 Motion Control** | 动作 + 表情自然度业界第一 | 特写人物视频 |
| **VEO 3** | 文生说话视频 + 音视频同步 | UGC 风格采访 |
| **Seedance 2.0** | 4-15s 长片 + 多镜头一致性 | 剧集级制作 |
| **WAN 2.2 Motion Control** | **免费 / 开源** | 入门首选 |
| **Kling 2.1 Frames** | 关键帧控制(Start+End) | 精准动作 |

### 声音 / 口型
| 工具 | 用途 |
|---|---|
| **ElevenLabs** | Voice cloning(上传 10 秒)/ Voice design(文字描述音色) |
| **HeyGen Avatar IV** | 全身 Avatar + 自定义动作 + 口型同步 |
| **Enhancor Lip Sync V1/V2** | 静态图驱动开口说话 |
| **Krea AI Face Swap** | 跨场景换脸保一致性 |

### 自动化发布
- **Arcads AI** — 从角色图直接生成品牌广告视频
- **N8N + Blotato** — 自动发布 Instagram(workflow 已开源)
- **Fanvue** — AI 网红内容变现专门平台

---

## §5 12 个写实图像 prompt 技巧(C2 完整清单)

来源:[Od3FRMLqwFk](https://www.youtube.com/watch?v=Od3FRMLqwFk) — *Secrets to Creating Stunning AI Images*(466K 播放)

| # | 技巧 | 示例 |
|---|---|---|
| 1 | **Style Fusion** | `cyberpunk + Renaissance painting` |
| 2 | **Lighting Prompts** | `golden hour`, `studio lighting`, `rim light`, `Rembrandt lighting` |
| 3 | **Detail Prompts** | `intricate details`, `hyper-detailed`, `nano-detail` |
| 4 | **Texture Prompts** | `velvet`, `silk`, `porcelain skin`, `worn leather` |
| 5 | **`--tile` 参数** | 生成可重复贴图纹理 |
| 6 | **"Beautiful" 魔法词** | 直接加 `beautiful` 显著提升人像质量 |
| 7 | **Punk It** | 给任何主题加 `punk` 触发反差 |
| 8 | **Juxtaposition** | `delicate warrior`, `silent thunder` 对立元素 |
| 9 | **Random Prompts** | 用随机字符触发非常规构图 |
| 10 | **Emoji-to-Image** | 在 prompt 里放表情符号让模型解读 |
| 11 | **章节中其他技巧** | 详见视频 |
| 12 | **章节中其他技巧** | 详见视频 |

---

## §6 Nano Banana 15 个 prompt 技巧索引(D8)

来源:[nnlgMpyq-j0](https://www.youtube.com/watch?v=nnlgMpyq-j0)(279K 播放)

完整章节清单(每个约 1 分钟,共 19 分钟):

1. Perfect Portrait Photography(完美人像摄影)
2. Product Photography Magic(产品摄影魔法)
3. Architectural Visualization(建筑可视化)
4. Landscape Photography Mastery(风景摄影精通)
5. Street Photography Authenticity(街头摄影真实感)
6. Abstract Art Creation(抽象艺术创作)
7. Portrait Enhancement(人像增强)
8. Background Replacement(背景替换)
9. Color Grading Magic(色彩分级)
10. Clothing Replacement(服装替换)
11. Artistic Style Transfer(艺术风格迁移)
12. Lighting Modification(光线修改)
13. Object Removal(物体移除)
14. Atmospheric Effects(大气效果)
15. Professional Retouching(专业修图)

---

## §7 4 人团队完成 AI 剧集 — Arena Zero 案例(D4)

来源:[036jyFZWppw](https://www.youtube.com/watch?v=036jyFZWppw) — *Seedance 2.0: Arena Zero Breakdown*(633K 播放)
工具:**Seedance 2.0** + **Soul Cinema**(Higgsfield)

- **规模**:4 人团队,~5,000 次生成 = 一整集原创 AI 剧集
- **位置侦察工作流**:桌面生成 60 个公寓版本"勘景",零外出
- **圆形竞技场设计**:刻意几何对称降低多角度 AI 一致性难度
- **3 个 prompt 完成动漫场景**:从写实风格无缝切换到 2D 动漫
- **行星毁灭场景**:零预算完成传统千万级特效镜头
- Soul Cinema(Higgsfield)做高质量图像,Seedance 2.0 做视频生成

**章节时间轴**:00:00 成片 / 01:20 创意来源 / 03:58 角色制作 / 07:31 场景搭建 / 09:26 动漫场景 / 11:41 终局毁灭行星

---

## §8 完整制作流水线(综合 20 视频)

```
0. Mood Board 先行(MidJourney 情绪板定调) ─────────────────┐
                                                              │
1. ChatGPT 优化 prompt(粗糙描述 → 精准 prompt)              │ Stage A:
                                                              │ 准备
2. MidJourney v6 / Flux Dev 生成基础图                       │
   ├ 多次 Vary/Regenerate 选最佳面部                          │
   └ 用相机型号 + Instagram aesthetic 触发写实                ┘

3. Nano Banana Pro 生成 Character Sheet(多角度卡)           ┐
   ├ 正脸 / 侧脸 / 半身 / 全身                                 │ Stage B:
   └ 同款服装 + 背景统一                                       │ 一致性
                                                              │
4. Flux Kontext Omni Reference(4 图同时参考)                │
   ├ 扩展生活场景(咖啡馆 / 户外 / 工作室)                    │
   └ Composition Reference 0.17                              ┘

5. Magnific / Topaz 超分辨率升频                              ┐
                                                              │ Stage C:
6. Enhancor V3 皮肤修复(消除塑料感)                         │ 后处理
                                                              ┘

7. 视频驱动(根据场景选模型):                                ┐
   ├ 特写说话    → VEO 3 / Kling 2.6 Motion Control          │
   ├ 多镜头剧集  → Seedance 2.0                              │ Stage D:
   ├ UGC 广告    → Arcads AI                                  │ 视频生成
   ├ 免费方案    → WAN 2.2 Motion Control                    │
   └ 自动分镜    → Kling Multi-Shot 6 shots/15s              ┘

8. ElevenLabs 配音(克隆 / 设计)                              ┐
                                                              │ Stage E:
9. Enhancor Lip Sync(口型同步)                              │ 声音 + 后期
                                                              │
10. DaVinci Resolve 剪辑 / 加字幕 / 加背景音                  ┘

11. N8N + Blotato 自动发布 Instagram(可选)
```

---

## §9 已入库 prompt 对照

仓库 `prompts/data/all-prompts.json` 收录的相关 prompt:

| ID | 描述 | 来源 |
|---|---|---|
| `kl-156` | Kling 2.1 品牌合作视频 — Starbucks 推近镜头(Dan Kieft Pack 原文) | 本文 §3.6 |
| (Seedance 100+ 条) | 多镜头 / Character Sheet / Multi-shot Timeline | [methodology/15](15-seedance-masterclass.md) |
| (HappyHorse 90 条) | 20 词单镜 / Omni Reference / Storyboard 45s | [methodology/17](17-happyhorse-masterclass.md) |
| (Kling 70+ 条) | 5 层 / Multi-Shot 6 shots/15s / Motion Brush | [methodology/18](18-kling-masterclass.md) |

---

## §10 视频来源索引(20 视频,累计 5M+ 播放)

### Batch C(10 视频)

| # | 视频 ID | 标题 | 工具 | 播放量 |
|---|---|---|---|---|
| C1 | [kifmKZJA-KE](https://www.youtube.com/watch?v=kifmKZJA-KE) | OpenArt Aitana Lopez 教程 | OpenArt | 534,668 |
| C2 | [Od3FRMLqwFk](https://www.youtube.com/watch?v=Od3FRMLqwFk) | 写实图像 12 个 prompt 技巧 | Midjourney / SD / DALL-E | 466,243 |
| C3 | [6g_f2XxwSRA](https://www.youtube.com/watch?v=6g_f2XxwSRA) | MidJourney + HeyGen 流水线 | MidJourney / HeyGen / ElevenLabs | 314,498 |
| C4 | [rZW5UjFmJ7w](https://www.youtube.com/watch?v=rZW5UjFmJ7w) | OpenArt + Pykasso 变现 | OpenArt / Pykasso / Arcads | 333,584 |
| C5 | [kRCtWzc3B9w](https://www.youtube.com/watch?v=kRCtWzc3B9w) | Nano Banana Pro + Kling 2.6 | Nano Banana Pro / Kling 2.6 | 260,841 |
| C6 | [vMzwO1kRX70](https://www.youtube.com/watch?v=vMzwO1kRX70) | Ideogram 单图广告流程 | Ideogram / Speel / ElevenLabs | 229,125 |
| C7 | [wf7XQ_Rj-I4](https://www.youtube.com/watch?v=wf7XQ_Rj-I4) | VEO 3 真人照转视频 | VEO 3 / Higgsfield / Magnific | 229,957 |
| C8 | [R9c_JQrEtu8](https://www.youtube.com/watch?v=R9c_JQrEtu8) | N8N 自动化发布 | Arcads / N8N / Blotato | 220,086 |
| C9 | [NpfEKTXBxrY](https://www.youtube.com/watch?v=NpfEKTXBxrY) | KORA Pro DEFINITIVE 教程 | KORA Pro / Nano Banana Pro / Enhancor | 219,329 |
| C10 | [E3UvlDqJppo](https://www.youtube.com/watch?v=E3UvlDqJppo) | 免费方案 WAN 2.2 | Nano Banana Pro / WAN 2.2 | 206,958 |

### Batch D(10 视频)

| # | 视频 ID | 标题 | 工具 | 播放量 |
|---|---|---|---|---|
| D1 | [x-emzK0sDkA](https://www.youtube.com/watch?v=x-emzK0sDkA) | VEO 3 超写实展示 | Google VEO 3 | 1,009,728 |
| D2 | [9b6qXrRkWxo](https://www.youtube.com/watch?v=9b6qXrRkWxo) | GPT Image 2 + Kling 2.6 免费 | GPT Image 2 / Kling 2.6 / Lovart | 829,227 |
| D3 | [6kM3efCzohE](https://www.youtube.com/watch?v=6kM3efCzohE) | Alive AI 自定义角色 | Alive AI / Clipfly | 811,510 |
| D4 | [036jyFZWppw](https://www.youtube.com/watch?v=036jyFZWppw) | **Arena Zero AI 剧集** | Seedance 2.0 / Soul Cinema | 633,961 |
| D5 | [gcZwE5cM4xs](https://www.youtube.com/watch?v=gcZwE5cM4xs) | VEO 3 街头采访 | Google VEO 3 | 549,037 |
| D6 | [0UC1vvHprq8](https://www.youtube.com/watch?v=0UC1vvHprq8) | 15 合 1 电影级流程 | ChatGPT / Luma / Flux / Kling / Minimax | 409,285 |
| D7 | [0B_xyflXrwc](https://www.youtube.com/watch?v=0B_xyflXrwc) | Higgsfield Soul 2 电影感 | Higgsfield Soul 2 / Cinema Studio 2.0 | 296,141 |
| D8 | [nnlgMpyq-j0](https://www.youtube.com/watch?v=nnlgMpyq-j0) | Nano Banana 15 个技巧 | Nano Banana / VEED | 279,173 |
| D9 | [H2wv0Sog0jo](https://www.youtube.com/watch?v=H2wv0Sog0jo) | 超写实视频 9 步完整流程 | Nano Banana / Kling 2.1 / VEO 3 / Krea | 245,572 |
| D10 | [fxiDS2C9XYA](https://www.youtube.com/watch?v=fxiDS2C9XYA) | **Dan Kieft Prompt Pack**(Google Docs 全文已拉取) | OpenArt Flux / Kling 2.1 | 237,629 |

---

## §11 与其他 methodology 的关系

| 主题 | 看哪篇 |
|---|---|
| 单家视频模型 prompt 怎么写 | [02-进阶公式](02-进阶公式.md) / [09-13 各家公式](09-kling-公式.md) |
| Seedance 综合实战 | [15 Seedance Masterclass](15-seedance-masterclass.md) + [19 Round 3](19-seedance-masterclass-round3.md) |
| HappyHorse 综合实战 | [17 HappyHorse Masterclass](17-happyhorse-masterclass.md) |
| Kling 综合实战 | [18 Kling Masterclass](18-kling-masterclass.md) |
| Gemini Omni 官方 | [16 Gemini Omni 公式](16-gemini-omni-公式.md) |
| **跨工具流水线 / 角色一致性 / AI 网红制作(本文)** | **20** |

> 本文与 methodology/15-19 形成**正交关系**:15-19 关心"怎么写好一条视频 prompt",本文关心"**怎么把多个工具串起来做一个稳定的数字 persona**"。

---

## §12 关键启示

1. **角色一致性是当前 AI 视频最难的问题**,需要 character sheet + omni reference + face swap 多技术叠加才能稳定。单条 prompt 不够。
2. **写实 = 反 AI 塑料感**。`unfiltered` / `pores visible` / 真实相机型号是关键反向词。
3. **工具组合比单一工具强**。MidJourney 出基础图 + Nano Banana 出多角度 + Kling/VEO 驱动是 2026 主流公式。
4. **Instagram aesthetic 是一句话定调**。Dan Kieft Pack 反复验证它能省 30% prompt 长度。
5. **AI 剧集已经可行**。4 人 5000 次生成完成一整集(D4 Arena Zero 案例)。
