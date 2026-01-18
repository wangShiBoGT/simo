/**
 * Simo 智能小车 - 简化版固件（无舵机）
 * 
 * 功能：
 * - 串口控制运动（F/B/L/R/S）
 * - 传感器读取（SENSOR/DIST/IR）
 * - 蜂鸣器提示（BEEP）
 * - 心跳检测（PING）
 * 
 * 不包含：舵机控制（避免 PWM 冲突问题）
 * 
 * 协议格式：
 * - F,<ms>\n   前进
 * - B,<ms>\n   后退
 * - L,<ms>\n   左转
 * - R,<ms>\n   右转
 * - S\n        停止
 * - PING\n     心跳 → PONG
 * - BEEP\n     蜂鸣器 → OK,BEEP
 * - DIST\n     超声波距离 → DIST,<0.1cm>
 * - IR\n       红外避障 → IR,L<0/1>R<0/1>
 * - SENSOR\n   所有传感器 → SENSOR,D<dist>,L<l>R<r>
 */

#include "stm32f10x.h"
#include "Delay.h"
#include "robot.h"
#include "Key.h"
#include "Serial.h"
#include "Buzzer.h"
#include "UltrasonicWave.h"
#include "Irobstacle.h"
#include "timer.h"
#include <string.h>
#include <stdio.h>
#include <stdlib.h>

// 固定参数
#define FIXED_PWM 85          // 固定 PWM 85%
#define MAX_DURATION 3000     // 最长运动时间 3000ms
#define MIN_DURATION 50       // 最短运动时间 50ms

// 串口接收缓冲区
char rxBuffer[64];
volatile uint8_t rxIndex = 0;
volatile uint8_t rxComplete = 0;

/**
 * 立即停止（最高优先级）
 */
void stop_now(void) {
    robot_speed(0, 0, 0, 0);
}

/**
 * 前进指定毫秒后自动停止
 */
void move_forward(uint16_t ms) {
    if (ms > MAX_DURATION) ms = MAX_DURATION;
    if (ms < MIN_DURATION) ms = MIN_DURATION;
    makerobo_run(FIXED_PWM, ms);
}

/**
 * 后退指定毫秒后自动停止
 */
void move_backward(uint16_t ms) {
    if (ms > MAX_DURATION) ms = MAX_DURATION;
    if (ms < MIN_DURATION) ms = MIN_DURATION;
    makerobo_back(FIXED_PWM, ms);
}

/**
 * 左转指定毫秒后自动停止
 */
void turn_left(uint16_t ms) {
    if (ms > MAX_DURATION) ms = MAX_DURATION;
    if (ms < MIN_DURATION) ms = MIN_DURATION;
    makerobo_Left(FIXED_PWM, ms);
}

/**
 * 右转指定毫秒后自动停止
 */
void turn_right(uint16_t ms) {
    if (ms > MAX_DURATION) ms = MAX_DURATION;
    if (ms < MIN_DURATION) ms = MIN_DURATION;
    makerobo_Right(FIXED_PWM, ms);
}

/**
 * 处理串口命令
 */
