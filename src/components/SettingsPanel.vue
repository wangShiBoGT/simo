<template>
  <div class="settings-overlay" @click.self="$emit('close')">
    <div class="settings-panel">
      <!-- 标题栏 -->
      <div class="panel-header">
        <h2>设置</h2>
        <button class="close-btn" @click="$emit('close')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <!-- 标签页 -->
      <div class="tabs">
        <button 
          class="tab" 
          :class="{ active: activeTab === 'api' }"
          @click="activeTab = 'api'"
        >
          API 配置
        </button>
        <button 
          class="tab" 
          :class="{ active: activeTab === 'family' }"
          @click="activeTab = 'family'"
        >
          家庭成员
        </button>
        <button 
          class="tab" 
          :class="{ active: activeTab === 'voice' }"
          @click="activeTab = 'voice'"
        >
          语音设置
        </button>
      </div>

      <!-- API 配置 -->
      <div v-if="activeTab === 'api'" class="tab-content">
        <div class="form-group">
          <label>大模型选择</label>
          <select v-model="apiConfig.provider" class="select-input">
            <option value="deepseek">DeepSeek（推荐，国内直连）</option>
            <option value="qwen">通义千问（阿里云）</option>
            <option value="moonshot">Moonshot/Kimi（超长上下文）</option>
            <option value="zhipu">智谱 GLM-4</option>
          </select>
        </div>

        <div class="form-group">
          <label>API Key</label>
          <div class="input-with-action">
            <input 
              :type="showApiKey ? 'text' : 'password'"
              v-model="apiConfig.apiKey"
              placeholder="输入你的 API Key"
              class="text-input"
            />
            <button class="icon-btn" @click="showApiKey = !showApiKey">
              <svg v-if="showApiKey" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </button>
          </div>
          <p class="hint">
            <a :href="getProviderUrl()" target="_blank">点击获取 {{ getProviderName() }} API Key →</a>
          </p>
        </div>

        <div class="form-group">
          <label>后端地址（可选）</label>
          <input 
            type="text"
            v-model="apiConfig.apiBase"
            placeholder="留空使用默认，如：https://your-server.com/api"
            class="text-input"
          />
          <p class="hint">GitHub Pages 部署时需要填写后端服务器地址</p>
        </div>

        <div class="form-group">
          <label>连接状态</label>
          <div class="status-row">
            <span class="status-dot" :class="connectionStatus"></span>
            <span>{{ getStatusText() }}</span>
          </div>
        </div>

        <button class="primary-btn" @click="testConnection" :disabled="testing">
          {{ testing ? '测试中...' : '测试连接' }}
        </button>

        <button class="secondary-btn" @click="saveApiConfig">
          保存配置
        </button>
      </div>

      <!-- 家庭成员管理 -->
      <div v-if="activeTab === 'family'" class="tab-content">
        <div class="member-list">
          <div 
            v-for="member in familyMembers" 
            :key="member.id" 
            class="member-card"
            :class="{ active: currentMemberId === member.id }"
            @click="selectMember(member.id)"
          >
            <div class="member-avatar">
              {{ getAvatarEmoji(member.role) }}
            </div>
            <div class="member-info">
              <span class="member-name">{{ member.name }}</span>
              <span class="member-role">{{ getRoleText(member.role) }}</span>
            </div>
            <button class="edit-btn" @click.stop="editMember(member)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- 添加成员表单 -->
        <div class="add-member-form">
          <h3>{{ editingMember ? '编辑成员' : '添加成员' }}</h3>
          <div class="form-row">
            <input 
              v-model="newMember.name"
              type="text"
              placeholder="称呼（如：爸爸、小明）"
              class="text-input"
            />
            <select v-model="newMember.role" class="select-input">
              <option value="adult">成年人</option>
              <option value="child">小朋友</option>
              <option value="elder">长辈</option>
            </select>
          </div>
          <div class="form-row">
            <input 
              v-model="newMember.interests"
              type="text"
              placeholder="兴趣爱好（用逗号分隔）"
              class="text-input full"
            />
          </div>
          <div class="btn-row">
            <button class="primary-btn" @click="saveMember">
              {{ editingMember ? '保存修改' : '添加成员' }}
            </button>
            <button v-if="editingMember" class="secondary-btn" @click="cancelEdit">
              取消
            </button>
            <button 
              v-if="editingMember && familyMembers.length > 1" 
              class="danger-btn" 
              @click="deleteMember"
            >
              删除
            </button>
          </div>
        </div>
      </div>

      <!-- 语音设置 -->
      <div v-if="activeTab === 'voice'" class="tab-content">
        <div class="form-group">
          <label>语音识别</label>
          <div class="status-row">
            <span class="status-dot" :class="speechSupported ? 'connected' : 'error'"></span>
            <span>{{ speechSupported ? '浏览器支持语音识别' : '浏览器不支持语音识别' }}</span>
          </div>
        </div>

        <!-- TTS 引擎选择 -->
        <div class="form-group">
          <label>语音合成引擎</label>
          <select v-model="voiceConfig.engine" class="select-input">
            <option value="browser">浏览器原生（免费，推荐）</option>
            <option value="baidu">百度语音（极越同款，需API Key）</option>
          </select>
        </div>

        <!-- 浏览器原生 TTS 设置 -->
        <template v-if="voiceConfig.engine === 'browser'">
          <div class="form-group">
            <label>语音选择</label>
            <select v-model="voiceConfig.voice" class="select-input">
              <option v-for="voice in availableVoices" :key="voice.name" :value="voice.name">
                {{ voice.name }} ({{ voice.lang }})
              </option>
            </select>
          </div>

          <div class="form-group">
            <label>语速：{{ voiceConfig.rate }}</label>
            <input 
              type="range" 
              v-model.number="voiceConfig.rate" 
              min="0.5" 
              max="2" 
              step="0.1"
              class="range-input"
            />
          </div>

          <div class="form-group">
            <label>音调：{{ voiceConfig.pitch }}</label>
            <input 
              type="range" 
              v-model.number="voiceConfig.pitch" 
              min="0.5" 
              max="2" 
              step="0.1"
              class="range-input"
            />
          </div>
        </template>

        <!-- 百度 TTS 设置 -->
        <template v-if="voiceConfig.engine === 'baidu'">
          <div class="form-group">
            <label>API Key</label>
            <input 
              type="text"
              v-model="baiduTTSConfig.apiKey"
              placeholder="百度语音合成 API Key"
              class="text-input"
            />
          </div>

          <div class="form-group">
            <label>Secret Key</label>
            <input 
              type="password"
              v-model="baiduTTSConfig.secretKey"
              placeholder="百度语音合成 Secret Key"
              class="text-input"
            />
            <p class="hint">
              <a href="https://ai.baidu.com/tech/speech/tts" target="_blank">点击获取百度语音 API Key →</a>
            </p>
          </div>

          <div class="form-group">
            <label>发音人</label>
            <select v-model="baiduTTSConfig.per" class="select-input">
              <option value="4">度丫丫（情感女声，推荐）</option>
              <option value="0">度小美（标准女声）</option>
              <option value="1">度小宇（标准男声）</option>
              <option value="3">度逍遥（情感男声）</option>
              <option value="5">度小娇（甜美女声）</option>
              <option value="106">度博文（磁性男声）</option>
              <option value="110">度小童（童声）</option>
              <option value="111">度小萌（萌妹）</option>
            </select>
          </div>

          <div class="form-group">
            <label>语速：{{ baiduTTSConfig.spd }}</label>
            <input 
              type="range" 
              v-model.number="baiduTTSConfig.spd" 
              min="0" 
              max="15" 
              step="1"
              class="range-input"
            />
          </div>

          <div class="form-group">
            <label>音调：{{ baiduTTSConfig.pit }}</label>
            <input 
              type="range" 
              v-model.number="baiduTTSConfig.pit" 
              min="0" 
              max="15" 
              step="1"
              class="range-input"
            />
          </div>
        </template>

        <button class="primary-btn" @click="testVoice">
          测试语音："在呢。"
        </button>

        <button class="secondary-btn" @click="saveVoiceConfig">
          保存设置
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import memory from '../services/memory.js'

