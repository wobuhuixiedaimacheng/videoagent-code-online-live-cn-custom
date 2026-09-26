const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, 'page.tsx'), 'utf8');
/*
 * 画布从单文件 StoryCanvas.tsx 拆成了 components/canvas/：
 * 纯逻辑（归一化、布局、持久化）和 React 渲染分开，前者由
 * components/canvas/*.test.cjs 做真实行为测试，这里只守住接线和样式契约。
 */
const canvasDir = path.join(__dirname, '..', 'components', 'canvas');
const readCanvas = (name) => {
  const filePath = path.join(canvasDir, name);
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
};
const canvasSource = readCanvas('ProductionCanvas.tsx');
const canvasNodesSource = readCanvas('nodes.tsx');
const canvasCardSource = readCanvas('StoryCard.tsx');
const canvasGraphSource = readCanvas('graph.ts');
const canvasLayoutSource = readCanvas('layout.ts');
const canvasStorageSource = readCanvas('storage.ts');
const canvasBoardsSourceFile = fs.readFileSync(path.join(__dirname, '..', 'lib', 'canvasBoards.ts'), 'utf8');
const canvasModuleSource = [
  canvasSource,
  canvasNodesSource,
  canvasCardSource,
  canvasGraphSource,
  canvasLayoutSource,
  canvasStorageSource
].join('\n');
/*
 * 去掉注释再断言「不测 DOM」：注释里写着为什么不再走 getBoundingClientRect，
 * 那是文档，不是行为。拿注释当证据会让这条断言永远测不到真东西。
 */
const canvasModuleCode = canvasModuleSource
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');
const boardPath = path.join(__dirname, '..', 'components', 'CharacterDesignBoard.tsx');
const boardSource = fs.existsSync(boardPath) ? fs.readFileSync(boardPath, 'utf8') : '';
const specPath = path.join(__dirname, '..', 'lib', 'characterVisualSpec.ts');
const specSource = fs.existsSync(specPath) ? fs.readFileSync(specPath, 'utf8') : '';
const sceneBoardPath = path.join(__dirname, '..', 'components', 'SceneVisualBoard.tsx');
const sceneBoardSource = fs.existsSync(sceneBoardPath) ? fs.readFileSync(sceneBoardPath, 'utf8') : '';
const sceneSpecPath = path.join(__dirname, '..', 'lib', 'sceneVisualSpec.ts');
const sceneSpecSource = fs.existsSync(sceneSpecPath) ? fs.readFileSync(sceneSpecPath, 'utf8') : '';
const stageGenerationSource = fs.readFileSync(path.join(__dirname, '..', 'lib', 'stageGeneration.ts'), 'utf8');
const runtimeSource = fs.readFileSync(path.join(__dirname, '..', 'components', 'runtime.tsx'), 'utf8');
const styleSource = fs.readFileSync(path.join(__dirname, 'globals.css'), 'utf8');
const workspaceSource = fs.readFileSync(path.join(__dirname, '..', 'lib', 'workspace.ts'), 'utf8');
const qaFlowSource = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'qa', 'videoagent-flow-regression.cjs'), 'utf8');

test('provider status opens model settings from the main surface', () => {
  assert.match(source, /data-testid="model-settings-trigger"/);
  assert.match(source, /setModelPanelOpen\(true\)/);
});

test('model settings expose editable model id inputs for each engine layer', () => {
  for (const layer of ['text', 'image', 'video']) {
    assert.match(source, new RegExp(`${layer}-model-input`));
  }

  assert.match(source, /文本模型/);
  assert.match(source, /图片模型/);
  assert.match(source, /视频模型/);
});

test('model settings show readable layer candidates after loading provider models', () => {
  assert.match(source, /model-option-row/);
  assert.match(source, /modelReadMessage/);
});

test('model secret inputs belong to named forms and avoid browser password warnings', () => {
  assert.equal((source.match(/className="settings-grid model-settings-form"/g) || []).length, 2);
  assert.match(source, /name=\{`\$\{idPrefix\}-api-key`\}/);
  assert.match(source, /autoComplete="off"/);
});

test('the browser regression uses the same localhost origin as the running app', () => {
  assert.match(qaFlowSource, /const DEFAULT_URL = process\.env\.QA_BASE_URL \|\| 'http:\/\/localhost:3000'/);
  assert.doesNotMatch(qaFlowSource, /const DEFAULT_URL = .*127\.0\.0\.1/);
});

