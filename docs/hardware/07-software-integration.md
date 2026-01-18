# 07 - 软硬件集成

> **软件和硬件的"握手"，让 Simo 真正"活"起来。**

---

## 🎯 集成目标

1. **ITX 主机 7×24 小时无人值守运行**
2. **程序崩溃自动恢复**
3. **断电来电自动启动**
4. **硬件状态可监控**

---

## 🖥️ ITX 主机配置

### 一、BIOS 设置（一次性）

```
进入 BIOS（开机按 DEL 或 F2）

1. 断电来电自动开机：
   Power Management → Restore on AC Power Loss → Power On
   
2. 禁用开机密码（如有）

3. 设置启动顺序：
   Boot → Boot Priority → 硬盘优先

4. 保存退出
```

**效果**：插电 → 自动开机 → 自动进系统

---

### 二、操作系统安装

**推荐系统**：Ubuntu Server 22.04 LTS

```bash
# 1. 下载镜像
# https://ubuntu.com/download/server

# 2. 制作启动盘（用 Rufus 或 Etcher）

# 3. 安装时选择：
#    - 最小安装
#    - 启用 SSH
#    - 设置用户名：simo
```

---

### 三、系统配置

```bash
# 1. 更新系统
sudo apt update && sudo apt upgrade -y

# 2. 安装必要软件
sudo apt install -y nodejs npm git

# 3. 禁用睡眠
sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target

# 4. 设置时区
sudo timedatectl set-timezone Asia/Shanghai

# 5. 配置串口权限
sudo usermod -a -G dialout simo
```

---

### 四、部署 Simo

```bash
# 1. 克隆代码
cd /opt
sudo git clone https://github.com/你的用户名/simo.git
sudo chown -R simo:simo simo

# 2. 安装依赖
cd simo
npm install

# 3. 配置环境变量
cp .env.example .env
nano .env  # 填入 API Key

# 4. 测试运行
node server/index.js
```

---

### 五、配置自启动（systemd）

创建服务文件：

```bash
sudo nano /etc/systemd/system/simo.service
```

内容：

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

# 串口设备
Environment=SERIAL_PORT=/dev/ttyUSB0

# 日志
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

启用服务：

```bash
sudo systemctl daemon-reload
sudo systemctl enable simo
sudo systemctl start simo

# 查看状态
sudo systemctl status simo

# 查看日志
sudo journalctl -u simo -f
```

---

## 🔌 串口配置

### 一、识别串口设备

```bash
# 插入 USB 转串口模块后
ls /dev/ttyUSB*
# 应该看到 /dev/ttyUSB0

# 查看设备信息
udevadm info -a -n /dev/ttyUSB0 | grep -E "ATTRS{idVendor}|ATTRS{idProduct}"
```

### 二、固定串口名称（可选）

创建 udev 规则：

```bash
sudo nano /etc/udev/rules.d/99-simo-serial.rules
```

内容：

```
SUBSYSTEM=="tty", ATTRS{idVendor}=="1a86", ATTRS{idProduct}=="7523", SYMLINK+="simo_stm32"
```

重新加载：

```bash
sudo udevadm control --reload-rules
sudo udevadm trigger
```

现在可以用 `/dev/simo_stm32` 访问串口。

### 三、串口权限

```bash
# 添加用户到 dialout 组
sudo usermod -a -G dialout simo

# 重新登录生效
```

---

## 📊 监控与日志

### 一、查看服务状态

```bash
# 服务状态
sudo systemctl status simo

# 实时日志
sudo journalctl -u simo -f

# 最近 100 行日志
sudo journalctl -u simo -n 100
```

### 二、健康检查

```bash
# 检查后端是否运行
curl http://localhost:3001/api/health

# 检查硬件状态
curl http://localhost:3001/api/hardware/status

# 检查传感器
curl http://localhost:3001/api/hardware/sensors
```

### 三、自动健康检查脚本

创建 `/opt/simo/scripts/health-check.sh`：

```bash
#!/bin/bash

# 检查服务是否运行
if ! systemctl is-active --quiet simo; then
    echo "$(date): Simo service not running, restarting..."
    sudo systemctl restart simo
    exit 1
fi

# 检查 API 是否响应
if ! curl -s http://localhost:3001/api/health > /dev/null; then
    echo "$(date): API not responding, restarting..."
    sudo systemctl restart simo
    exit 1
fi

echo "$(date): Simo is healthy"
```

添加定时任务：

```bash
crontab -e

# 每 5 分钟检查一次
*/5 * * * * /opt/simo/scripts/health-check.sh >> /var/log/simo-health.log 2>&1
```

---

## 🔄 更新部署

### 手动更新

```bash
cd /opt/simo
git pull
npm install
sudo systemctl restart simo
```

### 自动更新脚本

创建 `/opt/simo/scripts/update.sh`：

```bash
#!/bin/bash
cd /opt/simo

# 拉取最新代码
git fetch origin main
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" != "$REMOTE" ]; then
    echo "$(date): Updating Simo..."
    git pull
    npm install
    sudo systemctl restart simo
    echo "$(date): Update complete"
else
    echo "$(date): Already up to date"
fi
```

---

## 🌐 远程访问

### 一、局域网访问

```bash
# 查看 IP 地址
ip addr show

# 从其他设备访问
http://192.168.x.x:3001
```

### 二、SSH 远程管理

```bash
# 从其他电脑连接
ssh simo@192.168.x.x

# 查看日志
sudo journalctl -u simo -f

# 重启服务
sudo systemctl restart simo
```

### 三、内网穿透（可选）

如果需要从外网访问：

```bash
# 使用 frp / ngrok / cloudflare tunnel
# 注意安全性，建议加认证
```

---

## 🛡️ 安全配置

### 一、防火墙

```bash
# 只开放必要端口
sudo ufw allow ssh
sudo ufw allow 3001/tcp  # Simo API
sudo ufw enable
```

### 二、API 认证（可选）

在 `server/index.js` 添加简单认证：

```javascript
// 简单 API Key 认证
app.use('/api', (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});
```

---

## 📋 完整启动流程

```
┌─────────────────────────────────────────────────┐
│  1. 通电                                        │
│     ↓                                           │
│  2. BIOS 自动开机                               │
│     ↓                                           │
│  3. Ubuntu 启动                                 │
│     ↓                                           │
│  4. systemd 启动 simo.service                   │
│     ↓                                           │
│  5. Node.js 运行 server/index.js                │
│     ↓                                           │
│  6. 串口连接 STM32                              │
│     ↓                                           │
│  7. 发送 PING，收到 PONG                        │
│     ↓                                           │
│  8. Simo 上线，等待指令                         │
└─────────────────────────────────────────────────┘

整个过程无人干预，约 30-60 秒完成。
```

---

## ✅ 集成检查清单

| 检查项 | 状态 |
|--------|------|
| BIOS 设置断电来电自动开机 | □ |
| Ubuntu 安装完成 | □ |
| Node.js 安装完成 | □ |
| Simo 代码部署完成 | □ |
| 环境变量配置完成 | □ |
| systemd 服务配置完成 | □ |
| 串口权限配置完成 | □ |
| 服务自启动测试通过 | □ |
| 断电恢复测试通过 | □ |
| 程序崩溃恢复测试通过 | □ |

---

## 🔗 相关文档

- [02-compute-platform.md](./02-compute-platform.md) - 计算平台选型
- [06-assembly-guide.md](./06-assembly-guide.md) - 装配指南
- [../stm32-serial-protocol.md](../stm32-serial-protocol.md) - 串口协议
