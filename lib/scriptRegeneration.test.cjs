const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const { workspaceWith, patch, readyFlow } = require('./testFixtures.cjs');

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

async function withCustomModelResponse(rawResponse, action) {
  const previousFetch = global.fetch;
  let capturedBody = '';
  global.fetch = async (_url, init) => {
    capturedBody = String(init?.body || '');
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(rawResponse) } }]
    }), { status: 200, headers: { 'content-type': 'application/json' } });
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

test('stage request body preserves explicit regenerate and revise modes', () => {
  const restore = installTypeScriptLoader();
  try {
    const { buildStageRunRequest } = require('./stageRequest.ts');
    const base = {
      stage: 'script',
      workspace: workspaceWith(),
      instruction: '重写脚本',
      history: [],
      generationJobId: 'job-new',
      sourceVersions: {},
      workflow: 'script'
    };

    const regenerate = buildStageRunRequest({
      ...base,
      stageRequestMode: 'regenerate',
      stageRequestTarget: 'artifact',
      requestedOutputFiles: ['script.md']
    });
    assert.equal(regenerate.stageRequestMode, 'regenerate');
    assert.equal(regenerate.stageRequestTarget, 'artifact');
    assert.deepEqual(regenerate.requestedOutputFiles, ['script.md']);
    assert.equal(buildStageRunRequest({ ...base, stageRequestMode: 'revise' }).stageRequestMode, 'revise');
    assert.equal(buildStageRunRequest(base).stageRequestMode, 'initial');
  } finally {
    restore();
  }
});

test('script prompt context is separate from confirmed upstream version sources', () => {
  const restore = installTypeScriptLoader();
  try {
    const { stageOutputFilesForRequest, stageOutputFilesForWorkspace, stagePromptContextFiles, stageSourceFiles } = require('./stageGeneration.ts');
    assert.deepEqual(stageSourceFiles('script'), []);
    assert.deepEqual(stagePromptContextFiles('script'), [
      'brief.json',
      'script.md',
      'campaign_goal.json',
      'profile.json',
      '.aigc/MEMORY.md',
      'platform_rules.json',
      'viral_refs.json',
      'asset_library.json',
      'feedback_report.json',
      // 质检账本进脚本上下文，是「打回记录能反哺下一版脚本」这个闭环的落点。
      '.aigc/qa_ledger.json',
      // 用户标记为「参与生成」的画布便签：人直接写下的要求，不该只停在界面上。
      '.aigc/canvas-notes.md'
    ]);
    // 视觉阶段能看到 style.json，但它不是产物契约的一部分——
    // sourceVersions 会强制校验存在性与版本，而风格允许一个都没选。
    assert.deepEqual(stagePromptContextFiles('character'), ['script.md', 'style.json', '.aigc/canvas-notes.md']);
    assert.deepEqual(stageSourceFiles('character'), ['script.md']);
    assert.equal(stagePromptContextFiles('script').includes('style.json'), false);
    assert.deepEqual(stageOutputFilesForRequest('script', 'initial'), ['brief.json', 'campaign_goal.json', 'script.md']);
    assert.deepEqual(stageOutputFilesForRequest('script', 'regenerate'), ['script.md']);
    assert.deepEqual(stageOutputFilesForRequest('script', 'revise'), ['script.md']);
    assert.deepEqual(
      stageOutputFilesForWorkspace('script', 'regenerate', workspaceWith()),
      ['brief.json', 'campaign_goal.json', 'script.md']
    );
    assert.deepEqual(
      stageOutputFilesForWorkspace('script', 'regenerate', workspaceWith({
        'brief.json': validBrief,
        'campaign_goal.json': validCampaignGoal
      })),
      ['script.md']
    );
    assert.deepEqual(
      stageOutputFilesForWorkspace('script', 'regenerate', workspaceWith({
        'brief.json': validBrief,
        'campaign_goal.json': validCampaignGoal
      }), 'stage'),
      ['brief.json', 'campaign_goal.json', 'script.md']
    );
  } finally {
    restore();
  }
});

function scriptFlow(jobId, status = 'ready_for_review') {
  const flow = readyFlow('script', 1);
  flow.stages.script.status = status;
  flow.stages.script.generationJobId = jobId;
  return flow;
}

function agentStagePatch(filePath, after, before, jobId = 'script-job-old', stage = 'script') {
  return {
    ...patch(filePath, after, before),
    origin: { kind: 'agent_stage', productionStage: stage, generationJobId: jobId }
  };
}