const emit = defineEmits(['close', 'member-changed'])

// 标签页
const activeTab = ref('api')

// API 配置
const apiConfig = reactive({
  provider: 'deepseek',
  apiKey: '',
  apiBase: ''  // 后端地址（GitHub Pages 部署时需要）
})
const showApiKey = ref(false)
const testing = ref(false)
const connectionStatus = ref('disconnected') // disconnected, testing, connected, error

// 家庭成员
const familyMembers = ref([])
const currentMemberId = ref(null)
const editingMember = ref(null)
const newMember = reactive({
  name: '',
  role: 'adult',
  interests: ''
})

// 语音配置
const speechSupported = ref(false)
const availableVoices = ref([])
const voiceConfig = reactive({
  engine: 'browser', // browser / baidu
  voice: '',
  rate: 0.95,  // SIMO 风格：略慢
  pitch: 1.05  // SIMO 风格：略高
})

// 百度 TTS 配置
const baiduTTSConfig = reactive({
  apiKey: '',
  secretKey: '',
  per: '4',   // 度丫丫（情感女声）
  spd: 5,     // 语速
  pit: 5      // 音调
})

// 获取提供商信息
const getProviderUrl = () => {
  const urls = {
    deepseek: 'https://platform.deepseek.com/',
    qwen: 'https://dashscope.console.aliyun.com/',
    moonshot: 'https://platform.moonshot.cn/',
    zhipu: 'https://open.bigmodel.cn/'
  }
  return urls[apiConfig.provider] || urls.deepseek
}

