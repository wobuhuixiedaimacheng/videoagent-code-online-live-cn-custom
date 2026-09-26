const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

// route.ts 会 import lib/videoFrameSize.ts，而 require 默认解析不了 .ts。
// 和 lib/stageGeneration.test.cjs 用的是同一套装卸逻辑。
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

function loadRoute() {
  const restore = installTypeScriptLoader();
  try {
    const routePath = path.join(__dirname, 'route.ts');
    const source = fs.readFileSync(routePath, 'utf8');
    const compiled = ts.transpileModule(source, {
      compilerOptions: {
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022
      }
    }).outputText;
    const module = { exports: {} };
    const context = {
      URL,
      Request,
      Response,
      console,
      exports: module.exports,
      module,
      process,
      require,
      fetch: (...args) => global.__videoRouteFetch(...args)
    };
    vm.runInNewContext(compiled, context, { filename: routePath });
    return module.exports;
  } finally {
    restore();
  }
}

async function withEnv(patch, fn) {
  const keys = Object.keys(patch);
  const previous = new Map(keys.map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    await fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('POST submits a video task to the configured Agnes video endpoint', async () => {
  const { POST } = loadRoute();
  let upstreamRequest;
  global.__videoRouteFetch = async (url, init) => {
    upstreamRequest = {
      url: String(url),
      authorization: init.headers.authorization,
      body: JSON.parse(init.body)
    };
    return new Response(JSON.stringify({ task_id: 'task_1', video_id: 'video_1', status: 'queued', progress: 0 }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  await withEnv(
    {
      VIDEO_API_KEY: 'video-key',
      VIDEO_BASE_URL: 'https://apihub.agnes-ai.com/v1',
      VIDEO_MODEL: 'agnes-video-v2.0'
    },
    async () => {
      const response = await POST(
        new Request('http://localhost/api/video/render', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            prompt: '小彭抬头看到她，镜头缓慢推进',
            negativePrompt: '不要畸形手指',
            spec: { aspectRatio: '9:16', resolutionTier: '720p', numFrames: 121, frameRate: 24 }
          })
        })
      );
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.equal(body.video_id, 'video_1');
    }
  );

  assert.equal(upstreamRequest.url, 'https://apihub.agnes-ai.com/v1/videos');
  assert.equal(upstreamRequest.authorization, 'Bearer video-key');
  assert.equal(upstreamRequest.body.model, 'agnes-video-v2.0');
  assert.equal(upstreamRequest.body.prompt, '小彭抬头看到她，镜头缓慢推进');
  assert.equal(upstreamRequest.body.negative_prompt, '不要畸形手指');
  assert.equal(upstreamRequest.body.width, 720);
  assert.equal(upstreamRequest.body.height, 1280);
  assert.equal(upstreamRequest.body.num_frames, 121);
  assert.equal(upstreamRequest.body.frame_rate, 24);
});

test('POST passes Agnes image-to-video and keyframe controls to the upstream request', async () => {
  const { POST } = loadRoute();
  const upstreamBodies = [];
  global.__videoRouteFetch = async (url, init) => {
    upstreamBodies.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ task_id: 'task_ref', video_id: 'video_ref', status: 'queued', progress: 0 }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  await withEnv(
    {
      VIDEO_API_KEY: 'video-key',
      VIDEO_BASE_URL: 'https://apihub.agnes-ai.com/v1',
      VIDEO_MODEL: 'agnes-video-v2.0'
    },
    async () => {
      const imageResponse = await POST(
        new Request('http://localhost/api/video/render', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            prompt: '让参考图里的小澎自然转头，保持脸型和服装一致',
            image: 'https://cdn.example/xiaopeng-primary.png',
            mode: 'ti2vid',
            spec: { aspectRatio: '9:16', resolutionTier: '720p', numFrames: 121, frameRate: 24 }
          })
        })
      );
      assert.equal(imageResponse.status, 200);

      const keyframeResponse = await POST(
        new Request('http://localhost/api/video/render', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            prompt: '在两张参考图之间做自然转场，保持小澎身份一致',
            keyframes: ['https://cdn.example/xiaopeng-highschool-1.png', 'https://cdn.example/xiaopeng-highschool-2.png'],
            mode: 'keyframes',
            spec: { aspectRatio: '9:16', resolutionTier: '720p', numFrames: 121, frameRate: 24 }
          })
        })
      );
      assert.equal(keyframeResponse.status, 200);
    }
  );

  assert.equal(upstreamBodies[0].image, 'https://cdn.example/xiaopeng-primary.png');
  assert.equal(upstreamBodies[0].mode, 'ti2vid');
  assert.equal(upstreamBodies[0].extra_body, undefined);
  assert.deepEqual(upstreamBodies[1].extra_body, {
    image: ['https://cdn.example/xiaopeng-highschool-1.png', 'https://cdn.example/xiaopeng-highschool-2.png'],
    mode: 'keyframes'
  });
  assert.equal(upstreamBodies[1].image, undefined);
});

