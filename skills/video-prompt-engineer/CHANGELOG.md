# Changelog

All notable changes to the `video-prompt-engineer` skill.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.2.0] - 2026-07-31

- Added a two-layer continuity-asset strategy: fix only repeated, over-15-second,
  non-contiguous, or explicitly supplied characters, scenes, and independent
  props; keep short one-moment elements inline.
- Moved fixed-asset extraction before storyboard planning to avoid a
  storyboard-to-asset-to-storyboard rewrite loop.
- Defined one 10-15 second generation as one storyboard containing several
  internal shots.
- Added blocking and causality guidance for direction, physical connection,
  visible result, and end state.
- Kept dialogue, voiceover, and inner-OS timing rules unchanged.
- Replaced the hard-coded prompt suffix with a project-level sound strategy.
- Narrowed triggering to finalized-script or finalized-fragment conversion for
  Seedance text storyboards and video prompts.
- Restricted each prompt's opening visual baseline to the basic image style plus
  source-grounded time and basic lighting.
- Prohibited inferred product, platform, audience, genre-positioning,
  quality-claim, and decorative atmosphere language in prompt prefixes.

## [2.1.0] - 2026-07-30

### Added

- Added a complete fictional production example with source script, reviewed
  asset map, and expected shot-prompt output.
- Added a public input contract covering source formats, required fields,
  naming-map schema, missing inputs, and model boundaries.
- Added Codex, Claude Code, and generic Agent Skill installation instructions.
- Added parser regression tests and a GitHub Actions validation workflow.
- Added `agents/openai.yaml` for Codex and ChatGPT skill metadata.

### Changed

- Added timestamp boundary triggers for subject shifts, meaningful reactions,
  object-state changes, emotion turns, and dialogue-state changes.
- Changed duration planning order: identify visual-focus boundaries first, then
  assign time inside the target clip range.
- Expanded the quality rubric with visual-focus and production acceptance checks.
- Clarified source fidelity, immutable dialogue, and direct-video-generation
  boundaries.
- Corrected the parser's dialogue-speaker whitespace expression.

### Removed

- Removed local parser artifacts and real-project scratch data from the public
  package.

---

## [2.0.0] - 2026-05-25

### Changed: Seedance-first production workflow

- Repositioned the skill from generic video-model prompting to Seedance-oriented
  Chinese vertical short-drama prompt production.
- Added manual asset boundary: the skill no longer tries to create an asset pack
  or infer canonical names from messy scripts.
- Reframed 10-15 second clips as consistency containers for same-scene
  generation.
- Replaced the absolute "no camera movement" rule with strong-intent camera
  language.
- Reworked transition logic around action, gaze, sound, object, light, and
  occlusion anchors.
- Simplified audio guidance: full voice metadata is no longer attached to every
  line by default.
- Replaced the parser with a local ledger parser that outputs full line records,
  audio ledger, action ledger, work view, and validation report.
- Removed stale `references/运镜指南.md` and `references/提示词模板.md`.

---

## [1.9.2] - 2026-05-19

### Fixed: Eliminated per-shot summary noise

**Problem**: AI was outputting beat sequences, audio breakdowns, and scene analysis before each shot's prompt — "莫名其妙的总结" that adds no value for video generation.

**Root cause**: Steps 1-4 were not explicitly marked as internal reasoning. Step 3's "Output" was defined as a shot list with beat sequences and audio lists, which AI interpreted as user-facing content.

**Fixes**:
- Added explicit banner: "Steps 1-4 are internal reasoning. Do NOT output intermediate analysis"
- Step 3 output relabeled as "Internal work product (AI use only, do NOT output)"
- Step 2b beat breakdown annotated: "Internally split into beat sequence (do NOT output beats to user)"
- Final Output Format now explicitly prohibits: "No beat summaries, no audio breakdowns, no scene analysis before individual shots"
- Final Output Format now states: "Each row in the table contains exactly: shot number | prompt string | duration. Nothing else."

---

## [1.9.1] - 2026-05-18

### Anthropic Standard Compliance Refactor

v1.9.1 is a structural refactoring to align with the Anthropic Agent Skills open standard. No functional changes to the 7-step workflow or core principles — only packaging, organization, and cross-platform portability improvements.

