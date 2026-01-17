/**
 * Simo L2.5 意图层 - LLM 意图解析器
 * 
 * 核心职责：
 * - 把自然语言转换为 Intent 对象
 * - AI 只做分类，不做决策
 * - 输出必须是结构化 JSON
 */

import { IntentType, DurationPresets, createEmptyIntent, validateIntent } from './intent.schema.js';

// 意图解析专用 Prompt（不允许 AI 自由发挥）
const INTENT_PROMPT = `你是一个机器人意图解析器。

你的任务：
- 只输出 JSON
- 不解释
- 不说多余的话

允许的 intent 只有：
MOVE, TURN, STOP, QUERY, NONE

规则：
1. 如果用户表达停止、暂停、别动、等等、停下 → intent=STOP
2. 如果用户表达前进/往前/向前 → intent=MOVE, direction=F
3. 如果用户表达后退/往后/向后/退 → intent=MOVE, direction=B
4. 如果用户表达左转/向左/往左 → intent=TURN, direction=L
5. 如果用户表达右转/向右/往右 → intent=TURN, direction=R
6. 如果用户询问状态/位置/情况 → intent=QUERY
7. 如果表达不清楚、模糊、或不相关 → intent=NONE
8. 永远给出 confidence（0~1）

duration_ms 映射规则：
- "一点点"、"一下"、"稍微" → 400
- 默认/正常 → 800
- "多一些"、"远一点"、"久一点" → 1200

输出 JSON 格式（必须严格遵守）：
{
  "intent": "MOVE",
  "direction": "F",
  "duration_ms": 800,
  "confidence": 0.92
}

用户话语：
`;

/**
 * 调用 LLM 解析意图
 * @param {string} userText - 用户原始话语
 * @param {Function} llmCall - LLM 调用函数 (prompt) => response
 * @returns {Object} Intent 对象
 */
export async function parseIntent(userText, llmCall) {
  if (!userText || userText.trim() === '') {
    return createEmptyIntent(userText);
  }
  
  const prompt = INTENT_PROMPT + userText;
  
  try {
    const response = await llmCall(prompt);
    const intentObj = extractJSON(response);
    
    if (!intentObj) {
      console.warn('[Intent] LLM 返回无法解析的内容:', response);
      return createEmptyIntent(userText);
    }
    
    // 添加原始文本
    intentObj.raw_text = userText;
    
    // 验证并修正
    const fixed = fixIntent(intentObj);
    
    // 最终验证
    const validation = validateIntent(fixed);
    if (!validation.valid) {
      console.warn('[Intent] 验证失败:', validation.errors);
      return createEmptyIntent(userText);
    }
    
    return fixed;
    
  } catch (error) {
    console.error('[Intent] 解析错误:', error);
    return createEmptyIntent(userText);
  }
}

/**
 * 从 LLM 响应中提取 JSON
 */
