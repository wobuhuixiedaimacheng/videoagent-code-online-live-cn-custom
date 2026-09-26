const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const ts = require('typescript');

function installTypeScriptLoader() {
  const previous = require.extensions['.ts'];
  require.extensions['.ts'] = (module, filePath) => {
    const source = fs.readFileSync(filePath, 'utf8');
    const output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
    }).outputText;
    module._compile(output, filePath);
  };
  return () => {
    if (previous) require.extensions['.ts'] = previous;
    else delete require.extensions['.ts'];
  };
}

function request({ genre, stage, instruction = '按当前阶段产出', workflow = 'script' }) {
  return {
    instruction,
    workflow,
    genre,
    productionStage: stage,
    history: [],
    workspace: {
      projectId: 'project_test',
      title: '片种路由测试',
      branch: 'main',
      mode: 'creator',
      activeWorkflow: 'generate',
      files: [],
      currentTimelineVersion: 1,
      complianceStatus: 'pass'
    }
  };
}

test('路由表引用的每个技能都真实存在于技能库', () => {
  const restore = installTypeScriptLoader();
  try {
    const { GENRE_OPTIONS, genreSkillPlan } = require('./genreSkillRouter.ts');
    const { PRODUCTION_STAGE_ORDER } = require('./productionFlow.ts');

    for (const option of GENRE_OPTIONS) {
      for (const stage of PRODUCTION_STAGE_ORDER) {
        const plan = genreSkillPlan(option.id, stage);
        if (!plan) continue;
        // notes 只有在「配了但读不到」时才会有内容，正好是手滑写错 skill id 的信号。
        assert.deepEqual(plan.notes, [], `${option.id} / ${stage} 的路由指向了技能库里不存在的技能：${plan.notes.join('；')}`);
      }
    }
  } finally {
    restore();
  }
});

test('短剧在分镜阶段硬注入剧情分镜和导演调度正文，并把其余技能留作候选', () => {
  const restore = installTypeScriptLoader();
  try {
    const { genreSkillPlan, genreSkillSection, MAX_REQUIRED_SKILL_CHARS } = require('./genreSkillRouter.ts');
    const plan = genreSkillPlan('drama', 'storyboard');

    assert.ok(plan);
    assert.deepEqual(
      plan.required.map((item) => item.skill.id),
      [
        'lanshu-video-kit/skills/seedance-storyboard',
        'director-craft/shot-grammar',
        'director-craft/camera-move',
        'director-craft/edit-rhythm'
      ]
    );
    // 累计预算，不是逐个判断——四份加起来也要压在上限内，否则末尾几个会被静默降级。
    const total = plan.required.reduce((sum, item) => sum + item.body.length, 0);
    assert.ok(total <= MAX_REQUIRED_SKILL_CHARS, `必读技能累计 ${total} 字符，超过 ${MAX_REQUIRED_SKILL_CHARS}`);
    assert.deepEqual(plan.notes, []);
    assert.equal(plan.candidates.some((skill) => skill.id === 'video-prompt-engineer'), true);

    const section = genreSkillSection(plan);
    assert.match(section, /当前片种：短剧 \/ 剧情视频/);
    // 边界只写一次，四份正文跟在后面。
    assert.equal(section.match(/题材技能运行边界/g).length, 1);
    assert.match(section, /镜头1/);
    assert.match(section, /景别阶梯/);
    assert.match(section, /运镜要有动机/);
    assert.match(section, /"skillId": "video-prompt-engineer"/);
  } finally {
    restore();
  }
});

test('必读技能累计超预算时，超出的那个降级成候选而不是整格爆掉', () => {
  const restore = installTypeScriptLoader();
  try {
    const { genreSkillPlan } = require('./genreSkillRouter.ts');
    // 产品营销的分镜阶段：video-prompt-engineer 一个就 10k 出头，导演调度那两个只能是候选。
    const plan = genreSkillPlan('product', 'storyboard');

    assert.ok(plan);
    assert.deepEqual(plan.required.map((item) => item.skill.id), ['video-prompt-engineer']);
    assert.deepEqual(plan.notes, []);
    const ids = plan.candidates.map((skill) => skill.id);
    assert.ok(ids.includes('director-craft/shot-grammar'));
    assert.ok(ids.includes('director-craft/camera-move'));
  } finally {
    restore();
  }
});

