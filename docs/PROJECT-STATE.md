# 项目当前状态（供上下文清理 / 交接使用）

> 这份文件的目的：把会话里的关键状态**固化到仓库**，这样即使清空对话上下文、或换人接手，也不会丢信息。
> 最后更新：v2.6.0 之后（`Dock` 性能版 + 灵动岛改造 + 贡献者名片预览）。

## 一、当前版本与入口

| 项 | 值 |
| --- | --- |
| 版本 | `APP_VERSION = 'v2.6.0'`（`versionCode 20600` / `versionName 2.6.0`） |
| APK 短链 | https://tequed232.github.io/duofen-kebiao/enhance.apk |
| 网页版 | https://tequed232.github.io/duofen-kebiao/ |
| 发布页 | https://github.com/tequed232/duofen-kebiao/releases |
| 仓库 | https://github.com/tequed232/duofen-kebiao |

> 注意：`versionCode` 在 `app/build.gradle.kts` 里**显式钉住**（不靠 `meta.ts` 解析），
> 因为版本串一旦含字母就会解析失败退回 `6`，导致系统判为降级而**拒绝安装**。

## 二、已完成并验证的功能

| 模块 | 状态 | 关键实现 |
| --- | --- | --- |
| 底栏（Dock） | ✅ 真机验证 | **常驻唯一实例**（挂在 App 层、屏幕栈之外）→ 不再"跳两次/跳回主页"；位置即结果 + 拖动跟手 + 松手磁吸；点击弹出小圆球并吸附（固定单线轨道） |
| 底栏性能 | ✅ | 按下缓存几何、rAF 合帧、不在移动回调里读布局、移动元素不挂 SVG 滤镜 |
| 过渡动画 | ✅ | 纯左右平移（前进右进左出、返回反向），`resetTo` 重建标签栈（无竞态、幂等） |
| 性能双档 | ✅ | 设置 → 性能模式：高性能 / 自动 / 低性能（`html[data-perf]` 分流，低档关闭滤镜与流体拉伸） |
| 屏幕安全区 | ✅ | 设置 → 上端/下端安全区各一个**滑块**（实时预览 + 回自动）；`max(env(), 原生 inset, 滑块值)`；推荐上 40dp / 下 16dp |
| 灵动岛上课提醒 | ⚠️ 待真机确认 | `POST_PROMOTED_NOTIFICATIONS` 已授权；通道 importance=4、promoted=true；通知动作 **「导航去」「我到了」** + 课程首字大图标 |
| 通知小图标 | ✅ 已修 | 从系统资源改为 app 内单色矢量 `ic_stat_notify`（系统资源图标会被 ColorOS 静默丢弃） |
| 相机剔除 | ✅ | 屏幕/路由/入口/文案/CAMERA 权限/视频采集授权全部移除 |
| HTML 课表导入 | ✅ | `web/src/lib/scheduleHtml.ts`：网格表 + 列表表两种结构，解析课程/教师/教室/周次/节次；端到端导入测试通过 |
| 本地缓存课表 | ✅ | `web/src/lib/scheduleCache.ts`：导入自动留快照（≤3 份），可一键恢复 |
| 教材窗口 | ✅ | 多选删除（可回档）+ 快捷添加 FAB |
| 开源清单 | ✅ | `scripts/collect-licenses.mjs` → 设置页「开源相关」+ README 分类表 |
| 贡献者名片 | 🟡 **仅预览** | `preview/credits.html`（1×3 作者本人 + 2×3 其他六位），**尚未接入应用** |

## 三、待办

1. **灵动岛实测**：设置 → 实时通知（流体云）→「发送实况测试」，看状态栏是否出现；用
   `adb shell dumpsys notification --noredact | findstr promotedOngoing` 复核 `promotedOngoing=true`
2. **贡献者名片上线评估**：`preview/credits.html` 预览通过后，再决定是否放进「关于 → 贡献者」
3. **仓库拆分**（作者要求）：`duofen-kebiao-web` / `duofen-kebiao-android`（GitHub slug 只能用 ASCII）
   - A：Android 仓库存 www 预构建快照 + 同步脚本（两端同源）
   - B：Android 仓库只放原生代码，构建时从 Web 仓库下载产物
4. 小事：`docs/context-links.md` 版本号更新到 v2.6；清理 Pages 上的旧 APK（只留 `enhance.apk` + 最新包）

## 四、常用命令

```bash
npm run build                 # 网页构建（输出 dist/）
npm run apk:parity            # APK 内嵌资源 ↔ 网页构建 逐文件哈希比对（期望 55/55）
node scripts/check-imports.mjs     # 导入自检（防"用了没导入"导致白屏）
node scripts/check-secrets.mjs     # 密钥扫描
node scripts/verify.mjs            # 自动化验收（83 步，含逐屏截图）
./gradlew assembleRelease          # 打 APK
```

Android 真机（作者机型 realme RMX6688，Android 16 / 1080×2800 @3.5x）：
```powershell
D:\Android\Sdk\platform-tools\adb.exe install -r app\build\outputs\apk\release\app-release.apk
pwsh -File scripts/verify-device.ps1   # 一键：安装 + 截图 + 点底栏三格 + 拖拽 + 查实况通知
```

## 五、易踩的坑（都踩过）

1. **发布前必须刷新 Pages 镜像**（根目录 `index.html` / `assets/`），否则线上网页版落后于 APK
2. **gradle 的 up-to-date 判定**会让新 `dist/` 不进 APK → 改完资源后清 `app/build/intermediates/{assets,merged_assets,packaged_assets}` 再打包
3. **JSX 里"用了没导入"** 会整页白屏 → 每次改动先跑 `check-imports.mjs` + 本地渲染自检（`root` 渲染长度 > 0 且运行时错误为 0）
4. **Chromium/WebView 丢弃 `backdrop-filter: url(#svg)`** → 网页端无法对背景做真实折射；当前用 SVG 位移层近似（真折射需原生 RenderEffect/AGSL）
5. **真机掉帧**多来自：逐帧 `getBoundingClientRect()`、改 `width`、移动元素挂 SVG 滤镜
6. 仓库**不收录**构建产物与截图（曾因此被密钥扫描误报）
