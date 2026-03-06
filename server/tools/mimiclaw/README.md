# MimiClaw 集成 Simo 机器人指南

本指南展示如何将 Simo 智能小车集成到 MimiClaw AI 助手，使 MimiClaw 能够通过自然语言控制 Simo。

## 架构概览

```
┌──────────────────┐
│   MimiClaw       │  Telegram/WebSocket 输入
│   (ESP32-S3)     │  "让小车前进"
│                  │
│  ┌────────────┐  │
│  │ Agent Loop │  │  LLM 解析意图
│  │   (Core 1) │  │  → tool_use: simo_move
│  └──────┬─────┘  │
│         │        │
│  ┌──────▼─────┐  │
│  │ Tool: Simo │  │  HTTP POST
│  │  Registry  │  │  /api/intent/execute
│  └──────┬─────┘  │
└─────────┼────────┘
          │ WiFi
          │ HTTP Request
          ▼
┌──────────────────────────────┐
│    Simo Server (Node.js)     │
│    http://192.168.1.100:3001 │
│                              │
│  POST /api/intent/execute    │
│  {intent: "MOVE",            │
│   direction: "F",            │
│   duration_ms: 400}          │
│         │                    │
│         ▼                    │
│  Intent → Guard → Safety     │
│         → Confirm → Execute  │
│         │                    │
│         ▼                    │
│    Serial (COM6)             │
└──────────┬───────────────────┘
           │
           ▼
    ┌─────────────┐
    │  ESP32-S3   │  Simo 硬件
    │  (小车)     │  执行运动指令
    └─────────────┘
```

## 快速开始

### 1. 准备 Simo 服务器

确保 Simo 服务器已启动并可访问：

```bash
# 在 Simo 项目目录
cd e:\simo
node server/index.js

# 输出应包含：
# HTTP: 3001   WebSocket: 18790
```

测试接口可用性：

```bash
curl http://192.168.1.100:3001/api/hardware/status
```

### 2. 复制工具代码到 MimiClaw

将以下文件复制到 MimiClaw 项目：

```bash
# 假设 MimiClaw 项目在 ~/mimiclaw
cp tool_simo.h ~/mimiclaw/main/tools/
cp tool_simo.c ~/mimiclaw/main/tools/
```

### 3. 注册工具到 MimiClaw

编辑 `~/mimiclaw/main/tools/tool_registry.c`：

```c
// 在文件顶部添加头文件
#include "tool_simo.h"

// 在 tool_registry_init() 函数中初始化 Simo 工具
void tool_registry_init(void) {
    ESP_LOGI(TAG, "Initializing tool registry");
    
    // ... 现有代码 ...
    
    // 初始化 Simo 工具（配置你的 Simo 服务器地址）
    tool_simo_init("http://192.168.1.100:3001");
    
    // 注册 Simo 工具
    cJSON *simo_tools = tool_simo_get_definitions();
    if (simo_tools) {
        int count = cJSON_GetArraySize(simo_tools);
        for (int i = 0; i < count; i++) {
            cJSON *tool_def = cJSON_GetArrayItem(simo_tools, i);
            const char *name = cJSON_GetObjectItem(tool_def, "name")->valuestring;
            
            // 根据名称注册对应的执行函数
            if (strcmp(name, "simo_move") == 0) {
                tool_register(name, tool_def, tool_simo_move);
            } else if (strcmp(name, "simo_turn") == 0) {
                tool_register(name, tool_def, tool_simo_turn);
            } else if (strcmp(name, "simo_stop") == 0) {
                tool_register(name, tool_def, tool_simo_stop);
            } else if (strcmp(name, "simo_status") == 0) {
                tool_register(name, tool_def, tool_simo_status);
            }
        }
        ESP_LOGI(TAG, "Registered %d Simo tools", count);
        cJSON_Delete(simo_tools);
    }
}
```

### 4. 修改 CMakeLists.txt

在 `~/mimiclaw/main/CMakeLists.txt` 中添加源文件：

```cmake
idf_component_register(
    SRCS
        # ... 现有文件 ...
        "tools/tool_simo.c"
    INCLUDE_DIRS "."
)
```

### 5. 配置 WiFi 和 API Key

编辑 `~/mimiclaw/main/mimi_secrets.h`：

```c
// WiFi 配置（确保 MimiClaw 和 Simo 在同一网络）
#define MIMI_SECRET_WIFI_SSID "YourWiFi"
#define MIMI_SECRET_WIFI_PASS "YourPassword"

// Telegram Bot Token
#define MIMI_SECRET_TG_TOKEN "123456:ABC-DEF..."

// Anthropic API Key
#define MIMI_SECRET_API_KEY "sk-ant-api03-xxxxx"
#define MIMI_SECRET_MODEL_PROVIDER "anthropic"
```

### 6. 编译并烧录

```bash
cd ~/mimiclaw

# 清理并编译
idf.py fullclean && idf.py build

# 烧录到 ESP32-S3
idf.py -p /dev/cu.usbmodem11401 flash monitor
```

## 使用示例

在 Telegram 中与 MimiClaw 对话：

```
你: 让小车前进
MimiClaw: [调用 simo_move(direction="F", duration_ms=800)]
        ✅ 小车已前进 800 毫秒

你: 左转一下
MimiClaw: [调用 simo_turn(direction="L", duration_ms=400)]
        ✅ 小车已左转 400 毫秒

你: 停止
MimiClaw: [调用 simo_stop()]
        ✅ 小车已停止

你: 小车状态怎么样
MimiClaw: [调用 simo_status()]
        当前状态: idle（空闲）
        最后动作: STOP
        传感器: 正常
```

