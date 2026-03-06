/**
 * WebSocket 集成测试
 * 演示如何通过 WebSocket 与 Simo 通信
 * 
 * 运行: node server/tools/test-websocket.js
 */

import WebSocket from 'ws'

const WS_URL = 'ws://localhost:18790'

// 颜色输出
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m'
}

function log(type, msg) {
  const prefix = {
    ok: `${colors.green}✅${colors.reset}`,
    fail: `${colors.red}❌${colors.reset}`,
    info: `${colors.blue}ℹ${colors.reset}`,
    send: `${colors.cyan}📤${colors.reset}`,
    recv: `${colors.yellow}📥${colors.reset}`
  }
  console.log(`${prefix[type] || '  '} ${msg}`)
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

async function runTests() {
  console.log('\n' + '='.repeat(60))
  console.log('  Simo WebSocket 集成测试')
  console.log('='.repeat(60) + '\n')
  
  const ws = new WebSocket(WS_URL)
  
  // 连接成功
  await new Promise((resolve, reject) => {
    ws.on('open', () => {
      log('ok', '连接成功')
      resolve()
    })
    ws.on('error', reject)
  })
  
  // 接收消息计数
  let messageCount = 0
  
  // 消息处理
  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString())
    messageCount++
    
    if (msg.type === 'welcome') {
      log('recv', `欢迎消息: ${msg.server} v${msg.version}, clientId=${msg.clientId}`)
    } else if (msg.type === 'response') {
      log('recv', `响应: ${msg.subtype} -> ${msg.success !== undefined ? (msg.success ? '成功' : '失败') : '完成'}`)
      if (msg.data) {
        log('info', `  数据: ${JSON.stringify(msg.data).substring(0, 100)}...`)
      }
    } else if (msg.type === 'sensor_update') {
      log('recv', `传感器更新: ${JSON.stringify(msg.sensors).substring(0, 80)}`)
    } else {
      log('recv', `${msg.type}: ${JSON.stringify(msg).substring(0, 100)}`)
    }
  })
  
  // 发送测试消息
  const sendMessage = (msg) => {
    log('send', `${msg.type} ${msg.intent || msg.target || msg.content || ''}`)
    ws.send(JSON.stringify(msg))
  }
  
  await sleep(500)
  
  // 测试 1: 查询硬件状态
  log('info', '\n测试 1: 查询硬件状态')
  sendMessage({ type: 'query', target: 'hardware' })
  await sleep(1000)
  
  // 测试 2: 查询机器人状态
  log('info', '\n测试 2: 查询机器人状态')
  sendMessage({ type: 'query', target: 'state' })
  await sleep(1000)
  
  // 测试 3: 执行前进动作
  log('info', '\n测试 3: 执行前进 400ms')
  sendMessage({
    type: 'execute',
    intent: 'MOVE',
    direction: 'F',
    duration_ms: 400
  })
  await sleep(1500)
  
  // 测试 4: 紧急停止
  log('info', '\n测试 4: 紧急停止')
  sendMessage({ type: 'stop' })
  await sleep(1000)
  
  // 测试 5: 自然语言（如果支持）
  log('info', '\n测试 5: 自然语言解析')
  sendMessage({
    type: 'message',
    content: '左转'
  })
  await sleep(1500)
  
  // 测试 6: Ping
  log('info', '\n测试 6: Ping/Pong')
  sendMessage({ type: 'ping' })
  await sleep(500)
  
  // 测试 7: 持续接收传感器数据
  log('info', '\n测试 7: 监听传感器数据（5秒）...')
  await sleep(5000)
  
  // 关闭连接
  ws.close()
  await sleep(500)
  
  console.log('\n' + '-'.repeat(60))
  log('ok', `测试完成！共接收 ${messageCount} 条消息`)
  console.log('-'.repeat(60) + '\n')
}

runTests().catch(error => {
  log('fail', `测试失败: ${error.message}`)
  process.exit(1)
})
