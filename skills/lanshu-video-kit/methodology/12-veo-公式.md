# 12 · Veo 3 公式与原生音频写法

> **Veo 3 / 3.1**（Google DeepMind）是业界**原生音频最强**的视频模型：多人对话、精确音效同步、配乐生成全部由提示词驱动。100-150 词最优。

## 官方 8 元素公式

Google DeepMind 不强推固定模板，但提示词包含以下要素效果最佳：

| # | 要素 | 示例 |
|---|---|---|
| 1 | **Shot framing & motion** | medium shot, slow dolly-in |
| 2 | **Style** | film noir / claymation / 35mm |
| 3 | **Lighting** | warm side light from window, golden hour |
| 4 | **Character descriptions** | mid-30s woman with curly red hair |
| 5 | **Location** | bustling NYC street at noon |
| 6 | **Action** | walks toward camera, looks down |
| 7 | **Dialogue** | "We've got to change the way we work together." |
| 8 | **Audio** | café noise + soft jazz music |

## 推荐结构（3-6 句 / 100-150 词）

```
[Shot type + framing]. [Subject description]. [Action sequence].
[Style / lighting / mood].
Dialogue: "[short line, 1-2 sentences]"
Audio: [environmental sounds, music cues, sfx layers]
```

**核心区别**：
- Dialogue 单独成行（用 "Dialogue:" 前缀）
- Audio 单独成行（用 "Audio:" 前缀），列出**多层声音**

## 原生音频写法的 4 个层次

### 层 1：环境音底噪

```
Audio: Wind through grass, distant crickets.
```

### 层 2：定向音效

```
Audio: Crunchy candy-breaking sounds with each keystroke, delighted giggles.
```

### 层 3：对话 + 环境

```
Dialogue: "I'm one with nature now!"
Audio: Soft crackling campfire, distant owl.
```

### 层 4：完整音景（对话 + 多人 + 音效 + BGM）

```
Dialogue: 
  Camper (cheerful): "I'm one with nature now!"
  Bear (deadpan): "Nature would prefer personal space."
Audio: Soft crackling campfire outside, distant owl, exaggerated claymation
       breath sounds, faint guitar strumming in the distance.
```

## Veo 3 vs Veo 3.1 关键差异

| 维度 | Veo 3 | Veo 3.1 |
|---|---|---|
| 最大时长 | 8s | **60s** |
| 智能分镜 | 无 | 有 |
| 音频对齐 | 良好 | **精确到帧** |
| 多人对话 | 单人为主 | **多人定向** |
| 推荐用途 | 短片 / 广告 | 中片 / 剧集片段 |

## 关键技巧

### 1. 对白别贪长（8 秒规则）

> Keep dialogue short—it should be something that can be said in just about 8 seconds, as trying to pack too much in can result in characters speaking way too fast.

❌ 一段完整的台词
✅ 一两个金句

### 2. 用 storyboard 思维写

> Focus on clear camera intent, motion, and lighting, and the results stop feeling random because you are telling Veo what you want to see—it performs best when your input reads like a mini storyboard.

每个 prompt 都该像分镜脚本：**框出画面 → 加动作 → 写对白 → 列声音**。

### 3. 命名具体光源

不要写 "dramatic lighting"，写：
- `neon sign` / `cracked doorway` / `overcast sky` / `candlelight`

这会给 Veo "物理光照逻辑"，稳定阴影、减少变形。

### 4. 角色描述写在前面

❌ "A woman speaks while walking..."（不知道是谁）
✅ "A mid-30s woman with short dark hair and a navy coat walks..."（清晰）

### 5. Audio: 段要明确

写出"想听到什么"，而不是"应该有声音"：

❌ "Audio: ambient sounds"
✅ "Audio: roaring V8 engines, sloshing water, gravel impacts, tire chain rattles, occasional driver shouts."

## 何时选 Veo 而非 Sora / Kling

- 需要 **多人对话** 且每人说不同的话（[ve-003 露营定格动画](../prompts/veo/README.md#ve-003--露营定格动画对白)）
- 需要 **精确音效同步**（[ve-002 糖果键盘](../prompts/veo/README.md#ve-002--糖果键盘感官音效)）
- 需要 **环境音 + BGM + 对白** 三层并存（[ve-005 咖啡馆演讲](../prompts/veo/README.md#ve-005--咖啡馆里的演讲带-bgm)）
- 想生成 **8s 一气呵成的"成品片段"** 而非素材

## 资源

- 官方文档：[deepmind veo prompt guide](https://deepmind.google/models/veo/prompt-guide/)
- Google Cloud Vertex AI 进阶：[ultimate prompting guide for veo 3.1](https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-veo-3-1)
- 20 条精选提示词：[../prompts/veo/README.md](../prompts/veo/README.md)
