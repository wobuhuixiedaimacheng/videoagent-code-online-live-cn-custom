# VideoAgent 全量改造方案(施工图级)

> 本文是**完整**的改造蓝图,不是分期摘要。一次性列出所有阶段、要改的每个文件、要新增/修改/删除的每个接口,以及对照 `learn-claude-code` 每一课的取舍。
> 总原则:把"单发 prompt → 一坨 JSON → normalize 兜底"改成"模型 + harness + 真循环"的真 agent。改动期间 `AgentRunResponse` 对外形状**保持不变**(前端 `app/page.tsx` 强依赖它),mock 模式全程保留,`AGENT_LOOP` 开关让新旧并存、可随时回退。

---

## A. 现状全景(改之前必须认清的事实)

### A.1 数据流(当前)

```
app/page.tsx runAgent()
  └─ POST /api/agent/run            (app/api/agent/run/route.ts)
        └─ runVideoAgent(req)        (lib/agentProvider.ts)
              └─ callAnthropic/OpenAI/Custom  ← 单次 fetch,max_tokens 5000
                    └─ safeJsonParse → normalizeResponse  ← 模型没给就编/补
              └─ 或 mockPatch(req)   ← 本地纯模板生成
        └─ 返回 AgentRunResponse
  └─ 前端用 patchOperations / assets / preview / toolEvents / agentEvents 渲染
  └─ 用户点批准 → applyPatchToWorkspace (lib/workspace.ts) 写进内存 workspace
```

### A.2 核心问题(对照 learn-claude-code)

| 问题 | 现状代码 | 后果 |
|---|---|---|
| 没有 agent loop | `callAnthropic` 单次 `fetch` 即返回 | 模型无法"看到工具结果再决策" |
| 工具是假的 | `toolEvents`/`agentEvents` 是模型写在 JSON 里的文字,或 `defaultAgentEvents` 编造 | 没有任何工具被真执行 |
| subagent 是假的 | `defaultAgentEvents` / `mockAgentEvents` 固定文案 | 12 个 agent 只是 UI 装饰 |
| 上下文粗暴截断 | `compactWorkspace` = `content.slice(0,7000)` | 文件一多就丢信息 |
| 兜底过多 | `ensure_script_patch`、`normalizeResponse` 大量"补齐" | 掩盖了"模型其实没干活" |
| 错误恢复弱 | 只有 `safeJsonParse` | provider/网络/token 失败直接 500 |

### A.3 已经做对、必须保留的资产

- **审批写入闭环**:`PatchOperation.requiresApproval` + `applyPatchToWorkspace` + 前端 `approvePatchIds/rejectPatchIds`。对应 s03,直接复用,不改。
- **skill 注册表**:`workspace.ts` 的 `p0Skills/p1Skills/allSkills/getSkillByWorkflow`。对应 s07,改成"按需加载"即可。
- **记忆文件**:`.aigc/MEMORY.md`(`memoryFor`)。对应 s09 雏形。
- **provider 多路选择**:`runVideoAgent`/`getProviderStatus` 的 custom→anthropic→openai→mock。对应 s11 基础。
- **视频渲染真实接口**:`app/api/video/render`(POST 提交 + GET 轮询,已 normalize)。`render_video` 工具直接调它。
- **响应契约**:`AgentRunResponse`(`types.ts`)被前端 2151 行的 `page.tsx` 全量消费 → **不能改字段**。

---

## B. 目标架构

```
runVideoAgent(req)
 ├─ if AGENT_LOOP!=1 → 旧 callXxx/mockPatch(原样保留,回退用)
 └─ if AGENT_LOOP==1 → agentLoop(ctx)
       while stop_reason == "tool_use":
           callModel(messages, toolSchemas)         ← 统一三家 provider 的 tool-use
           for each toolCall: TOOL_HANDLERS[name](args, ctx)  ← 真执行
               write_file → 产出 PatchOperation(不落盘,走审批)
               read_file/list_files/read_skill/run_compliance/render_video/spawn_subagent
           回灌 tool_result 到 messages
           按预算压缩 messages(contextCompact)
       return assembleResponse(ctx)  ← 由 ctx 累积的真实 toolEvents/patches/agentEvents 组装
```

