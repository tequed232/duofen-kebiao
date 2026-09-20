# 多分课表 v1.0.10 —— 状态栏留白

## 修复

- **Android**：Android 15+ 强制 edge-to-edge，之前 WebView 会画到状态栏下面，页面顶部的标题/图标被时间、电量压住。
  现在原生把 **系统栏 + 刘海 insets** 作为 WebView 的内边距（`setOnApplyWindowInsetsListener`），
  并把窗口与 WebView 底色设成应用 surface 色（`#F5FBF6`），留白区域与界面自然衔接；底部手势条同样让出空间。
- **Web**：补上刘海屏安全区 —— `.stage` 使用 `env(safe-area-inset-*)`，`.phone` 高度用
  `100dvh - 安全区` 计算；运行在 APK 里时自动加 `native-shell` 类跳过浏览器安全区，避免与原生 insets 重复留白。
- viewport 早已是 `viewport-fit=cover`，因此 PWA / 微信 / 刘海屏浏览器同样受益。

## 一致性（第一要求，保持）

APK 仍是同一份 Web 构建：`npm run apk:parity` → **54/54 文件 sha256 完全一致** ✅

## 验证

- Web 自动化：91 步全部通过，0 console 错误、0 page error
- 体积：APK 2.81 MB
