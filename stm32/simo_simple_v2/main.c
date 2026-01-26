/**
 * Simo 智能小车 - 极简版固件 V2
 * 
 * 功能：只做串口接收 + 电机控制，无舵机无传感器
 * 
 * 协议：
 *   F,<ms>\n  前进
 *   B,<ms>\n  后退
 *   L,<ms>\n  左转
 *   R,<ms>\n  右转
 *   S\n       停止
 *   PING\n    心跳 → PONG
 * 
 * 硬件：
 *   串口: USART1, PA9(TX), PA10(RX), 115200bps
 *   电机: TIM4 PWM, PB6/PB7(左), PB8/PB9(右)
 */

#include "stm32f10x.h"
#include <string.h>
#include <stdio.h>
#include <stdlib.h>

// ============ 配置参数 ============
#define MOTOR_PWM_SPEED  80      // 电机速度 0-100
#define MAX_DURATION     3000    // 最大运动时间 ms
#define MIN_DURATION     50      // 最小运动时间 ms

// ============ 串口缓冲区 ============
static char rxBuffer[64];
static volatile uint8_t rxIndex = 0;
static volatile uint8_t rxComplete = 0;

// ============ 延时函数 ============
static void Delay_ms(uint32_t ms)
{
    uint32_t i, j;
    for (i = 0; i < ms; i++)
        for (j = 0; j < 7200; j++);  // 72MHz 时约 1ms
}

// ============ 串口初始化 ============
static void USART1_Init(void)
{
    GPIO_InitTypeDef GPIO_InitStruct;
    USART_InitTypeDef USART_InitStruct;
    NVIC_InitTypeDef NVIC_InitStruct;
    
    // 使能时钟
    RCC_APB2PeriphClockCmd(RCC_APB2Periph_USART1 | RCC_APB2Periph_GPIOA, ENABLE);
    
    // PA9 = TX (复用推挽输出)
    GPIO_InitStruct.GPIO_Pin = GPIO_Pin_9;
    GPIO_InitStruct.GPIO_Mode = GPIO_Mode_AF_PP;
    GPIO_InitStruct.GPIO_Speed = GPIO_Speed_50MHz;
    GPIO_Init(GPIOA, &GPIO_InitStruct);
    
    // PA10 = RX (浮空输入)
    GPIO_InitStruct.GPIO_Pin = GPIO_Pin_10;
    GPIO_InitStruct.GPIO_Mode = GPIO_Mode_IN_FLOATING;
    GPIO_Init(GPIOA, &GPIO_InitStruct);
    
    // 串口配置: 115200, 8N1
    USART_InitStruct.USART_BaudRate = 115200;
    USART_InitStruct.USART_WordLength = USART_WordLength_8b;
    USART_InitStruct.USART_StopBits = USART_StopBits_1;
    USART_InitStruct.USART_Parity = USART_Parity_No;
    USART_InitStruct.USART_HardwareFlowControl = USART_HardwareFlowControl_None;
    USART_InitStruct.USART_Mode = USART_Mode_Rx | USART_Mode_Tx;
    USART_Init(USART1, &USART_InitStruct);
    
    // 使能接收中断
    USART_ITConfig(USART1, USART_IT_RXNE, ENABLE);
    
    // 中断优先级
    NVIC_InitStruct.NVIC_IRQChannel = USART1_IRQn;
    NVIC_InitStruct.NVIC_IRQChannelPreemptionPriority = 1;
    NVIC_InitStruct.NVIC_IRQChannelSubPriority = 0;
    NVIC_InitStruct.NVIC_IRQChannelCmd = ENABLE;
    NVIC_Init(&NVIC_InitStruct);
    
    // 使能串口
    USART_Cmd(USART1, ENABLE);
}

// 发送单个字符
static void USART1_SendChar(char ch)
{
    while (USART_GetFlagStatus(USART1, USART_FLAG_TXE) == RESET);
    USART_SendData(USART1, ch);
}

// 发送字符串
static void USART1_SendString(const char *str)
{
    while (*str) {
        USART1_SendChar(*str++);
    }
}

// 重定向 printf
int fputc(int ch, FILE *f)
{
    USART1_SendChar((char)ch);
    return ch;
}

