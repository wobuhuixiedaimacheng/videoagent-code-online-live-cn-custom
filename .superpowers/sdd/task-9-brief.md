### Task 9: 迁移“小澎”演示项目并增加浏览器流程验收

**Files:**
- Modify: `outputs/xiaopeng-love-history-3min-v2/workspace.json`
- Modify: `app/api/demo-workspace/[id]/route.test.cjs`
- Modify: `scripts/qa/videoagent-flow-regression.cjs`
- Modify: `app/page.tsx`
- Modify: `app/page.model-config-ui.test.cjs`

- [ ] **Step 1: 写演示迁移失败测试**

在 route test 中增加：

```js
const paths = body.workspace.files.map((file) => file.path);
assert.ok(paths.includes('production_flow.json'));
assert.ok(paths.includes('characters.json'));
const flow = JSON.parse(body.workspace.files.find((file) => file.path === 'production_flow.json').content);
assert.equal(flow.stages.script.status, 'ready_for_review');
assert.equal(flow.stages.character.status, 'locked');
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test 'app/api/demo-workspace/[id]/route.test.cjs'`

Expected: FAIL，演示工作区尚未包含两个新文件。

- [ ] **Step 3: 执行确定性迁移**

使用 `migrateLegacyProductionAssets()` 生成 `characters.json` 和增强场景引用；补齐场景卡需要的地点、时间、光线、色彩和角色字段，并让主角保留五个年龄变体与十二种可选表情。写入初始流程：脚本 `ready_for_review`，角色/场景/分镜/视频 `locked`，不把已有下游文件误标为已确认。保留 12 个视频任务、5 个年龄参考图和现有 12 个 clip 文件，不重新生成媒体。

给 demo 本地缓存增加明确的 progressive seed 版本，旧的 `xiaopeng-v2` localStorage 不能遮住新迁移工作区；普通用户项目缓存键不变。

- [ ] **Step 4: 扩展浏览器 QA**

`scripts/qa/videoagent-flow-regression.cjs` 增加无需真实模型的 demo 检查：

1. 打开 `/?demo=xiaopeng-v2`。
2. 断言脚本全文可见。
3. 断言角色、场景、分镜、视频导航为 disabled。
4. 点击“确认脚本并生成角色”前拦截 `/api/agent/run`，返回固定 `characters.json` Patch。
5. 断言角色节点出现，角色图片和表情控制可见，场景仍锁定。
6. 依次返回固定场景、分镜和视频任务 Patch，验证每次只解锁下一阶段。
7. 在视频任务确认前拦截并断言 `/api/video/render` 调用次数为 0。
8. 点击最终确认后仍用拦截响应验证 12 个逐镜 job 被创建，最大并发不超过 2；全程不能调用真实模型、图片或视频服务。
9. 截取桌面 1440×1000 和移动 390×844 两张图，检查没有水平溢出或按钮重叠。

- [ ] **Step 5: 运行演示和浏览器验收**

Run: `node --test 'app/api/demo-workspace/[id]/route.test.cjs'`

Expected: PASS。

Run: `QA_BASE_URL=http://127.0.0.1:3001 npm run qa:flow -- --out outputs/qa-progressive-flow`

Expected: PASS，并生成桌面/移动截图和 JSON 报告；控制台无未处理异常。

- [ ] **Step 6: 记录检查点**

```bash
git add outputs/xiaopeng-love-history-3min-v2/workspace.json 'app/api/demo-workspace/[id]/route.test.cjs' scripts/qa/videoagent-flow-regression.cjs
git commit -m "test: cover progressive production flow"
```
