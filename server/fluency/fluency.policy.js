/**
 * Simo L2.8 熟练层 - 策略
 * 
 * 决定"什么时候可以给建议/给什么建议"
 * 只做规则，不做执行
 */

/**
 * 是否允许给"继续执行下一步"的建议
 * @param {object} ctx
 * @param {string} ctx.state - 'idle' | 'moving' | 'confirming'
 * @param {object|null} ctx.safety - {blocked, reason, source}
 */
export function canSuggest(ctx) {
  if (!ctx) return false;
  if (ctx.state !== 'idle') return false;           // 只有 idle 才建议
  if (ctx.safety?.blocked) return false;            // 安全阻止时不建议
  return true;
}

/**
 * 根据最后一次动作生成"重复建议"
 * 比如刚前进完，可以建议"继续向前走？"
 * @param {object} lastIntent - {intent, direction, duration_ms}
 */
export function buildRepeatSuggestion(lastIntent) {
  if (!lastIntent) return null;
  
  // 只建议重复 MOVE（最自然，风险最低）
  if (lastIntent.intent === 'MOVE' && 
      (lastIntent.direction === 'F' || lastIntent.direction === 'B')) {
    return {
      intent: 'MOVE',
      direction: lastIntent.direction,
      duration_ms: lastIntent.duration_ms,
      // 注意：这只是建议，不是执行
    };
  }
  return null;
}

export default { canSuggest, buildRepeatSuggestion };
