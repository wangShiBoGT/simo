<template>
  <div class="motion-panel" :class="{ expanded: isExpanded }">
    <!-- 展开/收起按钮 -->
    <button class="toggle-btn" @click="isExpanded = !isExpanded">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 19V5M5 12l7-7 7 7" v-if="!isExpanded"/>
        <path d="M12 5v14M5 12l7 7 7-7" v-else/>
      </svg>
      <span>{{ isExpanded ? '收起' : '控制' }}</span>
    </button>

    <!-- 控制面板内容 -->
    <div class="panel-content" v-show="isExpanded">
      <!-- 状态显示 -->
      <div class="status-bar">
        <div class="status-item">
          <span class="status-dot" :class="connectionStatus"></span>
          <span>{{ connectionText }}</span>
        </div>
        <div class="status-item" v-if="robotState">
          <span class="robot-state">{{ robotState }}</span>
        </div>
        <div class="status-item" v-if="awaiting">
          <span class="awaiting-badge">等待确认</span>
        </div>
      </div>

      <!-- 方向控制 -->
      <div class="direction-pad">
        <button 
          class="dir-btn up" 
          @click="sendCommand('前进')"
          @touchstart.prevent="startHold('前进')"
          @touchend.prevent="stopHold"
          :disabled="isMoving"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 4l-8 8h5v8h6v-8h5z"/>
          </svg>
        </button>
        
        <div class="dir-row">
          <button 
            class="dir-btn left" 
            @click="sendCommand('左转')"
            :disabled="isMoving"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M4 12l8-8v5h8v6h-8v5z"/>
            </svg>
          </button>
          
          <button 
            class="dir-btn stop" 
            @click="sendCommand('停')"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2"/>
            </svg>
          </button>
          
          <button 
            class="dir-btn right" 
            @click="sendCommand('右转')"
            :disabled="isMoving"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 12l-8 8v-5H4v-6h8V4z"/>
            </svg>
          </button>
        </div>
        
        <button 
          class="dir-btn down" 
          @click="sendCommand('后退')"
          :disabled="isMoving"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 20l8-8h-5V4H9v8H4z"/>
          </svg>
        </button>
      </div>

      <!-- 快捷按钮 -->
      <div class="quick-actions">
        <button class="action-btn beep" @click="sendCommand('响一下')">
          🔔 蜂鸣
        </button>
        <button class="action-btn long" @click="sendCommand('往前走久一点')">
          ⏩ 长距离
        </button>
      </div>

      <!-- 确认操作 -->
      <div class="confirm-actions" v-if="awaiting">
        <button class="confirm-btn yes" @click="sendCommand('是')">
          ✓ 确认
        </button>
        <button class="confirm-btn no" @click="sendCommand('不')">
          ✗ 取消
        </button>
      </div>

      <!-- 最近指令 -->
      <div class="recent-commands" v-if="recentCommands.length">
        <div class="recent-title">最近指令</div>
        <div class="recent-list">
          <div 
            v-for="(cmd, i) in recentCommands" 
            :key="i" 
            class="recent-item"
            :class="cmd.status"
          >
            <span class="cmd-text">{{ cmd.text }}</span>
            <span class="cmd-result">{{ cmd.result }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { sendIntent, getRobotState, emergencyStop } from '../services/motion.js'

const emit = defineEmits(['command', 'speak'])

const isExpanded = ref(false)
const robotState = ref('idle')
const awaiting = ref(false)
const isConnected = ref(false)
const recentCommands = ref([])
const holdTimer = ref(null)

// 连接状态
const connectionStatus = computed(() => {
  return isConnected.value ? 'connected' : 'disconnected'
})

const connectionText = computed(() => {
  return isConnected.value ? '已连接' : '未连接'
})

// 是否正在移动
const isMoving = computed(() => {
  return robotState.value === 'moving'
})

// 发送命令
const sendCommand = async (text) => {
  const cmd = { text, status: 'pending', result: '...' }
  recentCommands.value.unshift(cmd)
  if (recentCommands.value.length > 5) {
    recentCommands.value.pop()
  }

  try {
    const result = await sendIntent(text)
    
    // 更新状态
    if (result.state) {
      robotState.value = result.state.state
    }
    awaiting.value = result.awaiting || false
    isConnected.value = !result.error

    // 更新命令结果
    if (result.error) {
      cmd.status = 'error'
      cmd.result = '连接失败'
      emit('speak', '控制系统未连接')
    } else if (result.awaiting) {
      cmd.status = 'waiting'
      cmd.result = result.confirm?.prompt || '等待确认'
      emit('speak', cmd.result)  // 播放确认提示
    } else if (result.confirm?.status === 'EXECUTED') {
      cmd.status = 'success'
      cmd.result = '✓ 执行'
    } else if (result.confirm?.status === 'CONFIRMED') {
      cmd.status = 'success'
      cmd.result = '✓ 已确认'
    } else if (result.confirm?.status === 'CANCELLED') {
      cmd.status = 'cancelled'
      cmd.result = '已取消'
    } else if (result.decision?.command === 'BEEP') {
      cmd.status = 'success'
      cmd.result = '🔔'
    } else {
      cmd.status = 'info'
      cmd.result = result.decision?.reason || '已处理'
    }

    emit('command', { text, result })

  } catch (error) {
    cmd.status = 'error'
    cmd.result = '错误'
    isConnected.value = false
  }
}

// 长按支持
const startHold = (text) => {
  sendCommand(text)
  holdTimer.value = setInterval(() => {
    sendCommand(text)
  }, 1000)
}

const stopHold = () => {
  if (holdTimer.value) {
    clearInterval(holdTimer.value)
    holdTimer.value = null
  }
}

// 定时检查状态
let statusTimer = null

onMounted(() => {
  // 初始检查
  checkStatus()
  // 定时检查
  statusTimer = setInterval(checkStatus, 3000)
})

onUnmounted(() => {
  if (statusTimer) clearInterval(statusTimer)
  stopHold()
})

const checkStatus = async () => {
  try {
    const state = await getRobotState()
    if (state && !state.error) {
      robotState.value = state.state
      isConnected.value = true
    }
  } catch {
    isConnected.value = false
  }
}
</script>

<style scoped>
.motion-panel {
  position: fixed;
  bottom: 100px;
  right: 20px;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
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
  border-color: var(--jiyue-blue, #007aff);
  color: var(--jiyue-blue, #007aff);
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
  min-width: 200px;
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

.robot-state {
  padding: 2px 8px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  font-size: 11px;
}

.awaiting-badge {
  padding: 2px 8px;
  background: rgba(245, 158, 11, 0.2);
  color: #f59e0b;
  border-radius: 10px;
  font-size: 11px;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* 方向控制 */
.direction-pad {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.dir-row {
  display: flex;
  gap: 8px;
}

.dir-btn {
  width: 50px;
  height: 50px;
  border: none;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-primary, #fff);
  cursor: pointer;
  transition: all 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dir-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
  transform: scale(1.05);
}

.dir-btn:active:not(:disabled) {
  transform: scale(0.95);
  background: var(--jiyue-blue, #007aff);
}

.dir-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.dir-btn svg {
  width: 24px;
  height: 24px;
}

.dir-btn.stop {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}

.dir-btn.stop:hover {
  background: rgba(239, 68, 68, 0.4);
}

.dir-btn.stop:active {
  background: #ef4444;
  color: #fff;
}

/* 快捷按钮 */
.quick-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.action-btn {
  flex: 1;
  padding: 10px;
  border: none;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-secondary, #888);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.action-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.action-btn.beep:active {
  background: rgba(251, 191, 36, 0.3);
}

/* 确认操作 */
.confirm-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  padding: 12px;
  background: rgba(245, 158, 11, 0.1);
  border-radius: 10px;
}

.confirm-btn {
  flex: 1;
  padding: 12px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.confirm-btn.yes {
  background: #22c55e;
  color: #fff;
}

.confirm-btn.yes:hover {
  background: #16a34a;
}

.confirm-btn.no {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-secondary, #888);
}

.confirm-btn.no:hover {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}

/* 最近指令 */
.recent-commands {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.recent-title {
  font-size: 11px;
  color: var(--text-tertiary, #666);
  margin-bottom: 8px;
}

.recent-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.recent-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 8px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 6px;
  font-size: 12px;
}

.recent-item.success .cmd-result {
  color: #22c55e;
}

.recent-item.error .cmd-result {
  color: #ef4444;
}

.recent-item.waiting .cmd-result {
  color: #f59e0b;
}

.recent-item.cancelled .cmd-result {
  color: #888;
}

.cmd-text {
  color: var(--text-secondary, #888);
}

.cmd-result {
  color: var(--text-tertiary, #666);
}
</style>
