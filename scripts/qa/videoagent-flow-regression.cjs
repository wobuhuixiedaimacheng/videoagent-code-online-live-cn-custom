const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs/promises');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const DEFAULT_URL = process.env.QA_BASE_URL || 'http://localhost:3000';
const CHROME =
  process.env.CHROME_PATH ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEMO_ID = 'xiaopeng-v2';
const DEMO_STORAGE_KEY = 'videoagent-demo-workspace:xiaopeng-v2:progressive-v1';
const LEGACY_SCRIPT_MARKER = '旧脚本占位内容不得复活';
const CURRENT_SCRIPT_MARKER = '本轮合法脚本结果';
const LEGACY_SEED_SESSION_KEY = '__videoagent_qa_legacy_script_seeded__';
const FIXTURE_PATH = path.join(
  process.cwd(),
  'outputs',
  'xiaopeng-love-history-3min-v2',
  'workspace.json'
);
const STAGE_FIXTURE_FILES = {
  character: 'characters.json',
  scene: 'scenes.json',
  storyboard: 'storyboard.json',
  video: 'asset_prompts.json'
};
const STAGE_TABS = ['剧本', '角色', '场景', '分镜', '视频'];
const STAGE_SEQUENCE = ['character', 'scene', 'storyboard', 'video'];
const STAGE_CTA = {
  character: '确认脚本，交给角色设计师',
  scene: '确认角色，交给场景设计师',
  storyboard: '确认场景，交给分镜师',
  video: '确认分镜，交给视频导演'
};
const FINAL_VIDEO_CTA = '确认视频任务并开始生成';

function parseArgs(argv) {
  const args = { url: DEFAULT_URL, outDir: 'outputs/qa-progressive-flow', headed: false };
  for (let index = 2; index < argv.length; index += 1) {
    if (argv[index] === '--url') args.url = argv[++index];
    else if (argv[index] === '--out') args.outDir = argv[++index];
    else if (argv[index] === '--headed') args.headed = true;
  }
  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function waitForJson(url, timeoutMs = 15000) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(200);
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

class CdpClient {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.console = [];
    this.exceptions = [];
    this.failedRequests = [];
    this.requestUrls = new Map();

    ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      const key = `${message.sessionId || ''}:${message.id || ''}`;
      if (message.id && this.pending.has(key)) {
        const pending = this.pending.get(key);
        this.pending.delete(key);
        if (message.error) pending.reject(new Error(JSON.stringify(message.error)));
        else pending.resolve(message.result || {});
        return;
      }

      if (message.method === 'Runtime.consoleAPICalled') {
        this.console.push({
          type: message.params.type,
          text: (message.params.args || [])
            .map((arg) => arg.value ?? arg.description ?? '')
            .join(' ')
        });
      }
      if (message.method === 'Runtime.exceptionThrown') {
        this.exceptions.push(
          message.params.exceptionDetails?.exception?.description ||
          message.params.exceptionDetails?.text ||
          'Runtime exception'
        );
      }
      if (message.method === 'Log.entryAdded') {
        this.console.push({ type: message.params.entry.level, text: message.params.entry.text });
      }
      if (message.method === 'Network.requestWillBeSent') {
        this.requestUrls.set(message.params.requestId, message.params.request.url);
      }
      if (message.method === 'Network.loadingFailed') {
        this.failedRequests.push({
          url: this.requestUrls.get(message.params.requestId) || '',
          type: message.params.type,
          errorText: message.params.errorText,
          canceled: Boolean(message.params.canceled)
        });
      }
    });
  }

  send(method, params = {}, sessionId = '') {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      const key = `${sessionId || ''}:${id}`;
      const timer = setTimeout(() => {
        if (!this.pending.has(key)) return;
        this.pending.delete(key);
        reject(new Error(`CDP timeout: ${method}`));
      }, 30000);
      this.pending.set(key, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        }
      });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  close() {
    this.ws.close();
  }
}

async function connectBrowser(port) {
  const version = await waitForJson(`http://127.0.0.1:${port}/json/version`);
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  return new CdpClient(ws);
}

function functionExpression(fn, args) {
  return `(${fn.toString()})(${args.map((arg) => JSON.stringify(arg)).join(',')})`;
}

async function evaluate(cdp, sessionId, expression) {
  const result = await cdp.send(
    'Runtime.evaluate',
    { expression, returnByValue: true, awaitPromise: true },
    sessionId
  );
  if (result.exceptionDetails) {
    throw new Error(
      result.exceptionDetails.exception?.description ||
      result.exceptionDetails.text ||
      'Runtime evaluation failed'
    );
  }
  return result.result?.value;
}

async function callInPage(cdp, sessionId, fn, ...args) {
  return evaluate(cdp, sessionId, functionExpression(fn, args));
}

async function waitForPage(cdp, sessionId, fn, args, timeoutMs, label) {
  const startedAt = Date.now();
  let lastValue;
  while (Date.now() - startedAt < timeoutMs) {
    lastValue = await callInPage(cdp, sessionId, fn, ...args);
    if (lastValue) return lastValue;
    await sleep(200);
  }
  throw new Error(`Timed out waiting for ${label}; last value: ${JSON.stringify(lastValue)}`);
}

async function setViewport(cdp, sessionId, width, height, mobile) {
  await cdp.send(
    'Emulation.setDeviceMetricsOverride',
    {
      width,
      height,
      deviceScaleFactor: 1,
      mobile,
      screenWidth: width,
      screenHeight: height
    },
    sessionId
  );
}

async function screenshot(cdp, sessionId, filePath) {
  const result = await cdp.send(
    'Page.captureScreenshot',
    { format: 'png', fromSurface: true, captureBeyondViewport: false },
    sessionId
  );
  await fs.writeFile(filePath, Buffer.from(result.data, 'base64'));
}

