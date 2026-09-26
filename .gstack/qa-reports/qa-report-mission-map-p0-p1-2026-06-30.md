# Mission Map P0/P1 QA Report

Date: 2026-06-30
URL: http://127.0.0.1:3000/

## Scope

- P0: OiiOii-like production workbench, Mission Map, stage navigation, current-node inspector.
- P1: node-level revision flow and selected-node patch queue.

## Result

- Initial P1 browser test failed: submitting a character-node revision jumped the UI to the script node and surfaced a `script.md` patch.
- Fixed `app/page.tsx` so node revisions use node-scoped instructions, filter returned patches through `patchTouchesNode()`, and keep the selected node active after the response.
- Re-ran browser QA under `VIDEOAGENT_FORCE_MOCK=true` to avoid calling the configured online model.
- Restored the normal dev server afterward; `/api/model-config` shows `forceMock=false` and `selectedProvider=custom`.

## Browser QA

- P0: Three-zone workbench rendered: assistant, production canvas, current-node inspector.
- P0: Mission Map rendered 6 nodes.
- P0: Stage tabs `总览 / 剧本 / 角色 / 场景 / 分镜 / 视频` were visible.
- P0: Clicking `剧本 / 角色 / 场景 / 分镜 / 视频` updated the current-node inspector to the matching label and file path.
- P0: Desktop viewport had no document-level horizontal overflow.
- P1: Submitted a revision from the `角色` node.
- P1: UI stayed on `角色`.
- P1: Current-node patch queue showed exactly the target node patch: `asset_prompts.json`.
- P1: No `script.md` node patch was surfaced after the character-node revision.
- Browser console errors: 0.

## Screenshots

- P0 workbench: `.gstack/qa-reports/screenshots/p0-workbench.png`
- P1 before fix failure: `.gstack/qa-reports/screenshots/p1-node-revision-current.png`
- P1 fixed node revision: `.gstack/qa-reports/screenshots/p1-node-revision-fixed.png`

## Commands

- `npm run typecheck` passed.
- `node --test app/page.model-config-ui.test.cjs` passed: 19/19.
- `npm run build` passed.

## Notes

- P1 submit was tested with mock provider intentionally. The configured provider is custom/Agnes; using mock avoided unnecessary model cost while still exercising the browser UI, API response handling, patch filtering, and node selection behavior.
