/**
 * Simo ESP32-S3 WiFi 固件
 * 
 * 功能：
 * - WiFi AP 模式（创建热点）
 * - Web 服务器（HTTP API）
 * - 串口透传（与 STM32 通信）
 * 
 * 连接方式：
 * - 手机/电脑连接 WiFi: Simo-Robot
 * - 访问: http://192.168.4.1
 */

#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <Update.h>
#include <HTTPClient.h>
#include <DNSServer.h>
#include <Preferences.h>
#include "esp_camera.h"
#include "esp_wifi.h"
#include "camera_config.h"
#include "face_detect.h"

// ============ 配置 ============
#define LED_PIN 48

// WiFi AP 模式（手机直连控制）
#define AP_SSID "Simo-Robot"
#define AP_PASSWORD "simo1234"

// WiFi STA 模式（连接家庭网络，访问Simo后端）
// 注意：ESP32只支持2.4GHz WiFi，不支持5GHz
#define STA_SSID "ZTMAP"           // 家庭 WiFi 名称（2.4GHz）
#define STA_PASSWORD "ztmap@416"   // 家庭 WiFi 密码
// Simo后端配置（Node.js服务器）
// 注意：ESP32启动后会尝试连接此后端检查OTA更新
#define SIMO_BACKEND_IP "192.168.0.107"  // Node后端IP（电脑局域网IP）
#define SIMO_BACKEND_PORT 3001

// OTA服务器配置（指向Node后端）
#define OTA_CHECK_INTERVAL 300000  // OTA检查间隔（毫秒），5分钟

// STM32 串口（GPIO38=TX, GPIO39=RX）
// 注意：GPIO43/44 是 USB-UART 调试引脚，不能用
// 注意：GPIO4/5 被摄像头 SCCB(I2C) 占用，不能用！
// 使用 GPIO38/39 作为 STM32 通信串口
#define STM32_TX 38
#define STM32_RX 39
#define STM32_BAUD 115200

// 运动协议配置（选择与STM32固件匹配的协议）
// "simple" = simo_robot_simple固件: F,<ms> / B,<ms> / L,<ms> / R,<ms> / S
// "m-v1"   = simo_robot固件: M,forward,speed,duration / S
#define MOTION_PROTOCOL "m-v1"  // 启用速度参数支持

// 版本信息
#define FIRMWARE_VERSION "2.5.0"
#define BUILD_DATE __DATE__

// ============ 全局变量 ============
WebServer server(80);
HardwareSerial stm32Serial(1);  // UART1

// 状态变量
bool stm32Connected = false;
unsigned long lastStm32Ping = 0;
unsigned long lastSensorRead = 0;
int lastDistance = 0;
bool leftIR = false, rightIR = false;      // 红外避障
bool leftTrack = false, rightTrack = false; // 红外循迹

// WiFi状态
bool staConnected = false;
String homeIP = "";

// 配网状态
DNSServer dnsServer;
Preferences preferences;
bool inProvisioningMode = false;
String savedSSID = "";
String savedPassword = "";

// OTA状态
unsigned long lastOTACheck = 0;
bool otaUpdateAvailable = false;
String latestVersion = "";

// 摄像头状态
bool cameraInitialized = false;
String cameraModel = "unknown";

// ============ 摄像头模式管理（互斥） ============
enum CamMode {
    CAM_IDLE = 0,       // 空闲（JPEG QVGA）
    CAM_STREAM = 1,     // MJPEG 流（长连接占用）
    CAM_DETECT = 2,     // 人脸检测（RGB565 QQVGA）
    CAM_VISION = 3,     // 后端识别（JPEG VGA）
    CAM_CAPTURE = 4     // 拍照（JPEG VGA，短暂）
};
volatile CamMode currentCamMode = CAM_IDLE;
volatile bool camModeLocked = false;  // 是否被长连接占用

// 视觉识别状态
bool visionEnabled = false;           // 是否启用视觉识别
unsigned long lastVisionFrame = 0;    // 上次发送帧的时间
#define VISION_INTERVAL 500           // 视觉帧间隔(ms)，2fps用于识别

// 自主导航状态
enum RobotMode {
    MODE_IDLE = 0,      // 空闲
    MODE_MANUAL = 1,    // 手动控制
    MODE_PATROL = 2,    // 自主巡逻
    MODE_FOLLOW = 3,    // 跟随模式
    MODE_RETURN = 4     // 返航
};
RobotMode currentMode = MODE_IDLE;
unsigned long lastPatrolAction = 0;
int patrolState = 0;  // 巡逻状态机

// 函数前向声明
void sendToSTM32(const char* cmd, int speed = 150, int duration = 500);
void runAutonomousLogic();
void startProvisioningMode();
void handleCameraCapture();
void handleCameraStream();
void handleCameraStatus();
void handleVisionControl();
void sendFrameToBackend();
void handleFaceDetect();
void handleFaceStatus();
void runFaceFollowLoop();
void loadWiFiCredentials();
void saveWiFiCredentials(const String& ssid, const String& password);
void registerToBackend();
void checkOTAUpdate();
void performOTAUpdate(const String& url);

