# Simo STM32 小车固件

## 概述

这是 Simo 智能小车的 STM32 固件代码，用于接收 Simo 后端通过串口发送的运动控制命令。

## 使用方法

### 1. 复制文件到原项目

将以下文件复制到 `ZY10A-STM32/10.机器人蓝牙控制/` 目录，**替换**原有文件：

- `main.c` → `User/main.c`
- `Serial.c` → `Hardware/Serial.c`
- `Serial.h` → `Hardware/Serial.h`

### 2. 用 Keil 编译

1. 打开 `Project.uvprojx`
2. 点击 **Build** (F7)
3. 确保编译无错误

### 3. 烧录到小车

1. 用 FlyMcu 烧录 `Objects/Project.hex`
2. 设置：COM5, 115200, DTR低电平复位

### 4. 测试

用串口调试助手发送：
```
PING
```
应收到：
```
PONG
```

发送移动命令：
```
M,forward,0.50,1000
```
小车前进1秒。

## 串口协议

| 命令 | 格式 | 说明 |
|------|------|------|
| 移动 | `M,direction,speed,duration\n` | direction: forward/backward/left/right |
| 停止 | `S\n` | 立即停止 |
| 心跳 | `PING\n` | 回复 PONG |

## 接线

USB转串口 → STM32：
- TX → PA10 (RX)
- RX → PA9 (TX)
- GND → GND

## 注意事项

1. 波特率必须是 **115200**
2. 命令必须以 `\n` 结尾
3. 烧录时需要断开蓝牙模块
