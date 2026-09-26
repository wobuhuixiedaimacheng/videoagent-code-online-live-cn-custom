const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs/promises');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const DEFAULT_URL = process.env.QA_BASE_URL || 'http://localhost:3002';
const CHROME =
  process.env.CHROME_PATH ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const SCENARIO = `为一家社区咖啡店做一条 30 秒小红书短视频。
场景：周二早高峰，地铁口旁边的小店，外面下小雨。
主角：同一位 25 岁店员，黑色短发，白衬衫，绿色围裙，眼神有点疲惫但很真诚；每个镜头都要保持同一个人、同一套衣服。
剧情：一个赶上班的女生先在门口犹豫，看见菜单明码标价，又看到店员现场手冲，最后买一杯带走。
要求：文案像真实店员讲述，不要硬广，不要空泛口号；分镜要能调整眼神、衣服、人物一致性、剧情连通性；输出脚本、分镜、角色一致性和视频生成任务。`;

const AI_FLAVOR_TERMS = [
  '在当今时代',
  '赋能',
  '打造',
  '极致',
  '全新体验',
  '开启',
  '不容错过',
  '解决方案',
  '生态',
  '闭环',
  '矩阵',
  '高效转化',
  '精准触达',
  '深度融合',
  '沉浸式',
  '引爆',
  '破圈',
  '革新',
  '焕新',
  '重塑',
  '多维度',
  '全方位',
  '助力',
  '解锁',
  '价值感',
  '高级感'
];

const CONCRETE_TERMS = [
  '咖啡',
  '地铁口',
  '早高峰',
  '小雨',
  '店员',
  '白衬衫',
  '绿色围裙',
  '黑色短发',
  '眼神',
  '疲惫',
  '真诚',
  '门口',
  '菜单',
  '明码标价',
  '手冲',
  '女生',
  '带走',
  '上班'
];

const TEMPLATE_PATTERNS = [
  /首先[，,]/g,
  /其次[，,]/g,
  /最后[，,]/g,
  /让我们.*一起/g,
  /通过.*实现/g,
  /不仅.*而且/g,
  /不只是.*更是/g,
  /从.*到.*再到/g
];

