# 动态导演 Skill

动态导演是 VideoAgent 内置的视频提示词设计能力。创意总监在视频生成准备、运镜、动作编排、多模态参考、音乐卡点、视频续写或编辑任务中自动调用，也可通过 `/video-prompt` 手动调用。

## 产品边界

- 只生成和修改 `asset_prompts.json` 中可供用户审查的视频任务提示词。
- 不调用 Seedance，不新增视频供应商，不修改现有渲染接口。
- 产品界面和 Agent 事件使用“动态导演”名称。
- 特定模型限制只作为提示词参考，不冒充当前视频后端能力。

## 来源

- 上游仓库：https://github.com/dexhunter/seedance2-skill
- 上游文件：`zh/SKILL.md`
- 引入版本：`e06c7c63a766d623004a2807881c30685ce517af`
- 许可证：MIT，完整文本见同目录 `LICENSE`

`SKILL.source.md` 保留上游中文 Skill 原文；本产品运行边界由 `lib/skillRuntime.ts` 在加载时置于原文之前。
