#!/usr/bin/env python3
"""
Simo 人脸识别脚本（身份匹配）

功能：
1. 注册人脸：检测人脸并保存裁剪后的人脸图片
2. 识别人脸：使用直方图相似度匹配

使用 MediaPipe 人脸检测 + OpenCV 直方图匹配，无需 GPU。

用法:
    注册: python face_recognize.py register <image_path> <person_name>
    识别: python face_recognize.py recognize <image_path>
    列表: python face_recognize.py list

@version 3.0.0
"""

import sys
import json
import os
import pickle
import warnings
warnings.filterwarnings('ignore')

# 人脸库目录
FACE_DB_DIR = os.path.join(os.path.dirname(__file__), '..', 'data', 'faces')
ENCODINGS_FILE = os.path.join(FACE_DB_DIR, 'encodings.pkl')

# 确保目录存在
os.makedirs(FACE_DB_DIR, exist_ok=True)

# Haar 级联分类器（全局缓存）
_haar_cascade = None

def get_face_detector():
    """获取 OpenCV Haar 级联人脸检测器"""
    global _haar_cascade
    if _haar_cascade is None:
        import cv2
        cascade_path = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
        _haar_cascade = cv2.CascadeClassifier(cascade_path)
    return _haar_cascade


def detect_faces_cv(img):
    """使用 OpenCV Haar 级联检测人脸，返回 [(x, y, w, h, confidence), ...]"""
    import cv2
    cascade = get_face_detector()
    
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # 检测人脸
    faces_rect = cascade.detectMultiScale(
        gray,
        scaleFactor=1.1,
        minNeighbors=5,
        minSize=(30, 30),
        flags=cv2.CASCADE_SCALE_IMAGE
    )
    
    faces = []
    for (x, y, w, h) in faces_rect:
        faces.append((int(x), int(y), int(w), int(h), 0.9))  # Haar 没有置信度，默认 0.9
    
    return faces


def compute_face_histogram(img, face_rect):
    """计算人脸区域的颜色直方图特征"""
    import cv2
    import numpy as np
    
    x, y, w, h = face_rect[:4]
    face_img = img[y:y+h, x:x+w]
    
    if face_img.size == 0:
        return None
    
    # 调整到统一大小
    face_img = cv2.resize(face_img, (100, 100))
    
    # 转换到 HSV 并计算直方图
    hsv = cv2.cvtColor(face_img, cv2.COLOR_BGR2HSV)
    hist = cv2.calcHist([hsv], [0, 1], None, [50, 60], [0, 180, 0, 256])
    cv2.normalize(hist, hist, 0, 1, cv2.NORM_MINMAX)
    
    return hist.flatten()


def load_encodings():
    """加载已保存的人脸编码"""
    if os.path.exists(ENCODINGS_FILE):
        with open(ENCODINGS_FILE, 'rb') as f:
            return pickle.load(f)
    return {'names': [], 'histograms': []}


def save_encodings(data):
    """保存人脸编码"""
    with open(ENCODINGS_FILE, 'wb') as f:
        pickle.dump(data, f)


