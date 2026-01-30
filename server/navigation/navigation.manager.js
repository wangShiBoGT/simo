/**
 * Simo L3 - 自主导航管理器
 * 
 * 功能：
 * 1. 巡逻模式：在边界内自由探索
 * 2. 跟随模式：跟随检测到的人脸
 * 3. 返航模式：返回起始点
 * 4. 边界检测：结合视觉系统检测边界线
 * 
 * 状态机：
 * [空闲] → [巡逻/跟随] → [检测障碍/边界] → [避障/转向] → [继续]
 *   ↑                           ↓
 *   └──────────────────── [停止]
 * 
 * @version 1.0.0
 */

import * as serial from '../serial.js';
import hardwareConfig from '../hardware.config.js';
import { forceStop } from '../intent/index.js';

// 创建 require 用于导入 CommonJS 模块
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const vision = require('../vision.cjs');

// ============ 导航状态 ============
export const NavState = {
  IDLE: 'idle',           // 空闲
  PATROL: 'patrol',       // 巡逻
  FOLLOW: 'follow',       // 跟随
  RETURN: 'return',       // 返航
  AVOIDING: 'avoiding',   // 避障中
  BOUNDARY: 'boundary',   // 边界检测中
  STOPPED: 'stopped'      // 被停止
};

// ============ 导航配置 ============
const thresholds = hardwareConfig.safety?.obstacleThresholds || { danger: 15, caution: 30, safe: 50 };

const CONFIG = {
  // 距离阈值（cm）
  DANGER_DISTANCE: thresholds.danger,
  CAUTION_DISTANCE: thresholds.caution,
  SAFE_DISTANCE: thresholds.safe,
  
  // 运动参数（ms）
  MOVE_DURATION: 400,
  TURN_DURATION: 300,
  SLOW_DURATION: 200,
  
  // 跟随参数
  FOLLOW_SPEED: 0.5,
  FOLLOW_TURN_DURATION: 200,
  FACE_LOST_TIMEOUT: 2000,  // 人脸丢失超时（ms）
  
  // 巡逻参数
  PATROL_INTERVAL: 500,     // 巡逻循环间隔（ms）
  PATROL_CHANGE_DIR: 10000, // 随机换方向间隔（ms）
  
  // 边界检测参数
  BOUNDARY_COLOR: 'red',    // 边界线颜色
  BOUNDARY_THRESHOLD: 0.1,  // 边界检测阈值
  
  // 返航参数
  RETURN_STEPS: [],         // 返航路径（记录的反向步骤）
  MAX_RETURN_STEPS: 100     // 最大记录步数
};

// ============ 导航状态管理 ============
let navState = NavState.IDLE;
let navInterval = null;
let lastStateChange = Date.now();
let startPosition = { x: 0, y: 0, heading: 0 };  // 起始位置（简化版）
let currentPosition = { x: 0, y: 0, heading: 0 };
let pathHistory = [];  // 路径历史（用于返航）
let lastFaceTime = 0;  // 上次检测到人脸的时间
let lastFaceDirection = null;  // 上次人脸方向

// 统计信息
let stats = {
  patrolTime: 0,
  followTime: 0,
  avoidCount: 0,
  boundaryCount: 0,
  totalDistance: 0
};

/**
 * 启动导航
 * @param {string} mode - 导航模式：patrol/follow/return
 */
export function startNavigation(mode = 'patrol') {
  if (navState !== NavState.IDLE && navState !== NavState.STOPPED) {
    return { success: false, message: `导航已在运行: ${navState}` };
  }
  
  console.log(`🧭 [Nav] 启动导航模式: ${mode}`);
  
  switch (mode) {
    case 'patrol':
      navState = NavState.PATROL;
      startPosition = { ...currentPosition };
      navInterval = setInterval(patrolLoop, CONFIG.PATROL_INTERVAL);
      break;
      
    case 'follow':
      navState = NavState.FOLLOW;
      navInterval = setInterval(followLoop, 200);  // 跟随需要更快响应
      break;
      
    case 'return':
      navState = NavState.RETURN;
      navInterval = setInterval(returnLoop, CONFIG.PATROL_INTERVAL);
      break;
      
    default:
      return { success: false, message: `未知模式: ${mode}` };
  }
  
  lastStateChange = Date.now();
  return { success: true, mode, state: navState };
}

/**
 * 停止导航
 */
export function stopNavigation() {
  if (navState === NavState.IDLE) {
    return { success: false, message: '导航未启动' };
  }
  
  console.log('🧭 [Nav] 停止导航');
  
  if (navInterval) {
    clearInterval(navInterval);
    navInterval = null;
  }
  
  // 停止运动
  const serialStatus = serial.getStatus();
  if (serialStatus.connected) {
    serial.sendStop();
  }
  
  navState = NavState.STOPPED;
  lastStateChange = Date.now();
  
  return { success: true, message: '导航已停止' };
}

/**
 * 重置导航（回到空闲状态）
 */
