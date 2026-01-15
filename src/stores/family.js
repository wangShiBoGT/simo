/**
 * 家庭成员状态管理
 * 使用 Pinia + 持久化存储
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import dayjs from 'dayjs'

export const useFamilyStore = defineStore('family', () => {
  // ============ 状态 ============
  
  // 家庭成员列表
  const members = ref([])
  
  // 当前成员ID
  const currentMemberId = ref(null)
  
  // 对话历史（按成员分组）
  const conversations = ref({})
  
  // 长期记忆
  const memories = ref([])
  
  // ============ 计算属性 ============
  
  // 当前成员
  const currentMember = computed(() => {
    return members.value.find(m => m.id === currentMemberId.value) || null
  })
  
  // 当前成员的对话历史
  const currentConversations = computed(() => {
    return conversations.value[currentMemberId.value] || []
  })
  
  // 当前成员的记忆
  const currentMemories = computed(() => {
    return memories.value.filter(m => m.memberId === currentMemberId.value)
  })
  
  // ============ 方法 ============
  
  // 初始化默认成员
  const initializeFamily = () => {
    if (members.value.length === 0) {
      addMember('主人', 'adult')
    }
    if (!currentMemberId.value && members.value.length > 0) {
      currentMemberId.value = members.value[0].id
    }
    return currentMember.value
  }
  
  // 添加成员
  const addMember = (name, role = 'adult', traits = {}) => {
    const member = {
      id: `member_${Date.now()}`,
      name,
      role, // adult / child / elder
      traits: {
        talkStyle: 'normal',
        interests: [],
        topics: [],
        ...traits
      },
      stats: {
        totalChats: 0,
        lastChatAt: null
      },
      createdAt: dayjs().format('YYYY-MM-DD HH:mm:ss')
    }
    members.value.push(member)
    conversations.value[member.id] = []
    return member
  }
  
  // 更新成员
  const updateMember = (memberId, updates) => {
    const index = members.value.findIndex(m => m.id === memberId)
    if (index !== -1) {
      members.value[index] = { ...members.value[index], ...updates }
    }
  }
  
  // 删除成员
  const deleteMember = (memberId) => {
    members.value = members.value.filter(m => m.id !== memberId)
    delete conversations.value[memberId]
    memories.value = memories.value.filter(m => m.memberId !== memberId)
    
    // 如果删除的是当前成员，切换到第一个
    if (currentMemberId.value === memberId && members.value.length > 0) {
      currentMemberId.value = members.value[0].id
    }
  }
  
  // 切换当前成员
  const setCurrentMember = (memberId) => {
    currentMemberId.value = memberId
  }
  
  // 添加对话记录
  const addConversation = (memberId, messages) => {
    if (!conversations.value[memberId]) {
      conversations.value[memberId] = []
    }
    
    const conv = {
      id: `conv_${Date.now()}`,
      messages,
      startedAt: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      summary: null
    }
    
    conversations.value[memberId].push(conv)
    
    // 只保留最近50条对话
    if (conversations.value[memberId].length > 50) {
      conversations.value[memberId] = conversations.value[memberId].slice(-50)
    }
    
    // 更新成员统计
    const member = members.value.find(m => m.id === memberId)
    if (member) {
      member.stats.totalChats++
      member.stats.lastChatAt = dayjs().format('YYYY-MM-DD HH:mm:ss')
    }
  }
  
  // 获取最近对话上下文
  const getRecentContext = (memberId, maxMessages = 20) => {
    const convs = conversations.value[memberId] || []
    const allMessages = convs.flatMap(c => c.messages)
    return allMessages.slice(-maxMessages)
  }
  
  // 添加长期记忆
  const addMemory = (memberId, content, type = 'fact', importance = 1) => {
    const memory = {
      id: `mem_${Date.now()}`,
      memberId,
      content,
      type, // fact / preference / event / reminder
      importance,
      createdAt: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      lastUsedAt: null
    }
    memories.value.push(memory)
    return memory
  }
  
  // 构建记忆上下文（发送给AI）
  const buildMemoryContext = (memberId) => {
    const member = members.value.find(m => m.id === memberId)
    if (!member) return ''
    
    const memberMemories = memories.value
      .filter(m => m.memberId === memberId)
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 10)
    
    let context = `当前对话的家庭成员：${member.name}\n`
    context += `角色：${getRoleText(member.role)}\n`
    
    if (member.traits.interests?.length > 0) {
      context += `兴趣爱好：${member.traits.interests.join('、')}\n`
    }
    
    if (memberMemories.length > 0) {
      context += `\n关于 ${member.name} 的记忆：\n`
      memberMemories.forEach(m => {
        context += `- ${m.content}\n`
      })
    }
    
    return context
  }
  
  // 辅助函数
  const getRoleText = (role) => {
    const texts = { adult: '成年人', child: '小朋友', elder: '长辈' }
    return texts[role] || '成年人'
  }
  
  return {
    // 状态
    members,
    currentMemberId,
    conversations,
    memories,
    
    // 计算属性
    currentMember,
    currentConversations,
    currentMemories,
    
    // 方法
    initializeFamily,
    addMember,
    updateMember,
    deleteMember,
    setCurrentMember,
    addConversation,
    getRecentContext,
    addMemory,
    buildMemoryContext
  }
}, {
  // 持久化配置 - 所有数据都持久化
  persist: {
    key: 'simo-family',
    paths: ['members', 'currentMemberId', 'conversations', 'memories']
  }
})
