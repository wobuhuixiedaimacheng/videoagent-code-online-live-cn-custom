const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const { workspaceWith } = require('./testFixtures.cjs');

function loadTypeScriptModule(fileName) {
  // 被加载的模块自己可能 import 别的 .ts（如 stageGeneration → styleBook），
  // 所以先装上 .ts 解析器，否则这些相对 import 会 MODULE_NOT_FOUND。
  const restore = installTypeScriptLoader();
  try {
    const filePath = path.join(__dirname, fileName);
    const source = fs.readFileSync(filePath, 'utf8');
    const output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
    }).outputText;
    const module = { exports: {} };
    const vm = require('node:vm');
    vm.runInNewContext(output, { module, exports: module.exports, require }, { filename: filePath });
    return module.exports;
  } finally {
    restore();
  }
}

function installTypeScriptLoader() {
  const previous = require.extensions['.ts'];
  require.extensions['.ts'] = (module, filePath) => {
    const source = fs.readFileSync(filePath, 'utf8');
    const output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
    }).outputText;
    module._compile(output, filePath);
  };
  return () => {
    if (previous) require.extensions['.ts'] = previous;
    else delete require.extensions['.ts'];
  };
}

function sourceVersions(workspace, paths) {
  return Object.fromEntries(paths.map((filePath) => [
    filePath,
    workspace.files.find((file) => file.path === filePath).version
  ]));
}

async function withEnv(values, action) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await action();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function withCustomModelResponse(rawResponse, action) {
  const previousFetch = global.fetch;
  let capturedBody = '';
  global.fetch = async (_url, init) => {
    capturedBody = String(init.body || '');
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(rawResponse) } }]
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    return await withEnv({
      VIDEOAGENT_FORCE_MOCK: undefined,
      DEMO_MODE: undefined,
      AGENT_LOOP: undefined,
      DEFAULT_PROVIDER: 'custom',
      CUSTOM_API_KEY: 'test-key',
      CUSTOM_BASE_URL: 'http://provider.test/v1',
      OPENAI_API_KEY: undefined,
      ANTHROPIC_API_KEY: undefined
    }, () => action(() => capturedBody));
  } finally {
    global.fetch = previousFetch;
  }
}

function validCharacterDraft(name = '最终角色') {
  return JSON.stringify({
    characters: [{
      id: 'lead_01', name, role: '主角', required: true,
      description: '可生成图片的角色草稿', faceAnchorVariantId: 'adult', referenceStrategy: 'face_id',
      faceIdStrategy: '复用已确认 Face ID。', imagePrompt: '主角人物主图，真实自然光。',
      expressionIds: ['喜悦', '愤怒', '悲伤', '恐惧', '惊讶', '厌恶', '害羞', '紧张', '疑惑', '尴尬', '期待', '平静'],
      expressionRange: '覆盖十二种可审查表情。', consistencyPrompt: '保持 Face ID 一致。', negativePrompt: '不要换脸。',
      variants: [{
        id: 'adult', label: '成年', ageLabel: '26 岁', wardrobe: '日常服装', primaryImageUrl: '',
        primaryImagePrompt: '成年主角正面半身，真实自然光。'
      }]
    }]
  });
}

function storyboardScenes(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `shot-${index + 1}`,
    title: `镜头 ${index + 1}`,
    visual: `第 ${index + 1} 个已确认镜头画面`,
    subtitle: `第 ${index + 1} 个字幕`,
    durationSeconds: 3
  }));
}

function confirmedScenes(count) {
  return storyboardScenes(count).map((scene, index) => ({
    ...scene,
    start: index * 3,
    end: index * 3 + 3,
    scriptSegment: `第 ${index + 1} 段已确认脚本`,
    narration: `第 ${index + 1} 段旁白`
  }));
}

test('each stage has an explicit workflow and output allowlist', () => {
  const { stageConfig } = loadTypeScriptModule('stageGeneration.ts');
  assert.deepEqual(Array.from(stageConfig('script').outputFiles), ['brief.json', 'campaign_goal.json', 'script.md']);
  assert.deepEqual(Array.from(stageConfig('character').outputFiles), ['characters.json']);
  assert.deepEqual(Array.from(stageConfig('scene').outputFiles), ['scenes.json']);
  assert.deepEqual(Array.from(stageConfig('storyboard').outputFiles), ['storyboard.json', 'timeline.json']);
  assert.deepEqual(Array.from(stageConfig('video').outputFiles), ['asset_prompts.json', 'video_spec.json']);
});

