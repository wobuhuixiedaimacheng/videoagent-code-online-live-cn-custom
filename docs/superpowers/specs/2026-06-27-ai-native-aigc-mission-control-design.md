# VideoAgent AI 原生视频创作工作台 PRD

日期：2026-06-27
状态：草案
项目：VideoAgent Code Online

## 1. 产品决策

VideoAgent 要做成 AI 原生的视频创作工作台，不是通用办公助手，也不是开发者终端。

产品核心模型是：

- 用户只需要描述一个内容生产目标；
- 系统自动建立上下文；
- 主 Agent 判断任务类型并派给专项任务 Agent；
- 专项任务 Agent 组织生产能力 Agent 完成具体产出；
- 所有输出都沉淀为可审查项目资产；
- 涉及持久写入、生成交接或高风险内容时，必须经过用户确认。

这条路线更适合 C 端创作者和小 B 商家。用户不应该被迫理解终端、JSON、复杂 Agent 列表或提示词工程，但界面必须让用户看见“AI 正在组织生产”。

## 2. 产品定位

VideoAgent 不是“和 AI 聊天写文案”，而是一个面向营销和内容资产的视频创作操作系统。

用户心智应该是：

> 我描述产品、活动、参考内容或业务目标。系统自动组织一组视频创作 Agent，生成脚本、场景、分镜、素材提示词、发布文案和合规检查。我审查结果，决定哪些内容写入项目，哪些内容继续修改。

## 3. 目标用户

主要用户：

- C 端创作者：需要短视频、图文笔记、Hook、标题、字幕和平台发布文案。
- 小 B 商家：需要本地服务、电商、旅游、教育、咨询、个人品牌等营销视频，但没有专业内容团队。

用户不是开发者。产品不能要求他们理解文件、终端、Prompt 或 Agent 编排。但系统可以把过程可视化，让用户知道每个产出从哪里来、能不能信。

## 4. 借鉴边界

### 4.1 可以借鉴 WorkBuddy

- 稳定的左侧导航；
- 新任务作为第一入口；
- 项目空间；
- 专家或 Agent 的概念；
- 自动化模板；
- 知识库和素材库；
- 温和、易接近的视觉风格。

### 4.2 不能照搬 WorkBuddy

- 不能变成泛办公自动化；
- 不能做金融、法律、教育、代码等大杂烩专家市场；
- 不能用装饰性助手形象替代真实工作流；
- 不能做一堆空页面，让用户看不到 AI 生产过程。

### 4.3 可以借鉴 Claude Code

- 可见执行步骤；
- 文件化项目资产；
- patch 预览和审批；
- 工具调用时间线；
- 可检查的 Agent 运行记录；
- 用户批准前不写入持久项目资产。

### 4.4 不能照搬 Claude Code

- 不能做纯终端界面；
- 不能使用开发者专属语言作为主体验；
- 不能把日志当成主要输出；
- 不能要求用户先理解文件系统才能获得价值。

## 5. 核心产品模型

### 5.1 Mission

Mission 是一次用户目标，例如：

- “给巴厘岛亲子游生成 5 条小红书短视频。”
- “把这篇旧稿改成抖音转化视频。”
- “给本地美容院做一周内容计划。”
- “把这些产品照片做成图文笔记和短视频分镜。”

每个 Mission 包含：

- 目标；
- 平台；
- 受众；
- 品牌或产品上下文；
- 参考内容；
- 使用的能力；
- 用户授权和审批状态；
- 生成出的资产。

### 5.2 Context Stack

Context Stack 是系统生成前必须读取的上下文：

- `product_brief.json`：产品、卖点、价格、受众、用户痛点；
- `brand_memory.md`：语气、禁用词、定位、历史偏好；
- `viral_refs.json`：参考内容、Hook、结构、风格；
- `platform_rules.json`：小红书、抖音、TikTok、Instagram 的表达规则；
- `asset_library.json`：产品图、视频、Logo、历史素材；
- `campaign_goal.json`：转化目标、CTA、内容节奏。

用户看到的不是文件名，而是产品 Brief、品牌语气、爆款参考、平台规则、素材库、Campaign Goal 等业务概念。

## 6. Agent Runtime

Agent Runtime 是用户可见的执行层。

这里不能把所有 Agent 扁平理解成“一堆写脚本的工具”。Agent Runtime 必须拆成四层，每一层职责不同。

### 6.1 主 Agent / Orchestrator

主 Agent 是调度者，不是创作者。

职责：

- 理解用户任务；
- 判断这属于哪一类视频任务；
- 把任务派给对应的专项任务 Agent；
- 检查专项任务 Agent 的产出是否完整；
- 判断是否可以进入用户审查或交给 Video Generation Agent；
- 不直接负责写脚本、写分镜或写 prompt。

### 6.2 专项任务 Agent

专项任务 Agent 是某一类视频任务的负责人，不是单一脚本工具。

第一版需要的专项任务 Agent：