// ============ 电机PWM初始化 ============
static void Motor_Init(void)
{
    GPIO_InitTypeDef GPIO_InitStruct;
    TIM_TimeBaseInitTypeDef TIM_TimeBaseStruct;
    TIM_OCInitTypeDef TIM_OCInitStruct;
    
    // 使能时钟
    RCC_APB1PeriphClockCmd(RCC_APB1Periph_TIM4, ENABLE);
    RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOB, ENABLE);
    
    // PB6, PB7, PB8, PB9 = PWM输出
    GPIO_InitStruct.GPIO_Pin = GPIO_Pin_6 | GPIO_Pin_7 | GPIO_Pin_8 | GPIO_Pin_9;
    GPIO_InitStruct.GPIO_Mode = GPIO_Mode_AF_PP;
    GPIO_InitStruct.GPIO_Speed = GPIO_Speed_50MHz;
    GPIO_Init(GPIOB, &GPIO_InitStruct);
    
    // TIM4 基本配置: 20kHz PWM, 0-100 占空比
    TIM_TimeBaseStruct.TIM_Period = 100 - 1;      // ARR = 99
    TIM_TimeBaseStruct.TIM_Prescaler = 36 - 1;    // PSC = 35 (72MHz/36/100 = 20kHz)
    TIM_TimeBaseStruct.TIM_ClockDivision = 0;
    TIM_TimeBaseStruct.TIM_CounterMode = TIM_CounterMode_Up;
    TIM_TimeBaseInit(TIM4, &TIM_TimeBaseStruct);
    
    // PWM模式配置
    TIM_OCInitStruct.TIM_OCMode = TIM_OCMode_PWM1;
    TIM_OCInitStruct.TIM_OutputState = TIM_OutputState_Enable;
    TIM_OCInitStruct.TIM_Pulse = 0;
    TIM_OCInitStruct.TIM_OCPolarity = TIM_OCPolarity_High;
    
    TIM_OC1Init(TIM4, &TIM_OCInitStruct);  // CH1 = PB6
    TIM_OC2Init(TIM4, &TIM_OCInitStruct);  // CH2 = PB7
    TIM_OC3Init(TIM4, &TIM_OCInitStruct);  // CH3 = PB8
    TIM_OC4Init(TIM4, &TIM_OCInitStruct);  // CH4 = PB9
    
    TIM_OC1PreloadConfig(TIM4, TIM_OCPreload_Enable);
    TIM_OC2PreloadConfig(TIM4, TIM_OCPreload_Enable);
    TIM_OC3PreloadConfig(TIM4, TIM_OCPreload_Enable);
    TIM_OC4PreloadConfig(TIM4, TIM_OCPreload_Enable);
    TIM_ARRPreloadConfig(TIM4, ENABLE);
    
    TIM_Cmd(TIM4, ENABLE);
}

// 设置电机速度 (0-100)
// left1=左正转, left2=左反转, right1=右正转, right2=右反转
static void Motor_SetSpeed(uint8_t left1, uint8_t left2, uint8_t right1, uint8_t right2)
{
    TIM_SetCompare1(TIM4, left1);   // PB6
    TIM_SetCompare2(TIM4, left2);   // PB7
    TIM_SetCompare3(TIM4, right1);  // PB8
    TIM_SetCompare4(TIM4, right2);  // PB9
}

// ============ 运动控制 ============
static void Motor_Stop(void)
{
    Motor_SetSpeed(0, 0, 0, 0);
}

static void Motor_Forward(uint16_t ms)
{
    if (ms > MAX_DURATION) ms = MAX_DURATION;
    if (ms < MIN_DURATION) ms = MIN_DURATION;
    Motor_SetSpeed(MOTOR_PWM_SPEED, 0, MOTOR_PWM_SPEED, 0);
    Delay_ms(ms);
    Motor_Stop();
}

static void Motor_Backward(uint16_t ms)
{
    if (ms > MAX_DURATION) ms = MAX_DURATION;
    if (ms < MIN_DURATION) ms = MIN_DURATION;
    Motor_SetSpeed(0, MOTOR_PWM_SPEED, 0, MOTOR_PWM_SPEED);
    Delay_ms(ms);
    Motor_Stop();
}

static void Motor_Left(uint16_t ms)
{
    if (ms > MAX_DURATION) ms = MAX_DURATION;
    if (ms < MIN_DURATION) ms = MIN_DURATION;
    Motor_SetSpeed(0, 0, MOTOR_PWM_SPEED, 0);  // 只有右轮转
    Delay_ms(ms);
    Motor_Stop();
}

static void Motor_Right(uint16_t ms)
{
    if (ms > MAX_DURATION) ms = MAX_DURATION;
    if (ms < MIN_DURATION) ms = MIN_DURATION;
    Motor_SetSpeed(MOTOR_PWM_SPEED, 0, 0, 0);  // 只有左轮转
    Delay_ms(ms);
    Motor_Stop();
}

// ============ 命令处理 ============
static void ProcessCommand(char *cmd)
{
    int len = strlen(cmd);
    uint16_t ms = 0;
    
    // 去除尾部换行
    while (len > 0 && (cmd[len-1] == '\r' || cmd[len-1] == '\n')) {
        cmd[--len] = '\0';
    }
    if (len == 0) return;
    
    // S - 停止
    if (strcmp(cmd, "S") == 0) {
        Motor_Stop();
        printf("OK,S\r\n");
        return;
    }
    
    // PING - 心跳
    if (strcmp(cmd, "PING") == 0) {
        printf("PONG\r\n");
        return;
    }
    
    // 解析 X,ms 格式
    if (len >= 3 && cmd[1] == ',') {
        ms = (uint16_t)atoi(cmd + 2);
        
        switch (cmd[0]) {
            case 'F':
                Motor_Forward(ms);
                printf("OK,F,%d\r\n", ms);
                break;
            case 'B':
                Motor_Backward(ms);
                printf("OK,B,%d\r\n", ms);
                break;
            case 'L':
                Motor_Left(ms);
                printf("OK,L,%d\r\n", ms);
                break;
            case 'R':
                Motor_Right(ms);
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

// ============ 串口中断 ============
void USART1_IRQHandler(void)
{
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
            rxIndex = 0;  // 缓冲区溢出，重置
        }
    }
}

// ============ 主函数 ============
int main(void)
{
    // 中断优先级分组
    NVIC_PriorityGroupConfig(NVIC_PriorityGroup_2);
    
    // 初始化
    USART1_Init();
    Motor_Init();
    
    // 确保电机停止
    Motor_Stop();
    
    // 启动延时
    Delay_ms(100);
    
    // 发送启动信息
    printf("\r\nSimo V2 Ready!\r\n");
    
    // 主循环
    while (1) {
        if (rxComplete) {
            rxComplete = 0;
            ProcessCommand(rxBuffer);
            memset(rxBuffer, 0, sizeof(rxBuffer));
        }
    }
}
