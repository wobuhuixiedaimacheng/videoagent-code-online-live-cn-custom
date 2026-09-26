# VideoAgent Creator SMB Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the existing demo into a C端创作者 + 小B商家 marketing short-video Agent workbench with three primary entries and one shared project workspace.

**Architecture:** Keep the current Next.js app and API route. Add richer workspace types, creator/small-business templates, structured workspace helpers, a task-aware agent prompt/mock generator, and a redesigned single-page workbench UI that still uses localStorage and patch approval.

**Tech Stack:** Next.js 14 App Router, React 18 client component, TypeScript strict mode, localStorage persistence, existing Anthropic/OpenAI/custom provider calls.

---

## File Structure

- Modify `lib/types.ts`: add workspace mode, workflow kind, richer preview, onboarding/profile/publish/asset file concepts.
- Modify `lib/defaultWorkspace.ts`: generate creator and SMB default project files.
- Create `lib/workspace.ts`: centralize IDs, dates, diff rows, patch application, labels, file helpers, and entry command helpers.
- Modify `lib/agentProvider.ts`: route instructions by workflow, include the unified file schema in prompts, normalize richer preview data, and upgrade mock output for all three entries.
- Replace `app/page.tsx`: use the new helpers, add mode switch, three primary entry cards, workflow pipeline, richer preview, and approval flow.
- Replace `app/globals.css`: update visual design for the new workbench while preserving responsive desktop/mobile use.
- Create `docs/superpowers/plans/2026-06-26-videoagent-creator-smb-workbench.md`: this plan.

## Task 1: Workspace Types And Defaults

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/defaultWorkspace.ts`

- [ ] **Step 1: Extend core types**

Add `WorkspaceMode`, `WorkflowKind`, richer `PreviewState`, and `AgentRunRequest.workflow`.

- [ ] **Step 2: Replace default workspace with creator/SMB templates**

Create `createDefaultWorkspace(mode?: WorkspaceMode)` that includes:

- `profile.json`
- `brief.json`
- `script.md`
- `storyboard.json`
- `asset_prompts.json`
- `publish_copy.json`
- `compliance_report.json`
- `.videoagent/MEMORY.md`

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`

Expected: existing app may fail until downstream files are updated in later tasks.

## Task 2: Workspace Helper Module

**Files:**
- Create: `lib/workspace.ts`
- Modify: `app/page.tsx`

- [ ] **Step 1: Move reusable UI/workspace logic**

Create helpers:

- `uid(prefix?: string)`
- `now()`
- `diffLines(before, after)`
- `applyPatchToWorkspace(workspace, patches, status)`
- `overallStatus(result)`
- label helpers for status, checks, files, tracks, workflows, modes
- `entryCommands(mode)`

- [ ] **Step 2: Keep patch semantics unchanged**

Patch approval must still update complete file content and increment versions.

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`

Expected: app may still fail until `app/page.tsx` is replaced.

## Task 3: Agent Provider Upgrade

**Files:**
- Modify: `lib/agentProvider.ts`

- [ ] **Step 1: Update prompt contract**

The prompt must instruct the model to operate on the unified files and support three workflows:

- `generate`
- `rewrite`
- `weekly`

- [ ] **Step 2: Normalize richer preview**

Support preview fields:

- `title`
- `subtitle`
- `cta`
- `durationSeconds`
- `timelineVersion`
- `platform`
- `mode`
- `workflow`
- `scenes`

- [ ] **Step 3: Upgrade mock behavior**

Mock mode must generate differentiated patches for:

- Generate from scratch.
- Rewrite existing content.
- Weekly content plan.

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`

Expected: remaining errors should only relate to `app/page.tsx` if any.

## Task 4: Workbench Page

**Files:**
- Replace: `app/page.tsx`

- [ ] **Step 1: Build state model**

Keep state for:

- workspace
- messages
- instruction
- workflow
- selected path
- last run
- loading
- health
- handled patch IDs
- error

- [ ] **Step 2: Add mode switch**

Switching mode resets to a default creator or SMB workspace and clears run state.

- [ ] **Step 3: Add three primary entries**

Show cards for:

- 从零生成
- 旧稿爆改
- 一周选题

Each card sets workflow, instruction, and runs the agent.

- [ ] **Step 4: Preserve Claude Code mechanics**

Keep:

- file tree
- messages
- plan
- tool events
- diff preview
- approve/reject
- selected file viewer

- [ ] **Step 5: Add pipeline and preview panels**

Show:

- workflow pipeline: Profile, Brief, Script, Storyboard, Assets, Publish, Compliance
- phone preview
- storyboard scene preview
- compliance summary

- [ ] **Step 6: Run typecheck**

Run: `npm run typecheck`

Expected: PASS.

## Task 5: Workbench Styling

**Files:**
- Replace: `app/globals.css`

- [ ] **Step 1: Style operational workbench**

Use restrained professional styling suitable for a repeated-use tool. Avoid a marketing landing page.

- [ ] **Step 2: Make desktop layout dense and readable**

Use a four-zone layout:

- topbar
- left sidebar
- center console
- right preview/file inspector

- [ ] **Step 3: Make mobile usable**

Collapse to a single-column flow under 900px. Hide nonessential side panels only when necessary.

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`

Expected: PASS.

## Task 6: Verification

**Files:**
- No new files unless fixes are needed.

- [ ] **Step 1: Install dependencies if missing**

Run: `npm install`

Expected: dependencies installed and `node_modules` present.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 3: Run production build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 4: Start dev server**

Run: `npm run dev`

Expected: local URL is available, usually `http://localhost:3000`.

- [ ] **Step 5: Manual smoke check**

Open the app and verify:

- creator mode loads
- SMB mode switch resets workspace
- each of the three entry cards runs in mock mode when no API key is configured
- approve writes patches
- reject leaves workspace unchanged
- selected file viewer updates

## Self-Review

Spec coverage:

- Three entries: Task 4.
- Creator and SMB defaults: Task 1 and Task 4.
- Unified workspace files: Task 1.
- Agent plan/tool/patch/compliance response: Task 3 and Task 4.
- Diff approval/rejection: Task 2 and Task 4.
- Secondary creative reuse: Task 3 mock and prompt.
- Weekly plan: Task 3 mock and prompt.
- Lightweight compliance: Task 1, Task 3, Task 4.
- Local persistence: Task 4.

Placeholder scan: no TBD/TODO placeholders are used as implementation requirements.

Type consistency: `WorkspaceMode`, `WorkflowKind`, and `PreviewState` are introduced before usage in provider and UI.