async function pngDimensions(filePath) {
  const bytes = await fs.readFile(filePath);
  assert.equal(bytes.toString('ascii', 1, 4), 'PNG', `${filePath} 不是 PNG`);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

async function stopChrome(chrome) {
  if (!chrome || chrome.exitCode !== null) return;
  const exited = new Promise((resolve) => chrome.once('exit', resolve));
  chrome.kill('SIGTERM');
  await Promise.race([exited, sleep(2000)]);
  if (chrome.exitCode === null) {
    chrome.kill('SIGKILL');
    await Promise.race([exited, sleep(1000)]);
  }
}

function requiredFile(workspace, filePath) {
  const file = workspace.files.find((item) => item.path === filePath);
  assert.ok(file, `fixture 缺少 ${filePath}`);
  return file;
}

async function loadFixtures() {
  const workspace = JSON.parse(await fs.readFile(FIXTURE_PATH, 'utf8'));
  const files = new Map(workspace.files.map((file) => [file.path, file.content]));
  for (const filePath of ['script.md', ...Object.values(STAGE_FIXTURE_FILES), 'production_flow.json']) {
    requiredFile(workspace, filePath);
  }

  const characters = JSON.parse(files.get('characters.json'));
  const scenes = JSON.parse(files.get('scenes.json'));
  const storyboard = JSON.parse(files.get('storyboard.json'));
  const prompts = JSON.parse(files.get('asset_prompts.json'));
  const flow = JSON.parse(files.get('production_flow.json'));
  const xiaopeng = characters.characters.find((item) => item.id === 'xiaopeng');

  assert.equal(flow.stages.script.status, 'ready_for_review');
  for (const stage of STAGE_SEQUENCE) assert.equal(flow.stages[stage].status, 'locked');
  assert.ok(xiaopeng, 'characters.json 缺少 xiaopeng');
  assert.equal(xiaopeng.variants.length, 5, 'xiaopeng 必须有 5 个年龄选项');
  assert.equal(xiaopeng.expressionIds.length, 12, 'xiaopeng 必须有 12 个表情选项');
  assert.ok(xiaopeng.variants.every((item) => item.primaryImageUrl), 'xiaopeng 年龄主图必须齐全');
  assert.equal(scenes.scenes.length, 12, 'scenes.json 必须有 12 个场景');
  assert.ok(
    scenes.scenes.every((item) => item.location && item.timeOfDay && item.lighting && item.characterIds?.length),
    '场景 fixture 的地点、时间、光线、出场角色必须齐全'
  );
  assert.equal(storyboard.scenes.length, 12, 'storyboard.json 必须有 12 个分镜');
  assert.ok(
    storyboard.scenes.every((item) =>
      item.scriptSegment &&
      item.characterIds?.length &&
      item.sceneId &&
      item.shotSize &&
      item.cameraMove &&
      item.action &&
      item.dialogue &&
      (item.firstFrameReference || item.referenceImageUrl)
    ),
    '分镜 fixture 的审查字段必须齐全'
  );
  const videoPrompts = prompts.prompts.filter((item) => item.type === 'video' && item.prompt?.trim());
  assert.equal(videoPrompts.length, 12, 'asset_prompts.json 必须有 12 个视频任务');
  assert.ok(videoPrompts.every((item) => item.referenceImageUrl || item.referenceImages?.length));

  const legalCampaignGoal = {
    goal: '让观众完整看完小澎十二段校园恋爱故事并收藏这条短剧',
    audience: '喜欢校园回忆、轻喜剧和短剧反转的中文观众',
    platform: '小红书'
  };
  const legalCampaignGoalContent = JSON.stringify(legalCampaignGoal, null, 2);
  const workspaceWithCampaignGoal = {
    ...workspace,
    files: [
      ...workspace.files,
      {
        path: 'campaign_goal.json',
        kind: 'json',
        content: legalCampaignGoalContent,
        version: 1,
        updatedAt: '2026-07-12T00:00:00.000Z'
      }
    ]
  };
  const legalScript = `${files.get('script.md')}\n\n${CURRENT_SCRIPT_MARKER}：小澎十二段校园恋爱故事已完整生成。`;
  const legacyJobId = 'qa-legacy-script-job';
  const legacyFlow = JSON.parse(JSON.stringify(flow));
  legacyFlow.currentStage = 'script';
  legacyFlow.stages.script = {
    ...legacyFlow.stages.script,
    status: 'ready_for_review',
    draftVersion: 1,
    confirmedVersion: null,
    confirmedAt: null,
    confirmedBy: null,
    confirmationKey: null,
    generationJobId: legacyJobId,
    sourceVersions: {},
    error: null
  };
  for (const stage of STAGE_SEQUENCE) {
    legacyFlow.stages[stage] = {
      ...legacyFlow.stages[stage],
      status: 'locked',
      draftVersion: null,
      confirmedVersion: null,
      confirmedAt: null,
      confirmedBy: null,
      confirmationKey: null,
      generationJobId: null,
      sourceVersions: {},
      error: null
    };
  }
  const legacyPendingPatches = [
    {
      id: 'qa-legacy-brief',
      filePath: 'brief.json',
      summary: '旧任务占位 Brief',
      before: '',
      after: JSON.stringify({
        topic: '[旧项目主题占位]',
        audience: '[旧目标受众占位]',
        offer: '[旧核心卖点占位]'
      }, null, 2),
      riskLevel: 'low',
      requiresApproval: true,
      origin: { kind: 'agent_stage', productionStage: 'script', generationJobId: legacyJobId }
    },
    {
      id: 'qa-legacy-campaign',
      filePath: 'campaign_goal.json',
      summary: '旧任务占位 Campaign Goal',
      before: '',
      after: JSON.stringify({
        goal: '[旧行动目标占位]',
        audience: '[旧目标受众占位]',
        platform: '[旧平台占位]'
      }, null, 2),
      riskLevel: 'low',
      requiresApproval: true,
      origin: { kind: 'agent_stage', productionStage: 'script', generationJobId: legacyJobId }
    },
    {
      id: 'qa-legacy-script',
      filePath: 'script.md',
      summary: '旧任务占位脚本',
      before: '',
      after: `# [旧项目主题占位]\n\n${LEGACY_SCRIPT_MARKER}\n\n## 场景 1\n\n- 口播：[旧痛点占位]\n- 字幕：[旧解决方案占位]`,
      riskLevel: 'low',
      requiresApproval: true,
      origin: { kind: 'agent_stage', productionStage: 'script', generationJobId: legacyJobId }
    }
  ];
  const memoryFile = requiredFile(workspace, '.aigc/MEMORY.md');
  const flowFile = requiredFile(workspace, 'production_flow.json');
  const legacyWorkspace = {
    ...workspace,
    title: 'QA 空白任务',
    files: [
      { ...memoryFile, content: '# QA 空白工作区\n\n业务内容只允许来自当前生成结果。' },
      { ...flowFile, content: JSON.stringify(legacyFlow, null, 2) },
      {
        path: '.aigc/pending_patches.json',
        kind: 'json',
        content: JSON.stringify(legacyPendingPatches, null, 2),
        version: 1,
        updatedAt: '2026-07-12T00:00:00.000Z'
      }
    ]
  };

  return {
    workspace: workspaceWithCampaignGoal,
    files,
    legacyWorkspace,
    injectionFixtures: {
      script: {
        files: [
          { filePath: 'brief.json', content: files.get('brief.json') },
          { filePath: 'campaign_goal.json', content: legalCampaignGoalContent },
          { filePath: 'script.md', content: legalScript }
        ]
      },
      ...Object.fromEntries(
        Object.entries(STAGE_FIXTURE_FILES).map(([stage, filePath]) => [
          stage,
          { filePath, content: files.get(filePath) }
        ])
      )
    },
    summary: {
      scriptLength: files.get('script.md').length,
      characterCount: characters.characters.length,
      xiaopengVariantCount: xiaopeng.variants.length,
      xiaopengExpressionCount: xiaopeng.expressionIds.length,
      sceneCount: scenes.scenes.length,
      storyboardCount: storyboard.scenes.length,
      videoPromptCount: videoPrompts.length
    }
  };
}

function installFetchInterceptors(stageFixtures) {
  const nativeFetch = window.fetch.bind(window);
  const fakeImage =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const state = {
    installedBeforeApp: document.readyState === 'loading',
    agentRunCalls: [],
    imageCalls: [],
    unexpectedRequests: [],
    localConfigCalls: [],
    script: {
      requestCount: 0,
      waiting: false,
      release: false,
      released: false,
      timedOut: false
    },
    video: {
      postCount: 0,
      completedPostCount: 0,
      getCount: 0,
      active: 0,
      maxActive: 0,
      requestBodies: []
    }
  };
  Object.defineProperty(window, '__VIDEOAGENT_QA__', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: state
  });

  const jsonResponse = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json; charset=utf-8' }
    });
  const parseBody = async (input, init) => {
    try {
      if (typeof init?.body === 'string') return JSON.parse(init.body);
      if (input instanceof Request) return await input.clone().json();
    } catch (error) {
      state.unexpectedRequests.push({ kind: 'invalid-json-body', message: String(error) });
    }
    return {};
  };
  const providerStatus = {
    ok: true,
    provider: {
      text: { provider: 'mock', configured: true, model: 'qa-text' },
      image: { provider: 'mock', configured: true, model: 'qa-image' },
      video: { provider: 'mock', configured: true, model: 'qa-video' },
      customBaseUrl: ''
    }
  };

  window.fetch = async (input, init = {}) => {
    const rawUrl = input instanceof Request ? input.url : String(input);
    const url = new URL(rawUrl, window.location.href);
    const method = String(init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();

    if (method === 'GET' && (url.pathname === '/api/health' || url.pathname === '/api/model-config')) {
      state.localConfigCalls.push(url.pathname);
      return jsonResponse(providerStatus);
    }

    if (url.pathname === '/api/agent/run') {
      const request = await parseBody(input, init);
      const stage = request.productionStage;
      const fixture = stageFixtures[stage];
      if (method !== 'POST' || !fixture) {
        state.unexpectedRequests.push({ kind: 'agent-run', method, stage: stage || null });
        return jsonResponse({ error: 'QA fixture does not permit this agent request' }, 400);
      }
      const workspace = request.workspace || {};
      const callNumber = state.agentRunCalls.length + 1;
      const fixtureFiles = Array.isArray(fixture.files)
        ? fixture.files
        : [{ filePath: fixture.filePath, content: fixture.content }];
      const patches = fixtureFiles.map((fixtureFile, index) => {
        const currentFile = Array.isArray(workspace.files)
          ? workspace.files.find((file) => file.path === fixtureFile.filePath)
          : null;
        return {
          id: `qa-${stage}-${callNumber}-${index + 1}`,
          filePath: fixtureFile.filePath,
          summary: `确定性 QA ${stage} 完整草稿`,
          before: currentFile?.content || '',
          after: fixtureFile.content,
          riskLevel: 'low',
          requiresApproval: true,
          origin: {
            kind: 'agent_stage',
            productionStage: stage,
            generationJobId: request.generationJobId || ''
          }
        };
      });
      state.agentRunCalls.push({
        stage,
        filePath: fixtureFiles[0]?.filePath || '',
        filePaths: fixtureFiles.map((item) => item.filePath),
        patchCount: patches.length,
        beforeSource: 'request.workspace',
        beforeLength: patches.reduce((sum, patch) => sum + patch.before.length, 0),
        afterLength: fixtureFiles.reduce((sum, item) => sum + item.content.length, 0),
        projectId: workspace.projectId || '',
        generationJobId: request.generationJobId || '',
        requestedOutputFiles: request.requestedOutputFiles || [],
        stageRequestMode: request.stageRequestMode || ''
      });
      if (stage === 'script') {
        state.script.requestCount += 1;
        state.script.waiting = true;
        const waitStartedAt = Date.now();
        while (!state.script.release && Date.now() - waitStartedAt < 30000) {
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        state.script.waiting = false;
        if (!state.script.release) {
          state.script.timedOut = true;
          return jsonResponse({ error: 'QA script fixture release timed out' }, 504);
        }
        state.script.released = true;
      } else {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      return jsonResponse({
        mode: 'mock',
        provider: 'mock',
        assistantMessage: `${stage} 固定草稿已准备，等待审查。`,
        plan: [],
        toolEvents: [],
        agentEvents: [],
        assets: [],
        patchOperations: patches,
        complianceChecks: [],
        preview: {
          title: workspace.title || '小澎的恋爱史',
          subtitle: '',
          cta: '',
          durationSeconds: 180,
          timelineVersion: 1,
          platform: '小红书',
          mode: workspace.mode || 'creator',
          workflow: request.workflow || workspace.activeWorkflow || 'generate',
          scenes: []
        },
        notes: ['deterministic-browser-qa']
      });
    }

    if (url.pathname === '/api/image/generate' || url.pathname === '/api/image/render') {
      state.imageCalls.push({ pathname: url.pathname, method });
      return jsonResponse({ imageUrl: fakeImage, provider: 'qa-local-fixture' });
    }

    if (url.pathname === '/api/video/render') {
      if (method === 'POST') {
        const body = await parseBody(input, init);
        const index = ++state.video.postCount;
        state.video.requestBodies.push({
          index,
          hasPrompt: Boolean(body.prompt),
          hasReference: Boolean(body.image || body.keyframes?.length),
          mode: body.mode || ''
        });
        state.video.active += 1;
        state.video.maxActive = Math.max(state.video.maxActive, state.video.active);
        await new Promise((resolve) => setTimeout(resolve, 80));
        state.video.active -= 1;
        state.video.completedPostCount += 1;
        const providerTaskId = `qa-video-${String(index).padStart(2, '0')}`;
        return jsonResponse({ status: 'queued', video_id: providerTaskId, task_id: providerTaskId, progress: 0 });
      }
      if (method === 'GET') {
        state.video.getCount += 1;
        const providerTaskId = url.searchParams.get('video_id') || 'qa-video-local';
        return jsonResponse({ status: 'queued', video_id: providerTaskId, progress: 0 });
      }
      state.unexpectedRequests.push({ kind: 'video-render', method });
      return jsonResponse({ error: 'Unsupported QA video method' }, 405);
    }

    return nativeFetch(input, init);
  };
}

function seedLegacyWorkspaceOnFirstLoad(storageKey, sessionKey, workspace) {
  const queuedWorkspaceKey = `${sessionKey}:queued-workspace`;
  const queuedWorkspace = window.sessionStorage.getItem(queuedWorkspaceKey);
  if (queuedWorkspace) {
    window.localStorage.setItem(storageKey, queuedWorkspace);
    window.sessionStorage.removeItem(queuedWorkspaceKey);
    return;
  }
  if (window.sessionStorage.getItem(sessionKey)) return;
  window.localStorage.setItem(storageKey, JSON.stringify(workspace));
  window.sessionStorage.setItem(sessionKey, 'seeded');
}

function inspectScriptRegenerationState(storageKey, legacyMarker, currentMarker) {
  const isVisible = (element) => {
    if (!element) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      Number(style.opacity || 1) > 0 &&
      rect.width > 1 &&
      rect.height > 1 &&
      rect.bottom > 0 &&
      rect.top < window.innerHeight &&
      rect.right > 0 &&
      rect.left < window.innerWidth;
  };
  const visibleText = [...document.body.querySelectorAll('*')]
    .filter((element) => element.children.length === 0 && isVisible(element))
    .map((element) => element.textContent?.replace(/\s+/g, ' ').trim() || '')
    .filter(Boolean);
  const raw = window.localStorage.getItem(storageKey);
  const stored = raw ? JSON.parse(raw) : null;
  // 工作区落盘时会包一层 envelope（{schemaVersion, savedAt, workspace}）；
  // 种子数据是裸快照。两种形状都要认，否则探针只在应用回写之前的一瞬间有效。
  const workspace = stored && stored.workspace ? stored.workspace : stored;
  const flowFile = workspace?.files?.find((file) => file.path === 'production_flow.json');
  const pendingFile = workspace?.files?.find((file) => file.path === '.aigc/pending_patches.json');
  const flow = flowFile ? JSON.parse(flowFile.content) : null;
  const pending = pendingFile ? JSON.parse(pendingFile.content) : [];
  const textarea = document.querySelector('#production-script-body');
  const visiblePatchBadges = [...document.querySelectorAll('.package-review-badge')]
    .filter(isVisible)
    .map((element) => element.textContent?.replace(/\s+/g, ' ').trim() || '');
  const visibleGeneratingRegions = [...document.querySelectorAll('[role="status"]')]
    .filter(isVisible)
    .filter((element) => element.textContent?.includes('正在生成剧本'));
  const visibleButtons = [...document.querySelectorAll('button')].filter(isVisible);
  const normalize = (value) => value?.replace(/\s+/g, ' ').trim() || '';
  const activeStageTab = [...document.querySelectorAll('button[role="tab"]')]
    .find((button) => button.classList.contains('active'));
  const workbench = document.querySelector('.studio-workbench');
  const businessFiles = (workspace?.files || [])
    .map((file) => file.path)
    .filter((filePath) => filePath !== 'production_flow.json' && !filePath.startsWith('.aigc/'));
  return {
    workbenchVisible: isVisible(document.querySelector('.studio-workbench')),
    inspectorSuppressedLayout: Boolean(workbench?.classList.contains('inspector-suppressed')),
    inspectorRailVisible: isVisible(document.querySelector('.studio-current')),
    regenerateButtonVisible: isVisible(document.querySelector('button[aria-label="重新生成剧本"]')),
    replaceButtonVisible: isVisible(document.querySelector('button[aria-label="替换剧本"]')),
    composerVisible: isVisible(document.querySelector('.studio-assistant-composer textarea')),
    activeStageTab: normalize(activeStageTab?.textContent).replace(/未解锁/g, ''),
    generatingMessageVisible: visibleText.some((text) => text.includes('正在生成剧本')),
    generatingStateCount: visibleGeneratingRegions.length,
    interruptedMessageVisible: visibleText.some((text) => text.includes('上次生成已中断，请重新生成')),
    textareaVisible: isVisible(textarea),
    textareaValue: textarea?.value || '',
    confirmScriptCtaVisible: visibleButtons.some((button) => normalize(button.textContent) === '确认脚本，交给角色设计师'),
    saveScriptCtaVisible: visibleButtons.some((button) => normalize(button.textContent) === '保存修改'),
    visiblePatchBadges,
    legacyMarkerVisible: visibleText.some((text) => text.includes(legacyMarker)),
    currentMarkerVisible: visibleText.some((text) => text.includes(currentMarker)) || Boolean(textarea?.value.includes(currentMarker)),
    dependencyExpiredVisible: visibleText.some((text) => text === '依赖已过期' || text.includes('依赖已过期')),
    internalInstructionVisible: visibleText.some((text) => text.includes('只重写 script.md')),
    rawScriptEnumVisible: visibleText.some((text) => text.trim().toLowerCase() === 'script'),
    failedRecoveryCardVisible: isVisible(document.querySelector('.production-failed-review')),
    businessFiles,
    pendingCount: Array.isArray(pending) ? pending.length : -1,
    pendingPaths: Array.isArray(pending) ? pending.map((patch) => patch.filePath) : [],
    pendingJobIds: Array.isArray(pending) ? pending.map((patch) => patch.origin?.generationJobId || '') : [],
    pendingContainsLegacyMarker: Boolean(pendingFile?.content.includes(legacyMarker)),
    pendingContainsCurrentMarker: Boolean(pendingFile?.content.includes(currentMarker)),
    flowStatus: flow?.stages?.script?.status || '',
    flowError: flow?.stages?.script?.error || '',
    flowGenerationJobId: flow?.stages?.script?.generationJobId || '',
    interceptor: window.__VIDEOAGENT_QA__ ? {
      script: { ...window.__VIDEOAGENT_QA__.script },
      agentRunCalls: window.__VIDEOAGENT_QA__.agentRunCalls.map((call) => ({ ...call }))
    } : null
  };
}

async function clickButtonByAriaLabel(cdp, sessionId, ariaLabel) {
  const result = await callInPage(cdp, sessionId, (label) => {
    const matches = [...document.querySelectorAll('button')]
      .filter((button) => button.getAttribute('aria-label') === label);
    if (matches.length === 1 && !matches[0].disabled) matches[0].click();
    return {
      count: matches.length,
      disabled: matches.length === 1 ? matches[0].disabled : null
    };
  }, ariaLabel);
  assert.equal(result.count, 1, `必须只有一个 aria-label="${ariaLabel}" 按钮，实际 ${result.count}`);
  assert.equal(result.disabled, false, `aria-label="${ariaLabel}" 按钮不应 disabled`);
}

function readFlowFromStorage() {
  const raw = window.localStorage.getItem('videoagent-demo-workspace:xiaopeng-v2:progressive-v1');
  if (!raw) return null;
  const stored = JSON.parse(raw);
  // 同上：envelope 与裸快照两种落盘形状都要认。
  const workspace = stored && stored.workspace ? stored.workspace : stored;
  const flowFile = workspace?.files?.find((file) => file.path === 'production_flow.json');
  if (!flowFile) return null;
  const flow = JSON.parse(flowFile.content);
  return {
    currentStage: flow.currentStage,
    statuses: Object.fromEntries(Object.entries(flow.stages).map(([stage, record]) => [stage, record.status])),
    draftVersions: Object.fromEntries(Object.entries(flow.stages).map(([stage, record]) => [stage, record.draftVersion])),
    confirmedVersions: Object.fromEntries(Object.entries(flow.stages).map(([stage, record]) => [stage, record.confirmedVersion])),
    videoJobs: flow.videoJobs || []
  };
}

function readStageTabs() {
  const labels = ['剧本', '角色', '场景', '分镜', '视频'];
  const buttons = [...document.querySelectorAll('button[role="tab"]')];
  return Object.fromEntries(labels.map((label) => {
    const button = buttons.find((item) => item.textContent.replace(/\s+/g, '').startsWith(label));
    return [label, button ? { disabled: button.disabled, active: button.classList.contains('active') } : null];
  }));
}

function assertTabLocks(actual, unlockedLabels, checkpoint) {
  for (const label of STAGE_TABS) {
    assert.ok(actual[label], `${checkpoint}: 缺少 ${label} tab`);
    assert.equal(
      actual[label].disabled,
      !unlockedLabels.includes(label),
      `${checkpoint}: ${label} tab 锁定状态错误`
    );
  }
}

async function clickUniqueButton(cdp, sessionId, label) {
  const result = await callInPage(cdp, sessionId, (targetLabel) => {
    const normalize = (value) => value.replace(/\s+/g, ' ').trim();
    const matches = [...document.querySelectorAll('button')]
      .filter((button) => normalize(button.textContent) === targetLabel);
    if (matches.length === 1 && !matches[0].disabled) matches[0].click();
    return {
      count: matches.length,
      disabled: matches.length === 1 ? matches[0].disabled : null
    };
  }, label);
  assert.equal(result.count, 1, `必须只有一个“${label}”按钮，实际 ${result.count}`);
  assert.equal(result.disabled, false, `“${label}”按钮不应 disabled`);
}

async function waitForStageReady(cdp, sessionId, stage, ctaLabel) {
  return waitForPage(
    cdp,
    sessionId,
    (targetStage, targetCta) => {
      const raw = window.localStorage.getItem('videoagent-demo-workspace:xiaopeng-v2:progressive-v1');
      if (!raw) return false;
      const stored = JSON.parse(raw);
      const workspace = stored && stored.workspace ? stored.workspace : stored;
      const flowFile = workspace?.files?.find((file) => file.path === 'production_flow.json');
      if (!flowFile) return false;
      const flow = JSON.parse(flowFile.content);
      const ready = flow.stages[targetStage]?.status === 'ready_for_review';
      const normalize = (value) => value.replace(/\s+/g, ' ').trim();
      const button = [...document.querySelectorAll('button')]
        .find((item) => normalize(item.textContent) === targetCta);
      return ready && button && !button.disabled
        ? { currentStage: flow.currentStage, status: flow.stages[targetStage].status }
        : false;
    },
    [stage, ctaLabel],
    30000,
    `${stage} ready_for_review`
  );
}

async function scrollToTop(cdp, sessionId) {
  await callInPage(cdp, sessionId, () => {
    window.scrollTo(0, 0);
    return true;
  });
  await sleep(150);
}

async function scrollButtonIntoView(cdp, sessionId, label) {
  const count = await callInPage(cdp, sessionId, (targetLabel) => {
    const normalize = (value) => value.replace(/\s+/g, ' ').trim();
    const matches = [...document.querySelectorAll('button')]
      .filter((button) => normalize(button.textContent) === targetLabel);
    if (matches.length === 1) matches[0].scrollIntoView({ block: 'center', inline: 'nearest' });
    return matches.length;
  }, label);
  assert.equal(count, 1, `布局检查必须找到唯一“${label}”按钮`);
  await sleep(250);
}

async function inspectLayout(cdp, sessionId, mainButtonLabel) {
  return callInPage(cdp, sessionId, (targetLabel) => {
    const normalize = (value) => value.replace(/\s+/g, ' ').trim();
    const isVisible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity || 1) > 0 &&
        rect.width > 1 &&
        rect.height > 1 &&
        rect.bottom > 0 &&
        rect.top < window.innerHeight &&
        rect.right > 0 &&
        rect.left < window.innerWidth;
    };
    // inert 子树（例如审查抽屉打开时被遮住的画布）里的按钮点不到也 Tab 不到，
    // 被上层面板盖住是设计本身，不算「布局重叠」。
    const isInteractive = (element) => !element.closest('[inert]');
    const visibleButtons = [...document.querySelectorAll('button')]
      .filter((button) => isVisible(button) && isInteractive(button))
      .map((button, index) => {
        const rect = button.getBoundingClientRect();
        return {
          index,
          // 图标按钮没有文字，报错时用 aria-label / class 兜底，否则重叠对读不出是谁。
          label: normalize(button.textContent).slice(0, 80) ||
            button.getAttribute('aria-label') ||
            `.${button.className || 'button'}`,
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height
        };
      });
    const overlaps = [];
    for (let firstIndex = 0; firstIndex < visibleButtons.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < visibleButtons.length; secondIndex += 1) {
        const first = visibleButtons[firstIndex];
        const second = visibleButtons[secondIndex];
        const overlapWidth = Math.min(first.right, second.right) - Math.max(first.left, second.left);
        const overlapHeight = Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top);
        if (overlapWidth > 2 && overlapHeight > 2) {
          overlaps.push({ first: first.label, second: second.label, overlapWidth, overlapHeight });
        }
      }
    }
    const mainButtons = [...document.querySelectorAll('button')]
      .filter((button) => normalize(button.textContent) === targetLabel);
    const mainRect = mainButtons.length === 1 ? mainButtons[0].getBoundingClientRect() : null;
    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      documentScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      mainButtonCount: mainButtons.length,
      mainButtonRect: mainRect ? {
        left: mainRect.left,
        right: mainRect.right,
        top: mainRect.top,
        bottom: mainRect.bottom,
        width: mainRect.width,
        height: mainRect.height
      } : null,
      visibleButtonCount: visibleButtons.length,
      overlaps: overlaps.slice(0, 20)
    };
  }, mainButtonLabel);
}

