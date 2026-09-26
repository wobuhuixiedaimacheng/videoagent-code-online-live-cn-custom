# VideoAgent 渐进式阶段确认实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Mission 工作台改成脚本、角色、场景、分镜、视频任务逐级生成、逐级审查、逐级确认的真实生产链路。

**Architecture:** `production_flow.json` 是阶段状态与确认版本的唯一真相，`.aigc/pending_patches.json` 持久化尚未确认的草稿 Patch，刷新后仍能继续审查。角色从 `asset_prompts.json` 拆到独立 `characters.json`；Agent 每次只生成当前阶段允许的文件；主画板只展示已确认阶段、当前阶段和正在生成的下一阶段，未来阶段保持锁定。当前工程使用 `localStorage` 持久化整个 `WorkspaceSnapshot`，一期按单用户本地项目实现版本校验、幂等确认和迟到任务隔离，不声称具备跨设备事务能力。

**Tech Stack:** Next.js 14 App Router、React 18、TypeScript 5.7、Node.js `node:test`、现有 Agnes 图片/视频 API 路由、浏览器 `localStorage`。

---

## 实施前约束

- 当前目录没有 `.git`，所以本计划中的提交步骤在本机执行时记录为测试检查点；目录恢复为 Git 工作区后再执行对应 `git add` 和 `git commit`。
- 不重做模型配置、供应商协议、登录、账单、团队权限或云端 Face ID。
- 不继续使用文件更新时间推断确认状态；文件 revision 只作为 `sourceVersions` 的输入，阶段状态完全读取 `production_flow.json`。
- 不允许托管模式自动确认阶段或自动提交视频任务；托管模式只允许预生成草稿。
- 视频任务确认前不得调用 `/api/video/render`。

## 文件结构

**新建**

- `lib/productionFlow.ts`：阶段状态机、版本校验、失效传播和阶段可见性。
- `lib/productionFlow.test.cjs`：状态机与幂等/迟到结果回归测试。
- `lib/testFixtures.cjs`：Node 测试共用的工作区、流程、Patch 和视频任务构造器。
- `lib/workspaceDrafts.ts`：读写 `.aigc/pending_patches.json`，按阶段筛选和消费 Patch。
- `lib/workspaceDrafts.test.cjs`：刷新恢复和原子消费测试。
- `lib/productionAssets.ts`：`characters.json`、增强版 `scenes.json` 的迁移、读取与确认前校验。
- `lib/productionAssets.test.cjs`：旧工作区迁移和资产完整性测试。
- `lib/stageGeneration.ts`：阶段到 workflow、输出文件、生成指令和来源版本的映射。
- `lib/stageGeneration.test.cjs`：阶段隔离和请求元数据测试。
- `components/ProductionCanvas.tsx`：渐进画板、锁定导航、当前阶段资产容器和生成骨架。
- `lib/videoRenderBatch.ts`：多镜头任务状态、部分失败重试和完成度计算。
- `lib/videoRenderBatch.test.cjs`：批量渲染状态机测试。

**修改**

- `lib/types.ts`：增加生产阶段、角色资产、场景资产和生成元数据类型。
- `lib/defaultWorkspace.ts`：新项目初始化 `production_flow.json`，内部状态文件不被当成用户资产。
- `lib/workspace.ts`：增加内部文件判断和按路径写入工作区文件的纯函数。
- `lib/agentProvider.ts`：支持阶段化生成并产出 `characters.json`。
- `lib/agentProvider.language.test.cjs`：约束中文角色资产和阶段输出。
- `app/page.tsx`：接入状态机、持久化 Patch、阶段确认、图片生成、锁定导航和批量视频任务。
- `components/runtime.tsx`：把单个视频状态升级成逐镜任务审查与状态列表。
- `app/globals.css`：让画板成为主视图，增加渐进节点、锁定态、骨架和阶段操作条。
- `app/page.model-config-ui.test.cjs`：补充真实阶段门和渐进画板静态回归。
- `outputs/xiaopeng-love-history-3min-v2/workspace.json`：迁移演示项目的角色、场景图片引用和流程状态。
- `app/api/demo-workspace/[id]/route.test.cjs`：验证演示工作区包含新流程文件。
- `scripts/qa/videoagent-flow-regression.cjs`：增加逐阶段浏览器验收。

**一期边界说明**

当前运行环境没有 `ffmpeg`，工程也没有浏览器端视频拼接依赖。本计划完成已确认规格的第一期边界：逐镜提交、轮询、部分失败重试和全部片段就绪。只有拿到单一合成文件 URL 后才允许把视频阶段标为 `completed`；多片段全部成功但尚未合成时保持 `rendering`，界面显示“片段已齐，待合成”，不得冒充三分钟成片。最终拼接需要单独设计服务端媒体合成方案，不在本次状态门改造中偷偷引入未经验证的视频基础设施。

### Task 1: 建立持久化阶段状态机

**Files:**
- Modify: `lib/types.ts`
- Create: `lib/productionFlow.ts`
- Create: `lib/productionFlow.test.cjs`
- Create: `lib/testFixtures.cjs`

- [ ] **Step 1: 建立完整测试构造器**

创建 `lib/testFixtures.cjs`，后续测试只引用这里已定义的对象，不使用隐含 fixture：

```js
const STAGES = ['script', 'character', 'scene', 'storyboard', 'video'];

function workspaceWith(contents = {}) {
  const timestamp = '2026-07-11T12:00:00.000Z';
  const files = Object.entries(contents).map(([path, content], index) => ({
    path,
    kind: path.endsWith('.md') ? 'markdown' : path.includes('asset') ? 'asset' : 'json',
    content,
    version: index + 1,
    updatedAt: timestamp
  }));
  return {
    projectId: 'test-project', title: '测试项目', branch: 'draft/v0', mode: 'smb',
    activeWorkflow: 'generate', files, currentTimelineVersion: 0, complianceStatus: 'pass'
  };
}

function patch(filePath, after, before = '') {
  return {
    id: `patch-${filePath}`, filePath, summary: `更新 ${filePath}`, before, after,
    riskLevel: 'low', requiresApproval: true
  };
}

function stageRecord(status = 'locked', draftVersion = null) {
  return {
    status, draftVersion, confirmedVersion: null, confirmedAt: null, confirmedBy: null,
    confirmationKey: null, generationJobId: null, sourceVersions: {}, error: null
  };
}

function readyFlow(stage, draftVersion) {
  const stages = Object.fromEntries(STAGES.map((id) => [id, stageRecord('locked')]));
  const index = STAGES.indexOf(stage);
  for (let i = 0; i < index; i += 1) {
    stages[STAGES[i]] = { ...stageRecord('confirmed', 1), confirmedVersion: 1 };
  }
  stages[stage] = stageRecord('ready_for_review', draftVersion);
  return { schemaVersion: 1, currentStage: stage, stages, videoJobs: [] };
}

function confirmedFlow() {
  const flow = readyFlow('video', 1);
  for (const stage of STAGES) {
    flow.stages[stage] = { ...stageRecord('confirmed', 1), confirmedVersion: 1 };
  }
  return flow;
}

function confirmationInput(stage, version, key) {
  return {
    stage, expectedDraftVersion: version, confirmationKey: key,
    confirmedAt: '2026-07-11T12:00:00.000Z', confirmedBy: 'local-user',
    nextGenerationJobId: stage === 'video' ? null : `${stage}-next-job`, sourceVersions: {}
  };
}

function parseFile(workspace, path) {
  const file = workspace.files.find((item) => item.path === path);
  if (!file) throw new Error(`Missing fixture file: ${path}`);
  return JSON.parse(file.content);
}

function fileVersion(workspace, path) {
  return workspace.files.find((item) => item.path === path)?.version || 0;
}

function videoJob(status, promptId, videoUrl = '') {
  return { id: `job-${promptId}`, promptId, status, attempt: 1, ...(videoUrl ? { videoUrl } : {}) };
}

module.exports = {
  STAGES, workspaceWith, patch, readyFlow, confirmedFlow, confirmationInput,
  parseFile, fileVersion, videoJob
};
```

