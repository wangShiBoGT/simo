/**
 * 硬件通信组合式函数
 * 预留接口，用于后续对接：
 * - 摄像头（人脸识别）
 * - 传感器（温度、湿度等）
 * - 智能家居（灯光、空调等）
 * - 机器人底盘（移动控制）
 * 
 * 依赖：socket.io-client
 */

import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useLocalStorage } from '@vueuse/core'
import { io } from 'socket.io-client'

/**
 * Socket.io 连接 Hook
 * 用于与硬件控制服务器通信
 */
export function useSocketConnection() {
  const isConnected = ref(false)
  const error = ref(null)
  const lastMessage = ref(null)
  
  // 配置（持久化）
  const config = useLocalStorage('simo-hardware-config', {
    serverUrl: 'http://localhost:3002',
    autoConnect: false
  })
  
  let socket = null
  
  // 连接服务器
  const connect = (url = null) => {
    const serverUrl = url || config.value.serverUrl
    
    if (socket) {
      socket.disconnect()
    }
    
    try {
      socket = io(serverUrl, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000
      })
      
      socket.on('connect', () => {
        isConnected.value = true
        error.value = null
        console.log('硬件服务器已连接')
      })
      
      socket.on('disconnect', () => {
        isConnected.value = false
        console.log('硬件服务器已断开')
      })
      
      socket.on('connect_error', (err) => {
        error.value = err.message
        isConnected.value = false
      })
      
      // 通用消息接收
      socket.on('message', (data) => {
        lastMessage.value = data
      })
      
      return true
    } catch (e) {
      error.value = e.message
      return false
    }
  }
  
  // 断开连接
  const disconnect = () => {
    if (socket) {
      socket.disconnect()
      socket = null
    }
    isConnected.value = false
  }
  
  // 发送消息
  const send = (event, data) => {
    if (socket && isConnected.value) {
      socket.emit(event, data)
      return true
    }
    return false
  }
  
  // 监听事件
  const on = (event, callback) => {
    if (socket) {
      socket.on(event, callback)
    }
  }
  
  // 移除监听
  const off = (event, callback) => {
    if (socket) {
      socket.off(event, callback)
    }
  }
  
  onUnmounted(() => {
    disconnect()
  })
  
  return {
    isConnected,
    error,
    lastMessage,
    config,
    connect,
    disconnect,
    send,
    on,
    off
  }
}

/**
 * 摄像头 Hook（预留）
 * 用于人脸识别、手势识别等
 */
export function useCamera() {
  const isSupported = ref(false)
  const isActive = ref(false)
  const stream = ref(null)
  const error = ref(null)
  
  // 检查支持
  const checkSupport = () => {
    isSupported.value = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
    return isSupported.value
  }
  
  // 启动摄像头
  const start = async (constraints = { video: true, audio: false }) => {
    if (!checkSupport()) {
      error.value = '浏览器不支持摄像头'
      return false
    }
    
    try {
      stream.value = await navigator.mediaDevices.getUserMedia(constraints)
      isActive.value = true
      error.value = null
      return true
    } catch (e) {
      error.value = e.message
      return false
    }
  }
  
  // 停止摄像头
  const stop = () => {
    if (stream.value) {
      stream.value.getTracks().forEach(track => track.stop())
      stream.value = null
    }
    isActive.value = false
  }
  
  // 拍照
  const capture = (videoElement) => {
    if (!videoElement || !isActive.value) return null
    
    const canvas = document.createElement('canvas')
    canvas.width = videoElement.videoWidth
    canvas.height = videoElement.videoHeight
    
    const ctx = canvas.getContext('2d')
    ctx.drawImage(videoElement, 0, 0)
    
    return canvas.toDataURL('image/jpeg')
  }
  
  onMounted(() => {
    checkSupport()
  })
  
  onUnmounted(() => {
    stop()
  })
  
  return {
    isSupported,
    isActive,
    stream,
    error,
    start,
    stop,
    capture
  }
}

/**
 * 智能家居控制 Hook（预留）
 * 通过 Socket.io 发送控制命令
 */
export function useSmartHome(socketConnection) {
  const devices = ref([])
  const isLoading = ref(false)
  
  // 获取设备列表
  const fetchDevices = () => {
    if (!socketConnection.isConnected.value) return
    
    isLoading.value = true
    socketConnection.send('smart-home:list', {})
    
    socketConnection.on('smart-home:devices', (data) => {
      devices.value = data
      isLoading.value = false
    })
  }
  
  // 控制设备
  const controlDevice = (deviceId, action, params = {}) => {
    if (!socketConnection.isConnected.value) return false
    
    socketConnection.send('smart-home:control', {
      deviceId,
      action,
      params
    })
    return true
  }
  
  // 常用控制方法
  const turnOn = (deviceId) => controlDevice(deviceId, 'on')
  const turnOff = (deviceId) => controlDevice(deviceId, 'off')
  const setTemperature = (deviceId, temp) => controlDevice(deviceId, 'setTemp', { temperature: temp })
  const setBrightness = (deviceId, level) => controlDevice(deviceId, 'setBrightness', { level })
  
  return {
    devices,
    isLoading,
    fetchDevices,
    controlDevice,
    turnOn,
    turnOff,
    setTemperature,
    setBrightness
  }
}

/**
 * 机器人移动控制 Hook（预留）
 */
export function useRobotMovement(socketConnection) {
  const position = ref({ x: 0, y: 0, angle: 0 })
  const isMoving = ref(false)
  const battery = ref(100)
  
  // 移动命令
  const move = (direction, speed = 50) => {
    if (!socketConnection.isConnected.value) return false
    
    socketConnection.send('robot:move', { direction, speed })
    isMoving.value = true
    return true
  }
  
  // 停止移动
  const stop = () => {
    if (!socketConnection.isConnected.value) return false
    
    socketConnection.send('robot:stop', {})
    isMoving.value = false
    return true
  }
  
  // 跟随模式
  const startFollow = (targetId) => {
    if (!socketConnection.isConnected.value) return false
    
    socketConnection.send('robot:follow', { targetId })
    return true
  }
  
  // 停止跟随
  const stopFollow = () => {
    if (!socketConnection.isConnected.value) return false
    
    socketConnection.send('robot:stopFollow', {})
    return true
  }
  
  // 返回充电桩
  const goCharge = () => {
    if (!socketConnection.isConnected.value) return false
    
    socketConnection.send('robot:charge', {})
    return true
  }
  
  // 监听位置更新
  const listenPosition = () => {
    socketConnection.on('robot:position', (data) => {
      position.value = data
    })
    
    socketConnection.on('robot:battery', (data) => {
      battery.value = data.level
    })
  }
  
  return {
    position,
    isMoving,
    battery,
    move,
    stop,
    startFollow,
    stopFollow,
    goCharge,
    listenPosition
  }
}
