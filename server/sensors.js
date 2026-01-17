/**
 * Simo 传感器服务
 * 
 * 负责读取和管理传感器数据
 * 原则：传感器只读不动，不自主行动
 */

import * as serial from './serial.js';

// 传感器数据缓存
let sensorData = {
  ultrasonic: {
    distance: null,      // 距离 (cm)
    lastUpdate: null
  },
  infrared: {
    left: null,          // 左红外 (0=黑线, 1=白底)
    right: null,         // 右红外
    lastUpdate: null
  },
  connected: false
};

// 轮询定时器
let pollTimer = null;
let pollInterval = 500;  // 默认 500ms

/**
 * 初始化传感器服务
 * @param {Object} options - 配置选项
 */
export function init(options = {}) {
  if (options.pollInterval) {
    pollInterval = options.pollInterval;
  }
  console.log(`📡 传感器服务初始化 (轮询间隔: ${pollInterval}ms)`);
}

/**
 * 开始轮询传感器
 */
export function startPolling() {
  if (pollTimer) return;
  
  console.log('📡 开始传感器轮询');
  pollTimer = setInterval(async () => {
    await readAllSensors();
  }, pollInterval);
  
  // 立即读取一次
  readAllSensors();
}

/**
 * 停止轮询
 */
export function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
    console.log('📡 停止传感器轮询');
  }
}

/**
 * 读取所有传感器
 */
async function readAllSensors() {
  const status = serial.getStatus();
  if (!status.connected) {
    sensorData.connected = false;
    return;
  }
  
  sensorData.connected = true;
  
  // 发送 SENSOR 命令读取所有传感器
  // 响应格式: SENSOR,D123,L0R1
  // 注意：需要 STM32 固件支持此命令
  serial.send('SENSOR');
}

/**
 * 读取超声波距离
 */
export async function readUltrasonic() {
  const status = serial.getStatus();
  if (!status.connected) return null;
  
  serial.send('DIST');
  // 响应会在 serial.js 的 handleResponse 中处理
  return sensorData.ultrasonic.distance;
}

/**
 * 读取红外循迹
 */
export async function readInfrared() {
  const status = serial.getStatus();
  if (!status.connected) return null;
  
  serial.send('IR');
  return {
    left: sensorData.infrared.left,
    right: sensorData.infrared.right
  };
}

/**
 * 处理传感器响应（由 serial.js 调用）
 * @param {string} data - 响应数据
 */
export function handleSensorResponse(data) {
  const now = Date.now();
  
  // DIST,123 -> 距离 12.3cm
  if (data.startsWith('DIST,')) {
    const value = parseInt(data.substring(5));
    if (!isNaN(value)) {
      sensorData.ultrasonic.distance = value / 10;  // 转换为 cm
      sensorData.ultrasonic.lastUpdate = now;
    }
  }
  
  // IR,L0R1 -> 左0右1
  else if (data.startsWith('IR,')) {
    const match = data.match(/L(\d)R(\d)/);
    if (match) {
      sensorData.infrared.left = parseInt(match[1]);
      sensorData.infrared.right = parseInt(match[2]);
      sensorData.infrared.lastUpdate = now;
    }
  }
  
  // SENSOR,D123,L0R1 -> 完整传感器数据
  else if (data.startsWith('SENSOR,')) {
    const parts = data.split(',');
    for (const part of parts) {
      if (part.startsWith('D')) {
        const value = parseInt(part.substring(1));
        if (!isNaN(value)) {
          sensorData.ultrasonic.distance = value / 10;
          sensorData.ultrasonic.lastUpdate = now;
        }
      } else if (part.match(/L\dR\d/)) {
        const match = part.match(/L(\d)R(\d)/);
        if (match) {
          sensorData.infrared.left = parseInt(match[1]);
          sensorData.infrared.right = parseInt(match[2]);
          sensorData.infrared.lastUpdate = now;
        }
      }
    }
  }
}

/**
 * 获取当前传感器数据
 */
export function getSensorData() {
  return {
    ...sensorData,
    timestamp: Date.now()
  };
}

/**
 * 设置轮询间隔
 */
export function setPollInterval(ms) {
  pollInterval = Math.max(100, Math.min(5000, ms));
  if (pollTimer) {
    stopPolling();
    startPolling();
  }
}

export default {
  init,
  startPolling,
  stopPolling,
  readUltrasonic,
  readInfrared,
  handleSensorResponse,
  getSensorData,
  setPollInterval
};