function assertLayout(layout, width, height, checkpoint) {
  assert.equal(layout.innerWidth, width, `${checkpoint}: viewport width 错误`);
  assert.equal(layout.innerHeight, height, `${checkpoint}: viewport height 错误`);
  assert.ok(
    layout.documentScrollWidth <= layout.innerWidth,
    `${checkpoint}: document 水平溢出 ${layout.documentScrollWidth} > ${layout.innerWidth}`
  );
  assert.ok(
    layout.bodyScrollWidth <= layout.innerWidth,
    `${checkpoint}: body 水平溢出 ${layout.bodyScrollWidth} > ${layout.innerWidth}`
  );
  assert.equal(layout.mainButtonCount, 1, `${checkpoint}: 主按钮不唯一`);
  assert.ok(layout.mainButtonRect, `${checkpoint}: 主按钮无矩形`);
  assert.ok(layout.mainButtonRect.left >= -1, `${checkpoint}: 主按钮越过左边界`);
  assert.ok(layout.mainButtonRect.right <= layout.innerWidth + 1, `${checkpoint}: 主按钮越过右边界`);
  assert.deepEqual(layout.overlaps, [], `${checkpoint}: 可见按钮存在明显重叠`);
}

function consoleViolations(consoleEntries) {
  const warningPattern = /unique\s+["']?key|hydration|hydrating|server-rendered html|did not match|unhandled|uncaught|\berror\b/i;
  return consoleEntries.filter((entry) =>
    entry.type === 'error' ||
    ((entry.type === 'warning' || entry.type === 'warn') && warningPattern.test(entry.text))
  );
}

async function waitForScriptRegressionState(
  cdp,
  sessionId,
  label,
  predicate,
  timeoutMs = 15000
) {
  const startedAt = Date.now();
  let lastState = null;
  let lastError = null;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      lastState = await callInPage(
        cdp,
        sessionId,
        inspectScriptRegenerationState,
        DEMO_STORAGE_KEY,
        LEGACY_SCRIPT_MARKER,
        CURRENT_SCRIPT_MARKER
      );
      if (predicate(lastState)) return lastState;
      lastError = null;
    } catch (error) {
      lastError = error;
    }
    await sleep(100);
  }
  const detail = lastError
    ? lastError.stack || lastError.message || String(lastError)
    : JSON.stringify(lastState);
  throw new Error(`Timed out waiting for ${label}; last value: ${detail}`);
}

