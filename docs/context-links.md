# 上下文链接总表

> 目的：把本项目涉及的全部链接集中一处，便于把上下文交给第三方（如 Gemini）审阅。
> 说明：标注「实测 HTTP 200」的链接在本会话中验证过可访问；未标注的为技术参考，未逐条实测。
> 整理时间：本会话最后一次推送 `91e9224`（v2.2）之后。

## 项目本体

| 用途 | 链接 |
| --- | --- |
| 仓库（公开） | https://github.com/tequed232/duofen-kebiao |
| 在线网页版（GitHub Pages） | https://tequed232.github.io/duofen-kebiao/ （实测 HTTP 200） |
| APK 短链（始终指向最新） | https://github.com/tequed232/duofen-kebiao/releases/latest/download/enhance.apk （**已从仓库剔除 APK**：原来 Pages 上的 `/enhance.apk` 已失效，安装包只作为 Release 附件） |
| 项目内文档目录 | https://github.com/tequed232/duofen-kebiao/tree/main/docs |

## 发布版本（GitHub Releases）

| 版本 | 发布页 | 主要资产 |
| --- | --- | --- |
| **v2.2**（当时最新） | https://github.com/tequed232/duofen-kebiao/releases/tag/v2.2 | `enhance-2.2.apk`、`enhance-web-2.2.zip` |
| v2.1.0 | https://github.com/tequed232/duofen-kebiao/releases/tag/v2.1.0 | `enhance-2.1.apk`、`enhance-web-2.1.zip` |
| enhance-1.5 | https://github.com/tequed232/duofen-kebiao/releases/tag/enhance-1.5 | `enhance-1.5.apk` |
| v2.0.0 | https://github.com/tequed232/duofen-kebiao/releases/tag/v2.0.0 | 早期 Web 包 |

APK 直链（按版本）：

- https://github.com/tequed232/duofen-kebiao/releases/download/v2.2/enhance-2.2.apk （实测 HTTP 200）
- https://github.com/tequed232/duofen-kebiao/releases/download/v2.1.0/enhance-2.1.apk （实测 HTTP 200）
- ~~https://tequed232.github.io/duofen-kebiao/enhance-2.2.apk~~ 已失效：APK 全部从仓库剔除，只保留 Release 附件（历史版本仍在 Releases 里，Pages 上不再托管任何安装包）

> 更早的 v1.0.x 系列发布未在本会话逐一核对，故不在此列出。

## 关键技术参考（官方文档）

| 主题 | 链接 | 用途 |
| --- | --- | --- |
| Google：实况通知（Live Updates） | https://developer.android.google.cn/develop/ui/views/notifications/live-update | 上课提醒要做成「灵动岛/流体云」必须满足的硬性要求（标准样式、ongoing、colorized、`setShortCriticalText`、倒计时） |
| Google：Live Updates codelab | https://developer.android.com/devsite/codelabs/notifications-rich-experience-live-updates | 同上，示例代码 |
| OPPO：流体云卡片设置项 | https://open.oppomobile.com/documentation/page/info?id=13330 | ColorOS 上流体云卡片的官方说明 |
| Google：Share a link / deep link（导航动作） | https://developer.android.com/training/app-links | 通知动作拉起地图与回到应用的路由设计 |

## 液态玻璃 / 灵动岛：同类实现参考

| 项目 | 链接 | 与本项目的关系 |
| --- | --- | --- |
| **Kyant0/AndroidLiquidGlass** | https://github.com/Kyant0/AndroidLiquidGlass | **酷安底栏液态玻璃的真身**（从其 APK 中确认含 `liquidglass.kotlin_module`、`Glass:backdrop.kotlin_module`） |
| weishu/FreeReflection | https://github.com/tiann/FreeReflection | 酷安使用的反射库（其 APK 内含 `libfree-reflection.so`） |
| **Aliothmoon/MAA-Meow** | https://github.com/Aliothmoon/MAA-Meow | 灵动岛/实况通知的**策略路由**实现参考（按 OEM 分发：AOSP promoted / HyperOS 焦点通知 / 普通通知兜底） |
| MAA-Meow v0.20.0 | https://github.com/Aliothmoon/MAA-Meow/releases/tag/v0.20.0 | 版本参考 |
| FastheDeveloper/LiveActivity | https://github.com/FastheDeveloper/LiveActivity | 实况活动/灵动岛的通用库（对照） |
| rdev/liquid-glass-react | https://github.com/rdev/liquid-glass-react | Apple 风格 Liquid Glass 的 React 实现（曾引入，后移除依赖，仅作参考致谢） |
| AndrewPrifer/liquid-dom | https://github.com/AndrewPrifer/liquid-dom | Web 端玻璃透镜折射参考 |
| shuding/liquid-glass | https://github.com/shuding/liquid-glass | SVG + Canvas 玻璃着色器参考 |

