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

const validBrief = JSON.stringify({
  topic: '星河咖啡机', audience: '早晨赶时间的上班族', offer: '三分钟完成一杯拿铁'
});
const validCampaign = JSON.stringify({
  goal: '预约门店体验', audience: '早晨赶时间的上班族', platform: '小红书'
});
const validScript = `# 星河咖啡机体验脚本

## Hook
早上只剩三分钟，星河咖啡机能不能完成一杯拿铁？现在直接计时。

## 正文
加水、放豆、选择拿铁模式，完整展示制作过程与等待时间。

## CTA
想亲手试一次星河咖啡机，可以预约门店体验。`;

function stagePatch(filePath, after, before, jobId) {
  return {
    ...patch(filePath, after, before),
    origin: { kind: 'agent_stage', productionStage: 'script', generationJobId: jobId }
  };
}

test('starting a replacement generation hides prior-job stage patches from preview and approval', () => {
  const restore = installTypeScriptLoader();
  try {
    const { classifyPendingPatchesForReview } = require('./stageReviewState.ts');
    const flow = readyFlow('script', 1);
    flow.stages.script.status = 'generating';
    flow.stages.script.generationJobId = 'script-job-new';
    const workspace = workspaceWith({
      'brief.json': validBrief,
      'campaign_goal.json': validCampaign,
      'script.md': validScript,
      'production_flow.json': JSON.stringify(flow)
    });
    const patches = [
      stagePatch('brief.json', validBrief, validBrief, 'script-job-old'),
      stagePatch('campaign_goal.json', validCampaign, validCampaign, 'script-job-old'),
      stagePatch('script.md', `${validScript}\n\n上一版草稿`, validScript, 'script-job-old'),
      patch('compliance_report.json', '{"status":"warning"}')
    ];

    const result = classifyPendingPatchesForReview(workspace, patches);
    assert.deepEqual(result.reviewable.map((item) => item.filePath), ['compliance_report.json']);
    assert.deepEqual(result.superseded.map((item) => item.filePath).sort(), [
      'brief.json', 'campaign_goal.json', 'script.md'
    ]);
  } finally {
    restore();
  }
});

test('legacy placeholder script bundle is quarantined even when the stage says ready for review', () => {
  const restore = installTypeScriptLoader();
  try {
    const { classifyPendingPatchesForReview } = require('./stageReviewState.ts');
    const flow = readyFlow('script', 1);
    flow.stages.script.generationJobId = 'legacy-job';
    const committedScript = validScript;
    const workspace = workspaceWith({
      'brief.json': validBrief,
      'campaign_goal.json': validCampaign,
      'script.md': committedScript,
      'production_flow.json': JSON.stringify(flow)
    });
    const patches = [
      patch('brief.json', JSON.stringify({ topic: '[项目主题]', audience: '[目标受众]' }), validBrief),
      patch('campaign_goal.json', JSON.stringify({ goal: '[行动号召]', audience: '[目标受众]', platform: '小红书' }), validCampaign),
      patch('script.md', '# 短视频脚本\n\n你是否也遇到过[具体痛点]？\n\n#[行业关键词]', committedScript)
    ];

    const result = classifyPendingPatchesForReview(workspace, patches);
    assert.deepEqual(result.reviewable, []);
    assert.equal(result.quarantined.length, 3);
    assert.match(result.issues.join('\n'), /占位/);
  } finally {
    restore();
  }
});

test('only patches from the active ready-for-review job become reviewable', () => {
  const restore = installTypeScriptLoader();
  try {
    const { classifyPendingPatchesForReview } = require('./stageReviewState.ts');
    const flow = readyFlow('script', 2);
    flow.stages.script.generationJobId = 'script-job-new';
    const workspace = workspaceWith({
      'brief.json': validBrief,
      'campaign_goal.json': validCampaign,
      'script.md': validScript,
      'production_flow.json': JSON.stringify(flow)
    });
    const current = [
      stagePatch('brief.json', validBrief, validBrief, 'script-job-new'),
      stagePatch('campaign_goal.json', validCampaign, validCampaign, 'script-job-new'),
      stagePatch('script.md', `${validScript}\n\n新版本`, validScript, 'script-job-new')
    ];
    const wrongJob = stagePatch('script.md', `${validScript}\n\n错误旧版本`, validScript, 'script-job-old');

    assert.deepEqual(
      classifyPendingPatchesForReview(workspace, current).reviewable.map((item) => item.filePath).sort(),
      ['brief.json', 'campaign_goal.json', 'script.md']
    );
    assert.deepEqual(classifyPendingPatchesForReview(workspace, [wrongJob]).reviewable, []);
  } finally {
    restore();
  }
});

