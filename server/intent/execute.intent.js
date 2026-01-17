/**
 * Simo 唯一执行入口
 * 
 * INV-002: 所有物理动作必须通过此函数执行
 * 禁止在其他地方直接写串口
 */

import { assertIntentInvariant, validateIntent } from '../invariants/index.js';

/**
 * 执行 Intent（唯一入口）
 * @param {Object} intent - Intent 对象
 * @param {Object} ctx - 上下文
 * @param {string} ctx.state - 机器人状态
 * @param {Function} ctx.sendCommand - 发送串口命令的函数
 * @param {Function} ctx.stopNow - 立即停止的函数
 * @returns {Object} { executed: boolean, command?: string, error?: string }
 */
export async function executeIntent(intent, ctx) {
  // 1. Runtime 不变量断言
  const validation = validateIntent(intent, ctx);
  if (!validation.valid) {
    console.error(`❌ 不变量违反: ${validation.error}`);
    return { executed: false, error: validation.error };
  }

  // 2. STOP 抢占（INV-101）
  if (intent.intent === 'STOP') {
    if (ctx.stopNow) {
      await ctx.stopNow();
    }
    if (ctx.sendCommand) {
      ctx.sendCommand('S\r\n');
    }
    return { executed: true, command: 'S' };
  }

  // 3. QUERY 不执行物理动作
  if (intent.intent === 'QUERY') {
    return { executed: false, reason: 'QUERY 不执行物理动作' };
  }

  // 4. MOVE/TURN 执行
  const direction = intent.direction;
  const duration = intent.duration_ms;

  if (intent.intent === 'MOVE' || intent.intent === 'TURN') {
    const command = `${direction},${duration}`;
    if (ctx.sendCommand) {
      ctx.sendCommand(`${command}\r\n`);
    }
    return { executed: true, command };
  }

  return { executed: false, reason: '未知意图类型' };
}
