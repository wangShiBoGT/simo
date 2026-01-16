/**
 * Simo Cloudflare Worker
 * 
 * 职责：转发请求到大模型 API，拼接 System Prompt
 * 比 Render 更稳定：无冷启动、无睡眠、全球边缘节点
 * 
 * 部署命令：npx wrangler deploy
 */

// Simo 系统 Prompt
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

// 大模型配置（API Key 从 Cloudflare Secrets 读取）
const LLM_CONFIGS = {
  zhipu: {
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-flash'
  },
  deepseek: {
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat'
  },
  qwen: {
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-turbo'
  },
  moonshot: {
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-8k'
  }
}

// 默认使用的模型
const DEFAULT_LLM = 'zhipu'

/**
 * 模拟响应（降级用）
 */
function getMockResponse(message) {
  const lowerMsg = message.toLowerCase()
  
  if (lowerMsg.includes('hi') && lowerMsg.includes('simo')) {
    return '在呢。'
  }
  if (lowerMsg.includes('你好') || lowerMsg.includes('在吗')) {
    return '在呢，有什么事？'
  }
  if (lowerMsg.includes('天气')) {
    return '这个我现在还看不了，你可以看看窗外。'
  }
  if (lowerMsg.includes('你是谁')) {
    return '我是 Simo，一直在这儿。'
  }
  return '嗯，我听到了。'
}

/**
 * 调用大模型 API
 */
async function callLLM(message, history = [], memberContext = '', provider = '', apiKey = '', env) {
  // 确定使用哪个模型
  const llmProvider = provider || DEFAULT_LLM
  const config = LLM_CONFIGS[llmProvider]
  
  if (!config) {
    return getMockResponse(message)
  }
  
  // 获取 API Key：优先使用前端传入的，否则从环境变量读取
  let finalApiKey = apiKey
  if (!finalApiKey) {
    // 从 Cloudflare Secrets 读取
    const envKeyName = `${llmProvider.toUpperCase()}_API_KEY`
    finalApiKey = env[envKeyName] || ''
  }
  
  if (!finalApiKey) {
    console.log('未配置 API Key，使用模拟响应')
    return getMockResponse(message)
  }
  
  // 构建消息列表
  let systemPrompt = SIMO_SYSTEM_PROMPT
  if (memberContext) {
    systemPrompt += `\n\n### 当前对话上下文\n${memberContext}`
  }
  
  const messages = [{ role: 'system', content: systemPrompt }]
  
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
        'Authorization': `Bearer ${finalApiKey}`
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
    return getMockResponse(message)
  }
}

/**
 * 设置 CORS 头
 */
function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  }
}

/**
 * 主入口
 */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    const origin = request.headers.get('Origin') || '*'
    
    // 预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(origin)
      })
    }
    
    // 健康检查
    if (url.pathname === '/api/health') {
      return new Response(JSON.stringify({ 
        status: 'ok', 
        name: 'Simo Worker',
        runtime: 'Cloudflare Workers'
      }), {
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders(origin)
        }
      })
    }
    
    // 对话接口
    if (url.pathname === '/api/chat' && request.method === 'POST') {
      try {
        const body = await request.json()
        const { message, history, provider, apiKey, memberContext } = body
        
        if (!message) {
          return new Response(JSON.stringify({ error: '缺少 message 参数' }), {
            status: 400,
            headers: { 
              'Content-Type': 'application/json',
              ...corsHeaders(origin)
            }
          })
        }
        
        const reply = await callLLM(message, history, memberContext || '', provider, apiKey, env)
        
        return new Response(JSON.stringify({ reply }), {
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders(origin)
          }
        })
        
      } catch (error) {
        console.error('处理请求失败:', error)
        return new Response(JSON.stringify({ error: '服务器内部错误' }), {
          status: 500,
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders(origin)
          }
        })
      }
    }
    
    // 获取 System Prompt（调试用）
    if (url.pathname === '/api/prompt') {
      return new Response(JSON.stringify({ prompt: SIMO_SYSTEM_PROMPT }), {
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders(origin)
        }
      })
    }
    
    // API 连接测试
    if (url.pathname === '/api/test' && request.method === 'POST') {
      try {
        const body = await request.json()
        const { provider, apiKey } = body
        
        const config = LLM_CONFIGS[provider]
        if (!config) {
          return new Response(JSON.stringify({ 
            success: false, 
            error: `不支持的模型: ${provider}` 
          }), {
            status: 400,
            headers: { 
              'Content-Type': 'application/json',
              ...corsHeaders(origin)
            }
          })
        }
        
        // 测试 API 连接
        const response = await fetch(`${config.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: config.model,
            messages: [
              { role: 'user', content: '你好' }
            ],
            max_tokens: 10
          })
        })
        
        if (response.ok) {
          return new Response(JSON.stringify({ 
            success: true, 
            message: `${provider} API 连接成功` 
          }), {
            headers: { 
              'Content-Type': 'application/json',
              ...corsHeaders(origin)
            }
          })
        } else {
          const errorData = await response.json().catch(() => ({}))
          return new Response(JSON.stringify({ 
            success: false, 
            error: errorData.error?.message || `API 请求失败: ${response.status}` 
          }), {
            status: 400,
            headers: { 
              'Content-Type': 'application/json',
              ...corsHeaders(origin)
            }
          })
        }
        
      } catch (error) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: error.message 
        }), {
          status: 500,
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders(origin)
          }
        })
      }
    }
    
    // TTS 接口 - Workers 不支持 msedge-tts，返回提示让前端用浏览器 TTS
    if (url.pathname === '/api/tts/edge') {
      return new Response(JSON.stringify({ 
        error: 'Edge TTS 在 Workers 不可用',
        hint: 'use_browser_tts',
        reason: 'Cloudflare Workers 不支持 Node.js 流式 API'
      }), {
        status: 503,
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders(origin)
        }
      })
    }
    
    // 404
    return new Response(JSON.stringify({ error: 'Not Found' }), {
      status: 404,
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders(origin)
      }
    })
  }
}
