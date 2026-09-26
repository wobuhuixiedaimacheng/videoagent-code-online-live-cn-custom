const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, 'page.tsx'), 'utf8');
const canvasPath = path.join(__dirname, '..', 'components', 'ProductionCanvas.tsx');
const canvasSource = fs.existsSync(canvasPath) ? fs.readFileSync(canvasPath, 'utf8') : '';
const stageGenerationSource = fs.readFileSync(path.join(__dirname, '..', 'lib', 'stageGeneration.ts'), 'utf8');
const runtimeSource = fs.readFileSync(path.join(__dirname, '..', 'components', 'runtime.tsx'), 'utf8');
const styleSource = fs.readFileSync(path.join(__dirname, 'globals.css'), 'utf8');

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
  assert.match(source, /reviewContent=\{<>/);
  assert.match(canvasSource, /className="production-stage-review"/);
  assert.match(source, /当前节点检查器/);
  const selectAssetBody = source.match(/function selectAsset\(id: string\) \{([\s\S]*?)\n  \}/)?.[1] || '';
  assert.ok(selectAssetBody.length > 0);
  assert.doesNotMatch(selectAssetBody, /setInspectorOpen\(true\)/);
  assert.doesNotMatch(selectAssetBody, /setInspectorDocked\(true\)/);
});

