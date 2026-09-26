import { NextResponse } from 'next/server';
import { isWorkspaceSnapshot } from '../../../../lib/workspace';
import {
  PROJECT_STORE_SCHEMA_VERSION,
  applyFinalCutSidecar,
  deleteProjectRecord,
  isSafeProjectId,
  readProjectRecord,
  writeProjectRecord
} from '../../../../lib/projectStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: { id: string } };

export async function GET(_request: Request, context: RouteContext) {
  const projectId = context.params.id;
  if (!isSafeProjectId(projectId)) {
    return NextResponse.json({ ok: false, error: 'Invalid project id.' }, { status: 400 });
  }
  const record = await readProjectRecord(projectId);
  if (!record) {
    return NextResponse.json({ ok: false, error: 'Project not found.' }, { status: 404 });
  }
  // 伴生成片恢复：主档案缺成片而伴生文件在，就把成片状态补进去（见 projectStore 注释）。
  return NextResponse.json({ ok: true, project: await applyFinalCutSidecar(record) });
}

export async function PUT(request: Request, context: RouteContext) {
  const projectId = context.params.id;
  if (!isSafeProjectId(projectId)) {
    return NextResponse.json({ ok: false, error: 'Invalid project id.' }, { status: 400 });
  }

  let body: { workspace?: unknown; messages?: unknown; videoSpec?: unknown; savedAt?: unknown };
  try {
    body = await request.json();
  } catch (_) {
    return NextResponse.json({ ok: false, error: 'Request body must be JSON.' }, { status: 400 });
  }

  const workspace = body.workspace;
  if (!isWorkspaceSnapshot(workspace)) {
    return NextResponse.json({ ok: false, error: 'Payload is not a valid workspace snapshot.' }, { status: 400 });
  }
  // URL 里的 id 是档案文件名，快照里的 projectId 是内容。两者不一致时写进去的档案
  // 以后会被列表当成另一个项目读出来，宁可当场拒绝。
  if (workspace.projectId !== projectId) {
    return NextResponse.json({ ok: false, error: 'Workspace projectId does not match URL.' }, { status: 400 });
  }

  try {
    await writeProjectRecord({
      schemaVersion: PROJECT_STORE_SCHEMA_VERSION,
      projectId,
      savedAt: typeof body.savedAt === 'string' ? body.savedAt : new Date().toISOString(),
      workspace,
      messages: Array.isArray(body.messages) ? body.messages : [],
      videoSpec: body.videoSpec
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to save project.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const projectId = context.params.id;
  if (!isSafeProjectId(projectId)) {
    return NextResponse.json({ ok: false, error: 'Invalid project id.' }, { status: 400 });
  }
  const removed = await deleteProjectRecord(projectId);
  if (!removed) {
    return NextResponse.json({ ok: false, error: 'Project not found.' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
