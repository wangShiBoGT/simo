#!/usr/bin/env node
/**
 * Simo 冒烟测试脚本
 * 
 * 快速验证核心API是否正常工作
 * 用法: node scripts/smoke-test.js [server_url]
 * 
 * @version 1.0.0
 * @date 2026-01-26
 */

const SERVER_URL = process.argv[2] || 'http://localhost:3001'

// 测试用例定义
const tests = [
  {
    name: 'Node后端在线',
    endpoint: '/api/hardware/status',
    method: 'GET',
    expect: (res) => res.level !== undefined
  },
  {
    name: 'ESP32设备列表',
    endpoint: '/api/esp32/devices',
    method: 'GET',
    expect: (res) => Array.isArray(res.devices)
  },
  {
    name: 'OTA检查API',
    endpoint: '/api/ota/check?version=2.4.0',
    method: 'GET',
    expect: (res) => typeof res.update === 'boolean'
  },
  {
    name: 'ESP32设备注册',
    endpoint: '/api/esp32/register',
    method: 'POST',
    body: { mac: 'TEST:00:00:00:00:00', ip: '127.0.0.1', version: 'test', uptime: 0 },
    expect: (res) => res.success === true
  }
]

// 颜色输出
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
}

async function runTest(test) {
  const url = `${SERVER_URL}${test.endpoint}`
  const options = {
    method: test.method,
    headers: { 'Content-Type': 'application/json' }
  }
  
  if (test.body) {
    options.body = JSON.stringify(test.body)
  }
  
  try {
    const start = Date.now()
    const response = await fetch(url, options)
    const duration = Date.now() - start
    
    if (!response.ok) {
      return { pass: false, error: `HTTP ${response.status}`, duration }
    }
    
    const data = await response.json()
    const pass = test.expect(data)
    
    return { pass, data, duration }
  } catch (error) {
    return { pass: false, error: error.message, duration: 0 }
  }
}

async function main() {
  console.log(`${colors.bold}Simo 冒烟测试${colors.reset}`)
  console.log(`服务器: ${SERVER_URL}`)
  console.log('─'.repeat(50))
  
  let passed = 0
  let failed = 0
  
  for (const test of tests) {
    process.stdout.write(`  ${test.name}... `)
    
    const result = await runTest(test)
    
    if (result.pass) {
      console.log(`${colors.green}✓ PASS${colors.reset} (${result.duration}ms)`)
      passed++
    } else {
      console.log(`${colors.red}✗ FAIL${colors.reset} ${result.error || ''}`)
      failed++
    }
  }
  
  console.log('─'.repeat(50))
  console.log(`结果: ${colors.green}${passed} 通过${colors.reset}, ${colors.red}${failed} 失败${colors.reset}`)
  
  // 退出码
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(console.error)
