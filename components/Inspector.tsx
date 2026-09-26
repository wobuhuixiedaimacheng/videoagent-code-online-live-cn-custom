'use client';

import type { ComplianceCheck, PatchOperation, PreviewScene } from '../lib/types';
import type { DiffRow } from '../lib/workspace';
import {
  IconAlert,
  IconCheck,
  IconFile,
  IconGitMerge,
  IconHeart,
  IconMessage,
  IconShare,
  IconShieldCheck,
  IconWand,
  IconX
} from './icons';

export type PreviewInfo = {
  hook: string;
  sub: string;
  cta: string;
  platform: string;
  durationLabel: string;
};

const REWRITES = [
  { label: '更像小红书', text: '把当前选中的场景 Hook 改得更像小红书真实分享，只改这一个场景。' },
  { label: '更强 Hook', text: '只重写当前选中场景的前 3 秒 Hook，让停留更强，不动其它场景。' },
  { label: '换 CTA', text: '只调整当前选中场景的 CTA 表达，更自然引导，不动其它场景。' },
  { label: '重出 Prompt', text: '只为当前选中场景重新生成首帧和视频 prompt，保持角色一致性。' }
];

type Props = {
  preview: PreviewInfo;
  scenes: PreviewScene[];
  activeSceneId: string;
  onSceneSelect: (id: string) => void;
  fileName: string;
  fileBody: string;
  diff: DiffRow[] | null;
  checks: ComplianceCheck[];
  selectedPatch: PatchOperation | null;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onRewrite: (text: string) => void;
  onClose?: () => void;
};

const CHECK_LABEL: Record<ComplianceCheck['type'], string> = {
  ai_disclosure: 'AI 标识',
  marketing_claim: '营销话术',
  asset_rights: '素材授权',
  likeness_rights: '肖像 / 声音授权',
  sensitive_industry: '敏感行业',
  platform_policy: '平台规则'
};

export default function Inspector({
  preview,
  scenes,
  activeSceneId,
  onSceneSelect,
  fileName,
  fileBody,
  diff,
  checks,
  selectedPatch,
  onApprove,
  onReject,
  onRewrite,
  onClose
}: Props) {
  return (
    <aside className="inspector" aria-label="检查器">
      <div className="inspector-head">
        <IconFile style={{ width: 16, height: 16, color: 'var(--accent-strong)' }} />
        <div>
          <strong>检查器</strong>
          <div>
            <small>{preview.platform} · {preview.durationLabel}</small>
          </div>
        </div>
        {onClose && (
          <button type="button" className="close mobile-only" onClick={onClose} aria-label="关闭检查器">
            <IconX />
          </button>
        )}
      </div>

      <div className="inspector-scroll">
        {/* Phone preview */}
        <div className="insp-block">
          <div className="insp-label">
            <IconWand /> 内容预览
          </div>
          <div className="phone">
            <div className="phone-screen">
              <span className="phone-notch" />
              <div className="phone-top">
                <span>{preview.platform}</span>
                <span>{preview.durationLabel}</span>
              </div>
              <div className="phone-rail">
                <span><IconHeart /></span>
                <span><IconMessage /></span>
                <span><IconShare /></span>
              </div>
              <div>
                <div className="phone-hook">{preview.hook}</div>
                <div className="phone-sub">{preview.sub}</div>
                {preview.cta && <div className="phone-cta">{preview.cta}</div>}
              </div>
            </div>
          </div>

          {scenes.length > 0 && (
            <div className="scene-strip">
              {scenes.map((scene, index) => (
                <button
                  key={scene.id}
                  type="button"
                  className={`scene-thumb ${activeSceneId === scene.id ? 'active' : ''}`}
                  onClick={() => onSceneSelect(scene.id)}
                  title={scene.title}
                >
                  <span className="st-img">{String(index + 1).padStart(2, '0')}</span>
                  <small>{scene.subtitle || scene.title}</small>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Generated file */}
        <div className="insp-block">
          <div className="insp-label">
            <IconFile /> 生成文件 · {fileName}
          </div>
          {diff ? (
            <pre className="code-block">
              {diff.map((row, index) => (
                <span key={index} className={`diff-line ${row.kind}`}>
                  {row.kind === 'add' ? '+ ' : row.kind === 'remove' ? '- ' : '  '}
                  {row.text}
                </span>
              ))}
            </pre>
          ) : (
            <pre className="code-block">{fileBody || '选中一个资产即可查看内容。所有产出都是可检查、可修改的文件，而不是聊天文本。'}</pre>
          )}
        </div>

        {/* Risk checks */}
        <div className="insp-block">
          <div className="insp-label">
            <IconShieldCheck /> 风险检查
          </div>
          {checks.length ? (
            checks.map((check) => (
              <div className="risk-row" key={check.id}>
                <span className={`risk-icon ${check.status}`}>
                  {check.status === 'pass' ? <IconCheck /> : <IconAlert />}
                </span>
                <span className="risk-text">
                  <strong>{CHECK_LABEL[check.type]}</strong>
                  <small>{check.message}</small>
                </span>
              </div>
            ))
          ) : (
            <div className="empty" style={{ padding: '12px 8px' }}>
              合规 Agent 会在这里标记夸大宣传、敏感表达、素材授权和平台风险。
            </div>
          )}
        </div>

        {/* Approval actions */}
        <div className="insp-block">
          <div className="insp-label">
            <IconGitMerge /> 审批动作
          </div>
          {selectedPatch ? (
            <>
              <div className="memory-note" style={{ marginBottom: 10 }}>
                <strong>{selectedPatch.filePath}</strong>
                <div style={{ marginTop: 4 }}>{selectedPatch.summary}</div>
              </div>
              <div className="insp-actions">
                <button type="button" className="btn danger" onClick={() => onReject(selectedPatch.id)}>
                  <IconX /> 拒绝
                </button>
                <button type="button" className="btn primary" onClick={() => onApprove(selectedPatch.id)}>
                  <IconGitMerge /> 批准写入
                </button>
              </div>
            </>
          ) : (
            <div className="empty" style={{ padding: '12px 8px' }}>暂无待审批 patch。批准后才会写入项目资产。</div>
          )}
        </div>

        {/* Local rewrite */}
        <div className="insp-block">
          <div className="insp-label">
            <IconWand /> 局部重写 / 重新生成
          </div>
          <div className="rewrite-row">
            {REWRITES.map((item) => (
              <button key={item.label} type="button" className="pill" onClick={() => onRewrite(item.text)}>
                <IconWand /> {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}
