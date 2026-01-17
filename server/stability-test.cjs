/**
 * STM32 稳定性测试脚本
 * 测试序列：前进800ms → 停 → 后退800ms
 * 目标：100次连续执行，0次失败
 */

const { SerialPort } = require('serialport');

const PORT = 'COM5';
const BAUD = 115200;
const TOTAL_TESTS = 100;
const TIMEOUT_MS = 5000;  // 单次命令超时

let port;
let testCount = 0;
let successCount = 0;
let failCount = 0;
let currentStep = 0;  // 0=PING, 1=F, 2=S, 3=B
let stepTimeout;

const steps = [
    { cmd: 'F,800\r\n', expect: 'OK,F', name: '前进' },
    { cmd: 'S\r\n', expect: 'OK,S', name: '停止' },
    { cmd: 'B,800\r\n', expect: 'OK,B', name: '后退' }
];

function log(msg) {
    const time = new Date().toLocaleTimeString();
    console.log(`[${time}] ${msg}`);
}

function sendCommand(cmd) {
    port.write(cmd);
    stepTimeout = setTimeout(() => {
        log(`❌ 超时: ${cmd.trim()}`);
        failCount++;
        nextTest();
    }, TIMEOUT_MS);
}

function nextStep() {
    if (currentStep >= steps.length) {
        // 本轮测试完成
        successCount++;
        log(`✅ 第 ${testCount}/${TOTAL_TESTS} 轮完成`);
        nextTest();
        return;
    }
    
    const step = steps[currentStep];
    sendCommand(step.cmd);
}

function nextTest() {
    currentStep = 0;
    testCount++;
    
    if (testCount > TOTAL_TESTS) {
        // 全部测试完成
        log('');
        log('========================================');
        log(`测试完成！总计 ${TOTAL_TESTS} 轮`);
        log(`成功: ${successCount}`);
        log(`失败: ${failCount}`);
        log(`成功率: ${(successCount / TOTAL_TESTS * 100).toFixed(1)}%`);
        log('========================================');
        
        if (failCount === 0) {
            log('🎉 100% 通过！可以进入下一阶段');
        } else {
            log('⚠️ 存在失败，需要排查问题');
        }
        
        port.close();
        process.exit(failCount > 0 ? 1 : 0);
        return;
    }
    
    // 等待一小段时间再开始下一轮
    setTimeout(() => {
        log(`--- 第 ${testCount}/${TOTAL_TESTS} 轮 ---`);
        nextStep();
    }, 500);
}

// 主程序
port = new SerialPort({ path: PORT, baudRate: BAUD });

port.on('open', () => {
    log(`串口 ${PORT} 已打开`);
    log(`开始 ${TOTAL_TESTS} 轮稳定性测试...`);
    log('测试序列: 前进800ms → 停止 → 后退800ms');
    log('');
    
    // 先发送 PING 确认连接
    setTimeout(() => {
        port.write('PING\r\n');
    }, 1000);
});

port.on('data', (data) => {
    const response = data.toString().trim();
    if (!response) return;
    
    clearTimeout(stepTimeout);
    
    // 处理 PING 响应
    if (response.includes('PONG')) {
        log('💓 心跳正常，开始测试');
        nextTest();
        return;
    }
    
    // 处理启动信息
    if (response.includes('Simo Ready')) {
        log('📡 STM32 已就绪');
        return;
    }
    
    // 检查当前步骤的响应
    if (currentStep < steps.length) {
        const step = steps[currentStep];
        if (response.includes(step.expect)) {
            currentStep++;
            // 等待动作完成后再发下一条
            const waitTime = step.name === '停止' ? 100 : 1000;
            setTimeout(nextStep, waitTime);
        } else if (response.includes('ERR')) {
            log(`❌ 错误响应: ${response}`);
            failCount++;
            nextTest();
        }
    }
});

port.on('error', (err) => {
    log(`串口错误: ${err.message}`);
    process.exit(1);
});
