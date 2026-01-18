<template>
  <div class="sensor-panel" :class="{ expanded: isExpanded }">
    <!-- 展开/收起按钮 -->
    <button class="toggle-btn" @click="isExpanded = !isExpanded">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="3"/>
        <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
      </svg>
      <span>传感器</span>
    </button>

    <!-- 传感器面板内容 -->
    <div class="panel-content" v-show="isExpanded">
      <!-- 连接状态 -->
      <div class="status-bar">
        <div class="status-item">
          <span class="status-dot" :class="connected ? 'connected' : 'disconnected'"></span>
          <span>{{ connected ? '已连接' : '未连接' }}</span>
        </div>
      </div>

      <!-- 超声波距离 -->
      <div class="sensor-card">
        <div class="sensor-header">
          <span class="sensor-icon">📏</span>
          <span class="sensor-name">超声波距离</span>
        </div>
        <div class="sensor-value">
          <span v-if="ultrasonic.distance !== null" class="value-num">
            {{ ultrasonic.distance.toFixed(1) }}
          </span>
          <span v-else class="value-null">--</span>
          <span class="value-unit">cm</span>
        </div>
        <div class="distance-bar">
          <div 
            class="distance-fill" 
            :style="{ width: distancePercent + '%' }"
            :class="distanceLevel"
          ></div>
        </div>
        <div class="distance-labels">
          <span>0</span>
          <span>50</span>
          <span>100+</span>
        </div>
      </div>

      <!-- 红外循迹 -->
      <div class="sensor-card">
        <div class="sensor-header">
          <span class="sensor-icon">👁️</span>
          <span class="sensor-name">红外循迹</span>
        </div>
        <div class="ir-display">
          <div class="ir-sensor left" :class="{ active: infrared.left === 0 }">
            <span class="ir-label">左</span>
            <span class="ir-value">{{ infrared.left === 0 ? '●' : '○' }}</span>
          </div>
          <div class="ir-track">
            <div class="track-line"></div>
          </div>
          <div class="ir-sensor right" :class="{ active: infrared.right === 0 }">
            <span class="ir-label">右</span>
            <span class="ir-value">{{ infrared.right === 0 ? '●' : '○' }}</span>
          </div>
        </div>
        <div class="ir-status">
          {{ irStatus }}
        </div>
      </div>

      <!-- 刷新控制 -->
      <div class="refresh-control">
        <button class="refresh-btn" @click="fetchSensors" :disabled="loading">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" :class="{ spinning: loading }">
            <path d="M23 4v6h-6M1 20v-6h6"/>
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
          </svg>
        </button>
        <label class="auto-refresh">
          <input type="checkbox" v-model="autoRefresh" @change="toggleAutoRefresh">
          <span>自动刷新</span>
        </label>
      </div>

      <!-- 避障警告 -->
      <div class="obstacle-warning" v-if="obstacleWarning" :class="obstacleWarning.type">
        {{ obstacleWarning.message }}
      </div>

      <!-- 提示信息 -->
      <div class="sensor-tip" v-if="!connected">
        ⚠️ 需要连接 STM32 并烧录传感器固件
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { getApiBase } from '../config/api.js'

const isExpanded = ref(false)
const loading = ref(false)
const autoRefresh = ref(false)
const connected = ref(false)

const ultrasonic = ref({
  distance: null,
  lastUpdate: null
})

const infrared = ref({
  left: null,
  right: null,
  lastUpdate: null
})

// 数据平滑（滑动平均）
const distanceHistory = ref([])
const HISTORY_SIZE = 5

// 平滑后的距离
const smoothDistance = computed(() => {
  if (distanceHistory.value.length === 0) return null
  const sum = distanceHistory.value.reduce((a, b) => a + b, 0)
  return sum / distanceHistory.value.length
})

let refreshTimer = null

// 距离百分比（0-100cm 映射到 0-100%）
const distancePercent = computed(() => {
  if (ultrasonic.value.distance === null) return 0
  return Math.min(100, ultrasonic.value.distance)
})

// 距离等级
const distanceLevel = computed(() => {
  const d = ultrasonic.value.distance
  if (d === null) return ''
  if (d < 20) return 'danger'
  if (d < 50) return 'warning'
  return 'safe'
})

// 避障警告（符合 BEHAVIOR.md：不自主行动，只提醒+建议）
const obstacleWarning = computed(() => {
  const d = smoothDistance.value || ultrasonic.value.distance
  const l = infrared.value.left
  const r = infrared.value.right
  
  // 综合判断：超声波 + 红外
  const frontClose = d !== null && d < 20
  const frontWarning = d !== null && d < 50
  const leftBlocked = l === 0
  const rightBlocked = r === 0
  
  // 危险：前方过近
  if (frontClose) {
    if (leftBlocked && rightBlocked) {
      return { type: 'danger', message: '⚠️ 三面受阻！建议后退' }
    }
    if (leftBlocked) {
      return { type: 'danger', message: '⚠️ 前方+左侧有障碍，建议右转或后退' }
    }
    if (rightBlocked) {
      return { type: 'danger', message: '⚠️ 前方+右侧有障碍，建议左转或后退' }
    }
    return { type: 'danger', message: '⚠️ 前方障碍物过近！建议停止' }
  }
  
  // 警告：前方有障碍
  if (frontWarning) {
    return { type: 'warning', message: '⚡ 前方有障碍物，距离 ' + d.toFixed(0) + 'cm' }
  }
  
  // 红外检测
  if (leftBlocked && rightBlocked) {
    return { type: 'warning', message: '⚡ 两侧有障碍物' }
  }
  if (leftBlocked) {
    return { type: 'info', message: '💡 左侧有障碍物' }
  }
  if (rightBlocked) {
    return { type: 'info', message: '💡 右侧有障碍物' }
  }
  
  return null
})

