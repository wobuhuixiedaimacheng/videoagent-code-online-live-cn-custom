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

