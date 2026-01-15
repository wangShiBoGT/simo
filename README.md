# 🤖 Simo - 家用 AI 机器人

> **人格先行的智能陪伴** | 设计灵感：极越汽车 SIMO
> 
> Simo 不是通用聊天助手，而是**长期存在于家庭中的智能体**。

---

## 📋 目录

- [快速开始](#-快速开始)
- [项目结构](#-项目结构)
- [功能特性](#-功能特性)
- [配置说明](#-配置说明)
- [API 接口](#-api-接口)
- [硬件演进路线](#-硬件演进路线)
- [开发指南](#-开发指南)

---

## 🚀 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env 填入 API Key（智谱 GLM-4 免费）

# 3. 启动后端
node server/index.js

# 4. 启动前端（新终端）
npm run dev

# 5. 访问
http://localhost:3000
```

### 默认配置
- **大模型**: 智谱 GLM-4-flash（免费）
- **语音合成**: Edge TTS（微软神经语音，免费）
- **硬件等级**: L0（纯软件）

---

## 📁 项目结构

```
simo/
├── src/                          # 前端源码
│   ├── App.vue                   # 主界面（Claude/ChatGPT 风格）
│   ├── main.js                   # 入口
│   ├── components/
│   │   └── SettingsPanel.vue     # 设置面板
│   ├── config/
│   │   └── constants.js          # 全局常量配置
│   ├── services/
│   │   ├── simo.js               # 核心对话服务
│   │   ├── memory.js             # 本地记忆系统（可信化）
│   │   ├── tts.js                # 语音合成服务
│   │   └── hardware.js           # 硬件控制服务
│   └── stores/                   # Pinia 状态管理
│
├── server/                       # 后端
│   ├── index.js                  # API 服务（3001端口）
│   └── hardware.config.js        # 硬件配置（L0→L3）
│
├── .env                          # 环境变量（API Key）
├── .env.example                  # 环境变量示例
├── vite.config.js                # Vite 配置（含代理）
└── package.json
```

---

## ✨ 功能特性

### 🎯 语音交互（手感优化）
| 特性 | 说明 |
|------|------|
| **快速回应** | "Hi Simo" → 立即回"在呢"，同时处理请求 |
| **打断能力** | 说"等等/停"立即停止语音 |
| **短回应优先** | 1-2句话回复，不啰嗦 |
| **低存在感** | 不主动插话，只在被叫时回应 |

### 🧠 记忆系统（可信化）
| 特性 | 说明 |
|------|------|
| **置信度** | ≥0.8 肯定说，0.4-0.8 需确认，<0.4 不引用 |
| **来源追踪** | explicit（明确说的）/ conversation（推断） |
| **可修正** | 用户说"不对"时可以修改 |
| **多成员** | 不同家庭成员独立记忆 |

### 🔊 语音合成（TTS）
| 引擎 | 特点 | 状态 |
|------|------|------|
| **Edge TTS** | 微软神经语音，自然有感情 | ✅ 默认 |
| **百度语音** | 极越同款技术 | ✅ 备选 |
| **浏览器原生** | 兜底方案 | ✅ 备选 |

### 🤖 多模型支持
| 模型 | 特点 | 状态 |
|------|------|------|
| **智谱 GLM-4** | 免费，中文好 | ✅ 默认 |
| **DeepSeek** | 便宜，效果好 | ✅ 可选 |
| **通义千问** | 阿里系 | ✅ 可选 |
| **Moonshot** | 超长上下文 | ✅ 可选 |
| **文心一言** | 百度系 | ✅ 可选 |

---

## ⚙️ 配置说明

### 环境变量 (.env)
```bash
# 大模型 API Key（至少配置一个）
ZHIPU_API_KEY=your_key_here      # 智谱（免费）
DEEPSEEK_API_KEY=your_key_here   # DeepSeek
QWEN_API_KEY=your_key_here       # 通义千问
MOONSHOT_API_KEY=your_key_here   # Moonshot

# 百度语音合成（可选，每日5万次免费）
BAIDU_TTS_API_KEY=your_key_here
BAIDU_TTS_SECRET_KEY=your_key_here
```

### 切换默认模型
修改 `server/index.js`:
```javascript
const CURRENT_LLM = 'zhipu'  // zhipu / deepseek / qwen / moonshot
```

### 切换默认语音
修改 `src/services/simo.js`:
```javascript
const engine = voiceConfig.engine || 'edge'  // edge / baidu / browser
```

---

## 📡 API 接口

### 核心接口
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/chat` | 对话 |
| POST | `/api/tts/edge` | Edge TTS 语音合成 |
| POST | `/api/tts/baidu` | 百度语音合成 |
| GET | `/api/health` | 健康检查 |

### 硬件接口（已预埋）
| 方法 | 路径 | 说明 | 等级 |
|------|------|------|------|
| POST | `/api/hardware/display` | 显示控制 | L1 |
| POST | `/api/hardware/audio` | 音频控制 | L1 |
| POST | `/api/hardware/vision` | 视觉输入 | L2 |
| POST | `/api/hardware/motion` | 运动控制 | L2/L3 |
| GET | `/api/hardware/sensors` | 传感器数据 | L2/L3 |
| GET | `/api/hardware/status` | 硬件状态 | 全部 |

---

## 🔧 硬件演进路线

```
L0 纯软件（当前）
│   └── 屏幕 + 语音
│
L1 定点存在
│   └── 外接屏幕 + 可移动底座（不自主移动）
│
L2 简单移动
│   └── 跟随 + 避障 + 房间级移动
│
L3 智能交互
    └── 情感表达 + 主动行为 + 空间记忆
```

### 硬件配置文件
`server/hardware.config.js` 包含完整的 L0→L3 配置：
- 显示配置（屏幕、表情动画）
- 音频配置（输入输出、唤醒词）
- 视觉配置（摄像头、人脸识别）
- 运动配置（底盘、云台、机械臂）
- 传感器配置（温湿度、距离、电池）
- 安全配置（紧急停止、运行限制）

---

## 💻 开发指南

### 技术栈
| 技术 | 用途 |
|------|------|
| Vue 3 + Vite | 前端框架 |
| Node.js | 后端服务 |
| Edge TTS | 语音合成 |
| LocalStorage | 本地存储 |

### 代码规范
- 中文注释
- 常量集中管理 (`src/config/constants.js`)
- 服务模块化 (`src/services/`)

### 添加新模型
1. 在 `server/index.js` 的 `LLM_CONFIGS` 添加配置
2. 在 `.env` 添加 API Key
3. 在前端模型选择器添加选项

### 添加新硬件
1. 在 `server/hardware.config.js` 添加配置
2. 在 `server/index.js` 实现接口逻辑
3. 在 `src/services/hardware.js` 添加前端调用

---

## 📝 Simo 人格 Prompt

核心原则（位于 `server/index.js`）：
1. **短回应优先**：能一句话说完，绝不三句
2. **低存在感**：不主动插话，只在被叫时"在呢"
3. **敢说不知道**：不确定就说"这个我不太确定"

唤醒响应：
- "Hi Simo" → "在呢。"

---

## 📄 License

MIT

---

**当主人在家时，Simo 是"在"的。**
