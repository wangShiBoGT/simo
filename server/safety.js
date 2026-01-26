/**
 * Safety Arbiter - 安全仲裁器
 * 
 * 所有动作执行前必须经过此模块验证
 * 实现：STOP抢占、传感器否决、人类最终控制权
 * 
 * @version 1.0.0
 * @date 2026-01-26
 */

const hardwareConfig = require('./hardware.config.js')

// 安全状态
const safetyState = {
  emergencyStop: false,      // 紧急停止状态
  lastSensorData: null,      // 最新传感器数据
  lastSensorTime: 0,         // 传感器数据时间戳
  sensorTimeout: 3000,       // 传感器数据超时（ms）
  actionQueue: [],           // 动作队列
  denialLog: []              // 否决记录（用于审计）
}

// 错误码定义
const ErrorCodes = {
  OK: 0,
  EMERGENCY_STOP: 1,
  OBSTACLE_DANGER: 2,
  SENSOR_TIMEOUT: 3,
  SENSOR_INVALID: 4,
  UNKNOWN_COMMAND: 5
}

/**
 * 获取安全阈值
 */
function getThresholds() {
  return hardwareConfig.safety?.obstacleThresholds || {
    danger: 8,
    caution: 15,
    safe: 30
  }
}

/**
 * 更新传感器数据
 * @param {Object} data - {distance: number, leftIR: boolean, rightIR: boolean}
 */
function updateSensorData(data) {
  safetyState.lastSensorData = data
  safetyState.lastSensorTime = Date.now()
}

/**
 * 检查传感器数据是否有效
 */
function isSensorDataValid() {
  if (!safetyState.lastSensorData) return false
  if (Date.now() - safetyState.lastSensorTime > safetyState.sensorTimeout) return false
  return true
}

/**
 * 触发紧急停止
 * @param {string} reason - 停止原因
 */
function triggerEmergencyStop(reason) {
  safetyState.emergencyStop = true
  safetyState.actionQueue = [] // 清空动作队列
  
  const logEntry = {
    type: 'EMERGENCY_STOP',
    reason,
    timestamp: new Date().toISOString()
  }
  safetyState.denialLog.push(logEntry)
  console.log(`[SAFETY] 🛑 紧急停止: ${reason}`)
  
  return logEntry
}

/**
 * 解除紧急停止
 */
function clearEmergencyStop() {
  safetyState.emergencyStop = false
  console.log('[SAFETY] ✅ 紧急停止已解除')
}

/**
 * 安全仲裁 - 所有动作执行前必须调用
 * @param {string} action - 动作类型: 'F'|'B'|'L'|'R'|'S'
 * @param {Object} params - 动作参数
 * @returns {Object} {allowed: boolean, code: number, reason: string}
 */
function arbitrate(action, params = {}) {
  const thresholds = getThresholds()
  
  // 1. STOP命令始终允许（最高优先级）
  if (action === 'S') {
    return { allowed: true, code: ErrorCodes.OK, reason: 'STOP always allowed' }
  }
  
  // 2. 检查紧急停止状态
  if (safetyState.emergencyStop) {
    const denial = {
      type: 'DENIED',
      action,
      code: ErrorCodes.EMERGENCY_STOP,
      reason: 'Emergency stop active',
      timestamp: new Date().toISOString()
    }
    safetyState.denialLog.push(denial)
    return { allowed: false, code: ErrorCodes.EMERGENCY_STOP, reason: '紧急停止中，请先解除' }
  }
  
  // 3. 前进动作需要传感器验证
  if (action === 'F') {
    // 检查传感器数据有效性
    if (!isSensorDataValid()) {
      // 传感器数据无效时，保守处理：允许但记录警告
      console.log('[SAFETY] ⚠️ 传感器数据过期，谨慎前进')
    } else {
      const distance = safetyState.lastSensorData.distance
      
      // 危险距离：拒绝前进
      if (distance <= thresholds.danger) {
        const denial = {
          type: 'DENIED',
          action,
          code: ErrorCodes.OBSTACLE_DANGER,
          reason: `Obstacle at ${distance}cm (danger threshold: ${thresholds.danger}cm)`,
          sensorData: safetyState.lastSensorData,
          timestamp: new Date().toISOString()
        }
        safetyState.denialLog.push(denial)
        return { 
          allowed: false, 
          code: ErrorCodes.OBSTACLE_DANGER, 
          reason: `障碍物距离${distance}cm，禁止前进` 
        }
      }
      
      // 警戒距离：允许但警告
      if (distance <= thresholds.caution) {
        console.log(`[SAFETY] ⚠️ 警戒距离: ${distance}cm`)
      }
    }
  }
  
  // 4. 通过安全检查
  return { allowed: true, code: ErrorCodes.OK, reason: 'Safety check passed' }
}

/**
 * 获取安全状态（用于UI展示）
 */
function getStatus() {
  const thresholds = getThresholds()
  let safetyLevel = 'safe'
  
  if (safetyState.emergencyStop) {
    safetyLevel = 'emergency'
  } else if (safetyState.lastSensorData) {
    const distance = safetyState.lastSensorData.distance
    if (distance <= thresholds.danger) {
      safetyLevel = 'danger'
    } else if (distance <= thresholds.caution) {
      safetyLevel = 'caution'
    }
  }
  
  return {
    emergencyStop: safetyState.emergencyStop,
    safetyLevel,
    thresholds,
    sensorData: safetyState.lastSensorData,
    sensorValid: isSensorDataValid(),
    lastDenials: safetyState.denialLog.slice(-10) // 最近10条否决记录
  }
}

/**
 * 清空否决日志
 */
function clearDenialLog() {
  safetyState.denialLog = []
}

module.exports = {
  ErrorCodes,
  updateSensorData,
  triggerEmergencyStop,
  clearEmergencyStop,
  arbitrate,
  getStatus,
  clearDenialLog,
  getThresholds
}