test('regenerate applies only trusted current script-stage drafts and hides downstream/internal drafts', () => {
  const restore = installTypeScriptLoader();
  try {
    const { savePendingPatches } = require('./workspaceDrafts.ts');
    const { stagePromptWorkspace } = require('./stagePromptContext.ts');
    const committed = workspaceWith({
      'brief.json': JSON.stringify({ topic: 'COMMITTED-BRIEF' }),
      'script.md': 'COMMITTED-SCRIPT',
      'campaign_goal.json': JSON.stringify({ goal: 'COMMITTED-GOAL' }),
      'characters.json': 'COMMITTED-DOWNSTREAM',
      'production_flow.json': JSON.stringify(scriptFlow('script-job-old'))
    });
    const workspace = savePendingPatches(committed, [
      agentStagePatch('brief.json', JSON.stringify({ topic: 'VISIBLE-BRIEF' }), committed.files[0].content),
      agentStagePatch('script.md', 'VISIBLE-SCRIPT', 'COMMITTED-SCRIPT'),
      agentStagePatch('characters.json', 'UNCONFIRMED-DOWNSTREAM', 'COMMITTED-DOWNSTREAM', 'character-job', 'character')
    ]);

    const result = stagePromptWorkspace({
      instruction: '重新生成脚本', workspace, history: [], productionStage: 'script',
      generationJobId: 'script-job-new', sourceVersions: {}, stageRequestMode: 'regenerate'
    });
    const serialized = JSON.stringify(result.workspace);
    assert.match(serialized, /VISIBLE-BRIEF/);
    assert.match(serialized, /VISIBLE-SCRIPT/);
    assert.doesNotMatch(serialized, /COMMITTED-SCRIPT|UNCONFIRMED-DOWNSTREAM|pending_patches/);
    assert.equal(result.warnings.length, 0);
  } finally {
    restore();
  }
});

test('initial ignores pending drafts, while wrong-job stage drafts cannot enter regenerate prompt', () => {
  const restore = installTypeScriptLoader();
  try {
    const { savePendingPatches } = require('./workspaceDrafts.ts');
    const { stagePromptWorkspace } = require('./stagePromptContext.ts');
    const committed = workspaceWith({
      'script.md': 'COMMITTED-SCRIPT',
      'production_flow.json': JSON.stringify(scriptFlow('script-job-current'))
    });
    const workspace = savePendingPatches(committed, [
      agentStagePatch('script.md', 'WRONG-JOB-DRAFT', 'COMMITTED-SCRIPT', 'script-job-other')
    ]);
    const base = {
      instruction: '生成脚本', workspace, history: [], productionStage: 'script',
      generationJobId: 'script-job-new', sourceVersions: {}
    };

    const initial = stagePromptWorkspace({ ...base, stageRequestMode: 'initial' });
    const regenerate = stagePromptWorkspace({ ...base, stageRequestMode: 'regenerate' });
    assert.match(JSON.stringify(initial.workspace), /COMMITTED-SCRIPT/);
    assert.doesNotMatch(JSON.stringify(initial.workspace), /WRONG-JOB-DRAFT|pending_patches/);
    assert.match(JSON.stringify(regenerate.workspace), /COMMITTED-SCRIPT/);
    assert.doesNotMatch(JSON.stringify(regenerate.workspace), /WRONG-JOB-DRAFT|pending_patches/);
    assert.match(regenerate.warnings.join('\n'), /job/);
  } finally {
    restore();
  }
});

test('only current-job manual and safely adopted legacy script drafts can enter revise prompt', () => {
  const restore = installTypeScriptLoader();
  try {
    const { savePendingPatches } = require('./workspaceDrafts.ts');
    const { stagePromptWorkspace } = require('./stagePromptContext.ts');
    const flowContent = JSON.stringify(scriptFlow('script-job-current'));
    const base = {
      instruction: '修改脚本', history: [], productionStage: 'script',
      generationJobId: 'script-job-new', sourceVersions: {}, stageRequestMode: 'revise'
    };

    const manualWorkspace = savePendingPatches(workspaceWith({
      'script.md': 'COMMITTED-SCRIPT', 'production_flow.json': flowContent
    }), [{
      ...patch('script.md', 'MANUAL-DRAFT', 'COMMITTED-SCRIPT'),
      origin: { kind: 'manual', productionStage: 'script', generationJobId: 'script-job-current' }
    }]);
    const incompleteManualWorkspace = savePendingPatches(workspaceWith({
      'script.md': 'COMMITTED-SCRIPT', 'production_flow.json': flowContent
    }), [{
      ...patch('script.md', 'HIDDEN-INCOMPLETE-MANUAL-MARKER', 'COMMITTED-SCRIPT'),
      origin: { kind: 'manual', productionStage: 'script' }
    }]);
    const legacyWorkspace = savePendingPatches(workspaceWith({
      'script.md': 'COMMITTED-SCRIPT', 'production_flow.json': flowContent
    }), [patch('script.md', 'LEGACY-DRAFT', 'COMMITTED-SCRIPT')]);

    assert.match(JSON.stringify(stagePromptWorkspace({ ...base, workspace: manualWorkspace }).workspace), /MANUAL-DRAFT/);
    assert.match(JSON.stringify(stagePromptWorkspace({ ...base, workspace: legacyWorkspace }).workspace), /LEGACY-DRAFT/);
    const incomplete = stagePromptWorkspace({ ...base, workspace: incompleteManualWorkspace });
    assert.doesNotMatch(JSON.stringify(incomplete.workspace), /HIDDEN-INCOMPLETE-MANUAL-MARKER/);
    assert.match(incomplete.warnings.join('\n'), /手动草稿.*job|job.*手动草稿/);
  } finally {
    restore();
  }
});

