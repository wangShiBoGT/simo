/**
 * Simo LLM 复杂指令解析器
 * 
 * 将复杂自然语言指令分解为原子动作序列
 * 参考：OpenAI Function Calling 最佳实践
 */

import { IntentType, DurationPresets } from './intent.schema.js';

// 动作定义（供 LLM 理解）
const ACTION_DEFINITIONS = `
你是一个机器人指令解析器。将用户的复杂指令分解为原子动作序列。

## 可用动作
1. forward(duration) - 前进，duration: short/medium/long
2. backward(duration) - 后退
3. left(duration) - 左转
4. right(duration) - 右转
5. stop() - 停止
6. beep() - 蜂鸣器

## duration 映射
- short: 400ms (一点点、一下、稍微)
- medium: 800ms (默认)
- long: 1200ms (多、远、久)

## 输出格式
必须输出 JSON 数组，每个元素是一个动作：
[
  {"action": "forward", "duration": "medium"},
  {"action": "left", "duration": "short"}
]

## 规则
1. 只输出 JSON，不要解释
2. 每个动作必须是原子动作
3. 不支持的动作返回空数组 []
4. 最多 5 个动作（安全限制）

## 示例
用户: "前进然后左转"
输出: [{"action":"forward","duration":"medium"},{"action":"left","duration":"medium"}]

用户: "后退一点再右转"
输出: [{"action":"backward","duration":"short"},{"action":"right","duration":"medium"}]

用户: "转一圈"
输出: [{"action":"left","duration":"long"},{"action":"left","duration":"long"},{"action":"left","duration":"long"},{"action":"left","duration":"long"}]

用户: "前进两步"
输出: [{"action":"forward","duration":"medium"},{"action":"forward","duration":"medium"}]

用户指令：
`;

/**
 * 使用 LLM 分解复杂指令
 * @param {string} userText - 用户原始指令
 * @param {Function} llmCall - LLM 调用函数
 * @returns {Array} 动作序列
 */
export async function decomposeComplexIntent(userText, llmCall) {
  if (!llmCall) {
    console.warn('[LLM] 未提供 LLM 调用函数');
    return null;
  }
  
  const prompt = ACTION_DEFINITIONS + userText;
  
  try {
    const response = await llmCall(prompt);
    const actions = extractActionSequence(response);
    
    if (!actions || actions.length === 0) {
      console.warn('[LLM] 无法分解指令:', userText);
      return null;
    }
    
    // 安全限制：最多 5 个动作
    if (actions.length > 5) {
      console.warn('[LLM] 动作序列过长，截断为 5 个');
      actions.length = 5;
    }
    
    // 转换为 Intent 序列
    return actions.map(action => actionToIntent(action, userText));
    
  } catch (error) {
    console.error('[LLM] 分解指令失败:', error);
    return null;
  }
}

/**
 * 从 LLM 响应中提取动作序列
 */
function extractActionSequence(text) {
  try {
    // 尝试直接解析
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed.filter(a => a && a.action);
    }
  } catch {
    // 尝试提取 JSON 数组
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed)) {
          return parsed.filter(a => a && a.action);
        }
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * 将动作转换为 Intent 对象
 */
function actionToIntent(action, rawText) {
  const durationMap = {
    'short': DurationPresets.SHORT,
    'medium': DurationPresets.MEDIUM,
    'long': DurationPresets.LONG
  };
  
  const duration = durationMap[action.duration] || DurationPresets.MEDIUM;
  
  switch (action.action) {
    case 'forward':
      return {
        intent: IntentType.MOVE,
        direction: 'F',
        duration_ms: duration,
        confidence: 0.85,
        raw_text: rawText,
        fromLLM: true
      };
    case 'backward':
      return {
        intent: IntentType.MOVE,
        direction: 'B',
        duration_ms: duration,
        confidence: 0.85,
        raw_text: rawText,
        fromLLM: true
      };
    case 'left':
      return {
        intent: IntentType.TURN,
        direction: 'L',
        duration_ms: duration,
        confidence: 0.85,
        raw_text: rawText,
        fromLLM: true
      };
    case 'right':
      return {
        intent: IntentType.TURN,
        direction: 'R',
        duration_ms: duration,
        confidence: 0.85,
        raw_text: rawText,
        fromLLM: true
      };
    case 'stop':
      return {
        intent: IntentType.STOP,
        direction: null,
        duration_ms: null,
        confidence: 0.9,
        raw_text: rawText,
        fromLLM: true
      };
    case 'beep':
      return {
        intent: 'BEEP',
        direction: null,
        duration_ms: null,
        confidence: 0.9,
        raw_text: rawText,
        fromLLM: true
      };
    default:
      return null;
  }
}

/**
 * 本地分解简单序列（不调用 LLM）
 * 支持中文口语化表达
 */
export function decomposeLocalSequence(userText) {
  const text = userText.trim().toLowerCase();
  
  // 分割词 - 中文口语化（注意顺序，长词优先）
  const separators = /然后|接着|之后|完了再|完再|完了|完|再|,|，|以后/;
  const parts = text.split(separators).filter(p => p.trim());
  
  if (parts.length <= 1) {
    return null;  // 不是序列
  }
  
  const actions = [];
  
  for (const part of parts) {
    const trimmed = part.trim();
    
    // 判断持续时间 - 中文口语化
    let duration = 'medium';
    if (/多|远|久|大|快|使劲|用力|狠狠|猛/.test(trimmed)) {
      duration = 'long';
    } else if (/一点|一下|稍微|轻轻|慢慢|小心|一丢丢/.test(trimmed)) {
      duration = 'short';
    }
    
    // 识别动作 - 中文口语化
    // 后退（优先匹配，避免"后"被前进匹配）
    if (/后退|往后|向后|退|倒|回|撤/.test(trimmed)) {
      actions.push({ action: 'backward', duration });
    }
    // 左转
    else if (/左转|向左|往左|左拐|左边|朝左|左/.test(trimmed)) {
      actions.push({ action: 'left', duration });
    }
    // 右转
    else if (/右转|向右|往右|右拐|右边|朝右|右/.test(trimmed)) {
      actions.push({ action: 'right', duration });
    }
    // 前进
    else if (/前进|往前|向前|走|上|冲|来|过来|直走|前/.test(trimmed)) {
      actions.push({ action: 'forward', duration });
    }
    // 停止
    else if (/停|别动|站住/.test(trimmed)) {
      actions.push({ action: 'stop' });
    }
  }
  
  if (actions.length === 0) {
    return null;
  }
  
  // 安全限制
  if (actions.length > 5) {
    actions.length = 5;
  }
  
  return actions.map(action => actionToIntent(action, userText));
}

export default {
  decomposeComplexIntent,
  decomposeLocalSequence
};
