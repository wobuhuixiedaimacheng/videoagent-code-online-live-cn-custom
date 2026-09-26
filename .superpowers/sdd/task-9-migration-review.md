# Task 9 迁移与缓存独立审查

## 结论

**Not Clean。发现 2 个 Critical、6 个 Important、1 个 Minor。**

迁移后的静态 workspace 数据大部分完整，版本化 demo key 也确实绕开旧 `xiaopeng-v2` 缓存；但当前正常阶段生成会覆盖这批完整数据，并产出可被宽松 validator 接受、却不能完成最终确认的下游文件。现有 route/page 绿灯没有覆盖这些行为。

## Critical

### C1. 分镜 fallback 会把完整迁移数据覆盖成缺少审查字段的 12 条记录

**证据**

- `lib/agentProvider.ts:1026-1044` 的 `storyboardFor()` 在 storyboard 阶段只写 `id/title/start/end/durationSeconds/narration/visual/subtitle/scriptSegment`。
- 它不写 `characterIds/sceneId/shotSize/cameraMove/action/dialogue/firstFrameReference/referenceImageUrl`。
- `lib/agentProvider.ts:1413-1417` 的 `hasStoryboardDraft()` 和 `lib/productionAssets.ts:415-423` 的确认 validator 都只检查正数时长。
- 对当前迁移 workspace 直接运行强制 mock 阶段生成，得到 12 条分镜，但上述 8 个审查字段在 12 条中全部缺失。
- `app/page.tsx:4792-4805` 会用场景或全局设置补显示值，`app/page.tsx:4813-4815` 仍允许确认，因此 UI 会掩盖真实 JSON 的缺字段。

**影响**

用户确认场景后，正常 fallback 会覆盖当前已经完整的 `storyboard.json`；缺字段数据仍可进入已确认状态，并继续污染视频阶段。迁移种子本身完整不能抵消这个运行时覆盖。

**修复方向**

让 storyboard fallback 保留并生成全部审查字段；模型响应 validator 和最终确认 validator 必须校验同一完整契约，不能只校验时长。

### C2. 视频 fallback 生成 12 个无参考图任务，最终确认必然被拒绝

**证据**

- `lib/agentProvider.ts:1189-1205` 生成 prompts/renderQueue 时没有写 `referenceImageUrl` 或 `referenceImages`。
- `lib/agentProvider.ts:1426-1439` 的 `hasVideoTaskPackage()` 只检查数量、`type=video` 和角色一致性，不检查每镜参考图。
- 对当前迁移 workspace 直接运行强制 mock 视频阶段，结果为 12 prompts、12 queue、prompts 带参考图 0 条、queue 带参考图 0 条。
- `app/page.tsx:3405-3419` 在最终确认时明确拒绝任何缺少参考图的 prompt。

**影响**

确认分镜后，正常 mock/fallback 会用无参考图的新 `asset_prompts.json` 覆盖迁移中原本带参考图的 12 条任务，然后最终确认被客户端阻断。在线模型只要返回数量正确但无 refs 的包，也会被服务端错误接受。当前浏览器 QA 注入的是旧的完整 fixture，所以绕过了这条真实 fallback 路径。

**修复方向**

从已确认 storyboard 的 `firstFrameReference/referenceImageUrl` 映射到每个 video prompt 和 queue；服务端校验每镜唯一 ID、scene 关联、正时长和至少一张参考图；增加实际 `/api/agent/run` 输出到最终确认的回归测试。

## Important

### I1. 分镜审查 UI 只显示 8/12 个真实资产

- `lib/workspace.ts:646-665` 的 `sceneAssets()` 固定 `.slice(0, 8)`。
- `lib/workspace.ts:669-683` 的 `storyboardScenes()` 只要存在 `scenes.json` 就直接返回这个 8 条结果，而不是读取完整 storyboard。
- `app/page.tsx:2360` 和 `app/page.tsx:4789-4810` 因此只渲染前 8 张分镜卡。
- 实际浏览器 QA 失败：`storyboard-card-count expected=12 actual=8`。报告在 `/tmp/task9-qa-review/videoagent-flow-regression.json`。

