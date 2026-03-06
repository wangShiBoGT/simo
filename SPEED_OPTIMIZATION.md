# Simo 速度优化指南

## 问题诊断

### 当前状态
- **协议**：`simple` 协议（不支持速度参数）
- **命令格式**：`F,400` / `B,800` / `L,400` / `R,400`
- **速度**：固定在 STM32 固件内（无法动态调整）

### 根本原因
`simple` 协议只传递方向和时长，速度是在 STM32 固件中硬编码的，可能被设置为较低的安全值。

---

## 解决方案

### 方案 A：启用 m-v1 协议（推荐）⭐

**优点**：
- 支持动态速度调整（0.0-1.0）
- 已有完整实现（ESP32 和 server 都支持）
- 精确控制运动参数

**步骤**：

**1. 修改 ESP32 固件配置**

编辑 `esp32/src/main.cpp`：

```cpp
// 第 56 行，修改协议配置
#define MOTION_PROTOCOL "m-v1"  // 从 "simple" 改为 "m-v1"
```

**2. 修改 Simo 服务器配置**

编辑 `server/hardware.config.js`：

```javascript
// 第 37 行
motionProtocol: 'm-v1'  // 从 'simple' 改为 'm-v1'
```

**3. 修改默认速度**

编辑 `server/serial.js`，在 `sendMove` 函数中：

```javascript
export const sendMove = (direction, speed = 0.8, durationMs = 500) => {
  // 将默认速度从 0.5 改为 0.8 (80% 功率)
  // ...
}
```

**4. 重新编译并烧录 ESP32**

```bash
cd esp32
pio run --target upload
```

**5. 重启 Simo 服务器**

```bash
node server/index.js
```

**测试**：
```bash
curl -X POST http://localhost:3001/api/intent/execute \
  -H "Content-Type: application/json" \
  -d '{"intent":"MOVE","direction":"F","duration_ms":400}'
```

现在命令将是：`M,forward,0.80,400` （80% 速度）

---

### 方案 B：增强 simple 协议（快速方案）

如果不想改协议，可以在 simple 协议中嵌入速度参数。

**修改 ESP32 固件**

编辑 `esp32/src/main.cpp`，找到 `sendToSTM32` 函数（约第 526 行）：

```cpp
void sendToSTM32(const char* cmd, int speed, int duration) {
    char buffer[64];
    const char* protocol = MOTION_PROTOCOL;
    
    if (strcmp(cmd, "S") == 0 || strcmp(cmd, "PING") == 0) {
        snprintf(buffer, sizeof(buffer), "%s\n", cmd);
    } else {
        if (strcmp(protocol, "simple") == 0) {
            // 增强版 simple 协议: F,<speed>,<ms>
            snprintf(buffer, sizeof(buffer), "%s,%d,%d\n", cmd, speed, duration);
        } else {
            // m-v1协议保持不变
            // ...
        }
    }
    // ...
}
```

**修改 server/serial.js**

```javascript
export const sendMove = (direction, speed = 0.8, durationMs = 500) => {
  // ...
  
  if (protocol === 'simple') {
    // 增强版: F,<speed_pwm>,<ms>
    const speedPWM = Math.floor(speed * 255)  // 转换为 0-255
    cmd = `${dirLetter},${speedPWM},${durationMs}`
  } else {
    // m-v1协议保持不变
    // ...
  }
  
  return send(cmd)
}
```

**注意**：这需要 STM32 固件也支持新格式。

---

### 方案 C：直接修改 STM32 固件速度（最快方案）

如果无法重新烧录 ESP32，可以直接在 STM32 固件中调整 PWM 值。

**假设你的 STM32 代码类似**：

```c
// STM32 固件中
void motor_forward() {
    __HAL_TIM_SET_COMPARE(&htim1, TIM_CHANNEL_1, 100);  // 左轮 PWM
    __HAL_TIM_SET_COMPARE(&htim1, TIM_CHANNEL_2, 100);  // 右轮 PWM
}
```