const screenshotPlaceholderScript = `# 短视频脚本

## 项目信息
- **主题**: [根据 Brief 确定的核心主题]

## 场景 5：行动号召（CTA）（46-60秒）
**视觉**：清晰的按钮指引或二维码，背景简洁，突出行动点。
**口播**：“点击下方链接，立即免费试用/领取方案，开启高效新体验！”
**字幕**：立即试用 ｜ 限时福利
**时长**：14s

---

## 标题文案
- **主标题**：[吸引眼球的标题，如：告别低效！这款神器让工作提速300%]
- **副标题**：[补充说明，如：专为小B商家打造，无需技术背景]

## 标签建议
#[行业关键词] #[痛点关键词] #[解决方案] #效率工具`;

const validBrief = JSON.stringify({
  topic: '星河咖啡机',
  audience: '每天早晨赶时间的上班族',
  offer: '展示三分钟完成一杯拿铁的真实过程'
});
const validCampaignGoal = JSON.stringify({
  goal: '让观众理解星河咖啡机的操作流程并预约体验',
  audience: '每天早晨赶时间的上班族',
  platform: '小红书'
});
const validAnchoredScript = `# 星河咖啡机真实体验

## Hook
早上只剩三分钟，也能用星河咖啡机做出一杯温热拿铁吗？今天直接计时，不讲空泛卖点。

## Body
装水、放入咖啡豆、选择拿铁模式，镜头完整记录每一步和实际等待时间。适合赶时间又想自己做咖啡的人；如果你更在意手冲过程，它可能并不适合你。

## CTA
想看完整清洁流程，可以预约一次现场体验后再决定。`;

test('screenshot placeholder script is rejected while markdown links and concrete copy are accepted', () => {
  const restore = installTypeScriptLoader();
  try {
    const { validateScriptStageBundle } = require('./scriptStageValidation.ts');
    const badIssues = validateScriptStageBundle({
      briefJson: validBrief,
      campaignGoalJson: validCampaignGoal,
      scriptMarkdown: screenshotPlaceholderScript
    });
    assert.match(badIssues.join('\n'), /占位/);
    assert.match(badIssues.join('\n'), /吸引眼球|行业关键词/);

    const linkedScript = `${validAnchoredScript}\n\n[查看星河咖啡机详情](https://example.com/products/xinghe)`;
    assert.deepEqual(validateScriptStageBundle({
      briefJson: validBrief,
      campaignGoalJson: validCampaignGoal,
      scriptMarkdown: linkedScript
    }), []);
  } finally {
    restore();
  }
});

test('script-stage bundle requires a concrete Brief anchor in the script', () => {
  const restore = installTypeScriptLoader();
  try {
    const { validateScriptStageBundle } = require('./scriptStageValidation.ts');
    const issues = validateScriptStageBundle({
      briefJson: validBrief,
      campaignGoalJson: validCampaignGoal,
      scriptMarkdown: validAnchoredScript.replaceAll('星河咖啡机', '这款设备')
    });
    assert.match(issues.join('\n'), /锚点|星河咖啡机/);
  } finally {
    restore();
  }
});

