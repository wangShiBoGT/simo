<template>
  <div class="navigation-panel">
    <div class="panel-header" @click="isExpanded = !isExpanded">
      <span class="panel-icon">🧭</span>
      <span class="panel-title">自主导航 (L3)</span>
      <span class="status-badge" :class="statusClass">{{ statusText }}</span>
      <span class="expand-icon">{{ isExpanded ? '▼' : '▶' }}</span>
    </div>
    
    <div class="panel-content" v-if="isExpanded">
      <!-- 导航模式选择 -->
      <div class="mode-buttons">
        <button 
          class="mode-btn" 
          :class="{ active: navState.state === 'patrol' }"
          @click="startMode('patrol')"
          :disabled="loading"
        >
          <span class="mode-icon">🔄</span>
          <span class="mode-name">巡逻</span>
        </button>
        <button 
          class="mode-btn" 
          :class="{ active: navState.state === 'follow' }"
          @click="startMode('follow')"
          :disabled="loading"
        >
          <span class="mode-icon">👤</span>
          <span class="mode-name">跟随</span>
        </button>
        <button 
          class="mode-btn" 
          :class="{ active: navState.state === 'return' }"
          @click="startMode('return')"
          :disabled="loading || navState.pathLength === 0"
        >
          <span class="mode-icon">🏠</span>
          <span class="mode-name">返航</span>
        </button>
      </div>
      
      <!-- 控制按钮 -->
      <div class="control-buttons">
        <button 
          class="btn btn-stop" 
          @click="stopNav" 
          :disabled="navState.state === 'idle' || navState.state === 'stopped' || loading"
        >
          ⏹ 停止导航
        </button>
        <button 
          class="btn btn-reset" 
          @click="resetNav" 
          :disabled="loading"
        >
          🔄 重置
        </button>
      </div>
      
      <!-- 导航状态 -->
      <div class="nav-status">
        <div class="status-title">导航状态</div>
        <div class="status-grid">
          <div class="status-item">
            <span class="label">状态</span>
            <span class="value" :class="stateClass">{{ stateText }}</span>
          </div>
          <div class="status-item">
            <span class="label">路径记录</span>
            <span class="value">{{ navState.pathLength || 0 }} 步</span>
          </div>
        </div>
      </div>
      
      <!-- 统计信息 -->
      <div class="stats-info" v-if="navState.stats">
        <div class="stats-title">运行统计</div>
        <div class="stats-grid">
          <div class="stat-item">
            <span class="stat-value">{{ formatTime(navState.stats.patrolTime) }}</span>
            <span class="stat-label">巡逻时长</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">{{ formatTime(navState.stats.followTime) }}</span>
            <span class="stat-label">跟随时长</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">{{ navState.stats.avoidCount || 0 }}</span>
            <span class="stat-label">避障次数</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">{{ navState.stats.boundaryCount || 0 }}</span>
            <span class="stat-label">边界检测</span>
          </div>
        </div>
      </div>
      
      <!-- 安全阈值 -->
      <div class="config-info" v-if="navState.config">
        <div class="config-title">安全阈值</div>
        <div class="threshold-bars">
          <div class="threshold-item danger">
            <span class="threshold-label">危险</span>
            <span class="threshold-value">{{ navState.config.dangerDistance }}cm</span>
          </div>
          <div class="threshold-item caution">
            <span class="threshold-label">警戒</span>
            <span class="threshold-value">{{ navState.config.cautionDistance }}cm</span>
          </div>
          <div class="threshold-item safe">
            <span class="threshold-label">安全</span>
            <span class="threshold-value">{{ navState.config.safeDistance }}cm</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { getApiBase } from '../config/api.js'

const isExpanded = ref(false)
const loading = ref(false)
const navState = ref({
  state: 'idle',
  pathLength: 0,
  stats: null,
  config: null
})

// 状态显示
const statusClass = computed(() => {
  const state = navState.value.state
  if (state === 'patrol' || state === 'follow' || state === 'return') return 'status-active'
  if (state === 'avoiding' || state === 'boundary') return 'status-warning'
  return 'status-idle'
})

const statusText = computed(() => {
  const stateMap = {
    'idle': '空闲',
    'patrol': '巡逻中',
    'follow': '跟随中',
    'return': '返航中',
    'avoiding': '避障中',
    'boundary': '边界检测',
    'stopped': '已停止'
  }
  return stateMap[navState.value.state] || navState.value.state
})

const stateClass = computed(() => {
  const state = navState.value.state
  if (state === 'patrol' || state === 'follow') return 'active'
  if (state === 'return') return 'returning'
  if (state === 'avoiding' || state === 'boundary') return 'warning'
  return ''
})

