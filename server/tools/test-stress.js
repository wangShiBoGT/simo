/**
 * Simo 压力测试和性能评估
 * 测试速率限制、并发请求、WebSocket 稳定性
 */

import WebSocket from 'ws'

const BASE_URL = 'http://localhost:3001'
const WS_URL = 'ws://localhost:18790'

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m'
}

function log(type, msg) {
  const prefix = {
    ok: `${colors.green}✅${colors.reset}`,
    fail: `${colors.red}❌${colors.reset}`,
    warn: `${colors.yellow}⚠${colors.reset}`,
    info: `${colors.cyan}ℹ${colors.reset}`
  }
  console.log(`${prefix[type] || '  '} ${msg}`)
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

// 测试 1: HTTP 速率限制
async function testRateLimit() {
  console.log('\n' + '='.repeat(60))
  log('info', '测试 1: HTTP 速率限制（令牌桶算法）')
  console.log('='.repeat(60))
  
  const results = { success: 0, rateLimited: 0, errors: 0 }
  const startTime = Date.now()
  
  // 快速发送 10 个请求（超过桶容量 4）
  const requests = []
  for (let i = 0; i < 10; i++) {
    requests.push(
      fetch(`${BASE_URL}/api/intent/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent: 'STOP', source: 'stress-test' })
      })
      .then(res => {
        if (res.status === 200) results.success++
        else if (res.status === 429) results.rateLimited++
        else results.errors++
        return res.status
      })
      .catch(() => results.errors++)
    )
  }
  
  await Promise.all(requests)
  const duration = Date.now() - startTime
  
  log('info', `  耗时: ${duration}ms`)
  log('ok', `  成功: ${results.success}`)
  log('warn', `  限流: ${results.rateLimited}`)
  log(results.errors > 0 ? 'fail' : 'ok', `  错误: ${results.errors}`)
  
  // 预期：前 4 个成功（桶容量），后 6 个被限流
  if (results.rateLimited >= 4) {
    log('ok', '速率限制工作正常')
  } else {
    log('warn', `预期至少 4 个请求被限流，实际 ${results.rateLimited}`)
  }
}

// 测试 2: WebSocket 多客户端并发
async function testWebSocketConcurrency() {
  console.log('\n' + '='.repeat(60))
  log('info', '测试 2: WebSocket 多客户端并发')
  console.log('='.repeat(60))
  
  const clientCount = 5
  const clients = []
  const messagesSent = []
  const messagesReceived = []
  
  // 创建多个客户端
  for (let i = 0; i < clientCount; i++) {
    const ws = new WebSocket(WS_URL)
    messagesSent[i] = 0
    messagesReceived[i] = 0
    
    await new Promise((resolve) => {
      ws.on('open', () => {
        log('ok', `  客户端 ${i + 1} 连接成功`)
        resolve()
      })
    })
    
    ws.on('message', (data) => {
      messagesReceived[i]++
    })
    
    clients.push(ws)
  }
  
  log('info', `  已连接 ${clientCount} 个客户端`)
  
  // 每个客户端发送查询请求
  for (let i = 0; i < clientCount; i++) {
    clients[i].send(JSON.stringify({ type: 'query', target: 'state' }))
    messagesSent[i]++
    clients[i].send(JSON.stringify({ type: 'ping' }))
    messagesSent[i]++
  }
  
  await sleep(1000)
  
  // 统计结果
  const totalSent = messagesSent.reduce((a, b) => a + b, 0)
  const totalReceived = messagesReceived.reduce((a, b) => a + b, 0)
  
  log('info', `  发送消息: ${totalSent}`)
  log('info', `  接收消息: ${totalReceived}`)
  
  // 关闭所有客户端
  for (const ws of clients) {
    ws.close()
  }
  
  await sleep(500)
  
  if (totalReceived >= totalSent) {
    log('ok', '多客户端并发测试通过')
  } else {
    log('warn', `部分消息丢失（发送 ${totalSent}，接收 ${totalReceived}）`)
  }
}

// 测试 3: 长连接稳定性
async function testLongConnection() {
  console.log('\n' + '='.repeat(60))
  log('info', '测试 3: WebSocket 长连接稳定性（30秒）')
  console.log('='.repeat(60))
  
  const ws = new WebSocket(WS_URL)
  let connected = false
  let sensorUpdates = 0
  let pingsSent = 0
  let pongsReceived = 0
  
  await new Promise((resolve) => {
    ws.on('open', () => {
      connected = true
      log('ok', '  连接建立')
      resolve()
    })
  })
  
  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString())
    if (msg.type === 'sensor_update') {
      sensorUpdates++
    } else if (msg.type === 'pong') {
      pongsReceived++
    }
  })
  
  // 每 5 秒发送一次 ping
  const pingInterval = setInterval(() => {
    if (connected) {
      ws.send(JSON.stringify({ type: 'ping' }))
      pingsSent++
      log('info', `  Ping ${pingsSent}`)
    }
  }, 5000)
  
  // 运行 30 秒
  await sleep(30000)
  
  clearInterval(pingInterval)
  ws.close()
  
  log('info', `  Ping 发送: ${pingsSent}`)
  log('info', `  Pong 接收: ${pongsReceived}`)
  log('info', `  传感器更新: ${sensorUpdates}`)
  
  if (pongsReceived === pingsSent && connected) {
    log('ok', '长连接稳定性测试通过')
  } else {
    log('warn', `部分 Ping 丢失（发送 ${pingsSent}，接收 ${pongsReceived}）`)
  }
}

// 测试 4: 边缘情况
async function testEdgeCases() {
  console.log('\n' + '='.repeat(60))
  log('info', '测试 4: 边缘情况和错误处理')
  console.log('='.repeat(60))
  
  const tests = [
    {
      name: '空 JSON',
      body: {},
      expectStatus: 400
    },
    {
      name: '非法 intent',
      body: { intent: 'FLY', direction: 'UP' },
      expectStatus: 400
    },
    {
      name: '超长 duration',
      body: { intent: 'MOVE', direction: 'F', duration_ms: 99999 },
      expectStatus: 400
    },
    {
      name: '缺少 direction',
      body: { intent: 'MOVE' },
      expectStatus: 200  // 应使用默认值或校验失败
    },
    {
      name: 'STOP 无需参数',
      body: { intent: 'STOP' },
      expectStatus: 200
    }
  ]
  
  for (const test of tests) {
    const res = await fetch(`${BASE_URL}/api/intent/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(test.body)
    })
    
    const pass = res.status === test.expectStatus
    log(pass ? 'ok' : 'fail', 
      `  ${test.name}: ${res.status} ${pass ? '✓' : `(预期 ${test.expectStatus})`}`)
  }
}

// 测试 5: 性能基准
async function testPerformance() {
  console.log('\n' + '='.repeat(60))
  log('info', '测试 5: 性能基准（平均响应时间）')
  console.log('='.repeat(60))
  
  const iterations = 20
  const times = []
  
  for (let i = 0; i < iterations; i++) {
    const start = Date.now()
    await fetch(`${BASE_URL}/api/state`, { method: 'GET' })
    times.push(Date.now() - start)
    await sleep(100)  // 避免触发限流
  }
  
  const avg = times.reduce((a, b) => a + b, 0) / times.length
  const min = Math.min(...times)
  const max = Math.max(...times)
  
  log('info', `  平均: ${avg.toFixed(2)}ms`)
  log('info', `  最小: ${min}ms`)
  log('info', `  最大: ${max}ms`)
  
  if (avg < 100) {
    log('ok', '性能优秀（< 100ms）')
  } else if (avg < 500) {
    log('ok', '性能良好（< 500ms）')
  } else {
    log('warn', '性能需要优化（> 500ms）')
  }
}

// 运行所有测试
async function runAllTests() {
  console.log('\n' + '━'.repeat(60))
  console.log('  Simo 压力测试和性能评估')
  console.log('━'.repeat(60))
  
  try {
    await testRateLimit()
    await sleep(2000)  // 等待速率限制恢复
    
    await testWebSocketConcurrency()
    await sleep(1000)
    
    await testLongConnection()
    await sleep(1000)
    
    await testEdgeCases()
    await sleep(1000)
    
    await testPerformance()
    
    console.log('\n' + '━'.repeat(60))
    log('ok', '所有测试完成')
    console.log('━'.repeat(60) + '\n')
    
  } catch (error) {
    log('fail', `测试失败: ${error.message}`)
    console.error(error)
  }
}

runAllTests()
