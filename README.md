## ⚠️ 致歉声明（Apology）

本项目早期版本（**v1.0.8 及以前**）在界面、开屏页与 Android 安装图标中，使用了**未经授权**的第三方美术素材：

- 来自 Bilibili 创作者（空间号 **18112887**）的插画作品；
- 一张学校教材宣传图（广东财贸职业学院 · 官方教材呈现）。

我们在未取得作者许可、也未标明出处的情况下使用了这些素材，**对此深表歉意**。这是我们版权意识不足造成的错误，
与上述作者及学校无关。

**处理结果（v1.0.9 起）：**

- 上述素材已从仓库、Web 构建产物与 APK 中**全部删除**（`web/public/art/` 已移除，代码中不再引用任何图片文件）；
- 安装图标改用 **Material Symbols Rounded** 字形 + **Material 3 主色**重新绘制；
- 界面装饰元素改用 **Material 3 Expressive** 自带的形状语汇（cookie / clover / burst / sunny / pill）；
- 项目自此**只使用 Material 3 官方资源**（Material Symbols 图标、Roboto 字体、M3 配色与形状），颜色一律取 `--md-sys-color-*` 角色。

若相关权利人认为仍有需要处理的内容，请通过本仓库的 Issue 联系我们，我们会**第一时间删除或补办授权**。
在此再次向被侵权的作者致歉。

---
# 多分课表（使用DeepSeek Harness，Google Gemini，M3ECanvas制作，本人仅有一点点审美技巧和Python开发经验 ）
 作于2026.9.19 时年大一

Material 3 Expressive 风格的移动端 Web 应用：**实时语音转文字 + 图片转文字总结 + 历史记录 + 设置/API 配置**。
目标形态为竖屏手机 **412 × 892dp**，浏览器内运行（`dist/` 为可直接部署的 production build）。

**在线体验：<https://tequed232.github.io/duofen-kebiao/>** · **发布：<https://github.com/tequed232/duofen-kebiao/releases>**

> 仓库同时包含一份 Kotlin/Compose 的 Android 实现（`app/`，Gradle 工程）。本 README 描述 **Web 实现**。

---

## 部署与发布

GitHub Pages（`main` 分支根目录）直接托管生产构建：仓库根部的 `index.html` + `assets/` 就是 `dist/` 的内容，
上一版单文件页面保留在 `legacy/index.html`，`.nojekyll` 关闭 Jekyll 处理。更新线上版本：

```powershell
npm run build
Copy-Item dist\index.html index.html -Force
Remove-Item assets -Recurse -Force; Copy-Item dist\assets assets -Recurse
git add -A; git commit -m "Publish web build"; git push
```

生成 GitHub Release（Web 构建 zip + Android APK）：

```powershell
# 取出本机已保存的 GitHub 凭据（Git Credential Manager），不会打印 token
$out = "protocol=https`nhost=github.com`n" | git credential fill
$env:GITHUB_TOKEN = ($out | Select-String '^password=').Line.Substring(9)

node --use-system-ca scripts/github-release.mjs --tag v1.0.2 --target main `
  --name "v1.0.2 · Material 3 Expressive 语音图片笔记" --notes RELEASE_NOTES.md `
  --asset "m3-expressive-web-1.0.2.zip=build/release/m3-expressive-web-1.0.2.zip" `
  --asset "m3-expressive-android-1.0.2.apk=build/release/m3-expressive-android-1.0.2.apk"
