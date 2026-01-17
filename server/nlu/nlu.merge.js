/**
 * Simo NLU - 双轨合并模块
 * 
 * 规则优先级：
 * 1. 规则 Parser 命中 → 直接用
 * 2. 规则没命中 / 置信度低 → 才用 LLM
 * 3. LLM 输出永远是"不可信建议"
 */

import { parseIntentLocal } from '../intent/intent.parser.js';
import { parseToSuggestions } from '../sequence/sequence.parser.js';
import { parseLLM, sanitizeSuggestions } from './llm.parser.js';

// 规则解析置信度阈值
const RULE_CONFIDENCE_THRESHOLD = 0.7;

/**
 * 双轨语言理解
 * @param {string} text - 用户输入
 * @param {Object} opts - 选项
 * @param {Function} opts.llmCall - LLM 调用函数（可选）
 * @param {boolean} opts.enableLLM - 是否启用 LLM（默认 true）
 * @returns {Promise<Object>} { source, intent?, suggestions?, confidence }
 */
export async function parseNLU(text, opts = {}) {
  const { llmCall, enableLLM = true } = opts;
  
  // 1. 先尝试规则解析（单步）
  const ruleIntent = parseIntentLocal(text);
  if (ruleIntent && ruleIntent.confidence >= RULE_CONFIDENCE_THRESHOLD) {
    console.log(`[NLU] 规则命中: ${ruleIntent.intent} (${ruleIntent.confidence})`);
    return {
      source: 'rule',
      intent: ruleIntent,
      suggestions: null,
      confidence: ruleIntent.confidence
    };
  }
  
  // 2. 尝试规则解析（多步序列）
  const ruleSuggestions = parseToSuggestions(text);
  if (ruleSuggestions && ruleSuggestions.length > 0) {
    console.log(`[NLU] 规则序列命中: ${ruleSuggestions.length} 个建议`);
    return {
      source: 'rule_sequence',
      intent: null,
      suggestions: ruleSuggestions,
      confidence: 0.8
    };
  }
  
  // 3. 规则没命中，尝试 LLM
  if (enableLLM && llmCall) {
    console.log(`[NLU] 规则未命中，尝试 LLM...`);
    const llmResult = await parseLLM(text, llmCall);
    
    if (llmResult.suggestions && llmResult.suggestions.length > 0) {
      console.log(`[NLU] LLM 解析成功: ${llmResult.suggestions.length} 个建议 (${llmResult.confidence})`);
      
      // 单个建议转为 Intent
      if (llmResult.suggestions.length === 1) {
        const s = llmResult.suggestions[0];
        return {
          source: 'llm',
          intent: {
            intent: s.intent,
            direction: s.direction,
            duration_ms: s.duration_ms,
            confidence: llmResult.confidence,
            raw_text: text,
            fromLLM: true
          },
          suggestions: null,
          confidence: llmResult.confidence
        };
      }
      
      // 多个建议
      return {
        source: 'llm_sequence',
        intent: null,
        suggestions: llmResult.suggestions.map(s => ({
          type: 'SUGGESTION',
          intent: s.intent,
          direction: s.direction,
          duration_ms: s.duration_ms,
          rawText: text,
          status: 'PENDING',
          fromLLM: true
        })),
        confidence: llmResult.confidence
      };
    }
    
    // LLM 也没解析出来
    if (llmResult.error) {
      console.log(`[NLU] LLM 失败: ${llmResult.error}`);
    }
  }
  
  // 4. 都没命中，返回低置信度的规则结果（如果有）
  if (ruleIntent) {
    console.log(`[NLU] 使用低置信度规则结果: ${ruleIntent.intent} (${ruleIntent.confidence})`);
    return {
      source: 'rule_low',
      intent: ruleIntent,
      suggestions: null,
      confidence: ruleIntent.confidence
    };
  }
  
  // 5. 完全无法理解
  console.log(`[NLU] 无法理解: "${text}"`);
  return {
    source: 'none',
    intent: null,
    suggestions: null,
    confidence: 0
  };
}

export default { parseNLU };
