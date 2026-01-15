<template>
  <div class="simo-container">
    <!-- 顶部工具栏 -->
    <div class="top-bar">
      <div class="current-member" v-if="currentMember">
        <span class="member-emoji">{{ getMemberEmoji(currentMember.role) }}</span>
        <span class="member-name">{{ currentMember.name }}</span>
      </div>
      
      <!-- 模型选择器 -->
      <div class="model-selector">
        <select v-model="currentModel" @change="onModelChange" class="model-select">
          <option value="zhipu">智谱 GLM-4</option>
          <option value="qwen">通义千问</option>
          <option value="deepseek">DeepSeek</option>
          <option value="moonshot">Moonshot</option>
          <option value="ernie">文心一言</option>
        </select>
      </div>
      
      <button class="settings-btn" @click="showSettings = true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      </button>
    </div>

    <!-- 顶部一字眉灯光 - 极越标志性设计 -->
    <div class="light-bar-wrapper">
      <div 
        class="light-bar" 
        :class="{ 
          'is-listening': isListening, 
          'is-thinking': isThinking,
          'is-speaking': isSpeaking 
        }"
      >
        <div class="light-bar-glow"></div>
        <div class="light-bar-scan" v-if="isThinking"></div>
      </div>
    </div>

    <!-- 主交互区域 - 无对话时显示 -->
    <div class="main-area" v-if="messages.length === 0">
      <!-- Simo 核心视觉 - 极简圆环 -->
      <div class="simo-visual" @click="handleWakeUp">
        <div 
          class="simo-ring" 
          :class="{ 
            'is-listening': isListening, 
            'is-thinking': isThinking,
            'is-speaking': isSpeaking 
          }"
        >
          <!-- 内部光点 -->
          <div class="ring-inner">
            <div class="core-dot"></div>
          </div>
          <!-- 监听波纹 -->
          <div v-if="isListening" class="ripple"></div>
          <div v-if="isListening" class="ripple delay-1"></div>
          <div v-if="isListening" class="ripple delay-2"></div>
        </div>
        
        <!-- Simo 文字标识 -->
        <div class="simo-label">SIMO</div>
      </div>

      <!-- 状态文字 - 极越风格大字 -->
      <div class="status-display">
        <transition name="fade" mode="out-in">
          <div v-if="isSpeaking" class="response-text" key="speaking">
            {{ currentResponse }}
          </div>
          <div v-else-if="isListening" class="status-text listening" key="listening">
            正在聆听...
          </div>
          <div v-else-if="isThinking" class="status-text thinking" key="thinking">
            <span class="dot-loading">
              <span></span><span></span><span></span>
            </span>
          </div>
          <div v-else class="status-text idle" key="idle">
            Hi Simo
          </div>
        </transition>
      </div>
    </div>

    <!-- 对话历史 - Claude/ChatGPT 苹果风格 -->
    <div class="conversation-panel" v-if="messages.length > 0">
      <div class="conversation-scroll" ref="scrollContainer">
        <div 
          v-for="(msg, index) in messages" 
          :key="index" 
          class="message-row"
          :class="msg.role"
        >
          <div class="message-container">
            <!-- 头像 -->
            <div class="avatar" :class="msg.role">
              <span v-if="msg.role === 'user'">{{ currentMember?.name?.charAt(0) || '我' }}</span>
              <span v-else class="simo-avatar">S</span>
            </div>
            
            <!-- 消息内容 -->
            <div class="message-content">
              <div class="message-header">
                <span class="sender-name">{{ msg.role === 'user' ? (currentMember?.name || '我') : 'Simo' }}</span>
              </div>
              <div class="message-text">{{ msg.content }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部控制区 - ChatGPT 苹果风格 -->
    <div class="control-dock">
      <div class="input-area">
        <!-- 麦克风按钮 -->
        <button 
          class="mic-btn"
          :class="{ active: isListening, disabled: isThinking }"
          @click="toggleListening"
          :disabled="isThinking"
        >
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M12 1C10.34 1 9 2.34 9 4V12C9 13.66 10.34 15 12 15C13.66 15 15 13.66 15 12V4C15 2.34 13.66 1 12 1Z" 
                  stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            <path d="M19 10V12C19 15.866 15.866 19 12 19C8.13401 19 5 15.866 5 12V10" 
                  stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            <path d="M12 19V23M8 23H16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
        
        <!-- 文字输入 -->
        <input 
          v-model="inputText"
          type="text"
          placeholder="给 Simo 发消息..."
          @keyup.enter="sendMessage"
          :disabled="isListening || isThinking"
          class="text-input"
        />
        
        <!-- 发送按钮 -->
        <button 
          class="send-btn"
          @click="sendMessage"
          :disabled="!inputText.trim() || isThinking"
        >
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- 底部 Pixel 指示灯 -->
    <div class="pixel-indicator">
      <div 
        v-for="i in 5" 
        :key="i" 
        class="pixel-dot"
        :class="{ active: getPixelState(i) }"
        :style="{ animationDelay: `${i * 0.1}s` }"
      ></div>
    </div>

    <!-- 设置面板 -->
    <SettingsPanel 
      v-if="showSettings" 
      @close="showSettings = false"
      @member-changed="onMemberChanged"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import { simoChat, speak, stopSpeak } from './services/simo.js'
import memory from './services/memory.js'
import SettingsPanel from './components/SettingsPanel.vue'

// 状态
const isListening = ref(false)
const isThinking = ref(false)
const isSpeaking = ref(false)
const inputText = ref('')
const currentResponse = ref('')
const messages = ref([])
const showSettings = ref(false)
const currentMember = ref(null)
const currentModel = ref('zhipu')  // 默认使用智谱（免费）
const scrollContainer = ref(null)  // 滚动容器引用

// 自动滚动到底部
const scrollToBottom = () => {
  nextTick(() => {
    if (scrollContainer.value) {
      scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight
    }
  })
}

// 监听消息变化，自动滚动
watch(messages, () => {
  scrollToBottom()
}, { deep: true })

// 模型切换
const onModelChange = () => {
  localStorage.setItem('simo_current_model', currentModel.value)
  console.log('🔄 切换模型:', currentModel.value)
}

// 语音识别实例
let recognition = null

// 只显示最近3条消息
const recentMessages = computed(() => {
  return messages.value.slice(-3)
})

// Pixel 指示灯状态
const getPixelState = (index) => {
  if (isListening.value) return true
  if (isThinking.value) return index <= 3
  if (isSpeaking.value) return index === 3
  return index === 3 // 待机时中间亮
}

// 获取成员头像
const getMemberEmoji = (role) => {
  const emojis = { adult: '👤', child: '👶', elder: '👴' }
  return emojis[role] || '👤'
}

// 🎯 快速回应生成（手感优化）
// 只对特定唤醒词返回快速回应，其他情况返回 null（由超时机制处理）
const getQuickAck = (message) => {
  const lowerMsg = message.toLowerCase()
  
  // Hi Simo 唤醒 - 这是唯一需要立即回应的情况
  if (lowerMsg.includes('hi') && lowerMsg.includes('simo')) {
    return '在呢。'
  }
  
  // 其他情况不立即回应，让超时机制处理
  return null
}

// 成员切换回调
const onMemberChanged = (memberId) => {
  currentMember.value = memory.getMemberProfile(memberId)
  messages.value = [] // 清空当前对话显示
}

// 唤醒 Simo
const handleWakeUp = async () => {
  if (isThinking.value) return
  console.log('Hi Simo')
  await chat('Hi Simo')
}

// 初始化语音识别
const initSpeechRecognition = () => {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!SpeechRecognition) {
    console.warn('浏览器不支持语音识别')
    return
  }
  
  recognition = new SpeechRecognition()
  recognition.lang = 'zh-CN'
  recognition.continuous = false
  recognition.interimResults = true
  
  recognition.onresult = (event) => {
    const transcript = Array.from(event.results)
      .map(result => result[0].transcript)
      .join('')
    
    console.log('识别结果:', transcript)
    
    // 🎯 打断能力：检测到"等等"、"停"等关键词时立即停止语音
    const interruptWords = ['等等', '停', '等一下', '暂停', '别说了', '闭嘴']
    const shouldInterrupt = interruptWords.some(word => transcript.includes(word))
    
    if (shouldInterrupt && isSpeaking.value) {
      console.log('🛑 检测到打断指令，停止语音')
      stopSpeak()
      isSpeaking.value = false
      currentResponse.value = ''
      stopListening()
      return
    }
    
    // 如果是最终结果，发送消息
    if (event.results[0].isFinal) {
      stopListening()
      if (transcript.trim()) {
        chat(transcript.trim())
      }
    }
  }
  
  recognition.onerror = (event) => {
    console.error('语音识别错误:', event.error)
    stopListening()
    
    if (event.error === 'no-speech') {
      // 没有检测到语音，静默处理
    } else if (event.error === 'not-allowed') {
      alert('请允许麦克风权限')
    }
  }
  
  recognition.onend = () => {
    if (isListening.value) {
      // 如果还在监听状态但识别结束了，重新开始
      try {
        recognition.start()
      } catch (e) {
        stopListening()
      }
    }
  }
}

