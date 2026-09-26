const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

function loadModule(relativePath, deps = {}) {
  const filePath = path.join(__dirname, relativePath);
  const output = ts.transpileModule(fs.readFileSync(filePath, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  const module = { exports: {} };
  const localRequire = (id) => (Object.prototype.hasOwnProperty.call(deps, id) ? deps[id] : require(id));
  /*
   * 用 new Function 而不是 vm.runInNewContext：后者会把模块放进另一个 realm，
   * 里面 new 出来的数组和对象跟测试文件不是同一个 Array/Object，
   * deepStrictEqual 会报「结构一样但不是同一个引用」——那是测试的假失败，不是代码的问题。
   */
  // eslint-disable-next-line no-new-func
  new Function('module', 'exports', 'require', '__filename', output)(
    module,
    module.exports,
    localRequire,
    filePath
  );
  return module.exports;
}

const types = loadModule('types.ts');
const { buildProductionGraph } = loadModule('graph.ts', { './types': types });
const { layoutProductionGraph, graphBounds, MAX_COLUMN_HEIGHT, MAX_NODES_PER_COLUMN } = loadModule(
  'layout.ts',
  { './types': types }
);

function lane(stage, cards, extra = {}) {
  return { stage, emoji: '🎬', owner: `${stage}负责人`, status: 'ready_for_review', cards, ...extra };
}

function scene(id, shotCount) {
  return {
    id: `card_scene_${id}`,
    title: `场次 ${id}`,
    childrenLabel: `${shotCount} 个镜头`,
    children: Array.from({ length: shotCount }, (_, index) => ({
      id: `card_shot_${id}_${index}`,
      title: `镜头 ${index}`,
      stage: 'storyboard'
    }))
  };
}

function sampleLanes({ characters = 2, scenes = 2, shotsPerScene = 3, videos = 2 } = {}) {
  return [
    lane('script', [{ id: 'card_script', title: '脚本正文' }]),
    lane(
      'character',
      Array.from({ length: characters }, (_, index) => ({
        id: `card_character_c${index}`,
        title: `角色 ${index}`
      }))
    ),
    lane('scene', Array.from({ length: scenes }, (_, index) => scene(`s${index}`, shotsPerScene))),
    lane('storyboard', [], { note: '镜头挂在场景下面。' }),
    lane(
      'video',
      Array.from({ length: videos }, (_, index) => ({ id: `card_video_v${index}`, title: `任务 ${index}` }))
    )
  ];
}

function laidOut(options) {
  const graph = buildProductionGraph({ lanes: sampleLanes(options), ...options });
  return layoutProductionGraph({ graph, overrides: options?.overrides });
}

/** 顶层节点的世界矩形。子节点坐标相对父节点，不参与顶层重叠判断。 */
function rects(nodes) {
  return nodes
    .filter((node) => !node.parentId)
    .map((node) => ({
      id: node.id,
      x: node.position.x,
      y: node.position.y,
      right: node.position.x + node.size.width,
      bottom: node.position.y + node.size.height
    }));
}

function overlaps(a, b) {
  return a.x < b.right && b.x < a.right && a.y < b.bottom && b.y < a.bottom;
}

test('横轴就是生产顺序：剧本 → 角色 → 场景 → 分镜 → 视频', () => {
  const { columns } = laidOut();
  assert.deepEqual(columns.map((column) => column.stage), [
    'script',
    'character',
    'scene',
    'storyboard',
    'video'
  ]);
  for (let index = 1; index < columns.length; index += 1) {
    assert.ok(
      columns[index].x >= columns[index - 1].x + columns[index - 1].width,
      `${columns[index].stage} 列必须排在 ${columns[index - 1].stage} 右边且不重叠`
    );
  }
});

test('顶层节点两两不重叠', () => {
  const { nodes } = laidOut({ characters: 5, scenes: 4, shotsPerScene: 5, videos: 12 });
  const boxes = rects(nodes);
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      assert.ok(!overlaps(boxes[i], boxes[j]), `${boxes[i].id} 和 ${boxes[j].id} 重叠了`);
    }
  }
});

test('长列会换成子列，不会摞成一条几千像素的竖线', () => {
  const { nodes } = laidOut({ videos: 36 });
  const videoCards = nodes.filter((node) => node.kind === 'video');
  const distinctX = new Set(videoCards.map((node) => node.position.x));
  assert.ok(distinctX.size > 1, '36 个渲染任务必须换列');

  const bottom = Math.max(...videoCards.map((node) => node.position.y + node.size.height));
  assert.ok(bottom < MAX_COLUMN_HEIGHT * 1.5, `视频列摞到了 ${bottom}，超出了换列阈值`);

  // 每个子列的节点数不超过上限。
  const perColumn = new Map();
  for (const node of videoCards) {
    perColumn.set(node.position.x, (perColumn.get(node.position.x) || 0) + 1);
  }
  for (const [, count] of perColumn) assert.ok(count <= MAX_NODES_PER_COLUMN);
});

