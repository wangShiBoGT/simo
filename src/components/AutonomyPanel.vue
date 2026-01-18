<template>
  <div class="autonomy-panel">
    <div class="panel-header" @click="isExpanded = !isExpanded">
      <span class="panel-icon">🤖</span>
      <span class="panel-title">自主避障 (L3)</span>
      <span class="status-badge" :class="statusClass">{{ statusText }}</span>
      <span class="expand-icon">{{ isExpanded ? '▼' : '▶' }}</span>
    </div>
    
    <div class="panel-content" v-if="isExpanded">
      <!-- 控制按钮 -->
      <div class="control-buttons">
        <button 
          class="btn btn-start" 
          @click="startAutonomy" 
          :disabled="enabled || loading"
        >
          ▶ 启动自主
        </button>
        <button 
          class="btn btn-stop" 
          @click="stopAutonomy" 
          :disabled="!enabled || loading"
        >
          ⏹ 停止
        </button>
        <button 
          class="btn btn-scan" 
          @click="triggerScan" 
          :disabled="loading"
        >
          📡 扫描
        </button>
      </div>
      
      <!-- 模式选择 -->
      <div class="mode-selector">
        <label>模式：</label>
        <select v-model="selectedMode" @change="setMode" :disabled="!enabled">
          <option value="scanning">扫描</option>
          <option value="avoiding">避障</option>
          <option value="exploring">探索</option>
        </select>
      </div>
      
      <!-- 扫描结果可视化 -->
      <div class="scan-visual" v-if="lastScan">
        <div class="scan-title">舵机扫描结果</div>
        <div class="scan-bars">
          <div class="scan-bar left">
            <div class="bar-fill" :style="{ height: getBarHeight(lastScan.left) }"></div>
            <div class="bar-label">左 {{ formatDist(lastScan.left) }}</div>
          </div>
          <div class="scan-bar center">
            <div class="bar-fill" :style="{ height: getBarHeight(lastScan.center) }"></div>
            <div class="bar-label">中 {{ formatDist(lastScan.center) }}</div>
          </div>
          <div class="scan-bar right">
            <div class="bar-fill" :style="{ height: getBarHeight(lastScan.right) }"></div>
            <div class="bar-label">右 {{ formatDist(lastScan.right) }}</div>
          </div>
        </div>
        <div class="best-direction" v-if="bestDirection">
          最佳方向：<strong>{{ bestDirection.dir }}</strong> ({{ formatDist(bestDirection.dist) }})
        </div>
      </div>
      
      <!-- 传感器实时数据 -->
      <div class="sensor-live">
        <div class="sensor-item">
          <span class="sensor-icon">📏</span>
          <span>超声波：{{ formatDist(sensors.ultrasonic) }}</span>
          <span class="danger-indicator" v-if="sensors.ultrasonic < 15">⚠️ 危险</span>
        </div>
        <div class="sensor-item">
          <span class="sensor-icon">👁️</span>
          <span>红外：L={{ sensors.irLeft }} R={{ sensors.irRight }}</span>
          <span class="danger-indicator" v-if="sensors.irLeft === 0 || sensors.irRight === 0">⚠️ 障碍</span>
        </div>
      </div>
      
      <!-- 配置信息 -->
      <div class="config-info" v-if="config">
        <div class="config-title">阈值配置</div>
        <div class="config-item">危险距离：{{ config.DANGER_DISTANCE }}cm</div>
        <div class="config-item">警戒距离：{{ config.CAUTION_DISTANCE }}cm</div>
        <div class="config-item">安全距离：{{ config.SAFE_DISTANCE }}cm</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { getApiBase } from '../config/api.js'

const isExpanded = ref(false)
const loading = ref(false)
const enabled = ref(false)
const mode = ref('idle')
const selectedMode = ref('scanning')
const lastScan = ref(null)
const config = ref(null)
const sensors = ref({
  ultrasonic: null,
  irLeft: null,
  irRight: null
})

let pollInterval = null

// 状态显示
const statusClass = computed(() => {
  if (enabled.value) return 'status-active'
  return 'status-idle'
})

const statusText = computed(() => {
  if (enabled.value) return mode.value
  return '未启动'
})

// 最佳方向计算
const bestDirection = computed(() => {
  if (!lastScan.value) return null
  const { left, center, right } = lastScan.value
  const dirs = [
    { dir: '左', dist: left || 0 },
    { dir: '中', dist: center || 0 },
    { dir: '右', dist: right || 0 }
  ]
  dirs.sort((a, b) => b.dist - a.dist)
  return dirs[0]
})

// 格式化距离
function formatDist(dist) {
  if (dist === null || dist === undefined) return '--'
  return `${dist.toFixed(1)}cm`
}

// 计算柱状图高度
function getBarHeight(dist) {
  if (!dist) return '5%'
  const maxDist = 100  // 最大显示距离
  const percent = Math.min(100, (dist / maxDist) * 100)
  return `${Math.max(5, percent)}%`
}

