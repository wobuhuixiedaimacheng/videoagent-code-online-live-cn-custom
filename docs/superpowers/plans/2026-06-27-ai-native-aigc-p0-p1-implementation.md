# AI Native AIGC P0/P1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the current VideoAgent page into an AI Native AIGC Mission Control web app with P0 production skills and P1 template skills.

**Architecture:** Keep the existing Next.js App Router app and `/api/agent/run` route. Extend the local workspace schema, provider response schema, mock provider, and helper layer so the UI can render missions, context stack, agent runtime, asset pipeline, P0 skills, and P1 templates. Replace the current dark three-column UI with a light AI-native mission-control layout inspired by the approved visual mockup.

**Tech Stack:** Next.js 14, React client component, TypeScript strict mode, localStorage persistence, existing Anthropic/OpenAI/custom provider fallback, CSS modules via `app/globals.css`.

---

## File Structure

- Modify `lib/types.ts`
  - Expand workflow types for P1 skills.
  - Add agent runtime, skill, mission asset, mission queue, and context item types.
  - Add `agentEvents` and `assets` to `AgentRunResponse`.

- Modify `lib/defaultWorkspace.ts`
  - Seed AI-native AIGC files: `viral_refs.json`, `scenes.json`, `platform_rules.json`, `asset_library.json`, `campaign_goal.json`, `.aigc/MEMORY.md`.
  - Keep existing files for compatibility.

- Modify `lib/workspace.ts`
  - Add P0 skill list, P1 skill templates, agent roster, context stack helpers, asset pipeline helpers, workflow labels, and file labels.
  - Keep existing patch, diff, parse, and approval helpers.

- Modify `lib/agentProvider.ts`
  - Update prompt contract to include AI Native AIGC assets and agent events.
  - Make mock mode produce visible P0/P1 agent events, asset list, scene files, and complete-file patches.
  - Keep live provider compatibility through normalizing missing `agentEvents` and `assets`.

- Replace `app/page.tsx`
  - Render the approved AI Native Mission Control structure.
  - Support P0 mission run, P1 template selection, scene selection, asset inspection, approval, rejection, and scoped rerun commands.

- Replace `app/globals.css`
  - Implement the light operational UI, responsive rail/context/main/inspector layout, agent graph, asset pipeline, and approval inspector.

## Task 1: Extend Data Types

**Files:**
- Modify: `lib/types.ts`

- [ ] **Step 1: Add AI Native type contracts**

Update `lib/types.ts` so it includes:

```ts
export type WorkspaceMode = 'creator' | 'smb';

export type WorkflowKind =
  | 'generate'
  | 'rewrite'
  | 'weekly'
  | 'competitor'
  | 'hotspot'
  | 'titles'
  | 'cta'
  | 'live_clip'
  | 'image_note'
  | 'ad_variants'
  | 'multiplatform';

export type AIGCAgentId =
  | 'orchestrator'
  | 'brief'
  | 'viral_ref'
  | 'scene'
  | 'script'
  | 'shot'
  | 'prompt'
  | 'platform'
  | 'compliance'
  | 'review';

export type AgentEvent = {
  id: string;
  agentId: AIGCAgentId;
  agentName: string;
  status: 'pending' | 'running' | 'success' | 'warning' | 'blocked';
  action: string;
  output?: string;
};

export type AIGCSkill = {
  id: WorkflowKind;
  tier: 'P0' | 'P1';
  title: string;
  description: string;
  command: string;
  agentIds: AIGCAgentId[];
  outputFiles: string[];
};

export type MissionAsset = {
  id: string;
  type: 'brief' | 'reference' | 'scene' | 'script' | 'shot' | 'prompt' | 'copy' | 'compliance' | 'calendar';
  title: string;
  status: 'draft' | 'ready' | 'warning' | 'blocked';
  filePath: string;
  summary: string;
};
```

Keep the existing `WorkspaceFile`, `WorkspaceSnapshot`, `AgentMessage`, `ToolEvent`, `PatchOperation`, `ComplianceCheck`, `PreviewScene`, `PreviewState`, `AgentRunRequest`, and `AgentRunResponse` definitions, but add:

