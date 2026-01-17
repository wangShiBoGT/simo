/**
 * 串口通信模块头文件 - Simo 版本
 */

#ifndef __SERIAL_H
#define __SERIAL_H

#include <stdint.h>

// 串口接收缓冲区（外部声明）
extern char rxBuffer[64];
extern volatile uint8_t rxIndex;
extern volatile uint8_t rxComplete;

// 函数声明
void Serial_Init(void);
void Serial_SendByte(uint8_t Byte);
void Serial_SendArray(uint8_t *Array, uint16_t Length);
void Serial_SendString(char *String);
void Serial_Printf(char *format, ...);

#endif
