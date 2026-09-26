const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

function loadModule(fileName) {
  const filePath = path.join(__dirname, fileName);
  const output = ts.transpileModule(fs.readFileSync(filePath, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  const module = { exports: {} };
  const localRequire = (id) => {
    if (id.startsWith('./')) return loadModule(`${id.slice(2)}.ts`);
    return require(id);
  };
  // 同一个 realm，deepStrictEqual 才不会因为跨 realm 的原型不同而假失败。
  // eslint-disable-next-line no-new-func
  new Function('module', 'exports', 'require', output)(module, module.exports, localRequire);
  return module.exports;
}

const boardsModule = loadModule('canvasBoards.ts');
const {
  CANVAS_BOARDS_PATH,
  CANVAS_NOTES_PATH,
  stickiesForStage,
  renderCanvasNotes,
  LEGACY_CANVAS_LAYOUT_PATH,
  PRODUCTION_BOARD_ID,
  canvasBoardsFromWorkspace,
  writeCanvasBoards,
  createBoard,
  createSticky,
  updateBoard,
  removeBoard
} = boardsModule;
const { isInternalWorkspaceFile, getFile } = loadModule('workspace.ts');
const { stageSourceFiles, stageOutputFilesForRequest, isProductionStageFile } = loadModule('stageGeneration.ts');

function workspace(files = []) {
  return {
    projectId: 'va_test',
    title: '测试项目',
    mode: 'creator',
    files,
    complianceStatus: 'pass'
  };
}

function fileOf(path, content, version = 1) {
  return { path, kind: 'config', version, content: JSON.stringify(content) };
}

/* ---------------- 一个项目至少有一张画布 ---------------- */

test('空项目也有生产画布——它是生产流程的视图，不该依赖任何写入', () => {
  const boards = canvasBoardsFromWorkspace(workspace());
  assert.equal(boards.length, 1);
  assert.equal(boards[0].id, PRODUCTION_BOARD_ID);
  assert.equal(boards[0].kind, 'production');
  assert.deepEqual(boards[0].layout, {});
  assert.deepEqual(boards[0].stickies, []);
});

test('生产画布永远排在第一个，哪怕文件里它排在后面', () => {
  const ws = workspace([
    fileOf(CANVAS_BOARDS_PATH, {
      version: 1,
      boards: [
        { id: 'board_1', name: '规划', kind: 'custom', layout: {}, stickies: [] },
        { id: PRODUCTION_BOARD_ID, name: '生产画布', kind: 'production', layout: {}, stickies: [] }
      ]
    })
  ]);
  const boards = canvasBoardsFromWorkspace(ws);
  assert.equal(boards[0].kind, 'production');
  assert.equal(boards[1].id, 'board_1');
});

test('文件里没有生产画布时补一张，用户建的画布不受影响', () => {
  const ws = workspace([
    fileOf(CANVAS_BOARDS_PATH, {
      version: 1,
      boards: [{ id: 'board_1', name: '规划', kind: 'custom', layout: {}, stickies: [] }]
    })
  ]);
  const boards = canvasBoardsFromWorkspace(ws);
  assert.equal(boards.length, 2);
  assert.equal(boards[0].kind, 'production');
  assert.equal(boards[1].name, '规划');
});

/* ---------------- 旧版布局文件的一次性迁移 ---------------- */

test('旧的 canvas-layout.json 会被迁进生产画布，用户拖过的位置不会丢', () => {
  const ws = workspace([
    fileOf(LEGACY_CANVAS_LAYOUT_PATH, { version: 1, nodes: { stage_script: { x: 40, y: 60 } } })
  ]);
  const boards = canvasBoardsFromWorkspace(ws);
  assert.deepEqual(boards[0].layout, { stage_script: { x: 40, y: 60 } });
});

test('已经有画布文件时不再看旧文件——迁移只发生一次', () => {
  const ws = workspace([
    fileOf(LEGACY_CANVAS_LAYOUT_PATH, { version: 1, nodes: { stage_script: { x: 999, y: 999 } } }),
    fileOf(CANVAS_BOARDS_PATH, {
      version: 1,
      boards: [{ id: PRODUCTION_BOARD_ID, name: '生产画布', kind: 'production', layout: {}, stickies: [] }]
    })
  ]);
  assert.deepEqual(canvasBoardsFromWorkspace(ws)[0].layout, {});
});

/* ---------------- 存取与稳定性 ---------------- */

test('存进去的读得出来', () => {
  const boards = canvasBoardsFromWorkspace(workspace());
  const board = createBoard(boards, '分镜规划');
  const sticky = createSticky(board, { x: 12, y: 34 });
  const next = [...boards, { ...board, stickies: [{ ...sticky, title: '记一笔', body: '这段要重拍' }] }];
  const ws = writeCanvasBoards(workspace(), next);

  const read = canvasBoardsFromWorkspace(ws);
  assert.equal(read.length, 2);
  assert.equal(read[1].name, '分镜规划');
  assert.deepEqual(read[1].stickies[0], {
    id: sticky.id,
    title: '记一笔',
    body: '这段要重拍',
    tone: 'neutral',
    scope: 'note',
    position: { x: 12, y: 34 }
  });
});

test('内容没变就不写盘，key 顺序不同也算没变', () => {
  const boards = [
    {
      id: PRODUCTION_BOARD_ID,
      name: '生产画布',
      kind: 'production',
      layout: { a: { x: 1, y: 2 }, b: { x: 3, y: 4 } },
      stickies: []
    }
  ];
  const first = writeCanvasBoards(workspace(), boards);
  assert.equal(writeCanvasBoards(first, boards), first, '内容相同必须返回同一个 workspace 引用');

  const reordered = [{ ...boards[0], layout: { b: { x: 3, y: 4 }, a: { x: 1, y: 2 } } }];
  assert.equal(writeCanvasBoards(first, reordered), first);
  assert.equal(getFile(first, CANVAS_BOARDS_PATH).version, 1);
});

test('真的改了才 +1 版本', () => {
  const boards = canvasBoardsFromWorkspace(workspace());
  const first = writeCanvasBoards(workspace(), boards);
  const moved = writeCanvasBoards(
    first,
    updateBoard(boards, PRODUCTION_BOARD_ID, (board) => ({ ...board, layout: { a: { x: 5, y: 6 } } }))
  );
  assert.equal(getFile(moved, CANVAS_BOARDS_PATH).version, 2);
});

test('坏掉的便签被逐条丢掉，不会带走整张画布', () => {
  const ws = workspace([
    fileOf(CANVAS_BOARDS_PATH, {
      version: 1,
      boards: [
        {
          id: PRODUCTION_BOARD_ID,
          name: '生产画布',
          kind: 'production',
          layout: { good: { x: 1, y: 2 }, bad: { x: Number.NaN, y: 0 } },
          stickies: [
            { id: 's1', title: '好的', body: '', tone: 'accent', position: { x: 1, y: 2 } },
            { id: 's2', title: '坐标坏了', body: '', tone: 'neutral', position: { x: 'x', y: 2 } },
            { id: '', title: '没有 id', body: '', tone: 'neutral', position: { x: 1, y: 1 } },
            null
          ]
        }
      ]
    })
  ]);
  const board = canvasBoardsFromWorkspace(ws)[0];
  assert.deepEqual(board.layout, { good: { x: 1, y: 2 } });
  assert.equal(board.stickies.length, 1);
  assert.equal(board.stickies[0].id, 's1');
});

test('不认识的配色回落到默认，不会渲染出一个没有样式的便签', () => {
  const ws = workspace([
    fileOf(CANVAS_BOARDS_PATH, {
      version: 1,
      boards: [
        {
          id: PRODUCTION_BOARD_ID,
          name: '生产画布',
          kind: 'production',
          layout: {},
          stickies: [{ id: 's1', title: '', body: '', tone: '紫色', position: { x: 0, y: 0 } }]
        }
      ]
    })
  ]);
  assert.equal(canvasBoardsFromWorkspace(ws)[0].stickies[0].tone, 'neutral');
});

test('文件不是 JSON 时安静回落到只有生产画布', () => {
  const ws = workspace([
    { path: CANVAS_BOARDS_PATH, kind: 'config', version: 1, content: '{ 这不是 JSON' }
  ]);
  const boards = canvasBoardsFromWorkspace(ws);
  assert.equal(boards.length, 1);
  assert.equal(boards[0].kind, 'production');
});

/* ---------------- 新建 / 删除 ---------------- */

test('新建画布的 id 和名字都不重复——重名的话切换器就没法用了', () => {
  let boards = canvasBoardsFromWorkspace(workspace());
  const a = createBoard(boards);
  boards = [...boards, a];
  const b = createBoard(boards);
  boards = [...boards, b];
  const c = createBoard(boards, '新画布');

  assert.notEqual(a.id, b.id);
  assert.equal(a.name, '新画布');
  assert.equal(b.name, '新画布 2');
  assert.equal(c.name, '新画布 3');
  assert.equal(a.kind, 'custom');
});

test('连着加便签会错开，不会两张完全重叠', () => {
  let board = createBoard([], '规划');
  const first = createSticky(board, { x: 100, y: 100 });
  board = { ...board, stickies: [first] };
  const second = createSticky(board, { x: 100, y: 100 });
  board = { ...board, stickies: [first, second] };
  const third = createSticky(board, { x: 100, y: 100 });

  assert.deepEqual(first.position, { x: 100, y: 100 });
  assert.notDeepEqual(second.position, first.position);
  assert.notDeepEqual(third.position, second.position);
  assert.notDeepEqual(third.position, first.position);
});

test('目标位置本来就空着时不平白错开', () => {
  const board = { ...createBoard([], '规划'), stickies: [] };
  assert.deepEqual(createSticky(board, { x: 7, y: 9 }).position, { x: 7, y: 9 });
});

test('便签 id 在同一张画布里不重复', () => {
  let board = createBoard([], '规划');
  const first = createSticky(board, { x: 0, y: 0 });
  board = { ...board, stickies: [first] };
  const second = createSticky(board, { x: 10, y: 10 });
  assert.notEqual(first.id, second.id);
});

test('生产画布删不掉——它是生产流程的视图，不是用户建出来的东西', () => {
  const boards = [...canvasBoardsFromWorkspace(workspace()), createBoard([], '规划')];
  assert.equal(removeBoard(boards, PRODUCTION_BOARD_ID).length, boards.length);
  assert.equal(removeBoard(boards, boards[1].id).length, boards.length - 1);
});

test('改一张不存在的画布不会静默新建一张出来', () => {
  const boards = canvasBoardsFromWorkspace(workspace());
  const next = updateBoard(boards, 'board_不存在', (board) => ({ ...board, name: '改了' }));
  assert.equal(next, boards);
});

/* ---------------- 最该守住的：画布不能污染生产状态机 ---------------- */

test('画布文件进不了任何阶段的上游依赖，所以永远触发不了「需重做」', () => {
  for (const stage of ['script', 'character', 'scene', 'storyboard', 'video']) {
    assert.ok(!stageSourceFiles(stage).includes(CANVAS_BOARDS_PATH));
    assert.ok(!stageSourceFiles(stage).includes(LEGACY_CANVAS_LAYOUT_PATH));
  }
});

test('画布文件不是任何阶段的产物，所以进不了审批链', () => {
  assert.equal(isProductionStageFile(CANVAS_BOARDS_PATH), false);
  for (const stage of ['script', 'character', 'scene', 'storyboard', 'video']) {
    assert.ok(!stageOutputFilesForRequest(stage).includes(CANVAS_BOARDS_PATH));
  }
});

test('新建画布、写便签都不会让空白项目看起来「有内容了」', () => {
  assert.ok(isInternalWorkspaceFile(CANVAS_BOARDS_PATH));
  const board = createBoard([], '规划');
  const sticky = createSticky(board, { x: 0, y: 0 });
  const ws = writeCanvasBoards(workspace(), [{ ...board, stickies: [sticky] }]);
  assert.equal(ws.files.filter((file) => !isInternalWorkspaceFile(file.path)).length, 0);
});


/* ---------------- 便签参与生成 ---------------- */

function boardWith(stickies) {
  return [{ id: PRODUCTION_BOARD_ID, name: '生产画布', kind: 'production', layout: {}, stickies }];
}

function sticky(id, scope, title, body = '') {
  return { id, title, body, tone: 'neutral', scope, position: { x: 0, y: 0 } };
}

test('默认不参与生成——随手写的一句抱怨不能变成生成指令', () => {
  const board = createBoard([], '规划');
  assert.equal(createSticky(board, { x: 0, y: 0 }).scope, 'note');
  const boards = boardWith([sticky('s1', 'note', '这版不好看')]);
  assert.deepEqual(stickiesForStage(boards, 'script'), []);
  assert.equal(renderCanvasNotes(boards, 'script'), '');
});

test('标了阶段的便签只进那个阶段，标了全部的进每个阶段', () => {
  const boards = boardWith([
    sticky('s1', 'storyboard', '每场至少一个反应镜头'),
    sticky('s2', 'all', '整体节奏要快'),
    sticky('s3', 'note', '随手记的')
  ]);
  assert.deepEqual(stickiesForStage(boards, 'storyboard').map((item) => item.id), ['s1', 's2']);
  assert.deepEqual(stickiesForStage(boards, 'script').map((item) => item.id), ['s2']);
  assert.deepEqual(stickiesForStage(boards, 'video').map((item) => item.id), ['s2']);
});

test('自定义画布上标记的便签同样算数——写在哪张纸上和要不要照做是两件事', () => {
  const boards = [
    ...boardWith([]),
    { id: 'board_1', name: '规划', kind: 'custom', layout: {}, stickies: [sticky('s9', 'scene', '多用夜景')] }
  ];
  assert.deepEqual(stickiesForStage(boards, 'scene').map((item) => item.id), ['s9']);
});

test('空便签不进提示词——什么都没写的备注只会占上下文', () => {
  const boards = boardWith([sticky('s1', 'all', '   ', '  ')]);
  assert.deepEqual(stickiesForStage(boards, 'script'), []);
});

test('渲染出来的备注带着标题和正文，没有可用便签时是空串', () => {
  const boards = boardWith([sticky('s1', 'video', '镜头别太碎', '每个镜头至少 3 秒。')]);
  const text = renderCanvasNotes(boards, 'video');
  assert.match(text, /画布备注/);
  assert.match(text, /镜头别太碎/);
  assert.match(text, /每个镜头至少 3 秒。/);
  assert.equal(renderCanvasNotes(boards, 'script'), '');
});

test('认不出来的 scope 回落到「只是笔记」，不会凭猜把它变成指令', () => {
  const ws = workspace([
    fileOf(CANVAS_BOARDS_PATH, {
      version: 1,
      boards: boardWith([{ ...sticky('s1', 'note', '写点什么'), scope: '随便什么阶段' }])
    })
  ]);
  assert.equal(canvasBoardsFromWorkspace(ws)[0].stickies[0].scope, 'note');
});

test('便签合成的文件不落盘，也进不了任何阶段的上游依赖', () => {
  // 它能改变模型看到什么，但改一条便签不该把已经确认的下游标成「需重做」。
  for (const stage of ['script', 'character', 'scene', 'storyboard', 'video']) {
    assert.ok(!stageSourceFiles(stage).includes(CANVAS_NOTES_PATH));
    assert.ok(!stageOutputFilesForRequest(stage).includes(CANVAS_NOTES_PATH));
  }
  assert.equal(isProductionStageFile(CANVAS_NOTES_PATH), false);
});

test('便签合成的文件在每个阶段的提示词上下文里', () => {
  const { stagePromptContextFiles } = loadModule('stageGeneration.ts');
  for (const stage of ['script', 'character', 'scene', 'storyboard', 'video']) {
    assert.ok(
      stagePromptContextFiles(stage).includes(CANVAS_NOTES_PATH),
      `${stage} 阶段的提示词上下文必须带上画布备注`
    );
  }
});
