# 🤖 Simo - 家用 AI 机器人

> **能自己控制自己的智能机器人** | 设计灵感：极越汽车 SIMO

Simo 不是通用聊天助手，而是**长期存在于家庭中、能自主运行的智能体**。

⚠️ **Simo 的所有行为受 [`BEHAVIOR.md`](./BEHAVIOR.md) 约束。**

---

## ⚡ 5分钟快速开始

### 方式1：对话模式（最简单）

```bash
# 1. 安装依赖
npm install

# 2. 配置 API Key
cp .env.example .env
# 编辑 .env，填入智谱 GLM-4 Key（免费）

# 3. 启动
node server/index.js          # 后端（3001端口）
npm run dev                    # 前端（3000端口）

# 4. 访问
http://localhost:3000
```

---

### 方式2：自主运行（让它自己跑）🔥

```bash
# 1. 启动服务器
node server/index.js

# 2. 启动自主运行（新终端）
node server/tools/auto-run.js
```

**效果**：
- Simo 开始自动探索房间
- 遇到障碍自动避让
- 实时显示传感器数据
- 无需任何人工指令

**详细指南**: [`AUTO_RUN_GUIDE.md`](./AUTO_RUN_GUIDE.md)

---

### 方式3：miniClaw/MimiClaw 集成（远程控制）

通过 HTTP API 或 WebSocket 远程控制 Simo：

```bash
# HTTP 控制（推荐）
curl -X POST http://localhost:3001/api/intent/execute \
  -H "Content-Type: application/json" \
  -d '{"intent":"MOVE","direction":"F","duration_ms":400}'

# WebSocket 实时通信
ws://localhost:18790
```

**详细指南**: [`INTEGRATION_COMPLETE.md`](./INTEGRATION_COMPLETE.md)

---

## 📚 完整功能清单

### 🤖 核心能力

| 功能 | 状态 | 快速启动 | 文档 |
|------|------|---------|------|
| **对话交互** | ✅ | `npm run dev` | 内置 |
| **自主运行** 🔥 | ✅ | `node server/tools/auto-run.js` | [指南](./AUTO_RUN_GUIDE.md) |
| **语音控制** | ✅ | 前端点击麦克风 | 内置 |
| **运动控制** | ✅ | HTTP/WebSocket API | [集成指南](./INTEGRATION_COMPLETE.md) |
| **避障系统** | ✅ | 自主运行模式 | [指南](./AUTO_RUN_GUIDE.md) |
| **远程控制** | ✅ | miniClaw/MimiClaw | [集成指南](./INTEGRATION_COMPLETE.md) |

---

### 🚀 高级功能

| 功能 | 说明 | 文档 |
|------|------|------|
| **miniClaw HTTP 集成** | 通过 HTTP API 控制 Simo | [INTEGRATION_COMPLETE.md](./INTEGRATION_COMPLETE.md) |
| **WebSocket 实时通信** | 双向通信 + 传感器推送 | [INTEGRATION_REPORT.md](./server/tools/INTEGRATION_REPORT.md) |
| **MCP 服务器桥接** | JSON-RPC 2.0 协议 | [mcp-server.js](./server/tools/mcp-server.js) |
| **MimiClaw C 工具** | ESP32-S3 原生集成 | [mimiclaw/README.md](./server/tools/mimiclaw/README.md) |
| **速度优化** | m-v1 协议 + 80% 速度 | [SPEED_OPTIMIZATION.md](./SPEED_OPTIMIZATION.md) |
| **性能监控** | 实时监控 + 压力测试 | [OPTIMIZATION_GUIDE.md](./server/tools/OPTIMIZATION_GUIDE.md) |

---

## 🎯 使用场景

### 场景1：对话助手

```bash
# 启动前后端
node server/index.js
npm run dev

# 浏览器访问
http://localhost:3000
```

**功能**：
- 语音/文字对话
- 记忆系统
- 多模型支持
- TTS 语音合成

---

### 场景2：自主探索机器人 🔥

```bash
# 启动自主运行
node server/tools/auto-run.js
```

**能力**：
- ✅ 自己决定何时移动
- ✅ 自动避障
- ✅ 环境探索
- ✅ 无需人工干预

**工作原理**：
```
每 500ms → 扫描传感器 → 
  距离 > 50cm → 前进
  距离 < 30cm → 扫描左中右 → 选最安全方向转向
  距离 < 15cm → 紧急停止 + 后退
```

**停止方法**：
```bash
# 方法1：脚本命令
node server/tools/auto-run.js stop

# 方法2：HTTP API
curl -X POST http://localhost:3001/api/autonomy \
  -d '{"action":"stop"}'

# 方法3：紧急停止（最高优先级）
curl -X POST http://localhost:3001/api/intent/stop
```

---

### 场景3：远程控制（miniClaw/MimiClaw）

