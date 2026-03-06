/**
 * Simo 性能监控工具
 * 实时监控服务器性能指标并生成报告
 * 
 * 运行: node server/tools/performance-monitor.js
 */

import os from 'os'

class PerformanceMonitor {
  constructor() {
    this.metrics = {
      requests: {
        total: 0,
        success: 0,
        failed: 0,
        byEndpoint: new Map()
      },
      timing: {
        min: Infinity,
        max: 0,
        total: 0,
        count: 0
      },
      websocket: {
        connections: 0,
        messages: 0,
        errors: 0
      },
      system: {
        cpu: [],
        memory: []
      }
    }
    
    this.startTime = Date.now()
  }
  
  /**
   * 记录 HTTP 请求
   */
  recordRequest(endpoint, duration, success = true) {
    this.metrics.requests.total++
    if (success) {
      this.metrics.requests.success++
    } else {
      this.metrics.requests.failed++
    }
    
    // 按端点统计
    if (!this.metrics.requests.byEndpoint.has(endpoint)) {
      this.metrics.requests.byEndpoint.set(endpoint, { count: 0, totalTime: 0 })
    }
    const endpointStats = this.metrics.requests.byEndpoint.get(endpoint)
    endpointStats.count++
    endpointStats.totalTime += duration
    
    // 时延统计
    this.metrics.timing.min = Math.min(this.metrics.timing.min, duration)
    this.metrics.timing.max = Math.max(this.metrics.timing.max, duration)
    this.metrics.timing.total += duration
    this.metrics.timing.count++
  }
  
  /**
   * 记录 WebSocket 事件
   */
  recordWebSocket(event, data = {}) {
    switch (event) {
      case 'connection':
        this.metrics.websocket.connections++
        break
      case 'message':
        this.metrics.websocket.messages++
        break
      case 'error':
        this.metrics.websocket.errors++
        break
    }
  }
  
  /**
   * 采集系统指标
   */
  collectSystemMetrics() {
    const cpuUsage = os.loadavg()[0] / os.cpus().length * 100
    const totalMem = os.totalmem()
    const freeMem = os.freemem()
    const memUsage = ((totalMem - freeMem) / totalMem) * 100
    
    this.metrics.system.cpu.push(cpuUsage)
    this.metrics.system.memory.push(memUsage)
    
    // 保留最近 60 个样本（1分钟，每秒采样）
    if (this.metrics.system.cpu.length > 60) {
      this.metrics.system.cpu.shift()
      this.metrics.system.memory.shift()
    }
  }
  
  /**
   * 生成报告
   */
  generateReport() {
    const uptime = (Date.now() - this.startTime) / 1000
    const avgResponseTime = this.metrics.timing.count > 0 
      ? this.metrics.timing.total / this.metrics.timing.count 
      : 0
    
    const avgCpu = this.metrics.system.cpu.length > 0
      ? this.metrics.system.cpu.reduce((a, b) => a + b, 0) / this.metrics.system.cpu.length
      : 0
    
    const avgMem = this.metrics.system.memory.length > 0
      ? this.metrics.system.memory.reduce((a, b) => a + b, 0) / this.metrics.system.memory.length
      : 0
    
    const report = {
      uptime: `${uptime.toFixed(2)}s`,
      requests: {
        total: this.metrics.requests.total,
        success: this.metrics.requests.success,
        failed: this.metrics.requests.failed,
        successRate: this.metrics.requests.total > 0 
          ? ((this.metrics.requests.success / this.metrics.requests.total) * 100).toFixed(2) + '%'
          : '0%',
        rps: (this.metrics.requests.total / uptime).toFixed(2)
      },
      timing: {
        avg: `${avgResponseTime.toFixed(2)}ms`,
        min: this.metrics.timing.min === Infinity ? 0 : `${this.metrics.timing.min}ms`,
        max: `${this.metrics.timing.max}ms`
      },
      websocket: {
        connections: this.metrics.websocket.connections,
        messages: this.metrics.websocket.messages,
        errors: this.metrics.websocket.errors
      },
      system: {
        cpu: `${avgCpu.toFixed(2)}%`,
        memory: `${avgMem.toFixed(2)}%`,
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version
      },
      topEndpoints: this.getTopEndpoints(5)
    }
    
    return report
  }
  
