# VideoAgent Full Flow QA Report

Date: 2026-07-01
URL: http://127.0.0.1:3000/

## Scope

End-to-end browser QA from blank Mission to generated production package, patch approval, node-level revision, asset library approval, dependency-stale behavior, and mobile layout.

The agent-generation part was run under `VIDEOAGENT_FORCE_MOCK=true` to avoid spending the configured custom/Agnes provider during QA. After the test, the dev server was restored to normal mode; `/api/model-config` returned `forceMock=false` and `selectedProvider=custom`.

## Flow Covered

- Cleared existing `videoagent-*` browser storage and loaded the blank home state.
- Entered a realistic Mission: a 45-second vertical short video for a local coffee roaster.
- Submitted the Mission through the visible composer.
- Confirmed the production workbench opened and showed `12 待审`.
- Confirmed generated state exposed a current-node patch and `合并全部 12`.
- Clicked `合并全部 12`.
- Confirmed core files were written into workspace: `brief.json`, `script.md`, `scenes.json`, `storyboard.json`, `timeline.json`, `asset_prompts.json`, `publish_copy.json`, `compliance_report.json`, `feedback_report.json`, `.aigc/MEMORY.md`, `viral_refs.json`, `video_spec.json`.
- Clicked every stage tab and verified the current-node inspector pointed to the matching file.
- Submitted a `角色` node revision.
- Confirmed the UI stayed on `角色` and the current-node patch was only `asset_prompts.json`.
- Merged the character patch.
- Proposed `剧本` into the asset library.
- Confirmed `asset_library.json` appeared as a pending approval patch.
- Merged the asset-library patch and confirmed the script node became `当前节点已入库`.
- Submitted a `剧本` node revision.
- Confirmed only `script.md` was in the current-node patch queue.
- Confirmed downstream nodes became stale after the script patch: `角色`, `场景`, `分镜`, `视频`.
- Checked 390px mobile viewport for page-level horizontal overflow.
- Restored normal dev server and confirmed normal page load without submitting another generation request.

## Screenshots

- Blank state: `.gstack/qa-reports/screenshots/full-flow-00-blank.png`
- Generated patch state: `.gstack/qa-reports/screenshots/full-flow-01-generated-patches.png`
- After merge all: `.gstack/qa-reports/screenshots/full-flow-02-after-merge-all.png`
- Character node patch: `.gstack/qa-reports/screenshots/full-flow-03-character-node-patch.png`
- Character patch merged: `.gstack/qa-reports/screenshots/full-flow-04-character-patch-merged.png`
- Asset-library patch: `.gstack/qa-reports/screenshots/full-flow-05-library-patch.png`
- Asset-library merged: `.gstack/qa-reports/screenshots/full-flow-06-library-merged.png`
- Script patch causing stale downstream nodes: `.gstack/qa-reports/screenshots/full-flow-07-script-patch-stales-downstream.png`
- Mobile viewport: `.gstack/qa-reports/screenshots/full-flow-08-mobile.png`

## Verification

- Browser console errors during full-flow QA: 0.
- Desktop document overflow: none.
- 390px mobile document overflow: none.
- `npm run typecheck` passed.
- `node --test app/page.model-config-ui.test.cjs` passed: 19/19.
- `npm run build` passed.
- Final normal-mode health check: `GET /` returned 200 and `/api/model-config` returned `forceMock=false`, `selectedProvider=custom`.

## Important Boundary

Video render submission was not clicked. The full-flow test verified generation-task handoff and render task preparation, but did not call the external video render provider. That is intentional: render submission can spend provider quota and should be tested only when explicitly approved.

## QA Note

The first automated assertion expected all 12 patch file names to be visible in the local current-node patch panel. That was too strict: the UI intentionally shows only the selected node's patch there, while the global action appears as `合并全部 12`. The flow still proved all files were created by merging all patches and inspecting the workspace file list afterward.
