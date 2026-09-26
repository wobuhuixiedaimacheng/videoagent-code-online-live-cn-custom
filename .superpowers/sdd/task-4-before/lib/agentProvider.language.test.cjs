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

test('fallback asset prompts are readable Chinese, not English prompt templates', () => {
  assert.match(source, /同一个真实人物/);
  assert.match(source, /不要畸形手指/);
  assert.match(source, /镜头任务/);
  assert.match(source, /画面里出现的字幕、菜单、招牌、包装文字和旁白全部使用中文/);
  assert.match(source, /禁止英文字幕、英文菜单、英文招牌、英文包装和英文旁白/);
  assert.doesNotMatch(source, /same realistic subject|deformed hands|subtitle intent/);
  assert.doesNotMatch(source, /script, characters, scenes, storyboard|video prompts and renderQueue ready/);
});

test('custom provider failures include model endpoint and timeout guidance', () => {
  assert.match(source, /const AGENT_PROVIDER_TIMEOUT_MS/);
  assert.match(source, /async function fetchWithProviderTimeout/);
  assert.match(source, /controller\.abort\(\)/);
  assert.match(source, /error\.name === 'AbortError'/);
  assert.match(source, /模型请求失败/);
  assert.match(source, /请切换文本模型/);
  assert.match(source, /fetchWithProviderTimeout\(endpoint/);
});