```

> `--use-system-ca` 是必要的：本机 Node 默认信任链校验不到中间证书（`UNABLE_TO_VERIFY_LEAF_SIGNATURE`）。

线上部署同样用 `scripts/verify.mjs` 回归：

```powershell
$env:OUT_DIR='screenshots-live'; node scripts/verify.mjs https://tequed232.github.io/duofen-kebiao/
```

---

## 快速开始

```bash
npm install
npm run build      # 生成 Material Symbols 子集 -> 校验图标 -> vite build
npm run preview    # 预览 production build (http://127.0.0.1:4173)
npm run dev        # 开发模式 (http://127.0.0.1:5173)
npm run verify     # 用 Chromium 真机视口跑一遍全流程并截图（screenshots/）
```

**交付物：`dist/`**（53 个文件、约 1.5 MB）— 纯静态站点，任意静态服务器直接托管即可。

```
dist/
  index.html                       入口（相对路径引用，可放在任意子目录）
  assets/index-*.js  425 KB        React + Material Web + 业务代码
  assets/bootstrap-*.js 292 KB     Material Web 组件
  assets/index-*.css  75 KB        设计令牌 + 组件样式
  assets/material-symbols-rounded-subset-*.woff2  77 KB   Material Symbols Rounded（71 个图标子集）
  assets/roboto-*-normal-*.woff2                  Roboto 400/500/700（本地字体，离线可用）
