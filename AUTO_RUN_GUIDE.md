# Simo 自主运行指南

## 🤖 让 Simo 自己控制自己

Simo 已内置**自主避障系统**，可以无需人工指令，自己决策移动。

---

## 快速启动

### 方法 1：一键启动（推荐）

```bash
# 终端1：启动 Simo 服务器
node server/index.js

# 终端2：启动自主运行
node server/tools/auto-run.js
```

**效果**：
- Simo 开始自动探索
- 遇到障碍自动避让
- 实时显示传感器数据
- 持续运行直到手动停止

---

### 方法 2：HTTP API 启动

```bash
# 启动自主运行
curl -X POST http://localhost:3001/api/autonomy/start \
  -H "Content-Type: application/json" \
  -d '{"mode":"exploring"}'

# 查询状态
curl http://localhost:3001/api/autonomy/state

# 停止自主运行
curl -X POST http://localhost:3001/api/autonomy/stop
```

---

### 方法 3：WebSocket 启动

```javascript
const ws = new WebSocket('ws://localhost:18790');

ws.onopen = () => {
  // 启动自主运行
  ws.send(JSON.stringify({
    type: 'autonomy_start',
    mode: 'exploring'
  }));
};

// 接收实时传感器数据
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'sensor_update') {
    console.log('传感器:', data.sensors);
  }
};
```

---

## 工作原理

### 自主循环（每 500ms）

```
1. 扫描传感器
   ↓
2. 判断距离
   ├─ > 50cm → 前进（400ms）
   ├─ < 30cm → 扫描左中右，转向最安全方向
   └─ < 15cm → 紧急停止 + 后退
   ↓
3. 执行动作（经过安全检查）
   ↓
4. 等待 500ms
   ↓
5. 回到步骤 1
```

### 决策逻辑

**距离判断**：
- **> 50cm**：安全区，前进
- **30-50cm**：警戒区，扫描后决策
- **< 30cm**：危险区，停止并转向
- **< 15cm**：极度危险，立即后退

**转向策略**：
- 扫描左、中、右三个方向
- 选择距离最远的方向
- 全部危险时后退

---

## 运行模式

### 1. exploring（探索模式）- 默认

**行为**：
- 主动前进探索环境
- 遇到障碍自动避让
- 持续移动

**适用**：
- 房间巡逻
- 环境探索
- 自主导航

**启动**：
```bash
curl -X POST http://localhost:3001/api/autonomy/start \
  -d '{"mode":"exploring"}'
```

---

### 2. avoiding（避障模式）

**行为**：
- 仅在接近障碍时避让
- 不主动前进
- 防御性移动

**适用**：
- 被动防护
- 静态等待
- 手动控制时自动避障

**启动**：
```bash
curl -X POST http://localhost:3001/api/autonomy/start \
  -d '{"mode":"avoiding"}'
```

---

### 3. idle（待机模式）

**行为**：
- 仅监控传感器
- 不执行移动
- 数据记录

**适用**：
- 测试传感器
- 监控环境
- 调试模式

---

## 实时监控

### 使用自动监控脚本

```bash
node server/tools/auto-run.js
```

**显示内容**：
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🤖 Simo 自主运行中...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⏱️  运行时间: 24 秒
🎮 模式: exploring
📡 状态: 运行中

📊 传感器数据:
  超声波: 35cm ⚠️  警戒
  红外左: ✅ (1)
  红外右: ✅ (1)

💡 提示:
  • Ctrl+C 退出监控（自主模式继续运行）
  • 停止自主: curl -X POST http://localhost:3001/api/autonomy/stop
  • 紧急停止: curl -X POST http://localhost:3001/api/intent/stop
```

---

## 停止自主运行

### 方法 1：使用脚本

```bash
node server/tools/auto-run.js stop
```

### 方法 2：HTTP API

```bash
curl -X POST http://localhost:3001/api/autonomy/stop
```

### 方法 3：紧急停止

```bash
# 立即停止所有运动（最高优先级）
curl -X POST http://localhost:3001/api/intent/stop
```

---

## 安全机制

### 多层保护

1. **人类最高优先级**
   - 任何时候发送 STOP 立即停止
   - 紧急停止无需鉴权、无速率限制

2. **自主模式可关闭**
   - 默认关闭，需手动启动
   - 可随时停止

3. **所有动作经安全检查**
   - Guard 层：参数校验
   - Safety 层：障碍物检测
   - Confirm 层：风险动作确认

4. **速度限制**
   - 自主模式使用 50% 速度（保守）
   - 可在代码中调整（avoid.manager.js）

5. **Duration 限制**
   - 单次移动最长 400ms
   - 防止失控

---

## 高级配置

### 调整参数

编辑 `server/autonomy/avoid.manager.js`：

```javascript
const CONFIG = {
  // 距离阈值（cm）
  DANGER_DISTANCE: 15,   // 危险距离，立即停止
  CAUTION_DISTANCE: 30,  // 警戒距离，扫描决策
  SAFE_DISTANCE: 50,     // 安全距离，正常前进
  
  // 时间参数（ms）
  SCAN_DELAY: 300,       // 舵机转动延迟
  MOVE_DURATION: 400,    // 前进持续时间
  TURN_DURATION: 300,    // 转向持续时间
  
  // 扫描间隔（ms）
  SCAN_INTERVAL: 500     // 自主循环频率
};
```

### 调整速度

**当前速度**：50%（保守）

**提升速度**（在 `autonomyLoop()` 函数中）：
```javascript
// 原：50% 速度
serial.sendMove('F', 0.5, CONFIG.MOVE_DURATION);

