'use client';

/**
 * 场景视觉设定画板。
 *
 * 两层界面：
 *  - 一级总览是场景卡，每张卡只回答「这个空间准备好了没有」——名称、类型、主视觉、
 *    一句话定位、用了几场、完成度、连续性冲突数、审查状态。八个字段，不多不少。
 *  - 点进去才是画板：左侧场景列表、顶部母版状态、中间左边机位参考图、中间右边空间身份锚点、
 *    下方场次标签与四张状态卡、最下方镜头连续性时间线。
 *
 * 时间线是这个画板真正的产出。连续性是「跨镜头对比」出来的，所以被追踪的状态
 * （道具位置、门窗、视线、灯光方向）直接印在每张镜头卡上，顺着扫一眼就能看出
 * 杯子从右手跳到了左手——而不是让用户去读一段告警文字再自己回想上一镜是什么样。
 *
 * 刻意不做的事：不把三级数据摊成一张超长表单，不在总览里加载全部镜头的大图，
 * 不展示没有生成或连续性价值的字段。
 */

import { useMemo, useState } from 'react';
import type { CharacterAsset, SceneAsset } from '../lib/types';
import {
  SCENE_ANCHOR_MAX,
  SCENE_ANCHOR_MIN,
  SCENE_ANCHOR_PRESETS,
  SCENE_ART_FIELDS,
  SCENE_BLOCKING_FIELDS,
  SCENE_CONSISTENCY_CONTRACT,
  SCENE_ENVIRONMENT_FIELDS,
  SCENE_FIXTURE_FIELDS,
  SCENE_IDENTITY_FIELDS,
  SCENE_LIGHTING_FIELDS,
  SCENE_SOUND_FIELDS,
  SCENE_STORY_FIELDS,
  SCENE_STRUCTURE_FIELDS,
  SCENE_VIEW_SLOTS,
  sceneAnchorGroups,
  sceneCameraMoveLabel,
  sceneInstanceCompleteness,
  sceneMasterCompleteness,
  scenePaletteSwatch,
  sceneReviewState,
  sceneSetupStatus,
  sceneShotTimecode,
  sceneTimelineRows,
  type SceneAnchor,
  type SceneContinuityIssue,
  type SceneMaster,
  type SceneShotState,
  type SceneViewId
} from '../lib/sceneVisualSpec';
import {
  IconAlert,
  IconCamera,
  IconCheck,
  IconChevron,
  IconLayers,
  IconPlus,
  IconRefresh,
  IconUpload,
  IconWand,
  IconX
} from './icons';

export type SceneBoardContinuityReport = {
  sceneId: string;
  sceneTitle: string;
  masterId: string;
  issues: SceneContinuityIssue[];
};

type Props = {
  masters: SceneMaster[];
  scenes: SceneAsset[];
  characters: CharacterAsset[];
  continuityReports: SceneBoardContinuityReport[];
  busy?: boolean;
  notice?: string;
  onUpdateMaster: (masterId: string, change: Partial<SceneMaster>, summary: string) => void;
  onRegenerateSceneImage: (sceneId: string) => void;
  onReplaceSceneImage: (sceneId: string, file?: File) => void;
  onRegenerateMasterView: (masterId: string, viewId: SceneViewId) => void;
  onReplaceMasterView: (masterId: string, viewId: SceneViewId, file?: File) => void;
  onRequestRevision: (instruction: string) => void;
};

/**
 * 走位图上的角色配色。
 *
 * 按角色在花名册里的次序取固定色板，不按 id 哈希：哈希只保证「同一个人同一个色」，
 * 不保证「两个人不同色」——两个 id 撞到相邻色相，走位图上就是两个一样的点，
 * 而这张图的全部作用就是区分谁是谁。
 */
const CAST_COLORS = [
  'hsl(150 62% 46%)', 'hsl(206 78% 60%)', 'hsl(28 82% 58%)', 'hsl(340 68% 62%)',
  'hsl(264 58% 66%)', 'hsl(188 68% 48%)', 'hsl(86 52% 48%)', 'hsl(8 74% 62%)'
];

function castColorFor(characterId: string, order: string[]): string {
  const index = order.indexOf(characterId);
  return CAST_COLORS[(index >= 0 ? index : order.length) % CAST_COLORS.length];
}

function fieldText(source: unknown, key: string): string {
  const value = (source as Record<string, unknown>)?.[key];
  return typeof value === 'string' ? value : '';
}