// 切换监听状态
const toggleListening = () => {
  if (isListening.value) {
    stopListening()
  } else {
    startListening()
  }
}

// 开始监听
const startListening = () => {
  if (!recognition) {
    initSpeechRecognition()
  }
  
  if (!recognition) {
    alert('您的浏览器不支持语音识别，请使用 Chrome 浏览器')
    return
  }
  
  isListening.value = true
  console.log('开始监听...')
  
  try {
    recognition.start()
  } catch (e) {
    console.error('启动语音识别失败:', e)
    isListening.value = false
  }
}

// 停止监听
const stopListening = () => {
  isListening.value = false
  console.log('停止监听')
  
  if (recognition) {
    try {
      recognition.stop()
    } catch (e) {
      // 忽略停止错误
    }
  }
}

// 发送文字消息
const sendMessage = () => {
  if (!inputText.value.trim() || isThinking.value) return
  
  const text = inputText.value.trim()
  inputText.value = ''
  chat(text)
}

// 核心对话函数
const chat = async (userMessage) => {
  // 添加用户消息
  messages.value.push({
    role: 'user',
    content: userMessage
  })
  
  isThinking.value = true
  
  // 🎯 手感优化
  let thinkingTimeout = null
  let hasSpokenThinking = false
  const voiceEnabled = localStorage.getItem('simo_voice_enabled') !== 'false'
  
  // 唤醒词立即回应（Hi Simo → 在呢）
  const quickAck = getQuickAck(userMessage)
  if (quickAck) {
    currentResponse.value = quickAck
    isSpeaking.value = true
    hasSpokenThinking = true
    if (voiceEnabled) {
      speak(quickAck)  // 不等待，并行处理
    }
  }
  
  // 如果超过 1.5 秒还没响应，先说一句占位语
  thinkingTimeout = setTimeout(async () => {
    if (isThinking.value && !hasSpokenThinking) {
      hasSpokenThinking = true
      const thinkingPhrases = ['嗯，我想一下。', '稍等。', '让我看看。']
      const phrase = thinkingPhrases[Math.floor(Math.random() * thinkingPhrases.length)]
      currentResponse.value = phrase
      if (voiceEnabled) {
        await speak(phrase)
      }
    }
  }, 1500)
  
  try {
    const response = await simoChat(userMessage)
    
    // 清除占位语超时
    if (thinkingTimeout) clearTimeout(thinkingTimeout)
    
    // 如果正在说占位语，先停止
    if (hasSpokenThinking) {
      stopSpeak()
      await new Promise(resolve => setTimeout(resolve, 200))
    }
    
    isThinking.value = false
    isSpeaking.value = true
    currentResponse.value = response
    
    // 添加 Simo 回复
    messages.value.push({
      role: 'simo',
      content: response
    })
    
    // 语音合成
    if (voiceEnabled) {
      await speak(response)
    }
    
    // 根据回复长度计算显示时间
    const displayTime = Math.max(1500, response.length * 100)
    setTimeout(() => {
      isSpeaking.value = false
      currentResponse.value = ''
    }, displayTime)
    
  } catch (error) {
    // 清除占位语超时
    if (thinkingTimeout) clearTimeout(thinkingTimeout)
    
    console.error('Simo 响应失败:', error)
    isThinking.value = false
    
    const errorMsg = '抱歉，稍等一下。'
    messages.value.push({
      role: 'simo',
      content: errorMsg
    })
    
    isSpeaking.value = true
    currentResponse.value = errorMsg
    if (voiceEnabled) {
      await speak(errorMsg)
    }
    setTimeout(() => {
      isSpeaking.value = false
      currentResponse.value = ''
    }, 2000)
  }
}

