### Task 10: 全量验证与人工验收

**Files:**
- Verify only

- [ ] **Step 1: 运行全部 Node 测试**

Run: `node --test $(rg --files -g '*.test.cjs' | sort)`

Expected: 全部 PASS，无跳过和未处理 Promise rejection。

- [ ] **Step 2: 运行 TypeScript 检查**

Run: `npm run typecheck`

Expected: exit 0，无 TypeScript 错误。

- [ ] **Step 3: 运行生产构建**

Run: `npm run build`

Expected: exit 0，Next.js 页面和 API routes 全部构建成功。

- [ ] **Step 4: 浏览器人工验收**

在 `http://127.0.0.1:3001/?demo=xiaopeng-v2` 按以下顺序检查：

1. 首屏只要求审查完整脚本，未来阶段不可点击。
2. 脚本确认后才出现真实角色资产；角色缺少主图时确认按钮不可用且显示原因。
3. 角色确认后才出现带图片、地点、时间、光线和人物的场景卡。
4. 场景确认后才出现分镜；分镜确认后只出现待审视频任务，不调用视频模型。
5. 视频任务最终确认后才提交镜头任务，并显示每镜头状态。
6. 修改脚本后，角色到视频全部显示“需重审”，旧资产仍可比较但不能生成视频。
7. 刷新页面后当前阶段、确认版本、待审 Patch 和视频任务状态都恢复。
8. 协作与托管模式都不能自动越过确认门。

- [ ] **Step 5: 检查视觉与响应式**

- 画板是首要工作区，不再出现画板下方重复长脚本区。
- 当前阶段在桌面和移动端都能看到主操作按钮。
- 顶部导航锁定原因可读，文字不溢出，图片不拉伸。
- 角色卡、场景卡、分镜卡和视频任务卡有稳定尺寸，加载与错误状态不引起布局跳动。
- 页面控制台无 React key、hydration、图片加载或未捕获请求错误。

- [ ] **Step 6: 最终检查点**

当前目录无 Git，保存测试命令、通过数量和截图路径。若目录恢复 Git：

```bash
git add app components lib scripts outputs docs/superpowers
git commit -m "feat: ship progressive production confirmation flow"
```

## 完成定义

只有同时满足以下条件才算完成：

- `production_flow.json` 在刷新后仍能恢复状态和版本；
- 每次 Agent 响应只修改当前阶段允许的文件；
- 脚本、角色、场景、分镜和视频任务都有真实可见资产与唯一确认入口；
- 未来阶段不可跳过，上游修改会让全部下游进入 `stale`；
- 角色和场景缺图时不能确认；
- 视频任务确认前 `/api/video/render` 调用次数为 0；
- 迟到结果、重复确认和失败重试不会覆盖当前版本；
- 全量测试、类型检查、生产构建、桌面/移动浏览器验收全部通过；
- 不把多个已完成片段误称为单一三分钟成片。
