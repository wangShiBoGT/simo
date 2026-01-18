# 🔧 Simo 硬件研究文档集

> **从 L0 纯软件到 L3 智能交互的完整硬件演进路线**
> 
> 本文档集从**顶尖工程师、机械师、工业设计师**视角出发，
> 为 Simo 家用机器人提供可落地的硬件方案。

---

## 📋 文档索引

| 文档 | 内容 | 状态 |
|------|------|------|
| [01-hardware-levels.md](./01-hardware-levels.md) | 硬件等级定义（L0→L3） | ✅ |
| [02-compute-platform.md](./02-compute-platform.md) | 计算平台选型（ITX/x86 vs Jetson vs 树莓派） | ✅ |
| [03-power-system.md](./03-power-system.md) | 供电系统设计 | ✅ |
| [04-motion-system.md](./04-motion-system.md) | 运动系统（底盘、舵机、电机） | ✅ |
| [05-sensor-system.md](./05-sensor-system.md) | 传感器系统 | ✅ |
| [06-assembly-guide.md](./06-assembly-guide.md) | 装配指南（接线、固定、散热） | ✅ |
| [07-software-integration.md](./07-software-integration.md) | 软硬件集成 | ✅ |
| [08-l3-upgrade-roadmap.md](./08-l3-upgrade-roadmap.md) | **L3 升级路线：完整家用机器人方案** | ✅ |
| [09-purchase-guide.md](./09-purchase-guide.md) | **采购指南：闲鱼/淘宝实战模板** | ✅ |
| [10-feasibility-analysis.md](./10-feasibility-analysis.md) | **可行性分析：预算+技能+风险评估** | ✅ |
| [11-risk-mitigation.md](./11-risk-mitigation.md) | **防踩坑指南：分步验证+止损策略** | ✅ |
| [12-compatibility-matrix.md](./12-compatibility-matrix.md) | **兼容性矩阵：模块间接口关系** | ✅ |
| [13-action-checklist.md](./13-action-checklist.md) | **行动清单：从现在到成功的每一步** | ✅ |

---

## 🎯 核心设计原则

### 1. 稳定优先

> **家用机器人不是极客玩具，是"家庭成员"。**

- 7×24 小时无人值守运行
- 断电来电自动恢复
- 程序崩溃自动重启
- 可维护、可升级

### 2. 渐进演进

```
L0 纯软件（当前）
│   └── 屏幕 + 语音
│
L1 定点存在
│   └── 外接屏幕 + 可移动底座（不自主移动）
│
L2 简单移动 ← 当前进度
│   └── 跟随 + 避障 + 房间级移动
│   └── ✅ STM32 智能小车已完成
│   └── ✅ 自主避障已完成
│
L3 智能交互
    └── 情感表达 + 主动行为 + 空间记忆
```

### 3. 分层解耦

```
┌─────────────────────────────────────┐
│  应用层：Simo 人格、对话、记忆       │
├─────────────────────────────────────┤
│  服务层：Node.js 后端               │
├─────────────────────────────────────┤
│  驱动层：串口通信、传感器解析        │
├─────────────────────────────────────┤
│  硬件层：STM32 + 电机 + 传感器       │
└─────────────────────────────────────┘
```

---

## 🏗️ 当前硬件架构（L2）

```
[浏览器/平板/手机]
        │ HTTP/WebSocket
        ↓
[ITX/x86 主机] ← 计算核心
        │ USB 串口
        ↓
[STM32 控制板] ← 实时控制
        │
   ┌────┼────┬────┬────┐
   ↓    ↓    ↓    ↓    ↓
 电机  舵机  超声波  红外  蜂鸣器
```

---

## 📊 硬件清单（L2 阶段）

| 类别 | 组件 | 型号/规格 | 数量 | 状态 |
|------|------|-----------|------|------|
| **计算** | 主控板 | STM32F103C8T6 | 1 | ✅ |
| **计算** | 上位机 | ITX/x86 或笔记本 | 1 | 规划中 |
| **运动** | 直流电机 | TT马达 | 4 | ✅ |
| **运动** | 电机驱动 | L298N | 1 | ✅ |
| **运动** | 舵机 | SG90 | 1 | ✅ |
| **传感器** | 超声波 | HC-SR04 | 1 | ✅ |
| **传感器** | 红外避障 | 双路 | 1 | ✅ |
| **电源** | 电池盒 | 18650×2 | 1 | ✅ |
| **通信** | USB转串口 | CH340 | 1 | ✅ |

---

## 🔗 相关文档

- [../stm32-serial-protocol.md](../stm32-serial-protocol.md) - 串口通信协议
- [../sensor-protocol.md](../sensor-protocol.md) - 传感器协议
- [../stm32-capability-whitelist.md](../stm32-capability-whitelist.md) - STM32 能力白名单
- [../INVARIANTS.md](../INVARIANTS.md) - 系统不变量

---

**文档版本**: v1.0  
**更新日期**: 2026-01-18  
**维护者**: Simo Team
