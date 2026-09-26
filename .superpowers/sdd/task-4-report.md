# Task 4 Report: Agent Single-Stage Generation

## Scope

Implemented only the Task 4 files:

- `lib/stageGeneration.ts`
- `lib/stageGeneration.test.cjs`
- `lib/types.ts`
- `lib/agentProvider.ts`
- `lib/agentProvider.language.test.cjs`
- this report

No commit was created because this directory is not a Git repository.

## Implementation

- Added a fixed `STAGE_CONFIG` mapping. `productionStage` takes precedence over workflow inference, so stage selection never depends on button wording or user text.
- Added `productionStage`, `generationJobId`, and `sourceVersions` to `AgentRunRequest`.
- Added stage instruction, output-patch filtering, production-stage file detection, and confirmed-upstream source-version extraction.
- Scoped model normalization and deterministic local fallback to the current stage's allowlist.
- Added deterministic `characters.json` generation with a required role, age variants, wardrobe, Face ID/reference strategy, expression range, image prompts, and avoidance guidance.
- Added scene fields for location, time, lighting, palette, character IDs, script segment, and main-image prompt.
- Made video task-package fallback use only the confirmed script/characters/scenes/storyboard inputs for the video stage. The package records `confirmedSourceVersions` and input summary; it prefers confirmed storyboard scenes and does not manufacture upstream content from the video-stage instruction.
- Added `characters.json` and `production_flow.json` to canonical provider files.

## TDD Evidence

### RED 1

Command:

```bash
env -u ANTHROPIC_API_KEY -u OPENAI_API_KEY -u CUSTOM_API_KEY -u DEFAULT_PROVIDER -u CUSTOM_BASE_URL -u OPENAI_BASE_URL \
  node --test lib/stageGeneration.test.cjs lib/agentProvider.language.test.cjs
```

Result: failed as expected before implementation. `stageGeneration.ts` was missing, the provider had no stage instruction metadata, character fallback returned 12 cross-stage patches instead of `characters.json`, and video fallback returned the entire production package instead of the two allowed files.

### GREEN 1

The same command passed after stage configuration, request metadata, output filtering, and scoped fallback implementation: 9 tests passed, 0 failed.

### RED 2

Strengthened the video test to require `confirmedSourceInputs.scriptExcerpt` and storyboard summary. The same command failed because the task package recorded versions but did not yet expose the confirmed script input.

### GREEN 2

Updated video fallback to consume and record confirmed script/characters/scenes/storyboard input. The same command passed: 9 tests passed, 0 failed.

## Final Verification

```bash
env -u ANTHROPIC_API_KEY -u OPENAI_API_KEY -u CUSTOM_API_KEY -u DEFAULT_PROVIDER -u CUSTOM_BASE_URL -u OPENAI_BASE_URL \
  node --test lib/stageGeneration.test.cjs lib/agentProvider.language.test.cjs
# 9 passed, 0 failed

node --test lib/productionAssets.test.cjs lib/productionFlow.test.cjs
# 27 passed, 0 failed

npm run typecheck
# tsc --noEmit exited 0
```

## Final Re-Review Fixes

- Model-originated `characters.json` now requires stable `id`/`name`/`role`, `description`, Face ID and reference strategy fields, full expression metadata, image prompt, and complete variant text metadata. Empty `primaryImageUrl` remains valid for the Task 6 image-generation handoff.
- Model-originated `scenes.json` now requires stable `id`/`title`/`visual`, scene environment fields, nonempty character IDs, script segment, and both main-image and generation prompts. Empty `referenceImageUrl` remains valid for the same handoff boundary.
- `storyboardFor()` now reads only the exact-version-validated confirmed `scenes.json` during the storyboard stage. It preserves all source scene IDs, title, visual, subtitle, script association, and positive duration. Empty or structurally incomplete confirmed scenes fail closed with `confirmed scenes.json is unusable for storyboard generation`.

## Final Re-Review TDD

### RED 4

Added ID-less and key-field-missing model patch tests for characters and scenes, plus a 12-confirmed-scene storyboard test. The first run failed because the shallow validators accepted those model patches and storyboard fallback replaced 12 confirmed scenes with five generic shots.

### GREEN 4

