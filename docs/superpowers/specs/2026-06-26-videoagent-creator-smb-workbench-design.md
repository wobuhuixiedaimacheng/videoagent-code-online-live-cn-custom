# VideoAgent Creator And SMB Workbench Design

Date: 2026-06-26

## Summary

Build VideoAgent Code into a Claude Code-style marketing content agent workbench for consumer creators and small businesses. The product should not become a generic AI chat tool, a full animation platform, or an enterprise marketing middle platform. It should provide three primary creation entries that all land in one editable project workspace.

The core promise is:

> Turn an idea, existing draft, or account direction into an editable short-form marketing video project with script, storyboard, asset prompts, publish copy, and lightweight compliance checks.

中文摘要：

本设计把当前项目从演示型 Demo 收敛为一个 C 端创作者和小 B 商家都能使用的营销短视频 Agent 工作台。产品不做通用 Claude Code 克隆，也不做完整 OiiOii 动画平台，而是借鉴 Claude Code 的文件、diff、审批、工具调用机制，以及 OiiOii 的内容生产流水线表达，形成三个主入口、一个统一工作区的产品结构。三个入口分别是从零生成、旧稿爆改、一周选题，最终都落到同一套项目文件：账号/品牌 DNA、brief、脚本、分镜、素材提示词、发布文案和合规报告。

## Inputs Used

- Current project: a lightweight Next.js MVP with one page, localStorage workspace state, an API-backed/mock agent provider, file tree, plan display, tool call display, diff preview, and approval flow.
- OiiOii reference: multi-agent AI animation/content pipeline, visual creation workspace, project/canvas style continuation.
- Claude Code reference: project files, tool events, diff/approval, command-like interaction, persistent working context. This design borrows product mechanics only and does not reuse proprietary implementation.
- Competitor report: `/Users/carroll/Downloads/出海旅游AIGC内容营销中台 - 竞品分析报告.pdf`.

## Target Users

The first version serves two adjacent user groups through one product core:

- Consumer creators: individuals making Xiaohongshu, Douyin, TikTok, Instagram, or YouTube Shorts content.
- Small businesses: solo founders, local stores, small ecommerce sellers, service providers, and small brands creating marketing short videos without a dedicated content team.

The product should not include enterprise team workflows in the first version. Team permissions, CRM, approval chains, and multi-client agency management are out of scope for this design.

## Product Positioning

VideoAgent Code is a marketing video project workbench, not a chat-only assistant.

Users enter through one of three primary workflows:

1. Generate from scratch.
2. Rewrite or remix existing content.
3. Generate a weekly content plan.

All three workflows create or update the same structured project files. This is the product's main distinction from ordinary AI writing tools: the agent works on a project, proposes changes, shows diffs, and waits for approval before writing.

## Three Primary Entries

### Generate From Scratch

Input examples:

- Product name and selling points.
- Service introduction.
- Store activity.
- Personal idea or content opinion.

Output:

- Title options.
- Hook options.
- Short video script.
- Storyboard.
- Asset prompts.
- Publish copy.
- Lightweight compliance report.

### Rewrite Or Remix Existing Content

Input examples:

- Existing draft.
- Old script.
- Competitor or viral content structure described by the user.
- Product description that needs a stronger angle.

Output:

- Diagnosis of weak points.
- Extracted structure.
- Revised script.
- Alternative hooks.
- Storyboard update.
- Publish copy update.
- Change diff against the old version.

This is the first form of "secondary creative reuse" from the competitor report. The first version should work from text and user-provided descriptions. Real video understanding and media asset analysis are not required for P0.

### Weekly Content Plan

Input examples:

- Account positioning.
- Product category.
- Target audience.
- Desired platform.

Output:

- Seven content ideas.
- Suggested angle for each idea.
- Recommended format.
- One-click expansion into a full project using the same file structure.

This is a planning entry, not a calendar or publishing system. A real calendar and publishing integration are out of scope.

## Unified Project Files

Every workflow should operate on the same workspace file model:

- `profile.json`: account persona or brand DNA.
- `brief.json`: content goal, target audience, platform, tone, offer, constraints.
- `script.md`: short video script with hook, body, and CTA.
- `storyboard.json`: scenes, visual direction, narration, subtitles, timing.
- `asset_prompts.json`: image/video prompt suggestions, reference asset notes, visual style constraints.
- `publish_copy.json`: titles, cover text, captions, hashtags, platform-specific copy.
- `compliance_report.json`: marketing exaggeration, copyright, sensitive expression, AI disclosure, and platform risk notes.
- `.videoagent/MEMORY.md`: durable project preferences and prior user decisions.

The MVP can keep these files in browser localStorage, but the design should treat them as real project artifacts so that later cloud persistence can replace localStorage without changing the user mental model.

## Creator And SMB Differences

The product should not fork into two separate products. It should use the same workspace and different defaults.

Creator defaults:

- `profile.json` focuses on account persona, tone, niche, target follower, content style, and banned expressions.
- Success language emphasizes engagement, consistency, personality, and content cadence.
- Compliance checks are lightweight and mostly about platform safety, copyright, exaggerated claims, and AI disclosure.

