/**
 * 角色视觉设定画板（二级）。
 *
 * 一级是画布上那张角色总览卡，只回答「这个人是谁、审到哪一步了」；
 * 真正要填、要审、要拿去生成的字段全部在这一层，
 * 所以这里不做成一张更大的卡片，而是「左侧角色索引 + 中间设定 + 底部全员矩阵」的画板。
 *
 * 两条硬规矩：
 *  1. 固定身份特征和场景变量必须分开显示，并且身份特征可以锁定——
 *     锁上之后连输入框都禁用，防止有人顺手把脸改了还以为只是改了衣服。
 *  2. 底部矩阵永远显示全员。三个男配都穿灰色上衣这种问题，
 *     在单个角色的设定页里永远看不出来，只有摆在一起才会暴露。
 *
 * 组件本身不认识任何具体角色，全部字段来自 characters.json 的 visual 对象。
 */
import { useEffect, useState, type ReactNode } from 'react';
import {
  CHARACTER_CAMERA_ANGLE_PRESETS,
  CHARACTER_DRIFT_BAN_PRESETS,
  CHARACTER_EXPRESSION_FIELDS,
  CHARACTER_EXPRESSION_SLOTS,
  CHARACTER_HAIR_FIELDS,
  CHARACTER_IDENTITY_ANCHOR_PRESETS,
  CHARACTER_IDENTITY_FIELDS,
  CHARACTER_SHOT_SIZE_PRESETS,
  CHARACTER_SPEC_GROUPS,
  CHARACTER_VIEW_ANGLES,
  CHARACTER_WARDROBE_FIELDS,
  CHARACTER_WARDROBE_SCENARIOS,
  characterExpressionSlots,
  characterMatrixConflicts,
  characterMatrixRow,
  characterPaletteSwatch,
  characterReviewState,
  characterWardrobeLookTemplate,
  type CharacterExpressionShot,
  type CharacterFieldDescriptor,
  type CharacterSpecGroupId,
  type CharacterViewAngleId,
  type CharacterVisualSpec,
  type CharacterWardrobeLook
} from '../lib/characterVisualSpec';
import {
  IconAlert,
  IconCamera,
  IconCheck,
  IconGrid,
  IconLayers,
  IconLoader,
  IconLock,
  IconPlus,
  IconRefresh,
  IconShirt,
  IconSmile,
  IconUnlock,
  IconUpload,
  IconUsers,
  IconWand,
  IconX
} from './icons';

export type CharacterBoardEntry = {
  id: string;
  name: string;
  role: string;
  description: string;
  /** 主视觉缩略图，没有就是空串，索引里画占位。 */
  thumbnail: string;
  visual: CharacterVisualSpec;
};

export type CharacterImageSlot =
  | { kind: 'view'; id: CharacterViewAngleId }
  | { kind: 'look'; id: string }
  | { kind: 'expression'; id: string };

export type CharacterSlotState = { status: 'generating' | 'error'; message?: string };

export type CharacterBoardTabId = 'assets' | CharacterSpecGroupId;

export function characterSlotKey(characterId: string, slot: CharacterImageSlot): string {
  return `${characterId}::${slot.kind}:${slot.id}`;
}

type CharacterDesignBoardProps = {
  characters: CharacterBoardEntry[];
  activeId: string;
  onSelectCharacter: (characterId: string) => void;
  activeTab: CharacterBoardTabId;
  onSelectTab: (tab: CharacterBoardTabId) => void;
  /** 已有的角色主图工作台（Face ID、年龄阶段、生成菜单），由页面传进来，本组件不重复实现。 */
  imageWorkspace: ReactNode;
  slotStates: Record<string, CharacterSlotState>;
  /** mutate 在页面侧针对最新的 characters.json 执行，避免同一次渲染里的两次改动互相覆盖。 */
  onVisualChange: (characterId: string, mutate: (current: CharacterVisualSpec) => CharacterVisualSpec, summary: string) => void;
  onGenerateImage: (characterId: string, slot: CharacterImageSlot) => void;
  onUploadImage: (characterId: string, slot: CharacterImageSlot, file: File) => void;
  onSubmitReview: (characterId: string) => void;
  onConfirmReview: (characterId: string) => void;
  onRequestChanges: (characterId: string) => void;
  /** 缺少角色时的说明文案，由上游阶段决定。 */
  emptyHint: string;
};

const BOARD_TABS: Array<{ id: CharacterBoardTabId; label: string; hint: string }> = [
  { id: 'assets', label: '角色主图', hint: '年龄阶段主图、Face ID 与参考策略' },
  ...CHARACTER_SPEC_GROUPS.map((group) => ({ id: group.id as CharacterBoardTabId, label: group.label, hint: group.hint }))
];

function tabIcon(id: CharacterBoardTabId) {
  if (id === 'assets') return <IconCamera />;
  if (id === 'identity') return <IconUsers />;
  if (id === 'hair') return <IconWand />;
  if (id === 'wardrobe') return <IconShirt />;
  if (id === 'expressions') return <IconSmile />;
  if (id === 'shooting') return <IconLayers />;
  return <IconGrid />;
}

