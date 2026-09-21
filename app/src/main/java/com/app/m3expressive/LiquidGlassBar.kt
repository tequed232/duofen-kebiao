package com.app.m3expressive

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RenderEffect
import android.graphics.RuntimeShader
import android.graphics.Shader
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.Choreographer
import android.view.PixelCopy
import android.view.View
import androidx.annotation.RequiresApi

/**
 * 原生 Liquid Glass 底边栏（酷安同款思路）。
 *
 * 与网页实现的根本区别：这里能**真正取到条下方的实时画面**——
 *   1. 每帧用 [PixelCopy] 把窗口里该条带区域（包含 WebView 正在滚动的内容）抓成 Bitmap；
 *   2. 交给 **AGSL RuntimeShader**：按 Snell 近似做位移折射 + 边缘色散 + 镜面高光；
 *   3. 逐帧绘回这条 View，形成「背景被实时掰弯」的玻璃效果；
 *   4. 手指按下/拖动/页面滚动通过 [setPointer] / [setScroll] 写入 shader uniform，
 *      因此形变与折射强度是**实时操控**的。
 *
 * 仅 Android 13（API 33）及以上可用（RuntimeShader 要求）；低版本直接不显示本层，
 * 由网页自己的玻璃栏兜底。
 */
@RequiresApi(Build.VERSION_CODES.TIRAMISU)
class LiquidGlassBar(context: android.content.Context) : View(context) {

    private val shader = RuntimeShader(SHADER)
    private val paint = Paint(Paint.FILTER_BITMAP_FLAG)
    private var frame: Bitmap? = null
    private val handler = Handler(Looper.getMainLooper())
    private var running = false
    private var captured = false

    /* 实时操控参数（由 JS 桥 / 触摸写入） */
    private var pointerX = 0.5f
    private var pointerY = 0.5f
    private var pressed = 0f
    private var scrollImpulse = 0f

    init {
        setWillNotDraw(false)
        paint.shader = null
    }

    fun setPointer(x: Float, y: Float, isPressed: Boolean) {
        pointerX = x.coerceIn(0f, 1f)
        pointerY = y.coerceIn(0f, 1f)
        pressed = if (isPressed) 1f else 0f
        invalidate()
    }

    /** 页面滚动冲量（0..1）：滚动时玻璃的折射更强、高光更亮 */
    fun setScroll(impulse: Float) {
        scrollImpulse = impulse.coerceIn(0f, 1f)
        invalidate()
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        start()
    }

    override fun onDetachedFromWindow() {
        stop()
        frame?.recycle()
        frame = null
        super.onDetachedFromWindow()
    }

    fun start() {
        if (running) return
        running = true
        Choreographer.getInstance().postFrameCallback(captureLoop)
    }

    fun stop() {
        running = false
        Choreographer.getInstance().removeFrameCallback(captureLoop)
    }

    /** 逐帧：抓取条带画面 → 交给 shader → 重绘（只有可见时才抓） */
    private val captureLoop = object : Choreographer.FrameCallback {
        override fun doFrame(frameTimeNanos: Long) {
            if (!running) return
            if (isShown && width > 0 && height > 0) {
                captureBackdrop()
            }
            // 滚动冲量自然衰减
            if (scrollImpulse > 0.01f) {
                scrollImpulse *= 0.86f
                invalidate()
            }
            Choreographer.getInstance().postFrameCallback(this)
        }
    }

    private fun captureBackdrop() {
        val location = IntArray(2)
        getLocationInWindow(location)
        val src = Rect(location[0], location[1], location[0] + width, location[1] + height)
        val target = frame?.takeIf { it.width == width && it.height == height }
            ?: Bitmap.createBitmap(width.coerceAtLeast(1), height.coerceAtLeast(1), Bitmap.Config.ARGB_8888)
                .also { frame = it }

        try {
            val host = (context as? android.app.Activity)?.window ?: return
            PixelCopy.request(host, src, target, { result ->
                if (result == PixelCopy.SUCCESS) {
                    captured = true
                    invalidate()
                }
            }, handler)
        } catch (_: Throwable) {
            // 某些窗口（如 Secure / 刚启动）不允许抓取：静默退化为半透明玻璃
        }
    }

