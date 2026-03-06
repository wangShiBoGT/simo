/**
 * miniClaw 集成测试脚本
 * 演示如何使用结构化执行接口控制 Simo 小车
 * 
 * 运行: node server/tools/test-miniclaw-integration.js
 */

const BASE_URL = 'http://localhost:3001'
const TOKEN = process.env.SIMO_TOOL_TOKEN || ''  // 开发模式可为空

// 颜色输出
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
}

function log(type, msg) {
  const prefix = {
    ok: `${colors.green}✅${colors.reset}`,
    fail: `${colors.red}❌${colors.reset}`,
    info: `${colors.blue}ℹ${colors.reset}`,
    warn: `${colors.yellow}⚠${colors.reset}`
  }
  console.log(`${prefix[type] || '  '} ${msg}`)
}

// 通用请求函数
async function request(method, path, body = null) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(TOKEN && { 'X-Simo-Token': TOKEN })
    }
  }
  if (body) {
    options.body = JSON.stringify(body)
  }
  
  const response = await fetch(`${BASE_URL}${path}`, options)
  const data = await response.json()
  return { status: response.status, data }
}

// 等待函数
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

// 测试用例
const tests = [
  {
    name: '1. 获取硬件状态',
    run: async () => {
      const { status, data } = await request('GET', '/api/hardware/status')
      if (status !== 200) throw new Error(`状态码: ${status}`)
      if (!data.success) throw new Error('success 不为 true')
      log('info', `  硬件连接: motion=${data.hardware.motion.connected}, sensors=${data.hardware.sensors.connected}`)
      return true
    }
  },
  {
    name: '2. 获取机器人状态',
    run: async () => {
      const { status, data } = await request('GET', '/api/state')
      if (status !== 200) throw new Error(`状态码: ${status}`)
      log('info', `  状态: ${data.state}, 安全: ${data.safety?.state}`)
      return true
    }
  },
  {
    name: '3. 执行 MOVE F（前进短距离）',
    run: async () => {
      const { status, data } = await request('POST', '/api/intent/execute', {
        intent: 'MOVE',
        direction: 'F',
        duration_ms: 400,
        source: 'test-script'
      })
      if (status !== 200) throw new Error(`状态码: ${status}`)
      if (!data.success) throw new Error(`执行失败: ${data.error || data.decision?.reason}`)
      log('info', `  命令: ${data.confirm?.command}, 状态: ${data.state?.state}`)
      await sleep(500)  // 等待动作完成
      return true
    }
  },
  {
    name: '4. 执行 STOP（紧急停止）',
    run: async () => {
      const { status, data } = await request('POST', '/api/intent/execute', {
        intent: 'STOP',
        source: 'test-script'
      })
      if (status !== 200) throw new Error(`状态码: ${status}`)
      if (!data.success) throw new Error('STOP 执行失败')
      log('info', `  状态: ${data.state?.state}`)
      return true
    }
  },
  {
    name: '5. 参数校验 - 非法方向',
    run: async () => {
      const { status, data } = await request('POST', '/api/intent/execute', {
        intent: 'MOVE',
        direction: 'X',  // 非法方向
        source: 'test-script'
      })
      if (status !== 400) throw new Error(`应返回 400，实际: ${status}`)
      log('info', `  正确拒绝非法参数: ${data.error}`)
      return true
    }
  },
  {
    name: '6. 参数校验 - 非法意图',
    run: async () => {
      const { status, data } = await request('POST', '/api/intent/execute', {
        intent: 'DANCE',  // 非法意图
        source: 'test-script'
      })
      if (status !== 400) throw new Error(`应返回 400，实际: ${status}`)
      log('info', `  正确拒绝非法意图: ${data.error}`)
      return true
    }
  },
  {
    name: '7. 执行 TURN L（左转）',
    run: async () => {
      const { status, data } = await request('POST', '/api/intent/execute', {
        intent: 'TURN',
        direction: 'L',
        duration_ms: 400,
        source: 'test-script'
      })
      if (status !== 200) throw new Error(`状态码: ${status}`)
      if (!data.success) throw new Error(`执行失败: ${data.error || data.decision?.reason}`)
      log('info', `  命令: ${data.confirm?.command}`)
      await sleep(500)
      return true
    }
  },
  {
    name: '8. 紧急停止接口（/api/intent/stop）',
    run: async () => {
      const { status, data } = await request('POST', '/api/intent/stop')
      if (status !== 200) throw new Error(`状态码: ${status}`)
      log('info', `  执行: ${data.executed}, 状态: ${data.state?.state}`)
      return true
    }
  }
]

// 运行测试
async function runTests() {
  console.log('\n' + '='.repeat(50))
  console.log('  miniClaw 集成测试')
  console.log('='.repeat(50) + '\n')
  
  let passed = 0
  let failed = 0
  
  for (const test of tests) {
    try {
      await test.run()
      log('ok', test.name)
      passed++
    } catch (error) {
      log('fail', `${test.name}: ${error.message}`)
      failed++
    }
  }
  
  console.log('\n' + '-'.repeat(50))
  console.log(`结果: ${colors.green}${passed} 通过${colors.reset}, ${colors.red}${failed} 失败${colors.reset}`)
  console.log('-'.repeat(50) + '\n')
  
  // 演示序列
  if (failed === 0) {
    console.log('🎉 所有测试通过！\n')
    console.log('演示：执行一个简单的移动序列...\n')
    
    await request('POST', '/api/intent/execute', { intent: 'MOVE', direction: 'F', duration_ms: 400, source: 'demo' })
    log('info', '前进 400ms')
    await sleep(600)
    
    await request('POST', '/api/intent/execute', { intent: 'TURN', direction: 'R', duration_ms: 400, source: 'demo' })
    log('info', '右转 400ms')
    await sleep(600)
    
    await request('POST', '/api/intent/execute', { intent: 'MOVE', direction: 'F', duration_ms: 400, source: 'demo' })
    log('info', '前进 400ms')
    await sleep(600)
    
    await request('POST', '/api/intent/stop')
    log('info', '停止')
    
    console.log('\n✅ 演示完成\n')
  }
}

runTests().catch(console.error)
