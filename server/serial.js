/**
 * Simo 串口通信模块
 * 
 * 负责与 STM32 小车通过串口通信
 * 协议：ASCII 文本 + \n 结尾
 * 
 * 命令格式：
 * - 移动：M,direction,speed,duration\n  (方向, 速度0~1, 持续ms)
 * - 停止：S\n
 * - 心跳：PING\n → 回复 PONG\n
 */

import { SerialPort } from 'serialport'
import { ReadlineParser } from '@serialport/parser-readline'

// 串口实例
let port = null
let parser = null
let isConnected = false
let reconnectTimer = null
let lastPongTime = 0

// 传感器数据缓存
let sensorCache = {
  ultrasonic: { distance: null, lastUpdate: null },
  infrared: { left: null, right: null, lastUpdate: null }
}

// 配置（从 hardware.config.js 读取）
let config = {
  enabled: false,
  port: null,
  baudRate: 115200  // Simo固件使用 115200
}

/**
 * 初始化串口
 * @param {Object} serialConfig - 串口配置
 */
export const init = async (serialConfig) => {
  config = { ...config, ...serialConfig }
  
  if (!config.enabled) {
    console.log('🔌 串口未启用（hardware.config.js 中 serial.enabled = false）')
    return false
  }
  
  if (!config.port) {
    console.log('⚠️ 串口端口未配置')
    return false
  }
  
  return await connect()
}

/**
 * 连接串口
 */
const connect = async () => {
  try {
    console.log(`🔌 正在连接串口 ${config.port} @ ${config.baudRate}...`)
    
    // Windows 需要使用 \\.\COM5 格式
    const portPath = config.port.startsWith('COM') ? `\\\\.\\${config.port}` : config.port
    
    port = new SerialPort({
      path: portPath,
      baudRate: config.baudRate,
      autoOpen: false
    })
    
    // 使用行解析器（按 \n 分割）
    parser = port.pipe(new ReadlineParser({ delimiter: '\n' }))
    
    // 监听数据
    parser.on('data', (data) => {
      console.log('📥 STM32:', data.trim())
      handleResponse(data.trim())
    })
    
    // 监听错误
    port.on('error', (err) => {
      console.error('❌ 串口错误:', err.message)
      isConnected = false
      scheduleReconnect()
    })
    
    // 监听关闭
    port.on('close', () => {
      console.log('🔌 串口已关闭')
      isConnected = false
      scheduleReconnect()
    })
    
    // 打开串口
    await new Promise((resolve, reject) => {
      port.open((err) => {
        if (err) reject(err)
        else resolve()
      })
    })
    
    // 关键：设置 DTR=false, RTS=false，让 STM32 正常运行
    // DTR 低电平 → Q2 截止 → BOOT0=0 → 正常运行模式
    await new Promise((resolve) => {
      port.set({ dtr: false, rts: false }, (err) => {
        if (err) console.error('设置 DTR/RTS 失败:', err.message)
        else console.log('✅ DTR/RTS 已设置为低电平（正常运行模式）')
        resolve()
      })
    })
    
    isConnected = true
    console.log(`✅ 串口 ${config.port} 连接成功`)
    
    // 等待 STM32 复位完成后再发送心跳
    await new Promise(resolve => setTimeout(resolve, 1000))
    send('PING')
    
    return true
    
  } catch (error) {
    console.error('❌ 串口连接失败:', error.message)
    isConnected = false
    scheduleReconnect()
    return false
  }
}

/**
 * 定时重连
 */
const scheduleReconnect = () => {
  if (!config.enabled || reconnectTimer) return
  
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null
    console.log('🔄 尝试重新连接串口...')
    await connect()
  }, 5000)  // 5秒后重试
}

/**
 * 处理 STM32 响应
 */
