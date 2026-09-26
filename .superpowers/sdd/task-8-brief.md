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

