# 🤖 Simo - 家用 AI 机器人

> **人格先行的智能陪伴** | 设计灵感：极越汽车 SIMO
> 
> Simo 不是通用聊天助手，而是**长期存在于家庭中的智能体**。

⚠️ **Simo 的所有行为受 [`BEHAVIOR.md`](./BEHAVIOR.md) 约束。**

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
L2 简单移动 ← 当前进度
│   └── 跟随 + 避障 + 房间级移动
│   └── ✅ STM32 智能小车串口通信已完成
│   └── ✅ 超声波+红外传感器已接入
│   └── ✅ 中文口语化语音控制已完成
│   └── ✅ A阶段可见性增强已完成
│
L3 智能交互 ← 架构设计中
    └── 视觉边界 + 人脸识别 + 长对话 + 自主导航
    └── 详见 `docs/l3-architecture.md`
```

---

## 🚗 STM32 智能小车集成（L2 硬件）

### 当前进度（2026-01-18 更新）

| 项目 | 状态 | 说明 |
|------|------|------|
| Node.js 串口模块 | ✅ 完成 | `server/serial.js` |
| DTR/RTS 信号处理 | ✅ 完成 | 设置低电平避免干扰 |
| 串口通信协议 | ✅ 完成 | PING/PONG, F/B/L/R,duration |
| STM32 固件适配 | ✅ 完成 | `main_simo.c`，115200波特率 |
| 电机驱动 | ✅ 完成 | 前进/后退/左转/右转 |
| 蜂鸣器控制 | ✅ 完成 | 启动响一声，BEEP命令可控 |
| 语音控制运动 | ✅ 完成 | 中文口语化控制（走/冲/倒/左拐/站住） |
| 心跳检测 | ✅ 完成 | 服务端自动发送 PING，检测连接状态 |
| 超声波传感器 | ✅ 完成 | 轮询模式，带超时保护 |
| 红外避障传感器 | ✅ 完成 | 左右双路检测 |
| 复杂指令分解 | ✅ 完成 | "走完左拐" → F+L 动作建议序列（每步仍需 Guard/Safety 检查） |
| A阶段可见性 | ✅ 完成 | 状态条+动作卡片+STOP按钮 |
| B阶段安全层 | ✅ 完成 | SafetyManager + 传感器安全否决 |
| C阶段序列拆解 | ✅ 完成 | 建议队列（每步仍需 Guard/Safety 验证） |
| L2.8熟练层 | ✅ 完成 | 动作完成后建议"继续吗？"（5秒超时） |
| NLU双轨解析 | ✅ 完成 | 规则优先 + LLM兜底（AI只做翻译官） |
| 舵机控制 | ⚠️ 暂停 | PWM 抖动问题，已注释掉初始化代码 |
| 自主避障 | ✅ 完成 | 探索模式：扫描→决策→避障→前进 |
| Web UI 控制验证 | ✅ 完成 | 2026-01-18 验证通过 |
| 前端性能优化 | ✅ 完成 | 降低轮询频率，禁用重复请求 |
| 安全阈值调整 | ✅ 完成 | 危险距离 3cm，警告距离 8cm |

### 2026-01-18 验证记录

**已完成**：
- ✅ STM32 小车串口通信正常（PING/PONG）
- ✅ Web UI 控制小车（前进/后退/左转/右转）
- ✅ 传感器数据读取正常（超声波/红外）
- ✅ 语音控制正常（"前进"、"停"、"响一下"）

**已知问题**：
- ⚠️ 舵机 PWM 抖动：已注释掉 `Servo_Init()` 和 `Servo_SetAngle(90)`
- ⚠️ 断开串口后舵机/蜂鸣器异常：需要用 Keil 重新编译固件后烧录
- 📝 固件修改位置：`d:\...\9.机器人超声波避障（带舵机摇头）\User\main.c` 第263-265行

### ESP32-S3 开发进度（2025-01-27 更新）

**当前固件版本：v2.4.0**

| 项目 | 状态 | 说明 |
|------|------|------|
| ESP32-S3-N16R8 主板 | ✅ 已到货 | 16MB Flash + 8MB PSRAM |
| PlatformIO 环境配置 | ✅ 完成 | 工具链安装在 D:\platformio |
| 测试固件烧录 | ✅ 完成 | 芯片信息输出 + LED闪烁 |
| WiFi AP 热点 | ✅ 完成 | SSID: Simo-Robot, 密码: simo1234 |
| Web 控制页面 | ✅ 完成 | 高度集成的现代化控制面板 |
| STM32通信协议 | ✅ 完成 | 标准协议 + PING心跳 + 传感器缓存 |
| 语音命令API | ✅ 完成 | /voice?text=前进 预留给小智AI |
| 系统信息API | ✅ 完成 | /info 返回芯片/内存/版本 |
| WiFi配网页面 | ✅ 完成 | /wifi 扫描+选择+保存家庭WiFi |
| NVS凭证存储 | ✅ 完成 | 掉电不丢失，重启自动连接 |
| 自主导航模式 | ✅ 完成 | /mode?m=patrol 巡逻/跟随/返航 |
| OTA远程升级 | ✅ 完成 | /ota 手动上传 + 服务器推送 |
| 启动流程 | ✅ 完成 | Phase 0-3 自检→网络→服务→就绪 |
| 硬件连线测试 | ⏳ 待测试 | 需要杜邦线连接 ESP32-S3 和 STM32 |

**v2.4.0 控制面板特性**：
- 双页面设计：控制页 + 设置页，底部导航切换
- 顶部状态栏：WiFi/STM32连接状态指示灯
- 方向控制：九宫格布局，大按钮易点击
- 模式切换：空闲/手动/巡逻/跟随 一键切换
- WiFi配置：扫描+选择+保存，折叠面板
- OTA升级：进度条显示，选择文件即升级
- 系统信息：芯片/内存/IP/运行时间等
- 实时刷新：每5秒自动更新状态

**L3 智能交互进度**：
| 模块 | 状态 | 说明 |
|------|------|------|
| 架构设计 | ✅ 完成 | 详见 `docs/l3-architecture.md` |
| 记忆系统 | ✅ 完成 | 可信记忆 + 家庭成员 |
| 对话服务 | ✅ 完成 | 多模型支持 + 情感TTS |
| 视觉边界 | ⏳ 待开发 | 需要 OV2640 摄像头 |
| 人脸识别 | ⏳ 待开发 | ESP-WHO 框架 |
| 自主导航 | ⏳ 待开发 | 需要连线测试 |

**未来开发方向（认真思考后的规划）**：

1. **硬件扩展**
   - OV2640摄像头 + SG90舵机云台 → 联动摇头看更多视野
   - INMP441麦克风 + MAX98357A功放 → 本地语音交互
   - 18650电池组 + BMS → 独立供电
   - OLED显示屏 → 表情/状态显示

2. **智能交互**
   - 服务器推送OTA → 自动更新，无需用户手动选择文件
   - 视觉边界检测 → 防跌落、避障
   - 家庭成员识别 → 个性化问候
   - 长对话记忆 → 上下文理解

3. **用户体验**
   - 通电后自动连接已存储的家庭WiFi
   - 自动检查OTA更新
   - 硬件自检（Phase 0）→ LED/蜂鸣器反馈
   - 详见 `docs/boot-sequence.md`

**烧录注意事项**（DTR信号干扰GPIO0）：
1. 按住 BOOT → 执行 `pio run --target upload`
2. 烧录完成后拔掉 USB
3. 等 3 秒后重新插入 USB（不按按钮）
4. 程序自动运行

**ESP32-S3 固件目录**：`esp32/`

#### 硬件采购清单

| 物品 | 型号/规格 | 用途 | 预算 | 状态 |
|------|----------|------|------|------|
| ESP32-S3 开发板 | ESP32-S3-WROOM N16R8 | WiFi 上位机 | ~30元 | ✅ 已到货 |
| LED 灯带 | WS2812B | 表情/状态显示 | ~15元 | 🛒 待采购 |
| 杜邦线 | 母对母 20cm | 连接 ESP32-S3 和 STM32 | ~5元 | 🛒 待采购 |

**ESP32-S3 选型要点**：
- 芯片：ESP32-S3-WROOM-1 (N16R8)
- 内存：16MB Flash + 8MB PSRAM（跑 AI 模型必须）
- 接口：Type-C + 带排针
- 注意：需要带 CH343/CH340 串口芯片的开发板

**ESP32-S3 与 STM32 连接方式**：
```
ESP32-S3          STM32
TX (GPIO43)  -->  RX (PA10)
RX (GPIO44)  <--  TX (PA9)
GND          ---  GND
```
串口通信，3.3V 电平兼容，杜邦线直连即可。

#### 实现目标
- 实现无线控制（脱离 PC）
- 实现 WiFi 图传
- 预留人脸识别/手势识别能力（L3）

### 部署架构（推荐）

```
[浏览器 / 平板 / 手机]
        │ HTTPS
        ↓
