package com.app.m3expressive

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.core.app.NotificationManagerCompat

/**
 * Android 16 Live Updates / ColorOS 流体云 状态卡片。
 *
 * Android 16（API 36）新增 Live Updates：用 [Notification.ProgressStyle] 描述进行中的任务，
 * 并调用 `setRequestPromotedOngoing(true)` 请求系统将其提升到状态栏芯片 / 锁屏 / 息屏显示。
 * ColorOS 16 的流体云（实况通知）会把这些被提升的通知渲染成流体云卡片。
 *
 * 这两个 API 只在 Android 16+ 存在，因此这里用反射调用：同一份 APK 既能在
 * Android 16 / ColorOS 16 上进入流体云，也能在旧系统上退化为普通进行中通知，
 * 不依赖编译期 SDK 版本。
 */
object LiveUpdates {

    const val CHANNEL_ID = "m3expressive_live_updates"
    const val ACTION_CONFIRM = "com.app.m3expressive.LIVE_CONFIRM"
    private const val NOTIFICATION_ID = 1001

    /** Android 16 = API 36 */
    private const val ANDROID_16 = 36

    fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            "实时记录状态",
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = "语音识别与图片处理进度（Android 16 Live Updates / ColorOS 流体云）"
            setSound(null, null)
            setShowBadge(false)
            enableVibration(false)
        }
        manager.createNotificationChannel(channel)
    }

    private fun baseBuilder(context: Context, title: String, text: String): Notification.Builder {
        ensureChannel(context)
        val pending = PendingIntent.getActivity(
            context,
            0,
            Intent(context, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        return Notification.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentTitle(title)
            .setContentText(text)
            .setContentIntent(pending)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(Notification.CATEGORY_PROGRESS)
            // 直接确认：不打开应用也能结束当前实时任务
            .addAction(
                Notification.Action.Builder(
                    null,
                    "确认",
                    PendingIntent.getBroadcast(
                        context,
                        1,
                        Intent(ACTION_CONFIRM).setPackage(context.packageName),
                        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                    ),
                ).build(),
            )
    }

    /** 开始 / 更新进行中的实时状态；progress 为 null 表示不确定进度。 */
    fun update(context: Context, title: String, text: String, progress: Int? = null) {
        val builder = baseBuilder(context, title, text)
        val promoted = applyLiveUpdateStyle(builder, progress)
        if (!promoted) {
            if (progress != null) builder.setProgress(100, progress.coerceIn(0, 100), false)
            else builder.setProgress(0, 0, true)
        }
        notifySafely(context, builder.build())
    }

    /** 完成态：先展示 100%，随后自动收起。 */
    fun finish(context: Context, title: String, text: String, autoDismissMillis: Long = 4000L) {
        val builder = baseBuilder(context, title, text).setOngoing(false)
        val promoted = applyLiveUpdateStyle(builder, 100)
        if (!promoted) builder.setProgress(100, 100, false)
        notifySafely(context, builder.build())
        Handler(Looper.getMainLooper()).postDelayed({ clear(context) }, autoDismissMillis)
    }

    /** 设置页「发送实况测试」：走一遍完整流程，方便用户确认流体云是否出现 */
    fun test(context: Context) {
        var value = 0
        val handler = Handler(Looper.getMainLooper())
        val step = object : Runnable {
            override fun run() {
                value += 12
                if (value >= 100) {
                    finish(context, "实况测试完成 · 多分课表", "已确认设备支持实况通知")
                    return
                }
                update(context, "实况测试 · 多分课表", "正在验证流体云进度：$value%", value)
                handler.postDelayed(this, 450)
            }
        }
        handler.post(step)
    }

    fun clear(context: Context) {
        try {
            NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)
        } catch (_: SecurityException) {
            // 没有通知权限时忽略
        }
    }

    /**
     * 反射应用 Android 16 的 Live Updates 样式。
     * @return true 表示成功设置了 ProgressStyle（即设备为 Android 16+）
     */
    private fun applyLiveUpdateStyle(builder: Notification.Builder, progress: Int?): Boolean {
        if (Build.VERSION.SDK_INT < ANDROID_16) return false
        return try {
            val styleClass = Class.forName("android.app.Notification\$ProgressStyle")
            val style = styleClass.getDeclaredConstructor().newInstance()
            if (progress == null) {
                styleClass.getMethod("setProgressIndeterminate", Boolean::class.javaPrimitiveType)
                    .invoke(style, true)
            } else {
                styleClass.getMethod(
                    "setProgress",
                    Int::class.javaPrimitiveType,
                    Int::class.javaPrimitiveType,
                    Boolean::class.javaPrimitiveType,
                ).invoke(style, 100, progress.coerceIn(0, 100), false)
            }
            Notification.Builder::class.java
                .getMethod("setStyle", Notification.Style::class.java)
                .invoke(builder, style)
            // 请求提升为 Live Update：ColorOS 16 会展示在流体云
            Notification.Builder::class.java
                .getMethod("setRequestPromotedOngoing", Boolean::class.javaPrimitiveType)
                .invoke(builder, true)
            true
        } catch (_: ReflectiveOperationException) {
            false
        } catch (_: LinkageError) {
            false
        }
    }

    private fun notifySafely(context: Context, notification: Notification) {
        try {
            NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, notification)
        } catch (_: SecurityException) {
            // POST_NOTIFICATIONS 未授予：静默跳过，不影响主流程
        }
    }
}