function handleResponse(data) {
  const response = data.trim()
  if (!response) return
  
  console.log('📥 STM32:', response)
  
  const now = Date.now()
  
  // 解析响应
  if (response === 'PONG') {
    lastPongTime = Date.now()
  } else if (response.startsWith('OK,')) {
    console.log('✅ STM32 命令执行成功')
  } else if (response.startsWith('ERR,')) {
    console.error('❌ STM32 错误:', response)
  }
  // 传感器响应解析
  else if (response.startsWith('DIST,')) {
    const value = parseInt(response.substring(5))
    if (!isNaN(value)) {
      sensorCache.ultrasonic.distance = value / 10  // 0.1cm -> cm
      sensorCache.ultrasonic.lastUpdate = now
    }
  }
  else if (response.startsWith('IR,')) {
    const match = response.match(/L(\d)R(\d)/)
    if (match) {
      sensorCache.infrared.left = parseInt(match[1])
      sensorCache.infrared.right = parseInt(match[2])
      sensorCache.infrared.lastUpdate = now
    }
  }
  else if (response.startsWith('SENSOR,')) {
    // SENSOR,D123,L0R1
    const parts = response.split(',')
    for (const part of parts) {
      if (part.startsWith('D')) {
        const value = parseInt(part.substring(1))
        if (!isNaN(value)) {
          sensorCache.ultrasonic.distance = value / 10
          sensorCache.ultrasonic.lastUpdate = now
        }
      } else if (part.match(/L\dR\d/)) {
        const match = part.match(/L(\d)R(\d)/)
        if (match) {
          sensorCache.infrared.left = parseInt(match[1])
          sensorCache.infrared.right = parseInt(match[2])
          sensorCache.infrared.lastUpdate = now
        }
      }
    }
  }
}

// 获取传感器缓存数据
export function getSensorData() {
  return { ...sensorCache }
}

/**
 * 发送命令到 STM32
 * @param {string} command - 命令（不含 \n）
 * @returns {boolean} 是否发送成功
 */
export const send = (command) => {
  if (!isConnected || !port) {
    console.warn('⚠️ 串口未连接，命令未发送:', command)
    return false
  }
  
  try {
    const data = command + '\n'
    port.write(data, (err) => {
      if (err) {
        console.error('❌ 串口写入失败:', err.message)
      } else {
        console.log('📤 发送:', command)
      }
    })
    return true
  } catch (error) {
    console.error('❌ 发送失败:', error.message)
    return false
  }
}

/**
 * 发送移动命令（Simo固件协议）
 * 协议格式：M,direction,speed,duration
 * @param {string} direction - forward/backward/left/right
 * @param {number} speed - 速度 0~1
 * @param {number} durationMs - 持续时间 ms
 */
export const sendMove = (direction, speed = 0.5, durationMs = 500) => {
  // Simo固件协议：M,direction,speed,duration
  const cmd = `M,${direction},${speed.toFixed(2)},${durationMs}`
  return send(cmd)
}

/**
 * 发送停止命令
 */
export const sendStop = () => {
  return send('S')  // Simo固件停止命令
}

/**
 * 发送心跳
 */
export const sendPing = () => {
  return send('PING')
}

/**
 * 发送原始数据（用于意图层直接发送命令）
 * @param {string} data - 原始数据（含换行符）
 */
export const sendRaw = (data) => {
  if (!isConnected || !port) {
    console.warn('⚠️ 串口未连接，命令未发送')
    return false
  }
  
  try {
    port.write(data, (err) => {
      if (err) {
        console.error('❌ 串口写入失败:', err.message)
      } else {
        console.log('📤 发送:', data.trim())
      }
    })
    return true
  } catch (error) {
    console.error('❌ 发送失败:', error.message)
    return false
  }
}

/**
 * 获取连接状态
 */
export const getStatus = () => {
  return {
    enabled: config.enabled,
    port: config.port,
    baudRate: config.baudRate,
    connected: isConnected
  }
}

/**
 * 关闭串口
 */
export const close = () => {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  
  if (port && port.isOpen) {
    port.close()
  }
  
  isConnected = false
  port = null
  parser = null
}

/**
 * 列出可用串口
 */
export const listPorts = async () => {
  try {
    const ports = await SerialPort.list()
    return ports.map(p => ({
      path: p.path,
      manufacturer: p.manufacturer,
      vendorId: p.vendorId,
      productId: p.productId
    }))
  } catch (error) {
    console.error('获取串口列表失败:', error.message)
    return []
  }
}

export default {
  init,
  send,
  sendRaw,
  sendMove,
  sendStop,
  sendPing,
  getStatus,
  getSensorData,
  close,
  listPorts
}
