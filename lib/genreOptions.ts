import type { GenreId } from './types';

export type GenreOption = { id: GenreId; label: string; hint: string };

/**
 * 派发面板的片种选项。单独一个文件是因为 app/page.tsx 是客户端组件，
 * 而 lib/genreSkillRouter 要读 node:fs 扫技能库——那份代码进不了浏览器 bundle。
 * 这里只放纯数据，路由表在 genreSkillRouter 里按同一批 id 展开。
 */
export const GENRE_OPTIONS: GenreOption[] = [
  { id: 'auto', label: '自动派发', hint: '主 Agent 判断任务类型' },
  { id: 'product', label: '产品营销视频', hint: '卖点、信任、转化' },
  { id: 'drama', label: '短剧 / 剧情视频', hint: 'Hook、冲突、反转' },
  { id: 'rewrite', label: '旧稿改写', hint: '先诊断再改写' },
  { id: 'note', label: '图文笔记', hint: '封面、正文、标签' },
  { id: 'weekly', label: '一周内容计划', hint: '7 天选题与角度' },
  { id: 'multi', label: '多平台改写', hint: '小红书 / 抖音 / TikTok' },
  { id: 'videogen', label: '视频生成准备', hint: '镜头任务与生成参数' }
];

export function isGenreId(value: unknown): value is GenreId {
  return GENRE_OPTIONS.some((option) => option.id === value);
}

export function genreLabel(genre: GenreId): string {
  return GENRE_OPTIONS.find((option) => option.id === genre)?.label || genre;
}