[前端：Vercel / Netlify / GitHub Pages]
        │ API (局域网)
        ↓
[后端：本地 Node.js（接 STM32）]
        │ 串口
        ↓
[STM32 智能小车]
```

**优势**：
- 硬件不暴露公网
- 家里任何设备都能用
- 前端可随时更新

### 使用方法

1. **烧录固件**
   - 使用 FlyMcu 烧录 `9.机器人超声波避障（带舵机摇头）\Objects\Project.hex`
   - 设置：COM5, 115200bps, DTR低电平复位, RTS高电平进BootLoader

2. **启动后端**
   ```bash
   node server/index.js
   ```
   后端会自动连接 COM5 并设置 DTR/RTS 为低电平

3. **发送命令**
   ```bash
   # 前进
   curl -X POST http://localhost:3001/api/hardware/motion \
     -H "Content-Type: application/json" \
     -d '{"action":"move","data":{"direction":"forward","speed":0.5}}'
   
   # 停止
   curl -X POST http://localhost:3001/api/hardware/motion \
     -H "Content-Type: application/json" \
     -d '{"action":"stop"}'
   ```

### 系统架构（A/B/C + L2.8）

```
语音 → 文本
       ↓
Sequence Parser（可拆多步）
       ↓
【Action Suggestions】建议队列
       ↓