function parseArgs(argv) {
  const args = { url: DEFAULT_URL, outDir: '.gstack/qa-reports', headed: false };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--url') args.url = argv[++i];
    else if (argv[i] === '--out') args.outDir = argv[++i];
    else if (argv[i] === '--headed') args.headed = true;
  }
  return args;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForJson(url, timeoutMs = 12000) {
  const start = Date.now();
  let lastError;
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
      lastError = new Error(`HTTP ${res.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(250);
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

class CdpClient {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    this.console = [];
    this.exceptions = [];
    this.failedRequests = [];

    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      const key = `${msg.sessionId || ''}:${msg.id || ''}`;
      if (msg.id && this.pending.has(key)) {
        const pending = this.pending.get(key);
        this.pending.delete(key);
        if (msg.error) pending.reject(new Error(JSON.stringify(msg.error)));
        else pending.resolve(msg.result || {});
        return;
      }

      this.events.push(msg);
      if (msg.method === 'Runtime.consoleAPICalled') {
        this.console.push({
          type: msg.params.type,
          text: (msg.params.args || []).map((arg) => arg.value ?? arg.description ?? '').join(' ')
        });
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        this.exceptions.push(msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text || 'Runtime exception');
      }
      if (msg.method === 'Log.entryAdded') {
        this.console.push({ type: msg.params.entry.level, text: msg.params.entry.text });
      }
      if (msg.method === 'Network.loadingFailed') {
        this.failedRequests.push(msg.params);
      }
    });
  }

  send(method, params = {}, sessionId = '') {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      const key = `${sessionId || ''}:${id}`;
      const timer = setTimeout(() => {
        if (this.pending.has(key)) {
          this.pending.delete(key);
          reject(new Error(`CDP timeout: ${method}`));
        }
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

async function evalInPage(cdp, sessionId, expression) {
  const result = await cdp.send(
    'Runtime.evaluate',
    {
      expression,
      returnByValue: true,
      awaitPromise: true
    },
    sessionId
  );
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Runtime evaluation failed');
  return result.result?.value;
}

async function waitFor(cdp, sessionId, expression, timeoutMs, label) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = await evalInPage(cdp, sessionId, expression);
    if (value) return value;
    await sleep(500);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function screenshot(cdp, sessionId, filePath) {
  const result = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }, sessionId);
  await fs.writeFile(filePath, Buffer.from(result.data, 'base64'));
}

function countMatches(text, pattern) {
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

function aiFlavorScore(text) {
  const normalized = text.replace(/\s+/g, '');
  const sentences = text
    .split(/[。！？!?\\n]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 10);
  const buzzwordHits = AI_FLAVOR_TERMS.reduce((sum, term) => sum + countMatches(normalized, new RegExp(term, 'g')), 0);
  const templateHits = TEMPLATE_PATTERNS.reduce((sum, pattern) => sum + countMatches(text, pattern), 0);
  const concreteHits = CONCRETE_TERMS.reduce((sum, term) => sum + countMatches(normalized, new RegExp(term, 'g')), 0);
  const genericSentences = sentences.filter((sentence) => {
    const hasConcrete = CONCRETE_TERMS.some((term) => sentence.includes(term)) || /\\d/.test(sentence);
    const abstractSignals = /(价值|体验|场景|流程|边界|用户|品牌|内容|行动|转化|信任|卖点)/.test(sentence);
    return !hasConcrete && abstractSignals;
  }).length;
  const genericRatio = sentences.length ? genericSentences / sentences.length : 0;
  const score = Math.max(0, buzzwordHits * 5 + templateHits * 8 + genericRatio * 35 - Math.min(concreteHits, 20) * 2.2);
  return Math.round(Math.min(100, score));
}

function assertIncludesAny(text, words, message) {
  assert.ok(words.some((word) => text.includes(word)), message);
}

async function run() {
  const args = parseArgs(process.argv);
  const absoluteOutDir = path.resolve(args.outDir);
  const screenshotDir = path.join(absoluteOutDir, 'screenshots');
  await fs.mkdir(screenshotDir, { recursive: true });

  const chromePort = await freePort();
  const chromeProfile = await fs.mkdtemp(path.join(os.tmpdir(), 'videoagent-qa-chrome-'));
  const chromeArgs = [
    args.headed ? '' : '--headless=new',
    '--disable-gpu',
    '--disable-extensions',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1440,1000',
    `--remote-debugging-port=${chromePort}`,
    `--user-data-dir=${chromeProfile}`,
    'about:blank'
  ].filter(Boolean);
  const chrome = childProcess.spawn(CHROME, chromeArgs, { stdio: ['ignore', 'pipe', 'pipe'] });

  try {
    const cdp = await connectBrowser(chromePort);
    const target = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const attached = await cdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
    const sessionId = attached.sessionId;

    await cdp.send('Runtime.enable', {}, sessionId);
    await cdp.send('Log.enable', {}, sessionId);
    await cdp.send('Network.enable', {}, sessionId);
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send(
      'Emulation.setDeviceMetricsOverride',
      { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false },
      sessionId
    );

    await cdp.send('Page.navigate', { url: args.url }, sessionId);
    await waitFor(
      cdp,
      sessionId,
      `document.readyState === 'complete' && document.body.innerText.includes('描述一个内容目标')`,
      45000,
      'home screen'
    );
    await screenshot(cdp, sessionId, path.join(screenshotDir, 'videoagent-flow-01-home.png'));

    await evalInPage(
      cdp,
      sessionId,
      `(() => {
        const textarea = document.querySelector('textarea[aria-label="给主 Agent 发送内容目标"]');
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
        setter.call(textarea, ${JSON.stringify(SCENARIO)});
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        return textarea.value.length;
      })()`
    );
    await screenshot(cdp, sessionId, path.join(screenshotDir, 'videoagent-flow-02-filled-input.png'));

    await evalInPage(
      cdp,
      sessionId,
      `(() => {
        const textarea = document.querySelector('textarea[aria-label="给主 Agent 发送内容目标"]');
        textarea.closest('form').requestSubmit();
        return true;
      })()`
    );

    await waitFor(cdp, sessionId, `document.body.innerText.includes('正在创建 Mission')`, 15000, 'loading state');
    await waitFor(
      cdp,
      sessionId,
      `(() => {
        const text = document.body.innerText;
        if (text.includes('创建失败') || text.includes('请求失败')) return 'error:' + text.slice(0, 1200);
        return Boolean(document.querySelector('.studio-workbench') && text.includes('合并全部') && text.includes('脚本'));
      })()`,
      240000,
      'generated production package'
    );

    const generatedState = await evalInPage(
      cdp,
      sessionId,
      `(() => ({
        bodyText: document.body.innerText,
        scriptText: document.querySelector('.script-output')?.innerText || '',
        pendingMerge: [...document.querySelectorAll('button')].some((button) => button.innerText.includes('合并全部')),
        tabs: [...document.querySelectorAll('button[role="tab"]')].map((button) => button.innerText.trim()),
        packageRows: document.querySelectorAll('.package-patch-row').length,
        packageFiles: [...document.querySelectorAll('.package-patch-copy strong')].map((item) => item.textContent.trim()),
        packageStageChips: [...document.querySelectorAll('.package-review-stages span')].map((item) => item.textContent.replace(/\\s+/g, ' ').trim()),
        currentNodeRows: document.querySelectorAll('.node-patch-panel .approval-row').length,
        packageListFullyExpanded: (() => {
          const list = document.querySelector('.package-review-list');
          return Boolean(list && Math.abs(list.scrollHeight - list.clientHeight) <= 1);
        })()
      }))()`
    );
    if (typeof generatedState === 'string' && generatedState.startsWith('error:')) throw new Error(generatedState);
    await screenshot(cdp, sessionId, path.join(screenshotDir, 'videoagent-flow-03-generated-package.png'));

    assert.ok(generatedState.scriptText.length >= 80, '生成后必须在主工作区展示可读脚本正文');
    assert.ok(generatedState.pendingMerge, '生成后必须出现待审写入合并入口');
    assert.deepEqual(generatedState.tabs, ['总览', '剧本', '角色', '场景', '分镜', '视频'], '创作阶段导航必须完整');
    assert.ok(generatedState.packageRows >= 10, `主工作区必须展示完整待审制作包，实际只有 ${generatedState.packageRows} 行`);
    for (const file of ['brief.json', 'script.md', 'scenes.json', 'storyboard.json', 'timeline.json', 'asset_prompts.json', 'publish_copy.json', 'compliance_report.json']) {
      assert.ok(generatedState.packageFiles.includes(file), `完整待审制作包缺少 ${file}`);
    }
    assert.ok(generatedState.currentNodeRows < generatedState.packageRows, '主工作区待审包不能退化成当前节点局部 patch');
    assert.ok(generatedState.packageStageChips.length >= 4, '完整待审制作包必须按生产阶段显示计数');
    assert.ok(generatedState.packageListFullyExpanded, '完整待审制作包不能藏在内部滚动列表里');

    const score = aiFlavorScore(generatedState.scriptText);
    assert.ok(score <= 10, `文案 AI 味评分必须 <= 10，实际 ${score}`);
    assertIncludesAny(generatedState.scriptText, ['咖啡', '店员', '手冲', '地铁口', '早高峰'], '脚本必须落到用户输入的具体咖啡店场景');

    await evalInPage(
      cdp,
      sessionId,
      `(() => {
        const button = [...document.querySelectorAll('button')].find((item) => item.innerText.includes('合并全部'));
        button.click();
        return true;
      })()`
    );
    await waitFor(cdp, sessionId, `!document.body.innerText.includes('合并全部')`, 15000, 'patch merge completion');

    await evalInPage(
      cdp,
      sessionId,
      `([...document.querySelectorAll('button[role="tab"]')].find((button) => button.innerText.trim() === '角色').click(), true)`
    );
    await waitFor(
      cdp,
      sessionId,
      `[...document.querySelectorAll('button[role="tab"]')].some((button) => button.innerText.trim() === '角色' && button.classList.contains('active'))`,
      15000,
      'character tab'
    );
    const characterText = await evalInPage(cdp, sessionId, `document.body.innerText`);
    await screenshot(cdp, sessionId, path.join(screenshotDir, 'videoagent-flow-04-character.png'));
    assertIncludesAny(characterText, ['同一个', '保持一致', '一致性'], '角色页必须明确人物一致性');
    assertIncludesAny(characterText, ['服装', '衣服', '白衬衫', '绿色围裙', '发型'], '角色页必须覆盖衣服/发型一致性');
    assertIncludesAny(characterText, ['眼神', '表情', '疲惫', '真诚'], '角色页必须覆盖眼神或表情状态');

    await evalInPage(
      cdp,
      sessionId,
      `([...document.querySelectorAll('button[role="tab"]')].find((button) => button.innerText.trim() === '分镜').click(), true)`
    );
    await waitFor(cdp, sessionId, `document.body.innerText.includes('改画面') && document.body.innerText.includes('改运镜') && document.body.innerText.includes('改动作')`, 15000, 'storyboard tab');
    const storyboardText = await evalInPage(cdp, sessionId, `document.body.innerText`);
    await screenshot(cdp, sessionId, path.join(screenshotDir, 'videoagent-flow-05-storyboard.png'));
    assert.ok((storyboardText.match(/改画面/g) || []).length >= 3, '分镜页至少要有 3 个可调整镜头');
    assertIncludesAny(storyboardText, ['门口', '菜单', '手冲', '带走', '早高峰', '小雨'], '分镜必须呈现连续剧情节点');

    const pageSource = await fs.readFile(path.join(process.cwd(), 'app', 'page.tsx'), 'utf8');
    assert.match(pageSource, /只重写分镜/);
    assert.match(pageSource, /保持其它镜头不变|不动其它镜头/);
    assert.ok(pageSource.includes('void runAgent(prompts[kind]);'), '单镜调整必须直接触发局部重写流程');

    await evalInPage(
      cdp,
      sessionId,
      `([...document.querySelectorAll('button[role="tab"]')].find((button) => button.innerText.trim() === '视频').click(), true)`
    );
    await waitFor(cdp, sessionId, `document.body.innerText.includes('视频生成准备')`, 15000, 'video handoff tab');
    const videoState = await evalInPage(
      cdp,
      sessionId,
      `(() => ({
        text: document.body.innerText,
        shotCards: document.querySelectorAll('.shot-card').length
      }))()`
    );
    const videoText = videoState.text;
    await screenshot(cdp, sessionId, path.join(screenshotDir, 'videoagent-flow-06-video-handoff.png'));
    assertIncludesAny(videoText, ['还不是成片视频', '只是生成前准备'], '视频页不能误导用户以为已经生成成片');
    assertIncludesAny(videoText, ['角色一致性 / 避免项', '角色一致性'], '视频页必须展示角色一致性检查');
    assert.ok(videoState.shotCards >= 3 || /已准备\s+[3-9]\s+个镜头任务/.test(videoText), '视频页必须准备多个镜头任务');
    assertIncludesAny(videoText, ['不要畸形手指', '脸部不一致', '避免项'], '视频任务必须包含一致性或负向约束');

    const report = {
      date: new Date().toISOString(),
      url: args.url,
      scenario: SCENARIO,
      aiFlavorScore: score,
      assertions: {
        scriptReadable: true,
        concreteScenario: true,
        stageTabs: generatedState.tabs,
        characterConsistency: true,
        storyboardAdjustable: true,
        localShotRewrite: true,
        videoHandoffTruthful: true,
        completePackageReview: true,
        packageRows: generatedState.packageRows,
        packageFiles: generatedState.packageFiles
      },
      console: cdp.console,
      exceptions: cdp.exceptions,
      failedRequests: cdp.failedRequests.filter((item) => !item.canceled && !String(item.type || '').includes('Preflight')),
      screenshots: [
        'videoagent-flow-01-home.png',
        'videoagent-flow-02-filled-input.png',
        'videoagent-flow-03-generated-package.png',
        'videoagent-flow-04-character.png',
        'videoagent-flow-05-storyboard.png',
        'videoagent-flow-06-video-handoff.png'
      ]
    };

    const severeConsole = report.console.filter((item) => ['error', 'warning'].includes(item.type) && !/favicon|devtools/i.test(item.text));
    assert.equal(report.exceptions.length, 0, `浏览器 Runtime exception: ${report.exceptions.join('\\n')}`);
    assert.equal(severeConsole.length, 0, `浏览器 console error/warning: ${JSON.stringify(severeConsole, null, 2)}`);

    await fs.writeFile(path.join(absoluteOutDir, 'videoagent-flow-regression.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally {
    chrome.kill('SIGTERM');
  }
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