test('stage instructions define the required character, scene, and video contracts', () => {
  const { stageGenerationInstruction } = loadTypeScriptModule('stageGeneration.ts');
  const scriptInstruction = stageGenerationInstruction('script', '');
  assert.match(scriptInstruction, /brief\.json[\s\S]*topic[\s\S]*audience[\s\S]*offer/);
  assert.match(scriptInstruction, /campaign_goal\.json[\s\S]*goal[\s\S]*audience[\s\S]*platform/);
  assert.match(scriptInstruction, /不得[^\n]*占位/);
  // 性别写在剧本阶段，是因为角色阶段的 gender 是必填字段：脚本不写，模型只能从人名里猜性别，
  // 猜错的第一张正脸会顺着一致性锚点错到全片。
  assert.match(scriptInstruction, /人物设定里的每个人都必须写明性别/);
  // 姓名同理：角色名会原样进图片提示词，「前任A」和「前任B」之间只有一个字母的区分度。
  assert.match(scriptInstruction, /人物设定里的每个人都必须有姓名/);
  assert.match(stageGenerationInstruction('character', ''), /必需角色/);
  assert.match(stageGenerationInstruction('character', ''), /人物设定小节里写了性别的，逐字照抄/);
  assert.match(stageGenerationInstruction('character', ''), /name 逐字照抄脚本人物设定里给出的姓名/);
  assert.match(stageGenerationInstruction('character', ''), /Face ID/);
  assert.match(stageGenerationInstruction('scene', ''), /location[\s\S]*timeOfDay[\s\S]*lighting[\s\S]*palette/);
  assert.match(stageGenerationInstruction('video', '720p'), /已确认的 script\.md、characters\.json、scenes\.json、storyboard\.json/);
});

test('source versions are limited to each stage confirmed upstream inputs', () => {
  const { sourceVersionsForStage } = loadTypeScriptModule('stageGeneration.ts');
  const versions = sourceVersionsForStage(workspaceWith({
    'script.md': '# 脚本',
    'characters.json': '{"characters":[]}',
    'scenes.json': '{"scenes":[]}',
    'storyboard.json': '{"scenes":[]}',
    'publish_copy.json': '{}'
  }), 'video');
  assert.deepEqual(JSON.parse(JSON.stringify(versions)), { 'script.md': 1, 'characters.json': 2, 'scenes.json': 3, 'storyboard.json': 4 });
});

test('character generation cannot return scene or video task patches', async () => {
  const restore = installTypeScriptLoader();
  try {
    const { runVideoAgent } = require('./agentProvider.ts');
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
  } finally {
    restore();
  }
});

test('video generation reads confirmed source versions and only returns the task package', async () => {
  const restore = installTypeScriptLoader();
  try {
    const { runVideoAgent } = require('./agentProvider.ts');
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
      sourceVersions: { 'script.md': 1, 'characters.json': 2, 'scenes.json': 3, 'storyboard.json': 4 }
    });
    assert.deepEqual(result.patchOperations.map((patch) => patch.filePath).sort(), ['asset_prompts.json', 'video_spec.json']);
    const assetPrompts = JSON.parse(result.patchOperations.find((patch) => patch.filePath === 'asset_prompts.json').after);
    assert.deepEqual(assetPrompts.confirmedSourceVersions, { 'script.md': 1, 'characters.json': 2, 'scenes.json': 3, 'storyboard.json': 4 });
    assert.match(assetPrompts.confirmedSourceInputs.scriptExcerpt, /测试脚本/);
    assert.equal(assetPrompts.confirmedSourceInputs.storyboardSceneCount, 0);
  } finally {
    restore();
  }
});

test('a production-stage request bypasses AGENT_LOOP and remains stage-scoped', async () => {
  const restore = installTypeScriptLoader();
  try {
    const { runVideoAgent } = require('./agentProvider.ts');
    const workspace = workspaceWith({ 'script.md': '# 角色脚本' });
    const result = await withEnv({
      AGENT_LOOP: '1', VIDEOAGENT_FORCE_MOCK: undefined, DEMO_MODE: undefined,
      DEFAULT_PROVIDER: undefined, CUSTOM_API_KEY: undefined, CUSTOM_BASE_URL: undefined,
      OPENAI_API_KEY: undefined, ANTHROPIC_API_KEY: undefined
    }, () => runVideoAgent({
      instruction: '生成角色资产', workspace, history: [], productionStage: 'character',
      generationJobId: 'character-loop-job', sourceVersions: sourceVersions(workspace, ['script.md'])
    }));
    assert.deepEqual(result.patchOperations.map((patch) => patch.filePath), ['characters.json']);
  } finally {
    restore();
  }
});

