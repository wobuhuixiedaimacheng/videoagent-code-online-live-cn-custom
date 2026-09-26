# 11 · Sora 2 公式与官方写法

> **Sora 2**（OpenAI，2025-09-30 发布）的官方理念："Think of prompting like briefing a cinematographer who has never seen your storyboard." —— 把它当成一个**没看过分镜的摄影指导**来 brief。

## 两套官方写法

### 写法 A：分层 Shot List 结构（推荐）

```
Style: [视觉锚点 + 美学传承 + 时代/胶片质感]

Inside / At: [场景描述 + 关键物件]

Cinematography:
  Camera: [framing + 运动 + 镜头规格]
  Lighting: [主光 + 补光 + 氛围光]
  Mood: [情绪 1-2 词]

Actions:
  - Beat 1
  - Beat 2
  - Beat 3
  - Character (tone): "Dialogue line."

Background Sound: [environmental + diegetic only]
```

**为什么这种写法有效**：
- Style 段 = 视觉锚点，让模型一开始就锁定美学方向
- Cinematography 段 = 让 Sora 像 DP 一样"取景"
- Actions 段 = 把动作拆成可计数的 beats，时间精度更高
- Dialogue 直接嵌在 actions 里（短句、最多 2-3 行）
- Sound 段 = 只写 diegetic（场景内自然声音），不要写"epic score"这类后期音乐

### 写法 B：超精细参数化（电影工业级）

适合需要**复刻特定胶片质感**或**保持多镜头连续性**的场景：

```
Format & Look: [duration / shutter / capture format / grain]
Lenses & Filtration: [焦段 / 滤镜 / 偏振]
Grade/Palette: [highlights / mids / blacks 的色调]
Lighting & Atmosphere: [自然光方向 / 反光板 / 雾气]
Location & Framing: [前景 / 中景 / 背景的层次]
Wardrobe & Props: [服装具体细节]
Sound: [diegetic only / specific layers]
Optimized Shot List: [可选 — 多镜头列表]
Camera Notes: [可选 — 镜头规格细节]
Finishing: [可选 — 后期处理参考]
```

## 关键技巧（OpenAI 官方）

### 1. Style 是最强杠杆

❌ "cinematic, beautiful"
✅ "1970s romantic drama, 35mm with natural flares and warm halation, soft focus, slight gate weave"

### 2. Beats > Seconds

❌ "from 0 to 2 seconds the robot does X"
✅ "Actions:\n- Robot taps bulb\n- Flinches, dropping bulb\n- Catches it"

模型对 beat 计数（先后顺序）比对绝对时间敏感。

### 3. Dialogue 短而精

每个 4 秒 clip 最多 2-3 行对白。每行短句（能 1-2 秒说完）。

❌ 长段独白
✅ "Woman (laughing): 'See? Even the city dances with us tonight.'"

### 4. Sound 只写 diegetic

> Background Sound: Natural ambience only—wind, fabric flutter, street noise, muffled music. **No added score.**

Sora 2 会自动配音乐，但如果你强加"epic orchestral swell"它会冲掉自然氛围。**让画面自己呼吸**。

## 80-150 词最优

- < 80 词 → 输出随机
- 80-150 词 → **甜蜜点**
- \> 200 词 → 出现 "视觉幻觉"（模型自己脑补冲突）

## 实战：同一场景两种写法

**需求**："小机器人在工坊修灯泡，搞砸了又救回来"

### 写法 A（分层）— 见 [so-001](../prompts/sora/README.md#so-001--机械工坊小机器人openai-官方-shot-list-样板)

### 写法 B（参数化）— 见 [so-003](../prompts/sora/README.md#so-003--通勤站台超精细参数化openai-官方)

## Sora 2 独有能力

- **Cameos**：把真人客串到生成视频里（需用户授权）
- **原生音画一体**：对白与口型同步、环境音自动
- **20 秒时长**：业界最长（不含智能分镜）
- **极致物理仿真**：液体、布料、群体运动比一般模型更真实

## 局限性

- 中文不如 Kling
- 地区/账号限制（部分用户需 ChatGPT Pro/Plus）
- 一次性高质量 vs 反复迭代：Sora 一次出片就到位，调整反而难

## 资源

- 官方 Cookbook：[openai cookbook sora 2 guide](https://developers.openai.com/cookbook/examples/sora/sora2_prompting_guide)
- 20 条精选提示词：[../prompts/sora/README.md](../prompts/sora/README.md)
- skill 自动生成：见 [10-跨模型对比.md](10-跨模型对比.md) 中的同一需求多写法对照
