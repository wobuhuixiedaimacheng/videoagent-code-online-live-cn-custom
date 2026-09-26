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