```

---

## 屏幕与功能

| 路由 | 屏幕 | 主要能力 |
| --- | --- | --- |
| `home` | 主页 | 实时语音转文字容器（点击 → 全屏面板）、总结/重点/思维导图容器（点击 → 全屏面板）、长按输入框进入提问模式、"拍照 / 导入图片" 相连按钮组、导航栏 |
| `camera` | 摄像 | `getUserMedia` 实时预览（圆角 20dp）、预览左上角"返回"填充按钮、标签输入（含历史标签建议）、快门写入记录并调用图片转文字 API |
| `history` | 历史 | "最近三次记录"顶部应用栏 + more_vert 菜单、搜索框、记录卡片列表、卡片菜单（查看/编辑/删除）、空状态 |
| `settings` | 设置 | 6 项列表（3dp 间距、28dp 外圆角 / 8dp 内圆角）+ 叠放其上的开关与两个 Expressive 滑块 + 默认跳转地图、已保存消息条（撤销） |
| `record` | 屏幕 5 · 记录详情 | 图片多浏览轮播 → 全屏查看器（左右滑动 / 下滑关闭）、文字要点容器 → 可滚动全屏面板、顶部返回 / 编辑 / 删除（确认对话框） |
| `apiEdit` | API 修改 | 语音转文字 / 图片转文字 / 问答 API 与密钥、380×380 测试图片占位、刷新（重新载入）与删除全部 API（确认对话框）、保存后消息条 + 撤销 |
| `schedule` | 课表 · 多分课表 | 内嵌课表 + 四日表格（上午/中午/下午/晚上时间轴、左右拖动跟手切换日期窗口）、点击课程查看老师/时间/地点、点击地点启动地图导航、课表数据导入面板 |
| `scheduleFilter` | 筛选 | 老师 / 课程 / 地点 / 时间 四个标签检索，结果按 课程·老师·地点 三列排列，点击回到课表并高亮 5 秒 |
| `blank` | 屏幕 7 | 按草图保留的空屏幕 |

### 课表（自主嵌入）

* `scripts/import-schedule.mjs` 解析学校教务系统导出的 `学生课表.doc`（RTF 表格），同时生成
  Web 的 `web/src/data/schedule.ts` 与 Android 的 `ScheduleData.kt` —— 应用启动即自带课表
  （广东财贸信创3班版权所有 · 2026-2027-1 · 7 节次 × 7 天 · 24 门课），不需要运行时导入。
* **4×4 容器 + 左右翻页**：容器是四行（**上午 / 中午 / 下午 / 晚上**）× 四列的表格，一周按 **7 天** 计算，
  左右**拖动跟手翻页**（第 1 页 周一–周四，第 2 页 周五–周日 + 下周一），底部有页码圆点与左右翻页按钮；
  点击某天选中该日，下方列出当天课程。
* **识别课表月份**：解析出的周次会换算成具体日期，顶部显示"2026年9月 · 9月17日 周四"与**课表覆盖 2026年8月 – 2027年1月**；
  点按该按钮弹出月份/日期选择器（列出学期内每个月的教学周区间，也可按具体日期跳转），选择后自动定位到对应教学周与星期。
  课程详情里还会列出该课的具体上课日期（共 N 次课、跨哪几个月）。
* 周次：按学期开始日期（可改）计算当前教学周，表格只显示该周实际开设的课程；◀ ▶ 切换周次。
* **向下滑收起课表**：在课表上向下滑（或页面向下滚动）会把课表折叠成一行摘要（周次 · 星期 · 日期 · 当天课程数），
  腾出空间显示当天课程清单；点摘要行或向上滑即可展开。
* 课程详情：默认只显示课程名，点击后展开授课老师、节次时间、周次、上课日期与地点；点击地点即调用地图。
* 筛选屏：`老师/课程/地点/时间` 四标签 + 语音输入搜索词，点击结果回到课表并**高亮 5 秒**
  （若该课程不在当前周，自动切到它开课的那一周并提示）。
* 导入：`课表数据` 面板支持 `.doc/.rtf`、`.html` 表格、`.csv/.txt` 文本导入或恢复内置课表，结果存于 IndexedDB。

### 语音：录音试用与进度/通知

* **API 保存后先试用**：在 API 修改页保存了语音转文字API地址后，会立即弹出「录音试用语音转文字API」对话框：
  录制最长 15 秒（带计时、进度条与实时音量电平）→ 直接调用该接口 → 显示识别结果；失败给出具体原因，可重新录制。
* **快速开始点语音**：主页麦克风按钮点下后，容器内出现进度条（不确定进度 + 计时 + 停止按钮），
  同时发布**系统通知**（"正在录音 · 多分课表"，每秒刷新计时），停止后提示识别完成并自动收起——与 Android 端流体云卡片行为一致。

### Android（Android 16 / 天玑 9400 / ColorOS 流体云）

* `app/` 是同一套设计的 Compose 实现，导航栏同样包含 **课表** 标签页，课表数据与 Web 端同源。
* **流体云**：语音识别与拍照期间发布 Android 16 **Live Updates**
  （`Notification.ProgressStyle` + `setRequestPromotedOngoing(true)`），ColorOS 16 会渲染成**流体云**卡片；
  完成后显示结果并在数秒后自动收起。该 API 仅存在于 Android 16，代码用反射调用，
  因此同一份 APK 在旧系统上退化为普通进行中通知，在 Android 16 上则进入流体云。
* 已加入 `POST_NOTIFICATIONS` 运行时申请、`enableOnBackInvokedCallback`（Android 16 预测式返回）、
  `uses-feature camera/microphone required=false`、`windowSoftInputMode=adjustResize`。
* 本机 SDK 平台为 android-35，因此 APK 目前是 `targetSdk 35`（在 Android 16 / ColorOS 16 上正常运行）；
  安装 `platforms;android-36` 后把 `app/build.gradle.kts` 的 `compileSdk/targetSdk` 改成 36 并升级 AGP ≥ 8.9
  即可得到 targetSdk 36 构建。

### 真实数据

* 记录、设置、主页草稿全部写入 **IndexedDB**（`m3-expressive-notes`），刷新后保留；IndexedDB 不可用时自动降级到 `localStorage`。
* 没有示例/假数据：没有记录时显示空状态；没有图片时显示占位符；没有配置 API 时明确提示而不是编造结果。
* 语音识别的置信度门限由"语音输入强度"设置控制；拍摄分辨率与 JPEG 画质由"相机清晰度"设置控制（两者都真实生效并持久化）。
* 提问回答来源分为：`问答接口`（已配置且调用成功）、`本次记录内容`（在真实转写/总结中检索到的片段）、`未找到相关内容`（会新建分支但如实说明）。

---

## 设计实现要点

* **动态配色** — `web/src/theme/palette.ts`。能从环境拿到用户强调色时（`?seed=`、`window.__MD_SYS_SEED__`、已存强调色、CSS `accent-color`），用
  `@material/material-color-utilities` 的 **SchemeExpressive**（高对比度）生成全套角色；拿不到就用题目给定的 Green 备用配色逐值写入。所有 UI 只引用
  `--md-sys-color-*` 角色，代码里没有写死颜色。
* **动效** — `web/src/theme/motion.ts` 解析求解 M3 Expressive 的物理弹簧（spatial 0.9 / effects 1.0 阻尼比，stiffness 1400·700·300 / 3800·1600·800），
  生成 CSS `linear()` 缓动与时长并写入自定义属性，用于页面转场、面板展开、消息条与涟漪反馈。
* **页面栈导航** — `web/src/nav/navigation.tsx`：`slide`（右侧滑入）/ `fade`（淡入）/ `zoom`（相机缩放弹簧）三种转场，栈同步到 `history.state`，
  系统返回手势与返回键和页面内返回按钮行为一致（反向播放进入动画）。
* **组件** — 一律使用 **Material Web**（`@material/web`）标准组件：filled/outlined/tonal/text button、outlined text field、switch、slider、navigation bar/tab、
  filled/elevated/outlined card、dialog、menu、list-item、fab、divider、icon、circular-progress、ripple。库里没有的（顶部应用栏、消息条、轮播、全屏查看器、可展开面板）
  才自行实现。
* **图标** — Material Symbols Rounded；`scripts/subset-icons.mjs` 用 fontkit 把 5.2 MB 变量字体按 PUA 码位裁剪到 **77 KB**（保留 FILL/GRAD/opsz/wght 轴），
  `scripts/check-icons.mjs` 在构建时保证没有图标名漏出子集。

## 浏览器验证

`npm run verify`（Playwright + Chromium，412×892 视口，含虚拟摄像头）走的真实流程：

```
主页渲染 → 容器全屏面板展开/收起 → 历史/设置/API 页 → 相机实时预览 → 快门生成记录
→ 历史卡片 → 记录详情 → 图片全屏查看器 → 文字面板 → 刷新后记录仍在（IndexedDB）
→ 深色模式开关 + 撤销 → 删除确认对话框 + 取消 → 长按进入提问模式 → 提问生成思维导图分支
→ 滑块拖动 + 刷新后仍为 81% → 历史 more_vert 菜单
→ 课表：四日表格渲染（4 列 × 4 段 × 7 节次）→ 点击课程详情 → 拖动切换日期窗口
→ 筛选屏检索 → 结果高亮定位 → 课表数据导入面板
```

结果：**62 步全部通过，0 个 console 错误、0 个 page error**；截图见 `screenshots/`（`report.json` 内含配色、尺寸与令牌核对数据）。
线上部署（GitHub Pages）用同一套脚本跑过一遍，截图与报告在 `screenshots-live/`。

## 与草图的三处有意偏差

1. **深色模式开关**：题目要求"只做浅色模式"，但草图中的开关又必须可用。默认仍是浅色（设计目标），开关则用同一 seed 生成的 Expressive 深色方案真实生效并持久化，
   不使用死控件。
2. **图标语义**：设置列表中"深色模式""关于本软件"使用 `dark_mode` / `info`（草图里两处都写 `person`，明显是占位）。
3. **屏幕 5 只有一个顶部应用栏**：草图把同一个 "Title" 应用栏叠了两遍，实际实现为一个（返回 / 编辑 / 删除），避免出现两条一样的标题栏。
   旋转木马按草图为 4 张卡片的布局，但只渲染真实存在的图片（不造假的图片数据）。

## 目录

```
web/index.html            Vite 入口
web/src/
  main.tsx bootstrap.tsx  Material Web 注册、主题引导
  App.tsx                 412×892 舞台 + 屏幕栈 + 消息条
  components/             md.tsx（Material Web 封装）、layout / overlays / content
  screens/                7 个屏幕
  nav/ state/ lib/ theme/ 导航、全局状态、IndexedDB / 语音 / API / 图像、设计令牌
