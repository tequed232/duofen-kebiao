package com.app.m3expressive

import android.Manifest
import android.content.ContentValues
import android.content.Context
import android.content.pm.PackageManager
import android.provider.CalendarContract
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject
import java.util.TimeZone

/**
 * 课表 → 系统日历：写入 / 一键清除。
 *
 * 作者的要求（2026-09-24，真机截图圈了两处）：
 *   · 主页两个按钮：大的「添加到系统日程」、小的「清除本 App 的日程」；
 *   · 先申请**日程项修改权限**；
 *   · 写进去的每条都要能认出来是「多分课表」导入的 —— 便于用户一键清干净。
 *
 * 认领方式有两层，缺一不可：
 *   1. `CUSTOM_APP_PACKAGE / CUSTOM_APP_URI` —— CalendarContract 给第三方 App 留的正式字段；
 *   2. 正文里的标记字符串（[MARKER]）—— 有些日历提供方不保存自定义列，
 *      这时只能靠正文匹配；用户手动到系统日历里搜这个词也能找到。
 *
 * 重复导入的处理：**先删自己写过的、再写新的**，所以连点几次不会翻倍。
 */
object CalendarExport {

    /**
     * 与网页侧 `web/src/lib/calendarExport.ts` 的 `CALENDAR_MARKER` **必须逐字一致**。
     * `scripts/check-native-bridge.mjs` 会把两边钉在一起，改一边不改另一边会红。
     */
    const val MARKER = "来自多分课表"
    const val APP_URI_PREFIX = "duofen://course/"

    val PERMISSIONS = arrayOf(Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR)

    fun hasPermission(context: Context): Boolean = PERMISSIONS.all {
        ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED
    }

    private val EVENT_COLUMNS = arrayOf(CalendarContract.Events._ID)

    /** 认领条件：自定义包名，或正文里有标记（兜底） */
    private fun ourSelection(): String =
        "(${CalendarContract.Events.CUSTOM_APP_PACKAGE} = ? OR ${CalendarContract.Events.DESCRIPTION} LIKE ?)"

    private fun ourArgs(packageName: String) = arrayOf(packageName, "%$MARKER%")

    /** 当前系统日历里有多少条是「我们写的」 */
    fun count(context: Context): Int {
        if (!hasPermission(context)) return 0
        return runCatching {
            context.contentResolver.query(
                CalendarContract.Events.CONTENT_URI,
                EVENT_COLUMNS,
                ourSelection(),
                ourArgs(context.packageName),
                null,
            )?.use { it.count } ?: 0
        }.getOrDefault(0)
    }

    /**
     * 挑一个可写的日历：优先**本地日历**（`ACCOUNT_TYPE_LOCAL`，不联网、不被同步覆盖），
     * 其次系统标了 primary 的，再其次任何允许"参与人及以上"权限的。
     */
    private fun writableCalendar(context: Context): Pair<Long, String>? {
        val projection = arrayOf(
            CalendarContract.Calendars._ID,
            CalendarContract.Calendars.CALENDAR_DISPLAY_NAME,
            CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL,
            CalendarContract.Calendars.IS_PRIMARY,
            CalendarContract.Calendars.ACCOUNT_TYPE,
        )
        val selection = "${CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL} >= ?"
        val args = arrayOf(CalendarContract.Calendars.CAL_ACCESS_CONTRIBUTOR.toString())
        val candidates = mutableListOf<Triple<Long, String, Int>>()
        runCatching {
            context.contentResolver
                .query(CalendarContract.Calendars.CONTENT_URI, projection, selection, args, null)
                ?.use { cursor ->
                    while (cursor.moveToNext()) {
                        val id = cursor.getLong(0)
                        val name = cursor.getString(1) ?: "日历"
                        val isPrimary = if (cursor.isNull(3)) 0 else cursor.getInt(3)
                        val accountType = cursor.getString(4) ?: ""
                        var score = 0
                        if (accountType == CalendarContract.ACCOUNT_TYPE_LOCAL) score += 4
                        if (isPrimary == 1) score += 2
                        if (name.contains("本地") || name.contains("local", ignoreCase = true)) score += 1
                        candidates += Triple(id, name, score)
                    }
                }
        }
        val best = candidates.maxByOrNull { it.third } ?: return null
        return best.first to best.second
    }

