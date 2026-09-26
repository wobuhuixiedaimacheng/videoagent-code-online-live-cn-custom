# 参与贡献

欢迎为内容合规检测规则库添砖加瓦！🎉

## 如何贡献

### 🐛 报告误判 / 漏判
提交 Issue，说明：
- 检测的逐字稿内容
- 目标平台
- 实际平台审核结果（过审/违规）
- 本工具的检测结果

### 💡 补充规则
如果发现新的违规模式或平台规则更新：
1. Fork 本仓库
2. 修改 `references/` 下的对应规则文件
3. 提 PR

### 📝 规则文件说明

| 文件 | 内容 |
|---|---|
| `references/common-rules.md` | 三平台通用规则（法律红线、虚假宣传等） |
| `references/douyin-specific.md` | 抖音专属规则 |
| `references/xiaohongshu-specific.md` | 小红书专属规则 |
| `references/shipinhao-specific.md` | 视频号专属规则 |

### 提交 PR

1. Fork 本仓库
2. 创建分支：`git checkout -b feat/new-rules`
3. 修改规则文件
4. 提交并推送
5. 发起 PR

## 规则编写格式

```markdown
### [规则名称]
- **风险等级**: [严重🔴/高🟠/中🟡/低🔵]
- **检测关键词**: [触发的关键词或模式]
- **适用平台**: [平台名称]
- **规则来源**: [参考的平台公约条款]
```

## 问题交流

有任何疑问，欢迎提交 Issue 讨论。
