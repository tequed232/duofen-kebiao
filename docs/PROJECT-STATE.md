# 项目当前状态

> 这份文件的目的：把会话里的关键状态**固化到仓库**，这样即使清空对话上下文、或换人接手，也不会丢信息。
> 最后更新：v3.5.2（本地封面识别落地 + 底栏六项整改 + `apk:parity` 假失败修复）。

## 当前版本与入口

| 项 | 值 |
| --- | --- |
| 版本 | `APP_VERSION = 'v3.5.2'`（`versionCode 30502` / `versionName 3.5.2`） |
| 发布页 | https://github.com/tequed232/duofen-kebiao/releases/latest （**只展示最近 5 条**；安装包只作为 Release 附件，已从仓库与 Pages 剔除） |
| 历史版本 | https://github.com/tequed232/duofen-kebiao-releases （**private** 归档仓库，保存所有历史成品） |
| 网页版 | https://tequed232.github.io/duofen-kebiao/ |
| 仓库 | https://github.com/tequed232/duofen-kebiao |

> 注意：`versionCode` / `versionName` 由 `app/build.gradle.kts` 的 `webVersion()` 从 `web/src/lib/meta.ts` 的 `APP_VERSION` 解析得出，**单一来源**。以前这里是硬编码的 `20600` / `2.6.0`，与解析值并存成了两处真相，已删除。

## 已完成并验证的功能

| 模块 | 状态 | 关键实现 |
| --- | --- | --- |
| 底栏（Dock） | 真机验证 | **常驻唯一实例**（挂在 App 层、屏幕栈之外）→ 不再「跳两次/跳回主页」；位置即结果 + 拖动跟手 + 松手磁吸。**触摸小球已移除**（`schedule.css` 与 `layout.tsx` 各有注释说明），只保留**一直显示**的那一个圆：选中色块 `.m3e-dock-slider` |
| 底栏性能 | 已完成 | 按下缓存几何、rAF 合帧、不在移动回调里读布局、移动元素不挂 SVG 滤镜 |
| 过渡动画 | 已完成 | 纯左右平移（前进右进左出、返回反向），`resetTo` 重建标签栈（无竞态、幂等） |
| 性能双档 | 已完成 | 设置 → 性能模式：高性能 / 自动 / 低性能（`html[data-perf]` 分流，低档关闭滤镜与流体拉伸） |
| 屏幕安全区 | 已完成 | 设置 → 上端/下端安全区各一个**滑块**（实时预览 + 回自动）；`max(env(), 原生 inset, 滑块值)`；推荐上 40dp / 下 16dp |
| 灵动岛上课提醒 | 部分真机验证 | `POST_PROMOTED_NOTIFICATIONS` 已授权；通道 importance=4、promoted=true；通知动作 **「导航去」「我到了」** + 课程首字大图标。真机已确认：设置页显示「已开启 · 提前 20 分钟」，且 `dumpsys package` 可见权限已授予；**仍未复核** `promotedOngoing=true`（需点一次「发送实况测试」后查状态栏） |
| 通知小图标 | 已修 | 从系统资源改为 app 内单色矢量 `ic_stat_notify`（系统资源图标会被 ColorOS 静默丢弃） |
| 相机剔除 | 已完成 | 屏幕/路由/入口/文案/CAMERA 权限/视频采集授权全部移除 |
| HTML 课表导入 | 已完成 | `web/src/lib/scheduleHtml.ts`：网格表 + 列表表两种结构，解析课程/教师/教室/周次/节次；端到端导入测试通过 |
| 本地缓存课表 | 已完成 | `web/src/lib/scheduleCache.ts`：导入自动留快照（≤3 份），可一键恢复 |
| 教材窗口 | 已完成 | 多选删除（可回档）+ 快捷添加 FAB |
| 开源清单 | 已完成 | `scripts/collect-licenses.mjs` → 设置页「开源相关」+ README 分类表 |
| 贡献者名片墙 | 已接入应用 | 「关于 → 致谢 · 名片墙」：作者 1×3（跨三列）+ 其余按三列排（最后一行不满时最后一张跨列补满）；真头像（GitHub / B 站公开头像，已登记 `docs/asset-permissions.md`）+ 姓名首字兜底；平台剪影（Remix Icon）+ CC 许可标记；数据源 `web/src/lib/meta.ts` 的 `CREDITS`；宽屏设计稿 `preview/credits.html` |
| 致谢 / 致歉声明 | 已更新 | 删除 README 与关于页的「致歉声明」；名单同步到 README、`CONTRIBUTORS.md`、应用名片墙三处 |
| 仓库卫生 | 已加固 | 历史提交过的 8 个 `*.apk` 已全部 `git rm --cached` 剔除（现在 `git ls-files` 里没有任何 `.apk`）；`.gitignore` 忽略 `*.apk/*.aab/*.zip`；`scripts/check-repo-hygiene.mjs` + `.github/workflows/repo-hygiene.yml` 在推送/PR 上拦截（已做反向验证：塞进 APK 即 CI 红）；APK 只作为 Release 附件，命名统一为 `duofen-kebiao-<版本>.apk` —— **`enhance.apk` 这类「始终最新」的别名已废弃**（见 `scripts/github-release.mjs` 头部注释，短链改用 release 直链） |

## 待办

按「能不能由本仓库自行完成」分三类 —— 这样「还剩什么」是可判定的，而不是一堆混在一起的条目。

### A. 可自主完成（无外部依赖）