#### HTTP API 控制

```bash
# 前进
curl -X POST http://localhost:3001/api/intent/execute \
  -d '{"intent":"MOVE","direction":"F","duration_ms":800}'

# 左转
curl -X POST http://localhost:3001/api/intent/execute \
  -d '{"intent":"TURN","direction":"L","duration_ms":400}'

# 停止
curl -X POST http://localhost:3001/api/intent/stop
```

#### WebSocket 实时通信

```javascript
const ws = new WebSocket('ws://localhost:18790');

// 发送命令
ws.send(JSON.stringify({
  type: 'execute',
  intent: 'MOVE',
  direction: 'F',
  duration_ms: 400
}));

// 接收传感器数据
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'sensor_update') {
    console.log('传感器:', data.sensors);
  }
};
```

#### MimiClaw ESP32-S3 集成

**文件位置**：
- `server/tools/mimiclaw/tool_simo.h`
- `server/tools/mimiclaw/tool_simo.c`
- `server/tools/mimiclaw/README.md`

**集成步骤**：
1. 复制 C 代码到 MimiClaw 项目
2. 注册工具到 tool_registry
3. 编译烧录
4. Telegram 发送："让小车前进"

**详细指南**：[`server/tools/mimiclaw/README.md`](./server/tools/mimiclaw/README.md)

---

## 📡 API 文档

### 核心接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/chat` | 对话 |
| POST | `/api/intent/execute` | 结构化执行（miniClaw 专用） |
| POST | `/api/intent/stop` | 紧急停止（永远可用） |
| WS | `ws://localhost:18790` | WebSocket 实时通信 |

### 自主运行 API

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/autonomy` | 启动/停止自主运行 |
| GET | `/api/autonomy` | 查询自主运行状态 |

**启动自主运行**：
```bash
curl -X POST http://localhost:3001/api/autonomy \
  -d '{"action":"start","mode":"exploring"}'
```

**模式说明**：
- `exploring`：探索模式（主动前进）
- `avoiding`：避障模式（被动防护）
- `idle`：待机模式（仅监控）

### 硬件控制 API

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/hardware/motion` | 运动控制 |
| GET | `/api/hardware/sensors` | 传感器数据 |
| GET | `/api/hardware/status` | 硬件状态 |

**完整 API 文档**：[`INTEGRATION_REPORT.md`](./server/tools/INTEGRATION_REPORT.md)

---

## 🔧 速度优化（已实施）

### 优化内容

| 项目 | 优化前 | 优化后 | 提升 |
|------|--------|--------|------|
| 协议 | simple (无速度) | m-v1 (支持速度) | ✅ |
| 默认速度 | 50% | 80% | **+60%** |
| 命令格式 | `F,400` | `M,forward,0.80,400` | ✅ |
| ESP32 固件 | v2.4.x | v2.5.0 | ✅ |

### 效果

- ✅ 速度提升约 60%
- ✅ 运动更流畅
- ✅ 保持安全机制

**详细指南**：[`SPEED_OPTIMIZATION.md`](./SPEED_OPTIMIZATION.md)

---

## 🛠️ 测试工具

### 快速测试

```bash
# HTTP API 测试
node server/tools/test-miniclaw-integration.js

# WebSocket 测试
node server/tools/test-websocket.js

# 压力测试
node server/tools/test-stress.js

# 性能监控
node server/tools/performance-monitor.js

# 自主运行测试
node server/tools/auto-run.js
```

### 测试结果

| 指标 | 数值 | 评级 |
|------|------|------|
| 平均响应时间 | 1.4ms | ⭐⭐⭐⭐⭐ |
| QPS | ~100 req/s | ⭐⭐⭐⭐⭐ |
| WebSocket 并发 | 10 客户端 | ⭐⭐⭐⭐ |
| 长连接稳定性 | 30s 无丢包 | ⭐⭐⭐⭐⭐ |
| 速度提升 | +60% | ⭐⭐⭐⭐⭐ |

**详细报告**：[`INTEGRATION_REPORT.md`](./server/tools/INTEGRATION_REPORT.md)

---

## 📖 完整文档索引

### 集成指南

| 文档 | 说明 |
|------|------|
| [INTEGRATION_COMPLETE.md](./INTEGRATION_COMPLETE.md) | **完整集成总结**（推荐阅读） |
| [MINICLAW_INTEGRATION.md](./MINICLAW_INTEGRATION.md) | miniClaw 集成总报告 |
| [server/tools/README.md](./server/tools/README.md) | 工具 API 快速指南 |
| [server/tools/mimiclaw/README.md](./server/tools/mimiclaw/README.md) | MimiClaw ESP32 集成 |

### 优化指南

