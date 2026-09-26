const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const { fileVersion, parseFile, workspaceWith } = require('./testFixtures.cjs');

// productionAssets.ts 会 import 同目录的 .ts 模块，注入的 require 得认得这个扩展名。
function withTsRequire(run) {
  const previous = require.extensions['.ts'];
  require.extensions['.ts'] = (module, filePath) => {
    const source = fs.readFileSync(filePath, 'utf8');
    module._compile(
      ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
      }).outputText,
      filePath
    );
  };
  try {
    return run();
  } finally {
    if (previous) require.extensions['.ts'] = previous;
    else delete require.extensions['.ts'];
  }
}

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
  withTsRequire(() => vm.runInNewContext(output, { module, exports: module.exports, require }, { filename: filePath }));
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

// 人物一致性真正断裂的地方：场景图是纯文生图，脸是模型现编的，
// 而视频阶段拿场景图当首帧，于是视频里的人跟确认过的角色对不上。
test('scene images carry the cast face anchors so the scene keeps the confirmed faces', () => {
  const { missingSceneImageJobs } = loadProductionAssetsModule();
  const fixture = workspaceWith({
    'characters.json': JSON.stringify({
      characters: [
        {
          id: 'xiaopeng', name: '小澎', role: '主角', required: true,
          consistencyPrompt: '鹅蛋脸，黑色长发', negativePrompt: '不要换脸',
          faceAnchorVariantId: 'current',
          variants: [
            { id: 'college', label: '大学', primaryImageUrl: 'https://img/college.png' },
            { id: 'current', label: '现在', primaryImageUrl: 'https://img/anchor.png' }
          ]
        },
        {
          id: 'firstlove', name: '初恋', role: '配角', required: false,
          consistencyPrompt: '清瘦男生，短发', negativePrompt: '',
          faceAnchorVariantId: 'campus',
          variants: [{ id: 'campus', label: '校园', primaryImageUrl: 'https://img/firstlove.png' }]
        }
      ]
    }),
    'scenes.json': JSON.stringify({
      scenes: [{
        id: 'scene-2', title: '操场夜景', core: true, location: '操场', timeOfDay: '夜晚',
        lighting: '月光', palette: '冷色', characterIds: ['xiaopeng', 'firstlove'],
        mainImagePrompt: '两人并肩散步', referenceImageUrl: ''
      }]
    })
  });

  const [job] = missingSceneImageJobs(fixture);
  // 用 faceAnchorVariantId 指定的那张，不是 variants[0]。
  assert.deepEqual(JSON.parse(JSON.stringify(job.referenceImages)), ['https://img/anchor.png', 'https://img/firstlove.png']);
  assert.match(job.prompt, /长相必须与参考图完全一致/);
  assert.match(job.prompt, /小澎（主角）：鹅蛋脸，黑色长发/);
  assert.match(job.prompt, /初恋（配角）：清瘦男生，短发/);
  assert.doesNotMatch(job.prompt, /xiaopeng|firstlove/);
});

