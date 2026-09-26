import { NextResponse } from 'next/server';
import { runVideoAgent } from '../../../../lib/agentProvider';
import { InvalidStageOutputError } from '../../../../lib/scriptStageValidation';
import { isWorkspaceSnapshot } from '../../../../lib/workspace';
import { PROJECT_STORE_SCHEMA_VERSION, writeProjectRecord } from '../../../../lib/projectStore';
import type { AgentRunRequest } from '../../../../lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 请求体里的 workspace 快照顺手归档进 data/projects/。
 * 这不只是锦上添花：修复自动保存之前发布的旧版前端从不写档，用户的项目只活在
 * 标签页内存里——它每次让 agent 干活都会把完整快照 POST 过来，这是那份数据
 * 唯一送达服务端的通道。归档失败绝不能影响 agent 本身，静默吞掉。
 */
function archiveRequestSnapshot(body: AgentRunRequest) {
  const workspace = body?.workspace;
  if (!isWorkspaceSnapshot(workspace)) return;
  void writeProjectRecord({
    schemaVersion: PROJECT_STORE_SCHEMA_VERSION,
    projectId: workspace.projectId,
    savedAt: new Date().toISOString(),
    workspace,
    messages: Array.isArray(body.history) ? body.history : []
  }).catch(() => undefined);
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as AgentRunRequest;
    if ((!body?.instruction && !body?.productionStage) || !body?.workspace?.files) {
      return NextResponse.json({ error: 'instruction and workspace are required' }, { status: 400 });
    }
    archiveRequestSnapshot(body);
    const response = await runVideoAgent(body);
    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown server error';
    if (error instanceof InvalidStageOutputError) {
      return NextResponse.json({ error: message, code: error.code, issues: error.issues }, { status: 502 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
