import { NextResponse } from 'next/server';
import { getProviderStatus } from '../../../lib/agentProvider';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    ok: true,
    app: 'VideoAgent Code Online MVP',
    provider: getProviderStatus(),
    time: new Date().toISOString()
  });
}