scripts/                  subset-icons.mjs、check-icons.mjs、import-schedule.mjs、rtf-dump.mjs、
                          verify.mjs、github-release.mjs、serve-dist.mjs
legacy/index.html         上一版单文件页面（保留备查）
vite.config.ts            root=web，outDir=dist
app/src/main/java/com/app/m3expressive/
  MainActivity.kt         首页 / 历史 / 课表 / 设置 四个标签页
  ScheduleTab.kt          Compose 版四日课表 + 地图选择
  ScheduleData.kt         内嵌课表（脚本生成）
  LiveUpdates.kt          Android 16 Live Updates / ColorOS 流体云
```

---

## 反爬防火墙（Anubis）与持续监控

站点前面可以挂一层 [Anubis](https://github.com/TecharoHQ/anubis)（TecharoHQ）——用工作量证明挡住
AI 抓取器与脚本爬虫，真人首访只有几百毫秒的静默计算。配置与监控都在仓库里：

* `deploy/anubis/docker-compose.yml` — Anubis + Caddy（TLS/限速），Anubis 固定版本并暴露 `/metrics`
* `deploy/anubis/botPolicies.yaml` — 放行搜索引擎、拒绝 AI 抓取器与常见脚本 UA、按权重分档挑战
* `deploy/anubis/Caddyfile` — 域名 TLS、限速、安全响应头，`reverse_proxy` 到 Anubis
* `deploy/anubis/VERSION` — 锁定的上游版本
* `.github/workflows/anubis-watch.yml` — **持续监控**：每天比对上游 release（有新版本自动开 issue）、
  校验策略文件、并在配置了 `ANUBIS_BASE_URL` secret 时探活线上实例

> GitHub Pages 不能直接跑 Anubis（它需要自己的服务器作为反向代理）。做法是：域名解析到 VPS，
> Caddy 终止 TLS 后交给 Anubis，Anubis 回源到 `https://tequed232.github.io/duofen-kebiao`。
> 详细的部署步骤、Prometheus 抓取配置与告警建议见 `deploy/anubis/README.md`。