test('POST 时长超帧数上限时截时长保帧率，并回报截到几秒', async () => {
  const { POST } = loadRoute();
  let upstreamRequest;
  global.__videoRouteFetch = async (url, init) => {
    upstreamRequest = {
      url: String(url),
      body: JSON.parse(init.body)
    };
    return new Response(JSON.stringify({ task_id: 'task_long', video_id: 'video_long', status: 'queued', progress: 0 }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  await withEnv(
    {
      VIDEO_API_KEY: 'video-key',
      VIDEO_BASE_URL: 'https://apihub.agnes-ai.com/v1',
      VIDEO_MODEL: 'agnes-video-v2.0'
    },
    async () => {
      const response = await POST(
        new Request('http://localhost/api/video/render', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            prompt: '生成 30 秒中文短视频',
            spec: { targetDurationSeconds: 30, numFrames: 720, frameRate: 24 }
          })
        })
      );

      assert.equal(response.status, 200);
      // 旧行为是保住 30 秒、把帧率压到 13.6fps，成片肉眼可见地卡且无人知情。
      // 现在保 24fps，时长截到这一档能装下的 409 帧≈17 秒，并把这个数字回报给调用方。
      assert.equal((await response.json()).cappedDurationSeconds, 17);
    }
  );

  assert.equal(upstreamRequest.url, 'https://apihub.agnes-ai.com/v1/videos');
  assert.equal(upstreamRequest.body.num_frames, 409);
  assert.equal(upstreamRequest.body.frame_rate, 24);
});

test('POST keeps the first-version 720p segment at 15 seconds and 24fps', async () => {
  const { POST } = loadRoute();
  let upstreamRequest;
  global.__videoRouteFetch = async (url, init) => {
    upstreamRequest = {
      url: String(url),
      body: JSON.parse(init.body)
    };
    return new Response(JSON.stringify({ task_id: 'task_segment', video_id: 'video_segment', status: 'queued', progress: 0 }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  await withEnv(
    {
      VIDEO_API_KEY: 'video-key',
      VIDEO_BASE_URL: 'https://apihub.agnes-ai.com/v1',
      VIDEO_MODEL: 'agnes-video-v2.0'
    },
    async () => {
      const response = await POST(
        new Request('http://localhost/api/video/render', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            prompt: '生成当前 15 秒小节',
            spec: { aspectRatio: '9:16', resolutionTier: '720p', targetDurationSeconds: 15, numFrames: 361, frameRate: 24 }
          })
        })
      );

      assert.equal(response.status, 200);
    }
  );

  assert.equal(upstreamRequest.body.width, 720);
  assert.equal(upstreamRequest.body.height, 1280);
  assert.equal(upstreamRequest.body.num_frames, 361);
  assert.equal(upstreamRequest.body.frame_rate, 24);
});

test('POST caps 1080p segments to the provider frame limit before calling upstream', async () => {
  const { POST } = loadRoute();
  let upstreamRequest;
  global.__videoRouteFetch = async (url, init) => {
    upstreamRequest = {
      url: String(url),
      body: JSON.parse(init.body)
    };
    return new Response(JSON.stringify({ task_id: 'task_1080', video_id: 'video_1080', status: 'queued', progress: 0 }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  await withEnv(
    {
      VIDEO_API_KEY: 'video-key',
      VIDEO_BASE_URL: 'https://apihub.agnes-ai.com/v1',
      VIDEO_MODEL: 'agnes-video-v2.0'
    },
    async () => {
      const response = await POST(
        new Request('http://localhost/api/video/render', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            prompt: '生成 15 秒 1080p 小节',
            spec: { aspectRatio: '9:16', resolutionTier: '1080p', targetDurationSeconds: 15, numFrames: 361, frameRate: 24 }
          })
        })
      );

      assert.equal(response.status, 200);
    }
  );

  assert.equal(upstreamRequest.body.width, 1080);
  assert.equal(upstreamRequest.body.height, 1920);
  assert.equal(upstreamRequest.body.num_frames, 169);
  // 1080p 只装得下 169 帧。保帧率截时长：24fps 下就是约 7 秒，而不是把帧率压到 11.3。
  assert.equal(upstreamRequest.body.frame_rate, 24);
});

