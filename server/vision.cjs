/**
 * Simo 视觉识别服务（优化版）
 * 
 * 核心优化：
 * 1. 只处理最新帧（防止队列堆积）
 * 2. 二进制传输（已是JPEG）
 * 3. 分段计时定位延迟
 * 4. 使用InsightFace（SCRFD检测 + ArcFace识别）
 * 
 * @version 2.0.0
 */

const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')

// 临时帧存储目录
const FRAME_DIR = path.join(__dirname, '../temp/frames')
if (!fs.existsSync(FRAME_DIR)) {
    fs.mkdirSync(FRAME_DIR, { recursive: true })
}

// ============ 只处理最新帧策略 ============
let latestFrame = null           // 最新帧缓存（覆盖式）
let latestFrameTime = 0          // 最新帧时间戳
let isProcessing = false         // 是否正在处理
let droppedFrames = 0            // 丢弃的帧数（统计用）

// 识别状态
let lastFaceDetected = null
let lastFacePosition = null  // { x, y, w, h }
let frameCount = 0
let processedCount = 0

// 性能统计
let timingStats = {
    lastCapture: 0,      // ESP32抓帧时间
    lastReceive: 0,      // Node收到时间
    lastDecodeStart: 0,  // Python开始解码
    lastInferEnd: 0,     // 推理结束
    lastResponse: 0      // 返回响应
}

/**
 * 处理视觉帧（只处理最新帧策略）
 * @param {Buffer} imageBuffer - JPEG图像数据
 * @param {string} deviceMAC - 设备MAC地址
 * @param {number} captureTime - ESP32抓帧时间戳（可选）
 * @returns {Promise<Object>} 识别结果
 */
async function processFrame(imageBuffer, deviceMAC, captureTime = 0) {
    const receiveTime = Date.now()
    frameCount++
    
    // ============ 只处理最新帧策略 ============
    // 如果正在处理，只更新缓存，不排队
    if (isProcessing) {
        latestFrame = imageBuffer
        latestFrameTime = receiveTime
        droppedFrames++
        return {
            queued: true,
            dropped: droppedFrames,
            message: '已缓存，等待处理最新帧'
        }
    }
    
    isProcessing = true
    timingStats.lastCapture = captureTime
    timingStats.lastReceive = receiveTime
    
    // 保存帧到临时文件
    const framePath = path.join(FRAME_DIR, `frame_${deviceMAC.replace(/:/g, '')}.jpg`)
    fs.writeFileSync(framePath, imageBuffer)
    
    try {
        // 调用Python进行人脸检测
        const result = await detectFace(framePath)
        
        if (result.faces && result.faces.length > 0) {
            const face = result.faces[0]  // 取第一张脸
            lastFaceDetected = Date.now()
            lastFacePosition = face
            
            // 计算跟随方向
            const imageCenter = result.imageWidth / 2
            const faceCenter = face.x + face.w / 2
            const threshold = result.imageWidth * 0.15  // 15%容差
            
            let direction = 'center'
            if (faceCenter < imageCenter - threshold) {
                direction = 'left'
            } else if (faceCenter > imageCenter + threshold) {
                direction = 'right'
            } else {
                // 根据脸的大小判断距离
                const faceArea = face.w * face.h
                const imageArea = result.imageWidth * result.imageHeight
                const faceRatio = faceArea / imageArea
                
                if (faceRatio < 0.05) {
                    direction = 'forward'  // 人脸太小，需要靠近
                } else if (faceRatio > 0.25) {
                    direction = 'backward'  // 人脸太大，需要后退
                }
            }
            
            // 分段计时
            timingStats.lastResponse = Date.now()
            const totalLatency = timingStats.lastResponse - timingStats.lastReceive
            
            console.log(`[Vision] 人脸: ${face.w}x${face.h}, 方向: ${direction}, 延迟: ${totalLatency}ms`)
            
            processedCount++
            isProcessing = false
            
            // 检查是否有新帧等待处理
            if (latestFrame && latestFrameTime > timingStats.lastReceive) {
                // 异步处理下一帧（不阻塞返回）
                setImmediate(() => processFrame(latestFrame, deviceMAC))
                latestFrame = null
            }
            
            return {
                detected: true,
                action: 'follow',
                direction: direction,
                face: face,
                confidence: face.confidence || 0.9,
                timing: { latency: totalLatency, dropped: droppedFrames }
            }
        } else {
            // 未检测到人脸
            const timeSinceLastFace = lastFaceDetected ? Date.now() - lastFaceDetected : null
            
            timingStats.lastResponse = Date.now()
            const totalLatency = timingStats.lastResponse - timingStats.lastReceive
            
            processedCount++
            isProcessing = false
            
            // 检查是否有新帧等待处理
            if (latestFrame && latestFrameTime > timingStats.lastReceive) {
                setImmediate(() => processFrame(latestFrame, deviceMAC))
                latestFrame = null
            }
            
            return {
                detected: false,
                action: timeSinceLastFace && timeSinceLastFace < 2000 ? 'search' : 'stop',
                direction: 'none',
                timing: { latency: totalLatency, dropped: droppedFrames }
            }
        }
    } catch (error) {
        console.error('[Vision] 识别错误:', error.message)
        isProcessing = false
        return {
            detected: false,
            action: 'stop',
            error: error.message
        }
    }
}