// 改为：80% 速度（更快）
serial.sendMove('F', 0.8, CONFIG.MOVE_DURATION);
```

**注意**：速度优化已全局启用（m-v1 协议 + 80% 默认速度），自主模式可选择性使用。

---

## 使用场景

### 场景 1：房间巡逻

```bash
# 启动探索模式
node server/tools/auto-run.js

# Simo 会自动在房间内移动
# 遇到墙壁、家具自动转向
# 持续探索可达区域
```

### 场景 2：被动防护

```bash
# 启动避障模式
curl -X POST http://localhost:3001/api/autonomy/start \
  -d '{"mode":"avoiding"}'

# Simo 不主动移动
# 但如果被推动或外力，会自动避开障碍
```

### 场景 3：结合手动控制

```bash
# 1. 启动避障模式（后台保护）
curl -X POST http://localhost:3001/api/autonomy/start \
  -d '{"mode":"avoiding"}'

# 2. 手动发送移动指令
curl -X POST http://localhost:3001/api/intent/execute \
  -d '{"intent":"MOVE","direction":"F","duration_ms":800}'

# 如果前方有障碍，自主系统会自动停止
```

---

## 故障排查

### Q: 启动后没有移动

**检查**：
1. 传感器数据是否正常：`curl http://localhost:3001/api/hardware/sensors`
2. 串口是否连接：查看服务器日志
3. 距离是否 > 50cm（太近不会前进）

**解决**：
- 确保前方无障碍（> 50cm）
- 检查 COM6 串口连接
- 查看日志：`🤖 [Autonomy] 距离=XXcm`

---

### Q: 一直在原地转

**原因**：三个方向距离都 < 50cm

**解决**：
- 将 Simo 放在开阔区域
- 调低 `SAFE_DISTANCE` 参数

---

### Q: 撞到障碍物

**原因**：
- 传感器精度问题
- 距离阈值设置过小
- 速度过快

**解决**：
```javascript
// 提高安全阈值
DANGER_DISTANCE: 20,    // 从 15 改为 20
CAUTION_DISTANCE: 40,   // 从 30 改为 40
SAFE_DISTANCE: 60,      // 从 50 改为 60
```

---

### Q: 如何查看传感器原始数据

```bash
# 实时监控
node server/tools/auto-run.js

# 或直接查询
curl http://localhost:3001/api/hardware/sensors
```

---

## 与 miniClaw/MimiClaw 集成

### 通过 HTTP API 控制

MimiClaw 可以远程启动/停止 Simo 自主运行：

```c
// 在 MimiClaw C 代码中
void simo_auto_start(void) {
    const char* url = "http://192.168.1.100:3001/api/autonomy/start";
    const char* body = "{\"mode\":\"exploring\"}";
    
    esp_http_client_config_t config = {
        .url = url,
        .method = HTTP_METHOD_POST,
    };
    
    esp_http_client_handle_t client = esp_http_client_init(&config);
    esp_http_client_set_post_field(client, body, strlen(body));
    esp_http_client_perform(client);
    esp_http_client_cleanup(client);
}
```

### 工具定义示例

```json
{
  "name": "simo_auto_run",
  "description": "启动 Simo 自主运行模式，让机器人自己探索环境",
  "input_schema": {
    "type": "object",
    "properties": {
      "mode": {
        "type": "string",
        "enum": ["exploring", "avoiding", "idle"],
        "description": "exploring=主动探索, avoiding=被动避障, idle=待机"
      }
    },
    "required": ["mode"]
  }
}
```

**使用**：
- 用户："让小车自己跑一会儿"
- MimiClaw LLM → 调用 `simo_auto_run(mode="exploring")`
- Simo 开始自主运行

---

## 命令速查表

| 操作 | 命令 |
|------|------|
| 启动自主运行 | `node server/tools/auto-run.js` |
| 停止自主运行 | `node server/tools/auto-run.js stop` |
| 查询状态 | `node server/tools/auto-run.js status` |
| 紧急停止 | `curl -X POST http://localhost:3001/api/intent/stop` |
| 查看传感器 | `curl http://localhost:3001/api/hardware/sensors` |

---

## 总结

**Simo 已具备完整的自主运行能力**：

✅ **自己控制自己**
- 无需人工指令
- 传感器驱动决策
- 持续自主移动

✅ **安全可靠**
- 多层安全检查
- 人类随时可停止
- 保守速度策略

✅ **灵活配置**
- 3 种运行模式
- 可调参数
- HTTP/WebSocket 控制

✅ **易于集成**
- 简单命令启动
- 实时监控界面
- 可与 miniClaw/MimiClaw 结合

---

**立即开始**：
```bash
# 终端1
node server/index.js

# 终端2
node server/tools/auto-run.js
```

**观察**：Simo 开始自己探索环境 🤖
