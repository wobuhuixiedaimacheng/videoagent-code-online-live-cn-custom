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

