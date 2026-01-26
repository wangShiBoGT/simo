/**
 * Simo L3 - 自主避障管理器
 * 
 * 功能：
 * 1. 传感器驱动行为（超声波+红外 → 自动避障）
 * 2. 舵机扫描（左中右测距）
 * 3. 决策：哪边安全往哪边走
 * 
 * 铁律：
 * - 人类随时可以喊停（STOP 最高优先级）
 * - 自主模式可随时关闭
 * - 所有动作仍经过 Guard/Safety 检查
 */

import * as serial from '../serial.js';
import hardwareConfig from '../hardware.config.js';

// 自主模式状态 - 默认关闭，需要用户手动启动
let autonomyEnabled = false;
let autonomyMode = 'idle';  // idle | scanning | avoiding | exploring
let autonomyStartedByUser = false;  // 标记是否由用户主动启动
let scanInterval = null;
let lastScanResult = null;

// 从统一配置读取阈值（P0-3: 安全阈值配置化）
const thresholds = hardwareConfig.safety?.obstacleThresholds || { danger: 15, caution: 30, safe: 50 };
const capabilities = hardwareConfig.capabilities || {};

// 配置参数（阈值从统一配置读取）
const CONFIG = {
  // 距离阈值（cm）- 从 hardware.config.js 统一读取
  DANGER_DISTANCE: thresholds.danger,
  CAUTION_DISTANCE: thresholds.caution,
  SAFE_DISTANCE: thresholds.safe,
  
  // 舵机角度（仅在 capabilities.servo=true 时生效）
  SERVO_LEFT: 150,
  SERVO_CENTER: 90,
  SERVO_RIGHT: 30,
  
  // 时间参数（ms）
  SCAN_DELAY: 300,
  MOVE_DURATION: 400,
  TURN_DURATION: 300,
  
  // 扫描间隔（ms）
  SCAN_INTERVAL: 500
};

/**
 * 启动自主避障模式
 */
export function startAutonomy(mode = 'exploring') {
  if (autonomyEnabled) return { success: false, message: '自主模式已启动' };
  
  autonomyEnabled = true;
  autonomyMode = mode;  // 默认探索模式
  
  console.log('🤖 [Autonomy] 自主避障模式启动');
  
  // 舵机归中（仅在舵机可用时）
  if (capabilities.servo) {
    serial.sendServo(CONFIG.SERVO_CENTER);
  }
  
  // 启动扫描循环
  scanInterval = setInterval(autonomyLoop, CONFIG.SCAN_INTERVAL);
  
  return { success: true, message: '自主避障模式已启动' };
}

/**
 * 停止自主避障模式
 */
export function stopAutonomy() {
  if (!autonomyEnabled) return { success: false, message: '自主模式未启动' };
  
  autonomyEnabled = false;
  autonomyMode = 'idle';
  
  if (scanInterval) {
    clearInterval(scanInterval);
    scanInterval = null;
  }
  
  // 停止运动
  serial.sendStop();
  
  // 舵机归中（仅在舵机可用时）
  if (capabilities.servo) {
    serial.sendServo(CONFIG.SERVO_CENTER);
  }
  
  console.log('🤖 [Autonomy] 自主避障模式停止');
  
  return { success: true, message: '自主避障模式已停止' };
}

/**
 * 自主循环（核心逻辑）
 */
async function autonomyLoop() {
  if (!autonomyEnabled) return;
  
  try {
    // 1. 主动查询传感器数据
    serial.send('SENSOR');
    await delay(100);  // 等待响应
    
    const sensors = serial.getSensorData();
    const distance = sensors.ultrasonic?.distance;
    const irLeft = sensors.infrared?.left;
    const irRight = sensors.infrared?.right;
    
    console.log(`🤖 [Autonomy] 距离=${distance}cm, 红外L=${irLeft} R=${irRight}`);
    
    // 2. 红外优先（近距离障碍）- 暂时禁用，红外传感器误报
    // if (irLeft === 0 || irRight === 0) {
    //   await handleInfraredObstacle(irLeft, irRight);
    //   return;
    // }
    
    // 3. 超声波判断
    if (distance !== null && distance < CONFIG.DANGER_DISTANCE) {
      // 危险！停止并扫描
      serial.sendStop();
      await performScan();
      return;
    }
    
    if (distance !== null && distance < CONFIG.CAUTION_DISTANCE) {
      // 警戒，扫描后决策
      await performScan();
      return;
    }
    
    // 4. 安全，继续前进（使用统一的sendMove协议入口）
    if (autonomyMode === 'exploring' && distance !== null && distance > CONFIG.SAFE_DISTANCE) {
      serial.sendMove('F', 0.5, CONFIG.MOVE_DURATION);
    } else if (autonomyMode === 'exploring' && (distance === null || distance > CONFIG.CAUTION_DISTANCE)) {
      // 距离未知或在警戒范围外，谨慎前进
      serial.sendMove('F', 0.5, Math.floor(CONFIG.MOVE_DURATION / 2));
    }
    
  } catch (error) {
    console.error('🤖 [Autonomy] 循环错误:', error.message);
  }
}

