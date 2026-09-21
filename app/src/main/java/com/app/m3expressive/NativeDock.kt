package com.app.m3expressive

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Typeface
import android.view.MotionEvent
import android.view.View

/**
 * 原生 Dock —— 按酷安 16.6.2 的底栏布局实装。
 *
 * 为什么改成原生：
 *   之前 dock 由网页绘制，网页内容会滚动到它下面，导致"有东西在后面被遮挡"。
 *   现在 dock 是原生控件，**网页内容在它之上结束**（网页用 --native-dock 预留高度），
 *   两者不重叠；配合「显示布局边界」也不会再看到多余的框。
 *
 * 布局（对齐酷安实拍，1280×2800 / 560dpi）：
 *   · 整条大胶囊，左右留白 15dp，高 47dp，外面再留 8dp 上边距与手势条高度
 *   · 三个标签：首页 / 搜索 / 设置；图标在上、文字在下（11sp）
 *   · 选中项：**圆形**指示器（直径 54dp），居中包住图标与文字
 *   · 细亮边 1px（白 16%）+ 顶部反光 → 不用采样背景，因此没有遮挡问题
 *
 * 点击通过 [onSelect] 回调给宿主，宿主再经 JS 桥通知网页切换路由（tab: schedule/search/settings）。
 */
