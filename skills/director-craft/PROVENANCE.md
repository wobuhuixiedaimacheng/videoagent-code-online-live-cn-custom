# 导演调度技能包

自有实现，不是第三方引入。

| 项 | 值 |
|---|---|
| 来源仓库 | 无（本项目原创） |
| 许可证 | 自有，© 2026 VideoAgent |
| 撰写日期 | 2026-08-09 |
| 技能数 | 6 |

## 为什么是自研而不是引入

这个包的起因是「把开源社区的导演类 Skill 拷进来」。评估后没有拷，原因记录在这里，
免得以后有人重新提这件事又重新走一遍。

### 被排除的来源：Utopai-Research/pai-pro

- 仓库：https://github.com/Utopai-Research/pai-pro
- 许可证：**PAI PRO Sustainable Use License 1.0**（GitHub 识别为 `NOASSERTION`，不是 OSI 开源许可）
- 排除理由，许可证正文里的三条：
  1. **限定非商业**——只允许自用、内部使用或非商业研究；再分发必须免费且非商业。
  2. **Skills 专条**——明确禁止修改、适配、逆向或重新打包其 Skills 来产生任何直接或间接商业目的的衍生作品。
     许可证对 "Skills" 的定义是「用于调用 PAI API 的 agent 工作流、提示词模板与交互逻辑」，
     正好覆盖我们想要的那部分。
  3. **禁止竞品**——不得包装或转售 PAI API 作为竞争性服务。
- 附带的技术理由：它的 skills 是写给 PAI API 的，本项目走的是 `apihub.agnes-ai.com` 网关、
  产物是 `asset_prompts.json` 那一套，要用必须改写——而「改写」正是上面第 2 条点名禁止的动作。

### clean-room 声明

评估过程中**只读取了该仓库的 `LICENSE.md` 和目录树，没有读取任何 `SKILL.md` 的正文**。
本包六份技能正文在此前提下独立撰写，依据两类材料：

1. 公开的电影摄影、灯光与剪辑常识（景别、光位、光比、轴线、匹配剪辑等通用术语）。
2. 本仓库已有的字段契约：`lib/stageGeneration.ts` 的 storyboard/timeline 字段说明、
   `lib/shotPhysics.ts` 的 physicsMode 与时长上限、`lib/sceneVisualSpec.ts` 的 `instance.lighting` 结构。

风格与方法论本身不受版权保护，受保护的是具体表达。本包不含任何第三方的具体表达。

## 与 vendor 包的区别

`skills/` 下其余五个包（dynamic-director、lanshu-video-kit、video-prompt-engineer、
content-risk-detector、seedance-genre-pack）都是 MIT 许可的第三方引入，保留上游目录结构和 LICENSE，
改内容要回源仓库提 PR。

本包不同：目录结构是自己定的（扁平，一技能一目录），正文可以直接在本仓库修改。
`lib/localSkills.ts` 的 `PACKS` 里 `repo` 留空即表示这一区别，技能库面板会显示「自有实现」。
