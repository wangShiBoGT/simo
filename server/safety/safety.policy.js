/**
 * Simo B 阶段：安全策略
 * 
 * 判断"是否危险"的纯函数
 * 不做平滑、不做算法、不做推理
 * 只做"阈值 → 是否危险"
 */

import { SafetySignal, SafetyState, SensorSource, SafetyThresholds } from './safety.types.js';

/**
 * 评估传感器数据，判断是否危险
 * @param {Object} sensor - 传感器数据
 * @param {number} sensor.ultrasonic_cm - 超声波距离（cm）
 * @param {number} sensor.ir_left - 红外左（0=有障碍，1=无障碍）
 * @param {number} sensor.ir_right - 红外右（0=有障碍，1=无障碍）
 * @returns {Object} { blocked: boolean, reason?: string, source?: string }
 */
export function evaluateSensors(sensor) {
  // 1. 超声波检测（最高优先级）
  if (typeof sensor.ultrasonic_cm === 'number' &&
      sensor.ultrasonic_cm > 0 &&
      sensor.ultrasonic_cm < SafetyThresholds.ULTRASONIC_DANGER) {
    return {
      blocked: true,
      reason: SafetySignal.OBSTACLE_NEAR,
      source: SensorSource.ULTRASONIC
    };
  }

  // 2. 红外检测（两侧都被阻挡时触发）
  // 注意：0=有障碍，1=无障碍
  if (sensor.ir_left === 0 && sensor.ir_right === 0) {
    return {
      blocked: true,
      reason: SafetySignal.SIDE_BLOCKED,
      source: SensorSource.INFRARED
    };
  }

  // 3. 安全
  return { blocked: false };
}

/**
 * 判断是否处于警告状态（不阻止，但提醒）
 */
export function evaluateWarning(sensor) {
  if (typeof sensor.ultrasonic_cm === 'number' &&
      sensor.ultrasonic_cm > 0 &&
      sensor.ultrasonic_cm < SafetyThresholds.ULTRASONIC_WARNING &&
      sensor.ultrasonic_cm >= SafetyThresholds.ULTRASONIC_DANGER) {
    return {
      warning: true,
      reason: SafetySignal.OBSTACLE_NEAR,
      source: SensorSource.ULTRASONIC,
      distance: sensor.ultrasonic_cm
    };
  }
  
  return { warning: false };
}

export default {
  evaluateSensors,
  evaluateWarning
};