export function resetNavigation() {
  stopNavigation();
  navState = NavState.IDLE;
  pathHistory = [];
  stats = { patrolTime: 0, followTime: 0, avoidCount: 0, boundaryCount: 0, totalDistance: 0 };
  return { success: true, message: '导航已重置' };
}

// ============ 巡逻模式 ============
async function patrolLoop() {
  if (navState !== NavState.PATROL) return;
  
  try {
    // 1. 查询传感器
    serial.send('SENSOR');
    await delay(100);
    
    const sensors = serial.getSensorData();
    const distance = sensors.ultrasonic?.distance;
    const irLeft = sensors.infrared?.left;
    const irRight = sensors.infrared?.right;
    
    // 2. 检查视觉边界（如果可用）
    const visionStatus = vision.getStatus();
    if (visionStatus.lastFacePosition) {
      // 有视觉数据，可以检测边界
      const boundaryResult = await checkBoundary();
      if (boundaryResult.detected) {
        console.log('🧭 [Nav] 检测到边界，转向');
        stats.boundaryCount++;
        await handleBoundary(boundaryResult.direction);
        return;
      }
    }
    
    // 3. 超声波避障
    if (distance !== null && distance < CONFIG.DANGER_DISTANCE) {
      console.log(`🧭 [Nav] 危险距离 ${distance}cm，避障`);
      stats.avoidCount++;
      await handleObstacle('danger');
      return;
    }
    
    if (distance !== null && distance < CONFIG.CAUTION_DISTANCE) {
      console.log(`🧭 [Nav] 警戒距离 ${distance}cm，减速`);
      await handleObstacle('caution');
      return;
    }
    
    // 4. 安全，继续前进
    if (distance === null || distance > CONFIG.SAFE_DISTANCE) {
      serial.sendMove('F', 0.5, CONFIG.MOVE_DURATION);
      recordPath('F', CONFIG.MOVE_DURATION);
      stats.totalDistance += CONFIG.MOVE_DURATION / 1000;  // 简化距离估算
    }
    
    stats.patrolTime += CONFIG.PATROL_INTERVAL;
    
  } catch (error) {
    console.error('🧭 [Nav] 巡逻错误:', error.message);
  }
}

// ============ 跟随模式 ============
async function followLoop() {
  if (navState !== NavState.FOLLOW) return;
  
  try {
    // 获取视觉识别结果
    const visionStatus = vision.getStatus();
    
    if (visionStatus.lastFaceDetected) {
      const timeSinceface = Date.now() - visionStatus.lastFaceDetected;
      
      if (timeSinceface < CONFIG.FACE_LOST_TIMEOUT) {
        lastFaceTime = visionStatus.lastFaceDetected;
        
        // 有人脸，根据方向跟随
        const facePos = visionStatus.lastFacePosition;
        if (facePos) {
          const direction = calculateFollowDirection(facePos);
          lastFaceDirection = direction;
          
          switch (direction) {
            case 'left':
              console.log('🧭 [Nav] 跟随：左转');
              serial.sendMove('L', CONFIG.FOLLOW_SPEED, CONFIG.FOLLOW_TURN_DURATION);
              break;
            case 'right':
              console.log('🧭 [Nav] 跟随：右转');
              serial.sendMove('R', CONFIG.FOLLOW_SPEED, CONFIG.FOLLOW_TURN_DURATION);
              break;
            case 'forward':
              console.log('🧭 [Nav] 跟随：前进');
              serial.sendMove('F', CONFIG.FOLLOW_SPEED, CONFIG.SLOW_DURATION);
              break;
            case 'backward':
              console.log('🧭 [Nav] 跟随：后退（太近）');
              serial.sendMove('B', CONFIG.FOLLOW_SPEED, CONFIG.SLOW_DURATION);
              break;
            case 'center':
              // 人脸在中心，保持
              console.log('🧭 [Nav] 跟随：保持');
              break;
          }
        }
        
        stats.followTime += 200;
        return;
      }
    }
    
    // 人脸丢失
    const timeSinceLost = Date.now() - lastFaceTime;
    if (timeSinceLost < CONFIG.FACE_LOST_TIMEOUT * 2) {
      // 短暂丢失，尝试搜索
      console.log('🧭 [Nav] 人脸丢失，搜索中...');
      if (lastFaceDirection === 'left') {
        serial.sendMove('L', 0.3, 100);
      } else if (lastFaceDirection === 'right') {
        serial.sendMove('R', 0.3, 100);
      }
    } else {
      // 长时间丢失，停止
      console.log('🧭 [Nav] 人脸长时间丢失，停止跟随');
      serial.sendStop();
    }
    
  } catch (error) {
    console.error('🧭 [Nav] 跟随错误:', error.message);
  }
}

/**
 * 计算跟随方向
 */