```ts
agentEvents: AgentEvent[];
assets: MissionAsset[];
```

to `AgentRunResponse`.

- [ ] **Step 2: Run typecheck and expect failures in callers**

Run: `npm run typecheck`

Expected: FAIL because provider code does not yet return `agentEvents` and `assets`.

## Task 2: Seed AI Native Workspace

**Files:**
- Modify: `lib/defaultWorkspace.ts`

- [ ] **Step 1: Add first-version AIGC files**

Update default workspace files so every new project includes:

- `profile.json`
- `brief.json`
- `viral_refs.json`
- `campaign_goal.json`
- `scenes.json`
- `script.md`
- `storyboard.json`
- `asset_prompts.json`
- `publish_copy.json`
- `platform_rules.json`
- `asset_library.json`
- `compliance_report.json`
- `.aigc/MEMORY.md`

Use the Bali family-trip / AIGC content workbench example for creator mode and a local small-business content example for SMB mode.

- [ ] **Step 2: Preserve legacy compatibility**

Keep `.videoagent/MEMORY.md` out of the new default. The new canonical memory path is `.aigc/MEMORY.md`. `safeLoadWorkspace` in `app/page.tsx` will migrate old localStorage by creating a new default workspace when required files are missing.

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`

Expected: still FAIL until provider and UI are updated.

## Task 3: Add Workspace Helpers, P0 Skills, And P1 Templates

**Files:**
- Modify: `lib/workspace.ts`

- [ ] **Step 1: Add agent roster**

Add `agentRoster` with 10 agents:

- Orchestrator
- Brief Agent
- Viral Reference Agent
- Scene Agent
- Script Agent
- Shot Agent
- Prompt Agent
- Platform Agent
- Compliance Agent
- Review Agent

Each agent must include `id`, `name`, `role`, `description`, and `accent`.

- [ ] **Step 2: Add P0 and P1 skills**

Add:

```ts
export const p0Skills: AIGCSkill[] = [...]
export const p1Skills: AIGCSkill[] = [...]
export const allSkills = [...p0Skills, ...p1Skills];
```

P0 skills:

- 品牌理解
- 爆款拆解
- 选题生成
- 场景拆解
- 脚本生成
- 分镜生成
- 素材提示词
- 平台适配
- 合规检查
- 审批写入

P1 templates:

- 旧稿爆改
- 竞品内容拆解
- 热点追踪
- 批量生成标题
- 评论区引流 CTA
- 直播切片脚本
- 图文笔记生成
- 广告素材变体
- 多平台一键改写
- 内容日历

- [ ] **Step 3: Add helper functions**

Add helper functions:

- `getSkillByWorkflow(workflow: WorkflowKind)`
- `contextStack(workspace: WorkspaceSnapshot)`
- `missionAssetsFromWorkspace(workspace: WorkspaceSnapshot)`
- `sceneAssets(workspace: WorkspaceSnapshot)`
- `agentStatusClass(status: AgentEvent['status'])`
- `assetStatusLabel(status: MissionAsset['status'])`
- expand `statusLabel`, `workflowLabel`, and `fileBadge` for all new workflow and file types.

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`

Expected: still FAIL until provider and UI are updated.

## Task 4: Update Agent Provider Contract And Mock Runtime

**Files:**
- Modify: `lib/agentProvider.ts`

- [ ] **Step 1: Update JSON guard and prompt**

Update `JSON_GUARD` so live providers may return:

- `agentEvents`
- `assets`
- existing `toolEvents`
- existing `patchOperations`
- existing `preview`
- existing `complianceChecks`

Update `buildPrompt` to describe:

- Mission;
- Context Stack;
- P0/P1 AIGC skills;
- required workspace files;
- no real publishing or video rendering claim.

- [ ] **Step 2: Normalize missing fields**

Update `normalizeResponse` so missing live fields are safe:

- If `agentEvents` is absent, synthesize a default Orchestrator/Script/Compliance run.
- If `assets` is absent, synthesize assets from patch operations and preview scenes.

