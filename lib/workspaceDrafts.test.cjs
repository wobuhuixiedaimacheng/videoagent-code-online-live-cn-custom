const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const {
  workspaceWith,
  patch,
  readyFlow,
  confirmationInput,
  parseFile
} = require('./testFixtures.cjs');

function loadWorkspaceDraftsModule() {
  const filePath = path.join(__dirname, 'workspaceDrafts.ts');
  assert.equal(fs.existsSync(filePath), true, 'workspaceDrafts.ts should define pending patch persistence');

  require.extensions['.ts'] = (module, modulePath) => {
    const source = fs.readFileSync(modulePath, 'utf8');
    const output = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020
      }
    }).outputText;
    module._compile(output, modulePath);
  };

  delete require.cache[filePath];
  delete require.cache[path.join(__dirname, 'workspace.ts')];
  delete require.cache[path.join(__dirname, 'productionFlow.ts')];
  return require(filePath);
}

function getFile(workspace, filePath) {
  return workspace.files.find((file) => file.path === filePath);
}

test('pending patches survive workspace serialization', () => {
  const { savePendingPatches, readPendingPatches } = loadWorkspaceDraftsModule();
  const withDrafts = savePendingPatches(workspaceWith(), [patch('script.md', '# 新脚本')]);
  const restored = JSON.parse(JSON.stringify(withDrafts));
  assert.equal(readPendingPatches(restored)[0].filePath, 'script.md');
});

test('confirming one stage consumes only that stages patches', () => {
  const { savePendingPatches, consumePendingPatches, readPendingPatches } = loadWorkspaceDraftsModule();
  const source = savePendingPatches(workspaceWith(), [
    patch('characters.json', '{"characters":[]}'),
    patch('compliance_report.json', '{"status":"warning"}')
  ]);
  const result = consumePendingPatches(source, ['characters.json']);
  assert.equal(getFile(result.workspace, 'characters.json').version, 1);
  assert.deepEqual(readPendingPatches(result.workspace).map((item) => item.filePath), ['compliance_report.json']);
});

test('appending a newer patch replaces the older draft for the same file', () => {
  const { savePendingPatches, appendPendingPatches, readPendingPatches } = loadWorkspaceDraftsModule();
  const source = savePendingPatches(workspaceWith(), [patch('scenes.json', 'v1')]);
  const next = appendPendingPatches(source, [patch('scenes.json', 'v2')]);
  assert.equal(readPendingPatches(next)[0].after, 'v2');
});

test('preview applies pending patches without mutating the stored workspace', () => {
  const { applyPatchesForPreview } = loadWorkspaceDraftsModule();
  const workspace = workspaceWith({ 'script.md': 'v1' });
  const preview = applyPatchesForPreview(workspace, [patch('script.md', 'v2', 'v1')]);
  assert.equal(getFile(preview, 'script.md').content, 'v2');
  assert.equal(getFile(workspace, 'script.md').content, 'v1');
});

test('confirming a stage writes the consumed assets and next flow in one snapshot', () => {
  const { savePendingPatches, confirmStageInWorkspace, readPendingPatches } = loadWorkspaceDraftsModule();
  const flow = readyFlow('script', 1);
  flow.stages.script.generationJobId = 'script-job-current';
  const source = savePendingPatches(workspaceWith({
    'production_flow.json': JSON.stringify(flow)
  }), [{
    ...patch('script.md', '# 已确认脚本'),
    origin: { kind: 'agent_stage', productionStage: 'script', generationJobId: 'script-job-current' }
  }]);
  const result = confirmStageInWorkspace(source, {
    ...confirmationInput('script', 1, 'script-confirm-1'),
    outputFiles: ['script.md']
  });

  assert.equal(getFile(result.workspace, 'script.md').content, '# 已确认脚本');
  assert.deepEqual(readPendingPatches(result.workspace), []);
  assert.equal(parseFile(result.workspace, 'production_flow.json').stages.script.status, 'confirmed');
  assert.equal(parseFile(result.workspace, 'production_flow.json').stages.character.status, 'generating');
});

test('confirming a stage with no current reviewable patch is rejected', () => {
  const { confirmStageInWorkspace } = loadWorkspaceDraftsModule();
  const source = workspaceWith({
    'script.md': '# 已提交脚本',
    'production_flow.json': JSON.stringify(readyFlow('script', 1))
  });

  assert.throws(() => confirmStageInWorkspace(source, {
    ...confirmationInput('script', 1, 'script-confirm-empty'),
    outputFiles: ['script.md']
  }), /待审|patch|草稿/);
});

test('confirming a stage rejects a patch owned by another generation job', () => {
  const { savePendingPatches, confirmStageInWorkspace } = loadWorkspaceDraftsModule();
  const flow = readyFlow('script', 1);
  flow.stages.script.generationJobId = 'script-job-current';
  const source = savePendingPatches(workspaceWith({
    'script.md': '# 已提交脚本',
    'production_flow.json': JSON.stringify(flow)
  }), [{
    ...patch('script.md', '# 错误旧 job 脚本', '# 已提交脚本'),
    origin: { kind: 'agent_stage', productionStage: 'script', generationJobId: 'script-job-old' }
  }]);

  assert.throws(() => confirmStageInWorkspace(source, {
    ...confirmationInput('script', 1, 'script-confirm-wrong-job'),
    outputFiles: ['script.md']
  }), /job|来源|当前/);
});

test('autopilot consumes only low-risk patches emitted by the current Agent run', () => {
  const {
    savePendingPatches,
    autopilotPatchesForRun,
    consumePendingPatches,
    readPendingPatches
  } = loadWorkspaceDraftsModule();
  const agentPatch = patch('script.md', '# Agent 脚本');
  const manualPatch = {
    ...patch('asset_library.json', '{"assets":[]}'),
    id: 'manual-approval-patch',
    requiresApproval: true
  };
  const source = savePendingPatches(workspaceWith(), [agentPatch, manualPatch]);
  const applied = autopilotPatchesForRun(source, [agentPatch]);
  const result = consumePendingPatches(source, applied.map((item) => item.filePath));

  assert.deepEqual(applied.map((item) => item.id), [agentPatch.id]);
  assert.deepEqual(readPendingPatches(result.workspace).map((item) => item.id), [manualPatch.id]);
});

test('workspace storage validation rejects invalid enums and malformed file entries', () => {
  loadWorkspaceDraftsModule();
  const { isWorkspaceSnapshot } = require('./workspace.ts');
  const valid = workspaceWith({
    '.aigc/MEMORY.md': '# memory',
    'production_flow.json': '{}'
  });

  assert.equal(isWorkspaceSnapshot(valid), true);
  assert.equal(isWorkspaceSnapshot({ ...valid, mode: 'legacy' }), false);
  assert.equal(isWorkspaceSnapshot({ ...valid, activeWorkflow: 'unsupported' }), false);
  assert.equal(isWorkspaceSnapshot({ ...valid, files: [{ path: '.aigc/MEMORY.md' }] }), false);
});
