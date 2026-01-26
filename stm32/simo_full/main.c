/**
 * Simo 智能小车 - 全功能固件
 * 
 * 硬件支持：
 *   - 电机控制 (TIM4 PWM: PB6/PB7/PB8/PB9)
 *   - 蜂鸣器 (PB0)
 *   - 红外避障 (PA11左, PA12右)
 *   - 超声波测距 (PB15 TRIG, PB14 ECHO)
 *   - 红外循迹 (PB13左, PB12右)
 *   - 按键 (PA15)
 * 
 * 串口协议 (115200bps, PA9 TX, PA10 RX)：
 *   运动控制：
 *     F,<ms>    前进
 *     B,<ms>    后退
 *     L,<ms>    左转
 *     R,<ms>    右转
 *     S         停止
 *   
 *   传感器读取：
 *     PING      心跳 → PONG
 *     BEEP      蜂鸣器响一声 → OK,BEEP
 *     DIST      超声波距离 → DIST,<0.1cm>
 *     IR        红外避障 → IR,L<0/1>R<0/1>
 *     TRACK     红外循迹 → TRACK,L<0/1>R<0/1>
 *     SENSOR    所有传感器 → SENSOR,D<dist>,OL<l>OR<r>,TL<l>TR<r>
 *     KEY       按键状态 → KEY,<0/1>
 */

#include "stm32f10x.h"
#include <string.h>
#include <stdio.h>
#include <stdlib.h>

// ============ 配置参数 ============
#define MOTOR_PWM_SPEED  80      // 电机速度 0-100
#define MAX_DURATION     3000    // 最大运动时间 ms
#define MIN_DURATION     50      // 最小运动时间 ms

// ============ 引脚定义 ============
// 蜂鸣器
#define BUZZER_PORT      GPIOB
#define BUZZER_PIN       GPIO_Pin_0

// 红外避障
#define IR_OBS_L_PORT    GPIOA
#define IR_OBS_L_PIN     GPIO_Pin_11
#define IR_OBS_R_PORT    GPIOA
#define IR_OBS_R_PIN     GPIO_Pin_12

// 红外循迹
#define IR_TRACK_L_PORT  GPIOB
#define IR_TRACK_L_PIN   GPIO_Pin_13
#define IR_TRACK_R_PORT  GPIOB
#define IR_TRACK_R_PIN   GPIO_Pin_12

// 超声波
#define US_TRIG_PORT     GPIOB
#define US_TRIG_PIN      GPIO_Pin_15
#define US_ECHO_PORT     GPIOB
#define US_ECHO_PIN      GPIO_Pin_14

// 按键
#define KEY_PORT         GPIOA
#define KEY_PIN          GPIO_Pin_15

// ============ 串口缓冲区 ============
static char rxBuffer[64];
static volatile uint8_t rxIndex = 0;
static volatile uint8_t rxComplete = 0;

// ============ 延时函数 ============
static void Delay_us(uint32_t us)
{
    uint32_t i;
    for (i = 0; i < us * 8; i++);
}

static void Delay_ms(uint32_t ms)
{
    uint32_t i;
    for (i = 0; i < ms; i++)
        Delay_us(1000);
}

// ============ 串口初始化 ============
static void USART1_Init(void)
{
    GPIO_InitTypeDef GPIO_InitStruct;
    USART_InitTypeDef USART_InitStruct;
    NVIC_InitTypeDef NVIC_InitStruct;
    
    RCC_APB2PeriphClockCmd(RCC_APB2Periph_USART1 | RCC_APB2Periph_GPIOA, ENABLE);
    
    // PA9 = TX
    GPIO_InitStruct.GPIO_Pin = GPIO_Pin_9;
    GPIO_InitStruct.GPIO_Mode = GPIO_Mode_AF_PP;
    GPIO_InitStruct.GPIO_Speed = GPIO_Speed_50MHz;
    GPIO_Init(GPIOA, &GPIO_InitStruct);
    
    // PA10 = RX
    GPIO_InitStruct.GPIO_Pin = GPIO_Pin_10;
    GPIO_InitStruct.GPIO_Mode = GPIO_Mode_IN_FLOATING;
    GPIO_Init(GPIOA, &GPIO_InitStruct);
    
    // 115200, 8N1
    USART_InitStruct.USART_BaudRate = 115200;
    USART_InitStruct.USART_WordLength = USART_WordLength_8b;
    USART_InitStruct.USART_StopBits = USART_StopBits_1;
    USART_InitStruct.USART_Parity = USART_Parity_No;
    USART_InitStruct.USART_HardwareFlowControl = USART_HardwareFlowControl_None;
    USART_InitStruct.USART_Mode = USART_Mode_Rx | USART_Mode_Tx;
    USART_Init(USART1, &USART_InitStruct);
    
    USART_ITConfig(USART1, USART_IT_RXNE, ENABLE);
    
    NVIC_InitStruct.NVIC_IRQChannel = USART1_IRQn;
    NVIC_InitStruct.NVIC_IRQChannelPreemptionPriority = 1;
    NVIC_InitStruct.NVIC_IRQChannelSubPriority = 0;
    NVIC_InitStruct.NVIC_IRQChannelCmd = ENABLE;
    NVIC_Init(&NVIC_InitStruct);
    
    USART_Cmd(USART1, ENABLE);
}

