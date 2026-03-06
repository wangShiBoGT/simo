# Simo 工具 API - miniClaw 集成指南

本目录包含与外部 AI 工具（如 miniClaw、Claude、GPT）集成的配置文件和示例。

## 核心原则

遵循 `BEHAVIOR.md` 行为宣言：
- **AI 无执行权**：所有动作经过 Intent → Guard → Confirm → Execute 链路
- **STOP 永远最高优先级**：任何时候都可中断
- **安全优先**：传感器检测到障碍物自动阻止
- **时长限制**：单次移动最大 1200ms

## 核心接口

### 1. 结构化执行接口

```http
POST /api/intent/execute
Content-Type: application/json
X-Simo-Token: <token>  # 生产环境必需

{
  "intent": "MOVE" | "TURN" | "STOP",
  "direction": "F" | "B" | "L" | "R",
  "duration_ms": 400 | 800 | 1200,
  "source": "miniclaw"
}
```

**响应示例**：
```json
{
  "success": true,
  "intent": { "intent": "MOVE", "direction": "F", "duration_ms": 400 },
  "decision": { "execute": true, "reason": "通过所有检查" },
  "confirm": { "status": "EXECUTED", "command": "F,400" },
  "state": { "state": "moving" }
}
```

### 2. 紧急停止（永远可用）

```http
POST /api/intent/stop
```

### 3. 状态查询（只读）

```http
GET /api/state           # 完整状态
GET /api/hardware/status # 硬件状态
GET /api/hardware/sensors # 传感器数据
```

## 工具定义文件

| 文件 | 格式 | 用途 |
|------|------|------|
| `miniclaw-tools.json` | 自定义 | 完整工具定义（含 HTTP 映射） |
| `openai-functions.json` | OpenAI | Function Calling 格式 |
| `mcp-tools.json` | MCP | Model Context Protocol 格式 |

## 安全配置

### Token 鉴权

```bash
# 方式1：环境变量
export SIMO_TOOL_TOKEN=your-secret-token

# 方式2：配置文件 (server/hardware.config.js)
toolApi: {
  token: 'your-secret-token'
}
```

### 速率限制

默认配置（令牌桶算法）：
- 每秒补充 2 个 token
- 桶容量 4（允许突发 4 次请求）

```js
// hardware.config.js
toolApi: {
  rateLimit: {
    tokensPerSecond: 2,
    bucketSize: 4
  }
}
```

## 快速测试

```bash
# 1. 启动服务器
node server/index.js

# 2. 运行集成测试
node server/tools/test-miniclaw-integration.js

# 3. 手动测试
curl -X POST http://localhost:3001/api/intent/execute \
  -H "Content-Type: application/json" \
  -d '{"intent":"MOVE","direction":"F","duration_ms":400}'
```

## miniClaw 配置示例

在 miniClaw 的 system prompt 中添加：

```
你可以使用以下工具控制 Simo 小车：
- simo_move: 前进/后退
- simo_turn: 左转/右转
- simo_stop: 紧急停止
- simo_status: 查询状态

安全规则：
1. 执行动作前先查询状态
2. 如不确定，先停止再询问
3. 单次移动不超过 1200ms
4. 检测到障碍物会自动阻止
```

## 错误处理

| HTTP 状态码 | 含义 |
|-------------|------|
| 200 | 成功（检查 `success` 字段） |
| 400 | 参数校验失败（非法 intent/direction） |
| 401 | Token 鉴权失败 |
| 429 | 请求过于频繁（速率限制） |
| 500 | 服务器内部错误 |

## 安全响应示例

当前方有障碍物时：
```json
{
  "success": false,
  "error": "安全阻止",
  "blocked": true,
  "reason": "前方障碍物",
  "safety": { "state": "danger", "blocked": true }
}
```
