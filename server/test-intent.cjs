/**
 * Simo L2.5 意图层测试脚本
 * 测试 30 句真实控制话语
 * 
 * 运行: node server/test-intent.cjs
 */

// 模拟 ES Module 导入（CommonJS 兼容）
const IntentType = {
  MOVE: 'MOVE',
  TURN: 'TURN',
  STOP: 'STOP',
  QUERY: 'QUERY',
  NONE: 'NONE'
};

const DurationPresets = {
  SHORT: 400,
  MEDIUM: 800,
  LONG: 1200
};

const ConfidenceThreshold = {
  EXECUTE: 0.8,
  WARN: 0.6
};

// 本地解析函数（复制自 intent.parser.js）
function parseIntentLocal(userText) {
  const text = userText.trim().toLowerCase();
  
  // STOP 关键词（最高优先级）
  const stopKeywords = ['停', '别动', '等等', '暂停', '停下', '停止', 'stop'];
  for (const kw of stopKeywords) {
    if (text.includes(kw)) {
      return {
        intent: IntentType.STOP,
        direction: null,
        duration_ms: null,
        confidence: 0.95,
        raw_text: userText
      };
    }
  }
  
  // 判断持续时间（先判断长，再判断短，避免"远一点"被"一点"匹配）
  let duration = DurationPresets.MEDIUM;
  if (/多|远|久|大|快/.test(text)) {
    duration = DurationPresets.LONG;
  } else if (/一点|一下|稍微|轻轻/.test(text)) {
    duration = DurationPresets.SHORT;
  }
  
  // 前进
  if (/前进|往前|向前|前走|go|forward/.test(text)) {
    return {
      intent: IntentType.MOVE,
      direction: 'F',
      duration_ms: duration,
      confidence: 0.9,
      raw_text: userText
    };
  }
  
  // 后退
  if (/后退|往后|向后|退|back/.test(text)) {
    return {
      intent: IntentType.MOVE,
      direction: 'B',
      duration_ms: duration,
      confidence: 0.9,
      raw_text: userText
    };
  }
  
  // 左转
  if (/左转|向左|往左|left/.test(text)) {
    return {
      intent: IntentType.TURN,
      direction: 'L',
      duration_ms: duration,
      confidence: 0.9,
      raw_text: userText
    };
  }
  
  // 右转
  if (/右转|向右|往右|right/.test(text)) {
    return {
      intent: IntentType.TURN,
      direction: 'R',
      duration_ms: duration,
      confidence: 0.9,
      raw_text: userText
    };
  }
  
  // 无法本地匹配
  return {
    intent: IntentType.NONE,
    direction: null,
    duration_ms: null,
    confidence: 0.3,
    raw_text: userText
  };
}

// 状态机守卫
let currentState = 'idle';

function shouldExecute(intentObj) {
  // STOP 永远执行
  if (intentObj.intent === IntentType.STOP) {
    currentState = 'idle';
    return { execute: true, reason: 'STOP 命令' };
  }
  
  // NONE 永远不执行
  if (intentObj.intent === IntentType.NONE) {
    return { execute: false, reason: '意图不明确' };
  }
  
  // 置信度不足
  if (intentObj.confidence < ConfidenceThreshold.EXECUTE) {
    return { execute: false, reason: `置信度不足 (${intentObj.confidence})` };
  }
  
  // 移动中不接受新命令
  if (currentState === 'moving') {
    return { execute: false, reason: '正在移动中' };
  }
  
  // 可以执行
  currentState = 'moving';
  setTimeout(() => { currentState = 'idle'; }, 100);
  return { execute: true, reason: '允许执行' };
}

