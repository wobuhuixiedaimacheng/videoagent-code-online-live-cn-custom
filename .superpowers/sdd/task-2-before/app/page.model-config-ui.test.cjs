const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, 'page.tsx'), 'utf8');
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
  assert.match(source, /setActiveTab\(nextScriptPatch \|\| nextScriptAsset \? 'script' : 'overview'\)/);
  assert.match(source, /className="studio-inspector-panel script-review-panel"/);
  assert.match(source, /className="script-output"/);
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
  assert.match(source, /<pre className="script-output">\{selectedAssetBody\}<\/pre>/);
  assert.match(source, /当前节点检查器/);
  const selectAssetBody = source.match(/function selectAsset\(id: string\) \{([\s\S]*?)\n  \}/)?.[1] || '';
  assert.ok(selectAssetBody.length > 0);
  assert.doesNotMatch(selectAssetBody, /setInspectorOpen\(true\)/);
  assert.doesNotMatch(selectAssetBody, /setInspectorDocked\(true\)/);
});

test('draft missions use a focused surface until generated assets exist', () => {
  assert.match(source, /const hasOutput = Boolean\(lastRun\) \|\| hasWorkspaceAssets/);
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

test('video generation handoff submits prepared tasks to the video render API', () => {
  assert.match(source, /async function submitVideoRender/);
  assert.match(source, /fetch\('\/api\/video\/render'/);
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
  assert.match(source, /prompt: buildVideoRenderPrompt\(prompt, targetDuration\)/);
  assert.match(source, /image: referenceImages.length === 1 && renderMode !== 'keyframes' \? referenceImages\[0\] : undefined/);
  assert.match(source, /keyframes: referenceImages.length > 1 \|\| renderMode === 'keyframes' \? referenceImages : undefined/);
  assert.match(source, /mode: renderMode/);
  assert.match(runtimeSource, /renderState\.videoUrl/);
  assert.match(runtimeSource, /onRender/);
  assert.match(runtimeSource, /生成本节视频/);
  assert.match(runtimeSource, /全部小节确认后再合成完整视频/);
  assert.match(runtimeSource, /查看视频/);
});

test('website can load the Xiaopeng V2 production workspace through a local demo URL', () => {
  assert.match(source, /async function loadDemoWorkspaceFromQuery/);
  assert.match(source, /new URLSearchParams\(window\.location\.search\)\.get\('demo'\)/);
  assert.match(source, /fetch\(`\/api\/demo-workspace\/\$\{encodeURIComponent\(demoId\)\}`\)/);
  assert.match(source, /setWorkspace\(data\.workspace\)/);
  assert.match(source, /小澎的恋爱史 V2 制作包已载入/);
});

test('video generation status keeps polling until the provider reaches a terminal state', () => {
  assert.match(source, /const VIDEO_POLL_INTERVAL_MS = 65000/);
  assert.match(source, /const VIDEO_POLL_MAX_ATTEMPTS = \d+/);
  assert.match(source, /async function pollVideoRender\(videoId = videoRender\.videoId \|\| '', attempt = 1\)/);
  assert.match(source, /String\(data\.status \|\| ''\)\.toLowerCase\(\)/);
  assert.match(source, /attempt < VIDEO_POLL_MAX_ATTEMPTS/);
  assert.match(source, /scheduleVideoPoll\(nextVideoId, attempt \+ 1\)/);
  assert.match(source, /scheduleVideoPoll\(nextVideoId, 1\)/);
});

test('output workbench adopts an OiiOii-like practical production layout', () => {
  assert.match(source, /className="studio-workbench"/);
  assert.match(source, /className="studio-assistant"/);
  assert.match(source, /制作助理/);
  assert.match(source, /className="studio-stage-nav"/);
  for (const stage of ['总览', '剧本', '角色', '场景', '分镜', '视频']) {
    assert.match(source, new RegExp(stage));
  }
  assert.match(source, /className="asset-canvas"/);
  assert.match(source, /className=\{`canvas-node/);
  assert.match(source, /当前节点检查器/);
});

test('mission canvas is sized as a primary production surface', () => {
  assert.match(styleSource, /grid-template-columns:\s*290px minmax\(700px, 1fr\) 310px/);
  assert.match(styleSource, /min-height:\s*clamp\(420px, 46vh, 540px\)/);
  assert.match(styleSource, /\.canvas-path\s*\{[\s\S]*?min-height:\s*300px/);
  assert.match(styleSource, /\.canvas-node\s*\{[\s\S]*?width:\s*244px/);
  assert.match(styleSource, /\.canvas-link\s*\{[\s\S]*?width:\s*92px/);
});

test('mission map nodes carry dependency semantics instead of decorative links', () => {
  assert.match(source, /Mission Map/);
  assert.match(source, /资产依赖图/);
  assert.match(source, /function canvasEdgeLabel/);
  assert.match(source, /锁定目标后写剧本/);
  assert.match(source, /从脚本抽角色/);
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
  assert.match(source, /nodeRevisionNode/);
  assert.match(source, /patchTouchesNode\(patch, nodeRevisionNode\)/);
  assert.match(source, /不要顺手重写 script\.md/);
  assert.match(source, /nodeRevisionNode\.stage/);
  assert.match(source, /提交节点修改/);
  assert.match(source, /当前节点 patch/);
});

test('main board exposes the complete pending patch package for review', () => {
  assert.match(source, /aria-label="制作包待审"/);
  assert.match(source, /className="package-review-list"/);
  assert.match(source, /pendingPatches\.map\(\(patch\) => \(/);
  assert.match(source, /patchReviewStageCounts/);
  assert.match(source, /function patchReviewStage/);
  assert.match(source, /function patchRiskLabel/);
  assert.match(source, /setSelectedPatchId\(patch\.id\)/);
  assert.match(source, /approvePatchIds\(allPendingPatchIds\)/);
  assert.match(source, /rejectPatchIds\(\[patch\.id\]\)/);
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
  assert.match(source, /className=\{`canvas-node \$\{node\.status\} \$\{node\.dependencyState\}/);
});

test('asset library saves only stable nodes through approval patches', () => {
  assert.match(source, /type AssetLibraryItem/);
  assert.match(source, /function isNodeStableForLibrary/);
  assert.match(source, /node\.status === 'ready' && node\.dependencyState === 'current' && node\.patchCount === 0/);
  assert.match(source, /function proposeAssetLibraryPatch/);
  assert.match(source, /filePath: 'asset_library\.json'/);
  assert.match(source, /patch\.filePath === 'asset_library\.json' && patch\.summary\.includes\(node\.title\)/);
  assert.match(source, /riskLevel: 'low'/);
  assert.match(source, /setManualPatches/);
  assert.match(source, /提议入库/);
  assert.match(source, /合并后才会写入 asset_library\.json/);
});

test('stage navigation drives a canvas camera instead of plain tab switching', () => {
  assert.match(source, /type StageCamera/);
  assert.match(source, /const stageCameras: Record<StudioStageId, StageCamera>/);
  assert.match(source, /function focusStudioStage\(stage: StudioStageId\)/);
  assert.match(source, /stageCameraStyle\(activeStageCamera\)/);
  assert.match(source, /aria-label=\{`聚焦\$\{stage\.label\}阶段`\}/);
  assert.match(source, /className="canvas-viewport"/);
  assert.match(source, /className="canvas-camera-hud"/);
  assert.match(styleSource, /\.canvas-viewport\s*\{/);
  assert.match(styleSource, /transform:\s*translate\(var\(--camera-x\), var\(--camera-y\)\) scale\(var\(--camera-zoom\)\)/);
  assert.match(styleSource, /transform-origin:\s*top left/);
});

test('mission map nodes expose asset-object actions directly on the canvas', () => {
  assert.match(source, /className="node-asset-actions"/);
  assert.match(source, /aria-label=\{`\$\{node\.label\}资产操作`\}/);
  assert.match(source, /预览/);
  assert.match(source, /重新生成/);
  assert.match(source, /替换资产/);
  assert.match(source, /入库/);
  assert.match(source, /nodeCanEnterLibrary/);
  assert.match(source, /proposeAssetLibraryPatch\(node\)/);
  assert.match(styleSource, /\.node-asset-actions\s*\{/);
});

test('selected node shows a production decision card with continue and revise paths', () => {
  assert.match(source, /type ProductionDecision/);
  assert.match(source, /function decisionCardForNode\(node: StudioCanvasNode\)/);
  assert.match(source, /const selectedDecision = selectedNode \? decisionCardForNode\(selectedNode\) : null/);
  assert.match(source, /className="production-decision-card"/);
  assert.match(source, /Production Decision/);
  assert.match(source, /选择制作路径/);
  assert.match(source, /decision\.options\.map/);
  assert.match(source, /确认并继续/);
  assert.match(source, /我要修改/);
  assert.match(source, /setNodeRevisionText\(decision\.revisionPrompt\)/);
  assert.match(styleSource, /\.production-decision-card\s*\{/);
});

test('overview exposes generated script and character assets instead of only node summaries', () => {
  assert.match(source, /function characterAssetsFromPrompts\(prompts: AssetPrompts\)/);
  assert.match(source, /const visibleCharacterAssets =/);
  assert.match(source, /className="asset-proof-strip"/);
  assert.match(source, /已生成脚本/);
  assert.match(source, /className="script-proof-card"/);
  assert.match(source, /查看全文/);
  assert.match(source, /className="character-proof-card"/);
  assert.match(source, /确认角色/);
  assert.match(styleSource, /\.asset-proof-strip\s*\{/);
  assert.match(styleSource, /\.script-proof-card\s*\{/);
  assert.match(styleSource, /\.character-proof-card\s*\{/);
});

test('character stage renders confirmable role cards from generated asset prompts', () => {
  assert.match(source, /type CharacterAssetCard/);
  assert.match(source, /className="character-asset-grid"/);
  assert.match(source, /visibleCharacterAssets\.map/);
  assert.match(source, /className="character-asset-card"/);
  assert.match(source, /角色一致性/);
  assert.match(source, /确认角色，继续场景/);
  assert.match(source, /setNodeRevisionText\(`我要修改角色/);
  assert.match(styleSource, /\.character-asset-grid\s*\{/);
  assert.match(styleSource, /\.character-asset-card\s*\{/);
});

test('character stage exposes pre-video role adjustment and expression controls', () => {
  assert.match(source, /CHARACTER_EXPRESSION_OPTIONS/);
  ['喜', '怒', '哀', '乐', '惊讶', '害羞', '紧张', '尴尬', '疑惑', '坚定', '疲惫', '得意', '恐惧', '释然', '温柔', '专注', '委屈', '慌张'].forEach((label) => {
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
