# VideoAgent 脚本重新生成上下文修复设计

日期：2026-07-12  
状态：修复边界已口头批准，待用户复核书面规格  
适用范围：脚本阶段的初次生成、重新生成、局部修改、模型 Prompt 上下文和脚本 Patch 校验

## 1. 问题

点击“重新生成脚本”后，请求成功返回，但脚本变成带占位符的通用模板，例如：

- `[根据 Brief 确定的核心主题]`
- `[行业关键词]`
- `[核心卖点]`
- 与当前产品无关的“提速 300%”“免费试用”等表达

这不是网络错误。当前自定义文本模型已配置，请求返回 HTTP 200。错误发生在请求上下文和响应验收之间。

## 2. 已确认根因

### 2.1 页面状态与请求状态不一致

页面使用 `proposedWorkspace` 展示已应用待审 Patch 的 Brief 和脚本，但“重新生成”把原始 `workspace` 发送给服务端。

因此，用户屏幕上看到的当前脚本草稿和 Mission Brief 不一定进入重新生成请求。

### 2.2 版本依赖被错误复用为 Prompt 白名单

`stageSourceFiles('script')` 为 `[]`，这是合理的版本依赖定义：脚本是第一阶段，没有已确认的上游生产阶段。

但 `compactWorkspace()` 又把该数组当成 Prompt 上下文白名单，结果脚本阶段会把 Brief、旧脚本、品牌记忆、平台规则和参考全部过滤掉。

“版本锁需要哪些上游文件”与“模型创作需要读取哪些上下文”是两个不同问题，不能共用同一列表。

### 2.3 响应只校验非空，没有校验占位模板

当前脚本 Patch 只要 `after` 非空且与 `before` 不同就会被接受。系统不会识别未填充的方括号占位符，也不会阻止通用模板覆盖当前待审草稿。

## 3. 方案选择

### 3.1 采用：三层根因修复

1. 同阶段重新生成只读取当前阶段的待审草稿；
2. Prompt 上下文与版本依赖分离；
3. 拒绝未填充占位模板，保留上一次可审查草稿。

这是唯一同时解决状态、上下文和验收问题的方案。

### 3.2 不采用：只加强 Prompt 文案

即使写上“不要输出占位符”，模型仍然看不到 Brief 和旧脚本。该方案只能降低出现概率，不能修复数据断点。

### 3.3 不采用：更换文本模型

模型质量会影响输出，但任何模型在没有 Brief 的情况下都只能猜。换模型会掩盖根因，还可能增加成本和新的兼容问题。

## 4. 请求模式

`AgentRunRequest` 新增可选字段：

```ts
stageRequestMode?: 'initial' | 'regenerate' | 'revise';
```

行为：

- 新 Mission 或首次脚本生成：`initial`；
- 点击阶段“重新生成”：`regenerate`；
- 提交“只改这个节点”：`revise`；
- 旧客户端未传该字段时兼容为 `initial`。

该字段描述用户意图，不能替代现有 production flow 中用于判断阶段是否已确认的 `revision` 状态。两者必须分开。

新增纯函数 `buildStageRunRequest()`，由 `app/page.tsx` 三个入口共同调用并接受显式 `stageRequestMode`：

- `runAgent`/首次阶段生成永远传 `initial`；
- `regenerateProductionStage` 永远传 `regenerate`；
- `submitNodeRevision` 永远传 `revise`；
- production flow 是否走 `markStageDraft` 继续由独立的 confirmed/revision 状态决定，不能反向推断 `stageRequestMode`。

该函数放在可单测模块中，测试直接断言最终 `/api/agent/run` 请求体，不能只测服务端默认值。

## 5. 同阶段草稿上下文

服务端新增 `stagePromptWorkspace(req)`，只为模型和 fallback 构造临时上下文，不直接持久化：

1. `initial`：使用原始 workspace；
2. `regenerate` 或 `revise` 且 `productionStage === 'script'`：
   - 从 `.aigc/pending_patches.json` 读取待审 Patch；
   - 只选择 `stageConfig('script').outputFiles`，即 `brief.json`、`campaign_goal.json`、`script.md`；
   - 把这三个文件的当前待审版本应用到临时 workspace；
