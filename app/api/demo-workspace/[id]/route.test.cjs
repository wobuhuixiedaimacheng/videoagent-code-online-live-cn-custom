const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function loadRoute() {
  const routePath = path.join(__dirname, 'route.ts');
  const source = fs.readFileSync(routePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;
  const module = { exports: {} };
  const context = {
    URL,
    Request,
    Response,
    console,
    exports: module.exports,
    module,
    process,
    require
  };
  vm.runInNewContext(compiled, context, { filename: routePath });
  return module.exports;
}

test('GET returns the Xiaopeng V2 workspace for the fixed demo id', async () => {
  const { GET } = loadRoute();
  const response = await GET(new Request('http://localhost/api/demo-workspace/xiaopeng-v2'), {
    params: { id: 'xiaopeng-v2' }
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.workspace.title, '小澎的恋爱史｜三分钟搞笑短剧');

  const filesByPath = new Map(body.workspace.files.map((file) => [file.path, file]));
  assert.ok(filesByPath.has('asset_prompts.json'));
  assert.ok(filesByPath.has('characters.json'));
  assert.ok(filesByPath.has('production_flow.json'));

  const script = filesByPath.get('script.md').content;
  assert.doesNotMatch(script, /[A-Za-z]/);
  assert.equal((script.match(/^### \d{2}｜/gm) || []).length, 12);
  assert.match(script, /总时长：180 秒/);

  const flow = JSON.parse(filesByPath.get('production_flow.json').content);
  assert.equal(flow.schemaVersion, 1);
  assert.equal(flow.currentStage, 'script');
  assert.equal(flow.stages.script.status, 'ready_for_review');
  assert.equal(flow.stages.character.status, 'locked');
  assert.equal(flow.stages.scene.status, 'locked');
  assert.equal(flow.stages.storyboard.status, 'locked');
  assert.equal(flow.stages.video.status, 'locked');
  assert.deepEqual(flow.videoJobs, []);

  const characters = JSON.parse(filesByPath.get('characters.json').content);
  const xiaopeng = characters.characters.find((character) => character.id === 'xiaopeng');
  assert.ok(xiaopeng);
  assert.equal(xiaopeng.required, true);
  assert.equal(xiaopeng.expressionIds.length, 12);
  assert.deepEqual(
    xiaopeng.variants.map((variant) => variant.id),
    ['kindergarten', 'primary', 'middle', 'high', 'college']
  );
  assert.ok(xiaopeng.variants.every((variant) => variant.primaryImageUrl));

  const scenes = JSON.parse(filesByPath.get('scenes.json').content).scenes;
  assert.equal(scenes.length, 12);
  for (const scene of scenes) {
    for (const field of ['location', 'timeOfDay', 'lighting', 'palette', 'prompt', 'referenceImageUrl']) {
      assert.ok(scene[field] && scene[field] !== '未标注', `场景 ${scene.id} 缺少 ${field}`);
    }
    assert.ok(Array.isArray(scene.characterIds) && scene.characterIds.length > 0, `场景 ${scene.id} 缺少出场角色`);
  }

  const storyboard = JSON.parse(filesByPath.get('storyboard.json').content).scenes;
  assert.equal(storyboard.length, 12);
  for (const shot of storyboard) {
    for (const field of [
      'scriptSegment',
      'sceneId',
      'shotSize',
      'cameraMove',
      'action',
      'dialogue',
      'firstFrameReference',
      'referenceImageUrl'
    ]) {
      assert.ok(shot[field] && shot[field] !== '未标注', `分镜 ${shot.id} 缺少 ${field}`);
    }
    assert.ok(Array.isArray(shot.characterIds) && shot.characterIds.length > 0, `分镜 ${shot.id} 缺少角色`);
    assert.ok(Number.isFinite(shot.durationSeconds) && shot.durationSeconds > 0, `分镜 ${shot.id} 缺少时长`);
  }

  const prompts = JSON.parse(filesByPath.get('asset_prompts.json').content);
  assert.equal(prompts.prompts.filter((prompt) => prompt.type === 'video').length, 12);
  const clipsDir = path.resolve(__dirname, '../../../../outputs/xiaopeng-love-history-3min-v2/clips');
  const clips = fs.readdirSync(clipsDir).filter((name) => /^\d{2}-xp_v2_\d{2}_.+\.mp4$/.test(name));
  assert.equal(clips.length, 12);
});

test('GET rejects unknown demo ids instead of reading arbitrary files', async () => {
  const { GET } = loadRoute();
  const response = await GET(new Request('http://localhost/api/demo-workspace/../../.env.local'), {
    params: { id: '../../.env.local' }
  });
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.equal(body.ok, false);
  assert.match(body.error, /Unknown demo workspace/);
});
