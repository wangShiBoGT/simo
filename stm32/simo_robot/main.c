/**
 * Simo 智能小车 - 串口控制程序
 * 
 * 基于 ZY10A-STM32 案例9（超声波避障）修改
 * 支持通过串口接收 Simo 后端发送的运动命令
 * 
 * 协议格式：ASCII + \n
 * - M,direction,speed,duration\n  移动命令
 * - S\n                           停止命令
 * - PING\n                        心跳测试
 */

#include "stm32f10x.h"
#include "Delay.h"
#include "robot.h"
#include "Key.h"
#include "Serial.h"
#include "Buzzer.h"
#include <string.h>
#include <stdio.h>
#include <stdlib.h>

// 串口接收缓冲区（外部定义，在 Serial.c 中）
extern char rxBuffer[64];
extern volatile uint8_t rxComplete;

/**
 * 解析移动命令
 * 格式: M,direction,speed,duration
 * 例如: M,forward,0.50,1000
 */
void parseMove(char *cmd) {
    char direction[16] = {0};
    float speed = 0.5f;
    int duration = 500;
    
    // 解析命令参数
    // 格式: M,forward,0.50,1000
    char *p = cmd + 2;  // 跳过 "M,"
    char *comma1 = strchr(p, ',');
    char *comma2 = comma1 ? strchr(comma1 + 1, ',') : NULL;
    
    if (comma1) {
        // 提取 direction
        int len = comma1 - p;
        if (len > 0 && len < 16) {
            strncpy(direction, p, len);
            direction[len] = '\0';
        }
        
        // 提取 speed
        if (comma2) {
            char speedStr[16] = {0};
            len = comma2 - comma1 - 1;
            if (len > 0 && len < 16) {
                strncpy(speedStr, comma1 + 1, len);
                speed = (float)atof(speedStr);
            }
            
            // 提取 duration
            duration = atoi(comma2 + 1);
        }
    }
    
    // 将 0~1 速度转换为 0~100 PWM
    uint8_t pwmSpeed = (uint8_t)(speed * 100);
    if (pwmSpeed > 100) pwmSpeed = 100;
    if (pwmSpeed < 20) pwmSpeed = 20;  // 最小速度保证能动
    
    // 限制最大持续时间（安全考虑）
    if (duration > 5000) duration = 5000;
    if (duration < 50) duration = 50;
    
    // 执行运动
    if (strcmp(direction, "forward") == 0) {
        makerobo_run(pwmSpeed, duration);
        printf("OK,forward,%d,%d\r\n", pwmSpeed, duration);
    } else if (strcmp(direction, "backward") == 0) {
        makerobo_back(pwmSpeed, duration);
        printf("OK,backward,%d,%d\r\n", pwmSpeed, duration);
    } else if (strcmp(direction, "left") == 0) {
        makerobo_Left(pwmSpeed, duration);
        printf("OK,left,%d,%d\r\n", pwmSpeed, duration);
    } else if (strcmp(direction, "right") == 0) {
        makerobo_Right(pwmSpeed, duration);
        printf("OK,right,%d,%d\r\n", pwmSpeed, duration);
    } else {
        printf("ERR,unknown direction: %s\r\n", direction);
    }
}

/**
 * 处理接收到的命令
 */
void processCommand(char *cmd) {
    // 去除末尾的 \r\n
    int len = strlen(cmd);
    while (len > 0 && (cmd[len-1] == '\r' || cmd[len-1] == '\n')) {
        cmd[--len] = '\0';
    }
    
    if (len == 0) return;
    
    // 移动命令: M,direction,speed,duration
    if (cmd[0] == 'M' && len > 2 && cmd[1] == ',') {
        parseMove(cmd);
    }
    // 停止命令: S
    else if (strcmp(cmd, "S") == 0) {
        robot_speed(0, 0, 0, 0);  // 立即停止
        printf("OK,stop\r\n");
    }
    // 心跳: PING
    else if (strcmp(cmd, "PING") == 0) {
        printf("PONG\r\n");
    }
    // 未知命令
    else {
        printf("ERR,unknown: %s\r\n", cmd);
    }
}

int main(void) {
    // 中断优先级分组
    NVIC_PriorityGroupConfig(NVIC_PriorityGroup_2);
    
    // 初始化
    Key_Init();
    Serial_Init();   // 串口初始化（115200）
    robot_Init();    // 机器人初始化
    
    // 启动提示
    printf("\r\n");
    printf("================================\r\n");
    printf("  Simo Robot Ready!\r\n");
    printf("  Baudrate: 115200\r\n");
    printf("  Commands: M,S,PING\r\n");
    printf("================================\r\n");
    
    while (1) {
        // 检查是否收到完整命令
        if (rxComplete) {
            rxComplete = 0;
            processCommand(rxBuffer);
            memset(rxBuffer, 0, sizeof(rxBuffer));
        }
        
        // 按键测试（按下按键前进1秒）
        if (Key_GetNum() == 1) {
            printf("Key pressed, test forward\r\n");
            makerobo_run(70, 1000);
        }
    }
}