void processCommand(char *cmd) {
    int len = strlen(cmd);
    uint16_t ms = 0;
    
    // 去除尾部换行
    while (len > 0 && (cmd[len-1] == '\r' || cmd[len-1] == '\n')) {
        cmd[--len] = '\0';
    }
    if (len == 0) return;
    
    // S - 停止（最高优先级）
    if (strcmp(cmd, "S") == 0) {
        stop_now();
        printf("OK,S\r\n");
        return;
    }
    
    // PING - 心跳
    if (strcmp(cmd, "PING") == 0) {
        printf("PONG\r\n");
        return;
    }
    
    // BEEP - 蜂鸣器
    if (strcmp(cmd, "BEEP") == 0) {
        Buzzer_ON();
        Delay_ms(100);
        Buzzer_OFF();
        printf("OK,BEEP\r\n");
        return;
    }
    
    // DIST - 超声波距离 (单位: 0.1cm)
    if (strcmp(cmd, "DIST") == 0) {
        int dist = UltrasonicWave_StartMeasure();
        printf("DIST,%d\r\n", dist);
        return;
    }
    
    // IR - 红外避障 (0=有障碍, 1=无障碍)
    if (strcmp(cmd, "IR") == 0) {
        uint8_t left = Left_Irobstacle_Get();
        uint8_t right = Right_Irobstacle_Get();
        printf("IR,L%dR%d\r\n", left, right);
        return;
    }
    
    // SENSOR - 所有传感器
    if (strcmp(cmd, "SENSOR") == 0) {
        int dist = UltrasonicWave_StartMeasure();
        uint8_t left = Left_Irobstacle_Get();
        uint8_t right = Right_Irobstacle_Get();
        printf("SENSOR,D%d,L%dR%d\r\n", dist, left, right);
        return;
    }
    
    // 解析 X,ms 格式的命令
    if (len >= 3 && cmd[1] == ',') {
        ms = (uint16_t)atoi(cmd + 2);
        
        switch (cmd[0]) {
            case 'F':  // 前进
                move_forward(ms);
                printf("OK,F,%d\r\n", ms);
                break;
            case 'B':  // 后退
                move_backward(ms);
                printf("OK,B,%d\r\n", ms);
                break;
            case 'L':  // 左转
                turn_left(ms);
                printf("OK,L,%d\r\n", ms);
                break;
            case 'R':  // 右转
                turn_right(ms);
                printf("OK,R,%d\r\n", ms);
                break;
            default:
                printf("ERR,unknown:%s\r\n", cmd);
                break;
        }
        return;
    }
    
    printf("ERR,unknown:%s\r\n", cmd);
}

// 串口中断处理（行缓冲接收）
void USART1_IRQHandler(void) {
    if (USART_GetITStatus(USART1, USART_IT_RXNE) != RESET) {
        char ch = USART_ReceiveData(USART1);
        
        if (ch == '\n' || ch == '\r') {
            if (rxIndex > 0) {
                rxBuffer[rxIndex] = '\0';
                rxComplete = 1;
                rxIndex = 0;
            }
        }
        else if (rxIndex < sizeof(rxBuffer) - 1) {
            rxBuffer[rxIndex++] = ch;
        }
        else {
            rxIndex = 0;
        }
    }
}

int main(void) {
    // 中断优先级分组
    NVIC_PriorityGroupConfig(NVIC_PriorityGroup_2);
    
    // 硬件初始化
    Key_Init();
    Buzzer_Init();
    robot_Init();
    
    // 传感器初始化
    Irobstacle_Init();      // 红外避障 (PA11, PA12)
    UltrasonicWave_Init();  // 超声波 (PB14, PB15)
    Timerx_Init(5000, 7200-1);  // TIM2 用于超声波测距
    
    // 注意：不初始化舵机，避免 PWM 问题
    // Servo_Init();
    // Servo_SetAngle(90);
    
    Serial_Init();   // 115200波特率
    
    // 确保蜂鸣器关闭
    Buzzer_OFF();
    
    // 短暂延时让系统稳定
    Delay_ms(100);
    
    // 蜂鸣器响一声表示启动
    Buzzer_ON();
    Delay_ms(100);
    Buzzer_OFF();
    
    // 发送启动信息
    printf("\r\nSimo Simple Ready!\r\n");
    
    while (1) {
        // 处理串口命令
        if (rxComplete) {
            rxComplete = 0;
            processCommand(rxBuffer);
            memset(rxBuffer, 0, sizeof(rxBuffer));
        }
        
        // 按键测试
        if (Key_GetNum() == 1) {
            printf("Key: forward\r\n");
            makerobo_run(70, 1000);
        }
    }
}
