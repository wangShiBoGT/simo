/**
 * Simo L2.8 熟练层 - 解析
 * 
 * 解析用户对"建议"的回应
 * 严格：CONFIRM / CANCEL / IGNORE
 */

const YES = new Set(['是', '对', '好', '好的', '继续', '执行', '可以', '嗯', '要', '行', '是的', '好啊', '走']);
const NO = new Set(['不', '不要', '算了', '取消', '不用', '别', '否', '停', '停止', '不了']);

function norm(s) {
  return String(s || '').trim().toLowerCase();
}

/**
 * 解析用户对建议的回复
 * @param {string} text - 用户输入
 * @returns {'CONFIRM' | 'CANCEL' | 'IGNORE'}
 */
export function parseSuggestionReply(text) {
  const t = norm(text);

  // 确认
  if (YES.has(t)) return 'CONFIRM';
  
  // 取消更"保守"：出现否定词就取消
  for (const w of NO) {
    if (t === w || t.includes(w)) return 'CANCEL';
  }
  
  return 'IGNORE';
}

export default { parseSuggestionReply };