// ============ HTML 页面 - 高度集成控制面板 ============
const char* htmlPage = R"rawliteral(
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <title>Simo</title>
    <style>
        :root { --accent: #00d9ff; --bg: #0d1117; --card: #161b22; --border: #30363d; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, system-ui, sans-serif; background: var(--bg); color: #e6edf3; min-height: 100vh; }
        
        /* 顶部状态栏 */
        .header { background: var(--card); padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); position: sticky; top: 0; z-index: 100; }
        .logo { font-size: 20px; font-weight: 600; }
        .logo span { color: var(--accent); }
        .status-dots { display: flex; gap: 8px; }
        .dot { width: 10px; height: 10px; border-radius: 50%; background: #484f58; }
        .dot.on { background: #3fb950; }
        .dot.warn { background: #d29922; }
        
        /* 主内容区 */
        .main { padding: 16px; max-width: 500px; margin: 0 auto; }
        
        /* 卡片 */
        .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 16px; margin-bottom: 16px; }
        .card-title { font-size: 14px; color: #8b949e; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
        
        /* 控制面板 */
        .controls { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; max-width: 240px; margin: 0 auto; }
        .ctrl-btn { height: 70px; border: none; border-radius: 12px; font-size: 24px; cursor: pointer; background: #21262d; color: var(--accent); transition: all 0.15s; }
        .ctrl-btn:active { transform: scale(0.95); background: #30363d; }
        .ctrl-btn.stop { background: #b62324; color: #fff; }
        .ctrl-btn.empty { visibility: hidden; }
        
        /* 模式选择 */
        .modes { display: flex; gap: 8px; flex-wrap: wrap; }
        .mode-btn { flex: 1; min-width: 80px; padding: 12px 8px; border: 1px solid var(--border); border-radius: 8px; background: transparent; color: #8b949e; font-size: 12px; cursor: pointer; transition: all 0.15s; }
        .mode-btn.active { border-color: var(--accent); color: var(--accent); background: rgba(0,217,255,0.1); }
        
        /* WiFi配置 */
        .wifi-form { display: flex; flex-direction: column; gap: 12px; }
        .input-group { display: flex; gap: 8px; }
        .input-group input, .input-group select { flex: 1; padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; background: #0d1117; color: #e6edf3; font-size: 14px; }
        .input-group input:focus { outline: none; border-color: var(--accent); }
        .btn { padding: 12px 20px; border: none; border-radius: 8px; font-size: 14px; cursor: pointer; transition: all 0.15s; }
        .btn-primary { background: var(--accent); color: #000; font-weight: 500; }
        .btn-secondary { background: #21262d; color: #e6edf3; }
        .btn-danger { background: #b62324; color: #fff; }
        .btn:active { transform: scale(0.98); }
        
        /* WiFi列表 */
        .wifi-list { max-height: 150px; overflow-y: auto; margin-bottom: 12px; }
        .wifi-item { padding: 10px 12px; border-radius: 6px; cursor: pointer; display: flex; justify-content: space-between; }
        .wifi-item:hover { background: #21262d; }
        .wifi-rssi { color: #8b949e; font-size: 12px; }
        
        /* 系统信息 */
        .info-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
        .info-item { background: #0d1117; padding: 10px; border-radius: 8px; }
        .info-label { font-size: 11px; color: #8b949e; }
        .info-value { font-size: 14px; margin-top: 2px; }
        
        /* OTA升级 */
        .ota-section { text-align: center; }
        .version { font-size: 24px; font-weight: 600; color: var(--accent); }
        .ota-status { font-size: 12px; color: #8b949e; margin: 8px 0; }
        input[type="file"] { display: none; }
        .file-label { display: inline-block; padding: 12px 24px; background: #21262d; border-radius: 8px; cursor: pointer; }
        .progress { height: 4px; background: #21262d; border-radius: 2px; margin-top: 12px; overflow: hidden; display: none; }
        .progress-bar { height: 100%; background: var(--accent); width: 0%; transition: width 0.3s; }
        
        /* 折叠面板 */
        .collapse-header { cursor: pointer; display: flex; justify-content: space-between; align-items: center; }
        .collapse-content { display: none; margin-top: 12px; }
        .collapse-content.show { display: block; }
        .arrow { transition: transform 0.2s; }
        .arrow.open { transform: rotate(180deg); }
        
        /* 底部导航 */
        .nav { position: fixed; bottom: 0; left: 0; right: 0; background: var(--card); border-top: 1px solid var(--border); display: flex; padding: 8px 0; }
        .nav-item { flex: 1; text-align: center; padding: 8px; color: #8b949e; font-size: 11px; cursor: pointer; }
        .nav-item.active { color: var(--accent); }
        .nav-icon { font-size: 20px; margin-bottom: 2px; }
        
        /* 页面切换 */
        .page { display: none; padding-bottom: 70px; }
        .page.active { display: block; }
        
        /* 消息提示 */
        .toast { position: fixed; top: 60px; left: 50%; transform: translateX(-50%); background: var(--card); border: 1px solid var(--border); padding: 12px 20px; border-radius: 8px; z-index: 200; display: none; }
    </style>
</head>
<body>
    <!-- 顶部状态栏 -->
    <div class="header">
        <div class="logo">🤖 <span>Simo</span></div>
        <div class="status-dots">
            <div class="dot" id="dotWifi" title="WiFi"></div>
            <div class="dot" id="dotStm32" title="STM32"></div>
        </div>
    </div>
    
    <!-- 控制页 -->
    <div class="page active" id="pageControl">
        <div class="main">
            <!-- 摄像头预览 -->
            <div class="card">
                <div class="card-title">📷 摄像头 <span id="camStatus" style="font-size:11px;color:#8b949e"></span></div>
                <div style="text-align:center">
                    <img id="camView" style="width:100%;max-width:320px;border-radius:8px;background:#000" alt="摄像头">
                    <div style="margin-top:8px;display:flex;gap:8px;justify-content:center">
                        <button class="btn btn-secondary" onclick="camCapture()">📸 拍照</button>
                        <button class="btn btn-primary" id="btnStream" onclick="camToggleStream()">▶️ 开启</button>
                    </div>
                </div>
            </div>
            
            <!-- 方向控制 -->
            <div class="card">
                <div class="card-title">⬆️ 运动控制</div>
                <div class="controls">
                    <div class="ctrl-btn empty"></div>
                    <button class="ctrl-btn" ontouchstart="cmd('F')" onmousedown="cmd('F')">↑</button>
                    <div class="ctrl-btn empty"></div>
                    <button class="ctrl-btn" ontouchstart="cmd('L')" onmousedown="cmd('L')">←</button>
                    <button class="ctrl-btn stop" ontouchstart="cmd('S')" onmousedown="cmd('S')">■</button>
                    <button class="ctrl-btn" ontouchstart="cmd('R')" onmousedown="cmd('R')">→</button>
                    <div class="ctrl-btn empty"></div>
                    <button class="ctrl-btn" ontouchstart="cmd('B')" onmousedown="cmd('B')">↓</button>
                    <div class="ctrl-btn empty"></div>
                </div>
            </div>
            
            <!-- 模式选择 -->
            <div class="card">
                <div class="card-title">🎯 运行模式</div>
                <div class="modes">
                    <button class="mode-btn active" data-mode="idle" onclick="setMode('idle')">空闲</button>
                    <button class="mode-btn" data-mode="manual" onclick="setMode('manual')">手动</button>
                    <button class="mode-btn" data-mode="patrol" onclick="setMode('patrol')">巡逻</button>
                    <button class="mode-btn" data-mode="follow" onclick="setMode('follow')">跟随</button>
                </div>
            </div>
            
            <!-- 语音命令 -->
            <div class="card">
                <div class="card-title">🎤 语音命令</div>
                <div class="input-group">
                    <input type="text" id="voiceInput" placeholder="输入命令，如：前进、巡逻...">
                    <button class="btn btn-primary" onclick="sendVoice()">发送</button>
                </div>
            </div>
        </div>
    </div>
    
    <!-- 设置页 -->
    <div class="page" id="pageSettings">
        <div class="main">
            <!-- WiFi配置 -->
            <div class="card">
                <div class="collapse-header" onclick="toggleCollapse('wifiSection')">
                    <div class="card-title" style="margin:0">📶 WiFi配置</div>
                    <span class="arrow" id="arrowWifi">▼</span>
                </div>
                <div class="collapse-content show" id="wifiSection">
                    <button class="btn btn-secondary" style="width:100%;margin-bottom:12px" onclick="scanWifi()">扫描网络</button>
                    <div class="wifi-list" id="wifiList"></div>
                    <div class="wifi-form">
                        <input type="text" id="ssidInput" placeholder="WiFi名称">
                        <input type="password" id="passInput" placeholder="WiFi密码">
                        <div style="display:flex;gap:8px">
                            <button class="btn btn-primary" style="flex:1" onclick="saveWifi()">保存并连接</button>
                            <button class="btn btn-danger" onclick="clearWifi()">清除</button>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- OTA升级 -->
            <div class="card">
                <div class="collapse-header" onclick="toggleCollapse('otaSection')">
                    <div class="card-title" style="margin:0">⬆️ 固件升级</div>
                    <span class="arrow" id="arrowOta">▼</span>
                </div>
                <div class="collapse-content show" id="otaSection">
                    <div class="ota-section">
                        <div class="version" id="fwVersion">--</div>
                        <div class="ota-status" id="otaStatus">当前版本</div>
                        <label class="file-label">
                            选择固件文件
                            <input type="file" id="fwFile" accept=".bin" onchange="uploadFirmware()">
                        </label>
                        <div class="progress" id="otaProgress">
                            <div class="progress-bar" id="otaBar"></div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- 系统信息 -->
            <div class="card">
                <div class="card-title">ℹ️ 系统信息</div>
                <div class="info-grid">
                    <div class="info-item"><div class="info-label">芯片</div><div class="info-value" id="infoChip">--</div></div>
                    <div class="info-item"><div class="info-label">内存</div><div class="info-value" id="infoHeap">--</div></div>
                    <div class="info-item"><div class="info-label">AP IP</div><div class="info-value" id="infoApIp">--</div></div>
                    <div class="info-item"><div class="info-label">局域网IP</div><div class="info-value" id="infoStaIp">--</div></div>
                    <div class="info-item"><div class="info-label">运行时间</div><div class="info-value" id="infoUptime">--</div></div>
                    <div class="info-item"><div class="info-label">距离</div><div class="info-value" id="infoDist">--</div></div>
                </div>
            </div>
        </div>
    </div>
    
    <!-- 底部导航 -->
    <div class="nav">
        <div class="nav-item active" onclick="showPage('pageControl')">
            <div class="nav-icon">🎮</div>控制
        </div>
        <div class="nav-item" onclick="showPage('pageSettings')">
            <div class="nav-icon">⚙️</div>设置
        </div>
    </div>
    
    <!-- 消息提示 -->
    <div class="toast" id="toast"></div>
    
    <script>
        // 页面切换
        function showPage(id) {
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            document.getElementById(id).classList.add('active');
            event.currentTarget.classList.add('active');
        }
        
        // 折叠面板
        function toggleCollapse(id) {
            const el = document.getElementById(id);
            el.classList.toggle('show');
        }
        
        // 消息提示
        function toast(msg) {
            const t = document.getElementById('toast');
            t.innerText = msg;
            t.style.display = 'block';
            setTimeout(() => t.style.display = 'none', 2000);
        }
        
        // 摄像头
        let streaming = false;
        function camCapture() {
            document.getElementById('camView').src = '/camera/capture?' + Date.now();
            document.getElementById('camStatus').innerText = '已拍照';
        }
        function camToggleStream() {
            const img = document.getElementById('camView');
            const btn = document.getElementById('btnStream');
            if (streaming) {
                img.src = '';
                btn.innerHTML = '▶️ 开启';
                document.getElementById('camStatus').innerText = '已停止';
                streaming = false;
            } else {
                img.src = '/camera/stream';
                btn.innerHTML = '⏹️ 停止';
                document.getElementById('camStatus').innerText = '直播中';
                streaming = true;
            }
        }
        
        // 运动命令
        function cmd(c) {
            fetch('/cmd?c=' + c).then(r => r.text()).then(t => toast(t));
        }
        
        // 模式切换
        function setMode(m) {
            fetch('/mode?m=' + m).then(r => r.text()).then(t => {
                document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
                document.querySelector('[data-mode="'+m+'"]').classList.add('active');
                toast(t);
            });
        }
        
        // 语音命令
        function sendVoice() {
            const text = document.getElementById('voiceInput').value;
            if (!text) return;
            fetch('/voice?text=' + encodeURIComponent(text)).then(r => r.text()).then(t => {
                toast(t);
                document.getElementById('voiceInput').value = '';
            });
        }
        
        // WiFi扫描
        function scanWifi() {
            toast('扫描中...');
            fetch('/wifi/scan').then(r => r.json()).then(data => {
                let html = '';
                data.forEach(n => {
                    html += '<div class="wifi-item" onclick="selectWifi(\'' + n.ssid + '\')"><span>' + n.ssid + '</span><span class="wifi-rssi">' + n.rssi + 'dBm</span></div>';
                });
                document.getElementById('wifiList').innerHTML = html;
                toast('找到 ' + data.length + ' 个网络');
            });
        }
        
        function selectWifi(ssid) {
            document.getElementById('ssidInput').value = ssid;
        }
        
        // 保存WiFi
        function saveWifi() {
            const ssid = document.getElementById('ssidInput').value;
            const pass = document.getElementById('passInput').value;
            if (!ssid) { toast('请输入WiFi名称'); return; }
            toast('正在连接...');
            fetch('/wifi/save', { method: 'POST', body: new URLSearchParams({ssid: ssid, password: pass}) })
                .then(r => r.text()).then(t => { toast(t.includes('成功') ? '连接成功!' : '连接失败'); setTimeout(() => location.reload(), 2000); });
        }
        
        // 清除WiFi
        function clearWifi() {
            if (confirm('确定清除WiFi配置？')) {
                fetch('/wifi/clear').then(() => toast('已清除，重启中...'));
            }
        }
        
        // OTA升级
        function uploadFirmware() {
            const file = document.getElementById('fwFile').files[0];
            if (!file) return;
            const form = new FormData();
            form.append('update', file);
            document.getElementById('otaProgress').style.display = 'block';
            document.getElementById('otaStatus').innerText = '升级中...';
            const xhr = new XMLHttpRequest();
            xhr.upload.onprogress = e => {
                if (e.lengthComputable) {
                    document.getElementById('otaBar').style.width = (e.loaded / e.total * 100) + '%';
                }
            };
            xhr.onload = () => {
                document.getElementById('otaStatus').innerText = '升级成功，重启中...';
                setTimeout(() => location.reload(), 3000);
            };
            xhr.open('POST', '/update');
            xhr.send(form);
        }
        
        // 刷新状态
        function refreshStatus() {
            fetch('/status').then(r => r.json()).then(d => {
                document.getElementById('dotStm32').className = 'dot ' + (d.stm32 ? 'on' : '');
                document.getElementById('infoDist').innerText = d.distance + 'cm';
                document.getElementById('infoUptime').innerText = Math.floor(d.uptime / 60) + '分';
                document.getElementById('infoHeap').innerText = Math.round(d.heap / 1024) + 'KB';
                document.getElementById('fwVersion').innerText = 'v' + d.version;
                document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
                const modeBtn = document.querySelector('[data-mode="'+d.mode+'"]');
                if (modeBtn) modeBtn.classList.add('active');
            }).catch(() => {});
            fetch('/info').then(r => r.json()).then(d => {
                document.getElementById('infoChip').innerText = d.chip;
                document.getElementById('infoApIp').innerText = d.ip;
                document.getElementById('dotWifi').className = 'dot on';
            }).catch(() => {});
        }
        
        refreshStatus();
        setInterval(refreshStatus, 5000);
    </script>
</body>
</html>
)rawliteral";

// ============ 处理函数 ============
void handleRoot() {
    server.send(200, "text/html", htmlPage);
}

// STM32 命令映射（根据 MOTION_PROTOCOL 配置选择协议格式）
void sendToSTM32(const char* cmd, int speed, int duration) {
    char buffer[64];
    const char* protocol = MOTION_PROTOCOL;
    
    // 停止命令：两种协议都是 S
    if (strcmp(cmd, "S") == 0) {
        snprintf(buffer, sizeof(buffer), "S\n");
    }
    // 心跳检测
    else if (strcmp(cmd, "PING") == 0) {
        snprintf(buffer, sizeof(buffer), "PING\n");
    }
    // 传感器查询
    else if (strcmp(cmd, "SENSOR") == 0) {
        snprintf(buffer, sizeof(buffer), "SENSOR\n");
    }
    // 运动命令：根据协议选择格式
    else if (strcmp(cmd, "F") == 0 || strcmp(cmd, "B") == 0 || 
             strcmp(cmd, "L") == 0 || strcmp(cmd, "R") == 0) {
        if (strcmp(protocol, "simple") == 0) {
            // simple协议: F,<ms> / B,<ms> / L,<ms> / R,<ms>
            snprintf(buffer, sizeof(buffer), "%s,%d\n", cmd, duration);
        } else {
            // m-v1协议: M,forward,speed,duration
            const char* dirName = "forward";
            if (strcmp(cmd, "B") == 0) dirName = "backward";
            else if (strcmp(cmd, "L") == 0) dirName = "left";
            else if (strcmp(cmd, "R") == 0) dirName = "right";
            float speedFloat = speed / 100.0f;
            snprintf(buffer, sizeof(buffer), "M,%s,%.2f,%d\n", dirName, speedFloat, duration);
        }
    }
    // 其他命令：直接发送
    else {
        snprintf(buffer, sizeof(buffer), "%s\n", cmd);
    }
    
    stm32Serial.print(buffer);
    Serial.printf("[->STM32] %s", buffer);
}

void handleCmd() {
    String cmd = server.arg("c");
    String speedStr = server.arg("speed");
    String durationStr = server.arg("duration");
    String response = "OK";
    
    int speed = speedStr.length() > 0 ? speedStr.toInt() : 150;
    int duration = durationStr.length() > 0 ? durationStr.toInt() : 500;
    
    if (cmd.length() > 0) {
        // 发送到 STM32（使用标准协议）
        sendToSTM32(cmd.c_str(), speed, duration);
        
        // 等待 STM32 响应
        unsigned long start = millis();
        while (!stm32Serial.available() && millis() - start < 100) {
            delay(10);
        }
        
        if (stm32Serial.available()) {
            response = stm32Serial.readStringUntil('\n');
            response.trim();
        }
    }
    
    server.send(200, "text/plain", response);
}

void handleStatus() {
    // 返回缓存的状态（避免频繁查询STM32）
    const char* modeNames[] = {"idle", "manual", "patrol", "follow", "return"};
    char json[512];
    snprintf(json, sizeof(json),
        "{\"stm32\":%s,\"distance\":%d,"
        "\"leftIR\":%s,\"rightIR\":%s,"
        "\"leftTrack\":%s,\"rightTrack\":%s,"
        "\"mode\":\"%s\",\"modeId\":%d,"
        "\"heap\":%lu,\"uptime\":%lu,\"version\":\"%s\"}",
        stm32Connected ? "true" : "false",
        lastDistance,
        leftIR ? "true" : "false",
        rightIR ? "true" : "false",
        leftTrack ? "true" : "false",
        rightTrack ? "true" : "false",
        modeNames[currentMode],
        currentMode,
        ESP.getFreeHeap(),
        millis() / 1000,
        FIRMWARE_VERSION
    );
    server.send(200, "application/json", json);
}

void handlePing() {
    server.send(200, "text/plain", "PONG");
}

// 系统信息API
void handleInfo() {
    char json[512];
    snprintf(json, sizeof(json),
        "{\"chip\":\"%s\",\"cores\":%d,\"freq\":%d,"
        "\"flash\":%d,\"psram\":%d,\"heap\":%lu,"
        "\"version\":\"%s\",\"build\":\"%s\","
        "\"ip\":\"%s\",\"mac\":\"%s\"}",
        ESP.getChipModel(),
        ESP.getChipCores(),
        ESP.getCpuFreqMHz(),
        ESP.getFlashChipSize() / 1024 / 1024,
        ESP.getPsramSize() / 1024 / 1024,
        ESP.getFreeHeap(),
        FIRMWARE_VERSION,
        BUILD_DATE,
        WiFi.softAPIP().toString().c_str(),
        WiFi.softAPmacAddress().c_str()
    );
    server.send(200, "application/json", json);
}

// OTA远程升级页面
void handleOTA() {
    const char* otaPage = R"rawliteral(
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Simo OTA升级</title>
    <style>
        body { font-family: Arial; background: #1a1a2e; color: #fff; padding: 20px; text-align: center; }
        h2 { color: #00d9ff; }
        .upload-box { background: #16213e; padding: 30px; border-radius: 15px; margin: 20px auto; max-width: 400px; }
        input[type="file"] { margin: 20px 0; }
        button { background: #00d9ff; color: #000; border: none; padding: 15px 40px; font-size: 18px; border-radius: 10px; cursor: pointer; }
        button:hover { background: #00b8d4; }
        #progress { margin-top: 20px; }
        .bar { background: #333; border-radius: 10px; height: 20px; overflow: hidden; }
        .fill { background: #00d9ff; height: 100%; width: 0%; transition: width 0.3s; }
    </style>
</head>
<body>
    <h2>Simo 固件升级</h2>
    <div class="upload-box">
        <form method="POST" action="/update" enctype="multipart/form-data" id="uploadForm">
            <input type="file" name="update" accept=".bin" required><br>
            <button type="submit">开始升级</button>
        </form>
        <div id="progress" style="display:none;">
            <p>升级中...</p>
            <div class="bar"><div class="fill" id="fill"></div></div>
        </div>
    </div>
    <script>
        document.getElementById('uploadForm').onsubmit = function() {
            document.getElementById('progress').style.display = 'block';
            var fill = document.getElementById('fill');
            var p = 0;
            var timer = setInterval(function() { if(p < 90) { p += 10; fill.style.width = p + '%'; } }, 500);
        };
    </script>
</body>
</html>
)rawliteral";
    server.send(200, "text/html", otaPage);
}

// OTA升级处理
void handleUpdate() {
    server.sendHeader("Connection", "close");
    if (Update.hasError()) {
        server.send(500, "text/plain", "\u5347\u7ea7\u5931\u8d25");
    } else {
        server.send(200, "text/html", "<h2>\u5347\u7ea7\u6210\u529f\uff01</h2><p>3\u79d2\u540e\u91cd\u542f...</p><script>setTimeout(function(){location.href='/';},3000);</script>");
        delay(1000);
        ESP.restart();
    }
}

void handleUpdateUpload() {
    HTTPUpload& upload = server.upload();
    if (upload.status == UPLOAD_FILE_START) {
        Serial.printf("[OTA] 开始升级: %s\n", upload.filename.c_str());
        if (!Update.begin(UPDATE_SIZE_UNKNOWN)) {
            Update.printError(Serial);
        }
    } else if (upload.status == UPLOAD_FILE_WRITE) {
        if (Update.write(upload.buf, upload.currentSize) != upload.currentSize) {
            Update.printError(Serial);
        }
    } else if (upload.status == UPLOAD_FILE_END) {
        if (Update.end(true)) {
            Serial.printf("[OTA] 升级完成: %u 字节\n", upload.totalSize);
        } else {
            Update.printError(Serial);
        }
    }
}

// 语音命令API（预留给小智AI或自定义语音服务）
void handleVoice() {
    String text = server.arg("text");
    String response = "OK";
    
    if (text.length() > 0) {
        Serial.printf("[VOICE] %s\n", text.c_str());
        
        // 语音命令解析
        if (text.indexOf("前进") >= 0 || text.indexOf("往前") >= 0) {
            currentMode = MODE_MANUAL;
            sendToSTM32("F", 150, 1000);
            response = "好的，前进";
        } else if (text.indexOf("后退") >= 0 || text.indexOf("往后") >= 0) {
            currentMode = MODE_MANUAL;
            sendToSTM32("B", 150, 1000);
            response = "好的，后退";
        } else if (text.indexOf("左转") >= 0 || text.indexOf("往左") >= 0) {
            currentMode = MODE_MANUAL;
            sendToSTM32("L", 150, 500);
            response = "好的，左转";
        } else if (text.indexOf("右转") >= 0 || text.indexOf("往右") >= 0) {
            currentMode = MODE_MANUAL;
            sendToSTM32("R", 150, 500);
            response = "好的，右转";
        } else if (text.indexOf("停") >= 0 || text.indexOf("别动") >= 0) {
            currentMode = MODE_IDLE;
            sendToSTM32("S");
            response = "好的，停下";
        } else if (text.indexOf("巡逻") >= 0 || text.indexOf("巡逾") >= 0) {
            currentMode = MODE_PATROL;
            patrolState = 0;
            response = "好的，开始巡逻";
        } else if (text.indexOf("回家") >= 0 || text.indexOf("返航") >= 0) {
            currentMode = MODE_RETURN;
            response = "好的，正在返航";
        } else {
            response = "不明白，可以说前进、后退、左转、右转、停、巡逻、返航";
        }
    }
    
    server.send(200, "text/plain; charset=utf-8", response);
}

// 模式控制API
void handleMode() {
    String mode = server.arg("m");
    String response = "OK";
    
    if (mode == "idle" || mode == "0") {
        currentMode = MODE_IDLE;
        sendToSTM32("S");
        response = "已切换到空闲模式";
    } else if (mode == "manual" || mode == "1") {
        currentMode = MODE_MANUAL;
        response = "已切换到手动模式";
    } else if (mode == "patrol" || mode == "2") {
        currentMode = MODE_PATROL;
        patrolState = 0;
        response = "已切换到巡逻模式";
    } else if (mode == "follow" || mode == "3") {
        currentMode = MODE_FOLLOW;
        response = "已切换到跟随模式";
    } else if (mode == "return" || mode == "4") {
        currentMode = MODE_RETURN;
        response = "已切换到返航模式";
    } else {
        response = "无效模式，可选: idle/manual/patrol/follow/return";
    }
    
    Serial.printf("[MODE] %s -> %d\n", mode.c_str(), currentMode);
    server.send(200, "text/plain; charset=utf-8", response);
}

// ============ WiFi凭证管理 ============
void loadWiFiCredentials() {
    preferences.begin("wifi", true);  // 只读模式
    savedSSID = preferences.getString("ssid", "");
    savedPassword = preferences.getString("password", "");
    preferences.end();
    
    if (savedSSID.length() > 0) {
        Serial.printf("[NVS] 已保存的WiFi: %s\n", savedSSID.c_str());
    } else {
        Serial.println("[NVS] 未找到已保存的WiFi凭证");
    }
}

void saveWiFiCredentials(const String& ssid, const String& password) {
    preferences.begin("wifi", false);  // 读写模式
    preferences.putString("ssid", ssid);
    preferences.putString("password", password);
    preferences.end();
    
    savedSSID = ssid;
    savedPassword = password;
    Serial.printf("[NVS] WiFi凭证已保存: %s\n", ssid.c_str());
}

void clearWiFiCredentials() {
    preferences.begin("wifi", false);
    preferences.clear();
    preferences.end();
    
    savedSSID = "";
    savedPassword = "";
    Serial.println("[NVS] WiFi凭证已清除");
}

// WiFi配网页面
const char* wifiSetupPage = R"rawliteral(
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Simo WiFi配置</title>
    <style>
        body { font-family: Arial; background: #1a1a2e; color: #fff; padding: 20px; }
        h2 { color: #00d9ff; text-align: center; }
        .box { background: #16213e; padding: 20px; border-radius: 15px; max-width: 350px; margin: 20px auto; }
        label { display: block; margin: 15px 0 5px; }
        input, select { width: 100%; padding: 12px; border: none; border-radius: 8px; font-size: 16px; }
        button { width: 100%; background: #00d9ff; color: #000; border: none; padding: 15px; font-size: 18px; border-radius: 10px; cursor: pointer; margin-top: 20px; }
        button:hover { background: #00b8d4; }
        .scan { background: #4CAF50; margin-bottom: 10px; }
        #networks { max-height: 200px; overflow-y: auto; }
        .net { padding: 10px; margin: 5px 0; background: #0f3460; border-radius: 8px; cursor: pointer; }
        .net:hover { background: #1a4a7a; }
        .status { text-align: center; margin-top: 15px; color: #aaa; }
    </style>
</head>
<body>
    <h2>🤖 Simo WiFi配置</h2>
    <div class="box">
        <button class="scan" onclick="scan()">扫描WiFi网络</button>
        <div id="networks"></div>
        <label>WiFi名称 (SSID)</label>
        <input type="text" id="ssid" required>
        <label>WiFi密码</label>
        <input type="password" id="password">
        <button onclick="saveWifi()">保存并连接</button>
        <p class="status" id="status"></p>
    </div>
    <script>
        function scan() {
            document.getElementById('status').innerText = '扫描中...';
            fetch('/wifi/scan').then(r => r.json()).then(data => {
                let html = '';
                data.forEach(n => {
                    html += '<div class="net" onclick="selectNet(\'' + n.ssid + '\')">' + n.ssid + ' (' + n.rssi + 'dBm)</div>';
                });
                document.getElementById('networks').innerHTML = html;
                document.getElementById('status').innerText = '找到 ' + data.length + ' 个网络';
            }).catch(e => {
                document.getElementById('status').innerText = '扫描失败';
            });
        }
        function selectNet(ssid) {
            document.getElementById('ssid').value = ssid;
        }
        function saveWifi() {
            const ssid = document.getElementById('ssid').value;
            const pass = document.getElementById('password').value;
            if (!ssid) { document.getElementById('status').innerText = '请输入WiFi名称'; return; }
            document.getElementById('status').innerText = '正在连接...';
            fetch('/wifi/save', { method: 'POST', body: new URLSearchParams({ssid: ssid, password: pass}) })
                .then(r => r.text()).then(t => {
                    document.getElementById('status').innerHTML = t;
                });
        }
    </script>
</body>
</html>
)rawliteral";

// WiFi配置页面
void handleWiFiSetup() {
    server.send(200, "text/html", wifiSetupPage);
}

// WiFi扫描
void handleWiFiScan() {
    int n = WiFi.scanNetworks();
    String json = "[";
    for (int i = 0; i < n; i++) {
        if (i > 0) json += ",";
        json += "{\"ssid\":\"" + WiFi.SSID(i) + "\",\"rssi\":" + String(WiFi.RSSI(i)) + "}";
    }
    json += "]";
    WiFi.scanDelete();
    server.send(200, "application/json", json);
}

// 保存WiFi凭证
void handleWiFiSave() {
    String ssid = server.arg("ssid");
    String password = server.arg("password");
    
    if (ssid.length() > 0) {
        saveWiFiCredentials(ssid, password);
        
        // 直接尝试连接，不重启
        Serial.printf("[WiFi] 尝试连接: %s\n", ssid.c_str());
        WiFi.begin(ssid.c_str(), password.c_str());
        
        int retry = 0;
        while (WiFi.status() != WL_CONNECTED && retry < 30) {
            delay(500);
            Serial.print(".");
            retry++;
        }
        
        if (WiFi.status() == WL_CONNECTED) {
            staConnected = true;
            homeIP = WiFi.localIP().toString();
            Serial.printf("\n[WiFi] 已连接: %s\n", homeIP.c_str());
            
            char html[256];
            snprintf(html, sizeof(html), 
                "<h2>连接成功!</h2><p>局域网IP: <b>%s</b></p><script>setTimeout(function(){location.href='/';},3000);</script>",
                homeIP.c_str());
            server.send(200, "text/html", html);
        } else {
            Serial.println("\n[WiFi] 连接失败");
            server.send(200, "text/html", "<h2>连接失败</h2><p>请检查密码是否正确</p><a href='/wifi'>重试</a>");
        }
    } else {
        server.send(400, "text/plain", "SSID不能为空");
    }
}

// 清除WiFi凭证
void handleWiFiClear() {
    clearWiFiCredentials();
    server.send(200, "text/html", "<h2>已清除!</h2><p>正在重启...</p><script>setTimeout(function(){location.href='/wifi';},3000);</script>");
    delay(1000);
    ESP.restart();
}

// 尝试连接已保存的WiFi
bool tryConnectSavedWiFi() {
    if (savedSSID.length() == 0) return false;
    
    Serial.printf("[WiFi] 尝试连接: %s\n", savedSSID.c_str());
    WiFi.begin(savedSSID.c_str(), savedPassword.c_str());
    
    int retry = 0;
    while (WiFi.status() != WL_CONNECTED && retry < 20) {
        delay(500);
        Serial.print(".");
        retry++;
    }
    
    if (WiFi.status() == WL_CONNECTED) {
        staConnected = true;
        homeIP = WiFi.localIP().toString();
        Serial.printf("\n[WiFi] 已连接: %s\n", homeIP.c_str());
        return true;
    }
    
    Serial.println("\n[WiFi] 连接失败");
    return false;
}

// ============ 设备注册 ============
// 向Node后端注册设备
void registerToBackend() {
    if (!staConnected) return;
    
    Serial.println("[REG] 向Node后端注册...");
    
    HTTPClient http;
    char url[128];
    snprintf(url, sizeof(url), "http://%s:%d/api/esp32/register", 
        SIMO_BACKEND_IP, SIMO_BACKEND_PORT);
    
    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    
    // 构建注册信息
    char payload[256];
    snprintf(payload, sizeof(payload), 
        "{\"mac\":\"%s\",\"ip\":\"%s\",\"version\":\"%s\",\"uptime\":%lu}",
        WiFi.macAddress().c_str(),
        homeIP.c_str(),
        FIRMWARE_VERSION,
        millis() / 1000
    );
    
    int httpCode = http.POST(payload);
    if (httpCode == HTTP_CODE_OK) {
        String response = http.getString();
        Serial.printf("[REG] 注册成功: %s\n", response.c_str());
    } else {
        Serial.printf("[REG] 注册失败: %d\n", httpCode);
    }
    
    http.end();
}

// ============ OTA服务器拉取 ============
// 检查OTA更新（从Node后端拉取）
void checkOTAUpdate() {
    if (!staConnected) {
        Serial.println("[OTA] 未连接WiFi，跳过检查");
        return;
    }
    
    Serial.println("[OTA] 检查Node后端更新...");
    
    HTTPClient http;
    // 构建Node后端OTA检查URL
    char url[128];
    snprintf(url, sizeof(url), "http://%s:%d/api/ota/check?version=%s", 
        SIMO_BACKEND_IP, SIMO_BACKEND_PORT, FIRMWARE_VERSION);
    Serial.printf("[OTA] 请求: %s\n", url);
    http.begin(url);
    
    int httpCode = http.GET();
    if (httpCode == HTTP_CODE_OK) {
        String payload = http.getString();
        
        // 解析JSON响应: {"update":true,"version":"2.4.0","url":"http://..."}
        int vIdx = payload.indexOf("\"version\":\"");
        int uIdx = payload.indexOf("\"url\":\"");
        int updateIdx = payload.indexOf("\"update\":true");
        
        if (updateIdx >= 0 && vIdx >= 0) {
            int vEnd = payload.indexOf("\"", vIdx + 11);
            latestVersion = payload.substring(vIdx + 11, vEnd);
            
            if (latestVersion != FIRMWARE_VERSION) {
                otaUpdateAvailable = true;
                Serial.printf("[OTA] 发现新版本: %s\n", latestVersion.c_str());
                
                // 如果有下载URL，自动更新
                if (uIdx >= 0) {
                    int uEnd = payload.indexOf("\"", uIdx + 7);
                    String downloadUrl = payload.substring(uIdx + 7, uEnd);
                    performOTAUpdate(downloadUrl);
                }
            } else {
                Serial.println("[OTA] 已是最新版本");
            }
        }
    } else {
        Serial.printf("[OTA] 检查失败: %d\n", httpCode);
    }
    
    http.end();
    lastOTACheck = millis();
}

// 执行OTA更新
void performOTAUpdate(const String& url) {
    Serial.printf("[OTA] 开始下载: %s\n", url.c_str());
    
    HTTPClient http;
    http.begin(url);
    
    int httpCode = http.GET();
    if (httpCode == HTTP_CODE_OK) {
        int contentLength = http.getSize();
        
        if (contentLength > 0 && Update.begin(contentLength)) {
            Serial.printf("[OTA] 固件大小: %d bytes\n", contentLength);
            
            WiFiClient* stream = http.getStreamPtr();
            size_t written = Update.writeStream(*stream);
            
            if (written == contentLength) {
                Serial.println("[OTA] 写入完成");
            }
            
            if (Update.end()) {
                if (Update.isFinished()) {
                    Serial.println("[OTA] 更新成功，重启中...");
                    delay(1000);
                    ESP.restart();
                } else {
                    Serial.println("[OTA] 更新未完成");
                }
            } else {
                Serial.printf("[OTA] 更新错误: %s\n", Update.errorString());
            }
        } else {
            Serial.println("[OTA] 空间不足或无法开始更新");
        }
    } else {
        Serial.printf("[OTA] 下载失败: %d\n", httpCode);
    }
    
    http.end();
}

// OTA状态API
void handleOTAStatus() {
    char json[256];
    snprintf(json, sizeof(json),
        "{\"current\":\"%s\",\"latest\":\"%s\",\"updateAvailable\":%s,\"lastCheck\":%lu}",
        FIRMWARE_VERSION,
        latestVersion.length() > 0 ? latestVersion.c_str() : FIRMWARE_VERSION,
        otaUpdateAvailable ? "true" : "false",
        lastOTACheck / 1000
    );
    server.send(200, "application/json", json);
}

// 手动触发OTA检查
void handleOTACheck() {
    checkOTAUpdate();
    server.send(200, "text/plain", otaUpdateAvailable ? "发现新版本: " + latestVersion : "已是最新版本");
}

// ============ 摄像头API处理 ============

// 切换分辨率
void setCameraResolution(framesize_t size) {
    sensor_t *s = esp_camera_sensor_get();
    if (s) {
        s->set_framesize(s, size);
    }
}

// 刷帧（切换模式后清除旧缓存）
void flushCameraFrames(int count = 2) {
    for (int i = 0; i < count; i++) {
        camera_fb_t* fb = esp_camera_fb_get();
        if (fb) esp_camera_fb_return(fb);
    }
}

// 统一摄像头模式切换（带互斥和刷帧）
bool ensureCamMode(CamMode targetMode) {
    if (!cameraInitialized) return false;
    
    // 检查是否被长连接占用
    if (camModeLocked && targetMode != currentCamMode) {
        Serial.printf("[Camera] 模式切换被拒绝: 当前被 %d 占用\n", currentCamMode);
        return false;
    }
    
    // 已是目标模式
    if (currentCamMode == targetMode) return true;
    
    sensor_t *s = esp_camera_sensor_get();
    if (!s) return false;
    
    switch (targetMode) {
        case CAM_IDLE:
        case CAM_STREAM:
            s->set_pixformat(s, PIXFORMAT_JPEG);
            s->set_framesize(s, FRAMESIZE_QVGA);  // 320x240
            s->set_quality(s, 20);
            break;
            
        case CAM_DETECT:
            s->set_pixformat(s, PIXFORMAT_RGB565);
            s->set_framesize(s, FRAMESIZE_QQVGA);  // 160x120
            break;
            
        case CAM_VISION:
        case CAM_CAPTURE:
            s->set_pixformat(s, PIXFORMAT_JPEG);
            s->set_framesize(s, FRAMESIZE_VGA);  // 640x480
            s->set_quality(s, 15);
            break;
    }
    
    // 刷帧清除旧缓存
    delay(30);
    flushCameraFrames(2);
    
    currentCamMode = targetMode;
    Serial.printf("[Camera] 切换到模式 %d\n", targetMode);
    return true;
}

// 锁定摄像头（长连接占用）
void lockCamMode(CamMode mode) {
    currentCamMode = mode;
    camModeLocked = true;
}

// 解锁摄像头
void unlockCamMode() {
    camModeLocked = false;
    ensureCamMode(CAM_IDLE);
}

// 拍照接口 - 返回JPEG图片（高清模式）
void handleCameraCapture() {
    if (!cameraInitialized) {
        server.send(503, "application/json", "{\"error\":\"Camera not initialized\"}");
        return;
    }
    
    // 切换到拍照模式（带互斥检查）
    if (!ensureCamMode(CAM_CAPTURE)) {
        server.send(503, "application/json", "{\"error\":\"Camera busy\"}");
        return;
    }
    
    camera_fb_t *fb = esp_camera_fb_get();
    if (!fb) {
        server.send(500, "application/json", "{\"error\":\"Camera capture failed\"}");
        return;
    }
    
    // 发送JPEG图片
    server.sendHeader("Content-Type", "image/jpeg");
    server.sendHeader("Content-Disposition", "inline; filename=capture.jpg");
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.send_P(200, "image/jpeg", (const char*)fb->buf, fb->len);
    
    Serial.printf("[Camera] 高清拍照: %dx%d, %d bytes\n", fb->width, fb->height, fb->len);
    esp_camera_fb_return(fb);
    
    // 切回空闲模式
    ensureCamMode(CAM_IDLE);
}

// MJPEG视频流（长连接，独占摄像头，低延迟优化）
void handleCameraStream() {
    if (!cameraInitialized) {
        server.send(503, "application/json", "{\"error\":\"Camera not initialized\"}");
        return;
    }
    
    // 切换到流模式并锁定
    if (!ensureCamMode(CAM_STREAM)) {
        server.send(503, "application/json", "{\"error\":\"Camera busy\"}");
        return;
    }
    lockCamMode(CAM_STREAM);
    
    // 自动关闭冲突的功能
    if (faceDetectEnabled) {
        faceDetectEnabled = false;
        Serial.println("[Camera] Stream 开启，已关闭人脸检测");
    }
    if (visionEnabled) {
        visionEnabled = false;
        Serial.println("[Camera] Stream 开启，已关闭后端识别");
    }
    
    WiFiClient client = server.client();
    client.setNoDelay(true);  // 禁用 Nagle 算法，减少延迟
    
    // 发送响应头（非 chunked）
    client.print("HTTP/1.1 200 OK\r\n"
                 "Content-Type: multipart/x-mixed-replace; boundary=frame\r\n"
                 "Access-Control-Allow-Origin: *\r\n"
                 "Cache-Control: no-cache\r\n"
                 "Connection: keep-alive\r\n\r\n");
    
    Serial.println("[Camera] 视频流开始（低延迟模式）");
    
    // 静态帧头缓冲区
    static char frameHeader[100];
    static const char* boundary = "--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ";
    static const char* headerEnd = "\r\n\r\n";
    static const char* frameEnd = "\r\n";
    
    unsigned long lastFrameTime = 0;
    const unsigned long minFrameInterval = 50;  // 约20fps上限，更稳定
    
    while (client.connected()) {
        // 帧率限制（避免过快消耗资源）
        unsigned long now = millis();
        if (now - lastFrameTime < minFrameInterval) {
            delay(1);  // 最小延迟，让出CPU
            continue;
        }
        lastFrameTime = now;
        
        camera_fb_t *fb = esp_camera_fb_get();
        if (!fb) {
            Serial.println("[Camera] 获取帧失败");
            delay(10);
            continue;  // 重试而不是退出
        }
        
        // 构建完整帧头
        int headerLen = snprintf(frameHeader, sizeof(frameHeader), 
            "%s%u%s", boundary, fb->len, headerEnd);
        
        // 丢帧保实时：缓冲不够（包括 0）就直接丢帧，避免阻塞写
        size_t need = headerLen + fb->len + 2;
        int canWrite = client.availableForWrite();
        if ((size_t)canWrite < need) {
            esp_camera_fb_return(fb);
            delay(1);  // 让出 CPU，别忙等
            continue;
        }
        
        // 一次性发送帧头 + 数据 + 帧尾
        size_t totalLen = headerLen + fb->len + 2;
        
        // 发送帧头
        if (client.write((uint8_t*)frameHeader, headerLen) != headerLen) {
            esp_camera_fb_return(fb);
            break;
        }
        
        // 发送 JPEG 数据
        if (client.write(fb->buf, fb->len) != fb->len) {
            esp_camera_fb_return(fb);
            break;
        }
        
        // 发送帧尾
        client.write((uint8_t*)frameEnd, 2);
        
        esp_camera_fb_return(fb);
        
        // 无额外 delay，让帧率由摄像头决定
    }
    
    // 解锁摄像头
    unlockCamMode();
    Serial.println("[Camera] 视频流结束");
}

// 摄像头状态
void handleCameraStatus() {
    String json = "{";
    json += "\"initialized\":" + String(cameraInitialized ? "true" : "false") + ",";
    json += "\"model\":\"" + cameraModel + "\",";
    json += "\"visionEnabled\":" + String(visionEnabled ? "true" : "false") + ",";
    
    if (cameraInitialized) {
        sensor_t *s = esp_camera_sensor_get();
        if (s) {
            json += "\"framesize\":" + String(s->status.framesize) + ",";
            json += "\"quality\":" + String(s->status.quality) + ",";
            json += "\"brightness\":" + String(s->status.brightness) + ",";
            json += "\"contrast\":" + String(s->status.contrast);
        }
    }
    json += "}";
    
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.send(200, "application/json", json);
}

// 视觉识别开关控制
void handleVisionControl() {
    String action = server.arg("action");
    
    if (action == "start") {
        if (!cameraInitialized) {
            server.send(503, "text/plain", "摄像头未初始化");
            return;
        }
        visionEnabled = true;
        setCameraResolution(FRAMESIZE_VGA);  // 识别用VGA
        Serial.println("[Vision] 视觉识别已启动");
        server.send(200, "text/plain", "视觉识别已启动");
    } else if (action == "stop") {
        visionEnabled = false;
        setCameraResolution(FRAMESIZE_QVGA);  // 切回预览
        Serial.println("[Vision] 视觉识别已停止");
        server.send(200, "text/plain", "视觉识别已停止");
    } else {
        server.send(200, "application/json", 
            "{\"enabled\":" + String(visionEnabled ? "true" : "false") + "}");
    }
}

// 发送帧到后端进行识别
void sendFrameToBackend() {
    if (!staConnected || !cameraInitialized) return;
    
    camera_fb_t *fb = esp_camera_fb_get();
    if (!fb) {
        Serial.println("[Vision] 获取帧失败");
        return;
    }
    
    HTTPClient http;
    String url = "http://" + String(SIMO_BACKEND_IP) + ":" + String(SIMO_BACKEND_PORT) + "/api/vision/frame";
    
    http.begin(url);
    http.addHeader("Content-Type", "image/jpeg");
    http.addHeader("X-Device-MAC", WiFi.macAddress());
    
    int httpCode = http.POST(fb->buf, fb->len);
    
    if (httpCode == 200) {
        String response = http.getString();
        Serial.printf("[Vision] 识别结果: %s\n", response.c_str());
        
        // 解析识别结果并执行动作
        if (response.indexOf("\"action\":\"follow\"") >= 0) {
            // 跟随模式：根据人脸位置调整方向
            if (response.indexOf("\"direction\":\"left\"") >= 0) {
                sendToSTM32("L", 100, 200);
            } else if (response.indexOf("\"direction\":\"right\"") >= 0) {
                sendToSTM32("R", 100, 200);
            } else if (response.indexOf("\"direction\":\"forward\"") >= 0) {
                sendToSTM32("F", 100, 300);
            }
        } else if (response.indexOf("\"action\":\"stop\"") >= 0) {
            sendToSTM32("S");
        }
    } else if (httpCode > 0) {
        Serial.printf("[Vision] HTTP错误: %d\n", httpCode);
    } else {
        Serial.printf("[Vision] 连接失败: %s\n", http.errorToString(httpCode).c_str());
    }
    
    http.end();
    esp_camera_fb_return(fb);
}

// ============ 本地人脸检测 API ============

// 本地人脸检测接口（静态缓冲区）
static char faceDetectJsonBuf[1024];

void handleFaceDetect() {
    if (!cameraInitialized) {
        server.send(503, "application/json", "{\"error\":\"Camera not initialized\"}");
        return;
    }
    
    if (!faceDetectEnabled) {
        server.send(400, "application/json", "{\"error\":\"Face detection not enabled\"}");
        return;
    }
    
    // 确保在检测模式
    if (currentCamMode != CAM_DETECT) {
        server.send(400, "application/json", "{\"error\":\"Camera not in detect mode\"}");
        return;
    }
    
    // 获取一帧
    camera_fb_t *fb = esp_camera_fb_get();
    if (!fb) {
        server.send(500, "application/json", "{\"error\":\"Camera capture failed\"}");
        return;
    }
    
    // 检查帧格式
    if (fb->format != PIXFORMAT_RGB565) {
        esp_camera_fb_return(fb);
        server.send(400, "application/json", "{\"error\":\"Wrong pixel format, need RGB565\"}");
        return;
    }
    
    // 执行本地人脸检测
    FaceDetectResult result = detectFaces(fb);
    esp_camera_fb_return(fb);
    
    // 计算跟随方向
    FollowResult follow = calculateFollowDirection(result);
    
    // 使用静态缓冲区构建 JSON（避免 String 拼接）
    snprintf(faceDetectJsonBuf, sizeof(faceDetectJsonBuf),
        "{\"face\":%s,\"follow\":%s}",
        faceResultToJson(result).c_str(),
        followResultToJson(follow).c_str());
    
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.send(200, "application/json", faceDetectJsonBuf);
    
    Serial.printf("[FaceDetect] 检测完成: detected=%d, dir=%s, time=%dms\n", 
        result.detected, getDirectionName(follow.direction), result.detectTime);
}

// 人脸检测状态接口（静态缓冲区）
static char faceStatusJsonBuf[1024];

void handleFaceStatus() {
    snprintf(faceStatusJsonBuf, sizeof(faceStatusJsonBuf),
        "{\"enabled\":%s,\"cameraReady\":%s,\"camMode\":%d,\"lastDetectTime\":%lu,\"lastResult\":%s,\"lastFollow\":%s}",
        faceDetectEnabled ? "true" : "false",
        cameraInitialized ? "true" : "false",
        (int)currentCamMode,
        lastFaceDetectTime,
        faceResultToJson(lastFaceResult).c_str(),
        followResultToJson(lastFollowResult).c_str());
    
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.send(200, "application/json", faceStatusJsonBuf);
}

// 人脸跟随循环（在 loop 中调用）
void runFaceFollowLoop() {
    if (!faceDetectEnabled || !cameraInitialized) return;
    if (currentMode != MODE_FOLLOW) return;
    if (currentCamMode != CAM_DETECT) return;  // 必须在检测模式
    
    // 检查检测间隔
    if (millis() - lastFaceDetectTime < FACE_DETECT_INTERVAL) return;
    
    // 获取一帧
    camera_fb_t *fb = esp_camera_fb_get();
    if (!fb) return;
    
    // 检查帧格式
    if (fb->format != PIXFORMAT_RGB565) {
        esp_camera_fb_return(fb);
        return;
    }
    
    // 执行本地人脸检测
    FaceDetectResult result = detectFaces(fb);
    esp_camera_fb_return(fb);
    
    if (!result.detected) {
        // 未检测到人脸，停止
        if (millis() - lastFaceDetectTime > 2000) {
            // 超过2秒没检测到，停止移动
            sendToSTM32("S");
        }
        return;
    }
    
    // 计算跟随方向
    FollowResult follow = calculateFollowDirection(result);
    
    if (!follow.shouldMove) return;
    
    // 根据方向发送指令
    switch (follow.direction) {
        case DIR_LEFT:
            sendToSTM32("L", 100, 200);
            Serial.println("[FaceFollow] 左转跟随");
            break;
        case DIR_RIGHT:
            sendToSTM32("R", 100, 200);
            Serial.println("[FaceFollow] 右转跟随");
            break;
        case DIR_FORWARD:
            sendToSTM32("F", 100, 300);
            Serial.println("[FaceFollow] 前进靠近");
            break;
        case DIR_BACKWARD:
            sendToSTM32("B", 100, 200);
            Serial.println("[FaceFollow] 后退");
            break;
        default:
            break;
    }
}

// ============ 初始化 ============
void setup() {
    // 调试串口
    Serial.begin(115200);
    delay(1000);
    
    Serial.println();
    Serial.println("================================");
    Serial.println("   Simo ESP32-S3 v" FIRMWARE_VERSION);
    Serial.println("================================");
    
    // Phase 0: 硬件自检
    Serial.println("[Phase 0] 硬件自检...");
    Serial.printf("  芯片: %s\n", ESP.getChipModel());
    Serial.printf("  Flash: %dMB, PSRAM: %dMB\n", 
        ESP.getFlashChipSize() / 1024 / 1024,
        ESP.getPsramSize() / 1024 / 1024);
    Serial.printf("  堆内存: %lu bytes\n", ESP.getFreeHeap());
    
    // LED
    pinMode(LED_PIN, OUTPUT);
    digitalWrite(LED_PIN, HIGH);  // 自检中：LED亮
    
    // STM32 串口
    stm32Serial.begin(STM32_BAUD, SERIAL_8N1, STM32_RX, STM32_TX);
    Serial.printf("  STM32串口: TX=%d, RX=%d\n", STM32_TX, STM32_RX);
    
    // 摄像头初始化
    Serial.println("  摄像头初始化...");
    camera_config_t cameraConfig = getCameraConfig();
    esp_err_t err = esp_camera_init(&cameraConfig);
    if (err != ESP_OK) {
        Serial.printf("  ❌ 摄像头初始化失败: 0x%x\n", err);
        cameraInitialized = false;
    } else {
        cameraInitialized = true;
        sensor_t *s = esp_camera_sensor_get();
        if (s) {
            // 获取摄像头型号
            switch (s->id.PID) {
                case OV3660_PID: cameraModel = "OV3660"; break;
                case OV2640_PID: cameraModel = "OV2640"; break;
                case OV5640_PID: cameraModel = "OV5640"; break;
                default: cameraModel = "Unknown"; break;
            }
            Serial.printf("  ✅ 摄像头: %s\n", cameraModel.c_str());
            
            // 图像质量优化
            s->set_brightness(s, 0);     // 亮度 -2~2
            s->set_contrast(s, 0);       // 对比度 -2~2
            s->set_saturation(s, 0);     // 饱和度 -2~2
            s->set_whitebal(s, 1);       // 白平衡开启
            s->set_awb_gain(s, 1);       // 自动白平衡增益
            s->set_wb_mode(s, 0);        // 白平衡模式 0-4
            s->set_aec2(s, 1);           // 自动曝光
            s->set_gain_ctrl(s, 1);      // 自动增益
        }
    }
    
    // Phase 1: 网络连接
    Serial.println("[Phase 1] 网络连接...");
    
    // 加载已保存的WiFi凭证
    loadWiFiCredentials();
    
    // 启动AP模式（始终可用于配网和控制）
    WiFi.mode(WIFI_AP_STA);
    WiFi.softAP(AP_SSID, AP_PASSWORD);
    
    // 关闭 WiFi 省电模式，减少视频流延迟
    WiFi.setSleep(false);
    esp_wifi_set_ps(WIFI_PS_NONE);
    WiFi.setTxPower(WIFI_POWER_19_5dBm);  // 最大发射功率
    Serial.println("  WiFi 省电已关闭，发射功率已最大");
    
    IPAddress apIP = WiFi.softAPIP();
    Serial.printf("  AP热点: %s (%s)\n", AP_SSID, apIP.toString().c_str());
    
    // 尝试连接WiFi（优先使用NVS保存的，其次使用硬编码的）
    if (savedSSID.length() > 0) {
        tryConnectSavedWiFi();
    } else if (strlen(STA_SSID) > 0) {
        // 使用硬编码的WiFi配置
        Serial.printf("[WiFi] 尝试连接硬编码WiFi: %s\n", STA_SSID);
        WiFi.begin(STA_SSID, STA_PASSWORD);
        
        int retry = 0;
        while (WiFi.status() != WL_CONNECTED && retry < 20) {
            delay(500);
            Serial.print(".");
            retry++;
        }
        
        if (WiFi.status() == WL_CONNECTED) {
            staConnected = true;
            homeIP = WiFi.localIP().toString();
            Serial.printf("\n[WiFi] 已连接家庭网络: %s\n", homeIP.c_str());
        } else {
            Serial.println("\n[WiFi] 家庭网络连接失败");
        }
    }
    
    // Phase 2: 服务启动
    Serial.println("[Phase 2] 服务启动...");
    
    // Web 服务器路由
    server.on("/", handleRoot);
    server.on("/cmd", handleCmd);
    server.on("/status", handleStatus);
    server.on("/ping", handlePing);
    server.on("/info", handleInfo);
    server.on("/voice", handleVoice);
    server.on("/mode", handleMode);
    server.on("/ota", handleOTA);
    server.on("/update", HTTP_POST, handleUpdate, handleUpdateUpload);
    
    // WiFi配置路由
    server.on("/wifi", handleWiFiSetup);
    server.on("/wifi/scan", handleWiFiScan);
    server.on("/wifi/save", HTTP_POST, handleWiFiSave);
    server.on("/wifi/clear", handleWiFiClear);
    
    // OTA路由
    server.on("/ota/status", handleOTAStatus);
    server.on("/ota/check", handleOTACheck);
    
    // 摄像头路由
    server.on("/camera/capture", handleCameraCapture);
    server.on("/camera/stream", handleCameraStream);
    server.on("/camera/status", handleCameraStatus);
    server.on("/vision/control", handleVisionControl);  // 视觉识别开关
    
    // 本地人脸检测路由
    server.on("/face/detect", handleFaceDetect);   // 执行一次人脸检测
    server.on("/face/status", handleFaceStatus);   // 人脸检测状态
    server.on("/face/enable", []() {
        if (!cameraInitialized) {
            server.send(503, "text/plain", "Camera not ready");
            return;
        }
        if (!ensureCamMode(CAM_DETECT)) {
            server.send(503, "text/plain", "Camera busy (streaming?)");
            return;
        }
        faceDetectEnabled = true;
        initFaceDetect();
        server.send(200, "text/plain", "Face detection enabled (RGB565 160x120)");
        Serial.println("[FaceDetect] 人脸检测已启用");
    });
    server.on("/face/disable", []() {
        faceDetectEnabled = false;
        ensureCamMode(CAM_IDLE);
        server.send(200, "text/plain", "Face detection disabled");
        Serial.println("[FaceDetect] 人脸检测已禁用");
    });
    
    server.begin();
    
    // 启动时向Node后端注册并检查OTA更新
    if (staConnected) {
        registerToBackend();
        checkOTAUpdate();
    }
    
    // Phase 3: 就绪
    Serial.println("[Phase 3] 系统就绪");
    Serial.println("================================");
    Serial.printf("控制面板: http://%s\n", apIP.toString().c_str());
    Serial.printf("WiFi配置: http://%s/wifi\n", apIP.toString().c_str());
    if (staConnected) {
        Serial.printf("局域网访问: http://%s\n", homeIP.c_str());
    }
    Serial.println("================================");
    
    digitalWrite(LED_PIN, LOW);  // 就绪：LED灭
}

// 解析STM32传感器响应
// 新格式: SENSOR,D<dist>,OL<l>OR<r>,TL<l>TR<r>
void parseSensorResponse(String& resp) {
    // 距离: D<value>
    int dIdx = resp.indexOf('D');
    if (dIdx >= 0) {
        int comma = resp.indexOf(',', dIdx);
        if (comma < 0) comma = resp.length();
        lastDistance = resp.substring(dIdx + 1, comma).toInt();
    }
    
    // 红外避障: OL<0/1>OR<0/1>
    int olIdx = resp.indexOf("OL");
    if (olIdx >= 0 && olIdx + 2 < resp.length()) {
        leftIR = resp.charAt(olIdx + 2) == '1';
    }
    int orIdx = resp.indexOf("OR");
    if (orIdx >= 0 && orIdx + 2 < resp.length()) {
        rightIR = resp.charAt(orIdx + 2) == '1';
    }
    
    // 红外循迹: TL<0/1>TR<0/1>
    int tlIdx = resp.indexOf("TL");
    if (tlIdx >= 0 && tlIdx + 2 < resp.length()) {
        leftTrack = resp.charAt(tlIdx + 2) == '1';
    }
    int trIdx = resp.indexOf("TR");
    if (trIdx >= 0 && trIdx + 2 < resp.length()) {
        rightTrack = resp.charAt(trIdx + 2) == '1';
    }
    
    // 兼容旧格式: SENSOR,D123,L0R1
    if (olIdx < 0) {
        int lIdx = resp.indexOf('L');
        if (lIdx >= 0 && lIdx + 1 < resp.length() && resp.charAt(lIdx + 1) != 'O') {
            leftIR = resp.charAt(lIdx + 1) == '1';
        }
        int rIdx = resp.indexOf('R');
        if (rIdx >= 0 && rIdx + 1 < resp.length() && resp.charAt(rIdx + 1) != 'O') {
            rightIR = resp.charAt(rIdx + 1) == '1';
        }
    }
}

// ============ 主循环 ============
void loop() {
    server.handleClient();
    
    // LED 心跳（连接STM32时快闪，否则慢闪）
    static unsigned long lastBlink = 0;
    int blinkInterval = stm32Connected ? 500 : 2000;
    if (millis() - lastBlink >= blinkInterval) {
        lastBlink = millis();
        digitalWrite(LED_PIN, !digitalRead(LED_PIN));
    }
    
    // 定期PING STM32检查连接状态
    if (millis() - lastStm32Ping >= 5000) {
        lastStm32Ping = millis();
        stm32Serial.print("PING\n");
        
        unsigned long start = millis();
        while (!stm32Serial.available() && millis() - start < 200) {
            delay(10);
        }
        
        if (stm32Serial.available()) {
            String resp = stm32Serial.readStringUntil('\n');
            stm32Connected = (resp.indexOf("PONG") >= 0);
            if (stm32Connected) {
                Serial.println("[STM32] 连接正常");
            }
        } else {
            stm32Connected = false;
        }
    }
    
    // 定期读取传感器数据
    if (stm32Connected && millis() - lastSensorRead >= 1000) {
        lastSensorRead = millis();
        stm32Serial.print("SENSOR\n");
        
        unsigned long start = millis();
        while (!stm32Serial.available() && millis() - start < 100) {
            delay(10);
        }
        
        if (stm32Serial.available()) {
            String resp = stm32Serial.readStringUntil('\n');
            parseSensorResponse(resp);
        }
    }
    
    // 读取 STM32 主动发送的数据
    while (stm32Serial.available()) {
        String line = stm32Serial.readStringUntil('\n');
        Serial.printf("[<-STM32] %s\n", line.c_str());
        
        // 解析响应
        if (line.startsWith("SENSOR")) {
            parseSensorResponse(line);
        } else if (line.indexOf("PONG") >= 0) {
            stm32Connected = true;
        }
    }
    
    // 定期向Node后端注册心跳（每60秒）
    static unsigned long lastRegister = 0;
    if (staConnected && millis() - lastRegister >= 60000) {
        lastRegister = millis();
        registerToBackend();
    }
    
    // 视觉识别：定期发送帧到后端
    if (visionEnabled && millis() - lastVisionFrame >= VISION_INTERVAL) {
        lastVisionFrame = millis();
        sendFrameToBackend();
    }
    
    // 自主导航逻辑
    runAutonomousLogic();
}

// ============ 自主导航逻辑 ============
void runAutonomousLogic() {
    if (!stm32Connected) return;  // 未连接STM32时不执行
    
    unsigned long now = millis();
    
    switch (currentMode) {
        case MODE_PATROL:
            // 简单巡逻逻辑：前进→检测障碍→转向→继续
            if (now - lastPatrolAction >= 500) {
                lastPatrolAction = now;
                
                // 障碍物检测（距离<30cm）- 非阻塞状态机
                if (patrolState == 2) {
                    // 等待停止完成，然后转向
                    if (random(2) == 0) {
                        sendToSTM32("L", 120, 300);
                    } else {
                        sendToSTM32("R", 120, 300);
                    }
                    patrolState = 1;  // 转向中
                } else if (lastDistance > 0 && lastDistance < 30) {
                    // 有障碍，停止（下次循环再转向）
                    sendToSTM32("S");
                    patrolState = 2;  // 等待停止
                    Serial.printf("[PATROL] 障碍物! D=%dcm\n", lastDistance);
                } else if (patrolState == 1) {
                    // 转向完成，继续前进
                    patrolState = 0;
                } else {
                    // 无障碍，前进
                    sendToSTM32("F", 100, 600);
                }
            }
            break;
            
        case MODE_FOLLOW:
            // 跟随模式：本地人脸检测 + 跟随
            runFaceFollowLoop();
            break;
            
        case MODE_RETURN:
            // 返航模式：返回起始点（需要定位模块）
            // TODO: 待定位模块实现
            break;
            
        default:
            break;
    }
}