function calculateFollowDirection(facePos) {
  // facePos: { x, y, w, h }
  const imageWidth = 320;  // QVGA
  const imageHeight = 240;
  const centerX = imageWidth / 2;
  const threshold = imageWidth * 0.15;
  
  const faceCenter = facePos.x + facePos.w / 2;
  
  if (faceCenter < centerX - threshold) {
    return 'left';
  } else if (faceCenter > centerX + threshold) {
    return 'right';
  }
  
  // 人脸在中心，检查大小判断距离
  const faceArea = facePos.w * facePos.h;
  const imageArea = imageWidth * imageHeight;
  const faceRatio = faceArea / imageArea;
  
  if (faceRatio < 0.05) {
    return 'forward';  // 人脸太小，靠近
  } else if (faceRatio > 0.25) {
    return 'backward';  // 人脸太大，后退
  }
  
  return 'center';
}

// ============ 返航模式 ============
async function returnLoop() {
  if (navState !== NavState.RETURN) return;
  
  try {
    if (pathHistory.length === 0) {
      console.log('🧭 [Nav] 已返回起点');
      stopNavigation();
      navState = NavState.IDLE;
      return;
    }
    
    // 取出最后一步并反向执行
    const lastStep = pathHistory.pop();
    const reverseDir = reverseDirection(lastStep.direction);
    
    console.log(`🧭 [Nav] 返航：${reverseDir} ${lastStep.duration}ms`);
    
    // 检查是否安全
    serial.send('SENSOR');
    await delay(100);
    const sensors = serial.getSensorData();
    const distance = sensors.ultrasonic?.distance;
    
    if (distance !== null && distance < CONFIG.DANGER_DISTANCE) {
      // 返航路径被阻挡
      console.log('🧭 [Nav] 返航路径被阻挡，尝试绕行');
      await handleObstacle('danger');
      return;
    }
    
    serial.sendMove(reverseDir, 0.5, lastStep.duration);
    
  } catch (error) {
    console.error('🧭 [Nav] 返航错误:', error.message);
  }
}

/**
 * 反向方向
 */
function reverseDirection(dir) {
  const map = { 'F': 'B', 'B': 'F', 'L': 'R', 'R': 'L' };
  return map[dir] || dir;
}

// ============ 边界检测 ============
async function checkBoundary() {
  // 简化实现：使用颜色检测
  // 实际需要结合 vision.js 的摄像头数据
  // 这里返回模拟结果，待摄像头集成后完善
  return {
    detected: false,
    direction: null,
    confidence: 0
  };
}

async function handleBoundary(direction) {
  // 检测到边界，转向
  const turnDir = direction === 'left' ? 'R' : 'L';
  serial.sendMove(turnDir, 0.5, CONFIG.TURN_DURATION);
  recordPath(turnDir, CONFIG.TURN_DURATION);
}

// ============ 避障处理 ============
async function handleObstacle(level) {
  const prevState = navState;
  navState = NavState.AVOIDING;
  
  // 先停止
  serial.sendStop();
  await delay(100);
  
  if (level === 'danger') {
    // 危险，后退后转向
    serial.sendMove('B', 0.5, CONFIG.MOVE_DURATION);
    await delay(CONFIG.MOVE_DURATION + 100);
    
    // 随机选择转向方向
    const turnDir = Math.random() > 0.5 ? 'L' : 'R';
    serial.sendMove(turnDir, 0.5, CONFIG.TURN_DURATION);
    recordPath(turnDir, CONFIG.TURN_DURATION);
  } else {
    // 警戒，减速并尝试绕行
    const turnDir = await chooseBetterDirection();
    serial.sendMove(turnDir, 0.3, CONFIG.TURN_DURATION);
    recordPath(turnDir, CONFIG.TURN_DURATION);
  }
  
  await delay(CONFIG.TURN_DURATION + 100);
  navState = prevState;  // 恢复之前状态
}

/**
 * 选择更好的方向（简化版，可扩展为舵机扫描）
 */
async function chooseBetterDirection() {
  // 简化：随机选择
  // 如果有舵机，可以扫描左右距离选择更远的方向
  return Math.random() > 0.5 ? 'L' : 'R';
}

// ============ 路径记录 ============
function recordPath(direction, duration) {
  if (pathHistory.length >= CONFIG.MAX_RETURN_STEPS) {
    pathHistory.shift();  // 移除最旧的
  }
  pathHistory.push({ direction, duration, timestamp: Date.now() });
}

// ============ 状态查询 ============
export function getNavState() {
  return {
    state: navState,
    lastStateChange,
    currentPosition,
    startPosition,
    pathLength: pathHistory.length,
    stats,
    config: {
      dangerDistance: CONFIG.DANGER_DISTANCE,
      cautionDistance: CONFIG.CAUTION_DISTANCE,
      safeDistance: CONFIG.SAFE_DISTANCE
    }
  };
}

/**
 * 设置导航模式（运行时切换）
 */
export function setNavMode(mode) {
  if (navState === NavState.IDLE) {
    return startNavigation(mode);
  }
  
  // 运行时切换
  stopNavigation();
  return startNavigation(mode);
}

// ============ 工具函数 ============
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default {
  NavState,
  startNavigation,
  stopNavigation,
  resetNavigation,
  getNavState,
  setNavMode
};
