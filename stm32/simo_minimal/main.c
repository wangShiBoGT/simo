/**
 * Simo 智能小车 - 极简独立固件
 * 
 * 特点：不依赖任何外部硬件模块文件，全部代码内联
 * 无舵机，无PWM冲突
 * 
 * 协议：
 *   F,<ms>  前进    → OK,F,<ms>
 *   B,<ms>  后退    → OK,B,<ms>
 *   L,<ms>  左转    → OK,L,<ms>
 *   R,<ms>  右转    → OK,R,<ms>
 *   S       停止    → OK,S
 *   PING    心跳    → PONG
 *   BEEP    蜂鸣器  → OK,BEEP
 *   SENSOR  传感器  → SENSOR,D<dist>,OL<l>OR<r>,TL<l>TR<r>
 */

#include "stm32f10x.h"
#include <string.h>
#include <stdio.h>
#include <stdlib.h>

// ============ 配置 ============
#define MOTOR_SPEED      80
#define MAX_DURATION     3000
#define MIN_DURATION     50

// ============ 引脚定义 ============
// 蜂鸣器: PB0
// 红外避障: PA11(左), PA12(右)
// 红外循迹: PB13(左), PB12(右)
// 超声波: PB15(TRIG), PB14(ECHO)
// 电机PWM: PB6/PB7/PB8/PB9 (TIM4)

// ============ 外部变量（来自 Serial.c）============
extern char rxBuffer[64];
extern volatile uint8_t rxIndex;
extern volatile uint8_t rxComplete;

// 外部函数声明
void Serial_Init(void);

// ============ 延时函数 ============
static void delay_us(uint32_t us) {
    volatile uint32_t i;
    for (i = 0; i < us * 8; i++);
}

static void delay_ms(uint32_t ms) {
    volatile uint32_t i, j;
    for (i = 0; i < ms; i++)
        for (j = 0; j < 7200; j++);
}

// 串口初始化使用 Serial.c 中的 Serial_Init()

// ============ 电机 ============
static void motor_init(void) {
    GPIO_InitTypeDef GPIO_InitStruct;
    TIM_TimeBaseInitTypeDef TIM_TimeBaseStruct;
    TIM_OCInitTypeDef TIM_OCInitStruct;
    
    RCC_APB1PeriphClockCmd(RCC_APB1Periph_TIM4, ENABLE);
    RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOB, ENABLE);
    
    GPIO_InitStruct.GPIO_Pin = GPIO_Pin_6 | GPIO_Pin_7 | GPIO_Pin_8 | GPIO_Pin_9;
    GPIO_InitStruct.GPIO_Mode = GPIO_Mode_AF_PP;
    GPIO_InitStruct.GPIO_Speed = GPIO_Speed_50MHz;
    GPIO_Init(GPIOB, &GPIO_InitStruct);
    
    TIM_TimeBaseStruct.TIM_Period = 99;
    TIM_TimeBaseStruct.TIM_Prescaler = 35;
    TIM_TimeBaseStruct.TIM_ClockDivision = 0;
    TIM_TimeBaseStruct.TIM_CounterMode = TIM_CounterMode_Up;
    TIM_TimeBaseInit(TIM4, &TIM_TimeBaseStruct);
    
    TIM_OCInitStruct.TIM_OCMode = TIM_OCMode_PWM1;
    TIM_OCInitStruct.TIM_OutputState = TIM_OutputState_Enable;
    TIM_OCInitStruct.TIM_Pulse = 0;
    TIM_OCInitStruct.TIM_OCPolarity = TIM_OCPolarity_High;
    
    TIM_OC1Init(TIM4, &TIM_OCInitStruct);
    TIM_OC2Init(TIM4, &TIM_OCInitStruct);
    TIM_OC3Init(TIM4, &TIM_OCInitStruct);
    TIM_OC4Init(TIM4, &TIM_OCInitStruct);
    
    TIM_OC1PreloadConfig(TIM4, TIM_OCPreload_Enable);
    TIM_OC2PreloadConfig(TIM4, TIM_OCPreload_Enable);
    TIM_OC3PreloadConfig(TIM4, TIM_OCPreload_Enable);
    TIM_OC4PreloadConfig(TIM4, TIM_OCPreload_Enable);
    TIM_ARRPreloadConfig(TIM4, ENABLE);
    
    TIM_Cmd(TIM4, ENABLE);
}

static void motor_set(uint8_t l1, uint8_t l2, uint8_t r1, uint8_t r2) {
    TIM_SetCompare1(TIM4, l1);
    TIM_SetCompare2(TIM4, l2);
    TIM_SetCompare3(TIM4, r1);
    TIM_SetCompare4(TIM4, r2);
}