function CompletenessBar({ percent }: { percent: number }) {
  return (
    <span className="sb-progress" role="img" aria-label={`完成度 ${percent}%`}>
      <span style={{ width: `${percent}%` }} />
    </span>
  );
}

/** 一组只读字段。空值不渲染——把「未设定」铺满屏幕只会淹没真正填了的内容。 */
function ReadOnlyFields({ source, fields }: { source: unknown; fields: Array<{ key: string; label: string }> }) {
  const filled = fields.filter((field) => fieldText(source, field.key).trim());
  if (!filled.length) return <p className="sb-hint">这一组还没有内容。</p>;
  return (
    <dl className="sb-field-list">
      {filled.map((field) => (
        <div key={field.key}>
          <dt>{field.label}</dt>
          <dd>{fieldText(source, field.key)}</dd>
        </div>
      ))}
    </dl>
  );
}

function Section({
  title,
  hint,
  defaultOpen = false,
  badge,
  children
}: {
  title: string;
  hint?: string;
  defaultOpen?: boolean;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <details className="sb-section" open={defaultOpen}>
      <summary>
        <IconChevron />
        <strong>{title}</strong>
        {hint && <small>{hint}</small>}
        {badge && <em>{badge}</em>}
      </summary>
      <div className="sb-section-body">{children}</div>
    </details>
  );
}

