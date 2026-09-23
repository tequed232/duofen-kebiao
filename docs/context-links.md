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
| 特别感谢：米达达 B 站空间 | https://space.bilibili.com/3546769371695776 |

## 部署与自动化（仓库内）

| 内容 | 说明 |
| --- | --- |
| `.github/workflows/anubis-watch.yml` | Anubis 反爬监控工作流 |
| `.github/workflows/secret-scan.yml` | 密钥扫描（每次推送） |
| `.github/workflows/permission-reminder.yml` | 素材授权提醒（每周） |
| `deploy/anubis/` | Anubis 反爬配置（https://github.com/TecharoHQ/anubis） |
| `deploy/cloudflare/` | Cloudflare 边缘配置说明 |
| `scripts/verify.mjs` | 自动化验收（含逐屏截图，结果写进 `screenshots/report.json`） |
| `scripts/check-secrets.mjs` | 本地密钥扫描 |
| `scripts/check-imports.mjs` | 导入自检（防「用了没导入」导致白屏） |
| `scripts/collect-licenses.mjs` | 生成分类开源清单（README + 设置页数据） |

## 当前状态与已知问题（给审阅者的上下文）

- **版本**：v3.0.2（`versionCode 30002` / `versionName 3.0.2`），Release + Pages + APK 均已更新
- **APK 与网页同源**：APK 内嵌的 Web 构建与网页版逐文件哈希一致（55/55）
- **已实现**：自绘 M3E 底栏（位置即结果 + 拖拽跟手 + 液态玻璃折射）、纯左右平移过渡、`resetTo` 无竞态标签切换、HTML 课表导入算法、本地缓存课表、教材多选删除、班级隐私清理、关于页致谢
- **未完成**：**真机复验**（`adb devices` 为空，作者手机未接入），因此底栏真机手感、流体云实况（`promotedOngoing=true`）、界面缩放三档未确认
- **技术限制（诚实记录）**：Chromium/WebView **会丢弃 `backdrop-filter` 里的 `url(#svg)`**，因此网页端无法对「背景」做真实折射；当前折射由 SVG 位移层叠在玻璃自身光带上实现（观感近似），真正的背景采样需要原生 `RenderEffect`/AGSL（本项目曾实现后回退）
- **隐私**：内置课表已清空过一次（含教师姓名、教室、班级人数），后按作者要求恢复课程数据但**署名统一为「Tequed232 拥有本项目的最终解释权」**；仓库不收录构建产物与截图；工作区密钥扫描通过

---

Tequed232 拥有本项目的最终解释权。