function extractJSON(text) {
  try {
    // 尝试直接解析
    return JSON.parse(text);
  } catch {
    // 尝试提取 JSON 块
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * 修正 Intent 对象中的非法值
 */
function fixIntent(intentObj) {
  const fixed = { ...intentObj };
  
  // 修正 intent 类型
  if (!Object.values(IntentType).includes(fixed.intent)) {
    fixed.intent = IntentType.NONE;
  }
  
  // 修正 duration_ms 到最近的档位
  if (fixed.duration_ms) {
    const presets = Object.values(DurationPresets);
    if (!presets.includes(fixed.duration_ms)) {
      // 找最近的档位
      fixed.duration_ms = presets.reduce((prev, curr) => 
        Math.abs(curr - fixed.duration_ms) < Math.abs(prev - fixed.duration_ms) ? curr : prev
      );
    }
  }
  
  // 修正 confidence
  if (typeof fixed.confidence !== 'number') {
    fixed.confidence = 0.5;
  }
  fixed.confidence = Math.max(0, Math.min(1, fixed.confidence));
  
  // STOP 不需要 direction 和 duration
  if (fixed.intent === IntentType.STOP) {
    fixed.direction = null;
    fixed.duration_ms = null;
  }
  
  // QUERY 和 NONE 不需要 direction 和 duration
  if ([IntentType.QUERY, IntentType.NONE].includes(fixed.intent)) {
    fixed.direction = null;
    fixed.duration_ms = null;
  }
  
  return fixed;
}

/**
 * 判断是否是复杂指令（需要分解）
 */
export function isComplexIntent(userText) {
  const text = userText.trim().toLowerCase();
  
  // 复杂指令特征 - 中文口语化
  const complexPatterns = [
    /然后|接着|之后|再/,           // 序列动作
    /完了|完再|完$/,               // "走完左拐"
    /好了|好再/,                   // "走好了左拐"
    /如果|假如|要是|当/,           // 条件动作
    /绕|转圈|画|走.*形/,           // 复杂路径
    /避开|躲|绕过/,                // 避障相关
    /找|寻|搜索|探测/,             // 搜索任务
    /跟|追|靠近/,                  // 跟随任务
    /巡|循|沿着/,                  // 循迹任务
    /\d+.*米|\d+.*厘米|\d+.*步/,   // 精确距离
    /\d+.*秒|\d+.*分/,             // 精确时间
    /\d+.*度|转.*圈/,              // 精确角度
  ];
  
  // 检查是否包含多个动作词（如"走完左拐"）
  const actionWords = ['走', '冲', '前', '后', '退', '左', '右', '拐', '转'];
  let actionCount = 0;
  for (const word of actionWords) {
    if (text.includes(word)) actionCount++;
  }
  if (actionCount >= 2 && /完/.test(text)) {
    return true;
  }
  
  return complexPatterns.some(p => p.test(text));
}

/**
 * 本地规则解析（不调用 LLM，用于快速匹配简单指令）
 * 支持中文口语化表达
 */
export function parseIntentLocal(userText) {
  const text = userText.trim().toLowerCase();
  
  // STOP 关键词（最高优先级）- 中文口语化
  const stopPatterns = [
    /停/, /别动/, /等等/, /暂停/, /停下/, /停止/, /stop/,
    /别走/, /站住/, /不要动/, /别跑/, /慢着/, /等一下/,
    /够了/, /可以了/, /行了/, /好了停/, /算了/,
    /打住/, /收/, /定/, /住/
  ];
  
  for (const pattern of stopPatterns) {
    if (pattern.test(text)) {
      return {
        intent: IntentType.STOP,
        direction: null,
        duration_ms: null,
        confidence: 0.95,
        raw_text: userText
      };
    }
  }
  
  // BEEP 蜂鸣器
  if (/响|叫|蜂鸣|滴|嘀|哔|beep|出声|吱/i.test(text)) {
    return {
      intent: 'BEEP',
      direction: null,
      duration_ms: null,
      confidence: 0.9,
      raw_text: userText
    };
  }
  
  // 判断持续时间 - 中文口语化
  let duration = DurationPresets.MEDIUM;
  if (/多|远|久|大|快|使劲|用力|狠狠|猛|拼命|加油/.test(text)) {
    duration = DurationPresets.LONG;
  } else if (/一点|一下|稍微|轻轻|慢慢|小心|一丢丢|一咪咪|一丁点/.test(text)) {
    duration = DurationPresets.SHORT;
  }
  
  // 前进 - 中文口语化表达
  const forwardPatterns = [
    /前进/, /往前/, /向前/, /前走/, /go/, /forward/,
    /走/, /上/, /冲/, /来/, /过来/, /走过来/,
    /给我走/, /快走/, /走起/, /走吧/, /动起来/,
    /往前走/, /向前走/, /朝前/, /直走/, /直行/,
    /上前/, /进/, /前/
  ];
  
  // 后退 - 中文口语化表达
  const backwardPatterns = [
    /后退/, /往后/, /向后/, /退/, /back/,
    /倒/, /回/, /退回/, /往回/, /倒退/,
    /后撤/, /撤/, /退后/, /往后退/, /倒车/,
    /回来/, /退回来/, /后/
  ];
  
  // 左转 - 中文口语化表达
  const leftPatterns = [
    /左转/, /向左/, /往左/, /left/,
    /左拐/, /左边/, /朝左/, /转左/,
    /往左边/, /向左边/, /左手边/,
    /左/, /拐左/
  ];
  
  // 右转 - 中文口语化表达
  const rightPatterns = [
    /右转/, /向右/, /往右/, /right/,
    /右拐/, /右边/, /朝右/, /转右/,
    /往右边/, /向右边/, /右手边/,
    /右/, /拐右/
  ];
  
  // 旁边/侧移 - 需要上下文判断方向，默认右移
  const sidePatterns = [
    /往旁/, /旁边/, /靠边/, /让开/, /闪开/, /挪/, /移/,
    /别挨/, /离远/, /远点/
  ];
  
  // 优先匹配更具体的模式
  for (const pattern of backwardPatterns) {
    if (pattern.test(text)) {
      return { intent: IntentType.MOVE, direction: 'B', duration_ms: duration, confidence: 0.85, raw_text: userText };
    }
  }
  
  for (const pattern of leftPatterns) {
    if (pattern.test(text)) {
      return { intent: IntentType.TURN, direction: 'L', duration_ms: duration, confidence: 0.85, raw_text: userText };
    }
  }
  
  // 侧移/旁边 - 默认右移（避开障碍物）
  for (const pattern of sidePatterns) {
    if (pattern.test(text)) {
      return { intent: IntentType.TURN, direction: 'R', duration_ms: duration, confidence: 0.7, raw_text: userText };
    }
  }
  
  for (const pattern of rightPatterns) {
    if (pattern.test(text)) {
      return { intent: IntentType.TURN, direction: 'R', duration_ms: duration, confidence: 0.85, raw_text: userText };
    }
  }
  
  for (const pattern of forwardPatterns) {
    if (pattern.test(text)) {
      return { intent: IntentType.MOVE, direction: 'F', duration_ms: duration, confidence: 0.85, raw_text: userText };
    }
  }
  
  // 无法本地匹配
  return null;
}

/**
 * 智能意图解析（本地优先，复杂指令调用 LLM）
 */
export async function parseIntentSmart(userText, llmCall) {
  // 1. 空输入
  if (!userText || userText.trim() === '') {
    return createEmptyIntent(userText);
  }
  
  // 2. 尝试本地解析
  const localResult = parseIntentLocal(userText);
  if (localResult) {
    console.log('[Intent] 本地解析成功:', localResult.intent);
    return localResult;
  }
  
  // 3. 判断是否是复杂指令
  if (isComplexIntent(userText)) {
    console.log('[Intent] 检测到复杂指令，调用 LLM');
    // 复杂指令暂时返回 NONE，提示用户简化
    // TODO: 实现复杂指令分解
    return {
      intent: IntentType.NONE,
      direction: null,
      duration_ms: null,
      confidence: 0.5,
      raw_text: userText,
      reason: '复杂指令暂不支持，请使用简单指令（如：前进、后退、左转、右转）'
    };
  }
  
  // 4. 调用 LLM 解析
  if (llmCall) {
    console.log('[Intent] 调用 LLM 解析');
    return await parseIntent(userText, llmCall);
  }
  
  // 5. 无法解析
  return createEmptyIntent(userText);
}