    private fun result(ok: Boolean, count: Int = 0, error: String? = null): String = JSONObject().apply {
        put("ok", ok)
        put("count", count)
        if (error != null) put("error", error) else put("error", JSONObject.NULL)
    }.toString()

    fun status(context: Context): String = JSONObject().apply {
        put("permission", if (hasPermission(context)) "granted" else "missing")
        put("count", count(context))
        put("calendar", writableCalendar(context)?.second ?: "")
    }.toString()

    /** 写入日程。payload 是网页按 calendarExport.ts 算好的数组，字段：title/location/description/start/end/repeat */
    fun import(context: Context, eventsJson: String): String {
        if (!hasPermission(context)) return result(false, error = "no-permission")
        val target = writableCalendar(context) ?: return result(false, error = "no-writable-calendar")
        val events = runCatching { JSONArray(eventsJson) }.getOrNull() ?: return result(false, error = "bad-payload")

        // 先清掉自己写过的：连点两次不会翻倍
        removeAll(context)

        val resolver = context.contentResolver
        val timeZone = TimeZone.getDefault().id
        var inserted = 0
        var customColumnsRejected = false

        for (index in 0 until events.length()) {
            val event = events.optJSONObject(index) ?: continue
            val start = event.optLong("start", 0L)
            val end = event.optLong("end", 0L)
            if (start <= 0L || end <= start) continue
            val repeat = event.optInt("repeat", 1).coerceAtLeast(1)

            val base = ContentValues().apply {
                put(CalendarContract.Events.CALENDAR_ID, target.first)
                put(CalendarContract.Events.TITLE, event.optString("title"))
                put(CalendarContract.Events.EVENT_LOCATION, event.optString("location"))
                put(CalendarContract.Events.DESCRIPTION, event.optString("description"))
                put(CalendarContract.Events.DTSTART, start)
                put(CalendarContract.Events.DTEND, end)
                put(CalendarContract.Events.EVENT_TIMEZONE, timeZone)
                put(CalendarContract.Events.ALL_DAY, 0)
                if (repeat > 1) put(CalendarContract.Events.RRULE, "FREQ=WEEKLY;COUNT=$repeat")
            }

            val uri = runCatching {
                // 自定义列是"正式认领方式"，但个别日历提供方不接受 —— 被拒过就不再试
                if (customColumnsRejected) {
                    resolver.insert(CalendarContract.Events.CONTENT_URI, base)
                } else {
                    val withOwner = ContentValues(base).apply {
                        put(CalendarContract.Events.CUSTOM_APP_PACKAGE, context.packageName)
                        put(CalendarContract.Events.CUSTOM_APP_URI, APP_URI_PREFIX + event.optString("key"))
                    }
                    runCatching { resolver.insert(CalendarContract.Events.CONTENT_URI, withOwner) }
                        .getOrElse {
                            customColumnsRejected = true
                            resolver.insert(CalendarContract.Events.CONTENT_URI, base)
                        }
                }
            }.getOrNull()

            if (uri != null) inserted += 1
        }

        return result(inserted > 0, inserted, if (inserted > 0) null else "insert-failed")
    }

    /** 一键清除：只删「我们写的」，用户自己加的日程不受影响 */
    fun removeAll(context: Context): String {
        if (!hasPermission(context)) return result(false, error = "no-permission")
        val deleted = runCatching {
            context.contentResolver.delete(
                CalendarContract.Events.CONTENT_URI,
                ourSelection(),
                ourArgs(context.packageName),
            )
        }.getOrDefault(0)
        return result(true, deleted)
    }
}
