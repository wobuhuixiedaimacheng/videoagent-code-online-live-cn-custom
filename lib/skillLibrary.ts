import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export type LiblibSkill = {
  id: string;
  skillKey: string;
  name: string;
  version: string;
  description: string;
  useScenario: string;
  inputType: string;
  outputContent: string;
  categories: string[];
  author: string;
  coverUrl: string;
  likeCount: number;
  usePv: number;
  publishAt: string;
  /** liblib 没有单技能页面（详情是弹窗，URL 不变），这里统一指向技能列表页。 */
  sourceUrl: string;
  /** 示例作品的分享链接，仅部分技能有。 */
  caseUrl: string;
  cases: string[];
};

export type SkillLibraryFile = {
  source: string;
  fetchedAt: string;
  total: number;
  categories: string[];
  skills: LiblibSkill[];
};

const EMPTY: SkillLibraryFile = {
  source: 'https://www.liblib.tv/skill',
  fetchedAt: '',
  total: 0,
  categories: [],
  skills: []
};

let cache: SkillLibraryFile | null = null;

/**
 * 外部技能库只有元数据：liblib 的详情接口不下发 PE 正文（showMarkdown 恒为 false），
 * 技能本体运行在对方服务端。这里存的是可检索的目录，用于给主 Agent 选型和跳转源站。
 */
export function loadSkillLibrary(): SkillLibraryFile {
  if (cache) return cache;
  try {
    const path = join(process.cwd(), 'data', 'liblib-skills.json');
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as SkillLibraryFile;
    cache = { ...EMPTY, ...parsed, skills: parsed.skills || [] };
  } catch (_) {
    cache = EMPTY;
  }
  return cache;
}

function haystack(skill: LiblibSkill) {
  return [skill.name, skill.description, skill.useScenario, skill.inputType, skill.outputContent, skill.author]
    .join(' ')
    .toLowerCase();
}

export function querySkillLibrary({
  query = '',
  category = '',
  offset = 0,
  limit = 60
}: {
  query?: string;
  category?: string;
  offset?: number;
  limit?: number;
}) {
  const library = loadSkillLibrary();
  const keyword = query.trim().toLowerCase();
  const filtered = library.skills.filter((skill) => {
    if (category && !skill.categories.includes(category)) return false;
    if (keyword && !haystack(skill).includes(keyword)) return false;
    return true;
  });
  const start = Math.max(0, offset);
  return {
    total: filtered.length,
    libraryTotal: library.total,
    categories: library.categories,
    fetchedAt: library.fetchedAt,
    source: library.source,
    skills: filtered.slice(start, start + Math.max(1, limit))
  };
}