**修改为**：

```c
void motor_forward() {
    __HAL_TIM_SET_COMPARE(&htim1, TIM_CHANNEL_1, 200);  // 从 100 提升到 200
    __HAL_TIM_SET_COMPARE(&htim1, TIM_CHANNEL_2, 200);  // 从 100 提升到 200
}
```

**PWM 值建议**：
- **当前（推测）**：100/255 = 39% 功率
- **建议设置**：180-220/255 = 70-86% 功率
- **最大安全值**：230/255 = 90% 功率

**注意事项**：
- 不要设置为 255（100% 功率），会导致电流过大
- 先从 150 开始测试，逐步提升
- 监听电机温度，避免过热
- 确保电池电量充足（低电量会导致速度慢）

---

## 故障排查

### 1. 速度仍然很慢

**可能原因**：
- ✅ 电池电量不足（检查电压）
- ✅ 机械故障（齿轮卡住、轮子摩擦）
- ✅ 电机驱动芯片过热保护
- ✅ PWM 频率设置错误

**检查方法**：
```cpp
// 在 STM32 固件中添加调试输出
printf("PWM: L=%d, R=%d\n", left_pwm, right_pwm);
```

### 2. 电机抖动或不转

**可能原因**：
- PWM 值过低（< 50）
- 电源电压不足
- H桥死区时间设置不当

**解决**：
```c
// 设置最小 PWM 阈值
if (pwm < 80) pwm = 80;  // 低于 80 直接设为 80
```

### 3. 电流过大

**现象**：电机驱动芯片发热严重

**解决**：
- 降低 PWM 值
- 添加电流限制
- 检查电机是否堵转

---

## 快速测试命令

### 测试不同速度

使用 m-v1 协议后，可以测试不同速度：

```bash
# 50% 速度
curl -X POST http://localhost:3001/api/intent/execute \
  -d '{"intent":"MOVE","direction":"F","duration_ms":500}' \
  # 修改 serial.js 中 speed 默认值为 0.5

# 80% 速度
# 修改 serial.js 中 speed 默认值为 0.8

# 100% 速度（不推荐）
# 修改 serial.js 中 speed 默认值为 1.0
```

### 通过 HTTP 直接控制 ESP32

如果 ESP32 有 Web 界面：

```bash
# 发送速度参数
curl "http://192.168.1.101/cmd?c=F&speed=200&duration=500"
```

---

## 推荐配置

### 保守配置（适合测试）
- 协议：`m-v1`
- 默认速度：`0.6` (60% 功率)
- PWM 范围：`80-180`

### 平衡配置（推荐日常使用）
- 协议：`m-v1`
- 默认速度：`0.8` (80% 功率)
- PWM 范围：`100-220`

### 激进配置（性能优先）
- 协议：`m-v1`
- 默认速度：`0.9` (90% 功率)
- PWM 范围：`150-230`

---

## 安全注意事项

1. **逐步提升**：从 60% 开始，每次提升 10%
2. **监控温度**：电机和驱动芯片不应超过 60°C
3. **电池检查**：确保电压 > 7.0V（双节锂电池）
4. **机械检查**：确认齿轮、轴承润滑良好
5. **避障测试**：高速下传感器响应要更快

---

## 下一步

**立即行动**（方案 A）：
1. 修改 `esp32/src/main.cpp` 第 56 行为 `"m-v1"`
2. 修改 `server/hardware.config.js` 第 37 行为 `'m-v1'`
3. 修改 `server/serial.js` 第 251 行默认速度为 `0.8`
4. 重新编译 ESP32 固件并烧录
5. 重启 Simo 服务器
6. 测试命令：前进 400ms，观察速度

**验收标准**：
- 小车能明显更快地移动
- 电机运转平稳，无异常噪音
- 避障功能仍然正常工作

---

**最后更新**：2026-03-06
**预计改善**：速度提升 50-80%
