# Tools

工程化工具集。当前提供：

## [prompt-browser](prompt-browser/) — 单页 HTML 提示词浏览器

侧栏 + 暗色 + 可筛选的提示词浏览器。消费 [../prompts/data/all-prompts.json](../prompts/data/all-prompts.json) 作为数据源。

**功能**：
- 按模型筛选（Seedance / HappyHorse / 全部）
- 按场景分类筛选
- 按标签多选筛选
- 关键词搜索（标题 / prompt 内容 / 标签）
- 卡片化显示，一键复制
- 暗色 / 浅色主题切换
- 完全离线，无后端依赖

**启动方式**：

```bash
# 方式 1：用 Python 起本地服务器（推荐）
cd lanshu-awesome-ai-video-kit
python3 -m http.server 8000
# 然后浏览器打开 http://localhost:8000/tools/prompt-browser/

# 方式 2：直接双击 index.html
# （file:// 协议下浏览器 CORS 会阻止 fetch JSON，工具会显示降级提示并给出补救方法）
```

## 路线图（待加）

- [ ] Volcengine API 客户端示例（Python / Node）
- [ ] 批量跑批脚本（CSV → 批量调 API → 结果归档）
- [ ] 提示词 Linter（词数 / 矛盾词 / 缺要素 检查）
- [ ] 效果对比看板（同需求 × 不同提示词 × 实际生成视频）
