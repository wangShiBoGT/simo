/**
 * Simo B 阶段：安全信号类型定义
 * 
 * 核心原则：
 * - 传感器只产生 SafetySignal，不产生 Intent
 * - SafetySignal 只能触发 STOP，不能触发 MOVE/TURN
 * - 传感器是"下位裁决"：可以否定"能不能动"，不能否定"想不想动"
 * 
 * 单一事实来源：docs/protocol-spec.md
 */

import hardwareConfig from '../hardware.config.js'

/**
 * 安全信号类型（不是命令，只是信号）
 */
export const SafetySignal = {
  OBSTACLE_NEAR: 'OBSTACLE_NEAR',       // 前方障碍物过近
  CLIFF_DETECTED: 'CLIFF_DETECTED',     // 检测到悬崖/台阶
  BUMPER_HIT: 'BUMPER_HIT',             // 碰撞传感器触发
  SIDE_BLOCKED: 'SIDE_BLOCKED',         // 侧面被阻挡
  UNKNOWN_HAZARD: 'UNKNOWN_HAZARD'      // 未知危险
};

/**
 * 安全状态
 */
export const SafetyState = {
  SAFE: 'safe',           // 安全，可以移动
  BLOCKED: 'blocked',     // 被阻挡，禁止移动
  WARNING: 'warning'      // 警告，可以移动但需注意
};

/**
 * 传感器来源
 */
export const SensorSource = {
  ULTRASONIC: 'ultrasonic',   // 超声波
  INFRARED: 'infrared',       // 红外
  BUMPER: 'bumper',           // 碰撞
  CLIFF: 'cliff'              // 悬崖
};

/**
 * 安全阈值配置
 * 注意：实际值从 hardware.config.js 读取，这里只是默认值
 * 单一事实来源：docs/protocol-spec.md
 */
const configThresholds = hardwareConfig.safety?.obstacleThresholds || {}

export const SafetyThresholds = {
  // 超声波距离阈值（单位：cm）- 从配置读取
  ULTRASONIC_DANGER: configThresholds.danger || 8,    // 危险距离，立即停止
  ULTRASONIC_WARNING: configThresholds.caution || 15, // 警告距离，显示警告
  ULTRASONIC_SAFE: configThresholds.safe || 30,       // 安全距离
  
  // 红外传感器（0=有障碍，1=无障碍）
  INFRARED_BLOCKED: 0
};

export default {
  SafetySignal,
  SafetyState,
  SensorSource,
  SafetyThresholds
};