test('originless legacy production patches are quarantined instead of being adopted by the active job', () => {
  const restore = installTypeScriptLoader();
  try {
    const { classifyPendingPatchesForReview } = require('./stageReviewState.ts');
    const flow = readyFlow('script', 3);
    flow.stages.script.generationJobId = 'script-job-current';
    const workspace = workspaceWith({
      'brief.json': validBrief,
      'campaign_goal.json': validCampaign,
      'script.md': validScript,
      'production_flow.json': JSON.stringify(flow)
    });
    const legacy = [
      patch('brief.json', validBrief, validBrief),
      patch('campaign_goal.json', validCampaign, validCampaign),
      patch('script.md', `${validScript}\n\n来源不明的历史版本`, validScript)
    ];

    const result = classifyPendingPatchesForReview(workspace, legacy);
    assert.deepEqual(result.reviewable, []);
    assert.equal(result.quarantined.length, 3);
    assert.match(result.issues.join('\n'), /来源|历史/);
  } finally {
    restore();
  }
});

test('current-job script with a wrong product is quarantined even when its CTA matches the committed Brief', () => {
  const restore = installTypeScriptLoader();
  try {
    const { classifyPendingPatchesForReview } = require('./stageReviewState.ts');
    const flow = readyFlow('script', 4);
    flow.stages.script.generationJobId = 'script-job-current';
    const committedBrief = JSON.stringify({ topic: '旧款咖啡设备', audience: '门店顾客', offer: '预约体验' });
    const committedCampaign = JSON.stringify({ goal: '预约体验', audience: '门店顾客', platform: '小红书' });
    const committedScript = `# 旧款咖啡设备体验\n\n## Hook\n旧款咖啡设备今天做一次完整实测，记录操作流程和真实等待时间。\n\n## Body\n逐步展示旧款咖啡设备的使用过程、适合人群和明确限制。\n\n## CTA\n看完后可以预约体验。`;
    const wrongScript = committedScript.replaceAll('旧款咖啡设备', '错误新产品');
    const workspace = workspaceWith({
      'brief.json': committedBrief,
      'campaign_goal.json': committedCampaign,
      'script.md': committedScript,
      'production_flow.json': JSON.stringify(flow)
    });
    const result = classifyPendingPatchesForReview(workspace, [
      stagePatch('script.md', wrongScript, committedScript, 'script-job-current')
    ]);
    assert.deepEqual(result.reviewable, []);
    assert.equal(result.quarantined.length, 1);
    assert.match(result.issues.join('\n'), /主身份|旧款咖啡设备|产品|主题/);
  } finally {
    restore();
  }
});

test('a current-job script remains reviewable when only legacy sibling files are quarantined', () => {
  const restore = installTypeScriptLoader();
  try {
    const { classifyPendingPatchesForReview } = require('./stageReviewState.ts');
    const flow = readyFlow('script', 5);
    flow.stages.script.generationJobId = 'script-job-current';
    const workspace = workspaceWith({
      'brief.json': validBrief,
      'campaign_goal.json': validCampaign,
      'script.md': validScript,
      'production_flow.json': JSON.stringify(flow)
    });
    const result = classifyPendingPatchesForReview(workspace, [
      patch('brief.json', validBrief, validBrief),
      patch('campaign_goal.json', validCampaign, validCampaign),
      stagePatch('script.md', `${validScript}\n\n当前 job 新版本`, validScript, 'script-job-current')
    ]);
    assert.deepEqual(result.reviewable.map((item) => item.filePath), ['script.md']);
    assert.deepEqual(result.quarantined.map((item) => item.filePath).sort(), ['brief.json', 'campaign_goal.json']);
  } finally {
    restore();
  }
});

