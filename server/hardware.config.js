/**
 * Simo 硬件配置文件
 * 
 * 硬件演进等级：
 * - L0: 纯软件（当前）
 * - L1: 定点存在（屏幕+语音+可移动底座）
 * - L2: 简单移动（跟随+避障+房间级移动）
 * - L3: 智能交互（情感表达+主动行为+空间记忆）
 */

export default {
  // 当前硬件等级
  level: 'L0',
  
  // ============ L1 硬件配置 ============
  display: {
    enabled: false,
    type: null,  // 'hdmi' | 'usb' | 'web'
    resolution: null,  // '1920x1080' | '1280x800' 等
    orientation: 'landscape',  // 'landscape' | 'portrait'
    brightness: 80,  // 0-100
    alwaysOn: true,  // 是否常亮
    
    // 表情/状态显示配置
    expressions: {
      idle: { animation: 'breathing', color: '#00d4ff' },
      listening: { animation: 'pulse', color: '#00ff88' },
      thinking: { animation: 'scan', color: '#ffaa00' },
      speaking: { animation: 'wave', color: '#00d4ff' },
      sleeping: { animation: 'dim', color: '#333333' }
    }
  },
  
  audio: {
    enabled: true,
    type: 'browser',  // 'browser' | 'usb' | 'bluetooth' | 'hdmi'
    
    // 输出配置
    output: {
      device: null,  // 设备ID
      volume: 70,  // 0-100
      balance: 0   // -100 到 100
    },
    
    // 输入配置（麦克风）
    input: {
      device: null,
      gain: 50,  // 0-100
      noiseSuppression: true,
      echoCancellation: true
    },
    
    // 唤醒词配置
    wakeWord: {
      enabled: true,
      phrases: ['Hi Simo', '你好 Simo', 'Simo'],
      sensitivity: 0.5  // 0-1
    }
  },
  
  // ============ L2 硬件配置（预留） ============
  vision: {
    enabled: false,
    type: null,  // 'usb' | 'csi' | 'ip'
    
    camera: {
      device: null,
      resolution: '1280x720',
      fps: 30
    },
    
    // 人脸识别配置
    faceRecognition: {
      enabled: false,
      model: null,  // 'local' | 'baidu' | 'azure'
      autoSwitchMember: false  // 识别到家庭成员自动切换
    },
    
    // 手势识别配置
    gestureRecognition: {
      enabled: false,
      gestures: ['wave', 'thumbsUp', 'stop', 'come']
    }
  },
  
  motion: {
    enabled: false,
    type: null,  // 'wheel' | 'track' | 'leg'
    
    // 底盘配置
    chassis: {
      maxSpeed: 0.5,  // m/s
      acceleration: 0.2,  // m/s²
      turnRadius: 0.3  // m
    },
    
    // 云台配置（头部转动）
    gimbal: {
      enabled: false,
      panRange: [-90, 90],   // 水平角度范围
      tiltRange: [-30, 30]   // 垂直角度范围
    },
    
    // 机械臂配置（L3）
    arm: {
      enabled: false,
      dof: 0,  // 自由度
      reach: 0  // 臂展 cm
    }
  },
  
  // ============ L2/L3 传感器配置（预留） ============
  sensors: {
    // 环境传感器
    temperature: { enabled: false, pin: null },
    humidity: { enabled: false, pin: null },
    light: { enabled: false, pin: null },
    
    // 距离传感器
    ultrasonic: { enabled: false, pins: { trig: null, echo: null } },
    infrared: { enabled: false, pin: null },
    lidar: { enabled: false, port: null },
    
    // 触摸传感器
    touch: { enabled: false, pins: [] },
    
    // 电源管理
    battery: {
      enabled: false,
      type: null,  // 'lipo' | 'liion' | '18650'
      capacity: 0,  // mAh
      lowThreshold: 20,  // 低电量警告阈值 %
      criticalThreshold: 10  // 危险电量阈值 %
    }
  },
  
  // ============ 通信配置 ============
  communication: {
    // 与硬件控制器通信（STM32 小车）
    serial: {
      enabled: true,  // 启用串口通信
      port: 'COM5',   // USB转串口端口
      baudRate: 115200  // Simo固件使用 115200
    },
    
    // GPIO（树莓派等）
    gpio: {
      enabled: false,
      platform: null  // 'rpi' | 'esp32' | 'arduino'
    },
    
    // MQTT（物联网通信）
    mqtt: {
      enabled: false,
      broker: null,
      topic: 'simo/hardware'
    }
  },
  
  // ============ 安全配置（统一阈值来源） ============
  safety: {
    // 紧急停止
    emergencyStop: {
      enabled: true,
      phrases: ['停', '等等', '别动', '紧急停止']
    },
    
    // 避障阈值（cm）- 所有模块统一从此读取
    // 家庭环境东西多，阈值需要更近以适应狭窄空间
    obstacleThresholds: {
      danger: 8,       // 危险距离，必须立即停止
      caution: 15,     // 警戒距离，减速或转向
      safe: 30         // 安全距离，可正常前进
    },
    
    // 移动限制
    motionLimits: {
      maxSpeed: 0.3,       // m/s
      maxDuration: 3000,   // 单次最长运动时间 ms
      minDuration: 50,     // 单次最短运动时间 ms
      cliffDetection: true
    },
    
    // 运行时间限制
    operationLimits: {
      maxContinuousRuntime: 8,  // 小时
      quietHoursStart: 23,  // 23:00
      quietHoursEnd: 7      // 07:00
    }
  },
  
  // ============ 固件能力声明 ============
  capabilities: {
    motion: true,        // 运动控制
    servo: false,        // 舵机（simo_robot_simple不支持）
    ultrasonic: true,    // 超声波传感器
    infrared: true,      // 红外避障
    buzzer: true,        // 蜂鸣器
    heartbeat: true      // 心跳检测
  },
  
  // ============ 协议配置 ============
  protocol: {
    version: 'simple',   // 'simple' | 'm-v1'
    lineEnding: '\n',    // 命令换行符
    responseEnding: '\r\n'  // 响应换行符
  },
  
  // ============ ESP32配置 ============
  esp32: {
    // 动态注册后自动更新，无需手动配置IP
    latestVersion: '2.4.1',   // 最新固件版本
    firmwarePath: './esp32/.pio/build/esp32-s3-devkitc-1/firmware.bin',
    // 设备心跳超时（毫秒）
    heartbeatTimeout: 120000
  },
  
  // ============ 后端部署配置 ============
  // 开发环境使用本地IP，生产环境使用公网域名
  backend: {
    // 本地开发
    localIP: '192.168.0.107',
    localPort: 3001,
    // 生产环境（部署后配置）
    domain: '',  // 如 'simo.your-domain.com'
    useHttps: false
  }
}