test('a shared CTA cannot substitute for the committed primary Mission identity', () => {
  const restore = installTypeScriptLoader();
  try {
    const { validateScriptStageBundle } = require('./scriptStageValidation.ts');
    const brief = JSON.stringify({ topic: '旧款咖啡设备', audience: '门店顾客', offer: '预约体验' });
    const campaign = JSON.stringify({ goal: '预约体验', audience: '门店顾客', platform: '小红书' });
    const wrongProductScript = `# 错误新产品体验\n\n## Hook\n错误新产品今天做一次完整实测，记录操作流程、等待时间和真实限制，不做夸大承诺。\n\n## Body\n镜头逐步展示错误新产品的使用过程，并说明适合人群和不适合人群。\n\n## CTA\n看完流程后可以预约体验，再决定是否适合自己。`;
    const issues = validateScriptStageBundle({
      briefJson: brief,
      campaignGoalJson: campaign,
      scriptMarkdown: wrongProductScript
    });
    assert.match(issues.join('\n'), /主身份|旧款咖啡设备|产品|主题/);
    const titleBypassIssues = validateScriptStageBundle({
      briefJson: JSON.stringify({ topic: '旧款咖啡设备', title: '产品体验脚本', audience: '门店顾客', offer: '预约体验' }),
      campaignGoalJson: campaign,
      scriptMarkdown: wrongProductScript.replace('错误新产品体验', '产品体验脚本')
    });
    assert.match(titleBypassIssues.join('\n'), /主身份|旧款咖啡设备/);
  } finally {
    restore();
  }
});

test('script-only prompt context rejects a previous draft with the wrong product even when CTA matches', () => {
  const restore = installTypeScriptLoader();
  try {
    const { savePendingPatches } = require('./workspaceDrafts.ts');
    const { stagePromptWorkspace } = require('./stagePromptContext.ts');
    const brief = JSON.stringify({ topic: '旧款咖啡设备', audience: '门店顾客', offer: '预约体验' });
    const campaign = JSON.stringify({ goal: '预约体验', audience: '门店顾客', platform: '小红书' });
    const committedScript = `# 旧款咖啡设备体验\n\n## Hook\n旧款咖啡设备今天做一次完整实测，记录真实操作流程和等待时间。\n\n## Body\n逐步展示旧款咖啡设备的使用过程、适合人群和明确限制。\n\n## CTA\n看完后可以预约体验。`;
    const wrongScript = committedScript.replaceAll('旧款咖啡设备', '错误新产品');
    const flow = scriptFlow('script-job-current');
    const workspace = savePendingPatches(workspaceWith({
      'brief.json': brief,
      'campaign_goal.json': campaign,
      'script.md': committedScript,
      'production_flow.json': JSON.stringify(flow)
    }), [agentStagePatch('script.md', wrongScript, committedScript, 'script-job-current')]);
    const result = stagePromptWorkspace({
      ...scriptRunRequest(workspace),
      requestedOutputFiles: ['script.md']
    });
    const promptScript = result.workspace.files.find((file) => file.path === 'script.md')?.content || '';
    assert.match(promptScript, /旧款咖啡设备/);
    assert.doesNotMatch(promptScript, /错误新产品/);
    assert.match(result.warnings.join('\n'), /隔离|冲突|主身份/);
  } finally {
    restore();
  }
});

test('placeholder Brief or campaign goal invalidates the whole script-stage bundle atomically', () => {
  const restore = installTypeScriptLoader();
  try {
    const { validateScriptStageBundle, assertValidScriptStageBundle, InvalidStageOutputError } = require('./scriptStageValidation.ts');
    const issues = validateScriptStageBundle({
      briefJson: JSON.stringify({ topic: '[根据 Brief 确定的核心主题]', audience: '上班族' }),
      campaignGoalJson: JSON.stringify({ goal: '待填写', audience: '上班族', platform: '小红书' }),
      scriptMarkdown: validAnchoredScript
    });
    assert.match(issues.join('\n'), /brief\.json/);
    assert.match(issues.join('\n'), /campaign_goal\.json/);
    assert.throws(
      () => assertValidScriptStageBundle({
        briefJson: validBrief,
        campaignGoalJson: validCampaignGoal,
        scriptMarkdown: screenshotPlaceholderScript
      }),
      (error) => error instanceof InvalidStageOutputError && error.code === 'invalid_stage_output'
    );
  } finally {
    restore();
  }
});

test('script stage rejects an internal control instruction used as the Mission identity', () => {
  const restore = installTypeScriptLoader();
  try {
    const { validateScriptStageBundle } = require('./scriptStageValidation.ts');
    const control = '只重写 script.md，保留已确认的 Mission Brief；输出完整脚本正文并标注场景段落。';
    const issues = validateScriptStageBundle({
      briefJson: JSON.stringify({ topic: control, audience: '小 B 商家', offer: '生成脚本' }),
      campaignGoalJson: JSON.stringify({ goal: '完成脚本审查', audience: '小 B 商家', platform: '小红书' }),
      scriptMarkdown: `# ${control}\n\n## Hook\n这是一段超过六十字、包含具体结构的脚本正文，用于证明长度与锚点检查原本都会通过。\n\n## CTA\n完成后进入审查。`
    });
    assert.match(issues.join('\n'), /内部.*指令|控制指令/);
    const campaignIssues = validateScriptStageBundle({
      briefJson: validBrief,
      campaignGoalJson: JSON.stringify({ mission: control, goal: '完成脚本审查', audience: '小 B 商家', platform: '小红书' }),
      scriptMarkdown: validAnchoredScript
    });
    assert.match(campaignIssues.join('\n'), /campaign_goal\.json mission.*控制指令/);
    const metadataIssues = validateScriptStageBundle({
      briefJson: JSON.stringify({
        topic: '星河咖啡机',
        audience: '每天早晨赶时间的上班族',
        offer: '预约体验',
        lastInstruction: 'productionStage=script; stageRequestMode=regenerate; requestedOutputFiles=script.md'
      }),
      campaignGoalJson: validCampaignGoal,
      scriptMarkdown: validAnchoredScript
    });
    assert.match(metadataIssues.join('\n'), /brief\.json lastInstruction.*控制指令/);
  } finally {
    restore();
  }
});