test('短剧选题脚本阶段只给候选清单，不硬注入正文', () => {
  const restore = installTypeScriptLoader();
  try {
    const { genreSkillPlan, genreSkillSection } = require('./genreSkillRouter.ts');
    const plan = genreSkillPlan('drama', 'script');

    assert.ok(plan);
    assert.deepEqual(plan.required, []);
    assert.ok(plan.candidates.length > 0);
    assert.match(genreSkillSection(plan), /用 read_skill 工具带 skillId 参数取全文/);
  } finally {
    restore();
  }
});

test('video 阶段不重复注入动态导演，避免和 motion_director workflow 撞车', () => {
  const restore = installTypeScriptLoader();
  try {
    const { GENRE_OPTIONS, genreSkillPlan } = require('./genreSkillRouter.ts');

    for (const option of GENRE_OPTIONS) {
      const plan = genreSkillPlan(option.id, 'video');
      if (!plan) continue;
      assert.equal(
        plan.required.some((item) => item.skill.id === 'dynamic-director'),
        false,
        `${option.id} 在 video 阶段重复注入了动态导演`
      );
    }
  } finally {
    restore();
  }
});

test('未选阶段和未知片种不改动 prompt', () => {
  const restore = installTypeScriptLoader();
  try {
    const { genreSkillPlan, genreSkillSection } = require('./genreSkillRouter.ts');

    assert.equal(genreSkillPlan(undefined, 'storyboard'), null);
    assert.equal(genreSkillPlan('drama', undefined), null);
    assert.equal(genreSkillPlan('不存在的片种', 'storyboard'), null);
    assert.equal(genreSkillPlan('auto', 'script'), null);
    assert.equal(genreSkillSection(null), '');
  } finally {
    restore();
  }
});

test('自动派发只给片种无关的候选，永远不注入正文', () => {
  const restore = installTypeScriptLoader();
  try {
    const { genreSkillPlan } = require('./genreSkillRouter.ts');

    // 片种无关的自有包。auto 只能挂这些：题材包和模型专用包一挂上就是在猜片种。
    const GENRE_NEUTRAL_PACKS = ['director-craft', 'multimodal-prompt-craft'];

    // 没选片种是默认状态，这几个阶段以前完全裸奔。现在给通则技能的清单，但不猜片种、不注正文。
    for (const stage of ['scene', 'storyboard', 'video']) {
      const plan = genreSkillPlan('auto', stage);
      assert.ok(plan, `auto / ${stage} 应该有候选技能`);
      assert.deepEqual(plan.required, [], `auto / ${stage} 不该注入任何正文——片种还没定`);
      assert.ok(plan.candidates.length > 0);
      assert.ok(
        plan.candidates.every((skill) => GENRE_NEUTRAL_PACKS.includes(skill.pack)),
        `auto / ${stage} 只该挂片种无关的技能`
      );
    }
  } finally {
    restore();
  }
});

test('片种加载会生成可见事件，没有必读技能时也要报候选已就绪', () => {
  const restore = installTypeScriptLoader();
  try {
    const { genreSkillAutoloadEvent, genreSkillPlan } = require('./genreSkillRouter.ts');

    assert.equal(genreSkillAutoloadEvent(null), null);
    assert.equal(genreSkillAutoloadEvent(genreSkillPlan('auto', 'script')), null);
    assert.match(genreSkillAutoloadEvent(genreSkillPlan('auto', 'storyboard')).title, /候选技能已就绪/);

    const loaded = genreSkillAutoloadEvent(genreSkillPlan('drama', 'storyboard'));
    assert.equal(loaded.toolName, 'read_skill');
    assert.equal(loaded.status, 'success');
    assert.match(loaded.title, /短剧 \/ 剧情视频题材已加载/);
    assert.match(loaded.summary, /按片种自动展开技能库正文（4 个技能/);

    const listOnly = genreSkillAutoloadEvent(genreSkillPlan('drama', 'script'));
    assert.match(listOnly.title, /候选技能已就绪/);
    assert.match(listOnly.summary, /按需用 read_skill 展开/);
  } finally {
    restore();
  }
});

