# content-risk-detector

<p align="center">
  <a href="https://github.com/liuxingqitd/content-risk-detector/stargazers">
    <img src="https://img.shields.io/github/stars/liuxingqitd/content-risk-detector" alt="Stars" />
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/github/license/liuxingqitd/content-risk-detector" alt="MIT License" />
  </a>
  <img src="https://img.shields.io/badge/平台-抖音%20|%20小红书%20|%20视频号-blue" alt="平台" />
</p>

> 短视频逐字稿内容合规检测 Claude Skill，支持抖音、小红书、视频号三大平台。

## 简介

`content-risk-detector` 是一个用于 [Claude Code](https://claude.ai/code) 的 Skill，帮助短视频创作者在发布前检测逐字稿是否存在违规风险。

它能识别法律红线、平台运营风险、价值观问题，并给出分级风险报告和具体修改建议。

## 功能特性

- **多平台支持**：抖音、小红书、视频号，规则库独立维护
- **分级风险报告**：严重🔴 / 高🟠 / 中🟡 / 低🔵 / 无🟢
- **逐句分析**：定位到具体违规片段，给出原文引用
- **修改建议**：不只指出问题，提供可直接使用的改写方案
- **评论区引流检测**：识别"在评论区扣1"、"评论区留言我发你"等抖音高风险表述

## 检测覆盖范围

| 类别 | 示例 |
|------|------|
| 法律红线 | 暴力、赌博、毒品、诈骗传销 |
| 虚假宣传 | 绝对化用语、夸大功效 |
| 无资质建议 | 医疗、金融、法律建议 |
| 恶意导流 | 加微信、评论区引流、站外交易 |
| 平台特殊规则 | 抖音评论区引流、小红书虚假人设、视频号商品规范 |
| 价值观问题 | 炫富拜金、危险行为、网络暴力 |

## 安装

### 方式一：手动安装

将本仓库克隆到 Claude Code 的 skills 目录：

```bash
git clone https://github.com/liuxingqitd/content-risk-detector \
  ~/.claude/skills/content-risk-detector
```

### 方式二：通过 Skills CLI 安装

```bash
npx skills add liuxingqitd/content-risk-detector -g -y
```

## 使用方法

在 Claude Code 中，使用以下触发词启动检测：

```
内容合规检测 / 逐字稿检测 / 风险检测 / 短视频合规 / 平台规范检测
```

### 输入格式

```
逐字稿: [你的逐字稿内容]
平台: 抖音 / 小红书 / 视频号
内容类型: 知识分享 / 带货 / 娱乐 / 其他
是否商业推广: 是 / 否
```

### 输出示例

```markdown
# 短视频逐字稿风险检测报告

## 总体结论
需修改后发布

## 风险等级
高🟠

## 风险明细

### 评论区引流 - 高风险🟠
**命中规则:** 抖音评论区引流规则
**证据片段:** "想要资料的在评论区扣1，我私信你"
**风险说明:** 引导用户通过评论区获取站外联系，抖音判定为向第三方引流
**修改建议:** 改为"资料已挂主页，点击主页链接获取"
**适用平台:** 抖音
```

## 规则库结构

```
content-risk-detector/
├── SKILL.md                        # Skill 主文件
└── references/
    ├── common-rules.md             # 三平台通用规则
    ├── douyin-specific.md          # 抖音专属规则
    ├── xiaohongshu-specific.md     # 小红书专属规则
    └── shipinhao-specific.md       # 视频号专属规则
```

## 规则来源

- 抖音社区自律公约
- 小红书社区公约
- 视频号常见违规内容概览

> 本工具基于平台公开规则进行风险提示，不构成法律意见或平台官方判定。最终以平台实际审核结果为准。

## 贡献

欢迎提交 Issue 或 PR 来补充规则库：

- 发现新的违规模式
- 平台规则更新
- 误判 / 漏判案例

## License

MIT
