# 多分课表 v1.0.7 —— APK 与网页一致（含图标修复）

**APK 里跑的就是网站本身**：同一个 Web 构建（`dist/`，55 个文件）打进包内用 WebView 加载，
构建时自动同步，`npm run apk:parity` 逐文件比对（文件名 + sha256），本次结果 **55/55 完全一致**。

## 本版修复

- **动态图标漏字修复**：输入框右侧的返回图标之前渲染成文字「ke」——图标字体子集脚本没有扫描
  `const fieldIcon = cond ? 'send' : 'keyboard_return'` 这类变量赋值，导致 `keyboard_return` 未进子集。
  现已修正扫描规则（只取三元分支里的图标名，避免把判断字符串误当图标），重新裁剪字体。
- 视觉验收：用虚拟设备对 **APK 内嵌资源** 与 **线上网页** 逐屏截图比对，课表页两张截图 sha256 完全相同。

## 一致性保障（第一要求）

| 环节 | 做法 |
| --- | --- |
| 界面来源 | `preBuild` 触发 `syncWebAssets`，把 `dist/` 复制进 `assets/www`，每次编译都刷新 |
| 运行方式 | `WebViewAssetLoader` 以 `https://appassets.androidplatform.net/assets/www/` 提供，IndexedDB / fetch / getUserMedia 与网站一致 |
| 版本号 | 单一来源 `web/src/lib/meta.ts` 的 `APP_VERSION`，APK `versionName`/`versionCode` 由它推导 |
| 校验 | `npm run apk:parity`（逐文件哈希）+ `node scripts/visual-parity.mjs`（逐屏截图） |

## 原生只做网页做不到的事

运行时权限（相机 / 麦克风 / 通知）、**系统文件资源管理器 SAF** 响应文件选择、
外部链接交给系统（地图 / GitHub / Bilibili）、**Android 16 · ColorOS 流体云**进度通知
（网页通过 `window.DuofenNative.liveUpdate()` 调用，浏览器自动退回 Notification API）。

## 安装信息

应用名 **多分课表**，图标为猫娘美术资源；`arm64-v8a`、`minSdk 26`、`targetSdk 35`。

## 验证

- Web：91 步全部通过，0 console 错误、0 page error
- 一致性：55/55 文件 sha256 相同；课表页 APK/网页截图 sha256 相同
