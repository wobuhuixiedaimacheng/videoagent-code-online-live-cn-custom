# Task 6 Report: Reviewable Character and Scene Images

## RED

- Added failing lifecycle tests for `missingCharacterImageJobs`, `missingSceneImageJobs`, and `applyStageImageResult`.
- Confirmed the initial failure was the missing production APIs and page image-stage entry points.
- Added static page contracts for image rendering, bounded batches, reviewable persistence, scene actions, and image-only retry.

## GREEN

- `productionAssets` now builds only required-character primary-image jobs and missing core-scene jobs, preserves negative prompts, and applies results only to the target JSON file. Invalid JSON, empty URLs, and unknown IDs are no-ops.
- Character and scene generation is two-phase: text patches remain reviewable while the stage is `generating`; only an all-success image pass with no remaining required jobs reaches `ready_for_review`.
- Image requests use `POST /api/image/render` with exactly `{ prompt, negativePrompt }`, run in batches of at most two through `Promise.allSettled`, preserve successful URLs after failures, and reject stale job responses.
- Each fulfilled batch recomputes from the committed workspace plus persisted patches and replaces the latest pending `characters.json` or `scenes.json` patch with a complete before/after draft. Assets are not auto-confirmed.
- Failed character/scene nodes create a new image-only job and regenerate only missing images; they do not rerun the text Agent. Missing image-model configuration produces a stage failure with a recoverable reason.
- Character cards now read proposed `characters.json`; face anchor, reference strategy, expression choices, generated variants, and uploads write reviewable character patches. Scene cards show the generated image and required scene metadata, and support regenerate/upload replacement with persistent data URLs.
- Character and scene confirmation controls show the first validation reason and remain disabled while required images are missing.

## Verification

Passed:

```text
node --test lib/productionAssets.test.cjs lib/characterDesign.test.cjs app/page.model-config-ui.test.cjs lib/productionFlow.test.cjs lib/workspaceDrafts.test.cjs lib/stageGeneration.test.cjs
# 104 passed, 0 failed

npm run typecheck
# passed
```

The local development server is responding with HTTP 200 at `http://localhost:3000`.

## Residual Risk

- Tests verify lifecycle, state isolation, retry routing, and page contracts. They do not invoke a configured external image provider, so provider-specific image generation, upload size behavior in a browser, and visual layout with live assets still need an environment with a real image model.

## Review Fixes

- Approved scope expanded to `app/api/image/render/route.ts` and `app/api/image/render/route.test.cjs` so browser `negativePrompt` values are trimmed and forwarded upstream as non-empty `negative_prompt` fields.
- Manual character and scene mutations now abort the prior stage run, start a new generation job, append the one-file pending patch, and finalize through `markStageDraft`. Confirmed stages therefore become a new `ready_for_review` draft, increment their draft version, and stale downstream stages before normal confirmation consumes the patch.
- Every text, image-only retry, and manual image run now has a per-stage `AbortController` and token. A manual revision aborts its own and all downstream runs before drafting, so stale scene/storyboard/video callbacks cannot write after an upstream asset edit. Superseded runs stop before later image batches, and both fulfilled image persistence and manual writes verify the active token and generation job.
- Character expression persistence now uses the canonical twelve English IDs. `productionAssets` maps current producer Chinese labels and common synonyms at the schema boundary; the UI starts all twelve selected and writes canonical IDs only.
- Data-URL uploads are limited to 512 KiB. FileReader completion performs a conservative 3 MiB workspace budget preflight, pending-patch finalization rechecks the complete serialized workspace, and localStorage workspace writes catch quota failures with `工作区未持久化/请换小图` while retaining the prior saved snapshot.
- Added confirmed character/scene revision flow tests, stale-run and upload-order source contracts, Chinese-expression fixtures, core-scene parity coverage, and exact route payload assertions.

Review verification:

```text
node --test $(rg --files -g '*.test.cjs' -g '!node_modules/**' | sort)
# 130 passed, 0 failed

npm run typecheck
# passed

curl -fsS -o /dev/null -w '%{http_code}' http://localhost:3000
# 200
```

## Final Re-review Fix

- `regenerateCharacterDesign` now submits its deduplicated current portrait and Face ID anchor as `images: referenceImages`, together with the existing `prompt` and `negativePrompt`. The existing image route forwards non-empty images as `extra_body.image`, so portrait regeneration, multi-view generation, and expression-sheet generation now use the selected visual identity reference.
- Added a page request-body contract for `images: referenceImages`; the existing route image-to-image payload test remains green.

Final verification:

```text
node --test $(rg --files -g '*.test.cjs' -g '!node_modules/**' | sort)
# 131 passed, 0 failed

npm run typecheck
# passed

curl -fsS -o /dev/null -w '%{http_code}' http://localhost:3000
# 200
```
