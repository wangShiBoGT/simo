/**
 * Simo 全局常量配置
 * 集中管理所有配置项，方便维护
 */

// ============ 存储键名 ============
export const STORAGE_KEYS = {
  // 用户配置
  API_CONFIG: 'simo_api_config',
  VOICE_CONFIG: 'simo_voice_config',
  CURRENT_MODEL: 'simo_current_model',
  VOICE_ENABLED: 'simo_voice_enabled',
  
  // 记忆系统
  FAMILY_MEMBERS: 'simo_family_members',
  CONVERSATIONS: 'simo_conversations',
  PREFERENCES: 'simo_preferences',
  MEMORIES: 'simo_memories'
}

// ============ API 配置 ============
export const API_BASE = '/api'

export const LLM_PROVIDERS = {
  zhipu: { name: '智谱 GLM-4', free: true },
  deepseek: { name: 'DeepSeek', free: false },
  qwen: { name: '通义千问', free: false },
  moonshot: { name: 'Moonshot', free: false },
  ernie: { name: '文心一言', free: false }
}

export const DEFAULT_MODEL = 'zhipu'

// ============ TTS 配置 ============
export const TTS_ENGINES = {
  edge: { name: 'Edge TTS（微软）', recommended: true },
  baidu: { name: '百度语音', recommended: false },
  browser: { name: '浏览器原生', recommended: false }
}

export const DEFAULT_TTS_ENGINE = 'edge'

export const EDGE_VOICES = [
  { id: 'zh-CN-XiaoxiaoNeural', name: '晓晓（温暖亲切）', gender: 'female' },
  { id: 'zh-CN-YunxiNeural', name: '云希（阳光活力）', gender: 'male' },
  { id: 'zh-CN-XiaoyiNeural', name: '晓伊（温柔知性）', gender: 'female' },
  { id: 'zh-CN-YunjianNeural', name: '云健（沉稳大气）', gender: 'male' }
]

export const DEFAULT_EDGE_VOICE = 'zh-CN-XiaoxiaoNeural'

// ============ 交互配置 ============
export const INTERACTION = {
  // 占位语超时时间（毫秒）
  THINKING_TIMEOUT: 1500,
  
  // 占位语列表
  THINKING_PHRASES: ['嗯，我想一下。', '稍等。', '让我看看。'],
  
  // 打断关键词
  INTERRUPT_WORDS: ['等等', '停', '等一下', '暂停', '别说了', '闭嘴'],
  
  // 唤醒词
  WAKE_WORDS: ['hi simo', 'hi，simo', '你好simo'],
  
  // 快速回应
  QUICK_RESPONSES: {
    wake: '在呢。',
    greeting: '在。',
    default: '嗯。'
  }
}

// ============ 记忆系统配置 ============
export const MEMORY = {
  // 置信度阈值
  CONFIDENCE: {
    HIGH: 0.8,      // 高置信度，可以肯定地说
    MEDIUM: 0.4,    // 中等置信度，需要确认
    LOW: 0.4        // 低于此值不引用
  },
  
  // 默认置信度（推断记忆）
  DEFAULT_CONFIDENCE: 0.6,
  
  // 最大记忆条数
  MAX_MEMORIES: 100,
  
  // 上下文最大消息数
  MAX_CONTEXT_MESSAGES: 20
}

// ============ 硬件等级 ============
export const HARDWARE_LEVELS = {
  L0: { name: '纯软件', description: '屏幕+语音' },
  L1: { name: '定点存在', description: '外接屏幕+可移动底座' },
  L2: { name: '简单移动', description: '跟随+避障+房间级移动' },
  L3: { name: '智能交互', description: '情感表达+主动行为+空间记忆' }
}

export const CURRENT_HARDWARE_LEVEL = 'L0'

// ============ UI 配置 ============
export const UI = {
  // 消息显示时间计算
  MESSAGE_DISPLAY_TIME: {
    MIN: 1500,
    PER_CHAR: 100
  },
  
  // 动画时长
  ANIMATION: {
    FADE: 200,
    SLIDE: 300
  }
}

export default {
  STORAGE_KEYS,
  API_BASE,
  LLM_PROVIDERS,
  DEFAULT_MODEL,
  TTS_ENGINES,
  DEFAULT_TTS_ENGINE,
  EDGE_VOICES,
  DEFAULT_EDGE_VOICE,
  INTERACTION,
  MEMORY,
  HARDWARE_LEVELS,
  CURRENT_HARDWARE_LEVEL,
  UI
}
