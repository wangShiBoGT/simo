/**
 * Simo NLU - LLM 语言理解模块
 * 
 * 铁律：
 * - AI 只输出 JSON，不输出自然语言
 * - AI 不允许输出白名单外的动作
 * - AI 的 confidence 只是参考
 * - AI 失败 = 什么都没发生
 * - AI 永远不能"记住状态"
 */

// 允许的动作白名单
const ALLOWED_INTENTS = ['MOVE', 'TURN', 'STOP'];
const ALLOWED_DIRECTIONS = {
  MOVE: ['F', 'B'],
  TURN: ['L', 'R'],
  STOP: [null]
};
const ALLOWED_DURATIONS = [400, 800, 1200];

/**
 * LLM System Prompt（关笼子）
 */
export const LLM_SYSTEM_PROMPT = `你是一个语言理解模块。
你的任务是把用户的中文指令转换成动作建议列表。

你**不能**决定是否执行动作，
你**不能**输出自然语言解释，
你**不能**创造新的动作类型。

你只能输出 JSON。

允许的动作：
- MOVE(F=前进, B=后退)
- TURN(L=左转, R=右转)
- STOP
- duration_ms ∈ [400, 800, 1200]

输出格式：
{
  "suggestions": [
    { "intent": "MOVE", "direction": "F", "duration_ms": 800 }
  ],
  "confidence": 0.85
}

如果无法理解，输出：
{ "suggestions": [], "confidence": 0 }`;

/**
 * 调用 LLM 解析自然语言
 * @param {string} text - 用户输入
 * @param {Function} llmCall - LLM 调用函数
 * @param {number} timeout - 超时时间（毫秒）
 * @returns {Promise<Object>} { suggestions, confidence, error? }
 */
export async function parseLLM(text, llmCall, timeout = 5000) {
  if (!llmCall) {
    return { suggestions: [], confidence: 0, error: 'no_llm_call' };
  }

  try {
    // 带超时的 LLM 调用
    const result = await Promise.race([
      llmCall(LLM_SYSTEM_PROMPT, text),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('timeout')), timeout)
      )
    ]);

    // 解析 JSON
    const parsed = extractJSON(result);
    if (!parsed) {
      return { suggestions: [], confidence: 0, error: 'invalid_json' };
    }

    // 清洗输出
    const sanitized = sanitizeSuggestions(parsed.suggestions || []);
    const confidence = Math.min(1, Math.max(0, parsed.confidence || 0));

    return {
      suggestions: sanitized,
      confidence,
      raw: parsed
    };

  } catch (error) {
    console.error('[NLU/LLM] 解析失败:', error.message);
    return { suggestions: [], confidence: 0, error: error.message };
  }
}

/**
 * 从 LLM 输出中提取 JSON
 */
function extractJSON(text) {
  if (!text) return null;
  
  // 如果已经是对象
  if (typeof text === 'object') return text;
  
  // 尝试直接解析
  try {
    return JSON.parse(text);
  } catch {}
  
  // 尝试提取 JSON 块
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {}
  }
  
  return null;
}

/**
 * 清洗 AI 输出的建议列表
 * 任何不合法的直接丢弃
 */
export function sanitizeSuggestions(suggestions) {
  if (!Array.isArray(suggestions)) return [];
  
  const result = [];
  
  for (const s of suggestions) {
    if (!s || typeof s !== 'object') continue;
    
    const intent = s.intent;
    if (!ALLOWED_INTENTS.includes(intent)) continue;
    
    const direction = s.direction || null;
    const allowedDirs = ALLOWED_DIRECTIONS[intent];
    if (!allowedDirs.includes(direction)) continue;
    
    // STOP 不需要 duration
    if (intent === 'STOP') {
      result.push({ intent: 'STOP', direction: null, duration_ms: null });
      continue;
    }
    
    const duration = Number(s.duration_ms);
    if (!ALLOWED_DURATIONS.includes(duration)) {
      // 使用默认值
      result.push({ intent, direction, duration_ms: 800 });
    } else {
      result.push({ intent, direction, duration_ms: duration });
    }
  }
  
  // 安全限制：最多 5 个建议
  if (result.length > 5) {
    result.length = 5;
  }
  
  // 重要：如果序列中出现 STOP，只保留 STOP
  // 理由：STOP 是抢占式动作，不应该被当作序列的一部分
  const hasStop = result.some(s => s.intent === 'STOP');
  if (hasStop && result.length > 1) {
    return [{ intent: 'STOP', direction: null, duration_ms: null }];
  }
  
  return result;
}

export default {
  parseLLM,
  sanitizeSuggestions,
  LLM_SYSTEM_PROMPT
};
