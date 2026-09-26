const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function compile(fileName) {
  const source = fs.readFileSync(path.join(__dirname, fileName), 'utf8');
  return ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;
}

function loadTs(fileName) {
  function localRequire(spec) {
    if (!spec.startsWith('.')) return require(spec);
    return loadTs(`${spec.replace(/^\.\//, '')}.ts`);
  }
  const module = { exports: {} };
  vm.runInNewContext(
    compile(fileName),
    { exports: module.exports, module, require: localRequire, process: { env: {} } },
    { filename: fileName }
  );
  return module.exports;
}

const { stageGenerationInstruction } = loadTs('stageGeneration.ts');
const providerSource = fs.readFileSync(path.join(__dirname, 'agentProvider.ts'), 'utf8');

// 属性访问里混着方法调用，别把 .length/.every 当成模型要输出的字段。
const NOT_A_FIELD = new Set([
  'length', 'every', 'some', 'filter', 'map', 'flatMap', 'slice', 'trim',
  'toLowerCase', 'push', 'join', 'includes', 'split', 'replace'
]);

/** 直接从校验函数的源码里抽出它真正读的字段名，避免手抄清单跟着腐烂。 */
function fieldsCheckedBy(fnName, accessors) {
  const start = providerSource.indexOf(`function ${fnName}`);
  assert.ok(start > 0, `没找到 ${fnName}，校验函数可能被改名了`);
  const end = providerSource.indexOf('\nfunction ', start + 1);
  const body = providerSource.slice(start, end > start ? end : undefined);

  const fields = accessors.flatMap((accessor) =>
    [...body.matchAll(new RegExp(`\\b${accessor}\\??\\.([a-zA-Z]+)`, 'g'))].map((match) => match[1])
  );
  return [...new Set(fields)].filter((field) => !NOT_A_FIELD.has(field));
}

// 每个阶段：校验函数 + 它读取字段用的变量名 + 至少该抽到多少个字段（防止正则失效后测试变成空转）。
const STAGE_CONTRACTS = [
  { stage: 'character', fn: 'hasCharacters', accessors: ['character', 'variant'], atLeast: 15 },
  { stage: 'scene', fn: 'hasSceneDraft', accessors: ['scene'], atLeast: 10 },
  { stage: 'storyboard', fn: 'hasStoryboardDraft', accessors: ['parsed', 'scene'], atLeast: 2 },
  { stage: 'video', fn: 'hasVideoTaskPackage', accessors: ['parsed', 'prompt', 'characterConsistency'], atLeast: 5 }
];

for (const { stage, fn, accessors, atLeast } of STAGE_CONTRACTS) {
  test(`${stage} 阶段提示词交代了 ${fn} 要求的每个字段`, () => {
    const fields = fieldsCheckedBy(fn, accessors);
    assert.ok(
      fields.length >= atLeast,
      `只从 ${fn} 抽到 ${fields.length} 个字段（期望至少 ${atLeast}），正则可能已经失效：${fields.join(', ')}`
    );

    const instruction = stageGenerationInstruction(stage, '720p');
    const missing = fields.filter((field) => !instruction.includes(field));
    assert.deepEqual(
      missing,
      [],
      `${stage} 阶段的提示词没交代这些字段，模型的产出会被判不合格并替换成模板：${missing.join('、')}`
    );
  });
}

test('角色阶段要求覆盖脚本里的所有人物，包括第一人称叙述者', () => {
  // 真实事故：《小澎的恋爱史》是第一人称脚本，正文只描写「他」，
  // 模型就只设计了男朋友一个角色，主角小澎被整个跳过——契约当时只要求「至少一个」。
  const instruction = stageGenerationInstruction('character', '');
  assert.match(instruction, /每一个有台词、有出镜或被明确描写的人物/);
  assert.match(instruction, /第一人称/);
  assert.match(instruction, /至少要有两个角色对象/);
  assert.doesNotMatch(instruction, /数组里至少有一个 required 为 true 的必需角色。每个角色/);
});

test('角色阶段要求用脚本里的真实姓名，而不是空泛标签', () => {
  const instruction = stageGenerationInstruction('character', '');
  // 剧本阶段现在强制每个人物都有姓名，所以这里从「优先用」收紧成「逐字照抄」：
  // 名字被改写一个字，人物名册核对就会误报角色阶段少产出了人。
  assert.match(instruction, /逐字照抄脚本人物设定里给出的姓名/);
  // 老脚本只写了「前任A」时不再沿用称呼，改成随机起名 + scriptAlias 记住原始称呼。
  assert.match(instruction, /随机起一个具体的中文姓名/);
  assert.match(instruction, /scriptAlias/);
  assert.match(instruction, /「前任A」「便利店店员」「男主」这类称呼或标签/);
  // 第一人称脚本里模型会顺手把叙述者命名成「我」，代词没法当角色名贯穿全片。
  assert.match(instruction, /不要用「我」「他」「叙述者」这类代词/);
});

test('角色阶段给出 referenceStrategy 的合法枚举值', () => {
  const instruction = stageGenerationInstruction('character', '');
  for (const value of ['face_id', 'multi_view', 'replace_reference']) {
    assert.ok(instruction.includes(value), `缺少枚举值 ${value}`);
  }
});

test('角色和场景都说明主图地址由后续阶段回填，避免模型编造图片 URL', () => {
  for (const stage of ['character', 'scene']) {
    assert.match(stageGenerationInstruction(stage, ''), /不要编造图片地址/, `${stage} 阶段缺少说明`);
  }
});

test('场景阶段点明 subtitle 和 durationSeconds 是分镜阶段的硬依赖', () => {
  // 这两个字段缺失时 storyboardFor 会直接抛错，比降级成模板更严重，提示词必须说清楚。
  const instruction = stageGenerationInstruction('scene', '');
  assert.match(instruction, /subtitle/);
  assert.match(instruction, /durationSeconds/);
  assert.match(instruction, /分镜阶段直接报错/);
});

test('视频阶段说明两个数组条数必须等于已确认镜头数且 type 固定 video', () => {
  const instruction = stageGenerationInstruction('video', '720p');
  assert.match(instruction, /条数，必须精确等于/);
  assert.match(instruction, /renderQueue/);
  assert.match(instruction, /"video"/);
});

test('阶段之间的契约不串台', () => {
  assert.doesNotMatch(stageGenerationInstruction('scene', ''), /faceAnchorVariantId/);
  assert.doesNotMatch(stageGenerationInstruction('character', ''), /renderQueue/);
});
