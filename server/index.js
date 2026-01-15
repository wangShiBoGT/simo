/**
 * Simo 轻量后端服务
 * 职责：转发请求到大模型 API，拼接 System Prompt
 * 
 * 支持的大模型：
 * - DeepSeek（推荐，国内直连，便宜）
 * - 通义千问（阿里云）
 * - Moonshot/Kimi（超长上下文）
 * - 智谱 GLM-4
 * - OpenAI / Claude（需科学上网）
 */

import 'dotenv/config'
import http from 'http'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const PORT = 3001

// ============ 大模型 API 配置 ============
// 在这里配置你的 API Key（或使用环境变量）

const LLM_CONFIGS = {
  // DeepSeek
  deepseek: {
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    apiKey: process.env.DEEPSEEK_API_KEY || ''
  },
  
  // 通义千问（推荐，免费额度多）
  qwen: {
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-turbo',  // qwen-turbo 免费额度更多
    apiKey: process.env.QWEN_API_KEY || ''
  },
  
  // 智谱 GLM-4（新用户 500 万 tokens）
  zhipu: {
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-flash',  // flash 版本免费
    apiKey: process.env.ZHIPU_API_KEY || ''
  },
  
  // Moonshot/Kimi（超长上下文）
  moonshot: {
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-8k',
    apiKey: process.env.MOONSHOT_API_KEY || ''
  },
  
  // 百度文心一言（需要特殊处理，API 格式不同）
  ernie: {
    baseUrl: 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat',
    model: 'ernie-speed-128k',  // 免费模型
    apiKey: process.env.ERNIE_API_KEY || '',
    secretKey: process.env.ERNIE_SECRET_KEY || ''
  },
  
  // OpenAI（需科学上网）
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    apiKey: process.env.OPENAI_API_KEY || ''
  }
}

// 当前使用的模型（修改这里切换模型）
const CURRENT_LLM = 'zhipu'  // 智谱 glm-4-flash 完全免费

// Simo 系统 Prompt（手感优化版）
const SIMO_SYSTEM_PROMPT = `你叫 Simo。

你是一个长期存在于中国普通家庭中的家用 AI 机器人。

### 核心原则（极其重要）
1. **短回应优先**：能一句话说完，绝不三句。家庭 AI ≠ 论文助手。
2. **低存在感**：不主动插话，不频繁总结，只在被叫时"在呢"。
3. **敢说不知道**：不确定的事情直接说"这个我不太确定"。

### 唤醒回应
"Hi Simo" → "在呢。"（只说这两个字）

### 说话风格
- 自然口语，像家里的存在
- 不说"作为一个 AI"
- 不说教、不抢话
- 回复简短有温度
- 能用一个字回答就不用两个字

### 回复长度指南
- 简单问题：1-2句话
- 复杂问题：最多3-4句话
- 绝对不要超过5句话

### 家庭成员适配
- 大人：简洁直接
- 小朋友：耐心但简短
- 长辈：尊重、简洁

### 能力边界
做不到就说"这个我做不了"，不要绕弯子。

### 记忆使用规则（重要）
- 标记为 [确定] 的记忆：直接说"我记得你..."
- 标记为 [不确定] 的记忆：要确认"我印象里你可能...对吗？"
- 用户说"不对/记错了/改一下"：回复"好，我改一下。"
- 敢承认不确定："这个我不太确定，要不要我记下来？"`

/**
 * 解析请求体
 */
const parseBody = (req) => {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', chunk => body += chunk)
    req.on('end', () => {
      try {
        resolve(JSON.parse(body))
      } catch (e) {
        reject(e)
      }
    })
    req.on('error', reject)
  })
}

/**
 * 调用大模型 API
 * @param {string} message - 用户消息
 * @param {Array} history - 对话历史
 * @param {string} memberContext - 成员上下文
 * @param {string} frontendProvider - 前端指定的提供商
 * @param {string} frontendApiKey - 前端传入的 API Key
 */
