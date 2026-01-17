/**
 * Simo L2.5 意图层 - 状态机守卫
 * 
 * 核心职责：
 * - 决定 Intent 是否可以执行
 * - 维护机器人状态
 * - STOP 永远抢占
 * - AI 只有建议权，这里有执行权
 */

import { IntentType, ConfidenceThreshold, intentToCommand } from './intent.schema.js';

// 机器人状态
export const RobotState = {
  IDLE: 'idle',       // 空闲
  MOVING: 'moving',   // 移动中
  ERROR: 'error'      // 错误
};

// 当前状态（模块级单例）
let currentState = RobotState.IDLE;
let lastIntent = null;
let stateChangeTime = Date.now();
let lastReject = null;  // 最近一次拒绝原因

/**
 * 获取当前状态
 */
export function getState() {
  return {
    state: currentState,
    lastIntent,
    stateChangeTime,
    uptime: Date.now() - stateChangeTime,
    lastReject
  };
}

/**
 * 设置状态
 */
export function setState(newState) {
  currentState = newState;
  stateChangeTime = Date.now();
}

/**
 * 判断 Intent 是否应该执行
 * @param {Object} intentObj - Intent 对象
 * @returns {Object} { execute: boolean, reason: string, command: string|null }
 */
export function shouldExecute(intentObj) {
  // 规则 1: STOP 永远执行（最高优先级）
  if (intentObj.intent === IntentType.STOP) {
    setState(RobotState.IDLE);
    lastIntent = intentObj;
    return {
      execute: true,
      reason: 'STOP 命令，立即执行',
      command: intentToCommand(intentObj)
    };
  }
  
  // 规则 2: NONE 永远不执行
  if (intentObj.intent === IntentType.NONE) {
    lastReject = '意图不明确';
    return {
      execute: false,
      reason: '意图不明确，拒绝执行',
      command: null
    };
  }
  
  // 规则 3: 置信度不足，拒绝执行
  if (intentObj.confidence < ConfidenceThreshold.EXECUTE) {
    lastReject = `置信度不足 (${intentObj.confidence})`;
    return {
      execute: false,
      reason: `置信度不足 (${intentObj.confidence} < ${ConfidenceThreshold.EXECUTE})`,
      command: null
    };
  }
  
  // 规则 4: 移动中不接受新的移动命令（除了 STOP）
  if (currentState === RobotState.MOVING) {
    if ([IntentType.MOVE, IntentType.TURN].includes(intentObj.intent)) {
      lastReject = '机器人正在移动中';
      return {
        execute: false,
        reason: '机器人正在移动中，请先停止',
        command: null
      };
    }
  }
  
  // 规则 5: QUERY 不需要硬件动作
  if (intentObj.intent === IntentType.QUERY) {
    return {
      execute: false,
      reason: '查询命令，不需要硬件动作',
      command: null,
      query: true
    };
  }
  
  // 规则 6: BEEP 蜂鸣器（测试用，直接通过）
  if (intentObj.intent === 'BEEP') {
    return {
      execute: true,
      reason: '蜂鸣器测试命令',
      command: 'BEEP'
    };
  }
  
  // 规则 7: 可以执行
  if ([IntentType.MOVE, IntentType.TURN].includes(intentObj.intent)) {
    setState(RobotState.MOVING);
    lastIntent = intentObj;
    
    // 设置自动恢复 IDLE 的定时器
    setTimeout(() => {
      if (currentState === RobotState.MOVING) {
        setState(RobotState.IDLE);
      }
    }, intentObj.duration_ms + 100);
    
    return {
      execute: true,
      reason: '通过所有检查，允许执行',
      command: intentToCommand(intentObj)
    };
  }
  
  // 默认拒绝
  return {
    execute: false,
    reason: '未知情况，默认拒绝',
    command: null
  };
}

/**
 * 强制停止（紧急情况）
 */
export function forceStop() {
  setState(RobotState.IDLE);
  lastIntent = {
    intent: IntentType.STOP,
    confidence: 1.0,
    raw_text: '[FORCE_STOP]'
  };
  return {
    execute: true,
    reason: '强制停止',
    command: 'S'
  };
}

/**
 * 重置状态
 */
export function resetState() {
  currentState = RobotState.IDLE;
  lastIntent = null;
  stateChangeTime = Date.now();
}
