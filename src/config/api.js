/**
 * Simo API 配置
 * 
 * 部署架构：
 * - AI API (Cloudflare Worker): 对话、LLM
 * - 硬件 API (本地后端): 串口、STM32、传感器
 * 
 * 支持：环境变量 > localStorage > 默认值
 */

// ============ AI API (Cloudflare Worker) ============
// 用于：对话、LLM 调用
const ENV_AI_API = import.meta.env.VITE_AI_API_BASE || '';
const DEFAULT_AI_API = 'https://simo-api.你的子域.workers.dev';  // 部署后替换

/**
 * 获取 AI API 地址（Cloudflare Worker）
 */
export function getAiApiBase() {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('simo_ai_api_base');
    if (stored) return stored;
  }
  return ENV_AI_API || DEFAULT_AI_API;
}

/**
 * 设置 AI API 地址
 */
export function setAiApiBase(url) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('simo_ai_api_base', url);
  }
}

// ============ 硬件 API (本地后端) ============
// 用于：串口通信、STM32 控制、传感器
const ENV_HARDWARE_API = import.meta.env.VITE_HARDWARE_API_BASE || '';
const DEFAULT_HARDWARE_API = 'http://localhost:3001';

/**
 * 获取硬件 API 地址（本地后端）
 */
export function getApiBase() {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('simo_hardware_api_base');
    if (stored) return stored;
  }
  return ENV_HARDWARE_API || DEFAULT_HARDWARE_API;
}

/**
 * 设置硬件 API 地址
 */
export function setApiBase(url) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('simo_hardware_api_base', url);
  }
}

/**
 * 清除自定义 API 地址（恢复默认）
 */
export function clearApiBase() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('simo_hardware_api_base');
    localStorage.removeItem('simo_ai_api_base');
  }
}

/**
 * 检测后端是否可达
 */
export async function checkApiHealth(baseUrl) {
  try {
    const response = await fetch(`${baseUrl}/api/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000)
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * 自动检测本地后端 IP（局域网）
 */
export async function detectLocalBackend() {
  // 常见的本地 IP 模式
  const candidates = [
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    `http://${window.location.hostname}:3001`
  ];
  
  for (const url of candidates) {
    if (await checkApiHealth(url)) {
      return url;
    }
  }
  return null;
}

export default {
  getApiBase,
  setApiBase,
  getAiApiBase,
  setAiApiBase,
  clearApiBase,
  checkApiHealth,
  detectLocalBackend
};