- 产品营销视频 Agent；
- 短剧/剧情视频 Agent；
- 旧稿改写 Agent；
- 图文笔记 Agent；
- 一周内容计划 Agent；
- 多平台改写 Agent；
- 视频生成交接 Agent。

职责：

- 接收主 Agent 派发的任务；
- 作为该任务类型的项目负责人；
- 判断需要哪些生产能力 Agent；
- 组织生产链路；
- 产出完整任务包，而不是只产出一段脚本。

### 6.3 生产能力 Agent

生产能力 Agent 在专项任务内部执行具体工作。

第一版需要的生产能力 Agent：

- Brief Agent：补全产品、受众、卖点、CTA 和限制条件；
- Viral Reference Agent：拆解参考内容的 Hook、结构和叙事手法；
- Scene Agent：把视频拆成 Hook、痛点、证明、卖点、信任、CTA 等场景；
- Script Agent：写口播、字幕、标题和 caption；
- Shot Agent：写镜头方向、动作、构图和画面节奏；
- Editing Agent：定义前 3 秒、转场、字幕密度和 CTA 出现时机；
- Prompt Agent：生成图片/视频提示词；
- Platform Agent：适配小红书、抖音、TikTok、Instagram 等平台；
- Compliance Agent：检查夸大宣传、敏感表达、素材授权和平台风险；
- Review Agent：汇总产出、指出薄弱点、准备可审批变更。

### 6.4 Video Generation Agent

Video Generation Agent 是最终生成准备专家。

职责：

- 只接收用户确认后的制作包；
- 输出镜头级视频 prompt；
- 输出首帧 prompt；
- 输出角色一致性 prompt；
- 输出 negative prompt；
- 输出 render task specs。

重要限制：

- Video Generation Agent 的输出不是 MP4；
- `asset_prompts.json` 或 `renderQueue` 只能证明“生成任务已准备”，不能证明视频已经渲染成功。

## 7. AIGC 资产管线

每个 Mission 会生成或更新以下项目资产：

- `brief.json`：产品 Brief；
- `viral_refs.json`：爆款参考；
- `scenes.json`：场景拆解；
- `script.md`：脚本；
- `storyboard.json`：分镜；
- `timeline.json`：剪辑节奏；
- `asset_prompts.json`：素材提示词和视频生成任务；
- `publish_copy.json`：发布文案；
- `compliance_report.json`：合规报告；
- `feedback_report.json`：人工反馈和待验证假设；
- `.aigc/MEMORY.md`：品牌记忆和项目偏好。

输出必须是可检查、可修改、可审批的资产，而不是一段聊天回复。

## 8. 信息架构

### 8.1 左侧导航

左侧导航保持紧凑稳定：

- 新任务；
- Mission Control；
- 项目；
- Agent 专家；
- 自动化；
- 知识库。

导航不能变成营销页菜单，也不能让用户先手动选一堆 Agent 才能开始。

### 8.2 上下文侧栏

上下文侧栏展示当前 Mission 和生产上下文：

- 当前 Mission；
- 任务队列；
- Context Stack；
- 已连接工具；
- 记忆摘要。

文件仍然存在，但用户默认看到的是业务概念，不是文件树。

### 8.3 主任务区

主任务区是产品核心，包含：

- Mission 标题和状态；
- 命令输入框；
- 已选参考、工具和权限模式；
- 主 Agent 执行计划；
- Agent Runtime 进度；
- AIGC 资产管线；
- 执行日志；
- 待审批队列。

默认页必须让用户感到系统已经准备好工作，而不是一个空白聊天框。

### 8.4 右侧检查器

右侧检查器展示当前选中的输出：

- 手机预览或内容预览；
- 生成文件；
- 风险检查；
- 审批动作；
- 局部重写或重新生成控制。

检查器要让资产变得具体：用户能看到视频场景、笔记预览、caption、图片 prompt 或发布文案。

## 9. 主要用户流程

### 9.1 生成短视频内容包

1. 用户输入任务：“给巴厘岛亲子游生成 5 条小红书短视频。”
2. 主 Agent 理解意图，并派给“产品营销视频专项 Agent”。
3. 专项任务 Agent 读取 Context Stack，判断需要哪些生产能力 Agent。
4. Brief 和 Viral Reference 能力补全产品、受众、卖点、CTA 和可复用结构。
5. Scene、Script、Shot、Editing、Prompt、Platform、Compliance 能力共同生成完整制作包。
6. Review Agent 检查制作包是否完整：脚本、场景、分镜、timeline、prompt、发布文案和风险报告。
7. 用户审查场景预览和文件 patch。
8. 用户批准、拒绝，或要求专项任务 Agent 局部修改。
9. 用户批准后，Video Generation Agent 准备可用于渲染的 prompt 和任务规格。

### 9.2 旧稿改写

1. 用户粘贴旧稿或选择已有文件。
2. 主 Agent 派给“旧稿改写专项 Agent”。
3. 专项任务 Agent 诊断旧稿，判断需要参考拆解、脚本改写、平台适配还是合规检查。
4. Viral Reference 和 Script 能力识别目标结构并重写内容。
5. Platform、Shot、Editing、Prompt 能力按需更新标题、分镜、节奏和生成提示词。
6. Compliance Agent 标记风险。
7. 用户对比改写前后，批准或要求局部重写。