const getProviderName = () => {
  const names = {
    deepseek: 'DeepSeek',
    qwen: '通义千问',
    moonshot: 'Moonshot',
    zhipu: '智谱'
  }
  return names[apiConfig.provider] || 'DeepSeek'
}

const getStatusText = () => {
  const texts = {
    disconnected: '未连接',
    testing: '测试中...',
    connected: '连接成功',
    error: '连接失败'
  }
  return texts[connectionStatus.value]
}

// 测试连接
const testConnection = async () => {
  if (!apiConfig.apiKey) {
    alert('请先输入 API Key')
    return
  }
  
  testing.value = true
  connectionStatus.value = 'testing'
  
  try {
    // 保存到 localStorage 供后端使用
    localStorage.setItem('simo_api_config', JSON.stringify(apiConfig))
    
    // 使用配置的后端地址或默认
    const apiBase = apiConfig.apiBase || '/api'
    
    // 测试健康检查接口
    const response = await fetch(`${apiBase}/health`)
    
    if (response.ok) {
      connectionStatus.value = 'connected'
    } else {
      connectionStatus.value = 'error'
    }
  } catch (error) {
    console.error('测试连接失败:', error)
    connectionStatus.value = 'error'
  } finally {
    testing.value = false
  }
}

// 保存 API 配置
const saveApiConfig = () => {
  localStorage.setItem('simo_api_config', JSON.stringify(apiConfig))
  alert('配置已保存')
}

// 家庭成员相关
const getAvatarEmoji = (role) => {
  const emojis = { adult: '👤', child: '👶', elder: '👴' }
  return emojis[role] || '👤'
}

const getRoleText = (role) => {
  const texts = { adult: '成年人', child: '小朋友', elder: '长辈' }
  return texts[role] || '成年人'
}

const selectMember = (memberId) => {
  currentMemberId.value = memberId
  memory.setCurrentMember(memberId)
  emit('member-changed', memberId)
}

const editMember = (member) => {
  editingMember.value = member
  newMember.name = member.name
  newMember.role = member.role
  newMember.interests = member.traits?.interests?.join('、') || ''
}

const cancelEdit = () => {
  editingMember.value = null
  newMember.name = ''
  newMember.role = 'adult'
  newMember.interests = ''
}

const saveMember = () => {
  if (!newMember.name.trim()) {
    alert('请输入称呼')
    return
  }
  
  const interests = newMember.interests
    .split(/[,，、]/)
    .map(s => s.trim())
    .filter(s => s)
  
  if (editingMember.value) {
    // 更新现有成员
    memory.updateMemberProfile(editingMember.value.id, {
      name: newMember.name,
      role: newMember.role,
      traits: {
        ...editingMember.value.traits,
        interests
      }
    })
  } else {
    // 添加新成员
    const member = memory.addFamilyMember(newMember.name, newMember.role)
    memory.updateMemberProfile(member.id, {
      traits: { interests, talkStyle: 'normal', topics: [] }
    })
  }
  
  // 刷新列表
  familyMembers.value = memory.getFamilyMembers()
  cancelEdit()
}