### Added

- **Industrial-grade file structure**: Reorganized into `SKILL.md` + `scripts/` + `references/` + `assets/` layout per Anthropic spec
- **6 new reference documents** in `references/`:
  - `narrative-transcoding.md` — Emotion-to-action mapping, atmosphere keywords, speed/state translation
  - `shot-composition.md` — Shot splitting/merging rules, spatial continuity verification, transition methods
  - `prompt-formula.md` — Complete prompt formula, punctuation standards, action description rules
  - `quality-rubric.md` — Full 11-item quality checklist with priority levels and failure fallback rules
  - `audio-handling.md` — Duration estimation, voice parameters, inner OS handling, dialogue relationships
  - `parser-guide.md` — Script parser usage and output format
- **Enhanced YAML frontmatter**:
  - `license: MIT` added
  - `metadata` block added with `author`, `version`, `category`, `tags`, `compatibility`
  - `description` rewritten with clear WHAT + WHEN + trigger phrases, under 1024 chars
- **Progressive disclosure**: Detailed rules moved from SKILL.md body to references/. SKILL.md now focuses on core workflow overview with links to deep-dive docs
- **Quick reference links table** at end of SKILL.md for fast navigation

### Changed

- **SKILL.md frontmatter**: `version` moved from top-level to `metadata.version` per spec
- **SKILL.md body**: Reduced from ~18KB to ~8KB. Detailed rules extracted to references/. Core principles and 7-step workflow retained with inline links
- **Language consistency**: SKILL.md and all references unified to bilingual (Chinese primary, English annotations) for cross-platform compatibility
- **README.md retained at repo level** (not inside skill folder) per Anthropic distribution guidelines

---

## [1.9.0] - 2026-05-12

### 核心升级：从"台词驱动"到"音频内容驱动"

v1.9 是一次架构级重构。之前 skill 只处理"台词"，v1.9 把台词、旁白、内心OS 统一纳入"音频内容"体系，时长计算和镜头切分逻辑全面适配。这是多组竖屏短剧生产案例校验后的关键沉淀。

### Added

- **Step 4.5 快速自检**：新增可选关卡，提供 3 项快速检查清单（抽象词检测、空间追踪、衔接手法记录），在提交前快速扫一遍明显问题。
- **音频内容体系**：Step 3 的"台词"概念扩展为"音频内容"（台词 + 旁白 + 内心OS），统一时长计算、切分规则和质检标准。
- **音频漏项预防机制**：Step 3 新增 mentally 标记法，每分配一句音频做标记，切分完成后扫读剧本确认无遗漏。
- **内心OS 完整规范**：OS 与台词时长等同、不得压缩，旁标注"（没有张嘴）"，原文省略号保留不补全。
- **音色描述标准**：每句音频需标注 8 维音色参数（性别/年龄/音调/质感/发音方式/气息/音量/语速）。
- **叙事转译原则**：新增核心原则第 9 条——所有描述必须是摄影机可拍摄的物理现象，禁止抽象形容词单独出现（如"很快""消失"），禁止小说式结果描述。
- **情绪氛围词（新 Step 2e）**：替换原"画面元素协同"，提供 3-5 字氛围词用于情绪转折点/场景切换，用场景自然光影而非专业术语。
- **衔接手法体系（6选1）**：动作接着做 / 她看向哪就切哪 / 声音先溜过来 / 同一个东西连起来 / 光看起来一样 / 黑一下再亮。仅记录于空间调度文档，不写进提示词。
- **节拍 → 镜头映射规则**：明确区分"节拍"（情绪方向变化的最小单元）与"镜头"（物理可执行的最小单元），两者粒度不同。
- **面部朝向 + 视线方向**：对话场景必须标注，单人动作可省略。
- **同场景人物调度一致性**：同一场景同一时间拆成多镜头时，每个镜头必须包含相同的人物位置关系描述。
- **标点规范**：提示词外层用双引号包裹，台词内部用冒号分隔，时间戳分段用分号分隔。
- **状态过渡标注**：标注情绪状态转变（如"从悲伤中抽离"），让模型理解情绪层次。
- **时间连接词**：可用"随后""然后""一边……一边……"等增加流畅感。
- **失败回溯规则**：质检失败后的回退路径明确化（D12→Step 3 补漏 / D0/D1→Step 3 调整 / D10→Step 3 重合并 / D11→Step 4 修改），连续两次失败返回上一级。
- **D12 音频数量核对**：新增质检项，确保剧本音频总数 == 分镜表音频总数。

