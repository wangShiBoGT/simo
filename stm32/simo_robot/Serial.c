/**
 * 串口通信模块 - Simo 版本
 * 
 * 修改自原版 Serial.c
 * 主要改动：
 * 1. 波特率改为 115200
 * 2. 添加行缓冲接收（按 \n 分割命令）
 */

#include "stm32f10x.h"
#include <stdio.h>
#include <stdarg.h>
#include <string.h>

// 串口接收缓冲区
char rxBuffer[64];
volatile uint8_t rxIndex = 0;
volatile uint8_t rxComplete = 0;

/**
 * 串口初始化
 * PA9  - TX
 * PA10 - RX
 * 波特率: 115200
 */
void Serial_Init(void) {
    // 使能时钟
    RCC_APB2PeriphClockCmd(RCC_APB2Periph_USART1, ENABLE);
    RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOA, ENABLE);
    
    // GPIO 配置
    GPIO_InitTypeDef GPIO_InitStructure;
    
    // PA9 - TX (复用推挽输出)
    GPIO_InitStructure.GPIO_Mode = GPIO_Mode_AF_PP;
    GPIO_InitStructure.GPIO_Pin = GPIO_Pin_9;
    GPIO_InitStructure.GPIO_Speed = GPIO_Speed_50MHz;
    GPIO_Init(GPIOA, &GPIO_InitStructure);
    
    // PA10 - RX (上拉输入)
    GPIO_InitStructure.GPIO_Mode = GPIO_Mode_IPU;
    GPIO_InitStructure.GPIO_Pin = GPIO_Pin_10;
    GPIO_InitStructure.GPIO_Speed = GPIO_Speed_50MHz;
    GPIO_Init(GPIOA, &GPIO_InitStructure);
    
    // USART 配置
    USART_InitTypeDef USART_InitStruture;
    USART_InitStruture.USART_BaudRate = 115200;  // Simo 使用 115200
    USART_InitStruture.USART_HardwareFlowControl = USART_HardwareFlowControl_None;
    USART_InitStruture.USART_Mode = USART_Mode_Tx | USART_Mode_Rx;
    USART_InitStruture.USART_Parity = USART_Parity_No;
    USART_InitStruture.USART_StopBits = USART_StopBits_1;
    USART_InitStruture.USART_WordLength = USART_WordLength_8b;
    USART_Init(USART1, &USART_InitStruture);
    
    // 使能接收中断
    USART_ITConfig(USART1, USART_IT_RXNE, ENABLE);
    
    // NVIC 配置
    NVIC_InitTypeDef NVIC_InitStructure;
    NVIC_InitStructure.NVIC_IRQChannel = USART1_IRQn;
    NVIC_InitStructure.NVIC_IRQChannelCmd = ENABLE;
    NVIC_InitStructure.NVIC_IRQChannelPreemptionPriority = 1;
    NVIC_InitStructure.NVIC_IRQChannelSubPriority = 1;
    NVIC_Init(&NVIC_InitStructure);
    
    // 使能 USART
    USART_Cmd(USART1, ENABLE);
}

/**
 * 发送单个字节
 */
void Serial_SendByte(uint8_t Byte) {
    USART_SendData(USART1, Byte);
    while (USART_GetFlagStatus(USART1, USART_FLAG_TXE) == RESET);
}

/**
 * 发送字节数组
 */
void Serial_SendArray(uint8_t *Array, uint16_t Length) {
    uint16_t i;
    for (i = 0; i < Length; i++) {
        Serial_SendByte(Array[i]);
    }
}

/**
 * 发送字符串
 */
void Serial_SendString(char *String) {
    uint8_t i;
    for (i = 0; String[i] != '\0'; i++) {
        Serial_SendByte(String[i]);
    }
}

/**
 * 重定向 printf 到串口
 */
int fputc(int ch, FILE *f) {
    Serial_SendByte(ch);
    return ch;
}

/**
 * 格式化输出
 */
void Serial_Printf(char *format, ...) {
    char String[128];
    va_list arg;
    va_start(arg, format);
    vsprintf(String, format, arg);
    va_end(arg);
    Serial_SendString(String);
}

/**
 * USART1 中断处理函数
 * 接收数据，按 \n 分割命令
 */
void USART1_IRQHandler(void) {
    if (USART_GetFlagStatus(USART1, USART_IT_RXNE) == SET) {
        char ch = USART_ReceiveData(USART1);
        
        // 收到换行符，命令完成
        if (ch == '\n' || ch == '\r') {
            if (rxIndex > 0) {
                rxBuffer[rxIndex] = '\0';
                rxComplete = 1;
                rxIndex = 0;
            }
        }
        // 普通字符，加入缓冲区
        else if (rxIndex < sizeof(rxBuffer) - 1) {
            rxBuffer[rxIndex++] = ch;
        }
        // 缓冲区满，丢弃
        else {
            rxIndex = 0;
        }
        
        USART_ClearITPendingBit(USART1, USART_IT_RXNE);
    }
}