test('invalid legacy script drafts are excluded from regenerate prompt context', () => {
  const restore = installTypeScriptLoader();
  try {
    const { savePendingPatches } = require('./workspaceDrafts.ts');
    const { stagePromptWorkspace } = require('./stagePromptContext.ts');
    const flowContent = JSON.stringify(scriptFlow('script-job-current'));
    const workspace = savePendingPatches(workspaceWith({
      'brief.json': validBrief,
      'campaign_goal.json': validCampaignGoal,
      'script.md': validAnchoredScript,
      'production_flow.json': flowContent
    }), [
      agentStagePatch('script.md', screenshotPlaceholderScript, validAnchoredScript, 'script-job-current')
    ]);
    const result = stagePromptWorkspace({
      instruction: '重新生成脚本', workspace, history: [], productionStage: 'script',
      generationJobId: 'script-job-new', sourceVersions: {}, stageRequestMode: 'regenerate',
      requestedOutputFiles: ['script.md']
    });
    const serialized = JSON.stringify(result.workspace);
    assert.match(serialized, /星河咖啡机/);
    assert.doesNotMatch(serialized, /吸引眼球|行业关键词|根据 Brief/);
    assert.match(result.warnings.join('\n'), /占位|无效|隔离/);
  } finally {
    restore();
  }
});

test('valid Brief, campaign goal and anchored script pass atomic validation', () => {
  const restore = installTypeScriptLoader();
  try {
    const { validateScriptStageBundle } = require('./scriptStageValidation.ts');
    assert.deepEqual(validateScriptStageBundle({
      briefJson: validBrief,
      campaignGoalJson: validCampaignGoal,
      scriptMarkdown: validAnchoredScript
    }), []);
  } finally {
    restore();
  }
});

function scriptRegenerationWorkspace() {
  const restore = installTypeScriptLoader();
  try {
    const { savePendingPatches } = require('./workspaceDrafts.ts');
    const committedBrief = JSON.stringify({
      topic: '旧款咖啡设备', audience: '旧受众', offer: '旧目标'
    });
    const committedCampaign = JSON.stringify({
      goal: '旧转化目标', audience: '旧受众', platform: '抖音'
    });
    const committedScript = validAnchoredScript.replaceAll('星河咖啡机', '旧款咖啡设备');
    const committed = workspaceWith({
      'brief.json': committedBrief,
      'script.md': committedScript,
      'campaign_goal.json': committedCampaign,
      'characters.json': 'COMMITTED-DOWNSTREAM',
      'production_flow.json': JSON.stringify(scriptFlow('script-job-old'))
    });
    const workspace = savePendingPatches(committed, [
      agentStagePatch('brief.json', validBrief, committedBrief),
      agentStagePatch('script.md', `${validAnchoredScript}\n\nVISIBLE-SCRIPT-MARKER`, committedScript),
      agentStagePatch('campaign_goal.json', validCampaignGoal, committedCampaign),
      agentStagePatch('characters.json', 'UNCONFIRMED-DOWNSTREAM', 'COMMITTED-DOWNSTREAM', 'character-job', 'character')
    ]);
    return { workspace, committedBrief, committedCampaign, committedScript };
  } finally {
    restore();
  }
}

function providerResponse(script = validAnchoredScript) {
  return {
    assistantMessage: '已生成可审查的脚本阶段草稿。',
    patchOperations: [
      { filePath: 'script.md', summary: '旧重复脚本', before: 'FORGED-BEFORE-1', after: 'DUPLICATE-OLD', riskLevel: 'low', requiresApproval: true },
      { filePath: 'brief.json', summary: '更新 Brief', before: 'FORGED-BRIEF-BEFORE', after: validBrief, riskLevel: 'low', requiresApproval: true },
      { filePath: 'campaign_goal.json', summary: '更新目标', before: 'FORGED-GOAL-BEFORE', after: validCampaignGoal, riskLevel: 'low', requiresApproval: true },
      { filePath: 'script.md', summary: '更新脚本', before: 'FORGED-BEFORE-2', after: script, riskLevel: 'low', requiresApproval: true }
    ]
  };
}

