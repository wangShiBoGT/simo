# STM32 小车串口协议

## 概述

Simo 通过串口与 STM32 小车通信，实现语音/前端控制小车运动。

## 通信参数

- **波特率**: 115200
- **数据位**: 8
- **停止位**: 1
- **校验**: 无
- **端口**: COM5 (Windows) 或 /dev/ttyUSB0 (Linux)

## 协议格式

ASCII 文本 + `\n` 结尾

### 命令列表

| 命令 | 格式 | 说明 |
|------|------|------|
| 移动 | `M,direction,speed,duration\n` | direction: forward/backward/left/right, speed: 0~1, duration: ms |
| 停止 | `S\n` | 立即停止 |
| 心跳 | `PING\n` | 测试连接，回复 `PONG\n` |

### 示例

```
M,forward,0.50,1000\n    // 前进，速度50%，持续1秒
M,backward,0.30,500\n    // 后退，速度30%，持续0.5秒
M,left,0.50,300\n        // 左转，速度50%，持续0.3秒
M,right,0.50,300\n       // 右转
S\n                      // 停止
PING\n                   // 心跳
```

### 响应

- `OK\n` - 命令执行成功
- `PONG\n` - 心跳响应
- `ERR,message\n` - 错误

---

## STM32 代码修改

基于 **10.机器人蓝牙控制** 程序修改 `main.c`：

```c
#include "stm32f10x.h"
#include "Delay.h"
#include "robot.h"
#include "Key.h"
#include "Serial.h"
#include <string.h>
#include <stdio.h>
#include <stdlib.h>

// 串口接收缓冲区
char rxBuffer[64];
uint8_t rxIndex = 0;
uint8_t rxComplete = 0;

// 解析移动命令: M,direction,speed,duration
void parseMove(char *cmd) {
    char *token;
    char direction[16];
    float speed;
    int duration;
    
    // 跳过 "M,"
    token = strtok(cmd + 2, ",");
    if (token) strcpy(direction, token);
    
    token = strtok(NULL, ",");
    if (token) speed = atof(token);
    
    token = strtok(NULL, ",");
    if (token) duration = atoi(token);
    
    // 将 0~1 速度转换为 0~100
    uint8_t pwmSpeed = (uint8_t)(speed * 100);
    if (pwmSpeed > 100) pwmSpeed = 100;
    
    // 执行运动
    if (strcmp(direction, "forward") == 0) {
        makerobo_run(pwmSpeed, duration);
    } else if (strcmp(direction, "backward") == 0) {
        makerobo_back(pwmSpeed, duration);
    } else if (strcmp(direction, "left") == 0) {
        makerobo_Left(pwmSpeed, duration);
    } else if (strcmp(direction, "right") == 0) {
        makerobo_Right(pwmSpeed, duration);
    }
    
    printf("OK\r\n");
}

// 处理接收到的命令
void processCommand(char *cmd) {
    if (cmd[0] == 'M' && cmd[1] == ',') {
        // 移动命令
        parseMove(cmd);
    } else if (strcmp(cmd, "S") == 0) {
        // 停止命令
        makerobo_brake(100);
        printf("OK\r\n");
    } else if (strcmp(cmd, "PING") == 0) {
        // 心跳
        printf("PONG\r\n");
    } else {
        printf("ERR,unknown command\r\n");
    }
}

int main(void) {
    NVIC_PriorityGroupConfig(NVIC_PriorityGroup_2);
    Key_Init();
    Serial_Init();  // 需要修改波特率为 115200
    robot_Init();
    
    printf("Simo Robot Ready\r\n");
    
    while (1) {
        if (rxComplete) {
            rxComplete = 0;
            processCommand(rxBuffer);
            rxIndex = 0;
            memset(rxBuffer, 0, sizeof(rxBuffer));
        }
    }
}

// 修改 USART1 中断处理（在 Serial.c 或 stm32f10x_it.c 中）
void USART1_IRQHandler(void) {
    if (USART_GetFlagStatus(USART1, USART_IT_RXNE) == SET) {
        char ch = USART_ReceiveData(USART1);
        
        if (ch == '\n' || ch == '\r') {
            if (rxIndex > 0) {
                rxBuffer[rxIndex] = '\0';
                rxComplete = 1;
            }
        } else if (rxIndex < sizeof(rxBuffer) - 1) {
            rxBuffer[rxIndex++] = ch;
        }
        
        USART_ClearITPendingBit(USART1, USART_IT_RXNE);
    }
}
```

## 修改 Serial.c 波特率

将 `Serial_Init()` 中的波特率从 9600 改为 115200：

```c
USART_InitStruture.USART_BaudRate = 115200;  // 原来是 9600
```

---

## 快速测试

1. 烧录修改后的程序到 STM32
2. 打开串口调试助手，连接 COM5，波特率 115200
3. 发送 `PING\n`，应收到 `PONG`
4. 发送 `M,forward,0.50,1000\n`，小车前进1秒

---

## 接线说明

USB转串口模块 → STM32：
- TX → PA10 (RX)
- RX → PA9 (TX)
- GND → GND