function parseList(value: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value.split(/[、,，;；\n]/)) {
    const entry = item.trim();
    if (!entry || seen.has(entry)) continue;
    seen.add(entry);
    out.push(entry);
  }
  return out;
}

/** 人物轮廓：给造型卡一个能一眼看出体型和主色的图示，不依赖任何外部图片。 */
function FigureSilhouette({ colors }: { colors: string[] }) {
  const body = colors[0] || 'currentColor';
  const legs = colors[1] || colors[0] || 'currentColor';
  return (
    <svg className="character-figure" viewBox="0 0 48 96" aria-hidden="true" focusable="false">
      <circle cx="24" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 30c0-4 5-7 12-7s12 3 12 7v22H12z" fill={body} opacity={colors[0] ? 0.9 : 0.18} stroke="currentColor" strokeWidth="1.2" />
      <path d="M16 52h6v34h-6zM26 52h6v34h-6z" fill={legs} opacity={colors[1] || colors[0] ? 0.75 : 0.14} stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function ColorSwatches({ palette }: { palette: string[] }) {
  if (!palette.length) return <span className="character-board-empty-inline">未设定色盘</span>;
  return (
    <div className="character-swatches">
      {palette.map((entry) => {
        const swatch = characterPaletteSwatch(entry);
        return (
          <span key={entry} className={`character-swatch ${swatch.hex ? '' : 'unknown'}`} title={entry}>
            <i style={swatch.hex ? { background: swatch.hex } : undefined} />
            {swatch.label || entry}
          </span>
        );
      })}
    </div>
  );
}

/**
 * 下面这三个受控字段必须定义在模块作用域。
 *
 * 真实事故：它们本来写在 CharacterDesignBoard 内部——每次 setState 都会产生一个新的
 * 组件类型，React 认不出是同一个组件，于是整棵子树卸载重建。表现出来就是每敲一个字
 * 输入框就丢焦点，而且 onBlur 挂在已经被卸载的旧节点上，改完的值一次都写不回去。
 */
type FieldDraftProps = {
  drafts: Record<string, string>;
  setDraft: (key: string, value: string) => void;
};

/** 统一的文本字段。锁定时只读，空值给出占位提示而不是留一片空白。 */
function TextField({
  id,
  field,
  value,
  disabled,
  drafts,
  setDraft,
  onCommit
}: FieldDraftProps & {
  id: string;
  field: CharacterFieldDescriptor;
  value: string;
  disabled?: boolean;
  onCommit: (next: string) => void;
}) {
  const current = drafts[id] !== undefined ? drafts[id] : value;
  const shared = {
    id,
    value: current,
    disabled,
    placeholder: field.placeholder,
    onChange: (event: { target: { value: string } }) => setDraft(id, event.target.value),
    onBlur: () => {
      const next = current.trim();
      if (next !== value) onCommit(next);
    }
  };
  return (
    <div className={`character-field ${field.required ? 'required' : ''} ${!current ? 'is-empty' : ''}`}>
      <label htmlFor={id}>
        {field.label}
        {field.required && <em title="必填">必填</em>}
      </label>
      {field.multiline
        ? <textarea {...shared} rows={2} />
        : <input type="text" {...shared} />}
    </div>
  );
}

/** 列表字段：输入用顿号或换行分隔，下方用 chip 回显已存下的值。 */
function ListField({
  id,
  label,
  values,
  placeholder,
  required,
  disabled,
  drafts,
  setDraft,
  onCommit
}: FieldDraftProps & {
  id: string;
  label: string;
  values: string[];
  placeholder: string;
  required?: boolean;
  disabled?: boolean;
  onCommit: (next: string[]) => void;
}) {
  const stored = values.join('、');
  const current = drafts[id] !== undefined ? drafts[id] : stored;
  return (
    <div className={`character-field ${required ? 'required' : ''} ${!current ? 'is-empty' : ''}`}>
      <label htmlFor={id}>
        {label}
        {required && <em title="必填">必填</em>}
      </label>
      <input
        id={id}
        type="text"
        value={current}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => setDraft(id, event.target.value)}
        onBlur={() => {
          const next = parseList(current);
          if (next.join('、') !== stored) onCommit(next);
        }}
      />
      {values.length > 0 && (
        <div className="character-chip-row readonly">
          {values.map((item) => <span key={item} className="character-chip">{item}</span>)}
        </div>
      )}
    </div>
  );
}

function PresetChips({
  label,
  presets,
  values,
  required,
  onToggle
}: {
  label: string;
  presets: string[];
  values: string[];
  required?: boolean;
  onToggle: (next: string[]) => void;
}) {
  const custom = values.filter((item) => !presets.includes(item));
  return (
    <div className={`character-field ${required ? 'required' : ''} ${values.length ? '' : 'is-empty'}`}>
      <span className="character-field-label">
        {label}
        {required && <em title="必填">必填</em>}
      </span>
      <div className="character-chip-row">
        {presets.map((preset) => {
          const on = values.includes(preset);
          return (
            <button
              key={preset}
              type="button"
              className={`character-chip toggle ${on ? 'active' : ''}`}
              aria-pressed={on}
              onClick={() => onToggle(on ? values.filter((item) => item !== preset) : [...values, preset])}
            >
              {on && <IconCheck />}
              {preset}
            </button>
          );
        })}
      </div>
      {custom.length > 0 && (
        <div className="character-chip-row readonly">
          {custom.map((item) => <span key={item} className="character-chip">{item}</span>)}
        </div>
      )}
    </div>
  );
}

type ImageSlotProps = {
  label: string;
  hint?: string;
  imageUrl: string;
  slotState?: CharacterSlotState;
  aspect?: 'portrait' | 'square';
  onGenerate: () => void;
  onUpload: (file: File) => void;
  onClear?: () => void;
};

/**
 * 图片位。没有图时显示「上传 / 生成」占位，而不是随便挂一张网图——
 * 角色一致性审查里一张来路不明的图比没有图更糟。
 */
function ImageSlot({ label, hint, imageUrl, slotState, aspect = 'portrait', onGenerate, onUpload, onClear }: ImageSlotProps) {
  const generating = slotState?.status === 'generating';
  return (
    <figure className={`character-image-slot ${aspect} ${generating ? 'is-loading' : ''}`}>
      <div className="character-image-slot-frame">
        {imageUrl ? (
          <img src={imageUrl} alt={label} />
        ) : (
          <div className="character-image-slot-empty">
            <IconCamera />
            <strong>{label}</strong>
            <span>还没有参考图</span>
          </div>
        )}
        {generating && (
          <div className="character-image-slot-overlay" role="status">
            <IconLoader className="spin" />
            <span>生成中</span>
          </div>
        )}
      </div>
      <figcaption>
        <strong>{label}</strong>
        {hint && <small>{hint}</small>}
      </figcaption>
      {slotState?.status === 'error' && slotState.message && (
        <p className="character-slot-error" role="alert"><IconAlert /> {slotState.message}</p>
      )}
      <div className="character-image-slot-actions">
        <button type="button" disabled={generating} onClick={onGenerate} className={generating ? 'is-loading' : ''}>
          {generating ? <IconLoader className="spin" /> : <IconRefresh />}
          <span>{imageUrl ? '重新生成' : '生成'}</span>
        </button>
        <label className={generating ? 'disabled' : ''}>
          <IconUpload />
          <span>上传</span>
          <input
            type="file"
            accept="image/*"
            disabled={generating}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onUpload(file);
              event.target.value = '';
            }}
          />
        </label>
        {imageUrl && onClear && (
          <button type="button" onClick={onClear}><IconX /><span>移除</span></button>
        )}
      </div>
    </figure>
  );
}