// API 调用
async function fetchState() {
  try {
    const response = await fetch(`${getApiBase()}/api/autonomy`)
    const data = await response.json()
    enabled.value = data.enabled
    mode.value = data.mode
    lastScan.value = data.lastScan
    config.value = data.config
  } catch (error) {
    console.error('获取自主状态失败:', error)
  }
}

async function fetchSensors() {
  try {
    const response = await fetch(`${getApiBase()}/api/hardware/sensors`)
    const data = await response.json()
    if (data.sensors) {
      sensors.value.ultrasonic = data.sensors.ultrasonic?.distance
      sensors.value.irLeft = data.sensors.infrared?.left
      sensors.value.irRight = data.sensors.infrared?.right
    }
  } catch (error) {
    console.error('获取传感器失败:', error)
  }
}

async function startAutonomy() {
  loading.value = true
  try {
    await fetch(`${getApiBase()}/api/autonomy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start', mode: 'exploring' })
    })
    await fetchState()
  } catch (error) {
    console.error('启动自主模式失败:', error)
  } finally {
    loading.value = false
  }
}

async function stopAutonomy() {
  loading.value = true
  try {
    await fetch(`${getApiBase()}/api/autonomy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'stop' })
    })
    await fetchState()
  } catch (error) {
    console.error('停止自主模式失败:', error)
  } finally {
    loading.value = false
  }
}

async function triggerScan() {
  loading.value = true
  try {
    const response = await fetch(`${getApiBase()}/api/autonomy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'scan' })
    })
    const data = await response.json()
    lastScan.value = data.state?.lastScan || data
  } catch (error) {
    console.error('扫描失败:', error)
  } finally {
    loading.value = false
  }
}

async function setMode() {
  try {
    await fetch(`${getApiBase()}/api/autonomy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'setMode', mode: selectedMode.value })
    })
    await fetchState()
  } catch (error) {
    console.error('设置模式失败:', error)
  }
}

onMounted(() => {
  fetchState()
  // 不自动轮询，避免与其他组件重复请求
  // 用户操作时会手动刷新
})

onUnmounted(() => {
  if (pollInterval) {
    clearInterval(pollInterval)
  }
})
</script>

<style scoped>
.autonomy-panel {
  position: fixed;
  bottom: 180px;
  right: 10px;
  width: 320px;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid #0f3460;
  z-index: 100;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
}

.panel-header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.05);
}

.panel-header:hover {
  background: rgba(255, 255, 255, 0.1);
}

.panel-icon {
  font-size: 1.2em;
  margin-right: 8px;
}

.panel-title {
  flex: 1;
  font-weight: 600;
  color: #e94560;
}

.status-badge {
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 0.8em;
  margin-right: 8px;
}

.status-idle {
  background: #333;
  color: #888;
}

.status-active {
  background: #e94560;
  color: white;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

.expand-icon {
  color: #888;
  font-size: 0.8em;
}

.panel-content {
  padding: 16px;
}

.control-buttons {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.btn {
  flex: 1;
  padding: 10px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.2s;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-start {
  background: #4ade80;
  color: #000;
}

.btn-start:hover:not(:disabled) {
  background: #22c55e;
}

.btn-stop {
  background: #ef4444;
  color: white;
}

.btn-stop:hover:not(:disabled) {
  background: #dc2626;
}

.btn-scan {
  background: #3b82f6;
  color: white;
}

.btn-scan:hover:not(:disabled) {
  background: #2563eb;
}

.mode-selector {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  color: #ccc;
}

.mode-selector select {
  flex: 1;
  padding: 8px;
  border-radius: 6px;
  background: #2a2a4a;
  color: white;
  border: 1px solid #444;
}

.scan-visual {
  background: rgba(0, 0, 0, 0.3);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 16px;
}

.scan-title {
  color: #888;
  font-size: 0.9em;
  margin-bottom: 12px;
}

.scan-bars {
  display: flex;
  justify-content: space-around;
  height: 100px;
  align-items: flex-end;
}

.scan-bar {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 60px;
}

.bar-fill {
  width: 40px;
  background: linear-gradient(to top, #e94560, #4ade80);
  border-radius: 4px 4px 0 0;
  transition: height 0.3s;
  min-height: 5px;
}

.bar-label {
  margin-top: 8px;
  font-size: 0.8em;
  color: #aaa;
}

.best-direction {
  text-align: center;
  margin-top: 12px;
  color: #4ade80;
}

.sensor-live {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 16px;
}

.sensor-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  color: #ccc;
}

.sensor-icon {
  font-size: 1.1em;
}

.danger-indicator {
  color: #ef4444;
  font-size: 0.9em;
}

.config-info {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  padding: 12px;
  font-size: 0.85em;
}

.config-title {
  color: #888;
  margin-bottom: 8px;
}

.config-item {
  color: #aaa;
  padding: 2px 0;
}
</style>
