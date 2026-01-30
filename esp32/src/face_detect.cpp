/**
 * Simo ESP32-S3 本地人脸检测实现（优化版）
 * 
 * 检测流程：
 * 1. 运动检测（帧差法）→ 定位 ROI
 * 2. 肤色检测（RGB565）→ 找肤色区域
 * 3. 连通域分析 → 找最大肤色块
 * 4. 形状约束 → 验证是否为人脸区域
 * 5. EMA 平滑 + 滞回 → 稳定输出
 * 
 * @version 2.0.0
 */

#include "face_detect.h"
#include "camera_config.h"
#include <stdlib.h>

// ============ 全局变量定义 ============

bool faceDetectEnabled = false;
FaceDetectResult lastFaceResult = {false, 0, {}, 0, 0, 0};
FollowResult lastFollowResult = {DIR_NONE, 0.0, 0.0, false};
SmoothState smoothState = {0.0f, 0.0f, 0, 0, false};
unsigned long lastFaceDetectTime = 0;
uint8_t* prevGrayFrame = nullptr;  // 上一帧灰度

// EMA 平滑系数（0.7-0.9，越大越稳）
#define EMA_ALPHA 0.8f

// 滞回阈值
#define OFFSET_ENTER_THRESHOLD 0.18f   // 进入阈值
#define OFFSET_EXIT_THRESHOLD 0.12f    // 退出阈值
#define RATIO_FAR_ENTER 0.03f          // 太远进入阈值
#define RATIO_FAR_EXIT 0.05f           // 太远退出阈值
#define RATIO_NEAR_ENTER 0.30f         // 太近进入阈值
#define RATIO_NEAR_EXIT 0.25f          // 太近退出阈值

// 静态缓冲区（避免 String 拼接导致堆碎片）
static char jsonBuffer[512];

// ============ RGB565 工具函数 ============

// RGB565 解码（定点运算，高效）
inline void rgb565ToRgb(uint16_t pixel, uint8_t& r, uint8_t& g, uint8_t& b) {
    // RGB565: RRRRR GGGGGG BBBBB
    r = (pixel >> 8) & 0xF8;  // 高5位
    g = (pixel >> 3) & 0xFC;  // 中6位
    b = (pixel << 3) & 0xF8;  // 低5位
}

// RGB 转灰度（定点运算）
inline uint8_t rgbToGray(uint8_t r, uint8_t g, uint8_t b) {
    // Y = 0.299R + 0.587G + 0.114B ≈ (77R + 150G + 29B) >> 8
    return (uint8_t)((77 * r + 150 * g + 29 * b) >> 8);
}

// 肤色判断（简化 RGB 阈值 + 比例约束）
inline bool isSkinColor(uint8_t r, uint8_t g, uint8_t b) {
    // 基本范围检查
    if (r < SKIN_R_MIN || r > SKIN_R_MAX) return false;
    if (g < SKIN_G_MIN || g > SKIN_G_MAX) return false;
    if (b < SKIN_B_MIN || b > SKIN_B_MAX) return false;
    
    // 比例约束：R > G > B（肤色特征）
    if (r <= g * SKIN_RG_RATIO) return false;
    if (r <= b * SKIN_RB_RATIO) return false;
    
    // 排除白色/灰色
    int diff = abs(r - g) + abs(g - b);
    if (diff < 15) return false;
    
    return true;
}

/**
 * 初始化人脸检测模块
 */
bool initFaceDetect() {
    Serial.println("[FaceDetect] 初始化人脸检测模块 v2.0");
    Serial.println("[FaceDetect] 运动ROI + 肤色连通域 + EMA平滑");
    
    // 分配上一帧灰度缓冲区
    if (prevGrayFrame == nullptr) {
        prevGrayFrame = (uint8_t*)ps_malloc(DETECT_WIDTH * DETECT_HEIGHT);
        if (prevGrayFrame == nullptr) {
            Serial.println("[FaceDetect] 错误：无法分配帧缓冲");
            return false;
        }
        memset(prevGrayFrame, 128, DETECT_WIDTH * DETECT_HEIGHT);
    }
    
    // 初始化平滑状态
    smoothState = {0.0f, 0.0f, 0, 0, false};
    
    faceDetectEnabled = true;
    Serial.printf("[FaceDetect] 检测分辨率: %dx%d\n", DETECT_WIDTH, DETECT_HEIGHT);
    return true;
}

/**
 * 运动检测（帧差法）
 * @param grayFrame 当前帧灰度数据
 * @param width 图像宽度
 * @param height 图像高度
 * @return 运动检测结果
 */
