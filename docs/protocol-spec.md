# Simo 协议规范 v1.0

> **单一事实来源**：所有协议定义以此文档为准
> 
> 最后更新：2026-01-26

---

## 1. 版本信息

| 组件 | 当前版本 | 说明 |
|------|----------|------|
| ESP32固件 | v2.4.1 | `esp32/src/main.cpp` 中的 `FIRMWARE_VERSION` |
| Node后端 | v1.0.0 | `server/index.js` |
| STM32固件 | simo_robot_simple | 使用simple协议 |
| 协议版本 | simple v1.0 | 本文档定义 |

---

## 2. 通信协议（simple v1.0）

### 2.1 命令格式

```
<CMD>[,<PARAM>]\n
```

| 命令 | 格式 | 说明 | 示例 |
|------|------|------|------|
| 前进 | `F,<ms>` | 前进指定毫秒 | `F,500` |
| 后退 | `B,<ms>` | 后退指定毫秒 | `B,500` |
| 左转 | `L,<ms>` | 左转指定毫秒 | `L,300` |
| 右转 | `R,<ms>` | 右转指定毫秒 | `R,300` |
| 停止 | `S` | 立即停止（最高优先级） | `S` |
| 心跳 | `PING` | 连接检测 | `PING` |
| 传感器 | `SENSOR` | 请求传感器数据 | `SENSOR` |
| 蜂鸣器 | `BEEP` | 响一声 | `BEEP` |

### 2.2 响应格式

```
<RESP>[,<DATA>]\r\n
```

| 响应 | 格式 | 说明 |
|------|------|------|
| 心跳回复 | `PONG` | 连接正常 |
| 传感器数据 | `SENSOR,D<dist>,L<l>R<r>` | D=距离cm, L/R=红外(0/1) |
| 命令确认 | `OK` | 命令已执行 |
| 错误 | `ERR,<code>` | 错误码 |

### 2.3 错误码定义

| 错误码 | 含义 | 处理方式 |
|--------|------|----------|
| `ERR,1` | 未知命令 | 忽略 |
| `ERR,2` | 参数错误 | 检查格式 |
| `ERR,3` | 硬件故障 | 重启/人工检查 |
| `ERR,4` | 安全否决 | 障碍物阻挡 |
| `ERR,5` | 超时 | 重试 |

---

## 3. 安全阈值

> 配置文件：`server/hardware.config.js` → `safety.obstacleThresholds`

| 级别 | 距离(cm) | 行为 |
|------|----------|------|
| **danger** | ≤8 | 立即停止，禁止前进 |
| **caution** | 8-15 | 警告，降速 |
| **safe** | >30 | 正常行驶 |

### 3.1 安全优先级（从高到低）

1. **硬件E-STOP**：物理按钮/断电（最高）
2. **软件STOP命令**：`S` 命令立即抢占
3. **传感器否决**：障碍物距离 < danger 时拒绝前进
4. **用户命令**：正常执行

---

## 4. 能力声明API

### 4.1 请求

```
GET /api/hardware/status
```

### 4.2 响应

```json
{
  "capabilities": {
    "motion": true,
    "sensors": true,
    "voice": true,
    "vision": false,
    "autonomy": true
  },
  "protocol": {
    "version": "simple"
  },
  "safetyThresholds": {
    "danger": 8,
    "caution": 15,
    "safe": 30
  },
  "level": "L2",
  "serial": {
    "connected": true,
    "port": "COM5"
  },
  "timestamp": "2026-01-26T12:00:00.000Z"
}
```

---

## 5. OTA更新协议

### 5.1 检查更新

```
GET /api/ota/check?version=<current_version>
```

响应：
```json
{
  "update": true,
  "version": "2.4.2",
  "url": "http://server/api/ota/firmware",
  "hash": "sha256:abc123..."  // 待实现
}
```

### 5.2 下载固件

```
GET /api/ota/firmware
```

响应：`application/octet-stream` 二进制固件

### 5.3 OTA流程

```
ESP32启动 → 注册设备 → 检查更新 → 下载固件 → 校验 → 写入 → 重启
     ↑                                              ↓
     └──────────────── 每5分钟循环 ←───────────────┘
```

---

## 6. 设备注册协议

### 6.1 注册/心跳

```
POST /api/esp32/register
Content-Type: application/json

{
  "mac": "E0:72:A1:D9:9F:34",
  "ip": "192.168.0.109",
  "version": "2.4.1",
  "uptime": 3600
}
```

响应：
```json
{
  "success": true,
  "serverTime": 1706270400000,
  "latestVersion": "2.4.1",
  "updateAvailable": false
}
```

### 6.2 获取在线设备

```
GET /api/esp32/devices
```

响应：
```json
{
  "success": true,
  "devices": [
    {
      "mac": "E0:72:A1:D9:9F:34",
      "ip": "192.168.0.109",
      "version": "2.4.1",
      "uptime": 3600,
      "lastSeen": 1706270400000
    }
  ],
  "count": 1
}
```

---

## 7. 状态机定义

### 7.1 ESP32状态

```
[BOOT] → [SELF_CHECK] → [NETWORK] → [SERVICE] → [READY]
                                                    ↓
                                              [RUNNING] ← 正常循环
                                                    ↓
                                              [OTA_UPDATE] → [REBOOT]
```

### 7.2 运动状态

```
[IDLE] ←→ [MANUAL] ←→ [PATROL]
   ↑          ↑           ↑
   └──────────┴───────────┘
              ↓
         [EMERGENCY_STOP] ← 任何状态可进入
```

---

## 8. 版本兼容性

| ESP32版本 | Node后端版本 | 协议版本 | 兼容性 |
|-----------|-------------|----------|--------|
| v2.4.x | v1.0.x | simple v1.0 | ✅ 完全兼容 |
| v2.3.x | v1.0.x | m-v1 | ⚠️ 需要升级ESP32 |
| v2.2.x | - | 旧协议 | ❌ 不兼容 |

---

## 附录：快速参考

### 常用命令

```bash
# 前进500ms
echo "F,500" > /dev/ttyUSB0

# 停止
echo "S" > /dev/ttyUSB0

# 检查心跳
echo "PING" > /dev/ttyUSB0
# 期望响应: PONG
```

### 调试API

```bash
# 检查硬件状态
curl http://localhost:3001/api/hardware/status

# 查看在线设备
curl http://localhost:3001/api/esp32/devices

# 检查OTA
curl "http://localhost:3001/api/ota/check?version=2.4.0"
```