`assembleResponse` 输出的仍是同一个 `AgentRunResponse`,只是内容来自真实执行,而非模型一次编造。

---

## C. 全量文件改动清单

> 标注:🆕 新增 / ✏️ 修改 / 🗑️ 删除(或废弃)。每条都给"改什么"和"为什么"。

### C.1 🆕 `lib/agentLoop.ts` —— 真循环(对应 s01)

核心导出:

```ts
export type LoopContext = {
  req: AgentRunRequest;
  messages: ModelMessage[];          // 真实多轮对话
  patches: PatchOperation[];         // write_file 累积
  toolEvents: ToolEvent[];           // 真实工具事件
  agentEvents: AgentEvent[];         // 真实 subagent 事件
  compliance: ComplianceCheck[];
  budget: TokenBudget;               // 见 C.4
  provider: AgentRunResponse['provider'];
};

export async function agentLoop(req: AgentRunRequest): Promise<AgentRunResponse>;
function assembleResponse(ctx: LoopContext, final: ModelTurn): AgentRunResponse;
```

为什么:这是把"伪 agent"变"真 agent"的唯一分水岭。没有它,下面所有改动都只是给模拟器加花纹。

### C.2 🆕 `lib/tools.ts` —— 工具定义与分发表(对应 s02)

```ts
export type ToolHandler = (args: any, ctx: LoopContext) => Promise<ToolResult>;
export const TOOL_HANDLERS: Record<string, ToolHandler> = {
  list_files,       // 列 workspace 文件 + 版本(只读)
  read_file,        // 读单个文件(只读,替代全量塞 prompt)
  read_skill,       // 按 workflow/command 读取 skill 定义(对应 s07 按需加载)
  write_file,       // 产出 PatchOperation,不落盘(对应 s03 审批)
  run_compliance,   // 跑合规规则,返回 ComplianceCheck[]
  render_video,     // 调 /api/video/render(对应已有真实接口)
  spawn_subagent,   // 起子 agent(对应 s06,阶段3 接入)
};
export const TOOL_SCHEMAS: ToolSchema[];   // 提供给模型的工具描述
```

规则:只读工具(list/read/read_skill)可并发;写类与副作用工具(write_file/render_video/spawn_subagent)串行。每个 handler 必须 push 一条真实 `ToolEvent` 到 `ctx`。

为什么:加工具 = 往这张表注册一个 handler + 一份 schema,循环本身永不动(s02 的纪律)。

### C.3 ✏️ `lib/agentProvider.ts` —— 从"生成器"收敛为"模型网关 + 兜底"

保留:
- `getProviderStatus()`(被 `model-config` 路由依赖,不动)。
- `mockPatch` 及其全部模板函数(`scriptFor/scenesFor/timelineFor/...`)→ **改为 mock 模式与 fallback 专用**,真 loop 不再走它们。
- `OUTPUT_LANGUAGE_POLICY`、`PROVIDER_SYSTEM_PROMPT`、`defaultWorkflowRules`、`inferWorkflow`、`isPureQuestion`、`videoSpecFromInstruction` → 抽到 `lib/prompt.ts`(C.5)共享。

新增:
- `callModel(messages, toolSchemas, opts)`:统一 Anthropic 原生 `tools` / OpenAI `tools` / custom function-calling,返回 `{ content, toolCalls, stopReason, usage }`。三家差异封装在内部。

修改:
- `runVideoAgent`:顶部加 `if (process.env.AGENT_LOOP === '1' && !forceMock) return agentLoop(req);`,其余分支原样保留作回退。

废弃(真 loop 路径下不再调用,旧路径保留):
- 🗑️ `normalizeResponse` 里的"补齐"块:`ensure_script_patch` 注入、`defaultAgentEvents` 兜底、`fallbackAssets` 兜底——这些都是单发架构的产物,真 loop 下由工具真实产出替代。

