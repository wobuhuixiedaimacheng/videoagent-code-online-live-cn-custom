const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const { parseFile, workspaceWith } = require('./testFixtures.cjs');

function loadProductionAssetsModule() {
  const filePath = path.join(__dirname, 'productionAssets.ts');
  assert.equal(fs.existsSync(filePath), true, 'productionAssets.ts should exist');
  const source = fs.readFileSync(filePath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020
    }
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, { module, exports: module.exports, require }, { filename: filePath });
  return module.exports;
}

function loadDefaultWorkspaceModule() {
  const filePath = path.join(__dirname, 'defaultWorkspace.ts');
  const source = fs.readFileSync(filePath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020
    }
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, { module, exports: module.exports }, { filename: filePath });
  return module.exports;
}

function fileFor(workspace, path) {
  return workspace.files.find((file) => file.path === path);
}

function productionAssetWorkspace(contents) {
  return workspaceWith(contents);
}

test('legacy characters migrate out of asset prompts with age-stage references', () => {
  const { migrateLegacyProductionAssets } = loadProductionAssetsModule();
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
  assert.ok(migrated.files.some((file) => file.path === 'asset_prompts.json'));
});

test('legacy scene references migrate by scene id', () => {
  const { migrateLegacyProductionAssets } = loadProductionAssetsModule();
  const fixture = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'outputs', 'xiaopeng-love-history-3min-v2', 'workspace.json'),
    'utf8'
  ));
  const migrated = migrateLegacyProductionAssets(fixture);
  const scenes = parseFile(migrated, 'scenes.json').scenes;
  assert.ok(scenes.every((scene) => scene.referenceImageUrl));
});

test('character confirmation requires a primary image for every required variant', () => {
  const { validateStageAssets } = loadProductionAssetsModule();
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
  assert.deepEqual(Array.from(result), ['小澎的大学主图尚未生成']);
});

test('scene confirmation requires visible scene references and storyboard requires durations', () => {
  const { validateStageAssets } = loadProductionAssetsModule();
  assert.deepEqual(Array.from(validateStageAssets('scene', workspaceWith({
    'scenes.json': JSON.stringify({ scenes: [{ id: 'scene-1', title: '场景 1', referenceImageUrl: '' }] })
  }))), ['场景 1 尚未生成主图']);
  assert.deepEqual(Array.from(validateStageAssets('storyboard', workspaceWith({
    'storyboard.json': JSON.stringify({ scenes: [{ id: 'shot-1', title: '镜头 1', durationSeconds: 0 }] })
  }))), ['镜头 1 缺少有效时长']);
});

test('blank workspaces persist only the production flow and no prebuilt production assets', () => {
  const { createBlankWorkspace } = loadDefaultWorkspaceModule();
  const workspace = createBlankWorkspace();
  const paths = workspace.files.map((file) => file.path);
  const flow = parseFile(workspace, 'production_flow.json');
  assert.equal(flow.currentStage, 'script');
  assert.deepEqual(Object.values(flow.stages).map((stage) => stage.status), [
    'locked', 'locked', 'locked', 'locked', 'locked'
  ]);
  assert.equal(paths.includes('characters.json'), false);
  assert.equal(paths.includes('scenes.json'), false);
});

test('confirmation rejects empty asset arrays and character files without a required character', () => {
  const { validateStageAssets } = loadProductionAssetsModule();
  assert.deepEqual(Array.from(validateStageAssets('character', productionAssetWorkspace({
    'characters.json': JSON.stringify({ characters: [] })
  }))), ['角色资产列表为空']);
  assert.deepEqual(Array.from(validateStageAssets('character', productionAssetWorkspace({
    'characters.json': JSON.stringify({ characters: [{ id: 'support', name: '配角', required: false, variants: [] }] })
  }))), ['至少需要一个必需角色']);
  assert.deepEqual(Array.from(validateStageAssets('scene', productionAssetWorkspace({
    'scenes.json': JSON.stringify({ scenes: [] })
  }))), ['场景资产列表为空']);
  assert.deepEqual(Array.from(validateStageAssets('storyboard', productionAssetWorkspace({
    'storyboard.json': JSON.stringify({ scenes: [] })
  }))), ['分镜资产列表为空']);
});

