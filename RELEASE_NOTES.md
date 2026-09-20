# 多分课表 v1.0.11 —— 彩蛋移除 + Liquid Glass 底边栏

## 移除彩蛋

- 删除了「戳一下喵一下」的彩蛋：`web/src/components/meow.tsx`、`web/src/lib/meow.ts` 已移除，
  首页「拍照 / 导入图片」中间、关于页里的可点彩蛋一并撤掉，相关提示与音效不再出现。

## Liquid Glass 视觉（参考开源库自行绘制，不嵌入任何图片素材）

- 新增 `web/src/components/glass.tsx`：冰彩渐变圆角方块 + 三枚半透明玻璃药丸的应用标识
  （绿 / 紫 / 红对应 M3 primary / tertiary / error），用于开屏、关于页与首页中部。
- 新增 `web/src/components/glassnav.tsx`：**Liquid Glass 底边栏**替代 Material 3 原生导航栏 ——
  悬浮玻璃药丸容器（`backdrop-filter: blur(22px) saturate(1.7)` + 顶部反光条 + 冰彩染色光晕），
  选中项是玻璃胶囊指示器；设置里「底边栏风格（互斥）」仍可切回 M3 原生导航栏。

## 引用的开源实现（关于页与 README 均已链接致谢）

| 库 | 星标 | 参考点 |
| --- | --- | --- |
| [rdev/liquid-glass-react](https://github.com/rdev/liquid-glass-react) | 6.2k | SVG 位移折射 + 鼠标跟随高光 |
| [AndrewPrifer/liquid-dom](https://github.com/AndrewPrifer/liquid-dom) | 2.5k | 对实时 DOM 做玻璃透镜折射（框架无关） |
| [shuding/liquid-glass](https://github.com/shuding/liquid-glass) | 1.2k | SVG + Canvas 玻璃着色器思路 |

## 一致性与验证

- `npm run apk:parity` → APK 内嵌 **54/54 文件与 `dist/` 逐个 sha256 相同** ✅
- Web 自动化：**91 步全部通过、0 console 错误、0 page error** ✅（测试脚本已适配玻璃底边栏）
- 视觉：已逐张查看确认底边栏玻璃效果与应用标识渲染正常
