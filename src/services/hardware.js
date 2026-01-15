/**
 * Simo 硬件服务
 * 
 * 负责与后端硬件接口通信
 * 当前为 L0（纯软件），接口已预留
 */

const API_BASE = '/api/hardware'

// 硬件状态缓存
let hardwareStatus = null

/**
 * 获取硬件状态
 */
export const getHardwareStatus = async () => {
  try {
    const response = await fetch(`${API_BASE}/status`)
    if (response.ok) {
      hardwareStatus = await response.json()
      return hardwareStatus
    }
  } catch (error) {
    console.warn('获取硬件状态失败:', error.message)
  }
  return null
}

/**
 * 获取当前硬件等级
 */
export const getHardwareLevel = () => {
  return hardwareStatus?.level || 'L0'
}

// ============ 显示控制（L1） ============

/**
 * 设置显示状态
 * @param {string} state - idle/listening/thinking/speaking/sleeping
 */
export const setDisplayState = async (state) => {
  try {
    const response = await fetch(`${API_BASE}/display`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'setState', data: { state } })
    })
    return response.ok
  } catch (error) {
    console.warn('设置显示状态失败:', error.message)
    return false
  }
}

/**
 * 显示表情
 * @param {string} expression - 表情名称
 */
export const showExpression = async (expression) => {
  try {
    const response = await fetch(`${API_BASE}/display`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'showExpression', data: { expression } })
    })
    return response.ok
  } catch (error) {
    console.warn('显示表情失败:', error.message)
    return false
  }
}

/**
 * 设置屏幕亮度
 * @param {number} brightness - 0-100
 */
export const setBrightness = async (brightness) => {
  try {
    const response = await fetch(`${API_BASE}/display`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'setBrightness', data: { brightness } })
    })
    return response.ok
  } catch (error) {
    console.warn('设置亮度失败:', error.message)
    return false
  }
}

// ============ 音频控制（L1） ============

/**
 * 设置音量
 * @param {number} volume - 0-100
 */
export const setVolume = async (volume) => {
  try {
    const response = await fetch(`${API_BASE}/audio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'setVolume', data: { volume } })
    })
    return response.ok
  } catch (error) {
    console.warn('设置音量失败:', error.message)
    return false
  }
}

/**
 * 静音/取消静音
 * @param {boolean} muted
 */
export const setMute = async (muted) => {
  try {
    const response = await fetch(`${API_BASE}/audio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: muted ? 'mute' : 'unmute', data: {} })
    })
    return response.ok
  } catch (error) {
    console.warn('设置静音失败:', error.message)
    return false
  }
}

// ============ 视觉输入（L2 预留） ============

/**
 * 识别家庭成员
 * @returns {Promise<string|null>} 成员ID
 */
export const recognizeMember = async () => {
  try {
    const response = await fetch(`${API_BASE}/vision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'recognizeMember', data: {} })
    })
    if (response.ok) {
      const result = await response.json()
      return result.memberId || null
    }
  } catch (error) {
    console.warn('识别成员失败:', error.message)
  }
  return null
}

/**
 * 检测手势
 * @returns {Promise<string|null>} 手势名称
 */
export const detectGesture = async () => {
  try {
    const response = await fetch(`${API_BASE}/vision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'detectGesture', data: {} })
    })
    if (response.ok) {
      const result = await response.json()
      return result.gesture || null
    }
  } catch (error) {
    console.warn('检测手势失败:', error.message)
  }
  return null
}

// ============ 运动控制（L2/L3 预留） ============

/**
 * 移动
 * @param {string} direction - forward/backward/left/right
 * @param {number} distance - 距离（米）
 * @param {number} speed - 速度（0-1）
 */
export const move = async (direction, distance = 0.5, speed = 0.3) => {
  try {
    const response = await fetch(`${API_BASE}/motion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'move', data: { direction, distance, speed } })
    })
    return response.ok
  } catch (error) {
    console.warn('移动失败:', error.message)
    return false
  }
}

/**
 * 停止移动
 */
export const stopMotion = async () => {
  try {
    const response = await fetch(`${API_BASE}/motion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'stop', data: {} })
    })
    return response.ok
  } catch (error) {
    console.warn('停止失败:', error.message)
    return false
  }
}

/**
 * 跟随模式
 * @param {boolean} enabled
 */
export const setFollowMode = async (enabled) => {
  try {
    const response = await fetch(`${API_BASE}/motion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'follow', data: { enabled } })
    })
    return response.ok
  } catch (error) {
    console.warn('设置跟随模式失败:', error.message)
    return false
  }
}

// ============ 传感器（L2/L3 预留） ============

/**
 * 获取传感器数据
 */
export const getSensors = async () => {
  try {
    const response = await fetch(`${API_BASE}/sensors`)
    if (response.ok) {
      return await response.json()
    }
  } catch (error) {
    console.warn('获取传感器数据失败:', error.message)
  }
  return null
}

/**
 * 获取电池状态
 */
export const getBattery = async () => {
  const sensors = await getSensors()
  return sensors?.sensors?.battery || null
}

// ============ 导出 ============

export default {
  // 状态
  getHardwareStatus,
  getHardwareLevel,
  
  // 显示（L1）
  setDisplayState,
  showExpression,
  setBrightness,
  
  // 音频（L1）
  setVolume,
  setMute,
  
  // 视觉（L2）
  recognizeMember,
  detectGesture,
  
  // 运动（L2/L3）
  move,
  stopMotion,
  setFollowMode,
  
  // 传感器（L2/L3）
  getSensors,
  getBattery
}
