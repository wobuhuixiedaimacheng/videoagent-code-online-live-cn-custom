'use client';

import { useState } from 'react';
import type { ContextItem, MissionAsset, ProjectSummary } from '../lib/types';
import { agentRoster, allSkills } from '../lib/workspace';
import SkillLibrary from './SkillLibrary';
import {
  IconBolt,
  IconBook,
  IconCalendar,
  IconCpu,
  IconFilm,
  IconFolder,
  IconList,
  IconPlus,
  IconRefresh,
  IconSparkles,
  IconStack,
  IconWand,
  IconChevron
} from './icons';

export type NavPageKind = 'projects' | 'agents' | 'automation' | 'skills' | 'knowledge';

const TITLES: Record<NavPageKind, { title: string; sub: string }> = {
  projects: { title: '项目', sub: '你的视频创作项目和已沉淀的资产' },
  agents: { title: 'Agent 专家', sub: '主 Agent 编排，专项与生产能力 Agent 协作产出' },
  automation: { title: '自动化', sub: '一次描述，批量生成与计划内容' },
  skills: { title: '技能库', sub: '已引入的技能正文，按生产阶段检索并带进当前 Mission' },
  knowledge: { title: '知识库', sub: '生产上下文与可调用场景' }
};

type Props = {
  section: NavPageKind;
  projectTitle: string;
  assets: MissionAsset[];
  pipeline: Array<{ label: string; ready: boolean; warn?: boolean }>;
  contextStack: ContextItem[];
  history: ProjectSummary[];
  historyLoading: boolean;
  activeProjectId: string;
  stageName: (stage: string) => string;
  onBack: () => void;
  onStart: (instruction: string) => void;
  onNewProject: () => void;
  onOpenHistoryProject: (projectId: string) => void;
  onDeleteHistoryProject: (projectId: string) => void;
};

export default function NavPage({
  section,
  projectTitle,
  assets,
  pipeline,
  contextStack,
  history,
  historyLoading,
  activeProjectId,
  stageName,
  onBack,
  onStart,
  onNewProject,
  onOpenHistoryProject,
  onDeleteHistoryProject
}: Props) {
  const meta = TITLES[section];
  return (
    <div className="navpage">
      <div className="navpage-head">
        <button type="button" className="btn sm" onClick={onBack}>
          <IconChevron style={{ transform: 'rotate(180deg)' }} /> 返回 Mission
        </button>
        <div className="navpage-title">
          <strong>{meta.title}</strong>
          <small>{meta.sub}</small>
        </div>
      </div>
      <div className="navpage-scroll">
        <div className="navpage-inner">
          {section === 'projects' && (
            <ProjectsView
              projectTitle={projectTitle}
              assets={assets}
              pipeline={pipeline}
              history={history}
              historyLoading={historyLoading}
              activeProjectId={activeProjectId}
              stageName={stageName}
              onBack={onBack}
              onNewProject={onNewProject}
              onOpenHistoryProject={onOpenHistoryProject}
              onDeleteHistoryProject={onDeleteHistoryProject}
            />
          )}
          {section === 'agents' && <AgentsView />}
          {section === 'automation' && <AutomationView onStart={onStart} />}
          {section === 'skills' && <SkillLibrary onStart={onStart} />}
          {section === 'knowledge' && <KnowledgeView contextStack={contextStack} onStart={onStart} />}
        </div>
      </div>
    </div>
  );
}

/* ---------- 项目 ---------- */
function formatHistoryTime(value: string) {
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(value));
  } catch (_) {
    return value;
  }
}