3. 其他阶段保持现有 confirmed-upstream 规则，本次不扩大待审数据读取范围；
4. 临时 workspace 不写回浏览器或项目，也不自动批准 Patch。

### 5.1 Patch 归属

`PatchOperation` 增加可选来源元数据：

```ts
origin?: {
  kind: 'agent_stage' | 'manual';
  productionStage?: ProductionStageId;
  generationJobId?: string;
};
```

服务端生成的阶段 Patch 必须强制写入 `agent_stage + productionStage + generationJobId`，忽略模型提供的 origin；本地“保存修改”产生的 Patch 标记为 `manual`。同阶段临时上下文只接受以下两类：

- Agent Patch：`origin.kind === 'agent_stage'`、stage 匹配、job 等于当前 production flow 记录中的上一轮 `generationJobId`，且文件属于该阶段 outputFiles；
- Manual Patch：`origin.kind === 'manual'`，由本地手工编辑路径创建，且文件属于该阶段 outputFiles。

兼容升级前已经存在的待审 Patch：只有当文件路径唯一映射到当前阶段、阶段状态为 `ready_for_review` 或 `failed`、当前阶段有非空 `generationJobId`，且 Patch `before` 等于已提交 workspace 中对应文件内容时，才可作为 legacy current-stage draft 使用；否则忽略并产生 warning。该兼容规则不能用于下游阶段输入。

严禁把全部 `proposedWorkspace` 直接发送给下游。否则未确认的角色、场景、分镜或视频任务可能越过阶段确认门。

模型返回的新 Patch 仍追加到原始 workspace，并按文件路径替换同一文件的旧待审 Patch。这样不会静默确认旧草稿。

`runVideoAgent` 内部明确保留两个请求视图：

- `originalRequest`：用于 sourceVersions 校验、Patch `before`、持久化和审批；
- `promptRequest`：把 `originalRequest.workspace` 替换为 `stagePromptWorkspace(originalRequest)`，只用于模型 Prompt、Mission 解析和 server fallback。

Provider 使用 `promptRequest`，`normalizeResponse` 同时接收两个视图：所有创作内容和 fallback 从 `promptRequest` 读取，Patch 基线和写入目标从 `originalRequest` 读取。不能用临时草稿 workspace 替代持久化真源。

该双视图规则同样覆盖 live provider、force-mock、未配置 provider 的 mock fallback、`mockPatch`、`stageFallbackPatches` 和 `scriptFor`：

- `after` 内容从 `promptRequest` 生成；
- `before`、no-op 判断和持久化目标只从 `originalRequest` 生成；
- `makePatch` 必须显式接收 original 基线，不能由内容请求隐式决定。

模型返回的 `p.before` 一律忽略。服务端根据 `originalRequest.workspace` 重建每个 Patch 的 `before`，并以该基线判断 no-op，避免模型或临时草稿改写持久化基线。

## 6. Prompt 上下文与版本依赖分离

保留现有 `stageSourceFiles(stage)`，只负责：

- `sourceVersions`
- generation key
- 已确认上游版本锁
- 防止下游读取未确认资产

新增 `stagePromptContextFiles(stage)`，只负责模型可读取的 workspace 文件。

脚本阶段固定读取存在的以下文件：

- `.aigc/MEMORY.md`
- `profile.json`
- `brief.json`
- `campaign_goal.json`
- `viral_refs.json`
- `script.md`
- `platform_rules.json`
- `asset_library.json`
- `feedback_report.json`

其他生产阶段本次保持兼容：`stagePromptContextFiles(stage)` 默认返回现有 `stageSourceFiles(stage)`。

`.aigc/pending_patches.json` 永远不能直接进入 Prompt。只有第 5 节允许的三个 script-stage Patch 可以先应用到临时 workspace，再以普通文件内容进入上下文。