MotionResult detectMotion(const uint8_t* grayFrame, int width, int height) {
    MotionResult result = {false, 0, 0, 0, width, height};
    
    if (prevGrayFrame == nullptr) return result;
    
    int minX = width, minY = height, maxX = 0, maxY = 0;
    int motionCount = 0;
    
    // 采样检测（每2像素采样一次，提高效率）
    for (int y = 0; y < height; y += 2) {
        for (int x = 0; x < width; x += 2) {
            int idx = y * width + x;
            int diff = abs((int)grayFrame[idx] - (int)prevGrayFrame[idx]);
            
            if (diff > MOTION_THRESHOLD) {
                motionCount++;
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
            }
        }
    }
    
    // 更新上一帧
    memcpy(prevGrayFrame, grayFrame, width * height);
    
    result.motionPixels = motionCount * 4;  // 补偿采样
    result.hasMotion = (result.motionPixels > MOTION_MIN_PIXELS);
    
    if (result.hasMotion) {
        result.roiX = max(0, minX - 10);
        result.roiY = max(0, minY - 10);
        result.roiW = min(width - result.roiX, maxX - minX + 20);
        result.roiH = min(height - result.roiY, maxY - minY + 20);
    }
    
    return result;
}

/**
 * 肤色区域检测（在 ROI 内）
 * @param pixels RGB565 像素数据
 * @param width 图像宽度
 * @param height 图像高度
 * @param roi 运动检测的 ROI（可选）
 * @return 最大肤色区域的边界框
 */
FaceBox detectSkinBlob(const uint16_t* pixels, int width, int height, const MotionResult* roi) {
    FaceBox result = {0, 0, 0, 0, 0.0f};
    
    // 确定检测区域
    int startX = roi && roi->hasMotion ? roi->roiX : 0;
    int startY = roi && roi->hasMotion ? roi->roiY : 0;
    int endX = roi && roi->hasMotion ? roi->roiX + roi->roiW : width;
    int endY = roi && roi->hasMotion ? roi->roiY + roi->roiH : height;
    
    // 简化连通域：统计肤色像素边界
    int skinMinX = width, skinMinY = height, skinMaxX = 0, skinMaxY = 0;
    int skinCount = 0;
    
    for (int y = startY; y < endY; y += 2) {  // 采样
        for (int x = startX; x < endX; x += 2) {
            uint16_t pixel = pixels[y * width + x];
            uint8_t r, g, b;
            rgb565ToRgb(pixel, r, g, b);
            
            if (isSkinColor(r, g, b)) {
                skinCount++;
                if (x < skinMinX) skinMinX = x;
                if (y < skinMinY) skinMinY = y;
                if (x > skinMaxX) skinMaxX = x;
                if (y > skinMaxY) skinMaxY = y;
            }
        }
    }
    
    // 补偿采样
    int skinArea = skinCount * 4;
    
    // 检查面积约束
    if (skinArea < MIN_BLOB_AREA || skinArea > MAX_BLOB_AREA) {
        return result;
    }
    
    // 计算边界框
    int blobW = skinMaxX - skinMinX;
    int blobH = skinMaxY - skinMinY;
    
    if (blobW < 10 || blobH < 10) return result;
    
    // 检查宽高比约束
    float aspectRatio = (float)blobW / (float)blobH;
    if (aspectRatio < ASPECT_RATIO_MIN || aspectRatio > ASPECT_RATIO_MAX) {
        return result;
    }
    
    // 计算置信度（基于肤色占比）
    int roiArea = blobW * blobH;
    float skinRatio = (float)skinArea / (float)roiArea;
    
    result.x = skinMinX;
    result.y = skinMinY;
    result.width = blobW;
    result.height = blobH;
    result.score = min(1.0f, skinRatio * 2.0f);  // 归一化
    
    return result;
}

/**
 * 人脸检测主函数（RGB565 像素域）
 */
