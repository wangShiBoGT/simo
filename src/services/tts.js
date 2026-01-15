/**
 * Simo TTS 语音合成服务
 * 
 * 支持多种 TTS 引擎：
 * 1. Edge TTS（免费，微软 Azure 神经语音，推荐）
 * 2. 百度语音合成（极越 SIMO 同款技术）
 * 3. 讯飞语音合成（国内领先）
 * 4. 浏览器原生 TTS（兜底方案）
 * 
 * 极越 SIMO 语音特点：
 * - 自然流畅，接近真人
 * - 语速适中，不急不慢
 * - 温暖亲切，有陪伴感
 * - 支持情感表达
 */

// TTS 配置
const TTS_CONFIG = {
  // 当前使用的引擎（默认百度，极越同款）
  engine: 'baidu', // baidu / edge / browser
  
  // Edge TTS 配置（免费，推荐）
  edge: {
    // 中文语音列表（神经网络语音，非常自然）
    voices: [
      { id: 'zh-CN-XiaoxiaoNeural', name: '晓晓（女，温暖亲切）', gender: 'female' },
      { id: 'zh-CN-YunxiNeural', name: '云希（男，阳光活力）', gender: 'male' },
      { id: 'zh-CN-YunjianNeural', name: '云健（男，沉稳大气）', gender: 'male' },
      { id: 'zh-CN-XiaoyiNeural', name: '晓伊（女，温柔知性）', gender: 'female' },
      { id: 'zh-CN-YunyangNeural', name: '云扬（男，新闻播报）', gender: 'male' },
      { id: 'zh-CN-XiaochenNeural', name: '晓辰（女，活泼可爱）', gender: 'female' },
      { id: 'zh-CN-XiaohanNeural', name: '晓涵（女，温柔甜美）', gender: 'female' },
      { id: 'zh-CN-XiaomengNeural', name: '晓梦（女，甜美少女）', gender: 'female' },
      { id: 'zh-CN-XiaomoNeural', name: '晓墨（女，知性优雅）', gender: 'female' },
      { id: 'zh-CN-XiaoruiNeural', name: '晓睿（女，成熟稳重）', gender: 'female' },
      { id: 'zh-CN-XiaoshuangNeural', name: '晓双（女，童声）', gender: 'female' },
      { id: 'zh-CN-XiaoxuanNeural', name: '晓萱（女，温婉大方）', gender: 'female' },
      { id: 'zh-CN-XiaoyanNeural', name: '晓颜（女，客服）', gender: 'female' },
      { id: 'zh-CN-XiaoyouNeural', name: '晓悠（女，童声活泼）', gender: 'female' },
      { id: 'zh-CN-YunfengNeural', name: '云枫（男，成熟稳重）', gender: 'male' },
      { id: 'zh-CN-YunhaoNeural', name: '云皓（男，温暖磁性）', gender: 'male' },
      { id: 'zh-CN-YunxiaNeural', name: '云夏（男，活力少年）', gender: 'male' },
      { id: 'zh-CN-YunyeNeural', name: '云野（男，沉稳内敛）', gender: 'male' },
      { id: 'zh-CN-YunzeNeural', name: '云泽（男，纪录片）', gender: 'male' }
    ],
    // 默认语音（推荐：晓晓，最接近 SIMO 风格）
    defaultVoice: 'zh-CN-XiaoxiaoNeural',
    rate: 1.0,  // 语速 0.5-2.0
    pitch: 1.0  // 音调 0.5-2.0
  },
  
  // 百度语音合成配置（极越 SIMO 同款）
  baidu: {
    apiKey: '',
    secretKey: '',
    // 发音人：4-度丫丫情感女声（最有感情，推荐）
    // 其他选项：0-普通女声，1-普通男声，3-情感男声，106-度博文
    per: 4,
    spd: 4,  // 语速 0-15，4稍慢更自然
    pit: 6,  // 音调 0-15，6稍高更活泼
    vol: 9   // 音量 0-15，9清晰响亮
  },
  
  // 讯飞语音合成配置
  xunfei: {
    appId: '',
    apiKey: '',
    apiSecret: '',
    vcn: 'xiaoyan' // 发音人
  }
}

/**
 * 获取当前 TTS 配置
 */
export const getTTSConfig = () => {
  const saved = localStorage.getItem('simo_tts_config')
  if (saved) {
    return { ...TTS_CONFIG, ...JSON.parse(saved) }
  }
  return TTS_CONFIG
}

/**
 * 保存 TTS 配置
 */
export const saveTTSConfig = (config) => {
  localStorage.setItem('simo_tts_config', JSON.stringify(config))
}

/**
 * 获取可用语音列表
 */
export const getVoiceList = () => {
  const config = getTTSConfig()
  
  if (config.engine === 'edge') {
    return config.edge.voices
  }
  
  if (config.engine === 'browser') {
    // 浏览器原生语音
    if ('speechSynthesis' in window) {
      const voices = speechSynthesis.getVoices()
      return voices
        .filter(v => v.lang.startsWith('zh'))
        .map(v => ({ id: v.name, name: v.name, gender: 'unknown' }))
    }
  }
  
  return []
}

/**
 * Edge TTS 语音合成（通过后端代理）
 * 这是免费的微软神经网络语音，质量非常高
 */
