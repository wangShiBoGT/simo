# 🧱 Simo · 代码级不变量（Invariant Checklist）

> **版本**：V1  
> **适用范围**：L2.6 及以上  
> **性质**：任何违反即视为 **Bug / 设计错误**  
> **目标**：让"行为宣言"在代码层 **无法被悄悄破坏**

---

## I. 控制权不变量（Authority Invariants）

### INV-001：AI 永远没有执行权

**规则**

* ❌ 任何 AI 输出 **不得直接调用**：
  * `hardware.*`
  * `serial.send`
  * `executeIntent`
* ✅ AI 输出只能是：
  * Intent 对象
  * 或自然语言回复

**代码检查点**

```txt
LLM 相关模块中：
- 不允许 import hardware
- 不允许 import serial
- 不允许出现 F,/B,/L,/R,/S 命令
```

---

### INV-002：唯一执行入口

**规则**

* 所有物理动作 **必须** 通过同一函数执行

```js
executeIntent(intent)
```

**禁止**

* 在任何地方直接写串口
* 在 handler 中"顺手执行"

---

## II. STOP 不变量（Safety Invariants）

### INV-101：STOP 永远可抢占

**规则**

* STOP 可以在 **任何状态、任何阶段** 执行
* 包括：moving, confirming, speaking, parsing

**代码要求**

```js
if (intent.intent === 'STOP') {
  cancelConfirm();
  stopNow();
}
```

---

### INV-102：STOP 不需要确认

**规则**

* STOP 永远不进入：
  * Guard 拒绝
  * Confirmation Layer

---

## III. 不确定性不变量（Uncertainty Invariants）

### INV-201：不确定即不执行

**规则**

以下任一条件成立 → **不得执行任何动作**

* `intent.intent === 'NONE'`
* `confidence < 0.8`
* intent 缺字段
* duration 超出白名单

---

### INV-202：默认行为是"什么都不做"

**规则**

* 没匹配规则 / 没进任何分支 → **最终结果必须是 NO-OP**

---

## IV. 白名单不变量（Capability Invariants）

### INV-301：动作白名单不可扩展

**允许**

```
MOVE(F/B)
TURN(L/R)
STOP
```

**禁止**

* FOLLOW
* AVOID
* AUTO
* 任意组合动作

---

### INV-302：参数只能离散取值

**规则**

* duration 只能是：`400 | 800 | 1200`
* PWM 不得由上层传入

---

## V. 状态不变量（State Invariants）

### INV-401：moving 状态下禁止新移动

**规则**

* 当前状态 = moving
* 新 intent ∈ { MOVE, TURN }

👉 **一律拒绝**（唯一例外：STOP）

---

### INV-402：状态必须可解释

**规则**

* 系统必须能回答：
  * 当前是否在动
  * 是否在确认中
  * 是否等待人类输入

---

## VI. 确认层不变量（Confirmation Invariants）

### INV-501：确认是模板，不是对话

**规则**

* 确认文本来自固定模板
* 不得由 LLM 生成

---

### INV-502：确认只绑定一个 pending intent

**规则**

* 一次确认，只对应一个 intent
* 新 intent 不得覆盖 pending

---

### INV-503：确认必须可取消、可超时

**规则**

* 超时 → 自动取消
* 取消 ≠ 执行 STOP
* STOP → 立即终止确认

---

## VII. 时间不变量（Temporal Invariants）

### INV-601：所有动作必须自终止

**规则**

* move / turn 内部必须在 ms 到期后调用 `stop_now()`

**禁止**

* "一直走，直到下一条命令"

---

### INV-602：单次动作时间上限

**规则**

* `duration_ms ≤ 3000`

---

## VIII. 可测试性不变量（Testability Invariants）

### INV-701：所有行为可回放

**规则**

* 每一次执行，必须能在日志中还原：
  * 原始话语
  * Intent
  * 是否确认
  * 最终动作

---

### INV-702：100 次稳定性为硬门槛

**规则**

* 新功能 → 必须通过原有 100 次稳定测试
* 不得降低成功率

---

## IX. 违反即 Bug（Hard Rule）

以下任一情况，**直接视为系统缺陷**：

* AI 直接触发动作
* 模糊话语导致移动
* STOP 延迟 > 100ms
* 执行了未确认的高风险动作
* 代码中出现"临时绕过守卫"

---

## X. 开发者誓言

```txt
我承诺：
- 不绕过 Intent 层
- 不绕过 Guard
- 不绕过 Confirmation
- 不为了"看起来更聪明"牺牲确定性
```