function ProjectsView({
  projectTitle,
  assets,
  pipeline,
  history,
  historyLoading,
  activeProjectId,
  stageName,
  onBack,
  onNewProject,
  onOpenHistoryProject,
  onDeleteHistoryProject
}: {
  projectTitle: string;
  assets: MissionAsset[];
  pipeline: Array<{ label: string; ready: boolean; warn?: boolean }>;
  history: ProjectSummary[];
  historyLoading: boolean;
  activeProjectId: string;
  stageName: (stage: string) => string;
  onBack: () => void;
  onNewProject: () => void;
  onOpenHistoryProject: (projectId: string) => void;
  onDeleteHistoryProject: (projectId: string) => void;
}) {
  const ready = pipeline.filter((step) => step.ready).length;
  // 删除点两次确认；切换目标即复位。
  const [confirmingId, setConfirmingId] = useState('');
  const archived = history.filter((item) => item.projectId !== activeProjectId);
  return (
    <>
      <div className="np-grid">
        <button type="button" className="np-card enter" onClick={onNewProject}>
          <span className="np-enter-plus">
            <IconPlus />
          </span>
          <strong>新建项目</strong>
          <small>从一句目标开始一个新 Mission</small>
        </button>

        <button type="button" className="np-card project" onClick={onBack}>
          <span className="np-thumb">
            <IconFilm />
          </span>
          <strong>{projectTitle}</strong>
          <small>{assets.length} 个资产 · 管线 {ready}/{pipeline.length} 就绪</small>
          <div className="np-progress">
            <span style={{ width: `${pipeline.length ? (ready / pipeline.length) * 100 : 0}%` }} />
          </div>
          <span className="np-open">进入 <IconChevron /></span>
        </button>
      </div>

      <section className="np-section">
        <div className="np-section-head">
          <IconFolder style={{ width: 16, height: 16, color: 'var(--accent-strong)' }} />
          <h3>历史项目</h3>
          <small>自动保存在本机 data/projects/ 目录，关闭网页不会丢</small>
        </div>
        {historyLoading ? (
          <p className="np-note">正在读取项目档案…</p>
        ) : archived.length === 0 ? (
          <p className="np-note">
            还没有归档的历史项目。开始创作后会自动保存到这里；当前正在做的项目见上方卡片。
          </p>
        ) : (
          <div className="np-grid">
            {archived.map((project) => {
              const confirming = confirmingId === project.projectId;
              return (
                <div key={project.projectId} className="np-card np-history-card">
                  <span className="np-icon">
                    <IconFilm />
                  </span>
                  <strong>{project.title}</strong>
                  <small>
                    {project.mode === 'creator' ? '创作者' : '商家'}
                    {project.currentStage ? ` · ${stageName(project.currentStage)}` : ''}
                    {` · ${project.messageCount} 条消息`}
                    {` · ${formatHistoryTime(project.savedAt)} 保存`}
                  </small>
                  <div className="np-history-actions">
                    <button type="button" className="btn sm" onClick={() => onOpenHistoryProject(project.projectId)}>
                      打开
                    </button>
                    <button
                      type="button"
                      className={`btn sm ${confirming ? 'danger' : ''}`}
                      onClick={() => {
                        if (confirming) {
                          setConfirmingId('');
                          onDeleteHistoryProject(project.projectId);
                        } else {
                          setConfirmingId(project.projectId);
                        }
                      }}
                    >
                      {confirming ? '确认删除？' : '删除'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}

/* ---------- Agent 专家 ---------- */
const LAYER1 = ['orchestrator', 'creative_director'];
function AgentsView() {
  const orchestrators = agentRoster.filter((a) => LAYER1.includes(a.id));
  const production = agentRoster.filter((a) => !LAYER1.includes(a.id));
  return (
    <>
      <AgentGroup tier="L1" title="主 Agent · 编排调度" agents={orchestrators} />
      <AgentGroup tier="L2" title="生产能力 Agent · 横向流水线" agents={production} />
      <AgentGroup
        tier="L4"
        title="视频导演 · 最终生成准备"
        agents={[
          {
            id: 'video_gen',
            name: '视频导演',
            role: '渲染准备',
            description: '只接收用户确认后的制作包，输出镜头级 prompt、首帧、角色一致性、negative 和 render specs（非 MP4）。',
            accent: 'green'
          }
        ]}
      />
    </>
  );
}

function AgentGroup({
  tier,
  title,
  agents
}: {
  tier: string;
  title: string;
  agents: Array<{ id: string; name: string; role: string; description: string; accent: string }>;
}) {
  return (
    <section className="np-section">
      <div className="np-section-head">
        <span className="layer-tier">{tier}</span>
        <h3>{title}</h3>
        <small>{agents.length} 个</small>
      </div>
      <div className="agent-card-grid">
        {agents.map((agent) => (
          <div className="agent-card" key={agent.id}>
            <span className={`agent-avatar ${agent.accent}`}>{agent.name.slice(0, 1)}</span>
            <div className="agent-card-body">
              <strong>{agent.name}</strong>
              <span className="agent-role">{agent.role}</span>
              <p>{agent.description}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------- 自动化 ---------- */
const AUTOMATIONS: Array<{ t: string; d: string; c: string; Icon: typeof IconBolt }> = [
  {
    t: '一周内容计划',
    d: '生成 7 天选题，每天可展开成完整制作包',
    c: '基于我的账号/品牌，生成一周短视频内容计划，每天给主题、平台角度和 CTA，并可逐天展开。',
    Icon: IconCalendar
  },
  {
    t: '多平台批量改写',
    d: '一条内容自动适配小红书 / 抖音 / TikTok',
    c: '把这条内容批量改写成小红书、抖音、TikTok 三个平台版本，分别给标题、caption 和分镜差异。',
    Icon: IconStack
  },
  {
    t: '批量标题 / Hook',
    d: '一个主题一次产出多条标题与开场 Hook',
    c: '围绕这个主题，批量生成 10 条标题和 5 个开场 Hook，按平台风格区分。',
    Icon: IconSparkles
  },
  {
    t: '爆款拆解流水线',
    d: '多条参考一次性拆 Hook、结构与转化',
    c: '把我给的多条爆款参考批量拆解，提炼可复用的 Hook、结构和情绪模板，不要搬运原文。',
    Icon: IconWand
  }
];

function AutomationView({ onStart }: { onStart: (instruction: string) => void }) {
  return (
    <>
      <div className="np-grid">
        {AUTOMATIONS.map(({ t, d, c, Icon }) => (
          <button key={t} type="button" className="np-card" onClick={() => onStart(c)}>
            <span className="np-icon">
              <Icon />
            </span>
            <strong>{t}</strong>
            <small>{d}</small>
            <span className="np-open">运行 <IconChevron /></span>
          </button>
        ))}
      </div>
      <p className="np-note">
        <IconBolt /> 定时触发与真实调度属于后续版本，当前为一次性批量生成。
      </p>
    </>
  );
}

/* ---------- 知识库 ---------- */
function KnowledgeView({
  contextStack,
  onStart
}: {
  contextStack: ContextItem[];
  onStart: (instruction: string) => void;
}) {
  return (
    <>
      <section className="np-section">
        <div className="np-section-head">
          <IconStack style={{ width: 16, height: 16, color: 'var(--accent-strong)' }} />
          <h3>Context Stack</h3>
          <small>生产前读取的业务上下文</small>
        </div>
        <div className="np-grid">
          {contextStack.map((item) => (
            <button
              key={item.id}
              type="button"
              className="np-card"
              onClick={() => onStart(`请打开并补全「${item.label}」（${item.filePath}），用于本轮生产上下文。`)}
            >
              <span className="np-icon">
                <IconBook />
              </span>
              <strong>{item.label}</strong>
              <small>{item.summary}</small>
              <span className={`np-state ${item.status}`}>{item.status === 'ready' ? '已建立' : item.status === 'warning' ? '待确认' : '未建立'}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="np-section">
        <div className="np-section-head">
          <IconList style={{ width: 16, height: 16, color: 'var(--accent-strong)' }} />
          <h3>场景</h3>
          <small>可调用的 AIGC 生产场景</small>
        </div>
        <div className="np-skill-list">
          {allSkills.map((skill) => (
            <button key={skill.id} type="button" className="np-skill" onClick={() => onStart(skill.command)}>
              <span className={`np-skill-tier ${skill.tier === 'P0' ? 'p0' : 'p1'}`}>{skill.tier}</span>
              <span className="np-skill-body">
                <strong>{skill.title}</strong>
                <small>{skill.description}</small>
              </span>
              <IconChevron />
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
