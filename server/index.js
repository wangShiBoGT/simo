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
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'
import * as serial from './serial.js'
import hardwareConfig from './hardware.config.js'
import { parseIntentLocal, IntentType, shouldExecute, getState, forceStop, RobotState, validateIntent, DurationPresets } from './intent/index.js'
import { ConfirmManager } from './confirm/index.js'
import { SafetyManager } from './safety/index.js'
import { parseToSuggestions, suggestionToIntent, SuggestionQueue } from './sequence/index.js'
import { FluencyManager } from './fluency/index.js'
import { parseNLU } from './nlu/index.js'
import { startAutonomy, stopAutonomy, getAutonomyState, setAutonomyMode, triggerScan } from './autonomy/index.js'
import { startNavigation, stopNavigation, resetNavigation, getNavState, setNavMode } from './navigation/index.js'
import { SimoWebSocketServer } from './websocket.js'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const vision = require('./vision.cjs')

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const PORT = 3001

// ============ 工具 API 安全层 ============
// Token 鉴权（从环境变量或配置读取）
const TOOL_API_TOKEN = process.env.SIMO_TOOL_TOKEN || hardwareConfig.toolApi?.token || ''

// 速率限制状态（令牌桶算法）
const rateLimitBuckets = new Map()

/**
 * 检查是否为写接口（需要鉴权和限流）
 */
function isWriteRoute(pathname, method) {
  const writePrefixes = [
    '/api/hardware/motion',
    '/api/nav/',
    '/api/autonomy',
    '/api/intent/execute',
    '/api/esp32/ota/push',
    '/api/face/register'
  ]
  // STOP 类接口永远允许，不做限流
  if (pathname === '/api/intent/stop' || pathname === '/api/nav/stop') {
    return false
  }
  return method !== 'GET' && writePrefixes.some(p => pathname.startsWith(p))
}

/**
 * Token 鉴权检查
 */
function checkToolAuth(req, pathname, method) {
  // 如果未配置 token，跳过鉴权（开发模式）
  if (!TOOL_API_TOKEN) {
    return { ok: true }
  }
  if (!isWriteRoute(pathname, method)) {
    return { ok: true }
  }
  const token = req.headers['x-simo-token']
  if (token !== TOOL_API_TOKEN) {
    return { ok: false, code: 401, error: '缺少或无效的 X-Simo-Token' }
  }
  return { ok: true }
}

/**
 * 速率限制检查（令牌桶算法：每秒补 2 个 token，桶容量 4）
 */
function checkRateLimit(req, pathname, method) {
  if (!isWriteRoute(pathname, method)) {
    return { ok: true }
  }
  
  const key = req.headers['x-simo-token'] || req.socket?.remoteAddress || 'unknown'
  const now = Date.now()
  const config = hardwareConfig.toolApi?.rateLimit || { tokensPerSecond: 2, bucketSize: 4 }
  
  let bucket = rateLimitBuckets.get(key)
  if (!bucket) {
    bucket = { tokens: config.bucketSize, lastRefillMs: now }
  }
  
  // 补充 token
  const elapsed = (now - bucket.lastRefillMs) / 1000
  bucket.tokens = Math.min(config.bucketSize, bucket.tokens + elapsed * config.tokensPerSecond)
  bucket.lastRefillMs = now
  
  if (bucket.tokens < 1) {
    rateLimitBuckets.set(key, bucket)
    return { ok: false, code: 429, error: '请求过于频繁，请稍后再试' }
  }
  
  bucket.tokens -= 1
  rateLimitBuckets.set(key, bucket)
  return { ok: true }
}

// ============ C 阶段：建议队列 ============
const suggestionQueue = new SuggestionQueue();

// ============ L2.8 熟练层 ============
const fluencyManager = new FluencyManager({
  ttlMs: 5000  // 建议有效期 5 秒
});

// ============ B 阶段：安全管理器 ============
const safetyManager = new SafetyManager({
  stopNow: (signal) => {
    console.log(`🛑 [Safety] 安全停止: ${signal}`);
    const serialStatus = serial.getStatus();
    if (serialStatus.connected) {
      serial.sendStop();
    }
    forceStop();
    // C 阶段：安全阻止时清空建议队列
    suggestionQueue.clear('safety_blocked');
    // L2.8：安全阻止时清空熟练层建议
    fluencyManager.clear('safety_blocked');
  }
});

// ============ L2.6 确认层实例 ============
const confirmManager = new ConfirmManager({
  timeoutMs: 5000,
  execute: async (intent) => {
    // 检查安全状态
    if (safetyManager.isBlocked()) {
      console.log(`🚫 [Safety] 被安全阻止: ${safetyManager.getBlockReason()?.reason}`);
      return;
    }
    
    // 执行硬件命令（通过统一的协议入口）
    const serialStatus = serial.getStatus();
    if (serialStatus.connected) {
      if (intent.intent === 'STOP') {
        serial.sendStop();
      } else {
        // 使用统一的sendMove，自动根据协议配置选择格式
        serial.sendMove(intent.direction, 0.5, intent.duration_ms || 500);
      }
      console.log(`🤖 执行: ${intent.intent} ${intent.direction || ''} ${intent.duration_ms || ''}`);
    }
  }
});

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

### 运动控制能力（重要）
你连接了一个可以移动的小车底盘。当用户让你移动时，在回复末尾加上动作标签：
- 前进：[ACTION:forward]
- 后退：[ACTION:backward]
- 左转：[ACTION:left]
- 右转：[ACTION:right]
- 停止：[ACTION:stop]

