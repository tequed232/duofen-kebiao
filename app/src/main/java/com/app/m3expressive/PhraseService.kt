package com.app.m3expressive

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.max
import kotlin.random.Random

/**
 * 预制语料「常驻通知」—— 通知栏里的桌宠。
 *
 * 需求书：`docs/notification-phrases.md`（豆包）；作者随后在真机上删繁就简，最终口径：
 *   · 常驻、**不可滑动清除**的一条通知，平时显示**基础状态**
 *     （空闲「多分课表正在后台运行」/ 导航中「导航到 XXX 地点」）；
 *   · 通知栏上**只有一颗动作按钮「戳一下」** —— 作者明确要求不要「语料」列表、
 *     也不要「管理」入口；点通知主体打开应用即可；
 *   · 展示一条语料后**必须还原**回进入语料前的基础状态（作者点名要求）；
 *   · 到点自动轮播（随机 / 顺序，间隔与波动在设置页调）。
 *
 * 与实况通知严格分开（任务书 §2.1）：渠道 `m3expressive_phrase`、通知 id **1002**；
 * 实况通知是 `m3expressive_live_updates` / **1001**，两者互不覆盖。
 *
 * 只有前台服务（FGS）的通知才常驻、划掉应用也还在，所以必须 `startForeground`
 * （Android 14+ 要 `foregroundServiceType=specialUse`）。
 *
 * 状态机（唯一事实来源；纯逻辑等价物在 `web/src/lib/phrases.ts` 的 `reducePhraseState()`）：
 *   base    = 空闲 / 导航中          ← 语料展示**不修改**它
 *   showing = 正在展示的语料（瞬态） ← 展示结束按 base 还原
 */