  /**
   * 获取最繁忙的端点
   */
  getTopEndpoints(limit = 5) {
    const endpoints = Array.from(this.metrics.requests.byEndpoint.entries())
      .map(([endpoint, stats]) => ({
        endpoint,
        count: stats.count,
        avgTime: (stats.totalTime / stats.count).toFixed(2)
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)
    
    return endpoints
  }
  
  /**
   * 打印报告
   */
  printReport() {
    const report = this.generateReport()
    
    console.log('\n' + '='.repeat(60))
    console.log('  📊 Simo 性能监控报告')
    console.log('='.repeat(60))
    
    console.log(`\n⏱️  运行时间: ${report.uptime}`)
    
    console.log('\n📨 HTTP 请求统计:')
    console.log(`  总请求: ${report.requests.total}`)
    console.log(`  成功: ${report.requests.success}`)
    console.log(`  失败: ${report.requests.failed}`)
    console.log(`  成功率: ${report.requests.successRate}`)
    console.log(`  QPS: ${report.requests.rps}`)
    
    console.log('\n⏲️  响应时间:')
    console.log(`  平均: ${report.timing.avg}`)
    console.log(`  最小: ${report.timing.min}`)
    console.log(`  最大: ${report.timing.max}`)
    
    console.log('\n🔌 WebSocket:')
    console.log(`  连接数: ${report.websocket.connections}`)
    console.log(`  消息数: ${report.websocket.messages}`)
    console.log(`  错误数: ${report.websocket.errors}`)
    
    console.log('\n💻 系统资源:')
    console.log(`  平台: ${report.system.platform} ${report.system.arch}`)
    console.log(`  Node: ${report.system.nodeVersion}`)
    console.log(`  CPU: ${report.system.cpu}`)
    console.log(`  内存: ${report.system.memory}`)
    
    if (report.topEndpoints.length > 0) {
      console.log('\n🔥 热门端点:')
      report.topEndpoints.forEach((ep, i) => {
        console.log(`  ${i + 1}. ${ep.endpoint} - ${ep.count} 次 (平均 ${ep.avgTime}ms)`)
      })
    }
    
    console.log('\n' + '='.repeat(60))
  }
  
  /**
   * 启动周期性采集
   */
  startPeriodicCollection(intervalSec = 1) {
    setInterval(() => {
      this.collectSystemMetrics()
    }, intervalSec * 1000)
  }
  
  /**
   * 启动周期性报告
   */
  startPeriodicReport(intervalSec = 60) {
    setInterval(() => {
      this.printReport()
    }, intervalSec * 1000)
  }
}

// 导出单例
export const monitor = new PerformanceMonitor()

// 如果直接运行此脚本，进行模拟测试
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('🚀 启动性能监控模拟测试...\n')
  
  monitor.startPeriodicCollection(1)
  
  // 模拟一些请求
  const endpoints = ['/api/state', '/api/hardware/status', '/api/intent/execute', '/api/hardware/sensors']
  
  const simulateRequests = () => {
    const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)]
    const duration = Math.random() * 50 + 1  // 1-51ms
    const success = Math.random() > 0.05  // 95% 成功率
    
    monitor.recordRequest(endpoint, duration, success)
  }
  
  // 每 100ms 模拟一个请求
  const requestInterval = setInterval(simulateRequests, 100)
  
  // 模拟一些 WebSocket 事件
  const simulateWebSocket = () => {
    monitor.recordWebSocket('connection')
    setTimeout(() => {
      for (let i = 0; i < Math.floor(Math.random() * 10); i++) {
        monitor.recordWebSocket('message')
      }
    }, 1000)
  }
  
  setInterval(simulateWebSocket, 5000)
  
  // 每 10 秒打印一次报告
  monitor.startPeriodicReport(10)
  
  // 30 秒后停止
  setTimeout(() => {
    clearInterval(requestInterval)
    console.log('\n✅ 模拟测试完成，生成最终报告：')
    monitor.printReport()
    process.exit(0)
  }, 30000)
}