test('draft missions use a focused surface until generated assets exist', () => {
  assert.match(source, /const hasWorkspaceAssets = Boolean\(\s*proposedWorkspace\?\.files\.some\(\(file\) => !isInternalWorkspaceFile\(file\.path\) && file\.path !== '\.aigc\/MEMORY\.md'\)\s*\)/);
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
  assert.match(source, /className="studio-canvas"/);
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
  assert.match(source, /const VIDEO_RENDER_SEGMENT_SECONDS = 15/);
  assert.match(source, /const VIDEO_RENDER_SEGMENT_COUNT = 12/);
  assert.match(source, /numFrames: 361/);
  assert.match(source, /一个中文小节/);
  assert.match(source, /本次只提交一个镜头任务/);
  assert.match(source, /不要把 12 个小节混在一次视频生成请求里/);
  assert.match(source, /不要试图一次生成整条长视频/);
  assert.match(source, /禁止英文、拼音、拉丁字母、乱码、可读招牌、屏幕文字、书本文字和包装文字/);
  assert.match(source, /function chineseOnlyVideoNegativePrompt/);
  assert.match(source, /targetDurationSeconds/);
  assert.match(source, /const VIDEO_MAX_NUM_FRAMES = 409/);
  assert.match(source, /function normalizeAgnesNumFrames/);
  assert.match(source, /roundFrameRate\(VIDEO_MAX_NUM_FRAMES \/ seconds\)/);
  assert.match(source, /prompt: buildVideoRenderPrompt\(prompt, targetDuration, data\)/);
  assert.match(source, /image: referenceImages.length === 1 && renderMode !== 'keyframes' \? referenceImages\[0\] : undefined/);
  assert.match(source, /keyframes: referenceImages.length > 1 \|\| renderMode === 'keyframes' \? referenceImages : undefined/);
  assert.match(source, /mode: renderMode/);
  assert.equal((source.match(/fetch\('\/api\/video\/render'/g) || []).length, 2, 'only final confirmation and failed retry may POST video renders');
  assert.doesNotMatch(runtimeSource, /VideoRenderState/);
  assert.doesNotMatch(runtimeSource, /onRender/);
  assert.match(runtimeSource, /onConfirmVideoTasks/);
  assert.match(runtimeSource, /onRetryFailed/);
  assert.match(runtimeSource, /onUpdatePrompt/);
  assert.match(runtimeSource, /onReplaceReference/);
  assert.match(runtimeSource, /onReprepareShot/);
  assert.match(runtimeSource, /全部片段已完成，等待合成为单一成片文件/);
  assert.match(runtimeSource, /<video/);
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
  assert.match(source, /小澎的恋爱史 V2 制作包已载入/);
});

test('workspace persistence is scoped by project or demo and restores a demo before fetching', () => {
  assert.match(source, /function workspaceStorageKey\(projectId: string\)/);
  assert.match(source, /videoagent-workspace:\$\{projectId\}/);
  assert.match(source, /function demoStorageKey\(demoId: string\)/);
  assert.match(source, /videoagent-demo-workspace:\$\{demoId\}/);
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
  assert.match(source, /if \(!isWorkspaceSnapshot\(parsed\)\) return null/);
});

test('stage confirmation uses the transaction workspace as the downstream base', () => {
  assert.match(source, /const transaction = confirmStageInWorkspace\(workspace, \{/);
  assert.match(source, /outputFiles: stageConfig\(stage\)\.outputFiles/);
  assert.match(source, /setWorkspace\(transaction\.workspace\)/);
  assert.match(source, /requestStageDraft\(nextStage, transaction\.workspace, nextJobId\)/);
});

test('stage confirmation consumes drafts and starts exactly one downstream job', () => {
  assert.match(source, /async function confirmProductionStage\(stage: ProductionStageId\)/);
  assert.match(source, /validateStageAssets\(stage, proposedWorkspace\)/);
  assert.match(source, /confirmStageInWorkspace\(workspace/);
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
  assert.match(source, /if \(!completion\.accepted\) return current/);
  assert.match(source, /appendPendingPatches\(current, scopedPatches\)/);
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
  assert.match(source, /const revision = flow\.stages\[stage\]\.status === 'confirmed'/);
  assert.match(source, /requestStageDraft\(stage, workspace, undefined, node\.action, messages\.slice\(-10\), revision\)/);
  assert.match(source, /onRegenerate=\{\(node\) => \{/);
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
  assert.match(source, /未持久化\/请换小图/);
});

test('superseded image batches stop before later requests and cannot persist over uploads', () => {
  assert.match(source, /stageRunRef\.current\.get\(stage\)\?\.controller\.abort\(\)/);
  assert.match(source, /for \(let index = 0; index < jobs\.length; index \+= 2\)/);
  assert.match(source, /if \(!isCurrentStageRun\(stage, run\.generationJobId, run\.token\)\) return;/);
  assert.match(source, /renderStageImage\(job, run\.controller\.signal\)/);
  assert.match(source, /result\.status === 'fulfilled' && isCurrentStageRun/);
  assert.match(source, /if \(!isCurrentStageRun\(result\.stage, activeRun\.generationJobId, activeRun\.token\)\) return current;/);
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
  assert.match(source, /editingDisabled=\{hasActiveVideoJobs\(workspace\)\}/);
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
  assert.match(source, /className="studio-workbench"/);
  assert.match(source, /className="studio-assistant"/);
  assert.match(source, /制作助理/);
  assert.match(source, /className="studio-stage-nav"/);
  for (const stage of ['总览', '剧本', '角色', '场景', '分镜', '视频']) {
    assert.match(source, new RegExp(stage));
  }
  assert.match(source, /<ProductionCanvas/);
  assert.match(source, /visibleCanvasNodes/);
  assert.match(source, /当前节点检查器/);
});

test('production canvas is sized as a primary production surface', () => {
  assert.match(styleSource, /grid-template-columns:\s*290px minmax\(700px, 1fr\) 310px/);
  assert.match(styleSource, /\.production-canvas\s*\{[\s\S]*?min-height:\s*calc\(100vh - var\(--topbar-h\) - 48px\)/);
  assert.match(styleSource, /\.production-canvas-track\s*\{[\s\S]*?minmax\(190px, 1fr\)/);
  assert.match(styleSource, /\.production-node,\s*\.production-next-skeleton\s*\{[\s\S]*?min-height:\s*156px/);
});

test('production nodes carry stage state instead of decorative links', () => {
  assert.match(source, /const productionFlow = productionFlowFromWorkspace\(workspace\)/);
  assert.match(source, /visibleProductionStages\(productionFlow\)\.filter/);
  assert.match(source, /status: record\.status/);
  assert.match(canvasSource, /production-node-actions/);
  assert.match(source, /下游影响/);
  assert.match(source, /nodeStatusReason/);
  assert.match(source, /patchTouchesNode/);
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

test('production canvas exposes accessible stage actions', () => {
  assert.match(canvasSource, /aria-label=\{`重新生成\$\{node\.title\}`\}/);
  assert.match(canvasSource, /aria-label=\{`替换\$\{node\.title\}`\}/);
  assert.match(canvasSource, /onRegenerate\(node\)/);
  assert.match(canvasSource, /onReplace\(node\)/);
  assert.match(styleSource, /\.production-node-actions\s*\{/);
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
  assert.match(source, /visibleCanvasNodes/);
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
  assert.match(source, /visibleProductionStages\(productionFlow\)\.filter\(\(stage\) => stage !== nextGeneratingStage\)/);
  assert.match(canvasSource, /production-next-skeleton/);
});

test('review content uses a light work surface and mobile width boundaries', () => {
  assert.match(styleSource, /\.production-stage-review\s*\{[\s\S]*?background:\s*#f7f9f7/);
  assert.match(styleSource, /\.production-review-workspace\s*\{[\s\S]*?color:\s*var\(--text\)/);
  assert.match(styleSource, /@media \(max-width: 1024px\)[\s\S]*?\.studio-workbench,\s*\.studio-main,\s*\.studio-canvas,\s*\.production-canvas,\s*\.production-stage-review/);
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
  assert.match(canvasSource, /production-stage-review/);
  assert.match(canvasSource, /production-next-skeleton/);
});

test('each production stage retains exactly one primary confirmation action', () => {
  for (const label of [
    '确认脚本并生成角色',
    '确认角色并生成场景',
    '确认场景并生成分镜',
    '确认分镜并生成视频任务'
  ]) {
    assert.equal(source.split(label).length - 1, 1, `${label} should occur exactly once`);
  }
  assert.equal((runtimeSource.match(/确认视频任务并开始生成/g) || []).length, 1, 'video final confirmation should have one visible action');
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
  assert.match(source, /确认角色并生成场景/);
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
  assert.match(source, /body: JSON\.stringify\(\{ prompt: job\.prompt, negativePrompt: job\.negativePrompt \}\)/);
  assert.match(source, /Promise\.allSettled/);
  assert.match(source, /jobs\.slice\(index, index \+ 2\)/);
  assert.match(source, /persistSettledStageImages/);
  assert.match(source, /重新生成场景图/);
  assert.match(source, /替换场景图/);
});