static void USART1_SendChar(char ch)
{
    while (USART_GetFlagStatus(USART1, USART_FLAG_TXE) == RESET);
    USART_SendData(USART1, ch);
}

int fputc(int ch, FILE *f)
{
    USART1_SendChar((char)ch);
    return ch;
}

// ============ 电机初始化 ============
static void Motor_Init(void)
{
    GPIO_InitTypeDef GPIO_InitStruct;
    TIM_TimeBaseInitTypeDef TIM_TimeBaseStruct;
    TIM_OCInitTypeDef TIM_OCInitStruct;
    
    RCC_APB1PeriphClockCmd(RCC_APB1Periph_TIM4, ENABLE);
    RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOB, ENABLE);
    
    GPIO_InitStruct.GPIO_Pin = GPIO_Pin_6 | GPIO_Pin_7 | GPIO_Pin_8 | GPIO_Pin_9;
    GPIO_InitStruct.GPIO_Mode = GPIO_Mode_AF_PP;
    GPIO_InitStruct.GPIO_Speed = GPIO_Speed_50MHz;
    GPIO_Init(GPIOB, &GPIO_InitStruct);
    
    TIM_TimeBaseStruct.TIM_Period = 100 - 1;
    TIM_TimeBaseStruct.TIM_Prescaler = 36 - 1;
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

static void Motor_SetSpeed(uint8_t left1, uint8_t left2, uint8_t right1, uint8_t right2)
{
    TIM_SetCompare1(TIM4, left1);
    TIM_SetCompare2(TIM4, left2);
    TIM_SetCompare3(TIM4, right1);
    TIM_SetCompare4(TIM4, right2);
}

static void Motor_Stop(void) { Motor_SetSpeed(0, 0, 0, 0); }

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
    Motor_SetSpeed(0, 0, MOTOR_PWM_SPEED, 0);
    Delay_ms(ms);
    Motor_Stop();
}

static void Motor_Right(uint16_t ms)
{
    if (ms > MAX_DURATION) ms = MAX_DURATION;
    if (ms < MIN_DURATION) ms = MIN_DURATION;
    Motor_SetSpeed(MOTOR_PWM_SPEED, 0, 0, 0);
    Delay_ms(ms);
    Motor_Stop();
}

// ============ 蜂鸣器 ============
static void Buzzer_Init(void)
{
    GPIO_InitTypeDef GPIO_InitStruct;
    RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOB, ENABLE);
    
    GPIO_InitStruct.GPIO_Pin = BUZZER_PIN;
    GPIO_InitStruct.GPIO_Mode = GPIO_Mode_Out_PP;
    GPIO_InitStruct.GPIO_Speed = GPIO_Speed_50MHz;
    GPIO_Init(BUZZER_PORT, &GPIO_InitStruct);
    GPIO_ResetBits(BUZZER_PORT, BUZZER_PIN);
}

static void Buzzer_On(void) { GPIO_SetBits(BUZZER_PORT, BUZZER_PIN); }
static void Buzzer_Off(void) { GPIO_ResetBits(BUZZER_PORT, BUZZER_PIN); }

static void Buzzer_Beep(uint16_t ms)
{
    Buzzer_On();
    Delay_ms(ms);
    Buzzer_Off();
}

// ============ 红外避障 ============
static void IrObstacle_Init(void)
{
    GPIO_InitTypeDef GPIO_InitStruct;
    RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOA, ENABLE);
    
    GPIO_InitStruct.GPIO_Pin = IR_OBS_L_PIN | IR_OBS_R_PIN;
    GPIO_InitStruct.GPIO_Mode = GPIO_Mode_IPU;
    GPIO_InitStruct.GPIO_Speed = GPIO_Speed_50MHz;
    GPIO_Init(GPIOA, &GPIO_InitStruct);
}

static uint8_t IrObstacle_Left(void) { return GPIO_ReadInputDataBit(IR_OBS_L_PORT, IR_OBS_L_PIN); }
static uint8_t IrObstacle_Right(void) { return GPIO_ReadInputDataBit(IR_OBS_R_PORT, IR_OBS_R_PIN); }

// ============ 红外循迹 ============
static void IrTracking_Init(void)
{
    GPIO_InitTypeDef GPIO_InitStruct;
    RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOB, ENABLE);
    
    GPIO_InitStruct.GPIO_Pin = IR_TRACK_L_PIN | IR_TRACK_R_PIN;
    GPIO_InitStruct.GPIO_Mode = GPIO_Mode_IPU;
    GPIO_InitStruct.GPIO_Speed = GPIO_Speed_50MHz;
    GPIO_Init(GPIOB, &GPIO_InitStruct);
}

static uint8_t IrTracking_Left(void) { return GPIO_ReadInputDataBit(IR_TRACK_L_PORT, IR_TRACK_L_PIN); }
static uint8_t IrTracking_Right(void) { return GPIO_ReadInputDataBit(IR_TRACK_R_PORT, IR_TRACK_R_PIN); }