1. ~~**发布名片墙改动**~~ —— **已完成**。`gh-pages` 上的当前构建就是 v3.5.2（`assets/bootstrap-genovrcY.js`，实测含「致谢 · 名片墙」、`miratsu`、版权行、设置页「本地识别」行）；而 `npm run apk:parity` 现在能通过，并**证明 APK 内嵌资源与网页产物逐文件哈希一致** —— 「APK 还停在旧『关于』页」这个风险从此由这条守卫长期兜住（它此前一直假失败，见下方「易踩的坑」补充）。

### B. 阻塞：需要真机

2. **灵动岛实况复核**：设置 → 实时通知（流体云）→「发送实况测试」，看状态栏是否出现；`adb shell dumpsys notification --noredact | findstr promotedOngoing` 复核 `promotedOngoing=true`。
   （真机 realme GT7 在本次会话中接入过，覆盖安装、本地识别资源、封面识别链路均已验；复核这项时设备已断开。）
3. **界面缩放三档**的真机观感。

### C. 阻塞：需要作者决策（不自行决定）

4. **仓库拆分**：`duofen-kebiao-web` / `duofen-kebiao-android`（GitHub slug 只能用 ASCII）
   - 方案 A：Android 仓库存 www 预构建快照 + 同步脚本（两端同源）
   - 方案 B：Android 仓库只放原生代码，构建时从 Web 仓库下载产物
5. **名单口径**：liuli1719 的显示名（星爱流萤 / 小妍）、作者显示名（罗xx / 罗xx（Tequed232））；另外米达达的 B 站昵称是 `miratsu_米达达`，与素材台账里的插画作者 miratsu 是否同一人需要确认。
   便于对照：`web/src/lib/meta.ts` 的 `CREDITS` 当前实际取值是 `罗xx`、`Hanbing`、`饼干`、`维舟`、`米达达`（附 X 链接 `x.com/miratsu169`）、`椿湫`。
6. **git 历史瘦身**：历史上提交过的 8 个 `.apk` 仍留在 git 对象库里，`.git` 实测 **128.9 MB**。要连历史一起瘦身必须 `git filter-repo` + 强推 —— 属**破坏性重写**，需作者明确同意后再做。

## 常用命令

```bash
npm run build                 # 网页构建（输出 dist/）
npm run apk:parity            # APK 内嵌资源 ↔ 网页构建 逐文件哈希比对；ocr/ 按设计只进 APK，不算不一致
npm run check:hygiene         # 仓库卫生：安装包/压缩包不允许被跟踪（APK 只进 Release）
node scripts/check-imports.mjs     # 导入自检（防「用了没导入」导致白屏）
node scripts/check-secrets.mjs     # 密钥扫描
node scripts/verify.mjs            # 自动化验收（逐屏截图，结果见 screenshots/report.json）
./gradlew assembleRelease          # 打 APK（产物在 app/build/，不进仓库）
```

Android 真机（作者机型 realme RMX6688 / 真我 GT7，Android 16；**设备自报** 1280×2800、density 560 → 3.5x。注：此前这里写 1080×2800，与 `wm size` 实测不符，已按实测更正）：

```powershell
D:\Android\Sdk\platform-tools\adb.exe install -r app\build\outputs\apk\release\app-release.apk
pwsh -File scripts/verify-device.ps1   # 一键：安装 + 截图 + 点底栏三格 + 拖拽 + 查实况通知
```

## 易踩的坑

1. **线上网页版由 CI 发布**：推送到 `main` 后自动构建并发布到 `gh-pages`（`.github/workflows/pages.yml`）。不要再手工往仓库根目录拷 `dist/` —— 那批产物已从仓库剔除，并被 `.gitignore` 忽略。
2. **gradle 的 up-to-date 判定**会让新 `dist/` 不进 APK → 改完资源后清 `app/build/intermediates/{assets,merged_assets,packaged_assets}` 再打包。
3. **JSX 里「用了没导入」** 会整页白屏 → 每次改动先跑 `check-imports.mjs` + 本地渲染自检（`root` 渲染长度 > 0 且运行时错误为 0）。
4. **~~Chromium/WebView 丢弃 `backdrop-filter: url(#svg)`~~（2026-09 更正：此说法不成立）**。实测 Chromium 153 上 `url()` 与 `feImage` 位移图**都生效**，背景确实能被掰弯 —— 见 `scripts/check-backdrop-refraction.mjs`（已进 CI）。当初的假阴性来自「用 `feImage` 做位移图、开/关截图一致」就判定 `url()` 被丢弃：`feImage` 取不到图时位移恒为 0，同样会一致，两者没分开测。教训是**量引擎行为时必须带一个必然生效的对照**（那里是 `blur`），否则一次假阴性会被写进文档再被四处引用。
5. **真机掉帧**多来自：逐帧 `getBoundingClientRect()`、改 `width`、移动元素挂 SVG 滤镜。
6. 仓库**不收录**构建产物与截图（曾因此被密钥扫描误报）。
7. **`apk:parity` 曾经"永远失败"**：它把 APK 里多出的 22 个 `ocr/` 文件当成不一致，而那是**设计如此**（`stripLocalOcrFromDist` 把 `dist/ocr` 删掉保住网页产物 2.1 MB，`syncOcrAssets` 又把它塞进 APK）。现在只豁免 `ocr/` 这一个前缀，其它多出来的文件仍报不一致 —— 改这条守卫时**务必保留反向用例**，否则它会退化成"永远绿"。
8. **改含中文的脚本不要走 PowerShell 的文本 cmdlet**：`Set-Content` / `[IO.File]::WriteAllText` 会把 UTF-8 写坏（实测：3561 字节的文件涨到 5506 字节、中文全成乱码、node 直接报 ESM 加载失败）。用编辑工具或 Node 的 `fs` 写。
