/**
 * Simo C 阶段：建议队列
 * 
 * 核心原则：
 * - queue ≠ plan（队列不是计划）
 * - suggestion ≠ command（建议不是命令）
 * - 每一步都必须重新过 Guard/Confirm/Safety
 * - STOP/安全阻止/超时 → 清空所有建议
 */

/**
 * 建议队列状态
 */
export const QueueStatus = {
  EMPTY: 'empty',           // 空队列
  HAS_SUGGESTIONS: 'has_suggestions',  // 有待处理建议
  EXECUTING: 'executing'    // 正在执行当前建议
};

/**
 * 建议队列管理器
 * 
 * 注意：这是"建议队列"，不是"执行计划"
 * 每个建议在执行前都必须重新验证
 */
export class SuggestionQueue {
  constructor() {
    this._suggestions = [];
    this._currentIndex = 0;
    this._status = QueueStatus.EMPTY;
    this._createdAt = null;
    this._rawText = null;  // 原始用户输入
  }

  /**
   * 获取队列状态（用于 /api/state）
   */
  getState() {
    return {
      status: this._status,
      total: this._suggestions.length,
      current: this._currentIndex,
      remaining: this._suggestions.length - this._currentIndex,
      rawText: this._rawText,
      suggestions: this._suggestions.map((s, i) => ({
        ...s,
        isCurrent: i === this._currentIndex,
        isCompleted: i < this._currentIndex
      }))
    };
  }

  /**
   * 设置新的建议列表
   * @param {Array} suggestions - 动作建议列表
   * @param {string} rawText - 原始用户输入
   */
  setSuggestions(suggestions, rawText) {
    if (!suggestions || suggestions.length === 0) {
      this.clear();
      return;
    }
    
    this._suggestions = suggestions.map(s => ({
      ...s,
      status: 'PENDING'
    }));
    this._currentIndex = 0;
    this._status = QueueStatus.HAS_SUGGESTIONS;
    this._createdAt = Date.now();
    this._rawText = rawText;
    
    console.log(`[Sequence] 设置 ${suggestions.length} 个建议: ${rawText}`);
  }

  /**
   * 获取当前建议（不移除）
   * @returns {Object|null} 当前建议，或 null
   */
  peek() {
    if (this._currentIndex >= this._suggestions.length) {
      return null;
    }
    return this._suggestions[this._currentIndex];
  }

  /**
   * 标记当前建议为"正在执行"
   */
  markExecuting() {
    if (this._currentIndex < this._suggestions.length) {
      this._suggestions[this._currentIndex].status = 'EXECUTING';
      this._status = QueueStatus.EXECUTING;
    }
  }

  /**
   * 标记当前建议为"已完成"，移动到下一个
   */
  markCompleted() {
    if (this._currentIndex < this._suggestions.length) {
      this._suggestions[this._currentIndex].status = 'COMPLETED';
      this._currentIndex++;
      
      if (this._currentIndex >= this._suggestions.length) {
        this._status = QueueStatus.EMPTY;
        console.log(`[Sequence] 所有建议已完成`);
      } else {
        this._status = QueueStatus.HAS_SUGGESTIONS;
      }
    }
  }

  /**
   * 标记当前建议为"失败"，清空剩余建议
   * @param {string} reason - 失败原因
   */
  markFailed(reason) {
    if (this._currentIndex < this._suggestions.length) {
      this._suggestions[this._currentIndex].status = 'FAILED';
      this._suggestions[this._currentIndex].failReason = reason;
    }
    
    // 失败后清空剩余建议
    console.log(`[Sequence] 建议失败: ${reason}，清空剩余建议`);
    this._status = QueueStatus.EMPTY;
  }

  /**
   * 清空所有建议（STOP/安全阻止/超时）
   * @param {string} reason - 清空原因
   */
  clear(reason = 'manual') {
    if (this._suggestions.length > 0) {
      console.log(`[Sequence] 清空建议队列: ${reason}`);
    }
    this._suggestions = [];
    this._currentIndex = 0;
    this._status = QueueStatus.EMPTY;
    this._createdAt = null;
    this._rawText = null;
  }

  /**
   * 检查是否有待处理建议
   */
  hasPending() {
    return this._currentIndex < this._suggestions.length;
  }

  /**
   * 检查是否为空
   */
  isEmpty() {
    return this._suggestions.length === 0 || 
           this._currentIndex >= this._suggestions.length;
  }

  /**
   * 获取剩余建议数量
   */
  remainingCount() {
    return Math.max(0, this._suggestions.length - this._currentIndex);
  }
}

export default SuggestionQueue;
