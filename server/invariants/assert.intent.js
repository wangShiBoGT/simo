/**
 * Simo 代码级不变量 - Runtime 断言
 * 
 * 任何违反即抛出错误，视为系统缺陷
 */

// 允许的意图类型
const ALLOWED_INTENTS = new Set(['MOVE', 'TURN', 'STOP', 'QUERY', 'NONE']);

// 允许的持续时间（离散值）
const ALLOWED_DURATIONS = new Set([400, 800, 1200]);

// 最大持续时间
const MAX_DURATION_MS = 3000;

// 最小置信度
const MIN_CONFIDENCE = 0.8;

/**
 * 断言 Intent 不变量
 * @param {Object} intent - Intent 对象
 * @param {Object} ctx - 上下文 { state }
 * @throws {Error} 违反不变量时抛出
 */
export function assertIntentInvariant(intent, ctx = {}) {
  // 基本结构检查
  if (!intent || typeof intent !== 'object') {
    throw new Error('INV: intent 对象缺失');
  }

  // INV-301: 意图类型白名单
  if (!ALLOWED_INTENTS.has(intent.intent)) {
    throw new Error(`INV-301: 意图类型 "${intent.intent}" 不在白名单中`);
  }

  // STOP 永远允许（INV-101, INV-102）
  if (intent.intent === 'STOP') {
    return; // STOP 不需要任何其他检查
  }

  // INV-201: NONE 永不执行
  if (intent.intent === 'NONE') {
    throw new Error('INV-201: NONE 意图不得执行');
  }

  // QUERY 不需要执行检查
  if (intent.intent === 'QUERY') {
    return;
  }

  // INV-201: 置信度门槛
  const confidence = Number(intent.confidence ?? 0);
  if (confidence < MIN_CONFIDENCE) {
    throw new Error(`INV-201: 置信度 ${confidence} < ${MIN_CONFIDENCE}`);
  }

  // INV-401: moving 状态下禁止新移动
  if (ctx.state === 'moving') {
    if (intent.intent === 'MOVE' || intent.intent === 'TURN') {
      throw new Error('INV-401: moving 状态下禁止新的 MOVE/TURN');
    }
  }

  // INV-302: 持续时间离散化
  const duration = Number(intent.duration_ms ?? 0);
  if (!Number.isFinite(duration)) {
    throw new Error('INV-302: duration_ms 必须是数字');
  }

  // INV-602: 持续时间上限
  if (duration > MAX_DURATION_MS) {
    throw new Error(`INV-602: duration_ms ${duration} > ${MAX_DURATION_MS}`);
  }

  // INV-302: 持续时间必须是离散值
  if (!ALLOWED_DURATIONS.has(duration)) {
    throw new Error(`INV-302: duration_ms ${duration} 不在允许值 [400, 800, 1200] 中`);
  }

  // 方向约束
  if (intent.intent === 'MOVE') {
    if (!['F', 'B'].includes(intent.direction)) {
      throw new Error(`INV: MOVE 方向必须是 F/B，收到 "${intent.direction}"`);
    }
  }

  if (intent.intent === 'TURN') {
    if (!['L', 'R'].includes(intent.direction)) {
      throw new Error(`INV: TURN 方向必须是 L/R，收到 "${intent.direction}"`);
    }
  }
}

/**
 * 安全执行断言（不抛出，返回结果）
 * @param {Object} intent
 * @param {Object} ctx
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateIntent(intent, ctx = {}) {
  try {
    assertIntentInvariant(intent, ctx);
    return { valid: true };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}
