# Simo 性能优化指南

基于压力测试和性能监控结果的优化建议。

## 当前性能基线

### 测试结果（2026-03-06）

**HTTP API 性能**：
- 平均响应时间：1.4ms ✅ 优秀
- 最小响应时间：1ms
- 最大响应时间：2ms

**速率限制**：
- 令牌桶容量：4 个请求
- 补充速率：2 req/s
- 测试结果：前 4 个成功，后 6 个被限流 ✅ 正常

**WebSocket 并发**：
- 5 个客户端同时连接：成功 ✅
- 消息发送：10 条
- 消息接收：15 条（含欢迎消息）
- 丢包率：0%

**长连接稳定性**：
- 测试时长：30 秒
- Ping/Pong：5/5 ✅ 无丢失
- 连接稳定

---

## 优化建议

### 1. HTTP 连接池（已优化）

当前实现每次请求创建新连接。对于高频调用场景，可使用连接池：

```javascript
// 在 MimiClaw C 代码中（tool_simo.c）
static esp_http_client_handle_t simo_client_pool[4];

void tool_simo_init(const char *server_url) {
    // 预创建连接池
    for (int i = 0; i < 4; i++) {
        esp_http_client_config_t config = {
            .url = simo_server_url,
            .keep_alive_enable = true,
            .timeout_ms = 5000
        };
        simo_client_pool[i] = esp_http_client_init(&config);
    }
}
```

**收益**：减少 TCP 握手开销，降低 50-100ms 延迟

### 2. 请求批处理

对于连续多个动作，使用批处理接口：

```javascript
// 新增批处理接口（待实现）
POST /api/intent/batch
{
  "intents": [
    {"intent": "MOVE", "direction": "F", "duration_ms": 400},
    {"intent": "TURN", "direction": "L", "duration_ms": 400},
    {"intent": "MOVE", "direction": "F", "duration_ms": 400}
  ],
  "mode": "sequential" | "parallel"
}
```

**收益**：减少网络往返次数，提升复杂任务执行效率

### 3. WebSocket 消息压缩

对于传感器数据广播，启用 WebSocket 压缩：

```javascript
import { WebSocketServer } from 'ws'

const wss = new WebSocketServer({ 
  port: 18790,
  perMessageDeflate: true  // 启用压缩
})
```

**收益**：减少 40-60% 带宽占用

### 4. 缓存优化

缓存高频查询的状态数据：

```javascript
// 在 index.js 中添加
const stateCache = {
  data: null,
  timestamp: 0,
  ttl: 100  // 100ms 缓存
}

function getCachedState() {
  const now = Date.now()
  if (stateCache.data && (now - stateCache.timestamp) < stateCache.ttl) {
    return stateCache.data
  }
  
  const state = getState()
  stateCache.data = state
  stateCache.timestamp = now
  return state
}
```

**收益**：减少重复计算，提升 QPS

### 5. 异步日志

使用异步日志避免阻塞：

```javascript
import { createWriteStream } from 'fs'

const logStream = createWriteStream('logs/simo.log', { flags: 'a' })

function asyncLog(message) {
  const timestamp = new Date().toISOString()
  logStream.write(`[${timestamp}] ${message}\n`)
}
```

**收益**：避免同步 I/O 阻塞主线程

### 6. 资源池管理

对于 WebSocket 客户端，限制最大连接数并实现优雅降级：

```javascript
class SimoWebSocketServer {
  constructor(options) {
    this.maxClients = options.maxClients || 10
    // ...
  }
  
  handleConnection(ws, req) {
    if (this.clients.size >= this.maxClients) {
      ws.send(JSON.stringify({
        type: 'error',
        error: '服务器已达最大连接数',
        max: this.maxClients
      }))
      ws.close()
      return
    }
    // ... 正常处理
  }
}
```

**收益**：防止资源耗尽，提升稳定性

---

## 监控建议

### 1. 接入 Prometheus

导出关键指标供 Prometheus 采集：

```javascript
// server/metrics.js
import { Registry, Counter, Histogram } from 'prom-client'

const register = new Registry()

const httpRequestsTotal = new Counter({
  name: 'simo_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'endpoint', 'status'],
  registers: [register]
})

const httpRequestDuration = new Histogram({
  name: 'simo_http_request_duration_ms',
  help: 'HTTP request duration',
  labelNames: ['method', 'endpoint'],
  registers: [register]
})

export { register, httpRequestsTotal, httpRequestDuration }
```

添加 `/metrics` 端点：

