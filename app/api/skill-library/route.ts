import { NextResponse } from 'next/server';
import { querySkillLibrary } from '../../../lib/skillLibrary';
import { getLocalSkillBody, queryLocalSkills } from '../../../lib/localSkills';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  // 单个本地技能的完整正文
  const detailId = params.get('id');
  if (detailId) {
    const found = getLocalSkillBody(detailId);
    if (!found) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 });
    return NextResponse.json({ ok: true, skill: found.skill, body: found.body });
  }

  // 外部参考目录（liblib，只有元数据）
  if (params.get('source') === 'liblib') {
    const offset = Number.parseInt(params.get('offset') || '0', 10);
    const limit = Number.parseInt(params.get('limit') || '60', 10);
    const result = querySkillLibrary({
      query: params.get('q') || '',
      category: params.get('category') || '',
      offset: Number.isFinite(offset) ? offset : 0,
      limit: Number.isFinite(limit) ? limit : 60
    });
    return NextResponse.json({ ok: true, ...result, source: 'liblib' });
  }

  // 默认：本地已引入、带完整正文的技能
  const result = queryLocalSkills({ query: params.get('q') || '', stage: params.get('stage') || '' });
  return NextResponse.json({ ok: true, source: 'local', ...result });
}
