# Task 3 Report

## 改动

- `lib/types.ts`：新增规范化角色变体、角色文件和场景资产类型。
- `lib/productionAssets.ts`：新增工作区资产读取、旧 `asset_prompts.json` 迁移、角色/场景/分镜确认前校验，以及角色变体和场景图片替换函数。
- `lib/defaultWorkspace.ts`：空工作区新增全阶段锁定的 `production_flow.json`；不预建 `characters.json` 或 `scenes.json`。
- `lib/productionAssets.test.cjs`：覆盖真实“小澎”旧工作区迁移、按 `sceneId` 场景引用补齐、缺图/无时长阻断和空工作区初始化。

迁移保留原 `asset_prompts.json` 内容不变。fixture 中的 `xiaopeng` 生成 `kindergarten`、`primary`、`middle`、`high`、`college` 五个变体，均带可见主图；12 个场景均按 `sceneId` 获得参考主图。

## RED / GREEN

- RED：`node --test lib/productionAssets.test.cjs` 失败。`productionAssets.ts` 不存在，且空工作区缺少 `production_flow.json`，符合预期。
- 首次 GREEN 尝试发现实际 fixture 提示词都包含完整五阶段一致性文本，导致全量文本匹配总是选中“幼儿园”。已改为优先匹配 `renderTask`，仅在其缺失时读取提示词前两行。
- GREEN：聚焦资产测试全部通过。

## 命令结果

```text
node --test lib/productionAssets.test.cjs lib/productionFlow.test.cjs
17 passed, 0 failed

npm run typecheck
exit 0

fixture migration proof
asset_prompts preserved; 5 stage images and 12 scene references present
```

## 风险与未完成项

- 当前迁移针对本任务规定的五个中文年龄阶段和 `sceneId`/`renderTask`/`referenceImageUrl` 旧格式；未知旧格式会保留为空并由确认前校验阻断，而不是伪造资产完成状态。
- 本任务只实现 `validateStageAssets` 校验边界。实际确认动作的调用接线属于后续任务的允许文件范围，未在此任务中修改。
- 未执行 Git add/commit：该工作区不是 Git 仓库，且任务明确要求不提交。

## Review Fixes

- 已阻止空 `characters`、`scenes`、`storyboard` 数组通过确认前校验；角色列表还要求至少一个 `required` 角色。
- 迁移按 JSON 语义比较后才写入，重复迁移直接返回原 workspace，不再递增版本或刷新时间戳。
- 角色图片替换只写 `characters.json`，场景图片替换只写 `scenes.json`。未知目标或相同 URL 返回原 workspace；角色替换保留顶层、角色和变体的未知扩展字段。
- 读取边界已区分文件缺失与 JSON 损坏。损坏的 `characters.json`/`scenes.json` 原样保留，迁移不再以 legacy 内容覆盖；确认前校验返回明确的“无法解析”错误。
- 移除 `xiaopeng` 主角硬编码。迁移优先选择 `primarySubject`，其次明确主角标志，最后才稳定选择去重后的首角色；`characters` 与 `roles` 按 id 或规范化 name 去重。
- 未执行审查 Finding 5：计划 line 654 与 Task 9 明确要求继续用 prompt 的 `sceneId`、`renderTask`、`referenceImageUrl` 迁移并保留现有五个年龄参考图。引入不存在的 `assetRole` 会破坏该规格和真实 fixture。

### Review RED / GREEN

- RED：新增 9 组回归测试后，空数组、重复迁移、替换的无关写入、损坏 JSON 覆盖、角色去重/主角选择和未知字段丢失均可复现。
- GREEN：`node --test lib/productionAssets.test.cjs` 通过 14/14。

### Review Verification

```text
node --test lib/productionAssets.test.cjs lib/productionFlow.test.cjs
26 passed, 0 failed

npm run typecheck
exit 0
```

## Final Review Fix

- `legacyCharacters` 现在同时维护规范化 id 与 name 索引。同 id 一定合并；同 name 仅在至少一方没有 id 时合并，避免折叠两个不同的具名 id 角色。
- 合并记录优先保留带 id 的记录；同等身份时优先字段更完整的记录，并以另一条记录补齐空字段。
- 新增“`characters` 带 id + `roles` 同名无 id”回归：确认只生成一个角色，保留 id、`characters` 的描述/一致性字段和 `roles` 的角色/负面提示字段。

```text
RED: node --test lib/productionAssets.test.cjs
same-name idless role produced 2 characters instead of 1

GREEN: node --test lib/productionAssets.test.cjs lib/productionFlow.test.cjs
27 passed, 0 failed

npm run typecheck
exit 0
```
