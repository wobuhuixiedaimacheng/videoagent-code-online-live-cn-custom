const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
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

function request(instruction, workflow) {
  return {
    instruction,
    workflow,
    history: [],
    workspace: {
      projectId: 'project_test',
      title: '动态导演测试',
      branch: 'main',
      mode: 'creator',
      activeWorkflow: 'generate',
      files: [],
      currentTimelineVersion: 1,
      complianceStatus: 'pass'
    }
  };
}

test('动态导演作为独立技能注册，名称和职责不暴露模型供应商', () => {
  const restore = installTypeScriptLoader();
  try {
    const { getSkillByWorkflow } = require('./workspace.ts');
    const skill = getSkillByWorkflow('motion_director');

    assert.ok(skill);
    assert.equal(skill.title, '动态导演');
    assert.equal(skill.command.startsWith('/video-prompt'), true);
    assert.equal(skill.agentIds.includes('creative_director'), true);
    assert.equal(skill.agentIds.includes('prompt'), true);
    assert.deepEqual(skill.outputFiles, ['asset_prompts.json']);
    assert.doesNotMatch(skill.title, /Seedance/i);
    assert.doesNotMatch(skill.description, /Seedance/i);
  } finally {
    restore();
  }
});

test('动态导演运行详情包含完整 PE 规则和本产品边界', () => {
  const restore = installTypeScriptLoader();
  try {
    const { getRuntimeSkillDetail } = require('./skillRuntime.ts');
    const detail = getRuntimeSkillDetail('motion_director');

    assert.ok(detail);
    assert.equal(detail.title, '动态导演');
    assert.match(detail.instructions, /动态导演运行边界/);
    assert.match(detail.instructions, /核心语法：@ 引用系统/);
    assert.match(detail.instructions, /分时段提示词/);
    assert.match(detail.instructions, /运镜语言参考/);
    assert.match(detail.instructions, /AI短剧/);
    assert.match(detail.instructions, /只生成可审查的视频任务提示词/);
    assert.equal(detail.provenance.repository, 'https://github.com/dexhunter/seedance2-skill');
    assert.equal(detail.provenance.license, 'MIT');
  } finally {
    restore();
  }
});

test('创意总监按用户意图自动路由动态导演，同时保留手动命令', () => {
  const restore = installTypeScriptLoader();
  try {
    const { inferWorkflow } = require('./prompt.ts');

    assert.equal(inferWorkflow(request('/video-prompt 把已确认分镜整理成视频提示词')), 'motion_director');
    assert.equal(inferWorkflow(request('给这些镜头补充分时段运镜、动作编排和音乐卡点')), 'motion_director');
    assert.equal(inferWorkflow(request('/script 只调整第二幕台词')), 'script');
  } finally {
    restore();
  }
});

test('视频生成准备阶段自动选择动态导演并加载完整技能上下文', () => {
  const restore = installTypeScriptLoader();
  try {
    const { stageConfig } = require('./stageGeneration.ts');
    const { buildSystemPrompt } = require('./prompt.ts');
    const req = request('准备镜头级视频任务', 'motion_director');

    assert.equal(stageConfig('video').workflow, 'motion_director');
    const prompt = buildSystemPrompt(req, { tools: [] });
    assert.match(prompt, /当前 workflow:\nmotion_director/);
    assert.match(prompt, /动态导演运行边界/);
    assert.match(prompt, /创意总监自动调用动态导演/);
  } finally {
    restore();
  }
});

test('自动调用会生成可见的创意总监技能事件', () => {
  const restore = installTypeScriptLoader();
  try {
    const { skillAutoloadEvent } = require('./skillRuntime.ts');

    assert.equal(skillAutoloadEvent('script'), null);
    const event = skillAutoloadEvent('motion_director');
    assert.equal(event.toolName, 'read_skill');
    assert.equal(event.status, 'success');
    assert.equal(event.title, '创意总监调用动态导演');
    assert.match(event.summary, /完整 PE 规则/);
  } finally {
    restore();
  }
});

test('封装技能不会把视频渲染路由改成 Seedance 供应商', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'app', 'api', 'video', 'render', 'route.ts'), 'utf8');

  assert.match(source, /agnes-video-v2\.0/);
  assert.doesNotMatch(source, /seedance/i);
  assert.doesNotMatch(source, /motion_director/);
});
