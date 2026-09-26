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

const CUSTOM_ENV = {
  VIDEOAGENT_FORCE_MOCK: undefined,
  DEMO_MODE: undefined,
  AGENT_LOOP: undefined,
  AGENT_JSON_REPAIR: undefined,
  AGENT_CONTINUATION_ROUNDS: undefined,
  DEFAULT_PROVIDER: 'custom',
  CUSTOM_API_KEY: 'test-key',
  CUSTOM_BASE_URL: 'http://provider.test/v1',
  OPENAI_API_KEY: undefined,
  ANTHROPIC_API_KEY: undefined
};

function request() {
  return {
    instruction: '生成三分钟短剧剧本',
    workspace: {
      projectId: 'p1', title: 't', mode: 'creator', activeWorkflow: 'script',
      complianceStatus: 'pass', currentTimelineVersion: 1, files: []
    },
    history: []
  };
}

/** replies: [{ content, finish_reason }]，按顺序回放，并记录每一轮发出去的 messages。 */
async function withModelReplies(replies, action, envOverrides = {}) {
  const previousFetch = global.fetch;
  const sent = [];
  global.fetch = async (_url, init) => {
    sent.push(JSON.parse(String(init.body || '{}')));
    const reply = replies[Math.min(sent.length - 1, replies.length - 1)];
    return new Response(JSON.stringify({
      choices: [{ finish_reason: reply.finish_reason || 'stop', message: { content: reply.content } }]
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    return await withEnv({ ...CUSTOM_ENV, ...envOverrides }, () => action(sent));
  } finally {
    global.fetch = previousFetch;
  }
}

const HEAD = '{"assistantMessage":"已生成剧本","plan":["拆解结构"],"patchOperations":[{"filePath":"script.md","summary":"写入剧本","after":"# 前任重逢';
const TAIL = '\\n\\n## 第一场\\n林夏推门而入。"}]}';

test('a length-capped reply is continued instead of failing the stage', async () => {
  const restore = installTypeScriptLoader();
  try {
    const { runVideoAgent } = require('./agentProvider.ts');
    await withModelReplies([
      { content: HEAD, finish_reason: 'length' },
      { content: TAIL, finish_reason: 'stop' }
    ], async (sent) => {
      const result = await runVideoAgent(request());
      assert.equal(result.assistantMessage, '已生成剧本');
      assert.match(result.patchOperations[0].after, /前任重逢[\s\S]*林夏推门而入/, 'both halves must survive');
      assert.equal(sent.length, 2, 'exactly one continuation round-trip');
      const followUp = sent[1].messages;
      assert.equal(followUp.at(-2).role, 'assistant', 'the partial output must be fed back as assistant turn');
      assert.equal(followUp.at(-2).content, HEAD);
      assert.match(followUp.at(-1).content, /继续输出剩余内容/);
    });
  } finally {
    restore();
  }
});

test('a continuation that repeats the tail is stitched without duplication', async () => {
  const restore = installTypeScriptLoader();
  try {
    const { runVideoAgent } = require('./agentProvider.ts');
    // 模型很爱把上一段结尾再抄一遍，直接拼接会得到一份必然解析失败的 JSON。
    const overlap = HEAD.slice(-60);
    await withModelReplies([
      { content: HEAD, finish_reason: 'length' },
      { content: `${overlap}${TAIL}`, finish_reason: 'stop' }
    ], async () => {
      const result = await runVideoAgent(request());
      const after = result.patchOperations[0].after;
      assert.equal(after.split('前任重逢').length - 1, 1, 'the overlapping head must not appear twice');
      assert.match(after, /林夏推门而入/);
    });
  } finally {
    restore();
  }
});

test('a continuation wrapped in a fresh code fence is unwrapped before stitching', async () => {
  const restore = installTypeScriptLoader();
  try {
    const { runVideoAgent } = require('./agentProvider.ts');
    await withModelReplies([
      { content: HEAD, finish_reason: 'length' },
      { content: `\`\`\`json\n${TAIL}\n\`\`\``, finish_reason: 'stop' }
    ], async () => {
      const result = await runVideoAgent(request());
      assert.match(result.patchOperations[0].after, /林夏推门而入/);
    });
  } finally {
    restore();
  }
});

test('continuation gives up after the configured rounds and names both knobs', async () => {
  const restore = installTypeScriptLoader();
  try {
    const { runVideoAgent } = require('./agentProvider.ts');
    await withModelReplies([{ content: HEAD, finish_reason: 'length' }], async (sent) => {
      await assert.rejects(() => runVideoAgent(request()), (error) => {
        assert.match(error.message, /截断/);
        assert.match(error.message, /AGENT_MODEL_MAX_TOKENS/);
        assert.match(error.message, /AGENT_CONTINUATION_ROUNDS/);
        return true;
      });
      assert.equal(sent.length, 3, 'first call plus two continuation rounds');
    }, { AGENT_CONTINUATION_ROUNDS: '2' });
  } finally {
    restore();
  }
});

test('AGENT_CONTINUATION_ROUNDS=0 restores the plain truncation error', async () => {
  const restore = installTypeScriptLoader();
  try {
    const { runVideoAgent } = require('./agentProvider.ts');
    await withModelReplies([{ content: HEAD, finish_reason: 'length' }], async (sent) => {
      await assert.rejects(() => runVideoAgent(request()), (error) => {
        assert.match(error.message, /截断/);
        assert.doesNotMatch(error.message, /续写/);
        return true;
      });
      assert.equal(sent.length, 1);
    }, { AGENT_CONTINUATION_ROUNDS: '0' });
  } finally {
    restore();
  }
});