const deleteMember = () => {
  if (!editingMember.value) return
  if (!confirm(`确定要删除 ${editingMember.value.name} 吗？`)) return
  
  // 从列表中移除
  const members = memory.getFamilyMembers().filter(m => m.id !== editingMember.value.id)
  localStorage.setItem('simo_family_members', JSON.stringify(members))
  
  familyMembers.value = members
  
  // 如果删除的是当前成员，切换到第一个
  if (currentMemberId.value === editingMember.value.id && members.length > 0) {
    selectMember(members[0].id)
  }
  
  cancelEdit()
}

// 语音相关
const loadVoices = () => {
  const voices = speechSynthesis.getVoices()
  availableVoices.value = voices.filter(v => v.lang.startsWith('zh'))
  
  if (availableVoices.value.length > 0 && !voiceConfig.voice) {
    voiceConfig.voice = availableVoices.value[0].name
  }
}

const testVoice = async () => {
  const testText = '在呢。有什么事吗？'
  
  if (voiceConfig.engine === 'baidu') {
    // 测试百度 TTS
    if (!baiduTTSConfig.apiKey || !baiduTTSConfig.secretKey) {
      alert('请先填写百度语音 API Key 和 Secret Key')
      return
    }
    
    try {
      const response = await fetch('/api/tts/baidu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: testText,
          apiKey: baiduTTSConfig.apiKey,
          secretKey: baiduTTSConfig.secretKey,
          per: baiduTTSConfig.per,
          spd: baiduTTSConfig.spd,
          pit: baiduTTSConfig.pit
        })
      })
      
      if (!response.ok) {
        const error = await response.json()
        alert('百度语音测试失败：' + (error.error || '未知错误'))
        return
      }
      
      const audioBlob = await response.blob()
      const audioUrl = URL.createObjectURL(audioBlob)
      const audio = new Audio(audioUrl)
      audio.onended = () => URL.revokeObjectURL(audioUrl)
      audio.play()
    } catch (e) {
      alert('百度语音测试失败：' + e.message)
    }
  } else {
    // 浏览器原生 TTS
    speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(testText)
    utterance.lang = 'zh-CN'
    utterance.rate = voiceConfig.rate
    utterance.pitch = voiceConfig.pitch
    
    const voice = availableVoices.value.find(v => v.name === voiceConfig.voice)
    if (voice) utterance.voice = voice
    
    speechSynthesis.speak(utterance)
  }
}

const saveVoiceConfig = () => {
  localStorage.setItem('simo_voice_config', JSON.stringify(voiceConfig))
  
  // 保存百度 TTS 配置
  if (voiceConfig.engine === 'baidu') {
    localStorage.setItem('simo_baidu_tts_config', JSON.stringify(baiduTTSConfig))
  }
  alert('语音设置已保存')
}

// 初始化
onMounted(() => {
  // 加载 API 配置
  const savedApiConfig = localStorage.getItem('simo_api_config')
  if (savedApiConfig) {
    const config = JSON.parse(savedApiConfig)
    apiConfig.provider = config.provider || 'deepseek'
    apiConfig.apiKey = config.apiKey || ''
    apiConfig.apiBase = config.apiBase || ''
  }
  
  // 加载家庭成员
  familyMembers.value = memory.getFamilyMembers()
  if (familyMembers.value.length === 0) {
    memory.initializeFamily()
    familyMembers.value = memory.getFamilyMembers()
  }
  
  const currentMember = memory.getCurrentMember()
  currentMemberId.value = currentMember?.id || familyMembers.value[0]?.id
  
  // 检查语音支持
  speechSupported.value = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window
  
  // 加载语音列表
  if ('speechSynthesis' in window) {
    loadVoices()
    speechSynthesis.onvoiceschanged = loadVoices
  }
  
  // 加载语音配置
  const savedVoiceConfig = localStorage.getItem('simo_voice_config')
  if (savedVoiceConfig) {
    const config = JSON.parse(savedVoiceConfig)
    Object.assign(voiceConfig, config)
  }
  
  // 加载百度 TTS 配置
  const savedBaiduConfig = localStorage.getItem('simo_baidu_tts_config')
  if (savedBaiduConfig) {
    const config = JSON.parse(savedBaiduConfig)
    Object.assign(baiduTTSConfig, config)
  }
})
</script>

