import fs from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const demoWorkspaces: Record<string, string> = {
  'xiaopeng-v2': path.join(process.cwd(), 'outputs', 'xiaopeng-love-history-3min-v2', 'workspace.json'),
  // 分镜拆分改造后的实跑结果：12 个场景拆成 36 个 5 秒镜头，分镜停在待确认。
  // 留着是为了能直接看到「场景 ≠ 镜头」之后的形态，不用重跑一遍全流程。
  'xiaopeng-shot-split': path.join(process.cwd(), 'outputs', 'xiaopeng-shot-split', 'workspace.json')
};

export async function GET(_request: Request, context: { params: { id: string } }) {
  const workspacePath = demoWorkspaces[context.params.id];
  if (!workspacePath) {
    return NextResponse.json({ ok: false, error: 'Unknown demo workspace.' }, { status: 404 });
  }

  try {
    const workspace = JSON.parse(await fs.readFile(workspacePath, 'utf8'));
    return NextResponse.json({ ok: true, workspace });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load demo workspace.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