- [ ] **Step 2: 写状态机失败测试**

在 `lib/productionFlow.test.cjs` 使用现有 `typescript.transpileModule + vm` 测试方式，覆盖以下行为：

```js
test('a workspace with a script starts at script review and locks downstream stages', () => {
  const flow = productionFlowFromWorkspace(workspaceWith({ 'script.md': '# 完整脚本' }));
  assert.equal(flow.currentStage, 'script');
  assert.equal(flow.stages.script.status, 'ready_for_review');
  assert.equal(flow.stages.character.status, 'locked');
  assert.deepEqual(visibleProductionStages(flow), ['script']);
});

test('confirmation freezes the expected draft and starts only the direct downstream stage', () => {
  const flow = readyFlow('script', 3);
  const next = confirmFlowStage(flow, {
    stage: 'script',
    expectedDraftVersion: 3,
    confirmationKey: 'confirm-script-3',
    confirmedAt: '2026-07-11T12:00:00.000Z',
    confirmedBy: 'local-user',
    nextGenerationJobId: 'character-job-1',
    sourceVersions: { 'script.md': 3 }
  });
  assert.equal(next.stages.script.status, 'confirmed');
  assert.equal(next.stages.character.status, 'generating');
  assert.equal(next.stages.scene.status, 'locked');
  assert.deepEqual(
    beginStageGeneration(next, 'character', 'character-job-1', { 'script.md': 3 }),
    next
  );
});

test('an upstream revision makes every downstream result stale', () => {
  const started = beginStageGeneration(confirmedFlow(), 'script', 'script-revision-2', { 'brief.json': 2 });
  const next = markStageDraft(started, {
    stage: 'script',
    generationJobId: 'script-revision-2',
    sourceVersions: { 'brief.json': 2 }
  });
  assert.equal(next.stages.script.status, 'ready_for_review');
  for (const stage of ['character', 'scene', 'storyboard', 'video']) {
    assert.equal(next.stages[stage].status, 'stale');
  }
});

test('duplicate confirmation keys are idempotent and mismatched versions are rejected', () => {
  const once = confirmFlowStage(readyFlow('scene', 2), confirmationInput('scene', 2, 'scene-key'));
  assert.deepEqual(confirmFlowStage(once, confirmationInput('scene', 2, 'scene-key')), once);
  assert.throws(
    () => confirmFlowStage(readyFlow('scene', 3), confirmationInput('scene', 2, 'other-key')),
    /草稿版本已经变化/
  );
});

test('a late generation result cannot replace the current job', () => {
  const flow = beginStageGeneration(readyFlow('script', 1), 'character', 'job-new', { 'script.md': 1 });
  const result = completeStageGeneration(flow, 'character', 'job-old', { 'script.md': 1 });
  assert.equal(result.accepted, false);
  assert.deepEqual(result.flow, flow);
});

test('a late failure cannot replace a completed draft', () => {
  const started = beginStageGeneration(readyFlow('script', 1), 'character', 'job-current', { 'script.md': 1 });
  const completed = completeStageGeneration(started, 'character', 'job-current', { 'script.md': 1 }).flow;
  assert.deepEqual(failStageGeneration(completed, 'character', 'job-current', 'late failure'), completed);
});

test('marking a draft requires the active generation job and sources', () => {
  const started = beginStageGeneration(readyFlow('script', 1), 'character', 'job-current', { 'script.md': 1 });
  assert.deepEqual(markStageDraft(started, {
    stage: 'character', generationJobId: 'job-old', sourceVersions: { 'script.md': 1 }
  }), started);
});

test('marking a draft rejects changed sources even when the job id matches', () => {
  const started = beginStageGeneration(readyFlow('script', 1), 'character', 'job-current', { 'script.md': 1 });
  assert.deepEqual(markStageDraft(started, {
    stage: 'character', generationJobId: 'job-current', sourceVersions: { 'script.md': 2 }
  }), started);
});

test('a callback cannot turn a confirmed stage back into a draft without beginning a revision', () => {
  const flow = confirmedFlow();
  assert.deepEqual(markStageDraft(flow, {
    stage: 'script', generationJobId: 'late-job', sourceVersions: { 'brief.json': 1 }
  }), flow);
});

test('a locked non-direct stage cannot begin generation', () => {
  assert.throws(
    () => beginStageGeneration(readyFlow('script', 1), 'scene', 'scene-job', { 'characters.json': 1 }),
    /尚未解锁/
  );
});

test('a stale stage cannot begin while its predecessor is unconfirmed', () => {
  const flow = readyFlow('character', 1);
  flow.stages.scene.status = 'stale';
  assert.throws(
    () => beginStageGeneration(flow, 'scene', 'scene-job', { 'characters.json': 1 }),
    /尚未解锁/
  );
});

test('a confirmed stage with a missing asset file is downgraded', () => {
  const workspace = workspaceWith({
    'production_flow.json': JSON.stringify(confirmedFlow())
  });
  const flow = productionFlowFromWorkspace(workspace);
  assert.equal(flow.stages.script.status, 'failed');
  assert.match(flow.stages.script.error, /script\.md/);
});
```

- [ ] **Step 3: 运行测试并确认失败**

Run: `node --test lib/productionFlow.test.cjs`

Expected: FAIL，提示 `productionFlow.ts should exist` 或导出函数不存在。

- [ ] **Step 4: 在 `lib/types.ts` 增加稳定类型**

```ts
export type ProductionStageId = 'script' | 'character' | 'scene' | 'storyboard' | 'video';

export type ProductionStageStatus =
  | 'locked'
  | 'generating'
  | 'ready_for_review'
  | 'confirmed'
  | 'stale'
  | 'rendering'
  | 'completed'
  | 'failed';

export type ProductionStageRecord = {
  status: ProductionStageStatus;
  draftVersion: number | null;
  confirmedVersion: number | null;
  confirmedAt: string | null;
  confirmedBy: string | null;
  confirmationKey: string | null;
  generationJobId: string | null;
  sourceVersions: Record<string, number>;
  error: string | null;
};

export type ProductionFlow = {
  schemaVersion: 1;
  currentStage: ProductionStageId;
  stages: Record<ProductionStageId, ProductionStageRecord>;
  videoJobs: VideoRenderJob[];
};

export type VideoRenderJob = {
  id: string;
  promptId: string;
  status: 'ready' | 'submitting' | 'submitted' | 'polling' | 'completed' | 'failed';
  attempt: number;
  providerTaskId?: string;
  videoUrl?: string;
  progress?: number;
  error?: string;
};
```

- [ ] **Step 5: 实现 `lib/productionFlow.ts` 的纯状态机**

在同一文件定义并导出确认输入，避免后续任务引用未声明类型：

```ts
export type ConfirmStageInput = {
  stage: ProductionStageId;
  expectedDraftVersion: number;
  confirmationKey: string;
  confirmedAt: string;
  confirmedBy: string;
  nextGenerationJobId: string | null;
  sourceVersions: Record<string, number>;
};
```

必须导出以下固定接口，后续任务只调用这些接口，不在组件里手写状态转换：

