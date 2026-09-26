# Scripts · 维护工具

## 🔭 monitor_models.py — 11 模型版本监控

每周由 [GitHub Action](../.github/workflows/model-version-monitor.yml) 自动调用,巡检 11 个模型的官方页面是否更新版本/文档。

### 为什么需要

AI 视频模型市场迭代极快:
- Kling 一年从 1.0 → 1.5 → 1.6 → 2.0 → 3.0
- Wan 从 2.1 → 2.5 → 2.6 → 2.7
- Sora 2 已有 EOL 信号

如果不及时跟进,本仓库收录的 prompt 就是**过期数据**。

### 工作原理

1. 读 [`model_endpoints.yaml`](model_endpoints.yaml) — 11 个模型 × N 个官方 URL
2. 抓取每个 URL,清洗噪音(timestamps/nonces/comments),计算 SHA-256 hash
3. 对比 [`known_hashes.json`](known_hashes.json) baseline
4. 如有变化 → 自动 `gh issue create` 提醒维护者人工 review
5. 提交 baseline 更新(`[skip ci]` 避免循环)

**为什么不解析版本号?**

很多模型官网用 JS 渲染,直接解析版本号不稳定。**纯 hash 对比 + 关键词提示** 更可靠 — 由人工最终判断。

### 本地用法

```bash
# 安装依赖
pip install requests pyyaml

# 跑一次(打印 markdown 报告)
python3 scripts/monitor_models.py

# CI 模式(输出 JSON)
python3 scripts/monitor_models.py --ci

# 首次初始化或主动校准 baseline(本次不报变化)
python3 scripts/monitor_models.py --rebaseline

# 只输出 GH issue body(无变化时退出码 1)
python3 scripts/monitor_models.py --issue-body
```

### 触发 GitHub Action

- **自动**:每周一 北京时间 09:00 (UTC 01:00)
- **手动**:仓库 → Actions → 「11 模型版本监控」→ Run workflow
  - 勾选 `rebaseline` 可重新校准(用于发现误报后清除)

### 维护

需要加新模型监控时,编辑 [`model_endpoints.yaml`](model_endpoints.yaml):

```yaml
models:
  ltx-video:
    vendor: Lightricks
    current_version: "1.0"
    endpoints:
      - https://www.lightricks.com/research/ltx-video
      - https://github.com/Lightricks/LTX-Video/releases.atom
```

下次 cron 会自动监控新加入的端点(首次只记 baseline 不报变化)。

### 监控覆盖

| 模型 | 监控端点数 | 当前记录版本 |
|---|---|---|
| Seedance | 2 | 2.0 |
| HappyHorse | 1 | 1.0 |
| Kling | 2 | 3.0 |
| Sora 2 | 2 | 2 (⚠️ EOL watch) |
| Veo | 2 | 3.1 |
| Runway | 3 | Gen-4.5 / Aleph |
| Pika | 2 | 2.5 |
| Hailuo | 2 | 02 |
| Hunyuan | 2 | 1.5 |
| Wan | 2 | 2.7 |
| 即梦 | 3 | 3.0 |
| **合计** | **23** | — |
