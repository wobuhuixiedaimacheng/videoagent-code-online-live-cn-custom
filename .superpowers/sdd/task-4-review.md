# Task 4 Final Re-Review

## Scope

Reviewed the refreshed Task 4 package, report, current implementation, and tests. The agreed two-stage boundary remains in force: empty Task 4 text-draft image URLs are intentional; Task 6 owns rendering and final image-reference confirmation.

## Critical

No findings.

## Important

No findings.

## Minor

No findings.

## Verified

- Model-originated character and scene patches now require stable IDs and the complete Task 4 text contract; incomplete patches are replaced by deterministic drafts: `lib/agentProvider.ts:1352-1394`.
- Storyboard fallback reads the exact-version-validated confirmed `scenes.json`, preserves all scene IDs/content, derives positive durations, and fails closed for unusable source structure: `lib/agentProvider.ts:1026-1044`, `lib/agentProvider.ts:1397-1411`.
- A model response cannot bypass that fail-closed source check because `storyboardFor()` is evaluated for the stage fallback argument before `ensureValidPatch()` decides whether the model patch is usable.
- Previous fixes remain intact: stage requests bypass `AGENT_LOOP`, source versions are exact-checked, model prompts are source-scoped, stage patches are allowlisted/deduplicated, the five-variant/twelve-expression fallback remains present, and 12 confirmed storyboard shots yield 12 video prompts and queue entries.

## Verification

- `node --test lib/stageGeneration.test.cjs lib/agentProvider.language.test.cjs`: 23 passed, 0 failed.
- `node --test lib/productionAssets.test.cjs lib/productionFlow.test.cjs`: 27 passed, 0 failed.
- `npm run typecheck`: passed.
- Broader `node --test lib/*.test.cjs`: 65 passed, 0 failed.
