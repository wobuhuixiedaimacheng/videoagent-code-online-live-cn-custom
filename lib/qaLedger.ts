import { PHYSICS_QA_CHECK_LABELS, physicsModeLabel, type PhysicsMode, type PhysicsQaCheck } from './shotPhysics';
import type { VideoQaRetryStrategy, VideoQaVerdict } from './videoQa';
import type { WorkspaceSnapshot } from './types';

/**
 * 质检账本。
 *
 * 质检失败的信息以前是一次性的：这个镜头崩了两次 → 提示人回分镜改 → 片子做完 → 信息蒸发。
 * 下一个片子从零开始踩一模一样的坑，而 VIDEO_QA_MAX_ATTEMPTS = 2 只防住了单次浪费，
 * 没有让系统变聪明。
 *
 * 这里把每一次打回记成一条，再聚合成一句人和模型都能读的结论，落到 .aigc/qa_ledger.json。
 * 这个路径已经在脚本阶段的提示词上下文里（见 stageGeneration 的 SCRIPT_PROMPT_CONTEXT_FILES），
 * 所以账本一旦有内容，下一次写脚本时模型就能看见——这才是闭环，否则只是又一份没人看的日志。
 */

export const QA_LEDGER_PATH = '.aigc/qa_ledger.json';

export type QaLedgerEntry = {
  sceneId: string;
  mode: PhysicsMode;
  /** 第几次重渲触发的这条记录，0 表示首渲就被打回。 */
  attempt: number;
  checks: PhysicsQaCheck[];
  strategy: VideoQaRetryStrategy | null;
  /** 刷满重试次数仍未通过。这类记录最有价值：它标记的是靠重渲救不回来的镜头。 */
  exhausted: boolean;
};

export type QaLedger = {
  schemaVersion: 1;
  entries: QaLedgerEntry[];
};

/** 账本只增不改，但要有上限——否则长项目的提示词会被历史记录挤爆。 */
export const QA_LEDGER_MAX_ENTRIES = 200;

export function emptyQaLedger(): QaLedger {
  return { schemaVersion: 1, entries: [] };
}

export function parseQaLedger(raw: unknown): QaLedger {
  if (!raw || typeof raw !== 'object') return emptyQaLedger();
  const candidate = raw as Partial<QaLedger>;
  if (candidate.schemaVersion !== 1 || !Array.isArray(candidate.entries)) return emptyQaLedger();
  const entries = candidate.entries.filter((entry): entry is QaLedgerEntry =>
    Boolean(entry) && typeof entry === 'object' && typeof (entry as QaLedgerEntry).sceneId === 'string'
  );
  return { schemaVersion: 1, entries };
}

export function recordQaFailure(
  ledger: QaLedger,
  entry: {
    sceneId: string;
    verdict: VideoQaVerdict;
    attempt: number;
    strategy: VideoQaRetryStrategy | null;
    exhausted: boolean;
  }
): QaLedger {
  // 只记 failed。skipped（一帧都没抽到）不是质量信号，记进来会把统计带偏。
  if (entry.verdict.status !== 'failed') return ledger;

  const checks = Array.from(new Set(entry.verdict.issues.map((issue) => issue.check)));
  const next: QaLedgerEntry = {
    sceneId: entry.sceneId,
    mode: entry.verdict.mode,
    attempt: entry.attempt,
    checks,
    strategy: entry.strategy,
    exhausted: entry.exhausted
  };
  return {
    schemaVersion: 1,
    entries: [...ledger.entries, next].slice(-QA_LEDGER_MAX_ENTRIES)
  };
}

export function qaLedgerFromWorkspace(workspace: WorkspaceSnapshot): QaLedger {
  const file = workspace.files.find((item) => item.path === QA_LEDGER_PATH);
  if (!file?.content) return emptyQaLedger();
  try {
    return parseQaLedger(JSON.parse(file.content));
  } catch {
    // 账本坏掉不该拖垮渲染流程：当成空账本继续，下一次写入会把它覆盖回合法结构。
    return emptyQaLedger();
  }
}

export function writeQaLedger(workspace: WorkspaceSnapshot, ledger: QaLedger): WorkspaceSnapshot {
  const existingIndex = workspace.files.findIndex((file) => file.path === QA_LEDGER_PATH);
  const existing = workspace.files[existingIndex];
  const nextFile = {
    path: QA_LEDGER_PATH,
    kind: 'config' as const,
    content: JSON.stringify(ledger, null, 2),
    version: (existing?.version || 0) + 1,
    updatedAt: new Date().toISOString()
  };
  const files = [...workspace.files];
  if (existingIndex >= 0) files[existingIndex] = nextFile;
  else files.push(nextFile);
  return { ...workspace, files };
}

export type QaLedgerSummary = {
  totalFailures: number;
  exhaustedShots: number;
  topChecks: Array<{ check: PhysicsQaCheck; count: number }>;
  byMode: Array<{ mode: PhysicsMode; count: number }>;
};

export function summarizeQaLedger(ledger: QaLedger): QaLedgerSummary {
  const checkCounts = new Map<PhysicsQaCheck, number>();
  const modeCounts = new Map<PhysicsMode, number>();
  const exhausted = new Set<string>();

  for (const entry of ledger.entries) {
    for (const check of entry.checks) checkCounts.set(check, (checkCounts.get(check) || 0) + 1);
    modeCounts.set(entry.mode, (modeCounts.get(entry.mode) || 0) + 1);
    if (entry.exhausted) exhausted.add(entry.sceneId);
  }

  return {
    totalFailures: ledger.entries.length,
    exhaustedShots: exhausted.size,
    topChecks: [...checkCounts.entries()]
      .map(([check, count]) => ({ check, count }))
      .sort((a, b) => b.count - a.count || a.check.localeCompare(b.check)),
    byMode: [...modeCounts.entries()]
      .map(([mode, count]) => ({ mode, count }))
      .sort((a, b) => b.count - a.count || a.mode.localeCompare(b.mode))
  };
}

/**
 * 给脚本阶段读的那一段。刻意写成「历史教训」而不是「硬性规则」：
 * 这些统计来自过往片子，对当前选题不一定成立，写成规则会让模型为了避坑而放弃合理的情节。
 */
export function qaLedgerInstruction(ledger: QaLedger): string {
  const summary = summarizeQaLedger(ledger);
  if (!summary.totalFailures) return '';

  const checkLines = summary.topChecks
    .slice(0, 3)
    .map((item) => `  - ${PHYSICS_QA_CHECK_LABELS[item.check]}：被打回 ${item.count} 次。`)
    .join('\n');
  const modeLine = summary.byMode
    .map((item) => `${physicsModeLabel(item.mode)} ${item.count} 次`)
    .join('、');

  return `
本项目过往的画面质检打回记录（历史教训，不是硬性规则；和当前选题冲突时以选题为准）：
- 累计打回 ${summary.totalFailures} 次，其中 ${summary.exhaustedShots} 个镜头刷满重渲仍未通过——这类镜头靠重渲救不回来，只能在脚本阶段绕开。
- 打回最多的问题：
${checkLines}
- 按物理模式分布：${modeLine}。
写新脚本时优先避开上面这几类问题的成因，而不是等分镜和质检去补救。`;
}