export default function CharacterDesignBoard({
  characters,
  activeId,
  onSelectCharacter,
  activeTab,
  onSelectTab,
  imageWorkspace,
  slotStates,
  onVisualChange,
  onGenerateImage,
  onUploadImage,
  onSubmitReview,
  onConfirmReview,
  onRequestChanges,
  emptyHint
}: CharacterDesignBoardProps) {
  const active = characters.find((character) => character.id === activeId) || characters[0];
  // 文本框先记在本地，失焦才写回工作区：每敲一个字生成一个待审 patch 是没法用的。
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  useEffect(() => setDrafts({}), [active?.id]);

  const rows = characters.map((character) => characterMatrixRow(character));
  const conflicts = characterMatrixConflicts(rows);

  if (!active) {
    return (
      <section className="character-board empty" aria-label="角色视觉设定画板">
        <div className="character-board-empty-state">
          <IconUsers />
          <strong>还没有可审查的角色</strong>
          <p>{emptyHint}</p>
        </div>
      </section>
    );
  }

  const spec = active.visual;
  const review = characterReviewState(spec);
  const { completeness } = review;
  const identityLocked = spec.identity.locked;

  /**
   * 写回时传的是「怎么改」而不是「改成什么」。
   *
   * 真实事故：连续两个字段在同一次渲染里失焦，两次改动都基于同一份 render 时的 spec，
   * 后一次会把前一次的字段整个盖掉——用户填了两格，只存下一格。
   * 交给页面在最新数据上执行 mutate，才不会丢改动。
   */
  const commit = (mutate: (current: CharacterVisualSpec) => CharacterVisualSpec, summary: string) =>
    onVisualChange(active.id, mutate, summary);

  const setDraft = (key: string, value: string) => setDrafts((prev) => ({ ...prev, [key]: value }));

  function updateLook(lookId: string, patch: Partial<CharacterWardrobeLook>, summary: string) {
    commit((spec) => ({ ...spec, wardrobe: spec.wardrobe.map((look) => (look.id === lookId ? { ...look, ...patch } : look)) }),
      summary
    );
  }

  function updateExpression(expressionId: string, patch: Partial<CharacterExpressionShot>, summary: string) {
    const next = characterExpressionSlots(spec)
      .map((slot) => (slot.id === expressionId ? { ...slot, ...patch } : slot))
      // 一个字都没填的标准槽位不写进 JSON：界面本来就会把八格补全，存空对象只会让文件变胖。
      .filter((slot) => slot.intensity || slot.brow || slot.gaze || slot.mouth || slot.sceneUsage || slot.imageUrl);
    commit((spec) => ({ ...spec, expressions: next }), summary);
  }

  const identityViewCount = CHARACTER_VIEW_ANGLES.filter((angle) => spec.identity.views[angle.id]).length;
  const expressionSlots = characterExpressionSlots(spec);
  const describedExpressions = expressionSlots.filter((slot) => slot.intensity && (slot.brow || slot.gaze || slot.mouth)).length;
  const missingScenarios = CHARACTER_WARDROBE_SCENARIOS.filter(
    (scenario) => !spec.wardrobe.some((look) => look.id === scenario.id)
  );

  return (
    <section className="character-board" aria-label="角色视觉设定画板">
      <nav className="character-board-index" aria-label="角色索引">
        <p className="character-board-index-head">角色索引</p>
        <ul>
          {characters.map((character) => {
            const state = characterReviewState(character.visual);
            const current = character.id === active.id;
            return (
              <li key={character.id}>
                <button
                  type="button"
                  className={current ? 'active' : ''}
                  aria-current={current ? 'true' : undefined}
                  onClick={() => onSelectCharacter(character.id)}
                >
                  <span className="character-board-index-thumb">
                    {character.thumbnail ? <img src={character.thumbnail} alt="" /> : <IconCamera />}
                  </span>
                  <span className="character-board-index-text">
                    <strong>{character.name}</strong>
                    <small>{character.role || '角色'}</small>
                  </span>
                  <span className={`character-status-dot ${state.status}`} title={state.label} aria-label={state.label} />
                  <em>{state.completeness.percent}%</em>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="character-board-main">
        <header className="character-board-head">
          <div className="character-board-title">
            <span className="character-board-role">{active.role || '角色'}</span>
            <strong>{active.name}</strong>
            <p>{spec.tagline || active.description || '还没有一句话定位，可在「视觉辨识度」里补充。'}</p>
            {spec.tags.length > 0 && (
              <div className="character-chip-row readonly">
                {spec.tags.map((tag) => <span key={tag} className="character-chip">{tag}</span>)}
              </div>
            )}
          </div>
          <div className="character-board-status">
            <span className={`character-status-pill ${review.status}`}>{review.label}</span>
            <div className="character-progress" title={`必填完成度 ${completeness.done}/${completeness.total}`}>
              <div className="character-progress-bar">
                <i style={{ width: `${completeness.percent}%` }} />
              </div>
              <small>必填完成度 {completeness.percent}%（{completeness.done}/{completeness.total}）</small>
            </div>
            <div className="character-board-actions">
              <button
                type="button"
                className="btn primary sm"
                disabled={!review.canSubmitReview}
                title={review.canSubmitReview ? '' : completeness.missing.length ? `还差：${completeness.missing.join('、')}` : '已确认，无需重复提交'}
                onClick={() => onSubmitReview(active.id)}
              >
                <IconCheck /> 提交视觉审查
              </button>
              <button
                type="button"
                className="btn sm"
                disabled={review.status === 'confirmed' || completeness.missing.length > 0}
                title={completeness.missing.length ? `还差：${completeness.missing.join('、')}` : ''}
                onClick={() => onConfirmReview(active.id)}
              >
                <IconCheck /> 确认设定
              </button>
              <button type="button" className="btn sm" disabled={review.status === 'needs_changes'} onClick={() => onRequestChanges(active.id)}>
                <IconAlert /> 标记需修改
              </button>
            </div>
          </div>
        </header>

        {completeness.missing.length > 0 && (
          <p className="character-board-missing" role="status">
            <IconAlert /> 还差 {completeness.missing.length} 项必填才能提交视觉审查：{completeness.missing.join('、')}
          </p>
        )}

        <div className="character-board-tabs" role="tablist" aria-label="视觉设定模块">
          {BOARD_TABS.map((tab) => {
            const group = tab.id === 'assets' ? null : completeness.groups[tab.id as CharacterSpecGroupId];
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                className={activeTab === tab.id ? 'active' : ''}
                title={tab.hint}
                onClick={() => onSelectTab(tab.id)}
              >
                {tabIcon(tab.id)}
                <span>{tab.label}</span>
                {group && group.total > 0 && (
                  <em className={group.done === group.total ? 'done' : ''}>{group.done}/{group.total}</em>
                )}
              </button>
            );
          })}
        </div>

        <div className="character-board-section" role="tabpanel">
          {activeTab === 'assets' && imageWorkspace}

          {activeTab === 'identity' && (
            <>
              <div className="character-section-head">
                <div>
                  <strong>固定身份特征</strong>
                  <p>这些是身份锚点，<b>不可随场景改变</b>。换衣服、换发型、换场景都不允许动到这一组字段。</p>
                </div>
                <button
                  type="button"
                  className={`character-lock-toggle ${identityLocked ? 'locked' : ''}`}
                  aria-pressed={identityLocked}
                  onClick={() => commit((spec) => ({ ...spec, identity: { ...spec.identity, locked: !identityLocked } }),
                    `${identityLocked ? '解锁' : '锁定'}「${active.name}」身份锚点`
                  )}
                >
                  {identityLocked ? <IconLock /> : <IconUnlock />}
                  <span>{identityLocked ? '已锁定' : '未锁定'}</span>
                </button>
              </div>

              <div className="character-view-grid">
                {CHARACTER_VIEW_ANGLES.map((angle) => (
                  <ImageSlot
                    key={angle.id}
                    label={angle.label}
                    hint={angle.hint}
                    imageUrl={spec.identity.views[angle.id]}
                    slotState={slotStates[characterSlotKey(active.id, { kind: 'view', id: angle.id })]}
                    onGenerate={() => onGenerateImage(active.id, { kind: 'view', id: angle.id })}
                    onUpload={(file) => onUploadImage(active.id, { kind: 'view', id: angle.id }, file)}
                    onClear={() => commit((spec) => ({ ...spec, identity: { ...spec.identity, views: { ...spec.identity.views, [angle.id]: '' } } }),
                      `移除「${active.name}」${angle.label}参考图`
                    )}
                  />
                ))}
              </div>
              <p className="character-board-hint">
                四个参考位已就绪 {identityViewCount}/{CHARACTER_VIEW_ANGLES.length}。正脸是身份主锚点，缺它无法提交视觉审查。
              </p>

              {identityLocked && (
                <p className="character-lock-notice" role="status">
                  <IconLock /> 身份锚点已锁定，字段只读。要修改请先解锁——解锁会影响所有已生成的角色图和镜头。
                </p>
              )}

              <div className="character-field-grid">
                {CHARACTER_IDENTITY_FIELDS.map((field) => (
                  <TextField
                    drafts={drafts}
                    setDraft={setDraft}
                    key={field.key}
                    id={`identity-${active.id}-${field.key}`}
                    field={field}
                    disabled={identityLocked}
                    value={(spec.identity as unknown as Record<string, string>)[field.key] || ''}
                    onCommit={(next) => commit((spec) => ({ ...spec, identity: { ...spec.identity, [field.key]: next } }),
                      `更新「${active.name}」${field.label}`
                    )}
                  />
                ))}
              </div>
            </>
          )}

          {activeTab === 'hair' && (
            <>
              <div className="character-section-head">
                <div>
                  <strong>头发设定</strong>
                  <p>发型是最容易漂移的一项。不要只写「黑色长发」，要写到「自然黑色、锁骨下 8cm、中等发量、顺直、四六侧分、无刘海」这个精度。</p>
                </div>
              </div>
              <div className="character-field-grid">
                {CHARACTER_HAIR_FIELDS.map((field) => (
                  <TextField
                    drafts={drafts}
                    setDraft={setDraft}
                    key={field.key}
                    id={`hair-${active.id}-${field.key}`}
                    field={field}
                    disabled={identityLocked}
                    value={(spec.hair as unknown as Record<string, string>)[field.key] || ''}
                    onCommit={(next) => commit((spec) => ({ ...spec, hair: { ...spec.hair, [field.key]: next } }),
                      `更新「${active.name}」${field.label}`
                    )}
                  />
                ))}
              </div>
              <div className="character-field-grid wide">
                <ListField
                  drafts={drafts}
                  setDraft={setDraft}
                  id={`hair-${active.id}-variable`}
                  label="可变发型"
                  values={spec.hair.variableStyles}
                  placeholder="按剧情允许出现的发型，例如：低马尾、丸子头"
                  onCommit={(next) => commit((spec) => ({ ...spec, hair: { ...spec.hair, variableStyles: next } }), `更新「${active.name}」可变发型`)}
                />
                <ListField
                  drafts={drafts}
                  setDraft={setDraft}
                  id={`hair-${active.id}-forbidden`}
                  label="禁止出现的发型"
                  required
                  values={spec.hair.forbiddenStyles}
                  placeholder="例如：齐刘海、大波浪卷、寸头"
                  onCommit={(next) => commit((spec) => ({ ...spec, hair: { ...spec.hair, forbiddenStyles: next } }), `更新「${active.name}」禁止发型`)}
                />
              </div>
            </>
          )}

          {activeTab === 'wardrobe' && (
            <>
              <div className="character-section-head">
                <div>
                  <strong>场景服饰系统</strong>
                  <p>一套衣服走全片撑不住剧情。按场景建立造型方案，每套写清主色盘、必须保留项和禁止出现项。</p>
                </div>
                <span className="character-section-count">{spec.wardrobe.length} 套造型</span>
              </div>

              {missingScenarios.length > 0 && (
                <div className="character-scenario-row">
                  <small>按剧情场景新建：</small>
                  {missingScenarios.map((scenario) => (
                    <button
                      key={scenario.id}
                      type="button"
                      className="character-chip toggle"
                      onClick={() => commit((spec) => ({ ...spec, wardrobe: [...spec.wardrobe, characterWardrobeLookTemplate(scenario.id)] }),
                        `为「${active.name}」新建「${scenario.label}」造型`
                      )}
                    >
                      <IconPlus /> {scenario.label}
                    </button>
                  ))}
                </div>
              )}

              {spec.wardrobe.length === 0 ? (
                <div className="character-board-empty-state inline">
                  <IconShirt />
                  <strong>还没有任何造型方案</strong>
                  <p>先从上面的场景按钮建立一套，再补齐上装、下装和主色盘。</p>
                </div>
              ) : (
                <div className="character-look-grid">
                  {spec.wardrobe.map((look) => (
                    <article className="character-look-card" key={look.id}>
                      <header>
                        <div className="character-look-figure">
                          <FigureSilhouette colors={look.palette.map((item) => characterPaletteSwatch(item).hex).filter(Boolean)} />
                        </div>
                        <div className="character-look-title">
                          <strong>{look.label}</strong>
                          <small>{look.sceneUsage || '适用场景待补充'}</small>
                          <ColorSwatches palette={look.palette} />
                        </div>
                        <button
                          type="button"
                          className="character-look-remove"
                          aria-label={`删除造型 ${look.label}`}
                          onClick={() => commit((spec) => ({ ...spec, wardrobe: spec.wardrobe.filter((item) => item.id !== look.id) }),
                            `删除「${active.name}」的「${look.label}」造型`
                          )}
                        >
                          <IconX />
                        </button>
                      </header>

                      <ImageSlot
                        label={`${look.label}造型参考`}
                        imageUrl={look.imageUrl}
                        aspect="portrait"
                        slotState={slotStates[characterSlotKey(active.id, { kind: 'look', id: look.id })]}
                        onGenerate={() => onGenerateImage(active.id, { kind: 'look', id: look.id })}
                        onUpload={(file) => onUploadImage(active.id, { kind: 'look', id: look.id }, file)}
                        onClear={look.imageUrl ? () => updateLook(look.id, { imageUrl: '' }, `移除「${active.name} · ${look.label}」造型图`) : undefined}
                      />

                      <div className="character-field-grid compact">
                        {CHARACTER_WARDROBE_FIELDS.map((field) => (
                          <TextField
                            drafts={drafts}
                            setDraft={setDraft}
                            key={field.key}
                            id={`look-${active.id}-${look.id}-${field.key}`}
                            field={field}
                            value={(look as unknown as Record<string, string>)[field.key] || ''}
                            onCommit={(next) => updateLook(look.id, { [field.key]: next }, `更新「${active.name} · ${look.label}」${field.label}`)}
                          />
                        ))}
                        <ListField
                          drafts={drafts}
                          setDraft={setDraft}
                          id={`look-${active.id}-${look.id}-palette`}
                          label="主色盘"
                          required
                          values={look.palette}
                          placeholder="例如：燕麦色 #d8cbb3、米白"
                          onCommit={(next) => updateLook(look.id, { palette: next }, `更新「${active.name} · ${look.label}」主色盘`)}
                        />
                        <ListField
                          drafts={drafts}
                          setDraft={setDraft}
                          id={`look-${active.id}-${look.id}-must`}
                          label="必须保留项"
                          values={look.mustKeep}
                          placeholder="例如：细银圈耳钉、机械表"
                          onCommit={(next) => updateLook(look.id, { mustKeep: next }, `更新「${active.name} · ${look.label}」必须保留项`)}
                        />
                        <ListField
                          drafts={drafts}
                          setDraft={setDraft}
                          id={`look-${active.id}-${look.id}-forbidden`}
                          label="禁止出现项"
                          values={look.forbidden}
                          placeholder="例如：其他颜色外套、logo 图案"
                          onCommit={(next) => updateLook(look.id, { forbidden: next }, `更新「${active.name} · ${look.label}」禁止出现项`)}
                        />
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}

          {activeTab === 'expressions' && (
            <>
              <div className="character-section-head">
                <div>
                  <strong>表情状态库</strong>
                  <p>同一张脸、不同表情。表情只能改变眉、眼、嘴，不允许因为换表情就换了骨相、发型或肤色。</p>
                </div>
                <span className="character-section-count">已描述 {describedExpressions}/{CHARACTER_EXPRESSION_SLOTS.length}</span>
              </div>

              <div className="character-expression-board">
                {expressionSlots.map((slot) => {
                  const preset = CHARACTER_EXPRESSION_SLOTS.find((item) => item.id === slot.id);
                  return (
                    <article className="character-expression-card" key={slot.id}>
                      <ImageSlot
                        label={slot.label}
                        hint={preset?.prompt}
                        imageUrl={slot.imageUrl}
                        aspect="square"
                        slotState={slotStates[characterSlotKey(active.id, { kind: 'expression', id: slot.id })]}
                        onGenerate={() => onGenerateImage(active.id, { kind: 'expression', id: slot.id })}
                        onUpload={(file) => onUploadImage(active.id, { kind: 'expression', id: slot.id }, file)}
                        onClear={slot.imageUrl ? () => updateExpression(slot.id, { imageUrl: '' }, `移除「${active.name} · ${slot.label}」表情图`) : undefined}
                      />
                      <div className="character-intensity">
                        <label htmlFor={`intensity-${active.id}-${slot.id}`}>情绪强度</label>
                        <input
                          id={`intensity-${active.id}-${slot.id}`}
                          type="range"
                          min={0}
                          max={5}
                          step={1}
                          value={slot.intensity}
                          onChange={(event) => updateExpression(
                            slot.id,
                            { intensity: Number(event.target.value), label: slot.label },
                            `更新「${active.name} · ${slot.label}」情绪强度`
                          )}
                        />
                        <output htmlFor={`intensity-${active.id}-${slot.id}`}>
                          {slot.intensity ? `${slot.intensity}/5` : '未设定'}
                        </output>
                      </div>
                      <div className="character-field-grid compact">
                        {CHARACTER_EXPRESSION_FIELDS.map((field) => (
                          <TextField
                            drafts={drafts}
                            setDraft={setDraft}
                            key={field.key}
                            id={`expression-${active.id}-${slot.id}-${field.key}`}
                            field={field}
                            value={(slot as unknown as Record<string, string>)[field.key] || ''}
                            onCommit={(next) => updateExpression(
                              slot.id,
                              { [field.key]: next, label: slot.label },
                              `更新「${active.name} · ${slot.label}」${field.label}`
                            )}
                          />
                        ))}
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          )}

          {activeTab === 'shooting' && (
            <>
              <div className="character-section-head">
                <div>
                  <strong>镜头与生成约束</strong>
                  <p>这些约束会直接进入角色图和镜头提示词。禁止漂移项写得越具体，后面越不容易出现「换了一个人」。</p>
                </div>
              </div>

              <div className="character-switch-row">
                {([
                  { key: 'allowFrontFace', label: '允许正脸', hint: '关闭后只用背影、侧影和过肩' },
                  { key: 'allowFullBody', label: '允许全身出镜', hint: '关闭后保持半身及以上景别' },
                  { key: 'voiceOnly', label: '只有声音', hint: '打开后这个角色完全不进画面' }
                ] as const).map((item) => {
                  const on = spec.shooting[item.key];
                  return (
                    <button
                      key={item.key}
                      type="button"
                      className={`character-switch ${on ? 'on' : ''}`}
                      role="switch"
                      aria-checked={on}
                      onClick={() => commit((spec) => ({ ...spec, shooting: { ...spec.shooting, [item.key]: !on } }),
                        `更新「${active.name}」${item.label}`
                      )}
                    >
                      <span className="character-switch-track"><i /></span>
                      <span className="character-switch-text">
                        <strong>{item.label}</strong>
                        <small>{item.hint}</small>
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="character-field-grid wide">
                <PresetChips
                  label="可使用的拍摄角度"
                  required
                  presets={CHARACTER_CAMERA_ANGLE_PRESETS}
                  values={spec.shooting.cameraAngles}
                  onToggle={(next) => commit((spec) => ({ ...spec, shooting: { ...spec.shooting, cameraAngles: next } }), `更新「${active.name}」拍摄角度`)}
                />
                <PresetChips
                  label="景别范围"
                  required
                  presets={CHARACTER_SHOT_SIZE_PRESETS}
                  values={spec.shooting.shotSizes}
                  onToggle={(next) => commit((spec) => ({ ...spec, shooting: { ...spec.shooting, shotSizes: next } }), `更新「${active.name}」景别范围`)}
                />
                <PresetChips
                  label="必须保持的身份锚点"
                  required
                  presets={CHARACTER_IDENTITY_ANCHOR_PRESETS}
                  values={spec.shooting.identityAnchors}
                  onToggle={(next) => commit((spec) => ({ ...spec, shooting: { ...spec.shooting, identityAnchors: next } }), `更新「${active.name}」身份锚点`)}
                />
                <PresetChips
                  label="禁止漂移项"
                  required
                  presets={CHARACTER_DRIFT_BAN_PRESETS}
                  values={spec.shooting.driftBans}
                  onToggle={(next) => commit((spec) => ({ ...spec, shooting: { ...spec.shooting, driftBans: next } }), `更新「${active.name}」禁止漂移项`)}
                />
              </div>
            </>
          )}

          {activeTab === 'signature' && (
            <>
              <div className="character-section-head">
                <div>
                  <strong>视觉辨识度</strong>
                  <p>即使不露正脸，也要能靠头型、肩线、色盘和标志性道具把这个人和其他角色区分开。</p>
                </div>
              </div>
              <div className="character-field-grid">
                <TextField
                  drafts={drafts}
                  setDraft={setDraft}
                  id={`tagline-${active.id}`}
                  field={{ key: 'tagline', label: '一句话定位', required: false, placeholder: '例如：把体面撑到最后一刻的前任' }}
                  value={spec.tagline}
                  onCommit={(next) => commit((spec) => ({ ...spec, tagline: next }), `更新「${active.name}」一句话定位`)}
                />
                <ListField
                  drafts={drafts}
                  setDraft={setDraft}
                  id={`tags-${active.id}`}
                  label="核心标签（2–3 个）"
                  values={spec.tags}
                  placeholder="例如：克制、体面、疲惫"
                  onCommit={(next) => commit((spec) => ({ ...spec, tags: next.slice(0, 3) }), `更新「${active.name}」核心标签`)}
                />
                <TextField
                  drafts={drafts}
                  setDraft={setDraft}
                  id={`signature-${active.id}-silhouette`}
                  field={{ key: 'silhouette', label: '身材轮廓', required: true, placeholder: '例如：肩线挺直、上宽下窄' }}
                  value={spec.signature.silhouette}
                  onCommit={(next) => commit((spec) => ({ ...spec, signature: { ...spec.signature, silhouette: next } }), `更新「${active.name}」身材轮廓`)}
                />
                <TextField
                  drafts={drafts}
                  setDraft={setDraft}
                  id={`signature-${active.id}-color`}
                  field={{ key: 'primaryColor', label: '主服装色', required: true, placeholder: '例如：炭灰色 #3a3f45' }}
                  value={spec.signature.primaryColor}
                  onCommit={(next) => commit((spec) => ({ ...spec, signature: { ...spec.signature, primaryColor: next, primaryColorHex: characterPaletteSwatch(next).hex } }),
                    `更新「${active.name}」主服装色`
                  )}
                />
                <ListField
                  drafts={drafts}
                  setDraft={setDraft}
                  id={`signature-${active.id}-props`}
                  label="标志性道具"
                  required
                  values={spec.signature.props}
                  placeholder="例如：机械表、旧钱包、手机"
                  onCommit={(next) => commit((spec) => ({ ...spec, signature: { ...spec.signature, props: next } }), `更新「${active.name}」标志性道具`)}
                />
                <TextField
                  drafts={drafts}
                  setDraft={setDraft}
                  id={`signature-${active.id}-rule`}
                  field={{ key: 'faceVisibilityRule', label: '正脸/背影规则', required: true, placeholder: '例如：只用背影和过肩，不给正脸', multiline: true }}
                  value={spec.signature.faceVisibilityRule}
                  onCommit={(next) => commit((spec) => ({ ...spec, signature: { ...spec.signature, faceVisibilityRule: next } }), `更新「${active.name}」正脸背影规则`)}
                />
              </div>
              <div className="character-signature-preview">
                <FigureSilhouette colors={[characterPaletteSwatch(spec.signature.primaryColor).hex].filter(Boolean)} />
                <div>
                  <small>当前辨识组合</small>
                  <p>
                    {[spec.identity.faceShape, spec.hair.baseStyle, spec.signature.silhouette, spec.signature.primaryColor]
                      .filter(Boolean)
                      .join(' · ') || '还没有可用于区分角色的特征，先补齐脸型、发型、轮廓和主色。'}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <section className="character-board-matrix" aria-label="全员视觉辨识度对比矩阵">
        <header>
          <div>
            <strong>全员视觉辨识度矩阵</strong>
            <p>把所有角色摆在一起看。撞车的字段会标红——即使都不露正脸，也必须靠头型、肩线、色盘和道具区分。</p>
          </div>
          <span className="character-section-count">{rows.length} 个角色</span>
        </header>

        {conflicts.length > 0 && (
          <ul className="character-matrix-conflicts" role="status">
            {conflicts.map((conflict) => (
              <li key={`${conflict.field}-${conflict.value}`}>
                <IconAlert />
                <span><b>{conflict.names.join(' / ')}</b> 的{conflict.label}都是「{conflict.value}」，在背影和远景里分不出谁是谁。</span>
              </li>
            ))}
          </ul>
        )}

        <div className="character-matrix-scroll">
          <table className="character-matrix-table">
            <thead>
              <tr>
                <th scope="col">角色</th>
                <th scope="col">脸型</th>
                <th scope="col">头型与发型</th>
                <th scope="col">身材轮廓</th>
                <th scope="col">主服装色</th>
                <th scope="col">标志性道具</th>
                <th scope="col">正脸/背影规则</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const clash = (field: string, value: string) =>
                  conflicts.some((item) => item.field === field && item.names.includes(row.name) && item.value === value);
                const cell = (value: string, field: string) => (
                  <td className={clash(field, value) ? 'clash' : ''}>
                    {value || <span className="character-board-empty-inline">未设定</span>}
                  </td>
                );
                return (
                  <tr key={row.id} className={row.id === active.id ? 'active' : ''}>
                    <th scope="row">
                      <button type="button" onClick={() => onSelectCharacter(row.id)}>
                        {row.name}
                        <small>{row.role || '角色'}</small>
                      </button>
                    </th>
                    {cell(row.faceShape, 'faceShape')}
                    {cell(row.headAndHair, 'headAndHair')}
                    {cell(row.silhouette, 'silhouette')}
                    <td className={clash('primaryColor', row.primaryColor) ? 'clash' : ''}>
                      {row.primaryColor ? (
                        <span className={`character-swatch ${row.primaryColorHex ? '' : 'unknown'}`}>
                          <i style={row.primaryColorHex ? { background: row.primaryColorHex } : undefined} />
                          {row.primaryColor}
                        </span>
                      ) : <span className="character-board-empty-inline">未设定</span>}
                    </td>
                    <td className={row.props.some((prop) => clash('props', prop)) ? 'clash' : ''}>
                      {row.props.length ? row.props.join('、') : <span className="character-board-empty-inline">未设定</span>}
                    </td>
                    {cell(row.faceVisibilityRule, 'faceVisibilityRule')}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