class PhraseService : Service() {

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        ensureChannel(this)
        instance = this
        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
        } else {
            0
        }
        ServiceCompat.startForeground(this, NOTIFICATION_ID, buildNotification(this), type)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_POKE -> showTransient(this, pickPhrase())
            ACTION_AUTOPLAY_TICK -> {
                if (autoPlay && phrases.isNotEmpty()) showTransient(this, pickPhraseForAuto())
                scheduleOrCancelAutoPlay(this)
            }
            ACTION_STOP -> {
                handler.removeCallbacksAndMessages(null)
                cancelAlarm(this)
                ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
                stopSelf()
                return START_NOT_STICKY
            }
        }
        pushNotification(this)
        return START_STICKY
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        cancelAlarm(this)
        instance = null
        super.onDestroy()
    }

    companion object {
        const val CHANNEL_ID = "m3expressive_phrase"

        /** 必须与 LiveUpdates 的 1001 分开（任务书 §2.1） */
        const val NOTIFICATION_ID = 1002

        const val ACTION_POKE = "com.app.m3expressive.PHRASE_POKE"
        const val ACTION_AUTOPLAY_TICK = "com.app.m3expressive.PHRASE_TICK"
        const val ACTION_STOP = "com.app.m3expressive.PHRASE_STOP"

        /** 一条语料在通知上停留多久（与 phrases.ts 的 displaySeconds 对齐） */
        private const val DISPLAY_MS = 8_000L
        private const val ALARM_REQUEST = 0x9e2
        private const val BASE_IDLE_TEXT = "多分课表正在后台运行"

        /** 网页还没下发配置时的兜底，与 phrases.ts 的默认集一致 */
        private val DEFAULT_PHRASES = listOf(
            "该上课啦～别忘了带课本",
            "今天也要好好听课呀",
            "课间记得喝口水",
            "下节课在哪间教室来着？",
            "笔记写了没？趁现在补两行",
            "晚自习前把作业过一遍吧",
            "早点睡，明早第一节可是八点半",
        )

        @Volatile private var instance: PhraseService? = null
        @Volatile private var phrases: List<String> = DEFAULT_PHRASES
        @Volatile private var autoPlay = true
        @Volatile private var mode = "random"
        @Volatile private var intervalMin = 5
        @Volatile private var fluctuationPct = 0
        @Volatile private var baseKind = "idle"
        @Volatile private var baseDestination = ""
        @Volatile private var showing: String? = null
        @Volatile private var cursor = -1

        private val handler = Handler(Looper.getMainLooper())

        /* -------------------------------------------------------- 对外接口 -- */

        fun start(context: Context) {
            runCatching {
                ContextCompat.startForegroundService(context, Intent(context, PhraseService::class.java))
            }
        }

        fun stop(context: Context) {
            runCatching {
                context.startService(Intent(context, PhraseService::class.java).setAction(ACTION_STOP))
            }
        }

        /** 网页下发完整配置（JSON）；坏数据不抛出、沿用上一次的配置 */
        fun updateConfig(context: Context, json: String) {
            runCatching {
                val obj = JSONObject(json)
                val array = obj.optJSONArray("phrases") ?: JSONArray()
                val list = ArrayList<String>()
                for (i in 0 until array.length()) {
                    val text = array.optString(i).trim()
                    if (text.isNotEmpty() && !list.contains(text)) list.add(text)
                }
                phrases = list
                autoPlay = obj.optBoolean("autoPlay", true)
                mode = if (obj.optString("mode") == "sequential") "sequential" else "random"
                intervalMin = obj.optInt("intervalMin", 5).coerceIn(1, 120)
                fluctuationPct = obj.optInt("fluctuationPct", 0).coerceIn(0, 100)
            }
            scheduleOrCancelAutoPlay(context)
            pushNotification(context)
        }

        /** 导航开始 / 结束时调用；正在展示的语料不被打断、更不改写 base */
        fun setBaseState(context: Context, kind: String, destination: String) {
            baseKind = if (kind == "navigating") "navigating" else "idle"
            baseDestination = destination
            pushNotification(context)
        }

        /** 通知正文（收起态）：有语料显示语料，否则显示基础状态 */
        fun currentText(): String {
            showing?.let { return it }
            if (baseKind == "navigating") {
                val dest = baseDestination.trim()
                return if (dest.isEmpty()) "导航中" else "导航到" + dest
            }
            return BASE_IDLE_TEXT
        }

        fun statusJson(context: Context): String = JSONObject().apply {
            put("running", instance != null)
            put("showing", showing ?: JSONObject.NULL)
            put("base", baseKind)
            put("destination", baseDestination)
            put("phraseCount", phrases.size)
            put("autoPlay", autoPlay)
            /* 保活自检：Android 对常驻服务的两道主要限制，能读就读出来给设置页显示 */
            put(
                "keepAlive",
                JSONObject().apply {
                    val manager = context.getSystemService(NotificationManager::class.java)
                    val power = context.getSystemService(android.os.PowerManager::class.java)
                    put("notifications", manager?.areNotificationsEnabled() ?: false)
                    put("batteryUnrestricted", power?.isIgnoringBatteryOptimizations(context.packageName) ?: false)
                },
            )
        }.toString()

        /** 「戳一下」：展示一条随机语料，DISPLAY_MS 后自动还原。网页按钮与实时通知都走它。 */
        fun poke(context: Context) {
            val text = pickPhrase()
            if (text == null) {
                pushNotification(context)
                return
            }
            showTransient(context, text)
            pushNotification(context)
        }

        /* -------------------------------------------------------- 内部实现 -- */

        private fun showTransient(context: Context, text: String?) {
            if (text == null) return
            showing = text
            handler.removeCallbacksAndMessages(null)
            handler.postDelayed({ restoreBase(context) }, DISPLAY_MS)
        }

        /** 还原：清掉瞬态语料 ⇒ 正文回到 baseStateText（作者点名要求的规则） */
        private fun restoreBase(context: Context) {
            showing = null
            pushNotification(context)
        }

        private fun pickPhrase(): String? =
            if (phrases.isEmpty()) null else phrases[Random.nextInt(phrases.size)]

        private fun pickPhraseForAuto(): String? {
            if (phrases.isEmpty()) return null
            cursor = if (mode == "sequential") {
                (cursor + 1) % phrases.size
            } else {
                var next = Random.nextInt(phrases.size)
                if (phrases.size > 1 && next == cursor) next = (next + 1) % phrases.size
                next
            }
            return phrases[cursor]
        }

        private fun ensureChannel(context: Context) {
            val manager = context.getSystemService(NotificationManager::class.java) ?: return
            // 渠道已存在时不改（重要性由用户锁定）；这里只在首次创建时决定
            val channel = NotificationChannel(
                CHANNEL_ID,
                "预制语料",
                // 无声、不弹窗：它是一条常驻状态条，不该打扰人
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = "常驻状态条：显示当前状态，戳一下会说一句预制台词"
                setShowBadge(false)
                enableVibration(false)
                setSound(null, null)
            }
            manager.createNotificationChannel(channel)
        }

        private fun pushNotification(context: Context) {
            val manager = context.getSystemService(NotificationManager::class.java) ?: return
            runCatching { manager.notify(NOTIFICATION_ID, buildNotification(context)) }
        }

        private fun pokeIntent(context: Context): PendingIntent = PendingIntent.getService(
            context,
            ACTION_POKE.hashCode(),
            Intent(context, PhraseService::class.java).setAction(ACTION_POKE),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        private fun tickIntent(context: Context): PendingIntent = PendingIntent.getService(
            context,
            ALARM_REQUEST,
            Intent(context, PhraseService::class.java).setAction(ACTION_AUTOPLAY_TICK),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        private fun scheduleOrCancelAutoPlay(context: Context) {
            val manager = context.getSystemService(AlarmManager::class.java) ?: return
            if (!autoPlay || phrases.isEmpty()) {
                runCatching { manager.cancel(tickIntent(context)) }
                return
            }
            val base = intervalMin.coerceIn(1, 120) * 60_000L
            val pct = fluctuationPct.coerceIn(0, 100) / 100.0
            val factor = if (pct <= 0) 1.0 else 1 + (Random.nextDouble() * 2 - 1) * pct
            // setAndAllowWhileIdle：Doze 下也能醒来
            runCatching {
                manager.setAndAllowWhileIdle(
                    AlarmManager.ELAPSED_REALTIME_WAKEUP,
                    SystemClock.elapsedRealtime() + max(30_000L, (base * factor).toLong()),
                    tickIntent(context),
                )
            }
        }

        private fun cancelAlarm(context: Context) {
            runCatching { context.getSystemService(AlarmManager::class.java)?.cancel(tickIntent(context)) }
        }

        fun buildNotification(context: Context): Notification {
            ensureChannel(context)
            // 点通知主体 = 打开应用（唯一允许的 Activity 跳转；动作按钮一个都不跳）
            val openApp = PendingIntent.getActivity(
                context,
                0,
                Intent(context, MainActivity::class.java),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            return NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_notify)
                .setContentTitle("多分课表")
                .setContentText(currentText())
                .setContentIntent(openApp)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setShowWhen(false)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                /* 作者要求「默认展开显示」：给一个大视图（BigTextStyle），
                   通知在通知栏里就以展开形态出现，动作按钮不必再点 ▼ 才露出来。
                   换行用真正的 `\n`（Kotlin 里的转义），**不能**写成反引号 + n ——
                   那是两个字面字符，通知栏里会原样显示成 "`n"（作者看到的就是这个）。 */
                .setStyle(NotificationCompat.BigTextStyle().bigText(currentText() + "\n" + "戳一下会说一句预制台词"))
                /* 作者要求：只留「戳一下」——不要「语料」列表、也不要「管理」入口 */
                .addAction(0, "戳一下", pokeIntent(context))
                .build()
        }
    }
}
