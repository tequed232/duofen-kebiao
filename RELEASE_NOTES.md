# 多分课表 v1.0.9 —— 全量替换为 Material 3 Expressive 资源

## ⚠️ 致歉

早期版本（v1.0.8 及以前）在界面、开屏页与安装图标中使用了**未经授权**的第三方美术素材：
Bilibili 创作者（空间号 18112887）的插画、以及一张学校教材宣传图。
**我们未获许可也未标明出处，对此深表歉意**——这是版权意识不足造成的错误，与作者及学校无关。

自本版起，上述素材已从仓库、Web 产物与 APK 中**全部删除**；若权利人认为仍有需要处理的内容，
请通过仓库 Issue 联系，我们会第一时间删除或补办授权。

## 替换为 Material 3 Expressive 官方资源

| 位置 | 原来 | 现在 |
| --- | --- | --- |
| Android 安装图标 | 第三方插画 | **Material Symbols Rounded** 的 `calendar_month` 字形 + **M3 主色**（`#12512E`），含自适应图标与各密度 PNG |
| 开屏页 | 第三方插画 | **M3E 形状**组合（clover / cookie / burst）+ Material Symbols 图标 + M3 加载指示器 |
| 记录页「拍照 / 导入图片」中间 | 第三方插画 | **M3E 形状按钮**（cookie），点一下弹动 + 喵一声（音效为本项目 WebAudio 合成，非外部素材） |
| 关于页 | 第三方插画 | **M3E 形状展示**，并新增「关于此前使用他人美术素材的致歉」段落 |
| 界面装饰 | — | 一律使用 M3E 形状语汇（cookie / clover / burst / sunny / pill），颜色只取 `--md-sys-color-*` |

现在项目内**不含任何图片文件**：APK 的 `assets/www` 中 `.jpg/.png/.webp` 数量为 **0**，
视觉全部由 SVG 形状、Material Symbols 字体（子集 112 KB）与 Roboto 组成。

## 一致性（第一要求，保持）

APK 仍是**同一份 Web 构建**：`npm run apk:parity` 本次结果 **54/54 文件 sha256 完全一致**。
体积也从 3.61 MB 降到 **2.81 MB**（少了图片资源）。

## 验证

- Web 自动化：91 步全部通过，0 console 错误、0 page error
- 一致性：APK 内嵌 54 个文件与 `dist/` 逐文件哈希相同 ✅
- 视觉：图标与各屏幕已逐张查看确认（M3E 形状、Material 图标渲染正常）
