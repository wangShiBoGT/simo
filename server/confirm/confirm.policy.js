/**
 * Simo L2.6 确认层 - 确认策略
 * 
 * 决定哪些意图需要人类确认
 */

/**
 * 判断是否需要确认
 * @param {Object} intent - Intent 对象
 * @param {Object} ctx - 上下文 { state, lastIntentType, lastStopAt, nowMs, turnStreak }
 * @returns {boolean}
 */
export function needConfirm(intent, ctx = {}) {
  if (!intent || !intent.intent) return false;

  // STOP 永远不需要确认（最高优先级）
  if (intent.intent === 'STOP') return false;

  // NONE 应该在 Guard 阶段被拒绝，这里保险起见
  if (intent.intent === 'NONE') return false;

  const confidence = Number(intent.confidence ?? 0);

  // 边界置信度 [0.8, 0.85) → 需要确认
  if (confidence >= 0.8 && confidence < 0.85) return true;

  // MOVE 风险规则
  if (intent.intent === 'MOVE') {
    const duration = Number(intent.duration_ms ?? 0);
    // 持续时间 > 800ms → 需要确认
    if (duration > 800) return true;
  }

  // TURN 风险规则：连续转向
  if (intent.intent === 'TURN') {
    if (ctx.lastIntentType === 'TURN' || (ctx.turnStreak && ctx.turnStreak >= 1)) {
      return true;
    }
  }

  // 刚刚 STOP 过（状态不稳定）
  if (ctx.lastStopAt) {
    const now = ctx.nowMs ?? Date.now();
    if (now - ctx.lastStopAt < 1500) return true;
  }

  // QUERY 时正在移动 → 确认是否停止
  if (intent.intent === 'QUERY' && ctx.state === 'moving') return true;

  return false;
}
