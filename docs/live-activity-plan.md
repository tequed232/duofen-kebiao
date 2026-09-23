# 灵动岛 / 实况通知：现状、Cloudflare 能插在哪、两条路线

> 背景：作者与维舟讨论「多设备多系统都能用的灵动岛」。本文件是决策简报 + 落地清单。
> 相关代码：原生 `app/src/main/java/com/app/m3expressive/LiveUpdates.kt`、网页 `web/src/lib/classReminder.ts`

## 一、先把话说清楚：灵动岛**不在服务器上**

| 事实 | 说明 |
| --- | --- |
| 灵动岛 / 流体云 / Live Updates 的**渲染** | 由**设备操作系统**完成，输入是**本机发出的通知**（Android 16 `Notification.ProgressStyle` + `setRequestPromotedOngoing(true)`；iOS 是 ActivityKit 的 Live Activity） |
| 服务器能做的 | 只有**触发/更新**（推送）。它无法"渲染"灵动岛，也无法替代本机发通知 |
| 因此 | Cloudflare 不是"挂着灵动岛的地方"，它最多是**一个远程触发器** |

## 二、当前实现的真实缺口

| 项 | 现状 |
| --- | --- |
| 通知本体 | ✅ 已经是**原生标准接口**（Android 16 Live Updates，反射兼容旧版；ColorOS 16 上呈流体云） |
| 触发时机 | ❌ **靠网页里的 JS 循环**（`classReminder.ts` 每 30 秒检查一次）—— 页面存活才跑，退到后台会被系统节流，**关掉应用就完全不会提醒** |
| 宿主能力 | ❌ 没有任何 `AlarmManager` / `WorkManager` / `JobScheduler` / `BOOT_COMPLETED` —— **缺的正是"到点把自己叫醒"这一层** |
| 服务端 | 无（也不需要：课表本来就在本机） |

> 维舟说的「你现在的问题是没有接口，而且应用不好发出通知」，**通知能发（已经发了），问题是"到点叫醒"** —— 这是宿主缺调度能力，不是缺后端。

## 三、两条路线

### 路线 A：纯本地调度（推荐，先做这条）

在 Android 宿主里补一层定时：

- `AlarmManager` + `BroadcastReceiver`：按本机课表把「下一节课 - 提前量」排成系统闹钟
- `BOOT_COMPLETED` 广播：开机/重启后重排（否则重启即失效）
- 精确性：`setExactAndAllowWhileIdle` + `SCHEDULE_EXACT_ALARM`（Android 12+ 需要用户授权；不用精确闹钟则可能晚几分钟）
- 可选加固：`REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`、引导用户开「自启动」（ColorOS 对后台较激进）
- iOS：同一套思路要另写宿主（Swift + ActivityKit + `UNUserNotificationCenter`）

**优点**：无服务端、无隐私外传、离线可用、任何 Android 16 设备都成立（**这正是"用原生接口、多设备多系统"的落点**）。
**代价**：被系统"强行停止"或极端省电策略下仍可能错过；iOS 需要另一份宿主。

### 路线 B：Cloudflare Worker 当远程触发器（按需，不是必须）

只有在**触发源必须在设备之外**时才需要：

| 场景 | 为什么需要 Worker |
| --- | --- |
| iOS Live Activity 的**远程更新** | ActivityKit 的远程更新只能走 APNs，需要服务端持有 token 并推送 |
| 网页版的关页提醒 | Web Push（VAPID），页面关掉也能收到 |
| 多设备同步课表 | Worker + KV/Durable Objects 做同步（**可选**，与提醒无关） |

事实澄清（与维舟的建议略有出入，供讨论）：

- **不需要买域名**：Worker 默认给 `xxx.workers.dev` 就能被应用直接调用；买 `.xyz` 只是想要自定义域名/好看。
- **免费额度足够**：Worker 免费档每天 10 万次请求，个人课表提醒的调用量差好几个数量级。
- **教材/课表不必上云**：作者担心的"上传再下发绕弯子"是对的。Worker 只需要存**最小触发信息**（例如"下次提醒时间 + 标题 + 教室"），教材图片、完整课表继续留在本机。

## 四、建议的推进顺序

1. **先做路线 A**（宿主加 `AlarmManager` 调度）—— 补上唯一真正缺的能力，零服务端、零隐私成本，立刻可验证（关掉应用也能到点弹流体云）。
2. 若确认要覆盖 **iOS**：再引入路线 B 的 Worker + APNs（那时域名与推送证书才真正需要）。
3. 若要在 **ColorOS 上做更深的自定义**（流体云的专属卡片样式）：走 OPPO 侧对接（维舟说的"用 OPPO 那边联系"），但**Android 16 标准 Live Updates 已经能覆盖大部分观感**，优先级低于 1。

## 五、"要不要改成原生应用"这件事

维舟提到「搞成原生应用，就不用 WebView 了」。就**这个功能**而言不必要：

- 通知与灵动岛**已经是原生代码在发**（`LiveUpdates.kt` 在宿主里），与界面是不是 WebView 无关；
- 缺的只是**调度层**（路线 A），加在宿主里即可，界面零改动；
- 把整套 UI 重写成原生，成本是几周量级，换来的是同一张通知卡片 —— 收益与成本不成比例。真要重写，理由应该是别的（性能、上架政策），不是灵动岛。

## 六、落地清单（路线 A 的具体改动）

| 改动 | 位置 |
| --- | --- |
| 新增 `ReminderScheduler.kt`：读写"下一节课"，注册/取消精确闹钟 | `app/src/main/java/com/app/m3expressive/` |
| 新增 `ReminderReceiver.kt`：到点调用现有 `LiveUpdates.classReminder(...)` | 同上 |
| 清单加权限：`SCHEDULE_EXACT_ALARM`（可选用 `USE_EXACT_ALARM`）、`RECEIVE_BOOT_COMPLETED` | `AndroidManifest.xml` |
| 网页侧：课表变化时把"下一节课"经 `DuofenNative` 桥交给宿主排程（替换现在的 30 秒 JS 轮询） | `web/src/lib/classReminder.ts`、`native.ts` |
| 首次运行时申请精确闹钟权限 + 说明文案 | 设置页「上课提醒」 |
