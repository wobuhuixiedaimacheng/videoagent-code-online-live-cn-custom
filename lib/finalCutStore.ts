import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeFinalCutState, type FinalCutState } from './videoStitch';

/**
 * 成片任务的落盘位置和读写。
 *
 * 状态存文件而不是模块级 Map：dev 模式下改一行代码就会热重载路由模块，
 * 内存里的任务连同进度一起蒸发，而后台的 ffmpeg 还在跑——
 * 用户看到的就是「合成永远停在 12%」，且没有任何办法恢复。
 *
 * 单独成文件还有一个原因：Next.js 的 route.ts 只允许导出 HTTP 方法和几个配置项，
 * 多导出一个工具函数就会破坏它的类型契约，所以共享逻辑必须待在路由外面。
 */

export const FINAL_CUT_DIR = path.join(process.cwd(), 'outputs', 'final-cuts');

/**
 * 已下载片段的跨任务缓存。
 *
 * 合成失败最常见的原因是几十段里有一段下载卡住。把片段放在 per-job 目录里、
 * 失败就连目录一起删掉，意味着用户重试时那 30 段下好的要全部重下——
 * 于是重试几乎必然又撞上同一类抖动，表现就是「一直合成失败」。
 * 按 URL 内容寻址缓存之后，重试只补缺的那几段。
 */
export const CLIP_CACHE_DIR = path.join(FINAL_CUT_DIR, '.clip-cache');

/** 任务 ID 会被拼进文件路径，只放行自己生成的形状，杜绝 ../ 穿越。 */
export function isValidFinalCutJobId(jobId: unknown): jobId is string {
  return typeof jobId === 'string' && /^cut_[a-z0-9]+_[a-z0-9]+$/i.test(jobId);
}

export function finalCutStatePath(jobId: string): string {
  return path.join(FINAL_CUT_DIR, `${jobId}.json`);
}

export function finalCutOutputPath(jobId: string): string {
  return path.join(FINAL_CUT_DIR, `${jobId}.mp4`);
}

export function finalCutClipsDir(jobId: string): string {
  return path.join(FINAL_CUT_DIR, `${jobId}-clips`);
}

export async function writeFinalCutState(state: FinalCutState): Promise<FinalCutState> {
  await fs.mkdir(FINAL_CUT_DIR, { recursive: true });
  await fs.writeFile(finalCutStatePath(state.jobId), JSON.stringify(state, null, 2), 'utf8');
  return state;
}

export async function readFinalCutState(jobId: string): Promise<FinalCutState | null> {
  if (!isValidFinalCutJobId(jobId)) return null;
  try {
    return normalizeFinalCutState(JSON.parse(await fs.readFile(finalCutStatePath(jobId), 'utf8')));
  } catch {
    return null;
  }
}

export async function removeFinalCutJob(jobId: string): Promise<void> {
  if (!isValidFinalCutJobId(jobId)) return;
  await Promise.all([
    fs.rm(finalCutStatePath(jobId), { force: true }),
    fs.rm(finalCutOutputPath(jobId), { force: true }),
    fs.rm(finalCutClipsDir(jobId), { recursive: true, force: true })
  ]);
}

export function newFinalCutJobId(): string {
  return `cut_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** 片段缓存按 URL 内容寻址：同一个上游地址永远落到同一个文件，重试才能命中。 */
export function clipCachePath(url: string): string {
  return path.join(CLIP_CACHE_DIR, `${createHash('sha256').update(url).digest('hex').slice(0, 32)}.mp4`);
}

/**
 * 清掉长期没被碰过的缓存片段。不清的话，每做一个项目就往盘上留几百 MB。
 * 按 mtime 而不是创建时间：重试合成会 touch 到用得上的那些，它们不该被清走。
 */
export async function pruneClipCache(maxAgeMs: number): Promise<void> {
  let entries: string[];
  try {
    entries = await fs.readdir(CLIP_CACHE_DIR);
  } catch {
    return;
  }
  const cutoff = Date.now() - maxAgeMs;
  await Promise.all(entries.map(async (name) => {
    const filePath = path.join(CLIP_CACHE_DIR, name);
    try {
      const stat = await fs.stat(filePath);
      if (stat.mtimeMs < cutoff) await fs.rm(filePath, { force: true });
    } catch {
      // 清理是尽力而为，清不掉不该影响合成。
    }
  }));
}