test('stage fallback rejects source version mismatches before reading a draft workspace file', async () => {
  const restore = installTypeScriptLoader();
  try {
    const { runVideoAgent } = require('./agentProvider.ts');
    const workspace = workspaceWith({ 'script.md': '# UNCONFIRMED-v99' });
    await withEnv({ VIDEOAGENT_FORCE_MOCK: 'true' }, async () => {
      await assert.rejects(
        () => runVideoAgent({
          instruction: '生成角色资产', workspace, history: [], productionStage: 'character',
          generationJobId: 'character-mismatch', sourceVersions: { 'script.md': 99 }
        }),
        /sourceVersions.*script\.md/
      );
    });
  } finally {
    restore();
  }
});

test('stage model request rejects version mismatches before making a provider call', async () => {
  const restore = installTypeScriptLoader();
  try {
    const { runVideoAgent } = require('./agentProvider.ts');
    const workspace = workspaceWith({ 'script.md': '# UNCONFIRMED-v99' });
    let fetchCalled = false;
    const previousFetch = global.fetch;
    global.fetch = async () => {
      fetchCalled = true;
      throw new Error('provider must not be called');
    };
    try {
      await withEnv({
        DEFAULT_PROVIDER: 'custom', CUSTOM_API_KEY: 'test-key', CUSTOM_BASE_URL: 'http://provider.test/v1',
        VIDEOAGENT_FORCE_MOCK: undefined, DEMO_MODE: undefined, AGENT_LOOP: undefined
      }, async () => {
        await assert.rejects(
          () => runVideoAgent({
            instruction: '生成角色资产', workspace, history: [], productionStage: 'character',
            generationJobId: 'character-model-mismatch', sourceVersions: { 'script.md': 99 }
          }),
          /sourceVersions.*script\.md/
        );
      });
    } finally {
      global.fetch = previousFetch;
    }
    assert.equal(fetchCalled, false);
  } finally {
    restore();
  }
});

test('stage model prompt includes only confirmed stage inputs', async () => {
  const restore = installTypeScriptLoader();
  try {
    const { runVideoAgent } = require('./agentProvider.ts');
    const workspace = workspaceWith({
      'script.md': '# 已确认角色脚本',
      '.aigc/pending_patches.json': 'UNCONFIRMED-PENDING',
      'asset_prompts.json': 'UNCONFIRMED-DOWNSTREAM'
    });
    await withCustomModelResponse({}, async (capturedBody) => {
      const result = await runVideoAgent({
        instruction: '生成角色资产', workspace, history: [], productionStage: 'character',
        generationJobId: 'character-model-inputs', sourceVersions: { 'script.md': 1 }
      });
      assert.deepEqual(result.patchOperations.map((patch) => patch.filePath), ['characters.json']);
      assert.match(capturedBody(), /已确认角色脚本/);
      assert.doesNotMatch(capturedBody(), /UNCONFIRMED-PENDING|UNCONFIRMED-DOWNSTREAM|pending_patches/);
    });
  } finally {
    restore();
  }
});

test('video model prompt includes only the four confirmed upstream files', async () => {
  const restore = installTypeScriptLoader();
  try {
    const { runVideoAgent } = require('./agentProvider.ts');
    const workspace = workspaceWith({
      'script.md': '# 已确认视频脚本',
      'characters.json': validCharacterDraft(),
      'scenes.json': JSON.stringify({ scenes: [] }),
      'storyboard.json': JSON.stringify({ scenes: [] }),
      '.aigc/pending_patches.json': 'UNCONFIRMED-PENDING',
      'asset_prompts.json': 'UNCONFIRMED-DOWNSTREAM'
    });
    await withCustomModelResponse({}, async (capturedBody) => {
      await runVideoAgent({
        instruction: '准备视频任务', workspace, history: [], productionStage: 'video',
        generationJobId: 'video-model-inputs', sourceVersions: sourceVersions(workspace, ['script.md', 'characters.json', 'scenes.json', 'storyboard.json'])
      });
      assert.match(capturedBody(), /已确认视频脚本/);
      assert.doesNotMatch(capturedBody(), /UNCONFIRMED-PENDING|UNCONFIRMED-DOWNSTREAM|pending_patches/);
    });
  } finally {
    restore();
  }
});