test('legacy migration is idempotent after it has normalized the fixture', () => {
  const { migrateLegacyProductionAssets } = loadProductionAssetsModule();
  const fixture = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'outputs', 'xiaopeng-love-history-3min-v2', 'workspace.json'),
    'utf8'
  ));
  const once = migrateLegacyProductionAssets(fixture);
  const twice = migrateLegacyProductionAssets(once);
  assert.strictEqual(twice, once);
  assert.strictEqual(fileFor(twice, 'characters.json'), fileFor(once, 'characters.json'));
  assert.strictEqual(fileFor(twice, 'scenes.json'), fileFor(once, 'scenes.json'));
});

test('character image replacement changes only characters and no-ops for unchanged or unknown targets', () => {
  const { migrateLegacyProductionAssets, replaceCharacterVariantImage } = loadProductionAssetsModule();
  const fixture = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'outputs', 'xiaopeng-love-history-3min-v2', 'workspace.json'),
    'utf8'
  ));
  const workspace = migrateLegacyProductionAssets(fixture);
  const beforeCharacters = fileFor(workspace, 'characters.json');
  const beforeScenes = fileFor(workspace, 'scenes.json');
  const updated = replaceCharacterVariantImage(workspace, 'xiaopeng', 'college', 'portrait', 'new-college-image');
  assert.equal(fileFor(updated, 'characters.json').version, beforeCharacters.version + 1);
  assert.strictEqual(fileFor(updated, 'scenes.json'), beforeScenes);
  assert.equal(parseFile(updated, 'characters.json').characters[0].variants[4].primaryImageUrl, 'new-college-image');
  assert.strictEqual(
    replaceCharacterVariantImage(updated, 'xiaopeng', 'college', 'portrait', 'new-college-image'),
    updated
  );
  assert.strictEqual(
    replaceCharacterVariantImage(updated, 'missing-character', 'college', 'portrait', 'another-image'),
    updated
  );
  assert.strictEqual(
    replaceCharacterVariantImage(updated, 'xiaopeng', 'missing-variant', 'portrait', 'another-image'),
    updated
  );
});

test('scene image replacement changes only scenes and no-ops for unchanged or unknown targets', () => {
  const { migrateLegacyProductionAssets, replaceSceneImage } = loadProductionAssetsModule();
  const fixture = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'outputs', 'xiaopeng-love-history-3min-v2', 'workspace.json'),
    'utf8'
  ));
  const workspace = migrateLegacyProductionAssets(fixture);
  const beforeCharacters = fileFor(workspace, 'characters.json');
  const beforeScenes = fileFor(workspace, 'scenes.json');
  const updated = replaceSceneImage(workspace, 'xp_v2_01_kindergarten_meet', 'new-scene-image');
  assert.equal(fileFor(updated, 'scenes.json').version, beforeScenes.version + 1);
  assert.strictEqual(fileFor(updated, 'characters.json'), beforeCharacters);
  assert.equal(parseFile(updated, 'scenes.json').scenes[0].referenceImageUrl, 'new-scene-image');
  assert.strictEqual(replaceSceneImage(updated, 'xp_v2_01_kindergarten_meet', 'new-scene-image'), updated);
  assert.strictEqual(replaceSceneImage(updated, 'missing-scene', 'another-image'), updated);
});

test('invalid characters JSON remains intact and blocks migration and confirmation', () => {
  const { migrateLegacyProductionAssets, validateStageAssets } = loadProductionAssetsModule();
  const workspace = productionAssetWorkspace({
    'asset_prompts.json': JSON.stringify({ characters: [{ id: 'legacy', name: '旧角色' }] }),
    'characters.json': '{ invalid characters json'
  });
  const migrated = migrateLegacyProductionAssets(workspace);
  assert.strictEqual(migrated, workspace);
  assert.equal(fileFor(migrated, 'characters.json').content, '{ invalid characters json');
  assert.deepEqual(Array.from(validateStageAssets('character', migrated)), ['角色资产文件无法解析']);
});

test('invalid scenes JSON remains intact and blocks migration and confirmation', () => {
  const { migrateLegacyProductionAssets, validateStageAssets } = loadProductionAssetsModule();
  const workspace = productionAssetWorkspace({
    'characters.json': JSON.stringify({ characters: [] }),
    'asset_prompts.json': JSON.stringify({ prompts: [] }),
    'scenes.json': '{ invalid scenes json'
  });
  const migrated = migrateLegacyProductionAssets(workspace);
  assert.strictEqual(migrated, workspace);
  assert.equal(fileFor(migrated, 'scenes.json').content, '{ invalid scenes json');
  assert.deepEqual(Array.from(validateStageAssets('scene', migrated)), ['场景资产文件无法解析']);
});

