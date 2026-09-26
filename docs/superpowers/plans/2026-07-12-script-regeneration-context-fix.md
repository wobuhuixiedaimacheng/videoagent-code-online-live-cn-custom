# Script Regeneration Context Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make script regenerate/revise use the visible same-stage draft and reject placeholder output without leaking unconfirmed downstream assets or changing the Agnes provider.

**Architecture:** Keep the persisted request as the Patch baseline and derive a separate, read-only Prompt request from trusted same-stage drafts. Separate stage version dependencies from Prompt context, stamp Patch provenance, validate the three script-stage artifacts atomically, and expose explicit request modes from the UI.

**Tech Stack:** Next.js 14, React 18, TypeScript, Node `node:test`, current in-memory `WorkspaceSnapshot`/Patch architecture.

**Repository note:** This checkout has no `.git` directory. Do not initialize one. Replace commit steps with verification checkpoints and report this limitation.

---

## File map

- Create `lib/stageRequest.ts`: pure construction of stage API request bodies.
- Create `lib/stagePromptContext.ts`: trusted same-stage draft selection and Prompt workspace derivation.
- Create `lib/scriptStageValidation.ts`: placeholder, anchor, Brief, campaign-goal, and atomic bundle validation.
- Create `lib/scriptRegeneration.test.cjs`: focused regression tests for the new modules and Provider integration.
- Modify `lib/types.ts`: `StageRequestMode` and Patch provenance.
- Modify `lib/stageGeneration.ts`: separate Prompt context files from version source files.
- Modify `lib/workspaceDrafts.ts`: validate optional Patch provenance without breaking old snapshots.
- Modify `lib/agentProvider.ts`: original/prompt request views, authoritative `before`, provenance stamping, atomic validation, mock/fallback parity.
- Modify `app/api/agent/run/route.ts`: map invalid stage output to HTTP 502.
- Modify `app/page.tsx`: send explicit initial/regenerate/revise modes and mark manual script edits.
- Extend `lib/stageGeneration.test.cjs` and `lib/workspaceDrafts.test.cjs`: preserve confirmed-only downstream behavior and persistence compatibility.

### Task 1: Request modes and Patch provenance

**Files:**
- Modify: `lib/types.ts`
- Create: `lib/stageRequest.ts`
- Test: `lib/scriptRegeneration.test.cjs`

- [ ] **Step 1: Write failing tests for explicit request modes**

Add tests that call the desired pure helper:

```js
test('stage request body preserves explicit regenerate and revise modes', () => {
  const { buildStageRunRequest } = require('./stageRequest.ts');
  const base = {
    stage: 'script', workspace: workspaceWith(), instruction: '重写脚本', history: [],
    generationJobId: 'job-new', sourceVersions: {}, workflow: 'script'
  };
  assert.equal(buildStageRunRequest({ ...base, stageRequestMode: 'regenerate' }).stageRequestMode, 'regenerate');
  assert.equal(buildStageRunRequest({ ...base, stageRequestMode: 'revise' }).stageRequestMode, 'revise');
  assert.equal(buildStageRunRequest(base).stageRequestMode, 'initial');
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test lib/scriptRegeneration.test.cjs`  
Expected: FAIL because `stageRequest.ts` and `StageRequestMode` do not exist.

- [ ] **Step 3: Add the types and minimal helper**

Add to `lib/types.ts`:

```ts
export type StageRequestMode = 'initial' | 'regenerate' | 'revise';

export type PatchOrigin = {
  kind: 'agent_stage' | 'manual';
  productionStage?: ProductionStageId;
  generationJobId?: string;
};
```

Add `origin?: PatchOrigin` to `PatchOperation` and `stageRequestMode?: StageRequestMode` to `AgentRunRequest`.