用户看不到第 9-12 镜，却可以点击确认分镜。这是明确的审查完整性缺陷。

### I2. 客户端不要求本轮存在阶段 patch，旧下游文件可被零 patch 响应直接复用

- `app/page.tsx:1968-1986` 对非图片阶段在成功 HTTP 响应后直接 `completeStageGeneration()`，没有要求 `scopedPatches` 非空或输出文件版本变化。
- 角色/场景路径也会在已有迁移图片使 `missing*ImageJobs()` 为空时完成阶段。
- 用当前 workspace 做直接交易模拟，四个下游阶段均可在 `applied=0` 的情况下依次变成 `confirmed`。

服务端通常会补 fallback patch，但客户端没有这个可信边界。任何成功但空/错阶段响应都能让迁移旧文件替代本轮产出，违反“未来阶段不能因已有下游文件跳过”。应要求本 generation job 产生至少一个有效阶段输出，或记录并核验明确的本轮产物 provenance。

### I3. prompts 与 renderQueue 使用不同 ID，参考图替换和“重新准备”会留下脏数据

- 当前 seed 的 prompt ID 为 `xp_v2_*`，queue ID 为 `render_01..12`；直接数据检查得到 ID 匹配数 0/12。
- fallback 同样生成 `prompt_01..12` 与 `render_01..12`，不是 seed 特例。
- `app/page.tsx:3347-3363` 用 `queue.item.id === promptId` 查找任务，找不到时会为同一 scene 追加第二条 queue。
- `app/page.tsx:3387-3395` 的参考图替换也按同一错误 ID 匹配，导致 prompt 已更新而原 queue 仍保留旧 reference。

当前 renderer 主要读取 prompts，所以不一定立即阻断提交；但 workspace 包会出现重复 queue 或相互矛盾的 refs，属于可持续污染。

### I4. 版本键本身正确，但 demo 的“新建/重置”交互会把空项目持久化到 seed key，且恢复入口不可达

- `app/page.tsx:995-1004` 的 key 行为正确：普通项目不变，`xiaopeng-v2` 使用 `progressive-v1`，其他 demo 使用原键。
- `app/page.tsx:1574-1584` 只要 URL 仍有 `?demo=...`，任何新 workspace 都写入 demo key。
- `app/page.tsx:2128-2157` 的“新建”会创建 blank workspace，但不会移除 demo query；随后 blank workspace 覆盖版本化 seed 缓存，刷新时又在 `app/page.tsx:1485-1498` 被优先恢复。
- “重置 Demo”按钮只位于 `focusMode` 分支 `app/page.tsx:4169-4173`。已加载 demo 有输出，进入 studio 分支；studio 顶栏 `app/page.tsx:4388-4390` 只有“新建”，没有“重置 Demo”。新建 blank 后又进入 home 分支，仍看不到重置按钮。

因此 helper 能删除正确 key，但用户在实际 demo 页面没有稳定入口调用它。应让 demo 新建退出 demo URL/改写普通项目 key，并在 studio/home 都提供可达的重置入口。

### I5. 可见脚本满足 180 秒、12 段和无拉丁字母，但“每阶段完整恋爱弧”未被内容证明

- 数据检查：12 个 `### NN｜` 段、总计 180 秒、拉丁字母 0。
- 脚本自述每阶段应包含“相识或靠近、误会或冲突、补救、阶段结果”。
- 实际阶段标签中：幼儿园为“相识”+“误会和结果”，小学为“相识和靠近”+“冲突和结果”，高中为“靠近”+“冲突”+“阶段结果”；三者都没有明确补救段。小学阶段总结还是“尴尬收场”，没有补救动作。
- `app/api/demo-workspace/[id]/route.test.cjs:49-52` 只检查字母、段数和时长声明，没有检查五阶段弧线。

若“完整弧”允许隐含补救，需要在验收标准中明确；按当前脚本自己的四步定义，至少小学阶段不满足。