test('script output is promoted to a readable asset surface after generation', () => {
  assert.match(source, /function revealScriptOutput\(\)/);
  assert.match(source, /focusStudioStage\(stage\)/);
  assert.match(source, /className="production-script-review"/);
  assert.match(source, /id="production-script-body"/);
  assert.match(source, /function saveScriptDraft\(\)/);
  assert.match(source, /markStageDraft\(flow, \{ stage: 'script'/);
});

test('script reveal links the selected asset, patch, and inspector content', () => {
  assert.match(source, /filePath === 'script\.md' \|\| item\.type === 'script'/);
  assert.match(source, /selectedAssetPatch/);
  assert.match(source, /activeInspectorPatch/);
  assert.match(source, /fileName=\{inspectorFileName\}/);
  assert.match(source, /fileBody=\{inspectorFileBody\}/);
});

test('asset selection updates the main file surface without opening inspector', () => {
  assert.match(source, /const selectedAssetRawBody = selectedAssetPatch\?\.after \|\| selectedFile\?\.content/);
  assert.match(source, /const selectedAssetBody =/);
  assert.match(source, /reviewContent=\{nextGeneratingStage === activeProductionStage \? null : <>/);
  assert.match(canvasSource, /story-review-body/);
  assert.match(source, /当前节点检查器/);
  const selectAssetBody = source.match(/function selectAsset\(id: string\) \{([\s\S]*?)\n  \}/)?.[1] || '';
  assert.ok(selectAssetBody.length > 0);
  assert.doesNotMatch(selectAssetBody, /setInspectorOpen\(true\)/);
  assert.doesNotMatch(selectAssetBody, /setInspectorDocked\(true\)/);
});

test('draft missions use a focused surface until generated assets exist', () => {
  assert.match(source, /const hasWorkspaceAssets = Boolean\(\s*proposedWorkspace\?\.files\.some\(\(file\) => !isInternalWorkspaceFile\(file\.path\) && file\.path !== '\.aigc\/MEMORY\.md'\) \|\|\s*storedPendingPatches\.some\(\(patch\) => isProductionStageFile\(patch\.filePath\)\)\s*\)/);
  assert.doesNotMatch(source, /workspace\.files\.length > 1/);
  assert.match(source, /const hasOutput = hasWorkspaceAssets/);
  assert.match(source, /const focusMode = hasUserConversation && !hasOutput/);
  assert.match(source, /focusMode \? \(/);
  assert.match(source, /className="focus-view"/);
});

test('side panels start closed and are opened only on demand', () => {
  assert.match(source, /useState\(false\);\n  const \[inspectorDocked, setInspectorDocked\] = useState\(false\)/);
  assert.doesNotMatch(source, /if \(nextScriptPatch \|\| nextScriptAsset\) \{\n\s+setInspectorOpen\(true\)/);
  assert.match(source, /function revealScriptOutput\(\)/);
});

test('full canvas mode does not keep side-panel grid classes', () => {
  assert.match(source, /const studioMode = hasOutput && !homeMode && !focusMode && !navPageKind/);
  assert.match(source, /const appFullCanvas = fullCanvas \|\| studioMode/);
  assert.match(source, /!appFullCanvas && !contextDocked \? 'context-closed' : ''/);
  assert.match(source, /!appFullCanvas && !inspectorDocked \? 'inspector-closed' : ''/);
});

test('script results suppress setup chrome in the main workbench', () => {
  assert.match(source, /const hasScriptOutput = Boolean\(scriptBody\.trim\(\)\)/);
  assert.match(source, /className="studio-assistant-composer"/);
  assert.match(source, /className=\{`studio-canvas story-canvas-host \$\{error \? .with-error-banner. : ..}`\}/);
  assert.doesNotMatch(source, /className=\{`composer \$\{hasScriptOutput \? 'compact-composer' : ''\}`\}/);
});

test('video generation handoff uses user-facing language', () => {
  assert.match(source, /<h2>视频生成准备<\/h2>/);
  assert.match(source, /把已确认的脚本、分镜和素材提示词整理成视频模型任务/);
  assert.match(source, /镜头任务、首帧、角色一致性和生成参数/);
  assert.doesNotMatch(source, /Video Generation 交接 · L4/);
  assert.doesNotMatch(source, /视频生成交接/);
  assert.doesNotMatch(source, /确认后输出镜头级 prompt、首帧、角色一致性、negative 和 render specs/);
  assert.doesNotMatch(source, /重新准备镜头级视频 prompt、首帧 prompt、角色一致性 prompt、negative prompt 和 render task specs/);
  assert.match(runtimeSource, /这里还不是成片视频，只是生成前准备/);
  assert.match(runtimeSource, /角色一致性 \/ 避免项/);
  assert.match(runtimeSource, /待准备视频任务|已准备/);
  assert.doesNotMatch(runtimeSource, /角色一致性 \/ Negative|prompt_ready|renderQueue.*只证明|输出不是 MP4/);
});

test('asset prompt selection shows a Chinese review surface instead of raw task JSON', () => {
  assert.match(source, /function formatAssetPromptsReview/);
  assert.match(source, /视频生成任务预览/);
  assert.match(source, /旧版本英文提示词，需要重新生成中文版本后再审查/);
  assert.match(source, /selectedAssetFileName === 'asset_prompts\.json'\s+\?\s+formatAssetPromptsReview\(assetPrompts\)/);
});

test('video generation starts only through final confirmation or failed-job retry', () => {
  assert.match(source, /createVideoRenderJobs/);
  assert.match(source, /async function confirmVideoTasksAndStartRendering/);
  assert.match(source, /async function retryFailedVideoTasks/);
  assert.match(source, /async function submitVideoRenderJobs/);
  assert.match(source, /fetch\('\/api\/video\/render'/);
  assert.doesNotMatch(source, /async function submitVideoRender\(/);
  assert.doesNotMatch(source, /const \[videoRender, setVideoRender\]/);
  assert.match(source, /function buildVideoRenderPrompt/);
  assert.match(source, /referenceImageUrl\?: string/);
  assert.match(source, /referenceImages\?: string\[\]/);
  assert.match(source, /mode\?: string/);
  assert.match(source, /function referenceImagesForPrompt/);
  assert.match(source, /function videoModeForPrompt/);
  // 总时长不再写死：小节数和小节时长都由 videoSpec.episodeSeconds 经 lib/episodePlan 推出来。
  assert.doesNotMatch(source, /const VIDEO_RENDER_SEGMENT_SECONDS/);
  assert.doesNotMatch(source, /const VIDEO_RENDER_TOTAL_SECONDS/);
  assert.match(source, /const episode = episodePlan\(videoSpec\.episodeSeconds\)/);
  assert.match(source, /numFrames: 361/);
  assert.match(source, /一个中文小节/);
  assert.match(source, /本次只提交一个镜头任务/);
  // 小节序号和总数按实际镜头数算：12 个镜头全都自称「第一个小节」时，模型拿到的叙事位置全是错的。
  assert.match(source, /不要把 \$\{segmentTotal\} 个小节混在一次视频生成请求里/);
  assert.match(source, /第 \$\{segmentIndex\} 个小节，全片共 \$\{segmentTotal\} 个小节/);
  assert.doesNotMatch(source, /分钟成片的第一个小节/);
  // 台词必须来自已确认分镜，不能让视频模型自己即兴——即兴的结果是先说英文再转中文。
  assert.match(source, /function shotNarration/);
  assert.match(source, /本小节的中文台词，用普通话完整念出，一字不改/);
  assert.match(source, /不要试图一次生成整条长视频/);
  assert.match(source, /禁止英文、拼音、拉丁字母、乱码、可读招牌、屏幕文字、书本文字和包装文字/);
  // 画面零文字 + 中文人声是两条独立约束：只压画面，模型照样会先说一段英文再转中文。
  assert.match(source, /画面里不得出现任何文字/);
  assert.match(source, /所有人声一律使用中文普通话/);
  assert.match(source, /禁止英文、外语、中英夹杂和英文歌词/);
  assert.match(source, /function chineseOnlyVideoNegativePrompt/);
  assert.match(source, /英文语音、英文对白、英文旁白、英文歌词、外语配音/);
  assert.match(source, /targetDurationSeconds/);
  assert.match(source, /const VIDEO_MAX_NUM_FRAMES = 409/);
  assert.match(source, /function normalizeAgnesNumFrames/);
  assert.match(source, /roundFrameRate\(VIDEO_MAX_NUM_FRAMES \/ seconds\)/);
  assert.match(source, /const basePrompt = buildVideoRenderPrompt\(prompt, targetDuration, data\)/);
  // 质检重渲的策略指令追加在拼装好的提示词后面，不是替换它——参考图、台词、规格都还要照常生效。
  assert.match(source, /prompt: job\.qaDirective \? `\$\{basePrompt\}\\n\\n\$\{job\.qaDirective\}` : basePrompt/);
  // framing = 只参与构图的参考图。身份锚点图不进 framing，否则「场景图 + 两张人脸」
  // 会被当成三帧关键帧序列，视频变成场景渐变到人脸特写。
  assert.match(source, /image: framing.length === 1 && renderMode !== 'keyframes' \? framing\[0\] : undefined/);
  assert.match(source, /keyframes: framing.length > 1 \|\| renderMode === 'keyframes' \? framing : undefined/);
  // 但「不进 framing」不等于「不发」：身份锚点图曾经只用来拼一段文字，一张都没进过渲染请求，
  // 于是视频这一层锁脸完全靠文字，脸就在中式和欧美之间来回切。它必须走独立字段发出去。
  assert.match(source, /identityImages: identityImages.length \? identityImages : undefined/);
  assert.match(source, /const identityImages = identities\.filter\(\(url\) => !framing\.includes\(url\)\)/);
  // 锁脸重渲要把身份锚点图提到首帧：这时候场景图上那张脸已经是错的，
  // 继续拿它当首帧就是让模型照着错的脸再画一遍。
  assert.match(source, /const reanchor = job\.qaStrategy === 'reanchor' && identities\.length > 0/);
  // 只断言不变量，不锁死整条表达式：framing 的分支还会继续长（尾帧、关键帧…），
  // 逐字匹配会让每一次正常演进都变成一条假失败。
  assert.match(source, /const framing = reanchor\s*\n?\s*\? identities\.slice\(0, 1\)/);
  assert.match(source, /frames\.length \? frames : identities\.slice\(0, 1\)/);
  // 上游不认这个字段时服务端会去掉它重发，那是一层静默降级，必须让用户看到。
  assert.match(source, /if \(result\.identityReferenceNote\) setError\(result\.identityReferenceNote\)/);
  assert.match(source, /mode: renderMode/);
  assert.match(source, /function partitionReferenceImages/);
  assert.match(source, /const renderMode = videoModeForPrompt\(prompt, renderSpec, framing\)/);
  // 四个入口：最终确认、失败重试、刷新打断后的续跑，以及画面质检不通过后的自动重渲。
  // 续跑只提交 ready 状态的镜头——这些任务由已确认的批次创建、且一次都没发出去过，不会凭空产生新消费。
  // 质检重渲是唯一一个会自动产生新消费的入口，因此它被 VIDEO_QA_MAX_ATTEMPTS 硬限制在每镜头 2 次。
  assert.equal((source.match(/fetch\('\/api\/video\/render'/g) || []).length, 4, 'video renders may only be POSTed from final confirmation, failed retry, interrupted-batch resume, and bounded QA re-render');
  assert.match(source, /async function postVideoRender/);
  assert.match(source, /async function runVideoQaForJob/);
  assert.match(source, /const readyJobs = resubmittableRestoredVideoJobs\(allBatchJobs\)/);
  // 续跑传的是整批而不是 readyJobs：链式调度要看到已完成的前序镜头，才知道哪些 ready
  // 现在能提交、哪些还得等前一镜。「不凭空产生新消费」这个不变量没变——
  // readyChainJobIds 只会挑 status === 'ready' 的镜头，和 resubmittableRestoredVideoJobs 同一个判据。
  assert.match(source, /submitChainedVideoJobs\(allBatchJobs, resumeToken, data/);
  // readyChainJobIds 只挑 ready 状态的镜头，判据见 lib/shotChain.test.cjs。
  assert.match(source, /readyChainJobIds\(chains, new Map/);
  assert.doesNotMatch(runtimeSource, /VideoRenderState/);
  assert.doesNotMatch(runtimeSource, /onRender/);
  assert.match(runtimeSource, /onConfirmVideoTasks/);
  assert.match(runtimeSource, /onRetryFailed/);
  assert.match(runtimeSource, /onUpdatePrompt/);
  assert.match(runtimeSource, /onReplaceReference/);
  assert.match(runtimeSource, /onReprepareShot/);
  // 片段全部渲染完 ≠ 拿到成片。以前这里断言界面必须一直写着「尚未合成为单一成片文件」，
  // 因为当时确实没有合成功能。现在合成做出来了，要守的不变量随之变成：
  // 片段齐了必须给出通往成片的下一步，而不是让用户停在一句状态描述上。
  assert.match(runtimeSource, /全部小节已生成/);
  assert.match(runtimeSource, /<FinalCutPanel/);
  assert.match(runtimeSource, /合成完整视频/);
  assert.match(runtimeSource, /<video/);
  // 连续预览是唯一能在产品内暴露段落接缝的入口，不能被顺手删掉。
  assert.match(runtimeSource, /<ClipReel /);
  assert.match(runtimeSource, /这不是最终合成文件/);
});

test('generic approval cannot consume a video task patch or invoke generic video confirmation', () => {
  assert.match(source, /if \(productionStage === 'video'\)/);
  assert.match(source, /视频任务 patch 只能通过“确认视频任务并开始生成”提交/);
  assert.match(source, /const genericPendingPatches = pendingPatches\.filter\(\(patch\) => productionStageForFile\(patch\.filePath\) !== 'video'\)/);
  assert.match(source, /const genericSelectedNodePatches = selectedNodePatches\.filter\(\(patch\) => productionStageForFile\(patch\.filePath\) !== 'video'\)/);
  assert.match(source, /if \(stage === 'video'\) \{/);
  assert.match(source, /通用确认不能消费视频任务 patch/);
});

test('video task patches never enter a generic ApprovalQueue', () => {
  const queueBindings = Array.from(source.matchAll(/<ApprovalQueue[\s\S]*?patches=\{([^}]+)\}/g)).map((match) => match[1].trim());
  assert.deepEqual(queueBindings, ['genericSelectedNodePatches', 'genericPendingPatches']);
  assert.doesNotMatch(source, /<ApprovalQueue[\s\S]*?patches=\{(?:selectedNodePatches|pendingPatches)\}/);
  assert.match(source, /const selectedNodePatches = selectedNode \? pendingPatches\.filter/);
  assert.match(source, /onConfirmVideoTasks=\{\(\) => void confirmVideoTasksAndStartRendering\(\)\}/);
});

test('website can load the Xiaopeng V2 production workspace through a local demo URL', () => {
  assert.match(source, /async function loadDemoWorkspaceFromQuery/);
  assert.match(source, /new URLSearchParams\(window\.location\.search\)\.get\('demo'\)/);
  assert.match(source, /fetch\(`\/api\/demo-workspace\/\$\{encodeURIComponent\(demoId\)\}`\)/);
  assert.match(source, /setWorkspace\(demoWorkspace\)/);
  // 欢迎语以前写死成「12 个十五秒视频任务」，只对 xiaopeng-v2 成立。
  // 分镜按时长拆分之后镜头数不再等于场景数，写死的数字会和用户看到的对不上，改成从工作区实算。
  assert.match(source, /const demoShotCount = storyboardScenes\(demoWorkspace\)\.length/);
  assert.match(source, /const demoSceneCount = productionScenesFromWorkspace\(demoWorkspace\)\.length/);
  // 欢迎语必须引用实算出来的这两个数，而不是任何字面量。
  assert.match(source, /\$\{demoSceneCount\} 个场景、\$\{demoShotCount\} 个镜头/);
});

test('workspace persistence is scoped by project or demo and restores a demo before fetching', () => {
  assert.match(source, /function workspaceStorageKey\(projectId: string\)/);
  assert.match(source, /videoagent-workspace:\$\{projectId\}/);
  assert.match(source, /function demoStorageKey\(demoId: string\)/);
  assert.match(source, /videoagent-demo-workspace:\$\{demoId\}/);
  assert.match(source, /const progressiveDemoSeedVersions: Record<string, string> = \{/);
  assert.match(source, /'xiaopeng-v2': 'progressive-v1'/);
  assert.match(source, /videoagent-demo-workspace:\$\{demoId\}:\$\{seedVersion\}/);
  assert.match(source, /window\.localStorage\.getItem\(storageKey\)/);
  assert.match(source, /const savedDemo = readStoredWorkspace\(demoStorageKey\(demoId\)\)/);
  assert.match(source, /if \(savedDemo\) \{/);
  assert.match(source, /window\.localStorage\.removeItem\(demoStorageKey\(demoId\)\)/);
  assert.match(source, /重置 Demo/);
});

test('autopilot keeps manual approval-required drafts out of automatic consumption', () => {
  assert.match(source, /autopilotPatchesForRun\(workspace, lastRun\.patchOperations\)/);
  assert.doesNotMatch(source, /const lowRisk = pendingPatches\.filter\(\(patch\) => patch\.riskLevel === 'low'\)/);
});

test('stored workspaces require a full runtime snapshot guard', () => {
  assert.match(source, /isWorkspaceSnapshot\(parsed\)/);
  assert.match(source, /file\.path === PRODUCTION_FLOW_PATH/);
});

test('unreadable stored workspaces are quarantined rather than silently replaced', () => {
  assert.match(source, /function quarantineStoredWorkspace\(storageKey: string, raw: string\)/);
  assert.match(source, /window\.localStorage\.setItem\(workspaceRecoveryKey\(storageKey\), raw\)/);
  assert.match(source, /if \(restored\.notice\) setError\(restored\.notice\)/);
});

test('the main persistence path checks the quota budget before writing', () => {
  assert.match(source, /const payload = encodeWorkspaceEnvelope\(workspace, now\(\)\)/);
  assert.match(source, /const size = localStorageByteLength\(payload\)/);
  assert.match(source, /if \(size > MAX_WORKSPACE_PERSISTED_BYTES\)/);
  assert.match(source, /isQuotaExceededError\(err\)/);
});

test('resetting a project archives it first and only then drops the browser cache key', () => {
  assert.match(source, /const previousProjectId = workspace\?\.projectId/);
  // 旧项目的浏览器缓存 key 只有在磁盘归档成功后才允许清掉——这是「新建即丢历史」的修复核心。
  assert.match(source, /previousProjectId !== next\.projectId && archived/);
  assert.match(source, /window\.localStorage\.removeItem\(workspaceStorageKey\(previousProjectId\)\)/);
  assert.match(source, /archiveProjectBeforeLeaving/);
});

test('projects archive to the server store and load from it before the browser cache', () => {
  // 磁盘档案（data/projects/）是真源：防抖归档、串行写队列、启动时优先从服务端恢复。
  assert.match(source, /function persistActiveProjectToServer\(\)/);
  assert.match(source, /projectSaveQueueRef\.current\.then/);
  assert.match(source, /fetch\(`\/api\/projects\/\$\{encodeURIComponent\(workspace\.projectId\)\}`/);
  assert.match(source, /async function loadPersistedWorkspace\(\)/);
  assert.match(source, /workspaceHasUserContent\(/);
  // 服务端读不到才回退 localStorage，并把存量项目立即补写进档案。
  assert.match(source, /void pushProjectRecord\(loaded, restoredMessages, loadedSpec, now\(\)\)/);
  // 历史面板的三件事：打开、切换、删除。
  assert.match(source, /function openHistoryPanel\(\)/);
  assert.match(source, /async function openProjectFromHistory\(projectId: string\)/);
  assert.match(source, /async function deleteProjectFromHistory\(projectId: string\)/);
});

test('stage confirmation uses the transaction workspace as the downstream base', () => {
  assert.match(source, /const reviewWorkspace = savePendingPatches\(workspace, pendingPatches\)/);
  assert.match(source, /const transaction = confirmStageInWorkspace\(reviewWorkspace, \{/);
  assert.match(source, /outputFiles: stageConfig\(stage\)\.outputFiles/);
  assert.match(source, /setWorkspace\(transaction\.workspace\)/);
  assert.match(source, /requestStageDraft\(nextStage, transaction\.workspace, nextJobId\)/);
});

test('stage confirmation consumes drafts and starts exactly one downstream job', () => {
  assert.match(source, /async function confirmProductionStage\(stage: ProductionStageId\)/);
  assert.match(source, /validateStageAssets\(stage, proposedWorkspace\)/);
  assert.match(source, /confirmStageInWorkspace\(reviewWorkspace/);
  assert.match(source, /expectedDraftVersion/);
  assert.match(source, /confirmationKey/);
  assert.match(source, /requestStageDraft\(nextStage/);
});

test('downstream confirmation and request share exact stage source versions', () => {
  assert.match(source, /const nextSourceVersions = nextStage \? sourceVersionsForStage\(proposedWorkspace, nextStage\) : \{\}/);
  assert.match(source, /sourceVersions: nextSourceVersions/);
  assert.match(source, /requestStageDraft\(nextStage, transaction\.workspace, nextJobId\)/);
  assert.match(source, /const nextFlow = beginStageGeneration\(flow, stage, generationJobId, sourceVersions\)/);
  assert.match(source, /generationWorkspace = nextFlow === flow \? baseWorkspace : writeProductionFlow\(baseWorkspace, nextFlow\)/);
  assert.match(stageGenerationSource, /character: \['script\.md'\]/);
  assert.match(stageGenerationSource, /scene: \['script\.md', 'characters\.json'\]/);
});

test('stage confirmation has an atomic in-flight gate and confirmed repeats are no-ops', () => {
  assert.match(source, /const confirmationInFlightRef = useRef\(new Set<string>\(\)\)/);
  assert.match(source, /confirmationInFlightRef\.current\.has\(confirmationKey\)/);
  assert.match(source, /confirmationInFlightRef\.current\.add\(confirmationKey\)/);
  assert.match(source, /finally \{\s*confirmationInFlightRef\.current\.delete\(confirmationKey\)/);
  assert.match(source, /record\.status !== 'ready_for_review'/);
});

test('late stage responses are rejected before their patches become visible', () => {
  assert.match(source, /completeStageGeneration\(/);
  assert.match(source, /const stageGenerationJobRef = useRef\(new Map<ProductionStageId, string>\(\)\)/);
  assert.match(source, /function isCurrentStageRun/);
  assert.match(source, /!isCurrentStageRun\(stage, generationJobId, run\.token\)/);
  // 被拒时依然不得写入 patch，但必须留下可解释的原因，而不是静默 return。
  assert.match(source, /if \(!completion\.accepted\) \{[\s\S]*?writeRejection =[\s\S]*?return current;\s*\}/);
  assert.match(source, /if \(writeRejection\) \{[\s\S]*?failCurrentStageRun\(stage, run, message\)/);
  assert.match(source, /appendPendingPatches\(current, scopedPatches\)/);
  assert.match(source, /if \(!scopedPatches\.length\) throw new Error\(`\$\{studioStageName\(stage\)\}没有产生可审查的新 patch/);
});

test('autopilot never merges production stage patches', () => {
  assert.match(source, /!isProductionStageFile\(patch\.filePath\)/);
});

test('generic patch controls cannot bypass production stage confirmation', () => {
  assert.match(source, /function productionStageForFile\(filePath: string\): ProductionStageId \| null/);
  assert.match(source, /const productionStages = new Set\(patches\.map\(\(patch\) => productionStageForFile\(patch\.filePath\)\)\.filter\(/);
  assert.match(source, /void confirmProductionStage\(productionStage\)/);
  assert.match(source, /生产阶段 patch 不能与其它 patch 一起合并/);
  assert.match(source, /生产阶段 patch 不能通过通用队列拒绝/);
  assert.match(source, /void confirmProductionStage\(productionStage\);\s+return;[\s\S]*?consumePendingPatches\(/);
});

test('all visible production confirmation and regeneration controls use stage transactions', () => {
  assert.match(source, /onClick=\{\(\) => void confirmProductionStage\('character'\)\}/);
  assert.match(source, /function regenerateProductionStage\(node: StudioCanvasNode\)/);
  // 断言的是「进函数就聚焦到这个阶段」，字符距离只是个粗糙的代理。
  // 参数表每加一条（带注释的可选参数）都会把它顶出窗口，卡得太紧只会变成噪音。
  assert.match(source, /async function requestStageDraft\([\s\S]{0,1200}focusStudioStage\(stage\)/);
  assert.doesNotMatch(source, /requestStageDraft\(stage, workspace, undefined, node\.action/);
  assert.match(source, /stageOutputFilesForWorkspace\(stage, 'regenerate', workspace\)/);
  assert.match(source, /requestStageDraft\(stage, workspace, undefined, revisionText,[\s\S]{0,200}'revise', stageRequestTarget, requestedOutputFiles\)/);
  assert.match(source, /stageRequestMode:\s*stageRequestMode/);
  assert.match(source, /stageRequestTarget,\s*requestedOutputFiles/);
  assert.match(source, /instruction: \[requestText\.trim\(\), buildSpecInstruction\(videoSpec\)\]\.filter\(Boolean\)\.join\('\\n\\n'\)/);
  assert.doesNotMatch(source, /instruction: \[requestText, stageGenerationInstruction/);
  assert.match(source, /onRegenerate=\{\(lane\) => \{/);
  assert.match(source, /if \(source\) regenerateProductionStage\(source\);/);
});

test('failed character and scene stages retry only missing image jobs with a new generation job', () => {
  assert.match(source, /flow\.stages\[stage\]\.status === 'failed'/);
  assert.match(source, /uid\(`\$\{stage\}-image-retry`\)/);
  assert.match(source, /const run = beginStageRun\(stage, generationJobId\)/);
  assert.match(source, /generateMissingCharacterImages\(draft, run\)/);
  assert.match(source, /generateMissingSceneImages\(draft, run\)/);
});

test('manual character and scene mutations create re-confirmable revision drafts and invalidate old runs', () => {
  assert.match(source, /function beginManualStageRun/);
  assert.match(source, /function persistCharacterMetadata[\s\S]{0,2400}origin:\s*\{[\s\S]{0,140}productionStage:\s*'character'[\s\S]{0,140}generationJobId:\s*run\.generationJobId/);
  assert.match(source, /function currentStageDraftWorkspace/);
  assert.doesNotMatch(source, /applyPatchesForPreview\([^\n]*readPendingPatches/);
  assert.match(source, /function abortStageRunsFrom/);
  assert.match(source, /abortStageRunsFrom\(stage\)/);
  assert.match(source, /beginStageGeneration\(flow, stage, generationJobId, sourceVersions\)/);
  assert.match(source, /markStageDraft\(flow, \{ stage, generationJobId, sourceVersions \}\)/);
  assert.match(source, /abort\(\)/);
  assert.match(source, /AbortController/);
  assert.match(source, /isCurrentStageRun/);
  assert.match(source, /signal: run\.controller\.signal/);
  assert.match(source, /MAX_PERSISTED_IMAGE_BYTES = 512 \* 1024/);
  assert.match(source, /MAX_WORKSPACE_PERSISTED_BYTES = 3 \* 1024 \* 1024/);
  // 图片拒收的门槛现在是磁盘档案上限（32MB），不再是 3MB 的 localStorage 缓存上限。
  assert.match(source, /MAX_WORKSPACE_ARCHIVE_BYTES = 32 \* 1024 \* 1024/);
  assert.match(source, /档案上限，这张图没有写入/);
});

test('superseded image batches stop before later requests and cannot persist over uploads', () => {
  assert.match(source, /stageRunRef\.current\.get\(stage\)\?\.controller\.abort\(\)/);
  assert.match(source, /for \(let index = 0; index < batchJobs\.length; index \+= 2\)/);
  // 批次被接管时必须停下，并且当场把阶段收尾，不能留在 generating 永远转圈。
  assert.match(source, /if \(!isCurrentStageRun\(stage, run\.generationJobId, run\.token\)\) \{\s*abandonStageImageGeneration\(stage, run\);\s*return false;\s*\}/);
  assert.match(source, /renderStageImage\(job, run\.controller\.signal\)/);
  assert.match(source, /result\.status === 'fulfilled' && isCurrentStageRun/);
  // productionStage 而不是 result.stage：镜头首帧图的 stage 是 'shot'，它属于分镜阶段
  // 但自己不是一个制作阶段，直接拿去查 flow.stages 会得到 undefined，整条写入静默失效。
  assert.match(source, /if \(!isCurrentStageRun\(productionStage, activeRun\.generationJobId, activeRun\.token\)\) return current;/);
  assert.match(source, /const productionStage: ProductionStageId = result\.stage === 'shot' \? 'storyboard' : result\.stage/);
  assert.match(source, /canPersistUploadedDataUrl\(imageUrl\)/);
  assert.match(source, /fitsWorkspacePersistence\(finalized\)/);
});

test('character expression UI persists all twelve canonical ids', () => {
  for (const id of ['joy', 'anger', 'sadness', 'fear', 'surprise', 'disgust', 'shy', 'nervous', 'confused', 'awkward', 'expectant', 'calm']) {
    assert.match(source, new RegExp(`id: '${id}'`));
  }
  assert.match(source, /const DEFAULT_CHARACTER_EXPRESSION_IDS: CharacterExpressionId\[\] = CHARACTER_EXPRESSION_OPTIONS\.map/);
});

test('an older request cannot clear loading while a newer request remains active', () => {
  assert.match(source, /const activeStageGenerationCountRef = useRef\(0\)/);
  assert.match(source, /activeStageGenerationCountRef\.current \+= 1/);
  assert.match(source, /activeStageGenerationCountRef\.current = Math\.max\(0, activeStageGenerationCountRef\.current - 1\)/);
  assert.match(source, /setLoading\(activeStageGenerationCountRef\.current > 0\)/);
});

test('video generation polls the submitted batch until every provider task reaches a terminal state', () => {
  assert.match(source, /const VIDEO_POLL_INTERVAL_MS = 65000/);
  assert.match(source, /const VIDEO_POLL_MAX_ATTEMPTS = \d+/);
  assert.match(source, /async function pollVideoRenderBatch\(batchToken: number, attempt = 1\)/);
  assert.match(source, /Promise\.all\(pollingJobs\.map/);
  assert.match(source, /normalizeVideoProviderStatus\(data\.status, data\.videoUrl\)/);
  assert.match(source, /attempt < VIDEO_POLL_MAX_ATTEMPTS/);
  assert.match(source, /scheduleVideoBatchPoll\(batchToken, attempt \+ 1\)/);
  assert.match(source, /scheduleVideoBatchPoll\(batchToken, 1\)/);
  assert.match(source, /batchToken !== videoBatchRunRef\.current/);
  assert.match(source, /timeoutPendingVideoJobIds\(outcomes\)/);
});

test('active video jobs disable all task-edit entry points before they can invalidate a batch', () => {
  assert.match(source, /function hasActiveVideoJobs/);
  assert.match(source, /if \(hasActiveVideoJobs\(workspace\)\) \{/);
  // 合成期间也不能改镜头：改了会让正在被 ffmpeg 拼的那批片段和任务包对不上。
  assert.match(source, /editingDisabled=\{hasActiveVideoJobs\(workspace\) \|\| isFinalCutInFlight\(productionFlow\.finalCut\)\}/);
  assert.match(runtimeSource, /editingDisabled: boolean/);
  assert.match(runtimeSource, /disabled=\{editingDisabled\}/);
});

test('restored submitted video jobs schedule one guarded recovery polling batch', () => {
  assert.match(source, /const videoRecoveryKeyRef = useRef\(''\)/);
  assert.match(source, /videoRecoveryBatchKey\(workspace\.projectId, allBatchJobs\)/);
  assert.match(source, /const hasActiveBatchJobs = allBatchJobs\.some/);
  assert.match(source, /if \(!hasActiveBatchJobs\) \{/);
  assert.match(source, /if \(!resumableJobs\.length\) return;/);
  assert.match(source, /if \(videoSubmissionInFlightRef\.current\) return;/);
  assert.match(source, /if \(videoRecoveryKeyRef\.current === recoveryKey\) return/);
  assert.match(source, /scheduleVideoBatchPoll\(batchToken, 1\)/);
});

test('synchronous completed submissions do not require a provider task id', () => {
  assert.match(source, /finalizeVideoSubmission\(normalizedStatus, providerTaskId\)/);
  assert.match(source, /submission\.missingProviderTaskId/);
});

test('output workbench adopts a progressive practical production layout', () => {
  assert.match(source, /const workbenchClassName = `studio-workbench\$\{assistantHidden \? ' assistant-hidden' : ''\}\$\{inspectorCollapsed \? ' inspector-suppressed' : ''\}`/);
  assert.match(source, /className=\{workbenchClassName\}/);
  assert.match(source, /className="studio-assistant"/);
  assert.match(source, /制作助理/);
  assert.match(source, /className="studio-stage-nav"/);
  for (const stage of ['总览', '剧本', '角色', '场景', '分镜', '视频']) {
    assert.match(source, new RegExp(stage));
  }
  assert.match(source, /<ProductionCanvas/);
  assert.match(source, /storyLanes/);
  assert.match(source, /当前节点检查器/);
});

test('both workbench side panels can be collapsed from the topbar', () => {
  // 收起要整列让位给画布，不是 visibility:hidden 留着一条空槽。
  assert.match(source, /\{!assistantHidden && <aside className="studio-assistant">/);
  assert.match(styleSource, /\.studio-workbench\.assistant-hidden\s*\{[\s\S]*?grid-template-columns:\s*minmax\(700px, 1fr\) 310px/);
  assert.match(styleSource, /\.studio-workbench\.assistant-hidden\.inspector-suppressed\s*\{[\s\S]*?grid-template-columns:\s*minmax\(700px, 1fr\)/);
  assert.match(source, /className=\{`studio-panel-toggle \$\{assistantHidden \? 'collapsed' : ''\}`\}/);
  assert.match(source, /className=\{`studio-panel-toggle \$\{inspectorCollapsed \? 'collapsed' : ''\}`\}/);
  // 生成中右栏本来就没有可审查的内容，开关要停用，别给一个点了没反应的承诺。
  assert.match(source, /disabled=\{stageReviewSuppressed\}/);
  // 偏好在点击时落盘。读一个 effect、写一个 effect 的写法会在挂载时用初始值
  // 把刚读出来的偏好覆盖掉，用户收起的栏刷新一次就自己弹回来。
  assert.match(source, /const togglePanelHidden = \(panel: 'assistant' \| 'inspector', hidden: boolean\)/);
  assert.match(source, /window\.localStorage\.setItem\(`videoagent-\$\{panel\}-hidden`/);
  assert.doesNotMatch(source, /\}, \[assistantHidden\]\)/);
  assert.doesNotMatch(source, /\}, \[inspectorHidden\]\)/);
});

test('production canvas is a world-space canvas, not a scroll container', () => {
  assert.match(styleSource, /grid-template-columns:\s*290px minmax\(700px, 1fr\) 310px/);
  // 视口有边界，世界没有。这里出现滚动条就说明又退回滚动看板了。
  assert.match(styleSource, /\.canvas-surface\s*\{[\s\S]*?overflow:\s*hidden/);
  // 相机由 React Flow 的变换矩阵负责：平移、以光标为中心缩放、视口裁剪。
  assert.match(canvasSource, /from '@xyflow\/react'/);
  assert.match(canvasSource, /onlyRenderVisibleElements/);
  assert.match(canvasSource, /panOnScroll/);
  assert.match(canvasSource, /zoomOnPinch/);
  // 尺寸是数据，不是排版结果——所以连线从坐标算，整个画布模块不该出现 DOM 测量。
  assert.match(canvasSource, /measured: \{ width: node\.size\.width, height: node\.size\.height \}/);
  assert.doesNotMatch(canvasModuleCode, /getBoundingClientRect/);
  assert.doesNotMatch(canvasModuleCode, /new ResizeObserver/);
});

test('阶段交接边锚在阶段节点上，不再靠卡片的排版顺序猜关系', () => {
  // 旧实现画的是「上一条泳道最后一张卡 → 下一条泳道第一张卡」：那是换行位置，不是依赖。
  assert.match(canvasGraphSource, /relation: 'handoff'/);
  assert.match(canvasGraphSource, /source: stageNodeId\(from\.stage\)/);
  assert.match(canvasGraphSource, /target: stageNodeId\(to\.stage\)/);
  // 五种关系都要说得出自己是什么。
  for (const relation of ['handoff', 'contains', 'depends_on', 'inherits', 'renders']) {
    assert.ok(canvasGraphSource.includes(`'${relation}'`), `${relation} 应该是一种明确的边`);
  }
  // 次级边默认不画，只在选中节点时出现。
  assert.match(canvasSource, /edge\.primary \|\| touched\.has\(edge\.id\)/);
});

test('相机是会话状态：按项目分键存在 sessionStorage，不进任何文件', () => {
  assert.match(canvasStorageSource, /sessionStorage/);
  assert.match(canvasStorageSource, /videoagent-canvas-camera:/);
  // 相机不该落到 localStorage 或工作区里：换个人打开同一个项目，不该被别人的视口带着走。
  assert.doesNotMatch(canvasStorageSource, /localStorage/);
  // 不带 projectId，切项目之后视口会串到上一个项目的位置。
  assert.match(source, /projectId=\{workspace\.projectId\}/);
  assert.match(canvasSource, /readCamera\(projectId, activeBoardKey\)/);
  // 相机按「项目 + 画布」分键：两张画布的世界不是同一个，共用坐标毫无意义。
  assert.match(canvasStorageSource, /\$\{CAMERA_PREFIX\}\$\{projectId\}:\$\{boardId\}/);
});

test('画布、便签、布局都是文档状态：住在工作区文件里，跟着项目归档走', () => {
  // 存浏览器本地的话，换台电脑打开同一个项目就全没了，导出和备份也带不走。
  assert.match(canvasBoardsSourceFile, /CANVAS_BOARDS_PATH = '\.aigc\/canvas-boards\.json'/);
  assert.match(canvasBoardsSourceFile, /upsertWorkspaceFile/);
  assert.match(source, /canvasBoardsFromWorkspace\(workspace\)/);
  assert.match(source, /writeCanvasBoards\(prev, next\)/);
  // 画布组件自己不存这些，它只负责产生新状态。
  assert.doesNotMatch(canvasModuleCode, /localStorage/);
});

test('一个项目至少有一张画布，而且生产画布删不掉', () => {
  // 生产画布是生产流程的视图，不是用户建出来的东西。
  assert.match(canvasBoardsSourceFile, /PRODUCTION_BOARD_ID = 'production'/);
  assert.match(canvasBoardsSourceFile, /if \(!target \|\| target\.kind === 'production'\) return boards/);
  assert.match(canvasSource, /board\.kind === 'custom' && active/);
});

test('便签不是产物：没有 stage、不产生任何自动边', () => {
  /*
   * 长得像产物卡是危险的——用户会以为在这儿写一句「这一镜要特写」能影响生成，
   * 而实际上什么都不会发生。所以它在数据和视觉上都必须是另一种东西。
   */
  assert.match(canvasGraphSource, /kind: 'sticky'/);
  assert.match(canvasGraphSource, /stage: null/);
  assert.match(canvasNodesSource, /canvas-sticky-node/);
  assert.doesNotMatch(canvasNodesSource, /canvas-sticky-node[\s\S]{0,600}story-card-cta/);
  assert.match(styleSource, /\.canvas-sticky-node\s*\{[\s\S]*?border:\s*1px dashed/);
  // 自定义画布上没有生产节点，否则「另建一张」就只是同一张的副本。
  assert.match(canvasSource, /lanes: isProductionBoard \? lanes : \[\]/);
});

test('便签可以标记为参与生成，而且一眼看得出来', () => {
  /*
   * 便签写在画布上就该能影响生成——但必须是一次明确的动作。
   * 默认参与的话，用户随手写的一句「这版不好看」会被当成生成指令喂给模型。
   */
  assert.match(canvasBoardsSourceFile, /scope: 'note'/);
  assert.match(canvasBoardsSourceFile, /export function renderCanvasNotes/);
  assert.match(canvasNodesSource, /canvas-sticky-scope/);
  assert.match(canvasNodesSource, /参与视频生成/);
  // 正在影响模型的便签必须有视觉标记，否则查不到是哪几条在起作用。
  assert.match(canvasNodesSource, /canvas-sticky-live/);
  assert.match(styleSource, /\.canvas-sticky-node\.live\s*\{/);
});

test('便签是要求，不是产物：合成的备注只活在提示词里，不落盘', () => {
  const promptContextSource = fs.readFileSync(
    path.join(__dirname, '..', 'lib', 'stagePromptContext.ts'),
    'utf8'
  );
  assert.match(promptContextSource, /function withCanvasNotes/);
  assert.match(promptContextSource, /renderCanvasNotes\(canvasBoardsFromWorkspace\(workspace\), stage\)/);
  // 存成第二份文件的话，改了便签忘了同步，模型看到的就是过期的要求。
  assert.doesNotMatch(canvasBoardsSourceFile, /upsertWorkspaceFile\([^)]*CANVAS_NOTES_PATH/);
});

test('便签改内容失焦才提交——每敲一个字写一次工作区，版本号会跟着字数涨', () => {
  assert.match(canvasNodesSource, /onBlur=\{commit\}/);
  assert.match(canvasNodesSource, /if \(title === sticky\.title && body === sticky\.body\) return/);
  // 便签里的输入框不能被当成拖拽把手，滚动也不该变成缩放画布。
  assert.match(canvasNodesSource, /canvas-sticky-title nodrag/);
  assert.match(canvasNodesSource, /canvas-sticky-body nodrag nowheel/);
});

test('挪一张卡片不能把下游标成「需重做」', () => {
  /*
   * 这条豁免不靠调用方自觉，靠两份既有白名单：
   * `.aigc/` 前缀不算产物，STAGE_SOURCE_FILES 只列真正的上游文件。
   * 真实行为由 lib/canvasBoards.test.cjs 断言，这里守的是「别把它加进白名单」。
   */
  assert.match(workspaceSource, /path\.startsWith\('\.aigc\/'\)/);
  const sourceFiles = stageGenerationSource.slice(
    stageGenerationSource.indexOf('const STAGE_SOURCE_FILES'),
    stageGenerationSource.indexOf('const SCRIPT_PROMPT_CONTEXT_FILES')
  );
  assert.ok(sourceFiles.length > 0);
  assert.doesNotMatch(sourceFiles, /canvas-layout/);
  assert.doesNotMatch(sourceFiles, /canvas-boards/);
});

test('节点默认锁定，用户不能自己改依赖边', () => {
  // 后端生产阶段是固定状态机。前端放开连线，只会造出「看起来改了、其实没改」的假能力。
  assert.match(canvasSource, /nodesConnectable=\{false\}/);
  assert.match(canvasSource, /nodesDraggable=\{layoutMode\}/);
  assert.match(canvasSource, /draggable: layoutMode && !node\.parentId/);
  assert.match(canvasSource, /布局模式/);
});

test('低倍率下不画图和正文——LOD 由容器 class 驱动，不是每个节点各自订阅缩放', () => {
  assert.match(canvasSource, /lod-\$\{tier\}/);
  assert.match(styleSource, /\.canvas-surface\.lod-far [\s\S]*?display:\s*none/);
  assert.match(styleSource, /\.canvas-surface\.lod-mid/);
  // 一屏之外还挂着几十张图，同步解码会把平移那一帧直接拖掉。
  assert.match(canvasCardSource, /loading="lazy"/);
  assert.match(canvasCardSource, /decoding="async"/);
});

test('canvas keeps its dark palette scoped and leaves the review surface on light tokens', () => {
  // 画布是全站唯一的深色板：深色 token 必须只在 .story-board 内生效，
  // 不能泄漏成全局变量，审查抽屉仍然属于 light 体系。
  const boardBlock = styleSource.slice(
    styleSource.indexOf('.canvas-surface {'),
    styleSource.indexOf('.canvas-surface .react-flow {')
  );
  assert.ok(boardBlock.length > 0, 'canvas surface style block should exist');
  assert.match(boardBlock, /--canvas-ink:/);
  assert.match(boardBlock, /--canvas-text:/);
  const rootBlock = styleSource.slice(styleSource.indexOf(':root {'), styleSource.indexOf('\n}', styleSource.indexOf(':root {')));
  assert.doesNotMatch(rootBlock, /--canvas-/, 'dark canvas tokens must not become global');
  const reviewBlock = styleSource.slice(
    styleSource.indexOf('.story-review {'),
    styleSource.indexOf('.story-review-head {')
  );
  assert.match(reviewBlock, /background:\s*var\(--surface\)/);
  assert.match(reviewBlock, /color:\s*var\(--text\)/);
});

test('stage status is spelled out rather than encoded only in a border colour', () => {
  assert.match(canvasCardSource, /productionStatusLabel/);
  for (const label of ['待确认', '已确认', '生成中', '需重做', '已中断']) {
    assert.ok(canvasCardSource.includes(label), `${label} should be a readable status`);
  }
  assert.match(styleSource, /\.story-lane-status\s*\{/);
  assert.match(styleSource, /\.story-card-status\s*\{/);
});

test('production nodes carry stage state instead of decorative links', () => {
  assert.match(source, /const productionFlow = productionFlowFromWorkspace\(workspace\)/);
  assert.match(source, /visibleProductionStages\(productionFlow\)\.filter/);
  assert.match(source, /status: record\.status/);
  assert.match(canvasNodesSource, /story-lane-actions/);
  assert.match(source, /下游影响/);
  assert.match(source, /nodeStatusReason/);
  assert.match(source, /patchTouchesNode/);
});

test('canvas lanes carry the real per-item production assets, not one card per stage', () => {
  assert.match(source, /function storyCardsForStage\(stage: ProductionStageId\): StoryCanvasCard\[\]/);
  // 角色 / 场景 / 分镜 / 视频任务都要展开成一张张产物卡，并带上已经生成的图。
  assert.match(source, /visibleCharacterAssets\.map\(\(character, characterIndex\) => \{/);
  assert.match(source, /portrait: characterDesignRenderFor\(character, variant, 'portrait'\)\.imageUrl/);
  assert.match(source, /images: scene\.referenceImageUrl \? \[scene\.referenceImageUrl\] : \[\]/);
  assert.match(source, /function shotCard\(shot: PreviewScene, shotIndex: number/);
  assert.match(source, /videoPrompts\.map\(\(prompt, promptIndex\) => \{/);
});

test('shots hang under the scene they were split from, as a tree', () => {
  // 镜头是场次的下级。分成两条互不相认的泳道之后，用户看到四张卡对着二十张卡，读不出谁生了谁。
  assert.match(source, /const shots = storyboard\.filter\(\(shot\) => shot\.sourceSceneId === scene\.id\)/);
  assert.match(source, /children: shots\.map\(\(shot\) => shotCard\(/);
  assert.match(source, /childrenLabel: shots\.length \? `\$\{shots\.length\} 个镜头/);
  // 分镜泳道不再摆一遍同样的卡，但它自己的状态和操作还在，所以要说清产物去哪了。
  assert.match(source, /个镜头挂在上方 \$\{scenes\.length\} 个场景下/);
  // 挂在别人下面 ≠ 属于别人：点开镜头必须进分镜的审查面板。
  assert.match(source, /stage: 'storyboard'/);
  assert.match(canvasSource, /node\.stage !== node\.lane\.stage \? \{ \.\.\.node\.lane, stage: node\.stage \} : node\.lane/);
  // 归属要一路从 storyboard.json 读出来，读的时候丢了字段，界面上再怎么建树都是空的。
  assert.match(workspaceSource, /sourceSceneId: typeof scene\.sourceSceneId === 'string'/);
  // 递归的 children 归一化成 parentId：场次卡和它的镜头共用一个簇，拖簇整簇一起走。
  assert.match(canvasGraphSource, /const groupId = groupNodeId\(card\.id\)/);
  assert.match(canvasGraphSource, /pushCard\(child, lane, groupId\)/);
  assert.match(canvasSource, /extent: node\.parentId \? \('parent' as const\) : undefined/);
  assert.match(styleSource, /\.canvas-group-node \{/);
});

test('scene and shot cards show who is in them, and where the frame came from', () => {
  // 一场戏先被读到的是「谁在演」，光有地点和光线读不出人。
  assert.match(source, /cast: castFor\(scene\.characterIds\)/);
  assert.match(source, /const castLookup = new Map\(characterBoardEntries\.map/);
  // 镜头没标角色时退回这一场的出场角色，而不是显示成「这镜没人」。
  assert.match(source, /shot\.characterIds\?\.length \? shot\.characterIds : scene\?\.characterIds/);
  // 首帧优先用镜头自己的；退回场次图时必须标明是继承的，不能冒充。
  assert.match(source, /const ownFrame = shot\.shotImageUrl \|\| ''/);
  assert.match(source, /imageNote: inherited \? '沿用场景图/);
  assert.match(workspaceSource, /shotImageUrl: typeof scene\.shotImageUrl === 'string'/);
  assert.match(workspaceSource, /characterIds: Array\.isArray\(scene\.characterIds\)/);
  assert.match(canvasCardSource, /card\.cast && card\.cast\.length > 0/);
  assert.match(styleSource, /\.story-card-cast \{/);
});

test('review drawer opens from a card instead of permanently occupying the canvas', () => {
  assert.match(source, /const \[canvasReviewOpen, setCanvasReviewOpen\] = useState\(false\)/);
  assert.match(source, /setCanvasReviewOpen\(true\)/);
  assert.match(source, /onCloseReview=\{\(\) => setCanvasReviewOpen\(false\)\}/);
  // Esc 和点击遮罩都要能退出，否则抽屉会把画布锁死。
  assert.match(canvasSource, /event\.key === 'Escape'/);
  assert.match(canvasSource, /className=\{`story-review-scrim \$\{reviewOpen \? 'open' : ''\}`\}/);
  assert.match(canvasSource, /aria-label="收起审查面板"/);
});

test('node-level revision is scoped to the selected production asset', () => {
  assert.match(source, /function buildNodeRevisionInstruction/);
  assert.match(source, /只修改 Mission Map 的/);
  assert.match(source, /目标文件：/);
  assert.match(source, /必须保持其它节点的既有内容不变/);
  assert.match(source, /const \[selectedNodeId, setSelectedNodeId\] = useState\('node_mission'\)/);
  assert.match(source, /const \[nodeRevisionText, setNodeRevisionText\] = useState\(''\)/);
  assert.match(source, /const stage: ProductionStageId = selectedNode\.stage === 'overview' \? 'script' : selectedNode\.stage/);
  assert.match(source, /requestStageDraft\(stage, workspace, undefined, revisionText/);
  assert.match(source, /markStageDraft\(flow, \{ stage, generationJobId, sourceVersions \}\)/);
  assert.match(source, /提交节点修改/);
  assert.match(source, /当前节点 patch/);
});

test('pending patches remain in the right-side inspector', () => {
  assert.doesNotMatch(source, /aria-label="制作包待审"/);
  assert.match(source, /className="studio-current"/);
  assert.match(source, /node-patch-panel/);
  assert.match(source, /<ApprovalQueue/);
  assert.match(source, /setSelectedPatchId/);
  assert.match(source, /approvePatchIds/);
  assert.match(source, /rejectPatchIds/);
});

test('workbench errors are visible and dismissible instead of silently disappearing', () => {
  assert.match(source, /className="studio-error-banner" role="alert"/);
  assert.match(source, /onClick=\{\(\) => setError\(''\)\}/);
  assert.match(source, /aria-label="关闭错误提示"/);
});

test('empty Mission detection ignores internal workspace files', () => {
  assert.match(source, /isBlank:\s*!workspace\s*\|\|\s*!workspace\.files\.some\(\(file\) => !isInternalWorkspaceFile\(file\.path\)\)/);
  assert.doesNotMatch(source, /isBlank:\s*!workspace \|\| workspace\.files\.length <= 1/);
});

test('global workbench chrome reads committed Mission identity, not pending Brief patches', () => {
  assert.match(source, /const committedBrief = useMemo\(\(\) => missionBriefFromWorkspace\(workspace\), \[workspace\]\)/);
  assert.match(source, /className="studio-assistant-head"[\s\S]{0,260}<p>\{committedBrief\.title\}<\/p>/);
  assert.match(source, /className="studio-title"[\s\S]{0,180}<strong>\{committedBrief\.title\}<\/strong>/);
});

test('generating stage replaces the old review form with an explicit generation state', () => {
  assert.match(source, /reviewContent=\{nextGeneratingStage === activeProductionStage \? null : <>/);
  // 生成中/失败时右栏必须整列消失，用户手动收起走同一个状态，布局和渲染不能各判各的。
  assert.match(source, /const inspectorCollapsed = stageReviewSuppressed \|\| inspectorHidden;/);
  assert.match(source, /inspectorCollapsed \? ' inspector-suppressed' : ''/);
  assert.match(source, /\{!inspectorCollapsed && <aside className="studio-current">/);
  assert.match(canvasNodesSource, /正在生成\$\{productionStageLabel\[node\.stage\]\}/);
  assert.match(canvasNodesSource, /上一版草稿不会作为本轮结果进入审批/);
  assert.doesNotMatch(canvasNodesSource, /<span>\{nextGeneratingStage\}<\/span>/);
  assert.doesNotMatch(canvasNodesSource, /<span>\{node\.stage\}<\/span>/);
});

test('a replacement generation stays in the workbench when the previous draft only exists as pending patches', () => {
  assert.match(source, /storedPendingPatches\.some\(\(patch\) => isProductionStageFile\(patch\.filePath\)\)/);
});

test('quarantined legacy drafts explain the recovery path instead of showing an empty approval form', () => {
  assert.match(source, /activeStageHasQuarantinedDraft/);
  assert.match(source, /activeStageReviewablePatches\.length === 0 && patchReviewState\.quarantined\.some/);
  assert.match(source, /旧草稿已隔离/);
  assert.match(source, /这一版不会进入预览和审批/);
  // 隔离原因要照实说。写死的「检测到占位内容」在最常见的那种隔离上是错的：
  // 那条路径只查来源戳，没看过内容，用户手里往往是一份完整的真实产出。
  assert.doesNotMatch(source, /检测到占位内容或不完整的历史结果/);
  assert.match(source, /patchReviewState\.quarantineNotes\.filter\(\(note\) => note\.stage === activeProductionStage\)/);
  assert.match(source, /\{activeStageQuarantineReason\}这一版不会进入预览和审批/);
});

test('interrupted stages show a recovery card and suppress stale review controls', () => {
  assert.match(source, /const activeStageFailed = activeProductionRecord\.status === 'failed'/);
  assert.match(source, /className="production-failed-review" role="alert"/);
  assert.match(source, /生成已中断/);
  assert.match(source, /!activeStageFailed && pendingPatches\.length > 0/);
});

test('stage confirmation requires at least one current reviewable patch', () => {
  assert.match(source, /const currentStagePatches = pendingPatches\.filter\(\(patch\) => productionStageForFile\(patch\.filePath\) === stage\)/);
  assert.match(source, /没有可确认的待审 patch/);
});

test('assistant composer keeps chips in normal layout flow without covering text', () => {
  assert.match(source, /className="studio-assistant-footer"/);
  assert.match(styleSource, /\.studio-assistant-footer\s*\{[\s\S]*?display:\s*grid/);
  const actionsBlock = styleSource.match(/\.studio-assistant-actions\s*\{([\s\S]*?)\n\}/)?.[1] || '';
  assert.doesNotMatch(actionsBlock, /position:\s*absolute/);
  assert.doesNotMatch(actionsBlock, /bottom:\s*12px/);
});

test('a non-run action warning does not overwrite the latest successful run status', () => {
  assert.match(
    source,
    /const runStatus: 'idle' \| 'running' \| 'done' \| 'error' = loading \? 'running' : lastRun \? 'done' : error \? 'error' : 'idle'/
  );
});

test('dependency state marks stale downstream nodes from upstream changes', () => {
  assert.match(source, /type DependencyState = 'current' \| 'needs_review' \| 'stale'/);
  assert.match(source, /function dependencyNotice/);
  assert.match(source, /fileRevision/);
  assert.match(source, /scriptRev > characterRev/);
  assert.match(source, /sceneRev > storyboardRev/);
  assert.match(source, /Math\.max\(scriptRev, sceneRev, storyboardRev\) > videoRev/);
  assert.match(source, /依赖已过期/);
  assert.match(source, /下游需重审/);
  assert.match(source, /status: record\.status/);
});

test('asset library saves only stable nodes through approval patches', () => {
  assert.match(source, /type AssetLibraryItem/);
  assert.match(source, /function isNodeStableForLibrary/);
  assert.match(source, /node\.status === 'ready' && node\.dependencyState === 'current' && node\.patchCount === 0/);
  assert.match(source, /function proposeAssetLibraryPatch/);
  assert.match(source, /filePath: 'asset_library\.json'/);
  assert.match(source, /patch\.filePath === 'asset_library\.json' && patch\.summary\.includes\(node\.title\)/);
  assert.match(source, /riskLevel: 'low'/);
  assert.match(source, /appendPendingPatches\(current, \[patch\]\)/);
  assert.match(source, /提议入库/);
  assert.match(source, /合并后才会写入 asset_library\.json/);
});

test('stage navigation exposes only permitted production stages', () => {
  assert.match(source, /function focusStudioStage\(stage: StudioStageId\)/);
  assert.match(source, /const stageOpen = stage\.id === 'overview' \|\| canOpenProductionStage\(productionFlow, stage\.id\)/);
  assert.match(source, /aria-disabled=\{!stageOpen\}/);
  assert.match(styleSource, /@media \(max-width: 1024px\)[\s\S]*?\.studio-stage-nav \{/);
  assert.match(styleSource, /overflow-x:\s*auto/);
});

test('video shortcuts cannot bypass a locked production stage', () => {
  assert.match(source, /function tryFocusStudioStage\(stage: StudioStageId\)/);
  assert.match(source, /!canOpenProductionStage\(productionFlowFromWorkspace\(workspace\), stage\)/);
  assert.match(source, /onClick=\{\(\) => tryFocusStudioStage\('video'\)\}/);
});

test('production canvas exposes accessible stage actions', () => {
  assert.match(canvasNodesSource, /aria-label=\{`重新生成\$\{productionStageLabel\[lane\.stage\]\}`\}/);
  assert.match(canvasNodesSource, /aria-label=\{`替换\$\{productionStageLabel\[lane\.stage\]\}`\}/);
  assert.match(canvasNodesSource, /actions\.onRegenerate\(lane\)/);
  assert.match(canvasNodesSource, /actions\.onReplace\(lane\)/);
  // 视图控制必须活在屏幕坐标里：缩放不该让按钮跟着缩小、点击热区跟着漂。
  assert.match(canvasSource, /role="toolbar"/);
  assert.match(canvasSource, /aria-label="缩小"/);
  assert.match(canvasSource, /aria-label="放大"/);
  assert.match(styleSource, /\.story-lane-actions\s*\{/);
});

test('selected node shows a production decision card with review navigation and revise paths', () => {
  assert.match(source, /type ProductionDecision/);
  assert.match(source, /function decisionCardForNode\(node: StudioCanvasNode\)/);
  assert.match(source, /const selectedDecision = selectedNode \? decisionCardForNode\(selectedNode\) : null/);
  assert.match(source, /className="production-decision-card"/);
  assert.match(source, /Production Decision/);
  assert.match(source, /选择制作路径/);
  assert.match(source, /decision\.options\.map/);
  assert.match(source, /返回当前阶段审查/);
  assert.match(source, /我要修改/);
  assert.match(source, /setNodeRevisionText\(decision\.revisionPrompt\)/);
  assert.match(source, /onClick=\{\(\) => focusStudioStage\(selectedProductionStage\)\}/);
  assert.doesNotMatch(source, /function continueFromDecision\(/);
  assert.doesNotMatch(source, /确认并继续/);
  assert.match(styleSource, /\.production-decision-card\s*\{/);
});

test('production navigation and canvas render only unlocked stages', () => {
  assert.match(source, /canOpenProductionStage\(productionFlow, stage\.id\)/);
  assert.match(source, /disabled=\{!stageOpen\}/);
  assert.match(source, /aria-disabled=\{!stageOpen\}/);
  assert.match(source, /未解锁/);
  assert.match(source, /visibleProductionStages\(productionFlow\)/);
  assert.match(source, /storyLanes/);
});

test('workspace initialization focuses the production flow current stage', () => {
  assert.match(source, /function focusInitialProductionStage\(snapshot: WorkspaceSnapshot\)/);
  assert.match(source, /const stage = productionFlowFromWorkspace\(snapshot\)\.currentStage/);
  assert.match(source, /setActiveTab\(stage\)/);
  assert.match(source, /setSelectedNodeId\(`node_\$\{stage\}`\)/);
  assert.match(source, /focusInitialProductionStage\(restoredDemo\)/);
  assert.match(source, /focusInitialProductionStage\(demoWorkspace\)/);
  assert.match(source, /focusInitialProductionStage\(loaded\)/);
  assert.doesNotMatch(source, /setActiveTab\('overview'\)/);
});

test('a generating stage is represented by one skeleton instead of two canvas cards', () => {
  assert.match(source, /const nextGeneratingStage = productionFlow\.stages\[productionFlow\.currentStage\]\.status === 'generating'/);
  assert.match(source, /visibleProductionStages\(productionFlow\)\.filter\([\s\S]{0,180}stage !== nextGeneratingStage/);
  assert.match(canvasNodesSource, /skeleton-card/);
  assert.match(canvasSource, /reviewContent && \(/);
});

test('review content uses a light work surface and mobile width boundaries', () => {
  assert.match(styleSource, /\.story-review\s*\{[\s\S]*?background:\s*var\(--surface\)/);
  assert.match(styleSource, /\.production-review-workspace\s*\{[\s\S]*?color:\s*var\(--text\)/);
  assert.match(styleSource, /@media \(max-width: 1024px\)[\s\S]*?\.studio-workbench,\s*\.studio-main,\s*\.studio-canvas,\s*\.story-canvas,\s*\.canvas-surface/);
  assert.match(styleSource, /@media \(max-width: 720px\)[\s\S]*?\.production-script-review textarea\s*\{[\s\S]*?min-height:\s*240px/);
});

test('production review headings and inspector status come from the production flow record', () => {
  assert.match(source, /const productionReviewHeading: Record<ProductionStageId, string> = \{/);
  for (const label of ['脚本审查', '角色审查', '场景审查', '分镜审查', '视频任务审查']) {
    assert.match(source, new RegExp(`'${label}'`));
  }
  assert.match(source, /<h1>\{activeTab === 'overview' \? previewInfo\.hook : productionReviewHeading\[activeProductionStage\]\}<\/h1>/);
  assert.doesNotMatch(source, /<h1>\{activeTab === 'overview' \? previewInfo\.hook : selectedAssetTitle\}<\/h1>/);
  assert.match(source, /function productionStageStatusText\(status: ProductionStageStatus\)/);
  assert.match(source, /<small>\{selectedNode\.owner\} · \{productionStageStatusText\(selectedProductionRecord\.status\)\}<\/small>/);
});

test('canvas owns stage review content and excludes the duplicate proof strip', () => {
  assert.match(source, /<ProductionCanvas/);
  assert.doesNotMatch(source, /className="asset-proof-strip"/);
  assert.match(canvasSource, /story-review-body/);
  assert.match(canvasNodesSource, /skeleton-card/);
  // 抽屉活在屏幕坐标里，不进画布的变换，否则表单会被缩成马赛克。
  assert.match(canvasSource, /story-review-scrim/);
});

test('each production stage retains exactly one primary confirmation action', () => {
  // 只断言前缀：守的是「每阶段有且只有一个主确认动作」，不是具体措辞。
  for (const label of [
    '确认脚本，交给',
    '确认角色，交给',
    '确认场景，交给',
    '确认分镜，交给'
  ]) {
    assert.equal(source.split(label).length - 1, 1, `${label} should occur exactly once`);
  }
  // 数字符串字面量而不是裸词：注释里引用这个按钮名不算多出一个动作。
  assert.equal(
    (runtimeSource.match(/'确认视频任务并开始生成'/g) || []).length,
    1,
    'video final confirmation should have one visible action'
  );
});

test('assistant panel renders the message stream instead of dropping it', () => {
  // visibleMessages 曾经算出来却没人用，面板上看不到任何过程。
  assert.match(source, /className="studio-assistant-stream"/);
  assert.match(source, /visibleMessages\.map/);
  assert.match(styleSource, /\.studio-assistant-stream\s*\{/);
  assert.match(styleSource, /\.assistant-msg\s*\{/);
});

test('confirming a stage records a visible handoff to the next owner', () => {
  assert.match(source, /kind: 'handoff'/);
  assert.match(source, /handoff: \{ fromStage: stage, toStage: nextStage \}/);
  assert.match(source, /content: handoffText\(stage, nextStage\)/);
  assert.match(source, /message\.kind === 'handoff'/);
  assert.match(source, /className="assistant-handoff"/);
  assert.match(styleSource, /\.assistant-handoff\s*\{/);
});

test('canvas owners and confirm buttons come from the stage owner source of truth', () => {
  // 阶段负责人只能有一个真源，否则画布写「分镜师」而按钮写别的名字。
  assert.doesNotMatch(source, /owner: '(Script|Scene|Character|Storyboard|Video Generation) Agent'/);
  assert.match(source, /owner: stageOwnerLabel\('script'\)/);
  assert.match(source, /owner: stageOwnerLabel\('video'\)/);
  assert.match(source, /交给\{stageOwnerName\('character'\)\}/);
  assert.match(source, /交给\{stageOwnerName\('video'\)\}/);
});

test('style is stored as structured state, not concatenated into the instruction', () => {
  // 拼进 instruction 的风格会在多轮对话里被稀释；必须落到 style.json。
  assert.doesNotMatch(source, /视觉风格：\$\{style\.label\}/);
  assert.match(source, /applyGlobalStyle\(style\)/);
  assert.match(source, /writeStyleBook\(prev, setGlobalStyle\(/);
  assert.match(source, /writeStyleBook\(prev, setStageStyle\(/);
  assert.match(source, /const styleOptions = STYLE_PRESETS/);
});

test('visual stages expose a style override and surface drift', () => {
  assert.match(source, /className="stage-style-bar"/);
  assert.match(source, /VISUAL_STAGES\.includes\(activeProductionStage\)/);
  assert.match(source, /styleWarnings\.map/);
  assert.match(source, /className="stage-style-drift"/);
  assert.match(styleSource, /\.stage-style-bar\s*\{/);
  assert.match(styleSource, /\.stage-style-drift\s*\{/);
});

test('character stage renders confirmable role cards from proposed characters JSON', () => {
  assert.match(source, /type CharacterAssetCard/);
  assert.match(source, /charactersFromWorkspace\(proposedWorkspace\)/);
  assert.match(source, /filePath: 'characters\.json'/);
  assert.match(source, /characterAssetIssues\[0\]/);
  assert.match(source, /className="character-asset-grid"/);
  assert.match(source, /visibleCharacterAssets\.map/);
  assert.match(source, /className="character-asset-card"/);
  assert.match(source, /角色一致性/);
  assert.match(source, /确认角色，交给/);
  assert.doesNotMatch(source, /确认并继续场景/);
  assert.match(source, /setNodeRevisionText\(`我要修改角色/);
  assert.match(styleSource, /\.character-asset-grid\s*\{/);
  assert.match(styleSource, /\.character-asset-card\s*\{/);
});

test('character stage exposes pre-video role adjustment and expression controls', () => {
  assert.match(source, /CHARACTER_EXPRESSION_OPTIONS/);
  ['喜', '怒', '哀', '恐惧', '惊讶', '厌恶', '害羞', '紧张', '尴尬', '疑惑', '期待', '平静'].forEach((label) => {
    assert.match(source, new RegExp(`label: '${label}'`));
  });
  assert.match(source, /roleExpressionDrafts/);
  assert.match(source, /toggleCharacterExpression/);
  assert.match(source, /roleAdjustmentDrafts/);
  assert.match(source, /roleReferenceStrategyDrafts/);
  assert.match(source, /视频前角色调整/);
  assert.match(source, /Face ID 锁脸/);
  assert.match(source, /多视角/);
  assert.match(source, /替换参考/);
  assert.match(source, /补充角色调整要求/);
  assert.match(source, /characterControlSummaryForPrompt/);
  assert.match(source, /角色视频前调整/);
  assert.match(styleSource, /\.character-preflight-panel\s*\{/);
  assert.match(styleSource, /\.character-reference-row\s*\{/);
  assert.match(styleSource, /\.character-expression-grid\s*\{/);
  assert.match(styleSource, /\.character-expression-chip\s*\{/);
  assert.match(styleSource, /\.character-adjustment-field textarea\s*\{/);
});

test('character stage is a visual asset workbench with working production actions', () => {
  assert.match(source, /characterReferenceVariantsFromPrompts/);
  assert.match(source, /async function regenerateCharacterDesign/);
  assert.match(source, /fetch\('\/api\/image\/render'/);
  assert.match(source, /function replaceCharacterDesign/);
  assert.match(source, /function copyCharacterDesign/);
  assert.match(source, /function downloadCharacterDesign/);
  assert.match(source, /function proposeCharacterReferencePatch/);
  assert.match(source, /character-design-visual/);
  assert.match(source, /character-stage-variants/);
  assert.match(source, /Face ID/);
  assert.match(source, /重新生成/);
  assert.match(source, /替换/);
  assert.match(source, /复制/);
  assert.match(source, /下载/);
  assert.match(source, /加入资产库/);
  assert.match(source, /生成多视角/);
  assert.match(source, /生成表情板/);
  assert.match(styleSource, /\.character-design-visual\s*\{/);
  assert.match(styleSource, /\.character-stage-variants\s*\{/);
  assert.match(styleSource, /\.character-design-menu\s*\{/);
});

test('角色总览卡按状态给不同动作，不再一律显示「审查」', () => {
  // 真实问题：卡片上无论「已确认」还是「待完善」，按钮都写「审查 →」，
  // 用户点开一个已经审完的角色，看到的还是一模一样的审查界面。
  assert.match(source, /const review = characterReviewState\(character\.visual\)/);
  assert.match(source, /ctaLabel: review\.actionLabel/);
  assert.match(source, /statusLabel: review\.label/);
  assert.match(source, /progressPercent: review\.completeness\.percent/);
  assert.match(source, /tags: character\.visual\.tags\.slice\(0, 3\)/);
  assert.match(canvasCardSource, /card\.ctaLabel \|\| '审查 →'/);
  assert.match(canvasCardSource, /card\.statusLabel \|\| productionStatusLabel\[laneStatus\]/);
  ['待完善', '待审查', '已确认', '需修改'].forEach((label) => {
    assert.match(specSource, new RegExp(label));
  });
  ['补充设定', '开始审查', '查看设定', '继续修改'].forEach((label) => {
    assert.match(specSource, new RegExp(label));
  });
});

test('角色卡点开的是视觉设定画板：左索引 + 中设定 + 底部全员矩阵', () => {
  assert.match(source, /<CharacterDesignBoard/);
  assert.match(source, /reviewSize=\{activeProductionStage === 'character' \? 'wide' : 'default'\}/);
  // 点哪张卡就进哪个角色，而不是永远停在第一个人身上。
  assert.match(source, /card\.id\.slice\('card_character_'\.length\)/);
  assert.match(boardSource, /className="character-board-index"/);
  assert.match(boardSource, /aria-label="角色索引"/);
  assert.match(boardSource, /aria-label="全员视觉辨识度对比矩阵"/);
  assert.match(boardSource, /characterMatrixConflicts\(rows\)/);
  assert.match(styleSource, /\.character-board\s*\{/);
  assert.match(styleSource, /\.character-board-index\s*\{/);
  assert.match(styleSource, /\.character-board-matrix\s*\{/);
  // 矩阵自己横向滚动，页面不许出现非预期的横向滚动条。
  assert.match(styleSource, /\.character-matrix-scroll\s*\{[^}]*overflow-x:\s*auto/);
  // 小屏收成单列 + 顶部角色选择器。
  assert.match(styleSource, /@media \(max-width: 900px\)[\s\S]{0,400}\.character-board\s*\{/);
});

test('画板覆盖六个模块，固定身份特征可锁定且明确标注不可随场景改变', () => {
  ['固定身份特征', '头发设定', '场景服饰系统', '表情状态库', '镜头与生成约束', '视觉辨识度'].forEach((label) => {
    assert.match(specSource, new RegExp(label));
  });
  assert.match(boardSource, /不可随场景改变/);
  assert.match(boardSource, /identity: \{ \.\.\.spec\.identity, locked: !identityLocked \}/);
  assert.match(boardSource, /disabled=\{identityLocked\}/);
  assert.match(boardSource, /身份锚点已锁定，字段只读/);
  // 四个固定参考位
  ['正脸', '3/4 侧脸', '纯侧脸', '全身'].forEach((label) => {
    assert.match(specSource, new RegExp(label.replace('/', '\\/')));
  });
  // 头发字段拆到可执行精度，而不是一句「黑色长发」
  ['发色', '发长', '发质', '发量', '发际线', '分缝方向', '刘海类型', '基础发型'].forEach((label) => {
    assert.match(specSource, new RegExp(label));
  });
  assert.match(specSource, /锁骨下 8cm/, '示例必须写到可执行精度');
  assert.match(boardSource, /可变发型/);
  assert.match(boardSource, /禁止出现的发型/);
  // 服饰按场景分方案，不是一套衣服走全片
  ['日常通勤', '约会', '居家', '情绪低谷', '重要冲突', '结尾状态'].forEach((label) => {
    assert.match(specSource, new RegExp(label));
  });
  // 标准表情组
  ['中性', '浅笑', '大笑', '尴尬', '压抑', '悲伤', '愤怒', '释然'].forEach((label) => {
    assert.match(specSource, new RegExp(`label: '${label}'`));
  });
});

test('缺图时只给上传/生成占位，不挂来路不明的网络图', () => {
  assert.match(boardSource, /还没有参考图/);
  assert.match(boardSource, /onGenerateImage\(active\.id/);
  assert.match(boardSource, /onUploadImage\(active\.id/);
  assert.doesNotMatch(boardSource, /https?:\/\/(?!www\.w3\.org)/);
  assert.match(source, /async function generateCharacterVisualImage/);
  assert.match(source, /function uploadCharacterVisualImage/);
  assert.match(source, /fetch\('\/api\/image\/render'/);
});

test('必填字段没填完不能提交视觉审查，视觉设定改动落成待审 patch', () => {
  assert.match(source, /function updateCharacterReviewStatus/);
  // 提交审查和直接确认都要卡：让缺脸型、缺色盘的设定被标成「已确认」，
  // 等于把这三个字变成没有含义的按钮。
  assert.match(source, /if \(\(status === 'ready_for_review' \|\| status === 'confirmed'\) && state\.completeness\.missing\.length > 0\)/);
  assert.match(boardSource, /disabled=\{review\.status === 'confirmed' \|\| completeness\.missing\.length > 0\}/);
  // 写回传的是 mutate 而不是整份对象：同一次渲染里连续改两个字段，
  // 传整份对象会让后一次把前一次盖掉，用户填了两格只存下一格。
  assert.match(source, /function persistCharacterVisual\(\s*characterId: string,\s*mutate: \(current: CharacterVisualSpec\) => CharacterVisualSpec/);
  assert.match(source, /\(character\) => \(\{ visual: mutate\(normalizeCharacterVisualSpec\(character\.visual\)\) \}\)/);
  assert.match(source, /typeof change === 'function' \? change\(character\) : change/);
  assert.match(boardSource, /const commit = \(mutate: \(current: CharacterVisualSpec\) => CharacterVisualSpec/);
  assert.doesNotMatch(boardSource, /commit\(\{ \.\.\.spec/, 'commit 不能再接收 render 时的整份 spec 快照');
  assert.match(boardSource, /disabled=\{!review\.canSubmitReview\}/);
});

test('受控字段必须定义在模块作用域，否则每敲一个字就丢焦点', () => {
  // 真实事故：TextField/ListField 写在组件内部，每次 setState 都是新的组件类型，
  // React 卸载重建整棵子树——输入框每敲一个字就失焦，onBlur 挂在已卸载的旧节点上，改动一次都存不下。
  const bodyStart = boardSource.indexOf('export default function CharacterDesignBoard');
  assert.ok(bodyStart > 0);
  const body = boardSource.slice(bodyStart);
  for (const name of ['TextField', 'ListField', 'PresetChips', 'ImageSlot']) {
    assert.doesNotMatch(body, new RegExp(`function ${name}\\(`), `${name} 不能定义在组件内部`);
    assert.match(boardSource.slice(0, bodyStart), new RegExp(`function ${name}\\(`), `${name} 应定义在模块作用域`);
  }
});

test('视觉设定会进入角色图和镜头提示词，不是只停在界面上', () => {
  const assetsSource = fs.readFileSync(path.join(__dirname, '..', 'lib', 'productionAssets.ts'), 'utf8');
  assert.match(assetsSource, /visual: normalizeCharacterVisualSpec\(character\.visual\)/);
  assert.match(assetsSource, /const visualLines = characterVisualPromptLines\(normalizeCharacterVisualSpec\(character\.visual\)\)/);
  assert.match(assetsSource, /characterVisualBrief\(character\.visual\)/);
  // 镜头提示词要连本场造型一起下发（鞋子就在造型里），所以这里必须带 lookId——
  // 不传的话上装下装鞋子配饰一个字都不会出现，模型只能自己发挥脚上穿的是什么。
  assert.match(source, /characterVisualPromptLines\(character\.visual, \{\s*lookId: lookIdForShot\(character\.visual, shotContext,/);
  // 造型以分镜连续性里定死的 wardrobeId 为准，按 sceneUsage 猜只是它不在时的退路：
  // 猜出来的造型每一镜都可能不一样，那正是「同一场戏里换了件衣服」的来源。
  assert.match(source, /shotWardrobeIds\(sceneId\)/);
  assert.match(source, /if \(declaredId && usable\.some\(\(look\) => look\.id === declaredId\)\) return declaredId/);
  // 上一镜的收尾画面要进这一镜的提示词，否则动作接不上。
  assert.match(source, /上一镜结束时的画面：/);
});

test('兜底模板必须在角色画板上就说清楚，不能只藏在审批面板里', () => {
  // 真实事故：模型产出没过 hasCharacters 的字段校验，整份 characters.json 被换成通用模板——
  // 主角变成「对这个主题感兴趣的目标观众…」、年龄档变成儿童 8 岁，还照着它生成了角色图。
  // 原来只有审批面板有一条警告，用户看的是画板，于是把一份和自己剧本无关的设定当成模型写的。
  assert.match(source, /const characterTemplateFallback = pendingPatches\.find\(/);
  assert.match(source, /patch\.filePath === 'characters\.json'\s*\)\?\.origin\?\.templateFallback/);
  assert.match(source, /这份角色设定不是按你的剧本生成的/);
  assert.match(source, /className="character-template-alert"/);
  assert.match(source, /重新生成角色/);
  assert.match(styleSource, /\.character-template-alert\s*\{/);
  // 名册缺口也要放在画板上，而不是只挂在确认按钮底下的一行小字里
  assert.match(source, /characterRosterAlert && \(/);
});

test('四个身份参考位和表情板都自动生成，且视觉设定有结构初稿', () => {
  const assetsSource = fs.readFileSync(path.join(__dirname, '..', 'lib', 'productionAssets.ts'), 'utf8');
  assert.match(assetsSource, /export function missingCharacterFrontViewJobs/);
  assert.match(assetsSource, /export function missingCharacterIdentityViewJobs/);
  assert.match(assetsSource, /export function missingCharacterExpressionSheetJobs/);
  assert.match(assetsSource, /export function replaceCharacterIdentityView/);
  // 身份参考位写进 visual.identity.views，不能覆盖变体主图
  assert.match(assetsSource, /if \(result\.identityViewId\) return replaceCharacterIdentityView/);
  assert.match(source, /missingCharacterFrontViewJobs\(draft\)/);
  // 顺序有依赖：剩下三个角度和表情板都拿正脸当参考图，提前跑就只能靠变体主图，
  // 侧脸和全身会各自往不同的长相上漂。
  assert.match(source, /missingCharacterIdentityViewJobs\(draft, \['three_quarter', 'profile', 'full_body'\]\)/);
  assert.match(source, /missingCharacterExpressionSheetJobs\(draft\)/);
  // 出图张数翻了一倍多，必须写在用户看得见的地方
  assert.match(source, /characterImageBudgetSummary\(\{/);
  // 生成侧给结构骨架，但不编造长相
  assert.match(specSource, /export function characterVisualDraftSkeleton/);
  const providerSource = fs.readFileSync(path.join(__dirname, '..', 'lib', 'agentProvider.ts'), 'utf8');
  assert.match(providerSource, /visual: characterVisualDraftSkeleton\(\)/);
  // 契约里 visual 从「选填」升级成必写
  assert.match(stageGenerationSource, /每个角色还必须带一个 visual 对象/);
  assert.doesNotMatch(stageGenerationSource, /它【不参与合格判定】：写不出来就整个省略/);
});

test('character regeneration forwards the current and Face ID anchor references to image rendering', () => {
  assert.match(source, /const referenceImages = Array\.from/);
  assert.match(source, /images: referenceImages/);
  assert.match(source, /negativePrompt: character\.negativePrompt \|\| ''/);
});

test('character and scene stages generate missing images as reviewable draft patches', () => {
  assert.match(source, /missingCharacterImageJobs/);
  assert.match(source, /missingSceneImageJobs/);
  assert.match(source, /applyStageImageResult/);
  assert.match(source, /async function generateMissingCharacterImages/);
  assert.match(source, /async function generateMissingSceneImages/);
  assert.match(source, /async function renderStageImage/);
  assert.match(source, /fetch\('\/api\/image\/render'/);
  assert.match(source, /prompt: job\.prompt,\s*negativePrompt: job\.negativePrompt,/);
  // 多视角要带参考图，否则四个视角会是四张不同的脸。
  assert.match(source, /job\.referenceImages\?\.length \? \{ images: job\.referenceImages \}/);
  assert.match(source, /missingCharacterMultiViewJobs/);
  assert.match(source, /Promise\.allSettled/);
  assert.match(source, /batchJobs\.slice\(index, index \+ 2\)/);
  assert.match(source, /persistSettledStageImages/);
  // 重新生成和替换搬进了场景画板，但能力必须还在：page 负责接线，画板负责按钮。
  assert.match(source, /onRegenerateSceneImage=\{\(sceneId\) => void regenerateSceneImage\(sceneId\)\}/);
  assert.match(source, /onReplaceSceneImage=\{replaceSceneImageFile\}/);
  assert.match(sceneBoardSource, /onRegenerateSceneImage\(activeScene\.id\)/);
  assert.match(sceneBoardSource, /onReplaceSceneImage\(activeScene\.id, event\.target\.files\?\.\[0\]\)/);
});

test('场景阶段先出母版全景，场次主图排在它之后重算', () => {
  // 场次主图要拿母版全景当空间参考。顺序反了，母版就只是一份没人看的表单，
  // 每一场还是各自现编一个房间。
  assert.match(source, /missingSceneViewJobs\(draftWorkspace\)\.filter\(\(job\) => job\.viewId === 'panorama'\)/);
  assert.match(source, /stage === 'scene' && !await runJobBatches\(missingSceneImageJobs\(draft\)\)/);
  // 另外七个机位是每个母版 ×7 张的开销，不能跟着自动批跑掉。
  assert.match(sceneBoardSource, /onRegenerateMasterView\(master\.id, activeViewId\)/);
  assert.match(sceneBoardSource, /上传参考图/);
});

test('场景画板把地点、场次和镜头分成三级，不合成同一个数据实体', () => {
  // 一级总览只回答「这个空间准备好了没有」，点进去才是画板。
  assert.match(sceneBoardSource, /scene-card-grid/);
  assert.match(sceneBoardSource, /sb-index/);
  assert.match(sceneBoardSource, /sb-instance-tabs/);
  assert.match(sceneBoardSource, /sb-timeline/);
  // 母版、场次、镜头是三份数据，镜头只引用前两者。
  assert.match(sceneSpecSource, /export type SceneMaster = \{/);
  assert.match(sceneSpecSource, /export type SceneInstance = \{/);
  assert.match(sceneSpecSource, /export type SceneShotState = \{/);
  // 锚点可锁定，锁上之后连编辑都不给——门窗家具漂移就是从「顺手改一下」开始的。
  assert.match(sceneSpecSource, /locked: boolean/);
  assert.match(sceneBoardSource, /readOnly=\{anchor\.locked \|\| locked\}/);
  // 声音是可折叠模块，不抢主界面。
  assert.match(sceneBoardSource, /<Section title="声音与氛围">/);
  // 大图不能一次性全量加载。
  assert.match(sceneBoardSource, /loading="lazy"/);
});

test('时间线把被追踪的状态逐镜印在卡上，而不是只给一段告警文字', () => {
  // 连续性是跨镜头对比出来的。状态不摆在卡上，用户就得读告警再自己回想上一镜什么样。
  assert.match(sceneSpecSource, /export function sceneTimelineRows/);
  assert.match(sceneBoardSource, /sceneTimelineRows\(shot\)\.map/);
  // 出问题的那一行要能被点出来，靠的是 issue.field 和行的 field 对上。
  assert.match(sceneBoardSource, /riskyFields\.has\(row\.field\)/);
  assert.match(sceneBoardSource, /new Set\(shotIssues\.map\(\(issue\) => issue\.field\)\)/);
  // 时码按前面镜头时长累加，卡上才有「这一镜在第几秒」。
  assert.match(sceneSpecSource, /export function sceneShotTimecode/);
  assert.match(sceneBoardSource, /sb-legend/);
});

test('灯光方向、平面家具和机位是母版与场次的一部分，走位图据此画视锥', () => {
  // 灯没动但光换了边，在成片里比灯的开关明显得多。
  assert.match(sceneSpecSource, /lightDirection: string/);
  assert.match(sceneSpecSource, /push\('light_direction', '灯光方向', 'error'/);
  // 家具属于母版（位置变了就是换了个房间），走位属于场次。
  assert.match(sceneSpecSource, /export type ScenePlanBlock/);
  assert.match(sceneSpecSource, /camera: SceneCameraPlacement \| null/);
  assert.match(sceneBoardSource, /sb-camera/);
  assert.match(sceneBoardSource, /aria-label="人物走位俯视图"/);
});

test('selectAsset 不得回调阶段聚焦，否则视频阶段点审查会无限递归', () => {
  // 真实事故：selectAsset(prompt) → tryFocusStudioStage('video') → focusStudioStage('video')
  // → selectAsset(promptAsset) 首尾相接，点「审查」必然 RangeError 爆栈。
  // 另外三支（script/scene/storyboard）都只 setActiveTab，prompt 这一支的不对称就是病根。
  const start = source.indexOf('function selectAsset(');
  assert.ok(start > 0, '没找到 selectAsset，函数可能被改名了');
  const body = source.slice(start, source.indexOf('\n  function ', start + 1));

  assert.doesNotMatch(body, /tryFocusStudioStage\(/, 'selectAsset 里不能调 tryFocusStudioStage');
  assert.doesNotMatch(body, /focusStudioStage\(/, 'selectAsset 里不能调 focusStudioStage');
  // 四种资产类型都只切页签，保持对称
  assert.match(body, /asset\?\.type === 'prompt'\) setActiveTab\('video'\)/);
});

test('focusStudioStage 仍然负责选中各阶段的主资产', () => {
  const start = source.indexOf('function focusStudioStage(');
  const body = source.slice(start, source.indexOf('\n  function ', start + 1));
  assert.match(body, /stage === 'video' && promptAsset\) selectAsset/);
});

test('视频交接的「上游 patch」判定必须排除本阶段全部产出，否则会死锁', () => {
  // 真实事故：只排 asset_prompts.json，于是本阶段自己的 video_spec.json 被算成上游 patch，
  // handoffReady 永远为假 → 面板被「先确认制作包」锁屏 → 而唯一能消费它的
  // 「确认视频任务并开始生成」按钮就在这块被锁掉的面板里，形成无解死锁。
  assert.match(source, /const videoStageOutputFiles = new Set\(stageConfig\('video'\)\.outputFiles\)/);
  assert.match(source, /pendingPatches\.filter\(\(patch\) => !videoStageOutputFiles\.has\(patch\.filePath\)\)/);
  assert.doesNotMatch(source, /pendingPatches\.filter\(\(patch\) => patch\.filePath !== 'asset_prompts\.json'\)/);
});

test('视频阶段的最终确认入口只有一个，且在审查面板内', () => {
  assert.match(source, /确认视频任务并开始生成/);
  assert.match(source, /通用确认不能消费视频任务 patch；请使用唯一的最终确认入口/);
});

test('视频镜头的首帧参考图从已确认场景主图回填，且按 sourceSceneId 优先', () => {
  // 真实事故：模型不写 referenceImageUrl（契约里也禁止它编造图片地址），
  // 而代码只在镜头对象内部找参考图，于是 12 个镜头全部卡在「缺少参考图，不能提交」——
  // 可场景主图其实早就生成好了，只是没人接过来。
  assert.match(source, /const sceneImageById = new Map\(/);
  // 一个场景会拆成多个镜头，此时 sceneId 指的是镜头，拿它查场景图会全部落空。
  // sourceSceneId 优先、sceneId 回落：回落这一路是留给老工作区的（镜头 id 就等于场景 id）。
  assert.match(source, /sceneImageById\.get\(prompt\.sourceSceneId \|\| prompt\.sceneId \|\| ''\) \|\| anchorPortrait/);
  assert.match(source, /function characterAnchorPortrait\(\)/);
  // 已经自带参考图的镜头不能被覆盖
  assert.match(source, /if \(referenceImagesForPrompt\(prompt\)\.length\) return prompt;/);
});

test('模型产出的参考图字段按类型校验，不能用 value?.trim() 判空', () => {
  // asset_prompts.json 是模型写的，referenceImages 里混进对象/数字时
  // value?.trim() 会抛 "value.trim is not a function"，整个视频面板白屏。
  assert.match(runtimeSource, /const isFilledString = \(value: unknown\): value is string => typeof value === 'string'/);
  assert.doesNotMatch(runtimeSource, /filter\(\(value\): value is string => Boolean\(value\?\.trim\(\)\)\)/);
  assert.match(runtimeSource, /Array\.isArray\(shot\.referenceImages\) \? shot\.referenceImages : \[\]/);
});
