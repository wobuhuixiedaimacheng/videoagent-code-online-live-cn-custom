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

