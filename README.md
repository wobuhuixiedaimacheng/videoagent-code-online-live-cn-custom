# VideoAgent Code 中文在线版

这是一个 **Claude Code 风格的营销短视频 Agent 工作台**。

它不是离线静态 Demo，而是一个可以本地运行、可以接 Anthropic / OpenAI API、可以部署到 Vercel 的 Next.js 在线版本。

## 本地运行

```bash
cd ~/Desktop/videoagent-code-online-live-cn
cp .env.example .env.local
npm install
npm run dev
```

然后打开：

```text
http://localhost:3000
```

注意：终端不要关，也不要按 `Control + C`。终端开着，网页才在运行。

## 接入 API

打开环境变量文件：

```bash
open .env.local
```

填写 Anthropic：

```env
ANTHROPIC_API_KEY=你的_key
ANTHROPIC_MODEL=claude-sonnet-4-5
```

或者填写 OpenAI：

```env
OPENAI_API_KEY=你的_key
OPENAI_MODEL=gpt-4.1-mini
```

保存后重启：

```bash
Control + C
npm run dev
```

如果不填 key，页面会显示 `模型：mock`，代表使用模拟 Agent 返回。

## 当前能体验什么

- 中文界面
- 项目文件树
- Agent 控制台
- 快捷命令
- 执行计划
- 工具调用记录
- 修改预览 diff
- 批准 / 拒绝修改
- 视频预览方案
- 合规检查面板
- 浏览器本地保存项目状态

## 还没做什么

- 真实视频渲染
- TTS 配音
- 图片 / 视频素材生成
- MP4 导出
- 登录和数据库
- 云端项目保存
- 支付和额度系统

## 部署到 Vercel

```bash
npm install -g vercel
vercel
```

再到 Vercel 项目里配置环境变量：

```text
ANTHROPIC_API_KEY
ANTHROPIC_MODEL
```

或者：

```text
OPENAI_API_KEY
OPENAI_MODEL
```

最后发布：

```bash
vercel --prod
```


## 使用 agens.ai / 其他第三方模型

如果你的模型服务兼容 OpenAI Chat Completions，把 `.env.local` 配成：

```env
DEFAULT_PROVIDER=custom
DEMO_MODE=0
CUSTOM_API_KEY=你的_key
CUSTOM_BASE_URL=服务商给你的 base url，例如 https://xxx/v1
CUSTOM_MODEL=服务商给你的模型 ID
```

保存后重启：

```bash
npm run dev
```

如果请求失败，通常是 `CUSTOM_BASE_URL` 或 `CUSTOM_MODEL` 写错。把服务商文档里的「base_url / endpoint / model id」填进来。