static void motor_stop(void) { motor_set(0, 0, 0, 0); }

static void motor_forward(uint16_t ms) {
    if (ms > MAX_DURATION) ms = MAX_DURATION;
    if (ms < MIN_DURATION) ms = MIN_DURATION;
    motor_set(MOTOR_SPEED, 0, MOTOR_SPEED, 0);
    delay_ms(ms);
    motor_stop();
}

static void motor_backward(uint16_t ms) {
    if (ms > MAX_DURATION) ms = MAX_DURATION;
    if (ms < MIN_DURATION) ms = MIN_DURATION;
    motor_set(0, MOTOR_SPEED, 0, MOTOR_SPEED);
    delay_ms(ms);
    motor_stop();
}

static void motor_left(uint16_t ms) {
    if (ms > MAX_DURATION) ms = MAX_DURATION;
    if (ms < MIN_DURATION) ms = MIN_DURATION;
    motor_set(0, 0, MOTOR_SPEED, 0);
    delay_ms(ms);
    motor_stop();
}

static void motor_right(uint16_t ms) {
    if (ms > MAX_DURATION) ms = MAX_DURATION;
    if (ms < MIN_DURATION) ms = MIN_DURATION;
    motor_set(MOTOR_SPEED, 0, 0, 0);
    delay_ms(ms);
    motor_stop();
}

// ============ 蜂鸣器 ============
static void buzzer_init(void) {
    GPIO_InitTypeDef GPIO_InitStruct;
    RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOB, ENABLE);
    
    GPIO_InitStruct.GPIO_Pin = GPIO_Pin_0;
    GPIO_InitStruct.GPIO_Mode = GPIO_Mode_Out_PP;
    GPIO_InitStruct.GPIO_Speed = GPIO_Speed_50MHz;
    GPIO_Init(GPIOB, &GPIO_InitStruct);
    // 低电平响，高电平关
    GPIO_SetBits(GPIOB, GPIO_Pin_0);  // 初始化为关闭状态
}

static void buzzer_beep(uint16_t ms) {
    GPIO_ResetBits(GPIOB, GPIO_Pin_0);  // 低电平响
    delay_ms(ms);
    GPIO_SetBits(GPIOB, GPIO_Pin_0);    // 高电平关
}

// ============ 红外避障 ============
static void ir_obstacle_init(void) {
    GPIO_InitTypeDef GPIO_InitStruct;
    RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOA, ENABLE);
    
    GPIO_InitStruct.GPIO_Pin = GPIO_Pin_11 | GPIO_Pin_12;
    GPIO_InitStruct.GPIO_Mode = GPIO_Mode_IPU;
    GPIO_InitStruct.GPIO_Speed = GPIO_Speed_50MHz;
    GPIO_Init(GPIOA, &GPIO_InitStruct);
}

static uint8_t ir_obstacle_left(void) { return GPIO_ReadInputDataBit(GPIOA, GPIO_Pin_11); }
static uint8_t ir_obstacle_right(void) { return GPIO_ReadInputDataBit(GPIOA, GPIO_Pin_12); }

// ============ 红外循迹 ============
static void ir_tracking_init(void) {
    GPIO_InitTypeDef GPIO_InitStruct;
    RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOB, ENABLE);
    
    GPIO_InitStruct.GPIO_Pin = GPIO_Pin_12 | GPIO_Pin_13;
    GPIO_InitStruct.GPIO_Mode = GPIO_Mode_IPU;
    GPIO_InitStruct.GPIO_Speed = GPIO_Speed_50MHz;
    GPIO_Init(GPIOB, &GPIO_InitStruct);
}

static uint8_t ir_tracking_left(void) { return GPIO_ReadInputDataBit(GPIOB, GPIO_Pin_13); }
static uint8_t ir_tracking_right(void) { return GPIO_ReadInputDataBit(GPIOB, GPIO_Pin_12); }

// ============ 超声波 ============
static void ultrasonic_init(void) {
    GPIO_InitTypeDef GPIO_InitStruct;
    RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOB, ENABLE);
    
    // TRIG - PB15 输出
    GPIO_InitStruct.GPIO_Pin = GPIO_Pin_15;
    GPIO_InitStruct.GPIO_Mode = GPIO_Mode_Out_PP;
    GPIO_InitStruct.GPIO_Speed = GPIO_Speed_50MHz;
    GPIO_Init(GPIOB, &GPIO_InitStruct);
    GPIO_ResetBits(GPIOB, GPIO_Pin_15);
    
    // ECHO - PB14 输入
    GPIO_InitStruct.GPIO_Pin = GPIO_Pin_14;
    GPIO_InitStruct.GPIO_Mode = GPIO_Mode_IPD;
    GPIO_Init(GPIOB, &GPIO_InitStruct);
}