test('legacy migration selects one explicit primary subject and deduplicates characters and roles', () => {
  const { migrateLegacyProductionAssets } = loadProductionAssetsModule();
  const workspace = productionAssetWorkspace({
    'asset_prompts.json': JSON.stringify({
      characterConsistency: { primarySubject: '小红' },
      characters: [
        { id: 'xiaopeng', name: '小澎', role: '主角' },
        { id: 'xiaohong', name: '小红' },
        { id: 'shared', name: '重复角色' }
      ],
      roles: [
        { id: 'shared', name: '重复角色（角色表）' },
        { name: '无 ID 角色' },
        { name: ' 无  ID  角色 ' }
      ],
      prompts: []
    })
  });
  const characters = parseFile(migrateLegacyProductionAssets(workspace), 'characters.json').characters;
  assert.deepEqual(characters.map((character) => character.id), ['xiaopeng', 'xiaohong', 'shared', 'character-4']);
  assert.deepEqual(characters.filter((character) => character.required).map((character) => character.id), ['xiaohong']);
});

test('legacy migration falls back to the first deduplicated character when no primary marker exists', () => {
  const { migrateLegacyProductionAssets } = loadProductionAssetsModule();
  const workspace = productionAssetWorkspace({
    'asset_prompts.json': JSON.stringify({
      characters: [{ id: 'first', name: '甲' }, { id: 'second', name: '乙' }],
      roles: [{ id: 'first', name: '重复甲' }],
      prompts: []
    })
  });
  const characters = parseFile(migrateLegacyProductionAssets(workspace), 'characters.json').characters;
  assert.deepEqual(characters.filter((character) => character.required).map((character) => character.id), ['first']);
});

test('legacy migration merges an id record with a same-name idless role and preserves both records fields', () => {
  const { migrateLegacyProductionAssets } = loadProductionAssetsModule();
  const workspace = productionAssetWorkspace({
    'asset_prompts.json': JSON.stringify({
      characterConsistency: { primarySubject: '同名角色' },
      characters: [{
        id: 'lead-id', name: '同名角色', description: '来自 characters 的完整描述',
        consistencyPrompt: '来自 characters 的一致性'
      }],
      roles: [{
        name: ' 同名角色 ', role: '主角', negativePrompt: '来自 roles 的负面提示'
      }],
      prompts: []
    })
  });
  const characters = parseFile(migrateLegacyProductionAssets(workspace), 'characters.json').characters;
  assert.equal(characters.length, 1);
  assert.equal(characters[0].id, 'lead-id');
  assert.equal(characters[0].name, '同名角色');
  assert.equal(characters[0].role, '主角');
  assert.equal(characters[0].description, '来自 characters 的完整描述');
  assert.equal(characters[0].consistencyPrompt, '来自 characters 的一致性');
  assert.equal(characters[0].negativePrompt, '来自 roles 的负面提示');
});

test('character image replacement preserves unknown JSON fields with a minimal round trip', () => {
  const { replaceCharacterVariantImage } = loadProductionAssetsModule();
  const workspace = productionAssetWorkspace({
    'characters.json': JSON.stringify({
      schemaExtension: { source: 'future-version' },
      characters: [{
        id: 'character-1', name: '角色一', required: true, customCharacterField: 'keep-character',
        variants: [{
          id: 'college', label: '大学', ageLabel: '21 岁', wardrobe: '便装', primaryImageUrl: 'old-image',
          customVariantField: { keep: true }
        }]
      }]
    })
  });
  const updated = replaceCharacterVariantImage(workspace, 'character-1', 'college', 'portrait', 'new-image');
  const file = parseFile(updated, 'characters.json');
  assert.deepEqual(file.schemaExtension, { source: 'future-version' });
  assert.equal(file.characters[0].customCharacterField, 'keep-character');
  assert.deepEqual(file.characters[0].variants[0].customVariantField, { keep: true });
  assert.equal(file.characters[0].variants[0].primaryImageUrl, 'new-image');
});