## 项目内文档

建议审阅者重点看这几份：

| 文档 | 链接 | 内容 |
| --- | --- | --- |
| `README.md` | https://github.com/tequed232/duofen-kebiao/blob/main/README.md | 项目介绍 + 分门别类的开源依赖清单 |
| `docs/v2-refactor.md` | https://github.com/tequed232/duofen-kebiao/blob/main/docs/v2-refactor.md | 设计标准（绑定 Google 官方文档）、偏离项登记、待办清单 |
| `docs/coolapk-glass.md` | https://github.com/tequed232/duofen-kebiao/blob/main/docs/coolapk-glass.md | 从酷安 APK 中提取的两段 AGSL 着色器原文 + 我们的实现方案 |
| `docs/dynamic-island.md` | https://github.com/tequed232/duofen-kebiao/blob/main/docs/dynamic-island.md | MAA-Meow 灵动岛方案调研 + 本项目的落地计划 |
| `docs/asset-permissions.md` | https://github.com/tequed232/duofen-kebiao/blob/main/docs/asset-permissions.md | 第三方素材授权台账 |
| `CONTRIBUTORS.md` | https://github.com/tequed232/duofen-kebiao/blob/main/CONTRIBUTORS.md | 贡献者 |

## 作者与致谢

| 对象 | 链接 |
| --- | --- |
| 项目作者（Tequed232）B 站空间 | https://space.bilibili.com/407275151 |

## 部署与自动化（仓库内）

| 内容 | 说明 |
| --- | --- |
| `deploy/anubis/` | Anubis 反爬配置（https://github.com/TecharoHQ/anubis） |
| `deploy/cloudflare/` | Cloudflare 边缘配置说明 |
| `scripts/verify.mjs` | 逐屏验收（19 步全绿，逐屏截图 + `screenshots/report.json`）。需先 `npm run build && npm run preview`；已进本地守卫清单（`verify`） |
| `scripts/check-secrets.mjs` | 本地密钥扫描 |
| `scripts/check-imports.mjs` | 导入自检（防「用了没导入」导致白屏） |
| `scripts/check-import-e2e.mjs` | **真实导入界面**端到端：把「模型回复」整段粘进去，验课表是否真进来、坏输入是否被拒（需 dev server，已进本地守卫清单） |
| `scripts/check-backdrop-refraction.mjs` | 实测引擎是否认 `backdrop-filter: url(#svg)` 与 `feImage` 位移图（带 `blur` 对照，防假阴性；已由本地守卫覆盖） |
| `scripts/check-apk-parity.mjs` | APK 内嵌资源与 `dist/` 逐文件哈希比对（纯 Node 自己解 zip，**不依赖 PowerShell**，2026-09-24 起在 Android 构建里跑） |
| `scripts/make-icons.mjs` `scripts/icon-targets.mjs` `scripts/check-app-icons.mjs` | 从 `docs/icon-source.jpg` 生成全套应用图标；守卫逐像素核对"仓库里的图标 == 现按原图生成的" |
| `scripts/collect-licenses.mjs` | 生成分类开源清单（README + 设置页数据） |

## 当前状态与已知问题（给审阅者的上下文）