为什么:`callXxx` 三份几乎重复的请求逻辑收敛成一个网关;`normalizeResponse` 的"猜"和"补"是技术债,真 loop 让它们失去存在理由。

### C.4 🆕 `lib/contextCompact.ts` —— 上下文预算与压缩(对应 s08)

```ts
export type TokenBudget = { max: number; perToolResult: number; used: number };
export function clampToolResult(text: string, budget: TokenBudget): string;  // 大结果先摘要
export function microCompact(messages: ModelMessage[]): ModelMessage[];        // 压早期往返
export function autoCompact(messages: ModelMessage[], ctx: LoopContext): ModelMessage[]; // 接近上限整体压
```

替代:🗑️ `agentProvider.ts` 的 `compactWorkspace`(`slice(0,7000)`)。文件内容不再无脑塞 prompt,而是通过 `read_file` 工具按需取,取回时再过 `clampToolResult`。

为什么:视频项目的 `scenes/storyboard/timeline/asset_prompts` 体积大、增长快,固定截断会丢关键状态。

### C.5 🆕 `lib/prompt.ts` —— 运行时拼装 system prompt(对应 s10)

把 `agentProvider.ts` 里 `buildPrompt` 那一大段硬编码拆成 section,按需拼:

```ts
export function buildSystemPrompt(req: AgentRunRequest, opts: { tools: ToolSchema[] }): string;
// sections: 角色 / 输出语言策略 / AI Native 产品模型 / workflow 规则 /
//           canonical 文件清单 / 红线 / 工具使用说明
export function buildSkillSection(workflow: WorkflowKind): string;  // 只在选中该 skill 时拼入
```

替代:🗑️ `agentProvider.ts` 的 `buildPrompt`(它把全量 workspace 也塞进去——loop 下改为工具按需读)。

为什么:s10。prompt 该在运行时按 section 组装,而不是一个 600 字符串常量;也便于 creator/smb、不同 workflow 差异化。

### C.6 ✏️ `lib/workspace.ts` —— skill 改为按需加载(对应 s07)

不动:`agentRoster`、`applyPatchToWorkspace`、`diffLines`、所有 label/badge 函数、`contextStack`、`sceneAssets`、`getSkillByWorkflow`、skill 注册表本身。

新增:
- `listSkillManifests()`:只返回 `{id,title,command,tier}` 轻量清单,供 `read_skill` 工具先"列"。
- `getSkillDetail(workflow)`:返回完整 skill(含 `agentIds/outputFiles`),供模型决定用了再"展开"。

为什么:s07 的"先列清单,用到再展开",避免把 19 个 skill 全量塞进每次 prompt。

### C.7 🆕 `lib/subagent.ts` —— 真子 agent(对应 s06)

```ts
export async function runSubagent(role: AIGCAgentId, task: string, parent: LoopContext): Promise<SubagentResult>;
// 用全新的 messages[](干净上下文),更窄的工具集,跑一个小 agentLoop,只把结果带回父级
```

接入点:`spawn_subagent` 工具(C.2)。子 agent 的运行映射成真实 `AgentEvent`(复用 `agentRoster` 的 id/name/accent)。

替代:🗑️ `agentProvider.ts` 的 `defaultAgentEvents` / `mockAgentEvents`(真 loop 路径)。

为什么:s06。把"演"出来的 12 个 agent 变成真正用隔离上下文跑、有真实产出的子 agent。

### C.8 ✏️ `lib/agentProvider.ts` 错误恢复(对应 s11)

在 `callModel` 与 `agentLoop` 内加:
- 工具/网络失败:指数退避重试 N 次。
- provider 降级:当前 provider 失败 → 按 custom→anthropic→openai→mock 顺序转移(把现有"选择"扩成"失败转移")。
- token 超限:先 `autoCompact` 再重试本轮。
- 全失败:返回结构化错误对象(填进 `AgentRunResponse.notes` + 一个 `failed` 的 toolEvent),不抛 500。