function scriptRunRequest(workspace, stageRequestMode = 'regenerate') {
  return {
    instruction: '基于当前 Brief 重新生成脚本并保留星河咖啡机',
    workspace,
    history: [],
    workflow: 'script',
    productionStage: 'script',
    generationJobId: 'script-job-new',
    sourceVersions: {},
    stageRequestMode,
    stageRequestTarget: 'artifact'
  };
}

test('live regenerate prompt sees trusted visible draft while patch baseline stays committed and authoritative', async () => {
  const restore = installTypeScriptLoader();
  try {
    const { runVideoAgent } = require('./agentProvider.ts');
    const fixture = scriptRegenerationWorkspace();
    await withCustomModelResponse(providerResponse(), async (capturedBody) => {
      const result = await runVideoAgent({
        ...scriptRunRequest(fixture.workspace),
        stageRequestTarget: 'stage'
      });
      assert.match(capturedBody(), /VISIBLE-SCRIPT-MARKER/);
      assert.match(capturedBody(), /星河咖啡机/);
      assert.doesNotMatch(capturedBody(), /UNCONFIRMED-DOWNSTREAM|pending_patches/);
      assert.deepEqual(result.patchOperations.map((item) => item.filePath).sort(), ['brief.json', 'campaign_goal.json', 'script.md']);
      const scriptPatch = result.patchOperations.find((item) => item.filePath === 'script.md');
      assert.equal(scriptPatch.before, fixture.committedScript);
      assert.doesNotMatch(scriptPatch.before, /FORGED-BEFORE/);
      assert.deepEqual(scriptPatch.origin, {
        kind: 'agent_stage', productionStage: 'script', generationJobId: 'script-job-new'
      });
    });
  } finally {
    restore();
  }
});

test('script-only regeneration uses committed Brief identity and rejects a conflicting pending script as prompt context', () => {
  const restore = installTypeScriptLoader();
  try {
    const { stagePromptWorkspace } = require('./stagePromptContext.ts');
    const fixture = scriptRegenerationWorkspace();
    const result = stagePromptWorkspace({
      ...scriptRunRequest(fixture.workspace),
      requestedOutputFiles: ['script.md']
    });
    const content = (filePath) => result.workspace.files.find((file) => file.path === filePath)?.content || '';

    assert.equal(content('brief.json'), fixture.committedBrief);
    assert.equal(content('campaign_goal.json'), fixture.committedCampaign);
    assert.equal(content('script.md'), fixture.committedScript);
    assert.match(result.warnings.join('\n'), /隔离|无效|冲突/);
  } finally {
    restore();
  }
});

test('script-only regeneration cannot rewrite Brief or campaign goal', async () => {
  const restore = installTypeScriptLoader();
  try {
    const { runVideoAgent } = require('./agentProvider.ts');
    const fixture = scriptRegenerationWorkspace();
    const confirmedScript = validAnchoredScript.replaceAll('星河咖啡机', '旧款咖啡设备');
    await withCustomModelResponse({
      assistantMessage: '仅更新已确认 Brief 下的脚本。',
      patchOperations: [
        { filePath: 'script.md', summary: '更新脚本', after: confirmedScript, riskLevel: 'low', requiresApproval: true }
      ]
    }, async () => {
      const result = await runVideoAgent({
        ...scriptRunRequest(fixture.workspace),
        requestedOutputFiles: ['script.md']
      });
      assert.deepEqual(result.patchOperations.map((item) => item.filePath), ['script.md']);
      assert.equal(result.patchOperations[0].before, fixture.committedScript);
      assert.match(result.patchOperations[0].after, /旧款咖啡设备/);
    });
  } finally {
    restore();
  }
});

