#!/usr/bin/env python3
"""
Simo 人脸检测脚本（优化版）

支持三种检测方式（按推荐优先级）：
1. InsightFace SCRFD（推荐，速度快精度高）
2. OpenCV DNN（备用，需要模型文件）
3. OpenCV Haar级联（兜底，精度一般）

用法: python face_detect.py <image_path>

@version 2.0.0
"""

import sys
import json
import cv2
import os
import time

# 全局变量：缓存模型避免重复加载
_insightface_app = None
_dnn_net = None


def detect_faces_mediapipe(image_path):
    """使用MediaPipe检测人脸（推荐，速度快，有预编译wheel）"""
    global _mediapipe_detector
    
    try:
        import mediapipe as mp
        
        # 懒加载模型
        if '_mediapipe_detector' not in globals() or _mediapipe_detector is None:
            globals()['_mediapipe_detector'] = mp.solutions.face_detection.FaceDetection(
                model_selection=0,  # 0=短距离(2m内), 1=长距离(5m)
                min_detection_confidence=0.5
            )
        
        # 加载图像
        img = cv2.imread(image_path)
        if img is None:
            return {"error": "无法读取图像", "faces": []}
        
        height, width = img.shape[:2]
        rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        
        # 检测人脸
        start = time.time()
        results = _mediapipe_detector.process(rgb)
        infer_time = int((time.time() - start) * 1000)
        
        # 转换结果格式
        result_faces = []
        if results.detections:
            for detection in results.detections:
                bbox = detection.location_data.relative_bounding_box
                x = int(bbox.xmin * width)
                y = int(bbox.ymin * height)
                w = int(bbox.width * width)
                h = int(bbox.height * height)
                
                result_faces.append({
                    "x": max(0, x),
                    "y": max(0, y),
                    "w": w,
                    "h": h,
                    "confidence": float(detection.score[0])
                })
        
        return {
            "faces": result_faces,
            "imageWidth": width,
            "imageHeight": height,
            "method": "mediapipe",
            "inferTime": infer_time
        }
    except ImportError:
        # MediaPipe未安装，回退
        return None
    except Exception as e:
        return {"error": str(e), "faces": [], "method": "mediapipe"}


def detect_faces_haar(image_path):
    """使用Haar级联检测人脸（兜底方案，精度一般）"""
    
    # 加载图像
    img = cv2.imread(image_path)
    if img is None:
        return {"error": "无法读取图像", "faces": []}
    
    height, width = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # 加载Haar级联分类器
    cascade_path = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
    face_cascade = cv2.CascadeClassifier(cascade_path)
    
    # 检测人脸
    start = time.time()
    faces = face_cascade.detectMultiScale(
        gray,
        scaleFactor=1.1,
        minNeighbors=5,
        minSize=(30, 30),
        flags=cv2.CASCADE_SCALE_IMAGE
    )
    infer_time = int((time.time() - start) * 1000)
    
    # 转换结果格式
    result_faces = []
    for (x, y, w, h) in faces:
        result_faces.append({
            "x": int(x),
            "y": int(y),
            "w": int(w),
            "h": int(h),
            "confidence": 0.8  # Haar没有置信度
        })
    
    return {
        "faces": result_faces,
        "imageWidth": width,
        "imageHeight": height,
        "method": "haar",
        "inferTime": infer_time
    }


def detect_faces_dnn(image_path):
    """使用DNN检测人脸（精度高，需要模型文件）"""
    
    # 加载图像
    img = cv2.imread(image_path)
    if img is None:
        return {"error": "无法读取图像", "faces": []}
    
    height, width = img.shape[:2]
    
    # DNN模型路径（需要下载）
    model_dir = os.path.join(os.path.dirname(__file__), 'models')
    prototxt = os.path.join(model_dir, 'deploy.prototxt')
    caffemodel = os.path.join(model_dir, 'res10_300x300_ssd_iter_140000.caffemodel')
    
    # 检查模型是否存在
    if not os.path.exists(prototxt) or not os.path.exists(caffemodel):
        # 回退到Haar
        return detect_faces_haar(image_path)
    
    # 加载DNN模型
    net = cv2.dnn.readNetFromCaffe(prototxt, caffemodel)
    
    # 预处理
    blob = cv2.dnn.blobFromImage(
        cv2.resize(img, (300, 300)), 
        1.0, 
        (300, 300), 
        (104.0, 177.0, 123.0)
    )
    
    # 推理
    net.setInput(blob)
    detections = net.forward()
    
    # 解析结果
    result_faces = []
    for i in range(detections.shape[2]):
        confidence = detections[0, 0, i, 2]
        
        if confidence > 0.5:  # 置信度阈值
            box = detections[0, 0, i, 3:7] * [width, height, width, height]
            x1, y1, x2, y2 = box.astype(int)
            
            result_faces.append({
                "x": int(x1),
                "y": int(y1),
                "w": int(x2 - x1),
                "h": int(y2 - y1),
                "confidence": float(confidence)
            })
    
    return {
        "faces": result_faces,
        "imageWidth": width,
        "imageHeight": height,
        "method": "dnn"
    }


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "请提供图像路径"}))
        sys.exit(1)
    
    image_path = sys.argv[1]
    
    if not os.path.exists(image_path):
        print(json.dumps({"error": f"图像不存在: {image_path}"}))
        sys.exit(1)
    
    # 按优先级尝试：MediaPipe → DNN → Haar
    result = None
    
    # 1. 优先尝试MediaPipe（推荐，速度快）
    result = detect_faces_mediapipe(image_path)
    
    # 2. MediaPipe不可用，尝试DNN
    if result is None:
        try:
            result = detect_faces_dnn(image_path)
        except Exception:
            pass
    
    # 3. 都不行，使用Haar兜底
    if result is None or "error" in result:
        result = detect_faces_haar(image_path)
    
    print(json.dumps(result))


if __name__ == '__main__':
    main()