test('GET retrieves video result by video_id without leaking API keys', async () => {
  const { GET } = loadRoute();
  let upstreamRequest;
  global.__videoRouteFetch = async (url, init) => {
    upstreamRequest = {
      url: String(url),
      authorization: init.headers.authorization
    };
    return new Response(JSON.stringify({ id: 'video_1', status: 'completed', progress: 100, remixed_from_video_id: 'https://cdn.example/video.mp4' }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  await withEnv(
    {
      VIDEO_API_KEY: 'video-key',
      VIDEO_BASE_URL: 'https://apihub.agnes-ai.com/v1',
      VIDEO_MODEL: 'agnes-video-v2.0'
    },
    async () => {
      const response = await GET(new Request('http://localhost/api/video/render?video_id=video_1'));
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.equal(body.video_id, 'video_1');
      assert.equal(body.videoUrl, 'https://cdn.example/video.mp4');
      assert.equal(JSON.stringify(body).includes('video-key'), false);
    }
  );

  assert.equal(upstreamRequest.url, 'https://apihub.agnes-ai.com/agnesapi?video_id=video_1&model_name=agnes-video-v2.0');
  assert.equal(upstreamRequest.authorization, 'Bearer video-key');
});

test('GET normalizes provider terminal aliases and fails completed responses without a video URL', async () => {
  const { GET } = loadRoute();
  const successAliases = ['completed', 'succeeded', 'success', 'done'];
  const failureAliases = ['failed', 'failure', 'error', 'rejected', 'cancelled', 'canceled', 'aborted'];
  let payload = {};
  global.__videoRouteFetch = async () => new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });

  await withEnv(
    {
      VIDEO_API_KEY: 'video-key',
      VIDEO_BASE_URL: 'https://apihub.agnes-ai.com/v1',
      VIDEO_MODEL: 'agnes-video-v2.0'
    },
    async () => {
      for (const status of successAliases) {
        payload = { id: `video-${status}`, status, video_url: `https://cdn.example/${status}.mp4` };
        const response = await GET(new Request('http://localhost/api/video/render?video_id=test'));
        const body = await response.json();
        assert.equal(body.status, 'completed');
        assert.equal(body.videoUrl, payload.video_url);

        payload = { id: `video-${status}`, status };
        const missingUrlResponse = await GET(new Request('http://localhost/api/video/render?video_id=test'));
        const missingUrlBody = await missingUrlResponse.json();
        assert.equal(missingUrlBody.status, 'failed');
        assert.match(missingUrlBody.error, /video URL/i);
      }

      for (const status of failureAliases) {
        payload = { id: `video-${status}`, status, error: 'provider failed' };
        const response = await GET(new Request('http://localhost/api/video/render?video_id=test'));
        const body = await response.json();
        assert.equal(body.status, 'failed');
      }
    }
  );
});

test('POST returns a clear configuration error when video API key is missing', async () => {
  const { POST } = loadRoute();
  await withEnv(
    {
      VIDEO_API_KEY: undefined,
      CUSTOM_API_KEY: undefined
    },
    async () => {
      const response = await POST(
        new Request('http://localhost/api/video/render', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ prompt: '测试视频' })
        })
      );
      const body = await response.json();

      assert.equal(response.status, 400);
      assert.match(body.error, /VIDEO_API_KEY/);
    }
  );
});

test('POST 认不出的画幅直接 400，不再静默回落成 9:16', async () => {
  const { POST } = loadRoute();
  global.__videoRouteFetch = async () => {
    throw new Error('画幅非法时不应该发出上游请求');
  };

  await withEnv({ VIDEO_API_KEY: 'video-key' }, async () => {
    const response = await POST(
      new Request('http://localhost/api/video/render', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: '测试', spec: { aspectRatio: '21:9', resolutionTier: '720p' } })
      })
    );
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.match(body.error, /21:9/);
    // 真实事故：规格面板选 4:3，渲出来是竖屏，用户以为是模型的问题。
    assert.match(body.error, /9:16/);
  });
});

test('POST 支持 UI 下拉框里提供的 4:3 和 3:4，不再和后端对不上', async () => {
  const { POST } = loadRoute();
  const seen = [];
  global.__videoRouteFetch = async (url, init) => {
    seen.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ video_id: 'v', status: 'queued' }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  await withEnv({ VIDEO_API_KEY: 'video-key' }, async () => {
    for (const aspectRatio of ['4:3', '3:4']) {
      const response = await POST(
        new Request('http://localhost/api/video/render', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ prompt: '测试', spec: { aspectRatio, resolutionTier: '720p' } })
        })
      );
      assert.equal(response.status, 200);
    }
  });

  assert.deepEqual(seen.map((body) => [body.width, body.height]), [[960, 720], [720, 960]]);
});

