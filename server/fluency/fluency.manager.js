/**
 * Simo L2.8 熟练层 - 管理器
 * 
 * 核心：保存一个"建议动作"，并提供 accept/cancel/expire
 * 
 * 铁律：
 * - 建议 ≠ 行动
 * - 建议只针对"下一步"
 * - 建议随时可消失（STOP/Safety/新输入/超时）
 */

import { canSuggest, buildRepeatSuggestion } from './fluency.policy.js';
import { buildSuggestionPrompt } from './fluency.prompt.js';
import { parseSuggestionReply } from './fluency.parse.js';

/**
 * 验证建议是否合法
 */
function sanitizeSuggestion(s) {
  if (!s) return null;
  const intent = s.intent;
  if (!['MOVE', 'TURN'].includes(intent)) return null;

  const directionOk =
    (intent === 'MOVE' && ['F', 'B'].includes(s.direction)) ||
    (intent === 'TURN' && ['L', 'R'].includes(s.direction));
  if (!directionOk) return null;

  const ms = Number(s.duration_ms);
  if (![400, 800, 1200].includes(ms)) return null;

  return { intent, direction: s.direction, duration_ms: ms, confidence: 1.0 };
}

/**
 * 熟练层管理器
 */
export class FluencyManager {
  /**
   * @param {object} opts
   * @param {number} opts.ttlMs - 建议有效期（默认 5000ms）
   */
  constructor(opts = {}) {
    this.ttlMs = opts.ttlMs ?? 5000;
    this._suggested = null; // { suggestion, prompt, createdAt, expireAt, source }
    this._lastClearReason = null;
  }

  /**
   * 清空建议
   */
  clear(reason = 'cleared') {
    if (this._suggested) {
      console.log(`[Fluency] 清空建议: ${reason}`);
    }
    this._suggested = null;
    this._lastClearReason = reason;
  }

  /**
   * 检查是否有建议
   */
  hasSuggestion() {
    this._tick();
    return !!this._suggested;
  }

  /**
   * 检查并清理过期建议
   */
  _tick() {
    if (!this._suggested) return;
    if (Date.now() >= this._suggested.expireAt) {
      this.clear('expired');
    }
  }

  /**
   * 获取状态（用于 /api/state）
   */
  getState() {
    this._tick();
    if (!this._suggested) {
      return {
        suggested_next: null,
        prompt: null,
        expires_in_ms: null,
        source: null
      };
    }
    return {
      suggested_next: this._suggested.suggestion,
      prompt: this._suggested.prompt,
      expires_in_ms: Math.max(0, this._suggested.expireAt - Date.now()),
      source: this._suggested.source
    };
  }

  /**
   * 在"一个动作完成后"调用
   * @param {object} args
   * @param {object|null} args.lastIntent - 刚完成的动作
   * @param {object|null} args.nextSuggestion - 来自 C 阶段的下一步建议
   * @param {object} args.ctx - { state, safety }
   */
  onActionCompleted({ lastIntent, nextSuggestion, ctx }) {
    this._tick();

    // 如果安全 blocked 或非 idle，不建议
    if (!canSuggest(ctx)) {
      this.clear('cannot_suggest');
      return null;
    }

    // 优先：来自 C 阶段的下一步建议
    let s = sanitizeSuggestion(nextSuggestion);

    // 其次：重复建议（例如继续向前）
    if (!s) {
      s = sanitizeSuggestion(buildRepeatSuggestion(lastIntent));
    }

    if (!s) {
      this.clear('no_suggestion');
      return null;
    }

    this._suggested = {
      suggestion: s,
      prompt: buildSuggestionPrompt(s),
      createdAt: Date.now(),
      expireAt: Date.now() + this.ttlMs,
      source: nextSuggestion ? 'sequence' : 'repeat'
    };
    
    console.log(`[Fluency] 新建议: ${s.intent} ${s.direction} (${this._suggested.source})`);
    return this._suggested;
  }

  /**
   * 用户输入到来时调用
   */
  onUserUtterance(text, { state, safety }) {
    // 如果安全 blocked，直接清空
    if (safety?.blocked) {
      this.clear('safety_blocked');
    }
    this._tick();
  }

  /**
   * 处理用户对"建议"的回应
   * @returns {{status:'ACCEPTED'|'CANCELLED'|'IGNORED'|'NO_SUGGESTION', intent?:object}}
   */
  handleReply(text) {
    this._tick();
    if (!this._suggested) {
      return { status: 'NO_SUGGESTION' };
    }

    const d = parseSuggestionReply(text);
    if (d === 'CONFIRM') {
      const intent = this._suggested.suggestion;
      this.clear('accepted');
      return { status: 'ACCEPTED', intent };
    }
    if (d === 'CANCEL') {
      this.clear('cancelled');
      return { status: 'CANCELLED' };
    }
    return { status: 'IGNORED' };
  }
}

export default FluencyManager;