```ts
export const PRODUCTION_FLOW_PATH = 'production_flow.json';
export const PRODUCTION_STAGE_ORDER: ProductionStageId[] = ['script', 'character', 'scene', 'storyboard', 'video'];

export function productionFlowFromWorkspace(workspace: WorkspaceSnapshot | null): ProductionFlow;
export function visibleProductionStages(flow: ProductionFlow): ProductionStageId[];
export function canOpenProductionStage(flow: ProductionFlow, stage: ProductionStageId): boolean;
export function nextProductionStage(stage: ProductionStageId): ProductionStageId | null;
export function beginStageGeneration(
  flow: ProductionFlow,
  stage: ProductionStageId,
  generationJobId: string,
  sourceVersions: Record<string, number>
): ProductionFlow;
export function completeStageGeneration(
  flow: ProductionFlow,
  stage: ProductionStageId,
  generationJobId: string,
  sourceVersions: Record<string, number>
): { accepted: boolean; flow: ProductionFlow };
export function failStageGeneration(
  flow: ProductionFlow,
  stage: ProductionStageId,
  generationJobId: string,
  error: string
): ProductionFlow;
export function markStageDraft(
  flow: ProductionFlow,
  input: { stage: ProductionStageId; generationJobId: string; sourceVersions: Record<string, number> }
): ProductionFlow;
export function confirmFlowStage(flow: ProductionFlow, input: ConfirmStageInput): ProductionFlow;
export function writeProductionFlow(workspace: WorkspaceSnapshot, flow: ProductionFlow): WorkspaceSnapshot;
export function updateProductionFlow(
  workspace: WorkspaceSnapshot,
  update: (flow: ProductionFlow) => ProductionFlow
): WorkspaceSnapshot;
```

`confirmFlowStage` 必须先处理相同 `confirmationKey` 的幂等返回，再校验 `status === 'ready_for_review'` 和 `draftVersion === expectedDraftVersion`；确认上游后只把直接下游设为 `generating`，更远阶段保持 `locked` 或 `stale`。

`beginStageGeneration` 遇到同一阶段、同一 `generationJobId` 和同一 `sourceVersions` 时必须幂等返回，保证确认事务先写入“生成中”后，请求函数可以安全启动同一个任务。

`productionFlowFromWorkspace` 读取已有流程后必须核对已确认阶段的规范文件；文件缺失或 JSON 无法解析时将该阶段降级为 `failed`，将下游降级为 `stale`，不能依赖前端内存假装已经确认。

- [ ] **Step 6: 运行状态机测试**

Run: `node --test lib/productionFlow.test.cjs`

Expected: PASS，12 个状态机测试全部通过。

- [ ] **Step 7: 记录检查点**

当前目录无 Git，记录测试命令与通过数量。若目录恢复 Git：

```bash
git add lib/types.ts lib/productionFlow.ts lib/productionFlow.test.cjs lib/testFixtures.cjs
git commit -m "feat: add production stage state machine"
```

### Task 2: 持久化待审 Patch 并实现原子确认

**Files:**
- Create: `lib/workspaceDrafts.ts`
- Create: `lib/workspaceDrafts.test.cjs`
- Modify: `lib/workspace.ts`
- Modify: `app/page.tsx`
- Modify: `app/page.model-config-ui.test.cjs`

- [ ] **Step 1: 写待审 Patch 存储失败测试**

```js
test('pending patches survive workspace serialization', () => {
  const withDrafts = savePendingPatches(workspaceWith(), [patch('script.md', '# 新脚本')]);
  const restored = JSON.parse(JSON.stringify(withDrafts));
  assert.equal(readPendingPatches(restored)[0].filePath, 'script.md');
});

test('confirming one stage consumes only that stages patches', () => {
  const source = savePendingPatches(workspaceWith(), [
    patch('characters.json', '{"characters":[]}'),
    patch('compliance_report.json', '{"status":"warning"}')
  ]);
  const result = consumePendingPatches(source, ['characters.json']);
  assert.equal(getFile(result.workspace, 'characters.json').version, 1);
  assert.deepEqual(readPendingPatches(result.workspace).map((item) => item.filePath), ['compliance_report.json']);
});

test('appending a newer patch replaces the older draft for the same file', () => {
  const source = savePendingPatches(workspaceWith(), [patch('scenes.json', 'v1')]);
  const next = appendPendingPatches(source, [patch('scenes.json', 'v2')]);
  assert.equal(readPendingPatches(next)[0].after, 'v2');
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test lib/workspaceDrafts.test.cjs`

Expected: FAIL，`workspaceDrafts.ts` 不存在。

- [ ] **Step 3: 在 `lib/workspace.ts` 增加内部文件和单文件写入函数**

```ts
export function isInternalWorkspaceFile(path: string) {
  return path === 'production_flow.json' || path.startsWith('.aigc/');
}

export function upsertWorkspaceFile(
  workspace: WorkspaceSnapshot,
  path: string,
  content: string,
  kind: WorkspaceFile['kind'] = inferFileKind(path)
): WorkspaceSnapshot {
  const files = [...workspace.files];
  const index = files.findIndex((file) => file.path === path);
  const previous = files[index];
  const nextFile = {
    path,
    kind,
    content,
    version: (previous?.version || 0) + 1,
    updatedAt: now()
  };
  if (index >= 0) files[index] = nextFile;
  else files.push(nextFile);
  return { ...workspace, files };
}
```

- [ ] **Step 4: 实现 `.aigc/pending_patches.json` 存储**

`lib/workspaceDrafts.ts` 固定导出：

```ts
export const PENDING_PATCHES_PATH = '.aigc/pending_patches.json';

export function readPendingPatches(workspace: WorkspaceSnapshot | null): PatchOperation[];
export function savePendingPatches(workspace: WorkspaceSnapshot, patches: PatchOperation[]): WorkspaceSnapshot;
export function appendPendingPatches(workspace: WorkspaceSnapshot, patches: PatchOperation[]): WorkspaceSnapshot;
export function pendingPatchesForFiles(workspace: WorkspaceSnapshot, filePaths: string[]): PatchOperation[];
export function applyPatchesForPreview(workspace: WorkspaceSnapshot | null, patches: PatchOperation[]): WorkspaceSnapshot | null;
export function consumePendingPatches(
  workspace: WorkspaceSnapshot,
  filePaths: string[],
  complianceStatus?: WorkspaceSnapshot['complianceStatus']
): { workspace: WorkspaceSnapshot; applied: PatchOperation[] };
export function confirmStageInWorkspace(
  workspace: WorkspaceSnapshot,
  input: ConfirmStageInput & { outputFiles: string[] }
): { workspace: WorkspaceSnapshot; applied: PatchOperation[] };
```

`appendPendingPatches` 以 `filePath` 为键保留最新 Patch；`consumePendingPatches` 先调用现有 `applyPatchToWorkspace`，再从内部文件删除已消费 Patch。确认阶段时必须在一次 `setWorkspace(current => ...)` 中同时消费资产 Patch 和写入新流程状态。

- [ ] **Step 5: 修正用户资产判断**

把 `app/page.tsx` 的 `workspace.files.length > 1` 判断替换为：

```ts
const hasWorkspaceAssets = Boolean(
  workspace?.files.some((file) => !isInternalWorkspaceFile(file.path) && file.path !== '.aigc/MEMORY.md')
);
```

这样空项目新增流程文件后不会错误进入成果工作台。

同时修正刷新恢复：

```ts
function workspaceStorageKey(projectId: string) {
  return `videoagent-workspace:${projectId}`;
}

function demoStorageKey(demoId: string) {
  return `videoagent-demo-workspace:${demoId}`;
}
```

- `safeLoadWorkspace()` 只要求合法 `WorkspaceSnapshot`、`.aigc/MEMORY.md` 和可解析的 `production_flow.json`；不再要求 `scenes.json` 或 `timeline.json` 已存在。
- `loadDemoWorkspaceFromQuery()` 先读取 `demoStorageKey(demoId)`；存在合法本地版本时直接恢复，只有首次打开或用户点击“重置 Demo”才请求 `/api/demo-workspace/:id`。
- 每次 `workspace` 改变时按当前 Demo key 或 `workspaceStorageKey(workspace.projectId)` 保存，不能继续用一个全局 key 覆盖所有项目。
- 在页面静态测试中匹配 `demoStorageKey`、优先 `localStorage.getItem` 和“重置 Demo”分支。

- [ ] **Step 6: 运行测试**

Run: `node --test lib/workspaceDrafts.test.cjs lib/productionFlow.test.cjs`

Expected: PASS，待审 Patch 可序列化、替换和按阶段消费。

- [ ] **Step 7: 记录检查点**

