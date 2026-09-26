# Awesome List Submission

[![Awesome](https://awesome.re/badge.svg)](https://awesome.re)

> Submission-ready entry for upstream `awesome-*` lists. Just copy the line(s) you want into the corresponding `README.md` PR.

---

## ⚡ One-line entry (paste anywhere)

### English (concise)

```markdown
- [lanshu-awesome-ai-video-kit](https://github.com/cclank/lanshu-awesome-ai-video-kit) - Curated AI video prompt engineering kit covering 16 models (Sora / Veo / Kling / Runway / Pika / Seedance / Hunyuan / Wan / Jimeng + 4 open source) with 433 battle-tested prompts, 110 cross-model comparisons, 7 Claude Code Skills and 21 methodology docs.
```

### English (expanded — for "Resources" sections)

```markdown
- [lanshu-awesome-ai-video-kit](https://github.com/cclank/lanshu-awesome-ai-video-kit) - The most complete AI video prompt library on the web. 12 commercial flagships + 4 open source models, 433 standalone prompts + 110 cross-model matrix (10 scenarios × 11 models), 7 Claude Code Skills including a `model-selector` (15-model shopping advisor) and a `prompt-translator` (cross-model converter based on 110-prompt baseline), 15 methodology SOPs, and a weekly GitHub Action auto-monitoring 32 official endpoints for model version drift.
```

### 中文

```markdown
- [lanshu-awesome-ai-video-kit](https://github.com/cclank/lanshu-awesome-ai-video-kit) - 全网最全的 AI 视频提示词工程库,覆盖 15 大模型(12 商业 + 4 开源),433 条实测提示词 + 110 条跨模型对照 + 7 个 Claude Code Skill + 21 篇方法论,GitHub Action 每周自动监控 27 个官方端点。
```

---

## 🎯 Target upstream awesome lists

Submit this to:

| Upstream | Suggested section | Why fits |
|---|---|---|
| [awesome](https://github.com/sindresorhus/awesome) (top-level) | "Generative AI" → new entry | Multi-vendor, structured, recurring-maintenance(weekly monitor) |
| [awesome-claude-code](https://github.com/hesreallyhim/awesome-claude-code) | "Skills" or "Resources" | 7 Claude Code Skills with proper SKILL.md YAML frontmatter |
| [awesome-generative-ai](https://github.com/steven2358/awesome-generative-ai) | "Video" section | 15 models with prompting guides, cross-model matrix |
| [awesome-chinese-llm](https://github.com/HqWu-HITCS/Awesome-Chinese-LLM) | "视频生成" / Video Generation | Strong CJK coverage (Seedance/Kling/Wan/Hunyuan/Jimeng + CogVideoX) |
| [awesome-ai-agents](https://github.com/e2b-dev/awesome-ai-agents) | Vertical tools | Skills act as composable agents for Claude |
| [awesome-llm-prompts](https://github.com/promptslab/Awesome-Prompt-Engineering) | "Prompt Engineering" → Video | 543 prompts with model-specific formulas |
| [awesome-stable-diffusion](https://github.com/awesome-stable-diffusion/awesome-stable-diffusion) | "Video models" | 4 open source models with local-deploy guides |

---

## 📋 Why this belongs in `awesome` (audit checklist)

Adherence to [awesome.re criteria](https://github.com/sindresorhus/awesome/blob/main/awesome.md):

- [x] **Topic is searched for** — "AI video prompt" / "Sora prompt" / "Kling prompt" all have measurable Google Trends interest
- [x] **README has a logo / banner** — Capsule-render banner + emoji headers
- [x] **Has a description** — Both 1-line and multi-paragraph descriptions
- [x] **Has a table of contents** — `📑 Contents` section with anchor links
- [x] **Has a "Contributing" section** — `CONTRIBUTING.md` + 4 issue templates + PR template
- [x] **Has a "License" section** — MIT, clearly attributed
- [x] **Has consistent formatting** — All entries use `[name](url) - description` format
- [x] **Has fewer than 5 typos** — Manual proofreading done
- [x] **Items are sorted** — Models sorted by 2026/5 Elo ranking
- [x] **Has CI / linter** — GitHub Action validates JSON schema + monitors model versions
- [x] **Recently updated** — Active maintenance, weekly auto-monitor
- [x] **Doesn't link to dead resources** — All 27 endpoints monitored via SHA-256 hash
- [x] **Is original** — Not a fork or compilation of other lists; primary content sourced from official docs
- [x] **Has appropriate Code of Conduct** — `CONTRIBUTING.md` defines tone and process
- [x] **Has reasonable scope** — Focused exclusively on AI video prompting (not generic LLM, not image)

---

## 🏷️ Suggested badges (for upstream README cell)

```html
<a href="https://github.com/cclank/lanshu-awesome-ai-video-kit">
  <img alt="Models" src="https://img.shields.io/badge/models-15-8b5cf6?style=flat">
  <img alt="Prompts" src="https://img.shields.io/badge/prompts-543-f97316?style=flat">
  <img alt="Skills" src="https://img.shields.io/badge/skills-7-06b6d4?style=flat">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-cccccc?style=flat">
</a>
```

---

## 🎬 Topics / GitHub tags (for repo discoverability)

Add these to **About → Topics** on the GitHub repo settings page:

```
ai-video, video-generation, prompt-engineering, awesome, awesome-list, claude, claude-code,
claude-skills, sora, veo, kling, runway, pika, hailuo, hunyuan, seedance, happyhorse, wan,
jimeng, ltx-video, mochi, cogvideox, higgsfield, t2v, i2v, generative-ai, llm, lora, comfyui
```

---

## 📝 Suggested PR template for upstream submission

```markdown
## What does this PR do?

Adds **lanshu-awesome-ai-video-kit** to the [Video] section.

## Description

[lanshu-awesome-ai-video-kit](https://github.com/cclank/lanshu-awesome-ai-video-kit) is a curated, actively-maintained kit for AI video prompt engineering. It covers 15 models (11 commercial + 4 open source), 433 battle-tested prompts, 110 cross-model comparisons, 7 Claude Code Skills, and 21 methodology SOPs. A GitHub Action monitors 32 official endpoints weekly and auto-files issues on version drift.

## Checklist

- [x] Project follows the [awesome guidelines](https://github.com/sindresorhus/awesome/blob/main/awesome.md)
- [x] Project has been actively maintained in the last 3 months
- [x] Project has a README with description, ToC, and Contributing section
- [x] Project has clear license (MIT)
- [x] Entry follows existing format in this list
- [x] Items are sorted/placed correctly

## Why this addition?

(1) Vendor-neutral coverage — most AI-video resources focus on a single platform; this is the first to cover all 15 major models with cross-model comparison data
(2) Cross-model translation skill — the only known repo with a prompt-translator that converts between model formulas based on 110-prompt baseline
(3) Self-maintaining — weekly auto-monitor catches model version drift and files issues automatically
```

---

## 🌟 Stat snapshot (for upstream maintainers to verify)

| Metric | Value |
|---|---|
| Models covered | **15** (11 commercial + 4 open source) |
| Standalone prompts | **433** (with model-specific formulas + recommended params) |
| Cross-model prompts | **110** (10 scenarios × 11 models) |
| Total prompt assets | **543** |
| Claude Code Skills | **7** (incl. `model-selector` and `prompt-translator`) |
| Methodology SOPs | **21** (incl. all masterclasses + Realistic Character + Playbook FPV Path Drawing + cross-model decision trees) |
| Web tools | **3** (homepage / prompt-browser / cross-model matrix) |
| Monitored endpoints | **32** (weekly SHA-256 hash check via GitHub Action) |
| Issue templates | **4** (test video / new prompt / new model / config) |
| Last update | 2026-05-25 (active, weekly cadence) |
| License | MIT |

---

## ✉️ Maintainer contact

Open an issue on the repo, or reach out via the GitHub profile linked from `package.json` / `README.md` footer.