test('身份参考图走独立字段，不混进关键帧', async () => {
  const { POST } = loadRoute();
  let upstreamBody;
  global.__videoRouteFetch = async (_url, init) => {
    upstreamBody = JSON.parse(init.body);
    return new Response(JSON.stringify({ video_id: 'video_id_ref', status: 'queued' }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  await withEnv(
    { VIDEO_API_KEY: 'video-key', VIDEO_BASE_URL: 'https://apihub.agnes-ai.com/v1', VIDEO_MODEL: 'agnes-video-v2.0' },
    async () => {
      const response = await POST(new Request('http://localhost/api/video/render', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prompt: '她抬头',
          image: 'https://img/scene.png',
          identityImages: ['https://img/face-a.png', 'https://img/face-b.png'],
          spec: { aspectRatio: '9:16', resolutionTier: '720p' }
        })
      }));
      const body = await response.json();
      assert.equal(response.status, 200);
      // 没有降级就不该有那句提示——它出现就意味着锁脸这一层没生效。
      assert.equal(body.identityReferenceNote, undefined);
    }
  );

  // 构图图仍然是首帧，人脸图挂在独立的键上：混在一起会被当成三帧关键帧序列，
  // 视频就成了从场景渐变到人脸特写。
  assert.equal(upstreamBody.image, 'https://img/scene.png');
  assert.deepEqual(upstreamBody.extra_body.reference_images, ['https://img/face-a.png', 'https://img/face-b.png']);
});

test('上游不认身份参考图字段时自动去掉重发，并把降级说出来', async () => {
  const { POST } = loadRoute();
  const sent = [];
  global.__videoRouteFetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    sent.push(body);
    if (body.extra_body?.reference_images) {
      return new Response(JSON.stringify({ error: 'unknown field: reference_images' }), { status: 400 });
    }
    return new Response(JSON.stringify({ video_id: 'video_retry', status: 'queued' }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  await withEnv(
    { VIDEO_API_KEY: 'video-key', VIDEO_BASE_URL: 'https://apihub.agnes-ai.com/v1', VIDEO_MODEL: 'agnes-video-v2.0' },
    async () => {
      const response = await POST(new Request('http://localhost/api/video/render', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prompt: '她抬头',
          image: 'https://img/scene.png',
          identityImages: ['https://img/face-a.png'],
          spec: { aspectRatio: '9:16', resolutionTier: '720p' }
        })
      }));
      const body = await response.json();
      // 猜错字段名的代价必须是「锁脸没生效」，而不是「这一镜渲染失败」。
      assert.equal(response.status, 200);
      assert.equal(body.video_id, 'video_retry');
      assert.match(body.identityReferenceNote, /不接受身份参考图字段/);
      assert.match(body.identityReferenceNote, /VIDEO_IDENTITY_REFERENCE_FIELD/);
    }
  );

  assert.equal(sent.length, 2);
  // 重发时只去掉身份参考图，构图图和其它参数原样保留。
  assert.equal(sent[1].extra_body, undefined);
  assert.equal(sent[1].image, 'https://img/scene.png');
});

test('身份参考图之外的 400 不重发，避免白烧一次调用', async () => {
  const { POST } = loadRoute();
  let calls = 0;
  global.__videoRouteFetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ error: '提示词包含不允许的内容' }), { status: 400 });
  };

  await withEnv(
    { VIDEO_API_KEY: 'video-key', VIDEO_BASE_URL: 'https://apihub.agnes-ai.com/v1', VIDEO_MODEL: 'agnes-video-v2.0' },
    async () => {
      const response = await POST(new Request('http://localhost/api/video/render', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prompt: '她抬头',
          identityImages: ['https://img/face-a.png'],
          spec: { aspectRatio: '9:16', resolutionTier: '720p' }
        })
      }));
      assert.equal(response.status, 400);
      assert.match((await response.json()).error, /不允许的内容/);
    }
  );

  assert.equal(calls, 1);
});

test('身份参考图字段名可以用环境变量改', async () => {
  const { POST } = loadRoute();
  let upstreamBody;
  global.__videoRouteFetch = async (_url, init) => {
    upstreamBody = JSON.parse(init.body);
    return new Response(JSON.stringify({ video_id: 'v', status: 'queued' }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  await withEnv(
    {
      VIDEO_API_KEY: 'video-key',
      VIDEO_BASE_URL: 'https://apihub.agnes-ai.com/v1',
      VIDEO_MODEL: 'agnes-video-v2.0',
      VIDEO_IDENTITY_REFERENCE_FIELD: 'subject_reference'
    },
    async () => {
      await POST(new Request('http://localhost/api/video/render', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prompt: '她抬头',
          image: 'https://img/scene.png',
          identityImages: ['https://img/face-a.png'],
          spec: { aspectRatio: '9:16', resolutionTier: '720p' }
        })
      }));
    }
  );

  assert.deepEqual(upstreamBody.extra_body.subject_reference, ['https://img/face-a.png']);
  assert.equal(upstreamBody.extra_body.reference_images, undefined);
});