FaceDetectResult detectFaces(camera_fb_t* fb) {
    FaceDetectResult result = {false, 0, {}, 0, 0, 0};
    unsigned long startTime = millis();
    
    // 检查帧格式
    if (!fb) {
        return result;
    }
    
    result.imageWidth = fb->width;
    result.imageHeight = fb->height;
    
    // 需要 RGB565 格式
    if (fb->format != PIXFORMAT_RGB565) {
        // 如果是 JPEG，返回空结果（需要切换摄像头格式）
        static bool warned = false;
        if (!warned) {
            Serial.println("[FaceDetect] 警告: 需要 RGB565 格式，请调用 setCameraForDetect()");
            warned = true;
        }
        return result;
    }
    
    uint16_t* pixels = (uint16_t*)fb->buf;
    int width = fb->width;
    int height = fb->height;
    
    // 1. 生成灰度帧用于运动检测
    static uint8_t* grayFrame = nullptr;
    if (grayFrame == nullptr) {
        grayFrame = (uint8_t*)ps_malloc(width * height);
        if (grayFrame == nullptr) return result;
    }
    
    // 转换为灰度（采样）
    for (int y = 0; y < height; y++) {
        for (int x = 0; x < width; x++) {
            uint16_t pixel = pixels[y * width + x];
            uint8_t r, g, b;
            rgb565ToRgb(pixel, r, g, b);
            grayFrame[y * width + x] = rgbToGray(r, g, b);
        }
    }
    
    // 2. 运动检测
    MotionResult motion = detectMotion(grayFrame, width, height);
    
    // 无运动门控：如果没有运动，不输出检测结果（减少误报）
    // 但允许短时间保持锁定（避免人静止时立刻丢失）
    static unsigned long lastMotionTime = 0;
    if (motion.hasMotion) {
        lastMotionTime = millis();
    }
    
    // 超过 500ms 无运动，不进行肤色检测
    if (millis() - lastMotionTime > 500) {
        result.detectTime = millis() - startTime;
        lastFaceResult = result;
        lastFaceDetectTime = millis();
        return result;  // 返回空结果
    }
    
    // 3. 肤色区域检测（仅在有运动时执行）
    FaceBox skinBlob = detectSkinBlob(pixels, width, height, &motion);
    
    // 4. 结果验证
    if (skinBlob.width > 0 && skinBlob.height > 0) {
        result.detected = true;
        result.faceCount = 1;
        result.faces[0] = skinBlob;
    }
    
    result.detectTime = millis() - startTime;
    lastFaceResult = result;
    lastFaceDetectTime = millis();
    
    // 状态变化时打印日志
    static bool lastDetected = false;
    if (result.detected != lastDetected) {
        if (result.detected) {
            Serial.printf("[FaceDetect] 检测到目标: %dx%d @ (%d,%d), score=%.2f, %dms\n",
                skinBlob.width, skinBlob.height, skinBlob.x, skinBlob.y, 
                skinBlob.score, result.detectTime);
        } else {
            Serial.println("[FaceDetect] 目标丢失");
        }
        lastDetected = result.detected;
    }
    
    return result;
}

/**
 * 计算跟随方向（带 EMA 平滑和滞回控制）
 */
