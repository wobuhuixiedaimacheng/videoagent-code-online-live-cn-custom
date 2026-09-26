/**
 * 服务端项目档案：data/projects/<projectId>.json。
 *
 * 这一层存在的原因：项目原本只活在浏览器 localStorage 里——3MB 上限一超就静默不存，
 * 「新建」还会直接删掉旧项目的 key。用户关掉网页再打开，做过的东西就没了。
 * 磁盘上的档案才是真源，localStorage 退化成加速缓存。
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { isWorkspaceSnapshot } from './workspace';
import { PRODUCTION_FLOW_PATH } from './productionFlow';
import type { ProjectSummary, WorkspaceSnapshot } from './types';

export const PROJECT_STORE_SCHEMA_VERSION = 1;

export type StoredProjectRecord = {
  schemaVersion: number;
  projectId: string;
  savedAt: string;
  workspace: WorkspaceSnapshot;
  messages: unknown[];
  videoSpec?: unknown;
};

export type { ProjectSummary };

/** projectId 会拼进文件路径，除白名单字符外一律拒绝，杜绝路径穿越。 */
export function isSafeProjectId(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id);
}

export function projectsDir(): string {
  return process.env.VIDEOAGENT_PROJECTS_DIR || path.join(process.cwd(), 'data', 'projects');
}

function projectFilePath(projectId: string): string {
  return path.join(projectsDir(), `${projectId}.json`);
}

export function parseStoredProjectRecord(raw: string): StoredProjectRecord | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (_) {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  if (typeof record.schemaVersion !== 'number' || record.schemaVersion > PROJECT_STORE_SCHEMA_VERSION) return null;
  if (!isSafeProjectId(record.projectId)) return null;
  if (typeof record.savedAt !== 'string') return null;
  if (!isWorkspaceSnapshot(record.workspace)) return null;
  const messages = Array.isArray(record.messages) ? record.messages : [];
  return {
    schemaVersion: record.schemaVersion,
    projectId: record.projectId,
    savedAt: record.savedAt,
    workspace: record.workspace,
    messages,
    videoSpec: record.videoSpec
  };
}

export function projectSummaryFromRecord(record: StoredProjectRecord): ProjectSummary {
  let currentStage = '';
  const flowFile = record.workspace.files.find((file) => file.path === PRODUCTION_FLOW_PATH);
  if (flowFile) {
    try {
      const flow = JSON.parse(flowFile.content) as { currentStage?: unknown };
      if (typeof flow.currentStage === 'string') currentStage = flow.currentStage;
    } catch (_) {}
  }
  return {
    projectId: record.projectId,
    title: record.workspace.title || 'untitled-video-mission',
    mode: record.workspace.mode,
    savedAt: record.savedAt,
    currentStage,
    fileCount: record.workspace.files.length,
    messageCount: record.messages.length
  };
}

export async function readProjectRecord(projectId: string): Promise<StoredProjectRecord | null> {
  if (!isSafeProjectId(projectId)) return null;
  let raw: string;
  try {
    raw = await fs.readFile(projectFilePath(projectId), 'utf8');
  } catch (_) {
    return null;
  }
  return parseStoredProjectRecord(raw);
}

/**
 * 写入走 tmp + rename：进程在写一半时被杀，留下的是完整的旧档案加一个孤儿 tmp，
 * 而不是半截 JSON 覆盖掉用户唯一一份数据。
 */
let tmpSequence = 0;

export async function writeProjectRecord(record: StoredProjectRecord): Promise<void> {
  if (!isSafeProjectId(record.projectId)) throw new Error('Invalid project id.');
  const dir = projectsDir();
  await fs.mkdir(dir, { recursive: true });
  const target = projectFilePath(record.projectId);
  // pid + 进程内自增序号：同一毫秒的并发写各用各的 tmp，rename 才不会互相踩。
  tmpSequence += 1;
  const tmp = `${target}.tmp-${process.pid}-${tmpSequence.toString(36)}-${Date.now().toString(36)}`;
  const payload = JSON.stringify(record);
  try {
    await fs.writeFile(tmp, payload, 'utf8');
    await fs.rename(tmp, target);
  } catch (error) {
    await fs.rm(tmp, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function deleteProjectRecord(projectId: string): Promise<boolean> {
  if (!isSafeProjectId(projectId)) return false;
  try {
    await fs.rm(projectFilePath(projectId));
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * 成片恢复伴生文件：data/projects/<projectId>.finalcut.json。
 *
 * 用途是事故恢复：当项目档案里的成片记录丢失、而用户手里还有成片文件时，
 * 把 FinalCutState 写进伴生文件，读取项目时若主档案没有成片就注入这份。
 * 前端恢复后第一次自动保存会把它固化进主档案，此后伴生文件即可删除。
 * 文件名带点，天然过不了 isSafeProjectId，绝不会被列表当成另一个项目。
 */
export function finalCutSidecarPath(projectId: string): string {
  return path.join(projectsDir(), `${projectId}.finalcut.json`);
}

export async function applyFinalCutSidecar(record: StoredProjectRecord): Promise<StoredProjectRecord> {
  let sidecarRaw: string;
  try {
    sidecarRaw = await fs.readFile(finalCutSidecarPath(record.projectId), 'utf8');
  } catch (_) {
    return record;
  }
  let sidecar: unknown;
  try {
    sidecar = JSON.parse(sidecarRaw);
  } catch (_) {
    return record;
  }
  if (!sidecar || typeof sidecar !== 'object') return record;
  const files = record.workspace.files;
  const flowIndex = files.findIndex((file) => file.path === PRODUCTION_FLOW_PATH);
  if (flowIndex < 0) return record;
  try {
    const flow = JSON.parse(files[flowIndex].content) as { finalCut?: unknown };
    // 主档案已经有成片时绝不覆盖——伴生文件只补空缺，不抢真相。
    if (flow.finalCut) return record;
    flow.finalCut = sidecar;
    const nextFiles = files.slice();
    nextFiles[flowIndex] = { ...nextFiles[flowIndex], content: JSON.stringify(flow, null, 2) };
    return { ...record, workspace: { ...record.workspace, files: nextFiles } };
  } catch (_) {
    return record;
  }
}

/** 解析不动的档案跳过但绝不删——它可能还能人工救回来。 */
export async function listProjectSummaries(): Promise<ProjectSummary[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(projectsDir());
  } catch (_) {
    return [];
  }
  const summaries: ProjectSummary[] = [];
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    const projectId = entry.slice(0, -'.json'.length);
    if (!isSafeProjectId(projectId)) continue;
    const record = await readProjectRecord(projectId);
    if (!record) continue;
    summaries.push(projectSummaryFromRecord(record));
  }
  summaries.sort((a, b) => (a.savedAt < b.savedAt ? 1 : a.savedAt > b.savedAt ? -1 : 0));
  return summaries;
}
