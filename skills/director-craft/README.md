# 导演调度技能包

VideoAgent 的自有技能包。六个原子技能，覆盖分镜、运镜、光影、景深质感、剪辑节奏和物理可信度。

## 这个包解决什么

阶段指令（`lib/stageGeneration.ts`）已经把 `storyboard.json`、`timeline.json` 的字段契约写死了——
哪些字段必填、取值范围是什么、漏了会不会整份作废。那一层回答的是**必须填什么**。

这个包回答的是**怎么选才对**：

| 技能 | 管的字段 | 阶段 |
|---|---|---|
| shot-grammar | shotSize、cameraAngle、cameraHeight、subjectPlacement、composition | 分镜 |
| camera-move | cameraMove，以及它在提示词里的展开 | 分镜 |
| edit-rhythm | timeline.json 的 principle、beats（role/pacing/editNote）、镜头 emotionBeat | 分镜 |
| lighting-design | 场景 instance.lighting 九项、镜头 lightingNote | 素材提示词 |
| depth-and-lens | depthOfField，以及焦段与质感 | 素材提示词 |
| physics-fx | physicsMode，以及高风险动作的改写策略 | 生产准备 |

## 产品边界

- 技能只影响**写法**，不改字段契约。字段名、取值范围、必填与否一律以阶段指令为准；技能正文和阶段指令冲突时，以阶段指令为准。
- 输出仍落在当前阶段声明的 `outputFiles` 上，不新增文件、不改审批链。
- 技能里与具体视频模型有关的时长、幅度限制，来自本仓库 `lib/shotPhysics.ts` 的实际配置；那份配置改了，这里也要跟着改。
- 面向用户的名称是「导演调度」，不暴露技能目录名。

## 来源

**自有实现，零第三方文本。** 六份正文全部由本项目独立撰写，依据是公开的电影摄影与剪辑常识，
以及本仓库 `lib/stageGeneration.ts`、`lib/shotPhysics.ts`、`lib/sceneVisualSpec.ts` 里已有的字段契约。

没有引入、改写或参考任何第三方技能仓库的正文。详见 `PROVENANCE.md`。

## 改这个包

技能正文可以直接改——它是自有资产，不像 `skills/` 下的 vendor 包那样需要回上游提 PR。
改完记得同步：

- 新增或删除技能目录 → `lib/localSkills.ts` 的 `PACKS` 和 `STAGE_OVERRIDE`
- 想让某个技能在特定片种自动加载 → `lib/genreSkillRouter.ts` 的 `GENRE_STAGE_SKILLS`
- `required` 可以写一个 id 也可以写一组。一组时按书写顺序**累计**注入，累计长度超过
  `MAX_REQUIRED_SKILL_CHARS`（12000）的那一个及其后面的会自动降级成候选，
  并在 `notes` 里留痕——所以把最不能丢的写在最前面

当前实际注入量（改动后实测）：

| 片种 / 阶段 | 必读 | 候选 |
|---|---|---|
| 短剧 / 分镜 | 10622 字符（剧情分镜 + 镜头语法 + 运镜 + 剪辑节奏） | 1 |
| 视频生成准备 / 分镜 | 10622 字符（同上） | 0 |
| 产品营销 / 分镜 | 10407 字符（视频提示词工程师一个就占满） | 3 |
| 自动派发 / 场景·分镜·视频 | 0（不猜片种就不注正文） | 1–3 |
