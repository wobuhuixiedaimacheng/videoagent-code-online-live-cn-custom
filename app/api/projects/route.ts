import { NextResponse } from 'next/server';
import { listProjectSummaries } from '../../../lib/projectStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const projects = await listProjectSummaries();
    return NextResponse.json({ ok: true, projects });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to list projects.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
