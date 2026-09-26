const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, 'agentProvider.ts'), 'utf8');

test('agent provider requires Chinese for human-facing deliverables', () => {
  assert.match(source, /OUTPUT_LANGUAGE_POLICY/);
  assert.match(source, /所有面向用户的内容必须使用简体中文/);
  assert.match(source, /asset_prompts\.json/);
  assert.match(source, /视频模型提示词/);
});

test('agent provider declares stage-bound outputs and confirmed upstream inputs', () => {
  assert.match(source, /stageGenerationInstruction/);
  assert.match(source, /productionStage/);
  assert.match(source, /generationJobId/);
  assert.match(source, /sourceVersions/);
  assert.match(source, /characters\.json/);
  assert.match(source, /production_flow\.json/);
});

test('fallback asset prompts are readable Chinese, not English prompt templates', () => {
  assert.match(source, /同一个真实人物/);
  assert.match(source, /不要畸形手指/);
  assert.match(source, /镜头任务/);
  assert.match(source, /画面里不得出现任何文字/);
  assert.match(source, /人声一律中文普通话，禁止英文、外语和中英夹杂/);
  // 台词要从分镜的 narration 逐字带过去，不给词模型就会自己即兴，先说英文再转中文。
  // 具体措辞统一由 voiceMode 提供——这里自己再写一套，四层立刻打架。
  assert.match(source, /function audioLine/);
  assert.match(source, /dialoguePromptDirective\(narration\)/);
  assert.match(source, /voiceNegativePrompt\(\)/);
  // 旁白禁令必须进到兜底模板里，不能只写在给模型的说明里。
  assert.match(source, /isDialogueNarration\(scene\.narration\)/);
  assert.match(source, /toDialogueNarration\(/);
  assert.match(source, /narration: String\(s\.narration \|\| s\.scriptSegment \|\| ''\)\.trim\(\)/);
  // 「字幕意图」一旦进了视频提示词，模型就会往画面上画汉字，而它画出来的是乱码。
  assert.doesNotMatch(source, /字幕意图：\$\{scene\.subtitle\}/);
  assert.doesNotMatch(source, /same realistic subject|deformed hands|subtitle intent/);
  assert.doesNotMatch(source, /script, characters, scenes, storyboard|video prompts and renderQueue ready/);
});

test('custom provider failures include model endpoint and timeout guidance', () => {
  // 超时值必须是运行时读取的，模块常量会在加载时固化、改了 .env 也不生效。
  assert.match(source, /function agentTimeoutMs\(\)/);
  assert.match(source, /process\.env\.AGENT_PROVIDER_TIMEOUT_MS/);
  assert.doesNotMatch(source, /const AGENT_PROVIDER_TIMEOUT_MS\s*=/);
  assert.match(source, /async function fetchWithProviderTimeout/);
  assert.match(source, /controller\.abort\(\)/);
  assert.match(source, /error\.name === 'AbortError'/);
  // 超时和网络错误的解法不同，各自要有能照做的指引。
  assert.match(source, /模型请求超时/);
  assert.match(source, /模型请求失败/);
  assert.match(source, /请切换文本模型/);
  assert.match(source, /fetchWithProviderTimeout\(endpoint/);
});
