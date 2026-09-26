const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const { workspaceWith, readyFlow } = require('./testFixtures.cjs');

function loadProjectStore() {
  const filePath = path.join(__dirname, 'projectStore.ts');
  const previous = require.extensions['.ts'];
  require.extensions['.ts'] = (module, modulePath) => {
    const source = fs.readFileSync(modulePath, 'utf8');
    const output = ts.transpileModule(source, {
      // projectStore 里有 `import fs from 'node:fs/promises'`：不开 esModuleInterop，
      // 转译产物会去取 .default，运行时直接 undefined。
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true }
    }).outputText;
    module._compile(output, modulePath);
  };
  delete require.cache[filePath];
  const result = require(filePath);
  if (previous) require.extensions['.ts'] = previous;
  else delete require.extensions['.ts'];
  return result;
}

async function withProjectsDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'projectstore-'));
  const previous = process.env.VIDEOAGENT_PROJECTS_DIR;
  process.env.VIDEOAGENT_PROJECTS_DIR = dir;
  try {
    await fn(dir);
  } finally {
    if (previous === undefined) delete process.env.VIDEOAGENT_PROJECTS_DIR;
    else process.env.VIDEOAGENT_PROJECTS_DIR = previous;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function recordFor(projectId, savedAt, extras = {}) {
  const workspace = {
    ...workspaceWith({
      'production_flow.json': JSON.stringify(readyFlow('storyboard', 2)),
      'script.md': '# 脚本'
    }),
    projectId
  };
  return {
    schemaVersion: 1,
    projectId,
    savedAt,
    workspace,
    messages: [{ id: 'm1', role: 'user', content: '做一条视频', createdAt: savedAt }],
    ...extras
  };
}

test('project ids that could escape the projects directory are rejected', () => {
  const { isSafeProjectId } = loadProjectStore();
  assert.equal(isSafeProjectId('va_abc123'), true);
  assert.equal(isSafeProjectId('../../etc/passwd'), false);
  assert.equal(isSafeProjectId('a/b'), false);
  assert.equal(isSafeProjectId('a\\b'), false);
  assert.equal(isSafeProjectId(''), false);
  assert.equal(isSafeProjectId('x'.repeat(65)), false);
  assert.equal(isSafeProjectId(42), false);
});

test('a saved project round-trips through disk and shows up in the list newest first', async () => {
  const store = loadProjectStore();
  await withProjectsDir(async () => {
    await store.writeProjectRecord(recordFor('va_old', '2026-08-01T08:00:00.000Z'));
    await store.writeProjectRecord(recordFor('va_new', '2026-08-07T09:00:00.000Z'));

    const restored = await store.readProjectRecord('va_new');
    assert.equal(restored.projectId, 'va_new');
    assert.equal(restored.workspace.title, '测试项目');
    assert.equal(restored.messages.length, 1);

    const summaries = await store.listProjectSummaries();
    assert.deepEqual(
      summaries.map((item) => item.projectId),
      ['va_new', 'va_old']
    );
    assert.equal(summaries[0].currentStage, 'storyboard');
    assert.equal(summaries[0].messageCount, 1);
    assert.equal(summaries[0].mode, 'smb');
  });
});

test('corrupted archives are skipped by the list but never deleted', async () => {
  const store = loadProjectStore();
  await withProjectsDir(async (dir) => {
    await store.writeProjectRecord(recordFor('va_good', '2026-08-07T09:00:00.000Z'));
    const corruptedPath = path.join(dir, 'va_bad.json');
    fs.writeFileSync(corruptedPath, '{ definitely not json', 'utf8');

    const summaries = await store.listProjectSummaries();
    assert.deepEqual(summaries.map((item) => item.projectId), ['va_good']);
    assert.equal(fs.existsSync(corruptedPath), true, 'corrupted archive must stay on disk for manual recovery');

    assert.equal(await store.readProjectRecord('va_bad'), null);
  });
});

test('writes are atomic: no tmp files linger and the archive stays parseable', async () => {
  const store = loadProjectStore();
  await withProjectsDir(async (dir) => {
    await store.writeProjectRecord(recordFor('va_x', '2026-08-07T09:00:00.000Z'));
    await store.writeProjectRecord(recordFor('va_x', '2026-08-07T09:05:00.000Z'));

    const entries = fs.readdirSync(dir);
    assert.deepEqual(entries, ['va_x.json']);
    const record = await store.readProjectRecord('va_x');
    assert.equal(record.savedAt, '2026-08-07T09:05:00.000Z');
  });
});

test('deleting removes the archive and reports whether anything was there', async () => {
  const store = loadProjectStore();
  await withProjectsDir(async () => {
    await store.writeProjectRecord(recordFor('va_gone', '2026-08-07T09:00:00.000Z'));
    assert.equal(await store.deleteProjectRecord('va_gone'), true);
    assert.equal(await store.readProjectRecord('va_gone'), null);
    assert.equal(await store.deleteProjectRecord('va_gone'), false);
    assert.equal(await store.deleteProjectRecord('../oops'), false);
  });
});

test('a final-cut sidecar fills the archive gap but never overwrites an existing final cut', async () => {
  const store = loadProjectStore();
  await withProjectsDir(async (dir) => {
    await store.writeProjectRecord(recordFor('va_cut', '2026-08-08T06:00:00.000Z'));
    const sidecar = {
      jobId: 'cut_manual_restore',
      status: 'completed',
      phase: 'done',
      progress: 100,
      fileName: '成片.mp4',
      fileUrl: '/api/video/stitch/file?job_id=cut_manual_restore'
    };
    fs.writeFileSync(path.join(dir, 'va_cut.finalcut.json'), JSON.stringify(sidecar), 'utf8');

    const record = await store.readProjectRecord('va_cut');
    const patched = await store.applyFinalCutSidecar(record);
    const flowFile = patched.workspace.files.find((file) => file.path === 'production_flow.json');
    const flow = JSON.parse(flowFile.content);
    assert.equal(flow.finalCut.jobId, 'cut_manual_restore');
    assert.equal(flow.finalCut.status, 'completed');

    // 主档案已有成片时，伴生文件不得覆盖。
    const again = await store.applyFinalCutSidecar(patched);
    const againFlow = JSON.parse(again.workspace.files.find((file) => file.path === 'production_flow.json').content);
    assert.equal(againFlow.finalCut.jobId, 'cut_manual_restore');

    // 伴生文件名过不了 isSafeProjectId，列表绝不会把它当成另一个项目。
    const summaries = await store.listProjectSummaries();
    assert.deepEqual(summaries.map((item) => item.projectId), ['va_cut']);
  });
});

test('records that fail validation parse to null instead of half-loaded projects', () => {
  const { parseStoredProjectRecord } = loadProjectStore();
  assert.equal(parseStoredProjectRecord('not json'), null);
  assert.equal(parseStoredProjectRecord(JSON.stringify({ schemaVersion: 99, projectId: 'a', savedAt: '', workspace: {} })), null);
  assert.equal(parseStoredProjectRecord(JSON.stringify({ schemaVersion: 1, projectId: 'a', savedAt: '', workspace: { nope: true } })), null);

  const valid = recordFor('va_ok', '2026-08-07T09:00:00.000Z');
  const parsed = parseStoredProjectRecord(JSON.stringify(valid));
  assert.equal(parsed.projectId, 'va_ok');
  assert.equal(parsed.messages.length, 1);
});
