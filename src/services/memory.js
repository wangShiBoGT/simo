/**
 * Simo 本地记忆系统
 * 
 * 设计理念：
 * - 所有对话历史存储在本地（隐私优先）
 * - 支持多家庭成员（不同人格档案）
 * - 长期记忆 + 短期上下文分离
 * - 未来支持摄像头人脸识别切换用户
 */

// 存储键名
const STORAGE_KEYS = {
  MEMBERS: 'simo_family_members',      // 家庭成员列表
  CONVERSATIONS: 'simo_conversations', // 对话历史
  PREFERENCES: 'simo_preferences',     // 偏好设置
  MEMORIES: 'simo_memories'            // 长期记忆摘要
}

/**
 * 家庭成员档案结构
 * 
 * 每个家庭成员有独立的：
 * - 对话历史
 * - 性格标签
 * - 偏好设置
 * - 长期记忆
 */
const createMemberProfile = (name, role = 'adult') => ({
  id: `member_${Date.now()}`,
  name,                    // 称呼：爸爸、妈妈、小明...
  role,                    // adult / child / elder
  createdAt: new Date().toISOString(),
  
  // 性格标签（Simo 会根据这些调整说话方式）
  traits: {
    talkStyle: 'normal',   // formal / casual / playful
    interests: [],         // 兴趣爱好
    topics: []             // 常聊话题
  },
  
  // 对话统计
  stats: {
    totalChats: 0,
    lastChatAt: null,
    favoriteTopics: []
  }
})

/**
 * 对话记录结构
 */
const createConversation = (memberId, messages) => ({
  id: `conv_${Date.now()}`,
  memberId,
  startedAt: new Date().toISOString(),
  messages,  // [{ role: 'user'|'simo', content: string, timestamp: string }]
  summary: null  // AI 生成的对话摘要（用于长期记忆）
})

/**
 * 长期记忆条目（可信化升级版）
 * 
 * 记忆分类：
 * - fact: 稳定事实（主人叫世博、家在五线城市）
 * - preference: 偏好（喜欢简短回答、不喜欢太吵）
 * - event: 事件/状态（今天在装修、刚才心情不错）
 * 
 * 置信度规则：
 * - >= 0.8: 肯定地说（"我记得你是..."）
 * - 0.4-0.8: 需确认（"我印象里你可能...对吗？"）
 * - < 0.4: 不直接引用
 */
