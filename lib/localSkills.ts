import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export type LocalSkill = {
  id: string;
  pack: string;
  packTitle: string;
  name: string;
  title: string;
  description: string;
  stage: string;
  path: string;
  chars: number;
  repo: string;
  license: string;
  copyright: string;
};

type PackInfo = { title: string; repo: string; license: string; copyright: string; stage: string };

/**
 * 本地技能包登记表。与 skills/<pack>/PROVENANCE.md 对应，新增 vendor 包时两处一起加。
 * repo 为空表示自有实现，不是第三方引入。
 */
const PACKS: Record<string, PackInfo> = {
  // 自有实现，不是引入：目录结构自己定（扁平，一技能一目录），正文可以直接在本仓库改。
  // repo 留空会让技能库面板显示「自有实现」而不是源仓库链接。
  'director-craft': {
    title: '导演调度',
    repo: '',
    license: '自有',
    copyright: 'VideoAgent',
    stage: '分镜'
  },
  // 同为自有实现。管的是分镜与导演调度之后、装进视频请求之前的那一层：
  // 参考图挂哪个位、每张图继承什么、声音怎么分层。
  'multimodal-prompt-craft': {
    title: '多模态提示词',
    repo: '',
    license: '自有',
    copyright: 'VideoAgent',
    stage: '素材提示词'
  },
  'dynamic-director': {
    title: '动态导演',
    repo: 'https://github.com/dexhunter/seedance2-skill',
    license: 'MIT',
    copyright: 'dexhunter',
    stage: '素材提示词'
  },
  'lanshu-video-kit': {
    title: '蓝鼠 AI 视频工具包',
    repo: 'https://github.com/cclank/lanshu-awesome-ai-video-kit',
    license: 'MIT',
    copyright: 'lanshu',
    stage: '素材提示词'
  },
  'video-prompt-engineer': {
    title: '视频提示词工程师',
    repo: 'https://github.com/Arch-Dog/video-prompt-engineer',
    license: 'MIT',
    copyright: 'Arch-Dog',
    stage: '分镜'
  },
  'content-risk-detector': {
    title: '内容合规检测',
    repo: 'https://github.com/liuxingqitd/content-risk-detector',
    license: 'MIT',
    copyright: 'Liu Xingqi',
    stage: '合规'
  },
  'seedance-genre-pack': {
    title: 'Seedance 题材包',
    repo: 'https://github.com/rediumvex/ai-video-generator-claude',
    license: 'MIT',
    copyright: 'Roman Knox',
    stage: '选题脚本'
  }
};

/**
 * 少数技能的阶段与所在包不同，单独覆盖。
 * key 用技能目录名（不含包路径），因为 vendor 包保留了上游层级，完整 id 会随上游目录结构变化。
 */
const STAGE_OVERRIDE: Record<string, string> = {
  'lighting-design': '素材提示词',
  'depth-and-lens': '素材提示词',
  'physics-fx': '生产准备',
  'seedance-storyboard': '分镜',
  // 声音要在分镜阶段就定下来：台词是硬性时长约束，等到素材提示词阶段再排就晚了。
  'soundscape-layers': '分镜',
  'model-selector': '生产准备',
  'prompt-translator': '生产准备',
  'seedance-debugger': '生产准备'
};

export const SKILL_STAGES = ['选题脚本', '分镜', '素材提示词', '合规', '生产准备'];

function parseFrontmatter(text: string): Record<string, string> {
  if (!text.startsWith('---')) return {};
  const end = text.indexOf('\n---', 3);
  if (end === -1) return {};
  const out: Record<string, string> = {};
  for (const line of text.slice(4, end).split('\n')) {
    // 只取顶层 key，跳过嵌套结构（如 metadata: 下的列表）
    const match = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
      value = value.slice(1, -1);
    }
    if (value) out[match[1]] = value;
  }
  return out;
}

function walk(dir: string, base: string, found: string[]) {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch (_) {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    let isDir = false;
    try {
      isDir = statSync(full).isDirectory();
    } catch (_) {
      continue;
    }
    if (isDir) walk(full, base, found);
    else if (entry === 'SKILL.source.md') found.push(full);
  }
}

let cache: LocalSkill[] | null = null;

export function loadLocalSkills(): LocalSkill[] {
  if (cache) return cache;
  const root = join(process.cwd(), 'skills');
  const files: string[] = [];
  walk(root, root, files);

  const skills: LocalSkill[] = [];
  for (const file of files) {
    const rel = file.slice(root.length + 1).split('/');
    const pack = rel[0];
    const info = PACKS[pack];
    if (!info) continue;
    const dir = rel.slice(0, -1).join('/');
    const id = dir;
    const leaf = rel.length >= 2 ? rel[rel.length - 2] : pack;
    let body = '';
    try {
      body = readFileSync(file, 'utf8');
    } catch (_) {
      continue;
    }
    const front = parseFrontmatter(body);
    skills.push({
      id,
      pack,
      packTitle: info.title,
      name: front.name || rel[rel.length - 2] || pack,
      title: front.title || front.name || info.title,
      description: front.description || '',
      stage: STAGE_OVERRIDE[leaf] || STAGE_OVERRIDE[front.name || ''] || info.stage,
      path: `skills/${rel.join('/')}`,
      chars: body.length,
      repo: info.repo,
      license: info.license,
      copyright: info.copyright
    });
  }
  skills.sort((a, b) => a.pack.localeCompare(b.pack) || a.name.localeCompare(b.name));
  cache = skills;
  return cache;
}

export function getLocalSkillBody(id: string): { skill: LocalSkill; body: string } | null {
  const skill = loadLocalSkills().find((item) => item.id === id);
  if (!skill) return null;
  try {
    return { skill, body: readFileSync(join(process.cwd(), skill.path), 'utf8') };
  } catch (_) {
    return null;
  }
}

export function queryLocalSkills({ query = '', stage = '' }: { query?: string; stage?: string }) {
  const keyword = query.trim().toLowerCase();
  const skills = loadLocalSkills().filter((skill) => {
    if (stage && skill.stage !== stage) return false;
    if (!keyword) return true;
    return [skill.name, skill.description, skill.packTitle, skill.stage].join(' ').toLowerCase().includes(keyword);
  });
  const stages = SKILL_STAGES.filter((name) => loadLocalSkills().some((skill) => skill.stage === name));
  return { total: skills.length, libraryTotal: loadLocalSkills().length, stages, skills };
}
