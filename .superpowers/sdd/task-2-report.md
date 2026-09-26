# Task 2 Report: 持久化待审 Patch 并实现原子确认

## Status

Completed. This checkout is not a Git repository; no commit was attempted.

## Changed Files

- `lib/workspace.ts`
- `lib/workspaceDrafts.ts`
- `lib/workspaceDrafts.test.cjs`
- `app/page.tsx`
- `app/page.model-config-ui.test.cjs`
- `.superpowers/sdd/task-2-report.md`

## Implementation Summary

- Added `isInternalWorkspaceFile` and `upsertWorkspaceFile` to the workspace layer.
- Added `.aigc/pending_patches.json` persistence with the required read, save, append, preview, consume, and stage-confirm APIs. Newer drafts replace older drafts for the same `filePath`.
- `consumePendingPatches` applies only selected files and then rewrites the remaining internal draft file. `confirmStageInWorkspace` consumes stage assets and writes the next production-flow state into one returned workspace snapshot.
- The page now saves Agent and manual patches to the persisted draft file, reads pending patches from it for preview/review, consumes them on approval, and removes them on rejection.
- Empty workspaces add `production_flow.json`; internal files do not count as user assets. Stored workspace validation now requires a legal workspace shape, `.aigc/MEMORY.md`, and parseable `production_flow.json`, but no longer requires `scenes.json` or `timeline.json`.
- Workspace storage is isolated by project or Demo. A valid Demo-local snapshot is restored before the Demo API is requested; the visible `重置 Demo` action clears only that Demo snapshot and reloads it.
- Stage confirmation uses one functional `setWorkspace(current => ...)` call to apply stage drafts and write the updated flow atomically.

## RED Evidence

Command:

```sh
node --test lib/workspaceDrafts.test.cjs
```

Before implementation, all 5 tests failed as expected because `workspaceDrafts.ts` did not exist:

```text
# tests 5
# pass 0
# fail 5
workspaceDrafts.ts should define pending patch persistence
```

## GREEN Evidence

```sh
node --test lib/workspaceDrafts.test.cjs
```

```text
# tests 5
# pass 5
# fail 0
```

## Verification

```sh
node --test lib/workspaceDrafts.test.cjs lib/productionFlow.test.cjs
```

Result: passed, 17/17 tests.

```sh
node --test app/page.model-config-ui.test.cjs
```

Result: passed, 31/31 static page tests.

```sh
npm run typecheck
```

Result: exited 0 (`tsc --noEmit`).

## Risks / Unfinished Items

- None within Task 2 scope.
- No browser/device manual pass was run because the brief requires focused Node tests, static page tests, and type checking only.

## Review Fixes

### Important: Autopilot Authorization Boundary

- Added `autopilotPatchesForRun(workspace, currentRunPatches)`. It selects only low-risk persisted patches whose IDs were emitted by the current Agent run.
- The autopilot effect now uses that selector instead of every low-risk item in the persisted queue. Manual and historical drafts remain pending even when autopilot is enabled.
- Added `autopilot consumes only low-risk patches emitted by the current Agent run`. It saves one current Agent patch and one manual `requiresApproval: true` patch, consumes the autopilot selection, and verifies that the manual patch remains pending.

### Minor: Full Workspace Runtime Guard

- Added `isWorkspaceSnapshot` in `lib/workspace.ts`. It validates the complete top-level snapshot shape, `mode`, every `WorkflowKind`, compliance status, the `files` array, and each `WorkspaceFile` field including `path`, `kind`, `content`, `version`, and `updatedAt`.
- `readStoredWorkspace` now rejects values failing that guard before checking for `.aigc/MEMORY.md`, `production_flow.json`, and parseable flow content.
- Added a regression test that rejects an invalid mode, invalid workflow enum, and malformed file entry.

### Review RED

```sh
node --test lib/workspaceDrafts.test.cjs
```

Before the fix: 5 passed, 2 failed. The new failures were `autopilotPatchesForRun is not a function` and `isWorkspaceSnapshot is not a function`.

```sh
node --test app/page.model-config-ui.test.cjs
```

Before the fix: 31 passed, 2 failed. The new static assertions did not find the current-run autopilot selector or `isWorkspaceSnapshot` guard in `readStoredWorkspace`.

### Review GREEN / Final Verification

```sh
node --test lib/workspaceDrafts.test.cjs lib/productionFlow.test.cjs
```

Result: passed, 19/19 tests.

```sh
node --test app/page.model-config-ui.test.cjs
```

Result: passed, 33/33 static page tests.

```sh
npm run typecheck
```

Result: exited 0 (`tsc --noEmit`).
