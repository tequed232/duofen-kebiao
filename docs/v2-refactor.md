# 多分课表 v2.0 · 重构总纲

> 依据：`m3e-canvas.json`（新版设计框架）
> 目标：按新框架重构全项目，明确 Apple / 酷安 / ColorOS 的多端差异处理，并遵循 Google 的内存管理体系。

---

## 一、前置问题清单（本次重构必须一并结清的账）

### P0 · 阻塞级

| # | 问题 | 现状 | 处理 |
| --- | --- | --- | --- |
| 1 | **页面存在一层匿名 div 拦截点击** | Web 自动化 91 步中 3 步失败（API 页填写/对话框/返回）；用 JS 直接 click 正常 | 顺着 `elementFromPoint` 定位来源（怀疑是常驻的 `md-dialog`/sheet 容器），彻底移除；恢复 91/91 |
| 2 | **底边栏玻璃只是「模糊 + 动态光层」** | Chromium/WebView 会丢弃 `backdrop-filter: url(#f)`，背景未被真正折射 | v2 按 canvas 要求改为「参照 Apple 官方文档的反射/折射/散射」：玻璃层拆分 + 高光/色散分层 + 指针驱动的动态参数；无法实现真背景折射时明确降级到 M3 原生栏 |
| 3 | **课表导入仍需 AI 导入路径** | 已有 DOC/RTF/HTML/CSV 解析；canvas 要求 **AI 导入**（对话框内与 AI 对话解析课表并写入课表） | 新增「AI 导入」列表项 + 对话式导入对话框，走用户自配的开放平台 API |
| 4 | **搜索页缺少内置地图** | 现在是"点地点→唤起外部地图 App" | 按 canvas：搜索页中部内嵌 **360×188dp / 圆角 20dp** 地图（SDK 加载期显示图标占位），点选地点即筛选 |

### P1 · 体验级

| # | 问题 | 处理 |
| --- | --- | --- |
| 5 | 「已保存」消息条必须带 **撤销** | 设置页与任一 API 调整页保存后弹「已保存」+ 撤销（回退并重新持久化），数秒后自动消失 —— 现有实现已有 undo，需统一到所有保存点 |
| 6 | 底边栏从 4 项改为 **3 项**（首页 / 搜索 / 设置） | 与 canvas 对齐；历史并入首页的搜索/筛选能力 |
| 7 | 保存点分散、状态未集中 | 统一 `saveWithUndo(patch)` 入口，所有写入走它 |
| 8 | 课表容器交互细节 | 左侧早/中/晚时间轴 + 上方并排五天课表 + 选中日期高亮 + 容器内左右滑动切日期、竖向滚动看全天（对齐 canvas `box` 说明） |

### P2 · 工程级

| # | 问题 | 处理 |
| --- | --- | --- |
| 9 | **素材授权待作者回复** | `docs/asset-permissions.md` 台账 + 每周提醒 workflow 已就绪；未获批前不引入任何第三方素材 |
| 10 | 图标资产口径未定 | 已改纯矢量（零 PNG）；若你提供自己的图标，`artwork/app-icon.png` 一键生成全密度 |
| 11 | 3 处遗留待确认 | ①「Gemini 第一章」具体指哪一项 ② MAA-Meow 的具体 UI 参考点 ③ 25 张图片上限是否需要可调 |

---

## 二、新版设计框架（自 `m3e-canvas.json` 提取）

**Frames（5）**：设置 · 课表 · 导入课表 · 搜索 · 启动界面

**组件清单（25 组 / 33 项）**：listItem×12、bottomNav×4、topAppBar×4、snackbar×3、switch×2、
datePicker×2、image、loadingIndicator、text、map、box、textField

**设计令牌**

| 令牌 | 取值 |
| --- | --- |
| 配色种子 | `teal`（动态取色开启） |
| 主题 | 深色为主（`dark: true`，`bothModes: false`）、**高对比度**（contrast: high） |
| 形状 | rounded |
| 字体 | Roboto |
| 强调 | emphasized（M3E 强调体）+ **expressive 动效** |

**关键设计意图（原文要点）**

1. **导入课表**：DOC / EXCEL / HTML 三项点击后**调起系统文件选择器**，按格式转入对应解析流程；
   **AI 导入**点击后弹对话框，在其中与 AI 对话，由 **AI 解析课表内容并导入课表**。
2. **设置**：深色模式开关（立即生效 + 持久化 + 「已保存」+ 撤销）、默认跳转地图（选择列表 → 保存为默认；
   未设置时每次导航前先询问）、关于本软件（跳转 GitHub）。
3. **bottomNav（3 项）**：以 `surfaceContainer` 为底，叠加**参照 Apple 官方文档实现的玻璃质感
   —— 反射、折射、散射与滑动效果**；选中项用 `secondaryContainer`。
4. **搜索页 map**：**360×188dp、圆角 20dp**，位于页面中部；SDK 加载期间在 `surfaceContainerHighest`
   上显示地图图标；点选地点即按该地点筛选。
5. **课表 box**：左侧早/中/晚时间轴，上方并排五天课程并随选中日期高亮，容器内左右滑动切日期、
   竖向滚动查看当天全部课程。

