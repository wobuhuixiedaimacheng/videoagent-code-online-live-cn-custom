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