test('character and scene image jobs update only their own draft assets', () => {
  const { missingCharacterImageJobs, missingSceneImageJobs, applyStageImageResult } = loadProductionAssetsModule();
  const fixture = workspaceWith({
    'characters.json': JSON.stringify({
      characters: [{
        id: 'xiaopeng', name: '小澎', required: true, imagePrompt: '小澎真实人物设定',
        consistencyPrompt: '保持同一张脸', negativePrompt: '不要换脸',
        variants: [{
          id: 'primary', label: '小学', ageLabel: '10 岁', wardrobe: '小学校服',
          primaryImagePrompt: '小学小澎正面主图', primaryImageUrl: ''
        }]
      }]
    }),
    'scenes.json': JSON.stringify({
      scenes: [{
        id: 'scene-1', title: '教室相遇', core: true, location: '教室', timeOfDay: '白天',
        lighting: '自然光', palette: '暖色', characterIds: ['xiaopeng'],
        mainImagePrompt: '教室里的小澎', prompt: '教室里的小澎', referenceImageUrl: ''
      }]
    })
  });

  const characterJobs = missingCharacterImageJobs(fixture);
  const sceneJobs = missingSceneImageJobs(fixture);
  assert.deepEqual(JSON.parse(JSON.stringify(characterJobs)), [{
    stage: 'character', assetId: 'xiaopeng', variantId: 'primary', kind: 'portrait',
    prompt: '小学小澎正面主图\n年龄：10 岁。服装：小学校服。\n角色一致性：保持同一张脸。\n'
      + '人种与地域面孔：东亚面孔，中国人。这一条是身份锚点，任何镜头、任何阶段都不允许改变，也不要往混血或欧美长相上靠。',
    negativePrompt: '不要换脸'
  }]);
  // 出场角色写角色名和形象设定，不写角色 ID——模型读不懂 "xiaopeng" 是谁，
  // 只会自己现编一张脸，而视频阶段又拿场景图当首帧。
  assert.equal(sceneJobs.length, 1);
  assert.equal(sceneJobs[0].stage, 'scene');
  assert.equal(sceneJobs[0].assetId, 'scene-1');
  // 人种跟在一致性提示词后面一起下发：场景图是视频阶段的首帧，
  // 这里漏掉人种，后面每个镜头都会拿着一张已经漂过的脸继续漂。
  assert.match(sceneJobs[0].prompt, /出场角色的长相必须与参考图完全一致，不要重新设计人物——小澎（出场角色）：保持同一张脸；人种：东亚面孔，中国人。/);
  // 老场次没有 instance，时间和光线只在扁平字段里。母版补进来之后这一行不能跟着丢，
  // 否则「白天、自然光」整个消失，画面时间随机漂移。
  assert.match(sceneJobs[0].prompt, /地点：教室。时间：白天。光线：自然光。色彩：暖色。/);
  // 母版按地点派生出来，空间约束和禁止漂移项必须一起进提示词。
  assert.match(sceneJobs[0].prompt, /场景：教室；内景，公共空间。/);
  assert.match(sceneJobs[0].prompt, /禁止出现：门窗数量变化、/);

  const characterNext = applyStageImageResult(fixture, {
    ...characterJobs[0], imageUrl: 'https://img/primary.png'
  });
  assert.equal(parseFile(characterNext, 'characters.json').characters[0].variants[0].primaryImageUrl, 'https://img/primary.png');
  assert.equal(fileVersion(characterNext, 'scenes.json'), fileVersion(fixture, 'scenes.json'));

  const sceneNext = applyStageImageResult(fixture, {
    ...sceneJobs[0], imageUrl: 'https://img/scene-1.png'
  });
  assert.equal(parseFile(sceneNext, 'scenes.json').scenes[0].referenceImageUrl, 'https://img/scene-1.png');
  assert.equal(fileVersion(sceneNext, 'characters.json'), fileVersion(fixture, 'characters.json'));
});

test('missing image jobs and image results are safe no-ops for invalid or unknown targets', () => {
  const { missingCharacterImageJobs, missingSceneImageJobs, applyStageImageResult } = loadProductionAssetsModule();
  const invalid = workspaceWith({ 'characters.json': '{ invalid', 'scenes.json': '{ invalid' });
  assert.deepEqual(Array.from(missingCharacterImageJobs(invalid)), []);
  assert.deepEqual(Array.from(missingSceneImageJobs(invalid)), []);

  const fixture = workspaceWith({
    'characters.json': JSON.stringify({ characters: [] }),
    'scenes.json': JSON.stringify({ scenes: [] })
  });
  assert.strictEqual(applyStageImageResult(fixture, {
    stage: 'character', assetId: 'missing', variantId: 'primary', kind: 'portrait', prompt: '', negativePrompt: '', imageUrl: 'https://img/missing.png'
  }), fixture);
  assert.strictEqual(applyStageImageResult(fixture, {
    stage: 'scene', assetId: 'missing', prompt: '', negativePrompt: '', imageUrl: 'https://img/missing.png'
  }), fixture);
});

