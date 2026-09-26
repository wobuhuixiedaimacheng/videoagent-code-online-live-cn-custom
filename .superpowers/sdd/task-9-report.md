# Task 9 迁移与缓存报告

## 写入范围

- `outputs/xiaopeng-love-history-3min-v2/workspace.json`
- `app/api/demo-workspace/[id]/route.test.cjs`
- `app/page.tsx`
- `app/page.model-config-ui.test.cjs`
- `.superpowers/sdd/task-9-report.md`

按最新并行分工，未编辑 `scripts/qa/videoagent-flow-regression.cjs`，也未写入浏览器 QA 截图或报告。

## TDD 证据

1. 先扩展 demo route 合同，直接执行时失败于缺少 `characters.json`。
2. 再增加 progressive demo seed 缓存合同，`app/page.model-config-ui.test.cjs` 准确失败于缺少版本化键。
3. 迁移与缓存改造后，两组定向测试及全量测试全部通过。

## 迁移结果

- 已通过现有 `migrateLegacyProductionAssets()` 生成 `characters.json` 并增强 `scenes.json`，未重新生成任何媒体。
- `script.md` 移除了末尾调研链接，可见正文无拉丁字母，保留 12 段剧情和总计 180 秒。
- `characters.json` 保留 2 个角色记录；小澎 `required=true`，具有 `kindergarten/primary/middle/high/college` 5 个年龄变体和 5 张现有主图，以及 12 个 canonical 表情 ID。
- `scenes.json` 保留 12 个场景，每个都有地点、时间、光线、色彩、出场角色、脚本段落、生成提示和参考图。
- `storyboard.json` 保留并增强 12 个镜头，每镜具有 `scriptSegment`、`characterIds`、`sceneId`、`shotSize`、`cameraMove`、`action`、`dialogue`、`firstFrameReference`、`referenceImageUrl` 和正数 `durationSeconds`；内容由现有脚本、场景和视频 prompt 确定性映射。
- `asset_prompts.json` 仍有 12 个视频任务。
- `production_flow.json` 为 schema 1，初始 `currentStage=script`；脚本为 `ready_for_review`，角色、场景、分镜、视频均为 `locked`，`videoJobs=[]`。
- 工作区 JSON 约 132 KB，`workspace.files` 中没有 clip 二进制文件。
- 外部 `clips/` 仍有 12 个 MP4，`reference-images/` 仍有 5 个 PNG；17 个媒体文件的 SHA-256 与迁移基线完全一致。

## 缓存版本

- 普通项目键仍为 `videoagent-workspace:${projectId}`。
- 其他 demo 仍使用原键。
- `xiaopeng-v2` 改为 `videoagent-demo-workspace:xiaopeng-v2:progressive-v1`，旧的无版本本地缓存不再遮住新种子。

## 验证

```text
node 'app/api/demo-workspace/[id]/route.test.cjs'
2 passed, 0 failed

node --test app/page.model-config-ui.test.cjs
58 passed, 0 failed

node --test
155 passed, 0 failed

npm run typecheck
exit 0
```

## 边界

- 本 worker 没有发起真实 Agent、图片或视频 provider 请求。
- 桌面/移动端流程、视频 POST 计数与并发上限由独立 QA worker 在 `scripts/qa/videoagent-flow-regression.cjs` 中验收。