test('片种技能真的进了 system prompt', () => {
  const restore = installTypeScriptLoader();
  try {
    const { buildSystemPrompt } = require('./prompt.ts');

    const dramaPrompt = buildSystemPrompt(request({ genre: 'drama', stage: 'storyboard', workflow: 'shot' }), { tools: [] });
    assert.match(dramaPrompt, /片种技能:/);
    assert.match(dramaPrompt, /当前片种：短剧 \/ 剧情视频/);

    // 没选片种也会拿到候选清单，但拿不到任何正文，也不会出现片种名。
    const autoPrompt = buildSystemPrompt(request({ genre: 'auto', stage: 'storyboard', workflow: 'shot' }), { tools: [] });
    assert.match(autoPrompt, /片种技能:/);
    assert.match(autoPrompt, /"skillId": "director-craft\/shot-grammar"/);
    assert.doesNotMatch(autoPrompt, /题材技能运行边界/);
  } finally {
    restore();
  }
});

test('片种选项和路由表共用一份 id，UI 不再自己维护一张列表', () => {
  const restore = installTypeScriptLoader();
  try {
    const { GENRE_OPTIONS } = require('./genreOptions.ts');
    const router = require('./genreSkillRouter.ts');

    assert.deepEqual(router.GENRE_OPTIONS, GENRE_OPTIONS);
    assert.equal(GENRE_OPTIONS.some((option) => option.id === 'drama'), true);

    const page = fs.readFileSync(require('node:path').join(__dirname, '..', 'app', 'page.tsx'), 'utf8');
    assert.match(page, /const taskAgentOptions = GENRE_OPTIONS;/);
    assert.match(page, /genre: taskAgent,/);
  } finally {
    restore();
  }
});

test('read_skill 支持按 skillId 读技能库正文', () => {
  const restore = installTypeScriptLoader();
  try {
    const { TOOL_SCHEMAS } = require('./tools.ts');
    const schema = TOOL_SCHEMAS.find((tool) => tool.name === 'read_skill');

    assert.ok(schema.inputSchema.properties.skillId);
    // workflow 不再是必填，否则模型没法只凭 skillId 读候选技能。
    assert.equal(schema.inputSchema.required, undefined);
  } finally {
    restore();
  }
});

function toolContext() {
  return {
    workflow: 'shot',
    toolEvents: [],
    patches: [],
    budget: { max: 120000, perToolResult: 6000, used: 0 },
    req: request({ genre: 'drama', stage: 'storyboard', workflow: 'shot' })
  };
}

test('候选技能能真的被 read_skill 按 skillId 取到全文', async () => {
  const restore = installTypeScriptLoader();
  try {
    const { TOOL_HANDLERS } = require('./tools.ts');
    const ctx = toolContext();

    const result = await TOOL_HANDLERS.read_skill({ skillId: 'video-prompt-engineer' }, ctx);
    assert.equal(result.ok, true);
    assert.equal(result.data.skillId, 'video-prompt-engineer');
    assert.ok(result.data.instructions.length > 500);
    assert.equal(ctx.toolEvents[0].toolName, 'read_skill');
    assert.match(ctx.toolEvents[0].title, /读取技能库/);
  } finally {
    restore();
  }
});

test('read_skill 拿到不存在的 skillId 时回索引，而不是空手报错', async () => {
  const restore = installTypeScriptLoader();
  try {
    const { TOOL_HANDLERS } = require('./tools.ts');
    const ctx = toolContext();

    const result = await TOOL_HANDLERS.read_skill({ skillId: '打错的/技能路径' }, ctx);
    assert.equal(result.ok, false);
    assert.equal(result.status, 'warning');
    assert.ok(result.data.librarySkills.length > 0);
    assert.ok(result.data.workflowSkills.length > 0);
    assert.equal(result.data.librarySkills.some((skill) => skill.skillId === 'dynamic-director'), true);
  } finally {
    restore();
  }
});

/** 分镜阶段会校验上游 scenes.json 可用，空数组会被判成「无法用于分镜生成」。 */
function confirmedScenes(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `shot-${index + 1}`,
    title: `镜头 ${index + 1}`,
    visual: `第 ${index + 1} 个已确认镜头画面`,
    subtitle: `第 ${index + 1} 个字幕`,
    durationSeconds: 3,
    start: index * 3,
    end: index * 3 + 3,
    scriptSegment: `第 ${index + 1} 段已确认脚本`,
    narration: `第 ${index + 1} 段旁白`
  }));
}

