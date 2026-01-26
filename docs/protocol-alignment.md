# Simo 运动协议统一方案

## 问题背景

仓库中存在两套STM32固件和两套协议，导致：
- ESP32/Node/STM32 三者协议不对齐
- "某条链路能动、另一条不动"

## 协议定义

### 固件A: simo_robot_simple（推荐稳定基线）

```
F,<ms>\n    前进，毫秒后自动停止
B,<ms>\n    后退
L,<ms>\n    左转
R,<ms>\n    右转
S\n         立即停止
PING\n      心跳 → PONG
SENSOR\n    传感器 → SENSOR,D<dist>,L<l>R<r>
BEEP\n      蜂鸣器
```

特点：
- 不包含舵机控制（避免PWM冲突）
- 固定PWM 85%，只控制时长
- 协议简单，链路可控

### 固件B: simo_robot（M协议版）

```
M,forward,speed,duration\n   前进
M,backward,speed,duration\n  后退
M,left,speed,duration\n      左转
M,right,speed,duration\n     右转
S\n                          停止
PING\n                       心跳
```

特点：
- 支持速度控制（0~1浮点数）
- direction使用英文单词

## 当前状态

| 端 | 协议配置 | 状态 |
|----|----------|------|
| ESP32 | `MOTION_PROTOCOL = "simple"` | ✅ 已对齐 |
| Node | `motionProtocol = "simple"` | ✅ 已对齐 |
| STM32 | 烧录simo_robot_simple | ✅ |

## ESP32 实现

```cpp
// 运动协议配置
#define MOTION_PROTOCOL "simple"

void sendToSTM32(const char* cmd, int speed, int duration) {
    if (strcmp(protocol, "simple") == 0) {
        // simple协议: F,<ms>
        snprintf(buffer, sizeof(buffer), "%s,%d\n", cmd, duration);
    } else {
        // m-v1协议: M,forward,speed,duration
        snprintf(buffer, sizeof(buffer), "M,%s,%.2f,%d\n", dirName, speedFloat, duration);
    }
}
```

## Node端改造清单（已完成）

### 1. ConfirmManager.execute ✅
**问题**：直接拼串口字符串，绕过统一入口
**修复**：改用 `serial.sendMove()/sendStop()`

### 2. serial.js ✅
**问题**：`sendMove()` 发送 M 协议格式
**修复**：添加 `motionProtocol` 配置，自动选择格式

### 3. avoid.manager.js ✅
**问题**：Autonomy 直接 `serial.send(...)`
**修复**：改用 `serial.sendMove()`，阈值从统一配置读取

### 4. hardware.config.js ✅
**新增**：
- `safety.obstacleThresholds` 统一阈值配置
- `capabilities` 固件能力声明
- `protocol` 协议配置

### 5. /api/hardware/status ✅
**新增**：返回能力开关、协议版本、安全阈值

## 测试用例

### ESP32 → STM32（simple协议）

| 测试 | 发送 | 预期响应 |
|------|------|----------|
| 前进500ms | `F,500\n` | `OK,F` |
| 后退300ms | `B,300\n` | `OK,B` |
| 停止 | `S\n` | `OK,S` |
| 心跳 | `PING\n` | `PONG` |
| 传感器 | `SENSOR\n` | `SENSOR,D12.5,L0R1` |

## 切换协议

如需使用M协议版固件，修改ESP32配置：

```cpp
#define MOTION_PROTOCOL "m-v1"
```

然后重新编译烧录。
