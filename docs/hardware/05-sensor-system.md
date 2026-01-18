# 05 - 传感器系统设计

> **传感器是机器人的"感官"，让它能感知周围环境。**

---

## 🎯 设计原则

1. **传感器只有否决权，没有指挥权**
2. **多传感器融合，互相验证**
3. **安全优先，宁可误报不可漏报**

---

## 📊 当前传感器配置

### 一、超声波测距（HC-SR04）

```
┌─────────────────────────────────┐
│  HC-SR04 超声波模块             │
│                                 │
│  VCC ──────── 5V                │
│  GND ──────── GND               │
│  TRIG ─────── PB11 (STM32)      │
│  ECHO ─────── PB10 (STM32)      │
└─────────────────────────────────┘
```

| 参数 | 规格 |
|------|------|
| 工作电压 | 5V |
| 测量范围 | 2-400cm |
| 精度 | ±3mm |
| 测量角度 | 15° |
| 触发信号 | 10μs TTL |

**工作原理**：
```
1. TRIG 发送 10μs 高电平
2. 模块发出 8 个 40kHz 超声波
3. 等待回波
4. ECHO 输出高电平，时长 = 往返时间
5. 距离 = 时间 × 340m/s ÷ 2
```

**STM32 代码**：
```c
float Ultrasonic_GetDistance(void) {
    // 发送触发信号
    GPIO_SetBits(GPIOB, GPIO_Pin_11);
    Delay_us(10);
    GPIO_ResetBits(GPIOB, GPIO_Pin_11);
    
    // 等待回波
    uint32_t timeout = 30000;  // 30ms 超时
    while(!GPIO_ReadInputDataBit(GPIOB, GPIO_Pin_10) && timeout--);
    if(timeout == 0) return -1;
    
    // 测量高电平时间
    uint32_t start = TIM_GetCounter(TIM3);
    while(GPIO_ReadInputDataBit(GPIOB, GPIO_Pin_10) && timeout--);
    uint32_t duration = TIM_GetCounter(TIM3) - start;
    
    // 计算距离 (cm)
    return duration * 0.017;  // 340m/s ÷ 2 ÷ 10000
}
```

---

### 二、红外避障（双路）

```
┌─────────────────────────────────┐
│  红外避障模块（左）              │
│                                 │
│  VCC ──────── 5V                │
│  GND ──────── GND               │
│  OUT ──────── PA4 (STM32)       │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│  红外避障模块（右）              │
│                                 │
│  VCC ──────── 5V                │
│  GND ──────── GND               │
│  OUT ──────── PA5 (STM32)       │
└─────────────────────────────────┘
```

| 参数 | 规格 |
|------|------|
| 工作电压 | 3.3-5V |
| 检测距离 | 2-30cm（可调） |
| 输出 | 数字（0=有障碍，1=无障碍） |

**特点**：
- ✅ 响应快（<2ms）
- ✅ 近距离检测
- ❌ 受光线影响
- ❌ 黑色物体可能漏检

---

### 三、传感器数据格式

**查询命令**：`SENSOR\n`

**响应格式**：`SENSOR,D155,L0R0\r\n`

| 字段 | 含义 | 示例 |
|------|------|------|
| D155 | 超声波距离 15.5cm | D0=无效，D999=超远 |
| L0 | 左红外 0=有障碍 | L1=无障碍 |
| R0 | 右红外 0=有障碍 | R1=无障碍 |

---

## 🔧 传感器融合

### 决策逻辑

```javascript
// 传感器数据
const distance = sensors.ultrasonic?.distance;  // 超声波距离
const irLeft = sensors.infrared?.left;          // 左红外 (0/1)
const irRight = sensors.infrared?.right;        // 右红外 (0/1)

// 决策优先级
if (irLeft === 0 || irRight === 0) {
  // 红外检测到近距离障碍 → 最高优先级
  handleInfraredObstacle(irLeft, irRight);
} else if (distance < DANGER_DISTANCE) {
  // 超声波检测到危险距离 → 紧急停止
  emergencyStop();
} else if (distance < CAUTION_DISTANCE) {
  // 警戒距离 → 扫描决策
  performScan();
} else {
  // 安全 → 继续前进
  moveForward();
}
```