def register_face(image_path, person_name):
    """注册人脸到数据库"""
    try:
        import cv2
        
        # 加载图像
        img = cv2.imread(image_path)
        if img is None:
            return {"success": False, "error": "无法读取图像"}
        
        # 检测人脸
        faces = detect_faces_cv(img)
        if len(faces) == 0:
            return {"success": False, "error": "未检测到人脸"}
        
        # 取最大的人脸
        face = max(faces, key=lambda f: f[2] * f[3])
        
        # 计算直方图特征
        hist = compute_face_histogram(img, face)
        if hist is None:
            return {"success": False, "error": "无法提取人脸特征"}
        
        # 加载现有数据库
        db = load_encodings()
        
        # 更新或添加
        if person_name in db['names']:
            idx = db['names'].index(person_name)
            db['histograms'][idx] = hist
            action = "updated"
        else:
            db['names'].append(person_name)
            db['histograms'].append(hist)
            action = "registered"
        
        save_encodings(db)
        
        # 保存原始图片
        save_path = os.path.join(FACE_DB_DIR, f"{person_name}.jpg")
        cv2.imwrite(save_path, img)
        
        # 保存裁剪的人脸
        x, y, w, h = face[:4]
        face_img = img[y:y+h, x:x+w]
        face_path = os.path.join(FACE_DB_DIR, f"{person_name}_face.jpg")
        cv2.imwrite(face_path, face_img)
        
        return {
            "success": True,
            "action": action,
            "name": person_name,
            "image_saved": save_path,
            "face_saved": face_path,
            "face_rect": {"x": x, "y": y, "w": w, "h": h}
        }
        
    except ImportError as e:
        return {"success": False, "error": f"依赖库未安装: {str(e)}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def recognize_face(image_path, threshold=0.7):
    """识别图像中的人脸（使用直方图相似度匹配）"""
    try:
        import cv2
        import numpy as np
        
        # 加载数据库
        db = load_encodings()
        if len(db['names']) == 0:
            return {
                "success": True,
                "recognized": False,
                "message": "人脸库为空，请先注册人脸"
            }
        
        # 加载图像
        img = cv2.imread(image_path)
        if img is None:
            return {"success": False, "error": "无法读取图像"}
        
        height, width = img.shape[:2]
        
        # 检测人脸
        faces = detect_faces_cv(img)
        if len(faces) == 0:
            return {
                "success": True,
                "recognized": False,
                "faces": [],
                "message": "未检测到人脸"
            }
        
        # 匹配每张脸
        results = []
        recognized_names = []
        
        for face in faces:
            x, y, w, h, det_conf = face
            
            # 计算直方图
            hist = compute_face_histogram(img, face)
            if hist is None:
                continue
            
            # 与所有已知人脸比较
            best_match = None
            best_score = 0
            
            for i, known_hist in enumerate(db['histograms']):
                # 使用相关性比较直方图
                score = cv2.compareHist(
                    hist.reshape(-1, 1).astype(np.float32),
                    known_hist.reshape(-1, 1).astype(np.float32),
                    cv2.HISTCMP_CORREL
                )
                
                if score > best_score:
                    best_score = score
                    best_match = db['names'][i]
            
            # 判断是否匹配
            if best_score >= threshold:
                name = best_match
                recognized_names.append(name)
            else:
                name = "unknown"
            
            results.append({
                "x": x, "y": y, "w": w, "h": h,
                "name": name,
                "confidence": round(float(best_score), 3),
                "detection_conf": round(float(det_conf), 3)
            })
        
        is_owner = 'owner' in recognized_names
        
        return {
            "success": True,
            "recognized": len(recognized_names) > 0,
            "is_owner": is_owner,
            "faces": results,
            "imageWidth": width,
            "imageHeight": height,
            "known_names": recognized_names
        }
        
    except ImportError as e:
        return {"success": False, "error": f"依赖库未安装: {str(e)}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def list_faces():
    """列出已注册的人脸"""
    face_images = [f for f in os.listdir(FACE_DB_DIR) if f.endswith(('.jpg', '.png'))]
    
    faces = []
    for img_file in face_images:
        name = os.path.splitext(img_file)[0]
        faces.append({
            "name": name,
            "image": img_file
        })
    
    return {
        "success": True,
        "count": len(faces),
        "faces": faces
    }


def delete_face(person_name):
    """删除已注册的人脸"""
    # 查找并删除图片
    deleted = False
    for ext in ['.jpg', '.png']:
        img_path = os.path.join(FACE_DB_DIR, f"{person_name}{ext}")
        if os.path.exists(img_path):
            os.remove(img_path)
            deleted = True
    
    if not deleted:
        return {"success": False, "error": f"未找到: {person_name}"}
    
    # 删除缓存
    pkl_files = [f for f in os.listdir(FACE_DB_DIR) if f.endswith('.pkl')]
    for pkl in pkl_files:
        os.remove(os.path.join(FACE_DB_DIR, pkl))
    
    return {"success": True, "deleted": person_name}


def main():
    if len(sys.argv) < 2:
        print(json.dumps({
            "error": "用法: python face_recognize.py <command> [args]",
            "commands": ["register <image> <name>", "recognize <image>", "list", "delete <name>"]
        }))
        sys.exit(1)
    
    command = sys.argv[1]
    
    if command == "register":
        if len(sys.argv) < 4:
            print(json.dumps({"error": "用法: register <image_path> <person_name>"}))
            sys.exit(1)
        result = register_face(sys.argv[2], sys.argv[3])
    
    elif command == "recognize":
        if len(sys.argv) < 3:
            print(json.dumps({"error": "用法: recognize <image_path>"}))
            sys.exit(1)
        result = recognize_face(sys.argv[2])
    
    elif command == "list":
        result = list_faces()
    
    elif command == "delete":
        if len(sys.argv) < 3:
            print(json.dumps({"error": "用法: delete <person_name>"}))
            sys.exit(1)
        result = delete_face(sys.argv[2])
    
    else:
        result = {"error": f"未知命令: {command}"}
    
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
