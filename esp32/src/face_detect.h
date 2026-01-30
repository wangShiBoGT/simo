/**
 * Simo ESP32-S3 本地人脸检测模块
 * 
 * 使用 ESP-DL 库实现本地人脸检测
 * 无需上传到服务器，低延迟实时检测
 * 
 * @version 1.0.0
 */

#ifndef FACE_DETECT_H
#define FACE_DETECT_H

#include <Arduino.h>
#include "esp_camera.h"

// ============ 人脸检测配置 ============

// ============ 检测参数配置 ============

// 检测分辨率（QQVGA: 160x120，低延迟高效率）
#define DETECT_WIDTH 160
#define DETECT_HEIGHT 120

// 运动检测阈值
#define MOTION_THRESHOLD 25      // 帧差阈值（0-255）
#define MOTION_MIN_PIXELS 50     // 最小运动像素数

// 肤色检测参数（RGB565）
#define SKIN_R_MIN 80
#define SKIN_R_MAX 255
#define SKIN_G_MIN 40
#define SKIN_G_MAX 200
#define SKIN_B_MIN 20
#define SKIN_B_MAX 150
// 肤色比例阈值（R > G > B）
#define SKIN_RG_RATIO 1.1f
#define SKIN_RB_RATIO 1.3f

// 连通域参数
#define MIN_BLOB_AREA 100        // 最小肤色区域面积
#define MAX_BLOB_AREA 10000      // 最大肤色区域面积
#define ASPECT_RATIO_MIN 0.6f    // 最小宽高比
#define ASPECT_RATIO_MAX 1.8f    // 最大宽高比

// 时间稳定（滞回）
#define DETECT_CONFIRM_FRAMES 2  // 连续N帧确认检测
#define DETECT_CLEAR_FRAMES 5    // 连续N帧确认丢失

// 检测间隔（毫秒）
#define FACE_DETECT_INTERVAL 80

// 最大检测人脸数
#define MAX_FACES 3

// ============ 人脸检测结果结构 ============

// 人脸边界框
struct FaceBox {
    int x;          // 左上角 X
    int y;          // 左上角 Y
    int width;      // 宽度
    int height;     // 高度
    float score;    // 置信度 (0.0-1.0)
};

// 人脸检测结果
struct FaceDetectResult {
    bool detected;          // 是否检测到人脸
    int faceCount;          // 人脸数量
    FaceBox faces[MAX_FACES]; // 人脸列表
    int imageWidth;         // 图像宽度
    int imageHeight;        // 图像高度
    unsigned long detectTime; // 检测耗时(ms)
};

// ============ 跟随方向计算 ============

// 跟随方向
enum FollowDirection {
    DIR_NONE = 0,       // 无人脸
    DIR_CENTER = 1,     // 人脸在中心，保持
    DIR_LEFT = 2,       // 人脸在左侧，左转
    DIR_RIGHT = 3,      // 人脸在右侧，右转
    DIR_FORWARD = 4,    // 人脸太小，前进靠近
    DIR_BACKWARD = 5    // 人脸太大，后退
};

// 跟随结果
struct FollowResult {
    FollowDirection direction;
    float offsetX;      // X方向偏移（-1.0 到 1.0）
    float faceRatio;    // 人脸占比（0.0 到 1.0）
    bool shouldMove;    // 是否需要移动
};

// EMA 平滑状态
struct SmoothState {
    float offsetX;      // 平滑后的X偏移
    float faceRatio;    // 平滑后的人脸占比
    int detectCount;    // 连续检测帧数
    int lostCount;      // 连续丢失帧数
    bool confirmed;     // 是否确认检测到
};

// 运动检测结果
struct MotionResult {
    bool hasMotion;
    int motionPixels;
    int roiX, roiY, roiW, roiH;  // 运动区域边界框
};

// ============ 全局变量声明 ============

extern bool faceDetectEnabled;
extern FaceDetectResult lastFaceResult;
extern FollowResult lastFollowResult;
extern SmoothState smoothState;
extern unsigned long lastFaceDetectTime;
extern uint8_t* prevGrayFrame;  // 上一帧灰度（用于运动检测）

// ============ 函数声明 ============

/**
 * 初始化人脸检测模块
 * @return 是否初始化成功
 */
bool initFaceDetect();

/**
 * 对帧进行人脸检测
 * @param fb 摄像头帧缓冲
 * @return 检测结果
 */
FaceDetectResult detectFaces(camera_fb_t* fb);

/**
 * 计算跟随方向
 * @param result 人脸检测结果
 * @return 跟随结果
 */
FollowResult calculateFollowDirection(const FaceDetectResult& result);

/**
 * 获取方向名称
 * @param dir 方向枚举
 * @return 方向名称字符串
 */
const char* getDirectionName(FollowDirection dir);

/**
 * 人脸检测结果转JSON
 * @param result 检测结果
 * @return JSON字符串
 */
String faceResultToJson(const FaceDetectResult& result);

/**
 * 跟随结果转JSON
 * @param result 跟随结果
 * @return JSON字符串
 */
String followResultToJson(const FollowResult& result);

#endif // FACE_DETECT_H
