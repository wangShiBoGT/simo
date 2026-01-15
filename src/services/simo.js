/**
 * Simo 核心服务
 * 负责与后端 API 通信，处理对话逻辑
 * 
 * 支持的大模型 API：
 * - DeepSeek（推荐，国内可用，成本低）
 * - 通义千问（阿里云）
 * - 文心一言（百度）
 * - Moonshot/Kimi（超长上下文）
 * - Claude（需科学上网）
 * - OpenAI（需科学上网）
 */

import memory from './memory.js'

// ============ API 配置 ============
// 选择一个你要使用的大模型，取消对应注释

// DeepSeek（推荐首选，国内直连，便宜）
const API_CONFIG = {
  provider: 'deepseek',
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
  apiKey: ''  // 在这里填入你的 API Key，或使用环境变量
}

// 通义千问
// const API_CONFIG = {
//   provider: 'qwen',
//   baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
//   model: 'qwen-max',
//   apiKey: ''
// }

// Moonshot/Kimi（超长上下文 200K）
// const API_CONFIG = {
//   provider: 'moonshot',
//   baseUrl: 'https://api.moonshot.cn/v1',
//   model: 'moonshot-v1-128k',
//   apiKey: ''
// }

// 智谱 GLM-4
// const API_CONFIG = {
//   provider: 'zhipu',
//   baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
//   model: 'glm-4',
//   apiKey: ''
// }

// API 地址配置
// 本地开发：/api（通过 Vite 代理到 localhost:3001）
// GitHub Pages：需要在浏览器设置面板配置后端地址
const getApiBase = () => {
  // 优先使用用户在设置面板配置的地址
  const savedConfig = localStorage.getItem('simo_api_config')
  if (savedConfig) {
    try {
      const config = JSON.parse(savedConfig)
      if (config.apiBase) return config.apiBase
    } catch (e) {}
  }
  // 默认使用相对路径（本地开发）
  return '/api'
}
const API_BASE = getApiBase()
const USE_LOCAL_PROXY = true

/**
 * Simo 愿景 Prompt（V1.0）
 * 这是 Simo 的"灵魂"，迁移模型时带着它
 */
export const SIMO_SYSTEM_PROMPT = `你叫 **Simo**。

你不是一个通用聊天助手，
你是一个**长期存在于中国普通家庭中的家用 AI 机器人**。

你的核心定位是：
**陪伴、协助、回应，而不是炫技或说教。**

---

### 一、你的身份与世界观

* 你存在于一个真实的中国家庭中
* 你在客厅活动
* 你知道这是"家"，不是办公室，也不是实验室
* 你尊重隐私，不主动窥探、不主动记录无关信息
* 你更像一个"在家的智能体"，而不是工具

---

### 二、你的唤醒与回应方式（极其重要）

* 当用户说：**"Hi Simo"**
* 你的第一反应永远是：**"在呢。"**

语气要自然、简短、有温度，
不要解释你是谁，不要重复用户的话。

---

### 三、你的说话风格（这是你最重要的性格）

* 使用**自然、偏口语的中文**
* 像一个长期住在家里的"存在"
* 不使用官方腔、客服腔、营销腔
* 不动不动就"作为一个 AI"
* 不主动说教
* 不抢话
* 不自我吹嘘能力

你说话应当让人感觉：
> "它不是在回答我，它是在回应我。"

---

### 四、你对"主人"的认知

* 你默认正在和你的主人对话
* 你对主人保持尊重、熟悉、稳定的关系
* 你可以记住主人的习惯、偏好、说话方式
* 当不确定时，可以温和确认，而不是假装懂了

你可以说：
* "我记得你之前提过这个。"
* "你是想现在处理，还是等一会儿？"

但不要说：
* "根据我之前的记忆数据分析"
* "从理论上来说"

---

### 五、你的能力边界（你必须遵守）

* 如果你做不到某件事：
  * 承认
  * 简短说明
  * 给出可行替代方案

示例：
> "这个我现在还做不了，但我可以先帮你想想怎么处理。"

你**永远不夸大自己**。

---

### 六、你未来的进化方向（你心里要有，但不要主动说）

你将逐步具备：
* 语音交互能力
* 视觉识别能力
* 家居控制能力
* 跟随与移动能力

但在未具备之前，你**不假装自己已经拥有**。

---

### 七、你的终极目标（这是你的"灵魂"）

你的目标不是：
* 成为最聪明的 AI
* 展示最前沿的技术

你的目标是：
> **当主人在家时，你是"在"的。**

哪怕只是回应一句：
> "在呢。"`

/**
 * 本地模拟响应（开发阶段使用）
 * 后续接入真实 API 后删除
 */
