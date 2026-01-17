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

// 自主模式状态
let autonomyEnabled = false;
let autonomyMode = 'idle';  // idle | scanning | avoiding | exploring
let scanInterval = null;
let lastScanResult = null;

// 配置参数
const CONFIG = {
  // 距离阈值（cm）
  DANGER_DISTANCE: 15,      // 危险距离，必须停止
  CAUTION_DISTANCE: 30,     // 警戒距离，减速或转向
  SAFE_DISTANCE: 50,        // 安全距离，可以前进
  
  // 舵机角度
  SERVO_LEFT: 150,          // 左侧扫描角度
  SERVO_CENTER: 90,         // 正前方
  SERVO_RIGHT: 30,          // 右侧扫描角度
  
  // 时间参数（ms）
  SCAN_DELAY: 300,          // 舵机转动后等待时间
  MOVE_DURATION: 400,       // 单次移动时间
  TURN_DURATION: 300,       // 单次转向时间
  
  // 扫描间隔（ms）
  SCAN_INTERVAL: 500        // 自动扫描间隔
};

/**
 * 启动自主避障模式
 */
export function startAutonomy() {
  if (autonomyEnabled) return { success: false, message: '自主模式已启动' };
  
  autonomyEnabled = true;
  autonomyMode = 'scanning';
  
  console.log('🤖 [Autonomy] 自主避障模式启动');
  
  // 舵机归中
  serial.sendServo(CONFIG.SERVO_CENTER);
  
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
  
  // 舵机归中
  serial.sendServo(CONFIG.SERVO_CENTER);
  
  console.log('🤖 [Autonomy] 自主避障模式停止');
  
  return { success: true, message: '自主避障模式已停止' };
}

/**
 * 自主循环（核心逻辑）
 */
async function autonomyLoop() {
  if (!autonomyEnabled) return;
  
  try {
    // 1. 获取传感器数据
    const sensors = serial.getSensorData();
    const distance = sensors.ultrasonic?.distance;
    const irLeft = sensors.infrared?.left;
    const irRight = sensors.infrared?.right;
    
    console.log(`🤖 [Autonomy] 距离=${distance}cm, 红外L=${irLeft} R=${irRight}`);
    
    // 2. 红外优先（近距离障碍）
    if (irLeft === 0 || irRight === 0) {
      await handleInfraredObstacle(irLeft, irRight);
      return;
    }
    
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
    
    // 4. 安全，继续前进
    if (autonomyMode === 'exploring') {
      serial.send(`F,${CONFIG.MOVE_DURATION}`);
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
    serial.send(`B,${CONFIG.MOVE_DURATION}`);
  } else if (irLeft === 0) {
    // 左边有障碍，右转
    console.log('🤖 [Autonomy] 左侧障碍，右转');
    serial.send(`R,${CONFIG.TURN_DURATION}`);
  } else {
    // 右边有障碍，左转
    console.log('🤖 [Autonomy] 右侧障碍，左转');
    serial.send(`L,${CONFIG.TURN_DURATION}`);
  }
}

/**
 * 舵机扫描（左中右）
 */
async function performScan() {
  console.log('🤖 [Autonomy] 开始舵机扫描');
  
  const result = { left: null, center: null, right: null };
  
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
    serial.send(`B,${CONFIG.MOVE_DURATION}`);
    return;
  }
  
  // 转向最佳方向
  if (best.dir === 'left') {
    serial.send(`L,${CONFIG.TURN_DURATION}`);
  } else if (best.dir === 'right') {
    serial.send(`R,${CONFIG.TURN_DURATION}`);
  } else {
    // 正前方最好，前进
    if (autonomyMode === 'exploring') {
      serial.send(`F,${CONFIG.MOVE_DURATION}`);
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
