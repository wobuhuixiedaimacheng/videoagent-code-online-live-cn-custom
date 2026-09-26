const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const { workspaceWith } = require('./testFixtures.cjs');

function loadWorkspaceModule() {
  const filePath = path.join(__dirname, 'workspace.ts');
  const previous = require.extensions['.ts'];
  require.extensions['.ts'] = (module, modulePath) => {
    const source = fs.readFileSync(modulePath, 'utf8');
    const output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
    }).outputText;
    module._compile(output, modulePath);
  };
  delete require.cache[filePath];
  const result = require(filePath);
  if (previous) require.extensions['.ts'] = previous;
  else delete require.extensions['.ts'];
  return result;
}

test('scene and storyboard readers preserve every item and storyboard prefers storyboard data', () => {
  const scenes = Array.from({ length: 12 }, (_, index) => ({
    id: `scene-${index + 1}`,
    title: `场景 ${index + 1}`,
    visual: `场景画面 ${index + 1}`,
    subtitle: `场景字幕 ${index + 1}`,
    start: index * 5,
    end: index * 5 + 5
  }));
  const storyboard = Array.from({ length: 12 }, (_, index) => ({
    id: `shot-${index + 1}`,
    title: `分镜 ${index + 1}`,
    narration: `分镜旁白 ${index + 1}`,
    visual: `分镜画面 ${index + 1}`,
    subtitle: `分镜字幕 ${index + 1}`,
    durationSeconds: 7
  }));
  const workspace = workspaceWith({
    'scenes.json': JSON.stringify({ scenes }),
    'storyboard.json': JSON.stringify({ scenes: storyboard })
  });
  const { sceneAssets, storyboardScenes } = loadWorkspaceModule();

  assert.equal(sceneAssets(workspace).length, 12);
  const shots = storyboardScenes(workspace);
  assert.equal(shots.length, 12);
  assert.equal(shots[0].id, 'shot-1');
  assert.equal(shots[0].title, '分镜 1');
  assert.equal(shots[0].durationSeconds, 7);
});
