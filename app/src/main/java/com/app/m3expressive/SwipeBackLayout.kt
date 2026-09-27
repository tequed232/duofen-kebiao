package com.app.m3expressive

import android.content.Context
import android.util.AttributeSet
import android.view.MotionEvent
import android.view.VelocityTracker
import android.view.ViewConfiguration
import android.widget.FrameLayout
import kotlin.math.abs

/**
 * 原生边缘拖拽返回（Telegram 那套做法在我们这种"单 WebView"壳里的落地）。
 *
 * ## 为什么需要它
 * 系统「可预测式返回」有两个应用控制不了的坑（都是真机实测踩到的）：
 *  ① 开发者选项 `global.enable_back_animation` 一旦是 0，系统就不再派发
 *     `onBackStarted / onBackProgressed`，跟手预览**整段消失**；
 *  ② 进度回调经系统合成器转发，写 CSS 变量的时机可能落后于手指，复杂的玻璃层上尤其明显。
 * 参考实现（作者的 `TelegramSwipeBackLayout`）给出的答案是：**自己接管边缘触摸**，
 * 进度在本地算，天然不受系统开关与转发节流影响。
 *
 * ## 与参考实现的差别（以及为什么）
 *  · 参考实现用 `ViewDragHelper` 拖 `currentView`、让它与 `previousView` 做视差；
 *    我们只有一个 WebView（屏幕栈由网页自己管理），没有两个 View 可拖。
 *    所以这里把拖拽量换算成 **0..1 的进度**，通过 JS 桥驱动网页里已经与 Telegram 录屏对齐的预览
 *    （当前屏以顶边为锚点缩下去、上一屏原地露出来）——视觉在 CSS，手势在原生。
 *  · 参考实现在 `drawChild` 里直接画遮罩/阴影来避免额外 View；我们连绘制都不参与：
 *    圆角、压暗、下层显影都由网页那一层负责，因此这里**零额外节点**，
 *    也就没有 measure/layout 开销（这一点和参考实现的性能取向是一致的）。
 *  · 参考实现用 `OverScroller` 做阻尼停靠；我们松手后的收尾动画同样交给网页的
 *    `.predictive-cancel` / `.predictive-out`（已在真机上逐帧对齐过），原生只负责**决断**
 *    （是否提交）并把结果同步过去，避免两套物理互相打架。
 *
 * ## 触发条件
 * 起点在左边缘 [EDGE_DP] 内、横向位移超过系统 touchSlop 且大于纵向位移、且宿主说"可以退"
 * （`canDragBack`，通常是 `webView.canGoBack()`）。左侧边缘同时通过
 * [setSystemGestureExclusionRects] 从系统手势里排除出去，这样触摸才真正归我们。
 */
