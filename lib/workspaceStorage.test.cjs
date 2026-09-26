const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

function loadWorkspaceStorage() {
  const filePath = path.join(__dirname, 'workspaceStorage.ts');
  assert.equal(fs.existsSync(filePath), true, 'workspaceStorage.ts should define browser persistence helpers');
  const source = fs.readFileSync(filePath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const module = { exports: {} };
  new Function('exports', 'module', output)(module.exports, module);
  return module.exports;
}

const snapshot = { projectId: 'p1', title: '项目', files: [] };

test('an encoded workspace round-trips through its envelope with a schema version', () => {
  const { encodeWorkspaceEnvelope, decodeWorkspaceEnvelope, WORKSPACE_SCHEMA_VERSION } = loadWorkspaceStorage();
  const decoded = decodeWorkspaceEnvelope(encodeWorkspaceEnvelope(snapshot, '2026-08-03T00:00:00.000Z'));

  assert.equal(decoded.ok, true);
  assert.equal(decoded.schemaVersion, WORKSPACE_SCHEMA_VERSION);
  assert.equal(decoded.savedAt, '2026-08-03T00:00:00.000Z');
  assert.equal(decoded.legacy, false);
  assert.deepEqual(decoded.workspace, snapshot);
});

test('a pre-envelope bare snapshot still loads so upgrading never wipes existing projects', () => {
  const { decodeWorkspaceEnvelope } = loadWorkspaceStorage();
  const decoded = decodeWorkspaceEnvelope(JSON.stringify(snapshot));

  assert.equal(decoded.ok, true);
  assert.equal(decoded.legacy, true);
  assert.equal(decoded.schemaVersion, 0);
  assert.deepEqual(decoded.workspace, snapshot);
});

test('unreadable and future-version payloads are reported instead of silently discarded', () => {
  const { decodeWorkspaceEnvelope } = loadWorkspaceStorage();

  assert.deepEqual(decodeWorkspaceEnvelope(''), { ok: false, reason: 'empty', raw: '' });
  assert.deepEqual(decodeWorkspaceEnvelope(null), { ok: false, reason: 'empty', raw: '' });

  const broken = decodeWorkspaceEnvelope('{"schemaVersion":1,"workspace":');
  assert.equal(broken.ok, false);
  assert.equal(broken.reason, 'unparsable');
  assert.equal(broken.raw, '{"schemaVersion":1,"workspace":', 'the original text survives for recovery');

  const future = decodeWorkspaceEnvelope(JSON.stringify({ schemaVersion: 99, savedAt: '', workspace: snapshot }));
  assert.equal(future.ok, false);
  assert.equal(future.reason, 'future_version');

  assert.equal(decodeWorkspaceEnvelope('[1,2,3]').ok, false, 'a JSON array is not a workspace envelope');
});

test('quota is measured in utf-16 units so chinese content is not underestimated', () => {
  const { localStorageByteLength } = loadWorkspaceStorage();

  assert.equal(localStorageByteLength('abc'), 6);
  assert.equal(localStorageByteLength('镜头一'), 6);
  assert.equal(
    localStorageByteLength('镜头一'),
    Buffer.byteLength('镜头一', 'utf8') - 3,
    'utf-8 would have reported 9 bytes for what the browser charges as 6'
  );
});

test('quota exceptions are recognised across browser error shapes', () => {
  const { isQuotaExceededError } = loadWorkspaceStorage();

  assert.equal(isQuotaExceededError({ name: 'QuotaExceededError' }), true);
  assert.equal(isQuotaExceededError({ name: 'NS_ERROR_DOM_QUOTA_REACHED' }), true);
  assert.equal(isQuotaExceededError({ code: 22 }), true);
  assert.equal(isQuotaExceededError({ code: 1014 }), true);

  assert.equal(isQuotaExceededError(new Error('boom')), false);
  assert.equal(isQuotaExceededError(null), false);
  assert.equal(isQuotaExceededError('QuotaExceededError'), false);
});

test('recovery keys and notices point at the preserved copy', () => {
  const { workspaceRecoveryKey, recoveryNoticeFor } = loadWorkspaceStorage();
  const key = workspaceRecoveryKey('videoagent-workspace:p1');

  assert.equal(key, 'videoagent-workspace:p1:corrupted');
  assert.match(recoveryNoticeFor('unparsable', 'videoagent-workspace:p1'), /没有被删除/);
  assert.ok(recoveryNoticeFor('unparsable', 'videoagent-workspace:p1').includes(key));
  assert.match(recoveryNoticeFor('future_version', 'videoagent-workspace:p1'), /不要在此覆盖保存/);
});