```bash
git add lib/workspace.ts lib/workspaceDrafts.ts lib/workspaceDrafts.test.cjs app/page.tsx
git commit -m "feat: persist pending production patches"
```

### Task 3: 拆分角色资产并迁移旧工作区

**Files:**
- Modify: `lib/types.ts`
- Create: `lib/productionAssets.ts`
- Create: `lib/productionAssets.test.cjs`
- Modify: `lib/defaultWorkspace.ts`

- [ ] **Step 1: 写角色与场景迁移失败测试**

```js
test('legacy characters migrate out of asset prompts with age-stage references', () => {
  const fixture = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'outputs', 'xiaopeng-love-history-3min-v2', 'workspace.json'),
    'utf8'
  ));
  const migrated = migrateLegacyProductionAssets(fixture);
  const file = parseFile(migrated, 'characters.json');
  assert.equal(file.characters[0].id, 'xiaopeng');
  assert.deepEqual(file.characters[0].variants.map((item) => item.id), [
    'kindergarten', 'primary', 'middle', 'high', 'college'
  ]);
  assert.ok(file.characters[0].variants.every((item) => item.primaryImageUrl));
});

test('legacy scene references migrate by scene id', () => {
  const fixture = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'outputs', 'xiaopeng-love-history-3min-v2', 'workspace.json'),
    'utf8'
  ));
  const migrated = migrateLegacyProductionAssets(fixture);
  const scenes = parseFile(migrated, 'scenes.json').scenes;
  assert.ok(scenes.every((scene) => scene.referenceImageUrl));
});

test('character confirmation requires a primary image for every required variant', () => {
  const result = validateStageAssets('character', workspaceWith({
    'characters.json': JSON.stringify({ characters: [{
      id: 'xiaopeng', name: '小澎', role: '主角', required: true,
      description: '测试角色', consistencyPrompt: '同一角色', negativePrompt: '换脸',
      faceAnchorVariantId: 'college', referenceStrategy: 'face_id', expressionIds: ['joy'],
      variants: [{
        id: 'college', label: '大学', ageLabel: '21 岁', wardrobe: '红帆布包', primaryImageUrl: ''
      }]
    }] })
  }));
  assert.deepEqual(result, ['小澎的大学主图尚未生成']);
});

test('scene confirmation requires visible scene references and storyboard requires durations', () => {
  assert.deepEqual(validateStageAssets('scene', workspaceWith({
    'scenes.json': JSON.stringify({ scenes: [{ id: 'scene-1', title: '场景 1', referenceImageUrl: '' }] })
  })), ['场景 1 尚未生成主图']);
  assert.deepEqual(validateStageAssets('storyboard', workspaceWith({
    'storyboard.json': JSON.stringify({ scenes: [{ id: 'shot-1', title: '镜头 1', durationSeconds: 0 }] })
  })), ['镜头 1 缺少有效时长']);
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test lib/productionAssets.test.cjs`

Expected: FAIL，迁移和校验函数不存在。

- [ ] **Step 3: 增加规范化资产类型**

在 `lib/types.ts` 增加：

```ts
export type CharacterVariantAsset = {
  id: string;
  label: string;
  ageLabel: string;
  wardrobe: string;
  primaryImageUrl: string;
  multiViewImageUrl?: string;
  expressionSheetImageUrl?: string;
};

export type CharacterAsset = {
  id: string;
  name: string;
  role: string;
  required: boolean;
  description: string;
  consistencyPrompt: string;
  negativePrompt: string;
  faceAnchorVariantId: string;
  referenceStrategy: 'face_id' | 'multi_view' | 'replace_reference';
  expressionIds: string[];
  variants: CharacterVariantAsset[];
};

export type CharactersFile = { characters: CharacterAsset[] };

export type SceneAsset = PreviewScene & {
  location: string;
  timeOfDay: string;
  lighting: string;
  palette: string;
  characterIds: string[];
  prompt: string;
  referenceImageUrl: string;
};
```

- [ ] **Step 4: 实现迁移、读取和确认前校验**

`lib/productionAssets.ts` 必须导出：

```ts
export function charactersFromWorkspace(workspace: WorkspaceSnapshot | null): CharacterAsset[];
export function productionScenesFromWorkspace(workspace: WorkspaceSnapshot | null): SceneAsset[];
export function migrateLegacyProductionAssets(workspace: WorkspaceSnapshot): WorkspaceSnapshot;
export function validateStageAssets(stage: ProductionStageId, workspace: WorkspaceSnapshot): string[];
export function replaceCharacterVariantImage(
  workspace: WorkspaceSnapshot,
  characterId: string,
  variantId: string,
  kind: 'portrait' | 'multi_view' | 'expression_sheet',
  imageUrl: string
): WorkspaceSnapshot;
export function replaceSceneImage(workspace: WorkspaceSnapshot, sceneId: string, imageUrl: string): WorkspaceSnapshot;
```

旧工作区迁移规则固定为：优先读取 `characters.json`；不存在时从 `asset_prompts.json.characters/roles/characterConsistency` 构造；按 prompt 的 `sceneId/renderTask/referenceImageUrl` 补齐年龄变体与场景图片；迁移不删除旧 `asset_prompts.json`，只新增角色文件并增强 `scenes.json`。

- [ ] **Step 5: 初始化流程文件**

`createBlankWorkspace()` 新增 `production_flow.json`，初始 `script` 为 `locked`、其余阶段为 `locked`，`currentStage` 为 `script`。不预创建 `characters.json` 或场景文件。

- [ ] **Step 6: 运行测试**

Run: `node --test lib/productionAssets.test.cjs lib/productionFlow.test.cjs`

Expected: PASS，旧“小澎”项目能无损迁移，缺图资产不能确认。

- [ ] **Step 7: 记录检查点**

```bash
git add lib/types.ts lib/productionAssets.ts lib/productionAssets.test.cjs lib/defaultWorkspace.ts
git commit -m "feat: separate character and scene assets"
```

### Task 4: 让 Agent 每次只生成一个阶段

**Files:**
- Create: `lib/stageGeneration.ts`
- Create: `lib/stageGeneration.test.cjs`
- Modify: `lib/types.ts`
- Modify: `lib/agentProvider.ts`
- Modify: `lib/agentProvider.language.test.cjs`

- [ ] **Step 1: 写阶段隔离失败测试**

```js
test('each stage has an explicit workflow and output allowlist', () => {
  assert.deepEqual(stageConfig('script').outputFiles, ['brief.json', 'campaign_goal.json', 'script.md']);
  assert.deepEqual(stageConfig('character').outputFiles, ['characters.json']);
  assert.deepEqual(stageConfig('scene').outputFiles, ['scenes.json']);
  assert.deepEqual(stageConfig('storyboard').outputFiles, ['storyboard.json', 'timeline.json']);
  assert.deepEqual(stageConfig('video').outputFiles, ['asset_prompts.json', 'video_spec.json']);
});

test('character generation cannot return scene or video task patches', async () => {
  const result = await runVideoAgent({
    instruction: '从已确认脚本生成角色资产',
    workspace: workspaceWith({ 'script.md': '# 测试脚本' }),
    history: [],
    workflow: 'prompt',
    productionStage: 'character',
    generationJobId: 'character-job-1',
    sourceVersions: { 'script.md': 1 }
  });
  assert.deepEqual(result.patchOperations.map((patch) => patch.filePath), ['characters.json']);
  assert.match(result.patchOperations[0].after, /"characters"/);
});

test('video generation reads confirmed source versions and only returns the task package', async () => {
  const result = await runVideoAgent({
    instruction: '从已确认制作包准备视频任务',
    workspace: workspaceWith({
      'script.md': '# 测试脚本',
      'characters.json': '{"characters":[]}',
      'scenes.json': '{"scenes":[]}',
      'storyboard.json': '{"scenes":[]}'
    }),
    history: [],
    workflow: 'prompt',
    productionStage: 'video',
    generationJobId: 'video-job-1',
    sourceVersions: { 'script.md': 2, 'characters.json': 3, 'scenes.json': 4, 'storyboard.json': 5 }
  });
  assert.deepEqual(result.patchOperations.map((patch) => patch.filePath).sort(), ['asset_prompts.json', 'video_spec.json']);
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test lib/stageGeneration.test.cjs lib/agentProvider.language.test.cjs`

