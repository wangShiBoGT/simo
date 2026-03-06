/**
 * Simo 自主运行启动脚本
 * 
 * 功能：让 Simo 自己控制自己，无需人工指令
 * - 自动避障
 * - 自主探索
 * - 传感器驱动行为
 */

// Node.js 18+ 内置 fetch，无需导入

const SIMO_URL = 'http://localhost:3001';

async function startAutoRun() {
  console.log('🚀 启动 Simo 自主运行模式...\n');
  
  try {
    // 1. 检查服务器状态
    console.log('📡 检查 Simo 服务器...');
    const statusRes = await fetch(`${SIMO_URL}/api/state`);
    const status = await statusRes.json();
    console.log(`✅ 服务器在线: ${status.state}\n`);
    
    // 2. 启动自主避障模式
    console.log('🤖 启动自主避障模式（exploring）...');
    const autonomyRes = await fetch(`${SIMO_URL}/api/autonomy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start', mode: 'exploring' })
    });
    const autonomy = await autonomyRes.json();
    console.log(`✅ ${autonomy.message}\n`);
    
    // 3. 显示自主模式信息
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎯 Simo 现在进入自主运行模式');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    console.log('工作模式：');
    console.log('  • 每 500ms 自动扫描传感器');
    console.log('  • 距离 > 50cm → 前进');
    console.log('  • 距离 < 30cm → 扫描并转向安全方向');
    console.log('  • 距离 < 15cm → 紧急停止+后退\n');
    
    console.log('安全机制：');
    console.log('  • 人类随时可喊停（发送 STOP）');
    console.log('  • 所有动作经过安全检查');
    console.log('  • 速度限制：80% 功率\n');
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // 4. 开始监控循环
    console.log('📊 实时监控（每 2 秒刷新）\n');
    
    let iteration = 0;
    const monitorInterval = setInterval(async () => {
      try {
        iteration++;
        
        // 获取自主模式状态
        const stateRes = await fetch(`${SIMO_URL}/api/autonomy`);
        const state = await stateRes.json();
        
        // 获取传感器数据
        const sensorRes = await fetch(`${SIMO_URL}/api/hardware/sensors`);
        const sensors = await sensorRes.json();
        
        // 显示状态
        console.clear();
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🤖 Simo 自主运行中...');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        
        console.log(`⏱️  运行时间: ${iteration * 2} 秒`);
        console.log(`🎮 模式: ${state.mode}`);
        console.log(`📡 状态: ${state.enabled ? '运行中' : '已停止'}\n`);
        
        console.log('📊 传感器数据:');
        if (sensors.ultrasonic) {
          const dist = sensors.ultrasonic.distance;
          const status = dist > 50 ? '✅ 安全' : dist > 30 ? '⚠️  警戒' : '🚨 危险';
          console.log(`  超声波: ${dist}cm ${status}`);
        } else {
          console.log('  超声波: 无数据');
        }
        
        if (sensors.infrared) {
          const irL = sensors.infrared.left === 1 ? '✅' : '🚨';
          const irR = sensors.infrared.right === 1 ? '✅' : '🚨';
          console.log(`  红外左: ${irL} (${sensors.infrared.left})`);
          console.log(`  红外右: ${irR} (${sensors.infrared.right})`);
        }
        
        console.log('\n💡 提示:');
        console.log('  • Ctrl+C 退出监控（自主模式继续运行）');
        console.log('  • 停止自主: curl -X POST http://localhost:3001/api/autonomy/stop');
        console.log('  • 紧急停止: curl -X POST http://localhost:3001/api/intent/stop\n');
        
        // 如果自主模式已停止，退出监控
        if (!state.enabled) {
          console.log('⚠️  自主模式已停止，退出监控');
          clearInterval(monitorInterval);
        }
        
      } catch (error) {
        console.error('❌ 监控错误:', error.message);
      }
    }, 2000);
    
    // 优雅退出
    process.on('SIGINT', () => {
      console.log('\n\n👋 监控已退出');
      console.log('💡 Simo 仍在自主运行中\n');
      console.log('停止自主运行:');
      console.log('  curl -X POST http://localhost:3001/api/autonomy/stop\n');
      clearInterval(monitorInterval);
      process.exit(0);
    });
    
  } catch (error) {
    console.error('❌ 启动失败:', error.message);
    console.log('\n💡 确保 Simo 服务器正在运行:');
    console.log('  node server/index.js\n');
    process.exit(1);
  }
}

// 如果提供了命令行参数
const command = process.argv[2];

if (command === 'stop') {
  // 停止自主运行
  fetch(`${SIMO_URL}/api/autonomy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'stop' })
  })
    .then(res => res.json())
    .then(data => {
      console.log('🛑 停止自主运行');
      console.log(`✅ ${data.message}`);
    })
    .catch(err => {
      console.error('❌ 停止失败:', err.message);
    });
} else if (command === 'status') {
  // 查询状态
  fetch(`${SIMO_URL}/api/autonomy`)
    .then(res => res.json())
    .then(state => {
      console.log('📊 自主运行状态:');
      console.log(`  启用: ${state.enabled ? '是' : '否'}`);
      console.log(`  模式: ${state.mode}`);
      if (state.lastScan) {
        console.log(`  最后扫描: L=${state.lastScan.left} C=${state.lastScan.center} R=${state.lastScan.right}`);
      }
    })
    .catch(err => {
      console.error('❌ 查询失败:', err.message);
    });
} else {
  // 默认：启动自主运行
  startAutoRun();
}