    override fun onDraw(canvas: Canvas) {
        val bitmap = frame
        val w = width.toFloat()
        val h = height.toFloat()
        if (bitmap == null || !captured || w <= 0f || h <= 0f) {
            // 还没有抓到背景：先画一层半透明底，避免出现黑块
            canvas.drawColor(0x33FFFFFF)
            return
        }
        shader.setFloatUniform("uSize", w, h)
        shader.setFloatUniform("uPointer", pointerX * w, pointerY * h)
        shader.setFloatUniform("uPressed", pressed)
        shader.setFloatUniform("uScroll", scrollImpulse)
        shader.setFloatUniform("uRadius", h / 2f * 0.92f)
        paint.shader = null
        paint.alpha = 255
        // 原图（未折射）先铺一层，随后用 shader 覆盖折射结果
        canvas.drawBitmap(bitmap, 0f, 0f, paint)

        paint.shader = shader
        paint.alpha = 235
        canvas.drawRect(0f, 0f, w, h, paint)
    }

    companion object {
        /**
         * AGSL 着色器：对背景纹理做位移折射（Snell 近似）+ 边缘色散 + 镜面高光 + 圆角边缘。
         *  uniform 由 [setPointer] / [setScroll] 实时写入。
         */
        private const val SHADER = """
            uniform shader uBackdrop;
            uniform float2 uSize;
            uniform float2 uPointer;
            uniform float  uPressed;
            uniform float  uScroll;
            uniform float  uRadius;

            half4 main(float2 fragCoord) {
                float2 size = uSize;
                float2 uv = fragCoord / size;                 // 0..1
                float2 center = float2(0.5, 0.5);
                float2 d = uv - center;

                // 圆角遮罩（底边栏是胶囊形）
                float2 p = abs(fragCoord - size * 0.5);
                float2 half_ = size * 0.5;
                float2 q = max(p - (half_ - float2(uRadius)), float2(0.0));
                float mask = 1.0 - smoothstep(uRadius - 1.5, uRadius + 0.5, length(q) + uRadius - uRadius);
                mask = (length(q) <= uRadius) ? 1.0 : 0.0;

                // 折射：越靠边缘偏移越大（模拟玻璃厚度），按下时整体加强
                float edge = smoothstep(0.0, 0.5, length(d));
                float strength = (0.012 + 0.03 * uScroll + 0.02 * uPressed) * (0.35 + edge);
                float2 offset = normalize(d + 1e-6) * strength * size;

                // 边缘色散：R/G/B 三通道偏移略有差别
                half r = uBackdrop.eval(fragCoord + offset * 1.10).r;
                half g = uBackdrop.eval(fragCoord + offset * 1.00).g;
                half b = uBackdrop.eval(fragCoord + offset * 0.90).b;
                half3 refracted = half3(r, g, b);

                // 轻微散射（近似模糊：四方向采样平均）
                half3 blur = half3(0.0);
                float r2 = 2.0 + 4.0 * uScroll;
                blur += uBackdrop.eval(fragCoord + float2(r2, 0.0)).rgb;
                blur += uBackdrop.eval(fragCoord - float2(r2, 0.0)).rgb;
                blur += uBackdrop.eval(fragCoord + float2(0.0, r2)).rgb;
                blur += uBackdrop.eval(fragCoord - float2(0.0, r2)).rgb;
                blur /= 4.0;

                half3 color = mix(blur, refracted, 0.72);

                // 镜面高光：跟随指针的一条斜向高光带
                float2 rel = (fragCoord - uPointer) / size;
                float band = exp(-pow((rel.x * 1.6 + rel.y * 0.6) * 5.0, 2.0));
                color += half3(0.30, 0.32, 0.36) * half(band) * half(0.55 + 0.45 * uScroll);

                // 顶部反光 + 底部阴影，做出玻璃厚度
                color += half3(0.10) * half(smoothstep(0.75, 1.0, 1.0 - uv.y));
                color *= half(1.0 - 0.10 * smoothstep(0.0, 0.35, uv.y));

                return half4(color * half(mask), half(mask) * 0.94);
            }
        """
    }
}
