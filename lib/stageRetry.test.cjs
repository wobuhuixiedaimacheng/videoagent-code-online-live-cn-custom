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

/** 按调用次数依次返回不同的模型响应，用来模拟「第一轮不合格、第二轮修好」。 */
async function withModelResponseSequence(responses, action) {
  const previousFetch = global.fetch;
  const bodies = [];
  let call = 0;
  global.fetch = async (_url, init) => {
    bodies.push(String(init.body || ''));
    const payload = responses[Math.min(call, responses.length - 1)];
    call += 1;
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(payload) } }]
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
    }, () => action({ bodies: () => bodies, calls: () => call }));
  } finally {
    global.fetch = previousFetch;
  }
}

const workspace = {
  projectId: 'p1',
  title: '诊断项目',
  mode: 'creator',
  activeWorkflow: 'script',
  complianceStatus: 'pass',
  currentTimelineVersion: 1,
  files: []
};

function scriptBundle(topic, scriptBody) {
  return {
    patchOperations: [
      {
        filePath: 'brief.json',
        after: JSON.stringify({ topic, audience: '一线城市通勤白领', offer: '首单立减 20 元' })
      },
      {
        filePath: 'campaign_goal.json',
        after: JSON.stringify({ goal: '引导观众点击主页链接下单', audience: '一线城市通勤白领', platform: '小红书' })
      },
      { filePath: 'script.md', after: scriptBody }
    ]
  };
}

// topic 是营销短语，正文自然不会逐字复述它——这正是线上失败的形态。
const REJECTED = scriptBundle(
  '国产高颜值保温杯种草',
  '# 通勤水杯\n\n## Hook\n每天带的杯子总是漏水，包里全湿了。\n\n## 正文\n换了这个杯子之后，倒扣进包里一整天都没渗过一滴水。保温效果也够用，早上装的热水到下午还是温的。\n\n## CTA\n主页链接可以看具体规格。'
);

const ACCEPTED = scriptBundle(
  '保温杯',
  '# 通勤保温杯\n\n## Hook\n每天带的保温杯总是漏水，包里全湿了。\n\n## 正文\n换了这个保温杯之后，倒扣进包里一整天都没渗过一滴水。保温效果也够用，早上装的热水到下午还是温的。\n\n## CTA\n主页链接可以看具体规格。'
);

function scriptRequest() {
  return {
    instruction: '做一条讲保温杯的短视频',
    workspace,
    history: [],
    productionStage: 'script',
    generationJobId: 'retry-diag',
    sourceVersions: {},
    stageRequestMode: 'initial'
  };
}

test('a rejected script bundle is retried with the validator issues fed back', async () => {
  const restore = installTypeScriptLoader();
  try {
    const { runVideoAgent } = require('./agentProvider.ts');
    await withModelResponseSequence([REJECTED, ACCEPTED], async ({ bodies, calls }) => {
      const result = await runVideoAgent(scriptRequest());

      assert.equal(calls(), 2, 'should call the model exactly twice');
      const retryPrompt = bodies()[1];
      assert.match(retryPrompt, /没有通过阶段校验/, 'retry must tell the model it was rejected');
      assert.match(retryPrompt, /未保留 Brief 的主身份/, 'retry must carry the concrete issue');

      const script = result.patchOperations.find((patch) => patch.filePath === 'script.md');
      assert.ok(script, 'a script patch should survive the retry');
      assert.match(script.after, /保温杯/);
    });
  } finally {
    restore();
  }
});

test('a successful first attempt never triggers a second model call', async () => {
  const restore = installTypeScriptLoader();
  try {
    const { runVideoAgent } = require('./agentProvider.ts');
    await withModelResponseSequence([ACCEPTED], async ({ calls }) => {
      await runVideoAgent(scriptRequest());
      assert.equal(calls(), 1, 'no retry when the first attempt already validates');
    });
  } finally {
    restore();
  }
});

test('the retry is disclosed in notes rather than being silent', async () => {
  const restore = installTypeScriptLoader();
  try {
    const { runVideoAgent } = require('./agentProvider.ts');
    await withModelResponseSequence([REJECTED, ACCEPTED], async () => {
      const result = await runVideoAgent(scriptRequest());
      // 静默重试会让人以为一次就过了；必须留痕。
      assert.ok(
        result.notes.some((note) => note.includes('重试')),
        `notes should disclose the retry, got: ${JSON.stringify(result.notes)}`
      );
    });
  } finally {
    restore();
  }
});

test('two consecutive rejections still surface the validation error', async () => {
  const restore = installTypeScriptLoader();
  try {
    const { runVideoAgent } = require('./agentProvider.ts');
    await withModelResponseSequence([REJECTED, REJECTED], async ({ calls }) => {
      // 重试是给一次机会，不是无限兜底——校验标准一点没放宽。
      await assert.rejects(
        () => runVideoAgent(scriptRequest()),
        (error) => error.code === 'invalid_stage_output'
      );
      assert.equal(calls(), 2, 'retry exactly once, then fail');
    });
  } finally {
    restore();
  }
});
