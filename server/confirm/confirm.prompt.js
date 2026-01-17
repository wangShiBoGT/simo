/**
 * Simo L2.6 确认层 - 确认提示模板
 * 
 * 模板化提示，不允许 AI 自由发挥
 */

/**
 * 构建确认提示文本
 * @param {Object} intent - Intent 对象
 * @param {Object} ctx - 上下文
 * @returns {string}
 */
export function buildConfirmPrompt(intent, ctx = {}) {
  if (!intent || !intent.intent) return '要执行吗？';

  switch (intent.intent) {
    case 'MOVE': {
      const dir = intent.direction === 'B' ? '后退' : '向前';
      const ms = Number(intent.duration_ms ?? 0);
      const hint = ms > 0 ? `（大约${ms}毫秒）` : '';
      return `要${dir}走一段吗？${hint}`;
    }
    case 'TURN': {
      const dir = intent.direction === 'R' ? '右转' : '左转';
      const ms = Number(intent.duration_ms ?? 0);
      const hint = ms > 0 ? `（大约${ms}毫秒）` : '';
      return `要继续${dir}吗？${hint}`;
    }
    case 'QUERY': {
      if (ctx.state === 'moving') return '我正在移动，要先停下吗？';
      return '你是想查询状态吗？';
    }
    default:
      return '要执行吗？';
  }
}
