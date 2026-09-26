const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

/**
 * 这些测试跑的是真实行为，不是源码字符串。
 *
 * 归一化和布局都是纯函数，正因为它们不碰 React 也不碰 DOM，才能这样测；
 * 这也是把它们从组件里拆出来的主要理由——「画布逻辑」如果只能靠 grep 源码来验证，
 * 那验的是写法，不是行为。
 */
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
const { buildProductionGraph, nodeIdsForStage, edgesTouching, NODE_SIZE } = loadModule('graph.ts', {
  './types': types
});

function lane(stage, cards, extra = {}) {
  return { stage, emoji: '🎬', owner: `${stage}负责人`, status: 'ready_for_review', cards, ...extra };
}

function sampleLanes() {
  return [
    lane('script', [{ id: 'card_script', title: '脚本正文' }]),
    lane('character', [
      { id: 'card_character_c1', title: '陈女士' },
      { id: 'card_character_c2', title: '林浩' }
    ]),
    lane('scene', [
      {
        id: 'card_scene_s1',
        title: '初遇',
        dependsOn: ['card_character_c1', 'card_character_c2'],
        childrenLabel: '2 个镜头 · 10s',
        children: [
          { id: 'card_shot_t1', title: '推入', stage: 'storyboard', dependsOn: ['card_character_c1'] },
          {
            id: 'card_shot_t2',
            title: '过肩',
            stage: 'storyboard',
            imageNote: '沿用场景图',
            inheritsFrom: 'card_scene_s1'
          }
        ]
      }
    ]),
    lane('storyboard', [], { note: '2 个镜头挂在上方 1 个场景下。' }),
    lane('video', [{ id: 'card_video_v1', title: '镜头任务 1', renderOf: 'card_shot_t1' }])
  ];
}

test('每条泳道归一化成一个阶段节点加它的产物节点', () => {
  const { nodes } = buildProductionGraph({ lanes: sampleLanes() });
  const stages = nodes.filter((node) => node.kind === 'stage').map((node) => node.stage);
  assert.deepEqual(stages, ['script', 'character', 'scene', 'storyboard', 'video']);
  assert.ok(nodes.some((node) => node.id === 'card_character_c1' && node.kind === 'character'));
  // 镜头挂在场次下面，但它属于分镜阶段：挂在哪儿和是什么，是两件事。
  const shot = nodes.find((node) => node.id === 'card_shot_t1');
  assert.equal(shot.stage, 'storyboard');
  assert.equal(shot.kind, 'shot');
});

test('每个节点都带世界坐标和尺寸——布局是数据，不是排版结果', () => {
  const { nodes } = buildProductionGraph({ lanes: sampleLanes() });
  for (const node of nodes) {
    assert.equal(typeof node.position.x, 'number');
    assert.equal(typeof node.position.y, 'number');
    assert.ok(node.size.width > 0, `${node.id} 应该有宽度`);
    assert.ok(node.size.height > 0, `${node.id} 应该有高度`);
  }
  assert.deepEqual(nodes.find((node) => node.id === 'card_shot_t1').size, NODE_SIZE.shot);
});

test('有子产物的卡长成一个簇，父节点排在子节点前面', () => {
  const { nodes } = buildProductionGraph({ lanes: sampleLanes() });
  const groupIndex = nodes.findIndex((node) => node.id === 'group_card_scene_s1');
  assert.ok(groupIndex >= 0, '场次卡应该产出一个簇');
  for (const id of ['card_scene_s1', 'card_shot_t1', 'card_shot_t2']) {
    const node = nodes.find((item) => item.id === id);
    assert.equal(node.parentId, 'group_card_scene_s1');
    // React Flow 要求 parentId 指向的节点先出现，否则子节点会挂空。
    assert.ok(nodes.indexOf(node) > groupIndex, `${id} 必须排在它的簇后面`);
  }
});