class SwipeBackLayout @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0,
) : FrameLayout(context, attrs, defStyleAttr) {

    companion object {
        /** 边缘触发带宽度（dp）：太小不好按，太大会吞掉正常的横向滑动 */
        private const val EDGE_DP = 22f
        /** 松手决断：拖过屏宽的这个比例就提交 */
        private const val COMMIT_FRACTION = 0.35f
        /** 松手决断：向右甩动的速度阈值（px/s） */
        private const val FLING_VELOCITY = 600f
        /** 进度变化的发送阈值（避免每个像素都过一次 JS 桥） */
        private const val PROGRESS_EPSILON = 0.004f
        /**
         * 手指走完屏幕宽度的这个比例就算"进度到 1"。
         * 取 0.33（1/3 屏）：系数按作者要求调高后，短拖动就要有明确的下沉幅度
         * （之前按整屏宽换算，拖 1/4 屏只有 0.25 的进度 × 很小的缩放系数，肉眼等于没动）。
         */
        private const val TRAVEL_FRACTION = 0.33f
    }

    /** 宿主说"这一下可以退吗"（网页历史栈是否可退） */
    var canDragBack: (() -> Boolean)? = null

    /** 手势相位同步给网页：与系统预测式返回共用同一套 `window.DuofenBack` */
    var onStart: (() -> Unit)? = null
    var onProgress: ((Float) -> Unit)? = null
    var onCancel: (() -> Unit)? = null

    /** 决断为"提交"：宿主执行真正的返回（网页栈优先，退无可退再退出应用） */
    var onCommit: (() -> Unit)? = null

    private val edgePx = EDGE_DP * resources.displayMetrics.density
    private val touchSlop = ViewConfiguration.get(context).scaledTouchSlop

    private var velocity: VelocityTracker? = null
    private var dragging = false
    private var decided = false
    private var startX = 0f
    private var startY = 0f
    private var sentProgress = -1f
    /** 是否把左边缘从系统手势里排除出去（可退时才排除；根屏上交还给系统，保证"左滑退出应用"照旧） */
    private var edgeExcluded = true

    /**
     * 宿主在网页导航状态变化时调用：可退就排除左边缘（触摸归我们），
     * 不可退（根屏）就不排除 —— 那时左滑应当交给系统去执行"离开应用"。
     */
    fun setEdgeExcluded(excluded: Boolean) {
        if (edgeExcluded == excluded) return
        edgeExcluded = excluded
        applyEdgeExclusion()
    }

    private fun applyEdgeExclusion() {
        if (width <= 0 || height <= 0) return
        val edge = edgePx.toInt().coerceAtMost(width / 4)
        if (edgeExcluded) {
            setSystemGestureExclusionRects(listOf(android.graphics.Rect(0, 0, edge, height)))
        } else {
            setSystemGestureExclusionRects(emptyList())
        }
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        // 把左边缘那条带子从系统手势里排除：不排除的话，手势导航会先把触摸吃掉，
        // 我们的 onTouchEvent 根本收不到（这也是 Telegram 们能自己接管手势的原因之一）。
        applyEdgeExclusion()
    }

    override fun onInterceptTouchEvent(ev: MotionEvent): Boolean {
        when (ev.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                decided = false
                dragging = false
                if (ev.x <= edgePx && canDragBack?.invoke() == true) {
                    startX = ev.x
                    startY = ev.y
                    velocity?.recycle()
                    velocity = VelocityTracker.obtain().apply { addMovement(ev) }
                } else {
                    velocity?.recycle()
                    velocity = null
                }
            }

            MotionEvent.ACTION_MOVE -> {
                val tracker = velocity ?: return false
                tracker.addMovement(ev)
                val dx = ev.x - startX
                val dy = ev.y - startY
                if (!decided) {
                    if (dx > touchSlop && dx > abs(dy)) {
                        decided = true
                        dragging = true
                        sentProgress = -1f
                        onStart?.invoke()
                        onProgress?.invoke(0f)
                        sentProgress = 0f
                        parent?.requestDisallowInterceptTouchEvent(true)
                        return true
                    }
                    // 纵向为主或往左滑：这不是返回手势，交回给网页自己滚
                    if (abs(dy) > touchSlop || dx < -touchSlop) {
                        velocity?.recycle()
                        velocity = null
                    }
                }
            }

            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                velocity?.recycle()
                velocity = null
            }
        }
        return dragging
    }

    override fun onTouchEvent(ev: MotionEvent): Boolean {
        val tracker = velocity
        tracker?.addMovement(ev)
        when (ev.actionMasked) {
            MotionEvent.ACTION_MOVE -> {
                if (!dragging) return false
                sendProgress(progressOf(ev.x))
                return true
            }

            MotionEvent.ACTION_UP -> {
                if (!dragging) return false
                val progress = progressOf(ev.x)
                tracker?.computeCurrentVelocity(1000)
                val vx = tracker?.xVelocity ?: 0f
                val commit = progress > COMMIT_FRACTION || (vx > FLING_VELOCITY && vx > abs(tracker?.yVelocity ?: 0f))
                dragging = false
                tracker?.recycle()
                velocity = null
                if (commit) {
                    // 先把进度推到 1（网页据此把当前屏收完），再走宿主统一的返回
                    sendProgress(1f, force = true)
                    onCommit?.invoke()
                } else {
                    onCancel?.invoke()
                }
                return true
            }

            MotionEvent.ACTION_CANCEL -> {
                if (!dragging) return false
                dragging = false
                tracker?.recycle()
                velocity = null
                onCancel?.invoke()
                return true
            }
        }
        return dragging
    }

    /** 手指位移 → 0..1 进度（走满屏宽的 [TRAVEL_FRACTION] 即到 1，短拖动就能看到下沉） */
    private fun progressOf(x: Float): Float {
        if (width <= 0) return 0f
        return ((x - startX) / (width * TRAVEL_FRACTION)).coerceIn(0f, 1f)
    }

    private fun sendProgress(value: Float, force: Boolean = false) {
        val clamped = value.coerceIn(0f, 1f)
        if (!force && abs(clamped - sentProgress) < PROGRESS_EPSILON) return
        sentProgress = clamped
        onProgress?.invoke(clamped)
    }
}
