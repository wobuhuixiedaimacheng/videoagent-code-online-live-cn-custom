'use client';

import { useEffect, useState } from 'react';
import type { ProjectSummary } from '../lib/types';
import { IconClock, IconLoader } from './icons';

type ProjectHistoryProps = {
  open: boolean;
  projects: ProjectSummary[];
  loading: boolean;
  activeProjectId: string;
  /** 当前项目最近一次写入服务端档案的时间，'' 表示还没有写过。 */
  syncedAt: string;
  stageName: (stage: string) => string;
  onOpenProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
  onClose: () => void;
};

function formatSavedAt(value: string) {
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

function modeLabel(mode: string) {
  return mode === 'creator' ? '创作者' : '商家';
}

export default function ProjectHistory({
  open,
  projects,
  loading,
  activeProjectId,
  syncedAt,
  stageName,
  onOpenProject,
  onDeleteProject,
  onClose
}: ProjectHistoryProps) {
  // 删除要点两次：第一次把按钮翻成「确认删除」，再点才真正删。切换目标或重开面板都会复位。
  const [confirmingId, setConfirmingId] = useState('');

  useEffect(() => {
    if (!open) setConfirmingId('');
  }, [open]);

  if (!open) return null;

  return (
    <>
      <div className="model-scrim" onClick={onClose} />
      <div className="model-dialog-wrap" role="dialog" aria-modal="true" aria-label="项目历史">
        <div className="model-dialog history-dialog">
          <div className="model-dialog-head">
            <div>
              <strong>项目历史</strong>
              <small>
                {syncedAt
                  ? `所有项目自动保存在本机 data/projects/ 目录 · 当前项目 ${formatSavedAt(syncedAt)} 已保存`
                  : '所有项目自动保存在本机 data/projects/ 目录'}
              </small>
            </div>
            <button type="button" className="btn sm" onClick={onClose}>
              关闭
            </button>
          </div>

          {loading ? (
            <div className="history-empty">
              <IconLoader /> 正在读取项目档案…
            </div>
          ) : projects.length === 0 ? (
            <div className="history-empty">
              <IconClock />
              还没有归档的项目。开始创作后，项目会自动保存到这里，关闭网页也不会丢。
            </div>
          ) : (
            <ul className="history-list">
              {projects.map((project) => {
                const isActive = project.projectId === activeProjectId;
                const confirming = confirmingId === project.projectId;
                return (
                  <li key={project.projectId} className={`history-item ${isActive ? 'active' : ''}`}>
                    <button
                      type="button"
                      className="history-main"
                      onClick={() => onOpenProject(project.projectId)}
                      title={isActive ? '当前打开的项目' : '打开这个项目'}
                    >
                      <strong>{project.title}</strong>
                      <small>
                        {modeLabel(project.mode)}
                        {project.currentStage ? ` · ${stageName(project.currentStage)}` : ''}
                        {` · ${project.messageCount} 条消息 · ${formatSavedAt(project.savedAt)} 保存`}
                        {isActive ? ' · 当前项目' : ''}
                      </small>
                    </button>
                    <div className="history-actions">
                      {!isActive && (
                        <button type="button" className="btn sm" onClick={() => onOpenProject(project.projectId)}>
                          打开
                        </button>
                      )}
                      <button
                        type="button"
                        className={`btn sm ${confirming ? 'danger' : ''}`}
                        onClick={() => {
                          if (confirming) {
                            setConfirmingId('');
                            onDeleteProject(project.projectId);
                          } else {
                            setConfirmingId(project.projectId);
                          }
                        }}
                      >
                        {confirming ? '确认删除？' : '删除'}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