const emit = defineEmits(['warning'])

// 红外状态描述
const irStatus = computed(() => {
  const l = infrared.value.left
  const r = infrared.value.right
  if (l === null || r === null) return '等待数据...'
  if (l === 0 && r === 0) return '在线上'
  if (l === 0) return '偏右'
  if (r === 0) return '偏左'
  return '偏离线路'
})

// 获取传感器数据
const fetchSensors = async () => {
  loading.value = true
  try {
    const response = await fetch(`${getApiBase()}/api/hardware/sensors`)
    const data = await response.json()
    
    connected.value = data.sensors?.connected || false
    
    if (data.sensors?.ultrasonic) {
      ultrasonic.value = data.sensors.ultrasonic
      
      // 数据平滑：添加到历史记录
      if (data.sensors.ultrasonic.distance !== null && data.sensors.ultrasonic.distance > 0) {
        distanceHistory.value.push(data.sensors.ultrasonic.distance)
        if (distanceHistory.value.length > HISTORY_SIZE) {
          distanceHistory.value.shift()
        }
      }
    }
    if (data.sensors?.infrared) {
      infrared.value = data.sensors.infrared
    }
  } catch (error) {
    console.error('传感器读取失败:', error)
    connected.value = false
  } finally {
    loading.value = false
  }
}

// 切换自动刷新
const toggleAutoRefresh = () => {
  if (autoRefresh.value) {
    refreshTimer = setInterval(fetchSensors, 2000)
  } else {
    if (refreshTimer) {
      clearInterval(refreshTimer)
      refreshTimer = null
    }
  }
}

onMounted(() => {
  fetchSensors()
})

onUnmounted(() => {
  if (refreshTimer) {
    clearInterval(refreshTimer)
  }
})
</script>

<style scoped>
.sensor-panel {
  position: fixed;
  bottom: 100px;
  left: 20px;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.toggle-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  background: var(--bg-secondary, #1a1a2e);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  color: var(--text-secondary, #888);
  cursor: pointer;
  transition: all 0.2s;
}

.toggle-btn:hover {
  border-color: #22c55e;
  color: #22c55e;
}

.toggle-btn svg {
  width: 16px;
  height: 16px;
}

.panel-content {
  margin-top: 12px;
  padding: 16px;
  background: var(--bg-secondary, #1a1a2e);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  min-width: 220px;
}

/* 状态栏 */
.status-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.status-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary, #888);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.status-dot.connected {
  background: #22c55e;
  box-shadow: 0 0 8px #22c55e;
}

.status-dot.disconnected {
  background: #ef4444;
}

/* 传感器卡片 */
.sensor-card {
  background: rgba(255, 255, 255, 0.03);
  border-radius: 12px;
  padding: 12px;
  margin-bottom: 12px;
}

.sensor-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.sensor-icon {
  font-size: 16px;
}

.sensor-name {
  font-size: 12px;
  color: var(--text-secondary, #888);
}

.sensor-value {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin-bottom: 8px;
}

.value-num {
  font-size: 28px;
  font-weight: 500;
  color: var(--text-primary, #fff);
}

.value-null {
  font-size: 28px;
  color: var(--text-tertiary, #666);
}

.value-unit {
  font-size: 14px;
  color: var(--text-secondary, #888);
}

/* 距离进度条 */
.distance-bar {
  height: 6px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 4px;
}

.distance-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s, background 0.3s;
}

.distance-fill.safe {
  background: #22c55e;
}

.distance-fill.warning {
  background: #f59e0b;
}

.distance-fill.danger {
  background: #ef4444;
  animation: pulse 0.5s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.distance-labels {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: var(--text-tertiary, #666);
}

/* 红外显示 */
.ir-display {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 12px 0;
}

.ir-sensor {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.ir-label {
  font-size: 11px;
  color: var(--text-tertiary, #666);
}

.ir-value {
  font-size: 24px;
  color: var(--text-tertiary, #666);
  transition: color 0.2s;
}

.ir-sensor.active .ir-value {
  color: #22c55e;
  text-shadow: 0 0 8px #22c55e;
}

.ir-track {
  width: 40px;
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  position: relative;
}

.track-line {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 2px;
  height: 100%;
  background: #333;
}

.ir-status {
  text-align: center;
  font-size: 12px;
  color: var(--text-secondary, #888);
}

/* 刷新控制 */
.refresh-control {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.refresh-btn {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-secondary, #888);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.refresh-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
}

.refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.refresh-btn svg {
  width: 16px;
  height: 16px;
}

.refresh-btn svg.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.auto-refresh {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary, #888);
  cursor: pointer;
}

.auto-refresh input {
  cursor: pointer;
}

/* 避障警告 */
.obstacle-warning {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  animation: pulse-warning 1s infinite;
}

.obstacle-warning.warning {
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
  border: 1px solid rgba(245, 158, 11, 0.3);
}

.obstacle-warning.danger {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.obstacle-warning.info {
  background: rgba(59, 130, 246, 0.15);
  color: #3b82f6;
  border: 1px solid rgba(59, 130, 246, 0.3);
  animation: none;
}

@keyframes pulse-warning {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

/* 提示信息 */
.sensor-tip {
  margin-top: 12px;
  padding: 8px 12px;
  background: rgba(245, 158, 11, 0.1);
  border-radius: 8px;
  font-size: 11px;
  color: #f59e0b;
}
</style>