Create `buildStageRunRequest(input)` returning an `AgentRunRequest` with `stageRequestMode: input.stageRequestMode || 'initial'` and no inferred mode.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test lib/scriptRegeneration.test.cjs`  
Expected: PASS for request-mode tests.

- [ ] **Step 5: Verification checkpoint**

Run: `npm run typecheck`  
Expected: PASS before continuing. No commit because `.git` is absent.

### Task 2: Prompt context and same-stage draft isolation

**Files:**
- Modify: `lib/stageGeneration.ts`
- Create: `lib/stagePromptContext.ts`
- Modify: `lib/workspaceDrafts.ts`
- Test: `lib/scriptRegeneration.test.cjs`
- Test: `lib/stageGeneration.test.cjs`
- Test: `lib/workspaceDrafts.test.cjs`

- [ ] **Step 1: Write failing tests for Prompt context files**

Assert:

```js
assert.deepEqual(stagePromptContextFiles('script'), [
  'brief.json', 'script.md', 'campaign_goal.json', 'profile.json', '.aigc/MEMORY.md',
  'platform_rules.json', 'viral_refs.json', 'asset_library.json', 'feedback_report.json'
]);
assert.deepEqual(stagePromptContextFiles('character'), ['script.md']);
```

- [ ] **Step 2: Write failing tests for trusted same-stage Patch selection**

Build a workspace with:

- current script flow job `script-job-old`;
- matching agent-stage Brief/script Patch;
- manual script Patch;
- wrong-job script Patch in a separate case;
- pending `characters.json` and `scenes.json` sentinels.

Assert regenerate/revise applies only current matching or manual script-stage files, initial applies none, and no downstream/internal sentinel reaches the derived workspace.

- [ ] **Step 3: Run tests and verify RED**

Run: `node --test lib/scriptRegeneration.test.cjs lib/stageGeneration.test.cjs lib/workspaceDrafts.test.cjs`  
Expected: FAIL because Prompt context and Patch provenance handling are missing.

- [ ] **Step 4: Implement Prompt context files**

In `stageGeneration.ts`, keep `STAGE_SOURCE_FILES` unchanged and add:

```ts
const SCRIPT_PROMPT_CONTEXT_FILES = [
  'brief.json', 'script.md', 'campaign_goal.json', 'profile.json', '.aigc/MEMORY.md',
  'platform_rules.json', 'viral_refs.json', 'asset_library.json', 'feedback_report.json'
];

