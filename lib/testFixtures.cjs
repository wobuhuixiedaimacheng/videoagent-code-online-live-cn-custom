const STAGES = ['script', 'character', 'scene', 'storyboard', 'video'];

function workspaceWith(contents = {}) {
  const timestamp = '2026-07-11T12:00:00.000Z';
  const files = Object.entries(contents).map(([path, content], index) => ({
    path,
    kind: path.endsWith('.md') ? 'markdown' : path.includes('asset') ? 'asset' : 'json',
    content,
    version: index + 1,
    updatedAt: timestamp
  }));
  return {
    projectId: 'test-project', title: '测试项目', branch: 'draft/v0', mode: 'smb',
    activeWorkflow: 'generate', files, currentTimelineVersion: 0, complianceStatus: 'pass'
  };
}

function patch(filePath, after, before = '') {
  return {
    id: `patch-${filePath}`, filePath, summary: `更新 ${filePath}`, before, after,
    riskLevel: 'low', requiresApproval: true
  };
}

function stageRecord(status = 'locked', draftVersion = null) {
  return {
    status, draftVersion, confirmedVersion: null, confirmedAt: null, confirmedBy: null,
    confirmationKey: null, generationJobId: null, sourceVersions: {}, error: null
  };
}

function readyFlow(stage, draftVersion) {
  const stages = Object.fromEntries(STAGES.map((id) => [id, stageRecord('locked')]));
  const index = STAGES.indexOf(stage);
  for (let i = 0; i < index; i += 1) {
    stages[STAGES[i]] = { ...stageRecord('confirmed', 1), confirmedVersion: 1 };
  }
  stages[stage] = stageRecord('ready_for_review', draftVersion);
  return { schemaVersion: 1, currentStage: stage, stages, videoJobs: [] };
}

function confirmedFlow() {
  const flow = readyFlow('video', 1);
  for (const stage of STAGES) {
    flow.stages[stage] = { ...stageRecord('confirmed', 1), confirmedVersion: 1 };
  }
  return flow;
}

function confirmationInput(stage, version, key) {
  return {
    stage, expectedDraftVersion: version, confirmationKey: key,
    confirmedAt: '2026-07-11T12:00:00.000Z', confirmedBy: 'local-user',
    nextGenerationJobId: stage === 'video' ? null : `${stage}-next-job`, sourceVersions: {}
  };
}

function parseFile(workspace, path) {
  const file = workspace.files.find((item) => item.path === path);
  if (!file) throw new Error(`Missing fixture file: ${path}`);
  return JSON.parse(file.content);
}

function fileVersion(workspace, path) {
  return workspace.files.find((item) => item.path === path)?.version || 0;
}

function videoJob(status, promptId, videoUrl = '') {
  return { id: `job-${promptId}`, promptId, status, attempt: 1, ...(videoUrl ? { videoUrl } : {}) };
}

module.exports = {
  STAGES, workspaceWith, patch, readyFlow, confirmedFlow, confirmationInput,
  parseFile, fileVersion, videoJob
};