Small business defaults:

- `profile.json` focuses on brand DNA, product/service catalog, target customer, offer, CTA, proof points, and marketing red lines.
- Success language emphasizes trust, conversion, clarity, local relevance, and repeatable campaign variants.
- Compliance checks emphasize exaggerated claims, risky guarantees, unauthorized assets, platform restrictions, and AI disclosure.

The first screen can ask the user to choose a mode, but this choice should be lightweight. It should not become a long onboarding questionnaire.

## Agent Model

Use one orchestrator with role-specific steps instead of true multi-agent concurrency in the MVP.

Roles:

- Strategy role: understands the task, target user, platform, and content goal.
- Script role: writes titles, hooks, body, and CTA.
- Storyboard role: turns script into scenes, visuals, narration, and subtitles.
- Asset role: proposes asset prompts and reuse suggestions.
- Compliance role: checks marketing claims, copyright risk, platform risk, and AI disclosure.
- Review role: summarizes changes and prepares patch operations.

The UI may present these as agent steps. Internally they can be one structured model call at first, then be split into separate calls when quality or latency requires it.

## Claude Code-Inspired Interaction

Keep and strengthen the existing project mechanics:

- File tree on the left.
- Agent console in the center.
- Plan and tool events for each run.
- Diff preview for proposed file changes.
- Approval before applying patches.
- Rejection path that leaves files unchanged.
- Project memory that updates only after explicit approval or clear user action.

The agent should never silently overwrite a project file. All generated changes should pass through a patch preview.

## OiiOii-Inspired Interaction

Borrow the production-pipeline feel without copying the animation-platform scope:

- Show the workflow as a visible chain: brief, script, storyboard, assets, publish, compliance.
- Let users continue from any artifact instead of restarting from chat.
- Make visual outputs inspectable even when they are only prompts or storyboard cards.
- Keep the right side as a live preview of the current short-video plan.

Do not build a full canvas, real animation generation, or multi-model video generation pipeline in the first version.

## Competitor Report Adaptation

The report's original target is a B-side overseas travel AIGC content marketing middle platform. This project adapts the conclusions down to a self-serve creator and small-business tool.

Directly useful ideas:

- Context engineering is the moat, not raw model access.
- Secondary creative reuse is the most differentiated workflow.
- Multi-agent workflow should include human intervention points.
- Content safety APIs are useful infrastructure, but the product value is integrating checks into creation flow.
- Data flywheel matters, but the first version should collect structured user feedback and project history before building analytics.

Ideas to defer:

- European regulatory compliance depth.
- Team permission systems.
- Cross-platform publishing APIs.
- Real media asset library and copyright tracing.
- Internal 70-80 person workflow governance.
- Data warehouse and reporting layer.

## Current Codebase Changes Implied

The existing code is a good demo shell but should be separated into clearer units before feature work grows.

Recommended component boundaries:

- `components/topbar`: project identity, mode, provider status.
- `components/sidebar`: project file tree, primary entries, quick commands.
- `components/agent-console`: messages, plan, tool events, run result.
- `components/diff-preview`: selected patch and approval actions.
- `components/preview-panel`: phone preview, storyboard preview, compliance summary, file viewer.
- `lib/workspace`: project file operations, patch application, persistence.
- `lib/agent`: task routing, prompt building, response normalization.
- `lib/templates`: creator and small-business defaults.

This is a scoped restructuring to support the product direction, not a broad refactor.

## P0 Scope

P0 includes:

- Three primary entries on the home/workbench surface.
- Creator and small-business mode defaults.
- Unified workspace file structure.
- Structured agent response with plan, tool events, patches, compliance checks, and preview.
- Patch approval and rejection.
- Text-based secondary creative reuse for existing drafts.
- Weekly plan generation with expandable ideas.
- Lightweight compliance checks.
- Local browser persistence.

P0 excludes:

- Login.
- Database.
- Payments.
- Team permissions.
- Real video rendering.
- TTS.
- Direct publishing.
- Real video analysis.
- External asset search.
- Enterprise compliance rule engine.

## Error Handling

- If no API key is configured, keep mock mode but clearly label it.
- If model output is invalid JSON, return a user-readable failure and keep the workspace unchanged.
- If a patch targets an unknown file, create a new file only when the response provides complete content.
- If compliance finds blocked content, show a blocked status and require the user to revise before export-oriented actions.
- If a run fails, append a system message and preserve the previous run result.

## Verification Plan

Before implementation is considered complete:

- Run TypeScript typecheck.
- Verify all three entries produce valid structured project files.
- Verify patch approval changes files and rejection leaves files unchanged.
- Verify creator mode and small-business mode change defaults in `profile.json` and copy tone.
- Verify invalid model JSON does not corrupt workspace state.
- Manually inspect desktop and mobile responsive layouts.

## Open Product Decision

The first implementation should use a single local workspace and browser persistence. Cloud accounts and project sync should be treated as a later commercial layer, not part of the first build.

## Approval Gate

This design is ready to turn into an implementation plan after user review.