为什么:s11。当前任何一环失败都直接 500,生产不可接受。

### C.9 ✏️ `app/api/agent/run/route.ts` —— 流式与错误透传(可选增强)

- 现状:`POST` 一次性返回。保持兼容。
- 可选:加 `?stream=1` 用 SSE 把 loop 的 `toolEvents`/`agentEvents` 实时推给前端(配合前端进度展示)。**非必须,不影响契约**,放最后做。

为什么:真 loop 多轮耗时变长,流式能改善体感;但属增强项,不阻塞主线。

### C.10 ✏️ `app/page.tsx` —— 仅在做流式时才动

- 不做流式:**零改动**(响应契约不变)。
- 做流式:`runAgent` 改读 SSE,逐步 `setLastRun`。其余逻辑(`approvePatchIds` 等)不变。

### C.11 ✏️ `.env.example` / `lib/types.ts` —— 配置与类型补充

- `.env.example` 加:`AGENT_LOOP=0`、`AGENT_MAX_STEPS=12`、`AGENT_TOKEN_BUDGET=...`。
- `types.ts`:**不改现有导出字段**;仅新增 loop 内部类型(`ModelMessage`/`ToolResult`/`ToolSchema`/`TokenBudget`),建议放 `lib/agentLoop.ts` 或新 `lib/loopTypes.ts`,避免污染对外契约。

---

## D. 对照表:learn-claude-code 每一课 → 我们改不改 → 改在哪

| 课 | 主题 | 改不改 | 落点 |
|---|---|---|---|
| s01 | Agent Loop | ✅ 必改 | 🆕 `lib/agentLoop.ts` |
| s02 | Tool Use | ✅ 必改 | 🆕 `lib/tools.ts` + `callModel` |
| s03 | Permission | ♻️ 复用 | 已有 `PatchOperation.requiresApproval` + `applyPatchToWorkspace`,`write_file` 接入 |
| s04 | Hooks | ⏸️ 暂缓 | 可选:在 loop 加 `PreToolUse/PostToolUse` 钩子点,非必须 |
| s05 | TodoWrite | ◐ 轻量 | loop 内维护一个 plan/step 列表,填进 `AgentRunResponse.plan` |
| s06 | Subagent | ✅ 改 | 🆕 `lib/subagent.ts` + `spawn_subagent` 工具 |
| s07 | Skill Loading | ✅ 改 | ✏️ `workspace.ts` 新增 manifest/detail + `read_skill` 工具 |
| s08 | Context Compact | ✅ 改 | 🆕 `lib/contextCompact.ts`,替代 `compactWorkspace` |
| s09 | Memory | ♻️ 升级 | 已有 `.aigc/MEMORY.md`;改为读取+增量更新,而非每次重写 |
| s10 | System Prompt | ✅ 改 | 🆕 `lib/prompt.ts`,替代 `buildPrompt` |
| s11 | Error Recovery | ✅ 改 | ✏️ `callModel`/`agentLoop`/`route.ts` |
| s12 | Task System | ⏸️ 暂缓 | 现内存 workspace 够用;需跨会话恢复时再上落盘任务图 |
| s13 | Background Tasks | ◐ 部分 | `render_video` 轮询天然异步;暂不做通用后台队列 |
| s14 | Cron | ❌ 不做 | web 工作台无需 |
| s15 | Agent Teams | ❌ 不做 | 过度设计 |
| s16 | Team Protocols | ❌ 不做 | 过度设计 |
| s17 | Autonomous | ❌ 不做 | 过度设计 |
| s18 | Worktree | ❌ 不做 | 无多 agent 并行写盘需求 |
| s19 | MCP Plugin | ⏸️ 暂缓 | 等要接外部能力(真实素材/TTS/图片模型)时再上 |
| s20 | Comprehensive | ✅ 自然达成 | 以上机制都挂在同一个 `agentLoop` 上即为 s20 |