const callLLM = async (message, history = [], memberContext = '', frontendProvider = '', frontendApiKey = '') => {
  // 使用前端指定的模型，如果没有则使用默认模型
  const provider = frontendProvider || CURRENT_LLM
  const config = { ...LLM_CONFIGS[provider] }
  
  // 如果前端传了 apiKey，覆盖配置
  if (frontendApiKey && frontendApiKey.trim()) {
    config.apiKey = frontendApiKey
  }
  
  console.log(`📡 使用 ${provider} 模型...`)
  
  // 如果没有配置 API Key，使用模拟响应
  if (!config || !config.apiKey) {
    console.log('⚠️ 未配置 API Key，使用模拟响应')
    return getMockResponse(message)
  }
  
  // 构建消息列表
  let systemPrompt = SIMO_SYSTEM_PROMPT
  if (memberContext) {
    systemPrompt += `\n\n### 当前对话上下文\n${memberContext}`
  }
  
  const messages = [
    { role: 'system', content: systemPrompt }
  ]
  
  // 添加历史对话
  if (history && history.length > 0) {
    history.forEach(msg => {
      messages.push({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content
      })
    })
  }
  
  // 添加当前消息
  messages.push({ role: 'user', content: message })
  
  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: 0.7,
        max_tokens: 500
      })
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('API 错误:', errorData)
      throw new Error(errorData.error?.message || `API 请求失败: ${response.status}`)
    }
    
    const data = await response.json()
    return data.choices[0].message.content
    
  } catch (error) {
    console.error('调用大模型失败:', error.message)
    // 降级到模拟响应
    return getMockResponse(message)
  }
}

/**
 * 模拟响应（开发/降级用）
 */
const getMockResponse = (message) => {
  const lowerMsg = message.toLowerCase()
  
  if (lowerMsg.includes('hi') && lowerMsg.includes('simo')) {
    return '在呢。'
  }
  
  if (lowerMsg.includes('你好') || lowerMsg.includes('在吗')) {
    return '在呢，有什么事？'
  }
  
  if (lowerMsg.includes('天气')) {
    return '这个我现在还看不了，你可以看看窗外，或者我帮你查一下？'
  }
  
  if (lowerMsg.includes('你是谁')) {
    return '我是 Simo，一直在这儿。'
  }
  
  if (lowerMsg.includes('你能做什么') || lowerMsg.includes('你会什么')) {
    return '陪你聊聊天，帮你想想事情，提醒你一些东西。慢慢来，不着急。'
  }
  
  return '嗯，我听到了。'
}

/**
 * 处理 CORS
 */
const setCORSHeaders = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

/**
 * 路由处理
 */
