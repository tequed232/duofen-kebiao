# 多分课表 v1.0.12 —— 折射回归、状态栏留白、流体云通知、玻璃图标、设置整理

## 1. 底边栏的光影折射回来了

`glass-nav-inner` 里新增独立的**折射层** `.glass-nav-refraction`：使用 SVG 位移滤镜
（`feTurbulence` + `feDisplacementMap`，`filter: url(#liquid-glass-refraction)`）叠加冰彩光晕，
再加上顶部反光条与镜面内描边，恢复 Liquid Glass 的光影折射观感；不支持 SVG 滤镜的老内核自动退化为纯高光。

## 2. 状态栏留白（双保险）

- 原生：insets 不再只做 WebView padding，而是把系统栏高度写入 CSS 变量
  `--native-safe-top` / `--native-safe-bottom`，页面据此留白——无论 ROM 是否先消费 insets 都不会被压住。
- Web：`.stage` 使用 `max(env(safe-area-inset-*), var(--native-safe-*))`，浏览器按刘海安全区，
  APK 按原生实测高度；`.phone` 高度同步扣减。

## 3. 流体云 / Live Updates 真的会弹了

- **启动即申请通知权限**：Android 13+ 缺 `POST_NOTIFICATIONS` 时流体云卡片根本发不出来，现在原生在启动时申请。
- 网页录音开始时通过 JS 桥调用 `DuofenNative.requestPermissions()` 补齐相机/麦克风/通知权限。
- **进度真的在走**：`liveUpdate(title, text, progress)` 现在带进度参数（按录音时长 0→100），
  原生 `LiveUpdates.update(..., progress)` 用 `Notification.ProgressStyle` 渲染流体云进度条。

## 4. APK 图标换成 Liquid Glass 设计

`scripts/make-android-icon.mjs` 改为直接渲染项目的 `GlassMark` 矢量（冰彩渐变圆角方块 + 绿/紫/红玻璃药丸），
生成自适应图标（anydpi-v26）+ mdpi~xxxhdpi 传统图标 + 圆形版；已逐张查看确认。

## 5. 设置页控件整理

去掉全部 4 个「绝对定位叠在列表行上」的控件（`group-overlay`）：
开关改为放进 `md-list-item` 的 **end 插槽**（M3 官方做法），滑块变成列表项下方的
**独立控制行**（`.list-control-row`，正常文档流）。任何屏幕高度、字号、语言下都不会错位或重叠。

## 一致性与验证

- `npm run apk:parity` → APK 内嵌 **54/54 文件与 `dist/` 逐个 sha256 相同** ✅
- Web 自动化：**91 步全部通过、0 console 错误、0 page error** ✅
