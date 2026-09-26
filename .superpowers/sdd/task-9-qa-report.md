# Task 9 浏览器 QA 报告

## 结果

- 结果：**FAIL（1 项业务验收失败，其余断言通过）**
- 命令：`QA_BASE_URL=http://127.0.0.1:3010 npm run qa:flow -- --out outputs/qa-progressive-flow`
- 退出码：`1`
- 完整流程耗时：`16984ms`
- JSON 证据：`outputs/qa-progressive-flow/videoagent-flow-regression.json`
- Chrome：临时 profile，运行后已关闭并清理。

## 失败项

| 断言 | 期望 | 实际 | 结果 |
| --- | ---: | ---: | --- |
| 分镜阶段卡片数 | 12 | 8 | FAIL |

fixture 的 `storyboard.json` 确有 12 条，拦截器也返回了完整 `storyboard.json` patch。当前页面在 `app/page.tsx:2360` 使用 `storyboardScenes(proposedWorkspace)`；该函数先从 `scenes.json` 调用 `sceneAssets()`，而 `lib/workspace.ts:660` 固定 `.slice(0, 8)`。因此存在场景文件时只渲染前 8 张分镜卡，12 条 storyboard 无法完整进入当前 UI。

本子任务禁止修改业务源码，因此未修复或绕过该问题。QA 会继续跑完后续阶段，最终保持非零退出。

## 通过断言

- 页面初始化前安装 `fetch` 拦截；访问 `/?demo=xiaopeng-v2`。
- fixture：纯中文完整脚本、12 段、180 秒、拉丁字母 0；初始角色/场景/分镜/视频 tab 均锁定，视频 POST 为 0。
- 四次 agent fixture 顺序：`character -> scene -> storyboard -> video`；所有 patch `before` 均来自请求中的当前 `workspace` 文件。
- 每次确认后只解锁下一阶段，并等待目标阶段进入 `ready_for_review`。
- 角色：小澎主图加载可见，5 个年龄选项、Face ID、12 个表情按钮。
- 场景：12 张卡；地点、时间、光线、出场角色均非空。
- 分镜：已渲染的 8 张卡中，脚本段落、角色、场景、景别、运镜、动作、对白、首帧引用均非空且不是“未标注”。数量断言失败，见上文。
- 视频最终确认前：12 个 shot cards、唯一“确认视频任务并开始生成”、无通用“合并”入口、视频 POST 为 0。
- 最终确认后：12/12 本地视频 POST 完成，最大并发 `2`，12 个 job 均显示“生成中”；提交等待 `642ms`，未等待长轮询。
- Provider 安全：图片生成调用 `0`，意外 provider 请求 `0`；12 个视频 POST 全部由本地拦截器处理，视频 GET `0`。
- 桌面 `1440x1000`：`documentScrollWidth=1440`，主按钮未越界，39 个可见按钮无明显重叠。
- 移动 `390x844`：`documentScrollWidth=390`，主按钮未越界，5 个可见按钮无明显重叠。
- 浏览器：Runtime exception `0`、React key/hydration/error `0`、failed request `0`。仅有 React DevTools info 和 Chrome password-field verbose 提示，不属于本次阻断条件。

## 截图

- `outputs/qa-progressive-flow/screenshots/01-initial-script-desktop.png`（1440x1000）
- `outputs/qa-progressive-flow/screenshots/02-character-desktop.png`（1440x1000）
- `outputs/qa-progressive-flow/screenshots/03-scene-desktop.png`（1440x1000）
- `outputs/qa-progressive-flow/screenshots/04-storyboard-desktop.png`（1440x1000，显示 8 镜头）
- `outputs/qa-progressive-flow/screenshots/05-video-submitted-desktop-1440x1000.png`
- `outputs/qa-progressive-flow/screenshots/06-video-submitted-mobile-390x844.png`

## 修改文件

- `scripts/qa/videoagent-flow-regression.cjs`
- `.superpowers/sdd/task-9-qa-report.md`
