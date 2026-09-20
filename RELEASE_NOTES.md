# 多分课表 v1.0.14 —— 底边栏实时折射 + 水滴融合

## 1. 底边栏真的会折射了（不是单纯模糊）

参考 [rdev/liquid-glass-react](https://github.com/rdev/liquid-glass-react) 与
[shuding/liquid-glass](https://github.com/shuding/liquid-glass) 的做法，把 **backdrop（背景实时画面）
送进 SVG 位移滤镜**：

```css
backdrop-filter: blur(16px) saturate(1.8) url(#liquid-glass-refraction);  /* feTurbulence → feDisplacementMap */
```

- **滑动时实时折射**：指针/手指经过底边栏时，`requestAnimationFrame` 以 0.2 阻尼跟随，
  实时改写 `feDisplacementMap` 的 `scale`（10→56，越靠边缘折射越强）与
  `--glass-x/--glass-y`（镜面反射高光带跟着手指扫过，`mix-blend-mode: screen`）。
- 独立折射层再压一次位移滤镜，强化边缘的液体感；不支持的浏览器退化为半透明底 + 高光。

## 2. 点按浮动栏：水滴融合再散开

- 点按标签生成 5 颗水滴，容器套 **goo 滤镜**（`feGaussianBlur` + `feColorMatrix` alpha 对比 24/-10）
  → 相邻水滴先**融合成一体**；
- 随后按弹性曲线 `glass-drop-life` 上浮、**散开并消失**（640ms）；
- 同时折射强度瞬时拉高到 30，形成"按下去玻璃被压"的手感。

## 3. M3 原生栏作为弱设备备用（二者互斥）

`glassCapability()` 自动检测：不支持 `backdrop-filter`、`deviceMemory < 2GB`、
CPU ≤ 2 核、或系统开启「减少动态效果」→ **自动回退 Material 3 原生导航栏**；
设置里「底边栏风格（互斥）」仍可手动切换，两套实现不会同时生效。

## 一致性与验证

- `npm run apk:parity` → APK 内嵌 54/54 文件与 `dist/` 逐个 sha256 相同 ✅
- Web 自动化：91 步全部通过、0 console 错误、0 page error ✅
