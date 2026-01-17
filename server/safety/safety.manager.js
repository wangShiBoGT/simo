/**
 * Simo B 阶段：安全管理器
 * 
 * 核心职责：
 * 1. 接收传感器数据
 * 2. 在危险时调用 stopNow()
 * 
 * 严禁：
 * - safety → MOVE
 * - safety → Intent
 * - safety → Confirm
 */

import { SafetySignal, SafetyState, SensorSource, SafetyThresholds } from './safety.types.js';

/**
 * 安全管理器
 */
export class SafetyManager {
  constructor(opts = {}) {
    this.stopNow = opts.stopNow;  // 停止函数
    
    // 当前安全状态
    this._state = SafetyState.SAFE;
    this._blocked = false;
    this._reason = null;
    this._source = null;
    this._lastUpdate = Date.now();
    
    // 传感器数据缓存
    this._sensorData = {
      ultrasonic: null,
      infraredLeft: null,
      infraredRight: null
    };
  }

  /**
   * 获取安全状态（用于 /api/state）
   */
  getState() {
    return {
      state: this._state,
      blocked: this._blocked,
      reason: this._reason,
      source: this._source,
      lastUpdate: this._lastUpdate,
      sensors: { ...this._sensorData }
    };
  }

  /**
   * 更新传感器数据并检查安全
   * @param {Object} sensorData - 传感器数据
   * @returns {Object} { triggered: boolean, signal?: string }
   */
  updateSensors(sensorData) {
    this._lastUpdate = Date.now();
    
    // 更新缓存
    if (sensorData.ultrasonic !== undefined) {
      this._sensorData.ultrasonic = sensorData.ultrasonic;
    }
    if (sensorData.infraredLeft !== undefined) {
      this._sensorData.infraredLeft = sensorData.infraredLeft;
    }
    if (sensorData.infraredRight !== undefined) {
      this._sensorData.infraredRight = sensorData.infraredRight;
    }
    
    // 检查安全
    return this._checkSafety();
  }

  /**
   * 检查安全状态
   * @private
   */
  _checkSafety() {
    const { ultrasonic, infraredLeft, infraredRight } = this._sensorData;
    
    // 1. 超声波检测（最高优先级）
    if (ultrasonic !== null && ultrasonic > 0) {
      if (ultrasonic < SafetyThresholds.ULTRASONIC_DANGER) {
        return this._triggerSafety(SafetySignal.OBSTACLE_NEAR, SensorSource.ULTRASONIC);
      }
      if (ultrasonic < SafetyThresholds.ULTRASONIC_WARNING) {
        this._setWarning(SafetySignal.OBSTACLE_NEAR, SensorSource.ULTRASONIC);
        return { triggered: false, warning: true };
      }
    }
    
    // 2. 红外检测（两侧都被阻挡时触发）
    if (infraredLeft === SafetyThresholds.INFRARED_BLOCKED && 
        infraredRight === SafetyThresholds.INFRARED_BLOCKED) {
      return this._triggerSafety(SafetySignal.SIDE_BLOCKED, SensorSource.INFRARED);
    }
    
    // 3. 安全，清除阻挡状态
    if (this._blocked) {
      this._clearBlocked();
    }
    
    return { triggered: false };
  }

  /**
   * 触发安全停止
   * @private
   */
  _triggerSafety(signal, source) {
    console.log(`🛑 [Safety] 触发安全停止: ${signal} (${source})`);
    
    this._state = SafetyState.BLOCKED;
    this._blocked = true;
    this._reason = signal;
    this._source = source;
    
    // 调用停止函数
    if (this.stopNow) {
      this.stopNow(signal);
    }
    
    return { triggered: true, signal, source };
  }

  /**
   * 设置警告状态
   * @private
   */
  _setWarning(signal, source) {
    this._state = SafetyState.WARNING;
    this._reason = signal;
    this._source = source;
  }

  /**
   * 清除阻挡状态
   * @private
   */
  _clearBlocked() {
    console.log(`✅ [Safety] 障碍解除`);
    this._state = SafetyState.SAFE;
    this._blocked = false;
    this._reason = null;
    this._source = null;
  }

  /**
   * 检查是否被阻挡（用于 Guard 判断）
   */
  isBlocked() {
    return this._blocked;
  }

  /**
   * 获取阻挡原因
   */
  getBlockReason() {
    if (!this._blocked) return null;
    return {
      reason: this._reason,
      source: this._source
    };
  }
}

export default SafetyManager;
