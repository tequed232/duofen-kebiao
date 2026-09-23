# 本地安全审查报告（API 密钥泄露 / 注入风险）

审查日期 2026-09-23 ｜ 基准版本 v3.0.2 ｜ 审查范围：本仓库全部跟踪文件 + git 历史 + `web/src` 源码

## 一、结论速览

| # | 风险 | 结论 | 处理 |
| --- | --- | --- | --- |
| 1 | 密钥泄露（工作区 / 构建产物） | **无** | 保持由 `scripts/check-secrets.mjs` 每日 + 每次推送扫描 |
| 2 | 密钥泄露（git 历史） | **无真泄露**（原告警全是扫描器匹配到自己） | 修掉自我匹配，历史段恢复可信 |
| 3 | 接口密钥以明文发出 | **已修** | 新增端点准入：公网必须 https，本机/局域网放行 |
| 4 | 密钥经错误信息回显 | **已修** | 报错文本先抹除密钥再抛出 |
| 5 | 注入面（`innerHTML`） | **已修** | HTML 课表导入改 DOM 遍历，零 `innerHTML` |
| 6 | SQL 注入 | **不适用** | 见第四节：全仓库无 SQL、无关系库、无服务端 |
| 7 | `image_url` 重复上传同一张图 | 评估后**保持现状** | 见第五节：兼容优先，记录风险 |

## 二、密钥类

### 2.1 工作区与构建产物
`node scripts/check-secrets.mjs`：239 个跟踪文件 + `dist/`，**无**密钥、无凭据类文件名（`.env` / `*.pem` / `*.jks` 等）✔

### 2.2 git 历史（原为假阳性，已修）
原扫描器用 `git log -S <字符串>`：`-S` 只看"某字符串出现次数有没有变"，于是**本文件自己的特征表一被提交就永远命中自己** —— 之前那批「ghp_ / AIza / AKIA / 私钥块」历史告警全部来自这里。逐条核对方式与结果：

```
git grep -nE 'ghp_[A-Za-z0-9]{8,}|AIza[0-9A-Za-z_-]{10,}|AKIA[0-9A-Z]{8,}' 23fa1cd   → 无输出
git grep -nE 'BEGIN [A-Z ]*PRIVATE KEY' 3ad88fd
  → 3ad88fd:scripts/check-secrets.mjs:87:  { name: '私钥块（历史）', needle: 'BEGIN RSA PRIVATE KEY' }
```

结论：**一个真凭据都没有**，命中的是扫描器源码里的特征串本身。已改为 `git log -G<精确正则>` + 路径排除（排除本脚本、`assets/`、`dist/`、`node_modules/`、`*.min.js`），复跑后历史段为 `✅ git 历史未命中密钥类特征串`。

### 2.3 接口密钥的运行时处理（本次新增硬闸）
`web/src/lib/api.ts`：

- **端点准入** `assertEndpointAllowed()`：非 https 只放行本机 / 局域网（`localhost` / `127.0.0.1` / `::1` / `*.local` / `10.` / `192.168.` / `172.16-31.`）。
  理由：请求体里带**用户自己的密钥与整张图片**，公网 http 等于同网段明文广播；本地跑 Ollama / LM Studio 是合理用法，故放行。
- **报错抹除** `redact()`：网关常把请求头回显进错误体，现在报错文本里出现密钥会被替换成 `***` 再抛给界面。
- 密钥只存本机（IndexedDB / localStorage），不随构建产物分发，也没有任何上报端点 ✔

## 三、注入类（客户端语境下的真风险）

`web/src` 里原先唯一的注入面是 **HTML 课表导入**：`cellSegments()` 把用户导入文件的标记塞进 `innerHTML`（虽然是游离节点、脚本不执行，但属于典型注入面）。已改为 **DOM 遍历**（文本节点 + `<br>` 折算换行 + 块级元素补换行），语义等价且不解析任何标记。

顺带修掉一个一直存在的功能缺口：**粘贴** HTML 表格时走的是纯文本解析器，必然报「没有解析到课表节次」——现在与「选文件」一致，`/<table/i` 命中就走 HTML 算法。

回归验证（`build/check-import-regression.mjs`）：粘贴一张带 `<p>` / `<br>` 的表格 → 课名 / 教师 / 教室全部识别，提示「已从文本导入：2 个节次」✔

## 四、SQL 注入：不适用（附证据）

本应用没有服务端、没有关系库、没有 ORM。全仓库（`*.ts` / `*.tsx` / `*.kt` / `*.mjs`）检索下列特征 **零命中**：

```
SELECT .* FROM | INSERT INTO | UPDATE .* SET | DELETE FROM
sqlite | PRAGMA | execSQL | rawQuery | Room\Database
```

数据只落在浏览器本机：IndexedDB（`m3-expressive-notes`）与 localStorage，键名由代码常量拼接（无外部输入参与），不存在查询语言拼接的构造面。

## 五、已评估、暂不改动

| 项 | 现状 | 判断 |
| --- | --- | --- |
| `analyzeImage` 同时发 `image`(base64) 与 `image_url`(同一张图的 data URL) | 请求体约为图片的两倍 | data URL 对远端毫无用处（对方无法拉取），属于冗余；但接口是用户自建的自定义契约，删字段会破坏已跑通的配置 → 保持，仅记录 |
| 密钥同时放进 `Authorization` 与 `x-api-key` | 两个请求头 | 兼容不同网关；都只发往用户自己填的端点，风险可接受 |
| `authHeaders` 不区分大小写/空白 | 已 `trim()` | 无需改动 |
| npm 依赖审计（`npm audit`） | 未纳入本次 | 建议下一步接入 CI（需要联网拉 registry） |

## 六、守卫与运行方式

| 命令 | 作用 |
| --- | --- |
| `npm run check:secrets` | 工作区 + `dist/` + git 历史的密钥扫描 |
| `npm run check:web-security` | `web/src` 的注入面 / 密钥进 URL / 明文 http |
| `npm run check:hygiene` | 安装包与压缩包不进仓库 |

三者都已接入 `.github/workflows/repo-hygiene.yml`（push / PR / 手动触发），命中即失败。

## 七、残余风险与建议

1. 用户若把公网端点写成明文 http，会被入口拦下（提示改用 https）——这是**有意的硬闸**，不做"仍然发送"的绕过开关。
2. 密钥保护依赖设备本身：应用不加密 IndexedDB 中的密钥（本地单用户场景，加密的密钥仍需可解，收益有限）；如需更强保护，可考虑接入 Android Keystore 由宿主代持。
3. 建议后续把 `npm audit` 与依赖版本锁定检查纳入 CI。