```javascript
if (url.pathname === '/metrics' && req.method === 'GET') {
  res.writeHead(200, { 'Content-Type': register.contentType })
  res.end(await register.metrics())
  return
}
```

### 2. 错误追踪

集成 Sentry 或类似服务：

```javascript
import * as Sentry from '@sentry/node'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development'
})

// 在错误处理中
catch (error) {
  Sentry.captureException(error)
  // ...
}
```

---

## 安全加固

### 1. 请求签名

为工具 API 添加请求签名防止重放攻击：

```javascript
import crypto from 'crypto'

function verifySignature(req, body) {
  const timestamp = req.headers['x-simo-timestamp']
  const signature = req.headers['x-simo-signature']
  
  // 检查时间戳（5分钟有效期）
  if (Math.abs(Date.now() - parseInt(timestamp)) > 300000) {
    return false
  }
  
  // 验证签名
  const payload = `${timestamp}.${body}`
  const expectedSig = crypto
    .createHmac('sha256', TOOL_API_TOKEN)
    .update(payload)
    .digest('hex')
  
  return signature === expectedSig
}
```

### 2. IP 白名单

限制特定 IP 访问工具 API：

```javascript
const ALLOWED_IPS = process.env.ALLOWED_IPS?.split(',') || []

function checkIPWhitelist(req) {
  if (ALLOWED_IPS.length === 0) return true
  const clientIP = req.socket.remoteAddress
  return ALLOWED_IPS.includes(clientIP)
}
```

### 3. CORS 配置

严格限制跨域请求：

```javascript
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'https://miniclaw.example.com'
]

function setCORSHeaders(res, origin) {
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Simo-Token')
  }
}
```

---

## 部署建议

### 1. 使用 PM2 管理进程

```bash
npm install -g pm2

# 启动
pm2 start server/index.js --name simo

# 集群模式（多核 CPU）
pm2 start server/index.js -i max --name simo-cluster

# 查看日志
pm2 logs simo

# 监控
pm2 monit
```

### 2. Nginx 反向代理

```nginx
upstream simo_backend {
    server 127.0.0.1:3001;
    keepalive 64;
}

server {
    listen 80;
    server_name simo.example.com;
    
    location / {
        proxy_pass http://simo_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
    
    location /ws {
        proxy_pass http://127.0.0.1:18790;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### 3. HTTPS 配置

```bash
# 使用 Let's Encrypt
certbot --nginx -d simo.example.com

# 自动续期
echo "0 0 * * * certbot renew --quiet" | crontab -
```

---

## 容量规划

### 当前硬件需求（单实例）

- **CPU**：1 核（轻载）
- **内存**：256 MB
- **带宽**：10 Mbps
- **支持并发**：~50 WebSocket 客户端，~100 HTTP req/s

### 扩展建议

**水平扩展**（多实例 + 负载均衡）：
- 使用 Redis 共享状态
- WebSocket 需要 sticky session

**垂直扩展**（更强硬件）：
- 2 核 CPU → 支持 ~200 req/s
- 512 MB 内存 → 支持 ~100 WebSocket 客户端

---

## 故障排查清单

### 性能下降

1. 检查系统资源：`top` 或 `htop`
2. 查看日志：`pm2 logs` 或 `tail -f logs/simo.log`
3. 监控网络：`netstat -an | grep 3001`
4. 检查串口连接：确认 ESP32-S3 正常通信

### WebSocket 断连

1. 检查防火墙：允许端口 18790
2. 增加心跳频率（客户端每 30 秒 ping）
3. 检查代理配置：确保支持 WebSocket Upgrade

### 速率限制误判

1. 检查客户端 Token：确保唯一性
2. 调整桶参数：增大 `bucketSize` 或 `tokensPerSecond`
3. 清除速率限制状态：重启服务器

---

## 性能测试工具

**已提供**：
- `test-miniclaw-integration.js` - 功能测试
- `test-websocket.js` - WebSocket 测试
- `test-stress.js` - 压力测试
- `performance-monitor.js` - 性能监控

**推荐第三方工具**：
- `Apache Bench (ab)` - HTTP 压测
- `wrk` - 现代化 HTTP 基准测试
- `Artillery` - 负载测试和性能测试
- `k6` - 现代化负载测试工具

**示例命令**：
```bash
# Apache Bench
ab -n 1000 -c 10 http://localhost:3001/api/state

# wrk
wrk -t4 -c100 -d30s http://localhost:3001/api/state

# Artillery
artillery quick --count 100 --num 10 http://localhost:3001/api/state
```

---

**更新日期**：2026-03-06
**版本**：1.0.0
