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
  DEFAULT_PROVIDER: 'custom',
  CUSTOM_API_KEY: 'test-key',
  CUSTOM_BASE_URL: 'http://provider.test/v1',
  OPENAI_API_KEY: undefined,
  ANTHROPIC_API_KEY: undefined
};

function request() {
  return {
    instruction: '从脚本生成角色设定',
    workspace: {
      projectId: 'p1', title: 't', mode: 'creator', activeWorkflow: 'script',
      complianceStatus: 'pass', currentTimelineVersion: 1, files: []
    },
    history: []
  };
}

/** 按顺序回放多轮模型回复，并记录每一轮实际发出去的 body。 */
async function withModelReplies(contents, action, envOverrides = {}) {
  const previousFetch = global.fetch;
  const sent = [];
  global.fetch = async (_url, init) => {
    sent.push(JSON.parse(String(init.body || '{}')));
    const content = contents[Math.min(sent.length - 1, contents.length - 1)];
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content } }] }), {
      status: 200, headers: { 'content-type': 'application/json' }
    });
  };
  try {
    return await withEnv({ ...CUSTOM_ENV, ...envOverrides }, () => action(sent));
  } finally {
    global.fetch = previousFetch;
  }
}

const GOOD_BODY = '"assistantMessage":"已生成角色","plan":["解析脚本"],"patchOperations":[]';

test('a fenced reply whose strings contain raw newlines is salvaged locally', async () => {
  const restore = installTypeScriptLoader();
  try {
    const { runVideoAgent } = require('./agentProvider.ts');
    // 弱模型把整段 Markdown 塞进 after，裸换行没转义——线上最常见的坏 JSON 形态。
    const broken = '```json\n{"assistantMessage":"已生成角色","patchOperations":[{"filePath":"characters.json","after":"# 林夏\n28 岁","summary":"写入角色"}]}\n```';
    await withModelReplies([broken], async (sent) => {
      const result = await runVideoAgent(request());
      assert.equal(result.assistantMessage, '已生成角色');
      assert.equal(result.patchOperations[0].after, '# 林夏\n28 岁', 'salvage must not lose the newline');
      assert.equal(sent.length, 1, 'a local fix must not cost an extra model call');
    });
  } finally {
    restore();
  }
});

test('a trailing comma is salvaged locally', async () => {
  const restore = installTypeScriptLoader();
  try {
    const { runVideoAgent } = require('./agentProvider.ts');
    await withModelReplies([`{${GOOD_BODY},}`], async (sent) => {
      const result = await runVideoAgent(request());
      assert.equal(result.assistantMessage, '已生成角色');
      assert.equal(sent.length, 1);
    });
  } finally {
    restore();
  }
});

test('syntax the local pass cannot fix costs exactly one repair call', async () => {
  const restore = installTypeScriptLoader();
  try {
    const { runVideoAgent } = require('./agentProvider.ts');
    const broken = '{"assistantMessage" "已生成角色","plan":["解析脚本"]}';
    await withModelReplies([broken, `{${GOOD_BODY}}`], async (sent) => {
      const result = await runVideoAgent(request());
      assert.equal(result.assistantMessage, '已生成角色');
      assert.equal(sent.length, 2, 'exactly one repair round-trip');
      const repairPrompt = sent[1].messages.at(-1).content;
      assert.ok(repairPrompt.includes(broken), 'the repair call must carry the broken text');
      assert.match(repairPrompt, /JSON/);
    });
  } finally {
    restore();
  }
});

test('a truncated body never spends a repair call', async () => {
  const restore = installTypeScriptLoader();
  try {
    const { runVideoAgent } = require('./agentProvider.ts');
    // 嵌套对象已经闭合，结尾就是 }，光看「最后一个 }」会误判成格式错误。
    const truncated = '{"assistantMessage":"已生成角色","patchOperations":[{"filePath":"characters.json","after":"# 林夏"}';
    await withModelReplies([truncated], async (sent) => {
      await assert.rejects(() => runVideoAgent(request()), (error) => {
        assert.match(error.message, /截断/);
        assert.match(error.message, /AGENT_MODEL_MAX_TOKENS/);
        return true;
      });
      assert.equal(sent.length, 1, 'truncation is not a syntax problem — do not pay for a repair');
    });
  } finally {
    restore();
  }
});

test('an unrepairable reply reports the parser position, not just the first 160 chars', async () => {
  const restore = installTypeScriptLoader();
  try {
    const { runVideoAgent } = require('./agentProvider.ts');
    const broken = '{"assistantMessage" "已生成角色","plan":["解析脚本"]}';
    await withModelReplies([broken, '还是修不好'], async (sent) => {
      await assert.rejects(() => runVideoAgent(request()), (error) => {
        assert.match(error.message, /解析器报错/);
        assert.match(error.message, /解析在这里失败/, 'must point at where parsing broke');
        assert.match(error.message, /重修/, 'must say the repair round already happened');
        return true;
      });
      assert.equal(sent.length, 2);
    });
  } finally {
    restore();
  }
});

test('AGENT_JSON_REPAIR=0 keeps the repair call off', async () => {
  const restore = installTypeScriptLoader();
  try {
    const { runVideoAgent } = require('./agentProvider.ts');
    await withModelReplies(['{"assistantMessage" "x"}'], async (sent) => {
      await assert.rejects(() => runVideoAgent(request()), /没有返回合法 JSON/);
      assert.equal(sent.length, 1);
    }, { AGENT_JSON_REPAIR: '0' });
  } finally {
    restore();
  }
});
