import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import { Readable } from 'node:stream';
import { NextResponse } from 'next/server';
import { finalCutOutputPath, isValidFinalCutJobId, readFinalCutState } from '../../../../../lib/finalCutStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 成片文件出口。
 *
 * 仓库里没有 public/，成片也不该放进去（几百 MB 的产物进不了版本库，也不该被静态托管）。
 * 所以走这条路由从 outputs/final-cuts 读。
 *
 * 必须支持 Range：<video> 标签播放几百 MB 的文件时会先发一个 Range 请求探边界，
 * 只会整文件返回的话，用户看到的是一个既不播放也不报错的黑框。
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const jobId = url.searchParams.get('job_id') || '';
  if (!isValidFinalCutJobId(jobId)) {
    return NextResponse.json({ ok: false, error: 'job_id 无效。' }, { status: 400 });
  }

  const filePath = finalCutOutputPath(jobId);
  let size = 0;
  try {
    size = (await fs.stat(filePath)).size;
  } catch {
    return NextResponse.json({ ok: false, error: '成片文件不存在，可能已被清理。请重新合成。' }, { status: 404 });
  }

  const state = await readFinalCutState(jobId);
  const fileName = state?.fileName || `${jobId}.mp4`;
  const disposition = url.searchParams.get('download') === '1' ? 'attachment' : 'inline';
  // 文件名里几乎必然有中文，只给裸 filename 会在部分浏览器里变成乱码或被截断。
  const contentDisposition = `${disposition}; filename="final-cut.mp4"; filename*=UTF-8''${encodeURIComponent(fileName)}`;

  const range = request.headers.get('range');
  const match = range ? /bytes=(\d*)-(\d*)/.exec(range) : null;
  if (match) {
    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    if (!Number.isFinite(start) || start >= size || end < start) {
      return new NextResponse(null, { status: 416, headers: { 'content-range': `bytes */${size}` } });
    }
    const stream = Readable.toWeb(createReadStream(filePath, { start, end })) as ReadableStream;
    return new NextResponse(stream, {
      status: 206,
      headers: {
        'content-type': 'video/mp4',
        'content-length': String(end - start + 1),
        'content-range': `bytes ${start}-${end}/${size}`,
        'accept-ranges': 'bytes',
        'content-disposition': contentDisposition,
        'cache-control': 'no-store'
      }
    });
  }

  const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream;
  return new NextResponse(stream, {
    status: 200,
    headers: {
      'content-type': 'video/mp4',
      'content-length': String(size),
      'accept-ranges': 'bytes',
      'content-disposition': contentDisposition,
      'cache-control': 'no-store'
    }
  });
}
