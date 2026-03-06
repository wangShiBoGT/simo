/**
 * Simo WebSocket 服务器
 * 提供实时双向通信，供 MimiClaw 或其他客户端使用
 * 
 * 协议格式：
 * Client -> Server: {"type": "message", "content": "...", "chat_id": "..."}
 * Server -> Client: {"type": "response", "content": "...", "chat_id": "..."}
 * 
 * 支持的消息类型：
 * - "execute": 执行意图 {"type": "execute", "intent": "MOVE", "direction": "F", ...}
 * - "query": 查询状态 {"type": "query", "target": "state" | "sensors" | "hardware"}
 * - "stop": 紧急停止 {"type": "stop"}
 * - "message": 自然语言 {"type": "message", "content": "前进"}
 */

import { WebSocketServer } from 'ws'
import { EventEmitter } from 'events'

export class SimoWebSocketServer extends EventEmitter {
  constructor(options = {}) {
    super()
    this.port = options.port || 18790  // MimiClaw 用 18789，Simo 用 18790
    this.wss = null
    this.clients = new Map()  // clientId -> { ws, info }
    this.clientCounter = 0
    
    // 依赖注入（由 index.js 传入）
    this.handlers = {
      executeIntent: options.executeIntent,
      queryState: options.queryState,
      querySensors: options.querySensors,
      queryHardware: options.queryHardware,
      emergencyStop: options.emergencyStop,
      parseIntent: options.parseIntent
    }
  }
  
  /**
   * 启动 WebSocket 服务器
   */
  start() {
    this.wss = new WebSocketServer({ port: this.port })
    
    this.wss.on('connection', (ws, req) => {
      const clientId = `ws_${++this.clientCounter}`
      const clientInfo = {
        ws,
        id: clientId,
        ip: req.socket.remoteAddress,
        connectedAt: Date.now(),
        chatId: null  // 可在首次消息中覆盖
      }
      
      this.clients.set(clientId, clientInfo)
      console.log(`🔌 [WebSocket] 客户端连接: ${clientId} (${clientInfo.ip}) [总数: ${this.clients.size}]`)
      
      // 发送欢迎消息
      this.sendToClient(clientId, {
        type: 'welcome',
        clientId,
        server: 'Simo WebSocket Server',
        version: '1.0.0',
        timestamp: Date.now()
      })
      
      ws.on('message', async (data) => {
        await this.handleMessage(clientId, data)
      })
      
      ws.on('close', () => {
        this.clients.delete(clientId)
        console.log(`🔌 [WebSocket] 客户端断开: ${clientId} [剩余: ${this.clients.size}]`)
      })
      
      ws.on('error', (error) => {
        console.error(`❌ [WebSocket] 客户端错误 ${clientId}:`, error.message)
      })
    })
    
    this.wss.on('error', (error) => {
      console.error('❌ [WebSocket] 服务器错误:', error.message)
    })
    
    console.log(`🔌 [WebSocket] 服务器启动在端口 ${this.port}`)
    this.emit('started', { port: this.port })
  }
  
  /**
   * 处理客户端消息
   */
  async handleMessage(clientId, data) {
    const client = this.clients.get(clientId)
    if (!client) return
    
    try {
      const msg = JSON.parse(data.toString())
      console.log(`📩 [WebSocket] ${clientId}: ${msg.type} ${msg.intent || msg.target || ''}`)
      
      // 更新 chat_id（如果提供）
      if (msg.chat_id && !client.chatId) {
        client.chatId = msg.chat_id
      }
      
      let response
      
      switch (msg.type) {
        case 'execute':
          // 执行意图：{"type": "execute", "intent": "MOVE", "direction": "F", "duration_ms": 400}
          response = await this.handleExecute(msg)
          break
        
        case 'query':
          // 查询状态：{"type": "query", "target": "state" | "sensors" | "hardware"}
          response = await this.handleQuery(msg)
          break
        
        case 'stop':
          // 紧急停止：{"type": "stop"}
          response = await this.handleStop()
          break
        
        case 'message':
          // 自然语言：{"type": "message", "content": "前进"}
          response = await this.handleNaturalLanguage(msg)
          break
        
        case 'ping':
          // 心跳：{"type": "ping"}
          response = { type: 'pong', timestamp: Date.now() }
          break
        
        default:
          response = {
            type: 'error',
            error: `未知消息类型: ${msg.type}`,
            supported: ['execute', 'query', 'stop', 'message', 'ping']
          }
      }
      
      this.sendToClient(clientId, response)
      
    } catch (error) {
      console.error(`❌ [WebSocket] 处理消息错误:`, error)
      this.sendToClient(clientId, {
        type: 'error',
        error: error.message
      })
    }
  }
  
