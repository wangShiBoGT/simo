/**
 * Simo 运动控制服务
 * 
 * 通过 L2.6 意图层 API 控制机器人运动
 */

import { getApiBase } from '../config/api.js';

// 动态获取 API 地址
const getApi = () => getApiBase();

/**
 * 发送意图请求
 * @param {string} text - 自然语言指令
 * @returns {Promise<Object>} 意图解析和执行结果
 */
export async function sendIntent(text) {
  try {
    const response = await fetch(`${getApi()}/api/intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('意图请求失败:', error);
    return { error: error.message };
  }
}

/**
 * 紧急停止
 * @returns {Promise<Object>}
 */
export async function emergencyStop() {
  try {
    const response = await fetch(`${getApi()}/api/intent/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    return await response.json();
  } catch (error) {
    console.error('紧急停止失败:', error);
    return { error: error.message };
  }
}

/**
 * 获取机器人状态
 * @returns {Promise<Object>}
 */
export async function getRobotState() {
  try {
    const response = await fetch(`${getApi()}/api/intent/state`);
    return await response.json();
  } catch (error) {
    console.error('获取状态失败:', error);
    return { error: error.message };
  }
}

/**
 * 执行动作序列（复杂指令分解后）
 * @param {Array} sequence - 动作序列
 * @param {Function} onProgress - 进度回调
 * @returns {Promise<Object>}
 */
export async function executeSequence(sequence, onProgress) {
  if (!sequence || sequence.length === 0) {
    return { error: '空序列' };
  }
  
  const results = [];
  
  for (let i = 0; i < sequence.length; i++) {
    const action = sequence[i];
    
    // 通知进度
    if (onProgress) {
      onProgress({ current: i + 1, total: sequence.length, action });
    }
    
    // 构建命令
    const command = `${action.direction},${action.duration_ms}`;
    
    try {
      // 发送单个动作
      const response = await fetch(`${getApi()}/api/hardware/motion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'move',
          data: {
            direction: action.direction === 'F' ? 'forward' : 
                       action.direction === 'B' ? 'backward' :
                       action.direction === 'L' ? 'left' : 'right',
            speed: 0.85,
            duration: action.duration_ms
          }
        })
      });
      
      const result = await response.json();
      results.push({ action, result });
      
      // 等待动作完成
      await new Promise(resolve => setTimeout(resolve, action.duration_ms + 200));
      
    } catch (error) {
      results.push({ action, error: error.message });
      break;  // 出错停止序列
    }
  }
  
  return { results, completed: results.length === sequence.length };
}

/**
 * 检查是否是运动控制指令
 * @param {string} text - 用户输入
 * @returns {boolean}
 */
export function isMotionCommand(text) {
  const motionKeywords = [
    '前进', '后退', '左转', '右转', '停', '走', '动', '转',
    '往前', '往后', '向前', '向后', '向左', '向右',
    '前面', '后面', '左边', '右边',
    '别动', '停下', '停止', '等等', '暂停',
    '响', '叫', '蜂鸣', '滴', '嘀', '哔',  // 蜂鸣器测试
    '然后', '接着', '之后', '再'  // 序列动作
  ];
  
  return motionKeywords.some(keyword => text.includes(keyword));
}

/**
 * 检查是否是停止指令
 * @param {string} text
 * @returns {boolean}
 */
export function isStopCommand(text) {
  const stopKeywords = ['停', '别动', '等等', '暂停', '停下', '停止'];
  return stopKeywords.some(keyword => text.includes(keyword));
}

export default {
  sendIntent,
  emergencyStop,
  getRobotState,
  isMotionCommand,
  isStopCommand
};