const createMemory = (memberId, content, options = {}) => ({
  id: `mem_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
  memberId,
  content,
  type: options.type || 'fact',           // fact / preference / event
  confidence: options.confidence || 0.6,  // 0-1 置信度，推断记忆默认 0.6
  source: options.source || 'conversation', // explicit（明确说的）/ conversation（推断）
  editable: options.editable !== false,   // 是否可修正，默认 true
  owner: options.owner || null,           // 谁说的（家庭成员名）
  createdAt: new Date().toISOString(),
  lastConfirmedAt: null,                  // 上次确认时间
  lastUsedAt: null,                       // 上次使用时间
  usageCount: 0                           // 使用次数
})

// ============ 存储操作 ============

/**
 * 获取所有家庭成员
 */
export const getFamilyMembers = () => {
  const data = localStorage.getItem(STORAGE_KEYS.MEMBERS)
  return data ? JSON.parse(data) : []
}

/**
 * 添加家庭成员
 */
export const addFamilyMember = (name, role = 'adult') => {
  const members = getFamilyMembers()
  const newMember = createMemberProfile(name, role)
  members.push(newMember)
  localStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify(members))
  return newMember
}

/**
 * 获取成员档案
 */
export const getMemberProfile = (memberId) => {
  const members = getFamilyMembers()
  return members.find(m => m.id === memberId)
}

/**
 * 更新成员档案
 */
export const updateMemberProfile = (memberId, updates) => {
  const members = getFamilyMembers()
  const index = members.findIndex(m => m.id === memberId)
  if (index !== -1) {
    members[index] = { ...members[index], ...updates }
    localStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify(members))
  }
  return members[index]
}

// ============ 对话历史 ============

/**
 * 获取成员的对话历史
 */
export const getConversations = (memberId) => {
  const data = localStorage.getItem(STORAGE_KEYS.CONVERSATIONS)
  const all = data ? JSON.parse(data) : []
  return memberId ? all.filter(c => c.memberId === memberId) : all
}

/**
 * 保存对话
 */
export const saveConversation = (memberId, messages) => {
  const conversations = getConversations()
  const newConv = createConversation(memberId, messages)
  conversations.push(newConv)
  
  // 只保留最近 100 条对话（可配置）
  const trimmed = conversations.slice(-100)
  localStorage.setItem(STORAGE_KEYS.CONVERSATIONS, JSON.stringify(trimmed))
  
  return newConv
}

/**
 * 获取最近的对话上下文
 * 用于发送给 AI 作为短期记忆
 * 包含当前会话的消息 + 历史对话
 */
export const getRecentContext = (memberId, maxMessages = 20) => {
  // 获取历史对话
  const conversations = getConversations(memberId)
  const historicalMessages = conversations.flatMap(c => c.messages)
  
  // 合并当前会话消息（这是关键！）
  const allMessages = [...historicalMessages, ...currentSessionMessages]
  
  // 返回最近的消息
  return allMessages.slice(-maxMessages)
}

// ============ 长期记忆 ============

/**
 * 获取成员的长期记忆
 */
export const getMemories = (memberId) => {
  const data = localStorage.getItem(STORAGE_KEYS.MEMORIES)
  const all = data ? JSON.parse(data) : []
  return memberId ? all.filter(m => m.memberId === memberId) : all
}

/**
 * 添加长期记忆（可信化版本）
 * 
 * @param {string} memberId - 成员ID
 * @param {string} content - 记忆内容
 * @param {object} options - 配置项
 *   - type: 'fact' | 'preference' | 'event'
 *   - confidence: 0-1 置信度
 *   - source: 'explicit' | 'conversation'
 *   - owner: 谁说的
 */
export const addMemory = (memberId, content, options = {}) => {
  const memories = getMemories()
  
  // 检查是否已存在相似记忆
  const existing = memories.find(m => 
    m.memberId === memberId && 
    m.content.includes(content.substring(0, 20))
  )
  
  if (existing) {
    // 已存在则提升置信度
    existing.confidence = Math.min(1, existing.confidence + 0.1)
    existing.lastConfirmedAt = new Date().toISOString()
    existing.usageCount++
    localStorage.setItem(STORAGE_KEYS.MEMORIES, JSON.stringify(memories))
    return existing
  }
  
  const newMemory = createMemory(memberId, content, options)
  memories.push(newMemory)
  localStorage.setItem(STORAGE_KEYS.MEMORIES, JSON.stringify(memories))
  return newMemory
}

/**
 * 更新记忆置信度
 */
export const updateMemoryConfidence = (memoryId, delta) => {
  const memories = getMemories()
  const memory = memories.find(m => m.id === memoryId)
  if (memory) {
    memory.confidence = Math.max(0, Math.min(1, memory.confidence + delta))
    memory.lastConfirmedAt = new Date().toISOString()
    localStorage.setItem(STORAGE_KEYS.MEMORIES, JSON.stringify(memories))
  }
  return memory
}

/**
 * 修正记忆内容
 */
export const correctMemory = (memoryId, newContent) => {
  const memories = getMemories()
  const memory = memories.find(m => m.id === memoryId)
  if (memory && memory.editable) {
    memory.content = newContent
    memory.lastConfirmedAt = new Date().toISOString()
    memory.source = 'explicit'  // 修正后变为明确来源
    memory.confidence = 0.9     // 修正后提升置信度
    localStorage.setItem(STORAGE_KEYS.MEMORIES, JSON.stringify(memories))
  }
  return memory
}

/**
 * 删除记忆
 */
export const deleteMemory = (memoryId) => {
  let memories = getMemories()
  memories = memories.filter(m => m.id !== memoryId)
  localStorage.setItem(STORAGE_KEYS.MEMORIES, JSON.stringify(memories))
}

/**
 * 构建成员的记忆摘要（可信化版本）
 * 发送给 AI 作为长期记忆上下文
 * 
 * 置信度规则：
 * - >= 0.8: 确定的记忆（可以肯定地说）
 * - 0.4-0.8: 不确定的记忆（需要确认）
 * - < 0.4: 不包含在上下文中
 */
export const buildMemoryContext = (memberId) => {
  const member = getMemberProfile(memberId)
  const memories = getMemories(memberId)
  
  if (!member) return ''
  
  let context = `当前对话的家庭成员：${member.name}\n`
  context += `角色：${member.role === 'child' ? '小朋友' : member.role === 'elder' ? '长辈' : '成年人'}\n`
  
  if (member.traits.interests.length > 0) {
    context += `兴趣爱好：${member.traits.interests.join('、')}\n`
  }
  
  // 过滤掉低置信度记忆，按置信度排序
  const validMemories = memories
    .filter(m => m.confidence >= 0.4)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 10)
  
  if (validMemories.length > 0) {
    context += `\n关于 ${member.name} 的记忆：\n`
    
    validMemories.forEach(m => {
      // 根据置信度添加不同的标记
      if (m.confidence >= 0.8) {
        context += `- [确定] ${m.content}\n`
      } else {
        context += `- [不确定，需确认] ${m.content}\n`
      }
    })
    
    context += `\n使用记忆时的说话规则：
- [确定] 的记忆可以直接说："我记得你..."
- [不确定] 的记忆要确认："我印象里你可能...对吗？"
- 如果用户说记忆不对，要说："好，我改一下。"\n`
  }
  
  return context
}

// ============ 当前会话状态 ============

let currentMemberId = null
let currentSessionMessages = []

/**
 * 设置当前对话成员
 * 未来可以通过摄像头人脸识别自动切换
 */
export const setCurrentMember = (memberId) => {
  // 保存上一个成员的对话
  if (currentMemberId && currentSessionMessages.length > 0) {
    saveConversation(currentMemberId, currentSessionMessages)
  }
  
  currentMemberId = memberId
  currentSessionMessages = []
}

/**
 * 获取当前成员
 */
export const getCurrentMember = () => {
  return currentMemberId ? getMemberProfile(currentMemberId) : null
}

/**
 * 添加消息到当前会话
 */
export const addMessage = (role, content) => {
  currentSessionMessages.push({
    role,
    content,
    timestamp: new Date().toISOString()
  })
}

/**
 * 获取当前会话消息
 */
export const getCurrentMessages = () => {
  return [...currentSessionMessages]
}

/**
 * 结束当前会话并保存
 */
export const endSession = () => {
  if (currentMemberId && currentSessionMessages.length > 0) {
    saveConversation(currentMemberId, currentSessionMessages)
    currentSessionMessages = []
  }
}

// ============ 初始化 ============

/**
 * 初始化默认家庭成员（首次使用）
 */
export const initializeFamily = () => {
  const members = getFamilyMembers()
  if (members.length === 0) {
    // 创建默认的"主人"
    const defaultMember = addFamilyMember('主人', 'adult')
    setCurrentMember(defaultMember.id)
    return defaultMember
  }
  // 默认选择第一个成员
  setCurrentMember(members[0].id)
  return members[0]
}

export default {
  // 家庭成员
  getFamilyMembers,
  addFamilyMember,
  getMemberProfile,
  updateMemberProfile,
  
  // 对话历史
  getConversations,
  saveConversation,
  getRecentContext,
  
  // 长期记忆（可信化版本）
  getMemories,
  addMemory,
  updateMemoryConfidence,
  correctMemory,
  deleteMemory,
  buildMemoryContext,
  
  // 会话管理
  setCurrentMember,
  getCurrentMember,
  addMessage,
  getCurrentMessages,
  endSession,
  initializeFamily
}