// ============ 超声波 ============
static void Ultrasonic_Init(void)
{
    GPIO_InitTypeDef GPIO_InitStruct;
    RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOB, ENABLE);
    
    // TRIG - 输出
    GPIO_InitStruct.GPIO_Pin = US_TRIG_PIN;
    GPIO_InitStruct.GPIO_Mode = GPIO_Mode_Out_PP;
    GPIO_InitStruct.GPIO_Speed = GPIO_Speed_50MHz;
    GPIO_Init(US_TRIG_PORT, &GPIO_InitStruct);
    GPIO_ResetBits(US_TRIG_PORT, US_TRIG_PIN);
    
    // ECHO - 输入
    GPIO_InitStruct.GPIO_Pin = US_ECHO_PIN;
    GPIO_InitStruct.GPIO_Mode = GPIO_Mode_IPD;
    GPIO_Init(US_ECHO_PORT, &GPIO_InitStruct);
}

static int Ultrasonic_Measure(void)
{
    uint32_t timeout;
    uint32_t time_us = 0;
    int distance;
    
    // 发送触发脉冲
    GPIO_SetBits(US_TRIG_PORT, US_TRIG_PIN);
    Delay_us(15);
    GPIO_ResetBits(US_TRIG_PORT, US_TRIG_PIN);
    
    // 等待ECHO变高
    timeout = 10000;
    while(GPIO_ReadInputDataBit(US_ECHO_PORT, US_ECHO_PIN) == 0) {
        Delay_us(1);
        if(--timeout == 0) return 0;
    }
    
    // 测量ECHO高电平时间
    timeout = 30000;
    while(GPIO_ReadInputDataBit(US_ECHO_PORT, US_ECHO_PIN) == 1) {
        Delay_us(1);
        time_us++;
        if(--timeout == 0) return 0;
    }
    
    // 计算距离 (0.1cm)
    distance = (time_us * 34) / 200;
    if(distance > 4000) distance = 4000;
    
    return distance;
}

// ============ 按键 ============
static void Key_Init(void)
{
    GPIO_InitTypeDef GPIO_InitStruct;
    RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOA, ENABLE);
    
    GPIO_InitStruct.GPIO_Pin = KEY_PIN;
    GPIO_InitStruct.GPIO_Mode = GPIO_Mode_IPU;
    GPIO_InitStruct.GPIO_Speed = GPIO_Speed_50MHz;
    GPIO_Init(KEY_PORT, &GPIO_InitStruct);
}

static uint8_t Key_Read(void) { return !GPIO_ReadInputDataBit(KEY_PORT, KEY_PIN); }

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
    
    // BEEP - 蜂鸣器
    if (strcmp(cmd, "BEEP") == 0) {
        Buzzer_Beep(100);
        printf("OK,BEEP\r\n");
        return;
    }
    
    // DIST - 超声波距离
    if (strcmp(cmd, "DIST") == 0) {
        int dist = Ultrasonic_Measure();
        printf("DIST,%d\r\n", dist);
        return;
    }
    
    // IR - 红外避障
    if (strcmp(cmd, "IR") == 0) {
        uint8_t left = IrObstacle_Left();
        uint8_t right = IrObstacle_Right();
        printf("IR,L%dR%d\r\n", left, right);
        return;
    }
    
    // TRACK - 红外循迹
    if (strcmp(cmd, "TRACK") == 0) {
        uint8_t left = IrTracking_Left();
        uint8_t right = IrTracking_Right();
        printf("TRACK,L%dR%d\r\n", left, right);
        return;
    }
    
    // KEY - 按键状态
    if (strcmp(cmd, "KEY") == 0) {
        uint8_t key = Key_Read();
        printf("KEY,%d\r\n", key);
        return;
    }
    
    // SENSOR - 所有传感器
    if (strcmp(cmd, "SENSOR") == 0) {
        int dist = Ultrasonic_Measure();
        uint8_t obsL = IrObstacle_Left();
        uint8_t obsR = IrObstacle_Right();
        uint8_t trkL = IrTracking_Left();
        uint8_t trkR = IrTracking_Right();
        printf("SENSOR,D%d,OL%dOR%d,TL%dTR%d\r\n", dist, obsL, obsR, trkL, trkR);
        return;
    }
    
    // 运动命令 X,ms
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
            rxIndex = 0;
        }
    }
}

// ============ 主函数 ============
int main(void)
{
    NVIC_PriorityGroupConfig(NVIC_PriorityGroup_2);
    
    // 初始化所有硬件
    USART1_Init();
    Motor_Init();
    Buzzer_Init();
    IrObstacle_Init();
    IrTracking_Init();
    Ultrasonic_Init();
    Key_Init();
    
    // 确保电机停止
    Motor_Stop();
    Buzzer_Off();
    
    Delay_ms(100);
    
    // 启动提示
    Buzzer_Beep(100);
    printf("\r\nSimo Full Ready!\r\n");
    
    while (1) {
        if (rxComplete) {
            rxComplete = 0;
            ProcessCommand(rxBuffer);
            memset(rxBuffer, 0, sizeof(rxBuffer));
        }
    }
}
