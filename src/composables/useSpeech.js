/**
 * 语音交互组合式函数
 * 基于 VueUse 封装语音识别和语音合成
 * 
 * 依赖：@vueuse/core
 */

import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useLocalStorage, usePermission } from '@vueuse/core'

/**
 * 语音识别 Hook
 */
export function useSpeechRecognition() {
  const isSupported = ref(false)
  const isListening = ref(false)
  const transcript = ref('')
  const interimTranscript = ref('')
  const error = ref(null)
  
  let recognition = null
  
  // 检查浏览器支持
  const checkSupport = () => {
    isSupported.value = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window
    return isSupported.value
  }
  
  // 初始化
  const init = () => {
    if (!checkSupport()) return false
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    recognition = new SpeechRecognition()
    
    recognition.lang = 'zh-CN'
    recognition.continuous = false
    recognition.interimResults = true
    recognition.maxAlternatives = 1
    
    recognition.onstart = () => {
      isListening.value = true
      error.value = null
    }
    
    recognition.onend = () => {
      isListening.value = false
    }
    
    recognition.onresult = (event) => {
      let interim = ''
      let final = ''
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          final += result[0].transcript
        } else {
          interim += result[0].transcript
        }
      }
      
      if (final) {
        transcript.value = final
      }
      interimTranscript.value = interim
    }
    
    recognition.onerror = (event) => {
      error.value = event.error
      isListening.value = false
      
      if (event.error === 'not-allowed') {
        console.error('麦克风权限被拒绝')
      }
    }
    
    return true
  }
  
  // 开始识别
  const start = () => {
    if (!recognition) {
      if (!init()) {
        error.value = 'not-supported'
        return false
      }
    }
    
    transcript.value = ''
    interimTranscript.value = ''
    
    try {
      recognition.start()
      return true
    } catch (e) {
      error.value = e.message
      return false
    }
  }
  
  // 停止识别
  const stop = () => {
    if (recognition && isListening.value) {
      recognition.stop()
    }
  }
  
  // 切换状态
  const toggle = () => {
    if (isListening.value) {
      stop()
    } else {
      start()
    }
  }
  
  onMounted(() => {
    checkSupport()
  })
  
  onUnmounted(() => {
    stop()
  })
  
  return {
    isSupported,
    isListening,
    transcript,
    interimTranscript,
    error,
    start,
    stop,
    toggle
  }
}

/**
 * 语音合成 Hook
 */
export function useSpeechSynthesis() {
  const isSupported = ref(false)
  const isSpeaking = ref(false)
  const voices = ref([])
  const error = ref(null)
  
  // 配置（持久化）
  const config = useLocalStorage('simo-voice-config', {
    voice: '',
    rate: 1,
    pitch: 1,
    volume: 1
  })
  
  let utterance = null
  
  // 检查支持
  const checkSupport = () => {
    isSupported.value = 'speechSynthesis' in window
    return isSupported.value
  }
  
  // 加载语音列表
  const loadVoices = () => {
    if (!isSupported.value) return
    
    const allVoices = speechSynthesis.getVoices()
    // 只保留中文语音
    voices.value = allVoices.filter(v => 
      v.lang.startsWith('zh') || v.lang.includes('Chinese')
    )
    
    // 如果没有选择语音，默认选第一个中文语音
    if (!config.value.voice && voices.value.length > 0) {
      config.value.voice = voices.value[0].name
    }
  }
  
  // 朗读文本
  const speak = (text) => {
    if (!isSupported.value || !text) return false
    
    // 停止当前朗读
    stop()
    
    utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'zh-CN'
    utterance.rate = config.value.rate
    utterance.pitch = config.value.pitch
    utterance.volume = config.value.volume
    
    // 设置语音
    const selectedVoice = voices.value.find(v => v.name === config.value.voice)
    if (selectedVoice) {
      utterance.voice = selectedVoice
    }
    
    utterance.onstart = () => {
      isSpeaking.value = true
    }
    
    utterance.onend = () => {
      isSpeaking.value = false
    }
    
    utterance.onerror = (event) => {
      error.value = event.error
      isSpeaking.value = false
    }
    
    speechSynthesis.speak(utterance)
    return true
  }
  
  // 停止朗读
  const stop = () => {
    if (isSupported.value) {
      speechSynthesis.cancel()
      isSpeaking.value = false
    }
  }
  
  // 暂停
  const pause = () => {
    if (isSupported.value) {
      speechSynthesis.pause()
    }
  }
  
  // 继续
  const resume = () => {
    if (isSupported.value) {
      speechSynthesis.resume()
    }
  }
  
  onMounted(() => {
    if (checkSupport()) {
      loadVoices()
      // 某些浏览器需要等待 voiceschanged 事件
      speechSynthesis.onvoiceschanged = loadVoices
    }
  })
  
  onUnmounted(() => {
    stop()
  })
  
  return {
    isSupported,
    isSpeaking,
    voices,
    config,
    error,
    speak,
    stop,
    pause,
    resume
  }
}

/**
 * 麦克风权限 Hook
 */
export function useMicrophonePermission() {
  const permission = usePermission('microphone')
  
  const requestPermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      // 立即停止，只是为了请求权限
      stream.getTracks().forEach(track => track.stop())
      return true
    } catch (e) {
      console.error('请求麦克风权限失败:', e)
      return false
    }
  }
  
  return {
    permission,
    requestPermission
  }
}
