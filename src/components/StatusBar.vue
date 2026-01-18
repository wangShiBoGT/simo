<template>
  <div class="status-bar-container">
    <!-- 状态条（永远可见） -->
    <div class="status-bar" :class="stateClass">
      <span class="status-dot"></span>
      <span class="status-text">{{ stateText }}</span>
      <span class="status-time" v-if="remaining_ms !== null">
        {{ Math.ceil(remaining_ms / 1000) }}s
      </span>
    </div>

    <!-- B 阶段：安全警告 -->
    <div class="safety-warning" v-if="safety.blocked">
      <span class="warning-icon">⚠️</span>
      <span>已停止：{{ safetyReasonText }}</span>
    </div>

    <!-- 当前动作卡片 -->
    <div class="action-card" v-if="showActionCard && !safety.blocked">
      <div class="action-header">
        {{ actionHeader }}
      </div>
      <div class="action-content">
        {{ actionContent }}
      </div>
    </div>

    <!-- STOP 强化按钮 -->
    <button class="stop-btn" @click="handleStop" :disabled="stopping">
      <span class="stop-icon">⏹</span>
      <span>停止（立即）</span>
    </button>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { getApiBase } from '../config/api.js'

const state = ref('idle')
const current_intent = ref(null)
const remaining_ms = ref(null)
const confirm_prompt = ref(null)
const last_reject = ref(null)
const stopping = ref(false)

// B 阶段：安全状态
const safety = ref({
  state: 'safe',
  blocked: false,
  reason: null,
  source: null
})

let pollTimer = null

// 状态样式
const stateClass = computed(() => ({
  idle: state.value === 'idle',
  moving: state.value === 'moving',
  confirming: state.value === 'confirming'
}))

// 状态文字
const stateText = computed(() => {
  switch (state.value) {
    case 'idle': return '等待'
    case 'moving': return '运行中'
    case 'confirming': return '等待确认'
    default: return '未知'
  }
})

// 是否显示动作卡片
const showActionCard = computed(() => {
  return state.value !== 'idle' || confirm_prompt.value || last_reject.value
})

// 动作卡片标题
const actionHeader = computed(() => {
  if (state.value === 'confirming') return '等待确认：'
  if (state.value === 'moving') return '正在执行：'
  if (last_reject.value) return '上次拒绝：'
  return '当前没有动作'
})

// 动作卡片内容
const actionContent = computed(() => {
  if (state.value === 'confirming' && confirm_prompt.value) {
    return confirm_prompt.value
  }
  if (state.value === 'moving' && current_intent.value) {
    const dir = {
      'F': '前进', 'B': '后退', 'L': '左转', 'R': '右转'
    }[current_intent.value.direction] || current_intent.value.direction
    const ms = current_intent.value.duration_ms
    return `${dir}（${ms}ms）`
  }
  if (last_reject.value) {
    return last_reject.value
  }
  return ''
})

// B 阶段：安全原因文本
const safetyReasonText = computed(() => {
  const reasonMap = {
    'OBSTACLE_NEAR': '前方障碍',
    'CLIFF_DETECTED': '检测到悬崖',
    'BUMPER_HIT': '碰撞触发',
    'SIDE_BLOCKED': '侧面阻挡',
    'UNKNOWN_HAZARD': '未知危险'
  }
  return reasonMap[safety.value.reason] || safety.value.reason || '安全阻止'
})

// 获取状态
async function fetchState() {
  try {
    const response = await fetch(`${getApiBase()}/api/state`)
    const data = await response.json()
    
    state.value = data.state || 'idle'
    current_intent.value = data.current_intent
    remaining_ms.value = data.remaining_ms
    confirm_prompt.value = data.confirm_prompt
    last_reject.value = data.last_reject
    
    // B 阶段：安全状态
    if (data.safety) {
      safety.value = data.safety
    }
  } catch (error) {
    console.error('获取状态失败:', error)
  }
}

// 停止按钮
async function handleStop() {
  stopping.value = true
  try {
    await fetch(`${getApiBase()}/api/intent/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
    await fetchState()
  } catch (error) {
    console.error('停止失败:', error)
  } finally {
    stopping.value = false
  }
}

onMounted(() => {
  fetchState()
  // 每 2000ms 轮询状态（降低频率避免卡顿）
  pollTimer = setInterval(fetchState, 2000)
})

onUnmounted(() => {
  if (pollTimer) {
    clearInterval(pollTimer)
  }
})
</script>

<style scoped>
.status-bar-container {
  position: fixed;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  z-index: 1000;
}

/* 状态条 */
.status-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 20px;
  background: rgba(30, 30, 30, 0.9);
  backdrop-filter: blur(10px);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
  font-size: 14px;
  font-weight: 500;
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  transition: background 0.3s;
}

.status-bar.idle .status-dot {
  background: #6b7280;
}

.status-bar.moving .status-dot {
  background: #22c55e;
  animation: pulse 1s infinite;
}

.status-bar.confirming .status-dot {
  background: #eab308;
  animation: pulse 1s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* B 阶段：安全警告 */
.safety-warning {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-radius: 12px;
  background: rgba(239, 68, 68, 0.9);
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  animation: pulse-warning 1s infinite;
}

@keyframes pulse-warning {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.8; }
}

.warning-icon {
  font-size: 16px;
}

.status-text {
  color: #fff;
}

.status-time {
  color: #9ca3af;
  font-size: 12px;
}

/* 动作卡片 */
.action-card {
  padding: 10px 16px;
  border-radius: 12px;
  background: rgba(30, 30, 30, 0.9);
  backdrop-filter: blur(10px);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
  text-align: center;
  max-width: 280px;
}

.action-header {
  font-size: 12px;
  color: #9ca3af;
  margin-bottom: 4px;
}

.action-content {
  font-size: 14px;
  color: #fff;
  font-weight: 500;
}

/* STOP 按钮 */
.stop-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 20px;
  border: none;
  border-radius: 20px;
  background: #ef4444;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 2px 10px rgba(239, 68, 68, 0.4);
}

.stop-btn:hover {
  background: #dc2626;
  transform: scale(1.05);
}

.stop-btn:active {
  transform: scale(0.98);
}

.stop-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.stop-icon {
  font-size: 16px;
}
</style>