test('non-core scenes do not create required image jobs or block scene confirmation', () => {
  const { missingSceneImageJobs, validateStageAssets } = loadProductionAssetsModule();
  const fixture = workspaceWith({
    'scenes.json': JSON.stringify({ scenes: [{
      id: 'transition', title: '过场', core: false, location: '街道', timeOfDay: '傍晚',
      lighting: '路灯', palette: '蓝灰', characterIds: [], mainImagePrompt: '空街道过场', referenceImageUrl: ''
    }] })
  });
  assert.deepEqual(JSON.parse(JSON.stringify(missingSceneImageJobs(fixture))), []);
  assert.deepEqual(Array.from(validateStageAssets('scene', fixture)), []);
});

test('character expression ids normalize producer Chinese labels into canonical UI ids', () => {
  const { charactersFromWorkspace } = loadProductionAssetsModule();
  const fixture = workspaceWith({
    'characters.json': JSON.stringify({ characters: [{
      id: 'lead', name: '主角', required: true,
      expressionIds: ['喜悦', '愤怒', '悲伤', '恐惧', '惊讶', '厌恶', '害羞', '紧张', '疑惑', '尴尬', '期待', '平静', '害怕'],
      variants: []
    }] })
  });
  assert.deepEqual(JSON.parse(JSON.stringify(charactersFromWorkspace(fixture)[0].expressionIds)), [
    'joy', 'anger', 'sadness', 'fear', 'surprise', 'disgust', 'shy', 'nervous', 'confused', 'awkward', 'expectant', 'calm'
  ]);
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

test('多视角任务只覆盖已有主图、还没有多视角的变体', () => {
  const { missingCharacterMultiViewJobs } = loadProductionAssetsModule();
  const workspace = productionAssetWorkspace({
    'characters.json': JSON.stringify({
      characters: [
        {
          id: 'lead_01',
          name: '小澎',
          role: '主角',
          required: true,
          description: '紧张内向的年轻男生',
          consistencyPrompt: '保持脸型和眼神一致',
          negativePrompt: '不要换脸',
          faceAnchorVariantId: 'now',
          variants: [
            { id: 'first', label: '初遇', ageLabel: '26 岁', wardrobe: '灰衬衫', primaryImageUrl: 'https://img/first.png' },
            { id: 'now', label: '现在', ageLabel: '28 岁', wardrobe: '深色外套', primaryImageUrl: 'https://img/now.png' },
            // 主图还没生成，这一轮跳过
            { id: 'confess', label: '表白', ageLabel: '26 岁', wardrobe: '白T', primaryImageUrl: '' },
            // 已经有多视角，不重复花钱
            { id: 'fight', label: '吵架时', ageLabel: '26 岁', wardrobe: '卫衣', primaryImageUrl: 'https://img/fight.png', multiViewImageUrl: 'https://img/fight-mv.png' }
          ]
        },
        // 配角同样要出图：模型把谁标成配角，谁就一张图都没有，这是之前的缺陷
        { id: 'extra', name: '路人', role: '配角', required: false, variants: [{ id: 'only', label: '只此一个', ageLabel: '30 岁', wardrobe: '西装', primaryImageUrl: 'https://img/extra.png' }] }
      ]
    })
  });

  const jobs = missingCharacterMultiViewJobs(workspace);
  assert.deepEqual(Array.from(jobs.map((job) => job.variantId)), ['first', 'now', 'only']);
  assert.deepEqual(Array.from(new Set(jobs.map((job) => job.kind))), ['multi_view']);
  assert.deepEqual(Array.from(new Set(jobs.map((job) => job.assetId))), ['lead_01', 'extra']);

  // 参考图 = 该变体主图 + Face ID 锚点主图，去重后锚点自身只留一张。
  assert.deepEqual(Array.from(jobs[0].referenceImages), ['https://img/first.png', 'https://img/now.png']);
  assert.deepEqual(Array.from(jobs[1].referenceImages), ['https://img/now.png']);
  assert.match(jobs[0].prompt, /多视角/);
  assert.match(jobs[0].prompt, /小澎/);
});

test('多视角任务在角色全部出图后归零，不会无限重复', () => {
  const { missingCharacterMultiViewJobs, applyStageImageResult } = loadProductionAssetsModule();
  let workspace = productionAssetWorkspace({
    'characters.json': JSON.stringify({
      characters: [{
        id: 'lead_01', name: '小澎', role: '主角', required: true,
        description: '主角', consistencyPrompt: '一致', negativePrompt: '不要换脸',
        faceAnchorVariantId: 'now',
        variants: [{ id: 'now', label: '现在', ageLabel: '28 岁', wardrobe: '外套', primaryImageUrl: 'https://img/now.png' }]
      }]
    })
  });

  const [job] = missingCharacterMultiViewJobs(workspace);
  assert.ok(job, '应该先有一个待生成的多视角任务');
  workspace = applyStageImageResult(workspace, { ...job, imageUrl: 'https://img/now-mv.png' });
  assert.deepEqual(Array.from(missingCharacterMultiViewJobs(workspace)), []);
});

test('正脸身份参考位跟着主图自动出，且这一轮只出正脸', () => {
  const { missingCharacterFrontViewJobs, applyStageImageResult } = loadProductionAssetsModule();
  let workspace = productionAssetWorkspace({
    'characters.json': JSON.stringify({
      characters: [
        {
          id: 'lead_01', name: '小澎', role: '主角', required: true,
          description: '主角', consistencyPrompt: '保持脸型一致', negativePrompt: '不要换脸',
          faceAnchorVariantId: 'now',
          visual: { identity: { gender: '女性' } },
          variants: [
            { id: 'first', label: '初遇', ageLabel: '26 岁', wardrobe: '灰衬衫', primaryImageUrl: 'https://img/first.png' },
            { id: 'now', label: '现在', ageLabel: '28 岁', wardrobe: '深色外套', primaryImageUrl: 'https://img/now.png' }
          ]
        },
        // 没写性别的角色一律跳过：宁可留空占位，也不能让图片模型掷硬币猜性别
        {
          id: 'no_gender', name: '性别未填', role: '配角', required: false,
          variants: [{ id: 'only', label: '唯一', ageLabel: '29 岁', wardrobe: '休闲装', primaryImageUrl: 'https://img/ng.png' }]
        },
        // 主图还没出来的角色这一轮跳过：没有参考图的正脸会是另一张脸
        {
          id: 'pending', name: '待出图', role: '配角', required: false,
          variants: [{ id: 'only', label: '唯一', ageLabel: '30 岁', wardrobe: '西装', primaryImageUrl: '' }]
        },
        // 已经有正脸的不重复花钱
        {
          id: 'done', name: '已就绪', role: '配角', required: false,
          variants: [{ id: 'only', label: '唯一', ageLabel: '30 岁', wardrobe: '风衣', primaryImageUrl: 'https://img/done.png' }],
          visual: { identity: { gender: '男性', views: { front: 'https://img/done-front.png' } } }
        }
      ]
    })
  });

  const jobs = missingCharacterFrontViewJobs(workspace);
  assert.deepEqual(Array.from(jobs.map((job) => job.assetId)), ['lead_01'], '只有主图已就绪且缺正脸的角色进任务');
  assert.equal(jobs[0].identityViewId, 'front');
  // 只出正脸这一张，另外三个角度是每角色 ×3 的开销，留给画板按钮
  assert.ok(!jobs.some((job) => job.identityViewId !== 'front'));
  // 参考图取 Face ID 锚点主图，否则生成出来的正脸是另一个人
  assert.deepEqual(Array.from(jobs[0].referenceImages), ['https://img/now.png']);
  assert.match(jobs[0].prompt, /正脸/);
  assert.match(jobs[0].prompt, /同一个人/);
  // 性别必须进提示词并排在最前：漏了它，男配角会被生成成女性
  assert.match(jobs[0].prompt, /性别：女性/);
  // 参考位是设定板，不能继承「只用背影」这类成片出镜规则，否则「正脸」会出背影
  assert.doesNotMatch(jobs[0].prompt, /正脸\/背影规则/);
  assert.doesNotMatch(jobs[0].prompt, /只用背影/);
  // 一个人就是一个人，不要并排两个
  assert.match(jobs[0].prompt, /只能出现这一个人物/);
  // 校园写死文案不该出现在职场剧里
  assert.doesNotMatch(jobs[0].prompt, /校园/);

  // 回写进 visual.identity.views.front，不能覆盖变体主图
  workspace = applyStageImageResult(workspace, { ...jobs[0], imageUrl: 'https://img/lead-front.png' });
  const stored = parseFile(workspace, 'characters.json').characters[0];
  assert.equal(stored.visual.identity.views.front, 'https://img/lead-front.png');
  assert.equal(stored.variants[1].primaryImageUrl, 'https://img/now.png', '变体主图不能被身份参考位覆盖');
  assert.deepEqual(Array.from(missingCharacterFrontViewJobs(workspace)), [], '出过一次就不再重复');
});

test('另外三个身份参考位要等正脸出来，拿正脸当参考图', () => {
  const { missingCharacterIdentityViewJobs, applyStageImageResult } = loadProductionAssetsModule();
  const character = (visual) => ({
    id: 'lead_01', name: '小澎', role: '主角', required: true,
    description: '主角', consistencyPrompt: '保持脸型一致', negativePrompt: '不要换脸',
    faceAnchorVariantId: 'now',
    visual,
    variants: [{ id: 'now', label: '现在', ageLabel: '28 岁', wardrobe: '深色外套', primaryImageUrl: 'https://img/now.png' }]
  });

  // 正脸还没出来时，剩下三个角度一个都不能跑：只拿变体主图当参考，
  // 侧脸和全身会各自往不同的长相上漂——这正是多视角设定板当初要解决的同一个问题。
  const waiting = productionAssetWorkspace({
    'characters.json': JSON.stringify({ characters: [character({ identity: { gender: '女性' } })] })
  });
  assert.deepEqual(
    Array.from(missingCharacterIdentityViewJobs(waiting, ['three_quarter', 'profile', 'full_body'])),
    []
  );

  let workspace = productionAssetWorkspace({
    'characters.json': JSON.stringify({
      characters: [character({ identity: { gender: '女性', views: { front: 'https://img/front.png' } } })]
    })
  });
  const jobs = missingCharacterIdentityViewJobs(workspace, ['three_quarter', 'profile', 'full_body']);
  assert.deepEqual(Array.from(jobs.map((job) => job.identityViewId)), ['three_quarter', 'profile', 'full_body']);
  // 正脸是身份主锚点，必须排在参考图第一位
  assert.equal(jobs[0].referenceImages[0], 'https://img/front.png');
  assert.ok(jobs[0].referenceImages.includes('https://img/now.png'));
  assert.match(jobs[1].prompt, /侧脸/);
  assert.match(jobs[2].prompt, /全身/);
  // 参考位是设定板，不继承成片出镜规则
  assert.doesNotMatch(jobs[0].prompt, /只用背影/);

  // 出过的不重复花钱
  workspace = applyStageImageResult(workspace, { ...jobs[0], imageUrl: 'https://img/34.png' });
  const remaining = missingCharacterIdentityViewJobs(workspace, ['three_quarter', 'profile', 'full_body']);
  assert.deepEqual(Array.from(remaining.map((job) => job.identityViewId)), ['profile', 'full_body']);
});

test('表情板只给 Face ID 锚点变体出一张，只有声音的角色不出', () => {
  const { missingCharacterExpressionSheetJobs, applyStageImageResult } = loadProductionAssetsModule();
  let workspace = productionAssetWorkspace({
    'characters.json': JSON.stringify({
      characters: [
        {
          id: 'lead_01', name: '小澎', role: '主角', required: true,
          description: '主角', consistencyPrompt: '保持脸型一致', negativePrompt: '不要换脸',
          faceAnchorVariantId: 'now',
          visual: {
            identity: { gender: '女性', views: { front: 'https://img/front.png' } },
            expressions: [{ id: 'neutral', label: '平静' }, { id: 'sad', label: '难过' }]
          },
          variants: [
            { id: 'first', label: '初遇', ageLabel: '26 岁', wardrobe: '灰衬衫', primaryImageUrl: 'https://img/first.png' },
            { id: 'now', label: '现在', ageLabel: '28 岁', wardrobe: '深色外套', primaryImageUrl: 'https://img/now.png' }
          ]
        },
        // 只有声音的角色根本不出现在画面里，这一张纯属白花钱
        {
          id: 'voice_only', name: '画外音', role: '配角', required: false,
          faceAnchorVariantId: 'only',
          visual: {
            identity: { gender: '男性', views: { front: 'https://img/vo-front.png' } },
            shooting: { voiceOnly: true }
          },
          variants: [{ id: 'only', label: '唯一', ageLabel: '40 岁', wardrobe: '西装', primaryImageUrl: 'https://img/vo.png' }]
        }
      ]
    })
  });

  const jobs = missingCharacterExpressionSheetJobs(workspace);
  assert.deepEqual(Array.from(jobs.map((job) => job.assetId)), ['lead_01']);
  // 每个变体各出一张表情板，成本翻几倍而信息量几乎重复，所以只给锚点变体出
  assert.equal(jobs[0].variantId, 'now');
  assert.equal(jobs[0].kind, 'expression_sheet');
  // 表情池取自视觉设定，不是一组写死的通用表情
  assert.match(jobs[0].prompt, /平静、难过/);
  assert.equal(jobs[0].referenceImages[0], 'https://img/front.png');

  workspace = applyStageImageResult(workspace, { ...jobs[0], imageUrl: 'https://img/sheet.png' });
  const stored = parseFile(workspace, 'characters.json').characters[0];
  assert.equal(stored.variants[1].expressionSheetImageUrl, 'https://img/sheet.png');
  assert.deepEqual(Array.from(missingCharacterExpressionSheetJobs(workspace)), [], '出过一次就不再重复');
});

test('角色出图张数按角色数和变体数算，写在用户看得见的地方', () => {
  withTsRequire(() => {
    const { characterImageBudgetSummary, estimateCharacterImageCount, CHARACTER_REFERENCE_IMAGES_PER_CHARACTER } =
      require('./renderBudget.ts');

    // 四个身份参考位 + 一张表情板
    assert.equal(CHARACTER_REFERENCE_IMAGES_PER_CHARACTER, 5);
    // 一个角色一个变体：主图 + 多视角 + 5 = 7
    assert.equal(estimateCharacterImageCount({ characterCount: 1, variantsPerCharacter: 1 }), 7);
    // 七个角色是五倍的钱，这正是把它写出来的理由
    assert.equal(estimateCharacterImageCount({ characterCount: 7, variantsPerCharacter: 1 }), 49);
    assert.equal(estimateCharacterImageCount({ characterCount: 0 }), 0);
    assert.match(characterImageBudgetSummary({ characterCount: 3 }), /≈21 张角色图/);
    assert.match(characterImageBudgetSummary({ characterCount: 0 }), /暂无法预估/);
  });
});

test('配角也要出主图和多视角，并且确认前会逐个角色检查', () => {
  const { missingCharacterImageJobs, missingCharacterMultiViewJobs, validateStageAssets } = loadProductionAssetsModule();
  const characters = {
    characters: [
      {
        id: 'lead_01', name: '小澎', role: '主角', required: true,
        description: '主角', consistencyPrompt: '一致', negativePrompt: '不要换脸',
        faceAnchorVariantId: 'now',
        variants: [{ id: 'now', label: '现在', ageLabel: '28 岁', wardrobe: '外套', primaryImageUrl: 'https://img/lead.png' }]
      },
      {
        // 模型经常把第二个人标成配角；以前这种角色一张图都不会生成
        id: 'bf_01', name: '小澎的男友', role: '配角', required: false,
        description: '配角', consistencyPrompt: '一致', negativePrompt: '不要换脸',
        faceAnchorVariantId: 'meet',
        variants: [{ id: 'meet', label: '初遇', ageLabel: '26 岁', wardrobe: '灰衬衫', primaryImageUrl: '' }]
      }
    ]
  };
  const workspace = productionAssetWorkspace({ 'characters.json': JSON.stringify(characters) });

  assert.deepEqual(Array.from(missingCharacterImageJobs(workspace).map((job) => job.assetId)), ['bf_01']);
  assert.deepEqual(Array.from(missingCharacterMultiViewJobs(workspace).map((job) => job.assetId)), ['lead_01']);
  assert.deepEqual(Array.from(validateStageAssets('character', workspace)), ['小澎的男友的初遇主图尚未生成']);
});

test('镜头首帧按各自的机位出图，而不是整场共用一张', () => {
  const { missingShotImageJobs, applyStageImageResult } = loadProductionAssetsModule();
  const fixture = workspaceWith({
    'characters.json': JSON.stringify({
      characters: [{
        id: 'lead', name: '陈女士', required: true, consistencyPrompt: '保持同一张脸',
        faceAnchorVariantId: 'v1',
        variants: [{ id: 'v1', label: '20 岁', ageLabel: '20 岁', wardrobe: '连衣裙', primaryImageUrl: 'https://img/lead.png' }]
      }]
    }),
    'scenes.json': JSON.stringify({
      scenes: [{
        id: 'scene-1', title: '初遇', core: true, location: '图书馆', timeOfDay: '白天',
        lighting: '自然光', palette: '暖色', characterIds: ['lead'],
        mainImagePrompt: '图书馆窗边', referenceImageUrl: 'https://img/scene-1.png'
      }]
    }),
    'storyboard.json': JSON.stringify({
      scenes: [
        {
          id: 'shot-1', sourceSceneId: 'scene-1', title: '推开门', durationSeconds: 3,
          visual: '她在书架间抬头', shotSize: '全景', cameraAngle: '平视', cameraHeight: '站姿视线',
          referenceImageUrl: 'https://img/scene-1.png'
        },
        {
          id: 'shot-2', sourceSceneId: 'scene-1', title: '她抬头', durationSeconds: 3,
          visual: '她的眼神停住', shotSize: '特写', cameraAngle: '略仰', cameraHeight: '坐姿视线',
          // 和 shot-1 共用同一张场次图——这正是要修的那件事。
          referenceImageUrl: 'https://img/scene-1.png'
        }
      ]
    })
  });

  const jobs = missingShotImageJobs(fixture);
  assert.equal(jobs.length, 2);
  assert.equal(jobs[0].stage, 'shot');
  assert.deepEqual(Array.from(jobs.map((job) => job.assetId)), ['shot-1', 'shot-2']);

  // 两个镜头拿到的是各自的景别，而不是同一句话。
  assert.match(jobs[0].prompt, /景别：全景/);
  assert.match(jobs[0].prompt, /人物全身完整入画/);
  assert.match(jobs[1].prompt, /景别：特写/);
  assert.match(jobs[1].prompt, /人物头部占画面高度的 70% 以上/);
  // 机位也要各写各的：角度和高度决定人物与空间的透视关系。
  assert.match(jobs[1].prompt, /拍摄角度：略仰/);
  assert.match(jobs[1].prompt, /机位高度：坐姿视线/);
  // 人脸锚点跟着进图生图，否则每个镜头的首帧都是一张现编的脸。
  assert.ok(jobs[1].referenceImages.includes('https://img/lead.png'));

  // 结果写进镜头自己的 shotImageUrl，共用的 referenceImageUrl 原样留着当退路。
  const next = applyStageImageResult(fixture, { ...jobs[1], imageUrl: 'https://img/shot-2.png' });
  const shots = parseFile(next, 'storyboard.json').scenes;
  assert.equal(shots[1].shotImageUrl, 'https://img/shot-2.png');
  assert.equal(shots[1].referenceImageUrl, 'https://img/scene-1.png');
  assert.equal(shots[0].shotImageUrl, undefined);
  // 已经有自己首帧的镜头不再重复花钱。
  assert.deepEqual(Array.from(missingShotImageJobs(next).map((job) => job.assetId)), ['shot-1']);
});

test('只补机位：模型顺手改掉的画面和台词一律不采纳', () => {
  const { mergeShotFraming } = loadProductionAssetsModule();
  const before = JSON.stringify({
    scenes: [
      { id: 'shot-1', visual: '图书馆，她低头翻书。窗边自然光，自然暖色调。写实风格', narration: '陈女士：这本我也想看。', durationSeconds: 3 },
      { id: 'shot-2', visual: '他递过书', narration: '', durationSeconds: 3, shotSize: '中景' }
    ]
  });
  // 这份 after 就是实测里模型真实的行为：机位补上了，但画面被"顺手"重写成更短的版本，
  // 还多编了一个原本不存在的镜头。
  const after = JSON.stringify({
    scenes: [
      { id: 'shot-1', visual: '图书馆，她低头翻书。', narration: '陈女士：想看这本。', durationSeconds: 4, shotSize: '中近景', cameraAngle: '平视', cameraHeight: '站姿视线', subjectPlacement: '画面左三分之一' },
      { id: 'shot-2', visual: '他把书递过去', shotSize: '特写', cameraAngle: '略仰', cameraHeight: '坐姿视线' },
      { id: 'shot-3', visual: '模型自己加的镜头', shotSize: '全景' }
    ]
  });

  const merged = JSON.parse(mergeShotFraming(before, after));
  assert.deepEqual(Array.from(merged.scenes.map((shot) => shot.id)), ['shot-1', 'shot-2']);

  // 画面、台词、时长必须是原来那份，一个字都不能被模型改掉。
  assert.match(merged.scenes[0].visual, /窗边自然光，自然暖色调/);
  assert.equal(merged.scenes[0].narration, '陈女士：这本我也想看。');
  assert.equal(merged.scenes[0].durationSeconds, 3);
  // 机位照常补上。
  assert.equal(merged.scenes[0].shotSize, '中近景');
  assert.equal(merged.scenes[0].cameraAngle, '平视');
  assert.equal(merged.scenes[0].subjectPlacement, '画面左三分之一');
  // 已经填过的机位是用户审过的，不许被模型的新意见盖掉。
  assert.equal(merged.scenes[1].shotSize, '中景');
  assert.equal(merged.scenes[1].cameraAngle, '略仰');
  assert.equal(merged.scenes[1].visual, '他递过书');

  // 解析不了的产出原样透传，交给上游既有的校验去拦，不在这里静默吞掉。
  assert.equal(mergeShotFraming(before, '不是 JSON'), '不是 JSON');
});