const stateText = computed(() => statusText.value)

// 格式化时间
function formatTime(ms) {
  if (!ms) return '0s'
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainSec = seconds % 60
  return `${minutes}m${remainSec}s`
}

// API 调用
async function fetchState() {
  try {
    const response = await fetch(`${getApiBase()}/api/nav/status`)
    const data = await response.json()
    navState.value = data
  } catch (error) {
    console.error('获取导航状态失败:', error)
  }
}

async function startMode(mode) {
  loading.value = true
  try {
    const response = await fetch(`${getApiBase()}/api/nav/${mode}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
    const data = await response.json()
    if (data.state) {
      navState.value = data.state
    }
  } catch (error) {
    console.error(`启动${mode}模式失败:`, error)
  } finally {
    loading.value = false
  }
}

async function stopNav() {
  loading.value = true
  try {
    const response = await fetch(`${getApiBase()}/api/nav/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
    const data = await response.json()
    if (data.state) {
      navState.value = data.state
    }
  } catch (error) {
    console.error('停止导航失败:', error)
  } finally {
    loading.value = false
  }
}

async function resetNav() {
  loading.value = true
  try {
    const response = await fetch(`${getApiBase()}/api/nav/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
    const data = await response.json()
    if (data.state) {
      navState.value = data.state
    }
  } catch (error) {
    console.error('重置导航失败:', error)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchState()
})
</script>

<style scoped>
.navigation-panel {
  position: fixed;
  bottom: 180px;
  left: 10px;
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
  color: #60a5fa;
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
  background: #60a5fa;
  color: white;
  animation: pulse 1.5s infinite;
}

.status-warning {
  background: #f59e0b;
  color: white;
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

/* 模式按钮 */
.mode-buttons {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.mode-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 8px;
  border: 2px solid #333;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.3);
  color: #888;
  cursor: pointer;
  transition: all 0.2s;
}

.mode-btn:hover:not(:disabled) {
  border-color: #60a5fa;
  color: #60a5fa;
}

.mode-btn.active {
  border-color: #60a5fa;
  background: rgba(96, 165, 250, 0.2);
  color: #60a5fa;
}

.mode-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.mode-icon {
  font-size: 1.5em;
  margin-bottom: 4px;
}

.mode-name {
  font-size: 0.85em;
  font-weight: 600;
}

/* 控制按钮 */
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

.btn-stop {
  background: #ef4444;
  color: white;
}

.btn-stop:hover:not(:disabled) {
  background: #dc2626;
}

.btn-reset {
  background: #6b7280;
  color: white;
}

.btn-reset:hover:not(:disabled) {
  background: #4b5563;
}

/* 导航状态 */
.nav-status {
  background: rgba(0, 0, 0, 0.3);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 16px;
}

.status-title, .stats-title, .config-title {
  color: #888;
  font-size: 0.9em;
  margin-bottom: 10px;
}

.status-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.status-item {
  display: flex;
  flex-direction: column;
}

.status-item .label {
  color: #666;
  font-size: 0.8em;
}

.status-item .value {
  color: #ccc;
  font-weight: 600;
}

.status-item .value.active {
  color: #60a5fa;
}

.status-item .value.returning {
  color: #a855f7;
}

.status-item .value.warning {
  color: #f59e0b;
}

/* 统计信息 */
.stats-info {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 16px;
}

.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.stat-item {
  text-align: center;
}

.stat-value {
  display: block;
  font-size: 1.2em;
  font-weight: 700;
  color: #60a5fa;
}

.stat-label {
  display: block;
  font-size: 0.75em;
  color: #888;
  margin-top: 2px;
}

/* 安全阈值 */
.config-info {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  padding: 12px;
}

.threshold-bars {
  display: flex;
  gap: 8px;
}

.threshold-item {
  flex: 1;
  text-align: center;
  padding: 8px;
  border-radius: 6px;
}

.threshold-item.danger {
  background: rgba(239, 68, 68, 0.2);
  border: 1px solid #ef4444;
}

.threshold-item.caution {
  background: rgba(245, 158, 11, 0.2);
  border: 1px solid #f59e0b;
}

.threshold-item.safe {
  background: rgba(74, 222, 128, 0.2);
  border: 1px solid #4ade80;
}

.threshold-label {
  display: block;
  font-size: 0.75em;
  color: #888;
}

.threshold-value {
  display: block;
  font-weight: 600;
  margin-top: 2px;
}

.threshold-item.danger .threshold-value { color: #ef4444; }
.threshold-item.caution .threshold-value { color: #f59e0b; }
.threshold-item.safe .threshold-value { color: #4ade80; }
</style>