async function runScriptRegenerationRegression(
  cdp,
  sessionId,
  fixtures,
  screenshotDir,
  screenshots
) {
  const legacyReady = await waitForScriptRegressionState(
    cdp,
    sessionId,
    'legacy pending script workspace',
    (state) => state.regenerateButtonVisible && state.flowStatus === 'ready_for_review' && state.interceptor
  );
  assert.deepEqual(legacyReady.businessFiles, [], '旧历史场景不得包含已提交业务文件');
  assert.equal(legacyReady.pendingCount, 3, '旧历史场景必须只有 pending 三件套');
  assert.deepEqual(
    [...legacyReady.pendingPaths].sort(),
    ['brief.json', 'campaign_goal.json', 'script.md'],
    '旧历史场景必须覆盖 Brief、Campaign Goal 和脚本'
  );
  assert.equal(legacyReady.pendingContainsLegacyMarker, true, '旧 pending 必须携带可识别占位脚本');
  assert.equal(legacyReady.textareaVisible, false, '无效旧脚本不得在新请求前进入审查输入框');
  assert.deepEqual(legacyReady.visiblePatchBadges, [], '无效旧 pending 不得显示为可审 patch');
  assert.equal(legacyReady.legacyMarkerVisible, false, '旧占位文本不得在页面可见');

  await clickUniqueButton(cdp, sessionId, '总览');
  const overviewBeforeComposer = await waitForScriptRegressionState(
    cdp,
    sessionId,
    'overview active before composer script run',
    (state) => state.activeStageTab === '总览' && state.composerVisible
  );
  assert.equal(overviewBeforeComposer.activeStageTab, '总览', '制作助理发起前必须明确处在非剧本 tab');
  const composerRequest = '从总览发起一轮完整脚本生成，主题保持小澎十二段校园恋爱故事。';
  const composerFilled = await callInPage(cdp, sessionId, (value) => {
    const textarea = document.querySelector('.studio-assistant-composer textarea');
    if (!textarea) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    setter.call(textarea, value);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }, composerRequest);
  assert.equal(composerFilled, true, '必须能填写制作助理 composer');
  await waitForPage(
    cdp,
    sessionId,
    () => {
      const send = [...document.querySelectorAll('button')]
        .find((button) => button.getAttribute('aria-label') === '发送');
      return send && !send.disabled ? true : false;
    },
    [],
    5000,
    'assistant composer send enabled'
  );
  await clickButtonByAriaLabel(cdp, sessionId, '发送');
  const generatingBeforeReload = await waitForScriptRegressionState(
    cdp,
    sessionId,
    'deferred script generation state',
    (state) => state.flowStatus === 'generating' &&
      state.interceptor?.script?.waiting === true &&
      state.generatingMessageVisible
  );
  assert.equal(generatingBeforeReload.workbenchVisible, true, '生成中必须停留在 workbench');
  assert.equal(generatingBeforeReload.activeStageTab, '剧本', '从非剧本 tab 发起后必须立即聚焦剧本');
  assert.equal(generatingBeforeReload.inspectorSuppressedLayout, true, '生成中必须切换为无检查器两列布局');
  assert.equal(generatingBeforeReload.inspectorRailVisible, false, '生成中检查器整栏必须不可见');
  assert.equal(generatingBeforeReload.generatingMessageVisible, true, '生成中必须显示“正在生成剧本”');
  assert.equal(generatingBeforeReload.generatingStateCount, 1, '生成中页面必须只有一个“正在生成剧本”状态区');
  assert.equal(generatingBeforeReload.textareaVisible, false, '生成中不得显示旧脚本 textarea');
  assert.deepEqual(generatingBeforeReload.visiblePatchBadges, [], '生成中不得显示旧 patch badge');
  assert.equal(generatingBeforeReload.legacyMarkerVisible, false, '生成中不得显示旧占位文本');
  assert.equal(generatingBeforeReload.dependencyExpiredVisible, false, '生成中不得显示“依赖已过期”');
  assert.equal(generatingBeforeReload.internalInstructionVisible, false, '内部重写指令不得冒充任务标题');
  assert.equal(generatingBeforeReload.rawScriptEnumVisible, false, '生成中画板不得泄露 raw SCRIPT 枚举');
  assert.equal(generatingBeforeReload.interceptor.agentRunCalls.length, 1, '脚本重生成只允许一个本地拦截请求');
  assert.deepEqual(
    [...generatingBeforeReload.interceptor.agentRunCalls[0].requestedOutputFiles].sort(),
    ['brief.json', 'campaign_goal.json', 'script.md'],
    '缺少已提交 Brief 时，脚本重生成必须请求完整合法三件套'
  );
  const generatingShot = path.join(screenshotDir, '00a-script-regenerating-old-draft-hidden.png');
  await screenshot(cdp, sessionId, generatingShot);
  screenshots.push('screenshots/00a-script-regenerating-old-draft-hidden.png');

  await cdp.send('Page.reload', { ignoreCache: true }, sessionId);
  const recovered = await waitForScriptRegressionState(
    cdp,
    sessionId,
    'interrupted non-video generation recovery',
    (state) => state.failedRecoveryCardVisible &&
      state.flowStatus === 'failed' &&
      state.flowError.includes('上次生成已中断')
  );
  assert.match(recovered.flowError, /上次生成已中断，请重新生成/);
  assert.equal(recovered.generatingMessageVisible, false, '刷新后不得继续伪装生成中');
  assert.equal(recovered.inspectorSuppressedLayout, true, '中断恢复必须保持无检查器两列布局');
  assert.equal(recovered.inspectorRailVisible, false, '中断恢复时检查器整栏必须不可见');
  assert.equal(recovered.rawScriptEnumVisible, false, '中断恢复画板不得泄露 raw SCRIPT 枚举');
  assert.equal(recovered.failedRecoveryCardVisible, true, '刷新后必须显示脚本中断恢复卡');
  assert.equal(recovered.textareaVisible, false, '刷新后不得复活旧脚本审查框');
  assert.equal(recovered.confirmScriptCtaVisible, false, '刷新后不得复活脚本确认入口');
  assert.equal(recovered.saveScriptCtaVisible, false, '刷新后不得复活脚本保存入口');
  assert.equal(recovered.regenerateButtonVisible, false, '失败节点不得保留普通画板“重新生成”操作');
  assert.equal(recovered.replaceButtonVisible, false, '失败节点不得保留普通画板“替换”操作');
  assert.deepEqual(recovered.visiblePatchBadges, [], '刷新后不得复活旧 patch badge');
  assert.equal(recovered.legacyMarkerVisible, false, '刷新后不得复活旧占位内容');
  const recoveredShot = path.join(screenshotDir, '00b-script-interrupted-after-reload.png');
  await screenshot(cdp, sessionId, recoveredShot);
  screenshots.push('screenshots/00b-script-interrupted-after-reload.png');

  await callInPage(cdp, sessionId, (queueKey, workspace) => {
    window.sessionStorage.setItem(queueKey, JSON.stringify(workspace));
    return true;
  }, `${LEGACY_SEED_SESSION_KEY}:queued-workspace`, fixtures.legacyWorkspace);
  await cdp.send('Page.reload', { ignoreCache: true }, sessionId);
  await waitForScriptRegressionState(
    cdp,
    sessionId,
    'legacy pending workspace reseeded',
    (state) => state.regenerateButtonVisible && state.flowStatus === 'ready_for_review' && state.interceptor
  );

  await clickButtonByAriaLabel(cdp, sessionId, '重新生成剧本');
  const generatingBeforeRelease = await waitForScriptRegressionState(
    cdp,
    sessionId,
    'second deferred script generation',
    (state) => state.flowStatus === 'generating' &&
      state.interceptor?.script?.waiting === true &&
      state.generatingMessageVisible
  );
  assert.equal(generatingBeforeRelease.textareaVisible, false);
  assert.equal(generatingBeforeRelease.generatingStateCount, 1);
  assert.deepEqual(generatingBeforeRelease.visiblePatchBadges, []);
  assert.equal(generatingBeforeRelease.legacyMarkerVisible, false);
  assert.equal(generatingBeforeRelease.dependencyExpiredVisible, false);

  const released = await callInPage(cdp, sessionId, () => {
    window.__VIDEOAGENT_QA__.script.release = true;
    return true;
  });
  assert.equal(released, true, '必须释放本地脚本 fixture');
  const currentResult = await waitForScriptRegressionState(
    cdp,
    sessionId,
    'current script job review result',
    (state) => state.flowStatus === 'ready_for_review' &&
      state.interceptor?.script?.released === true &&
      state.currentMarkerVisible &&
      state.textareaVisible
  );
  assert.equal(currentResult.workbenchVisible, true);
  assert.equal(currentResult.currentMarkerVisible, true, '响应后必须显示当前 job 的合法脚本');
  assert.equal(currentResult.textareaValue.includes(CURRENT_SCRIPT_MARKER), true);
  assert.equal(currentResult.textareaValue.includes(LEGACY_SCRIPT_MARKER), false);
  assert.equal(currentResult.legacyMarkerVisible, false, '当前结果不得混入旧占位脚本');
  assert.equal(currentResult.pendingContainsLegacyMarker, false, 'pending 存储不得残留旧脚本');
  assert.equal(currentResult.pendingContainsCurrentMarker, true, 'pending 存储必须包含当前合法脚本');
  assert.equal(currentResult.pendingCount, 3, '当前 job 必须只留下合法三件套');
  assert.deepEqual(
    [...currentResult.pendingPaths].sort(),
    ['brief.json', 'campaign_goal.json', 'script.md']
  );
  assert.deepEqual(
    [...new Set(currentResult.pendingJobIds)],
    [currentResult.flowGenerationJobId],
    '所有可审 patch 必须属于当前 generation job'
  );
  assert.deepEqual(currentResult.visiblePatchBadges, ['3 个 patch 待审']);
  assert.equal(currentResult.dependencyExpiredVisible, false, '合法脚本三件套不得自我标记依赖过期');
  const currentShot = path.join(screenshotDir, '00c-script-current-job-review.png');
  await screenshot(cdp, sessionId, currentShot);
  screenshots.push('screenshots/00c-script-current-job-review.png');

  const scriptCall = currentResult.interceptor.agentRunCalls[0];
  assert.equal(scriptCall.stage, 'script');
  assert.equal(scriptCall.stageRequestMode, 'regenerate');
  assert.equal(scriptCall.generationJobId, currentResult.flowGenerationJobId);
  assert.equal(scriptCall.patchCount, 3);
  assert.equal(currentResult.interceptor.script.requestCount, 1);
  assert.equal(currentResult.interceptor.script.timedOut, false);

  await callInPage(cdp, sessionId, (queueKey, workspace) => {
    window.sessionStorage.setItem(queueKey, JSON.stringify(workspace));
    return true;
  }, `${LEGACY_SEED_SESSION_KEY}:queued-workspace`, fixtures.workspace);
  await cdp.send('Page.reload', { ignoreCache: true }, sessionId);
  await waitForPage(
    cdp,
    sessionId,
    (expectedScript) => {
      const textarea = document.querySelector('#production-script-body');
      return document.readyState === 'complete' && textarea?.value === expectedScript;
    },
    [fixtures.files.get('script.md')],
    45000,
    'restored progressive demo script stage'
  );

  return {
    legacyPendingPaths: legacyReady.pendingPaths,
    composerEntry: {
      startedFromTab: overviewBeforeComposer.activeStageTab,
      focusedTabDuringRun: generatingBeforeReload.activeStageTab,
      oldReviewVisibleDuringRun: generatingBeforeReload.textareaVisible
    },
    generating: {
      workbenchVisible: generatingBeforeReload.workbenchVisible,
      activeStageTab: generatingBeforeReload.activeStageTab,
      inspectorSuppressedLayout: generatingBeforeReload.inspectorSuppressedLayout,
      inspectorRailVisible: generatingBeforeReload.inspectorRailVisible,
      generatingMessageVisible: generatingBeforeReload.generatingMessageVisible,
      generatingStateCount: generatingBeforeReload.generatingStateCount,
      textareaVisible: generatingBeforeReload.textareaVisible,
      visiblePatchBadges: generatingBeforeReload.visiblePatchBadges,
      legacyMarkerVisible: generatingBeforeReload.legacyMarkerVisible,
      dependencyExpiredVisible: generatingBeforeReload.dependencyExpiredVisible,
      rawScriptEnumVisible: generatingBeforeReload.rawScriptEnumVisible
    },
    reloadRecovery: {
      status: recovered.flowStatus,
      error: recovered.flowError,
      inspectorSuppressedLayout: recovered.inspectorSuppressedLayout,
      inspectorRailVisible: recovered.inspectorRailVisible,
      rawScriptEnumVisible: recovered.rawScriptEnumVisible,
      failedRecoveryCardVisible: recovered.failedRecoveryCardVisible,
      textareaVisible: recovered.textareaVisible,
      confirmScriptCtaVisible: recovered.confirmScriptCtaVisible,
      saveScriptCtaVisible: recovered.saveScriptCtaVisible,
      normalRegenerateActionVisible: recovered.regenerateButtonVisible,
      normalReplaceActionVisible: recovered.replaceButtonVisible,
      visiblePatchBadges: recovered.visiblePatchBadges,
      legacyMarkerVisible: recovered.legacyMarkerVisible
    },
    currentResult: {
      status: currentResult.flowStatus,
      patchCount: currentResult.pendingCount,
      patchPaths: currentResult.pendingPaths,
      generationJobId: currentResult.flowGenerationJobId,
      currentMarkerVisible: currentResult.currentMarkerVisible,
      legacyMarkerVisible: currentResult.legacyMarkerVisible,
      dependencyExpiredVisible: currentResult.dependencyExpiredVisible
    },
    providerSafety: {
      interceptedScriptRequests: currentResult.interceptor.script.requestCount,
      timedOut: currentResult.interceptor.script.timedOut,
      requestMode: scriptCall.stageRequestMode,
      requestedOutputFiles: scriptCall.requestedOutputFiles
    }
  };
}