async function withEnv(values, action) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await action();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

/** 截住发往模型的请求体，这样能验证片种技能是真的进了 prompt，而不只是函数返回了字符串。 */
async function withCapturedProviderRequest(action) {
  const previousFetch = global.fetch;
  let capturedBody = '';
  global.fetch = async (_url, init) => {
    capturedBody = String(init.body || '');
    return new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };
  try {
    return await withEnv({
      VIDEOAGENT_FORCE_MOCK: undefined,
      DEMO_MODE: undefined,
      AGENT_LOOP: undefined,
      DEFAULT_PROVIDER: 'custom',
      CUSTOM_API_KEY: 'test-key',
      CUSTOM_BASE_URL: 'http://provider.test/v1',
      OPENAI_API_KEY: undefined,
      ANTHROPIC_API_KEY: undefined
    }, () => action(() => capturedBody));
  } finally {
    global.fetch = previousFetch;
  }
}

test('选了短剧跑分镜阶段：技能正文进请求体，时间线拿到可见事件', async () => {
  const restore = installTypeScriptLoader();
  try {
    const { runVideoAgent } = require('./agentProvider.ts');
    const { workspaceWith } = require('./testFixtures.cjs');
    const workspace = workspaceWith({
      'script.md': '# 短剧脚本',
      'characters.json': '{"characters":[]}',
      'scenes.json': JSON.stringify({ scenes: confirmedScenes(2) })
    });

    const { result, body } = await withCapturedProviderRequest(async (getBody) => {
      const result = await runVideoAgent({
        instruction: '生成分镜资产',
        workspace,
        history: [],
        genre: 'drama',
        workflow: 'shot',
        productionStage: 'storyboard',
        generationJobId: 'drama-storyboard-job',
        sourceVersions: { 'script.md': 1, 'characters.json': 2, 'scenes.json': 3 }
      });
      return { result, body: getBody() };
    });

    assert.match(body, /当前片种：短剧 \/ 剧情视频/);
    assert.match(body, /题材技能运行边界/);
    assert.match(body, /video-prompt-engineer/);

    const event = result.toolEvents.find((item) => /短剧 \/ 剧情视频题材已加载/.test(item.title));
    assert.ok(event, `时间线里没有片种事件：${result.toolEvents.map((item) => item.title).join(' / ')}`);
    assert.equal(event.status, 'success');
  } finally {
    restore();
  }
});

test('自动派发跑同一个阶段时只带候选清单，不带任何片种正文', async () => {
  const restore = installTypeScriptLoader();
  try {
    const { runVideoAgent } = require('./agentProvider.ts');
    const { workspaceWith } = require('./testFixtures.cjs');
    const workspace = workspaceWith({
      'script.md': '# 短剧脚本',
      'characters.json': '{"characters":[]}',
      'scenes.json': JSON.stringify({ scenes: confirmedScenes(2) })
    });

    const body = await withCapturedProviderRequest(async (getBody) => {
      await runVideoAgent({
        instruction: '生成分镜资产',
        workspace,
        history: [],
        genre: 'auto',
        workflow: 'shot',
        productionStage: 'storyboard',
        generationJobId: 'auto-storyboard-job',
        sourceVersions: { 'script.md': 1, 'characters.json': 2, 'scenes.json': 3 }
      });
      return getBody();
    });

    assert.match(body, /director-craft\/shot-grammar/);
    // 正文和边界都不该出现——没定片种就不注入。
    assert.doesNotMatch(body, /题材技能运行边界/);
    // 「景别阶梯」这类词在 description 里也有，只能拿正文独有的句子当标记。
    assert.doesNotMatch(body, /留白是有方向的/);
  } finally {
    restore();
  }
});

test('不带参数的 read_skill 仍按当前 workflow 读内建 skill', async () => {
  const restore = installTypeScriptLoader();
  try {
    const { TOOL_HANDLERS } = require('./tools.ts');
    const ctx = toolContext();
    ctx.workflow = 'motion_director';

    const result = await TOOL_HANDLERS.read_skill({}, ctx);
    assert.equal(result.ok, true);
    assert.equal(result.data.title, '动态导演');
    assert.match(result.data.instructions, /动态导演运行边界/);
  } finally {
    restore();
  }
});