const handleRequest = async (req, res) => {
  setCORSHeaders(res)
  
  // 预检请求
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }
  
  const url = new URL(req.url, `http://localhost:${PORT}`)
  
  // 健康检查
  if (url.pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', name: 'Simo Server' }))
    return
  }
  
  // 对话接口
  if (url.pathname === '/api/chat' && req.method === 'POST') {
    try {
      const { message, history, provider, apiKey } = await parseBody(req)
      
      if (!message) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: '缺少 message 参数' }))
        return
      }
      
      // 如果前端传了 API Key，使用前端的配置
      const reply = await callLLM(message, history, '', provider, apiKey)
      
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ reply }))
      
    } catch (error) {
      console.error('处理请求失败:', error)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: '服务器内部错误' }))
    }
    return
  }
  
  // 获取 System Prompt（调试用）
  if (url.pathname === '/api/prompt') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ prompt: SIMO_SYSTEM_PROMPT }))
    return
  }
  
  // API 连接测试
  if (url.pathname === '/api/test' && req.method === 'POST') {
    try {
      const { provider, apiKey } = await parseBody(req)
      
      if (!apiKey) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: '缺少 API Key' }))
        return
      }
      
      // 临时使用传入的配置测试
      const testConfig = LLM_CONFIGS[provider] || LLM_CONFIGS.deepseek
      
      const testResponse = await fetch(`${testConfig.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: testConfig.model,
          messages: [
            { role: 'user', content: '你好' }
          ],
          max_tokens: 10
        })
      })
      
      if (testResponse.ok) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: true, message: '连接成功' }))
      } else {
        const errorData = await testResponse.json().catch(() => ({}))
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ 
          success: false, 
          error: errorData.error?.message || '连接失败' 
        }))
      }
    } catch (error) {
      console.error('测试连接失败:', error)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: false, error: error.message }))
    }
    return
  }
  
  // 百度语音合成 API
  if (url.pathname === '/api/tts/baidu' && req.method === 'POST') {
    try {
      const { text, per, spd, pit, vol, apiKey, secretKey } = await parseBody(req)
      
      if (!text) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: '缺少 text 参数' }))
        return
      }
      
      // 使用传入的 key 或环境变量
      const baiduApiKey = apiKey || process.env.BAIDU_TTS_API_KEY
      const baiduSecretKey = secretKey || process.env.BAIDU_TTS_SECRET_KEY
      
      if (!baiduApiKey || !baiduSecretKey) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ 
          error: '未配置百度语音 API Key',
          hint: '请在设置中配置百度语音合成 API Key 和 Secret Key',
          registerUrl: 'https://ai.baidu.com/tech/speech/tts'
        }))
        return
      }
      
      // 1. 获取 access_token
      const tokenUrl = `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${baiduApiKey}&client_secret=${baiduSecretKey}`
      const tokenResponse = await fetch(tokenUrl, { method: 'POST' })
      const tokenData = await tokenResponse.json()
      
      if (!tokenData.access_token) {
        res.writeHead(401, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: '获取百度 access_token 失败', detail: tokenData }))
        return
      }
      
      // 2. 调用语音合成 API
      const ttsUrl = 'https://tsn.baidu.com/text2audio'
      const params = new URLSearchParams({
        tex: encodeURIComponent(text),
        tok: tokenData.access_token,
        cuid: 'simo_robot',
        ctp: '1',
        lan: 'zh',
        // 优化参数让语音更有感情
        per: per || '4',      // 发音人：4-度丫丫情感女声（最有感情）
        spd: spd || '4',      // 语速：4 稍慢一点更自然
        pit: pit || '6',      // 音调：6 稍高一点更活泼
        vol: vol || '9',      // 音量：9 清晰响亮
        aue: '6'              // 返回 wav 格式（音质更好）
      })
      
      const ttsResponse = await fetch(ttsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
      })
      
      const contentType = ttsResponse.headers.get('content-type')
      
      // 如果返回的是音频
      if (contentType && contentType.includes('audio')) {
        const audioBuffer = await ttsResponse.arrayBuffer()
        res.writeHead(200, { 
          'Content-Type': 'audio/wav',
          'Content-Length': audioBuffer.byteLength
        })
        res.end(Buffer.from(audioBuffer))
      } else {
        // 返回的是错误信息
        const errorData = await ttsResponse.json()
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: '百度语音合成失败', detail: errorData }))
      }
      
    } catch (error) {
      console.error('百度 TTS 错误:', error)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: error.message }))
    }
    return
  }
  
  // Edge TTS 语音合成（免费微软神经语音，非常自然）
  // 注意：edge-tts npm 包在某些环境下不兼容，这里返回提示使用浏览器原生语音
  if (url.pathname === '/api/tts/edge' && req.method === 'POST') {
    // 由于 edge-tts 包在 Render 等云环境不兼容 TypeScript
    // 暂时禁用服务端 Edge TTS，让前端使用浏览器原生语音
    res.writeHead(503, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ 
      error: 'Edge TTS 服务暂不可用',
      hint: '请使用浏览器原生语音',
      reason: '云环境不支持 edge-tts 包'
    }))
    return
  }
  
  // ============ 硬件接口预埋（L1 → L3 演进准备） ============
  
  // 显示控制接口（L1 核心）
  // 用途：控制外接屏幕显示状态、表情、动画等
  if (url.pathname === '/api/hardware/display' && req.method === 'POST') {
    try {
      const { action, data } = await parseBody(req)
      console.log('📺 显示控制:', action, data)
      
      // 预留动作：
      // - setState: 设置显示状态（idle/listening/thinking/speaking）
      // - showExpression: 显示表情
      // - showText: 显示文字
      // - setBrightness: 调节亮度
      // - sleep/wake: 休眠/唤醒
      
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ 
        success: true, 
        message: '显示控制接口已预留',
        action,
        timestamp: new Date().toISOString()
      }))
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: error.message }))
    }
    return
  }
  
  // 音频控制接口（L1）
  // 用途：控制外接音箱、麦克风阵列等
  if (url.pathname === '/api/hardware/audio' && req.method === 'POST') {
    try {
      const { action, data } = await parseBody(req)
      console.log('🔊 音频控制:', action, data)
      
      // 预留动作：
      // - setVolume: 设置音量
      // - mute/unmute: 静音/取消静音
      // - setMicGain: 设置麦克风增益
      // - playSound: 播放提示音
      // - getAudioDevices: 获取音频设备列表
      
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ 
        success: true, 
        message: '音频控制接口已预留',
        action,
        timestamp: new Date().toISOString()
      }))
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: error.message }))
    }
    return
  }
  
  // 视觉输入接口（L2 预留）
  // 用途：摄像头、人脸识别、手势识别等
  if (url.pathname === '/api/hardware/vision' && req.method === 'POST') {
    try {
      const { action, data } = await parseBody(req)
      console.log('👁️ 视觉输入:', action, data)
      
      // 预留动作：
      // - detectFace: 人脸检测
      // - recognizeMember: 识别家庭成员
      // - detectGesture: 手势识别
      // - captureImage: 拍照
      // - startStream/stopStream: 开始/停止视频流
      
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ 
        success: true, 
        message: '视觉输入接口已预留（L2）',
        action,
        timestamp: new Date().toISOString()
      }))
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: error.message }))
    }
    return
  }
  
  // 运动控制接口（L2/L3 预留）
  // 用途：底盘移动、机械臂、云台等
  if (url.pathname === '/api/hardware/motion' && req.method === 'POST') {
    try {
      const { action, data } = await parseBody(req)
      console.log('🦿 运动控制:', action, data)
      
      // 预留动作：
      // - move: 移动（方向、速度、距离）
      // - rotate: 旋转
      // - stop: 停止
      // - goTo: 前往指定位置（需要地图）
      // - follow: 跟随模式
      // - getPosition: 获取当前位置
      // - getBattery: 获取电池状态
      
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ 
        success: true, 
        message: '运动控制接口已预留（L2/L3）',
        action,
        timestamp: new Date().toISOString()
      }))
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: error.message }))
    }
    return
  }
  
  // 传感器接口（L2/L3 预留）
  // 用途：温湿度、光线、距离、触摸等
  if (url.pathname === '/api/hardware/sensors' && req.method === 'GET') {
    console.log('📡 传感器查询')
    
    // 预留数据：
    // - temperature: 温度
    // - humidity: 湿度
    // - light: 光线强度
    // - distance: 距离（超声波/红外）
    // - touch: 触摸状态
    // - battery: 电池电量
    
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ 
      success: true,
      message: '传感器接口已预留（L2/L3）',
      sensors: {
        temperature: null,
        humidity: null,
        light: null,
        distance: null,
        touch: null,
        battery: null
      },
      timestamp: new Date().toISOString()
    }))
    return
  }
  
  // 硬件状态查询接口
  if (url.pathname === '/api/hardware/status' && req.method === 'GET') {
    console.log('🔧 硬件状态查询')
    
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      success: true,
      hardware: {
        display: { connected: false, type: null },
        audio: { connected: true, type: 'browser' },
        vision: { connected: false, type: null },
        motion: { connected: false, type: null },
        sensors: { connected: false, type: null }
      },
      level: 'L0',  // 当前硬件等级
      timestamp: new Date().toISOString()
    }))
    return
  }
  
  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Not Found' }))
}

// 启动服务器
const server = http.createServer(handleRequest)

server.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════════════╗
  ║                                               ║
  ║   🤖 Simo Server 已启动                       ║
  ║   端口: ${PORT}                                  ║
  ║   硬件等级: L0（纯软件）                      ║
  ║                                               ║
  ║   核心接口:                                   ║
  ║   - POST /api/chat         对话              ║
  ║   - POST /api/tts/edge     语音合成          ║
  ║   - POST /api/tts/baidu    百度语音          ║
  ║                                               ║
  ║   硬件接口（已预埋）:                         ║
  ║   - POST /api/hardware/display   显示控制    ║
  ║   - POST /api/hardware/audio     音频控制    ║
  ║   - POST /api/hardware/vision    视觉输入    ║
  ║   - POST /api/hardware/motion    运动控制    ║
  ║   - GET  /api/hardware/sensors   传感器      ║
  ║   - GET  /api/hardware/status    硬件状态    ║
  ║                                               ║
  ╚═══════════════════════════════════════════════╝
  `)
})
