# Task 1 Report: 持久化阶段状态机

## Status

Completed. Commits: none (not a Git repository).

## Implementation

- Added stable production-flow types in `lib/types.ts`: the five stage IDs, all required statuses, per-stage record, persisted flow, and render-job type.
- Added `lib/productionFlow.ts` as the sole pure transition surface. It exports the required path, stage order, confirmation input, visibility/navigation helpers, generation lifecycle transitions, draft invalidation, confirmation, and workspace read/write helpers.
- Confirmation checks its existing confirmation key before status/version validation, records the frozen draft metadata, and starts only the direct downstream stage. A same job/source generation request is idempotent; completion rejects a mismatched job or source-version set.
- Workspace restore revalidates confirmed canonical assets: `script.md`, `characters.json`, `scenes.json`, `storyboard.json`, and `asset_prompts.json`. Missing files or invalid JSON fail the affected confirmed stage and mark every downstream stage stale.
- Added the required explicit CJS fixtures and six Node tests. The TypeScript loader uses `typescript.transpileModule` plus `vm`; the visible-stage assertion converts the sandbox array with `Array.from` before strict comparison.

## Files Changed

- `lib/types.ts`
- `lib/productionFlow.ts`
- `lib/productionFlow.test.cjs`
- `lib/testFixtures.cjs`

## RED

Command:

```sh
node --test lib/productionFlow.test.cjs
```

Output before implementation:

```text
# tests 6
# pass 0
# fail 6
# cancelled 0
# skipped 0
```

Each test failed with the expected assertion: `productionFlow.ts should exist` (`false !== true`).

## GREEN

Command:

```sh
node --test lib/productionFlow.test.cjs
```

Output after implementation:

```text
# tests 6
# pass 6
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

Additional verification:

```sh
npm run typecheck
```

Output: exited 0 (`tsc --noEmit`).

## Self-Review

- All required exports and exact type shapes are present.
- The six required behavior tests cover initial locking, direct-downstream confirmation, stale propagation, confirmation-key idempotency, draft-version rejection, late generation-result rejection, and persisted confirmed-asset downgrade.
- Transition functions clone the flow before mutation, except explicit idempotent or rejected operations that return the input unchanged.
- No UI, provider, design specification, implementation plan, or unrelated application files were edited.
- The checkout has no `.git` directory, so no commit was attempted.

## Concerns

- Non-blocking coverage gap: the task's fixed six-test suite does not directly exercise `writeProductionFlow`, `updateProductionFlow`, malformed `production_flow.json`, or invalid JSON for non-script canonical assets. Their implementation is typechecked, but those branches have no dedicated behavioral test in this task.

## Fix Round

### Reviewer Findings Fixed

- `failStageGeneration` now returns the unchanged flow unless the target record is still `generating` and carries the matching active job ID. A completed draft can no longer be changed to `failed` by a late callback.
- `markStageDraft` now accepts either a confirmed-stage revision or an active generation callback whose job ID and `sourceVersions` exactly match the current record. Stale generation input returns the original flow.
- `beginStageGeneration` now rejects a locked non-initial stage unless its direct predecessor is `confirmed`. Generation retries, confirmed-stage revisions, the initial script, and matching in-progress idempotent requests remain valid.
- Added the three required regression tests. The existing late-completion test now starts from `readyFlow('character', 1)` so its setup satisfies the new predecessor-confirmation invariant and continues to isolate late-result handling.

### RED

Command:

```sh
node --test lib/productionFlow.test.cjs
```

Output after adding the three regression tests and before the fix:

```text
# tests 9
# pass 6
# fail 3
```

The failures reproduced: a completed draft became `failed` after a late failure, an old job changed an active draft, and a locked `scene` generation did not throw.

### GREEN

Command:

```sh
node --test lib/productionFlow.test.cjs
```

Output after the fix:

```text
# tests 9
# pass 9
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

Type check:

```sh
npm run typecheck
```

Output: exited 0 (`tsc --noEmit`).

### Fix-Round Self-Review

- All nine focused state-machine tests pass with the locking guard enabled.
- The active-job/source comparison is shared with completion logic, avoiding separate equality semantics for stale callbacks.
- The direct-predecessor rule is enforced before any state mutation, and rejected transitions return or throw without changing the input flow.
- No files outside the assigned four implementation/test files and this required report append were edited. Commits: none (not a Git repository).

## Second Fix Round

### Reviewer Findings Fixed

- Removed the confirmed-stage exception from `markStageDraft`. It now accepts only a matching active `generating` record, so a revision must first call `beginStageGeneration` with its new job ID and source versions.
- Updated the upstream-revision test to follow that required `beginStageGeneration` then `markStageDraft` sequence.
- Added the confirmed-stage late-callback no-op regression test.
- Moved the predecessor-confirmation check in `beginStageGeneration` from the `locked` branch to every non-`script`, non-idempotent start. A stale stage therefore cannot bypass the direct-predecessor confirmation gate.
- Added the stale-stage bypass regression test.

### RED

Command:

```sh
node --test lib/productionFlow.test.cjs
```

Output after adding the two new regression tests and before the fix:

```text
# tests 11
# pass 9
# fail 2
```

The confirmed-stage late callback changed the flow into a draft, and a stale `scene` started despite its unconfirmed `character` predecessor.

### GREEN

Command:

```sh
node --test lib/productionFlow.test.cjs
```

Output after the fix:

```text
# tests 11
# pass 11
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

Type check:

```sh
npm run typecheck
```

Output: exited 0 (`tsc --noEmit`).

### Second Fix-Round Self-Review

- All non-script non-idempotent starts require a confirmed direct predecessor; the initial script and matching in-progress idempotent calls remain available.
- A confirmed-stage revision is only reachable through the persisted active generation record, eliminating direct or late-callback draft transitions.
- The 11-test suite exercises both reviewed bypasses. No files outside the assigned four implementation/test files and this required report append were edited. Commits: none (not a Git repository).

## Third Fix Round

### Regression Added

- Added `marking a draft rejects changed sources even when the job id matches`. It starts a valid character generation, calls `markStageDraft` with the same job ID but `script.md` version `2` instead of `1`, and asserts the flow remains unchanged.
- No production logic changed: `markStageDraft` already requires `sameSourceVersions(current.sourceVersions, input.sourceVersions)` alongside the active `generating` status and matching job ID.

### Test Evidence

Command:

```sh
node --test lib/productionFlow.test.cjs
```

First run after adding the regression test:

```text
# tests 12
# pass 12
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

Type check:

```sh
npm run typecheck
```

Output: exited 0 (`tsc --noEmit`).

### Third Fix-Round Self-Review

- The new regression covers the independent source-version half of the active-callback identity check; the preceding test covers the job-ID half.
- No production logic change was necessary or made.
- No files outside `lib/productionFlow.test.cjs` and this required report append were edited. Commits: none (not a Git repository).