// 测试用例（30 句真实控制话语）
const testCases = [
  // STOP 测试（必须 100% 命中）
  { text: '停', expect: 'STOP' },
  { text: '停下', expect: 'STOP' },
  { text: '停止', expect: 'STOP' },
  { text: '别动', expect: 'STOP' },
  { text: '等等', expect: 'STOP' },
  { text: '暂停', expect: 'STOP' },
  
  // 前进测试
  { text: '前进', expect: 'MOVE', dir: 'F', dur: 800 },
  { text: '往前走', expect: 'MOVE', dir: 'F', dur: 800 },
  { text: '向前', expect: 'MOVE', dir: 'F', dur: 800 },
  { text: '往前一点', expect: 'MOVE', dir: 'F', dur: 400 },
  { text: '前进多一些', expect: 'MOVE', dir: 'F', dur: 1200 },
  
  // 后退测试
  { text: '后退', expect: 'MOVE', dir: 'B', dur: 800 },
  { text: '往后', expect: 'MOVE', dir: 'B', dur: 800 },
  { text: '退一下', expect: 'MOVE', dir: 'B', dur: 400 },
  { text: '后退远一点', expect: 'MOVE', dir: 'B', dur: 1200 },
  
  // 左转测试
  { text: '左转', expect: 'TURN', dir: 'L', dur: 800 },
  { text: '向左', expect: 'TURN', dir: 'L', dur: 800 },
  { text: '往左一点', expect: 'TURN', dir: 'L', dur: 400 },
  { text: '左转多一些', expect: 'TURN', dir: 'L', dur: 1200 },
  
  // 右转测试
  { text: '右转', expect: 'TURN', dir: 'R', dur: 800 },
  { text: '向右', expect: 'TURN', dir: 'R', dur: 800 },
  { text: '往右一下', expect: 'TURN', dir: 'R', dur: 400 },
  
  // 应该拒绝的（NONE）
  { text: '随便动动', expect: 'NONE' },
  { text: '你觉得呢', expect: 'NONE' },
  { text: '今天天气怎么样', expect: 'NONE' },
  { text: '跳舞', expect: 'NONE' },
  { text: '自己走', expect: 'NONE' },
  { text: '跟着我', expect: 'NONE' },
  { text: '避开障碍物', expect: 'NONE' },
  { text: '帮我倒杯水', expect: 'NONE' }
];

// 运行测试
console.log('========================================');
console.log('Simo L2.5 意图层测试');
console.log('========================================\n');

let passed = 0;
let failed = 0;
let stopPassed = 0;
let stopTotal = 0;

for (const tc of testCases) {
  const intent = parseIntentLocal(tc.text);
  const decision = shouldExecute(intent);
  
  // 检查意图类型
  const intentMatch = intent.intent === tc.expect;
  
  // 检查方向和时长（如果有期望值）
  let dirMatch = true;
  let durMatch = true;
  if (tc.dir) dirMatch = intent.direction === tc.dir;
  if (tc.dur) durMatch = intent.duration_ms === tc.dur;
  
  const allMatch = intentMatch && dirMatch && durMatch;
  
  // 统计 STOP
  if (tc.expect === 'STOP') {
    stopTotal++;
    if (intentMatch) stopPassed++;
  }
  
  if (allMatch) {
    passed++;
    console.log(`✅ "${tc.text}"`);
    console.log(`   → ${intent.intent} ${intent.direction || ''} ${intent.duration_ms || ''}`);
    console.log(`   → 执行: ${decision.execute ? '是' : '否'} (${decision.reason})`);
  } else {
    failed++;
    console.log(`❌ "${tc.text}"`);
    console.log(`   期望: ${tc.expect} ${tc.dir || ''} ${tc.dur || ''}`);
    console.log(`   实际: ${intent.intent} ${intent.direction || ''} ${intent.duration_ms || ''}`);
  }
  console.log('');
  
  // 重置状态
  currentState = 'idle';
}

console.log('========================================');
console.log(`测试结果: ${passed}/${testCases.length} 通过`);
console.log(`STOP 命中率: ${stopPassed}/${stopTotal} (${(stopPassed/stopTotal*100).toFixed(0)}%)`);
console.log('========================================');

if (stopPassed === stopTotal && failed === 0) {
  console.log('\n🎉 全部通过！可以进入下一阶段');
  process.exit(0);
} else {
  console.log('\n⚠️ 存在失败，需要修复');
  process.exit(1);
}
