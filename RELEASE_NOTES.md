# 多分课表 v1.0.19 —— 图标改为矢量（不再依赖 PNG）、密钥泄露自检

## 1. 应用图标：矢量实现，仓库里不再有图标 PNG

按你的要求**没有恢复**你删掉的那些 PNG；同时把图标改成**纯矢量**，因此没有位图也能正常出包：

- 新增 `app/src/main/res/drawable/ic_launcher_glass.xml`（VectorDrawable：冰彩圆角方块 + 绿/紫/红玻璃药丸，含顶部高光）
- `mipmap-anydpi-v26/ic_launcher.xml`、`ic_launcher_round.xml` 的前景指向该矢量
- minSdk 26 → 自适应图标始终可用，**不需要 mdpi~xxxhdpi 的 PNG**
- 结果：`app/src/main/res` 下 **0 个 PNG**，`assembleRelease` **BUILD SUCCESSFUL**

## 2. 密钥泄露自检（新增，纳入 CI）

- `scripts/check-secrets.mjs`：扫描**工作区全部被跟踪文件 + dist/ 构建产物 + git 历史**，
  覆盖 sk-/ghp_/gho_/github_pat_/AIza/AKIA/xox/私钥块/Bearer 头/硬编码 password 等特征，
  命中时**只输出前缀与长度**，绝不回显完整密钥。
- `.github/workflows/secret-scan.yml`：每次推送 + 每天定时跑，命中真实密钥特征即 **失败**。
- 本次结果：**工作区与 dist/ 干净**；精确历史检索（`-G` 正则）sk-/ghp_/AIza/AKIA/私钥块 **全部 0 个提交**。

## 3. 顺手清理

- 去掉了一批文件里被 PowerShell 写入的 **UTF-8 BOM**（曾导致 `vite build` 报 “not valid JSON”、PostCSS 配置解析失败）。

## 验证

- `npm run apk:parity` → APK 内嵌 54/54 文件与 `dist/` 逐个 sha256 相同 ✅
- `node scripts/check-secrets.mjs` → 工作区 / dist / 历史均无真实密钥 ✅