// 初始化
onMounted(() => {
  console.log('Hi Simo 已启动')
  
  // 加载保存的模型选择
  const savedModel = localStorage.getItem('simo_current_model')
  if (savedModel) {
    currentModel.value = savedModel
  }
  
  // 初始化家庭成员
  const member = memory.initializeFamily()
  currentMember.value = member
  
  // 初始化语音识别
  initSpeechRecognition()
})
</script>

<style scoped>
/* 极越车机风格 - 主容器 */
.simo-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: var(--bg-primary);
  position: relative;
  overflow: hidden;
}

/* 顶部工具栏 */
.top-bar {
  position: absolute;
  top: 16px;
  left: 20px;
  right: 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  z-index: 100;
}

.current-member {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: var(--bg-secondary);
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.member-emoji {
  font-size: 16px;
}

.member-name {
  font-size: 14px;
  color: var(--text-secondary);
}

/* 模型选择器 */
.model-selector {
  margin-left: auto;
  margin-right: 12px;
}

.model-select {
  padding: 8px 16px;
  background: var(--bg-secondary);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  outline: none;
  transition: all 0.2s;
  appearance: none;
  -webkit-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  padding-right: 32px;
}

.model-select:hover {
  border-color: var(--jiyue-blue);
}

.model-select:focus {
  border-color: var(--jiyue-blue);
  box-shadow: 0 0 0 2px rgba(0, 122, 255, 0.2);
}

.model-select option {
  background: #1a1a1a;
  color: #fff;
  padding: 8px;
}

.settings-btn {
  width: 40px;
  height: 40px;
  border: none;
  background: var(--bg-secondary);
  border-radius: 50%;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.settings-btn:hover {
  color: var(--jiyue-blue);
  border-color: var(--jiyue-blue);
}

.settings-btn svg {
  width: 20px;
  height: 20px;
}

/* 顶部一字眉灯光 - iOS 18 Siri 风格 */
.light-bar-wrapper {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 6px;
  display: flex;
  justify-content: center;
  padding: 0 5%;
  z-index: 1000;
}

.light-bar {
  width: 100%;
  max-width: 800px;
  height: 100%;
  position: relative;
  overflow: visible;
  border-radius: 3px;
  /* 默认状态：多彩渐变流动 */
  background: linear-gradient(90deg, 
    transparent 0%, 
    var(--siri-purple) 15%,
    var(--siri-blue) 35%,
    var(--siri-cyan) 50%,
    var(--siri-blue) 65%,
    var(--siri-purple) 85%,
    transparent 100%);
  background-size: 200% 100%;
  animation: light-bar-flow 4s linear infinite, light-bar-breathe 3s ease-in-out infinite;
}

.light-bar-glow {
  position: absolute;
  top: -4px;
  left: -2%;
  right: -2%;
  bottom: -4px;
  background: inherit;
  filter: blur(12px);
  opacity: 0.8;
  border-radius: 6px;
}

/* 监听状态 - 绿色脉动 */
.light-bar.is-listening {
  background: linear-gradient(90deg, 
    transparent 0%, 
    var(--listening-color) 20%, 
    #4ade80 50%,
    var(--listening-color) 80%, 
    transparent 100%);
  background-size: 200% 100%;
  animation: light-bar-flow 2s linear infinite;
}

.light-bar.is-listening .light-bar-glow {
  background: var(--listening-color);
  filter: blur(16px);
  opacity: 0.9;
}

/* 思考状态 - 橙色扫光 */
.light-bar.is-thinking {
  background: linear-gradient(90deg, 
    transparent 0%, 
    var(--thinking-color) 20%, 
    #fbbf24 50%,
    var(--thinking-color) 80%, 
    transparent 100%);
  background-size: 300% 100%;
  animation: light-bar-flow 1.5s linear infinite, thinking-pulse 0.6s ease-in-out infinite;
}

.light-bar.is-thinking .light-bar-glow {
  background: var(--thinking-color);
  filter: blur(20px);
  opacity: 1;
}

/* 思考时的扫光效果 */
.light-bar-scan {
  position: absolute;
  top: -2px;
  left: 0;
  width: 40%;
  height: calc(100% + 4px);
  background: linear-gradient(90deg, 
    transparent 0%, 
    rgba(255,255,255,0.4) 30%,
    rgba(255,255,255,0.8) 50%,
    rgba(255,255,255,0.4) 70%,
    transparent 100%);
  animation: scan-line 2s ease-in-out infinite;
  border-radius: 3px;
}

/* 说话状态 - 蓝色波动 */
.light-bar.is-speaking {
  background: linear-gradient(90deg, 
    transparent 0%, 
    var(--siri-blue) 15%,
    var(--siri-cyan) 35%,
    var(--speaking-color) 50%,
    var(--siri-cyan) 65%,
    var(--siri-blue) 85%,
    transparent 100%);
  background-size: 200% 100%;
  animation: light-bar-flow 3s linear infinite, light-bar-breathe 1.5s ease-in-out infinite;
}

.light-bar.is-speaking .light-bar-glow {
  background: var(--speaking-color);
  filter: blur(18px);
  opacity: 0.9;
}

/* 主交互区域 */
.main-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 48px;
  padding: 60px 20px;
}

/* Simo 核心视觉 - Siri 风格光圈 */
.simo-visual {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  cursor: pointer;
  position: relative;
}

/* 外层光晕背景 */
.simo-visual::before {
  content: '';
  position: absolute;
  width: 280px;
  height: 280px;
  border-radius: 50%;
  background: radial-gradient(circle,
    rgba(0, 212, 255, 0.15) 0%,
    rgba(168, 85, 247, 0.1) 30%,
    rgba(59, 130, 246, 0.05) 50%,
    transparent 70%);
  animation: glow-pulse 4s ease-in-out infinite;
  pointer-events: none;
}

.simo-ring {
  width: 180px;
  height: 180px;
  border-radius: 50%;
  border: 2.5px solid transparent;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  /* 多彩渐变边框 */
  background: 
    linear-gradient(var(--bg-primary), var(--bg-primary)) padding-box,
    linear-gradient(135deg, var(--siri-cyan), var(--siri-blue), var(--siri-purple), var(--siri-pink)) border-box;
  animation: core-breathe 4s ease-in-out infinite;
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  /* 多层光晕 */
  box-shadow: 
    0 0 40px rgba(0, 212, 255, 0.3),
    0 0 80px rgba(168, 85, 247, 0.2),
    0 0 120px rgba(59, 130, 246, 0.1),
    inset 0 0 40px rgba(0, 212, 255, 0.05);
}

.simo-ring:hover {
  transform: scale(1.05);
  box-shadow: 
    0 0 50px rgba(0, 212, 255, 0.4),
    0 0 100px rgba(168, 85, 247, 0.3),
    0 0 150px rgba(59, 130, 246, 0.15),
    inset 0 0 50px rgba(0, 212, 255, 0.08);
}

.ring-inner {
  width: 85%;
  height: 85%;
  border-radius: 50%;
  background: radial-gradient(circle, 
    rgba(0, 212, 255, 0.1) 0%, 
    rgba(168, 85, 247, 0.05) 40%,
    transparent 70%);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

/* 内部旋转光环 */
.ring-inner::before {
  content: '';
  position: absolute;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  border: 1px solid rgba(0, 212, 255, 0.2);
  animation: orb-rotate 20s linear infinite;
}

.core-dot {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--siri-cyan), var(--jiyue-blue));
  box-shadow: 
    0 0 20px var(--jiyue-blue-glow),
    0 0 40px rgba(0, 212, 255, 0.4);
  animation: glow-pulse 2s ease-in-out infinite;
}

