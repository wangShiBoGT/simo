/**
 * Simo L2.6 确认层 - 确认管理器
 * 
 * 核心状态机：idle → awaiting → confirmed/cancelled
 */

import { needConfirm } from './confirm.policy.js';
import { buildConfirmPrompt } from './confirm.prompt.js';
import { parseConfirmReply } from './confirm.parse.js';

// 确认状态
export const ConfirmState = {
  IDLE: 'idle',
  AWAITING: 'awaiting',
  CONFIRMED: 'confirmed',
  CANCELLED: 'cancelled'
};

/**
 * 确认管理器
 */
export class ConfirmManager {
  /**
   * @param {Object} opts
   * @param {number} opts.timeoutMs - 超时时间（默认 5000ms）
   * @param {Function} opts.execute - 执行意图的函数
   */
  constructor(opts = {}) {
    this.timeoutMs = opts.timeoutMs ?? 5000;
    this.execute = opts.execute;
    
    this._pending = null;  // { intent, askedAt, timeoutAt }
    this._state = ConfirmState.IDLE;
    
    // 上下文追踪
    this._lastIntentType = null;
    this._lastStopAt = null;
    this._turnStreak = 0;
  }

  get pending() {
    return this._pending;
  }

  get state() {
    return this._state;
  }

  isAwaiting() {
    return this._state === ConfirmState.AWAITING;
  }

  /**
   * 获取确认层状态（用于 /api/state）
   */
  getState() {
    return {
      state: this._state,
      awaiting: this._state === ConfirmState.AWAITING,
      pending: this._pending,
      prompt: this._pending?.prompt || null
    };
  }

  clearPending() {
    this._pending = null;
    this._state = ConfirmState.IDLE;
  }

  /**
   * 获取当前上下文
   */
  getContext(robotState) {
    return {
      state: robotState,
      lastIntentType: this._lastIntentType,
      lastStopAt: this._lastStopAt,
      turnStreak: this._turnStreak,
      nowMs: Date.now()
    };
  }

  /**
   * 更新上下文（执行后调用）
   */
  updateContext(intent) {
    if (intent.intent === 'STOP') {
      this._lastStopAt = Date.now();
      this._turnStreak = 0;
    } else if (intent.intent === 'TURN') {
      this._turnStreak++;
    } else {
      this._turnStreak = 0;
    }
    this._lastIntentType = intent.intent;
  }

  /**
   * 处理已通过 Guard 的意图
   * @param {Object} intent - Intent 对象
   * @param {string} robotState - 机器人状态
   * @returns {Object} { status, prompt?, command? }
   */
  async handleAllowedIntent(intent, robotState) {
    // STOP 永远立即执行，同时清除 pending
    if (intent.intent === 'STOP') {
      this.clearPending();
      this.updateContext(intent);
      if (this.execute) {
        await this.execute(intent);
      }
      return { status: 'EXECUTED', command: 'S' };
    }

    // 如果正在等待确认，拒绝新的非 STOP 意图
    if (this.isAwaiting()) {
      return { status: 'REJECTED', reason: '正在等待确认，请先回复' };
    }

    const ctx = this.getContext(robotState);

    // 检查是否需要确认
    if (needConfirm(intent, ctx)) {
      const prompt = buildConfirmPrompt(intent, ctx);
      const askedAt = Date.now();
      
      this._pending = {
        intent: this._sanitizeIntent(intent),
        askedAt,
        timeoutAt: askedAt + this.timeoutMs
      };
      this._state = ConfirmState.AWAITING;
      
      return { status: 'ASKED', prompt };
    }

    // 不需要确认，直接执行
    this.updateContext(intent);
    if (this.execute) {
      await this.execute(intent);
    }
    return { 
      status: 'EXECUTED', 
      command: `${intent.direction},${intent.duration_ms}` 
    };
  }

  /**
   * 处理用户确认回复
   * @param {string} text - 用户回复
   * @returns {Object} { status, command? }
   */
  async handleUserReply(text) {
    if (!this._pending) {
      return { status: 'NO_PENDING' };
    }

    // 检查超时
    if (Date.now() >= this._pending.timeoutAt) {
      this.clearPending();
      return { status: 'EXPIRED' };
    }

    const decision = parseConfirmReply(text);

    if (decision === 'CONFIRM') {
      const intent = this._pending.intent;
      this.clearPending();
      this.updateContext(intent);
      if (this.execute) {
        await this.execute(intent);
      }
      return { 
        status: 'CONFIRMED', 
        command: `${intent.direction},${intent.duration_ms}` 
      };
    }

    if (decision === 'CANCEL') {
      this.clearPending();
      return { status: 'CANCELLED' };
    }

    return { status: 'IGNORED' };
  }

  /**
   * 强制停止（紧急情况）
   */
  async forceStop() {
    this.clearPending();
    this._lastStopAt = Date.now();
    if (this.execute) {
      await this.execute({ intent: 'STOP' });
    }
    return { status: 'FORCE_STOPPED', command: 'S' };
  }

  /**
   * 定时检查超时
   */
  tick() {
    if (this._pending && Date.now() >= this._pending.timeoutAt) {
      this.clearPending();
    }
  }

  /**
   * 清理 Intent 对象，只保留安全字段
   */
  _sanitizeIntent(intent) {
    return {
      intent: intent.intent,
      direction: intent.direction,
      duration_ms: this._clampDuration(intent.duration_ms),
      confidence: intent.confidence,
      raw_text: intent.raw_text
    };
  }

  /**
   * 限制持续时间在安全范围内
   */
  _clampDuration(ms) {
    const n = Number(ms ?? 0);
    if (!Number.isFinite(n)) return 800;
    return Math.max(50, Math.min(3000, Math.round(n)));
  }
}
