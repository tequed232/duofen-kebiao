# 项目当前状态

> 这份文件的目的：把会话里的关键状态**固化到仓库**，这样即使清空对话上下文、或换人接手，也不会丢信息。
> 最后更新：v3.5.5（设置页六组卡片 + 通知栏桌宠 + 底栏散射可选档 + 单色等高线背景）。
> 本批还补了两条会"安静地坏"的守卫：`check-settings-groups.mjs`（分组归属 + 控件行归属 + 条目不许嵌套）
> 与 `check-contour.mjs`（等高线接线与生成器不变式）；两者都按「先证明它能红」验过。

## 当前版本与入口

| 项 | 值 |
| --- | --- |
| 版本 | `APP_VERSION = 'v3.5.4'`（`versionCode 30504` / `versionName 3.5.4`） |
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
| 应用插画 | 已完成（2026-09-25） | 作者那张插画在**四个位置共用一份**：启动页大图 / 主页左上角头像 / 关于页 hero / 关于页「视觉与图标」。链路 `docs/icon-source.jpg`（2048×2048 DLSS 超分原图）→ `web/src/assets/illustration.jpg`（逐字节相同）→ `meta.ts` 唯一出口 `APP_ART`。**必须走打包器导入**：写 `/illustration.jpg` 这种站根绝对路径在 APK 里会 404（页面从 `assets/www/` 提供），网页版却看不出来 —— 2026-09-25 真机上因此「美术资源全没了」。守卫 `npm run check:artwork`（11 项：逐字节同源 / 原图 ≥1800 / 唯一出口 / 四处引用 / 禁站根绝对路径 / 四处不变形），两向反证已验证 |
| 应用图标 | 已完成（v3.5.4 换新） | 作者 2026-09-24 提供的 **DLSS 超分 2048×2048** 原图（`docs/icon-source.jpg`）→ 18 张（安卓 5 档密度 × 方形/圆形/前景 2/3 安全区 + 网页 4 张；`web/src/assets` 里那份 192 已随 `APP_ICON` 下线，网页侧只留 `web/public/icon-192.png` 一份）。口径单点在 `scripts/icon-targets.mjs`，生成 `npm run icons:app`，守卫 `npm run check:app-icons`（逐像素核对） |
| 贡献者名片墙 | 已接入应用 | 「关于 → 致谢 · 名片墙」：作者 1×3（跨三列）+ 其余按三列排（最后一行不满时最后一张跨列补满）；真头像（GitHub / B 站公开头像，已登记 `docs/asset-permissions.md`）+ 姓名首字兜底；平台剪影（Remix Icon）+ CC 许可标记；数据源 `web/src/lib/meta.ts` 的 `CREDITS`；宽屏设计稿 `preview/credits.html` |
| 致谢 / 致歉声明 | 已更新 | 删除 README 与关于页的「致歉声明」；名单同步到 README、`CONTRIBUTORS.md`、应用名片墙三处 |
| 仓库卫生 | 已加固 | 历史提交过的 8 个 `*.apk` 已全部 `git rm --cached` 剔除（现在 `git ls-files` 里没有任何 `.apk`）；`.gitignore` 忽略 `*.apk/*.aab/*.zip`；`scripts/check-repo-hygiene.mjs` 在本地提交前拦截（已做反向验证：塞进 APK 即守卫红）；APK 只作为 Release 附件，命名统一为 `duofen-kebiao-<版本>.apk` —— **`enhance.apk` 这类「始终最新」的别名已废弃**（见 `scripts/github-release.mjs` 头部注释，短链改用 release 直链） |

## 待办

按「能不能由本仓库自行完成」分三类 —— 这样「还剩什么」是可判定的，而不是一堆混在一起的条目。

### A. 可自主完成（无外部依赖）

