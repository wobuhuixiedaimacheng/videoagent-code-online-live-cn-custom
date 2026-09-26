# VideoAgent 全站功能 QA 最终报告

完成时间：2026-07-12 13:08 +08:00  
目标：`http://localhost:3000`  
结论：**PASS（本地站内功能通过）**  
健康分：**98 / 100**  
阻断缺陷：**0**  
已知未修产品缺陷：**0**

## 1. 本轮覆盖

- 首页、新任务、Mission、项目、Agent、自动化、知识库，以及小 B 商家 / 创作者模式切换。
- 制作助理 5 个快捷入口、6 个制作配方与快捷动作。
- 模型设置：读取模型、文本 / 图片 / 视频模型分类、手动模型 ID、保存配置与脱敏错误。
- 7 个平台：小红书、抖音、TikTok、Instagram Reels、视频号、YouTube Shorts、B 站。
- 4 种生成模式、9 种运镜、3 种首尾帧策略。
- 渐进式制作主链路：剧本 → 角色 → 场景 → 分镜 → 视频任务。
- Patch 审查、阶段确认、局部修改、重新生成、依赖失效、阶段锁定、资产入库约束。
- 12 个场景、12 个分镜、12 个视频任务的完整桌面端与移动端回归。
- API 健康、模型配置、Agent、图片渲染、视频渲染的成功协议和非法输入失败协议。
- 真实文本模型的首次生成、脚本重新生成和节点局改。

## 2. 最终证据

| 检查 | 最终结果 |
|---|---|
| 全部离线单元 / 集成测试 | 180 / 180 PASS，0 fail，0 skip |
| TypeScript | `npm run typecheck` PASS |
| 生产构建 | `npm run build` PASS；Next.js 编译、Lint 与类型校验通过 |
| 完整浏览器回归 | `npm run qa:flow` PASS |
| 桌面布局 | 1440 × 1000，无控件重叠、无页面横向溢出 |
| 移动布局 | 390 × 844，无控件重叠、无页面横向溢出 |
| 完整制作数据 | 12 场景、12 分镜、12 视频任务全部保留 |
| 阶段安全 | 未确认脚本时下游全锁定；视频快捷入口不能越级 |
| Provider 安全 | 最终确认前 0 次图片调用、0 次视频提交；确认后精确拦截 12 次视频提交 |
| 浏览器运行时 | 0 exception、0 failed request、0 acceptance failure |
| Console | 只有 React DevTools 开发态 info，无 warning / error |
| 首页 | HTTP 200 |
| `/api/health` | HTTP 200 |
| `/api/model-config` | HTTP 200 |
| Agent / 图片 / 视频非法空请求 | 均按契约返回 HTTP 400，无 5xx |
| QA 报告密钥扫描 | 48 个报告 / 证据文件，0 个 secret-like hit |

完整机器可读结果：`outputs/qa-progressive-flow/videoagent-flow-regression.json`。

## 3. 真实浏览器与真实文本模型验收

在应用内浏览器中完成了真实点击、输入和保存：

- 以“星河咖啡机”、60 秒、小红书、通勤上班族、三分钟拿铁、预约门店为 Brief 首次生成脚本。
- 手工加入核销口令“星河晨光”后保存，再点击“重新生成脚本”。
- 重生成结果保留“星河咖啡机”和“星河晨光”，没有截图中的占位符。
- 通过“只改这个节点”加入“银河早安”；结果同时保留产品名与两个口令，没有占位符。
- 真实模型首次返回不符合完整阶段契约时，服务端以稳定 502 安全拒绝；补齐显式输出契约后，同一链路成功。
- 模型列表成功读取 5 个模型（文本 2、图片 2、视频 1），配置保存成功且未在报告中写入密钥。

## 4. 本轮发现并修复

1. 脚本重新生成读错上下文，导致输出截图式占位符。
2. 脚本阶段 Prompt 缺少显式 Brief / campaign goal / script 输出契约。
3. 模型返回半合法结果时可能产生部分 Patch；现改为三件套原子校验与原子拒绝。
4. 回归脚本默认端口仍指向旧端口，导致误报超时。
5. 分镜读取被截断为 8 条，现完整保留 12 条。
6. 未确认脚本的手工编辑可能错误解锁下游阶段。
7. “查看视频任务”快捷入口可尝试越过未解锁阶段。
8. 工作台错误过去不可见；现有可读、可关闭的 `role=alert` 错误条。
9. 普通操作警告会覆盖最近一次成功运行状态，误显示“执行失败”。
10. 模型 API Key 不属于表单以及 QA 使用不同本地域名产生的两类 Console / 开发态警告。

所有上述修复均有自动回归测试；最终全量测试为 180 / 180。

## 5. 外部服务验证边界

本轮没有实际发起会扣费的真实图片生成和真实视频生成。原因是这两类调用会产生不可逆外部费用；它们不属于安全的默认本地 QA 动作。

已完成的等价站内验证包括：真实路由参数、模型分类、图片 / 视频请求体、帧数上限、首帧 / 多图 / 关键帧传递、任务提交、轮询、超时、恢复、失败重试、12 任务并发上限、最终状态与密钥脱敏。完整浏览器流程通过拦截层验证了精确 12 次视频提交，且最终确认前不会产生任何付费请求。

因此本报告的 PASS 指：**站内产品功能、状态机、UI、API 与 Provider 接入协议已通过**；不声称第三方图片 / 视频供应商在 2026-07-12 的真实付费生成质量或余额状态已验证。

## 6. 安全提示

一次内部测试工具的进程信息输出曾显示现有认证环境变量。该值没有写入 QA 报告，最终对 48 个报告与证据文件的扫描结果为 0 命中。仍建议轮换对应凭据，避免终端滚动记录或历史工具输出成为残留风险。

## 7. 证据文件

- `outputs/qa-progressive-flow/videoagent-flow-regression.json`
- `outputs/qa-progressive-flow/screenshots/01-initial-script-desktop.png`
- `outputs/qa-progressive-flow/screenshots/02-character-desktop.png`
- `outputs/qa-progressive-flow/screenshots/03-scene-desktop.png`
- `outputs/qa-progressive-flow/screenshots/04-storyboard-desktop.png`
- `outputs/qa-progressive-flow/screenshots/05-video-submitted-desktop-1440x1000.png`
- `outputs/qa-progressive-flow/screenshots/06-video-submitted-mobile-390x844.png`
