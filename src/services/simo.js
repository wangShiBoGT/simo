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
// Cloudflare Worker（主要，更稳定）
const WORKER_API_BASE = 'https://simo-api.wangshibo.workers.dev/api'
// Render 备用
const RENDER_API_BASE = 'https://simo-0s05.onrender.com/api'

// 获取 API 地址
const getApiBase = () => {
  // 本地开发时使用代理
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return '/api'
  }
  
  // 检查用户是否配置了自定义 API 地址
  const savedConfig = localStorage.getItem('simo_api_config')
  if (savedConfig) {
    try {
      const config = JSON.parse(savedConfig)
      if (config.apiBase) {
        return config.apiBase
      }
    } catch (e) {
      console.error('解析 API 配置失败:', e)
    }
  }
  
  // 默认使用 Cloudflare Worker（更稳定）
  // 如果 Worker 未部署，可以改为 RENDER_API_BASE
  return WORKER_API_BASE
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
  // 动态获取 API 地址
  const apiBase = getApiBase()
  
  console.log('📡 调用后端 API...')
  
  // 获取当前成员的记忆上下文（包含用户身份信息）
  const currentMember = memory.getCurrentMember()
  const memberContext = currentMember ? memory.buildMemoryContext(currentMember.id) : ''
  
  const response = await fetch(`${apiBase}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ 
      message,
      history,
      memberId: currentMember?.id,
      memberContext  // 传递记忆上下文给后端
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
 * 优先使用 Edge TTS（微软神经语音，免费、自然、支持情感）
 * 
 * @param {string} text - 要合成的文本
 * @param {string} emotion - 情感风格（可选）
 */
export const speak = async (text, emotion = null) => {
  if (!text) return
  
  // 获取用户配置的 TTS 引擎
  const savedVoiceConfig = localStorage.getItem('simo_voice_config')
  const voiceConfig = savedVoiceConfig ? JSON.parse(savedVoiceConfig) : {}
  const engine = voiceConfig.engine || 'edge'  // 默认 Edge TTS
  
  // 动态获取 API 地址
  const apiBase = getApiBase()
  
  console.log('🔊 语音合成引擎:', engine)
  
  // 根据文本内容自动推断情感（如果未指定）
  const detectedEmotion = emotion || detectEmotion(text)
  
  // Edge TTS（微软神经语音，免费且自然）
  if (engine === 'edge') {
    try {
      console.log('🔊 使用 Edge TTS，情感:', detectedEmotion)
      
      const response = await fetch(`${apiBase}/tts/edge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          voice: voiceConfig.edgeVoice || 'zh-CN-XiaoxiaoNeural',  // 晓晓，最自然的中文女声
          emotion: detectedEmotion,
          rate: voiceConfig.edgeRate || '+0%',
          pitch: voiceConfig.edgePitch || '+0Hz'
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
            console.warn('Edge TTS 播放失败，降级到浏览器原生')
            URL.revokeObjectURL(audioUrl)
            speakWithBrowser(text, voiceConfig).then(resolve)
          }
          audio.play().catch(() => {
            speakWithBrowser(text, voiceConfig).then(resolve)
          })
        })
      } else {
        console.warn('Edge TTS 合成失败，降级到浏览器原生')
      }
    } catch (error) {
      console.warn('Edge TTS 请求失败:', error.message)
    }
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
 * 根据文本内容自动检测情感
 * 返回 Edge TTS 支持的情感标签
 */
const detectEmotion = (text) => {
  // 情感关键词映射
  const emotionPatterns = {
    // 开心/欢快
    cheerful: ['哈哈', '嘿嘿', '太棒了', '太好了', '开心', '高兴', '棒', '赞', '喜欢', '爱', '幸福', '快乐', '欢迎'],
    // 友好/温和
    friendly: ['在呢', '好的', '没问题', '帮你', '当然', '可以', '明白', '知道了', '记住了'],
    // 抱歉/同情
    empathetic: ['抱歉', '对不起', '辛苦', '累', '难过', '不容易', '理解', '明白你'],
    // 平静/认真
    calm: ['让我想想', '考虑一下', '我觉得', '建议', '可能', '也许'],
    // 担忧/关心
    gentle: ['注意', '小心', '别忘了', '记得', '保重', '安全'],
    // 惊喜
    cheerful: ['哇', '真的吗', '太棒了', '真不错'],
    // 默认友好
    default: 'friendly'
  }
  
  // 遍历检测
  for (const [emotion, keywords] of Object.entries(emotionPatterns)) {
    if (emotion === 'default') continue
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        return emotion
      }
    }
  }
  
  // 默认返回友好语气
  return 'friendly'
}

/**
 * 浏览器原生语音合成（云端降级方案，已优化自然度）
 */
const speakWithBrowser = async (text, config = {}) => {
  if (!('speechSynthesis' in window)) {
    console.warn('当前浏览器不支持语音合成')
    return
  }
  
  // 停止之前的语音
  speechSynthesis.cancel()
  
  // 等待语音列表加载（某些浏览器需要）
  let voices = speechSynthesis.getVoices()
  if (voices.length === 0) {
    await new Promise(resolve => {
      speechSynthesis.onvoiceschanged = () => {
        voices = speechSynthesis.getVoices()
        resolve()
      }
      // 超时保护
      setTimeout(resolve, 500)
    })
  }
  
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'zh-CN'
  
  // 优化语音参数，让声音更自然
  utterance.rate = config.rate || 0.9      // 稍慢一点更自然
  utterance.pitch = config.pitch || 1.0    // 正常音调
  utterance.volume = config.volume || 1.0
  
  // 优先选择更自然的中文语音（按优先级排序）
  const preferredVoices = [
    'Microsoft Xiaoxiao Online',      // Edge 晓晓（最自然）
    'Microsoft Yunxi Online',         // Edge 云希
    'Google 普通话（中国大陆）',     // Chrome 中文
    'Tingting',                       // macOS 婷婷
    'Sinji',                          // macOS 
  ]
  
  let selectedVoice = null
  
  // 先尝试优先语音
  for (const preferred of preferredVoices) {
    selectedVoice = voices.find(v => v.name.includes(preferred))
    if (selectedVoice) break
  }
  
  // 如果没找到优先语音，选择任意中文语音
  if (!selectedVoice) {
    selectedVoice = voices.find(v => v.lang.startsWith('zh-CN')) ||
                    voices.find(v => v.lang.startsWith('zh'))
  }
  
  if (selectedVoice) {
    utterance.voice = selectedVoice
    console.log('🔊 使用浏览器语音:', selectedVoice.name)
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
