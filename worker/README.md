# Simo Cloudflare Worker 部署指南

## 为什么选择 Cloudflare Workers？

| 对比项 | Render (免费版) | Cloudflare Workers |
|--------|----------------|-------------------|
| 冷启动 | 15-30秒（睡眠后） | **无冷启动** |
| 稳定性 | 经常 503 | **99.9% SLA** |
| 全球节点 | 单区域 | **全球边缘** |
| 免费额度 | 750小时/月 | **10万请求/天** |
| 维护成本 | 需要监控 | **几乎零维护** |

## 部署步骤

### 1. 安装 Wrangler CLI

```bash
npm install -g wrangler
```

### 2. 登录 Cloudflare

```bash
npx wrangler login
```

这会打开浏览器让你授权。

### 3. 部署 Worker

```bash
cd worker
npx wrangler deploy
```

部署成功后会显示 Worker URL，类似：
```
https://simo-api.<你的子域>.workers.dev
```

### 4. 设置 API Key（重要！）

API Key 不能写在代码里，需要用 Secrets：

```bash
# 设置智谱 API Key
npx wrangler secret put ZHIPU_API_KEY
# 然后输入你的 API Key

# 其他模型（可选）
npx wrangler secret put DEEPSEEK_API_KEY
npx wrangler secret put QWEN_API_KEY
npx wrangler secret put MOONSHOT_API_KEY
```

### 5. 测试 API

```bash
curl https://simo-api.<你的子域>.workers.dev/api/health
```

应该返回：
```json
{"status":"ok","name":"Simo Worker","runtime":"Cloudflare Workers"}
```

## 前端配置

部署完成后，修改前端的 API 地址：

```javascript
// src/services/simo.js
const WORKER_URL = 'https://simo-api.<你的子域>.workers.dev'
```

或者在设置面板中配置。

## 自定义域名（可选）

如果你有自己的域名，可以在 `wrangler.toml` 中配置：

```toml
routes = [
  { pattern = "api.你的域名.com/*", zone_name = "你的域名.com" }
]
```

然后在 Cloudflare DNS 中添加对应的记录。

## 常用命令

```bash
# 部署
npx wrangler deploy

# 查看日志
npx wrangler tail

# 本地开发
npx wrangler dev

# 查看 Secrets
npx wrangler secret list

# 删除 Secret
npx wrangler secret delete ZHIPU_API_KEY
```

## 注意事项

1. **TTS 不可用**：Cloudflare Workers 不支持 Node.js 流式 API，Edge TTS 无法使用。前端会自动降级到浏览器原生语音。

2. **请求限制**：免费版每天 10 万请求，对于家用完全够用。

3. **执行时间**：单次请求最长 30 秒（免费版），LLM 调用通常 2-5 秒，足够了。

4. **日志**：使用 `npx wrangler tail` 实时查看日志，方便调试。