### 9.3 生成一周内容计划

1. 用户提出一周内容计划需求。
2. 主 Agent 派给“一周内容计划专项 Agent”。
3. 专项任务 Agent 生成内容主题、每日目标、平台角度和 CTA 方向。
4. 每一天都可以变成一个任务队列项。
5. 用户选择任意一天，通过对应专项任务 Agent 展开成完整制作包。

### 9.4 场景级局部修改

1. 用户选择 Scene 01。
2. 右侧检查器展示预览、脚本、镜头和 prompt。
3. 用户说：“这个 Hook 更像小红书一点。”
4. 主 Agent 保持原专项任务 Agent 的负责人身份，只把 Scene 01 派给需要的生产能力，例如 Script Agent 和 Platform Agent。
5. 系统只提出小范围 patch，不整条视频重新生成。

## 10. AI 原生交互原则

1. 目标优先，不是表单优先。用户从一句意图开始，而不是先填长表单。
2. 上下文可见。用户要知道系统使用了哪些 Brief、参考、平台规则和素材。
3. Agent 有责任边界。每个展示出来的 Agent 必须对应输出、检查或 patch。
4. 资产可检查。输出必须变成脚本、场景、prompt、文案和报告，而不是聊天文本。
5. 审批必须明确。系统不能静默覆盖项目资产。
6. 重新生成必须可控。用户应该能只改一个场景、一个 Hook 或一个 prompt。

## 11. 第一版范围

### 11.1 范围内

- AI 原生 Mission Control 页面；
- 左侧导航和上下文侧栏；
- 命令输入框；
- Agent Runtime 进度；
- AIGC 资产管线；
- 场景级输出检查器；
- mock / live provider 兼容；
- patch 审批流程；
- 响应式 Web 布局；
- 本地 localStorage 持久化。

### 11.2 范围外

- 桌面 App 壳；
- 登录、计费、团队、多租户后台；
- 真实视频渲染；
- 真实社媒发布；
- 真实图片/视频模型集成；
- 完整自动化调度；
- 完整 Agent 市场；
- 真实 OAuth 连接器。

这些能力要等 Web MVP 验证主流程后再进入后续版本。

## 12. 数据与状态

第一版继续使用 localStorage，但状态结构必须按未来可迁移到后端的方式设计。

客户端状态：

- 当前 Mission；
- Mission 队列；
- workspace 文件；
- 当前资产；
- 当前场景；
- Agent 运行历史；
- 待审批 patch；
- 审批状态；
- provider 健康状态。

Provider 返回：

- summary；
- plan；
- tool events；
- agent events；
- scene assets；
- patch operations；
- compliance checks；
- preview state；
- notes。

如果后端暂时不能提供 agent events，mock provider 必须根据 mission workflow 确定性合成事件，不能随机乱跳。

## 13. 视觉方向

产品应该呈现为：

- 克制；
- 可操作；
- AI 原生；
- 面向内容生产；
- 非技术用户也能理解；
- 像创作操作系统，而不是普通 dashboard。

推荐：

- 浅色中性底色；
- 紧凑持久导航；
- 可见 Mission 卡片；
- 清楚的内容预览；
- 克制但可读的执行日志；
- 绿色或深色作为活跃 AI 状态；
- 卡片和面板保持节制。

避免：

- 全屏黑色开发者终端；
- 巨大的营销 hero；
- 紫色渐变 AI SaaS 风格；
- 装饰性空卡片；
- 卡片套卡片；
- 以吉祥物作为第一产品信号。

## 14. 成功标准

第一屏成功标准：

- 用户 5 秒内知道这是做 AIGC 内容生产的；
- 用户知道可以直接输入业务或内容目标；
- 用户知道系统会拆任务并组织 Agent；
- 用户知道每个场景和资产可以检查；
- 用户知道可以批准或拒绝变更。

实现成功标准：

- `npm run typecheck` 通过；
- `npm run build` 通过；
- 本地可在 `127.0.0.1:3000` 打开；
- 默认 UI 渲染 Mission Control；
- 运行 Mission 后出现 agent events 和 scene assets；
- 批准 patch 后 workspace 更新；
- 局部重写不会破坏已有文件。

## 15. 产品风险

### 15.1 假复杂

风险：展示很多 Agent，但没有清楚产出边界。

缓解：

- 每个展示出来的 Agent 必须对应输出、检查或 patch；
- 不展示没有实际作用的 Agent；
- mock 模式下 Agent 输出必须确定；
- live model 只在质量有收益的位置接入。

### 15.2 泛化成办公工具

风险：过度借鉴 WorkBuddy，变成通用办公自动化。

缓解：

- 所有导航和模板围绕 AIGC 内容生产命名；
- 不出现通用办公模板；
- 专家卡片必须是 AIGC 角色，而不是泛职业角色。
