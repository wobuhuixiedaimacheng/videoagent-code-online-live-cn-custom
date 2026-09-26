# Video Prompt Engineer

[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](LICENSE)
[![Agent Skill](https://img.shields.io/badge/Agent%20Skill-compatible-2563EB.svg)](https://agentskills.io/)
[![Target: Seedance](https://img.shields.io/badge/Target-Seedance%202.0-EA580C.svg)](references/seedance2-profile.md)

把已经定稿的剧本或剧本片段，转换为可直接进入 Seedance 生成流程的
10–15 秒文字分镜与视频提示词表。

> A portable Agent Skill for turning finalized scripts into executable,
> Seedance-oriented text storyboards and video prompts.

## 项目定位

Video Prompt Engineer 是一个遵循 Agent Skills 目录结构的 Skill。它面向中文
竖屏动画短剧和 Seedance 工作流，负责定稿剧本读取、音频核对、固定资产提取、
10–15 秒分镜规划、内部镜头设计、情绪外化、动作因果检查和最终视频提示词交付。

它生成的是**文字分镜与视频提示词表**。分镜图、角色资产、视频生成、成片剪辑和生成结果返修仍由对应工具或生产环节完成。

### 适合谁

- 使用 Codex、Claude Code 或其他 Agent 制作 AI 短剧的人。
- 需要把文学剧本转换为可执行镜头描述的导演、编剧和提示词工程师。
- 需要控制台词完整性、镜头时长、人物一致性和场景连续性的制作团队。
- 希望把分镜生产流程沉淀为可复用 Skill 的 AI 内容团队。

## 它解决什么问题

| 常见问题 | Skill 的处理方式 |
| --- | --- |
| 台词、旁白或内心 OS 在拆镜时遗漏 | 先建立音频账本，再分配镜头和时长 |
| “悲伤、压迫、迟疑”等描述无法直接生成 | 转换为眼神、动作、身体距离和物件状态 |
| 重复人物、场景和道具没有提前固定 | 在分镜前完成一次固定资产提取 |
| 普通木桶、绳索和家具被过度拆成资产 | 固定场景吸收普通环境元素，短时元素直接写入提示词 |
| 同场景被切成许多短片，人物与空间容易漂移 | 一个分镜优先保持为 10–15 秒生成单元 |
| 相邻生成片段缺少连接 | 规划动作、视线、声音、物件、光色或遮挡锚点 |
| 一个时间段塞入多个视觉焦点 | 先识别节拍边界，再分配时间段 |
| 追逐、绳索、武器等复杂动作不符合物理关系 | 先核对位置、方向、连接、结果和结束状态 |
| 提示词前缀混入“游戏广告”“画面精美”等弱约束词 | 只保留基础画面风格和剧本可确认的时间、基础光影 |
| 提示词依赖“上一镜”“刚才那个东西” | 每一条提示词独立描述必要信息 |

## 核心能力

1. **剧本读取**：识别场景、人物、动作、台词、旁白、内心 OS 和歧义。
2. **音频账本**：统计所有发声内容并估算时长，检查遗漏和重复。
3. **固定资产提取**：提前固定重复、跨15秒或非连续出现的人物、场景和独立道具。
4. **分镜规划**：将一个分镜控制为一次10–15秒生成，内部包含若干镜头。
5. **空间与因果检查**：核对主体位置、运动方向、物理连接、可见结果和结束状态。
6. **视觉镜头拆分**：根据主体变化、反应、物件状态、情绪转折和说话关系识别边界。
7. **情绪外化**：把抽象叙事转换为摄影机能够记录的物理现象。
8. **衔接规划**：为必须拆开的相邻分镜设计可见或可听的连接。
9. **分镜提示词交付**：输出项目配置、固定资产、衔接计划和完整分镜表。
10. **质量检查**：检查音频、时长、连续性、因果、资产纪律和提示词独立性。

## 工作流

```text
已定稿剧本或片段
        ↓
读取场景、动作和全部发声内容
        ↓
建立音频账本和最小剧情时序
        ↓
提取固定资产并冻结统一名称
        ↓
规划 10–15 秒分镜
        ↓
检查复杂动作的空间调度和因果链
        ↓
在分镜内部拆分镜头并外化情绪
        ↓
生成分镜提示词表
        ↓
按质量标准检查并返修
```

## 能达到什么效果

输入一段定稿剧本以及已有参考资产后，Skill 会生成类似下面的生产交付：

| 分镜 | 提示词 | 时长 |
| --- | --- | ---: |
| 分镜一 | 包含多个内部镜头、主体位置、动作、完整台词和声音策略的独立提示词 | 13s |
| 分镜二 | 包含物件状态变化、人物反应、因果关系和衔接锚点的独立提示词 | 13s |

它主要提升以下生产变量：

- 台词、旁白和内心 OS 的可核对性。
- 固定资产数量和参考图成本的可控性。
- 每段提示词的视觉焦点清晰度。
- 同场景跨片段生成时的连续性。
- 复杂动作的空间方向与因果完整性。
- 抽象情绪的画面可执行性。
- 资产命名和提示词结构的一致性。

这些结果属于流程控制目标，不代表视频模型一定一次生成成功。最终画面仍受模型能力、参考素材、生成参数和人工评审影响。

## 完整示例

仓库提供了一组完全虚构、按照真实都市短剧生产格式编写的示例《雾港来信》：

- [原始剧本](examples/urban-reveal/script.txt)
- [已审核资产表](examples/urban-reveal/assets.json)
- [完整分镜提示词输出](examples/urban-reveal/expected-output.md)

示例展示了一个常见的公开身份反转场景：

```text
程峥（压低声音）：供应商走侧门，别在这里添乱。
林晚（平静）：我来参加董事会。
```

经过 Skill 处理后，台词会和人物站位、视线关系、邀请函状态、反应镜头及后续身份揭示一起被分配到连续的生成片段中。

## 安装

这个仓库本身就是一个完整 Skill 文件夹。支持 Agent Skills 开放标准或能够读取 `SKILL.md` 的 Agent，都可以使用同一份内容。

### Codex

个人安装，适用于所有项目：

```bash
mkdir -p ~/.codex/skills
git clone https://github.com/Arch-Dog/video-prompt-engineer.git \
  ~/.codex/skills/video-prompt-engineer
```

项目安装，适合团队共同维护：

```bash
mkdir -p .agents/skills
git submodule add https://github.com/Arch-Dog/video-prompt-engineer.git \
  .agents/skills/video-prompt-engineer
```

调用方式：

```text
$video-prompt-engineer
```

Codex 会根据 `SKILL.md` 的描述自动匹配相关任务，也可以通过 `$video-prompt-engineer` 显式调用。

### Claude Code

个人安装：

```bash
mkdir -p ~/.claude/skills
git clone https://github.com/Arch-Dog/video-prompt-engineer.git \
  ~/.claude/skills/video-prompt-engineer
```

项目安装：

```bash
mkdir -p .claude/skills
git submodule add https://github.com/Arch-Dog/video-prompt-engineer.git \
  .claude/skills/video-prompt-engineer
```

调用方式：

```text
/video-prompt-engineer
```

### 其他 Agent

1. 找到该 Agent 识别 Skills 的目录。
2. 把整个仓库复制或克隆到 `video-prompt-engineer/` 子目录。
3. 确认目录根部保留 `SKILL.md`，并且 `references/`、`scripts/` 与其相对位置不变。
4. 用自然语言提出剧本转分镜任务，或显式指定 `video-prompt-engineer`。

具体目录和调用语法由 Agent 宿主决定。通用结构遵循 [Agent Skills](https://agentskills.io/)；路径和调用规则可分别查阅 [Codex Skills 文档](https://developers.openai.com/codex/skills) 与 [Claude Code Skills 文档](https://code.claude.com/docs/en/skills)。

## 快速开始

最低输入：

```text
@script.txt
使用 video-prompt-engineer，把这个剧本转成 Seedance 2.0 竖屏短剧分镜提示词。
每个分镜以一次 10–15 秒生成为单位，内部根据视觉焦点拆分镜头。
画幅 9:16，已有资产名称以 @assets.json 为准。
```

如果没有审核过的资产表：

```text
先从完整剧本中提取重复、跨15秒或非连续出现的固定资产。固定场景吸收普通环境元素，一次性短时元素直接写进提示词，不单独命名。
```

完整输入字段和资产表格式见 [Input Contract](references/input-contract.md)。

## 输入规范

### 必需输入

- 已经定稿的剧本、剧本片段或边界明确的可追溯文本。
- 目标任务：生成适配 Seedance 的文字分镜与视频提示词。

### 默认值

- 模型：Seedance-oriented。
- 画幅：9:16。
- 视觉基线：保留用户提供的基础画面风格；缺失时只依据明确剧本或参考图证据判断。再补充剧本可确认的时间与基础光影，不添加题材定位、产品类型、宣传性形容词或额外氛围设计。
- 声音策略：默认“电影音效，无配乐，无字幕”，允许项目级替换。

### 建议输入

- 已审核的人物、场景和道具名称。
- 模型版本、最长生成时长和音频能力。
- 期望风格、时代、地区与受众。
- 不得修改的台词和必须保留的剧情节点。

### 文件边界

- Agent 能读取的纯文本、Markdown 或剧本文档可以直接作为输入。
- 本地 `scripts/parser.py` 只读取 UTF-8 纯文本。
- PDF、DOCX、图片 OCR 等格式应先由宿主 Agent 正确提取文本，再交给 parser 或 Skill。

## 输出规范

默认只交付生产结果：

1. 项目配置：模型、画幅、视觉基线、声音策略。
2. 固定资产：本次使用的已审核 `@` 名称和仍待建立的连续性资产。
3. 衔接计划：需要跨生成片段保持连续的关键锚点。
4. 分镜表：`分镜 | 提示词 | 时长`，每个分镜内部可以包含多个镜头。

内部音频账本、解析日志和长篇推理默认不展示。用户明确要求审计时再提供。

## 验收标准

一份可以进入生产的输出至少满足：

- 剧本中的每条台词、旁白和内心 OS 恰好出现一次。
- 镜头时长足以容纳对应音频和主要动作。
- 每个时间段只有一个需要观众明确观看的视觉焦点。
- 每条提示词都能脱离上下文单独执行。
- 不擅自修改台词、补写剧情或合并资产名称。
- 重复、跨15秒或非连续出现的连续性资产已经在分镜前固定。
- 普通场景构成和一次性短时元素没有被递归提炼成资产。
- 复杂动作具备明确位置、方向、物理连接、可见结果和结束状态。
- 抽象情绪已经转换为可见行为。
- 同空间拆镜具有可追踪的衔接锚点。
- 输出只包含生产团队需要的字段。

详细检查项见 [Quality Rubric](references/quality-rubric.md)。

## Parser

当剧本较长、格式混乱或可能漏台词时，可以先建立本地账本：

```bash
python3 scripts/parser.py examples/urban-reveal/script.txt --format work-view
```

输出完整结构：

```bash
python3 scripts/parser.py examples/urban-reveal/script.txt > parsed.json
```

只看音频账本：

```bash
python3 scripts/parser.py examples/urban-reveal/script.txt --format audio-ledger
```

使用审核后的命名表：

```bash
python3 scripts/parser.py examples/urban-reveal/script.txt \
  --canonical-map examples/urban-reveal/assets.json
```

Parser 负责结构化和核对，不负责最终导演判断或自动资产归类。详细说明见 [Parser Guide](references/parser-guide.md)。

## 能力边界

这个 Skill 当前：

- 聚焦 Seedance 2.0 和中文竖屏短剧。
- 可以在确认模型约束后适配其他视频模型。
- 不创建角色参考图、场景图或道具资产。
- 不把固定场景中的普通环境元素继续拆成独立资产。
- 不擅自为缺少参考的固定资产编造 `@` 名称。
- 不直接调用视频模型生成成片。
- 不评估已经生成的视频画面。
- 不承担剪辑、配音、音乐和最终交付管理。

## 仓库结构

```text
video-prompt-engineer/
├── SKILL.md
├── agents/
│   └── openai.yaml
├── examples/
│   └── urban-reveal/
├── references/
│   ├── input-contract.md
│   ├── asset-strategy.md
│   ├── audio-handling.md
│   ├── blocking-causality.md
│   ├── narrative-transcoding.md
│   ├── parser-guide.md
│   ├── prompt-formula.md
│   ├── quality-rubric.md
│   ├── seedance2-profile.md
│   ├── shot-composition.md
│   └── 情绪外化速查.md
├── scripts/
│   └── parser.py
└── tests/
    └── test_parser.py
```

## 开发与验证

```bash
python3 -m unittest discover -s tests -v
python3 -m py_compile scripts/parser.py
```

每次修改 `SKILL.md` 后，还应使用宿主提供的 Skill validator 检查 frontmatter、目录名和元数据。

## 版本与许可

- 当前工作版本：v2.2.0-local-draft（仅本地，尚未发布）
- License：[MIT](LICENSE)
- 更新记录：[CHANGELOG.md](CHANGELOG.md)

欢迎通过 Issue 提交真实工作流中的失败案例。请勿上传未授权剧本、客户资产、演员隐私信息或包含密钥的生成记录。