test('model stage patches dedupe by file path with the last allowed patch winning', async () => {
  const restore = installTypeScriptLoader();
  try {
    const { runVideoAgent } = require('./agentProvider.ts');
    const workspace = workspaceWith({ 'script.md': '# 已确认角色脚本' });
    await withCustomModelResponse({
      patchOperations: [
        { filePath: 'characters.json', after: validCharacterDraft('第一个角色') },
        { filePath: 'scenes.json', after: '{"scenes":[]}' },
        { filePath: 'characters.json', after: validCharacterDraft('最终角色') }
      ]
    }, async () => {
      const result = await runVideoAgent({
        instruction: '生成角色资产', workspace, history: [], productionStage: 'character',
        generationJobId: 'character-duplicate-patches', sourceVersions: { 'script.md': 1 }
      });
      assert.deepEqual(result.patchOperations.map((patch) => patch.filePath), ['characters.json']);
      assert.match(result.patchOperations[0].after, /最终角色/);
    });
  } finally {
    restore();
  }
});

test('character and scene fallbacks remain image-generation-ready drafts without fabricated URLs', async () => {
  const restore = installTypeScriptLoader();
  try {
    const { runVideoAgent } = require('./agentProvider.ts');
    const characterWorkspace = workspaceWith({
      'script.md': '# 成长故事\n幼儿园、小学、初中、高中、大学的同一主角。'
    });
    const characterResult = await runVideoAgent({
      instruction: '生成角色资产', workspace: characterWorkspace, history: [], productionStage: 'character',
      generationJobId: 'character-life-stages', sourceVersions: { 'script.md': 1 }
    });
    const character = JSON.parse(characterResult.patchOperations[0].after).characters[0];
    assert.deepEqual(character.variants.map((variant) => variant.id), ['kindergarten', 'primary', 'middle', 'high', 'college']);
    assert.ok(character.variants.every((variant) => variant.primaryImageUrl === '' && variant.primaryImagePrompt));
    assert.deepEqual(character.expressionIds, ['喜悦', '愤怒', '悲伤', '恐惧', '惊讶', '厌恶', '害羞', '紧张', '疑惑', '尴尬', '期待', '平静']);
    assert.match(character.expressionRange, /喜悦.*平静/);

    const sceneWorkspace = workspaceWith({ 'script.md': '# 场景脚本', 'characters.json': validCharacterDraft() });
    const sceneResult = await runVideoAgent({
      instruction: '生成场景资产', workspace: sceneWorkspace, history: [], productionStage: 'scene',
      generationJobId: 'scene-draft', sourceVersions: sourceVersions(sceneWorkspace, ['script.md', 'characters.json'])
    });
    const scene = JSON.parse(sceneResult.patchOperations[0].after).scenes[0];
    assert.ok(scene.location && scene.timeOfDay && scene.lighting && scene.palette && scene.prompt);
    assert.deepEqual(scene.characterIds, ['lead_01']);
    assert.equal(scene.referenceImageUrl, '');
  } finally {
    restore();
  }
});

test('an incomplete model scene patch is replaced by the deterministic image-ready draft', async () => {
  const restore = installTypeScriptLoader();
  try {
    const { runVideoAgent } = require('./agentProvider.ts');
    const workspace = workspaceWith({ 'script.md': '# 场景脚本', 'characters.json': validCharacterDraft() });
    await withCustomModelResponse({ patchOperations: [{ filePath: 'scenes.json', after: '{"scenes":[{"id":"bad"}]}' }] }, async () => {
      const result = await runVideoAgent({
        instruction: '生成场景资产', workspace, history: [], productionStage: 'scene',
        generationJobId: 'scene-invalid-model', sourceVersions: sourceVersions(workspace, ['script.md', 'characters.json'])
      });
      const scene = JSON.parse(result.patchOperations[0].after).scenes[0];
      assert.ok(scene.location && scene.timeOfDay && scene.lighting && scene.palette && scene.prompt);
    });
  } finally {
    restore();
  }
});