test('交接边锚在阶段节点上，不再是「上一列最后一张卡 → 下一列第一张卡」', () => {
  const { edges } = buildProductionGraph({ lanes: sampleLanes() });
  const handoffs = edges.filter((edge) => edge.relation === 'handoff');
  assert.deepEqual(
    handoffs.map((edge) => [edge.source, edge.target]),
    [
      ['stage_script', 'stage_character'],
      ['stage_character', 'stage_scene'],
      ['stage_scene', 'stage_storyboard'],
      ['stage_storyboard', 'stage_video']
    ]
  );
  // 关键：交接边不该碰任何一张产物卡。碰了就说明它画的还是排版顺序。
  for (const edge of handoffs) {
    assert.ok(edge.source.startsWith('stage_') && edge.target.startsWith('stage_'));
  }
});

test('卡片数量变化不会改变交接边——排版顺序不再冒充依赖', () => {
  const base = buildProductionGraph({ lanes: sampleLanes() });
  const shuffled = sampleLanes();
  shuffled[1].cards.reverse();
  shuffled[1].cards.push({ id: 'card_character_c3', title: '路人' });
  const next = buildProductionGraph({ lanes: shuffled });
  const ids = (graph) => graph.edges.filter((edge) => edge.relation === 'handoff').map((edge) => edge.id);
  assert.deepEqual(ids(next), ids(base));
});

test('包含关系：场次 → 它的镜头，是主干边', () => {
  const { edges } = buildProductionGraph({ lanes: sampleLanes() });
  const contains = edges.filter((edge) => edge.relation === 'contains');
  assert.deepEqual(
    contains.map((edge) => [edge.source, edge.target]),
    [
      ['card_scene_s1', 'card_shot_t1'],
      ['card_scene_s1', 'card_shot_t2']
    ]
  );
  assert.ok(contains.every((edge) => edge.primary));
});

test('收起的簇不产出镜头节点，也不产出它们的边', () => {
  const { nodes, edges } = buildProductionGraph({
    lanes: sampleLanes(),
    collapsedGroupIds: ['card_scene_s1']
  });
  assert.equal(nodes.filter((node) => node.kind === 'shot').length, 0);
  assert.equal(edges.filter((edge) => edge.relation === 'contains').length, 0);
  // 场次卡本身还在，簇也还在——收起的是镜头，不是这一场。
  assert.ok(nodes.some((node) => node.id === 'card_scene_s1'));
  assert.ok(nodes.some((node) => node.id === 'group_card_scene_s1'));
});

test('依赖边的方向是「被依赖 → 依赖方」，和阅读方向一致', () => {
  const { edges } = buildProductionGraph({ lanes: sampleLanes() });
  const deps = edges.filter((edge) => edge.relation === 'depends_on');
  assert.ok(deps.some((edge) => edge.source === 'card_character_c1' && edge.target === 'card_scene_s1'));
  assert.ok(deps.some((edge) => edge.source === 'card_character_c2' && edge.target === 'card_scene_s1'));
  assert.ok(deps.some((edge) => edge.source === 'card_character_c1' && edge.target === 'card_shot_t1'));
  // 次级边默认不画：十几个场次乘上出场角色，全画出来就是一盘意大利面。
  assert.ok(deps.every((edge) => !edge.primary));
});

test('继承和渲染关系来自卡片自己的声明', () => {
  const { edges } = buildProductionGraph({ lanes: sampleLanes() });
  assert.ok(
    edges.some(
      (edge) => edge.relation === 'inherits' && edge.source === 'card_scene_s1' && edge.target === 'card_shot_t2'
    )
  );
  assert.ok(
    edges.some(
      (edge) => edge.relation === 'renders' && edge.source === 'card_shot_t1' && edge.target === 'card_video_v1'
    )
  );
});

test('指向不存在的卡时不画边——猜出来的边比没有边更糟', () => {
  const lanes = sampleLanes();
  lanes[2].cards[0].dependsOn = ['card_character_c1', 'card_character_不存在'];
  const { edges } = buildProductionGraph({ lanes });
  assert.equal(edges.filter((edge) => edge.id.includes('不存在')).length, 0);
  assert.ok(edges.some((edge) => edge.source === 'card_character_c1' && edge.target === 'card_scene_s1'));
});