1. ~~**发布名片墙改动**~~ —— **已完成**。`gh-pages` 上的当前构建就是 v3.5.3（`assets/bootstrap-EjpZRdwV.js`，2026-09-24 实测；同版本一并确认含「致谢 · 名片墙」）；而 `npm run apk:parity` 能通过并**证明 APK 内嵌资源与网页产物逐文件哈希一致** —— 「APK 还停在旧『关于』页」这个风险从此由这条守卫长期兜住（它此前一直假失败，见下方「易踩的坑」补充）。
2. ~~**重写 `scripts/verify.mjs` 的选择器**~~ —— **已完成**。它写于 v2 之前，一度 **19 步里 11 步失败**，而它当时没有任何自动检查在跑，所以烂了很久没被发现。修掉三处**静默失效**后 **19/0 全绿**：
   - 底栏搬出屏幕栈后，`.screen … .m3e-dock-tab` 作用域永不匹配，且失败不报错、只静默回落到 `md-navigation-tab` 超时；
   - 底栏切换不由 button 的 `click` 驱动（整个 `<nav>` 用 pointerdown/up 判定拖动 vs 轻点），`el.click()` 点了没反应**却仍然返回成功** —— 点 index 0 的步骤「通过」只是因为应用本来就停在首页；
   - 「回到今天」在 v3 起是右下角 FAB（`.schedule-today-fab`），脚本却按**索引 1** 点顶栏按钮，那里现在是「查看教材」，一点就被推离课表、后面十几项在错误页面上连锁失败。
   已接进本地守卫清单（`verify`），并做了活性验证：把「期望 2 页看板」改成 3 → 立刻报红。

### B. 阻塞：需要真机

3. **灵动岛实况复核**：设置 → 实时通知（流体云）→「发送实况测试」，看状态栏是否出现；`adb shell dumpsys notification --noredact | findstr promotedOngoing` 复核 `promotedOngoing=true`。
   （真机 realme GT7 在本次会话中接入过，覆盖安装与封面识别链路均已验；复核这项时设备已断开。本地识别已于 2026-09-27 下线。）
4. **界面缩放三档**的真机观感。

### C. 阻塞：需要作者决策（不自行决定）

5. **仓库拆分**：`duofen-kebiao-web` / `duofen-kebiao-android`（GitHub slug 只能用 ASCII）
   - 方案 A：Android 仓库存 www 预构建快照 + 同步脚本（两端同源）
   - 方案 B：Android 仓库只放原生代码，构建时从 Web 仓库下载产物
6. **名单口径**：liuli1719 的显示名（星爱流萤 / 小妍）、作者显示名（罗xx / 罗xx（Tequed232））仍待作者定夺。
   便于对照：`web/src/lib/meta.ts` 的 `CREDITS` 当前实际取值是 `罗xx`、`Hanbing`、`饼干`、`维舟`、`椿湫`（名片墙 5 张）。
7. **git 历史瘦身**：历史上提交过的 8 个 `.apk` 仍留在 git 对象库里，`.git` 实测 **128.9 MB**。要连历史一起瘦身必须 `git filter-repo` + 强推 —— 属**破坏性重写**，需作者明确同意后再做。

## 常用命令

```bash
npm run build                 # 网页构建（输出 dist/）
npm run icons:app             # 换了 docs/icon-source.jpg 之后：重生成全套应用图标（18 张）
npm run check:app-icons       # 图标守卫：与「按原图现算一遍」逐像素比对
npm run apk:parity            # APK 内嵌资源 ↔ 网页构建 逐文件哈希比对（现在两边应当**完全一致**）
npm run check:hygiene         # 仓库卫生：安装包/压缩包不允许被跟踪（APK 只进 Release）
node scripts/check-imports.mjs     # 导入自检（防「用了没导入」导致白屏）
node scripts/check-secrets.mjs     # 密钥扫描
node scripts/check-settings-groups.mjs  # 设置页分组：标题/顺序/归属/圆角成套 + 控件行绑主人 + 条目不许嵌套
node scripts/check-contour.mjs     # 等高线背景：接线（每屏内底纹、屏不透明）+ 生成器不变式（同种子同图）
node scripts/verify.mjs            # 逐屏验收（19 步）；需先 npm run build && npm run preview
node build/check-dock-dispersion.cjs   # 底栏色散：灰阶棋盘量「边缘有没有色散、中间有没有」
node build/check-dock.cjs              # 底栏跟手与配色（6 项）
node build/check-dock-tap.cjs          # 点按是不是「移过去」而不是闪现（4 项）
node build/shot-settings.cjs           # 设置页渲染层核对：打印真实分组顺序 + 几何自检「没有卡片套卡片」+ 分组截图
./gradlew assembleRelease          # 打 APK（产物在 app/build/，不进仓库）
```

Android 真机（作者机型 realme RMX6688 / 真我 GT7，Android 16；**设备自报** 1280×2800、density 560 → 3.5x。注：此前这里写 1080×2800，与 `wm size` 实测不符，已按实测更正）：

