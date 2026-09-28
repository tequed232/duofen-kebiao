# 多分课表

Material 3 Expressive 风格的课表应用 —— **四日课表 + 教材识别 + 上课提醒（灵动岛 / 流体云）+ 课表导入**。目标形态为竖屏手机 **412 × 892dp**（1080p 级设备），浏览器内直接运行，`dist/` 为可直接部署的 production build。

仓库同时包含一份 Kotlin/Compose 的 Android 实现（`app/`，Gradle 工程）。所有界面以 `web/` 为唯一设计基准，本 README 描述 Web 实现。

> 在线体验：[tequed232.github.io/duofen-kebiao](https://tequed232.github.io/duofen-kebiao/)
> 发布页：[github.com/tequed232/duofen-kebiao/releases](https://github.com/tequed232/duofen-kebiao/releases)

## 功能

| 路由 | 屏幕 | 主要能力 |
| --- | --- | --- |
| `schedule` | 课表 · 多分课表（首页） | 内嵌课表 + 四日表格（上午/中午/下午/晚上时间轴、左右拖动跟手切换日期窗口）、点击课程查看老师/时间/地点、点击地点启动地图导航、课表数据导入面板、右下角「回到今天」 |
| `scheduleFilter` | 筛选 | 老师 / 课程 / 地点 / 时间 四个标签检索，结果按 课程·老师·地点 三列排列，点击回到课表并高亮 5 秒 |
| `textbookList` | 教材 | 已导入教材清单、封面选图识别（走「教材识别接口」）、手动填写与移除 |
| `settings` | 设置 | 外观 / 性能 / 安全区 / 地图与学校名 / 索引与开源入口等列表项 + 叠放其上的开关与 Expressive 滑块、已保存消息条（撤销） |
| `apiEdit` | 接口配置 | 全应用唯一的通用接口配置（地址 + 密钥，只存本机），目前供教材封面识别使用；可选手选一张图试跑 |
| `about` | 关于 | 应用信息、Material 3 设计说明、致谢 · 名片墙、素材与隐私说明 |
| `licenses` | 开源相关 | 按用途分类的依赖清单（`scripts/collect-licenses.mjs` 生成） |
| `blank` | 屏幕 7 | 按草图保留的空屏幕 |

### 课表（自主嵌入）

- 内置课表由教务系统导出的 `学生课表.doc`（RTF 表格）解析而来，结果固化在 Web 的 `web/src/data/schedule.ts` —— 应用启动即自带课表；也可以在应用内用「课表数据」面板导入自己的导出文件覆盖它（导入结果存本机 IndexedDB）。
- **4×4 容器 + 左右翻页**：容器是四行（**上午 / 中午 / 下午 / 晚上**）× 四列的表格，一周按 **7 天** 计算，左右**拖动跟手翻页**（第 1 页 周一–周四，第 2 页 周五–周日 + 下周一），底部有页码圆点与左右翻页按钮；点击某天选中该日，下方列出当天课程。
- **识别课表月份**：解析出的周次会换算成具体日期，顶部显示「2026年9月 · 9月17日 周四」与**课表覆盖 2026年8月 – 2027年1月**；点按该按钮弹出月份/日期选择器（列出学期内每个月的教学周区间，也可按具体日期跳转），选择后自动定位到对应教学周与星期。课程详情里还会列出该课的具体上课日期（共 N 次课、跨哪几个月）。
- **周次**：按学期开始日期（可改）计算当前教学周，表格只显示该周实际开设的课程；◀ ▶ 切换周次。
- **向下滑收起课表**：在课表上向下滑（或页面向下滚动）会把课表折叠成一行摘要（周次 · 星期 · 日期 · 当天课程数），腾出空间显示当天课程清单；点摘要行或向上滑即可展开。
- **课程详情**：默认只显示课程名，点击后展开授课老师、节次时间、周次、上课日期与地点；点击地点即调用地图。
- **筛选屏**：`老师/课程/地点/时间` 四标签，点击结果回到课表并**高亮 5 秒**（若该课程不在当前周，自动切到它开课的那一周并提示）。
- **导入**：`课表数据` 面板支持 `.doc/.rtf`、`.html` 表格、`.csv/.txt` 文本导入或恢复内置课表，结果存于 IndexedDB。

### 上课提醒（灵动岛 / 流体云）

- 每 30 秒检查一次「下一节课」，提前量可调（设置 → 上课提醒，默认 10 分钟）；同一节课只提醒一次（按 课程+日期+节次 去重，重启不重复打扰），下课后自动撤销通知。
- 通知带两个动作：**导航去**（直接拉起地图到教室）与**我到了**（回到应用看这节课要带的教材）。
- 设置 → 实时通知（流体云）里有「发送实况测试」，用来确认状态栏实况是否出现。

### Android（Android 16 / 天玑 9400 / ColorOS 流体云）

- `app/` 只是 WebView 宿主（`MainActivity.kt` + `LiveUpdates.kt`），界面全部来自 `web/`，两端同一份构建。
- **流体云**：上课提醒与「发送实况测试」会发布 Android 16 **Live Updates**（`Notification.ProgressStyle` + `setRequestPromotedOngoing(true)`），ColorOS 16 会渲染成**流体云**卡片；完成后显示结果并在数秒后自动收起。该 API 仅存在于 Android 16，代码用反射调用，因此同一份 APK 在旧系统上退化为普通进行中通知，在 Android 16 上则进入流体云。
- 已加入 `POST_NOTIFICATIONS` 运行时申请、`enableOnBackInvokedCallback`（Android 16 预测式返回）、`windowSoftInputMode=adjustResize`；随语音与相机功能删除，清单里已不再申请录音权限与相机 / 麦克风特性。
- 本机 SDK 平台为 android-35，因此 APK 目前是 `targetSdk 35`（在 Android 16 / ColorOS 16 上正常运行）；安装 `platforms;android-36` 后把 `app/build.gradle.kts` 的 `compileSdk/targetSdk` 改成 36 并升级 AGP ≥ 8.9 即可得到 targetSdk 36 构建。

### 数据与存储

- 课表、教材与设置全部写入 **IndexedDB**（`m3-expressive-notes`），刷新后保留；IndexedDB 不可用时自动降级到 `localStorage`。
- 没有示例/假数据：没有导入课表就用内置课表、没有教材就显示空状态；没有配置识别接口时明确提示而不是编造结果。
- 教材封面识别用的接口地址与密钥只存本机，随设置一起导出/恢复；不配置也能用，只是识别按钮会提示未配置。

## 技术栈

- **React 19 + TypeScript + Vite 7**：`web/` 单页应用，`vite.config.ts` 以 `root=web`、`outDir=dist` 构建纯静态产物
- **Material Web（@material/web 2.5）**：filled/outlined/tonal/text button、outlined text field、switch、slider、navigation bar/tab、card、dialog、menu、list-item、fab、divider、icon、circular-progress、ripple 等标准组件；库里没有的（顶部应用栏、消息条、轮播、全屏查看器、可展开面板）才自行实现
- **Material Symbols Rounded**：`scripts/subset-icons.mjs` 用 fontkit 把 5.2 MB 变量字体按 PUA 码位裁剪到 **77 KB**（保留 FILL/GRAD/opsz/wght 轴），`scripts/check-icons.mjs` 在构建时保证没有图标名漏出子集
- **@material/material-color-utilities**：`SchemeExpressive`（高对比度）生成全套 `--md-sys-color-*` 角色，代码里不写死颜色
- **Roboto**：本地字体（`@fontsource/roboto` 400/500/700），离线可用
- **Playwright + Chromium**：412×892 真机视口自动化验收与逐屏截图
- **Kotlin / Gradle / WebView**：`app/` Android 宿主，只做原生权限、SAF 文件选择、外部跳转、返回键与 Live Updates
- **Anubis + Cloudflare**：可选的反爬层（自建 VPS）与 CDN / Pages（见 `deploy/`）

## 目录结构

仓库只做四件事：**网页应用**（`web/`）、**Android 宿主**（`app/`）、**脚本与发布**（`scripts/`）、**文档与合规**（`docs/` + 根目录的几份 Markdown）。
构建产物（`dist/`、`build/`）与签名文件一律不入库。

### 顶层

| 目录 | 作用 | 放进这里的规则 |
| --- | --- | --- |
| `web/` | 网页应用本体（唯一设计基准），Vite root | 只有网页端代码；界面、样式、数据解析都进这里 |
| `app/` | Android 宿主：只做 WebView 外壳与原生能力 | 不写业务界面；界面一律来自 `web/` |
| `scripts/` | 构建、校验、发布、数据导入脚本 | 一个脚本只做一件事，名字以 `check-` / `verify-` 开头的是验收类 |
| `docs/` | 文档与授权凭据 | 说明、台账、评估、规范都放这里 |
| `deploy/` | 部署配置（反爬 / CDN） | 只放配置与对应说明，不放构建产物 |
| `legacy/` | 上一版单文件页面，仅供备查 | 不再改动 |
| `preview/` | 宽屏设计稿（非应用运行时资源） | 只放设计稿，不参与构建 |
| `artwork/` | 早期矢量图标的渲染稿（`app-icon.png`，1024×1024，**不是**当前图标原图） | 设计留档，不参与运行时；当前图标原图见 `docs/icon-source.jpg` |
| `gradle/` | Gradle Wrapper | 仅 Wrapper，勿手工改 |

### 根目录文件

| 文件 | 功能 |
| --- | --- |
| `package.json` / `package-lock.json` | npm 依赖与脚本入口（`build` / `verify` / `check:*`） |
| `vite.config.ts` | 构建配置：`root=web`、`outDir=dist`、相对 `base`（可托管在任意子路径） |
| `tsconfig.json` | TypeScript 配置 |
| `build.gradle.kts` / `settings.gradle.kts` / `gradle.properties` | Android 构建（产物落 `app/build/outputs/apk/release/`） |
| `gradlew` / `gradlew.bat` | Gradle 启动器 |
| `keystore.properties.example` | 正式签名配置模板（真实文件 `keystore.properties` 不入库） |
| `README.md` / `RELEASE_NOTES.md` / `CONTRIBUTORS.md` | 主文档 / 发布说明 / 贡献者名单 |
| `.gitignore` | 忽略构建产物、签名文件与安装包 |

### `web/` —— 网页应用

| 路径 | 功能 |
| --- | --- |
| `web/index.html` | Vite 入口 HTML |
| `web/public/` | 原样拷贝进 `dist/` 的静态文件：`manifest.webmanifest`、`_headers`、PWA 图标、`permissions/` 授权截图（关于页点开可看） |
| `web/src/assets/` | 参与打包的图片：`avatars/` 各人公开头像、`illustration.jpg`（应用插画，唯一出口 `APP_ART`） |
| `web/src/main.tsx` `bootstrap.tsx` | 入口：Material Web 注册、主题与性能档引导 |
| `web/src/App.tsx` | 412×892 舞台、屏幕栈、消息条、启动页 |
| `web/src/components/` | 可复用界面件：`md.tsx`（Material Web 封装）、`layout.tsx`（应用栏 / 分节头 / 空态）、`overlays.tsx`（对话框 / 面板）、`schedule.tsx`（课表格）、`splash.tsx`（启动页）、`m3shape.tsx`（M3 形状）、`brands.tsx`（平台剪影图标） |
| `web/src/screens/` | 八个屏幕，一屏一文件 |
| `web/src/nav/navigation.tsx` | 屏幕栈与转场（含预测式返回） |
| `web/src/state/AppState.tsx` | 全局状态：设置、课表、教材、消息条 |
| `web/src/lib/` | 逻辑层（见下表） |
| `web/src/theme/` | 设计令牌与样式（见下表） |
| `web/src/data/` | 内置数据：默认课表、教材词表、许可清单 |
| `web/src/types/jsx.d.ts` | `<md-*>` 自定义元素的 JSX 类型声明 |

**八个屏幕**（`web/src/screens/`）：

| 文件 | 屏幕 |
| --- | --- |
| `ScheduleScreen.tsx` | 课表（首页） |
| `ScheduleFilterScreen.tsx` | 筛选 |
| `SettingsScreen.tsx` | 设置 |
| `TextbooksScreen.tsx` | 教材窗口（导入 / 识别 / 管理） |
| `AboutScreen.tsx` | 关于：设计说明、致谢名片墙、开源相关入口 |
| `LicensesScreen.tsx` | 开源相关（许可清单） |
| `ApiEditScreen.tsx` | 接口配置 |
| `BlankScreen.tsx` | 空白屏（转场用） |

**逻辑层**（`web/src/lib/`）：

| 文件 | 功能 |
| --- | --- |
| `schedule.ts` `scheduleHtml.ts` `scheduleCache.ts` | 课表解析（文本 / HTML 导入）、本地快照与回档 |
| `textbooks.ts` | 教材识别与词表匹配 |
| `db.ts` | IndexedDB 读写（数据只在本机） |
| `api.ts` | 外部接口调用与端点准入（非 https 只放行本机 / 局域网；密钥不外发、报错不回显） |
| `imaging.ts` | 图片处理与识别结果整理 |
| `lens.ts` `useLens.ts` | Liquid Glass 透镜：位移贴图生成与滤镜挂载 |
| `classReminder.ts` `native.ts` | 上课提醒、与 Android 宿主通信（流体云 / 通知 / 返回键） |
| `meta.ts` | 应用元信息与**贡献者名单唯一数据源** `CREDITS`（README / 关于页同源） |
| `cdn.ts` `perf.ts` `perf-telemetry.ts` `utils.ts` `types.ts` | CDN 资源地址、性能档与埋点、通用工具与类型 |

**主题**（`web/src/theme/`）：`tokens.css`（色彩 / 字体 / 间距角色）、`palette.ts`（动态配色 SchemeExpressive）、`motion.ts`（M3 Expressive 弹簧转场）、`components.css`（组件样式）、`schedule.css`（课表专有样式）、`base.css`（基础与开屏）、`icon-font.css` + `icon-codepoints.ts`（图标字体与码位）。

### `app/` —— Android 宿主

| 文件 | 功能 |
| --- | --- |
| `app/src/main/java/com/app/m3expressive/MainActivity.kt` | WebView 宿主：原生权限、SAF 文件选择、外部跳转、返回键 |
| `…/LiveUpdates.kt` | Android 16 Live Updates / ColorOS 流体云进度通知 |
| `…/NativeDock.kt` | 原生底边栏（液态玻璃条，位于 WebView 之下） |
| `app/src/main/AndroidManifest.xml` | 权限与组件声明 |
| `app/src/main/res/mipmap-*/` | 自适应图标（5 档密度 + 圆形） |
| `app/src/main/res/drawable/` `values/` | 通知图标、配色与主题 |

### `scripts/` —— 自动化

| 文件 | 功能 |
| --- | --- |
| `subset-icons.mjs` `check-icons.mjs` | 按需裁剪 Material Symbols 子集；构建时校验无图标漏出 |
| `make-icons.mjs` `icon-targets.mjs` `check-app-icons.mjs` | **应用图标**：从 `docs/icon-source.jpg` 生成全套（安卓 5 档密度 × 3 种 + 网页 4 张，口径在 `icon-targets.mjs`）；守卫逐像素核对"仓库里的图标 == 现按原图生成的"，`npm run icons:app` / `npm run check:app-icons` |
| `verify.mjs` `verify-device.ps1` `visual-parity.mjs` | Playwright 真机视口全流程验收与截图、真机核对、视觉比对 |
| `check-imports.mjs` | 防「用了没导入」导致白屏 |
| `check-secrets.mjs` `check-web-security.mjs` | 密钥 / 凭据扫描；注入面、密钥进 URL、明文端点守卫 |
| `check-repo-hygiene.mjs` | 安装包、压缩包、超 2 MB 文件不得被跟踪 |
| `check-apk-parity.mjs` | APK 内嵌资源与 `dist/` 逐文件哈希比对 |
| `check-version.mjs` | 版本号一致性：`meta.ts` 的 `APP_VERSION` 为唯一来源，挡住 `package.json` 与 `RELEASE_NOTES.md` 漂移 |
| `check-about-credits.mjs` | 关于页名片墙版式（每行一张、头像在左、按钮齐全、无溢出） |
| `github-release.mjs` | 发布：规范命名上传、归档到私有仓库、只保留最近 5 条 |
| `collect-licenses.mjs` | 汇总依赖许可 → 设置页「开源相关」与 README 清单 |
| `rtf-dump.mjs` | 把教务导出的 RTF 课表转成纯文本，便于检查表格结构 |
| `serve-dist.mjs` | 本地起静态服务器预览 `dist/`（默认 4174，`check-about-credits.mjs` 也对着它跑） |

### `docs/` —— 文档与凭据

| 文件 | 内容 |
| --- | --- |
| `PROJECT-STATE.md` | 项目现状与坑位记录（接手先看这份） |
| `commit-convention.md` | 提交信息规范（`类型(范围): 中文描述`） |
| `writing-style.md` | 协作与表达约定 |
| `asset-permissions.md` | **素材授权台账**：任何第三方素材进仓库前必须在此留记录 |
| `permissions/` | 授权凭据（聊天原文截图） |
| `icon-source.jpg` | 图标原图（2048×2048，留档）。当前全套图标的唯一来源，改它之后要跑 `npm run icons:app` 重新生成 |
| `security-review.md` | 本地安全审查报告与整改 |
| `v2-refactor.md` | v2 重构记录 |
| `coolapk-glass.md` | 酷安液态玻璃实现分析（自研参考） |
| `dynamic-island.md` `live-activity-plan.md` | 灵动岛 / 实况通知的评估与路线 |
| `promo-brief.md` | 宣传片创作说明 |
| `context-links.md` | 外部资料与链接 |

### 新增文件放哪里

| 你要加的东西 | 放这里 |
| --- | --- |
| 新界面 | `web/src/screens/` + `web/src/nav/navigation.tsx` 注册 |
| 可复用界面件 | `web/src/components/` |
| 课表 / 教材 / 接口相关逻辑 | `web/src/lib/` 对应文件 |
| 需要被打包的图片 | `web/src/assets/` |
| 需要原样发布到站点的文件 | `web/public/` |
| 颜色 / 动效 / 样式 | `web/src/theme/` |
| 校验脚本 | `scripts/`，命名 `check-*.mjs` 并接入 `package.json` |
| 说明文档 | `docs/` |
| 第三方素材 | **先**在 `docs/asset-permissions.md` 登记授权，再放进 `web/public/` 或 `app/src/main/res/` |


## 本地开发

```bash
npm install
npm run dev        # 开发模式 (http://127.0.0.1:5173)
npm run build      # 生成 Material Symbols 子集 -> 校验图标 -> vite build
npm run preview    # 预览 production build (http://127.0.0.1:4173)
npm run verify     # 用 Chromium 真机视口跑一遍全流程并截图（screenshots/）
npm run icons:app  # 换了 docs/icon-source.jpg 之后：重生成全套应用图标（18 张）
```

**交付物：`dist/`**（67 个文件、约 2.15 MB）—— 纯静态站点，任意静态服务器直接托管即可。

```
dist/
  index.html                       入口（相对路径引用，可放在任意子目录）
  assets/index-*.js  426 KB        React + Material Web + 业务代码
  assets/bootstrap-*.js 391 KB     Material Web 组件
  assets/index-*.css  111 KB       设计令牌 + 组件样式
  assets/material-symbols-rounded-subset-*.woff2  122 KB  Material Symbols Rounded（子集）
  assets/roboto-*-normal-*.woff2                  Roboto 400/500/700（本地字体，离线可用）
  icon-192.png / icon-512.png / apple-touch-icon.png      应用图标（与 APK 同一张原图生成）
```

## 构建与发布

### 网页（GitHub Pages）

源码留在 `main`，**构建产物不入库**。发布方式：本地构建后把 `dist/` 发到 `gh-pages` 分支（`gh-pages` 上放 `.nojekyll` 关闭 Jekyll 处理）。自动化工作流已整体移除，作者会重新配置。上一版单文件页面保留在仓库的 `legacy/index.html`，仅供备查。

首次启用需要把 Pages 的发布源指向 `gh-pages` 分支（仓库管理员执行一次）：

```bash
gh api -X PUT repos/tequed232/duofen-kebiao/pages -f source.branch=gh-pages -f source.path=/
```

本地复核发布物直接看 `dist/` 即可，不要再往仓库根目录拷。

### Release（APK + Web 构建）

**成品命名与保留规则**（2026-09 起）：

| 规则 | 内容 |
| --- | --- |
| 命名 | 一个版本只发两份，文件名统一：`duofen-kebiao-<版本>.apk`、`duofen-kebiao-<版本>-web.zip`（不再用 `enhance-*` 这套旧名） |
| 别名 | 不再发布 `enhance.apk` 这类「始终最新」别名；要最新版就用下面的 latest 直链 |
| 保留 | 本仓库 Releases 只保留**最近 5 条**；更早的版本**先归档到私有仓库** [`duofen-kebiao-releases`](https://github.com/tequed232/duofen-kebiao-releases) 再从本仓库移除附件（release 条目与 tag 保留） |
| 归档 | 归档是 private 仓库，保存所有历史版本的成品；源码始终在主仓库对应 tag |

```powershell
# 取出本机已保存的 GitHub 凭据（Git Credential Manager），不会打印 token
$out = "protocol=https`nhost=github.com`n" | git credential fill
$env:GITHUB_TOKEN = ($out | Select-String '^password=').Line.Substring(9)

# 发版：上传两份成品，随后自动执行「归档 + 只留最近 5 条」
node --use-system-ca scripts/github-release.mjs --tag v3.0.2 --target main `
  --name "多分课表 v3.0.2 —— 安全审查整改 + 致谢口径" --notes RELEASE_NOTES.md `
  --asset "duofen-kebiao-3.0.2.apk=app/build/outputs/apk/release/app-release.apk" `
  --asset "duofen-kebiao-3.0.2-web.zip=build/release/duofen-kebiao-3.0.2-web.zip"

# 只整理历史、不建新版本
node --use-system-ca scripts/github-release.mjs --tag v3.0.2 --prune-only
```

`--asset` 的名字可以省略：省略时按 tag 自动命名（`.apk` → `duofen-kebiao-<版本>.apk`，`.zip` → `duofen-kebiao-<版本>-web.zip`）。

> `--use-system-ca` 是必要的：本机 Node 默认信任链校验不到中间证书（`UNABLE_TO_VERIFY_LEAF_SIGNATURE`）。
> APK 取的是 Gradle 的实际输出路径 `app/build/outputs/apk/release/app-release.apk`；web zip 需自己打包后放进 `build/release/`。

### Release 签名

release 构建默认**回退 debug 签名**，只够自用。要换成正式签名，把 `keystore.properties.example` 复制成仓库根的 `keystore.properties` 并填好四项（`storeFile` 相对仓库根解析），构建时会自动启用；该文件已在 `.gitignore` 中忽略。

### 仓库卫生

**安装包与压缩包不进仓库**（APK / web zip 只是 Release 附件，Pages 上不再托管 APK）：

- `.gitignore` 忽略 `*.apk` / `*.aab` / `*.zip` 等；
- `npm run check:hygiene`（`scripts/check-repo-hygiene.mjs`）在本地提交前检查，被跟踪的安装包/压缩包会让守卫变红（防 `git add -f` 与 PR 里塞二进制）；
- 最新版直链：`https://github.com/tequed232/duofen-kebiao/releases/latest`（历史版本见私有归档仓库；旧链接 `tequed232.github.io/duofen-kebiao/enhance.apk` 已失效）。

线上部署同样用 `scripts/verify.mjs` 回归：

```powershell
$env:OUT_DIR='screenshots-live'; node scripts/verify.mjs https://tequed232.github.io/duofen-kebiao/
```

## 设计实现要点

- **动态配色** — `web/src/theme/palette.ts`。能从环境拿到用户强调色时（`?seed=`、`window.__MD_SYS_SEED__`、已存强调色、CSS `accent-color`），用 `@material/material-color-utilities` 的 **SchemeExpressive**（高对比度）生成全套角色；拿不到就用题目给定的 Green 备用配色逐值写入。所有 UI 只引用 `--md-sys-color-*` 角色，代码里没有写死颜色。
- **动效** — `web/src/theme/motion.ts` 解析求解 M3 Expressive 的物理弹簧（spatial 0.9 / effects 1.0 阻尼比，stiffness 1400·700·300 / 3800·1600·800），生成 CSS `linear()` 缓动与时长并写入自定义属性，用于页面转场、面板展开、消息条与涟漪反馈。
- **页面栈导航** — `web/src/nav/navigation.tsx`：`slide`（右侧滑入）/ `fade`（淡入）/ `zoom`（缩放弹簧）三种转场，栈同步到 `history.state`，系统返回手势与返回键和页面内返回按钮行为一致（反向播放进入动画）。
- **图标** — Material Symbols Rounded；子集裁剪与校验见上文「技术栈」。

## 自动化验证

`npm run verify`（Playwright + Chromium，412×892 视口）走的真实流程：

```
课表首页渲染（四日表格 4 列 × 4 段 × 7 节次）→ 点开教材窗口 / 关闭 → 设置页
→ 教材识别接口页（填地址与密钥、保存）→ 返回设置
→ 课表：点击课程详情 → 教材封面匹配与标记 → 拖动切换日期窗口 → 下滑收起 / 点摘要展开
→ 筛选屏检索 → 结果高亮定位 → 课表数据导入面板 → 导入后课表出现新课 → 恢复演示课表
```

> 语音 / 相机 / 记录相关步骤已随功能删除一并移除（见 `test(verify)` 提交）。
> 逐步结果（含逐屏截图路径）都会写进 `screenshots/report.json`，0 报错才算通过。

结果：全部步骤通过、**0 个 console 错误、0 个 page error**（逐步结果见 `screenshots/report.json`）；截图见 `screenshots/`（`report.json` 内含配色、尺寸与令牌核对数据）。线上部署（GitHub Pages）用同一套脚本跑过一遍，截图与报告在 `screenshots-live/`。

## 反爬防火墙（Anubis）与持续监控

站点前面可以挂一层 [Anubis](https://github.com/TecharoHQ/anubis)（TecharoHQ）—— 用工作量证明挡住 AI 抓取器与脚本爬虫，真人首访只有几百毫秒的静默计算。配置与监控都在仓库里：

- `deploy/anubis/docker-compose.yml` — Anubis + Caddy（TLS/限速），Anubis 固定版本并暴露 `/metrics`
- `deploy/anubis/botPolicies.yaml` — 放行搜索引擎、拒绝 AI 抓取器与常见脚本 UA、按权重分档挑战
- `deploy/anubis/Caddyfile` — 域名 TLS、限速、安全响应头，`reverse_proxy` 到 Anubis
- `deploy/anubis/VERSION` — 锁定的上游版本
- Anubis 上游监控（原为随仓库附带的每日巡检工作流，已随 Actions 一并移除，待重新配置）：比对上游 release、校验策略文件、并在配置了 `ANUBIS_BASE_URL` secret 时探活线上实例

> GitHub Pages 不能直接跑 Anubis（它需要自己的服务器作为反向代理）。做法是：域名解析到 VPS，Caddy 终止 TLS 后交给 Anubis，Anubis 回源到 `https://tequed232.github.io/duofen-kebiao`。详细的部署步骤、Prometheus 抓取配置与告警建议见 [`deploy/anubis/README.md`](./deploy/anubis/README.md)。

## 相关文档

- [docs/live-activity-plan.md](./docs/live-activity-plan.md) —— 灵动岛/实况通知的现状评估与两条路线（本地调度 vs Cloudflare 远程触发）
- [docs/writing-style.md](./docs/writing-style.md) —— 协作与表达约定（中文高语义 / 允许一词多义 / 参照国内开源项目 / AI 思考展示的口径）
- [docs/promo-brief.md](./docs/promo-brief.md) —— 宣传片创作说明（交给视频制作方 / MiniMax：创作要点、分镜、提示词、授权与禁止项）
- [docs/commit-convention.md](./docs/commit-convention.md) —— 提交信息规范
- [docs/asset-permissions.md](./docs/asset-permissions.md) —— 素材授权台账
- [docs/PROJECT-STATE.md](./docs/PROJECT-STATE.md) —— 项目现状与坑位记录

## 唯一设计基准：Web

**所有功能（课表、筛选、教材、设置、关于、开源相关…）都以 `web/` 为唯一设计基准。**

APK 不含任何自有界面：`app/` 里只有两个 Kotlin 文件 ——

| 文件 | 作用 |
| --- | --- |
| `MainActivity.kt` | WebView 宿主：加载 APK 内嵌的同一个 Web 构建；只做原生权限、SAF 文件选择、外部跳转、返回键 |
| `LiveUpdates.kt` | Android 16 / ColorOS 流体云进度通知（网页通过 `window.DuofenNative.liveUpdate()` 调用） |

构建链路保证不会漂移：

```bash
npm run build          # 产出 dist/（网页）
npm run apk            # preBuild 自动把 dist/ 同步进 app/src/main/assets/www 后编译
npm run apk:parity     # 逐文件比对 APK 内嵌资源与 dist/（文件名 + sha256），不一致即失败
node scripts/visual-parity.mjs   # 同一虚拟设备分别截 APK 内嵌资源与线上网页，逐屏对照
```

版本号也只有一个来源：`web/src/lib/meta.ts` 的 `APP_VERSION`（APK 的 versionName/versionCode 由它推导）。以前那套自绘的 Compose 课表页 / RTF 解析器 / 教材数据已经删除，避免出现第二套会漂移的实现。

## 素材授权

任何第三方素材进入本仓库之前，都必须先在 [`docs/asset-permissions.md`](./docs/asset-permissions.md) 留下**书面授权记录**；没有记录的素材一律不得进入代码或构建产物。当前插画作者 **miratsu**（Bilibili 空间 18112887）已通过审核，但尚未明确 CC 授权框架，暂不引入，状态与私信模板见该文档；原有一个每周提醒的工作流随 Actions 一并移除，状态更新请手动跟进。

构建产物里的图片只有一类：「致谢 · 名片墙」上各人的**公开头像**（GitHub / B 站，已登记在 `docs/asset-permissions.md`）。课表页头图暂缺（主美会另出，到位后按台账流程登记再启用）。早期版本用过的插画已于 **v1.0.9** 全部下架，安装图标与界面装饰改由 **Material Symbols Rounded** 字形 + **Material 3 Expressive** 形状语汇自行绘制，配色一律取 `--md-sys-color-*` 角色。

## 贡献者

> 提交信息统一按 [`docs/commit-convention.md`](./docs/commit-convention.md) 写：`类型(范围): 中文描述`。

应用「关于 → 致谢 · 名片墙」与 [CONTRIBUTORS.md](./CONTRIBUTORS.md) 是**同一份名单**（数据源：`web/src/lib/meta.ts` 的 `CREDITS`），名片墙为 1×3（作者本人整行）+ 其余三列排布（最后一行不满时最后一张跨列补满）：

| 名片 | 角色 | 链接 |
| --- | --- | --- |
| 罗xx | 作者 · 项目发起 · 界面动效 · 数据与部署 | [GitHub](https://github.com/tequed232) · [Bilibili](https://space.bilibili.com/407275151) · [抖音](https://www.douyin.com/user/MS4wLjABAAAAj-LAgjc_F9yWFAa3YycsNF9f_E1M3JiLa5ilAzSTn9hJs_44MtP_mM_2DbyLH06F) |
| 饼干233 | 翻译 · 同学 | [GitHub](https://github.com/BS-keke) · [Bilibili](https://space.bilibili.com/449528062) |
| 维舟（来自MAA-Meow） | 该项目顾问 | [GitHub](https://github.com/WhiteMoon319) |
| Hanbing | 主美画师 · 同学 | [Bilibili](https://b23.tv/0rKu2FX) |
| 椿湫 | 导师 | [GitHub](https://github.com/fxxggllj) |

名片墙上每个入口都带对应平台的**剪影图标**（GitHub / Bilibili / 抖音 / X），路径内联在 `web/src/components/brands.tsx`，来自 [Remix Icon](https://github.com/Remix-Design/RemixIcon)（Apache-2.0）。

**作品许可**（名片上的 CC 标记，点开可看授权原文）：

- **寒冰（Hanbing）**：**CC BY** —— 署名使用，**不允许任何形式的 AI 修改**；凭据 `docs/permissions/hanbing-cc-by.jpg`。

## Liquid Glass 视觉与引用

底边栏与应用标识采用 Liquid Glass 质感（半透明玻璃药丸 + 冰彩渐变 + 顶部反光），由项目以 SVG/CSS 自行绘制，不嵌入任何图片素材；实现思路参考以下开源库，特此致谢：

- [rdev/liquid-glass-react](https://github.com/rdev/liquid-glass-react)（6.2k stars）— Apple 风格 Liquid Glass 的 React 实现（SVG 位移折射 + 鼠标高光）
- [AndrewPrifer/liquid-dom](https://github.com/AndrewPrifer/liquid-dom)（2.5k stars）— 面向 Web 的实时 DOM 玻璃透镜折射
- [shuding/liquid-glass](https://github.com/shuding/liquid-glass)（1.2k stars）— 可复制的 Liquid Glass 着色器（SVG + Canvas）

设置 → 底边栏风格（互斥）可在 **Liquid Glass** 与 **Material 3 原生导航栏** 之间切换。

## 声明

Tequed232 拥有本项目的最终解释权。

<!-- 注意：下面这一区块由 `node scripts/collect-licenses.mjs` **整块重写**。
     任何手工内容都不要写进 BEGIN/END 之间 —— 生成器是
     `replace(BEGIN…END, 新块)`，写在里面的东西下次生成就没了。
     「声明」原先就在里面，因此每跑一次生成器就被吃掉一次，现已移到标记之外。 -->
<!-- LICENSES:BEGIN -->
## 开源相关（Open source）

本项目共引入 **21** 个开源依赖，按用途分门别类列出（与设置里「关于 → 开源相关」一致）。
感谢每一位作者与维护者。

> 自动生成：修改依赖后运行 `node scripts/collect-licenses.mjs` 重新整理。

### 界面与组件

_界面框架与 Material 3 组件_

| 名称 | 版本 | 许可 | 版权 / 开发者 |
| --- | --- | --- | --- |
| [@material/web](https://github.com/material-components/material-web) | 2.5.0 | Apache-2.0 | 未提供版权方信息 |
| [react](https://react.dev/) | 19.3.0 | MIT | 未提供版权方信息 |
| [react-dom](https://react.dev/) | 19.3.0 | MIT | 未提供版权方信息 |

### 设计系统 · 图标 · 字体

_配色算法、图标字体与字体裁剪_

| 名称 | 版本 | 许可 | 版权 / 开发者 |
| --- | --- | --- | --- |
| [@fontsource/roboto](https://fontsource.org/fonts/roboto) | 5.3.0 | OFL-1.1 | Google Inc. |
| [@material/material-color-utilities](https://github.com/material-foundation/material-color-utilities/tree/main/typescript) | 0.4.0 | Apache-2.0 | Material Eng |
| [fontkit](https://www.npmjs.com/package/fontkit) | 2.0.4 | MIT | Devon Govett |
| [material-symbols](https://marella.github.io/material-symbols/demo/) | 0.47.4 | Apache-2.0 | 未提供版权方信息 |
| [Roboto](https://fonts.google.com/specimen/Roboto) | variable | Apache License 2.0 | Google Fonts |
| [subset-font](https://github.com/papandreou/subset-font) | 2.7.0 | BSD-3-Clause | Andreas Lind |

### 构建与开发工具

_打包、类型与样式处理_

| 名称 | 版本 | 许可 | 版权 / 开发者 |
| --- | --- | --- | --- |
| [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/tree/main/packages/plugin-react) | 5.2.0 | MIT | Evan You |
| [typescript](https://www.typescriptlang.org/) | 5.9.3 | Apache-2.0 | Microsoft Corp. |
| [vite](https://vite.dev) | 7.3.6 | MIT | Evan You |

### 测试与验证

_自动化验收与逐屏视觉校验_

| 名称 | 版本 | 许可 | 版权 / 开发者 |
| --- | --- | --- | --- |
| [playwright](https://playwright.dev) | 1.63.0 | Apache-2.0 | Microsoft Corporation |

### Android 运行时

_APK（WebView 宿主）用到的库_

| 名称 | 版本 | 许可 | 版权 / 开发者 |
| --- | --- | --- | --- |
| [androidx.activity:activity-ktx](https://developer.android.com/jetpack/androidx/releases/activity) | 1.10.0 | Apache License 2.0 | The Android Open Source Project |
| [androidx.core:core-ktx](https://developer.android.com/jetpack/androidx) | 1.15.0 | Apache License 2.0 | The Android Open Source Project |
| [androidx.webkit:webkit](https://developer.android.com/jetpack/androidx/releases/webkit) | 1.12.1 | Apache License 2.0 | The Android Open Source Project |
| [Kotlin Standard Library](https://kotlinlang.org) | 2.0.x | Apache License 2.0 | JetBrains |

### 部署与安全

_反爬、CDN 与持续监控_

| 名称 | 版本 | 许可 | 版权 / 开发者 |
| --- | --- | --- | --- |
| [Anubis](https://github.com/TecharoHQ/anubis) | v1.27.0（deploy/anubis 锁定） | MIT License | TecharoHQ |
| [Cloudflare CDN / Pages](https://www.cloudflare.com) | — | 商业服务（配置见 deploy/cloudflare） | Cloudflare, Inc. |

### 其他

_未归类的依赖_

| 名称 | 版本 | 许可 | 版权 / 开发者 |
| --- | --- | --- | --- |
| [@types/react](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/react) | 19.3.0 | MIT | Asana |
| [@types/react-dom](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/react-dom) | 19.3.0 | MIT | Asana |

### 参考实现（未引入代码）

| 名称 | 版本 | 许可 | 版权 / 开发者 | 说明 |
| --- | --- | --- | --- | --- |
| [AndroidLiquidGlass](https://github.com/Kyant0/AndroidLiquidGlass) | — | Apache License 2.0 | Kyant0 | 酷安底边栏液体玻璃的实现（本项目仅参考其思路：背景采样 + 色调 + 边缘渐隐 + 触摸光斑） |
| [Shapes](https://github.com/Kyant0/AndroidLiquidGlass) | — | Apache License 2.0 | Kyant | 酷安使用的形状库（胶囊/圆角） |
| [free_reflection](https://github.com/tiann/FreeReflection) | 2.0.0 | 未提供许可信息 | weishu | 酷安用于反射调用隐藏 API |
| [liquid-glass-react](https://github.com/rdev/liquid-glass-react) | 1.1.1 | MIT License | rdev | Apple 风格 Liquid Glass 的 React 实现（已装依赖，当前底边栏为自绘） |
| [liquid-dom](https://github.com/AndrewPrifer/liquid-dom) | — | MIT License | Andrew Prifer | Web 端玻璃透镜折射参考 |
| [shuding/liquid-glass](https://github.com/shuding/liquid-glass) | — | MIT License | Shu Ding | SVG + Canvas 玻璃着色器参考 |

<!-- LICENSES:END -->

## 相关文档

- [docs/live-activity-plan.md](./docs/live-activity-plan.md) —— 灵动岛/实况通知的现状评估与两条路线（本地调度 vs Cloudflare 远程触发）
- [docs/writing-style.md](./docs/writing-style.md) —— 协作与表达约定（中文高语义 / 允许一词多义 / 参照国内开源项目 / AI 思考展示的口径）
- [docs/promo-brief.md](./docs/promo-brief.md) —— 宣传片创作说明（交给视频制作方 / MiniMax：创作要点、分镜、提示词、授权与禁止项）
- [docs/commit-convention.md](./docs/commit-convention.md) —— 提交信息规范
- [docs/asset-permissions.md](./docs/asset-permissions.md) —— 素材授权台账
- [docs/PROJECT-STATE.md](./docs/PROJECT-STATE.md) —— 项目现状与坑位记录
