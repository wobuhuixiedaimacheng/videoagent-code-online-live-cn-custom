import type { WorkspaceMode, WorkspaceSnapshot } from './types';

const now = () => new Date().toISOString();

function file(path: string, kind: WorkspaceSnapshot['files'][number]['kind'], version: number, content: string) {
  return {
    path,
    kind,
    version,
    updatedAt: now(),
    content
  };
}

function memory(mode: WorkspaceMode) {
  return `# AIGC Project Memory

- Product direction: chat-first AI video creation workspace.
- Foreground agent: Creative Director Agent only.
- Background specialists may generate script, storyboard, timeline, prompts, compliance, feedback, and patch files.
- Entry state: blank mission. Do not preload sample industries, sample videos, or pretend a mission exists.
- Data feedback records only manual choices, rejection reasons, and hypotheses until real performance data is connected.
- Persistent writes must be proposed as patches and approved before merge.
- Current mode: ${mode === 'smb' ? 'small business or product/service marketing' : 'creator or account content'}.
`;
}

export function createBlankWorkspace(mode: WorkspaceMode = 'smb'): WorkspaceSnapshot {
  return {
    projectId: 'va_' + Math.random().toString(36).slice(2, 8),
    title: 'untitled-video-mission',
    branch: 'draft/v0',
    mode,
    activeWorkflow: 'generate',
    currentTimelineVersion: 0,
    complianceStatus: 'pass',
    files: [file('.aigc/MEMORY.md', 'markdown', 1, memory(mode))]
  };
}

export function createDefaultWorkspace(mode: WorkspaceMode = 'creator'): WorkspaceSnapshot {
  return createBlankWorkspace(mode);
}
