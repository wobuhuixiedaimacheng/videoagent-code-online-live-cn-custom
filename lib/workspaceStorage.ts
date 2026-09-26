/**
 * 浏览器持久化的信封与配额计算。
 *
 * 这一层存在的原因：工作区曾经直接把裸 WorkspaceSnapshot 塞进 localStorage，
 * 没有版本号、不校验配额、解析失败就静默换成空白工作区。
 * 结果是数据结构一改动、或者内容一超限，用户的项目就无声消失。
 */

export const WORKSPACE_SCHEMA_VERSION = 1;

export type WorkspaceEnvelope = {
  schemaVersion: number;
  savedAt: string;
  workspace: unknown;
};

export type DecodedWorkspace =
  | { ok: true; schemaVersion: number; savedAt: string; workspace: unknown; legacy: boolean }
  | { ok: false; reason: 'empty' | 'unparsable' | 'future_version'; raw: string };

export function encodeWorkspaceEnvelope(workspace: unknown, savedAt: string): string {
  const envelope: WorkspaceEnvelope = {
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    savedAt,
    workspace
  };
  return JSON.stringify(envelope);
}

export function decodeWorkspaceEnvelope(raw: string | null | undefined): DecodedWorkspace {
  if (!raw) return { ok: false, reason: 'empty', raw: '' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (_) {
    return { ok: false, reason: 'unparsable', raw };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, reason: 'unparsable', raw };
  }

  const record = parsed as Record<string, unknown>;
  // 信封出现之前存的是裸 snapshot，必须继续读得出来，否则升级即清空存量项目。
  if (typeof record.schemaVersion !== 'number') {
    return { ok: true, schemaVersion: 0, savedAt: '', workspace: parsed, legacy: true };
  }
  // 更高版本是「用新版写过、又退回旧版打开」，此时旧代码读不懂，宁可报错也不能当成损坏丢掉。
  if (record.schemaVersion > WORKSPACE_SCHEMA_VERSION) {
    return { ok: false, reason: 'future_version', raw };
  }
  return {
    ok: true,
    schemaVersion: record.schemaVersion,
    savedAt: typeof record.savedAt === 'string' ? record.savedAt : '',
    workspace: record.workspace,
    legacy: false
  };
}

/**
 * localStorage 配额按 UTF-16 码元计费，一个中文字符算 2 字节。
 * 用 UTF-8 长度估算会把中文内容低估约三分之一，于是预检通过、写入却抛 QuotaExceededError。
 */
export function localStorageByteLength(value: string): number {
  return value.length * 2;
}

export function isQuotaExceededError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { name?: unknown; code?: unknown };
  return (
    candidate.name === 'QuotaExceededError' ||
    candidate.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    candidate.code === 22 ||
    candidate.code === 1014
  );
}

/** 解析失败的原文搬到这里，绝不直接丢弃——它可能是用户唯一一份数据。 */
export function workspaceRecoveryKey(storageKey: string): string {
  return `${storageKey}:corrupted`;
}

export function recoveryNoticeFor(reason: 'unparsable' | 'future_version', storageKey: string): string {
  if (reason === 'future_version') {
    return `这个项目由更新版本的工作台保存，当前版本读不了。原始数据已保留在 ${workspaceRecoveryKey(storageKey)}，请升级后再打开，不要在此覆盖保存。`;
  }
  return `项目数据解析失败，已改为打开空白工作区。原始数据已备份到 ${workspaceRecoveryKey(storageKey)}，没有被删除。`;
}
