# Xiaopeng Love History V2 Website Production Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the local VideoAgent website capable of preparing and submitting a 3-minute, 12-segment, pure-Chinese Xiaopeng campus love-history short drama with reference-image video controls.

**Architecture:** Keep the existing Mission workspace model. Add only the provider pass-through needed for image-to-video/keyframe rendering, then create a V2 production package as workspace-ready assets and use the local website to review/submit render tasks.

**Tech Stack:** Next.js App Router, TypeScript, Node test runner, Agnes Video V2.0, local browser QA.

---

### Task 1: Video API Reference-Image Pass-Through

**Files:**
- Modify: `app/api/video/render/route.test.cjs`
- Modify: `app/api/video/render/route.ts`

- [ ] **Step 1: Write the failing test**

Add a test that posts `image`, `mode`, and keyframe images to `/api/video/render` and asserts that the upstream Agnes request contains them in `extra_body`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test app/api/video/render/route.test.cjs`
Expected: FAIL because the current upstream body does not include `extra_body.image` or `extra_body.mode`.

- [ ] **Step 3: Write minimal implementation**

Extend `VideoRenderRequest` with `image`, `mode`, and `keyframes`. Normalize those values and include:

```ts
extra_body: {
  image: images.length === 1 && mode !== 'keyframes' ? images[0] : images,
  mode
}
```

Only include `extra_body` when a reference image or explicit mode exists.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test app/api/video/render/route.test.cjs`
Expected: PASS.

### Task 2: Website Submission Uses Reference Assets

**Files:**
- Modify: `app/page.model-config-ui.test.cjs`
- Modify: `app/page.tsx`

- [ ] **Step 1: Write the failing UI source test**

Assert that `AssetPrompts.prompts` supports `referenceImageUrl`, `referenceImages`, and `mode`, and that `submitVideoRender` sends `image` and `mode` to `/api/video/render`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test app/page.model-config-ui.test.cjs`
Expected: FAIL because the current submit body has only `prompt`, `negativePrompt`, and `spec`.

- [ ] **Step 3: Write minimal implementation**

Add reference-image fields to the local prompt type, build helper functions to read the first renderable prompt reference image, and include the fields in the render API request. Strengthen the Chinese negative prompt so the model is told not to put any readable text in-frame.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test app/page.model-config-ui.test.cjs`
Expected: PASS.

### Task 3: Xiaopeng V2 Production Package

**Files:**
- Create: `outputs/xiaopeng-love-history-3min-v2/production-package.md`
- Create: `outputs/xiaopeng-love-history-3min-v2/asset_prompts.json`
- Create: `outputs/xiaopeng-love-history-3min-v2/review.html`
- Modify: `scripts/render-xiaopeng-3min.cjs`

- [ ] **Step 1: Rewrite the story structure**

Use five complete romance arcs: kindergarten, primary school, middle school, high school, college. Keep 12 segments at 15 seconds each.

- [ ] **Step 2: Enforce pure Chinese production rules**

No model-generated subtitles, signs, banners, Latin letters, pinyin, or readable in-frame text. All subtitles are post-production Chinese captions.

- [ ] **Step 3: Add character aging rules**

Keep Xiaopeng's face anchors while age and props change: red backpack, red pencil case, red bottle, red notebook, red canvas bag.

- [ ] **Step 4: Generate workspace-ready assets**

Write `asset_prompts.json` with `characterConsistency`, `characters`, `prompts`, `renderQueue`, and `renderSpec` that the website can preview.

### Task 4: Verification And Website Use

**Files:**
- Verify only, no planned code files.

- [ ] **Step 1: Run targeted tests**

Run:
`node --test app/api/video/render/route.test.cjs app/page.model-config-ui.test.cjs`

- [ ] **Step 2: Run full local checks**

Run:
`node --test app/page.model-config-ui.test.cjs lib/agentProvider.language.test.cjs lib/modelConfig.test.cjs app/api/model-config/models/route.test.cjs app/api/video/render/route.test.cjs`
`npm run typecheck`

- [ ] **Step 3: Open the local website**

Use Chrome against `http://127.0.0.1:3001`, load the V2 workspace assets into local storage, and review the Mission/Script/Character/Video surfaces in the website.

- [ ] **Step 4: Submit or stage render**

Use the website render action for the first 15-second segment if rate limits allow. If provider rate limits block generation, leave the V2 render manifest staged and report the exact provider error.
