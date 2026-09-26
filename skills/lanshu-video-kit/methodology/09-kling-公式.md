# 09 · Kling 3.0 公式与差异化用法

> Kling 3.0（可灵 3.0，快手出品）2026 年的核心升级：**原生音画同步、智能分镜、最长 2 分钟、角色定向发声、Motion Brush 手动控制**。中文理解能力业界领先。

## 三套写法（按复杂度递进）

### 写法 1：4 部分基础公式（短视频、单一场景）

```
Subject + Action + Context + Style
```

- **Subject**：具体视觉细节
- **Action**：精确的运动描述（用 active verbs）
- **Context**：3-5 个环境元素（**不要多**）
- **Style**：镜头 + 灯光 + 氛围

**示例**（[kl-006 赛博朋克侦探](../prompts/kling/README.md#kl-006--赛博朋克侦探)）：
> A cyberpunk detective walking through a neon-lit alley, camera tracking behind him, rain falling, reflections on wet ground, cinematic lighting, noir atmosphere.

### 写法 2：5 层进阶公式（带剧情、带音频、复杂叙事）

```
Scene → Characters → Action → Camera → Audio & Style
```

| 层 | 作用 |
|---|---|
| **Scene** | 地点、时间、氛围（上下文锚点） |
| **Characters** | 具体描述 + 一致命名（角色清晰） |
| **Action** | 按时间顺序的步骤（时间线） |
| **Camera** | 镜头类型 + 运动 + 切换 |
| **Audio & Style** | 对话、语气、环境音（氛围） |

**示例**（[kl-009 黄金时刻重逢](../prompts/kling/README.md#kl-009--黄金时刻重逢情感对话)）：

```
Scene: A park bench at golden hour, fall leaves drifting.
Characters: Two reunited friends with a 10-year gap, both early 30s.
Action: Alternating over-the-shoulder shots between both characters with
        nostalgic dialogue about missing each other, culminating in a moment
        of shared emotional recognition.
Camera: Slow push-in on each speaker, ending on a held wide two-shot.
Audio & Style: Soft piano underscore, ambient park sounds, warm cinematic
              color grade.
```

> 💡 这就是 Kling 3.0 比 Seedance / HappyHorse 都强的地方：**原生支持音画同步 + 多人定向发声**，所以一定要把音频写进 prompt。

### 写法 3：图生视频专用（已有参考图）

**只描述运动，不重描述视觉**。Kling 默认会重画图中已有的颜色/构图，所以把上下文留给图片，把动词留给 prompt。

❌ 错误（重描述图中已有内容）：
> A red sports car with chrome wheels on a wet road with neon signs reflected on the asphalt, the car starts moving forward...

✅ 正确（[kl-002 雨夜跑车启动](../prompts/kling/README.md#kl-002--雨夜跑车启动图生视频)）：
> The headlights blaze on and the engine roars to life. The rear tires spin, spraying water across the wet asphalt, and the car launches forward.

## Kling 与 Seedance/HappyHorse 的关键差异

| 维度 | Kling 3.0 | Seedance 2.0 | HappyHorse 1.0 |
|---|---|---|---|
| 中文 | **业界最强**（推荐用中文） | 良好 | 良好 |
| 音频 | **原生 + 角色定向发声** | 需单独处理 | 原生联合生成 |
| 时长 | 15s（智能分镜可达 2 分钟） | 15s | 15s（默认 5s） |
| 物理感 | **极强**（stone crumbles 这类细节会真实呈现） | 良好 | 一般 |
| 图生视频 | **极强**（Motion Brush 手动控制） | 良好 | 良好 |
| 多人定向 | **支持**（角色 A 说 X，角色 B 说 Y） | 不支持 | 不支持 |

**何时选 Kling**：
- 需要原生音频 + 角色对话（超越 HappyHorse 的环境音）
- 中文剧情、中式美学
- 图生视频，且要复杂物理交互
- 想要电影级镜头质感

## Kling 的写作守则

### 1. 用 active verbs 替代笼统词

❌ "moves" / "goes" / "happens"
✅ "rockets upward" / "slams into" / "erupts"

### 2. 描述时序流（开头 → 中间 → 结尾）

不要只写一个冻结的瞬间，要写镜头怎么"演化"。比如 [kl-018 武士拔刀斩竹](../prompts/kling/README.md#kl-018--武士拔刀斩竹图生视频)：

> The samurai raises the katana → and slashes in one explosive arc →
> the blade catching golden light → Two bamboo stalks behind him slide and topple

每个箭头都是一个时间节点，模型会按这个序列出帧。

### 3. 用具体光源代替"dramatic lighting"

❌ "dramatic lighting"
✅ "flickering fluorescent tubes" / "neon signs" / "candlelight" / "golden hour" / "LED panels"

真实光源 = 真实效果。

### 4. 加触感细节（tactile details）

让画面"摸起来真"：grain（颗粒）、lens flares（镜头眩光）、reflections（反射）、fabric sheen（布料光泽）、condensation（凝结水珠）、smoke（烟）、sweat（汗）。

### 5. 显式 endpoint（防 99% 卡死）

❌ "Subject's hair moves in the wind"（无终止状态 → 模型陷入死循环）
✅ "Subject's hair moves in the wind, **then settles back into place**"

### 6. 物理交互锚定幻想（[kl-036 龙塔起飞](../prompts/kling/README.md#kl-036--龙塔起飞图生视频) 的精髓）

幻想场景容易"飘"，用真实物理交互锚定 — 龙起飞时**石头碎落 + 街道火把被气流吹动** = 可信度暴涨。

## 通用负向提示（建议每条都加）

获得真实电影感的标准 negative prompt：

```
Negative: smiling (除非需要), cartoonish, 3D render, smooth plastic skin,
         floating limbs, sliding feet, text morphing, no watermark, no logo.
```

## 元素数量上限（不同子模型）

| 模型 | 复杂度上限 | 适用 |
|---|---|---|
| **Kling O1** | 多步镜头运动 + 文字编辑视频 | 最复杂场景 |
| **Kling 2.6** | 5-7 元素 | 复杂光影、细微表情 |
| **Kling 3.0**（推荐） | 5 层公式全开 | 带音频、带剧情 |
| **2.5 Turbo Pro** | 3-4 元素 + 单一镜头运动 | 速度优先 |
| **1.6 Standard** | 简化结构 + Motion Brush | 手动控制图生视频 |

## 常见错误清单

| 错误 | 后果 | 解法 |
|---|---|---|
| 17+ 个环境元素 | 模型过载、画面糊 | 砍到 3-5 个 |
| 没有 endpoint | 99% 卡死 | 加 "then settles back / fades out" |
| "person drinking from a glass" 这类模糊接触 | 手部/物体变形 | 改成 "hand making contact with glass rim, tilts toward mouth" |
| 图生视频重描述视觉 | 模型混乱 | 只写运动，不写视觉 |
| 中英文混用 | 发音怪 | 选一种坚持到底（中文优先） |

## 资源

- 36 条精选提示词：[../prompts/kling/README.md](../prompts/kling/README.md)
- Skill 自动生成：[../skills/kling-prompter/SKILL.md](../skills/kling-prompter/SKILL.md)
- 官方平台：[klingai.com](https://klingai.com)