test('a provider patch without after never promotes the previous prompt draft into the current job', async () => {
  const restore = installTypeScriptLoader();
  try {
    const { runVideoAgent } = require('./agentProvider.ts');
    const fixture = scriptRegenerationWorkspace();
    await withCustomModelResponse({
      assistantMessage: '返回了缺少 after 的不完整 patch。',
      patchOperations: [{ filePath: 'script.md', summary: '不完整脚本 patch', riskLevel: 'low', requiresApproval: true }]
    }, async () => {
      const result = await runVideoAgent({
        ...scriptRunRequest(fixture.workspace),
        requestedOutputFiles: ['script.md']
      });
      assert.deepEqual(result.patchOperations.map((item) => item.filePath), ['script.md']);
      assert.doesNotMatch(result.patchOperations[0].after, /VISIBLE-SCRIPT-MARKER/);
      assert.match(result.patchOperations[0].after, /旧款咖啡设备/);
      // 模型没交出可用的 after，内容其实来自内置模板；这必须对用户可见，不能伪装成模型输出。
      assert.deepEqual(result.patchOperations[0].origin, {
        kind: 'agent_stage', productionStage: 'script', generationJobId: 'script-job-new', templateFallback: 'missing'
      });
      const ensureEvent = result.toolEvents.find((event) => event.toolName === 'ensure_stage_output');
      assert.equal(ensureEvent.status, 'warning');
      assert.match(ensureEvent.title, /模板兜底/);
      assert.match(ensureEvent.summary, /script\.md/);
      assert.match(ensureEvent.summary, /不是模型输出/);
    });
  } finally {
    restore();
  }
});

test('invalid model script rejects the complete script-stage response instead of preserving partial patches', async () => {
  const restore = installTypeScriptLoader();
  try {
    const { runVideoAgent } = require('./agentProvider.ts');
    const { InvalidStageOutputError } = require('./scriptStageValidation.ts');
    const fixture = scriptRegenerationWorkspace();
    await withCustomModelResponse(providerResponse(screenshotPlaceholderScript), async () => {
      await assert.rejects(
        () => runVideoAgent(scriptRunRequest(fixture.workspace)),
        (error) => error instanceof InvalidStageOutputError && error.code === 'invalid_stage_output'
      );
    });
  } finally {
    restore();
  }
});

test('server rejects a caller-supplied script output scope that exceeds the authoritative artifact scope', async () => {
  const restore = installTypeScriptLoader();
  try {
    const { runVideoAgent } = require('./agentProvider.ts');
    const fixture = scriptRegenerationWorkspace();
    await assert.rejects(
      () => runVideoAgent({
        ...scriptRunRequest(fixture.workspace),
        requestedOutputFiles: ['brief.json', 'campaign_goal.json', 'script.md']
      }),
      /output scope mismatch/
    );
  } finally {
    restore();
  }
});

test('force-mock and provider-absent fallbacks generate from prompt draft but keep committed before', async () => {
  const restore = installTypeScriptLoader();
  try {
    const { runVideoAgent } = require('./agentProvider.ts');
    for (const env of [
      { VIDEOAGENT_FORCE_MOCK: 'true' },
      {
        VIDEOAGENT_FORCE_MOCK: undefined,
        DEMO_MODE: undefined,
        DEFAULT_PROVIDER: undefined,
        CUSTOM_API_KEY: undefined,
        CUSTOM_BASE_URL: undefined,
        OPENAI_API_KEY: undefined,
        ANTHROPIC_API_KEY: undefined
      }
    ]) {
      const fixture = scriptRegenerationWorkspace();
      const result = await withEnv(env, () => runVideoAgent(scriptRunRequest(fixture.workspace)));
      const scriptPatch = result.patchOperations.find((item) => item.filePath === 'script.md');
      assert.equal(scriptPatch.before, fixture.committedScript);
      assert.match(scriptPatch.after, /旧款咖啡设备/);
      assert.deepEqual(scriptPatch.origin, {
        kind: 'agent_stage', productionStage: 'script', generationJobId: 'script-job-new'
      });
    }
  } finally {
    restore();
  }
});

test('blank-project mock fallback strips internal stage rules from user-facing Brief fields', async () => {
  const restore = installTypeScriptLoader();
  try {
    const { runVideoAgent } = require('./agentProvider.ts');
    const { stageGenerationInstruction } = require('./stageGeneration.ts');
    const workspace = workspaceWith();
    const result = await withEnv({ VIDEOAGENT_FORCE_MOCK: 'true' }, () => runVideoAgent({
      instruction: stageGenerationInstruction('script', '', ['brief.json', 'campaign_goal.json', 'script.md']),
      workspace,
      history: [],
      workflow: 'script',
      productionStage: 'script',
      generationJobId: 'blank-script-job',
      sourceVersions: {},
      stageRequestMode: 'initial',
      stageRequestTarget: 'stage',
      requestedOutputFiles: ['brief.json', 'campaign_goal.json', 'script.md']
    }));
    const brief = JSON.parse(result.patchOperations.find((item) => item.filePath === 'brief.json').after);
    assert.deepEqual(result.patchOperations.map((item) => item.filePath).sort(), ['brief.json', 'campaign_goal.json', 'script.md']);
    assert.doesNotMatch(String(brief.lastInstruction || ''), /阶段隔离规则|TODO|TBD|待填写/);

    const exactControl = 'productionStage=script; stageRequestMode=regenerate; requestedOutputFiles=script.md';
    const exactResult = await withEnv({ VIDEOAGENT_FORCE_MOCK: 'true' }, () => runVideoAgent({
      instruction: exactControl,
      workspace,
      history: [],
      workflow: 'script',
      productionStage: 'script',
      generationJobId: 'blank-script-job-exact-control',
      sourceVersions: {},
      stageRequestMode: 'initial',
      stageRequestTarget: 'stage',
      requestedOutputFiles: ['brief.json', 'campaign_goal.json', 'script.md']
    }));
    const exactBrief = JSON.parse(exactResult.patchOperations.find((item) => item.filePath === 'brief.json').after);
    assert.equal(exactBrief.lastInstruction, '新的短视频创作任务');
    assert.doesNotMatch(JSON.stringify(exactResult.patchOperations), /productionStage=script|stageRequestMode=regenerate|requestedOutputFiles=script\.md/);
  } finally {
    restore();
  }
});

