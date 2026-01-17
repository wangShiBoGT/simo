/**
 * Simo L2.6 确认层 - 确认回复解析
 * 
 * 严格解析用户确认/取消回复
 */

const CONFIRM_WORDS = new Set(['是', '对', '好', '好的', '执行', '继续', '嗯', '可以', '确认', '走', '转', '行']);
const CANCEL_WORDS = new Set(['不', '不要', '算了', '取消', '停', '停止', '别', '不用', '否', '不行']);

/**
 * 解析用户确认回复
 * @param {string} text - 用户回复
 * @returns {'CONFIRM'|'CANCEL'|'IGNORE'}
 */
export function parseConfirmReply(text) {
  const t = String(text || '').trim().toLowerCase();
  
  if (!t) return 'IGNORE';

  // 精确匹配
  if (CONFIRM_WORDS.has(t)) return 'CONFIRM';
  if (CANCEL_WORDS.has(t)) return 'CANCEL';

  // 允许简短变体："是的"、"好啊"、"好呀"
  for (const w of CONFIRM_WORDS) {
    if (t === w + '的' || t === w + '啊' || t === w + '呀') return 'CONFIRM';
  }
  
  // 取消更严格：任何包含取消关键词都取消（安全优先）
  for (const w of CANCEL_WORDS) {
    if (t.includes(w)) return 'CANCEL';
  }

  return 'IGNORE';
}