test('an incomplete model character patch is replaced by the deterministic image-ready draft', async () => {
  const restore = installTypeScriptLoader();
  try {
    const { runVideoAgent } = require('./agentProvider.ts');
    const workspace = workspaceWith({ 'script.md': '# 角色脚本' });
    await withCustomModelResponse({ patchOperations: [{ filePath: 'characters.json', after: '{"characters":[{"required":true}]}' }] }, async () => {
      const result = await runVideoAgent({
        instruction: '生成角色资产', workspace, history: [], productionStage: 'character',
        generationJobId: 'character-invalid-model', sourceVersions: { 'script.md': 1 }
      });
      const character = JSON.parse(result.patchOperations[0].after).characters[0];
      assert.ok(character.consistencyPrompt && character.negativePrompt);
      assert.ok(character.variants.every((variant) => variant.primaryImagePrompt));
      assert.equal(character.primaryImageUrl, undefined);
    });
  } finally {
    restore();
  }
});

test('storyboard fallback gives every shot a positive duration accepted by the canonical validator', async () => {
  const restore = installTypeScriptLoader();
  try {
    const { runVideoAgent } = require('./agentProvider.ts');
    const { validateStageAssets } = loadTypeScriptModule('productionAssets.ts');
    const workspace = workspaceWith({
      'script.md': '# 分镜脚本', 'characters.json': validCharacterDraft(),
      'scenes.json': JSON.stringify({ scenes: confirmedScenes(1) })
    });
    const result = await runVideoAgent({
      instruction: '生成分镜资产', workspace, history: [], productionStage: 'storyboard',
      generationJobId: 'storyboard-durations', sourceVersions: sourceVersions(workspace, ['script.md', 'characters.json', 'scenes.json'])
    });
    const storyboard = result.patchOperations.find((patch) => patch.filePath === 'storyboard.json');
    const patchedWorkspace = {
      ...workspace,
      files: [...workspace.files, { path: 'storyboard.json', kind: 'json', content: storyboard.after, version: 4, updatedAt: '2026-07-11T12:00:00.000Z' }]
    };
    assert.ok(JSON.parse(storyboard.after).scenes.every((scene) => scene.durationSeconds > 0));
    assert.deepEqual(Array.from(validateStageAssets('storyboard', patchedWorkspace)), []);
  } finally {
    restore();
  }
});

test('video fallback and model recovery preserve all twelve confirmed storyboard shots as video tasks', async () => {
  const restore = installTypeScriptLoader();
  try {
    const { runVideoAgent } = require('./agentProvider.ts');
    const workspace = workspaceWith({
      'script.md': '# 十二镜脚本',
      'characters.json': validCharacterDraft(),
      'scenes.json': JSON.stringify({ scenes: storyboardScenes(12) }),
      'storyboard.json': JSON.stringify({ scenes: storyboardScenes(12) })
    });
    const request = {
      instruction: '从已确认制作包准备视频任务', workspace, history: [], productionStage: 'video',
      generationJobId: 'video-twelve-shots', sourceVersions: sourceVersions(workspace, ['script.md', 'characters.json', 'scenes.json', 'storyboard.json'])
    };
    const fallback = await runVideoAgent(request);
    const fallbackPackage = JSON.parse(fallback.patchOperations.find((patch) => patch.filePath === 'asset_prompts.json').after);
    assert.equal(fallbackPackage.prompts.length, 12);
    assert.equal(fallbackPackage.renderQueue.length, 12);
    assert.ok(fallbackPackage.prompts.every((prompt) => prompt.type === 'video'));

    await withCustomModelResponse({
      patchOperations: [{ filePath: 'asset_prompts.json', after: JSON.stringify({ prompts: [{ id: 'too-few', type: 'video' }], renderQueue: [] }) }]
    }, async () => {
      const recovered = await runVideoAgent({ ...request, generationJobId: 'video-twelve-model' });
      const recoveredPackage = JSON.parse(recovered.patchOperations.find((patch) => patch.filePath === 'asset_prompts.json').after);
      assert.equal(recoveredPackage.prompts.length, 12);
      assert.equal(recoveredPackage.renderQueue.length, 12);
      assert.ok(recoveredPackage.prompts.every((prompt) => prompt.type === 'video'));
    });
  } finally {
    restore();
  }
});

