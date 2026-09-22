# 贡献者 · Contributors

感谢每一位让 **多分课表** 变得更好的人。

这份名单同时出现在三处，**必须保持同一口径**：应用「关于 → 致谢 · 名片墙」、本文件、README。
应用侧的数据源是 [`web/src/lib/meta.ts`](./web/src/lib/meta.ts) 的 `CREDITS`（名片墙 = 作者本人 1×3 整行 + 其余三列排布，
最后一行不满时最后一张跨列补满）。名单里用**网名 / 昵称**署名。

| 名片 | 角色 | 主要贡献 | 链接 |
| --- | --- | --- | --- |
| 罗xx | 作者 | 项目发起；Material 3 Expressive 界面与动效、课表与教材数据、Android 宿主与流体云、Anubis / Cloudflare 部署 | [GitHub](https://github.com/tequed232) · [Bilibili](https://space.bilibili.com/407275151) · [抖音](https://www.douyin.com/user/MS4wLjABAAAAj-LAgjc_F9yWFAa3YycsNF9f_E1M3JiLa5ilAzSTn9hJs_44MtP_mM_2DbyLH06F) |
| 饼干 | 翻译 · 同学 | 项目文案与界面翻译 | [GitHub](https://github.com/BS-keke) · [Bilibili](https://space.bilibili.com/449528062) |
| 维舟（MAA-Meow） | **该项目顾问** | 项目顾问 | [GitHub](https://github.com/WhiteMoon319) |
| 米达达 | 表情包引用 | 表情包被项目引用，特此致谢 | [Bilibili](https://space.bilibili.com/3546769371695776) |
| Hanbing | 主美画师 · 同学 | 主视觉与美术绘制 | [Bilibili](https://b23.tv/0rKu2FX) |
| 椿湫 | 导师 | 项目指导 | [GitHub](https://github.com/fxxggllj) |

> 名片头像是各人在 GitHub / B 站的**公开头像**，已登记在 [`docs/asset-permissions.md`](./docs/asset-permissions.md)；
> 加载失败时自动退回姓名首字。表情包原图不进入构建产物。

作品许可（名片上的 CC 标记，点开可看授权原文）：

- **寒冰（Hanbing）**：**CC BY** —— 署名使用，**不允许任何形式的 AI 修改**（凭据 `docs/permissions/hanbing-cc-by.jpg`）。
- **米达达（miratsu）**：**CC BY-NC** —— 署名 + **禁止商用**。

平台剪影图标（GitHub / Bilibili / 抖音 / X / CC）来自 [Remix Icon](https://github.com/Remix-Design/RemixIcon)（Apache-2.0）。

## 怎么加入这份名单

> 提交信息请遵循 [`docs/commit-convention.md`](./docs/commit-convention.md)：
> `类型(范围): 中文描述`，例如 `fix(android): 修复设备控制开关不持久的问题`。

三种方式任选，合并进默认分支后会自动出现在仓库的 **Contributors** 列表里：

1. **Pull Request（推荐）**：Fork 仓库 → 改点东西 → 发 PR，合并后即计入（Squash merge 也会把你的提交记在你名下）。
2. **协作者直推**：接受协作者邀请后直接提交。
3. **共同署名**：在提交信息末尾加一行 trailer，同一次提交就会同时归到你名下：

```
Co-authored-by: 你的名字 <你的邮箱>
```

> 邮箱必须已绑定到你的 GitHub 账号；不确定就用 GitHub 提供的匿名地址
> `你的用户名@users.noreply.github.com`，它一定能关联到你的账号。

只想在文档里露个名，也可以直接在这个文件里加一行并提 PR；要上应用里的名片墙，
就同时改 `web/src/lib/meta.ts` 的 `CREDITS`（或提个 Issue 让作者加）。
