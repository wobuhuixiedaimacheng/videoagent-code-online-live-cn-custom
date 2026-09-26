'use client';

import {
  IconBolt,
  IconBook,
  IconCompass,
  IconFolder,
  IconLayers,
  IconPlus,
  IconSparkles,
  IconUsers
} from './icons';

export type NavSection = 'new' | 'mission' | 'projects' | 'agents' | 'automation' | 'skills' | 'knowledge';

const NAV: Array<{ id: NavSection; label: string; Icon: typeof IconPlus }> = [
  { id: 'new', label: '新任务', Icon: IconPlus },
  { id: 'mission', label: 'Mission', Icon: IconCompass },
  { id: 'projects', label: '项目', Icon: IconFolder },
  { id: 'agents', label: 'Agent', Icon: IconUsers },
  { id: 'automation', label: '自动化', Icon: IconBolt },
  { id: 'skills', label: '技能库', Icon: IconSparkles },
  { id: 'knowledge', label: '知识库', Icon: IconBook }
];

type Props = {
  active: NavSection;
  onNavigate: (section: NavSection) => void;
  modeLabel: string;
  onToggleMode: () => void;
};

export default function LeftRail({ active, onNavigate, modeLabel, onToggleMode }: Props) {
  return (
    <aside className="rail" aria-label="主导航">
      <div className="rail-logo" aria-hidden>
        V
      </div>
      <nav className="rail-nav">
        {NAV.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className={`rail-btn ${active === id ? 'active' : ''}`}
            aria-current={active === id ? 'page' : undefined}
            onClick={() => onNavigate(id)}
          >
            <Icon />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="rail-spacer" />
      <div className="rail-foot">
        <button type="button" className="rail-mode" onClick={onToggleMode} title="切换创作者 / 小 B 商家模式">
          <IconLayers style={{ width: 16, height: 16, margin: '0 auto 3px' }} />
          {modeLabel}
        </button>
      </div>
    </aside>
  );
}