export function stagePromptContextFiles(stage: ProductionStageId): string[] {
  return stage === 'script' ? [...SCRIPT_PROMPT_CONTEXT_FILES] : stageSourceFiles(stage);
}
```

- [ ] **Step 5: Implement provenance validation and Prompt workspace derivation**

Update `workspaceDrafts.ts` to accept an optional, structurally valid origin. Create `stagePromptWorkspace(req)` returning `{ workspace, warnings }`:

- return original workspace for initial or non-script requests;
- select only script-stage output files;
- accept matching `agent_stage` stage/job Patch or local `manual` Patch;
- accept a legacy Patch only under the safe flow/path/before conditions in the spec;
- apply selected Patches to a temporary workspace;
- never include the pending-patches file itself as Prompt context.

- [ ] **Step 6: Run tests and verify GREEN**

Run: `node --test lib/scriptRegeneration.test.cjs lib/stageGeneration.test.cjs lib/workspaceDrafts.test.cjs`  
Expected: all focused context/provenance tests PASS and existing downstream sentinel tests remain PASS.

### Task 3: Atomic script-stage validation

**Files:**
- Create: `lib/scriptStageValidation.ts`
- Test: `lib/scriptRegeneration.test.cjs`

- [ ] **Step 1: Add the screenshot regression fixture and failing tests**

Use the complete bad script text containing:

```text
**主题**: [根据 Brief 确定的核心主题]
**主标题**: [吸引眼球的标题，如：告别低效！这款神器让工作提速300%]
**副标题**: [补充说明，如：专为小B商家打造，无需技术背景]
#[行业关键词] #[痛点关键词] #[解决方案]
```

Assert it fails, while `[查看产品](https://example.com)` and a concrete Chinese script pass.

- [ ] **Step 2: Add failing tests for anchors and atomic JSON validation**

Assert:

- a concrete Brief anchor such as `星河咖啡机` must appear in the script;
- placeholder strings anywhere in Brief or campaign goal fail the entire bundle;
- valid Brief, campaign goal, and anchored script produce no issues.

- [ ] **Step 3: Run tests and verify RED**

Run: `node --test lib/scriptRegeneration.test.cjs`  
Expected: FAIL because validators and `InvalidStageOutputError` are absent.

- [ ] **Step 4: Implement the validators**

Create:

```ts
export class InvalidStageOutputError extends Error {
  readonly code = 'invalid_stage_output';
  constructor(readonly issues: string[]) {
    super(`模型返回了未填充或未基于 Brief 的脚本阶段结果：${issues.join('；')}`);
  }
}
```

Implement:

- Markdown link/image removal before bracket-placeholder scanning;
- square-bracket semantic matching for every fixture term;
- 60 non-whitespace minimum and two substantive lines/40 substantive characters;
- deterministic concrete-anchor extraction with generic-term exclusion;
- recursive JSON string placeholder scanning;
- required Brief and campaign-goal fields;
- atomic `validateScriptStageBundle` issues.

- [ ] **Step 5: Run tests and verify GREEN**

Run: `node --test lib/scriptRegeneration.test.cjs`  
Expected: validator tests PASS.

### Task 4: Provider original/prompt views and authoritative Patch baseline

**Files:**
- Modify: `lib/agentProvider.ts`
- Test: `lib/scriptRegeneration.test.cjs`
- Extend: `lib/stageGeneration.test.cjs`

- [ ] **Step 1: Write failing Provider capture tests**

Using the existing custom-provider fetch harness, assert a regenerate request:

- includes unique pending Brief/script markers;
- excludes pending downstream/internal markers;
- ignores a model-supplied fake `before`;
- stamps returned Patch origin with stage and current request job;
- replaces same-file output without duplicates.

- [ ] **Step 2: Write failing mock/fallback parity tests**

With `VIDEOAGENT_FORCE_MOCK=true` and with all providers absent, assert `after` uses the Prompt draft while `before` comes from committed workspace.

- [ ] **Step 3: Run tests and verify RED**

Run: `node --test lib/scriptRegeneration.test.cjs lib/stageGeneration.test.cjs`  
Expected: FAIL because Provider functions use one request view.

- [ ] **Step 4: Implement original/prompt request views**

In `runVideoAgent`:

```ts
assertStageSourceVersions(originalRequest);
const promptContext = stagePromptWorkspace(originalRequest);
const promptRequest = { ...originalRequest, workspace: promptContext.workspace };
```

Pass both views through live providers, `normalizeResponse`, `mockPatch`, `stageFallbackPatches`, and `makePatch`. Content generators and fallback read `promptRequest`; Patch baseline/no-op reads `originalRequest`.

- [ ] **Step 5: Make Patch baseline authoritative**

In model Patch normalization:

```ts
before: getFile(originalRequest, filePath),
origin: originalRequest.productionStage ? {
  kind: 'agent_stage',
  productionStage: originalRequest.productionStage,
  generationJobId: originalRequest.generationJobId
} : undefined
```

Ignore model `before` and model `origin`.

- [ ] **Step 6: Add atomic candidate validation**

For script stage, fill missing Brief/campaign/script from Prompt-based fallback, then validate all three before returning any Patch. Throw `InvalidStageOutputError` on any issue.

- [ ] **Step 7: Run tests and verify GREEN**

Run: `node --test lib/scriptRegeneration.test.cjs lib/stageGeneration.test.cjs`  
Expected: all Provider, mock, fallback, baseline, and confirmed-only tests PASS.

### Task 5: API and UI wiring

**Files:**
- Modify: `app/api/agent/run/route.ts`
- Modify: `app/page.tsx`
- Test: `lib/scriptRegeneration.test.cjs`
- Test: `app/api/agent/run/route.test.cjs` if present; otherwise create it following existing route tests.

- [ ] **Step 1: Write failing route and client-request tests**

Assert `InvalidStageOutputError` maps to:

```json
{ "error": "...", "code": "invalid_stage_output" }
```

with HTTP 502. Assert helper-built bodies from the three page actions carry initial/regenerate/revise explicitly.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test lib/scriptRegeneration.test.cjs app/api/agent/run/route.test.cjs`  
Expected: FAIL because route mapping and UI wiring are absent.

- [ ] **Step 3: Implement route mapping**

Import `InvalidStageOutputError`; return status 502 and its stable code before the generic 500 branch.

- [ ] **Step 4: Wire the UI**

Use `buildStageRunRequest` inside `requestStageDraft`. Add independent `stageRequestMode` and existing revision-state parameters. Set:

- `runAgent` and next-stage generation → initial;
- `regenerateProductionStage` → regenerate;
- `submitNodeRevision` and explicit node rewrite → revise;
- `saveScriptDraft` Patch origin → manual.

On invalid output, retain prior pending assets and show the server message.

- [ ] **Step 5: Run tests and verify GREEN**

Run: `node --test lib/scriptRegeneration.test.cjs app/api/agent/run/route.test.cjs`  
Expected: PASS.

### Task 6: Full automated and browser verification

**Files:**
- No new production files unless a verified regression requires a focused correction.

- [ ] **Step 1: Run the complete automated suite**

Run:

```bash
node --test lib/*.test.cjs app/api/**/*.test.cjs
npm run typecheck
npm run build
npm run qa:flow
```

Expected: exit 0 for every command, zero failed tests.

- [ ] **Step 2: Verify the running local API and reload the app**

Confirm `http://127.0.0.1:3000/` returns 200. Reload the current in-app browser tab after code changes.

- [ ] **Step 3: Browser test every user-visible requirement**

Through the local UI:

1. Create a Mission containing a unique marker such as `星河咖啡机`.
2. Wait for the initial three script-stage Patches.
3. Without approving, click “重新生成”.
4. Confirm the new script contains `星河咖啡机` and contains none of the known placeholders.
5. Confirm exactly one pending Patch exists per Brief/campaign/script file.
6. Enter a node revision and confirm `revise` also preserves the marker.
7. Confirm a forced invalid-template API fixture returns a visible error while the prior draft remains.
8. Confirm no character/scene/storyboard/video pending content appears in the script Prompt regression capture.

- [ ] **Step 4: Re-run fresh verification after browser testing**

Run the full automated commands again if browser testing causes any correction. Report automated, API, and browser evidence separately, including any blocked external-model verification.
