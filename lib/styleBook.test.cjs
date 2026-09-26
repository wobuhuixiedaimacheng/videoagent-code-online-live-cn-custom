const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function loadStyleBookModule() {
  const filePath = path.join(__dirname, 'styleBook.ts');
  assert.equal(fs.existsSync(filePath), true, 'styleBook.ts should exist');
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

function workspaceWith(files) {
  return {
    projectId: 'p1',
    title: 't',
    mode: 'creator',
    activeWorkflow: 'generate',
    complianceStatus: 'pass',
    currentTimelineVersion: 1,
    files: Object.entries(files).map(([p, content]) => ({
      path: p,
      kind: p.endsWith('.json') ? 'json' : 'markdown',
      content,
      version: 1,
      updatedAt: '2026-08-03T00:00:00.000Z'
    }))
  };
}

test('a workspace without style.json resolves to no style rather than throwing', () => {
  const { styleBookFromWorkspace, resolveStageStyle } = loadStyleBookModule();
  const book = styleBookFromWorkspace(workspaceWith({}));
  assert.equal(book.global, null);
  assert.equal(resolveStageStyle(book, 'character').style, null);
  assert.equal(resolveStageStyle(book, 'character').source, 'none');
});

test('malformed style.json falls back to empty instead of poisoning every stage', () => {
  const { styleBookFromWorkspace } = loadStyleBookModule();
  assert.equal(styleBookFromWorkspace(workspaceWith({ 'style.json': 'not json' })).global, null);
  assert.equal(styleBookFromWorkspace(workspaceWith({ 'style.json': '{"schemaVersion":99}' })).global, null);
  assert.equal(styleBookFromWorkspace(workspaceWith({ 'style.json': '{"schemaVersion":1,"global":{"id":""}}' })).global, null);
});

test('stages inherit the global style until they explicitly override it', () => {
  const { emptyStyleBook, setGlobalStyle, setStageStyle, resolveStageStyle, STYLE_PRESETS } = loadStyleBookModule();
  const anime = STYLE_PRESETS.find((s) => s.id === 'anime');
  const real = STYLE_PRESETS.find((s) => s.id === 'real');

  let book = setGlobalStyle(emptyStyleBook(), anime);
  assert.equal(resolveStageStyle(book, 'character').style.id, 'anime');
  assert.equal(resolveStageStyle(book, 'character').source, 'global');
  assert.equal(resolveStageStyle(book, 'scene').style.id, 'anime');
  assert.equal(resolveStageStyle(book, 'scene').source, 'global');

  book = setStageStyle(book, 'scene', real);
  assert.equal(resolveStageStyle(book, 'scene').style.id, 'real');
  assert.equal(resolveStageStyle(book, 'scene').source, 'stage');
  assert.equal(resolveStageStyle(book, 'character').style.id, 'anime', 'override must not leak to other stages');
});

test('clearing a stage override returns that stage to the global style', () => {
  const { emptyStyleBook, setGlobalStyle, setStageStyle, resolveStageStyle, STYLE_PRESETS } = loadStyleBookModule();
  const anime = STYLE_PRESETS.find((s) => s.id === 'anime');
  const real = STYLE_PRESETS.find((s) => s.id === 'real');
  let book = setStageStyle(setGlobalStyle(emptyStyleBook(), anime), 'scene', real);
  book = setStageStyle(book, 'scene', null);
  assert.equal(resolveStageStyle(book, 'scene').style.id, 'anime');
  assert.equal(resolveStageStyle(book, 'scene').source, 'global');
});

test('a single style across all stages reports no drift', () => {
  const { emptyStyleBook, setGlobalStyle, styleDriftWarnings, STYLE_PRESETS } = loadStyleBookModule();
  const book = setGlobalStyle(emptyStyleBook(), STYLE_PRESETS[0]);
  assert.equal(styleDriftWarnings(book).length, 0);
});

test('mixing an anime character with a live-action scene is reported as drift', () => {
  // 这正是 oiioii 上翻车的情形：角色韩系二次元、场景改成 AI 真人。
  const { emptyStyleBook, setGlobalStyle, setStageStyle, styleDriftWarnings, STYLE_PRESETS } = loadStyleBookModule();
  const anime = STYLE_PRESETS.find((s) => s.id === 'anime');
  const real = STYLE_PRESETS.find((s) => s.id === 'real');
  const book = setStageStyle(setGlobalStyle(emptyStyleBook(), anime), 'scene', real);
  const warnings = styleDriftWarnings(book);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /角色/);
  assert.match(warnings[0], /场景/);
  assert.match(warnings[0], /二次元/);
  assert.match(warnings[0], /写实生活感/);
});

test('drift needs at least two resolved stages', () => {
  const { emptyStyleBook, setStageStyle, styleDriftWarnings, STYLE_PRESETS } = loadStyleBookModule();
  const book = setStageStyle(emptyStyleBook(), 'scene', STYLE_PRESETS[0]);
  assert.equal(styleDriftWarnings(book).length, 0, 'one stage alone cannot drift');
});

test('script stage never receives a visual style instruction', () => {
  const { emptyStyleBook, setGlobalStyle, stageStyleInstruction, STYLE_PRESETS } = loadStyleBookModule();
  const book = setGlobalStyle(emptyStyleBook(), STYLE_PRESETS[0]);
  assert.equal(stageStyleInstruction(book, 'script'), '', 'script produces text, not visuals');
  assert.notEqual(stageStyleInstruction(book, 'character'), '');
});

test('style instruction states the style and whether it is project-wide or stage-local', () => {
  const { emptyStyleBook, setGlobalStyle, setStageStyle, stageStyleInstruction, STYLE_PRESETS } = loadStyleBookModule();
  const anime = STYLE_PRESETS.find((s) => s.id === 'anime');
  const real = STYLE_PRESETS.find((s) => s.id === 'real');
  const book = setStageStyle(setGlobalStyle(emptyStyleBook(), anime), 'scene', real);

  const inherited = stageStyleInstruction(book, 'character');
  assert.match(inherited, /二次元/);
  assert.match(inherited, /项目统一/);

  const overridden = stageStyleInstruction(book, 'scene');
  assert.match(overridden, /写实生活感/);
  assert.match(overridden, /本阶段指定/);
});

test('no style selected means no style instruction is injected at all', () => {
  const { emptyStyleBook, stageStyleInstruction } = loadStyleBookModule();
  assert.equal(stageStyleInstruction(emptyStyleBook(), 'character'), '');
});

test('custom style words survive a write and read round trip', () => {
  const { emptyStyleBook, setGlobalStyle, customStyle, isCustomStyle, writeStyleBook, styleBookFromWorkspace } =
    loadStyleBookModule();
  const style = customStyle('  赛博朋克霓虹  ');
  assert.equal(style.label, '赛博朋克霓虹');
  assert.equal(isCustomStyle(style), true);

  const book = setGlobalStyle(emptyStyleBook(), style);
  const saved = writeStyleBook(workspaceWith({}), book);
  assert.equal(styleBookFromWorkspace(saved).global.label, '赛博朋克霓虹');
});

test('blank custom style input is rejected rather than stored as an empty style', () => {
  const { customStyle } = loadStyleBookModule();
  assert.equal(customStyle('   '), null);
});