| 文档 | 说明 |
|------|------|
| [AUTO_RUN_GUIDE.md](./AUTO_RUN_GUIDE.md) | **自主运行完整指南**（推荐阅读） |
| [SPEED_OPTIMIZATION.md](./SPEED_OPTIMIZATION.md) | 速度优化指南 |
| [server/tools/OPTIMIZATION_GUIDE.md](./server/tools/OPTIMIZATION_GUIDE.md) | 性能优化指南 |

### 测试报告

| 文档 | 说明 |
|------|------|
| [server/tools/INTEGRATION_REPORT.md](./server/tools/INTEGRATION_REPORT.md) | 全面集成测试报告 |

### 原有文档

| 文档 | 说明 |
|------|------|
| [BEHAVIOR.md](./BEHAVIOR.md) | Simo 行为准则（重要） |
| [docs/l3-architecture.md](./docs/l3-architecture.md) | L3 架构设计 |
| [docs/protocol-spec.md](./docs/protocol-spec.md) | 协议规范 |

---

## ⚙️ 配置说明

### 环境变量 (.env)

```bash
# 大模型 API Key（至少配置一个）
ZHIPU_API_KEY=your_key_here      # 智谱（免费，推荐）
DEEPSEEK_API_KEY=your_key_here   # DeepSeek
QWEN_API_KEY=your_key_here       # 通义千问

# miniClaw 工具 API Token（可选）
SIMO_TOOL_TOKEN=your_secret      # 留空则跳过鉴权
```

### 切换默认模型

编辑 `server/index.js`：
```javascript
const CURRENT_LLM = 'zhipu'  // zhipu / deepseek / qwen
```

### 调整速度

编辑 `server/serial.js`：
```javascript
export const sendMove = (direction, speed = 0.8, durationMs = 500) => {
  // speed: 0.5-1.0 之间，当前 0.8 = 80% 速度
}
```

### 调整自主运行参数

编辑 `server/autonomy/avoid.manager.js`：
```javascript
const CONFIG = {
  DANGER_DISTANCE: 15,   // 危险距离（cm）
  CAUTION_DISTANCE: 30,  // 警戒距离（cm）
  SAFE_DISTANCE: 50,     // 安全距离（cm）
  SCAN_INTERVAL: 500     // 扫描间隔（ms）
};
```

---

## 🎮 控制方式对比

| 方式 | 难度 | 延迟 | 适用场景 |
|------|------|------|---------|
| **Web UI** | ⭐ | 低 | 本地控制 |
| **自主运行** | ⭐ | 无 | 自动探索 |
| **HTTP API** | ⭐⭐ | 中 | 程序控制 |
| **WebSocket** | ⭐⭐⭐ | 极低 | 实时控制 |
| **MimiClaw C 工具** | ⭐⭐⭐⭐ | 低 | ESP32 集成 |

---

## 🚗 硬件演进路线

```
L0 纯软件（对话）
│   └── 屏幕 + 语音
│
L1 定点存在
│   └── 外接屏幕 + 可移动底座
│
L2 简单移动 ← 当前
│   └── ✅ STM32 智能小车
│   └── ✅ 超声波 + 红外传感器
│   └── ✅ 中文语音控制
│   └── ✅ 自主避障
│   └── ✅ 速度优化（+60%）
│
L3 智能交互 ← 部分完成
    └── ✅ ESP32-S3 摄像头
    └── ✅ 人脸识别
    └── ✅ 自主导航
    └── ✅ 远程控制（miniClaw/MimiClaw）
```

---

## 💡 常见问题

### Q: 如何让 Simo 自己控制自己？

**A**: 使用自主运行模式

```bash
node server/tools/auto-run.js
```

详见：[`AUTO_RUN_GUIDE.md`](./AUTO_RUN_GUIDE.md)

---

### Q: miniClaw 能用了吗？

**A**: ✅ YES，完全可用

- **HTTP API**：✅ 8/8 测试通过
- **WebSocket**：✅ 7/7 测试通过
- **MCP 桥接**：✅ 正常工作
- **MimiClaw C 工具**：✅ 代码就绪

详见：[`INTEGRATION_COMPLETE.md`](./INTEGRATION_COMPLETE.md)

---

### Q: 速度太慢怎么办？

**A**: 已优化，提升 60%

- ✅ 启用 m-v1 协议
- ✅ 默认速度 80%
- ✅ ESP32 固件已烧录

详见：[`SPEED_OPTIMIZATION.md`](./SPEED_OPTIMIZATION.md)

---

### Q: 如何查看传感器数据？

**A**: 多种方式

```bash
# 方法1：自主运行监控（推荐）
node server/tools/auto-run.js

# 方法2：HTTP API
curl http://localhost:3001/api/hardware/sensors

# 方法3：WebSocket（实时推送）
ws://localhost:18790
```

---

### Q: 如何停止 Simo？

**A**: 紧急停止（最高优先级）