- **版本**：v3.5.4（`versionCode 30504` / `versionName 3.5.4`）
- **APK 与网页同源**：APK 内嵌的 Web 构建与网页版共用同一份 `dist/`（bundle 哈希一致，`npm run apk:parity` 逐文件核对）
- **已实现**：自绘 M3E 底栏（位置即结果 + 拖拽跟手 + 液态玻璃折射）、纯左右平移过渡、`resetTo` 无竞态标签切换、HTML 课表导入算法、本地缓存课表、教材多选删除、班级隐私清理、关于页致谢、**本地封面识别**（OpenCV 预处理 → Tesseract 中文 OCR → ISBN 校验 → 内置库匹配，识别资源打进 APK）
- **真机复验（已完成）**：realme GT7 / Android 16 / arm64-v8a 上覆盖安装 v3.0.2 → v3.5.2 数据保留；（当年的「本地识别」资源检查项已于 2026-09-27 随该子系统一起下线）绪：图像处理库 / 识别引擎 / 中文模型`；合成封面走完「选图识别封面」链路，识别出 `ISBN 9787040396638`
- **仍未确认**：流体云实况（`promotedOngoing=true`）、界面缩放三档
- **关于 `backdrop-filter` 与 `url(#svg)`（2026-09 更正）**：此前这里记着「Chromium/WebView 会丢弃 `backdrop-filter` 里的 `url(#svg)`，网页端无法对背景做真实折射」，并据此把折射做成「SVG 位移层叠在玻璃自身光带上」的近似。**该结论不成立**，已由 `scripts/check-backdrop-refraction.mjs` 实测推翻：在 Chromium 153 上，`url()` 通道与 `feImage` 位移图**都生效**，背景确实被掰弯（同区域开/关的平均逐像素差 68.47 / 88.38，对照 `blur` 62.28）。
  复盘：原判定来自一次本地试验，它的位移图用 `feImage` 指向纯色 data URL，开/关截图完全一致 —— 但「一致」既可能是 `url()` 被丢弃，也可能是 **`feImage` 取不到图导致位移恒为 0**。两者修法完全不同，当时没有分开测，于是假阴性写进文档又被四处引用。
  现状：桌面 Chromium 已证伪；**安卓 WebView 侧待真机回归时用同一守卫补测**（测量脚本不依赖项目代码，可直接在设备浏览器打开同一张测试页）。该守卫已由本地守卫覆盖，引擎行为若变化会直接反映在 PR 的 review 里，不再靠假设。
- **隐私**：内置课表已清空过一次（含教师姓名、教室、班级人数），后按作者要求恢复课程数据但**署名统一为「Tequed232 拥有本项目的最终解释权」**；仓库不收录构建产物与截图；工作区密钥扫描通过

### 文档核对状态（2026-09-24）

`docs/` 下每篇都对着代码/实测核对过一遍，结论如下 —— 这样接手的人知道哪些是「刚核过的」，哪些是「有日期的历史件」：

| 文档 | 结论 |
| --- | --- |
| `PROJECT-STATE.md` | **已更正**：版本、待办按可自主完成/需真机/需作者决策三类重排、「易踩的坑」补 9-10 条 |
| `context-links.md`（本文） | **已更正**：版本、`backdrop-filter: url()` 那条错误记录、脚本表补 3 条守卫 |
| `v2-refactor.md` | **已更正**：`backdrop-filter` 前提被实测推翻；原生 Dock 一节补「**已回滚**」横幅（原写成已实施，会误导） |
| `liquidglass-ultimate.md` | **已更正**：色散一节重写 —— 记下「删了又加回来」这次判断失手（错的是分布不是色散），并补 `check-dock-dispersion.cjs` 的实测数与调参表 |
| `asset-permissions.md` | **已更正**：图标那条改成 2026-09-24 作者提供的 **DLSS 超分 2048×2048** 原图，并写明生成口径与守卫；`schedule-hero.jpg` 那条记录的正是「作者要求下架」，不是失效路径 |
| `live-activity-plan.md` | 无需改：「通知能发、缺的是到点叫醒」与真机现象一致 |
| `dynamic-island.md` | 无需改：`LiveUpdates.kt` 确实实现了 `ProgressStyle` / `setRequestPromotedOngoing` / `setShortCriticalText`（后者因 compileSdk 35 走反射），清单亦已声明 `POST_PROMOTED_NOTIFICATIONS` |
| `asset-permissions.md` | 见上（图标来源一栏已随 2026-09-24 的新原图更正） |
| `security-review.md` | 无需改：有明确审查日期与基准版本（2026-09-23 / v3.0.2），属历史件 |
| `promo-brief.md` | 无需改：开头即写明「版本基准 v3.0.2（2026-09-23）」 |
| `coolapk-glass.md` | 无需改：素材参考（酷安 APK 拆解），不含当前状态断言 |
| `writing-style.md` / `commit-convention.md` | 无需改：约定类文档，无「当前实现」类断言 |

机械核对脚本（本地）：`build/audit-docs.cjs` —— 抽出所有 md 里的仓库路径 / 版本号 / `npm run` 脚本名逐个验证存在性与一致性。

---

Tequed232 拥有本项目的最终解释权。