FollowResult calculateFollowDirection(const FaceDetectResult& result) {
    FollowResult follow = {DIR_NONE, 0.0, 0.0, false};
    
    // 更新检测/丢失计数（滞回）
    if (result.detected && result.faceCount > 0) {
        smoothState.detectCount++;
        smoothState.lostCount = 0;
        
        // 取第一个人脸
        const FaceBox& face = result.faces[0];
        
        // 计算原始偏移和占比
        float faceCenterX = face.x + face.width / 2.0f;
        float imageCenterX = result.imageWidth / 2.0f;
        float rawOffsetX = (faceCenterX - imageCenterX) / imageCenterX;
        
        float faceArea = face.width * face.height;
        float imageArea = result.imageWidth * result.imageHeight;
        float rawFaceRatio = faceArea / imageArea;
        
        // EMA 平滑
        smoothState.offsetX = EMA_ALPHA * smoothState.offsetX + (1.0f - EMA_ALPHA) * rawOffsetX;
        smoothState.faceRatio = EMA_ALPHA * smoothState.faceRatio + (1.0f - EMA_ALPHA) * rawFaceRatio;
        
        // 滞回确认
        if (smoothState.detectCount >= DETECT_CONFIRM_FRAMES) {
            smoothState.confirmed = true;
        }
    } else {
        smoothState.lostCount++;
        smoothState.detectCount = 0;
        
        // 滞回清除
        if (smoothState.lostCount >= DETECT_CLEAR_FRAMES) {
            smoothState.confirmed = false;
            smoothState.offsetX = 0.0f;
            smoothState.faceRatio = 0.0f;
        }
    }
    
    // 如果未确认检测，返回无方向
    if (!smoothState.confirmed) {
        lastFollowResult = follow;
        return follow;
    }
    
    // 使用平滑后的值
    follow.offsetX = smoothState.offsetX;
    follow.faceRatio = smoothState.faceRatio;
    
    // 确定方向（带滞回阈值）
    static FollowDirection lastDir = DIR_NONE;
    
    // 左右方向判断（带滞回）
    if (lastDir == DIR_LEFT) {
        // 已经在左转，用退出阈值
        if (follow.offsetX > -OFFSET_EXIT_THRESHOLD) {
            // 退出左转
        } else {
            follow.direction = DIR_LEFT;
            follow.shouldMove = true;
        }
    } else if (lastDir == DIR_RIGHT) {
        // 已经在右转，用退出阈值
        if (follow.offsetX < OFFSET_EXIT_THRESHOLD) {
            // 退出右转
        } else {
            follow.direction = DIR_RIGHT;
            follow.shouldMove = true;
        }
    } else {
        // 用进入阈值
        if (follow.offsetX < -OFFSET_ENTER_THRESHOLD) {
            follow.direction = DIR_LEFT;
            follow.shouldMove = true;
        } else if (follow.offsetX > OFFSET_ENTER_THRESHOLD) {
            follow.direction = DIR_RIGHT;
            follow.shouldMove = true;
        }
    }
    
    // 前后方向判断（带滞回）
    if (follow.direction == DIR_NONE || follow.direction == DIR_CENTER) {
        if (lastDir == DIR_FORWARD) {
            if (follow.faceRatio < RATIO_FAR_EXIT) {
                follow.direction = DIR_FORWARD;
                follow.shouldMove = true;
            }
        } else if (lastDir == DIR_BACKWARD) {
            if (follow.faceRatio > RATIO_NEAR_EXIT) {
                follow.direction = DIR_BACKWARD;
                follow.shouldMove = true;
            }
        } else {
            if (follow.faceRatio < RATIO_FAR_ENTER) {
                follow.direction = DIR_FORWARD;
                follow.shouldMove = true;
            } else if (follow.faceRatio > RATIO_NEAR_ENTER) {
                follow.direction = DIR_BACKWARD;
                follow.shouldMove = true;
            } else {
                follow.direction = DIR_CENTER;
                follow.shouldMove = false;
            }
        }
    }
    
    lastDir = follow.direction;
    lastFollowResult = follow;
    return follow;
}

/**
 * 获取方向名称
 */
const char* getDirectionName(FollowDirection dir) {
    switch (dir) {
        case DIR_NONE: return "none";
        case DIR_CENTER: return "center";
        case DIR_LEFT: return "left";
        case DIR_RIGHT: return "right";
        case DIR_FORWARD: return "forward";
        case DIR_BACKWARD: return "backward";
        default: return "unknown";
    }
}

/**
 * 人脸检测结果转JSON（使用静态缓冲区避免堆碎片）
 */
String faceResultToJson(const FaceDetectResult& result) {
    char* p = jsonBuffer;
    int remaining = sizeof(jsonBuffer);
    int written;
    
    written = snprintf(p, remaining, 
        "{\"detected\":%s,\"faceCount\":%d,\"imageWidth\":%d,\"imageHeight\":%d,\"detectTime\":%lu,\"faces\":[",
        result.detected ? "true" : "false",
        result.faceCount,
        result.imageWidth,
        result.imageHeight,
        result.detectTime);
    p += written; remaining -= written;
    
    for (int i = 0; i < result.faceCount && i < MAX_FACES && remaining > 50; i++) {
        if (i > 0) { *p++ = ','; remaining--; }
        written = snprintf(p, remaining,
            "{\"x\":%d,\"y\":%d,\"width\":%d,\"height\":%d,\"score\":%.2f}",
            result.faces[i].x, result.faces[i].y,
            result.faces[i].width, result.faces[i].height,
            result.faces[i].score);
        p += written; remaining -= written;
    }
    
    snprintf(p, remaining, "]}");
    return String(jsonBuffer);
}

/**
 * 跟随结果转JSON（使用静态缓冲区避免堆碎片）
 */
String followResultToJson(const FollowResult& result) {
    snprintf(jsonBuffer, sizeof(jsonBuffer),
        "{\"direction\":\"%s\",\"offsetX\":%.2f,\"faceRatio\":%.3f,\"shouldMove\":%s,\"smoothed\":{\"confirmed\":%s,\"detectCount\":%d,\"lostCount\":%d}}",
        getDirectionName(result.direction),
        result.offsetX,
        result.faceRatio,
        result.shouldMove ? "true" : "false",
        smoothState.confirmed ? "true" : "false",
        smoothState.detectCount,
        smoothState.lostCount);
    return String(jsonBuffer);
}
