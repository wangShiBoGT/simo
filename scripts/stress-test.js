#!/usr/bin/env node
/**
 * ESP32 ↔ STM32 串口压测脚本
 * 
 * 连续发送运动命令，验证串口稳定性
 * 用法: node scripts/stress-test.js [esp32_ip] [iterations]
 * 
 * @version 1.0.0
 * @date 2026-01-26
 */

const ESP32_IP = process.argv[2] || '192.168.0.109'
const ITERATIONS = parseInt(process.argv[3]) || 100

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
}

async function sendCommand(cmd) {
  const url = `http://${ESP32_IP}/cmd?c=${encodeURIComponent(cmd)}`
  const start = Date.now()
  
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) })
    const duration = Date.now() - start
    const ok = response.ok
    return { ok, duration, status: response.status }
  } catch (error) {
    return { ok: false, duration: Date.now() - start, error: error.message }
  }
}

async function runStressTest() {
  console.log(`${colors.bold}ESP32 ↔ STM32 串口压测${colors.reset}`)
  console.log(`ESP32 IP: ${ESP32_IP}`)
  console.log(`迭代次数: ${ITERATIONS}`)
  console.log('─'.repeat(50))
  
  let passed = 0
  let failed = 0
  let totalDuration = 0
  let maxDuration = 0
  
  for (let i = 1; i <= ITERATIONS; i++) {
    // 发送前进命令
    const moveResult = await sendCommand('F,200')
    
    // 等待100ms
    await new Promise(r => setTimeout(r, 100))
    
    // 发送停止命令
    const stopResult = await sendCommand('S')
    
    const success = moveResult.ok && stopResult.ok
    const duration = moveResult.duration + stopResult.duration
    totalDuration += duration
    maxDuration = Math.max(maxDuration, duration)
    
    if (success) {
      passed++
      process.stdout.write(`\r  [${i}/${ITERATIONS}] ${colors.green}✓${colors.reset} ${duration}ms`)
    } else {
      failed++
      console.log(`\n  [${i}/${ITERATIONS}] ${colors.red}✗ FAIL${colors.reset}`)
      if (moveResult.error) console.log(`    F,200: ${moveResult.error}`)
      if (stopResult.error) console.log(`    S: ${stopResult.error}`)
    }
    
    // 间隔200ms
    await new Promise(r => setTimeout(r, 200))
  }
  
  console.log('\n' + '─'.repeat(50))
  console.log(`${colors.bold}测试结果${colors.reset}`)
  console.log(`  通过: ${colors.green}${passed}${colors.reset}`)
  console.log(`  失败: ${colors.red}${failed}${colors.reset}`)
  console.log(`  平均延迟: ${Math.round(totalDuration / ITERATIONS)}ms`)
  console.log(`  最大延迟: ${maxDuration}ms`)
  console.log(`  成功率: ${(passed / ITERATIONS * 100).toFixed(1)}%`)
  
  if (failed === 0) {
    console.log(`\n${colors.green}${colors.bold}✓ 串口连接稳定！${colors.reset}`)
  } else {
    console.log(`\n${colors.red}${colors.bold}✗ 存在通信问题，请检查连接${colors.reset}`)
  }
  
  process.exit(failed > 0 ? 1 : 0)
}

runStressTest().catch(console.error)