---

## 三、多端差异处理（Apple / 酷安 / ColorOS）

### Apple（HIG 对齐，作为玻璃质感的基准）

| 维度 | 落地 |
| --- | --- |
| 玻璃材质 | 分层：`backdrop blur`（散射）+ 镜面高光条（反射）+ 边缘色散/位移（折射）+ 指针跟随；关闭时自动落回 M3 原生栏 |
| 安全区 | 顶部按真实状态栏（**物理像素 ÷ density**，你机器 128px ≈ 42.7dp）+ 8px；底部 8px |
| 手势 | 系统返回手势 → 先走应用内历史栈（WebView `canGoBack()`），退无可退才退出 |
| 排版 | 尊重系统字号（Dynamic Type 对应 `rem`/`clamp` 缩放），字号放大不破版 |
| 动效 | 弹性曲线 + 可中断；`prefers-reduced-motion` 时降级 |

### 酷安（Coolapk 风格的多端表现）

| 维度 | 落地 |
| --- | --- |
| 高刷新率 | 不禁帧；`perf.ts` 实时测帧，连续掉帧自动降级（关水滴、减弱折射），已实现 |
| 信息密度 | 列表项紧凑、副标题信息完整（导入项显示格式与来源），减少跳转层级 |
| 图片策略 | 本地上限 25 张（已实现），超出从最旧记录起删图、文字保留 |
| 分享/外链 | 外部链接交系统浏览器；GitHub / B 站 / 地图 App 直开 |

### ColorOS（实况通知 / 流体云 / 刷新率）

| 维度 | 落地 |
| --- | --- |
| 实况通知（流体云） | 渠道 `IMPORTANCE_HIGH` + `setRequestPromotedOngoing(true)` + `ProgressStyle` 进度；通知带**直接确认**按钮；设置里可开关 + **发送实况测试**（已实现，v1.0.15 起） |
| 通知权限 | Android 13+ 启动即申请 `POST_NOTIFICATIONS`；被拒时静默降级 |
| 高刷/省电 | 遵循系统刷新率设置；不申请前台服务常驻，录音结束即释放麦克风 |
| 后台限制 | 不依赖后台线程；WebView 暂停时停止 rAF 与音频分析 |

---

## 四、Google 内存管理体系（Android + Web 双侧）

### Android 侧

| 机制 | 落地要求 |
| --- | --- |
| `onTrimMemory(level)` | 在 Activity 中实现，按等级释放：`TRIM_MEMORY_UI_HIDDEN` 停 WebView 定时器/动画；`RUNNING_LOW`/`COMPLETE` 清图片缓存并通知网页清内存副本 |
| `ComponentCallbacks2` | 监听 `onLowMemory()` → 通知网页执行 `pruneToLimit` 并释放 canvas/ImageBitmap |
| WebView 生命周期 | `onPause/onResume` 对应 `webView.onPause()/onResume()`；`onDestroy` 里 `destroy()` 并解绑桥 |
| 大图 | 上传/存储前按清晰度压缩（已有 `prepareImageFile`）；IndexedDB 图片上限 25 张（已实现） |
| 通知 | 录音结束 `LiveUpdates.clear()`，避免常驻通知占内存与耗电 |

### Web 侧

| 机制 | 落地要求 |
| --- | --- |
| 帧预算 | `perf.ts` 帧率监测 → `html[data-perf=low]` 降级（已实现） |
| 图片 | 只保留必要解码结果；列表图使用 `loading="lazy"` + `decoding="async"` |
| 定时器/rAF | 所有循环在不可见时停止（`document.visibilitychange`） |
| 存储 | 图片 25 张上限 + 手动清理入口（已实现）；`navigator.storage.estimate()` 展示占用 |
| 语音 | 录音结束即 `track.stop()` + `AudioContext.close()`（波形图已实现） |

---

## 五、版本与发布

- 版本号统一来源 `web/src/lib/meta.ts` → **`APP_VERSION = 'v2.0.0'`**（APK `versionName=2.0.0`、`versionCode=20000`）
- 发布物：`duofen-kebiao-2.0.0.apk` + `duofen-kebiao-web-2.0.0.zip`
- 每轮必须通过：`npm run check:images`、`node scripts/check-secrets.mjs`、`npm run apk:parity`（54/54 哈希一致）、`node scripts/verify.mjs`（目标 91/91）

## 六、执行顺序（P0 → P1 → P2）

1. 清掉匿名拦截层 → 恢复 91/91（1 轮）
2. 底边栏改 3 项 + 玻璃分层（Apple 式反射/折射/散射/滑动）（1 轮）
3. 导入页：DOC/EXCEL/HTML 系统文件选择 + **AI 导入对话框**（1 轮）
4. 搜索页：内嵌 360×188 地图 + 按地点筛选（1 轮）
5. 设置页重构：saveWithUndo 统一「已保存 + 撤销」，深色模式/地图/关于按 canvas 排布（1 轮）
6. 内存管理双侧接线（`onTrimMemory` 等）＋ 启动界面按 canvas 调整（1 轮）
7. 全量回归：91 步 + 视觉逐屏 + 发布 v2.0.0