test('manual editing baselines include only patches owned by the current stage job', () => {
  const restore = installTypeScriptLoader();
  try {
    const { patchesOwnedByCurrentStageJob } = require('./stageReviewState.ts');
    const flow = readyFlow('character', 2);
    flow.stages.character.generationJobId = 'character-job-current';
    const workspace = workspaceWith({
      'script.md': validScript,
      'characters.json': '{"characters":[{"id":"committed","name":"已提交角色"}]}',
      'production_flow.json': JSON.stringify(flow)
    });
    const current = {
      ...patch('characters.json', '{"characters":[{"id":"current","name":"当前角色"}]}'),
      origin: { kind: 'agent_stage', productionStage: 'character', generationJobId: 'character-job-current' }
    };
    const wrong = {
      ...patch('characters.json', '{"characters":[{"id":"hidden","name":"隐藏旧角色"}]}'),
      id: 'wrong-job-patch',
      origin: { kind: 'agent_stage', productionStage: 'character', generationJobId: 'character-job-old' }
    };
    assert.deepEqual(patchesOwnedByCurrentStageJob(workspace, [wrong, current], 'character').map((item) => item.id), [current.id]);
  } finally {
    restore();
  }
});

test('manual production patch without complete stage and job ownership is quarantined', () => {
  const restore = installTypeScriptLoader();
  try {
    const { classifyPendingPatchesForReview } = require('./stageReviewState.ts');
    const flow = readyFlow('script', 6);
    flow.stages.script.generationJobId = 'script-job-current';
    const workspace = workspaceWith({
      'brief.json': validBrief,
      'campaign_goal.json': validCampaign,
      'script.md': validScript,
      'production_flow.json': JSON.stringify(flow)
    });
    const incompleteManual = {
      ...patch('script.md', `${validScript}\n\n旧手动版本`, validScript),
      origin: { kind: 'manual' }
    };
    const result = classifyPendingPatchesForReview(workspace, [incompleteManual]);
    assert.deepEqual(result.reviewable, []);
    assert.equal(result.quarantined.length, 1);
    assert.match(result.issues.join('\n'), /手动草稿.*stage\/job|来源/);
  } finally {
    restore();
  }
});

test('分批合并出来的分镜草稿带上来源戳就能进审批，掉了戳则被隔离并说明真实原因', () => {
  const restore = installTypeScriptLoader();
  try {
    const { classifyPendingPatchesForReview } = require('./stageReviewState.ts');
    const flow = readyFlow('storyboard', 1);
    flow.stages.storyboard.generationJobId = 'storyboard-job-current';
    const workspace = workspaceWith({
      // 上游三个阶段在 flow 里是 confirmed，规范文件缺一个整条流程就会被判 stale。
      'script.md': validScript,
      'characters.json': '{"characters":[{"id":"char_01"}]}',
      'scenes.json': '{"scenes":[{"id":"scene_01"}]}',
      'storyboard.json': '{"scenes":[]}',
      'timeline.json': '{"beats":[]}',
      'production_flow.json': JSON.stringify(flow)
    });
    const merged = (filePath, after) => ({
      ...patch(filePath, after, ''),
      origin: { kind: 'agent_stage', productionStage: 'storyboard', generationJobId: 'storyboard-job-current' }
    });

    const stamped = classifyPendingPatchesForReview(workspace, [
      merged('storyboard.json', '{"scenes":[{"id":"shot_01"}]}'),
      merged('timeline.json', '{"beats":[{"id":"beat_01"}]}')
    ]);
    assert.equal(stamped.reviewable.length, 2);
    assert.deepEqual(stamped.quarantined, []);
    assert.deepEqual(stamped.quarantineNotes, []);

    // 合并 patch 忘了补 origin 时的老行为：整份真实产出被当历史草稿隔离。
    const unstamped = classifyPendingPatchesForReview(workspace, [
      patch('storyboard.json', '{"scenes":[{"id":"shot_01"}]}', ''),
      patch('timeline.json', '{"beats":[{"id":"beat_01"}]}', '')
    ]);
    assert.deepEqual(unstamped.reviewable, []);
    assert.equal(unstamped.quarantined.length, 2);
    assert.deepEqual(
      unstamped.quarantineNotes.map((note) => `${note.stage}:${note.filePath}:${note.reason}`).sort(),
      [
        'storyboard:storyboard.json:这份草稿缺少可验证的生成来源',
        'storyboard:timeline.json:这份草稿缺少可验证的生成来源'
      ]
    );
    // 隔离原因里不能出现「占位内容」——这条路径压根没看过内容。
    assert.doesNotMatch(unstamped.quarantineNotes.map((note) => note.reason).join('\n'), /占位/);
  } finally {
    restore();
  }
});