Expected: FAIL，`productionStage` 尚未进入 Agent 请求。

- [ ] **Step 3: 扩展 Agent 请求元数据**

```ts
export type AgentRunRequest = {
  instruction: string;
  workspace: WorkspaceSnapshot;
  history: AgentMessage[];
  workflow?: WorkflowKind;
  productionStage?: ProductionStageId;
  generationJobId?: string;
  sourceVersions?: Record<string, number>;
};
```

- [ ] **Step 4: 实现阶段配置**

`lib/stageGeneration.ts` 使用固定映射，不从按钮文案猜阶段：

```ts
export type StageGenerationConfig = {
  workflow: WorkflowKind;
  outputFiles: string[];
};

const STAGE_CONFIG = {
  script: { workflow: 'script', outputFiles: ['brief.json', 'campaign_goal.json', 'script.md'] },
  character: { workflow: 'prompt', outputFiles: ['characters.json'] },
  scene: { workflow: 'scene', outputFiles: ['scenes.json'] },
  storyboard: { workflow: 'shot', outputFiles: ['storyboard.json', 'timeline.json'] },
  video: { workflow: 'prompt', outputFiles: ['asset_prompts.json', 'video_spec.json'] }
} as const;

export function stageConfig(stage: ProductionStageId): StageGenerationConfig;
export function sourceVersionsForStage(workspace: WorkspaceSnapshot, stage: ProductionStageId): Record<string, number>;
export function stageGenerationInstruction(stage: ProductionStageId, videoSpecText: string): string;
export function filterStagePatches(stage: ProductionStageId, patches: PatchOperation[]): PatchOperation[];
export function isProductionStageFile(path: string): boolean;
```

角色指令必须要求 `characters.json` 包含必需角色、年龄变体、服装、Face ID、表情范围、主图提示词和避免项；场景指令必须要求地点、时间、光线、色彩、出场角色、脚本段落和主图提示词；视频指令只能使用已确认的四个上游版本。

- [ ] **Step 5: 修改 `lib/agentProvider.ts`**

1. 在 system prompt 的 canonical files 中加入 `characters.json` 和 `production_flow.json`。
2. 新增 `charactersFor(req)` 作为本地/模型缺失时的确定性兜底。
3. `normalizeResponse()` 在 `req.productionStage` 存在时只保留 `stageConfig(stage).outputFiles`。
4. 每个阶段只 `ensure` 自己的必需文件，不再每次补齐完整制作包。
5. `asset_prompts.json` 不再作为角色阶段的主文件，但继续包含视频模型需要的已确认角色一致性摘要。

- [ ] **Step 6: 运行测试**

Run: `node --test lib/stageGeneration.test.cjs lib/agentProvider.language.test.cjs`

Expected: PASS；角色请求只返回 `characters.json`，视频请求只返回任务包和规格。

- [ ] **Step 7: 记录检查点**

```bash
git add lib/types.ts lib/stageGeneration.ts lib/stageGeneration.test.cjs lib/agentProvider.ts lib/agentProvider.language.test.cjs
git commit -m "feat: scope agent output by production stage"
```

