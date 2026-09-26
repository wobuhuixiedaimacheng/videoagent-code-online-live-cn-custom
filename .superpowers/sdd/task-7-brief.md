### Task 7: 把画板改成渐进式主工作区

**Files:**
- Create: `components/ProductionCanvas.tsx`
- Modify: `app/page.tsx`
- Modify: `app/globals.css`
- Modify: `app/page.model-config-ui.test.cjs`

- [ ] **Step 1: 写渐进画板失败测试**

```js
test('future stages are disabled and absent from the canvas', () => {
  assert.match(source, /canOpenProductionStage\(productionFlow, stage\.id\)/);
  assert.match(source, /disabled=\{!stageOpen\}/);
  assert.match(source, /未解锁/);
  assert.match(source, /visibleProductionStages\(productionFlow\)/);
  assert.match(source, /visibleCanvasNodes/);
});

test('the canvas owns visible assets instead of a duplicate proof strip below it', () => {
  assert.match(source, /<ProductionCanvas/);
  assert.doesNotMatch(source, /className="asset-proof-strip"/);
  assert.match(canvasSource, /production-stage-review/);
  assert.match(canvasSource, /production-next-skeleton/);
});

test('every stage has one primary confirmation action', () => {
  for (const label of [
    '确认脚本并生成角色',
    '确认角色并生成场景',
    '确认场景并生成分镜',
    '确认分镜并生成视频任务',
    '确认视频任务并开始生成'
  ]) assert.match(source, new RegExp(label));
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test app/page.model-config-ui.test.cjs`

Expected: FAIL，未来标签仍可点击且 `asset-proof-strip` 仍存在。

- [ ] **Step 3: 实现 `ProductionCanvas` 布局边界**

组件只负责布局和可访问性，不持有生产状态：

```tsx
import type { ReactNode } from 'react';
import type { ProductionStageId, ProductionStageStatus } from '../lib/types';

export type ProductionCanvasNode = {
  id: string;
  stage: ProductionStageId;
  title: string;
  summary: string;
  status: ProductionStageStatus;
  itemCount?: number;
};

type ProductionCanvasProps = {
  nodes: ProductionCanvasNode[];
  activeStage: ProductionStageId;
  nextGeneratingStage: ProductionStageId | null;
  reviewContent: ReactNode;
  onSelectNode: (node: ProductionCanvasNode) => void;
  onRegenerate: (node: ProductionCanvasNode) => void;
  onReplace: (node: ProductionCanvasNode) => void;
};

export default function ProductionCanvas(props: ProductionCanvasProps) {
  return (
    <section className="production-canvas" aria-label="渐进式视频生产画板">
      <div className="production-canvas-track">
        {props.nodes.map((node) => (
          <article className={`production-node ${node.status}`} key={node.id}>
            <button type="button" className="production-node-main" onClick={() => props.onSelectNode(node)}>
              <span>{node.stage}</span>
              <strong>{node.title}</strong>
              <small>{node.summary}</small>
              {typeof node.itemCount === 'number' && <em>{node.itemCount} 项</em>}
            </button>
            <div className="production-node-actions">
              <button type="button" onClick={() => props.onRegenerate(node)} aria-label={`重新生成${node.title}`}>重新生成</button>
              <button type="button" onClick={() => props.onReplace(node)} aria-label={`替换${node.title}`}>替换</button>
            </div>
          </article>
        ))}
        {props.nextGeneratingStage && (
          <div className="production-next-skeleton" role="status">
            <span>{props.nextGeneratingStage}</span>
            <strong>生成中</strong>
          </div>
        )}
      </div>
      <section className="production-stage-review" aria-live="polite">
        {props.reviewContent}
      </section>
    </section>
  );
}
```

- [ ] **Step 4: 锁定顶部导航和画板节点**

`overview` 始终可进入；生产阶段按钮按 `canOpenProductionStage` 设置 `disabled`、`aria-disabled` 和锁定原因。画板节点只来自 `visibleProductionStages(flow)`；当前阶段生成时显示骨架，未来阶段不渲染节点。

- [ ] **Step 5: 移除重复长文区**

删除 `asset-proof-strip` 和主画板下方独立的长脚本/审批区。脚本全文、角色图、场景图、分镜卡和视频任务作为 `reviewContent` 进入画板；Patch Diff、依赖版本、日志和模型规格继续留在右侧检查器。

- 脚本阶段使用可编辑 `textarea` 显示完整正文；“保存修改”生成或替换 `script.md` 待审 Patch，不直接写入确认版本。
- 角色阶段复用现有 Face ID、年龄、多视角、表情和图片操作，并把唯一主确认按钮放在阶段底部操作条。
- 场景阶段显示图片、地点、时间、光线、色彩、出场角色和对应脚本段落。
- 分镜阶段每卡显示脚本段落、角色、场景、景别、运镜、动作、对白、时长和首帧引用。
- 右侧检查器增加 `confirmedVersion`、`confirmedAt`、`confirmedBy` 和 `sourceVersions`，高级用户可以看 Diff，但不能绕过阶段确认门。

- [ ] **Step 6: 调整 CSS 尺寸**

- `.production-canvas` 最小高度使用 `calc(100vh - var(--topbar-h) - 48px)`。
- 当前阶段资产区使用稳定的 `minmax()` 网格；角色和场景图片使用 `aspect-ratio`。
- 卡片圆角不超过 8px；画板背景保留深色网格但降低装饰噪声。
- 1024px 以下导航横向滚动，720px 以下阶段资产单列，按钮文字允许换行且不覆盖。
- 生成骨架固定尺寸，状态变化不得推动整个布局跳动。

- [ ] **Step 7: 运行测试**

Run: `node --test app/page.model-config-ui.test.cjs`

Expected: PASS，锁定导航、渐进节点、单一确认按钮和主画板资产均有源码回归。

- [ ] **Step 8: 记录检查点**

```bash
git add components/ProductionCanvas.tsx app/page.tsx app/globals.css app/page.model-config-ui.test.cjs
git commit -m "feat: make the production canvas progressive"
```