每个文件继续最多 7,000 字符，脚本阶段 workspace 上下文总量最多 28,000 字符。超限时按 `brief.json`、`script.md`、`campaign_goal.json`、`profile.json`、`.aigc/MEMORY.md`、`platform_rules.json`、`viral_refs.json`、`asset_library.json`、`feedback_report.json` 的顺序确定性保留。包含 `apiKey`、`token`、`secret`、`cookie` 或 `authorization` 的结构化键值进入 Prompt 前替换为 `[REDACTED]`。

## 7. 脚本阶段原子验收

新增纯函数：

- `extractScriptAnchors(promptRequest)`：从 `brief.json`、`campaign_goal.json` 和 profile 中提取具体产品名、主题、offer、受众等锚点；
- `validateScriptDraft(content, anchors)`：验证脚本正文和上下文一致性；
- `validateScriptStageBundle({ brief, campaignGoal, script }, anchors)`：原子验证脚本阶段三项最终交付物。

锚点只接受去除标点后至少 2 个中文字符或 4 个字母数字字符的具体值，并排除“用户”“产品”“核心主题”“目标受众”“短视频”等通用词。存在至少一个具体锚点时，脚本必须命中其中一个；没有可用锚点时跳过锚点命中检查，但仍执行全部结构与占位检查。

拒绝条件：

- 去除空白后少于 60 个字符；
- 包含 `TBD`、`TODO` 或 `PLACEHOLDER`；
- 包含“方括号 + 占位语义词”的未填充模板。占位语义词至少覆盖：`根据`、`待填写`、`待补充`、`示例`、`如：`、`关键词`、`核心卖点`、`补充说明`、`吸引眼球`、`行业`、`痛点`、`解决方案`、`主题`、`受众`、`CTA`；
- 去除 Markdown 标题、分隔线和纯字段标签后，少于两行实质正文，或实质正文合计少于 40 个非空白字符。

检测前显式排除 Markdown 链接 `[文字](url)`、图片 `![文字](url)` 和不含占位语义词的合法引用。测试 fixture 使用截图中的完整错误脚本，必须覆盖 `[吸引眼球的标题，如：…]` 与 `[补充说明，如：…]`。

`brief.json` 必须能解析为对象，至少有一个非占位的 `topic | title | contentGoal | offer | audience` 字段。`campaign_goal.json` 必须能解析为对象，并具有非占位的 `goal`、`audience` 和 `platform`。三个文件的任意字符串值出现上述占位模板时，整组失败。

响应处理：

- 先把模型结果和缺失项的 server fallback 组装成候选 `brief.json`、`campaign_goal.json`、`script.md`，fallback 必须基于 `promptRequest`；
- 对候选三项执行一次 `validateScriptStageBundle`，全部通过后才生成任何新 Patch；
- 任意一项失败时，整次脚本阶段返回 `InvalidStageOutputError`，不使用部分成功项，也不补成另一个通用模板；
- 非法输出不能覆盖原有待审 Brief、目标或脚本；页面显示“模型返回了未填充模板，已保留上一版草稿”，允许用户重试；
- `/api/agent/run` 对 `InvalidStageOutputError` 返回 HTTP 502 和稳定错误码 `invalid_stage_output`，其他异常行为不变。

本次不做自动二次模型调用，避免一次点击产生不可控的额外成本。

## 8. UI 行为

- 点击“重新生成”仍保留当前页面和上一版待审草稿，直到新结果通过校验；
- 生成成功后，同文件的新 Patch 替换旧 Patch；
- 生成失败后，production flow 标记失败并显示明确原因，但旧待审 Patch 不删除；
- “3 个 patch 待审”仍代表 Brief、目标和脚本三个待审资产，不把数量本身当成错误；
- 不新增弹窗、页面或模型设置项。

## 9. 安全边界

- 当前阶段的待审 Patch 只允许进入同阶段 regenerate/revise 请求；
- 下游角色、场景、分镜和视频阶段继续只读取已确认上游文件；
- 不把 `.aigc/pending_patches.json` 原文、其他阶段 Patch 或内部元数据发给模型；
- 不修改 Agnes 连接、模型名称、超时、计费或 fallback provider；
- 不自动批准或合并任何 Patch。