/* 监听状态 - 绿色光晕 */
.simo-ring.is-listening {
  background: 
    linear-gradient(var(--bg-primary), var(--bg-primary)) padding-box,
    linear-gradient(135deg, #22c55e, #4ade80, #86efac) border-box;
  box-shadow: 
    0 0 50px var(--listening-glow),
    0 0 100px rgba(34, 197, 94, 0.4),
    0 0 150px rgba(34, 197, 94, 0.2),
    inset 0 0 40px rgba(34, 197, 94, 0.1);
}

.simo-ring.is-listening .core-dot {
  background: linear-gradient(135deg, #22c55e, #4ade80);
  box-shadow: 
    0 0 25px var(--listening-glow),
    0 0 50px rgba(34, 197, 94, 0.5);
}

.simo-ring.is-listening .ring-inner {
  background: radial-gradient(circle, rgba(34, 197, 94, 0.15) 0%, transparent 70%);
}

/* 思考状态 - 橙色脉动 */
.simo-ring.is-thinking {
  background: 
    linear-gradient(var(--bg-primary), var(--bg-primary)) padding-box,
    linear-gradient(135deg, #f59e0b, #fbbf24, #fcd34d) border-box;
  animation: thinking-pulse 0.8s ease-in-out infinite;
  box-shadow: 
    0 0 50px var(--thinking-glow),
    0 0 100px rgba(245, 158, 11, 0.4),
    inset 0 0 40px rgba(245, 158, 11, 0.1);
}

.simo-ring.is-thinking .core-dot {
  background: linear-gradient(135deg, #f59e0b, #fbbf24);
  box-shadow: 
    0 0 25px var(--thinking-glow),
    0 0 50px rgba(245, 158, 11, 0.5);
}

.simo-ring.is-thinking .ring-inner::before {
  animation: thinking-rotate 2s linear infinite;
}

/* 说话状态 - 蓝色波动 */
.simo-ring.is-speaking {
  background: 
    linear-gradient(var(--bg-primary), var(--bg-primary)) padding-box,
    linear-gradient(135deg, var(--siri-blue), var(--siri-cyan), var(--siri-blue)) border-box;
  animation: speaking-wave 2s ease-in-out infinite;
  box-shadow: 
    0 0 50px var(--speaking-glow),
    0 0 100px rgba(59, 130, 246, 0.4),
    0 0 150px rgba(6, 182, 212, 0.2),
    inset 0 0 40px rgba(59, 130, 246, 0.1);
}

.simo-ring.is-speaking .core-dot {
  background: linear-gradient(135deg, var(--siri-blue), var(--siri-cyan));
  box-shadow: 
    0 0 25px var(--speaking-glow),
    0 0 50px rgba(59, 130, 246, 0.5);
}

/* 监听波纹 - 更柔和 */
.ripple {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 180px;
  height: 180px;
  margin: -90px 0 0 -90px;
  border-radius: 50%;
  border: 2px solid var(--listening-color);
  animation: listening-ripple 2.5s ease-out infinite;
  opacity: 0;
}

.ripple.delay-1 { animation-delay: 0.5s; }
.ripple.delay-2 { animation-delay: 1s; }

/* Simo 文字标识 */
.simo-label {
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 8px;
  color: var(--text-secondary);
  text-transform: uppercase;
}

/* 状态显示区 */
.status-display {
  min-height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.status-text {
  font-size: 18px;
  color: var(--text-secondary);
  letter-spacing: 2px;
}

.status-text.idle {
  font-size: 24px;
  color: var(--text-tertiary);
  font-weight: 300;
}

.status-text.listening {
  color: var(--listening-color);
}

.status-text.thinking {
  color: var(--thinking-color);
}

.response-text {
  font-size: 28px;
  font-weight: 400;
  color: var(--text-primary);
  animation: text-fade-in 0.3s ease-out;
}

/* 加载点动画 */
.dot-loading {
  display: flex;
  gap: 8px;
}

.dot-loading span {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--thinking-color);
  animation: pixel-blink 1s ease-in-out infinite;
}

.dot-loading span:nth-child(2) { animation-delay: 0.2s; }
.dot-loading span:nth-child(3) { animation-delay: 0.4s; }

/* 过渡动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

/* 对话面板 - Claude/ChatGPT 苹果风格 */
.conversation-panel {
  position: absolute;
  top: 80px;
  bottom: 160px;
  left: 0;
  right: 0;
  overflow: hidden;
}

.conversation-scroll {
  height: 100%;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 0;
  scroll-behavior: smooth;
}

/* 隐藏滚动条但保持功能 */
.conversation-scroll::-webkit-scrollbar {
  width: 6px;
}

.conversation-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.conversation-scroll::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
}

.conversation-scroll::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.2);
}

/* 消息行 */
.message-row {
  padding: 24px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  animation: message-fade-in 0.3s ease-out;
}

.message-row:last-child {
  border-bottom: none;
}

@keyframes message-fade-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 消息容器 */
.message-container {
  max-width: 800px;
  margin: 0 auto;
  display: flex;
  gap: 16px;
  padding: 0 20px;
}

/* 头像 */
.avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

.avatar.user {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
}

.avatar.simo {
  background: linear-gradient(135deg, #00d4ff 0%, #007aff 100%);
  color: #fff;
}

.simo-avatar {
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
  font-weight: 700;
}

/* 消息内容 */
.message-content {
  flex: 1;
  min-width: 0;
}

.message-header {
  margin-bottom: 6px;
}

.sender-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
}

.message-text {
  font-size: 15px;
  line-height: 1.7;
  color: var(--text-secondary);
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;
  word-wrap: break-word;
}

/* Simo 消息特殊样式 */
.message-row.simo .message-text {
  color: var(--text-primary);
}

/* 用户消息背景 */
.message-row.user {
  background: rgba(255, 255, 255, 0.02);
}

/* 底部控制区 - ChatGPT 苹果风格 */
.control-dock {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 16px 20px 32px;
  background: linear-gradient(to top, var(--bg-primary) 60%, transparent);
}

.control-dock-inner {
  max-width: 800px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 12px;
}

/* 文字输入区 - ChatGPT 风格 */
.input-area {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 24px;
  padding: 12px 16px;
  transition: all 0.2s ease;
}

.input-area:focus-within {
  border-color: rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.08);
  box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.05);
}