/**
 * 调用Python进行人脸检测
 * @param {string} imagePath - 图像路径
 * @returns {Promise<Object>} 检测结果
 */
function detectFace(imagePath) {
    return new Promise((resolve, reject) => {
        const pythonScript = path.join(__dirname, '../scripts/face_detect.py')
        
        // 检查Python脚本是否存在
        if (!fs.existsSync(pythonScript)) {
            resolve({
                faces: [],
                imageWidth: 640,
                imageHeight: 480,
                message: 'Python脚本不存在'
            })
            return
        }
        
        const python = spawn('python', [pythonScript, imagePath])
        
        let stdout = ''
        let stderr = ''
        
        python.stdout.on('data', (data) => {
            stdout += data.toString()
        })
        
        python.stderr.on('data', (data) => {
            stderr += data.toString()
        })
        
        python.on('close', (code) => {
            if (code === 0) {
                try {
                    const result = JSON.parse(stdout)
                    resolve(result)
                } catch (e) {
                    reject(new Error('解析Python输出失败: ' + stdout))
                }
            } else {
                reject(new Error('Python脚本执行失败: ' + stderr))
            }
        })
        
        python.on('error', (err) => {
            reject(new Error('无法启动Python: ' + err.message))
        })
        
        // 超时处理
        setTimeout(() => {
            python.kill()
            reject(new Error('Python脚本超时'))
        }, 5000)
    })
}

/**
 * 调用Python进行人脸识别（身份匹配）
 * @param {string} imagePath - 图像路径
 * @returns {Promise<Object>} 识别结果
 */
function recognizeFace(imagePath) {
    return new Promise((resolve, reject) => {
        const pythonScript = path.join(__dirname, '../scripts/face_recognize.py')
        
        if (!fs.existsSync(pythonScript)) {
            resolve({
                success: false,
                error: 'Python脚本不存在'
            })
            return
        }
        
        const python = spawn('python', [pythonScript, 'recognize', imagePath])
        
        let stdout = ''
        let stderr = ''
        
        python.stdout.on('data', (data) => {
            stdout += data.toString()
        })
        
        python.stderr.on('data', (data) => {
            stderr += data.toString()
        })
        
        python.on('close', (code) => {
            if (code === 0) {
                try {
                    const result = JSON.parse(stdout)
                    resolve(result)
                } catch (e) {
                    reject(new Error('解析Python输出失败: ' + stdout))
                }
            } else {
                reject(new Error('Python脚本执行失败: ' + stderr))
            }
        })
        
        python.on('error', (err) => {
            reject(new Error('无法启动Python: ' + err.message))
        })
        
        setTimeout(() => {
            python.kill()
            reject(new Error('Python脚本超时'))
        }, 10000)
    })
}

/**
 * 注册人脸到数据库
 * @param {string} imagePath - 图像路径
 * @param {string} personName - 人名
 * @returns {Promise<Object>} 注册结果
 */
function registerFace(imagePath, personName) {
    return new Promise((resolve, reject) => {
        const pythonScript = path.join(__dirname, '../scripts/face_recognize.py')
        
        if (!fs.existsSync(pythonScript)) {
            resolve({ success: false, error: 'Python脚本不存在' })
            return
        }
        
        const python = spawn('python', [pythonScript, 'register', imagePath, personName])
        
        let stdout = ''
        let stderr = ''
        
        python.stdout.on('data', (data) => {
            stdout += data.toString()
        })
        
        python.stderr.on('data', (data) => {
            stderr += data.toString()
        })
        
        python.on('close', (code) => {
            if (code === 0) {
                try {
                    resolve(JSON.parse(stdout))
                } catch (e) {
                    reject(new Error('解析输出失败: ' + stdout))
                }
            } else {
                reject(new Error('注册失败: ' + stderr))
            }
        })
        
        python.on('error', (err) => {
            reject(new Error('无法启动Python: ' + err.message))
        })
    })
}

/**
 * 列出已注册的人脸
 * @returns {Promise<Object>} 人脸列表
 */
function listFaces() {
    return new Promise((resolve, reject) => {
        const pythonScript = path.join(__dirname, '../scripts/face_recognize.py')
        
        if (!fs.existsSync(pythonScript)) {
            resolve({ success: false, error: 'Python脚本不存在' })
            return
        }
        
        const python = spawn('python', [pythonScript, 'list'])
        
        let stdout = ''
        
        python.stdout.on('data', (data) => {
            stdout += data.toString()
        })
        
        python.on('close', (code) => {
            if (code === 0) {
                try {
                    resolve(JSON.parse(stdout))
                } catch (e) {
                    reject(new Error('解析输出失败'))
                }
            } else {
                reject(new Error('列出失败'))
            }
        })
    })
}

/**
 * 获取视觉状态（含性能统计）
 */
function getStatus() {
    return {
        frameCount,
        processedCount,
        droppedFrames,
        dropRate: frameCount > 0 ? (droppedFrames / frameCount * 100).toFixed(1) + '%' : '0%',
        isProcessing,
        lastFaceDetected,
        lastFacePosition,
        timing: timingStats,
        frameDir: FRAME_DIR
    }
}

module.exports = {
    processFrame,
    detectFace,
    recognizeFace,
    registerFace,
    listFaces,
    getStatus
}
