# 项目当前状态

> 这份文件的目的：把会话里的关键状态**固化到仓库**，这样即使清空对话上下文、或换人接手，也不会丢信息。
> 最后更新：v3.0.2（安全审查整改 + 致谢口径）。

## 当前版本与入口

| 项 | 值 |
| --- | --- |
| 版本 | `APP_VERSION = 'v3.0.2'`（`versionCode 30002` / `versionName 3.0.2`） |
| 发布页 | https://github.com/tequed232/duofen-kebiao/releases/latest （**只展示最近 5 条**；安装包只作为 Release 附件，已从仓库与 Pages 剔除） |
| 历史版本 | https://github.com/tequed232/duofen-kebiao-releases （**private** 归档仓库，保存所有历史成品） |
| 网页版 | https://tequed232.github.io/duofen-kebiao/ |
| 仓库 | https://github.com/tequed232/duofen-kebiao |

> 注意：`versionCode` / `versionName` 由 `app/build.gradle.kts` 的 `webVersion()` 从 `web/src/lib/meta.ts` 的 `APP_VERSION` 解析得出，**单一来源**。以前这里是硬编码的 `20600` / `2.6.0`，与解析值并存成了两处真相，已删除。

## 已完成并验证的功能

| 模块 | 状态 | 关键实现 |
| --- | --- | --- |
| 底栏（Dock） | 真机验证 | **常驻唯一实例**（挂在 App 层、屏幕栈之外）→ 不再「跳两次/跳回主页」；位置即结果 + 拖动跟手 + 松手磁吸；点击弹出小圆球并吸附（固定单线轨道） |
| 底栏性能 | 已完成 | 按下缓存几何、rAF 合帧、不在移动回调里读布局、移动元素不挂 SVG 滤镜 |
| 过渡动画 | 已完成 | 纯左右平移（前进右进左出、返回反向），`resetTo` 重建标签栈（无竞态、幂等） |
| 性能双档 | 已完成 | 设置 → 性能模式：高性能 / 自动 / 低性能（`html[data-perf]` 分流，低档关闭滤镜与流体拉伸） |
| 屏幕安全区 | 已完成 | 设置 → 上端/下端安全区各一个**滑块**（实时预览 + 回自动）；`max(env(), 原生 inset, 滑块值)`；推荐上 40dp / 下 16dp |
| 灵动岛上课提醒 | 待真机确认 | `POST_PROMOTED_NOTIFICATIONS` 已授权；通道 importance=4、promoted=true；通知动作 **「导航去」「我到了」** + 课程首字大图标 |
| 通知小图标 | 已修 | 从系统资源改为 app 内单色矢量 `ic_stat_notify`（系统资源图标会被 ColorOS 静默丢弃） |
| 相机剔除 | 已完成 | 屏幕/路由/入口/文案/CAMERA 权限/视频采集授权全部移除 |
| HTML 课表导入 | 已完成 | `web/src/lib/scheduleHtml.ts`：网格表 + 列表表两种结构，解析课程/教师/教室/周次/节次；端到端导入测试通过 |
| 本地缓存课表 | 已完成 | `web/src/lib/scheduleCache.ts`：导入自动留快照（≤3 份），可一键恢复 |
| 教材窗口 | 已完成 | 多选删除（可回档）+ 快捷添加 FAB |
| 开源清单 | 已完成 | `scripts/collect-licenses.mjs` → 设置页「开源相关」+ README 分类表 |
| 贡献者名片墙 | 已接入应用 | 「关于 → 致谢 · 名片墙」：作者 1×3（跨三列）+ 其余按三列排（最后一行不满时最后一张跨列补满）；真头像（GitHub / B 站公开头像，已登记 `docs/asset-permissions.md`）+ 姓名首字兜底；平台剪影（Remix Icon）+ CC 许可标记；数据源 `web/src/lib/meta.ts` 的 `CREDITS`；宽屏设计稿 `preview/credits.html` |
| 致谢 / 致歉声明 | 已更新 | 删除 README 与关于页的「致歉声明」；名单同步到 README、`CONTRIBUTORS.md`、应用名片墙三处 |
| 仓库卫生 | 已加固 | 7 个 `enhance*.apk` 全部 `git rm --cached` 剔除；`.gitignore` 忽略 `*.apk/*.aab/*.zip`；`scripts/check-repo-hygiene.mjs` + `.github/workflows/repo-hygiene.yml` 在推送/PR 上拦截（已做反向验证：塞进 APK 即 CI 红）；APK 只作为 Release 附件，短链改用 `releases/latest/download/enhance.apk` |