- [ ] **Step 3: Update mockPatch**

Make mock mode generate:

- complete-file patches for `brief.json`, `viral_refs.json`, `scenes.json`, `script.md`, `storyboard.json`, `asset_prompts.json`, `publish_copy.json`, `compliance_report.json`, `.aigc/MEMORY.md`;
- `agentEvents` showing the 10-agent runtime;
- `assets` showing brief, refs, scenes, script, shots, prompts, copy, compliance;
- P1-specific behavior based on workflow.

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`

Expected: FAIL only if UI still references removed/changed helpers. Otherwise PASS is acceptable.

## Task 5: Replace Page With AI Native Mission Control

**Files:**
- Replace: `app/page.tsx`

- [ ] **Step 1: Replace layout state**

Use these key states:

- `workspace`
- `messages`
- `instruction`
- `workflow`
- `selectedSceneId`
- `selectedAssetId`
- `activePanel`
- `lastRun`
- `loading`
- `health`
- `handledPatchIds`
- `error`

- [ ] **Step 2: Render four-zone layout**

Render:

- compact left rail;
- context sidebar;
- main mission surface;
- right output inspector.

The default screen must show P0/P1 capabilities without requiring a first run.

- [ ] **Step 3: Add P0/P1 interactions**

Interactions:

- clicking a P0 skill loads its command into the composer;
- clicking a P1 template loads and runs the associated workflow;
- running a mission calls `/api/agent/run`;
- selecting a scene changes the inspector;
- selecting an asset changes the file preview;
- approve all writes pending patches;
- reject all marks pending patches handled.

- [ ] **Step 4: Preserve localStorage**

Use the same storage keys:

- `videoagent-code-online-workspace`
- `videoagent-code-online-messages`

Migrate old workspaces by creating a fresh default workspace when `.aigc/MEMORY.md` or `scenes.json` is missing.

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`

Expected: PASS after TypeScript fixes.

## Task 6: Replace CSS With AI Native Visual System

**Files:**
- Replace: `app/globals.css`

- [ ] **Step 1: Implement light operational theme**

Use the approved visual direction:

- light neutral base;
- compact rail;
- context sidebar;
- main mission surface;
- right inspector;
- green/dark active AI accents;
- restrained cards;
- no dark terminal-dominant UI;
- no purple AI SaaS gradients.

- [ ] **Step 2: Implement responsive layout**

Breakpoints:

- desktop: rail + context + main + inspector;
- medium: hide inspector first;
- tablet: hide context sidebar;
- mobile: single-column main with compact rail hidden or horizontal.

- [ ] **Step 3: Run build**

Run: `npm run build`

Expected: PASS.

## Task 7: Browser Smoke Test

**Files:**
- No code edits unless failures are found.

- [ ] **Step 1: Start dev server**

Run: `npm run dev -- -H 127.0.0.1`

Expected: local URL is `http://127.0.0.1:3000`.

- [ ] **Step 2: Verify HTTP**

Run:

```bash
curl -sS -o /tmp/videoagent-home.html -w "%{http_code} %{content_type}\n" http://127.0.0.1:3000/
curl -sS -o /tmp/videoagent-health.json -w "%{http_code} %{content_type}\n" http://127.0.0.1:3000/api/health
```

Expected:

- `/` returns `200 text/html`
- `/api/health` returns `200 application/json`

- [ ] **Step 3: Browser check**

Use the in-app browser to verify:

- page title renders;
- "AI Native AIGC" appears;
- P0 skills appear;
- P1 templates appear;
- running a P1 template shows agent events;
- approval card appears;
- approving patches updates the branch/version.

## Task 8: Completion

**Files:**
- No code edits.

- [ ] **Step 1: Final verification**

Run:

```bash
npm run typecheck
npm run build
```

Expected: both PASS.

- [ ] **Step 2: Report changed files and remaining limits**

Report:

- implementation files changed;
- verification commands;
- local URL;
- that P0 is implemented as first-class runtime skills;
- that P1 is implemented as template workflows with mock/live provider compatibility;
- that P2 connectors remain out of scope.