### Task 5: 接通生成、失败、重试和阶段确认事务

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/page.model-config-ui.test.cjs`

- [ ] **Step 1: 写页面行为失败测试**

在 `app/page.model-config-ui.test.cjs` 增加源码契约：

```js
test('stage confirmation consumes drafts and starts exactly one downstream job', () => {
  assert.match(source, /async function confirmProductionStage\(stage: ProductionStageId\)/);
  assert.match(source, /validateStageAssets\(stage, proposedWorkspace\)/);
  assert.match(source, /confirmStageInWorkspace\(workspace/);
  assert.match(source, /expectedDraftVersion/);
  assert.match(source, /confirmationKey/);
  assert.match(source, /requestStageDraft\(nextStage/);
});

test('late stage responses are rejected before their patches become visible', () => {
  assert.match(source, /completeStageGeneration\(/);
  assert.match(source, /if \(!completion\.accepted\) return current/);
  assert.match(source, /appendPendingPatches\(current, scopedPatches\)/);
});

test('autopilot never merges production stage patches', () => {
  assert.match(source, /!isProductionStageFile\(patch\.filePath\)/);
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test app/page.model-config-ui.test.cjs`

Expected: FAIL，页面仍然只调用 `focusStudioStage()`。

- [ ] **Step 3: 用持久 Patch 替换 `lastRun` 真相**

页面保留 `lastRun` 只显示日志；`pendingPatches` 改为：

```ts
const persistedPatches = useMemo(() => readPendingPatches(workspace), [workspace]);
const pendingPatches = persistedPatches;
const proposedWorkspace = useMemo(
  () => applyPatchesForPreview(workspace, persistedPatches),
  [workspace, persistedPatches]
);
```

模型响应成功后把当前阶段允许的 Patch 写入 `.aigc/pending_patches.json`，再调用 `completeStageGeneration`。页面刷新后由 `safeLoadWorkspace()` 同时恢复流程和 Patch。

主输入框提交新 Mission 时固定调用 `requestStageDraft('script', requestWorkspace)`；已进入生产流程后的节点修改固定使用当前节点的 `ProductionStageId`。不得再让通用 `runAgent()` 一次生成整个制作包。

- [ ] **Step 4: 实现阶段生成函数**

```ts
async function requestStageDraft(
  stage: ProductionStageId,
  baseWorkspace: WorkspaceSnapshot,
  generationJobId = uid(`${stage}-job`)
) {
  const sourceVersions = sourceVersionsForStage(baseWorkspace, stage);
  setWorkspace((current) => current ? writeProductionFlow(
    current,
    beginStageGeneration(productionFlowFromWorkspace(current), stage, generationJobId, sourceVersions)
  ) : current);

  try {
    const response = await fetch('/api/agent/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        instruction: stageGenerationInstruction(stage, buildSpecInstruction(videoSpec)),
        workspace: baseWorkspace,
        history: messages.slice(-10),
        workflow: stageConfig(stage).workflow,
        productionStage: stage,
        generationJobId,
        sourceVersions
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `${studioStageName(stage)}生成失败`);
    const scopedPatches = filterStagePatches(stage, result.patchOperations);
    setWorkspace((current) => {
      if (!current) return current;
      const completion = completeStageGeneration(
        productionFlowFromWorkspace(current), stage, generationJobId, sourceVersions
      );
      if (!completion.accepted) return current;
      return writeProductionFlow(appendPendingPatches(current, scopedPatches), completion.flow);
    });
    setLastRun({ ...result, patchOperations: scopedPatches });
  } catch (error) {
    setWorkspace((current) => current ? writeProductionFlow(
      current,
      failStageGeneration(
        productionFlowFromWorkspace(current),
        stage,
        generationJobId,
        error instanceof Error ? error.message : `${studioStageName(stage)}生成失败`
      )
    ) : current);
  }
}
```

请求体必须把 `productionStage`、`generationJobId` 和 `sourceVersions` 发到 `/api/agent/run`。

- [ ] **Step 5: 实现一次性确认事务**

```ts
async function confirmProductionStage(stage: ProductionStageId) {
  if (!workspace || !proposedWorkspace) return;
  const issues = validateStageAssets(stage, proposedWorkspace);
  if (issues.length) {
    setError(issues.join('；'));
    return;
  }

  const flow = productionFlowFromWorkspace(workspace);
  const draftVersion = flow.stages[stage].draftVersion;
  const nextStage = nextProductionStage(stage);
  const nextJobId = nextStage ? uid(`${nextStage}-job`) : null;
  const confirmationKey = `${stage}:${draftVersion}:${workspace.projectId}`;
  if (draftVersion == null) return;
  const transaction = confirmStageInWorkspace(workspace, {
    stage,
    outputFiles: stageConfig(stage).outputFiles,
    expectedDraftVersion: draftVersion,
    confirmationKey,
    confirmedAt: now(),
    confirmedBy: 'local-user',
    nextGenerationJobId: nextJobId,
    sourceVersions: sourceVersionsForStage(proposedWorkspace, stage)
  });
  setWorkspace(transaction.workspace);
  if (nextStage && nextJobId) await requestStageDraft(nextStage, transaction.workspace, nextJobId);
}
```

`confirmStageInWorkspace()` 先消费当前阶段 Patch，再写确认版本并返回新工作区；页面不依赖异步 `setState` 给闭包赋值，避免 React 批处理导致下一阶段读取旧版本。

确认事务成功后立即 `focusStudioStage(nextStage)`，让画板移动到生成骨架；下一阶段返回后保持同一阶段焦点，不自动跳过审查。

- [ ] **Step 6: 修正托管模式和节点修改**

- 托管模式自动合并过滤条件增加 `!isProductionStageFile(patch.filePath)`。
- 修改已确认节点时，生成新草稿并调用 `markStageDraft`，下游立即 `stale`。
- 失败节点的“重新生成”必须创建新 `generationJobId`。
- 删除 `continueFromDecision()` 里仅切换标签的实现，主按钮统一调用 `confirmProductionStage(selectedNode.stage)`。

- [ ] **Step 7: 运行测试**

Run: `node --test app/page.model-config-ui.test.cjs lib/productionFlow.test.cjs lib/workspaceDrafts.test.cjs`

Expected: PASS，确认、重试、失效和迟到结果均有测试证据。

- [ ] **Step 8: 记录检查点**

```bash
git add app/page.tsx app/page.model-config-ui.test.cjs
git commit -m "feat: wire stage generation and confirmation transactions"
```

### Task 6: 生成并确认真实角色图与场景图

**Files:**
- Modify: `app/page.tsx`
- Modify: `lib/productionAssets.ts`
- Modify: `lib/productionAssets.test.cjs`
- Modify: `app/page.model-config-ui.test.cjs`

- [ ] **Step 1: 写图片资产生命周期失败测试**

```js
test('character and scene image jobs update only their own draft assets', () => {
  const fixture = workspaceWith({
    'characters.json': JSON.stringify({ characters: [{
      id: 'xiaopeng', variants: [{ id: 'primary', primaryImageUrl: '' }]
    }] }),
    'scenes.json': JSON.stringify({ scenes: [{ id: 'scene-1', referenceImageUrl: '' }] })
  });
  const characterNext = applyStageImageResult(fixture, {
    stage: 'character', assetId: 'xiaopeng', variantId: 'primary', kind: 'portrait', imageUrl: 'https://img/primary.png'
  });
  assert.equal(parseFile(characterNext, 'characters.json').characters[0].variants[0].primaryImageUrl, 'https://img/primary.png');
  assert.equal(fileVersion(characterNext, 'scenes.json'), fileVersion(fixture, 'scenes.json'));

  const sceneNext = applyStageImageResult(fixture, {
    stage: 'scene', assetId: 'scene-1', imageUrl: 'https://img/scene-1.png'
  });
  assert.equal(parseFile(sceneNext, 'scenes.json').scenes[0].referenceImageUrl, 'https://img/scene-1.png');
});
```

页面静态测试必须匹配 `generateMissingCharacterImages`、`generateMissingSceneImages`、`/api/image/render`、`重新生成场景图` 和 `替换场景图`。

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test lib/productionAssets.test.cjs app/page.model-config-ui.test.cjs`

Expected: FAIL，场景仍只有文本 tile。

- [ ] **Step 3: 生成阶段首批图片**

角色 Agent 返回 `characters.json` 后，按 `required === true` 的角色和变体构建图片任务；场景 Agent 返回 `scenes.json` 后，按缺少 `referenceImageUrl` 的场景构建任务。最多同时执行 2 个 `/api/image/render` 请求，单个失败不删除成功图片。

```ts
async function generateMissingCharacterImages(workspace: WorkspaceSnapshot) {
  const jobs = missingCharacterImageJobs(workspace);
  for (let index = 0; index < jobs.length; index += 2) {
    const batch = jobs.slice(index, index + 2);
    const results = await Promise.allSettled(batch.map(renderStageImage));
    persistSettledStageImages('character', batch, results);
  }
}

async function generateMissingSceneImages(workspace: WorkspaceSnapshot) {
  const jobs = missingSceneImageJobs(workspace);
  for (let index = 0; index < jobs.length; index += 2) {
    const batch = jobs.slice(index, index + 2);
    const results = await Promise.allSettled(batch.map(renderStageImage));
    persistSettledStageImages('scene', batch, results);
  }
}
```

同一任务内使用以下固定任务类型：

```ts
export type StageImageJob = {
  stage: 'character' | 'scene';
  assetId: string;
  variantId?: string;
  kind?: 'portrait' | 'multi_view' | 'expression_sheet';
  prompt: string;
  negativePrompt: string;
};

export function missingCharacterImageJobs(workspace: WorkspaceSnapshot): StageImageJob[];
export function missingSceneImageJobs(workspace: WorkspaceSnapshot): StageImageJob[];
export function applyStageImageResult(
  workspace: WorkspaceSnapshot,
  result: StageImageJob & { imageUrl: string }
): WorkspaceSnapshot;
```

页面的 `renderStageImage(job)` 使用 `POST /api/image/render`，请求体固定为 `{ prompt, negativePrompt }`，非 2xx 时抛出服务端 `error`。`persistSettledStageImages(stage, jobs, results)` 以当前 `proposedWorkspace` 为基线依次应用 fulfilled 结果，再把 `characters.json` 或 `scenes.json` 的完整 before/after 写成一个最新待审 Patch；rejected 原因写入阶段错误提示，不覆盖成功 URL。

图片结果写回对应待审 Patch，不直接确认阶段。图片模型未配置时，阶段进入 `failed`，保留文字设定并显示可重试原因。

角色和场景是两段式生成：Agent 文字 Patch 先持久化，但阶段保持 `generating`；图片任务全部成功后才调用 `completeStageGeneration()` 进入 `ready_for_review`。只要一个必需主图失败，就调用 `failStageGeneration()`，已成功图片仍留在草稿 Patch 中，重试只请求缺失图片。

- [ ] **Step 4: 场景卡补齐操作**

每个场景卡显示图片、地点、时间、光线、色彩、出场角色和脚本段落；提供“重新生成场景图”和文件上传“替换场景图”。角色卡继续使用现有 Face ID、年龄阶段、多视角、表情和替换操作，但写入目标从 `asset_prompts.json` 改为 `characters.json`。

- [ ] **Step 5: 确认按钮使用真实校验结果**

- 角色：所有 `required` 角色的所有 `required` 变体必须有 `primaryImageUrl`。
- 场景：每个核心场景必须有 `referenceImageUrl`。
- 按钮禁用时展示第一条缺失原因，不能只变灰。

- [ ] **Step 6: 运行测试**

Run: `node --test lib/productionAssets.test.cjs lib/characterDesign.test.cjs app/page.model-config-ui.test.cjs`

Expected: PASS；角色和场景图片只修改各自草稿文件，缺图不能确认。

- [ ] **Step 7: 记录检查点**

```bash
git add app/page.tsx lib/productionAssets.ts lib/productionAssets.test.cjs app/page.model-config-ui.test.cjs
git commit -m "feat: generate reviewable character and scene assets"
```

### Task 7: 把画板改成渐进式主工作区

**Files:**
- Create: `components/ProductionCanvas.tsx`
- Modify: `app/page.tsx`
- Modify: `app/globals.css`
- Modify: `app/page.model-config-ui.test.cjs`

- [ ] **Step 1: 写渐进画板失败测试**

```js
test('future stages are disabled and absent from the canvas', () => {
  assert.match(source, /canOpenProductionStage\(productionFlow, stage\.id\)/);
  assert.match(source, /disabled=\{!stageOpen\}/);
  assert.match(source, /未解锁/);
  assert.match(source, /visibleProductionStages\(productionFlow\)/);
  assert.match(source, /visibleCanvasNodes/);
});

test('the canvas owns visible assets instead of a duplicate proof strip below it', () => {
  assert.match(source, /<ProductionCanvas/);
  assert.doesNotMatch(source, /className="asset-proof-strip"/);
  assert.match(canvasSource, /production-stage-review/);
  assert.match(canvasSource, /production-next-skeleton/);
});

test('every stage has one primary confirmation action', () => {
  for (const label of [
    '确认脚本并生成角色',
    '确认角色并生成场景',
    '确认场景并生成分镜',
    '确认分镜并生成视频任务',
    '确认视频任务并开始生成'
  ]) assert.match(source, new RegExp(label));
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test app/page.model-config-ui.test.cjs`

Expected: FAIL，未来标签仍可点击且 `asset-proof-strip` 仍存在。

- [ ] **Step 3: 实现 `ProductionCanvas` 布局边界**

组件只负责布局和可访问性，不持有生产状态：

```tsx
import type { ReactNode } from 'react';
import type { ProductionStageId, ProductionStageStatus } from '../lib/types';

export type ProductionCanvasNode = {
  id: string;
  stage: ProductionStageId;
  title: string;
  summary: string;
  status: ProductionStageStatus;
  itemCount?: number;
};

type ProductionCanvasProps = {
  nodes: ProductionCanvasNode[];
  activeStage: ProductionStageId;
  nextGeneratingStage: ProductionStageId | null;
  reviewContent: ReactNode;
  onSelectNode: (node: ProductionCanvasNode) => void;
  onRegenerate: (node: ProductionCanvasNode) => void;
  onReplace: (node: ProductionCanvasNode) => void;
};

export default function ProductionCanvas(props: ProductionCanvasProps) {
  return (
    <section className="production-canvas" aria-label="渐进式视频生产画板">
      <div className="production-canvas-track">
        {props.nodes.map((node) => (
          <article className={`production-node ${node.status}`} key={node.id}>
            <button type="button" className="production-node-main" onClick={() => props.onSelectNode(node)}>
              <span>{node.stage}</span>
              <strong>{node.title}</strong>
              <small>{node.summary}</small>
              {typeof node.itemCount === 'number' && <em>{node.itemCount} 项</em>}
            </button>
            <div className="production-node-actions">
              <button type="button" onClick={() => props.onRegenerate(node)} aria-label={`重新生成${node.title}`}>重新生成</button>
              <button type="button" onClick={() => props.onReplace(node)} aria-label={`替换${node.title}`}>替换</button>
            </div>
          </article>
        ))}
        {props.nextGeneratingStage && (
          <div className="production-next-skeleton" role="status">
            <span>{props.nextGeneratingStage}</span>
            <strong>生成中</strong>
          </div>
        )}
      </div>
      <section className="production-stage-review" aria-live="polite">
        {props.reviewContent}
      </section>
    </section>
  );
}
```

- [ ] **Step 4: 锁定顶部导航和画板节点**

`overview` 始终可进入；生产阶段按钮按 `canOpenProductionStage` 设置 `disabled`、`aria-disabled` 和锁定原因。画板节点只来自 `visibleProductionStages(flow)`；当前阶段生成时显示骨架，未来阶段不渲染节点。

- [ ] **Step 5: 移除重复长文区**

删除 `asset-proof-strip` 和主画板下方独立的长脚本/审批区。脚本全文、角色图、场景图、分镜卡和视频任务作为 `reviewContent` 进入画板；Patch Diff、依赖版本、日志和模型规格继续留在右侧检查器。

- 脚本阶段使用可编辑 `textarea` 显示完整正文；“保存修改”生成或替换 `script.md` 待审 Patch，不直接写入确认版本。
- 角色阶段复用现有 Face ID、年龄、多视角、表情和图片操作，并把唯一主确认按钮放在阶段底部操作条。
- 场景阶段显示图片、地点、时间、光线、色彩、出场角色和对应脚本段落。
- 分镜阶段每卡显示脚本段落、角色、场景、景别、运镜、动作、对白、时长和首帧引用。
- 右侧检查器增加 `confirmedVersion`、`confirmedAt`、`confirmedBy` 和 `sourceVersions`，高级用户可以看 Diff，但不能绕过阶段确认门。

- [ ] **Step 6: 调整 CSS 尺寸**

- `.production-canvas` 最小高度使用 `calc(100vh - var(--topbar-h) - 48px)`。
- 当前阶段资产区使用稳定的 `minmax()` 网格；角色和场景图片使用 `aspect-ratio`。
- 卡片圆角不超过 8px；画板背景保留深色网格但降低装饰噪声。
- 1024px 以下导航横向滚动，720px 以下阶段资产单列，按钮文字允许换行且不覆盖。
- 生成骨架固定尺寸，状态变化不得推动整个布局跳动。

- [ ] **Step 7: 运行测试**

Run: `node --test app/page.model-config-ui.test.cjs`

Expected: PASS，锁定导航、渐进节点、单一确认按钮和主画板资产均有源码回归。

- [ ] **Step 8: 记录检查点**

```bash
git add components/ProductionCanvas.tsx app/page.tsx app/globals.css app/page.model-config-ui.test.cjs
git commit -m "feat: make the production canvas progressive"
```

### Task 8: 给视频任务增加最终确认与逐镜状态

**Files:**
- Create: `lib/videoRenderBatch.ts`
- Create: `lib/videoRenderBatch.test.cjs`
- Modify: `components/runtime.tsx`
- Modify: `app/page.tsx`
- Modify: `app/page.model-config-ui.test.cjs`

- [ ] **Step 1: 写批量状态失败测试**

```js
test('a confirmed task package creates one render job per video prompt', () => {
  const jobs = createVideoRenderJobs([
    { id: 'shot-1', type: 'video', prompt: '镜头一' },
    { id: 'still-1', type: 'image', prompt: '首帧' },
    { id: 'shot-2', type: 'video', prompt: '镜头二' }
  ]);
  assert.deepEqual(jobs.map((job) => job.promptId), ['shot-1', 'shot-2']);
});

test('retry selection contains failed jobs only and keeps completed urls', () => {
  const jobs = [videoJob('completed', 'shot-1', 'https://video/1.mp4'), videoJob('failed', 'shot-2')];
  assert.deepEqual(retryableVideoJobs(jobs).map((job) => job.promptId), ['shot-2']);
  assert.equal(jobs[0].videoUrl, 'https://video/1.mp4');
});

test('the batch completes only when every render job completes', () => {
  assert.equal(videoBatchStatus([videoJob('completed', 'a'), videoJob('submitted', 'b')]), 'rendering');
  assert.equal(videoBatchStatus([videoJob('completed', 'a'), videoJob('failed', 'b')]), 'failed');
  assert.equal(videoBatchStatus([videoJob('completed', 'a'), videoJob('completed', 'b')]), 'clips_ready');
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test lib/videoRenderBatch.test.cjs app/page.model-config-ui.test.cjs`

Expected: FAIL，当前页面只有一个 `videoRender`。

- [ ] **Step 3: 实现批量任务纯函数**

`lib/videoRenderBatch.ts` 导出：

```ts
export type VideoPromptInput = {
  id?: string;
  type?: string;
  prompt?: string;
};

export function createVideoRenderJobs(prompts: VideoPromptInput[]): VideoRenderJob[];
export function updateVideoRenderJob(jobs: VideoRenderJob[], id: string, patch: Partial<VideoRenderJob>): VideoRenderJob[];
export function retryableVideoJobs(jobs: VideoRenderJob[]): VideoRenderJob[];
export function pendingVideoJobs(jobs: VideoRenderJob[]): VideoRenderJob[];
export function videoBatchStatus(jobs: VideoRenderJob[]): 'rendering' | 'failed' | 'clips_ready';
```

- [ ] **Step 4: 把“准备任务”和“提交模型”分开**

- 分镜确认只调用 Agent 生成 `asset_prompts.json`，视频阶段进入 `ready_for_review`。
- `VideoGenHandoff` 逐镜显示引用图、提示词、时长、模式和缺失依赖。
- 每个任务提供“修改提示词”“替换参考图”“重新准备此镜头”；操作只更新该镜头的 `asset_prompts.json` 待审 Patch。
- 只有点击“确认视频任务并开始生成”才创建 `videoJobs` 并调用 `/api/video/render`。
- 首版最大并发为 2，避免一次并发提交 12 个昂贵任务。
- 轮询使用一个批次定时器查询所有 `submitted/polling` 任务；页面卸载时清理定时器。
- 失败重试只提交 `failed` 任务，成功 URL 原样保留。

- [ ] **Step 5: 持久化视频进度到流程文件**

每次提交、轮询、完成或失败都调用：

```ts
setWorkspace((current) => current ? updateProductionFlow(current, (flow) => ({
  ...flow,
  currentStage: 'video',
  stages: {
    ...flow.stages,
    video: {
      ...flow.stages.video,
      status: videoBatchStatus(nextJobs) === 'failed' ? 'failed' : 'rendering',
      error: videoBatchStatus(nextJobs) === 'clips_ready'
        ? '全部片段已完成，等待合成为单一成片文件。'
        : null
    }
  },
  videoJobs: nextJobs
})) : current);
```

刷新后从 `production_flow.json.videoJobs` 恢复，不再依赖单独的 `videoRender` React 状态。

- [ ] **Step 6: 运行测试**

Run: `node --test lib/videoRenderBatch.test.cjs app/api/video/render/route.test.cjs app/page.model-config-ui.test.cjs`

Expected: PASS；视频模型调用只能从最终确认入口发生，部分失败可单独重试，片段齐全时不会误标为成片。

- [ ] **Step 7: 记录检查点**

```bash
git add lib/videoRenderBatch.ts lib/videoRenderBatch.test.cjs components/runtime.tsx app/page.tsx app/page.model-config-ui.test.cjs
git commit -m "feat: confirm and track video tasks per shot"
```

### Task 9: 迁移“小澎”演示项目并增加浏览器流程验收

**Files:**
- Modify: `outputs/xiaopeng-love-history-3min-v2/workspace.json`
- Modify: `app/api/demo-workspace/[id]/route.test.cjs`
- Modify: `scripts/qa/videoagent-flow-regression.cjs`

- [ ] **Step 1: 写演示迁移失败测试**

在 route test 中增加：

```js
const paths = body.workspace.files.map((file) => file.path);
assert.ok(paths.includes('production_flow.json'));
assert.ok(paths.includes('characters.json'));
const flow = JSON.parse(body.workspace.files.find((file) => file.path === 'production_flow.json').content);
assert.equal(flow.stages.script.status, 'ready_for_review');
assert.equal(flow.stages.character.status, 'locked');
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test 'app/api/demo-workspace/[id]/route.test.cjs'`

Expected: FAIL，演示工作区尚未包含两个新文件。

- [ ] **Step 3: 执行确定性迁移**

使用 `migrateLegacyProductionAssets()` 生成 `characters.json` 和增强场景引用；写入初始流程：脚本 `ready_for_review`，角色/场景/分镜/视频 `locked`，不把已有下游文件误标为已确认。保留 12 个视频任务、5 个年龄参考图和现有 clip 文件，不重新生成媒体。

- [ ] **Step 4: 扩展浏览器 QA**

`scripts/qa/videoagent-flow-regression.cjs` 增加无需真实模型的 demo 检查：

1. 打开 `/?demo=xiaopeng-v2`。
2. 断言脚本全文可见。
3. 断言角色、场景、分镜、视频导航为 disabled。
4. 点击“确认脚本并生成角色”前拦截 `/api/agent/run`，返回固定 `characters.json` Patch。
5. 断言角色节点出现，角色图片和表情控制可见，场景仍锁定。
6. 依次返回固定场景、分镜和视频任务 Patch，验证每次只解锁下一阶段。
7. 在视频任务确认前拦截并断言 `/api/video/render` 调用次数为 0。
8. 截取桌面 1440×1000 和移动 390×844 两张图，检查没有水平溢出或按钮重叠。

- [ ] **Step 5: 运行演示和浏览器验收**

Run: `node --test 'app/api/demo-workspace/[id]/route.test.cjs'`

Expected: PASS。

Run: `QA_BASE_URL=http://127.0.0.1:3001 npm run qa:flow -- --out outputs/qa-progressive-flow`

Expected: PASS，并生成桌面/移动截图和 JSON 报告；控制台无未处理异常。

- [ ] **Step 6: 记录检查点**

```bash
git add outputs/xiaopeng-love-history-3min-v2/workspace.json 'app/api/demo-workspace/[id]/route.test.cjs' scripts/qa/videoagent-flow-regression.cjs
git commit -m "test: cover progressive production flow"
```

### Task 10: 全量验证与人工验收

**Files:**
- Verify only

- [ ] **Step 1: 运行全部 Node 测试**

Run: `node --test $(rg --files -g '*.test.cjs' | sort)`

Expected: 全部 PASS，无跳过和未处理 Promise rejection。

- [ ] **Step 2: 运行 TypeScript 检查**

Run: `npm run typecheck`

Expected: exit 0，无 TypeScript 错误。

- [ ] **Step 3: 运行生产构建**

Run: `npm run build`

Expected: exit 0，Next.js 页面和 API routes 全部构建成功。

- [ ] **Step 4: 浏览器人工验收**

在 `http://127.0.0.1:3001/?demo=xiaopeng-v2` 按以下顺序检查：

1. 首屏只要求审查完整脚本，未来阶段不可点击。
2. 脚本确认后才出现真实角色资产；角色缺少主图时确认按钮不可用且显示原因。
3. 角色确认后才出现带图片、地点、时间、光线和人物的场景卡。
4. 场景确认后才出现分镜；分镜确认后只出现待审视频任务，不调用视频模型。
5. 视频任务最终确认后才提交镜头任务，并显示每镜头状态。
6. 修改脚本后，角色到视频全部显示“需重审”，旧资产仍可比较但不能生成视频。
7. 刷新页面后当前阶段、确认版本、待审 Patch 和视频任务状态都恢复。
8. 协作与托管模式都不能自动越过确认门。

- [ ] **Step 5: 检查视觉与响应式**

- 画板是首要工作区，不再出现画板下方重复长脚本区。
- 当前阶段在桌面和移动端都能看到主操作按钮。
- 顶部导航锁定原因可读，文字不溢出，图片不拉伸。
- 角色卡、场景卡、分镜卡和视频任务卡有稳定尺寸，加载与错误状态不引起布局跳动。
- 页面控制台无 React key、hydration、图片加载或未捕获请求错误。

- [ ] **Step 6: 最终检查点**

当前目录无 Git，保存测试命令、通过数量和截图路径。若目录恢复 Git：

```bash
git add app components lib scripts outputs docs/superpowers
git commit -m "feat: ship progressive production confirmation flow"
```

## 完成定义

只有同时满足以下条件才算完成：

- `production_flow.json` 在刷新后仍能恢复状态和版本；
- 每次 Agent 响应只修改当前阶段允许的文件；
- 脚本、角色、场景、分镜和视频任务都有真实可见资产与唯一确认入口；
- 未来阶段不可跳过，上游修改会让全部下游进入 `stale`；
- 角色和场景缺图时不能确认；
- 视频任务确认前 `/api/video/render` 调用次数为 0；
- 迟到结果、重复确认和失败重试不会覆盖当前版本；
- 全量测试、类型检查、生产构建、桌面/移动浏览器验收全部通过；
- 不把多个已完成片段误称为单一三分钟成片。
