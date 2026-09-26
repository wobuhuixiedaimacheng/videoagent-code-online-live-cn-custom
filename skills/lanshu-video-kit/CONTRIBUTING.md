# Contributing · 贡献指南

谢谢你想为 `lanshu-awesome-ai-video-kit` 做贡献。这份指南帮你避免走弯路。

## 我能贡献什么

| 类型 | 难度 | 价值 |
|---|---|---|
| 🟢 加一条实测提示词 | ⭐ | 高 |
| 🟢 修一个错别字 / 链接 | ⭐ | 中 |
| 🟡 加一个新分类 | ⭐⭐ | 高 |
| 🟡 加一个新方法论 markdown | ⭐⭐ | 高 |
| 🟡 改 Web 工具（侧栏 / Drawer） | ⭐⭐⭐ | 高 |
| 🔴 加一个新模型（如 Hailuo / Hunyuan） | ⭐⭐⭐⭐ | 极高 |
| 🔴 加一个新 Skill | ⭐⭐⭐ | 高 |
| 🔴 增加 API 客户端示例 | ⭐⭐⭐ | 中 |

---

## 贡献新提示词

最高频的贡献。步骤：

1. **实测**：必须在对应模型的官方平台跑过一次以上
2. **在 [prompts/data/all-prompts.json](prompts/data/all-prompts.json) 末尾追加**，schema 如下：

```json
{
  "id": "sd-065",                          // 唯一 ID（sd/hh/kl/so/ve + 自增）
  "model": "seedance-2.0",                 // 五选一
  "category": "product-commercial",        // 见 categories 列表（不够用就加新的）
  "title": "你的提示词标题",
  "prompt": "完整可复制的提示词文本",
  "tags": ["tag1", "tag2", "tag3"],        // 至少 3 个，便于筛选
  "params": {
    "aspect": "9:16",                      // 推荐宽高比
    "duration": "8s",                      // 推荐时长
    "resolution": "1080p"                  // 推荐分辨率（可选）
  },
  "source": {
    "name": "Your Source / Self-Tested",
    "url": "https://..."                   // 来源链接（或自测时填 GitHub PR 链接）
  },
  "notes": "使用建议（可选，但鼓励写）"
}
```

3. **不要修改 `total` 字段**，CI 会自动校验（你只需追加条目即可，但**记得手动改对应模型的 README 索引**）

### 校验

提交前在本地跑：

```bash
python3 -c "
import json
d = json.load(open('prompts/data/all-prompts.json'))
ids = [p['id'] for p in d['prompts']]
cat_ids = {c['id'] for c in d['categories']}
assert len(set(ids)) == len(ids), '有重复 ID'
bad = [p['id'] for p in d['prompts'] if p['category'] not in cat_ids]
assert not bad, f'分类引用错误: {bad}'
print(f'OK: {len(ids)} 条')
"
```

---

## 贡献实测视频(Cross-Model Matrix 专项 ★)

**最有价值的贡献!** Cross-Model Matrix 有 110 条对照 prompt,但缺**实测视频效果展示**。如果你有平台账号能跑视频,可以这样贡献:

### 步骤

1. 选 1 条 [cross-model-matrix.json](prompts/data/cross-model-matrix.json) 中的 prompt
2. 复制到对应模型平台跑出视频
3. 把视频上传到 YouTube / B 站 / 七牛 / 阿里 OSS / Cloudflare Stream 等公开可访问位置
4. 在 JSON 该条目下加入字段:

```json
"by_model": {
  "kling-3.0": {
    "method": "...",
    "prompt": "...",
    "effect_video_url": "https://your-host.com/video.mp4",
    "tested_at": "2026-06-15",
    "tested_by": "@your-github-handle",
    "subjective_rating": 4,
    "notes": "效果不错,人脸偶尔轻微漂移。改用 kling 3.0 master 模式后稳定。"
  }
}
```

5. PR 时附:截图 + 简短文字描述(20-50 字)

### 评分参考(`subjective_rating`,1-5)

| 分 | 说明 |
|---|---|
| 5 | 完美,产出可直接交付 |
| 4 | 很好,90% 符合预期,小调即可 |
| 3 | 基本可用,需中度调整 |
| 2 | 部分有问题,需要重写关键段 |
| 1 | 几乎不可用 |

### 鼓励

- 跑出 5 个以上场景的实测视频 → 加入 "Top Contributors" 名单
- 跑出 50 个以上 → 你成为 Cross-Model Matrix 共维护人

### 路线图

- v3 计划:每条 prompt 附实测对比 → 直接催生 `prompt-translator` skill 的真正"数据驱动"能力
- v4 计划:基于实测评分驱动 ELO 排行 → 自动推荐最佳模型 × 场景组合

---

## 贡献新模型

需要做 4 件事：

1. JSON 里 `models` 加一项（含 vendor / max_duration / strengths）
2. JSON 里 `categories` 按需加（重用现有的更好）
3. JSON 里追加至少 20 条该模型的实测提示词
4. 新建 `prompts/<model>/README.md` 索引
5. 新建 `methodology/<NN>-<model>-公式.md` 方法论
6. 新建 `skills/<model>-prompter/SKILL.md`（推荐）
7. 更新主 [README.md](README.md) 的模型对比表
8. 更新 [tools/prompt-browser/index.html](tools/prompt-browser/index.html) 加该模型的颜色 + MODEL_META 映射

---

## 贡献新方法论

放 [methodology/](methodology/)。文件名规则：`<NN>-<topic>.md`（按已有顺序自增）。

格式：

```markdown
# NN · 标题

> 一句话定位

## 速查表 或 公式

[核心结构]

## 实战示例

[1-3 个示例]

## 资源

[相关链接]
```

更新 [methodology/README.md](methodology/README.md) 的索引表。

---

## 贡献 Skill

放 [skills/](skills/) 下，每个 skill 一个目录，内含 `SKILL.md`。SKILL.md 必须有 YAML frontmatter：

```yaml
---
name: skill-kebab-case-name
description: 详细描述何时使用此 skill（关键词触发场景，决策树）
---
```

参考已有 5 个 skill（[seedance-prompter](skills/seedance-prompter/SKILL.md) 等）。

---

## 代码规范

### Markdown
- 中英文混排：英文左右加一个半角空格
- 命令行示例用 ```` ```bash ```` 围栏
- 内部链接用相对路径
- 不要用 emoji 装饰标题（除非已有约定如 🎬 🛍️）

### JSON
- 缩进 2 空格
- 字符串用 `"` 双引号
- 不要尾逗号

### HTML / CSS / JS（Web 工具）
- 单文件 index.html，**不引入框架**（保持离线可用）
- CSS 用 `var(--xxx)` 而非硬编码颜色
- 新增功能配套加键盘快捷键（哲学：高级用户感）

---

## PR 流程

1. Fork 仓库
2. 新建分支 `feat/your-feature` 或 `add/new-prompt-xxx`
3. 提交 commit（消息清晰，例 `add: 5 Veo 3 dialogue prompts`）
4. PR 标题英文，正文可中英文
5. 引用相关 issue（如果有）

---

## Code of Conduct

简单原则：友好、尊重、不发垃圾。技术讨论欢迎激烈但不要人身攻击。

---

## 联系

Issue / PR / Discussion 都可。中英文都欢迎。
