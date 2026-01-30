/**
 * Simo 摄像头配置
 * 
 * 支持摄像头：OV3660 / OV2640
 * 开发板：ESP32-S3-WROOM CAM 模块
 * 
 * 引脚映射基于常见的 ESP32-S3-CAM 开发板
 * 如果你的开发板引脚不同，请修改下面的配置
 */

#ifndef CAMERA_CONFIG_H
#define CAMERA_CONFIG_H

#include "esp_camera.h"

// ============ ESP32-S3-CAM 引脚映射 ============
// 这是常见的 ESP32-S3 CAM 模块引脚配置
// 如果你的板子不同，请根据实际连线修改

// 电源控制引脚（部分板子需要）
#define PWDN_GPIO_NUM     -1  // 电源控制，-1表示不使用
#define RESET_GPIO_NUM    -1  // 复位引脚，-1表示不使用

// XCLK 时钟
#define XCLK_GPIO_NUM     15

// SIOD/SIOC (I2C)
#define SIOD_GPIO_NUM     4   // SDA
#define SIOC_GPIO_NUM     5   // SCL

// 数据引脚 D0-D7
#define Y2_GPIO_NUM       11
#define Y3_GPIO_NUM       9
#define Y4_GPIO_NUM       8
#define Y5_GPIO_NUM       10
#define Y6_GPIO_NUM       12
#define Y7_GPIO_NUM       18
#define Y8_GPIO_NUM       17
#define Y9_GPIO_NUM       16

// 同步信号
#define VSYNC_GPIO_NUM    6
#define HREF_GPIO_NUM     7
#define PCLK_GPIO_NUM     13

// ============ 备用配置：ESP32-S3-EYE ============
// 如果你用的是 ESP32-S3-EYE 开发板，取消下面的注释
/*
#define PWDN_GPIO_NUM     -1
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM     15
#define SIOD_GPIO_NUM     4
#define SIOC_GPIO_NUM     5
#define Y2_GPIO_NUM       11
#define Y3_GPIO_NUM       9
#define Y4_GPIO_NUM       8
#define Y5_GPIO_NUM       10
#define Y6_GPIO_NUM       12
#define Y7_GPIO_NUM       18
#define Y8_GPIO_NUM       17
#define Y9_GPIO_NUM       16
#define VSYNC_GPIO_NUM    6
#define HREF_GPIO_NUM     7
#define PCLK_GPIO_NUM     13
*/

// ============ 摄像头初始化配置 ============
// XCLK 时钟频率（影响帧率和稳定性）
#define XCLK_FREQ_HZ      20000000  // 20MHz

// 默认分辨率（低延迟优先用QVGA，高清用VGA）
// FRAMESIZE_QQVGA  = 160x120   （人脸检测专用，超低延迟）
// FRAMESIZE_QVGA   = 320x240   （快速预览，低延迟）
// FRAMESIZE_VGA    = 640x480   （标准）
// FRAMESIZE_SVGA   = 800x600   （高清）
// FRAMESIZE_XGA    = 1024x768  （更高清）
// FRAMESIZE_SXGA   = 1280x1024 （OV3660支持）
// FRAMESIZE_UXGA   = 1600x1200 （OV3660支持）
// FRAMESIZE_QXGA   = 2048x1536 （OV3660最大）
#define DEFAULT_FRAME_SIZE FRAMESIZE_QVGA  // 低延迟：320x240
#define DETECT_FRAME_SIZE FRAMESIZE_QQVGA  // 检测专用：160x120

// JPEG 质量（10-63，数字越大压缩越多，传输越快）
#define DEFAULT_JPEG_QUALITY 20  // 平衡质量和速度

// ============ 人脸检测专用配置 ============
// 检测模式使用 RGB565（像素域检测）
#define DETECT_PIXEL_FORMAT PIXFORMAT_RGB565
// 传输模式使用 JPEG（节省带宽）
#define STREAM_PIXEL_FORMAT PIXFORMAT_JPEG

// 帧缓冲数量（1-3，越多越流畅但占用更多内存）
#define FB_COUNT 2

/**
 * 获取摄像头配置
 */
inline camera_config_t getCameraConfig() {
    camera_config_t config;
    
    config.ledc_channel = LEDC_CHANNEL_0;
    config.ledc_timer = LEDC_TIMER_0;
    
    config.pin_d0 = Y2_GPIO_NUM;
    config.pin_d1 = Y3_GPIO_NUM;
    config.pin_d2 = Y4_GPIO_NUM;
    config.pin_d3 = Y5_GPIO_NUM;
    config.pin_d4 = Y6_GPIO_NUM;
    config.pin_d5 = Y7_GPIO_NUM;
    config.pin_d6 = Y8_GPIO_NUM;
    config.pin_d7 = Y9_GPIO_NUM;
    
    config.pin_xclk = XCLK_GPIO_NUM;
    config.pin_pclk = PCLK_GPIO_NUM;
    config.pin_vsync = VSYNC_GPIO_NUM;
    config.pin_href = HREF_GPIO_NUM;
    config.pin_sccb_sda = SIOD_GPIO_NUM;
    config.pin_sccb_scl = SIOC_GPIO_NUM;
    config.pin_pwdn = PWDN_GPIO_NUM;
    config.pin_reset = RESET_GPIO_NUM;
    
    config.xclk_freq_hz = XCLK_FREQ_HZ;
    config.pixel_format = PIXFORMAT_JPEG;  // JPEG格式，适合网络传输
    config.frame_size = DEFAULT_FRAME_SIZE;
    config.jpeg_quality = DEFAULT_JPEG_QUALITY;
    config.fb_count = FB_COUNT;
    config.fb_location = CAMERA_FB_IN_PSRAM;  // 使用PSRAM存储帧缓冲
    config.grab_mode = CAMERA_GRAB_LATEST;    // 总是获取最新帧
    
    return config;
}

#endif // CAMERA_CONFIG_H
