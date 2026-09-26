# 多模态提示词技能包

自有实现，不是第三方引入。

| 项 | 值 |
|---|---|
| 来源仓库 | 无（本项目原创） |
| 许可证 | 自有，© 2026 VideoAgent |
| 撰写日期 | 2026-08-10 |
| 技能数 | 3 |

## 起因：一次被否掉的引入

这个包的起因是评估 MiniMax 开源仓库里的 `h3-prompt-writing` skill，看能不能引进来。
结论是不能原样引入，改成了自研。原因记录在这里，免得以后有人重新提这件事又重新走一遍。

### 被排除的来源：MiniMax-AI/MiniMax-H3

- 仓库：https://github.com/MiniMax-AI/MiniMax-H3
- 路径：`skills/h3-prompt-writing/`
- 许可证：**无**。仓库根目录没有 LICENSE 文件，GitHub 的仓库接口返回 `license: null`，
  `raw.githubusercontent.com/.../main/LICENSE` 返回 404。仓库 README 上那枚 LICENSE 徽章
  指向 HuggingFace 上的**模型**许可，不覆盖仓库里的 skill 文本。
- 排除理由：无许可证等于默认保留全部权利，比 `skills/director-craft/PROVENANCE.md` 里
  那次被否掉的 pai-pro 更严——pai-pro 至少写明了允许非商业自用。本仓库对 vendor 包的既定要求是
  MIT 且保留上游 LICENSE（`skills/` 下五个 vendor 包都是这么进来的），这份不满足。
- 附带的技术理由：`h3-prompt-writing` 是写给 MiniMax H3 模型的，字段名（`integrated_multimodal_description`
  等）和输入模式（T2VA / I2VA / FL2VA / L2VA / Ref2VA）都是 H3 的接口概念。
  本项目的视频请求走 `apihub.agnes-ai.com` 网关，参考位是 `image` / `extra_body.image` /
  `extra_body.reference_images` 三套，与 H3 不对应。原样引入的正文在我们这里既不合法也不可执行。

### clean-room 声明

评估过程中**只读取了 `skills/h3-prompt-writing/SKILL.md`**（35 行的工作流索引，2177 字节）。
两份参考正文 `references/base-en.txt`（15773 字节）与 `references/ref-en.txt`（23553 字节）
下载到临时目录后**未读取即删除**，其内容未进入本包的撰写过程。

从已读的那份索引里带走的是三条**方法**，不是表达：

1. 参考输入要有稳定的标签，并且提示词各处对同一个参考的指代必须一致。
2. 每个参考输入要显式做一次「保留什么 / 不保留什么」的分析。
3. 声音要拆成有声源的（环境、动效）和无声源的（配乐）两层分别描述。

方法与思路本身不受版权保护，受保护的是具体表达。本包不含任何第三方的具体表达。

### 三份正文的实际依据

本包三份技能正文在上述前提下独立撰写，依据全部来自本仓库：

| 技能 | 依据 |
|---|---|
| reference-slots | `app/api/video/render/route.ts` 的请求装包逻辑（首帧 / 关键帧 / 身份参考三个位、`VIDEO_IDENTITY_REFERENCE_FIELD` 降级重发路径），`.env.example` 里对这三组字段的说明 |
| retention-brief | `lib/characterVisualSpec.ts` 的 `identity.views`，`lib/productionAssets.ts` 的角色学段变体与 `wardrobe`，`lib/videoQa.ts` 抽帧质检的能力边界 |
| soundscape-layers | `lib/voiceMode.ts` 的 `VoiceMode` 契约、`DIALOGUE_LINE_FORMAT`、`RESERVED_SPEAKER_PATTERN`、`DIALOGUE_BRACKETED` |

其中 reference-slots 第二节那条混位事故，以及 retention-brief 里的三种翻车，
都是本项目实测记录，不是从任何外部材料转述的。

## 与 vendor 包的区别

和 `skills/director-craft/` 一样：目录结构自己定（扁平，一技能一目录），正文可以直接在本仓库修改，
不需要回上游提 PR。`lib/localSkills.ts` 的 `PACKS` 里 `repo` 留空即表示这一区别，
技能库面板会显示「自有实现」。