class NativeDock(
    context: Context,
    private val onSelect: (Int) -> Unit,
) : View(context) {

    var activeIndex: Int = 0
        set(value) {
            if (field != value) {
                field = value
                invalidate()
            }
        }

    private val density = resources.displayMetrics.density
    private fun dp(value: Float) = value * density

    private val capsule = RectF()
    private val indicator = RectF()
    private val fill = Paint(Paint.ANTI_ALIAS_FLAG)
    private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    private val iconPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    private val glow = Paint(Paint.ANTI_ALIAS_FLAG)
    private val label = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textAlign = Paint.Align.CENTER
        typeface = Typeface.create(Typeface.DEFAULT, Typeface.NORMAL)
    }
    private val housePath = Path()
    private val searchPath = Path()
    private val gearPath = Path()

    private val labels = arrayOf("首页", "搜索", "设置")
    private var pressedIndex = -1

    /** 胶囊外边距：左右 15dp、上 8dp、下 8dp + 手势条 */
    private val sideInset = dp(15f)
    private val topInset = dp(8f)
    private val bottomInset = dp(10f)
    private val capsuleHeight = dp(56f)
    private val indicatorSize = dp(50f)

    init {
        setWillNotDraw(false)
        isClickable = true
        background = null
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val height = (capsuleHeight + topInset + bottomInset).toInt()
        setMeasuredDimension(MeasureSpec.getSize(widthMeasureSpec), height)
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        capsule.set(sideInset, topInset, w - sideInset, topInset + capsuleHeight)
    }

    override fun onDraw(canvas: Canvas) {
        val radius = capsule.height() / 2f

        // 胶囊底：深色半透明 + 细亮边（酷安的观感，不需要采样背景 → 不会有遮挡问题）
        fill.color = Color.argb(232, 28, 30, 34)
        canvas.drawRoundRect(capsule, radius, radius, fill)

        stroke.color = Color.argb(41, 255, 255, 255)
        stroke.strokeWidth = dp(1f)
        canvas.drawRoundRect(capsule, radius, radius, stroke)

        // 顶部反光
        glow.color = Color.argb(18, 255, 255, 255)
        canvas.drawRoundRect(
            RectF(capsule.left + dp(8f), capsule.top + dp(1f), capsule.right - dp(8f), capsule.top + capsule.height() * 0.34f),
            radius,
            radius,
            glow,
        )

        // 选中指示器：圆形（酷安是圆，不是整块胶囊）
        val tabWidth = capsule.width() / labels.size
        val centerX = capsule.left + tabWidth * (activeIndex + 0.5f)
        val centerY = capsule.top + capsule.height() * 0.42f
        indicator.set(
            centerX - indicatorSize / 2f,
            centerY - indicatorSize / 2f,
            centerX + indicatorSize / 2f,
            centerY + indicatorSize / 2f,
        )
        fill.color = Color.argb(255, 173, 199, 210) // secondaryContainer（浅蓝绿，与主题一致）
        canvas.drawRoundRect(indicator, indicatorSize / 2f, indicatorSize / 2f, fill)

        // 三个标签的图标与文字
        val iconSize = dp(19f)
        label.textSize = dp(11f)
        for (index in labels.indices) {
            val cx = capsule.left + tabWidth * (index + 0.5f)
            val cy = centerY
            val active = index == activeIndex
            val color = if (active) Color.argb(255, 20, 22, 25) else Color.argb(235, 240, 242, 245)
            iconPaint.color = color
            iconPaint.strokeWidth = dp(1.9f)
            iconPaint.strokeCap = Paint.Cap.ROUND
            iconPaint.strokeJoin = Paint.Join.ROUND

            when (index) {
                0 -> drawHouse(canvas, cx, cy - dp(1f), iconSize)
                1 -> drawSearch(canvas, cx, cy - dp(1f), iconSize)
                else -> drawGear(canvas, cx, cy - dp(1f), iconSize)
            }

            label.color = color
            canvas.drawText(labels[index], cx, capsule.bottom - dp(6f), label)
        }
    }

    private fun drawHouse(canvas: Canvas, cx: Float, cy: Float, size: Float) {
        val half = size / 2f
        housePath.reset()
        housePath.moveTo(cx - half, cy + half * 0.15f)
        housePath.lineTo(cx, cy - half * 0.75f)
        housePath.lineTo(cx + half, cy + half * 0.15f)
        canvas.drawPath(housePath, iconPaint)
        canvas.drawRoundRect(
            RectF(cx - half * 0.62f, cy + half * 0.05f, cx + half * 0.62f, cy + half * 0.95f),
            dp(2f),
            dp(2f),
            iconPaint,
        )
    }

    private fun drawSearch(canvas: Canvas, cx: Float, cy: Float, size: Float) {
        val r = size * 0.33f
        searchPath.reset()
        canvas.drawCircle(cx - size * 0.08f, cy - size * 0.08f, r, iconPaint)
        searchPath.moveTo(cx + r * 0.62f, cy + r * 0.62f)
        searchPath.lineTo(cx + size * 0.46f, cy + size * 0.46f)
        canvas.drawPath(searchPath, iconPaint)
    }

    private fun drawGear(canvas: Canvas, cx: Float, cy: Float, size: Float) {
        val outer = size * 0.46f
        val inner = size * 0.19f
        gearPath.reset()
        val teeth = 8
        for (i in 0 until teeth * 2) {
            val angle = Math.PI * i / teeth
            val radius = if (i % 2 == 0) outer else outer * 0.74f
            val x = cx + (Math.cos(angle) * radius).toFloat()
            val y = cy + (Math.sin(angle) * radius).toFloat()
            if (i == 0) gearPath.moveTo(x, y) else gearPath.lineTo(x, y)
        }
        gearPath.close()
        canvas.drawPath(gearPath, iconPaint)
        canvas.drawCircle(cx, cy, inner, iconPaint)
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        val tabWidth = capsule.width() / labels.size
        val index = ((event.x - capsule.left) / tabWidth).toInt().coerceIn(0, labels.size - 1)
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                pressedIndex = index
                return true
            }
            MotionEvent.ACTION_UP -> {
                if (pressedIndex == index) {
                    activeIndex = index
                    onSelect(index)
                    performClick()
                }
                pressedIndex = -1
                return true
            }
            MotionEvent.ACTION_CANCEL -> {
                pressedIndex = -1
                return true
            }
        }
        return super.onTouchEvent(event)
    }

    override fun performClick(): Boolean = super.performClick()

    companion object {
        const val TAB_SCHEDULE = 0
        const val TAB_SEARCH = 1
        const val TAB_SETTINGS = 2
        val TAB_IDS = arrayOf("schedule", "search", "settings")

        /** dock 高度（px）：胶囊 + 上下留白，供宿主换算网页预留空间 */
        fun heightPx(context: Context): Int {
            val d = context.resources.displayMetrics.density
            return ((56f + 8f + 10f) * d).toInt()
        }
    }
}