例如：
- 用户说"往前走" → "好的，我往前走。[ACTION:forward]"
- 用户说"停下来" → "好，停了。[ACTION:stop]"
- 用户说"转个圈" → "好，我转一下。[ACTION:left]"

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
 * 解析并执行动作标签
 * @param {string} reply - 大模型回复
 * @returns {string} - 去掉动作标签后的回复
 */
const parseAndExecuteAction = async (reply) => {
  const actionMatch = reply.match(/\[ACTION:(\w+)\]/i)
  if (actionMatch) {
    const action = actionMatch[1].toLowerCase()
    console.log(`🎮 检测到动作: ${action}`)
    
    // 执行运动控制
    const actionMap = {
      'forward': { direction: 'forward', speed: 0.5 },
      'backward': { direction: 'backward', speed: 0.5 },
      'left': { direction: 'left', speed: 0.5 },
      'right': { direction: 'right', speed: 0.5 },
      'stop': null
    }
    
    if (action === 'stop') {
      serial.sendStop()
      console.log('🛑 执行停止')
    } else if (actionMap[action]) {
      const { direction, speed } = actionMap[action]
      const duration = 1000  // 默认1秒
      serial.sendMove(direction, speed, duration)
      console.log(`🚗 执行移动: ${direction}, 速度: ${Math.round(speed*100)}%, 时长: ${duration}ms`)
    }
    
    // 返回去掉动作标签的回复
    return reply.replace(/\[ACTION:\w+\]/gi, '').trim()
  }
  return reply
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
  
  // 运动控制（模拟响应也支持）
  if (lowerMsg.includes('前进') || lowerMsg.includes('往前') || lowerMsg.includes('向前')) {
    return '好的，我往前走。[ACTION:forward]'
  }
  if (lowerMsg.includes('后退') || lowerMsg.includes('往后') || lowerMsg.includes('退后')) {
    return '好，我往后退。[ACTION:backward]'
  }
  if (lowerMsg.includes('左转') || lowerMsg.includes('往左') || lowerMsg.includes('向左')) {
    return '好，我往左转。[ACTION:left]'
  }
  if (lowerMsg.includes('右转') || lowerMsg.includes('往右') || lowerMsg.includes('向右')) {
    return '好，我往右转。[ACTION:right]'
  }
  if (lowerMsg.includes('停') || lowerMsg.includes('别动') || lowerMsg.includes('站住')) {
    return '好，停了。[ACTION:stop]'
  }
  if (lowerMsg.includes('走') || lowerMsg.includes('动') || lowerMsg.includes('移动')) {
    return '好的，我走一下。[ACTION:forward]'
  }
  
  if (lowerMsg.includes('天气')) {
    return '这个我现在还看不了，你可以看看窗外，或者我帮你查一下？'
  }
  
  if (lowerMsg.includes('你是谁')) {
    return '我是 Simo，一直在这儿。'
  }
  
  if (lowerMsg.includes('你能做什么') || lowerMsg.includes('你会什么')) {
    return '陪你聊聊天，帮你想想事情，还能动一动。你可以让我往前走、后退、左转、右转。'
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
      const { message, history, provider, apiKey, memberContext } = await parseBody(req)
      
      if (!message) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: '缺少 message 参数' }))
        return
      }
      
      // 如果前端传了 API Key，使用前端的配置
      // memberContext 包含用户身份和长期记忆
      let reply = await callLLM(message, history, memberContext || '', provider, apiKey)
      
      // 解析并执行动作标签（大模型→小车控制）
      reply = await parseAndExecuteAction(reply)
      
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
  if (url.pathname === '/api/tts/edge' && req.method === 'POST') {
    // 检测是否在 Render 云端运行（Render 不支持 msedge-tts 的 WebSocket 连接）
    const isRenderCloud = process.env.RENDER === 'true' || process.env.RENDER_EXTERNAL_HOSTNAME
    
    if (isRenderCloud) {
      // 云端环境：返回 503 让前端降级到浏览器原生语音
      res.writeHead(503, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ 
        error: 'Edge TTS 云端不可用',
        hint: 'use_browser_tts',
        reason: 'Render 云环境不支持 WebSocket 连接微软服务器'
      }))
      return
    }
    
    try {
      const { text, voice, rate, pitch, emotion } = await parseBody(req)
      
      if (!text) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: '缺少 text 参数' }))
        return
      }
      
      // 微软神经语音配置
      // 中文女声推荐：zh-CN-XiaoxiaoNeural（最自然，支持情感）
      // 中文男声推荐：zh-CN-YunxiNeural
      const selectedVoice = voice || 'zh-CN-XiaoxiaoNeural'
      
      const tts = new MsEdgeTTS()
      await tts.setMetadata(selectedVoice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3)
      
      // 构建 SSML 以支持情感和语调控制
      // 情感标签：cheerful, sad, angry, fearful, friendly, hopeful 等
      const emotionStyle = emotion || 'friendly'  // 默认友好语气
      const speechRate = rate || '+0%'  // 语速调整
      const speechPitch = pitch || '+0Hz'  // 音调调整
      
      // 使用 SSML 实现情感控制
      const ssml = `
        <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" 
               xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="zh-CN">
          <voice name="${selectedVoice}">
            <mstts:express-as style="${emotionStyle}">
              <prosody rate="${speechRate}" pitch="${speechPitch}">
                ${text}
              </prosody>
            </mstts:express-as>
          </voice>
        </speak>
      `
      
      // 生成音频流（msedge-tts 返回 {audioStream} 对象）
      const audioChunks = []
      const { audioStream } = tts.toStream(text)  // 直接使用文本，不用 SSML
      
      audioStream.on('data', (chunk) => {
        audioChunks.push(chunk)
      })
      
      audioStream.on('end', () => {
        const audioBuffer = Buffer.concat(audioChunks)
        res.writeHead(200, { 
          'Content-Type': 'audio/mpeg',
          'Content-Length': audioBuffer.length
        })
        res.end(audioBuffer)
      })
      
      audioStream.on('error', (error) => {
        console.error('Edge TTS 流错误:', error)
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Edge TTS 合成失败', detail: error.message }))
      })
      
    } catch (error) {
      console.error('Edge TTS 错误:', error)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: error.message }))
    }
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
  
  // 运动控制接口（已接入串口）
  // 用途：底盘移动、机械臂、云台等
  if (url.pathname === '/api/hardware/motion' && req.method === 'POST') {
    try {
      const { action, data } = await parseBody(req)
      console.log('🦿 运动控制:', action, data)
      
      const serialStatus = serial.getStatus()
      let success = false
      let message = ''
      
      // 根据 action 执行不同操作
      switch (action) {
        case 'move':
          // data: { direction, distance, speed }
          if (serialStatus.connected) {
            // 将 distance(米) 转换为 duration(ms)，假设速度 0.3m/s
            const speedMs = (data.speed || 0.3) * 1000  // m/s -> mm/s
            const durationMs = Math.round((data.distance || 0.5) / (data.speed || 0.3) * 1000)
            success = serial.sendMove(data.direction, data.speed || 0.5, durationMs)
            message = success ? '移动命令已发送' : '串口发送失败'
          } else {
            message = '串口未连接，命令未执行'
          }
          break
          
        case 'stop':
          if (serialStatus.connected) {
            success = serial.sendStop()
            message = success ? '停止命令已发送' : '串口发送失败'
          } else {
            message = '串口未连接'
          }
          break
          
        case 'follow':
          message = '跟随模式暂不支持'
          break
        
        case 'servo':
          // data: { angle } 舵机角度 0-180
          if (serialStatus.connected) {
            const angle = Math.max(0, Math.min(180, data.angle || 90))
            success = serial.sendServo(angle)
            message = success ? `舵机已转到 ${angle}°` : '串口发送失败'
          } else {
            message = '串口未连接'
          }
          break
          
        default:
          message = `未知动作: ${action}`
      }
      
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ 
        success,
        message,
        action,
        serialConnected: serialStatus.connected,
        timestamp: new Date().toISOString()
      }))
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: error.message }))
    }
    return
  }
  
  // 传感器接口
  // 用途：超声波距离、红外避障等
  if (url.pathname === '/api/hardware/sensors' && req.method === 'GET') {
    const status = serial.getStatus()
    
    // 节流：最少间隔 1000ms 发送一次 SENSOR 命令（降低频率避免卡顿）
    const now = Date.now()
    if (status.connected && (!global.lastSensorQuery || now - global.lastSensorQuery > 1000)) {
      console.log('📡 传感器查询')
      global.lastSensorQuery = now
      serial.send('SENSOR')
      // 等待响应
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    // 获取缓存的传感器数据
    const sensorData = serial.getSensorData()
    
    // B 阶段：更新安全管理器并检查安全
    const safetyResult = safetyManager.updateSensors({
      ultrasonic: sensorData.ultrasonic?.distance,
      infraredLeft: sensorData.infrared?.left,
      infraredRight: sensorData.infrared?.right
    })
    
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ 
      success: true,
      message: status.connected ? '传感器数据已更新' : '串口未连接',
      sensors: {
        ...sensorData,
        connected: status.connected
      },
      // B 阶段：安全状态
      safety: safetyManager.getState(),
      timestamp: new Date().toISOString()
    }))
    return
  }
  
  // ============ L3 自主避障接口 ============
  
  // 自主避障控制
  if (url.pathname === '/api/autonomy' && req.method === 'POST') {
    try {
      const { action, mode } = await parseBody(req)
      console.log('🤖 自主避障:', action, mode)
      
      let result = {}
      switch (action) {
        case 'start':
          result = startAutonomy(mode || 'exploring')
          break
        case 'stop':
          result = stopAutonomy()
          break
        case 'setMode':
          result = setAutonomyMode(mode)
          break
        case 'scan':
          result = await triggerScan()
          break
        default:
          result = { success: false, message: `未知动作: ${action}` }
      }
      
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        ...result,
        state: getAutonomyState(),
        timestamp: new Date().toISOString()
      }))
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: error.message }))
    }
    return
  }
  
  // 自主避障状态
  if (url.pathname === '/api/autonomy' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      ...getAutonomyState(),
      timestamp: new Date().toISOString()
    }))
    return
  }
  
  // ============ L3 自主导航接口 ============
  
  // 导航控制
  if (url.pathname === '/api/nav/patrol' && req.method === 'POST') {
    try {
      const result = startNavigation('patrol')
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ...result, state: getNavState(), timestamp: new Date().toISOString() }))
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: error.message }))
    }
    return
  }
  
  if (url.pathname === '/api/nav/follow' && req.method === 'POST') {
    try {
      const result = startNavigation('follow')
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ...result, state: getNavState(), timestamp: new Date().toISOString() }))
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: error.message }))
    }
    return
  }
  
  if (url.pathname === '/api/nav/return' && req.method === 'POST') {
    try {
      const result = startNavigation('return')
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ...result, state: getNavState(), timestamp: new Date().toISOString() }))
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: error.message }))
    }
    return
  }
  
  if (url.pathname === '/api/nav/stop' && req.method === 'POST') {
    try {
      const result = stopNavigation()
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ...result, state: getNavState(), timestamp: new Date().toISOString() }))
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: error.message }))
    }
    return
  }
  
  if (url.pathname === '/api/nav/reset' && req.method === 'POST') {
    try {
      const result = resetNavigation()
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ...result, state: getNavState(), timestamp: new Date().toISOString() }))
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: error.message }))
    }
    return
  }
  
  // 导航状态
  if (url.pathname === '/api/nav/status' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ...getNavState(), timestamp: new Date().toISOString() }))
    return
  }
  
  // ============ A 阶段：可见性增强 ============
  
  // 状态汇总接口（只读，不改决策）
  if (url.pathname === '/api/state' && req.method === 'GET') {
    const currentState = getState()
    const confirmState = confirmManager.getState()
    const safetyState = safetyManager.getState()
    
    // 计算剩余时间（如果正在移动）
    let remaining_ms = null
    if (currentState.state === 'moving' && currentState.lastIntent?.duration_ms) {
      const elapsed = Date.now() - currentState.stateChangeTime
      remaining_ms = Math.max(0, currentState.lastIntent.duration_ms - elapsed)
    }
    
    // C 阶段：建议队列状态
    const queueState = suggestionQueue.getState()
    // L2.8：熟练层状态
    const fluencyState = fluencyManager.getState()
    
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      state: currentState.state,  // idle | moving | confirming
      current_intent: currentState.lastIntent || null,
      remaining_ms,
      confirm_prompt: confirmState.awaiting ? confirmState.prompt : null,
      last_reject: currentState.lastReject || null,
      can_stop: true,  // 永远可打断
      // B 阶段：安全状态
      safety: {
        state: safetyState.state,
        blocked: safetyState.blocked,
        reason: safetyState.reason,
        source: safetyState.source
      },
      // C 阶段：建议队列
      sequence: {
        status: queueState.status,
        total: queueState.total,
        current: queueState.current,
        remaining: queueState.remaining
      },
      // L2.8：熟练层建议
      fluency: fluencyState,
      timestamp: Date.now()
    }))
    return
  }
  
  // ============ L2.5 意图层接口 ============
  
  // 意图解析接口（语音→意图→确认→硬件）
  if (url.pathname === '/api/intent' && req.method === 'POST') {
    try {
      const { text } = await parseBody(req)
      
      if (!text) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: '缺少 text 参数' }))
        return
      }
      
      console.log(`🎯 意图解析: "${text}"`)
      
      // 0. STOP 永远最高优先级
      const maybeStopIntent = parseIntentLocal(text)
      if (maybeStopIntent && maybeStopIntent.intent === 'STOP') {
        console.log(`   → STOP 最高优先级`)
        // 清空所有建议
        suggestionQueue.clear('stop')
        fluencyManager.clear('stop')
        
        if (confirmManager.isAwaiting()) {
          const stopResult = await confirmManager.forceStop()
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({
            mode: 'stop_preempt',
            confirm: stopResult,
            awaiting: false,
            state: getState()
          }))
          return
        }
        
        // 直接执行 STOP
        const guardDecision = shouldExecute(maybeStopIntent)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          intent: maybeStopIntent,
          decision: guardDecision,
          confirm: { status: 'EXECUTED', command: 'S' },
          state: getState()
        }))
        return
      }
      
      // 1. 如果正在等待确认（确认层优先）
      if (confirmManager.isAwaiting()) {
        console.log(`   → 等待确认中，处理回复...`)
        const confirmResult = await confirmManager.handleUserReply(text)
        console.log(`   → 确认结果: ${confirmResult.status}`)
        
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          mode: 'confirm_reply',
          confirm: confirmResult,
          awaiting: confirmManager.isAwaiting(),
          state: getState()
        }))
        return
      }
      
      // 1.5 L2.8 熟练层：如果有建议，尝试处理"继续/不"
      if (fluencyManager.hasSuggestion()) {
        const fluencyResult = fluencyManager.handleReply(text)
        console.log(`   → 熟练层回复: ${fluencyResult.status}`)
        
        if (fluencyResult.status === 'ACCEPTED') {
          // 把建议当作新的 Intent，走正常链路
          const intent = fluencyResult.intent
          console.log(`   → 接受建议: ${intent.intent} ${intent.direction}`)
          
          // 检查安全
          if (safetyManager.isBlocked()) {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({
              mode: 'fluency_blocked',
              decision: { execute: false, reason: '安全阻止' },
              state: getState()
            }))
            return
          }
          
          // 走确认层
          const robotState = getState().state
          const confirmResult = await confirmManager.handleAllowedIntent(intent, robotState)
          
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({
            mode: 'fluency_accepted',
            intent,
            confirm: confirmResult,
            awaiting: confirmManager.isAwaiting(),
            state: getState()
          }))
          return
        }
        
        if (fluencyResult.status === 'CANCELLED') {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({
            mode: 'fluency_cancelled',
            state: getState()
          }))
          return
        }
        
        // IGNORED：继续走正常解析
      }
      
      // 2. NLU 双轨解析（规则优先，LLM 兜底）
      const nluResult = await parseNLU(text, {
        enableLLM: false  // 暂时禁用 LLM，后续可开启
      })
      
      console.log(`   → NLU 来源: ${nluResult.source}`)
      
      // 处理序列建议
      if (nluResult.suggestions && nluResult.suggestions.length > 0) {
        console.log(`   → 解析成功: ${nluResult.suggestions.length} 个建议`)
        
        // 设置建议队列
        suggestionQueue.setSuggestions(nluResult.suggestions, text)
        
        // 取出第一个建议
        const firstSuggestion = suggestionQueue.peek()
        const firstIntent = suggestionToIntent(firstSuggestion)
        
        // 检查安全状态
        if (safetyManager.isBlocked()) {
          suggestionQueue.clear('safety_blocked')
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({
            intent: { intent: 'SEQUENCE', raw_text: text },
            nlu: { source: nluResult.source, confidence: nluResult.confidence },
            decision: { execute: false, reason: '安全阻止：' + safetyManager.getBlockReason()?.reason },
            sequence: suggestionQueue.getState(),
            state: getState()
          }))
          return
        }
        
        // 返回建议序列
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          intent: { intent: 'SEQUENCE', raw_text: text, confidence: nluResult.confidence },
          nlu: { source: nluResult.source, confidence: nluResult.confidence },
          firstIntent,
          sequence: suggestionQueue.getState(),
          decision: { execute: true, reason: `${nluResult.suggestions.length} 个建议待执行` },
          isComplex: true,
          awaiting: false,
          state: getState()
        }))
        return
      }
      
      // 处理单个意图
      const intent = nluResult.intent
      
      if (!intent || nluResult.source === 'none') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          intent: { intent: 'NONE', confidence: 0.3, raw_text: text },
          nlu: { source: nluResult.source, confidence: nluResult.confidence },
          decision: { execute: false, reason: '无法解析意图，请尝试：前进、后退、左转、右转、停' },
          executed: false
        }))
        return
      }
      
      console.log(`   → 意图: ${intent.intent} ${intent.direction || ''} ${intent.duration_ms || ''}`)
      console.log(`   → 置信度: ${intent.confidence}`)
      
      // 3. 状态机守卫判断
      const guardDecision = shouldExecute(intent)
      console.log(`   → Guard: ${guardDecision.execute ? '通过' : '拒绝'} (${guardDecision.reason})`)
      
      if (!guardDecision.execute) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          intent,
          decision: guardDecision,
          executed: false,
          state: getState()
        }))
        return
      }
      
      // 4. BEEP 特殊处理（测试用）
      if (intent.intent === 'BEEP') {
        const serialStatus = serial.getStatus()
        if (serialStatus.connected) {
          serial.send('BEEP')
          console.log(`   → 蜂鸣器: BEEP`)
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          intent,
          confirm: { status: 'EXECUTED', command: 'BEEP' },
          awaiting: false,
          state: getState()
        }))
        return
      }
      
      // 5. 确认层处理
      const robotState = getState().state
      const confirmResult = await confirmManager.handleAllowedIntent(intent, robotState)
      console.log(`   → 确认层: ${confirmResult.status} ${confirmResult.prompt || confirmResult.command || ''}`)
      
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        intent,
        decision: guardDecision,
        confirm: confirmResult,
        awaiting: confirmManager.isAwaiting(),
        state: getState()
      }))
      
    } catch (error) {
      console.error('意图解析错误:', error)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: error.message }))
    }
    return
  }
  
  // ============ 结构化意图执行接口（工具调用专用） ============
  // 符合 BEHAVIOR.md 宣言：结构化参数 + 白名单校验 + Guard/Confirm/Safety 链路
  if (url.pathname === '/api/intent/execute' && req.method === 'POST') {
    try {
      // 鉴权检查
      const authResult = checkToolAuth(req, url.pathname, req.method)
      if (!authResult.ok) {
        res.writeHead(authResult.code, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: authResult.error }))
        return
      }
      
      // 速率限制
      const rateResult = checkRateLimit(req, url.pathname, req.method)
      if (!rateResult.ok) {
        res.writeHead(rateResult.code, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: rateResult.error }))
        return
      }
      
      const body = await parseBody(req)
      const { intent, direction, duration_ms, confidence = 1.0, source = 'tool' } = body
      
      console.log(`🔧 [Tool API] 结构化意图: ${intent} ${direction || ''} ${duration_ms || ''} (来源: ${source})`)
      
      // 1. STOP 永远最高优先级，直接执行
      if (intent === 'STOP') {
        console.log(`   → STOP 最高优先级，直接执行`)
        suggestionQueue.clear('tool_stop')
        fluencyManager.clear('tool_stop')
        
        if (confirmManager.isAwaiting()) {
          await confirmManager.forceStop()
        }
        
        const serialStatus = serial.getStatus()
        if (serialStatus.connected) {
          serial.sendStop()
        }
        forceStop()
        
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          success: true,
          intent: { intent: 'STOP' },
          executed: serialStatus.connected,
          state: getState()
        }))
        return
      }
      
      // 2. 构建意图对象
      const intentObj = {
        intent: intent,
        direction: direction || null,
        duration_ms: duration_ms || DurationPresets.MEDIUM,
        confidence: confidence,
        raw_text: `[Tool:${source}] ${intent} ${direction || ''}`
      }
      
      // 3. 白名单校验（使用 intent.schema.js 的 validateIntent）
      const validation = validateIntent(intentObj)
      if (!validation.valid) {
        console.log(`   → 校验失败: ${validation.errors.join(', ')}`)
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          success: false,
          error: '参数校验失败',
          details: validation.errors,
          hint: {
            intent: ['MOVE', 'TURN', 'STOP', 'QUERY'],
            direction: { MOVE: ['F', 'B'], TURN: ['L', 'R'] },
            duration_ms: [400, 800, 1200]
          }
        }))
        return
      }
      
      // 4. 安全状态检查
      if (safetyManager.isBlocked()) {
        const blockReason = safetyManager.getBlockReason()
        console.log(`   → 安全阻止: ${blockReason?.reason}`)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          success: false,
          error: '安全阻止',
          blocked: true,
          reason: blockReason?.reason,
          safety: safetyManager.getState(),
          state: getState()
        }))
        return
      }
      
      // 5. 状态机守卫判断
      const guardDecision = shouldExecute(intentObj)
      console.log(`   → Guard: ${guardDecision.execute ? '通过' : '拒绝'} (${guardDecision.reason})`)
      
      if (!guardDecision.execute) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          success: false,
          intent: intentObj,
          decision: guardDecision,
          state: getState()
        }))
        return
      }
      
      // 6. 确认层处理
      const robotState = getState().state
      const confirmResult = await confirmManager.handleAllowedIntent(intentObj, robotState)
      console.log(`   → 确认层: ${confirmResult.status}`)
      
      // 返回结果
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        success: confirmResult.status === 'EXECUTED',
        intent: intentObj,
        decision: guardDecision,
        confirm: confirmResult,
        awaiting: confirmManager.isAwaiting(),
        state: getState()
      }))
      
    } catch (error) {
      console.error('[Tool API] 执行错误:', error)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: error.message }))
    }
    return
  }
  
  // 紧急停止接口
  if (url.pathname === '/api/intent/stop' && req.method === 'POST') {
    console.log('🛑 紧急停止')
    const decision = forceStop()
    
    const serialStatus = serial.getStatus()
    let executed = false
    if (serialStatus.connected) {
      serial.sendStop()
      executed = true
    }
    
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      decision,
      executed,
      state: getState()
    }))
    return
  }
  
  // 机器人状态查询
  if (url.pathname === '/api/intent/state' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(getState()))
    return
  }
  
  // 硬件状态查询接口（P1-3: 能力开关API）
  if (url.pathname === '/api/hardware/status' && req.method === 'GET') {
    console.log('🔧 硬件状态查询')
    const serialStatus = serial.getStatus()
    
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      success: true,
      hardware: {
        display: { connected: false, type: null },
        audio: { connected: true, type: 'browser' },
        vision: { connected: false, type: null },
        motion: { connected: serialStatus.connected, type: 'serial' },
        sensors: { connected: serialStatus.connected, type: 'stm32' }
      },
      // 固件能力声明（从统一配置读取）
      capabilities: hardwareConfig.capabilities || {},
      // 协议配置
      protocol: hardwareConfig.protocol || { version: 'simple' },
      // 安全阈值（UI可展示当前生效值）
      safetyThresholds: hardwareConfig.safety?.obstacleThresholds || {},
      level: hardwareConfig.level || 'L0',
      serial: serialStatus,
      timestamp: new Date().toISOString()
    }))
    return
  }
  
  // ============ 视觉识别API ============
  // 接收ESP32上传的帧进行人脸识别
  if (url.pathname === '/api/vision/frame' && req.method === 'POST') {
    const chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', async () => {
      try {
        const imageBuffer = Buffer.concat(chunks)
        const deviceMAC = req.headers['x-device-mac'] || 'unknown'
        
        console.log(`📷 [Vision] 收到帧: ${imageBuffer.length} bytes from ${deviceMAC}`)
        
        const result = await vision.processFrame(imageBuffer, deviceMAC)
        
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(result))
      } catch (error) {
        console.error('[Vision] 处理帧错误:', error)
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: error.message, action: 'stop' }))
      }
    })
    return
  }
  
  // 视觉识别状态
  if (url.pathname === '/api/vision/status' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(vision.getStatus()))
    return
  }
  
  // ============ 人脸识别API ============
  // 列出已注册的人脸
  if (url.pathname === '/api/face/list' && req.method === 'GET') {
    try {
      const result = await vision.listFaces()
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(result))
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: false, error: error.message }))
    }
    return
  }
  
  // 注册人脸（上传图片）
  if (url.pathname === '/api/face/register' && req.method === 'POST') {
    const chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', async () => {
      try {
        const imageBuffer = Buffer.concat(chunks)
        const personName = req.headers['x-person-name'] || 'unknown'
        
        // 保存临时文件
        const fs = require('fs')
        const path = require('path')
        const tempPath = path.join(__dirname, '../temp/register_temp.jpg')
        fs.writeFileSync(tempPath, imageBuffer)
        
        const result = await vision.registerFace(tempPath, personName)
        
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(result))
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: false, error: error.message }))
      }
    })
    return
  }
  
  // 识别人脸（上传图片进行匹配）
  if (url.pathname === '/api/face/recognize' && req.method === 'POST') {
    const chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', async () => {
      try {
        const imageBuffer = Buffer.concat(chunks)
        
        // 保存临时文件
        const fs = require('fs')
        const path = require('path')
        const tempPath = path.join(__dirname, '../temp/recognize_temp.jpg')
        fs.writeFileSync(tempPath, imageBuffer)
        
        const result = await vision.recognizeFace(tempPath)
        
        console.log(`👤 [Face] 识别结果: ${result.is_owner ? '主人' : (result.recognized ? result.known_names.join(',') : '未知')}`)
        
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(result))
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: false, error: error.message }))
      }
    })
    return
  }
  
  // ============ ESP32设备管理 ============
  // 在线设备列表（内存存储，生产环境应使用Redis/数据库）
  if (!global.esp32Devices) {
    global.esp32Devices = new Map()
  }
  
  // ESP32设备注册/心跳接口
  if (url.pathname === '/api/esp32/register' && req.method === 'POST') {
    let body = ''
    req.on('data', chunk => body += chunk)
    req.on('end', () => {
      try {
        const device = JSON.parse(body)
        const { mac, ip, version, uptime } = device
        
        if (!mac) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'MAC address required' }))
          return
        }
        
        // 鉴权检查（如果启用）
        const authConfig = hardwareConfig.auth || {}
        if (authConfig.enabled) {
          const { pairingCode, allowedMACs } = authConfig
          const deviceCode = device.pairingCode
          
          // 检查MAC白名单
          if (allowedMACs?.length > 0 && !allowedMACs.includes(mac)) {
            // 首次注册需要配对码
            if (deviceCode !== pairingCode) {
              console.log(`[ESP32] 鉴权失败: MAC=${mac}, 配对码错误`)
              res.writeHead(403, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: 'Invalid pairing code', requirePairing: true }))
              return
            }
          }
        }
        
        // 注册/更新设备信息
        global.esp32Devices.set(mac, {
          mac,
          ip,
          version,
          uptime,
          lastSeen: Date.now(),
          registeredAt: global.esp32Devices.get(mac)?.registeredAt || Date.now()
        })
        
        console.log(`[ESP32] 设备注册: MAC=${mac}, IP=${ip}, Version=${version}`)
        
        // 返回服务器时间和OTA信息
        const latestVersion = hardwareConfig.esp32?.latestVersion || '2.4.1'
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          success: true,
          serverTime: Date.now(),
          latestVersion,
          updateAvailable: version !== latestVersion
        }))
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: e.message }))
      }
    })
    return
  }
  
  // 获取所有在线ESP32设备
  if (url.pathname === '/api/esp32/devices' && req.method === 'GET') {
    const devices = Array.from(global.esp32Devices.values())
      .filter(d => Date.now() - d.lastSeen < 120000) // 2分钟内活跃
    
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ success: true, devices, count: devices.length }))
    return
  }
  
  // 获取ESP32当前版本信息（通过设备列表或直接请求）
  if (url.pathname === '/api/esp32/info' && req.method === 'GET') {
    try {
      const esp32IP = hardwareConfig.esp32?.ip || '192.168.0.109'
      const response = await fetch(`http://${esp32IP}/info`, { signal: AbortSignal.timeout(5000) })
      const data = await response.json()
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: true, esp32: data, ip: esp32IP }))
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: false, error: e.message }))
    }
    return
  }
  
  // ESP32 OTA更新检查接口（供ESP32调用）
  if (url.pathname === '/api/ota/check' && req.method === 'GET') {
    const deviceVersion = url.searchParams.get('version') || '0.0.0'
    const latestVersion = hardwareConfig.esp32?.latestVersion || '2.4.0'
    const updateAvailable = deviceVersion !== latestVersion
    
    console.log(`[OTA] 检查更新: 设备版本=${deviceVersion}, 最新版本=${latestVersion}, 需更新=${updateAvailable}`)
    
    // 计算固件hash（用于校验）
    let firmwareHash = null
    try {
      const fs = await import('fs')
      const crypto = await import('crypto')
      const path = await import('path')
      const firmwarePath = path.join(__dirname, '..', 'esp32', '.pio', 'build', 'esp32-s3-devkitc-1', 'firmware.bin')
      const firmwareData = fs.readFileSync(firmwarePath)
      firmwareHash = 'sha256:' + crypto.createHash('sha256').update(firmwareData).digest('hex').substring(0, 16)
    } catch (e) {
      // 忽略hash计算失败
    }
    
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      update: updateAvailable,
      version: latestVersion,
      url: updateAvailable ? `http://${req.headers.host}/api/ota/firmware` : null,
      hash: firmwareHash
    }))
    return
  }
  
  // ESP32 OTA固件下载接口
  if (url.pathname === '/api/ota/firmware' && req.method === 'GET') {
    const fs = await import('fs')
    const path = await import('path')
    const crypto = await import('crypto')
    const firmwarePath = path.join(__dirname, '..', 'esp32', '.pio', 'build', 'esp32-s3-devkitc-1', 'firmware.bin')
    
    console.log(`[OTA] 固件下载请求: ${firmwarePath}`)
    
    try {
      const stat = fs.statSync(firmwarePath)
      const firmwareData = fs.readFileSync(firmwarePath)
      const firmwareHash = crypto.createHash('sha256').update(firmwareData).digest('hex')
      
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': stat.size,
        'Content-Disposition': 'attachment; filename=firmware.bin',
        'X-Firmware-Hash': 'sha256:' + firmwareHash.substring(0, 16),
        'X-Firmware-Hash-Full': 'sha256:' + firmwareHash
      })
      
      const readStream = fs.createReadStream(firmwarePath)
      readStream.pipe(res)
      console.log(`[OTA] 开始传输固件: ${stat.size} bytes`)
    } catch (e) {
      console.log(`[OTA] 固件文件不存在: ${e.message}`)
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Firmware not found', path: firmwarePath }))
    }
    return
  }
  
  // 向ESP32推送OTA更新命令
  if (url.pathname === '/api/esp32/ota/push' && req.method === 'POST') {
    try {
      const esp32IP = hardwareConfig.esp32?.ip || '192.168.0.109'
      const response = await fetch(`http://${esp32IP}/ota/check`, { signal: AbortSignal.timeout(10000) })
      const result = await response.text()
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: true, result }))
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: false, error: e.message }))
    }
    return
  }
  
  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Not Found' }))
}

