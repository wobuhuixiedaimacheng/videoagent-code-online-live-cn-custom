# Mission Map P2/P3 QA Report

Date: 2026-06-30
URL: http://127.0.0.1:3000/

## Scope

- P2: dependency freshness on Mission Map nodes.
- P3: stable-node asset library proposal, approval, and merge flow.
- Regression: stage navigation, desktop/mobile overflow, console errors.

## Browser QA

- P2 seeded workspace with `script.md` newer than `asset_prompts.json`, `scenes.json`, `storyboard.json`, and `timeline.json`.
- Result: 6 Mission Map nodes rendered; 4 downstream nodes marked stale: character, scene, storyboard, video.
- Selected stale character node showed `依赖已过期` from `script.md`.
- Asset-library action was disabled for stale node and showed `当前节点暂不能入库`.
- P3 seeded stable workspace.
- Selected script node showed `当前节点可入库`.
- Clicking `提议入库` created an `asset_library.json` patch without writing directly.
- Approval panel showed current-node patch and `入库 patch 待审批`.
- Clicking `合并` wrote `asset_library.json` into local workspace and changed state to `当前节点已入库`.
- Stage tabs `总览 / 剧本 / 角色 / 场景 / 分镜 / 视频` were clickable and rendered meaningful main content.
- Desktop and 390px mobile viewports had no document-level horizontal overflow.
- Browser console errors: 0.

## Screenshots

- P2 stale selected: `.gstack/qa-reports/screenshots/p2-stale-selected.png`
- P3 pending library patch: `.gstack/qa-reports/screenshots/p3-library-pending.png`
- P3 merged library asset: `.gstack/qa-reports/screenshots/p3-library-merged.png`
- Mobile fixed layout: `.gstack/qa-reports/screenshots/mobile-mission-map-fixed.png`

## Fix Applied During QA

The first mobile screenshot exposed a layout defect: the stage topbar overflowed into Mission Map on 390px width. Fixed in `app/globals.css` by constraining the studio grid column to `minmax(0, 1fr)`, allowing the topbar to shrink, constraining the canvas width, and switching the mobile studio rows to `auto minmax(0, 1fr)`.

## Commands

- `npm run typecheck` passed.
- `node --test app/page.model-config-ui.test.cjs` passed: 19/19.
- `npm run build` passed.

## Residual Risk

Dependency freshness is driven primarily by `updatedAt` ordering. Version numbers alone do not make a node stale when all files share the same timestamp, because `fileRevision()` compares `Math.max(version, Date.parse(updatedAt) / 1000)`. This is fine for normal single-file updates, but bulk imports with identical timestamps can hide version-only ordering.