export default function SceneVisualBoard({
  masters,
  scenes,
  characters,
  continuityReports,
  busy = false,
  notice,
  onUpdateMaster,
  onRegenerateSceneImage,
  onReplaceSceneImage,
  onRegenerateMasterView,
  onReplaceMasterView,
  onRequestRevision
}: Props) {
  const [openMasterId, setOpenMasterId] = useState('');
  const [activeSceneId, setActiveSceneId] = useState('');
  const [activeViewId, setActiveViewId] = useState<SceneViewId>('panorama');
  const [anchorDraft, setAnchorDraft] = useState('');
  const [detailOpen, setDetailOpen] = useState(false);

  const characterName = useMemo(
    () => new Map(characters.map((character) => [character.id, character.name || character.id])),
    [characters]
  );
  // 花名册顺序决定配色，所以同一个角色在所有场次、所有场景里都是同一个颜色。
  const castOrder = useMemo(() => characters.map((character) => character.id), [characters]);

  /** 每个母版派生出的场次、完成度和冲突数。总览和画板顶部用的是同一份，不会对不上。 */
  const summaries = useMemo(
    () =>
      masters.map((master) => {
        const instances = scenes.filter((scene) => scene.sceneMasterId === master.id);
        const issues = continuityReports
          .filter((report) => report.masterId === master.id)
          .flatMap((report) => report.issues);
        const errors = issues.filter((issue) => issue.severity === 'error').length;
        return {
          master,
          instances,
          issues,
          errorCount: errors,
          review: sceneReviewState(master, errors),
          setup: sceneSetupStatus(master),
          cover: master.views.panorama || instances.find((scene) => scene.referenceImageUrl)?.referenceImageUrl || ''
        };
      }),
    [masters, scenes, continuityReports]
  );

  const active = summaries.find((item) => item.master.id === openMasterId);
  const activeScene = active?.instances.find((scene) => scene.id === activeSceneId) || active?.instances[0];
  const activeReport = continuityReports.find((report) => report.sceneId === activeScene?.id);

  function openMaster(masterId: string) {
    setOpenMasterId(masterId);
    setActiveSceneId('');
    setActiveViewId('panorama');
    setAnchorDraft('');
  }

  // ── 一级总览 ─────────────────────────────────────────────────────
  if (!active) {
    return (
      <div className="scene-overview">
        {notice && <div className="sb-notice">{notice}</div>}
        {summaries.length ? (
          <div className="scene-card-grid">
            {summaries.map(({ master, instances, errorCount, review, cover }) => (
              <article className="scene-card" key={master.id}>
                <button type="button" className="scene-card-main" onClick={() => openMaster(master.id)}>
                  <span className="scene-card-cover">
                    {cover ? (
                      <img src={cover} alt={`${master.identity.name} 主视觉`} loading="lazy" />
                    ) : (
                      <span className="sb-image-empty">
                        <IconCamera />
                        <span>待生成空间全景</span>
                      </span>
                    )}
                  </span>
                  <span className="scene-card-body">
                    <strong>{master.identity.name || '未命名场景'}</strong>
                    <small className="scene-card-kind">
                      {master.identity.spaceKind === 'exterior' ? '外景' : '内景'} ·{' '}
                      {master.identity.accessKind === 'public' ? '公共空间' : '私人空间'}
                    </small>
                    <p>{master.identity.tagline || '还没有一句话视觉定位'}</p>
                    <span className="scene-card-meta">
                      <em>{instances.length} 个场次</em>
                      {/* 统计的是 error，所以写「冲突」不写「风险」——warning 不挡确认，混在一起会让用户以为都得改。 */}
                      <em className={errorCount ? 'risk' : ''}>
                        {errorCount ? `${errorCount} 项连续性冲突` : '无连续性冲突'}
                      </em>
                    </span>
                    <span className="scene-card-progress">
                      <CompletenessBar percent={review.completeness.percent} />
                      <em>{review.completeness.percent}%</em>
                      <b className={`sb-status ${review.status}`}>{review.label}</b>
                    </span>
                  </span>
                </button>
                <button type="button" className="btn sm" onClick={() => openMaster(master.id)}>
                  <IconLayers /> {review.actionLabel}
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty">场景资产会在剧本和角色确认后出现。</div>
        )}
      </div>
    );
  }

  const { master } = active;
  const completeness = active.review.completeness;
  const locked = master.locked;
  const name = master.identity.name || '未命名场景';
  const anchorGroups = sceneAnchorGroups(master);
  const activeSlot = SCENE_VIEW_SLOTS.find((slot) => slot.id === activeViewId);

  function patchMaster(change: Partial<SceneMaster>, summary: string) {
    onUpdateMaster(master.id, change, summary);
  }

  function patchGroup<K extends 'identity' | 'structure' | 'art'>(group: K, key: string, value: string) {
    patchMaster(
      { [group]: { ...master[group], [key]: value } } as Partial<SceneMaster>,
      `更新「${name}」母版字段`
    );
  }

  function patchAnchors(next: SceneAnchor[], summary: string) {
    patchMaster({ anchors: next }, summary);
  }

  const shots = activeScene?.instance.shots || [];
  const camera = activeScene?.instance.camera;

  return (
    <div className="scene-board">
      {notice && <div className="sb-notice">{notice}</div>}

      {/* 顶部：母版基本信息和状态 */}
      <header className="sb-head">
        <button type="button" className="sb-back" onClick={() => setOpenMasterId('')}>
          <IconChevron /> 返回场景总览
        </button>
        <div className="sb-head-title">
          <h3>
            {name}
            <span className="sb-tag">{master.identity.code || '未编号'}</span>
            <span className="sb-tag ghost">
              {master.identity.spaceKind === 'exterior' ? '外景' : '内景'} ·{' '}
              {master.identity.accessKind === 'public' ? '公共空间' : '私人空间'}
            </span>
          </h3>
          <p>{master.identity.tagline || '还没有一句话视觉定位'}</p>
        </div>
        <div className="sb-head-status">
          <span className={`sb-status ${active.review.status}`}>{active.review.label}</span>
          <span className="sb-head-progress">
            <CompletenessBar percent={completeness.percent} />
            <em>
              完成度 {completeness.percent}%（{completeness.done}/{completeness.total}）
            </em>
          </span>
          <span className={active.errorCount ? 'sb-risk risk' : 'sb-risk'}>
            {active.errorCount ? `${active.errorCount} 项连续性冲突` : '无连续性冲突'}
          </span>
        </div>
      </header>

      {completeness.missing.length > 0 && (
        <p className="sb-missing">
          还缺：{completeness.missing.slice(0, 6).join('、')}
          {completeness.missing.length > 6 ? ` 等 ${completeness.missing.length} 项` : ''}
        </p>
      )}

      <div className="sb-body">
        {/* 左侧：场景列表 */}
        <aside className="sb-index" aria-label="场景列表">
          <p className="sb-index-head">场景列表</p>
          <ul>
            {summaries.map((item, index) => (
              <li key={item.master.id}>
                <button
                  type="button"
                  className={item.master.id === master.id ? 'active' : ''}
                  aria-pressed={item.master.id === master.id}
                  onClick={() => openMaster(item.master.id)}
                >
                  <span className="sb-index-no">{String(index + 1).padStart(2, '0')}</span>
                  <span className="sb-index-thumb">
                    {item.cover ? <img src={item.cover} alt="" loading="lazy" /> : <IconCamera />}
                  </span>
                  <span className="sb-index-text">
                    <strong>{item.master.identity.name || '未命名场景'}</strong>
                    <small className={`sb-dot ${item.setup.status}`}>
                      {item.setup.label} · {item.instances.length} 场
                    </small>
                  </span>
                  {item.errorCount > 0 && <em className="sb-index-risk">{item.errorCount}</em>}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {/* 中间左：空间全景、方向视图和平面图 */}
        <section className="sb-visuals" aria-label="空间参考图">
          <div className="sb-stage">
            {master.views[activeViewId] ? (
              <img src={master.views[activeViewId]} alt={`${name} ${activeSlot?.label}`} />
            ) : (
              <div className="sb-image-empty">
                <IconCamera />
                <strong>还没有这个机位的参考图</strong>
                <span>上传参考图，或点「生成」按母版设定出图</span>
              </div>
            )}
            <div className="sb-stage-badges">
              <span>{activeSlot?.label}</span>
              <span className="ghost">{activeSlot?.hint}</span>
            </div>
          </div>

          <div className="sb-stage-actions">
            <button type="button" disabled={busy} onClick={() => onRegenerateMasterView(master.id, activeViewId)}>
              <IconRefresh /> <span>{master.views[activeViewId] ? '重新生成' : '生成参考图'}</span>
            </button>
            <label>
              <IconUpload /> <span>上传参考图</span>
              <input
                type="file"
                accept="image/*"
                onChange={(event) => {
                  onReplaceMasterView(master.id, activeViewId, event.target.files?.[0]);
                  event.target.value = '';
                }}
              />
            </label>
          </div>

          <div className="sb-slots" aria-label="八个固定机位">
            {SCENE_VIEW_SLOTS.map((slot) => (
              <button
                type="button"
                key={slot.id}
                className={slot.id === activeViewId ? 'active' : ''}
                aria-pressed={slot.id === activeViewId}
                title={slot.hint}
                onClick={() => setActiveViewId(slot.id)}
              >
                <span className="sb-slot-thumb">
                  {master.views[slot.id] ? <img src={master.views[slot.id]} alt="" loading="lazy" /> : <IconPlus />}
                </span>
                <small>{slot.label}</small>
              </button>
            ))}
          </div>
        </section>

        {/* 中间右：空间身份锚点 */}
        <section className="sb-anchors" aria-label="空间身份锚点">
          <header className="sb-anchors-head">
            <strong>空间身份锚点</strong>
            <button
              type="button"
              className={locked ? 'sb-lock on' : 'sb-lock'}
              aria-pressed={locked}
              onClick={() => patchMaster({ locked: !locked }, `${locked ? '解锁' : '锁定'}「${name}」场景母版`)}
            >
              <IconCheck /> {locked ? '已锁定' : '未锁定'}
            </button>
          </header>

          {anchorGroups.length > 0 && (
            <table className="sb-anchor-table">
              <tbody>
                {anchorGroups.map((group) => (
                  <tr key={group.id}>
                    <th>{group.label}</th>
                    <td>
                      {group.kind === 'material' ? (
                        <span className="sb-swatch-row">
                          {group.items.map((item) => {
                            const swatch = scenePaletteSwatch(item);
                            return (
                              <span className="sb-swatch" key={item}>
                                <i style={swatch.hex ? { background: swatch.hex } : undefined} />
                                <small>{item}</small>
                              </span>
                            );
                          })}
                        </span>
                      ) : group.kind === 'color' ? (
                        <span className="sb-color-row">
                          {group.items.map((item) => {
                            const swatch = scenePaletteSwatch(item);
                            return (
                              <i
                                key={item}
                                title={item}
                                style={swatch.hex ? { background: swatch.hex } : undefined}
                              />
                            );
                          })}
                        </span>
                      ) : (
                        <span className="sb-chip-row">
                          {group.items.map((item) => (
                            <span key={item}>{item}</span>
                          ))}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="sb-anchor-lines">
            <p className="sb-anchor-lines-head">
              不可随镜头改变的识别特征
              <em>
                {master.anchors.length}/{SCENE_ANCHOR_MAX}
              </em>
            </p>
            <ul>
              {master.anchors.map((anchor, index) => (
                <li key={anchor.id} className={anchor.locked ? 'locked' : ''}>
                  <input
                    value={anchor.text}
                    readOnly={anchor.locked || locked}
                    onChange={(event) =>
                      patchAnchors(
                        master.anchors.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, text: event.target.value } : item
                        ),
                        `修改「${name}」空间身份锚点`
                      )
                    }
                  />
                  <button
                    type="button"
                    className={anchor.locked ? 'sb-anchor-lock on' : 'sb-anchor-lock'}
                    title={anchor.locked ? '已锁定，镜头不得改变' : '锁定这条锚点'}
                    aria-pressed={anchor.locked}
                    onClick={() =>
                      patchAnchors(
                        master.anchors.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, locked: !item.locked } : item
                        ),
                        `${anchor.locked ? '解锁' : '锁定'}「${name}」的一条空间锚点`
                      )
                    }
                  >
                    <IconCheck />
                  </button>
                  <button
                    type="button"
                    className="sb-anchor-remove"
                    disabled={anchor.locked || locked}
                    title="删除这条锚点"
                    onClick={() =>
                      patchAnchors(
                        master.anchors.filter((_, itemIndex) => itemIndex !== index),
                        `删除「${name}」的一条空间锚点`
                      )
                    }
                  >
                    <IconX />
                  </button>
                </li>
              ))}
            </ul>
            {master.anchors.length < SCENE_ANCHOR_MAX && !locked && (
              <div className="sb-anchor-add">
                <input
                  value={anchorDraft}
                  placeholder="例如：落地窗位于沙发右后方"
                  onChange={(event) => setAnchorDraft(event.target.value)}
                />
                <button
                  type="button"
                  disabled={!anchorDraft.trim()}
                  onClick={() => {
                    patchAnchors(
                      [
                        ...master.anchors,
                        { id: `anchor_${master.anchors.length + 1}`, text: anchorDraft.trim(), locked: false }
                      ],
                      `新增「${name}」空间身份锚点`
                    );
                    setAnchorDraft('');
                  }}
                >
                  <IconPlus /> 添加
                </button>
              </div>
            )}
            {master.anchors.length < SCENE_ANCHOR_MIN && (
              <p className="sb-hint">
                锚点不足 {SCENE_ANCHOR_MIN} 条，镜头之间没有可对齐的识别特征。可参考：
                {SCENE_ANCHOR_PRESETS.slice(0, 3).join('、')}。
              </p>
            )}
          </div>

          <p className={locked ? 'sb-lock-state on' : 'sb-lock-state'}>
            <IconCheck /> 锁定状态：{locked ? '已锁定（所有关键元素不可变更）' : '未锁定，母版字段仍可编辑'}
          </p>
        </section>
      </div>

      {/* 下方：不同场次状态 */}
      <section className="sb-instances" aria-label="场次状态">
        <div className="sb-instance-tabs">
          {active.instances.map((scene) => {
            const risk = continuityReports.find((report) => report.sceneId === scene.id);
            const errors = risk?.issues.filter((issue) => issue.severity === 'error').length || 0;
            const label = scene.title.includes('·') ? scene.title.split('·').pop()!.trim() : scene.title;
            return (
              <button
                type="button"
                key={scene.id}
                className={scene.id === activeScene?.id ? 'active' : ''}
                aria-pressed={scene.id === activeScene?.id}
                onClick={() => setActiveSceneId(scene.id)}
              >
                {label || scene.id}
                {errors > 0 && <em className="sb-index-risk">{errors}</em>}
              </button>
            );
          })}
        </div>

        {activeScene ? (
          <>
            <div className="sb-state-grid">
              {/* 光影状态 */}
              <article className="sb-state-card">
                <h4>光影状态</h4>
                <div className="sb-state-body">
                  <dl>
                    <div>
                      <dt>时间</dt>
                      <dd>{activeScene.instance.environment.timeOfDay || activeScene.timeOfDay || '—'}</dd>
                    </div>
                    <div>
                      <dt>自然光</dt>
                      <dd>{activeScene.instance.lighting.windowLight || activeScene.instance.lighting.keySource || '—'}</dd>
                    </div>
                    <div>
                      <dt>人工光</dt>
                      <dd>{activeScene.instance.lighting.practicals || activeScene.instance.fixtures.lights || '—'}</dd>
                    </div>
                    <div>
                      <dt>色温</dt>
                      <dd>{activeScene.instance.lighting.colorTemperature || '—'}</dd>
                    </div>
                    <div>
                      <dt>主光方向</dt>
                      <dd>{activeScene.instance.lighting.keyDirection || '—'}</dd>
                    </div>
                  </dl>
                  <span className="sb-state-thumb">
                    {master.views.front || master.views.panorama ? (
                      <img src={master.views.front || master.views.panorama} alt="" loading="lazy" />
                    ) : (
                      <IconCamera />
                    )}
                  </span>
                </div>
              </article>

              {/* 临时道具 */}
              <article className="sb-state-card">
                <h4>
                  临时道具<em>{activeScene.instance.props.length}</em>
                </h4>
                {activeScene.instance.props.length ? (
                  <ul className="sb-prop-list">
                    {activeScene.instance.props.map((prop) => (
                      <li key={prop.id}>
                        <span>{prop.name}</span>
                        <small>{prop.endPosition || prop.startPosition || prop.consumable || '—'}</small>
                        {(prop.damaged || prop.inherit) && (
                          <IconAlert className="sb-prop-flag" aria-label={prop.damaged ? '本场破损' : '继承到下一场'} />
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="sb-hint">本场没有新增道具。</p>
                )}
              </article>

              {/* 环境变化 */}
              <article className="sb-state-card">
                <h4>环境变化</h4>
                <div className="sb-state-body">
                  <dl>
                    <div>
                      <dt>门窗</dt>
                      <dd>{activeScene.instance.fixtures.doors || '—'}</dd>
                    </div>
                    <div>
                      <dt>窗帘</dt>
                      <dd>{activeScene.instance.fixtures.windows || '—'}</dd>
                    </div>
                    <div>
                      <dt>整洁度</dt>
                      <dd>{activeScene.instance.environment.tidiness || '—'}</dd>
                    </div>
                    <div>
                      <dt>家具</dt>
                      <dd>{activeScene.instance.fixtures.furnitureMoved || '未移动'}</dd>
                    </div>
                    <div>
                      <dt>氛围</dt>
                      <dd>{activeScene.instance.story.emotionEnd || activeScene.instance.environment.air || '—'}</dd>
                    </div>
                  </dl>
                  <span className="sb-state-thumb">
                    {activeScene.referenceImageUrl ? (
                      <img src={activeScene.referenceImageUrl} alt="" loading="lazy" />
                    ) : (
                      <IconCamera />
                    )}
                  </span>
                </div>
                <div className="sb-state-actions">
                  <button type="button" disabled={busy} onClick={() => onRegenerateSceneImage(activeScene.id)}>
                    <IconRefresh /> 重新生成
                  </button>
                  <label>
                    <IconUpload /> 替换
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event) => {
                        onReplaceSceneImage(activeScene.id, event.target.files?.[0]);
                        event.target.value = '';
                      }}
                    />
                  </label>
                </div>
              </article>

              {/* 人物调度：俯视走位图 */}
              <article className="sb-state-card">
                <h4>
                  人物调度<em>{activeScene.instance.blocking.length}</em>
                </h4>
                {activeScene.instance.blocking.length || master.plan.length ? (
                  <div className="sb-blocking">
                    <svg viewBox="0 0 100 74" role="img" aria-label="人物走位俯视图">
                      <rect className="sb-room" x="2" y="2" width="96" height="70" rx="1.5" />
                      {master.plan.map((block) => (
                        <g key={block.id}>
                          <rect
                            className="sb-furniture"
                            x={block.x}
                            y={block.y * 0.74}
                            width={block.width}
                            height={block.height * 0.74}
                            rx="1.2"
                          />
                        </g>
                      ))}
                      {camera && (
                        // 视锥：让「这个机位看得到谁、会不会拍到镜子」变成可看的东西。
                        <g className="sb-camera">
                          <path
                            d={(() => {
                              const rad = (deg: number) => (deg * Math.PI) / 180;
                              const reach = 46;
                              const y = camera.y * 0.74;
                              const left = rad(camera.angle - camera.fov / 2);
                              const right = rad(camera.angle + camera.fov / 2);
                              return `M ${camera.x} ${y} L ${camera.x + Math.cos(left) * reach} ${y + Math.sin(left) * reach * 0.74} L ${camera.x + Math.cos(right) * reach} ${y + Math.sin(right) * reach * 0.74} Z`;
                            })()}
                          />
                          <circle cx={camera.x} cy={camera.y * 0.74} r="2.6" />
                        </g>
                      )}
                      {activeScene.instance.blocking.map((entry) => {
                        const color = castColorFor(entry.characterId, castOrder);
                        const y1 = entry.start.y * 0.74;
                        const y2 = entry.end.y * 0.74;
                        const moved = entry.start.x !== entry.end.x || entry.start.y !== entry.end.y;
                        return (
                          <g key={entry.characterId}>
                            {moved && (
                              <line
                                x1={entry.start.x}
                                y1={y1}
                                x2={entry.end.x}
                                y2={y2}
                                stroke={color}
                                strokeWidth="0.7"
                                strokeDasharray="2 2"
                              />
                            )}
                            <circle cx={entry.start.x} cy={y1} r="2.8" fill={color} />
                            {moved && <circle cx={entry.end.x} cy={y2} r="2.8" fill="none" stroke={color} strokeWidth="1.1" />}
                            <text x={entry.start.x + 4.5} y={y1 + 1.6} fill={color}>
                              {characterName.get(entry.characterId) || entry.characterId}
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                    {!master.plan.length && (
                      <p className="sb-hint">母版还没有平面布局，走位图只画了空房间。</p>
                    )}
                  </div>
                ) : (
                  <p className="sb-hint">还没有人物调度。场景不是空背景，至少要记录主要人物的站位和面向。</p>
                )}
              </article>
            </div>

            <div className="sb-instance-more">
              <button type="button" className="sb-more-toggle" onClick={() => setDetailOpen((open) => !open)}>
                <IconChevron className={detailOpen ? 'open' : ''} />
                {detailOpen ? '收起本场完整设定' : '展开本场完整设定'}
                <em>
                  场次完成度 {sceneInstanceCompleteness(activeScene.instance).percent}%
                </em>
              </button>

              {detailOpen && (
                <div className="sb-detail-grid">
                  <Section title="剧情信息" defaultOpen>
                    <ReadOnlyFields source={activeScene.instance.story} fields={SCENE_STORY_FIELDS} />
                  </Section>
                  <Section title="环境状态">
                    <ReadOnlyFields source={activeScene.instance.environment} fields={SCENE_ENVIRONMENT_FIELDS} />
                  </Section>
                  <Section title="光影状态">
                    <ReadOnlyFields source={activeScene.instance.lighting} fields={SCENE_LIGHTING_FIELDS} />
                    {activeScene.instance.lighting.effects.length > 0 && (
                      <p className="sb-chip-row">
                        {activeScene.instance.lighting.effects.map((effect) => (
                          <span key={effect}>{effect}</span>
                        ))}
                      </p>
                    )}
                  </Section>
                  <Section title="门窗与道具">
                    <ReadOnlyFields source={activeScene.instance.fixtures} fields={SCENE_FIXTURE_FIELDS} />
                  </Section>
                  <Section title="人物调度明细">
                    {activeScene.instance.blocking.map((entry) => (
                      <div className="sb-blocking-entry" key={entry.characterId}>
                        <strong>
                          <i style={{ background: castColorFor(entry.characterId, castOrder) }} />
                          {characterName.get(entry.characterId) || entry.characterId}
                          {entry.dominant && <em>视觉主导</em>}
                        </strong>
                        <ReadOnlyFields source={entry} fields={SCENE_BLOCKING_FIELDS} />
                      </div>
                    ))}
                  </Section>
                  <Section title="声音与氛围">
                    <ReadOnlyFields source={activeScene.instance.sound} fields={SCENE_SOUND_FIELDS} />
                  </Section>
                  <Section title="母版设定" hint="锁定后只读">
                    <div className="sb-edit-grid">
                      {[...SCENE_IDENTITY_FIELDS, ...SCENE_STRUCTURE_FIELDS, ...SCENE_ART_FIELDS].map((field) => {
                        const group = SCENE_IDENTITY_FIELDS.includes(field)
                          ? 'identity'
                          : SCENE_STRUCTURE_FIELDS.includes(field)
                            ? 'structure'
                            : 'art';
                        return (
                          <label key={`${group}_${field.key}`} className={field.multiline ? 'wide' : ''}>
                            <span>
                              {field.label}
                              {field.required && <em>*</em>}
                            </span>
                            <input
                              readOnly={locked}
                              value={fieldText(master[group as 'identity' | 'structure' | 'art'], field.key)}
                              placeholder={field.placeholder}
                              onChange={(event) =>
                                patchGroup(group as 'identity' | 'structure' | 'art', field.key, event.target.value)
                              }
                            />
                          </label>
                        );
                      })}
                    </div>
                  </Section>
                  <Section title="生成一致性约束" hint="这三组会直接拼进出图和出视频的提示词">
                    <div className="sb-contract">
                      <div>
                        <small>必须保持</small>
                        <p>{SCENE_CONSISTENCY_CONTRACT.mustKeep.join('、')}</p>
                      </div>
                      <div>
                        <small>允许变化</small>
                        <p>{SCENE_CONSISTENCY_CONTRACT.mayChange.join('、')}</p>
                      </div>
                      <div className="ban">
                        <small>禁止漂移</small>
                        <p>{SCENE_CONSISTENCY_CONTRACT.driftBans.join('、')}</p>
                      </div>
                    </div>
                  </Section>
                </div>
              )}

              <div className="sb-instance-actions">
                <button
                  type="button"
                  onClick={() =>
                    onRequestRevision(
                      `我要修改场次「${activeScene.title || activeScene.id}」：请只修改 scenes.json 中这一场的 instance（剧情、环境、光影、道具、人物调度、声音和镜头），保持它引用的场景母版 ${master.id} 不变，也不要改动其它场次和已确认脚本。`
                    )
                  }
                >
                  <IconWand /> 修改本场设定
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onRequestRevision(
                      `我要修改场景母版「${name}」：请只修改 scenes.json 中 sceneMasters 里 id 为 ${master.id} 的这一份空间设定（结构、固定美术、锚点、平面布局），所有引用它的场次保持不变。`
                    )
                  }
                >
                  <IconLayers /> 修改母版文字设定
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="empty">这个场景母版还没有派生任何场次。</div>
        )}
      </section>

      {/* 最下方：镜头连续性时间线 */}
      <section className="sb-timeline" aria-label="镜头连续性时间线">
        <header>
          <strong>镜头连续性时间线</strong>
          <small>
            {shots.length} 个镜头 · {activeReport?.issues.length || 0} 项待确认
          </small>
        </header>

        {shots.length ? (
          <>
            <div className="sb-track">
              {shots.map((shot: SceneShotState, index) => {
                const shotIssues =
                  activeReport?.issues.filter((issue) => issue.toShotId === shot.id) || [];
                const severity = shotIssues.some((issue) => issue.severity === 'error')
                  ? 'error'
                  : shotIssues.length
                    ? 'warning'
                    : 'ok';
                const riskyFields = new Set(shotIssues.map((issue) => issue.field));
                return (
                  <article key={shot.id} className={`sb-shot ${severity}`}>
                    <div className="sb-shot-frame">
                      {master.views.panorama ? (
                        <img src={master.views.panorama} alt="" loading="lazy" />
                      ) : (
                        <IconCamera />
                      )}
                      <span className="sb-shot-code">{shot.code}</span>
                      <span className="sb-shot-size">
                        {shot.shotSize || sceneCameraMoveLabel(shot.cameraMove)}
                      </span>
                      <span className="sb-shot-time">{sceneShotTimecode(shots, index)}</span>
                    </div>
                    <dl className="sb-shot-rows">
                      {sceneTimelineRows(shot).map((row) => (
                        <div key={row.field} className={riskyFields.has(row.field) ? 'risk' : ''}>
                          <dt>{row.label}</dt>
                          <dd>
                            {row.value}
                            {riskyFields.has(row.field) && <IconAlert />}
                          </dd>
                        </div>
                      ))}
                      {shotIssues.length > 0 && (
                        <div className={`sb-shot-flag ${severity}`}>
                          <dt>连续性{severity === 'error' ? '错误' : '风险'}</dt>
                          <dd>{shotIssues.length}</dd>
                        </div>
                      )}
                    </dl>
                  </article>
                );
              })}
            </div>

            <div className="sb-legend">
              <span className="ok">连续性一致</span>
              <span className="warning">存在风险</span>
              <span className="error">严重错误</span>
            </div>

            {activeReport?.issues.length ? (
              <ul className="sb-issues">
                {activeReport.issues.map((issue) => (
                  <li key={issue.id} className={issue.severity}>
                    <span className="sb-issue-tag">{issue.label}</span>
                    <p>{issue.message}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="sb-hint">相邻镜头之间没有发现连续性冲突。</p>
            )}
          </>
        ) : (
          <p className="sb-hint">
            这一场还没有镜头。镜头会引用当前母版和场次，不会各自生成互不相关的背景。
          </p>
        )}
      </section>
    </div>
  );
}