After tightening the textual validators and rebuilding storyboard fallback from confirmed scenes, all new regressions passed. The existing 12-shot video task test remains green after the storyboard preservation test.

## Final Re-Review Verification

```bash
env -u ANTHROPIC_API_KEY -u OPENAI_API_KEY -u CUSTOM_API_KEY -u DEFAULT_PROVIDER -u CUSTOM_BASE_URL -u OPENAI_BASE_URL -u AGENT_LOOP -u VIDEOAGENT_FORCE_MOCK -u DEMO_MODE \
  node --test lib/stageGeneration.test.cjs lib/agentProvider.language.test.cjs
# 23 passed, 0 failed

node --test lib/productionAssets.test.cjs lib/productionFlow.test.cjs
# 27 passed, 0 failed

npm run typecheck
# tsc --noEmit exited 0
```

## Risks And Boundaries

- No real external model request was made, by requirement. Model-path behavior is constrained by `normalizeResponse`; local fallback is exercised by the tests.
- `sourceVersions` remains caller-supplied metadata. The production-flow caller must invoke the agent with the confirmed workspace snapshot and versions; this Task 4 scope does not change the flow/UI invocation site.
- With an empty confirmed `scenes.json` and `storyboard.json`, the video fallback intentionally returns an empty render queue rather than inventing unconfirmed shots. The task package and specification are still emitted for review.

## Review Fixes

### Provider And Input Boundary

- `runVideoAgent()` now validates every expected stage source before selecting mock, model, or loop behavior. Required source files must exist and their workspace versions must exactly equal `req.sourceVersions`; unexpected source-version keys also fail closed.
- `AGENT_LOOP=1` now applies only to non-`productionStage` requests. Stage requests continue through the normal provider/mock path, where fixed allowlists and structural validation apply.
- `compactWorkspace()` sends a stage request only its confirmed upstream inputs. Video sends only `script.md`, `characters.json`, `scenes.json`, and `storyboard.json`; pending patches and downstream artifacts are excluded.

### Output Integrity

- Model patches are filtered by stage and deduplicated by `filePath`; the final occurrence is retained before validation.
- Character and scene drafts are treated as Task 6-pre-image-generation text drafts. Empty `primaryImageUrl` / `referenceImageUrl` remains intentional, while required generation-ready text fields are enforced. Task 4 does not claim these drafts pass the final image-reference confirmation gate.
- Invalid model character/scene structures are replaced with deterministic drafts. Storyboard drafts require a positive `durationSeconds` for every shot and the fallback now passes the canonical storyboard validator.
- Video-stage task validation requires exactly one video prompt and one render-queue item per confirmed storyboard scene. Stage video fallback no longer truncates at five scenes and uses `type: "video"` for every confirmed shot.
- Character fallback recognizes the full kindergarten-to-college script timeline and emits five matching age variants. It now includes the twelve required reviewable expression IDs.

## Review TDD Evidence

### RED 3

Expanded the stage tests for loop bypass, strict source-version failure, model prompt input filtering, duplicate model patches, image-generation-ready text drafts, storyboard duration, and 12-scene video recovery.

The first run failed 9 new assertions: stage requests still entered `AGENT_LOOP`, version mismatches called the provider/fallback, model prompts serialized pending/downstream files, duplicate patches remained, school-stage variants and expression coverage were incomplete, shallow scene validation accepted invalid model output, storyboard durations were absent, and video generation returned only five tasks.

### GREEN 3

After the provider-boundary and structural-output fixes, the stage/language suite passed 20 tests with 0 failures. Model-path coverage uses a local `fetch` stub; no real external request was issued.

## Review Final Verification

```bash
env -u ANTHROPIC_API_KEY -u OPENAI_API_KEY -u CUSTOM_API_KEY -u DEFAULT_PROVIDER -u CUSTOM_BASE_URL -u OPENAI_BASE_URL -u AGENT_LOOP -u VIDEOAGENT_FORCE_MOCK -u DEMO_MODE \
  node --test lib/stageGeneration.test.cjs lib/agentProvider.language.test.cjs
# 20 passed, 0 failed

node --test lib/productionAssets.test.cjs lib/productionFlow.test.cjs
# 27 passed, 0 failed

npm run typecheck
# tsc --noEmit exited 0
```