const edgeTTS = async (text, voiceId, rate = 1.0, pitch = 1.0) => {
  try {
    const response = await fetch('/api/tts/edge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice: voiceId, rate, pitch })
    })
    
    if (!response.ok) {
      throw new Error('Edge TTS 请求失败')
    }
    
    const audioBlob = await response.blob()
    return URL.createObjectURL(audioBlob)
  } catch (error) {
    console.error('Edge TTS 错误:', error)
    throw error
  }
}

/**
 * 百度语音合成
 * 发音人说明：
 * - 0: 度小美（女声）
 * - 1: 度小宇（男声）
 * - 3: 度逍遥（情感男声）
 * - 4: 度丫丫（情感女声，推荐，最接近 SIMO）
 * - 5: 度小娇（女声）
 * - 106: 度博文（男声）
 * - 110: 度小童（童声）
 * - 111: 度小萌（萌妹）
 */
const baiduTTS = async (text, config) => {
  // 获取百度 API 配置
  const baiduConfig = localStorage.getItem('simo_baidu_tts_config')
  const { apiKey, secretKey } = baiduConfig ? JSON.parse(baiduConfig) : {}
  
  try {
    const response = await fetch('/api/tts/baidu', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        text,
        apiKey,
        secretKey,
        per: config.per || '4',   // 默认度丫丫（情感女声）
        spd: config.spd || '5',   // 语速 0-15
        pit: config.pit || '5',   // 音调 0-15
        vol: config.vol || '5'    // 音量 0-15
      })
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || '百度 TTS 请求失败')
    }
    
    const audioBlob = await response.blob()
    return URL.createObjectURL(audioBlob)
  } catch (error) {
    console.error('百度 TTS 错误:', error)
    throw error
  }
}

/**
 * 浏览器原生 TTS（兜底方案）
 */
const browserTTS = (text, voiceName, rate = 1.0, pitch = 1.0) => {
  return new Promise((resolve, reject) => {
    if (!('speechSynthesis' in window)) {
      reject(new Error('浏览器不支持语音合成'))
      return
    }
    
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'zh-CN'
    utterance.rate = rate
    utterance.pitch = pitch
    
    // 查找指定语音
    const voices = speechSynthesis.getVoices()
    const voice = voices.find(v => v.name === voiceName)
    if (voice) {
      utterance.voice = voice
    }
    
    utterance.onend = () => resolve()
    utterance.onerror = (e) => reject(e)
    
    speechSynthesis.speak(utterance)
  })
}

/**
 * 播放音频
 */
const playAudio = (audioUrl) => {
  return new Promise((resolve, reject) => {
    const audio = new Audio(audioUrl)
    audio.onended = () => {
      URL.revokeObjectURL(audioUrl)
      resolve()
    }
    audio.onerror = (e) => {
      URL.revokeObjectURL(audioUrl)
      reject(e)
    }
    audio.play()
  })
}

/**
 * Simo 语音合成主函数
 * @param {string} text - 要朗读的文本
 * @returns {Promise<void>}
 */
export const simoSpeak = async (text) => {
  if (!text) return
  
  const config = getTTSConfig()
  
  try {
    switch (config.engine) {
      case 'edge':
        // Edge TTS（推荐）
        const edgeVoice = localStorage.getItem('simo_tts_voice') || config.edge.defaultVoice
        const edgeRate = parseFloat(localStorage.getItem('simo_tts_rate')) || config.edge.rate
        const edgePitch = parseFloat(localStorage.getItem('simo_tts_pitch')) || config.edge.pitch
        
        const audioUrl = await edgeTTS(text, edgeVoice, edgeRate, edgePitch)
        await playAudio(audioUrl)
        break
        
      case 'baidu':
        // 百度 TTS
        const baiduUrl = await baiduTTS(text, config.baidu)
        await playAudio(baiduUrl)
        break
        
      case 'browser':
      default:
        // 浏览器原生 TTS
        const browserVoice = localStorage.getItem('simo_tts_voice') || ''
        const browserRate = parseFloat(localStorage.getItem('simo_tts_rate')) || 1.0
        const browserPitch = parseFloat(localStorage.getItem('simo_tts_pitch')) || 1.0
        await browserTTS(text, browserVoice, browserRate, browserPitch)
        break
    }
  } catch (error) {
    console.error('语音合成失败，降级到浏览器原生 TTS:', error)
    // 降级到浏览器原生 TTS
    try {
      await browserTTS(text, '', 1.0, 1.0)
    } catch (e) {
      console.error('浏览器 TTS 也失败了:', e)
    }
  }
}

/**
 * 停止当前语音播放
 */
export const stopSpeak = () => {
  if ('speechSynthesis' in window) {
    speechSynthesis.cancel()
  }
}

/**
 * 测试语音
 */
export const testVoice = async (voiceId, text = '在呢。有什么事吗？') => {
  const config = getTTSConfig()
  
  if (config.engine === 'edge') {
    try {
      const audioUrl = await edgeTTS(text, voiceId, config.edge.rate, config.edge.pitch)
      await playAudio(audioUrl)
    } catch (error) {
      // 降级测试
      await browserTTS(text, '', 1.0, 1.0)
    }
  } else {
    await browserTTS(text, voiceId, 1.0, 1.0)
  }
}

export default {
  simoSpeak,
  stopSpeak,
  testVoice,
  getVoiceList,
  getTTSConfig,
  saveTTSConfig
}