### I6. 指定测试真实运行，但新增断言不足以防止本次关键回归

- route test 是真实执行，`node 'app/api/demo-workspace/[id]/route.test.cjs'` 得到 2/2 pass；但它只检查视频 prompt 数量和 MP4 数量，不检查 prompt refs、queue ID 对齐、5 PNG、checksum、workspace 无媒体内嵌，也不检查 Face ID 锚点和 canonical 表情集合。
- page test 从 `app/page.model-config-ui.test.cjs:6` 开始只读取源码文本；缓存用例 `app/page.model-config-ui.test.cjs:180-193` 全是 regex，既不执行 key helper，也不渲染 reset 按钮。它在实际 reset 不可达时仍为绿灯。
- `node --test` 的 155/155 pass 证明 glob/发现机制正常，不证明这些行为已覆盖。
- 当前浏览器 QA 是有效测试，并准确抓到了 8/12 分镜卡回归；不能用 route/page 的绿灯替代它。

## Minor

### M1. `stage_partners` 的可选角色记录内部引用不自洽

`characters.json` 中 `stage_partners.required=false`，但 `faceAnchorVariantId=college` 时 `variants=[]`，同时 `expressionIds=[]`；12 个 scenes/storyboard 又都引用它。`app/page.tsx:2411-2443` 会静默合成一个 `base` 占位变体，所以不会崩溃，但 UI 展示的 Face ID 不是 JSON 中真实可解析的锚点。若该角色只是关系占位，应从 character refs 中移除或明确标为非视觉角色；若要参与画面，应补齐可用变体。

## 已确认通过

- 当前 `production_flow.json` 只有 script 可见：script=`ready_for_review`、`draftVersion=2`，其余四阶段 locked，`videoJobs=[]`。
- 对真实 workspace 调用 `confirmStageInWorkspace()`：已提交 script 可在无 pending patch 时正常确认，只启动 character generation，script 资产不被重写。
- 当前 characters/scenes/storyboard 静态数据可被 parser 读取：小澎 5 variants、Face ID 锚点存在、12 canonical expressions；12 scenes 和 12 storyboard 的迁移字段齐全，三组时长均为 180 秒。
- 当前 seed 有 12 个 video prompts、12 个 refs、12 个 queue scene 关联；问题在 ID 一致性和后续 fallback 覆盖。
- workspace JSON 为 131872 bytes，无 clip path、MP4/data URL/base64 视频内嵌；文件 version 均为正整数，时间戳可解析，迁移文件版本为 1→2 或新增 v1。
- 12 MP4 与 5 PNG 共 17 个 SHA-256 与 `.superpowers/sdd/task-9-before/media-sha256.txt` 完全一致。
- 缓存 helper 实际结果：普通项目 `videoagent-workspace:<id>`；小澎 `videoagent-demo-workspace:xiaopeng-v2:progressive-v1`；其他 demo 保持 `videoagent-demo-workspace:<id>`；旧小澎 key 被绕开。

## 验证记录

```text
node 'app/api/demo-workspace/[id]/route.test.cjs'              2 passed, 0 failed
node --test app/page.model-config-ui.test.cjs                 58 passed, 0 failed
node --test                                                   155 passed, 0 failed
npm run typecheck                                             exit 0
QA_BASE_URL=http://127.0.0.1:3001 npm run qa:flow -- --out /tmp/task9-qa-review
                                                              FAIL: storyboard cards 8/12
                                                              12 video POST, max concurrency 2
                                                              0 runtime exceptions, 0 failed requests
forced-mock stage data audit                                  storyboard 12/12 缺 8 个审查字段
                                                              video refs 0/12
media SHA-256 diff                                            exact match, 17/17
```

审查工作区没有 `.git` 元数据，因此变更边界以用户提供的 before 文件和 `task-9-migration-review.diff` 为准。审查期间 `scripts/qa/videoagent-flow-regression.cjs` 被外部并发任务更新；本审查未修改或回退该文件，浏览器 QA 使用的是更新后的当前版本。除本报告外未修改业务文件。
