/**
 * Simo L2.6 确认层测试脚本
 * 
 * 测试 20 轮"危险但合法"的语音场景
 */

const BASE_URL = 'http://localhost:3001';

async function callIntent(text) {
  const res = await fetch(`${BASE_URL}/api/intent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });
  return res.json();
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// 测试用例（核心场景）
const testCases = [
  // 1. 长时间移动需确认 + 确认执行
  {
    name: '长时间前进→确认→执行',
    steps: [
      { text: '往前走久一点', expect: { status: 'ASKED' } },
      { text: '是', expect: { status: 'CONFIRMED' } }
    ]
  },
  // 2. 长时间移动需确认 + 取消
  {
    name: '长时间前进→取消',
    steps: [
      { text: '往前走远一点', expect: { status: 'ASKED' } },
      { text: '不要', expect: { status: 'CANCELLED' } }
    ]
  },
  // 3. STOP 抢占确认态
  {
    name: 'STOP抢占确认态',
    steps: [
      { text: '往前走久一点', expect: { status: 'ASKED' } },
      { text: '停', expect: { status: 'FORCE_STOPPED' } }
    ]
  },
  // 4. STOP 永远直接执行
  {
    name: 'STOP永远直接执行',
    steps: [
      { text: '停', expect: { status: 'EXECUTED' } }
    ]
  },
  // 5. 超时自动取消
  {
    name: '超时自动取消',
    steps: [
      { text: '往前走久一点', expect: { status: 'ASKED' } },
      { wait: 5500 },
      { text: '是', expect: { status: 'EXPIRED' } }
    ]
  },
  // 6. 确认态下新意图被忽略
  {
    name: '确认态下新意图被忽略',
    steps: [
      { text: '往前走久一点', expect: { status: 'ASKED' } },
      { text: '左转', expect: { status: 'IGNORED' } },
      { text: '算了', expect: { status: 'CANCELLED' } }
    ]
  },
  // 7. 确认词变体-好的
  {
    name: '确认词变体-好的',
    steps: [
      { text: '往前走久一点', expect: { status: 'ASKED' } },
      { text: '好的', expect: { status: 'CONFIRMED' } }
    ]
  },
  // 8. 取消词变体-算了
  {
    name: '取消词变体-算了',
    steps: [
      { text: '往前走久一点', expect: { status: 'ASKED' } },
      { text: '算了', expect: { status: 'CANCELLED' } }
    ]
  },
  // 9. 无关回复被忽略
  {
    name: '无关回复被忽略',
    steps: [
      { text: '往前走久一点', expect: { status: 'ASKED' } },
      { text: '今天天气怎么样', expect: { status: 'IGNORED' } },
      { text: '不', expect: { status: 'CANCELLED' } }
    ]
  },
  // 10. 后退确认
  {
    name: '长时间后退→确认',
    steps: [
      { text: '后退远一点', expect: { status: 'ASKED' } },
      { text: '好', expect: { status: 'CONFIRMED' } }
    ]
  }
];

async function runTests() {
  console.log('🧪 L2.6 确认层测试开始\n');
  
  let passed = 0;
  let failed = 0;
  
  for (const tc of testCases) {
    console.log(`📋 ${tc.name}`);
    let testPassed = true;
    
    // 每个测试开始前发送 STOP 重置状态
    await callIntent('停');
    await sleep(300);
    
    for (const step of tc.steps) {
      if (step.wait) {
        console.log(`   ⏳ 等待 ${step.wait}ms...`);
        await sleep(step.wait);
        continue;
      }
      
      const result = await callIntent(step.text);
      // 获取状态：优先从 confirm，其次从 mode
      const status = result.confirm?.status;
      
      if (step.expect?.status && status !== step.expect.status) {
        console.log(`   ❌ "${step.text}" → ${status} (期望: ${step.expect.status})`);
        testPassed = false;
      } else {
        console.log(`   ✅ "${step.text}" → ${status}`);
      }
      
      await sleep(200);
    }
    
    if (testPassed) {
      passed++;
    } else {
      failed++;
    }
    
    // 每个测试后等待一下，确保状态重置
    await sleep(300);
  }
  
  console.log(`\n${'='.repeat(40)}`);
  console.log(`📊 测试结果: ${passed}/${testCases.length} 通过`);
  if (failed > 0) {
    console.log(`❌ ${failed} 个测试失败`);
  } else {
    console.log(`🎉 全部通过！`);
  }
}

runTests().catch(console.error);