## 待办

1. **灵动岛实测**：设置 → 实时通知（流体云）→「发送实况测试」，看状态栏是否出现；用 `adb shell dumpsys notification --noredact | findstr promotedOngoing` 复核 `promotedOngoing=true`。
2. **仓库拆分**（作者要求）：`duofen-kebiao-web` / `duofen-kebiao-android`（GitHub slug 只能用 ASCII）
   - 方案 A：Android 仓库存 www 预构建快照 + 同步脚本（两端同源）
   - 方案 B：Android 仓库只放原生代码，构建时从 Web 仓库下载产物
3. **发布名片墙改动**：合并到 `main` 后由 CI（`.github/workflows/pages.yml`）构建并发布到 `gh-pages`；再重打 APK（否则 APK 还停在旧的「关于」页）。
4. **待作者确认的名单口径**：liuli1719 的显示名（星爱流萤 / 小妍）、作者显示名（罗xx / 罗xx（Tequed232））；另外米达达的 B 站号昵称是 `miratsu_米达达`，与素材台账里的插画作者 miratsu 是否同一人需要确认。
5. **APK 已从仓库剔除**（作者要求，见「已完成」表）：确认发布时用稳定别名上传 `--asset "enhance.apk=app/build/outputs/apk/release/app-release.apk"`，短链才是 `releases/latest/download/enhance.apk`；历史上提交过的 APK 仍留在 git 历史里，若要连历史一起瘦身需要 `git filter-repo` + 强推（`.git` 目前约 130MB）。

## 常用命令

```bash
npm run build                 # 网页构建（输出 dist/）
npm run apk:parity            # APK 内嵌资源 ↔ 网页构建 逐文件哈希比对（期望 55/55）
npm run check:hygiene         # 仓库卫生：安装包/压缩包不允许被跟踪（APK 只进 Release）
node scripts/check-imports.mjs     # 导入自检（防「用了没导入」导致白屏）
node scripts/check-secrets.mjs     # 密钥扫描
node scripts/verify.mjs            # 自动化验收（逐屏截图，结果见 screenshots/report.json）
./gradlew assembleRelease          # 打 APK（产物在 app/build/，不进仓库）
```

Android 真机（作者机型 realme RMX6688，Android 16 / 1080×2800 @3.5x）：

```powershell
D:\Android\Sdk\platform-tools\adb.exe install -r app\build\outputs\apk\release\app-release.apk
pwsh -File scripts/verify-device.ps1   # 一键：安装 + 截图 + 点底栏三格 + 拖拽 + 查实况通知
```

## 易踩的坑

1. **线上网页版由 CI 发布**：推送到 `main` 后自动构建并发布到 `gh-pages`（`.github/workflows/pages.yml`）。不要再手工往仓库根目录拷 `dist/` —— 那批产物已从仓库剔除，并被 `.gitignore` 忽略。
2. **gradle 的 up-to-date 判定**会让新 `dist/` 不进 APK → 改完资源后清 `app/build/intermediates/{assets,merged_assets,packaged_assets}` 再打包。
3. **JSX 里「用了没导入」** 会整页白屏 → 每次改动先跑 `check-imports.mjs` + 本地渲染自检（`root` 渲染长度 > 0 且运行时错误为 0）。
4. **Chromium/WebView 丢弃 `backdrop-filter: url(#svg)`** → 网页端无法对背景做真实折射；当前用 SVG 位移层近似（真折射需原生 RenderEffect/AGSL）。
5. **真机掉帧**多来自：逐帧 `getBoundingClientRect()`、改 `width`、移动元素挂 SVG 滤镜。
6. 仓库**不收录**构建产物与截图（曾因此被密钥扫描误报）。