// 启动服务器
const server = http.createServer(handleRequest)

// 初始化串口（如果配置启用）
const initSerial = async () => {
  if (hardwareConfig.communication?.serial?.enabled) {
    await serial.init(hardwareConfig.communication.serial)
  }
}

// ============ WebSocket 服务器 ============
// 创建 WebSocket 服务器实例，连接到现有功能
const wsServer = new SimoWebSocketServer({
  port: hardwareConfig.websocket?.port || 18790,
  // 处理器函数（连接到现有功能）
  executeIntent: async (params) => {
    const intentObj = {
      intent: params.intent,
      direction: params.direction || null,
      duration_ms: params.duration_ms || DurationPresets.MEDIUM,
      confidence: 1.0,
      raw_text: `[WebSocket] ${params.intent} ${params.direction || ''}`
    }
    
    // 白名单校验
    const validation = validateIntent(intentObj)
    if (!validation.valid) {
      return { success: false, error: '参数校验失败', details: validation.errors }
    }
    
    // 安全检查
    if (safetyManager.isBlocked()) {
      const blockReason = safetyManager.getBlockReason()
      return { success: false, blocked: true, reason: blockReason?.reason, safety: safetyManager.getState() }
    }
    
    // 守卫判断
    const guardDecision = shouldExecute(intentObj)
    if (!guardDecision.execute) {
      return { success: false, intent: intentObj, decision: guardDecision }
    }
    
    // 确认层处理
    const robotState = getState().state
    const confirmResult = await confirmManager.handleAllowedIntent(intentObj, robotState)
    
    return {
      success: confirmResult.status === 'EXECUTED',
      intent: intentObj,
      decision: guardDecision,
      confirm: confirmResult,
      awaiting: confirmManager.isAwaiting(),
      state: getState()
    }
  },
  
  queryState: async () => {
    return getState()
  },
  
  querySensors: async () => {
    return serial.getSensorData()
  },
  
  queryHardware: async () => {
    const serialStatus = serial.getStatus()
    return {
      success: true,
      hardware: {
        display: { connected: false, type: null },
        audio: { connected: true, type: 'browser' },
        vision: { connected: false, type: null },
        motion: { connected: serialStatus.connected, type: 'serial' },
        sensors: { connected: serialStatus.connected, type: 'stm32' }
      },
      capabilities: hardwareConfig.capabilities || {},
      protocol: hardwareConfig.protocol || { version: 'simple' },
      level: hardwareConfig.level || 'L0',
      serial: serialStatus
    }
  },
  
  emergencyStop: async () => {
    forceStop()
    const serialStatus = serial.getStatus()
    if (serialStatus.connected) {
      serial.sendStop()
    }
    return {
      executed: serialStatus.connected,
      state: getState()
    }
  },
  
  parseIntent: async (text) => {
    // 调用 NLU 解析
    const nluResult = await parseNLU(text, { enableLLM: false })
    const intent = nluResult.intent
    
    if (!intent || nluResult.source === 'none') {
      return {
        intent: { intent: 'NONE', confidence: 0.3, raw_text: text },
        decision: { execute: false, reason: '无法解析意图' }
      }
    }
    
    const guardDecision = shouldExecute(intent)
    if (!guardDecision.execute) {
      return { intent, decision: guardDecision, executed: false }
    }
    
    const robotState = getState().state
    const confirmResult = await confirmManager.handleAllowedIntent(intent, robotState)
    
    return {
      intent,
      decision: guardDecision,
      confirm: confirmResult,
      awaiting: confirmManager.isAwaiting(),
      state: getState()
    }
  }
})

server.listen(PORT, async () => {
  // 启动后初始化串口
  await initSerial()
  
  // 启动 WebSocket 服务器
  wsServer.start()
  
  // 订阅传感器更新，广播给 WebSocket 客户端
  setInterval(() => {
    const sensors = serial.getSensorData()
    if (wsServer.clients.size > 0 && sensors.ultrasonic?.distance !== null) {
      wsServer.broadcastSensorData(sensors)
    }
  }, 1000)  // 每秒广播一次
  
  console.log(`
  ╔═══════════════════════════════════════════════╗
  ║                                               ║
  ║   🤖 Simo Server 已启动                       ║
  ║   HTTP: ${PORT}   WebSocket: ${wsServer.port}                ║
  ║   硬件等级: L0（纯软件）                      ║
  ║                                               ║
  ║   核心接口:                                   ║
  ║   - POST /api/chat         对话              ║
  ║   - POST /api/tts/edge     语音合成          ║
  ║   - POST /api/tts/baidu    百度语音          ║
  ║   - POST /api/intent/execute  结构化执行     ║
  ║   - WS   ws://localhost:${wsServer.port}  实时通信       ║
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