逐个执行：
  Intent → Guard → Confirm → Safety → Execute
       ↓                              ↓
【可见性层】状态条 + 安全警告    【L2.8 熟练层】
                                  "继续吗？"（5秒超时）
```

**核心原则**：
- 传感器只有否决权，没有指挥权
- 序列是"建议"，不是"执行计划"
- 每一步都必须过 Guard/Safety 验证
- STOP/安全阻止 → 清空所有建议
- L2.8 建议 ≠ 行动，需人类确认

### 中文口语化语音控制

| 指令类型 | 支持的表达方式 |
|----------|----------------|
| **前进** | 走、冲、上、来、过来、给我走、走起、动起来 |
| **后退** | 退、倒、回、撤、倒车 |
| **左转** | 左拐、朝左、往左边 |
| **右转** | 右拐、朝右、往右边 |
| **停止** | 站住、别动、等等、够了、打住 |
| **侧移** | 往旁、靠边、让开、挪一下 |
| **时间修饰** | 一点、一下、稍微（短）/ 使劲、用力、猛（长） |
| **复杂序列** | "走完左拐"、"冲完右转"、"往前走一下接着往左" |

### 串口协议

| 命令 | 格式 | 响应 |
|------|------|------|
| 心跳 | `PING\n` | `PONG\r\n` |
| 移动 | `F,800\n` / `B,800\n` / `L,800\n` / `R,800\n` | `OK,F,800\r\n` |
| 停止 | `S\n` | `OK,S\r\n` |
| 蜂鸣 | `BEEP\n` | `OK,BEEP\r\n` |
| 传感器 | `SENSOR\n` | `SENSOR,D155,L1R0\r\n` |
| 舵机 | `SERVO,90\n` | `OK,SERVO,90\r\n` |

### 自主避障模式

| API | 方法 | 说明 |
|-----|------|------|
| `/api/autonomy` | GET | 获取自主模式状态 |
| `/api/autonomy` | POST | 控制自主模式（start/stop/scan/setMode） |

**启动自主避障**：
```bash
curl -X POST http://localhost:3001/api/autonomy \
  -H "Content-Type: application/json" \
  -d '{"action":"start","mode":"exploring"}'
```

**避障逻辑**：
1. 舵机三向扫描（左150°→中90°→右30°）
2. 超声波测距获取各方向距离
3. 选择最远方向前进/转向
4. 距离<15cm 危险后退，<30cm 警戒扫描，>50cm 安全前进

**模式说明**：
- `exploring`：探索模式，安全时自动前进
- `scanning`：扫描模式，只扫描不移动
- `idle`：空闲模式

### 已知问题

- 烧录后需要按复位按钮让程序运行
- 串口连接时 DTR/RTS 信号会影响 STM32 复位，后端已自动处理

### 相关文件

- `server/serial.js` - 串口通信模块
- `server/hardware.config.js` - 硬件配置（COM5, 115200）
- `server/autonomy/` - 自主避障模块
  - `avoid.manager.js` - 避障核心逻辑
  - `index.js` - 模块导出
- `src/components/AutonomyPanel.vue` - 前端自主避障面板
- `stm32/simo_robot/` - STM32 固件源码（参考）
- `docs/stm32-serial-protocol.md` - 协议文档

### STM32 固件源码位置

实际使用的固件基于智能小车案例程序修改：
```
d:\BaiduNetdiskDownload\STM32单片机智能小车资料\3.案例程序\ZY10A-STM32\9.机器人超声波避障（带舵机摇头）\
├── User\main_simo.c          # Simo 协议主程序
├── Hardware\Serial.c         # 串口配置（115200）
├── Hardware\Buzzer.c         # 蜂鸣器控制
└── Objects\Project.hex       # 编译后的固件
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
