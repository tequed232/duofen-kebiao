# 酷安 Liquid Glass 实现分析（从真机 APK 反查）

> 来源：从作者 realme RMX6688（Android 16 / ColorOS）用 `adb pull` 取出酷安 16.6.2 的 base.apk（111.4 MB，5913 个条目），在 `classes.dex` 中定位到 AGSL 着色器源码。
> 本文只记录**技术事实**用于自研实现，不复制其代码到本仓库。

## 确认它用的库

APK 内的模块标记：

```
META-INF/liquidglass.kotlin_module          → Kyant0/AndroidLiquidGlass（LiquidGlass 模块）
META-INF/Glass:backdrop.kotlin_module       → 同库的 backdrop 模块
lib/arm64-v8a/libfree-reflection.so         → me.weishu:free_reflection（反射）
```

配合《开源相关》列表里的条目：

| 库 | 作者 | 作用 |
| --- | --- | --- |
| **AndroidLiquidGlass** | **Kyant0** | 液体玻璃本体（AGSL 着色器 + Compose） |
| **Shapes** | Kyant | 形状（胶囊/圆角） |
| BlurView 3.2.0 | Dmytro Saviuk | 真实背景模糊 |
| free_reflection 2.0.0 | weishu | 反射/镜面 |

## 挖到的两个 AGSL 着色器（原文）

### 1) 背景着色器（`Glass:backdrop` 模块）—— 玻璃的主体

```glsl
uniform shader content;
uniform float2 size;
uniform float fadeExtent;
uniform float edge;
layout(color) uniform half4 tint;
uniform float tintIntensity;

half4 main(float2 coord) {
    float edgeDistance = mix(coord.y, size.y - coord.y, edge);
    float alpha = fadeExtent <= 0.0
        ? 0.0
        : 1.0 - smoothstep(0.0, fadeExtent, edgeDistance);
    return mix(content.eval(coord), tint, tintIntensity) * alpha;
}
```

**关键结论**：酷安的玻璃**不做重度折射** —— 它是 `真实背景内容（content.eval）+ 色调混合（tint / tintIntensity）+ 边缘渐隐（fadeExtent / edge）`。这正是真机截图上量到的观感：深色半透明、能看到内容、边缘柔和。

### 2) 高光着色器 —— 跟手光斑

```glsl
uniform float2 size;
layout(color) uniform half4 color;
uniform float radius;
uniform float position;   // 实际类型为 float2（触点位置）

half4 main(float2 coord) {
    float dist = distance(coord, position);
    float intensity = smoothstep(radius, radius * 0.5, dist);
    return color * intensity;
}
```

**关键结论**：触摸位置处画一个**径向衰减的光斑**（`smoothstep(radius, radius*0.5, dist)`），这就是「按下/滑动时的高光」。参数极少，成本极低。

## 对自研实现的指导

| 之前的做法 | 酷安的做法 | 结论 |
| --- | --- | --- |
| Snell 位移折射 + 色散（重） | **背景采样 + 色调 + 边缘渐隐**（轻） | 按酷安改：更稳、更像 |
| 自绘渐变当「折射感」 | `content.eval(coord)` 取**真实背景**（需要 PixelCopy 抓帧） | 抓帧仍是必需的 |
| 高光带（斜向） | **以触点为圆心的径向光斑** | 改为径向光斑 |
| 无边缘渐隐 | `1 - smoothstep(fadeExtent, edgeDistance)` | 补上边缘渐隐（玻璃的「厚度」感） |

## 实现所需能力与阻塞

1. **抓取背景**：`PixelCopy`
   - `request(View, Rect, Bitmap, Executor, OnPixelCopyFinishedListener)` 是 **API 34+**，且需要 **compileSdk 34/35 提供该重载** —— 本机 `platforms;android-35` 的 android.jar 里没有它，所以之前编译失败。
   - 绕法 A：装 `platforms;android-36`（曾下载卡在 ~25MB，可重试）。
   - 绕法 B：用 `request(Window, Rect, Bitmap, listener, Handler)`（API 26+）+ **屏幕坐标**基准，需要按窗口在屏幕上的偏移换算一次。
   - 绕法 C：`View.drawToBitmap` / `SurfaceControl` 兜底（慢，但任何版本可用）。
2. **着色器**：`RuntimeShader`（API 33+）+ `BitmapShader` 作为 `content` 输入（**必须绑定**，否则采样恒为黑）。
3. **层级**：原生玻璃条位于 WebView **之下**；WebView 背景透明；网页底边栏只留图标文字。

## 下一步

1. 用绕法 B 实现抓帧（不依赖新 SDK），把上面两段着色器接上（背景 + 触摸光斑 + 边缘渐隐）。
2. 真机与酷安逐项对比：底色透明度、模糊半径、边缘渐隐宽度、光斑半径。
3. 参数通过 JS 桥实时下发（触摸位置 / 滚动冲量），保持「实时操控」。