## 10. 测试设计

实施必须先写失败测试。

### 10.1 上下文测试

- `stagePromptContextFiles('script')` 包含九个规定文件；
- 其他阶段仍等于原有 confirmed source files；
- initial 请求不应用当前待审 script-stage Patch；
- regenerate/revise 请求应用待审 `brief.json`、`campaign_goal.json`、`script.md`；
- 只有 stage/job 归属匹配的 Patch 能进入同阶段上下文；同路径但错误 stage、错误 job 或无法安全归属的 legacy Patch 被忽略；
- 本地 manual script-stage Patch 可以进入同阶段 regenerate/revise；模型伪造 `origin.kind: manual` 会被服务端覆盖为 agent_stage；
- regenerate Prompt 包含待审 Brief 的唯一标记和上一版脚本标记；
- Prompt 不包含 `.aigc/pending_patches.json`、待审 `characters.json`、`scenes.json`、`storyboard.json` 或 `asset_prompts.json`；
- 敏感结构化键值被 `[REDACTED]`。

### 10.2 响应测试

- 截图完整错误脚本被 `validateScriptDraft` 拒绝，包括 `[吸引眼球的标题，如：…]` 与 `[补充说明，如：…]`；
- 合法 Markdown 方括号和链接不会被误判；
- 存在具体 Brief 锚点时，不含任何锚点的通用脚本被拒绝；合法、命中锚点的完整脚本被接受；
- 占位 Brief、占位 campaign goal 或占位脚本任一出现时，三项候选原子失败；
- 非法模型 Patch 返回 `invalid_stage_output`，上一版待审 Brief、目标和脚本均仍存在；
- 模型缺失任一交付物时，基于 `promptRequest` 的 fallback 通过三项原子校验；
- 新脚本 Patch 按文件路径替换旧 Patch，不产生多个 `script.md` Patch。
- 模型提交的 `before` 被忽略，返回 Patch 的 `before` 始终来自 original workspace；
- live、force-mock 和无 provider mock fallback 都遵守相同的 original/prompt 双视图规则。

### 10.3 回归测试

- character Prompt 仍只包含已确认 `script.md`；
- video Prompt 仍只包含四个已确认上游文件；
- production flow 的 sourceVersions 和阶段失效逻辑不变；
- `buildStageRunRequest` 生成的实际请求体分别带 `initial`、`regenerate`、`revise`，不从 confirmed 状态推断；
- API 路由把 `InvalidStageOutputError` 映射为 HTTP 502 + `invalid_stage_output`，其他错误保持现有映射；
- `node --test lib/*.test.cjs`、`npm run typecheck`、`npm run build`、`npm run qa:flow` 全部通过；
- 浏览器手工复现：创建带唯一产品名的 Mission，首次生成后不审批，点击重新生成；新脚本必须保留产品名且不含占位符。

## 11. 非目标

- 不在本修复中接入新的社媒 Skill；
- 不扩展七平台规则卡；
- 不重构整个 Agent Loop；
- 不修改角色、场景、分镜或视频生成策略；
- 不提高模型 temperature 或切换模型；
- 不自动重试外部模型。

## 12. 验收标准

1. 用户屏幕上的当前待审 Brief 和脚本能进入同阶段重新生成请求。
2. 下游未确认资产不能进入该请求。
3. 脚本阶段 Prompt 不再为空上下文。
4. 占位模板不能成为待审脚本 Patch。
5. Brief、campaign goal 和脚本作为一个原子交付包验收，不能只写入其中的部分坏结果。
6. 无效输出不会删除或覆盖上一版三项草稿。
7. 待审 Patch 必须通过 stage/job 归属检查；模型不能控制 Patch `before`。
8. 初次生成和可安全识别的旧版待审 Patch 保持兼容。
9. 下游 confirmed-only、sourceVersions、审批门和 Agnes 配置不变。
10. 全量测试、类型检查、生产构建和浏览器复现全部通过。