<style scoped>
.settings-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.settings-panel {
  width: 90%;
  max-width: 500px;
  max-height: 80vh;
  background: var(--bg-secondary);
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.panel-header h2 {
  font-size: 18px;
  font-weight: 500;
  color: var(--text-primary);
}

.close-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: none;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  transition: all 0.2s;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
}

.close-btn svg {
  width: 20px;
  height: 20px;
}

/* 标签页 */
.tabs {
  display: flex;
  padding: 0 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.tab {
  padding: 12px 16px;
  border: none;
  background: none;
  color: var(--text-secondary);
  font-size: 14px;
  cursor: pointer;
  position: relative;
  transition: color 0.2s;
}

.tab:hover {
  color: var(--text-primary);
}

.tab.active {
  color: var(--jiyue-blue);
}

.tab.active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--jiyue-blue);
}

/* 内容区 */
.tab-content {
  padding: 24px;
  overflow-y: auto;
  flex: 1;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.text-input,
.select-input {
  width: 100%;
  padding: 12px 16px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: var(--bg-tertiary);
  color: var(--text-primary);
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}

.text-input:focus,
.select-input:focus {
  border-color: var(--jiyue-blue);
}

.select-input {
  cursor: pointer;
}

.input-with-action {
  display: flex;
  gap: 8px;
}

.input-with-action .text-input {
  flex: 1;
}

.icon-btn {
  width: 44px;
  height: 44px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: var(--bg-tertiary);
  border-radius: 8px;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.icon-btn:hover {
  border-color: var(--jiyue-blue);
  color: var(--jiyue-blue);
}

.icon-btn svg {
  width: 18px;
  height: 18px;
}

.hint {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-top: 8px;
}

.hint a {
  color: var(--jiyue-blue);
  text-decoration: none;
}

.hint a:hover {
  text-decoration: underline;
}

.status-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--text-secondary);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-tertiary);
}

.status-dot.connected {
  background: var(--listening-color);
  box-shadow: 0 0 8px var(--listening-glow);
}

.status-dot.testing {
  background: var(--thinking-color);
  animation: pulse 1s infinite;
}

.status-dot.error {
  background: #ff4444;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* 按钮 */
.primary-btn,
.secondary-btn,
.danger-btn {
  width: 100%;
  padding: 12px 20px;
  border-radius: 8px;
  border: none;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: 12px;
}

.primary-btn {
  background: var(--jiyue-blue);
  color: var(--bg-primary);
}

.primary-btn:hover {
  box-shadow: 0 0 20px var(--jiyue-blue-glow);
}

.primary-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.secondary-btn {
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.secondary-btn:hover {
  border-color: var(--jiyue-blue);
}

.danger-btn {
  background: rgba(255, 68, 68, 0.2);
  color: #ff4444;
  border: 1px solid rgba(255, 68, 68, 0.3);
}

.danger-btn:hover {
  background: rgba(255, 68, 68, 0.3);
}

/* 家庭成员列表 */
.member-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 24px;
}

.member-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--bg-tertiary);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  cursor: pointer;
  transition: all 0.2s;
}

.member-card:hover {
  border-color: rgba(255, 255, 255, 0.1);
}

.member-card.active {
  border-color: var(--jiyue-blue);
  background: rgba(0, 212, 255, 0.1);
}

.member-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--bg-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
}

.member-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.member-name {
  font-size: 14px;
  color: var(--text-primary);
}

.member-role {
  font-size: 12px;
  color: var(--text-tertiary);
}

.edit-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: none;
  color: var(--text-tertiary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  transition: all 0.2s;
}

.edit-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
}

.edit-btn svg {
  width: 16px;
  height: 16px;
}

/* 添加成员表单 */
.add-member-form {
  padding-top: 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.add-member-form h3 {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 16px;
}

.form-row {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
}

.form-row .text-input {
  flex: 1;
}

.form-row .text-input.full {
  flex: none;
  width: 100%;
}

.form-row .select-input {
  width: 120px;
}

.btn-row {
  display: flex;
  gap: 12px;
}

.btn-row .primary-btn,
.btn-row .secondary-btn,
.btn-row .danger-btn {
  flex: 1;
  margin-bottom: 0;
}

/* 滑块 */
.range-input {
  width: 100%;
  height: 4px;
  border-radius: 2px;
  background: var(--bg-tertiary);
  outline: none;
  -webkit-appearance: none;
}

.range-input::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--jiyue-blue);
  cursor: pointer;
}
</style>
