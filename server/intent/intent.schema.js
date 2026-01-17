/**
 * Simo L2.5 意图层 - 数据结构定义
 * 
 * 核心原则：
 * - Intent 是有限集合，不允许自由扩展
 * - AI 只有建议权，没有执行权
 * - STOP 永远最高优先级
 */

// 允许的意图类型（写死，不可扩展）
export const IntentType = {
  MOVE: 'MOVE',     // 位移（前进/后退）
  TURN: 'TURN',     // 转向（左/右）
  STOP: 'STOP',     // 停止（最高优先级）
  QUERY: 'QUERY',   // 询问状态
  NONE: 'NONE'      // 无效/不确定
};

// 允许的方向
export const Direction = {
  F: 'F',  // 前进
  B: 'B',  // 后退
  L: 'L',  // 左转
  R: 'R'   // 右转
};

// 允许的持续时间档位（毫秒）- 不允许 AI 自由生成
export const DurationPresets = {
  SHORT: 400,   // 一点点
  MEDIUM: 800,  // 正常
  LONG: 1200    // 多一些
};

// 置信度阈值
export const ConfidenceThreshold = {
  EXECUTE: 0.8,   // 高于此值才执行
  WARN: 0.6       // 低于此值需要警告
};

/**
 * 创建一个空的 Intent 对象
 */
export function createEmptyIntent(rawText = '') {
  return {
    intent: IntentType.NONE,
    direction: null,
    duration_ms: null,
    confidence: 0,
    raw_text: rawText
  };
}

/**
 * 验证 Intent 对象是否合法
 */
export function validateIntent(intentObj) {
  const errors = [];
  
  // 检查 intent 类型
  if (!Object.values(IntentType).includes(intentObj.intent)) {
    errors.push(`非法的 intent 类型: ${intentObj.intent}`);
  }
  
  // 检查 direction
  if (intentObj.intent === IntentType.MOVE) {
    if (!['F', 'B'].includes(intentObj.direction)) {
      errors.push(`MOVE 只允许 F/B 方向，收到: ${intentObj.direction}`);
    }
  }
  if (intentObj.intent === IntentType.TURN) {
    if (!['L', 'R'].includes(intentObj.direction)) {
      errors.push(`TURN 只允许 L/R 方向，收到: ${intentObj.direction}`);
    }
  }
  
  // 检查 duration_ms
  if ([IntentType.MOVE, IntentType.TURN].includes(intentObj.intent)) {
    const validDurations = Object.values(DurationPresets);
    if (!validDurations.includes(intentObj.duration_ms)) {
      errors.push(`duration_ms 必须是 ${validDurations.join('/')}，收到: ${intentObj.duration_ms}`);
    }
  }
  
  // 检查 confidence
  if (typeof intentObj.confidence !== 'number' || 
      intentObj.confidence < 0 || 
      intentObj.confidence > 1) {
    errors.push(`confidence 必须是 0~1 的数字，收到: ${intentObj.confidence}`);
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * 将 Intent 转换为串口命令
 */
export function intentToCommand(intentObj) {
  switch (intentObj.intent) {
    case IntentType.STOP:
      return 'S';
    case IntentType.MOVE:
      return `${intentObj.direction},${intentObj.duration_ms}`;
    case IntentType.TURN:
      return `${intentObj.direction},${intentObj.duration_ms}`;
    default:
      return null;
  }
}