```powershell
D:\Android\Sdk\platform-tools\adb.exe install -r app\build\outputs\apk\release\app-release.apk
pwsh -File scripts/verify-device.ps1   # 一键：安装 + 截图 + 点底栏三格 + 拖拽 + 查实况通知
```

## 易踩的坑

1. **线上网页版发布**：原来由 CI 自动构建并发布到 `gh-pages`；Actions 已整体移除，改在本地构建后发布。不要再手工往仓库根目录拷 `dist/` —— 那批产物已从仓库剔除，并被 `.gitignore` 忽略。
2. **gradle 的 up-to-date 判定**会让新 `dist/` 不进 APK → 改完资源后清 `app/build/intermediates/{assets,merged_assets,packaged_assets}` 再打包。
3. **JSX 里「用了没导入」** 会整页白屏 → 每次改动先跑 `check-imports.mjs` + 本地渲染自检（`root` 渲染长度 > 0 且运行时错误为 0）。
4. **~~Chromium/WebView 丢弃 `backdrop-filter: url(#svg)`~~（2026-09 更正：此说法不成立）**。实测 Chromium 153 上 `url()` 与 `feImage` 位移图**都生效**，背景确实能被掰弯 —— 见 `scripts/check-backdrop-refraction.mjs`。当初的假阴性来自「用 `feImage` 做位移图、开/关截图一致」就判定 `url()` 被丢弃：`feImage` 取不到图时位移恒为 0，同样会一致，两者没分开测。教训是**量引擎行为时必须带一个必然生效的对照**（那里是 `blur`），否则一次假阴性会被写进文档再被四处引用。
5. **真机掉帧**多来自：逐帧 `getBoundingClientRect()`、改 `width`、移动元素挂 SVG 滤镜。
6. 仓库**不收录**构建产物与截图（曾因此被密钥扫描误报）。
7. **`apk:parity` 曾经"永远失败"（本地识别下线后已不再有例外）**：它把 APK 里多出的 22 个 `ocr/` 文件当成不一致，而那是**设计如此**（`stripLocalOcrFromDist` 把 `dist/ocr` 删掉保住网页产物 2.1 MB，`syncOcrAssets` 又把它塞进 APK）。现在只豁免 `ocr/` 这一个前缀，其它多出来的文件仍报不一致 —— 改这条守卫时**务必保留反向用例**，否则它会退化成"永远绿"。
8. **改含中文的脚本不要走 PowerShell 的文本 cmdlet**：`Set-Content` / `[IO.File]::WriteAllText` 会把 UTF-8 写坏（实测：3561 字节的文件涨到 5506 字节、中文全成乱码、node 直接报 ESM 加载失败）。用编辑工具或 Node 的 `fs` 写。
9. **「不在本地跑起来的守卫」等于没有守卫 —— 这个坑在本仓库已复现四次**：`apk:parity`（假失败）、`check-import-e2e`（选择器过期 → 永远报找不到输入框）、`verify.mjs`（19 步挂 11 步）、以及 `check-about-credits` 与 `check-imports`（**零 workflow 引用**，谁都没跑过）。它们共同的特征是**坏得很安静**，而人看到"仓库里有这个脚本"就以为覆盖到了。
   加新守卫时请一并做到两件事：**接进 `package.json` 的 `check:*` 脚本**（本地一条命令跑全量），并**按「先证明它能红」验一遍**（造一个它该抓的错，看它是否真报红）。只写脚本不接进 `check:*`，等于给自己留一个未来的假象。
10. **「回滚」要回滚干净 —— 半截回滚比不回滚更难发现**。2026-09 一次自查里连着撞见两次：
    - Android 的原生 Dock 在真机上「可见但点击无反应」被停用，但 `injectInsets()` 仍在给网页写 `--native-dock = 74px`。网页会为一个**并不存在**的底栏让位，于是「回到今天」等悬浮按钮在安卓上凭空抬高 74px（与底栏的缝从 14px 变 88px）—— **网页版正常、只有安卓版错位**，最容易在浏览器里验证时漏掉。量化脚本：`build/check-native-dock-offset.cjs`。
    - 教材数据的 Kotlin 拷贝在「Web 是唯一基线」时被删掉，但生成它的脚本 `import-textbooks.mjs` 留了下来，只产出一个没人编译、也没被 gitignore 的文件。
    停用一个子系统时，请连着清掉**它的宿主注入、它的数据产物、生成它的脚本、以及文档里"我们决定用它"的记载**；否则留下一堆"看起来还在工作"的管道。
    **2026-09-24 补充**：原生 Dock 停用后残留的一整套死代码（`NativeDock.kt` 死类、`dock` 死字段、`dockActive` 空桥、网页 `DuofenDock`/`nativeDockActive`、CSS 三处 `var(--native-dock,0px)`）已整类清掉，并新增守卫 `scripts/check-decommissioned.mjs`（双向验证：旧树全红 → 清完后通过），这类残留从此会被长期兜住。