test('ID-less model character and scene patches are replaced with stable deterministic asset IDs', async () => {
  const restore = installTypeScriptLoader();
  try {
    const { runVideoAgent } = require('./agentProvider.ts');
    const characterWorkspace = workspaceWith({ 'script.md': '# 角色脚本' });
    const idlessCharacter = JSON.parse(validCharacterDraft());
    delete idlessCharacter.characters[0].id;
    await withCustomModelResponse({ patchOperations: [{ filePath: 'characters.json', after: JSON.stringify(idlessCharacter) }] }, async () => {
      const result = await runVideoAgent({
        instruction: '生成角色资产', workspace: characterWorkspace, history: [], productionStage: 'character',
        generationJobId: 'character-idless-model', sourceVersions: { 'script.md': 1 }
      });
      // 以前缺 id 会让整份 characters.json 换成内置模板（模板的 id 恰好是 lead_01），
      // 模型写的人物连名字都保不住。现在改成逐角色补齐：人物留下，只补一个稳定 id。
      const repaired = JSON.parse(result.patchOperations[0].after).characters[0];
      assert.equal(repaired.name, '最终角色', '模型写的人物必须留下，不能被模板顶掉');
      assert.equal(repaired.id, 'role_01');
    });

    const sceneWorkspace = workspaceWith({ 'script.md': '# 场景脚本', 'characters.json': validCharacterDraft() });
    const idlessScene = {
      title: '无 ID 场景', visual: '真实画面', location: '教室', timeOfDay: '白天', lighting: '自然光', palette: '暖色',
      characterIds: ['lead_01'], scriptSegment: '已确认脚本段落', mainImagePrompt: '教室里的主角', prompt: '教室里的主角', referenceImageUrl: ''
    };
    await withCustomModelResponse({ patchOperations: [{ filePath: 'scenes.json', after: JSON.stringify({ scenes: [idlessScene] }) }] }, async () => {
      const result = await runVideoAgent({
        instruction: '生成场景资产', workspace: sceneWorkspace, history: [], productionStage: 'scene',
        generationJobId: 'scene-idless-model', sourceVersions: sourceVersions(sceneWorkspace, ['script.md', 'characters.json'])
      });
      assert.equal(JSON.parse(result.patchOperations[0].after).scenes[0].id, 'scene_01');
    });
  } finally {
    restore();
  }
});

test('model character and scene patches missing required textual fields are replaced', async () => {
  const restore = installTypeScriptLoader();
  try {
    const { runVideoAgent } = require('./agentProvider.ts');
    const characterWorkspace = workspaceWith({ 'script.md': '# 角色脚本' });
    const incompleteCharacter = JSON.parse(validCharacterDraft());
    delete incompleteCharacter.characters[0].faceIdStrategy;
    delete incompleteCharacter.characters[0].expressionRange;
    delete incompleteCharacter.characters[0].imagePrompt;
    await withCustomModelResponse({ patchOperations: [{ filePath: 'characters.json', after: JSON.stringify(incompleteCharacter) }] }, async () => {
      const result = await runVideoAgent({
        instruction: '生成角色资产', workspace: characterWorkspace, history: [], productionStage: 'character',
        generationJobId: 'character-missing-text-model', sourceVersions: { 'script.md': 1 }
      });
      const character = JSON.parse(result.patchOperations[0].after).characters[0];
      assert.ok(character.faceIdStrategy && character.expressionRange && character.imagePrompt);
    });

    const sceneWorkspace = workspaceWith({ 'script.md': '# 场景脚本', 'characters.json': validCharacterDraft() });
    const incompleteScene = {
      id: 'scene-model', title: '缺字段场景', visual: '真实画面', location: '教室', timeOfDay: '白天', lighting: '自然光', palette: '暖色',
      characterIds: ['lead_01'], prompt: '教室里的主角', referenceImageUrl: ''
    };
    await withCustomModelResponse({ patchOperations: [{ filePath: 'scenes.json', after: JSON.stringify({ scenes: [incompleteScene] }) }] }, async () => {
      const result = await runVideoAgent({
        instruction: '生成场景资产', workspace: sceneWorkspace, history: [], productionStage: 'scene',
        generationJobId: 'scene-missing-text-model', sourceVersions: sourceVersions(sceneWorkspace, ['script.md', 'characters.json'])
      });
      const scene = JSON.parse(result.patchOperations[0].after).scenes[0];
      assert.ok(scene.scriptSegment && scene.mainImagePrompt && scene.prompt);
    });
  } finally {
    restore();
  }
});

