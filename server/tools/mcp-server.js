/**
 * Simo MCP 服务器桥接
 * 将 Simo HTTP API 桥接为 MCP 协议，供支持 MCP 的 AI 助手使用
 * 
 * 运行: node server/tools/mcp-server.js
 * 
 * MCP 协议参考: https://modelcontextprotocol.io/
 */

import { createServer } from 'http'

const SIMO_BASE_URL = process.env.SIMO_URL || 'http://localhost:3001'
const SIMO_TOKEN = process.env.SIMO_TOOL_TOKEN || ''
const MCP_PORT = process.env.MCP_PORT || 3002

// 工具定义
const tools = [
  {
    name: 'simo_execute_intent',
    description: '执行结构化意图控制 Simo 小车。所有动作经过安全链路验证。',
    inputSchema: {
      type: 'object',
      properties: {
        intent: { type: 'string', enum: ['MOVE', 'TURN', 'STOP'], description: '意图类型' },
        direction: { type: 'string', enum: ['F', 'B', 'L', 'R'], description: '方向' },
        duration_ms: { type: 'integer', enum: [400, 800, 1200], description: '时长(ms)' }
      },
      required: ['intent']
    }
  },
  {
    name: 'simo_emergency_stop',
    description: '紧急停止 Simo 小车。最高优先级，永远可用。',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'simo_get_state',
    description: '获取 Simo 完整状态：运动、安全、传感器。',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'simo_get_sensors',
    description: '获取传感器数据：超声波距离、红外避障。',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'simo_autonomy',
    description: '控制自主避障模式。',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['start', 'stop'], description: '操作' }
      },
      required: ['action']
    }
  },
  {
    name: 'simo_navigation',
    description: '控制导航模式：巡逻、跟随、返航。',
    inputSchema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['patrol', 'follow', 'return', 'stop'], description: '模式' }
      },
      required: ['mode']
    }
  }
]

// 资源定义
const resources = [
  { uri: 'simo://state', name: 'Simo 状态', mimeType: 'application/json' },
  { uri: 'simo://sensors', name: '传感器数据', mimeType: 'application/json' },
  { uri: 'simo://capabilities', name: '能力声明', mimeType: 'application/json' }
]

// HTTP 请求封装
async function simoRequest(method, path, body = null) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(SIMO_TOKEN && { 'X-Simo-Token': SIMO_TOKEN })
    }
  }
  if (body) options.body = JSON.stringify(body)
  
  const response = await fetch(`${SIMO_BASE_URL}${path}`, options)
  return response.json()
}

// 工具执行处理
async function handleToolCall(name, args) {
  switch (name) {
    case 'simo_execute_intent':
      return simoRequest('POST', '/api/intent/execute', {
        intent: args.intent,
        direction: args.direction,
        duration_ms: args.duration_ms || 800,
        source: 'mcp'
      })
    
    case 'simo_emergency_stop':
      return simoRequest('POST', '/api/intent/stop')
    
    case 'simo_get_state':
      return simoRequest('GET', '/api/state')
    
    case 'simo_get_sensors':
      return simoRequest('GET', '/api/hardware/sensors')
    
    case 'simo_autonomy':
      return simoRequest('POST', `/api/autonomy/${args.action}`)
    
    case 'simo_navigation':
      return simoRequest('POST', `/api/nav/${args.mode}`)
    
    default:
      throw new Error(`未知工具: ${name}`)
  }
}

// 资源读取处理
async function handleResourceRead(uri) {
  switch (uri) {
    case 'simo://state':
      return simoRequest('GET', '/api/state')
    case 'simo://sensors':
      return simoRequest('GET', '/api/hardware/sensors')
    case 'simo://capabilities':
      return simoRequest('GET', '/api/hardware/status')
    default:
      throw new Error(`未知资源: ${uri}`)
  }
}

// MCP JSON-RPC 处理
async function handleMcpRequest(request) {
  const { method, params, id } = request
  
  try {
    let result
    
    switch (method) {
      case 'initialize':
        result = {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
            resources: { subscribe: false, listChanged: false }
          },
          serverInfo: { name: 'simo-mcp-server', version: '1.0.0' }
        }
        break
      
      case 'tools/list':
        result = { tools }
        break
      
      case 'tools/call':
        const toolResult = await handleToolCall(params.name, params.arguments || {})
        result = {
          content: [{ type: 'text', text: JSON.stringify(toolResult, null, 2) }]
        }
        break
      
      case 'resources/list':
        result = { resources }
        break
      
      case 'resources/read':
        const resourceData = await handleResourceRead(params.uri)
        result = {
          contents: [{
            uri: params.uri,
            mimeType: 'application/json',
            text: JSON.stringify(resourceData, null, 2)
          }]
        }
        break
      
      case 'ping':
        result = {}
        break
      
      default:
        throw { code: -32601, message: `未知方法: ${method}` }
    }
    
    return { jsonrpc: '2.0', id, result }
    
  } catch (error) {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: error.code || -32000,
        message: error.message || String(error)
      }
    }
  }
}

// HTTP 服务器（简化版，生产环境应使用 stdio 或 SSE）
const server = createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200)
    res.end()
    return
  }
  
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Method not allowed' }))
    return
  }
  
  let body = ''
  req.on('data', chunk => body += chunk)
  req.on('end', async () => {
    try {
      const request = JSON.parse(body)
      const response = await handleMcpRequest(request)
      
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(response))
    } catch (error) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32700, message: 'Parse error' }
      }))
    }
  })
})

server.listen(MCP_PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════╗
║                                               ║
║   🔗 Simo MCP Server 已启动                   ║
║   端口: ${MCP_PORT}                                  ║
║   Simo: ${SIMO_BASE_URL}                 ║
║                                               ║
║   工具:                                       ║
║   - simo_execute_intent  执行意图             ║
║   - simo_emergency_stop  紧急停止             ║
║   - simo_get_state       获取状态             ║
║   - simo_get_sensors     获取传感器           ║
║   - simo_autonomy        自主避障             ║
║   - simo_navigation      导航控制             ║
║                                               ║
╚═══════════════════════════════════════════════╝
  `)
})