test('簇能装下它所有的镜头，镜头坐标相对簇原点', () => {
  const { nodes } = laidOut({ scenes: 1, shotsPerScene: 5 });
  const group = nodes.find((node) => node.kind === 'group');
  const children = nodes.filter((node) => node.parentId === group.id);
  assert.equal(children.length, 6, '一张场次卡 + 五个镜头');
  for (const child of children) {
    assert.ok(child.position.x >= 0 && child.position.y >= 0, `${child.id} 不该跑到簇的左上角外面`);
    assert.ok(
      child.position.x + child.size.width <= group.size.width,
      `${child.id} 超出了簇的右边界`
    );
    assert.ok(
      child.position.y + child.size.height <= group.size.height,
      `${child.id} 超出了簇的下边界`
    );
  }
});

test('挪动簇不会改变镜头的相对坐标——所以拖场景时镜头和连线自然跟着走', () => {
  const before = laidOut({ scenes: 1, shotsPerScene: 4 });
  const groupId = before.nodes.find((node) => node.kind === 'group').id;
  const childPositions = before.nodes
    .filter((node) => node.parentId === groupId)
    .map((node) => [node.id, node.position.x, node.position.y]);

  const after = laidOut({
    scenes: 1,
    shotsPerScene: 4,
    overrides: { [groupId]: { x: 4321, y: 1234 } }
  });
  const movedGroup = after.nodes.find((node) => node.id === groupId);
  assert.deepEqual(movedGroup.position, { x: 4321, y: 1234 });
  assert.deepEqual(
    after.nodes.filter((node) => node.parentId === groupId).map((node) => [node.id, node.position.x, node.position.y]),
    childPositions
  );
});

test('手动位置只对顶层节点生效，簇里的镜头不能被单独挪走', () => {
  const { nodes } = laidOut({
    scenes: 1,
    shotsPerScene: 3,
    overrides: { card_shot_s0_0: { x: -9999, y: -9999 } }
  });
  const shot = nodes.find((node) => node.id === 'card_shot_s0_0');
  assert.notDeepEqual(shot.position, { x: -9999, y: -9999 });
});

test('同样的输入永远得到同样的坐标', () => {
  const a = laidOut({ characters: 4, scenes: 3, shotsPerScene: 4, videos: 9 });
  const b = laidOut({ characters: 4, scenes: 3, shotsPerScene: 4, videos: 9 });
  assert.deepEqual(
    a.nodes.map((node) => [node.id, node.position.x, node.position.y, node.size.width, node.size.height]),
    b.nodes.map((node) => [node.id, node.position.x, node.position.y, node.size.width, node.size.height])
  );
});

test('包围盒覆盖所有顶层节点——「适应全部」靠它，不靠量 DOM', () => {
  const { nodes } = laidOut({ characters: 3, scenes: 2, shotsPerScene: 4, videos: 8 });
  const bounds = graphBounds(nodes);
  for (const box of rects(nodes)) {
    assert.ok(box.x >= bounds.x);
    assert.ok(box.y >= bounds.y);
    assert.ok(box.right <= bounds.x + bounds.width);
    assert.ok(box.bottom <= bounds.y + bounds.height);
  }
});

test('300 个节点的归一化加布局在一帧之内跑完', () => {
  const lanes = sampleLanes({ characters: 20, scenes: 20, shotsPerScene: 8, videos: 100 });
  const graph = buildProductionGraph({ lanes });
  assert.ok(graph.nodes.length >= 300, `期望至少 300 个节点，实际 ${graph.nodes.length}`);

  const started = process.hrtime.bigint();
  for (let i = 0; i < 20; i += 1) {
    layoutProductionGraph({ graph: buildProductionGraph({ lanes }) });
  }
  const perRun = Number(process.hrtime.bigint() - started) / 1e6 / 20;
  // 布局跑在渲染之前，它要是超过一帧，拖动画布必然掉帧。
  assert.ok(perRun < 16, `单次归一化 + 布局用了 ${perRun.toFixed(2)}ms，超过一帧`);
});

test('终点排在所有阶段列右边，不参与阶段列的排布', () => {
  const outcome = { title: '合并视频', body: '等片段渲染完成。', statusLabel: '未开始' };
  const graph = buildProductionGraph({ lanes: sampleLanes(), outcome });
  const { nodes, columns } = layoutProductionGraph({ graph });
  const final = nodes.find((node) => node.kind === 'finalcut');
  const lastColumn = columns[columns.length - 1];
  assert.ok(final.position.x >= lastColumn.x + lastColumn.width, '终点必须在最后一列右边');
  // 它不是某个阶段的产物，所以不能把某一列撑宽，也不能自己变成一列。
  assert.equal(columns.filter((column) => column.stage === 'finalcut').length, 0);
});
