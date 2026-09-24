package com.app.m3expressive

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.ClipData
import android.content.ClipboardManager
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
import kotlin.math.min
import kotlin.random.Random

/**
 * 预制语料「常驻通知」—— 通知栏里的桌宠。
 *
 * 需求书：`docs/notification-phrases.md`（豆包），外加作者补的两条：
 *   · 语料展示完**必须还原**回进入语料前的**基础状态**（空闲 / 导航中）；
 *   · 浏览 / 复制 / 翻页 / 收起**全部在通知栏完成**，只有「管理」才跳进应用。
 *
 * 与实况通知严格分开（任务书 §2.1 硬要求）：渠道 `m3expressive_phrase`、
 * 通知 id **1002**；实况通知是 `m3expressive_live_updates` / **1001**，两者互不覆盖。
 *
 * 只有前台服务（FGS）的通知才**常驻且不可滑动清除**、应用划掉也还在，
 * 所以必须 `startForeground`（Android 14+ 要 `foregroundServiceType=specialUse`）。
 *
 * 状态机（唯一事实来源，纯逻辑等价物在 `web/src/lib/phrases.ts` 的 `reducePhraseState()`）：
 *   base    = 空闲 / 导航中                     ← 语料展示**不修改**它
 *   showing = 正在展示的语料（瞬态）            ← 展示结束 / 收起后清空 ⇒ 回到 base 文案
 *
 * 通知栏里能做的动作（点选语料、换一批、收起、戳一下）全部是 **service 的 PendingIntent**，
 * 不跳 Activity；只有「管理」用 `PendingIntent.getActivity` 打到 [MainActivity]。
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
            ACTION_POKE -> showTransient(pickPhraseForPoke())
            ACTION_SHOW_PHRASES -> expanded = phrases.isNotEmpty()
            ACTION_NEXT_BATCH -> {
                batchStart = (batchStart + ROW_COUNT) % max(1, phrases.size)
                expanded = phrases.isNotEmpty()
            }
            ACTION_COLLAPSE -> {
                expanded = false
                showing = null
            }
            ACTION_SELECT -> {
                val index = intent.getIntExtra(EXTRA_INDEX, -1)
                phrases.getOrNull(index)?.let { selectPhrase(it) }
            }
            ACTION_AUTOPLAY_TICK -> {
                if (autoPlay && phrases.isNotEmpty()) showTransient(pickPhraseForAuto())
                scheduleOrCancelAutoPlay(this)
            }
            ACTION_STOP -> {
                stopSelfAndCancel()
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

    /* ------------------------------------------------------------ 实例侧动作 -- */

    /** 展示一条语料（瞬态），DISPLAY_MS 后自动还原基础状态 */
    private fun showTransient(text: String?) {
        if (text == null) {
            expanded = false
            return
        }
        showing = text
        handler.removeCallbacksAndMessages(null)
        handler.postDelayed({ restoreBase(this) }, DISPLAY_MS)
    }

    /** 点选一条语料：先写剪贴板并给「已复制」反馈，约 2 秒后还原基础状态（任务书 §1 规则 3） */
    private fun selectPhrase(text: String) {
        val copied = runCatching {
            getSystemService(ClipboardManager::class.java)
                ?.setPrimaryClip(ClipData.newPlainText("多分课表", text))
            true
        }.getOrDefault(false)
        showing = if (copied) "已复制：$text" else text
        expanded = false
        pushNotification(this)
        handler.removeCallbacksAndMessages(null)
        handler.postDelayed({ restoreBase(this) }, if (copied) COPY_FEEDBACK_MS else DISPLAY_MS)
    }

    private fun stopSelfAndCancel() {
        handler.removeCallbacksAndMessages(null)
        cancelAlarm(this)
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    companion object {
        const val CHANNEL_ID = "m3expressive_phrase"

        /** 必须与 LiveUpdates 的 1001 分开（任务书 §2.1） */
        const val NOTIFICATION_ID = 1002

        const val ACTION_POKE = "com.app.m3expressive.PHRASE_POKE"
        const val ACTION_SHOW_PHRASES = "com.app.m3expressive.PHRASE_SHOW"
        const val ACTION_NEXT_BATCH = "com.app.m3expressive.PHRASE_NEXT"
        const val ACTION_COLLAPSE = "com.app.m3expressive.PHRASE_COLLAPSE"
        const val ACTION_SELECT = "com.app.m3expressive.PHRASE_SELECT"
        const val ACTION_AUTOPLAY_TICK = "com.app.m3expressive.PHRASE_TICK"
        const val ACTION_STOP = "com.app.m3expressive.PHRASE_STOP"
        const val ACTION_MANAGE_PHRASES = "com.app.m3expressive.MANAGE_PHRASES"
        const val EXTRA_INDEX = "index"

        /** 通知里一屏放几条语料（RemoteViews 不能滚动，所以用「换一批」翻页） */
        private const val ROW_COUNT = 3
        /** 一条语料在通知上停留多久（与 phrases.ts 的 displaySeconds 对齐） */
        private const val DISPLAY_MS = 8_000L
        /** 「已复制：X」反馈停留时长 */
        private const val COPY_FEEDBACK_MS = 2_000L
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
        @Volatile private var autoPlay = false
        @Volatile private var mode = "random"
        @Volatile private var intervalMin = 5
        @Volatile private var fluctuationPct = 0
        @Volatile private var baseKind = "idle"
        @Volatile private var baseDestination = ""
        @Volatile private var showing: String? = null
        @Volatile private var expanded = false
        @Volatile private var batchStart = 0
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

        /** 网页下发完整配置（JSON），解析后刷新调度与通知；坏数据不抛出、沿用上一次的配置 */
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
                autoPlay = obj.optBoolean("autoPlay", false)
                mode = if (obj.optString("mode") == "sequential") "sequential" else "random"
                intervalMin = obj.optInt("intervalMin", 5).coerceIn(1, 120)
                fluctuationPct = obj.optInt("fluctuationPct", 0).coerceIn(0, 100)
                batchStart = 0
                if (phrases.isEmpty()) expanded = false
            }
            scheduleOrCancelAutoPlay(context)
            pushNotification(context)
        }

        /** 导航开始 / 结束时调用；语料正在展示也不打断它、更不改写 base */
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
                return if (dest.isEmpty()) "导航中" else "导航到$dest"
            }
            return BASE_IDLE_TEXT
        }

        fun statusJson(context: Context): String = JSONObject().apply {
            put("running", instance != null)
            put("expanded", expanded)
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

        /** 「戳一下」：展示一条随机语料，DISPLAY_MS 后还原。通知栏与实时通知都用它。 */
        fun poke(context: Context) {
            val text = pickPhraseForPoke()
            if (text == null) {
                pushNotification(context)
                return
            }
            showing = text
            handler.removeCallbacksAndMessages(null)
            handler.postDelayed({ restoreBase(context) }, DISPLAY_MS)
            pushNotification(context)
        }

        /* -------------------------------------------------------- 内部实现 -- */

        private fun restoreBase(context: Context) {
            showing = null
            pushNotification(context)
        }

        private fun pickPhraseForPoke(): String? =
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
            if (manager.getNotificationChannel(CHANNEL_ID) != null) return
            val channel = NotificationChannel(
                CHANNEL_ID,
                "预制语料",
                // 无声、不弹窗：它是一条常驻状态条，不该打扰人
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = "在通知栏里翻看 / 点选预制语料，常驻不可滑动清除"
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

        private fun serviceIntent(context: Context, action: String, index: Int = -1): PendingIntent {
            val intent = Intent(context, PhraseService::class.java).setAction(action)
            if (index >= 0) intent.putExtra(EXTRA_INDEX, index)
            return PendingIntent.getService(
                context,
                action.hashCode() + index,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
        }

        /** 「管理」是唯一允许跳进应用的入口（任务书硬边界） */
        private fun manageIntent(context: Context): PendingIntent = PendingIntent.getActivity(
            context,
            ACTION_MANAGE_PHRASES.hashCode(),
            Intent(context, MainActivity::class.java).setAction(ACTION_MANAGE_PHRASES),
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
            // setAndAllowWhileIdle：Doze 下也能醒来（任务书 §2.3）
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
            val openApp = PendingIntent.getActivity(
                context,
                0,
                Intent(context, MainActivity::class.java),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            val builder = NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_notify)
                .setContentTitle("多分课表")
                .setContentText(currentText())
                .setContentIntent(openApp)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setSilent(true)
                .setShowWhen(false)
                .setPriority(NotificationCompat.PRIORITY_LOW)

            if (expanded && phrases.isNotEmpty()) {
                val total = phrases.size
                builder.setSubText("预制语料 ${batchStart + 1}-${min(total, batchStart + ROW_COUNT)}/$total")
                for (offset in 0 until ROW_COUNT) {
                    val index = (batchStart + offset) % total
                    builder.addAction(0, phrases[index].take(24), serviceIntent(context, ACTION_SELECT, index))
                }
                builder.addAction(0, "换一批", serviceIntent(context, ACTION_NEXT_BATCH))
                builder.addAction(0, "收起", serviceIntent(context, ACTION_COLLAPSE))
            } else {
                builder.addAction(0, "语料", serviceIntent(context, ACTION_SHOW_PHRASES))
                builder.addAction(0, "戳一下", serviceIntent(context, ACTION_POKE))
                builder.addAction(0, "管理", manageIntent(context))
            }
            return builder.build()
        }
    }
}
