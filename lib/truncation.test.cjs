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
  DEFAULT_PROVIDER: 'custom',
  CUSTOM_API_KEY: 'test-key',
  CUSTOM_BASE_URL: 'http://provider.test/v1',
  OPENAI_API_KEY: undefined,
  ANTHROPIC_API_KEY: undefined
};

function request() {
  return {
    instruction: '小澎的恋爱史三分钟纯中文搞笑短剧',
    workspace: {
      projectId: 'p1', title: 't', mode: 'creator', activeWorkflow: 'script',
      complianceStatus: 'pass', currentTimelineVersion: 1, files: []
    },
    history: []
  };
}

async function withRawModelReply(reply, action) {
  const previousFetch = global.fetch;
  let sentBody = '';
  global.fetch = async (_url, init) => {
    sentBody = String(init.body || '');
    return new Response(JSON.stringify(reply), {
      status: 200, headers: { 'content-type': 'application/json' }
    });
  };
  try {
    return await withEnv(CUSTOM_ENV, () => action(() => sentBody));
  } finally {
    global.fetch = previousFetch;
  }
}

test('a length-capped reply is reported as truncation, not as invalid JSON', async () => {
  const restore = installTypeScriptLoader();
  try {
    const { runVideoAgent } = require('./agentProvider.ts');
    // 半截 JSON + finish_reason=length，正是线上「Model did not return valid JSON」的真实成因。
    await withRawModelReply({
      choices: [{ finish_reason: 'length', message: { content: '{"patchOperations":[{"filePath":"script.md","after":"# 小澎的恋爱史' } }]
    }, async () => {
      await assert.rejects(() => runVideoAgent(request()), (error) => {
        assert.match(error.message, /截断/, 'must name truncation as the cause');
        assert.match(error.message, /AGENT_MODEL_MAX_TOKENS/, 'must tell the user which knob to turn');
        assert.doesNotMatch(error.message, /did not return valid JSON/);
        return true;
      });
    });
  } finally {
    restore();
  }
});

test('an unclosed JSON body is diagnosed as truncation even without finish_reason', async () => {
  const restore = installTypeScriptLoader();
  try {
    const { runVideoAgent } = require('./agentProvider.ts');
    await withRawModelReply({
      choices: [{ message: { content: '{"patchOperations":[{"filePath":"script.md","after":"开头' } }]
    }, async () => {
      await assert.rejects(() => runVideoAgent(request()), (error) => {
        assert.match(error.message, /截断/);
        return true;
      });
    });
  } finally {
    restore();
  }
});

test('an empty reply says so instead of blaming JSON', async () => {
  const restore = installTypeScriptLoader();
  try {
    const { runVideoAgent } = require('./agentProvider.ts');
    await withRawModelReply({ choices: [{ message: { content: '   ' } }] }, async () => {
      await assert.rejects(() => runVideoAgent(request()), (error) => {
        assert.match(error.message, /空内容/);
        return true;
      });
    });
  } finally {
    restore();
  }
});

test('genuine non-JSON output is reported with a readable excerpt', async () => {
  const restore = installTypeScriptLoader();
  try {
    const { runVideoAgent } = require('./agentProvider.ts');
    await withRawModelReply({
      choices: [{ message: { content: '抱歉，我无法完成这个请求。' } }]
    }, async () => {
      await assert.rejects(() => runVideoAgent(request()), (error) => {
        assert.match(error.message, /没有返回合法 JSON/);
        assert.match(error.message, /抱歉/, 'excerpt should show what the model actually said');
        return true;
      });
    });
  } finally {
    restore();
  }
});

test('the custom provider sends an explicit max_tokens instead of inheriting a gateway default', async () => {
  const restore = installTypeScriptLoader();
  try {
    const { runVideoAgent } = require('./agentProvider.ts');
    await withRawModelReply({
      choices: [{ finish_reason: 'stop', message: { content: '{"patchOperations":[]}' } }]
    }, async (sentBody) => {
      await runVideoAgent(request()).catch(() => {});
      const body = JSON.parse(sentBody());
      assert.ok(body.max_tokens > 0, 'max_tokens must be sent explicitly');
      assert.ok(body.max_tokens >= 8000, `default budget must fit a full episode, got ${body.max_tokens}`);
    });
  } finally {
    restore();
  }
});

test('the request timeout leaves headroom above the default token budget', () => {
  // 两者耦合：额度调大而超时不动，就会被自己的超时掐断。
  const source = fs.readFileSync(require('node:path').join(__dirname, 'agentProvider.ts'), 'utf8');
  const timeout = Number(source.match(/AGENT_PROVIDER_TIMEOUT_MS[\s\S]{0,200}?:\s*(\d+);/)?.[1]);
  assert.ok(Number.isFinite(timeout), 'a default timeout must be declared');
  // 慢速中转上一集剧本实测 85s+，低于两倍余量就是在等着再炸一次。
  assert.ok(timeout >= 170000, `default timeout ${timeout}ms is too tight for a full episode`);
});

test('a timeout is reported as a timeout, with the knobs that actually help', async () => {
  const restore = installTypeScriptLoader();
  try {
    const { runVideoAgent } = require('./agentProvider.ts');
    const previousFetch = global.fetch;
    global.fetch = async (_url, init) => {
      // 模拟上游挂起：直到调用方 abort 才 reject。
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          const error = new Error('This operation was aborted');
          error.name = 'AbortError';
          reject(error);
        });
      });
    };
    try {
      await withEnv({ ...CUSTOM_ENV, AGENT_PROVIDER_TIMEOUT_MS: '60' }, async () => {
        await assert.rejects(() => runVideoAgent(request()), (error) => {
          assert.match(error.message, /超时/);
          assert.match(error.message, /AGENT_PROVIDER_TIMEOUT_MS/);
          assert.match(error.message, /AGENT_MODEL_MAX_TOKENS/);
          return true;
        });
      });
    } finally {
      global.fetch = previousFetch;
    }
  } finally {
    restore();
  }
});

test('AGENT_MODEL_MAX_TOKENS overrides the default budget', async () => {
  const restore = installTypeScriptLoader();
  try {
    const { runVideoAgent } = require('./agentProvider.ts');
    await withEnv({ AGENT_MODEL_MAX_TOKENS: '12345' }, async () => {
      await withRawModelReply({
        choices: [{ finish_reason: 'stop', message: { content: '{"patchOperations":[]}' } }]
      }, async (sentBody) => {
        await runVideoAgent(request()).catch(() => {});
        assert.equal(JSON.parse(sentBody()).max_tokens, 12345);
      });
    });
  } finally {
    restore();
  }
});