static int ultrasonic_measure(void) {
    uint32_t timeout, time_us = 0;
    int distance;
    
    // 触发脉冲
    GPIO_SetBits(GPIOB, GPIO_Pin_15);
    delay_us(15);
    GPIO_ResetBits(GPIOB, GPIO_Pin_15);
    
    // 等待ECHO变高
    timeout = 10000;
    while(GPIO_ReadInputDataBit(GPIOB, GPIO_Pin_14) == 0) {
        delay_us(1);
        if(--timeout == 0) return 0;
    }
    
    // 测量高电平时间
    timeout = 30000;
    while(GPIO_ReadInputDataBit(GPIOB, GPIO_Pin_14) == 1) {
        delay_us(1);
        time_us++;
        if(--timeout == 0) return 0;
    }
    
    distance = (time_us * 34) / 200;
    if(distance > 4000) distance = 4000;
    return distance;
}

// ============ 命令处理 ============
static void process_command(char *cmd) {
    int len = strlen(cmd);
    uint16_t ms = 0;
    
    while (len > 0 && (cmd[len-1] == '\r' || cmd[len-1] == '\n')) {
        cmd[--len] = '\0';
    }
    if (len == 0) return;
    
    if (strcmp(cmd, "S") == 0) {
        motor_stop();
        printf("OK,S\r\n");
        return;
    }
    
    if (strcmp(cmd, "PING") == 0) {
        printf("PONG\r\n");
        return;
    }
    
    if (strcmp(cmd, "BEEP") == 0) {
        buzzer_beep(100);
        printf("OK,BEEP\r\n");
        return;
    }
    
    if (strcmp(cmd, "DIST") == 0) {
        int d = ultrasonic_measure();
        printf("DIST,%d\r\n", d);
        return;
    }
    
    if (strcmp(cmd, "IR") == 0) {
        printf("IR,L%dR%d\r\n", ir_obstacle_left(), ir_obstacle_right());
        return;
    }
    
    if (strcmp(cmd, "TRACK") == 0) {
        printf("TRACK,L%dR%d\r\n", ir_tracking_left(), ir_tracking_right());
        return;
    }
    
    if (strcmp(cmd, "SENSOR") == 0) {
        int d = ultrasonic_measure();
        printf("SENSOR,D%d,OL%dOR%d,TL%dTR%d\r\n", 
            d, ir_obstacle_left(), ir_obstacle_right(),
            ir_tracking_left(), ir_tracking_right());
        return;
    }
    
    if (len >= 3 && cmd[1] == ',') {
        ms = (uint16_t)atoi(cmd + 2);
        switch (cmd[0]) {
            case 'F': motor_forward(ms); printf("OK,F,%d\r\n", ms); break;
            case 'B': motor_backward(ms); printf("OK,B,%d\r\n", ms); break;
            case 'L': motor_left(ms); printf("OK,L,%d\r\n", ms); break;
            case 'R': motor_right(ms); printf("OK,R,%d\r\n", ms); break;
            default: printf("ERR,unknown:%s\r\n", cmd); break;
        }
        return;
    }
    
    printf("ERR,unknown:%s\r\n", cmd);
}

// USART1_IRQHandler 在 Serial.c 中定义

// ============ 主函数 ============
int main(void) {
    NVIC_PriorityGroupConfig(NVIC_PriorityGroup_2);
    
    // 初始化
    Serial_Init();
    motor_init();
    ir_obstacle_init();
    ir_tracking_init();
    ultrasonic_init();
    
    // 蜂鸣器：设置为浮空输入，不驱动
    {
        GPIO_InitTypeDef buzzerGpio;
        buzzerGpio.GPIO_Pin = GPIO_Pin_0;
        buzzerGpio.GPIO_Mode = GPIO_Mode_IN_FLOATING;
        GPIO_Init(GPIOB, &buzzerGpio);
    }
    
    motor_stop();
    delay_ms(100);
    
    printf("\r\nSimo Minimal Ready!\r\n");
    
    while (1) {
        if (rxComplete) {
            rxComplete = 0;
            process_command(rxBuffer);
            memset(rxBuffer, 0, sizeof(rxBuffer));
        }
    }
}
