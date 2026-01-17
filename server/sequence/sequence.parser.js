/**
 * Simo C 阶段：序列解析器
 * 
 * 把一句话拆成"建议动作"（ActionSuggestion）
 * 
 * 核心原则：
 * - 序列 = 建议，不是承诺
 * - 不存在"自动执行序列"
 * - 每一步都必须重新过 Guard/Confirm/Safety
 */

import { IntentType, DurationPresets } from '../intent/intent.schema.js';

/**
 * 动作建议类型（不是命令，只是建议）
 */
export const ActionSuggestion = {
  // 建议的动作类型
  MOVE_FORWARD: 'MOVE_FORWARD',
  MOVE_BACKWARD: 'MOVE_BACKWARD',
  TURN_LEFT: 'TURN_LEFT',
  TURN_RIGHT: 'TURN_RIGHT',
  STOP: 'STOP'
};

/**
 * 解析复杂语句为动作建议列表
 * @param {string} text - 用户输入的自然语言
 * @returns {Array<Object>} 动作建议列表（可能为空）
 */
export function parseToSuggestions(text) {
  const normalized = text.trim().toLowerCase();
  
  // 分割词（中文口语化）
  const separators = /然后|接着|之后|完了再|完再|完了|完|再|,|，|以后/;
  const parts = normalized.split(separators).filter(p => p.trim());
  
  // 单个动作不需要序列
  if (parts.length <= 1) {
    return null;
  }
  
  const suggestions = [];
  
  for (const part of parts) {
    const trimmed = part.trim();
    const suggestion = parseSingleAction(trimmed);
    if (suggestion) {
      suggestions.push(suggestion);
    }
  }
  
  // 空建议列表
  if (suggestions.length === 0) {
    return null;
  }
  
  // 安全限制：最多 5 个建议
  if (suggestions.length > 5) {
    console.warn('[Sequence] 建议列表过长，截断为 5 个');
    suggestions.length = 5;
  }
  
  return suggestions;
}

/**
 * 解析单个动作片段
 * @private
 */
function parseSingleAction(text) {
  // 判断持续时间
  let duration = DurationPresets.MEDIUM;
  if (/多|远|久|大|快|使劲|用力|狠狠|猛/.test(text)) {
    duration = DurationPresets.LONG;
  } else if (/一点|一下|稍微|轻轻|慢慢|小心|一丢丢/.test(text)) {
    duration = DurationPresets.SHORT;
  }
  
  // 后退（优先匹配）
  if (/后退|往后|向后|退|倒|回|撤/.test(text)) {
    return createSuggestion(IntentType.MOVE, 'B', duration, text);
  }
  
  // 左转
  if (/左转|向左|往左|左拐|左边|朝左|左/.test(text)) {
    return createSuggestion(IntentType.TURN, 'L', duration, text);
  }
  
  // 右转
  if (/右转|向右|往右|右拐|右边|朝右|右/.test(text)) {
    return createSuggestion(IntentType.TURN, 'R', duration, text);
  }
  
  // 前进
  if (/前进|往前|向前|走|上|冲|来|过来|直走|前/.test(text)) {
    return createSuggestion(IntentType.MOVE, 'F', duration, text);
  }
  
  // 停止
  if (/停|别动|站住/.test(text)) {
    return createSuggestion(IntentType.STOP, null, null, text);
  }
  
  return null;
}

/**
 * 创建动作建议对象
 * @private
 */
function createSuggestion(intent, direction, duration_ms, rawText) {
  return {
    // 这是"建议"，不是"命令"
    type: 'SUGGESTION',
    intent,
    direction,
    duration_ms,
    rawText,
    // 标记：尚未执行
    status: 'PENDING',
    // 标记：来自序列解析
    fromSequence: true
  };
}

/**
 * 将建议转换为 Intent 对象（用于执行前）
 * @param {Object} suggestion - 动作建议
 * @returns {Object} Intent 对象
 */
export function suggestionToIntent(suggestion) {
  return {
    intent: suggestion.intent,
    direction: suggestion.direction,
    duration_ms: suggestion.duration_ms,
    confidence: 0.8,  // 序列建议的置信度
    raw_text: suggestion.rawText,
    fromSequence: true
  };
}

export default {
  parseToSuggestions,
  suggestionToIntent,
  ActionSuggestion
};