async function run() {
  const args = parseArgs(process.argv);
  const targetUrl = new URL(`/?demo=${DEMO_ID}`, args.url).toString();
  const absoluteOutDir = path.resolve(args.outDir);
  const screenshotDir = path.join(absoluteOutDir, 'screenshots');
  const reportPath = path.join(absoluteOutDir, 'videoagent-flow-regression.json');
  const startedAt = Date.now();
  const fixtures = await loadFixtures();

  await fs.rm(screenshotDir, { recursive: true, force: true });
  await fs.mkdir(screenshotDir, { recursive: true });
  await fs.rm(reportPath, { force: true });
  await fs.access(CHROME);

  const chromePort = await freePort();
  const chromeProfile = await fs.mkdtemp(path.join(os.tmpdir(), 'videoagent-qa-chrome-'));
  const chromeArgs = [
    args.headed ? '' : '--headless=new',
    '--disable-gpu',
    '--disable-extensions',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-allow-origins=*',
    '--window-size=1440,1000',
    `--remote-debugging-port=${chromePort}`,
    `--user-data-dir=${chromeProfile}`,
    'about:blank'
  ].filter(Boolean);
  const chrome = childProcess.spawn(CHROME, chromeArgs, { stdio: ['ignore', 'ignore', 'pipe'] });
  let chromeStderr = '';
  chrome.stderr.on('data', (chunk) => {
    chromeStderr = `${chromeStderr}${chunk.toString()}`.slice(-5000);
  });

  let cdp;
  let sessionId = '';
  const screenshots = [];
  const report = {
    date: new Date().toISOString(),
    result: 'running',
    url: targetUrl,
    fixturePath: path.relative(process.cwd(), FIXTURE_PATH),
    fixture: fixtures.summary,
    assertions: {},
    screenshots,
    console: [],
    exceptions: [],
    failedRequests: []
  };
  const acceptanceFailures = [];

  try {
    cdp = await connectBrowser(chromePort);
    const target = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const attached = await cdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
    sessionId = attached.sessionId;

    await cdp.send('Runtime.enable', {}, sessionId);
    await cdp.send('Log.enable', {}, sessionId);
    await cdp.send('Network.enable', {}, sessionId);
    await cdp.send('Page.enable', {}, sessionId);
    await setViewport(cdp, sessionId, 1440, 1000, false);
    await cdp.send(
      'Page.addScriptToEvaluateOnNewDocument',
      { source: `(${installFetchInterceptors.toString()})(${JSON.stringify(fixtures.injectionFixtures)});` },
      sessionId
    );
    await cdp.send(
      'Page.addScriptToEvaluateOnNewDocument',
      {
        source: functionExpression(seedLegacyWorkspaceOnFirstLoad, [
          DEMO_STORAGE_KEY,
          LEGACY_SEED_SESSION_KEY,
          fixtures.legacyWorkspace
        ])
      },
      sessionId
    );

    await cdp.send('Page.navigate', { url: targetUrl }, sessionId);
    report.assertions.scriptRegeneration = await runScriptRegenerationRegression(
      cdp,
      sessionId,
      fixtures,
      screenshotDir,
      screenshots
    );
    await waitForPage(
      cdp,
      sessionId,
      () => {
        const textarea = document.querySelector('#production-script-body');
        return document.readyState === 'complete' && textarea?.value ? true : false;
      },
      [],
      45000,
      'demo script stage'
    );

    const initialInterceptorState = await callInPage(cdp, sessionId, () => window.__VIDEOAGENT_QA__);
    assert.ok(initialInterceptorState, 'fetch interceptor 未安装');
    assert.equal(initialInterceptorState.installedBeforeApp, true, 'fetch interceptor 必须在页面初始化前安装');
    assert.equal(initialInterceptorState.agentRunCalls.length, 0);
    assert.equal(initialInterceptorState.imageCalls.length, 0);
    assert.equal(initialInterceptorState.video.postCount, 0);

    const scriptState = await callInPage(cdp, sessionId, () => {
      const textarea = document.querySelector('#production-script-body');
      const rect = textarea.getBoundingClientRect();
      return {
        value: textarea.value,
        visible: rect.width > 0 && rect.height > 0 && getComputedStyle(textarea).visibility !== 'hidden'
      };
    });
    const expectedScript = fixtures.files.get('script.md');
    const segmentCount = (scriptState.value.match(/^###\s+\d{2}｜/gm) || []).length;
    assert.equal(scriptState.value, expectedScript, 'script.md 必须全文展示且不能截断');
    assert.equal(scriptState.visible, true, '完整脚本输入区必须可见');
    assert.equal(segmentCount, 12, '脚本必须包含 12 段');
    assert.match(scriptState.value, /总时长：180 秒/);
    assert.match(scriptState.value, /拆分：12 段/);
    assert.doesNotMatch(scriptState.value, /[A-Za-z]/, 'script.md 不得包含拉丁字母');

    const initialTabs = await callInPage(cdp, sessionId, readStageTabs);
    assertTabLocks(initialTabs, ['剧本'], 'initial');
    const initialFlow = await callInPage(cdp, sessionId, readFlowFromStorage);
    assert.equal(initialFlow.statuses.script, 'ready_for_review');
    for (const stage of STAGE_SEQUENCE) assert.equal(initialFlow.statuses[stage], 'locked');

    await clickUniqueButton(cdp, sessionId, '查看视频任务');
    const lockedVideoGuard = await waitForPage(
      cdp,
      sessionId,
      () => {
        const banner = document.querySelector('.studio-error-banner');
        const scriptHeading = [...document.querySelectorAll('h1')].some((item) => item.textContent.trim() === '脚本审查');
        const videoHeading = [...document.querySelectorAll('h2')].some((item) => item.textContent.trim() === '视频生成准备');
        return banner?.textContent.includes('未解锁') && scriptHeading && !videoHeading
          ? { banner: banner.textContent.trim(), stayedOnScript: true }
          : false;
      },
      [],
      5000,
      'locked video shortcut guard'
    );
    await callInPage(cdp, sessionId, () => {
      document.querySelector('[aria-label="关闭错误提示"]')?.click();
      return true;
    });

    const manualMarker = 'QA-LOCKED-DOWNSTREAM-MARKER';
    await callInPage(cdp, sessionId, (marker) => {
      const textarea = document.querySelector('#production-script-body');
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter.call(textarea, `${textarea.value}\n\n${marker}`);
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      const save = [...document.querySelectorAll('button')]
        .find((button) => button.textContent.replace(/\s+/g, ' ').trim() === '保存修改');
      save?.click();
      return Boolean(save);
    }, manualMarker);
    const manualEditGuard = await waitForPage(
      cdp,
      sessionId,
      () => {
        const raw = window.localStorage.getItem('videoagent-demo-workspace:xiaopeng-v2:progressive-v1');
        if (!raw) return false;
        const stored = JSON.parse(raw);
        const workspace = stored && stored.workspace ? stored.workspace : stored;
        const flowFile = workspace?.files?.find((file) => file.path === 'production_flow.json');
        if (!flowFile) return false;
        const flow = JSON.parse(flowFile.content);
        const labels = ['剧本', '角色', '场景', '分镜', '视频'];
        const buttons = [...document.querySelectorAll('button[role="tab"]')];
        const tabs = Object.fromEntries(labels.map((label) => {
          const button = buttons.find((item) => item.textContent.replace(/\s+/g, '').startsWith(label));
          return [label, button ? { disabled: button.disabled } : null];
        }));
        const downstreamLocked = ['character', 'scene', 'storyboard', 'video']
          .every((stage) => flow.stages?.[stage]?.status === 'locked');
        const tabsLocked = ['角色', '场景', '分镜', '视频'].every((label) => tabs[label]?.disabled === true);
        return downstreamLocked && tabsLocked ? { downstreamLocked, tabsLocked } : false;
      },
      [],
      5000,
      'manual script edit keeps downstream locked'
    );
    await scrollToTop(cdp, sessionId);
    const initialShot = path.join(screenshotDir, '01-initial-script-desktop.png');
    await screenshot(cdp, sessionId, initialShot);
    screenshots.push('screenshots/01-initial-script-desktop.png');
    report.assertions.initial = {
      scriptExact: true,
      scriptVisible: true,
      segmentCount,
      totalSeconds: 180,
      latinLetters: 0,
      tabs: initialTabs,
      videoPosts: 0,
      lockedVideoGuard,
      manualEditGuard
    };

    await clickUniqueButton(cdp, sessionId, STAGE_CTA.character);
    await waitForStageReady(cdp, sessionId, 'character', STAGE_CTA.scene);
    const characterTabs = await callInPage(cdp, sessionId, readStageTabs);
    assertTabLocks(characterTabs, ['剧本', '角色'], 'character ready');
    const characterFlow = await callInPage(cdp, sessionId, readFlowFromStorage);
    assert.equal(characterFlow.statuses.script, 'confirmed');
    assert.equal(characterFlow.statuses.character, 'ready_for_review');
    assert.equal(characterFlow.statuses.scene, 'locked');

    const characterState = await waitForPage(
      cdp,
      sessionId,
      () => {
        const card = [...document.querySelectorAll('.character-asset-card')]
          .find((item) => item.querySelector('.character-asset-heading strong')?.textContent.trim() === '小澎');
        if (!card) return false;
        const image = card.querySelector('.character-design-visual img');
        const imageRect = image?.getBoundingClientRect();
        const variants = card.querySelectorAll('[aria-label="小澎 年龄阶段"] button');
        const expressions = card.querySelectorAll('[aria-label="小澎 表情选项"] button');
        const faceId = card.querySelector('.character-face-id');
        const ready = Boolean(
          image && image.complete && image.naturalWidth > 0 && imageRect.width > 0 && imageRect.height > 0 &&
          variants.length === 5 && expressions.length === 12 && faceId?.textContent.includes('Face ID')
        );
        return ready ? {
          mainImageVisible: true,
          mainImageSrc: image.currentSrc || image.src,
          variantCount: variants.length,
          expressionCount: expressions.length,
          faceIdVisible: true
        } : false;
      },
      [],
      45000,
      'xiaopeng character assets'
    );
    await scrollToTop(cdp, sessionId);
    const characterShot = path.join(screenshotDir, '02-character-desktop.png');
    await screenshot(cdp, sessionId, characterShot);
    screenshots.push('screenshots/02-character-desktop.png');
    report.assertions.character = { ...characterState, tabs: characterTabs };

    await clickUniqueButton(cdp, sessionId, STAGE_CTA.scene);
    await waitForStageReady(cdp, sessionId, 'scene', STAGE_CTA.storyboard);
    const sceneTabs = await callInPage(cdp, sessionId, readStageTabs);
    assertTabLocks(sceneTabs, ['剧本', '角色', '场景'], 'scene ready');
    const sceneFlow = await callInPage(cdp, sessionId, readFlowFromStorage);
    assert.equal(sceneFlow.statuses.character, 'confirmed');
    assert.equal(sceneFlow.statuses.scene, 'ready_for_review');
    assert.equal(sceneFlow.statuses.storyboard, 'locked');
    const sceneState = await callInPage(cdp, sessionId, () => {
      const cards = [...document.querySelectorAll('.scene-tile')];
      const invalid = cards.flatMap((card, index) => {
        const locationAndTime = card.querySelector('.scene-tile-main > span')?.textContent || '';
        const [location, timeOfDay] = locationAndTime.split('·').map((value) => value.trim());
        const details = [...card.querySelectorAll('.scene-tile-main > small')].map((item) => item.textContent.trim());
        const lighting = (details[0] || '').match(/光线：(.+?)(?:\s*·|$)/)?.[1]?.trim() || '';
        const characters = (details[1] || '').replace(/^出场角色：/, '').trim();
        return location && timeOfDay && lighting && characters && characters !== '未标注'
          ? []
          : [{ index, location, timeOfDay, lighting, characters }];
      });
      return { cardCount: cards.length, invalid };
    });
    assert.equal(sceneState.cardCount, 12, '场景阶段必须展示 12 张卡');
    assert.deepEqual(sceneState.invalid, [], '场景地点、时间、光线、出场角色必须非空');
    await scrollToTop(cdp, sessionId);
    const sceneShot = path.join(screenshotDir, '03-scene-desktop.png');
    await screenshot(cdp, sessionId, sceneShot);
    screenshots.push('screenshots/03-scene-desktop.png');
    report.assertions.scene = { ...sceneState, tabs: sceneTabs };

    await clickUniqueButton(cdp, sessionId, STAGE_CTA.storyboard);
    await waitForStageReady(cdp, sessionId, 'storyboard', STAGE_CTA.video);
    const storyboardTabs = await callInPage(cdp, sessionId, readStageTabs);
    assertTabLocks(storyboardTabs, ['剧本', '角色', '场景', '分镜'], 'storyboard ready');
    const storyboardFlow = await callInPage(cdp, sessionId, readFlowFromStorage);
    assert.equal(storyboardFlow.statuses.scene, 'confirmed');
    assert.equal(storyboardFlow.statuses.storyboard, 'ready_for_review');
    assert.equal(storyboardFlow.statuses.video, 'locked');
    const storyboardState = await callInPage(cdp, sessionId, () => {
      const requiredLabels = ['脚本段落', '角色', '场景', '景别', '运镜', '动作', '对白', '首帧引用'];
      const cards = [...document.querySelectorAll('.production-storyboard-card')];
      const invalid = cards.flatMap((card, index) => {
        const values = Object.fromEntries([...card.querySelectorAll('dl > div')].map((row) => [
          row.querySelector('dt')?.textContent.trim() || '',
          row.querySelector('dd')?.textContent.trim() || ''
        ]));
        const missing = requiredLabels.filter((label) => !values[label] || values[label] === '未标注');
        return missing.length ? [{ index, missing }] : [];
      });
      return { cardCount: cards.length, requiredLabels, invalid };
    });
    if (storyboardState.cardCount !== 12) {
      acceptanceFailures.push({
        checkpoint: 'storyboard-card-count',
        expected: 12,
        actual: storyboardState.cardCount,
        message: '分镜阶段必须展示 12 张卡'
      });
    }
    if (storyboardState.invalid.length) {
      acceptanceFailures.push({
        checkpoint: 'storyboard-review-fields',
        expected: '所有字段非空且不是“未标注”',
        actual: storyboardState.invalid,
        message: '分镜审查字段不得为空或“未标注”'
      });
    }
    await scrollToTop(cdp, sessionId);
    const storyboardShot = path.join(screenshotDir, '04-storyboard-desktop.png');
    await screenshot(cdp, sessionId, storyboardShot);
    screenshots.push('screenshots/04-storyboard-desktop.png');
    report.assertions.storyboard = { ...storyboardState, tabs: storyboardTabs };

    await clickUniqueButton(cdp, sessionId, STAGE_CTA.video);
    await waitForStageReady(cdp, sessionId, 'video', FINAL_VIDEO_CTA);
    const videoTabs = await callInPage(cdp, sessionId, readStageTabs);
    assertTabLocks(videoTabs, STAGE_TABS, 'video ready');
    const videoReadyFlow = await callInPage(cdp, sessionId, readFlowFromStorage);
    assert.equal(videoReadyFlow.statuses.storyboard, 'confirmed');
    assert.equal(videoReadyFlow.statuses.video, 'ready_for_review');
    const videoReadyState = await callInPage(cdp, sessionId, (finalLabel) => {
      const normalize = (value) => value.replace(/\s+/g, ' ').trim();
      const buttons = [...document.querySelectorAll('button')];
      const finalButtons = buttons.filter((button) => normalize(button.textContent) === finalLabel);
      const genericMergeButtons = buttons
        .filter((button) => {
          const style = getComputedStyle(button);
          return style.display !== 'none' && style.visibility !== 'hidden' && normalize(button.textContent).includes('合并');
        })
        .map((button) => normalize(button.textContent));
      return {
        shotCardCount: document.querySelectorAll('.shot-card').length,
        finalButtonCount: finalButtons.length,
        finalButtonDisabled: finalButtons.length === 1 ? finalButtons[0].disabled : null,
        genericMergeButtons
      };
    }, FINAL_VIDEO_CTA);
    const beforeFinalInterceptor = await callInPage(cdp, sessionId, () => window.__VIDEOAGENT_QA__);
    assert.equal(videoReadyState.shotCardCount, 12, '视频阶段必须展示 12 个 shot cards');
    assert.equal(videoReadyState.finalButtonCount, 1, '最终确认入口必须唯一');
    assert.equal(videoReadyState.finalButtonDisabled, false, '最终确认入口必须可点击');
    assert.deepEqual(videoReadyState.genericMergeButtons, [], '视频阶段不得出现通用“合并”入口');
    assert.equal(beforeFinalInterceptor.video.postCount, 0, '最终确认前不得提交视频任务');
    assert.equal(beforeFinalInterceptor.imageCalls.length, 0, '完整 fixture 不得调用图片生成接口');
    report.assertions.videoReady = {
      ...videoReadyState,
      tabs: videoTabs,
      videoPostsBeforeFinalConfirm: 0,
      imageCallsBeforeFinalConfirm: 0
    };

    const finalConfirmStartedAt = Date.now();
    await clickUniqueButton(cdp, sessionId, FINAL_VIDEO_CTA);
    const videoSubmissionState = await waitForPage(
      cdp,
      sessionId,
      () => {
        const state = window.__VIDEOAGENT_QA__;
        return state.video.postCount === 12 && state.video.completedPostCount === 12 && state.video.active === 0
          ? state.video
          : false;
      },
      [],
      15000,
      '12 local video POST submissions'
    );
    const videoJobsState = await waitForPage(
      cdp,
      sessionId,
      () => {
        const cards = [...document.querySelectorAll('.shot-card')];
        const statuses = cards.map((card) => {
          const text = card.textContent.replace(/\s+/g, ' ');
          return text.includes('生成中') ? '生成中' : text.includes('提交中') ? '提交中' : 'missing';
        });
        return cards.length === 12 && statuses.every((status) => status !== 'missing')
          ? { cardCount: cards.length, statuses }
          : false;
      },
      [],
      10000,
      '12 submitted video job states'
    );
    const videoSubmissionWaitMs = Date.now() - finalConfirmStartedAt;
    assert.equal(videoSubmissionState.postCount, 12);
    assert.equal(videoSubmissionState.completedPostCount, 12);
    assert.ok(videoSubmissionState.maxActive <= 2, `视频 POST 最大并发不得超过 2，实际 ${videoSubmissionState.maxActive}`);
    assert.equal(videoSubmissionState.maxActive, 2, '12 个任务必须实际达到 2 并发');
    assert.ok(videoSubmissionState.requestBodies.every((body) => body.hasPrompt && body.hasReference));
    assert.ok(videoSubmissionWaitMs < 15000, `视频提交不应等待长轮询，实际 ${videoSubmissionWaitMs}ms`);

    await setViewport(cdp, sessionId, 1440, 1000, false);
    await scrollButtonIntoView(cdp, sessionId, FINAL_VIDEO_CTA);
    const desktopLayout = await inspectLayout(cdp, sessionId, FINAL_VIDEO_CTA);
    assertLayout(desktopLayout, 1440, 1000, 'desktop');
    const desktopShot = path.join(screenshotDir, '05-video-submitted-desktop-1440x1000.png');
    await screenshot(cdp, sessionId, desktopShot);
    assert.deepEqual(await pngDimensions(desktopShot), { width: 1440, height: 1000 });
    screenshots.push('screenshots/05-video-submitted-desktop-1440x1000.png');

    await setViewport(cdp, sessionId, 390, 844, true);
    await scrollButtonIntoView(cdp, sessionId, FINAL_VIDEO_CTA);
    const mobileLayout = await inspectLayout(cdp, sessionId, FINAL_VIDEO_CTA);
    assertLayout(mobileLayout, 390, 844, 'mobile');
    const mobileShot = path.join(screenshotDir, '06-video-submitted-mobile-390x844.png');
    await screenshot(cdp, sessionId, mobileShot);
    assert.deepEqual(await pngDimensions(mobileShot), { width: 390, height: 844 });
    screenshots.push('screenshots/06-video-submitted-mobile-390x844.png');

    await sleep(300);
    const finalInterceptor = await callInPage(cdp, sessionId, () => window.__VIDEOAGENT_QA__);
    assert.deepEqual(finalInterceptor.agentRunCalls.map((call) => call.stage), STAGE_SEQUENCE);
    assert.ok(finalInterceptor.agentRunCalls.every((call) => call.beforeSource === 'request.workspace'));
    assert.equal(finalInterceptor.imageCalls.length, 0, '不得调用真实或本地图片生成接口');
    assert.equal(finalInterceptor.unexpectedRequests.length, 0, '出现未许可 provider 请求');
    assert.equal(finalInterceptor.video.postCount, 12);
    assert.equal(finalInterceptor.video.maxActive, 2);
    assert.ok(finalInterceptor.video.getCount <= 12, '视频 GET 必须保持本地拦截且数量合理');

    const violations = consoleViolations(cdp.console);
    assert.deepEqual(cdp.exceptions, [], `浏览器 Runtime exception: ${cdp.exceptions.join('\n')}`);
    assert.deepEqual(violations, [], `浏览器 console 违规: ${JSON.stringify(violations, null, 2)}`);

    report.durationMs = Date.now() - startedAt;
    report.assertions.videoSubmitted = {
      postCount: videoSubmissionState.postCount,
      completedPostCount: videoSubmissionState.completedPostCount,
      maxActiveVideoPosts: videoSubmissionState.maxActive,
      videoSubmissionWaitMs,
      jobCardCount: videoJobsState.cardCount,
      jobStatuses: videoJobsState.statuses,
      videoGetCount: finalInterceptor.video.getCount
    };
    report.assertions.providerSafety = {
      fetchInstalledBeforeApp: finalInterceptor.installedBeforeApp,
      agentStages: finalInterceptor.agentRunCalls.map((call) => call.stage),
      patchBeforeSources: finalInterceptor.agentRunCalls.map((call) => call.beforeSource),
      imageCalls: finalInterceptor.imageCalls.length,
      videoPostsIntercepted: finalInterceptor.video.postCount,
      videoGetsIntercepted: finalInterceptor.video.getCount,
      unexpectedProviderRequests: finalInterceptor.unexpectedRequests.length
    };
    report.assertions.layout = { desktop: desktopLayout, mobile: mobileLayout };
    report.console = cdp.console;
    report.exceptions = cdp.exceptions;
    report.failedRequests = cdp.failedRequests.filter((item) => !item.canceled);
    report.acceptanceFailures = acceptanceFailures;
    assert.deepEqual(
      acceptanceFailures,
      [],
      `渐进式 demo 验收失败: ${JSON.stringify(acceptanceFailures, null, 2)}`
    );
    report.result = 'pass';
    await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`PASS ${reportPath}`);
    console.log(`Screenshots: ${screenshots.join(', ')}`);
  } catch (error) {
    report.result = 'fail';
    report.durationMs = Date.now() - startedAt;
    report.failure = error instanceof Error ? error.stack || error.message : String(error);
    report.console = cdp?.console || [];
    report.exceptions = cdp?.exceptions || [];
    report.failedRequests = (cdp?.failedRequests || []).filter((item) => !item.canceled);
    report.chromeStderr = chromeStderr;
    try {
      if (cdp && sessionId) {
        report.interceptorState = await callInPage(cdp, sessionId, () => window.__VIDEOAGENT_QA__ || null);
      }
      await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    } catch (_) {}
    throw error;
  } finally {
    cdp?.close();
    await stopChrome(chrome);
    await fs.rm(chromeProfile, { recursive: true, force: true }).catch(() => undefined);
  }
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