图例:✅ 必改 / ♻️ 复用现有 / ◐ 轻量 / ⏸️ 暂缓 / ❌ 不做。

---

## E. 实施顺序与里程碑(全程不破坏现有功能)

| 里程碑 | 含阶段 | 交付 | 新增/改文件 | 回退方式 |
|---|---|---|---|---|
| **M1** | s01+s02+s10 | 真 loop + `list/read/write_file` 三工具 + prompt 拆分 | `agentLoop.ts`🆕 `tools.ts`🆕 `prompt.ts`🆕 `agentProvider.ts`✏️ | `AGENT_LOOP=0` |
| **M2** | s08+s07 | 上下文预算压缩 + skill 按需加载 | `contextCompact.ts`🆕 `workspace.ts`✏️ + `read_skill` 工具 | 同上 |
| **M3** | s06+s09 | 真 subagent + 记忆增量更新 | `subagent.ts`🆕 + `spawn_subagent` 工具 | 同上 |
| **M4** | s11 | 重试 + provider 降级 + token 兜底 | `agentProvider.ts`✏️ `route.ts`✏️ | 同上 |
| **M5(可选)** | s04+流式 | hooks 钩子点 + SSE 流式进度 | `route.ts`✏️ `page.tsx`✏️ | 不开 `?stream=1` |

每个里程碑:`AgentRunResponse` 形状不变 → 前端零改动(M5 除外)→ 可独立灰度;mock 与旧单发路径全程保留作对照与兜底。

---

## F. 每个工具的精确契约(M1~M3 实现时照此)

| 工具 | 入参 | 出参 | 副作用 | ToolEvent |
|---|---|---|---|---|
| `list_files` | `{}` | `{path,version,kind}[]` | 无 | success |
| `read_file` | `{path}` | `{content}`(过 `clampToolResult`) | 无 | success/warning(截断时) |
| `read_skill` | `{workflow}` | `getSkillDetail` 结果 | 无 | success |
| `write_file` | `{path,after,summary,riskLevel}` | `{patchId}` | push `PatchOperation` 到 `ctx.patches`(不落盘) | approval_required |
| `run_compliance` | `{paths?}` | `ComplianceCheck[]` | push 到 `ctx.compliance` | success/warning/blocked |
| `render_video` | `{prompt,negativePrompt,spec}` | `/api/video/render` 的 normalize 结果 | 调外部视频 API | running→success/failed |
| `spawn_subagent` | `{role,task}` | `SubagentResult` | 起子 loop | 映射成 `AgentEvent` |

约束(沿用现有红线,写进 prompt 与 `run_compliance`):不得声称已渲染真实 MP4(除非 `render_video` 真成功);不得虚构 CTR/ROI;持久写入一律走 `write_file` → 审批。

---

## G. 验收标准

- **M1**:一条指令在日志里能看到 ≥2 轮真实 `tool_use`;`patchOperations` 全部来自 `write_file`,删掉 `ensure_script_patch` 后 `script.md` 仍由模型主动写出;前端展示与改造前一致。
- **M2**:连续 12+ 轮工具调用不超 `AGENT_TOKEN_BUDGET`,关键 workspace 状态不丢;prompt 里只含被选中的 skill。
- **M3**:`agentEvents.output` 为子 agent 真实产出(可与子 loop 日志对上),非模板文案。
- **M4**:断网/换错 key/超长输入三种故障下,接口返回结构化错误而非 500,且能自动降级到可用 provider 或 mock。
- **全局**:`AGENT_LOOP=0` 时行为与今天逐字节一致(回归基线)。

---

## H. 一句话总结

> 我们缺的不是更多 agent、更多 prompt,而是**一个真正会调工具的循环**。
> M1 把单发换成 loop(s01/s02/s10),M2~M4 把压缩、skill、子 agent、容错挂上去(s08/s07/s06/s09/s11),其余课程(s12–s19 多数)对一个 web 视频工作台属于过度设计,明确不做。
> 全程响应契约不变、mock 保留、开关可回退——这是一条零停机的渐进改造路径。
