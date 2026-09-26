'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IconChevron, IconFile, IconHeart, IconLoader, IconShare, IconSparkles, IconX } from './icons';

type LocalSkill = {
  id: string;
  pack: string;
  packTitle: string;
  name: string;
  description: string;
  stage: string;
  path: string;
  chars: number;
  repo: string;
  license: string;
  copyright: string;
};

type LiblibSkill = {
  id: string;
  name: string;
  description: string;
  useScenario: string;
  inputType: string;
  outputContent: string;
  categories: string[];
  author: string;
  coverUrl: string;
  likeCount: number;
  sourceUrl: string;
  caseUrl: string;
};

const PAGE_SIZE = 60;

function heat(value: number) {
  if (value >= 10000) return `${(value / 10000).toFixed(1)}w`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

function localInstruction(skill: LocalSkill) {
  return `请加载技能「${skill.name}」（${skill.path}）并按它的规则开工：${skill.description}`;
}

function liblibInstruction(skill: LiblibSkill) {
  return [
    `参考外部技能「${skill.name}」的做法开工：${skill.description || skill.useScenario}。`,
    skill.useScenario ? `适用场景：${skill.useScenario}。` : '',
    skill.inputType ? `期望输入：${skill.inputType}。` : '',
    skill.outputContent ? `期望产出：${skill.outputContent}。` : '',
    '这条技能的提示词正文不在本地，请按上述场景与输入产出规格，用我们自己的流程产出。'
  ]
    .filter(Boolean)
    .join('');
}

export default function SkillLibrary({ onStart }: { onStart: (instruction: string) => void }) {
  const [tab, setTab] = useState<'local' | 'liblib'>('local');
  return (
    <>
      <div className="skill-lib-tabs">
        <button type="button" className={tab === 'local' ? 'on' : ''} onClick={() => setTab('local')}>
          本地技能
          <small>已引入，带完整正文</small>
        </button>
        <button type="button" className={tab === 'liblib' ? 'on' : ''} onClick={() => setTab('liblib')}>
          外部参考
          <small>liblib 目录，仅元数据</small>
        </button>
      </div>
      {tab === 'local' ? <LocalView onStart={onStart} /> : <LiblibView onStart={onStart} />}
    </>
  );
}

/* ---------- 本地技能 ---------- */
function LocalView({ onStart }: { onStart: (instruction: string) => void }) {
  const [query, setQuery] = useState('');
  const [stage, setStage] = useState('');
  const [skills, setSkills] = useState<LocalSkill[]>([]);
  const [stages, setStages] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewing, setViewing] = useState<{ skill: LocalSkill; body: string } | null>(null);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ q: query, stage });
    fetch(`/api/skill-library?${params.toString()}`)
      .then((res) => res.json())
      .then((json) => {
        setSkills(json.skills || []);
        setStages(json.stages || []);
        setTotal(json.libraryTotal || 0);
        setError('');
      })
      .catch(() => setError('本地技能读取失败。'))
      .finally(() => setLoading(false));
  }, [query, stage]);

  const openBody = useCallback((skill: LocalSkill) => {
    fetch(`/api/skill-library?id=${encodeURIComponent(skill.id)}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.ok) setViewing({ skill, body: json.body });
      })
      .catch(() => undefined);
  }, []);

  const packs = useMemo(() => {
    const map = new Map<string, { title: string; repo: string; license: string; copyright: string; count: number }>();
    skills.forEach((skill) => {
      const found = map.get(skill.pack);
      if (found) found.count += 1;
      else
        map.set(skill.pack, {
          title: skill.packTitle,
          repo: skill.repo,
          license: skill.license,
          copyright: skill.copyright,
          count: 1
        });
    });
    return [...map.entries()];
  }, [skills]);

  return (
    <>
      <section className="np-section">
        <div className="skill-lib-bar">
          <input
            className="skill-lib-search"
            type="search"
            value={query}
            placeholder="搜索技能名称、说明或阶段…"
            onChange={(event) => setQuery(event.target.value)}
            aria-label="搜索本地技能"
          />
          <span className="skill-lib-count">
            {skills.length} / {total} 个
          </span>
        </div>
        <div className="skill-lib-chips">
          <button type="button" className={`skill-chip ${stage === '' ? 'on' : ''}`} onClick={() => setStage('')}>
            全部阶段
          </button>
          {stages.map((name) => (
            <button
              key={name}
              type="button"
              className={`skill-chip ${stage === name ? 'on' : ''}`}
              onClick={() => setStage(name)}
            >
              {name}
            </button>
          ))}
        </div>
      </section>

      {error && <p className="np-note">{error}</p>}
      {loading && (
        <p className="np-note">
          <IconLoader /> 读取中…
        </p>
      )}
      {!loading && !error && skills.length === 0 && <p className="np-note">没有匹配的技能。</p>}

      <div className="skill-lib-grid local">
        {skills.map((skill) => (
          <article className="skill-lib-card" key={skill.id}>
            <div className="skill-lib-body">
              <div className="skill-lib-head">
                <span className="skill-lib-stage">{skill.stage}</span>
                <strong className="skill-lib-name">{skill.name}</strong>
              </div>
              <p className="skill-lib-desc four">{skill.description}</p>
              <div className="skill-lib-foot">
                <span className="skill-lib-author">{skill.packTitle}</span>
                <span className="skill-lib-heat">
                  <IconFile /> {(skill.chars / 1000).toFixed(1)}k 字符
                </span>
                <span className="skill-lib-tag">{skill.license}</span>
              </div>
              <div className="skill-lib-actions">
                <button type="button" className="btn sm primary" onClick={() => onStart(localInstruction(skill))}>
                  用它开工 <IconChevron />
                </button>
                <button type="button" className="btn sm" onClick={() => openBody(skill)}>
                  <IconFile /> 看正文
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>

      <section className="np-section">
        <div className="np-section-head">
          <IconSparkles style={{ width: 16, height: 16, color: 'var(--accent-strong)' }} />
          <h3>来源与许可</h3>
          <small>{packs.length} 个技能包</small>
        </div>
        <div className="skill-lib-provenance">
          {packs.map(([pack, info]) => (
            <div key={pack}>
              <strong>{info.title}</strong>
              <span>{info.count} 个技能</span>
              <span>
                {info.license} · © 2026 {info.copyright}
              </span>
              {info.repo ? (
                <a href={info.repo} target="_blank" rel="noreferrer noopener">
                  <IconShare /> 源仓库
                </a>
              ) : (
                <span>自有实现</span>
              )}
            </div>
          ))}
        </div>
      </section>

      {viewing && <SkillBodyPanel skill={viewing.skill} body={viewing.body} onClose={() => setViewing(null)} />}
    </>
  );
}

function SkillBodyPanel({ skill, body, onClose }: { skill: LocalSkill; body: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="skill-body-mask" role="dialog" aria-modal="true" aria-label={`${skill.name} 正文`} onClick={onClose}>
      <div className="skill-body-panel" onClick={(event) => event.stopPropagation()}>
        <header>
          <div>
            <strong>{skill.name}</strong>
            <small>
              {skill.path} · {skill.license} · © 2026 {skill.copyright}
            </small>
          </div>
          <button type="button" className="btn sm" onClick={onClose} aria-label="关闭">
            <IconX />
          </button>
        </header>
        <pre>{body}</pre>
      </div>
    </div>
  );
}

/* ---------- 外部参考（liblib） ---------- */
function LiblibView({ onStart }: { onStart: (instruction: string) => void }) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [category, setCategory] = useState('');
  const [items, setItems] = useState<LiblibSkill[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [libraryTotal, setLibraryTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const requestId = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setOffset(0);
  }, [debounced, category]);

  useEffect(() => {
    const id = ++requestId.current;
    setLoading(true);
    const params = new URLSearchParams({
      source: 'liblib',
      q: debounced,
      category,
      offset: String(offset),
      limit: String(PAGE_SIZE)
    });
    fetch(`/api/skill-library?${params.toString()}`)
      .then((res) => res.json())
      .then((json) => {
        if (id !== requestId.current) return;
        setItems((prev) => (offset === 0 ? json.skills : [...prev, ...json.skills]));
        setCategories(json.categories || []);
        setTotal(json.total || 0);
        setLibraryTotal(json.libraryTotal || 0);
      })
      .catch(() => undefined)
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
  }, [debounced, category, offset]);

  return (
    <>
      <p className="np-note">
        liblib 未公开提示词正文，也没有单技能页面。这里只能按场景检索，产出规格会带进指令，正文仍由我们自己的流程生成。
      </p>

      <section className="np-section">
        <div className="skill-lib-bar">
          <input
            className="skill-lib-search"
            type="search"
            value={query}
            placeholder="搜索技能名称、场景、输入或产出…"
            onChange={(event) => setQuery(event.target.value)}
            aria-label="搜索外部参考"
          />
          <span className="skill-lib-count">
            {total} / {libraryTotal} 条
          </span>
        </div>
        <div className="skill-lib-chips">
          <button type="button" className={`skill-chip ${category === '' ? 'on' : ''}`} onClick={() => setCategory('')}>
            全部
          </button>
          {categories.map((name) => (
            <button
              key={name}
              type="button"
              className={`skill-chip ${category === name ? 'on' : ''}`}
              onClick={() => setCategory(name)}
            >
              {name}
            </button>
          ))}
        </div>
      </section>

      <div className="skill-lib-grid">
        {items.map((skill) => (
          <article className="skill-lib-card" key={skill.id}>
            <div className="skill-lib-cover">
              {skill.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={skill.coverUrl} alt="" loading="lazy" />
              ) : (
                <span className="skill-lib-cover-fallback">
                  <IconSparkles />
                </span>
              )}
            </div>
            <div className="skill-lib-body">
              <strong className="skill-lib-name">{skill.name}</strong>
              <p className="skill-lib-desc">{skill.description}</p>
              <dl className="skill-lib-meta">
                {skill.useScenario && (
                  <div>
                    <dt>场景</dt>
                    <dd>{skill.useScenario}</dd>
                  </div>
                )}
                {skill.outputContent && (
                  <div>
                    <dt>产出</dt>
                    <dd>{skill.outputContent}</dd>
                  </div>
                )}
              </dl>
              <div className="skill-lib-foot">
                <span className="skill-lib-author">{skill.author}</span>
                <span className="skill-lib-heat">
                  <IconHeart /> {heat(skill.likeCount)}
                </span>
                {skill.categories[0] && <span className="skill-lib-tag">{skill.categories[0]}</span>}
              </div>
              <div className="skill-lib-actions">
                <button type="button" className="btn sm primary" onClick={() => onStart(liblibInstruction(skill))}>
                  用它开工 <IconChevron />
                </button>
                <a
                  className="btn sm"
                  href={skill.caseUrl || skill.sourceUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  title={skill.caseUrl ? '打开该技能的示例作品' : `liblib 没有单技能页面，到列表页搜索「${skill.name}」`}
                >
                  <IconShare /> {skill.caseUrl ? '示例' : '源站'}
                </a>
              </div>
            </div>
          </article>
        ))}
      </div>

      {loading && (
        <p className="np-note">
          <IconLoader /> 读取中…
        </p>
      )}
      {!loading && items.length < total && (
        <div className="skill-lib-more">
          <button type="button" className="btn" onClick={() => setOffset(items.length)}>
            加载更多（还有 {total - items.length} 条）
          </button>
        </div>
      )}
    </>
  );
}