.text-input {
  flex: 1;
  background: none;
  border: none;
  color: var(--text-primary);
  font-size: 14px;
  outline: none;
}

.text-input::placeholder {
  color: var(--text-tertiary);
}

.text-input:disabled {
  opacity: 0.5;
}

/* 麦克风按钮 - 苹果风格 */
.mic-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.mic-btn:hover {
  color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.1);
}

.mic-btn.active {
  color: #ff3b30;
  background: rgba(255, 59, 48, 0.1);
}

.mic-btn.disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.mic-btn svg {
  width: 20px;
  height: 20px;
}

/* 发送按钮 - 苹果风格 */
.send-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: none;
  background: #007aff;
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.send-btn:hover {
  background: #0066d6;
  transform: scale(1.05);
}

.send-btn:disabled {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-tertiary);
  cursor: not-allowed;
  transform: none;
}

.send-btn svg {
  width: 18px;
  height: 18px;
}

/* 底部 Pixel 指示灯 */
.pixel-indicator {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 6px;
}

.pixel-dot {
  width: 4px;
  height: 4px;
  border-radius: 1px;
  background: var(--text-tertiary);
  opacity: 0.3;
  transition: all 0.3s ease;
}

.pixel-dot.active {
  background: var(--jiyue-blue);
  opacity: 1;
  box-shadow: 0 0 8px var(--jiyue-blue-glow);
  animation: pixel-blink 2s ease-in-out infinite;
}
</style>