11. **同一个选择器在文件后面再写一遍，前面的规则会整条失效 —— 而编辑器不会告诉你**。
    `schedule.css` 里 `.m3e-dock-slider` 出现了 6 次，其中第 1021 行那条写的
    `background` 与 `box-shadow`（「选中胶囊上缘偏冷、下缘偏暖」那圈色散描边）
    被第 1186 行那条同选择器**整条覆盖**，从来没渲染过 —— 作者看到的现象就是
    「液态玻璃的色散被删没了」，而代码里明明写着。改这类文件前先
    `grep -n '<选择器>'` 数一遍出现次数；能合并的就合并（这次是把色散描边并入最后那条）。
    同一处还叠了第二个更小的坑：`box-shadow` 三条里前两条几何完全重合（`inset 0 1px 0` ×2），
    白色那条把 22% 的冷色压在同一像素上冲淡掉了 —— **同几何的多层阴影等于只画了最上面那条**。
12. **"生成物"要有一个单点口径**。图标这类一次性生成、之后没人再看的资产，
    最怕"生成的"和"校验的"各写一套参数：换原图之后两边一起错、谁都不报红。
    这次把口径抽到 `scripts/icon-targets.mjs`，`make-icons.mjs` 与 `check-app-icons.mjs`
    共用同一份渲染配方，守卫再去比对"仓库里躺着的 == 现按原图生成的"。
    阈值也是量出来的：旧图标与现算结果**均值只差 5.75/255**（大片平坦深色底把均值摊薄了），
    单看均值会漏；主判据改成"相差超过 8 的像素占比"（旧 15.9%~47.9% vs 新 0%）才抓得住。
13. **按主题"重排"设置页时，JSX 是会被改坏的 —— 而且改坏了什么都不报**。2026-09-25 作者的原话是
    「流体云自检跑到其他位置去了😡」。一次脚本化重排（`build/regroup-settings.cjs`）只搬运
    `<md-list-item>` 块，结果留下两类伤：
    - **控件行成了孤儿**：三条挂在某个条目下面的控件行（`提前 N 分钟` 按钮、上下端安全区两条滑块、`发送实况测试` 按钮）
      被甩到了**别的组的组头**上 —— 页面照常渲染，只是"设置页中段有个按钮，跟上面的条目毫无关系"。
    - **条目被塞进条目里**：`等高线背景` 那一整块被插进了 `性能模式` 的 `<md-list-item>` **内部**（插在图标 div 之后、标题之前）。
      源码看是"条目都在、行号也对"，React 不报错，标签也配平；但渲染出来是一张卡片套在另一张卡片里，
      而且两个 `onClick` 都会冒泡触发 —— **点一次等高线同时弹出两个对话框**。
    教训：这类"结构正确性"必须**用结构断言兜**，而不是用"列表里有这个名字"。现在 `check-settings-groups.mjs` 有
    29 项，除分组归属外还有：控件行必须留在声明的分组内、且它**上方最近的条目正好是它的主人**；
    `<md-list-item>` 标签配平；**深度从不超过 1**（条目不许套条目）。
    双向验证：把按钮挪回「图像识别与资源」组头 → 红 2 条；把那条控件行复制一份 → 红 2 条；
    把 `等高线背景` 塞回 `性能模式` 内部 → 嵌套断言红（注意**配平断言仍是绿的**，只有嵌套断言抓得住）。
    渲染层再补一道独立的量：`build/shot-settings.cjs` 打印真实分组顺序并对所有 `md-list-item` 做矩形包含自检
    （"没有任何条目在几何上包含另一个"），源码断言与它必须同时成立才算修好。