test('storyboard fallback preserves all confirmed scenes and fails closed for unusable scene input', async () => {
  const restore = installTypeScriptLoader();
  try {
    const { runVideoAgent } = require('./agentProvider.ts');
    const sourceScenes = confirmedScenes(12);
    const workspace = workspaceWith({
      'script.md': '# 确认脚本', 'characters.json': validCharacterDraft(),
      'scenes.json': JSON.stringify({ scenes: sourceScenes })
    });
    const result = await runVideoAgent({
      instruction: '生成分镜资产', workspace, history: [], productionStage: 'storyboard',
      generationJobId: 'storyboard-confirmed-scenes', sourceVersions: sourceVersions(workspace, ['script.md', 'characters.json', 'scenes.json'])
    });
    const storyboard = JSON.parse(result.patchOperations.find((patch) => patch.filePath === 'storyboard.json').after).scenes;
    assert.equal(storyboard.length, 12);
    assert.deepEqual(storyboard.map((scene) => scene.id), sourceScenes.map((scene) => scene.id));
    assert.deepEqual(storyboard.map((scene) => scene.title), sourceScenes.map((scene) => scene.title));
    assert.deepEqual(storyboard.map((scene) => scene.visual), sourceScenes.map((scene) => scene.visual));
    assert.deepEqual(storyboard.map((scene) => scene.subtitle), sourceScenes.map((scene) => scene.subtitle));
    assert.deepEqual(storyboard.map((scene) => scene.scriptSegment), sourceScenes.map((scene) => scene.scriptSegment));
    assert.ok(storyboard.every((scene) => scene.durationSeconds > 0));

    const unusableWorkspace = workspaceWith({
      'script.md': '# 确认脚本', 'characters.json': validCharacterDraft(), 'scenes.json': '{"scenes":[]}'
    });
    await assert.rejects(
      () => runVideoAgent({
        instruction: '生成分镜资产', workspace: unusableWorkspace, history: [], productionStage: 'storyboard',
        generationJobId: 'storyboard-unusable-scenes', sourceVersions: sourceVersions(unusableWorkspace, ['script.md', 'characters.json', 'scenes.json'])
      }),
      /confirmed scenes\.json/
    );
  } finally {
    restore();
  }
});

test('分镜阶段要求把场景拆成多个镜头，而不是和场景一一对应', () => {
  const { stageGenerationInstruction } = loadTypeScriptModule('stageGeneration.ts');
  const instruction = stageGenerationInstruction('storyboard', '');

  // 旧契约是「镜头顺序和条数与已确认的 scenes.json 对齐」，导致 15 秒的场景原样变成 15 秒的镜头，
  // 分镜阶段实际什么也没做，而单镜头上限只有 5 秒。
  assert.doesNotMatch(instruction, /条数与已确认的 scenes\.json 对齐/);
  assert.match(instruction, /镜头数和场景数不是一一对应/);
  // 拆分依据从「时长上限」改成「动作节拍 + 目标时长」：按上限拆只能保证不超时，
  // 保证不了拆得细，结果是每个镜头塞满一整段戏。
  assert.match(instruction, /按【动作节拍】拆/);
  assert.match(instruction, /ceil\(场景时长 ÷ 目标时长\)/);
  assert.match(instruction, /一个 15 秒场景通常是 5 个镜头而不是 3 个/);
  assert.match(instruction, /出现两个以上动作[^\n]*就是没拆完/);
  // 拆出来的镜头必须能各自被识别，否则同一场景的镜头会互相覆盖。
  assert.match(instruction, /scene_01_shot_01/);
  assert.match(instruction, /sourceSceneId/);
});

test('分镜阶段要求产出审查面板逐栏显示的字段，不能留一屏「未标注」', () => {
  const { stageGenerationInstruction } = loadTypeScriptModule('stageGeneration.ts');
  const instruction = stageGenerationInstruction('storyboard', '');

  // 这七个字段面板上各占一栏。以前指令一个都没要求，用户看到的就是六栏「未标注」加两栏兜底值。
  for (const field of ['characterIds', 'shotSize', 'cameraMove', 'action', 'dialogue', 'firstFrameReference', 'composition']) {
    assert.match(instruction, new RegExp(`- ${field}：`), `分镜指令没有要求 ${field}`);
  }
  // 让镜头「厚」起来的三个字段。
  for (const field of ['depthOfField', 'lightingNote', 'emotionBeat']) {
    assert.match(instruction, new RegExp(`- ${field}：`), `分镜指令没有要求 ${field}`);
  }
  // 整片抄同一个运镜等于没有运镜设计，这一条要写死在指令里。
  assert.match(instruction, /不要整片抄同一个值/);
  // visual 和 action 分工不说清楚，模型会把同一句写两遍。
  assert.match(instruction, /两者不要写成同一句/);
});

