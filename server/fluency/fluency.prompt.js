/**
 * Simo L2.8 熟练层 - 提示语
 * 
 * 模板化提示语（不走 LLM）
 * 
 * 语言规范：
 * ✅ 允许："我可以继续左转，要继续吗？"
 * ❌ 禁止："我接下来会左转"
 */

/**
 * 动作文本
 */
function actionText(s) {
  if (!s) return '继续吗？';
  if (s.intent === 'MOVE') {
    return s.direction === 'B' ? '继续后退' : '继续向前走';
  }
  if (s.intent === 'TURN') {
    return s.direction === 'R' ? '继续右转' : '继续左转';
  }
  return '继续吗？';
}

/**
 * 构建建议提示语
 * 只允许模板化建议语
 */
export function buildSuggestionPrompt(suggestion) {
  const txt = actionText(suggestion);
  return `我可以${txt}，要继续吗？`;
}

export default { buildSuggestionPrompt };