test('agent route accepts an empty user instruction for a structured production-stage request', async () => {
  const restore = installTypeScriptLoader();
  try {
    const { POST } = require('../app/api/agent/run/route.ts');
    const response = await withEnv({ VIDEOAGENT_FORCE_MOCK: 'true' }, () => POST(new Request('http://localhost/api/agent/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        instruction: '',
        workspace: workspaceWith(),
        history: [],
        workflow: 'script',
        productionStage: 'script',
        generationJobId: 'blank-route-job',
        sourceVersions: {},
        stageRequestMode: 'initial',
        stageRequestTarget: 'stage',
        requestedOutputFiles: ['brief.json', 'campaign_goal.json', 'script.md']
      })
    })));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.patchOperations.map((item) => item.filePath).sort(), ['brief.json', 'campaign_goal.json', 'script.md']);
  } finally {
    restore();
  }
});

test('deterministic fallback regeneration fails instead of marking an empty current job reviewable', async () => {
  const restore = installTypeScriptLoader();
  try {
    const { runVideoAgent } = require('./agentProvider.ts');
    const { applyPatchToWorkspace } = require('./workspace.ts');
    const initialWorkspace = workspaceWith();
    const initialRequest = {
      instruction: '',
      workspace: initialWorkspace,
      history: [],
      workflow: 'script',
      productionStage: 'script',
      generationJobId: 'fallback-initial-job',
      sourceVersions: {},
      stageRequestMode: 'initial',
      stageRequestTarget: 'stage',
      requestedOutputFiles: ['brief.json', 'campaign_goal.json', 'script.md']
    };
    const first = await withEnv({ VIDEOAGENT_FORCE_MOCK: 'true' }, () => runVideoAgent(initialRequest));
    const committed = applyPatchToWorkspace(initialWorkspace, first.patchOperations, 'pass');
    await assert.rejects(
      () => withEnv({ VIDEOAGENT_FORCE_MOCK: 'true' }, () => runVideoAgent({
        ...initialRequest,
        workspace: committed,
        generationJobId: 'fallback-regenerate-job',
        stageRequestMode: 'regenerate',
        stageRequestTarget: 'artifact',
        requestedOutputFiles: ['script.md']
      })),
      /没有产生.*patch|没有产生.*新版本/
    );
  } finally {
    restore();
  }
});

test('agent route maps invalid script-stage output to stable 502 response', async () => {
  const restore = installTypeScriptLoader();
  try {
    const { POST } = require('../app/api/agent/run/route.ts');
    const fixture = scriptRegenerationWorkspace();
    await withCustomModelResponse(providerResponse(screenshotPlaceholderScript), async () => {
      const response = await POST(new Request('http://localhost/api/agent/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(scriptRunRequest(fixture.workspace))
      }));
      assert.equal(response.status, 502);
      const body = await response.json();
      assert.equal(body.code, 'invalid_stage_output');
      assert.match(body.error, /占位|未填充/);
    });
  } finally {
    restore();
  }
});

test('page wires explicit initial, regenerate and revise modes and stamps manual script edits', () => {
  const page = fs.readFileSync(path.join(__dirname, '../app/page.tsx'), 'utf8');
  assert.match(page, /buildStageRunRequest/);
  assert.match(page, /stageRequestMode:\s*stageRequestMode/);
  assert.match(page, /requestStageDraft\([\s\S]{0,300}'revise', stageRequestTarget, requestedOutputFiles\s*\)/);
  assert.match(page, /regenerateProductionStage[\s\S]{0,1900}requestStageDraft\([\s\S]{0,300}'regenerate', stageRequestTarget, requestedOutputFiles\s*\)/);
  assert.match(page, /origin:\s*{\s*kind:\s*'manual',[\s\S]{0,120}productionStage:\s*'script'/);
});