test('视频阶段把 sourceSceneId 传下去，否则镜头找不回场景参考图', () => {
  const { stageGenerationInstruction } = loadTypeScriptModule('stageGeneration.ts');
  const instruction = stageGenerationInstruction('video', '{}');

  assert.match(instruction, /sceneId 和 sourceSceneId 是两个不同的东西/);
  // 老制作包没有这个字段，必须给出明确的回落做法，否则模型会自己编一个。
  assert.match(instruction, /没有 sourceSceneId 时[^\n]*照抄 sceneId/);
});

test('场景阶段按规格给出场次数量和时长，并说明场次不是渲染单位', () => {
  const { stageGenerationInstruction } = loadTypeScriptModule('stageGeneration.ts');
  const spec = JSON.stringify({ episodeSegmentSeconds: 15, episodeSegmentCount: 12 });
  const instruction = stageGenerationInstruction('scene', spec);

  assert.match(instruction, /场次数应当接近 12 个/);
  assert.match(instruction, /15 秒上下/);
  assert.match(instruction, /全片时长合计约 180 秒/);
  // 场景阶段不该为了迁就单镜头上限把场次切碎——那是分镜阶段的事。
  assert.match(instruction, /场次是【叙事单位】，不是渲染单位/);
});

test('场景阶段要求母版与场次分开，并把锚点写成可验证的位置关系', () => {
  const { stageGenerationInstruction } = loadTypeScriptModule('stageGeneration.ts');
  const instruction = stageGenerationInstruction('scene', '{}');

  // 地点、场次、镜头是三个实体。合成一个就等于每个镜头各存一份会漂移的空间描述。
  assert.match(instruction, /sceneMasters（场景母版）和 scenes（场次状态）/);
  assert.match(instruction, /同一地点的多个场次必须填同一个值/);
  assert.match(instruction, /instance\.shots/);
  // 「温馨」「高级感」当锚点等于没有锚点：模型无法据此判断画错了没有。
  assert.match(instruction, /「高级感」「温馨」「电影感」「压抑」这类形容词不是锚点/);
  // 光线方向和窗户位置的矛盾是系统会真的拦下来的硬错误，提示词里必须先说清楚。
  assert.match(instruction, /keyDirection 必须和母版 structure\.windows/);
});

test('内嵌图片数据不进模型上下文，剥离后 JSON 仍然合法', async () => {
  const restore = installTypeScriptLoader();
  try {
    const { stripEmbeddedImageData } = require('./agentProvider.ts');

    // 用户上传和生成的图都是 data:image/...;base64 直接存在 characters.json 里的，
    // 单张上限 512KB ≈ 52 万字符。几张就能把上下文撑爆，而模型从 base64 里读不出任何画面。
    const bigImage = `data:image/png;base64,${'A'.repeat(500000)}`;
    const file = JSON.stringify({
      characters: [{
        id: 'chen', name: '陈女士', description: '28岁，职场女性',
        variants: [
          { id: 'now', label: '本片形象', primaryImageUrl: bigImage },
          { id: 'past', label: '回忆', primaryImageUrl: 'https://img.example/past.png' }
        ]
      }]
    });

    const result = stripEmbeddedImageData(file);
    assert.ok(result.stripped > 490000, '应该剥掉整张图的数据');
    assert.ok(result.content.length < 2000, '剥完之后只剩真正要读的文字');
    assert.ok(!result.content.includes('AAAAAAAA'), '一个字节的图像数据都不该留下');

    // 剥离结果必须仍是合法 JSON，否则模型拿到的整个上下文就是坏的
    const parsed = JSON.parse(result.content);
    assert.equal(parsed.characters[0].name, '陈女士', '真正的文本内容一个字都不能少');
    assert.equal(parsed.characters[0].description, '28岁，职场女性');
    // http 链接很短，留着不影响，模型据此知道这一格已经有图
    assert.equal(parsed.characters[0].variants[1].primaryImageUrl, 'https://img.example/past.png');
    assert.match(parsed.characters[0].variants[0].primaryImageUrl, /图片数据/);

    // 没有内嵌图片时原样返回，不做任何改动
    const plain = '# 陈女士的恋爱史\n\n## 人物设定\n- 陈女士：28岁';
    assert.deepEqual(stripEmbeddedImageData(plain), { content: plain, stripped: 0 });
  } finally {
    restore();
  }
});