```bash
# HTTP API
curl -X POST http://localhost:3001/api/intent/stop

# 停止自主运行
node server/tools/auto-run.js stop
```

---

## 📦 项目结构

```
simo/
├── src/                              # 前端
│   ├── App.vue                       # 主界面
│   ├── services/
│   │   ├── simo.js                   # 对话服务
│   │   ├── memory.js                 # 记忆系统
│   │   └── tts.js                    # 语音合成
│   └── components/                   # 组件
│
├── server/                           # 后端
│   ├── index.js                      # 主服务（3001）
│   ├── websocket.js                  # WebSocket 服务（18790）
│   ├── serial.js                     # 串口通信
│   ├── hardware.config.js            # 硬件配置
│   │
│   ├── autonomy/                     # 自主运行系统
│   │   └── avoid.manager.js          # 避障逻辑
│   │
│   ├── navigation/                   # 导航系统
│   │   └── navigation.manager.js     # 导航状态机
│   │
│   └── tools/                        # 工具集
│       ├── auto-run.js               # 🔥 自主运行启动脚本
│       ├── test-websocket.js         # WebSocket 测试
│       ├── test-stress.js            # 压力测试
│       ├── performance-monitor.js    # 性能监控
│       ├── mcp-server.js             # MCP 桥接
│       ├── mimiclaw/                 # MimiClaw C 工具
│       │   ├── tool_simo.h
│       │   ├── tool_simo.c
│       │   └── README.md
│       └── README.md                 # 工具 API 指南
│
├── esp32/                            # ESP32-S3 固件
│   └── src/main.cpp                  # 固件主程序
│
├── stm32/                            # STM32 固件
│   └── simo_minimal/main.c           # 固件主程序
│
├── docs/                             # 文档
│   ├── l3-architecture.md            # L3 架构
│   ├── protocol-spec.md              # 协议规范
│   └── ...
│
├── AUTO_RUN_GUIDE.md                 # 🔥 自主运行指南
├── INTEGRATION_COMPLETE.md           # ✅ 集成完成总结
├── MINICLAW_INTEGRATION.md           # miniClaw 集成报告
├── SPEED_OPTIMIZATION.md             # 速度优化指南
├── BEHAVIOR.md                       # 行为准则
├── .env                              # 环境变量
└── README.md                         # 本文档
```

---

## 🚀 快速命令速查表

### 启动命令

| 命令 | 说明 |
|------|------|
| `node server/index.js` | 启动后端服务器 |
| `npm run dev` | 启动前端 |
| `node server/tools/auto-run.js` | **启动自主运行**（推荐） |
| `node server/tools/mcp-server.js` | 启动 MCP 服务器 |

### 测试命令

| 命令 | 说明 |
|------|------|
| `node server/tools/test-websocket.js` | WebSocket 测试 |
| `node server/tools/test-stress.js` | 压力测试 |
| `node server/tools/performance-monitor.js` | 性能监控 |

### 控制命令

| 命令 | 说明 |
|------|------|
| `node server/tools/auto-run.js stop` | 停止自主运行 |
| `curl -X POST http://localhost:3001/api/intent/stop` | 紧急停止 |

---

## 🎯 推荐使用流程

### 新手入门

1. **对话模式**：`npm run dev` → 浏览器对话
2. **自主运行**：`node server/tools/auto-run.js` → 观察自主探索
3. **阅读文档**：[`AUTO_RUN_GUIDE.md`](./AUTO_RUN_GUIDE.md)

### 进阶使用

1. **HTTP 控制**：使用 curl 发送命令
2. **WebSocket**：实时双向通信
3. **阅读文档**：[`INTEGRATION_COMPLETE.md`](./INTEGRATION_COMPLETE.md)

### 高级集成

1. **MimiClaw C 工具**：ESP32-S3 原生集成
2. **MCP 服务器**：JSON-RPC 2.0 协议
3. **阅读文档**：[`server/tools/mimiclaw/README.md`](./server/tools/mimiclaw/README.md)

---

## 🏆 项目特色

### ✨ 独特优势

1. **真正的自主运行** 🔥
   - 无需人工指令
   - 传感器驱动决策
   - 持续自主移动

2. **完整的远程控制**
   - HTTP/WebSocket API
   - miniClaw/MimiClaw 集成
   - MCP 协议桥接

3. **优秀的性能**
   - 1.4ms 平均响应
   - 速度提升 60%
   - 稳定的长连接

4. **详细的文档**
   - 8 份完整指南
   - 5 个测试工具
   - 全面的测试报告

---

## 📄 License

MIT

---

## 🙏 致谢

- 设计灵感：极越汽车 SIMO
- miniClaw/MimiClaw 集成灵感：[memovai/mimiclaw](https://github.com/memovai/mimiclaw)

---

**当主人在家时，Simo 是"在"的。现在，它还能自己决定怎么"在"。** 🤖
