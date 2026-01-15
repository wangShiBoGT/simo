/**
 * Simo 核心状态管理
 * 使用 Pinia 管理全局状态，自动持久化
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import dayjs from 'dayjs'

export const useSimoStore = defineStore('simo', () => {
  // ============ 状态 ============
  
  // UI 状态
  const isListening = ref(false)
  const isThinking = ref(false)
  const isSpeaking = ref(false)
  const currentResponse = ref('')
  
  // 对话消息（当前会话）
  const messages = ref([])
  
  // 当前家庭成员
  const currentMemberId = ref(null)
  
  // ============ 计算属性 ============
  
  // 最近3条消息
  const recentMessages = computed(() => messages.value.slice(-3))
  
  // 当前状态文本
  const statusText = computed(() => {
    if (isListening.value) return '正在聆听...'
    if (isThinking.value) return '思考中...'
    if (isSpeaking.value) return currentResponse.value
    return 'Hi Simo'
  })
  
  // ============ 方法 ============
  
  // 添加消息
  const addMessage = (role, content) => {
    messages.value.push({
      id: `msg_${Date.now()}`,
      role,
      content,
      timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss')
    })
  }
  
  // 清空消息
  const clearMessages = () => {
    messages.value = []
  }
  
  // 设置状态
  const setListening = (value) => { isListening.value = value }
  const setThinking = (value) => { isThinking.value = value }
  const setSpeaking = (value, response = '') => {
    isSpeaking.value = value
    currentResponse.value = response
  }
  
  // 重置所有状态
  const resetState = () => {
    isListening.value = false
    isThinking.value = false
    isSpeaking.value = false
    currentResponse.value = ''
  }
  
  return {
    // 状态
    isListening,
    isThinking,
    isSpeaking,
    currentResponse,
    messages,
    currentMemberId,
    
    // 计算属性
    recentMessages,
    statusText,
    
    // 方法
    addMessage,
    clearMessages,
    setListening,
    setThinking,
    setSpeaking,
    resetState
  }
}, {
  // 持久化配置
  persist: {
    key: 'simo-state',
    paths: ['currentMemberId'] // 只持久化成员ID
  }
})