/**
 * 处理红外障碍
 */
async function handleInfraredObstacle(irLeft, irRight) {
  console.log('🤖 [Autonomy] 红外检测到障碍');
  
  // 先停止
  serial.sendStop();
  await delay(100);
  
  if (irLeft === 0 && irRight === 0) {
    // 两边都有障碍，后退
    console.log('🤖 [Autonomy] 两侧障碍，后退');
    serial.sendMove('B', 0.5, CONFIG.MOVE_DURATION);
  } else if (irLeft === 0) {
    // 左边有障碍，右转
    console.log('🤖 [Autonomy] 左侧障碍，右转');
    serial.sendMove('R', 0.5, CONFIG.TURN_DURATION);
  } else {
    // 右边有障碍，左转
    console.log('🤖 [Autonomy] 右侧障碍，左转');
    serial.sendMove('L', 0.5, CONFIG.TURN_DURATION);
  }
}

/**
 * 舵机扫描（左中右）- 仅在舵机可用时执行
 */
async function performScan() {
  const result = { left: null, center: null, right: null };
  
  // 舵机不可用时，只读取正前方传感器
  if (!capabilities.servo) {
    console.log('🤖 [Autonomy] 舵机不可用，仅读取正前方');
    serial.send('SENSOR');
    await delay(100);
    result.center = serial.getSensorData().ultrasonic?.distance;
    lastScanResult = result;
    await makeDecision(result);
    return result;
  }
  
  console.log('🤖 [Autonomy] 开始舵机扫描');
  
  // 扫描左侧
  serial.sendServo(CONFIG.SERVO_LEFT);
  await delay(CONFIG.SCAN_DELAY);
  serial.send('SENSOR');
  await delay(100);
  result.left = serial.getSensorData().ultrasonic?.distance;
  
  // 扫描正前方
  serial.sendServo(CONFIG.SERVO_CENTER);
  await delay(CONFIG.SCAN_DELAY);
  serial.send('SENSOR');
  await delay(100);
  result.center = serial.getSensorData().ultrasonic?.distance;
  
  // 扫描右侧
  serial.sendServo(CONFIG.SERVO_RIGHT);
  await delay(CONFIG.SCAN_DELAY);
  serial.send('SENSOR');
  await delay(100);
  result.right = serial.getSensorData().ultrasonic?.distance;
  
  // 归中
  serial.sendServo(CONFIG.SERVO_CENTER);
  
  lastScanResult = result;
  console.log(`🤖 [Autonomy] 扫描结果: L=${result.left} C=${result.center} R=${result.right}`);
  
  // 决策
  await makeDecision(result);
  
  return result;
}

/**
 * 根据扫描结果决策
 */
async function makeDecision(scan) {
  const { left, center, right } = scan;
  
  // 找最远的方向
  const distances = [
    { dir: 'left', dist: left || 0 },
    { dir: 'center', dist: center || 0 },
    { dir: 'right', dist: right || 0 }
  ];
  
  distances.sort((a, b) => b.dist - a.dist);
  const best = distances[0];
  
  console.log(`🤖 [Autonomy] 最佳方向: ${best.dir} (${best.dist}cm)`);
  
  if (best.dist < CONFIG.DANGER_DISTANCE) {
    // 全部危险，后退
    console.log('🤖 [Autonomy] 全方向危险，后退');
    serial.sendMove('B', 0.5, CONFIG.MOVE_DURATION);
    return;
  }
  
  // 转向最佳方向（使用统一的sendMove协议入口）
  if (best.dir === 'left') {
    console.log('🤖 [Autonomy] 执行左转');
    serial.sendMove('L', 0.5, CONFIG.TURN_DURATION);
  } else if (best.dir === 'right') {
    console.log('🤖 [Autonomy] 执行右转');
    serial.sendMove('R', 0.5, CONFIG.TURN_DURATION);
  } else {
    // 正前方最好，前进
    if (autonomyMode === 'exploring' && best.dist > CONFIG.CAUTION_DISTANCE) {
      console.log('🤖 [Autonomy] 前方安全，前进');
      serial.sendMove('F', 0.5, CONFIG.MOVE_DURATION);
    }
  }
}

/**
 * 获取自主模式状态
 */
export function getAutonomyState() {
  return {
    enabled: autonomyEnabled,
    mode: autonomyMode,
    lastScan: lastScanResult,
    config: CONFIG
  };
}

/**
 * 设置自主模式
 */
export function setAutonomyMode(mode) {
  if (['idle', 'scanning', 'avoiding', 'exploring'].includes(mode)) {
    autonomyMode = mode;
    console.log(`🤖 [Autonomy] 模式切换: ${mode}`);
    return { success: true, mode };
  }
  return { success: false, message: '无效模式' };
}

/**
 * 手动触发扫描
 */
export async function triggerScan() {
  return await performScan();
}

// 工具函数
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default {
  startAutonomy,
  stopAutonomy,
  getAutonomyState,
  setAutonomyMode,
  triggerScan
};