test('空泳道按有没有去向说明分成两种节点', () => {
  const { nodes } = buildProductionGraph({ lanes: sampleLanes() });
  assert.ok(nodes.some((node) => node.id === 'note_storyboard' && node.kind === 'note'));

  const withoutNote = sampleLanes();
  delete withoutNote[3].note;
  const bare = buildProductionGraph({ lanes: withoutNote });
  assert.ok(bare.nodes.some((node) => node.id === 'empty_storyboard' && node.kind === 'empty'));
});

test('生成中的阶段是一个骨架节点，不是一条假泳道', () => {
  const { nodes } = buildProductionGraph({
    lanes: sampleLanes(),
    pendingStage: 'video',
    pendingProgress: '分镜第 2/4 批'
  });
  const pending = nodes.find((node) => node.kind === 'pending');
  assert.equal(pending.stage, 'video');
  assert.equal(pending.progressText, '分镜第 2/4 批');
});

test('聚焦一个阶段时，镜头会连它所在的簇一起被框住', () => {
  const { nodes } = buildProductionGraph({ lanes: sampleLanes() });
  const ids = nodeIdsForStage(nodes, 'storyboard');
  assert.ok(ids.includes('card_shot_t1'));
  assert.ok(ids.includes('stage_storyboard'));
  // 只框镜头会把簇的边框切掉一半。
  assert.ok(ids.includes('group_card_scene_s1'));
});

test('选中一个节点时能取出和它相关的所有边', () => {
  const { edges } = buildProductionGraph({ lanes: sampleLanes() });
  const touched = edgesTouching(edges, 'card_scene_s1');
  assert.ok(touched.size >= 4);
  for (const id of touched) {
    const edge = edges.find((item) => item.id === id);
    assert.ok(edge.source === 'card_scene_s1' || edge.target === 'card_scene_s1');
  }
});

test('同样的输入永远得到同样的图，节点顺序稳定', () => {
  const a = buildProductionGraph({ lanes: sampleLanes() });
  const b = buildProductionGraph({ lanes: sampleLanes() });
  assert.deepEqual(a.nodes.map((node) => node.id), b.nodes.map((node) => node.id));
  assert.deepEqual(a.edges.map((edge) => edge.id), b.edges.map((edge) => edge.id));
});

test('边的 id 不重复——重复的 id 会让 React Flow 丢边', () => {
  const lanes = sampleLanes();
  // 同一个角色写两遍，是模型输出里很常见的事。
  lanes[2].cards[0].dependsOn = ['card_character_c1', 'card_character_c1'];
  const { edges } = buildProductionGraph({ lanes });
  const ids = edges.map((edge) => edge.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('给了 outcome 就在最后挂一个终点节点，并从最后一条泳道收口', () => {
  const outcome = { title: '合并视频', body: '等片段渲染完成。', statusLabel: '未开始' };
  const { nodes, edges } = buildProductionGraph({ lanes: sampleLanes(), outcome });
  const final = nodes.find((node) => node.kind === 'finalcut');
  assert.ok(final, '终点节点应该存在');
  assert.equal(final.outcome.title, '合并视频');
  // 收口锚在最后一条泳道的阶段节点上。挂到每一个镜头上会拉出几十条汇聚线，
  // 那是把「所有片段合成一条」画成一团麻，而不是画清楚。
  const join = edges.filter((edge) => edge.target === final.id);
  assert.equal(join.length, 1);
  assert.equal(join[0].source, 'stage_video');
  assert.equal(join[0].relation, 'handoff');
});

test('不给 outcome 就没有终点节点——终点是可选的，不是凭空长出来的', () => {
  const { nodes, edges } = buildProductionGraph({ lanes: sampleLanes() });
  assert.equal(nodes.filter((node) => node.kind === 'finalcut').length, 0);
  assert.equal(edges.filter((edge) => edge.target === 'finalcut').length, 0);
});
