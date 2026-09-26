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

