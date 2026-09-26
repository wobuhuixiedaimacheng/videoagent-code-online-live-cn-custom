# Task 8 Report: Video Task Final Confirmation And Per-Shot State

## Scope

Changed only Task 8 files, the permitted video route/test, and this report:

- `lib/videoRenderBatch.ts`
- `lib/videoRenderBatch.test.cjs`
- `components/runtime.tsx`
- `app/page.tsx`
- `app/page.model-config-ui.test.cjs`
- `app/api/video/render/route.ts`
- `app/api/video/render/route.test.cjs`

## Delivered

- Added pure batch helpers for stable video-only job creation, immutable updates, failed-only retry selection, ready-job selection, and batch status.
- Removed `videoRender` React state as a source of truth. `production_flow.json.videoJobs` now owns persisted video job state and restores after refresh.
- Replaced the single-task handoff with per-video-shot cards showing reference images, full prompt editing, duration, mode, missing references, job state/progress/error, and completed-video preview.
- Per-shot prompt edit, reference upload, and reprepare write only `asset_prompts.json` pending patches. Each invalidates old video jobs and produces a new `ready_for_review` video draft.
- Added the sole final-confirmation path `confirmVideoTasksAndStartRendering`: validates ready stage, video prompts, and reference dependencies; consumes the video patch through `confirmStageInWorkspace`; persists all jobs as `rendering`; then submits at concurrency two.
- Added failed-only retry. Completed URLs and attempts remain untouched; retried jobs increment their attempt.
- Added one token-guarded batch polling timer for all submitted/polling jobs. Stale runs cannot write into a later batch, and unmount clears the timer.
- A completed batch remains in video-stage `rendering` with `clips_ready` semantics and the exact message: `全部片段已完成，等待合成为单一成片文件。`
- Generic approval is now a defense-in-depth boundary: video-stage patches are filtered out of every `ApprovalQueue`, direct generic approval rejects them, and generic stage confirmation rejects `video`. The patch remains pending for the video handoff and its one final-confirmation button.
- Restored workspaces resume exactly one token-guarded polling batch when persisted jobs are `submitted`/`polling` and have provider task IDs. A stable recovery key suppresses rerender duplicates; batch replacement and unmount invalidate stale callbacks.
- Route and client normalize successful aliases (`completed`, `succeeded`, `success`, `done`) and failure aliases (`failed`, `failure`, `error`, `rejected`, `cancelled`, `canceled`, `aborted`). A successful terminal response without `videoUrl` is failed immediately.
- Video-task preparation and per-shot edits are disabled while jobs submit or poll, and their function paths independently reject mutation while active jobs exist.
- The final polling attempt records whether each GET result remains pending, then times out only those IDs. A terminal `completed` or `failed` result from that same round cannot be overwritten by the timeout write.
- Recovery identity is derived from the project plus every batch job's stable `id@attempt`, not just the currently resumable subset. Completing one job therefore preserves the remaining job's batch identity; retrying changes its attempt and starts a new identity.
- Synchronous POST results use a pure submission finalizer: `completed` plus `videoUrl` remains completed with no provider task ID or error; only a still-`submitted` result requires that ID.
- On a true post-refresh recovery only, interrupted jobs are normalized atomically to `failed`: confirmed-batch `ready`, plus `submitting`/`submitted`/`polling` jobs without a provider task ID. Their error is `提交中断且没有可恢复任务 ID，请核对后重试`; jobs already `completed` or `submitted` with an ID are preserved. This path never POSTs automatically, and it is skipped while `videoSubmissionInFlightRef` is true.
- No external model was called during verification.

## Contract Evidence

- Before final confirmation, no UI path submits `/api/video/render`.
- Static page contract asserts exactly two video-render POST call sites: final confirmation and failed-job retry.
- Static page contract enumerates every `ApprovalQueue` binding and proves each receives a video-filtered patch list; no video inspector `合并` action is rendered.
- Route tests exercise every required terminal alias and the terminal-success-without-URL failure path.
- Pure batch tests execute the final-attempt timeout selection for one completed job and for a completed-plus-pending batch; they also execute recovery-key stability across a terminal update and change-on-retry behavior.
- Pure submission tests execute `completed` without a provider ID, `submitted` without a provider ID, and provider-reported `failed` results.
- A pure restoration test executes selection of `ready`, `submitting`/`submitted`/`polling` without IDs and proves that `submitted` with an ID plus `completed` are excluded; the user-visible result is explicit failed-only retry rather than automatic re-submission.
- No reachable `videoRender` React state, `VideoRenderState`, or legacy `submitVideoRender` function remains.

## Verification

Passed on 2026-07-11:

```text
node --test
155 passed, 0 failed

npm run typecheck
exit 0

curl -I 'http://localhost:3010/?demo=xiaopeng-v2'
HTTP/1.1 200 OK

GET /api/demo-workspace/xiaopeng-v2
ok=true, workspace title returned
```

Local page: `http://localhost:3010/?demo=xiaopeng-v2`
