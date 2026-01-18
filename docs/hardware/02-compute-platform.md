# 02 - 计算平台选型

> **ITX/x86 是家用长期机器人最成熟、最稳妥的选择。**

---

## 🎯 核心问题

> **"ITX/x86 这种'电脑'，真的能像机器人一样自己每天运行、长期待机、不是我手动开机吗？"**

**答案：是的，而且这是"家用长期机器人"里最成熟、最稳妥的一条路。**

---

## 📊 平台对比

### 一、候选方案

| 平台 | 代表产品 | 算力 | 功耗 | 价格 | 稳定性 |
|------|----------|------|------|------|--------|
| **ITX/x86** | Intel N100/i3 | ⭐⭐⭐⭐ | 15-65W | ¥800-2000 | ⭐⭐⭐⭐⭐ |
| **Jetson** | Orin Nano | ⭐⭐⭐⭐⭐ | 7-15W | ¥2000-4000 | ⭐⭐⭐⭐ |
| **树莓派** | Pi 5 | ⭐⭐ | 5-10W | ¥500-800 | ⭐⭐ |
| **旧笔记本** | 任意 | ⭐⭐⭐ | 30-60W | ¥0（已有） | ⭐⭐⭐ |

### 二、详细分析

#### 🟢 ITX/x86（推荐）

**优势**：
- ✅ 原生支持 7×24 小时运行
- ✅ BIOS 支持断电来电自动开机
- ✅ 电源、电容、主板设计为长期通电
- ✅ 软件生态完善（Docker、systemd）
- ✅ 崩了好查、好修
- ✅ 可维护性强

**劣势**：
- ❌ 体积相对较大
- ❌ 功耗较高
- ❌ 需要独立供电

**适用场景**：
- 家用长期运行机器人
- 需要稳定性的场景
- 需要跑 AI 模型的场景

**推荐型号**：
| 型号 | CPU | 内存 | 价格 | 特点 |
|------|-----|------|------|------|
| 畅网 N100 | Intel N100 | 8-16GB | ¥800 | 低功耗、被动散热 |
| 零刻 SER5 | AMD 5560U | 16GB | ¥1200 | 性能强、小巧 |
| Intel NUC | i3/i5 | 16GB | ¥1500+ | 品质好、稳定 |

---

#### 🟡 Jetson

**优势**：
- ✅ GPU 算力强（AI 推理）
- ✅ 功耗低
- ✅ 体积小

**劣势**：
- ❌ 对电源稳定性要求高
- ❌ 驱动/内核更新偶尔踩坑
- ❌ 软件生态不如 x86
- ❌ 价格较高

**适用场景**：
- 需要本地 AI 推理
- 对功耗敏感
- 有 CUDA 开发经验

---

#### 🔴 树莓派

**优势**：
- ✅ 便宜
- ✅ 社区资源丰富
- ✅ 功耗低

**劣势**：
- ❌ SD 卡易坏
- ❌ USB 外设多时不稳定
- ❌ 断电重启偶发问题
- ❌ 算力有限

**结论**：**不适合"家里一直在"的目标。**

---

## 🔧 ITX/x86 长期运行配置

### 一、断电来电自动开机（最重要）

这是 **99% 主板 BIOS 自带的功能**：

**BIOS 设置**：
```
Power Management → Restore on AC Power Loss → Power On
```

或：
```
Power → Power On After Power Failure → Power On
```

**效果**：
```
有电 → 主机自动启动 → Linux 自动启动 → 机器人程序自动运行
```

👉 **永远不需要按开机键。**

---

### 二、操作系统配置

**推荐系统**：Ubuntu Server 22.04 LTS

**安装后配置**：

```bash
# 1. 禁用睡眠
sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target

# 2. 禁用屏幕保护
sudo nano /etc/default/grub
# 添加: GRUB_CMDLINE_LINUX="consoleblank=0"
sudo update-grub

# 3. 设置时区
sudo timedatectl set-timezone Asia/Shanghai
```

---

### 三、程序自启动

#### 方案 A：systemd（推荐）

创建服务文件 `/etc/systemd/system/simo.service`：

```ini
[Unit]
Description=Simo Robot Service
After=network.target

[Service]
Type=simple
User=simo
WorkingDirectory=/opt/simo
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

启用服务：
```bash
sudo systemctl enable simo
sudo systemctl start simo
```

#### 方案 B：Docker（更省事）

`docker-compose.yml`：
```yaml
version: '3'
services:
  simo:
    build: .
    restart: always
    ports:
      - "3001:3001"
    devices:
      - /dev/ttyUSB0:/dev/ttyUSB0
    volumes:
      - ./data:/app/data
```

---

### 四、崩溃自动恢复

**systemd 配置**：
```ini
Restart=always
RestartSec=5
```

**Docker 配置**：
```yaml
restart: always
```

**效果**：程序崩溃 → 5秒后自动重启

---

## 📐 物理集成

### ITX 主机在机器人中的位置

```
        ┌─────────────┐
        │   头部      │  ← 显示屏、摄像头
        └─────────────┘
              │
        ┌─────────────┐
        │   躯干      │  ← ITX 主机藏在这里
        │  ┌───────┐  │
        │  │ ITX   │  │
        │  │ 主机  │  │
        │  └───────┘  │
        └─────────────┘
              │
        ┌─────────────┐
        │   底盘      │  ← 电机、电池、STM32
        └─────────────┘
```

**关键点**：
- ITX 主机不暴露、不发光
- 用户看到的是"头"和"眼睛"
- 主机只是"内脏"

---

## 🔌 接口规划

### ITX 主机需要的接口

| 接口 | 用途 | 数量 |
|------|------|------|
| USB | STM32 串口 | 1 |
| USB | 麦克风 | 1 |
| USB | 摄像头 | 1 |
| HDMI | 显示屏 | 1 |
| 3.5mm | 扬声器 | 1 |
| 电源 | DC 12V/19V | 1 |

---

## 💡 现实案例

你做的系统，本质上和这些设备一样：

| 设备 | 运行方式 |
|------|----------|
| 家庭 NAS | 插电就活，7×24 |
| Home Assistant | 断电来电自动恢复 |
| 门禁系统 | 无人值守 |
| 商用广告机 | 长期运行 |

**这些设备没人每天去按电源，Simo 也不需要。**

---

## ✅ 结论

| 场景 | 推荐平台 |
|------|----------|
| 家用长期机器人 | **ITX/x86** |
| 需要本地 AI | Jetson |
| 预算有限、可接受不稳定 | 树莓派 |
| 快速验证 | 旧笔记本 |

**对于 Simo 项目，ITX/x86 是最优解。**

---

## 🔗 相关文档

- [03-power-system.md](./03-power-system.md) - 供电系统设计
- [06-assembly-guide.md](./06-assembly-guide.md) - 装配指南