### 传感器特性对比

| 传感器 | 优势 | 劣势 | 适用场景 |
|--------|------|------|----------|
| 超声波 | 测距准确 | 角度窄、响应慢 | 前方障碍检测 |
| 红外 | 响应快、角度宽 | 无距离信息 | 近距离紧急避障 |

---

## 📈 升级路线

### 阶段 1：当前（已完成）

- ✅ 超声波测距
- ✅ 红外避障
- ✅ 舵机扫描

### 阶段 2：增强感知

| 传感器 | 用途 | 优先级 |
|--------|------|--------|
| **IMU** | 姿态检测、防倾倒 | ⭐⭐⭐⭐ |
| **编码器** | 里程计、速度反馈 | ⭐⭐⭐⭐ |
| **悬崖传感器** | 防跌落 | ⭐⭐⭐ |
| **碰撞开关** | 物理接触检测 | ⭐⭐⭐ |

### 阶段 3：智能感知

| 传感器 | 用途 | 优先级 |
|--------|------|--------|
| **摄像头** | 视觉识别 | ⭐⭐⭐⭐⭐ |
| **激光雷达** | SLAM 建图 | ⭐⭐⭐⭐ |
| **深度相机** | 3D 感知 | ⭐⭐⭐ |
| **TOF** | 精确测距 | ⭐⭐⭐ |

---

## 🛡️ 安全设计

### 传感器失效处理

```javascript
// 传感器数据验证
function validateSensorData(sensors) {
  const issues = [];
  
  // 超声波数据验证
  if (sensors.ultrasonic?.distance === null) {
    issues.push('ultrasonic_timeout');
  }
  if (sensors.ultrasonic?.distance === 0) {
    issues.push('ultrasonic_invalid');
  }
  
  // 红外数据验证
  if (sensors.infrared?.left === undefined) {
    issues.push('ir_left_missing');
  }
  if (sensors.infrared?.right === undefined) {
    issues.push('ir_right_missing');
  }
  
  return {
    valid: issues.length === 0,
    issues
  };
}

// 失效时的安全策略
if (!sensorData.valid) {
  console.warn('传感器异常:', sensorData.issues);
  emergencyStop();  // 安全优先，停止运动
}
```

### 安全阈值

| 参数 | 值 | 说明 |
|------|-----|------|
| DANGER_DISTANCE | 15cm | 紧急停止 |
| CAUTION_DISTANCE | 30cm | 减速/扫描 |
| SAFE_DISTANCE | 50cm | 正常行驶 |
| SENSOR_TIMEOUT | 1000ms | 传感器超时 |

---

## 📐 传感器布局

```
          ┌─────────────────────┐
          │    超声波 (前)      │
          │    HC-SR04          │
          └──────────┬──────────┘
                     │
    ┌────────────────┼────────────────┐
    │                │                │
┌───┴───┐      ┌─────┴─────┐     ┌───┴───┐
│红外(左)│      │   舵机    │     │红外(右)│
│  IR-L │      │   SG90    │     │  IR-R │
└───────┘      └───────────┘     └───────┘
    │                                  │
    │          ┌─────────┐            │
    │          │  STM32  │            │
    │          └─────────┘            │
    │                                  │
    └──────────────────────────────────┘
                 底盘
```

---

## 🔗 相关文档

- [../sensor-protocol.md](../sensor-protocol.md) - 传感器协议详细说明
- [04-motion-system.md](./04-motion-system.md) - 运动系统
- [06-assembly-guide.md](./06-assembly-guide.md) - 装配指南