## 高级配置

### 自定义 System Prompt

在 MimiClaw 的 `SOUL.md` 中添加 Simo 控制指南：

```markdown
# Simo 机器人控制能力

你可以控制 Simo 智能小车，具备以下工具：

- **simo_move**: 前进/后退
  - direction: "F"（前进）或 "B"（后退）
  - duration_ms: 400（短）、800（中）、1200（长）

- **simo_turn**: 左转/右转
  - direction: "L"（左转）或 "R"（右转）
  - duration_ms: 同上

- **simo_stop**: 紧急停止（随时可用）

- **simo_status**: 查询状态

## 安全原则

1. **谨慎移动**：执行动作前先查询状态
2. **不确定就停**：遇到障碍物或不确定情况立即停止
3. **时长限制**：单次移动不超过 1200ms
4. **安全优先**：Simo 内置安全系统会自动阻止危险动作

## 示例对话

用户: "探索一下周围"
助手思考: 需要让小车移动，先前进一小段
→ 调用 simo_move(direction="F", duration_ms=400)
→ 等待响应
→ 调用 simo_status() 检查是否安全
→ 根据结果决定下一步
```

### WebSocket 实时通信（可选）

如果需要实时传感器数据，可使用 WebSocket：

```c
// 在 MimiClaw 中连接 Simo WebSocket
// ws://192.168.1.100:18790

// 接收传感器更新
{
  "type": "sensor_update",
  "sensors": {
    "ultrasonic": {"distance": 25},
    "infrared": {"left": false, "right": false}
  },
  "timestamp": 1234567890
}
```

## 网络配置

### 方案 A：同一 WiFi

MimiClaw 和 Simo 服务器连接同一路由器：

```
MimiClaw (192.168.1.101)
    │ WiFi
    ▼
路由器 (192.168.1.1)
    │
    ▼
Simo 服务器 (192.168.1.100)
```

### 方案 B：AP 模式

Simo 服务器创建热点，MimiClaw 连接：

```c
// Simo 服务器端（需实现 AP 模式）
// 热点名: Simo-AP
// 密码: simo2026

// MimiClaw 配置
#define MIMI_SECRET_WIFI_SSID "Simo-AP"
#define MIMI_SECRET_WIFI_PASS "simo2026"

// Simo 地址固定为 192.168.4.1
tool_simo_init("http://192.168.4.1:3001");
```

## 故障排查

### 问题 1: HTTP 请求超时

**症状**: `tool_simo_move` 返回 `{"error":"Request failed: ESP_ERR_TIMEOUT"}`

**解决**:
1. 检查网络连接：`ping 192.168.1.100`
2. 确认 Simo 服务器运行中
3. 检查防火墙设置
4. 增加超时时间（在 `tool_simo.c` 中修改 `timeout_ms`）

### 问题 2: 工具未注册

**症状**: LLM 不调用 Simo 工具

**解决**:
1. 检查 `tool_registry.c` 中是否正确注册
2. 查看启动日志：应有 "Registered 4 Simo tools"
3. 在 Serial CLI 中运行 `tool_list` 确认

### 问题 3: 安全阻止

**症状**: 返回 `{"success": false, "blocked": true, "reason": "前方障碍物"}`

**说明**: 这是正常行为，Simo 检测到障碍物自动阻止

**处理**: 让 MimiClaw 理解这是安全机制，提示用户并建议其他动作

## 性能优化

### 减少延迟

```c
// 在 tool_simo.c 中使用连接池（需自行实现）
static esp_http_client_handle_t simo_client = NULL;

// 初始化时创建持久连接
void tool_simo_init(const char *server_url) {
    // ... 现有代码 ...
    
    // 创建可复用的 HTTP 客户端
    esp_http_client_config_t config = {
        .url = simo_server_url,
        .keep_alive_enable = true
    };
    simo_client = esp_http_client_init(&config);
}
```

### 批量操作

对于复杂任务，使用序列执行：

```c
// 在 Simo 端支持意图序列（已在 /api/intent 中实现）
// MimiClaw 可发送多个意图，Simo 依次执行
```

## 扩展功能

### 添加新工具

按照以下步骤添加自定义工具：

1. 在 `tool_simo.c` 中添加实现函数
2. 在 `tool_simo_get_definitions()` 中添加工具定义
3. 在 `tool_registry.c` 中注册

示例：添加 `simo_autonomy` 工具：

```c
char* tool_simo_autonomy(cJSON *args_json) {
    const char *action = cJSON_GetObjectItem(args_json, "action")->valuestring;
    char endpoint[64];
    snprintf(endpoint, sizeof(endpoint), "/api/autonomy/%s", action);
    return simo_post_request(endpoint, "{}");
}
```

## 安全建议

1. **生产环境启用 Token 鉴权**
   ```bash
   export SIMO_TOOL_TOKEN=your-secret-token
   ```

2. **限制网络访问**
   - 仅允许 MimiClaw IP 访问 Simo API
   - 使用防火墙规则

3. **监控异常行为**
   - 记录所有工具调用
   - 设置速率限制报警

## 参考资源

- [Simo 集成总报告](../../MINICLAW_INTEGRATION.md)
- [MimiClaw 官方文档](https://github.com/memovai/mimiclaw)
- [Simo 工具 API 文档](../README.md)
- [WebSocket 测试脚本](../test-websocket.js)

---

**集成完成！** 现在 MimiClaw 可以通过自然语言控制 Simo 小车了 🎉