  /**
   * 执行结构化意图
   */
  async handleExecute(msg) {
    if (!this.handlers.executeIntent) {
      return { type: 'error', error: 'executeIntent handler not configured' }
    }
    
    const result = await this.handlers.executeIntent({
      intent: msg.intent,
      direction: msg.direction,
      duration_ms: msg.duration_ms,
      source: 'websocket'
    })
    
    return {
      type: 'response',
      subtype: 'execute',
      success: result.success,
      intent: result.intent,
      decision: result.decision,
      confirm: result.confirm,
      state: result.state,
      awaiting: result.awaiting
    }
  }
  
  /**
   * 查询状态
   */
  async handleQuery(msg) {
    const target = msg.target || 'state'
    let data
    
    switch (target) {
      case 'state':
        data = this.handlers.queryState ? await this.handlers.queryState() : {}
        break
      case 'sensors':
        data = this.handlers.querySensors ? await this.handlers.querySensors() : {}
        break
      case 'hardware':
        data = this.handlers.queryHardware ? await this.handlers.queryHardware() : {}
        break
      default:
        return { type: 'error', error: `未知查询目标: ${target}` }
    }
    
    return {
      type: 'response',
      subtype: 'query',
      target,
      data
    }
  }
  
  /**
   * 紧急停止
   */
  async handleStop() {
    if (!this.handlers.emergencyStop) {
      return { type: 'error', error: 'emergencyStop handler not configured' }
    }
    
    const result = await this.handlers.emergencyStop()
    
    return {
      type: 'response',
      subtype: 'stop',
      executed: result.executed,
      state: result.state
    }
  }
  
  /**
   * 处理自然语言（调用意图解析）
   */
  async handleNaturalLanguage(msg) {
    if (!this.handlers.parseIntent) {
      return { type: 'error', error: 'parseIntent handler not configured' }
    }
    
    const result = await this.handlers.parseIntent(msg.content)
    
    return {
      type: 'response',
      subtype: 'message',
      intent: result.intent,
      decision: result.decision,
      confirm: result.confirm,
      state: result.state
    }
  }
  
  /**
   * 向特定客户端发送消息
   */
  sendToClient(clientId, data) {
    const client = this.clients.get(clientId)
    if (!client || client.ws.readyState !== 1) return false
    
    try {
      client.ws.send(JSON.stringify(data))
      return true
    } catch (error) {
      console.error(`❌ [WebSocket] 发送失败 ${clientId}:`, error.message)
      return false
    }
  }
  
  /**
   * 广播消息到所有客户端
   */
  broadcast(data) {
    let sent = 0
    for (const [clientId, client] of this.clients) {
      if (this.sendToClient(clientId, data)) {
        sent++
      }
    }
    return sent
  }
  
  /**
   * 广播状态更新
   */
  broadcastStateUpdate(state) {
    return this.broadcast({
      type: 'state_update',
      state,
      timestamp: Date.now()
    })
  }
  
  /**
   * 广播传感器数据
   */
  broadcastSensorData(sensors) {
    return this.broadcast({
      type: 'sensor_update',
      sensors,
      timestamp: Date.now()
    })
  }
  
  /**
   * 获取服务器状态
   */
  getStatus() {
    return {
      running: this.wss !== null,
      port: this.port,
      clientCount: this.clients.size,
      clients: Array.from(this.clients.values()).map(c => ({
        id: c.id,
        ip: c.ip,
        chatId: c.chatId,
        connectedAt: c.connectedAt,
        uptime: Date.now() - c.connectedAt
      }))
    }
  }
  
  /**
   * 停止服务器
   */
  stop() {
    if (this.wss) {
      this.wss.close()
      this.wss = null
      console.log('🔌 [WebSocket] 服务器已停止')
    }
  }
}
