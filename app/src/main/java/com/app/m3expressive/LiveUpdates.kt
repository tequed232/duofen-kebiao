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

    /** 通知里的「课本」动作：打开应用并跳到教材窗口 */
    const val ACTION_SHOW_TEXTBOOKS = "com.app.m3expressive.SHOW_TEXTBOOKS"
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
            .setSmallIcon(com.app.m3expressive.R.drawable.ic_stat_notify)
            .setContentTitle(title)
            .setContentText(text)
            .setContentIntent(pending)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setColor(0xFF12512E.toInt())
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

    /**
     * 上课提醒：实况通知（灵动岛 / 流体云）。
     *
     * 依据 Google 官方「Create live update notifications」的硬性要求：
     *   ① 标准样式（这里用 ProgressStyle，低版本回落 BigTextStyle）
     *   ② 清单里声明非运行时权限 POST_PROMOTED_NOTIFICATIONS
     *   ③ 请求提升（EXTRA_REQUEST_PROMOTED_ONGOING / setRequestPromotedOngoing）
     *   ④ 必须 ongoing、必须 setContentTitle、不得使用 customContentView
     *   ⑤ colorized 必须为 TRUE，渠道重要性不得为 IMPORTANCE_MIN
     *   ⑥ 状态胶囊用 setShortCriticalText（API 36+），时间用 setWhen：
     *      距现在 ≥2 分钟时系统会显示**倒计时**
     *
     * 两个动作：导航（直接拉起地图到教室）、课本（回到应用看这节课要带的书）。
     */
    fun classReminder(
        context: Context,
        course: String,
        room: String,
        timeText: String,
        textbooks: String,
        minutesLeft: Int,
        startAtMillis: Long,
        navigateUri: String?,
    ) {
        ensureChannel(context)
        val openApp = PendingIntent.getActivity(
            context,
            0,
            Intent(context, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val builder = Notification.Builder(context, CHANNEL_ID)
            .setSmallIcon(com.app.m3expressive.R.drawable.ic_stat_notify)
            .setContentTitle("$course 即将上课")
            .setContentText(
                buildString {
                    append(timeText)
                    if (room.isNotBlank()) append(" · ").append(room)
                    if (textbooks.isNotBlank()) append(" · 带：").append(textbooks)
                },
            )
            .setContentIntent(openApp)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setColorized(true)
            .setCategory(Notification.CATEGORY_EVENT)
            .setWhen(startAtMillis)

        // 状态胶囊文案（Android 16 的 setShortCriticalText）：compileSdk 35 无此成员，走反射
        if (Build.VERSION.SDK_INT >= ANDROID_16) {
            try {
                val chip = if (minutesLeft <= 0) "现在上课" else "$minutesLeft 分钟后上课"
                Notification.Builder::class.java
                    .getMethod("setShortCriticalText", String::class.java)
                    .invoke(builder, chip)
            } catch (_: Throwable) {
                /* 设备不支持则忽略 */
            }
        }
        // 动作 1：导航去（按作者设计稿的文案）
        if (!navigateUri.isNullOrBlank()) {
            builder.addAction(
                Notification.Action.Builder(
                    null,
                    "导航去",
                    PendingIntent.getActivity(
                        context,
                        2,
                        Intent(Intent.ACTION_VIEW, android.net.Uri.parse(navigateUri)),
                        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                    ),
                ).build(),
            )
        }
        // 动作 2：我到了（回到应用并跳到教材窗口，同时结束这次提醒）
        builder.addAction(
            Notification.Action.Builder(
                null,
                "我到了",
                PendingIntent.getActivity(
                    context,
                    3,
                    Intent(context, MainActivity::class.java)
                        .setAction(ACTION_SHOW_TEXTBOOKS)
                        .putExtra("course", course),
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                ),
            ).build(),
        )

        // 大图标（设计稿左侧的方块）：课程名首字 + 主题色底
        try {
            val size = (context.resources.displayMetrics.density * 56).toInt()
            val bitmap = android.graphics.Bitmap.createBitmap(size, size, android.graphics.Bitmap.Config.ARGB_8888)
            val canvas = android.graphics.Canvas(bitmap)
            val paint = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG)
            paint.color = 0xFF12512E.toInt()
            val radius = size / 2f
            canvas.drawRoundRect(0f, 0f, size.toFloat(), size.toFloat(), radius * 0.42f, radius * 0.42f, paint)
            paint.color = 0xFFFFFFFF.toInt()
            paint.textAlign = android.graphics.Paint.Align.CENTER
            paint.textSize = size * 0.46f
            paint.typeface = android.graphics.Typeface.DEFAULT_BOLD
            val metrics = paint.fontMetrics
            canvas.drawText(
                course.take(1),
                radius,
                radius - (metrics.ascent + metrics.descent) / 2f,
                paint,
            )
            builder.setLargeIcon(android.graphics.drawable.Icon.createWithBitmap(bitmap))
        } catch (_: Throwable) {
            /* 画不出就忽略，不影响通知 */
        }

        // 标准样式：Android 16 走 ProgressStyle（反射，复用 applyLiveUpdateStyle），否则 BigTextStyle
        val promoted = applyLiveUpdateStyle(builder, 100)
        if (!promoted) {
            val detail = buildString {
                append(timeText)
                if (room.isNotBlank()) append(" · ").append(room)
                if (textbooks.isNotBlank()) append(" · 带：").append(textbooks)
            }
            builder.setStyle(Notification.BigTextStyle().bigText(detail))
        }

        notifySafely(context, builder.build())
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
