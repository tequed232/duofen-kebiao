# 提交信息规范（Commit Convention）

> 对齐国内同类项目的通行做法，参考
> [MaaAssistantArknights](https://github.com/MaaAssistantArknights/MaaAssistantArknights/pulls)：
> **Conventional Commits 的类型前缀 + 中文描述**。本仓库自 2026-09 起统一按本文件执行。

## 一句话格式

```
<类型>(<范围>): <中文描述>
```

真实例子（本仓库与 MAA 的写法）：

```
fix(android): 修复设备控制开关不持久的问题
feat(credits): 关于页新增「致谢 · 名片墙」，作者 1×3 + 其余三列
chore(release): 版本号升至 0.92.1
```

## 类型

| 类型 | 用在哪 |
| --- | --- |
| `feat` | 新功能、新界面、新数据 |
| `fix` | 修 bug、修错误行为 |
| `perf` | 性能：掉帧、体积、启动速度 |
| `refactor` | 重构，外部行为不变 |
| `docs` | 文档：README、`docs/`、注释 |
| `style` | 格式、空格、排版，不影响行为 |
| `chore` | 杂活：版本号、依赖、构建脚本 |
| `ci` | GitHub Actions、发布流水线 |
| `revert` | 回滚某次提交 |

## 范围

按模块取，方便一眼看出动了哪块：

`web`（网页端）、`android`（APK / Kotlin 宿主）、`apk`、`dock`（底边栏）、`schedule`（课表）、
`credits`（致谢 · 名片墙）、`about`（关于页）、`release`（发版）、`repo`（仓库卫生 / CI）、`docs`、`i18n`。

## 描述怎么写

- **用中文**，动宾结构，一句话说清「改了什么」：`修复…` / `新增…` / `调整…` / `移除…` / `改为…`；
- 结尾**不加句号**；
- 一句话尽量 ≤ 50 字，细节放正文；
- **一条提交只做一件事**。确实要一起改（例如「剔除 APK + 加卫生检查」），就用正文分点写清楚。

不要这样写：

- `update`、`fix bug`、`修改`、`优化` —— 没有信息量；
- `Drop APKs from the repository, guard against binary artifacts, ship the credits wall`
  —— 英文长句、三件事挤一行，中文项目里读起来费劲；
- `修复了那个问题` —— 要写清是哪个问题。

## 正文（可选）

空一行后写「为什么」，以及影响面、验证方式：

```
fix(credits): 名片墙按钮改为图标，多平台名片压到一行

412dp 下卡片内容区只有约 100dp，两个带文字的按钮（GitHub + Bilibili）放不下会折行。
多平台的名片只留平台剪影（title / aria-label 里带平台名与链接），单平台与作者卡保留文字。

验证：构建产物里 7 张名片 oneLine 全为 true，无横向溢出。
```

## 提交前自查

```powershell
npm run check:hygiene      # 安装包 / 压缩包不允许被跟踪
node scripts/check-imports.mjs   # 防「用了没导入」导致白屏
npm run build              # 构建能过
```

## 历史遗留

2026-09-22 之前的部分提交是英文长句（例如 `Drop APKs from the repository, ...`），保留不改动。
若要统一成中文，需要重写历史并强推，会影响所有已 clone / fork 的人，另行评估。