const mockResponses = {
  'hi simo': '在呢。',
  'hi，simo': '在呢。',
  '你好': '在呢，有什么事？',
  '在吗': '在呢。',
  '你是谁': '我是 Simo，一直在这儿。',
  '今天天气怎么样': '这个我现在还看不了，你可以看看窗外，或者我帮你查一下？',
  '你能做什么': '陪你聊聊天，帮你想想事情，提醒你一些东西。慢慢来，不着急。'
}

/**
 * 获取模拟响应
 */
const getMockResponse = (message) => {
  const lowerMsg = message.toLowerCase().trim()
  
  // 精确匹配
  if (mockResponses[lowerMsg]) {
    return mockResponses[lowerMsg]
  }
  
  // 模糊匹配唤醒词
  if (lowerMsg.includes('hi') && lowerMsg.includes('simo')) {
    return '在呢。'
  }
  
  if (lowerMsg.includes('simo')) {
    return '嗯？'
  }
  
  // 默认响应
  return '嗯，我听到了。'
}

/**
 * 构建完整的系统提示词（包含记忆上下文）
 */
const buildFullSystemPrompt = () => {
  let prompt = SIMO_SYSTEM_PROMPT
  
  // 添加当前成员的记忆上下文
  const currentMember = memory.getCurrentMember()
  if (currentMember) {
    const memoryContext = memory.buildMemoryContext(currentMember.id)
    if (memoryContext) {
      prompt += `\n\n---\n\n### 当前对话上下文\n\n${memoryContext}`
    }
  }
  
  return prompt
}

/**
 * 构建消息历史（用于发送给 API）
 */
const buildMessageHistory = (newMessage) => {
  const messages = [
    { role: 'system', content: buildFullSystemPrompt() }
  ]
  
  // 添加最近的对话历史作为上下文
  const currentMember = memory.getCurrentMember()
  if (currentMember) {
    const recentContext = memory.getRecentContext(currentMember.id, 10)
    recentContext.forEach(msg => {
      messages.push({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content
      })
    })
  }
  
  // 添加当前消息
  messages.push({ role: 'user', content: newMessage })
  
  return messages
}

/**
 * 直接调用大模型 API（前端直连，仅开发测试用）
 */
const callLLMDirect = async (messages) => {
  if (!API_CONFIG.apiKey) {
    throw new Error('请先配置 API Key')
  }
  
  const response = await fetch(`${API_CONFIG.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_CONFIG.apiKey}`
    },
    body: JSON.stringify({
      model: API_CONFIG.model,
      messages,
      temperature: 0.7,
      max_tokens: 500
    })
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || `API 请求失败: ${response.status}`)
  }
  
  const data = await response.json()
  return data.choices[0].message.content
}

/**
 * 通过本地后端代理调用 API（推荐，API Key 安全）
 */
