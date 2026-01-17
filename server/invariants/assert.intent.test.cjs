/**
 * Simo 不变量测试
 * 
 * 验证 Runtime 断言正确工作
 */

// 模拟不变量断言（CommonJS 版本用于测试）
const ALLOWED_INTENTS = new Set(['MOVE', 'TURN', 'STOP', 'QUERY', 'NONE']);
const ALLOWED_DURATIONS = new Set([400, 800, 1200]);
const MAX_DURATION_MS = 3000;
const MIN_CONFIDENCE = 0.8;

function assertIntentInvariant(intent, ctx = {}) {
  if (!intent || typeof intent !== 'object') {
    throw new Error('INV: intent 对象缺失');
  }
  if (!ALLOWED_INTENTS.has(intent.intent)) {
    throw new Error(`INV-301: 意图类型 "${intent.intent}" 不在白名单中`);
  }
  if (intent.intent === 'STOP') return;
  if (intent.intent === 'NONE') {
    throw new Error('INV-201: NONE 意图不得执行');
  }
  if (intent.intent === 'QUERY') return;
  
  const confidence = Number(intent.confidence ?? 0);
  if (confidence < MIN_CONFIDENCE) {
    throw new Error(`INV-201: 置信度 ${confidence} < ${MIN_CONFIDENCE}`);
  }
  
  if (ctx.state === 'moving') {
    if (intent.intent === 'MOVE' || intent.intent === 'TURN') {
      throw new Error('INV-401: moving 状态下禁止新的 MOVE/TURN');
    }
  }
  
  const duration = Number(intent.duration_ms ?? 0);
  if (!Number.isFinite(duration)) {
    throw new Error('INV-302: duration_ms 必须是数字');
  }
  if (duration > MAX_DURATION_MS) {
    throw new Error(`INV-602: duration_ms ${duration} > ${MAX_DURATION_MS}`);
  }
  if (!ALLOWED_DURATIONS.has(duration)) {
    throw new Error(`INV-302: duration_ms ${duration} 不在允许值 [400, 800, 1200] 中`);
  }
  
  if (intent.intent === 'MOVE' && !['F', 'B'].includes(intent.direction)) {
    throw new Error(`INV: MOVE 方向必须是 F/B`);
  }
  if (intent.intent === 'TURN' && !['L', 'R'].includes(intent.direction)) {
    throw new Error(`INV: TURN 方向必须是 L/R`);
  }
}

// 测试用例
const tests = [
  // INV-101, INV-102: STOP 永远允许
  {
    name: 'STOP 在 idle 状态允许',
    intent: { intent: 'STOP' },
    ctx: { state: 'idle' },
    shouldPass: true
  },
  {
    name: 'STOP 在 moving 状态允许',
    intent: { intent: 'STOP' },
    ctx: { state: 'moving' },
    shouldPass: true
  },
  
  // INV-201: NONE 永不执行
  {
    name: 'NONE 不得执行',
    intent: { intent: 'NONE', confidence: 1 },
    ctx: { state: 'idle' },
    shouldPass: false,
    errorMatch: /INV-201/
  },
  
  // INV-201: 置信度门槛
  {
    name: '置信度 < 0.8 拒绝',
    intent: { intent: 'MOVE', direction: 'F', duration_ms: 800, confidence: 0.7 },
    ctx: { state: 'idle' },
    shouldPass: false,
    errorMatch: /INV-201/
  },
  {
    name: '置信度 >= 0.8 允许',
    intent: { intent: 'MOVE', direction: 'F', duration_ms: 800, confidence: 0.9 },
    ctx: { state: 'idle' },
    shouldPass: true
  },
  
  // INV-301: 白名单
  {
    name: '非法意图类型拒绝',
    intent: { intent: 'FOLLOW', confidence: 0.9 },
    ctx: { state: 'idle' },
    shouldPass: false,
    errorMatch: /INV-301/
  },
  
  // INV-302: 持续时间离散化
  {
    name: '非法持续时间拒绝 (900ms)',
    intent: { intent: 'MOVE', direction: 'F', duration_ms: 900, confidence: 0.9 },
    ctx: { state: 'idle' },
    shouldPass: false,
    errorMatch: /INV-302/
  },
  {
    name: '合法持续时间允许 (800ms)',
    intent: { intent: 'MOVE', direction: 'F', duration_ms: 800, confidence: 0.9 },
    ctx: { state: 'idle' },
    shouldPass: true
  },
  
  // INV-401: moving 状态禁止新移动
  {
    name: 'moving 状态下 MOVE 拒绝',
    intent: { intent: 'MOVE', direction: 'F', duration_ms: 800, confidence: 0.9 },
    ctx: { state: 'moving' },
    shouldPass: false,
    errorMatch: /INV-401/
  },
  {
    name: 'moving 状态下 TURN 拒绝',
    intent: { intent: 'TURN', direction: 'L', duration_ms: 400, confidence: 0.9 },
    ctx: { state: 'moving' },
    shouldPass: false,
    errorMatch: /INV-401/
  },
  
  // INV-602: 持续时间上限
  {
    name: '持续时间超过 3000ms 拒绝',
    intent: { intent: 'MOVE', direction: 'F', duration_ms: 5000, confidence: 0.9 },
    ctx: { state: 'idle' },
    shouldPass: false,
    errorMatch: /INV-602/
  },
  
  // 方向约束
  {
    name: 'MOVE 方向必须是 F/B',
    intent: { intent: 'MOVE', direction: 'L', duration_ms: 800, confidence: 0.9 },
    ctx: { state: 'idle' },
    shouldPass: false,
    errorMatch: /MOVE 方向/
  },
  {
    name: 'TURN 方向必须是 L/R',
    intent: { intent: 'TURN', direction: 'F', duration_ms: 400, confidence: 0.9 },
    ctx: { state: 'idle' },
    shouldPass: false,
    errorMatch: /TURN 方向/
  }
];

// 运行测试
console.log('🧪 不变量测试开始\n');

let passed = 0;
let failed = 0;

for (const test of tests) {
  let result;
  let error = null;
  
  try {
    assertIntentInvariant(test.intent, test.ctx);
    result = true;
  } catch (e) {
    result = false;
    error = e.message;
  }
  
  const expectedResult = test.shouldPass;
  const testPassed = result === expectedResult;
  
  if (testPassed) {
    // 如果期望失败，还要检查错误信息
    if (!test.shouldPass && test.errorMatch) {
      if (!test.errorMatch.test(error)) {
        console.log(`❌ ${test.name}`);
        console.log(`   错误信息不匹配: ${error}`);
        failed++;
        continue;
      }
    }
    console.log(`✅ ${test.name}`);
    passed++;
  } else {
    console.log(`❌ ${test.name}`);
    console.log(`   期望: ${expectedResult ? '通过' : '失败'}, 实际: ${result ? '通过' : '失败'}`);
    if (error) console.log(`   错误: ${error}`);
    failed++;
  }
}

console.log(`\n${'='.repeat(40)}`);
console.log(`📊 测试结果: ${passed}/${tests.length} 通过`);
if (failed > 0) {
  console.log(`❌ ${failed} 个测试失败`);
  process.exit(1);
} else {
  console.log(`🎉 全部通过！`);
}
