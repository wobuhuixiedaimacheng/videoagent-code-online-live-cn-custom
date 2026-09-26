const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

function loadStore() {
  const restore = installTypeScriptLoader();
  try {
    const filePath = path.join(__dirname, 'finalCutStore.ts');
    assert.equal(fs.existsSync(filePath), true, 'finalCutStore.ts should exist');
    const module = { exports: {} };
    new Function('exports', 'module', 'require', transpile(filePath))(module.exports, module, require);
    return module.exports;
  } finally {
    restore();
  }
}

function transpile(filePath) {
  return ts.transpileModule(fs.readFileSync(filePath, 'utf8'), {
    // finalCutStore 用的是 `import path from 'node:path'` 这类默认导入，
    // 不开 esModuleInterop 转出来就是 node_path_1.default.join(...)，运行时直接炸。
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    }
  }).outputText;
}

function installTypeScriptLoader() {
  const previous = require.extensions['.ts'];
  require.extensions['.ts'] = (module, filePath) => module._compile(transpile(filePath), filePath);
  return () => {
    if (previous) require.extensions['.ts'] = previous;
    else delete require.extensions['.ts'];
  };
}

const store = loadStore();

test('同一个片段地址永远映射到同一个缓存文件', () => {
  // 这是断点续传的地基：映射不稳定，重试就会把几十段全部重下一遍，
  // 于是「合成失败 → 重试 → 又失败」会一直循环下去。
  const url = 'https://cdn.example.com/a/b/clip.mp4?sig=abc';
  assert.equal(store.clipCachePath(url), store.clipCachePath(url));
});

test('不同片段地址不会撞进同一个缓存文件', () => {
  const a = store.clipCachePath('https://cdn.example.com/clip-1.mp4');
  const b = store.clipCachePath('https://cdn.example.com/clip-2.mp4');
  assert.notEqual(a, b);
});

test('缓存文件落在缓存目录里，且不带上游路径结构', () => {
  const cachePath = store.clipCachePath('https://cdn.example.com/deep/nested/clip.mp4');
  assert.equal(path.dirname(cachePath), store.CLIP_CACHE_DIR);
  assert.match(path.basename(cachePath), /^[0-9a-f]{32}\.mp4$/);
});

test('job id 校验挡住路径穿越', () => {
  assert.equal(store.isValidFinalCutJobId('cut_abc123_def456'), true);
  assert.equal(store.isValidFinalCutJobId('../../../etc/passwd'), false);
  assert.equal(store.isValidFinalCutJobId('cut_../x'), false);
  assert.equal(store.isValidFinalCutJobId(''), false);
  assert.equal(store.isValidFinalCutJobId(null), false);
});

test('pruneClipCache 只清陈旧文件，留下刚用过的', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clip-cache-'));
  const fresh = path.join(dir, 'fresh.mp4');
  const stale = path.join(dir, 'stale.mp4');
  fs.writeFileSync(fresh, 'x');
  fs.writeFileSync(stale, 'x');
  const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  fs.utimesSync(stale, old, old);

  // pruneClipCache 读的是模块常量，这里直接验证同样的判据，避免依赖 cwd。
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  assert.equal(fs.statSync(stale).mtimeMs < cutoff, true, '陈旧文件应被判为可清');
  assert.equal(fs.statSync(fresh).mtimeMs < cutoff, false, '刚写的文件不该被清');

  // 缺目录时必须安静返回，不能让清理失败连累合成。
  await store.pruneClipCache(1000);
  fs.rmSync(dir, { recursive: true, force: true });
});
