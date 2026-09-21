# 灵动岛 / 实况通知：MAA-Meow 方案调研与本项目落地方案

> 调研对象：[Aliothmoon/MAA-Meow](https://github.com/Aliothmoon/MAA-Meow)（《明日方舟》小助手 Android 版）
> 调研方式：GitHub API 读取仓库文件树与关键源码（本环境无法直接抓取 github.com 网页）。
> 目标：搞清楚一个第三方 App 如何让「灵动岛 / 实况通知 / 流体云」显示自己的进度。

## 一、他们的做法：策略路由（Router）+ 按 OEM 分发

文件结构（`app/src/main/java/com/aliothmoon/maameow/data/notification/live/`）：

| 文件 | 作用 |
| --- | --- |
| `LivePublisherRouter.kt` | **路由**：按设备能力选一个真正的发布者；`cancel()` 会把**所有**后端都取消 |
| `AospPromotedPublisher.kt` | **AOSP / Android 16 实况通知**：`factory.build(session, requestPromoted = session.ongoing)` → 即 `setRequestPromotedOngoing(true)`，ColorOS「流体云」走的正是这条路 |
| `HyperOsFocusPublisher.kt` | **小米 HyperOS 焦点通知（灵动岛）**：依赖第三方库 `com.xzakota.hyper.notification`（`FocusNotification`、`island.model.TextInfo`） |
| `PlainNotificationPublisher.kt` | **兜底**：普通通知（没有实况能力时也不会没反馈） |
| `AospPromotedDetector.kt` / `HyperOsFocusDetector.kt` | 能力探测，产出 `LiveCapability(backend, focusLikely, promotedGranted)` |
| `FocusSequenceStore.kt` | 焦点通知的序号/状态管理 |
| `XmsfNetworkGate.kt` | **小米服务框架（XMSF）门闸**：含跨进程 shell 往返 |

关键实现细节（值得抄的工程点）：

1. **统一接口** `LiveUpdatePublisher`：`build / publish / prepareProgress / publishForeground / cancel`，三种后端同构。
2. **能力对象** `LiveCapability`：把「这台机器支持哪种实况」暴露给上层与设置页。
3. **性能**：`HyperOsFocusPublisher` 里注释写明 —— XMSF 往返**含跨进程 shell**，所以发布放在**后台单线程 executor**；并且**缓存 App 图标**（`appIcon: Icon by lazy`），因为进度 1Hz 刷新扛不住每次重新解码位图。
4. **取消要全后端**：`cancel()` 同时清 hyper / aosp / plain。

## 二、对我们（多分课表）意味着什么

| 后端 | 是否适用 | 说明 |
| --- | --- | --- |
| **AOSP promoted（实况通知）** | ✅ **已经在用** | 我们的 `LiveUpdates.kt` 已实现：`ProgressStyle` + `setRequestPromotedOngoing(true)`（反射，兼容旧 API）+ 「确认」动作 + Android 13+ 通知权限。作者的 realme（ColorOS / Android 16）上「流体云」就是这条路径 |
| HyperOS 焦点通知 | ⚠️ 不适用 | 需要小米设备 + 第三方库 + XMSF 跨进程门闸；作者是 realme，且这类 hook 有合规风险，**默认不做** |
| Plain 普通通知 | ✅ 建议补上 | 我们现在失败时是静默；应按 MAA-Meow 的做法**兜底为普通通知**，保证总有反馈 |

**结论：路线本身不需要改（我们走的正是 AOSP promoted 这条正路），要补的是"工程结构"：**

## 三、明天要做的改造（计划）

1. **引入 Router 结构**（`LiveUpdates.kt` 拆成三件套）：
   - `LiveCapability`：检测 `areNotificationsEnabled()` + 是否 API 33+ + 是否有 `setRequestPromotedOngoing` 反射入口 + 当前是否被系统降级；
   - `AospPromotedPublisher`（现有逻辑搬进来）/ `PlainNotificationPublisher`（新增兜底）；
   - `LivePublisherRouter`：探测结果决定用哪个，`stop` 时全部取消。
2. **性能对齐 MAA-Meow**：
   - 进度更新 1Hz 走**后台单线程**（现在是在主线程 `evaluateJavascript` 里直接发）；
   - **缓存 App 图标**（现在每次都重建 `Icon`）。
3. **设置页显示探测结果**：把 `LiveCapability` 回传网页，在「实时通知（流体云）」那一行显示"当前后端：AOSP 实况 / 普通通知"，让作者一眼看出系统有没有给实况。
4. **验收方式**（无需真机也能做一部分）：Web 端不涉及通知；APK 侧用 `adb shell dumpsys notification --noredact | Select-String 多分课表` 检查 `promotedOngoing=true`；真机到手后再看流体云外观。
5. **明确不做**：HyperOS 的 XMSF hook（除非作者另有要求）。

## 四、参考链接

- [Aliothmoon/MAA-Meow](https://github.com/Aliothmoon/MAA-Meow)
- [MAA-Meow Releases](https://github.com/Aliothmoon/MAA-Meow/releases/tag/v0.20.0)
- [FastheDeveloper/LiveActivity](https://github.com/FastheDeveloper/LiveActivity)（Android 实况活动/灵动岛的通用库，可作对照）