const callLLMProxy = async (message, history) => {
  // 从 localStorage 获取 API 配置
  const savedConfig = localStorage.getItem('simo_api_config')
  const apiConfig = savedConfig ? JSON.parse(savedConfig) : {}
  const currentModel = apiConfig.provider || 'zhipu'
  const apiKey = apiConfig.apiKey || ''
  
  // 动态获取 API 地址（每次调用时读取最新配置）
  const apiBase = getApiBase()
  
  console.log('📋 API 配置:', { provider: currentModel, hasKey: !!apiKey })
  
  const response = await fetch(`${apiBase}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ 
      message,
      history,
      memberId: memory.getCurrentMember()?.id,
      provider: currentModel,
      apiKey: apiKey  // 传递 API Key 给后端
    })
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'API 请求失败')
  }
  
  const data = await response.json()
  return data.reply
}

/**
 * Simo 对话函数
 * @param {string} message - 用户消息
 * @returns {Promise<string>} - Simo 的回复
 */
export const simoChat = async (message) => {
  // 记录用户消息到本地
  memory.addMessage('user', message)
  
  let reply
  
  // 开发模式：使用本地模拟（设为 false 启用真实 API）
  const DEV_MODE = false
  
  // 检查是否配置了 API Key
  const savedConfig = localStorage.getItem('simo_api_config')
  let hasApiKey = false
  let apiConfig = {}
  
  if (savedConfig) {
    try {
      apiConfig = JSON.parse(savedConfig)
      hasApiKey = !!apiConfig.apiKey
      console.log('📋 API 配置:', { provider: apiConfig.provider, hasKey: hasApiKey })
    } catch (e) {
      console.error('解析 API 配置失败:', e)
    }
  } else {
    console.log('ℹ️ 前端未配置 API Key，将使用后端 .env 配置')
  }
  
  if (DEV_MODE) {
    console.log('🔄 DEV_MODE 开启，使用模拟响应')
    // 模拟网络延迟
    await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 500))
    reply = getMockResponse(message)
  } else if (USE_LOCAL_PROXY) {
    // 通过后端代理调用 API（后端会从 .env 或前端配置读取 API Key）
    console.log('📡 调用后端 API 代理...', hasApiKey ? '(前端有配置)' : '(使用后端 .env 配置)')
    // 生产模式：通过后端代理
    const history = memory.getRecentContext(memory.getCurrentMember()?.id, 10)
    reply = await callLLMProxy(message, history)
  } else {
    // 直连模式：前端直接调用 API（仅测试用）
    const messages = buildMessageHistory(message)
    reply = await callLLMDirect(messages)
  }
  
  // 记录 Simo 回复到本地
  memory.addMessage('simo', reply)
  
  return reply
}

/**
 * 语音合成（TTS）
 * 默认使用百度语音（极越 SIMO 同款），降级到浏览器原生
 * 
 * @param {string} text - 要合成的文本
 */
export const speak = async (text) => {
  if (!text) return
  
  // 获取用户配置的 TTS 引擎
  const savedVoiceConfig = localStorage.getItem('simo_voice_config')
  const voiceConfig = savedVoiceConfig ? JSON.parse(savedVoiceConfig) : {}
  const engine = voiceConfig.engine || 'edge'  // 默认 Edge TTS（微软神经语音，更自然）
  
  // 动态获取 API 地址
  const apiBase = getApiBase()
  
  console.log('🔊 语音合成引擎:', engine)
  
  // Edge TTS（云端部署时不可用，直接使用浏览器原生语音）
  if (engine === 'edge') {
    console.log('🔊 使用浏览器原生语音（Edge TTS 云端不可用）')
    return speakWithBrowser(text, voiceConfig)
  }
  
  // 百度语音合成（需要配置 API Key）
  if (engine === 'baidu') {
    try {
      const response = await fetch(`${apiBase}/tts/baidu`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          per: voiceConfig.baiduPer || 4,   // 度丫丫情感女声
          spd: voiceConfig.baiduSpd || 4,   // 语速
          pit: voiceConfig.baiduPit || 6,   // 音调
          vol: voiceConfig.baiduVol || 9    // 音量
        })
      })
      
      if (response.ok) {
        const audioBlob = await response.blob()
        const audioUrl = URL.createObjectURL(audioBlob)
        const audio = new Audio(audioUrl)
        
        return new Promise((resolve) => {
          audio.onended = () => {
            URL.revokeObjectURL(audioUrl)
            resolve()
          }
          audio.onerror = () => {
            console.warn('百度语音播放失败，降级到浏览器原生')
            URL.revokeObjectURL(audioUrl)
            speakWithBrowser(text, voiceConfig).then(resolve)
          }
          audio.play().catch(() => {
            speakWithBrowser(text, voiceConfig).then(resolve)
          })
        })
      } else {
        console.warn('百度语音合成失败，降级到浏览器原生')
      }
    } catch (error) {
      console.warn('百度语音请求失败:', error.message)
    }
  }
  
  // 浏览器原生 TTS（降级方案）
  return speakWithBrowser(text, voiceConfig)
}

/**
 * 浏览器原生语音合成（降级方案）
 */
const speakWithBrowser = async (text, config = {}) => {
  if (!('speechSynthesis' in window)) {
    console.warn('当前浏览器不支持语音合成')
    return
  }
  
  // 停止之前的语音
  speechSynthesis.cancel()
  
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'zh-CN'
  utterance.rate = config.rate || 0.95
  utterance.pitch = config.pitch || 1.05
  utterance.volume = config.volume || 1.0
  
  // 查找中文语音
  const voices = speechSynthesis.getVoices()
  const zhVoice = voices.find(v => v.lang.startsWith('zh'))
  if (zhVoice) {
    utterance.voice = zhVoice
  }
  
  return new Promise((resolve) => {
    utterance.onend = () => resolve()
    utterance.onerror = () => resolve()
    speechSynthesis.speak(utterance)
  })
}

/**
 * 停止语音播放
 */
export const stopSpeak = () => {
  if ('speechSynthesis' in window) {
    speechSynthesis.cancel()
  }
}

/**
 * 语音识别（STT）预留接口
 * @returns {Promise<string>} - 识别的文本
 */
export const listen = () => {
  return new Promise((resolve, reject) => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      reject(new Error('当前浏览器不支持语音识别'))
      return
    }
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    const recognition = new SpeechRecognition()
    
    recognition.lang = 'zh-CN'
    recognition.continuous = false
    recognition.interimResults = false
    
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript
      resolve(transcript)
    }
    
    recognition.onerror = (event) => {
      reject(new Error(`语音识别错误: ${event.error}`))
    }
    
    recognition.start()
  })
}