---

## 贡献者

见 [CONTRIBUTORS.md](./CONTRIBUTORS.md)：感谢 [@liuli1719](https://github.com/liuli1719)（小妍）的界面走查与体验反馈。

---

## Liquid Glass 视觉与引用

底边栏与应用标识采用 Liquid Glass 质感（半透明玻璃药丸 + 冰彩渐变 + 顶部反光），
由项目以 SVG/CSS 自行绘制，不嵌入任何图片素材；实现思路参考以下开源库，特此致谢：

* [rdev/liquid-glass-react](https://github.com/rdev/liquid-glass-react) ⭐6.2k — Apple 风格 Liquid Glass 的 React 实现（SVG 位移折射 + 鼠标高光）
* [AndrewPrifer/liquid-dom](https://github.com/AndrewPrifer/liquid-dom) ⭐2.5k — 面向 Web 的实时 DOM 玻璃透镜折射
* [shuding/liquid-glass](https://github.com/shuding/liquid-glass) ⭐1.2k — 可复制的 Liquid Glass 着色器（SVG + Canvas）

设置 → 底边栏风格（互斥）可在 **Liquid Glass** 与 **Material 3 原生导航栏** 之间切换。

---

## 唯一设计基准：Web

**所有功能（课表、识别/记录、历史、设置、筛选、教材、关于…）都以 `web/` 为唯一设计基准。**

APK 不含任何自有界面：`app/` 里只有两个 Kotlin 文件——

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

版本号也只有一个来源：`web/src/lib/meta.ts` 的 `APP_VERSION`（APK 的 versionName/versionCode 由它推导）。
以前那套自绘的 Compose 课表页 / RTF 解析器 / 教材数据已经删除，避免出现第二套会漂移的实现。