### Changed

- **核心原则重构**："台词即动作"→"音频内容即动作"；"信息宁精勿滥"→"画面感优先"（强调环境互动、质感细节、动态元素）。
- **执行流程**：6 步 → 7 步（新增 Step 4.5）。
- **Step 2 导演决策**：删除"画面元素协同"（原 2e），新增"参考图确认"子步骤，新增"导演决策输出必须是镜头语言"的硬性约束。
- **Step 2a 叙事编排**：删除"情绪先行""悬念前置"两条，保留"开场3秒法则""先声夺人""不收尾原则"，更聚焦。
- **Step 2c 空间调度**：删除"参考图优先级"（谁有图谁标位置），改为"有参考图的场景空间细节由模型参照图片，不强制标注空间位置"。
- **Step 3 镜头切分**：台词 → 音频，新增"添加内心OS后必须重新核算镜头时长"。
- **Step 4 提示词公式**：`[风格] + [时间戳分镜]` → `[情绪氛围] + [时间戳：动作描述 + 音频内容]`。
- **Step 5 质检重排**：D2/D3 合并为"一般性检查"，D10 升级为镜头合并验证（新增 180 度规则、时间连贯性），D11 新增提示词空间验证，D9（时间戳格式）删除（已内化到 Step 4）。新增优先级分组（P0 致命 / P1 严重 / P2 一般）。
- **景别标注**：从 `[特写]` `[中景]` 标签改为自然语言描述（"镜头给到……的特写""镜头缓缓推近"）。
- **音频格式**：`角色名@说"台词"` → `角色名@：台词`（去引号用冒号）。
- **速度/状态转译**：新增规则——速度感用自然语言描述，不用精确角度。

### Removed

- **Step 2e "画面元素协同"**：删除光影/构图/运镜/景深组合表格，替换为更轻量的"情绪氛围词"。
- **D9 时间戳格式检查项**：已内化到 Step 4 的撰写规范中，不再单独质检。

### Notes

- v1.8 是 v1.9 的中间过渡版本（内部迭代），未单独发布。v1.9 包含了从 v1.7 到 v1.9 的全部累积改进。
- 本次更新经过多组 Seedance 2.0、9:16 竖屏短剧生产案例校验。
- 核心验证结论："做减法"比"堆功能"有效——删除画面元素协同表格后，提示词质量反而提升，因为 AI 不再被过度约束。

---

## [1.7.0] - 2026-04-21

### Changed

- 优化提示词前缀结构，去掉场景重复描述，避免噪声
- 简化 Step 2a 叙事编排维度（从 5 条减为 3 条）
- 精简"画面元素协同"工具包使用规则

---

## [1.6.0] - 2026-04-17

### Added

- 剧本结构化解析器（`scripts/parser.py`）：将剧本文本解析为 JSON，供后续步骤读取，节省 token
- "画面元素协同"工具包（Step 2e）：通过光影/构图/运镜/景深组合传递复合情绪
- 空间连续性预规划：相邻镜头空间跳跃时提前规划衔接方式

### Changed

- 情绪节拍拆解细化：新增"速度/状态转译"规则
- 镜头合并验证：新增 180 度规则、视线方向匹配

---

## [1.5.0] - 2026-04-15

### Added

- 质检体系从 10 项扩展到 11 项
- 新增 D10 导演思维检查
- 新增"不收尾原则"：场景末尾停在"刚要爆"的位置

---

## [1.4.0] - 2026-04-12

### Added

- 初始版本框架建立
- 6 步执行流程（Step 0-5）
- 10 项质检体系
- 核心 8 原则

---

## Versioning Philosophy

- **Major (X.0.0)**：架构级重构（如从"台词驱动"到"音频内容驱动"）
- **Minor (x.Y.0)**：新增步骤/新增核心原则/新增质检项
- **Patch (x.y.Z)**：规则细化、措辞优化、bug 修复
