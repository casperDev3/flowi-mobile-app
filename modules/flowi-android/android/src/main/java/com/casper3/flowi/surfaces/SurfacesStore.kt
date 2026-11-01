package com.casper3.flowi.surfaces

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID

/**
 * Спільне сховище поверхонь: SharedPreferences("flowi_surfaces").
 *
 *  • `flowi_widget_snapshot_v1` — знімок для віджетів (той самий JSON, що iOS);
 *  • `flowi_pending_device_actions_v1` — JSON-рядок `DeviceAction[]`, які
 *    натиснуто поза застосунком (Stop у сповіщенні); JS забирає й видаляє
 *    оброблені id (spec §7.3);
 *  • `flowi_device_action_owner_v1` — id користувача, чиї дії пише ресивер
 *    (JS ставить при вході/виході/зміні акаунта); null — ніхто не увійшов,
 *    і Stop у сповіщенні нічого не ставить у чергу;
 *  • вибір малого віджета / віджета-показника — по appWidgetId.
 *
 * Черга пишеться з ресивера і з JS-потоку модуля — усе під одним замком і
 * через commit(), щоб читання одразу після запису бачило свіже значення.
 */
object SurfacesStore {
  const val PREFS = "flowi_surfaces"
  const val SNAPSHOT_KEY = "flowi_widget_snapshot_v1"
  const val PENDING_KEY = "flowi_pending_device_actions_v1"
  const val OWNER_KEY = "flowi_device_action_owner_v1"
  /** Захист від нескінченного росту, якщо JS довго не запускався. */
  private const val PENDING_CAP = 200

  private val lock = Any()

  fun prefs(context: Context): SharedPreferences =
    context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  // MARK: snapshot

  fun readSnapshotJson(context: Context): String? = prefs(context).getString(SNAPSHOT_KEY, null)

  fun writeSnapshotJson(context: Context, json: String) {
    prefs(context).edit().putString(SNAPSHOT_KEY, json).apply()
  }

  fun loadSnapshot(context: Context): FlowiSnapshot =
    FlowiSnapshot.parse(readSnapshotJson(context)) ?: FlowiSnapshot.empty()

  /**
   * Таймер зупинено поза застосунком: прибрати `time.running` зі знімка, щоб
   * віджет не показував живий час зупиненого таймера до наступного запису з JS
   * (той перерахує все, включно з іншими таймерами). true — знімок змінено.
   */
  fun clearRunningInSnapshot(context: Context): Boolean {
    val raw = readSnapshotJson(context) ?: return false
    return try {
      val o = JSONObject(raw)
      val time = o.optJSONObject("time") ?: return false
      if (time.isNull("running")) return false
      time.put("running", JSONObject.NULL)
      prefs(context).edit().putString(SNAPSHOT_KEY, o.toString()).commit()
      true
    } catch (_: Exception) {
      false
    }
  }

  // MARK: device action owner

  fun deviceActionOwner(context: Context): String? =
    prefs(context).getString(OWNER_KEY, null)?.takeIf { it.isNotEmpty() }

  fun setDeviceActionOwner(context: Context, userId: String?) {
    synchronized(lock) {
      val editor = prefs(context).edit()
      if (userId.isNullOrEmpty()) editor.remove(OWNER_KEY) else editor.putString(OWNER_KEY, userId)
      editor.commit()
    }
  }

  // MARK: pending device actions

  /** Валідні записи черги (обʼєкти з рядковим id); биті відкидаються й не повертаються. */
  private fun readPendingArray(context: Context): JSONArray {
    val raw = prefs(context).getString(PENDING_KEY, null) ?: return JSONArray()
    val parsed = try {
      JSONArray(raw)
    } catch (_: Exception) {
      return JSONArray()
    }
    val out = JSONArray()
    for (i in 0 until parsed.length()) {
      val item = parsed.optJSONObject(i) ?: continue
      val id = item.opt("id")
      if (id is String && id.isNotEmpty()) out.put(item)
    }
    return out
  }

  private fun writePendingArray(context: Context, array: JSONArray) {
    val editor = prefs(context).edit()
    if (array.length() == 0) editor.remove(PENDING_KEY) else editor.putString(PENDING_KEY, array.toString())
    editor.commit()
  }

  fun readPending(context: Context): String = synchronized(lock) { readPendingArray(context).toString() }

  fun appendPending(context: Context, action: JSONObject) {
    synchronized(lock) {
      val current = readPendingArray(context)
      val id = action.optString("id")
      for (i in 0 until current.length()) {
        if (current.optJSONObject(i)?.optString("id") == id) return
      }
      current.put(action)
      val start = (current.length() - PENDING_CAP).coerceAtLeast(0)
      val trimmed = JSONArray()
      for (i in start until current.length()) trimmed.put(current.get(i))
      writePendingArray(context, trimmed)
    }
  }

  /** Вихід / зміна акаунта: черга чужих дій більше не застосовується. */
  fun clearPending(context: Context) {
    synchronized(lock) { writePendingArray(context, JSONArray()) }
  }

  fun removePending(context: Context, ids: Collection<String>) {
    if (ids.isEmpty()) return
    val drop = ids.toHashSet()
    synchronized(lock) {
      val current = readPendingArray(context)
      val kept = JSONArray()
      for (i in 0 until current.length()) {
        val item = current.optJSONObject(i) ?: continue
        if (item.optString("id") !in drop) kept.put(item)
      }
      writePendingArray(context, kept)
    }
  }

  // MARK: per-widget configuration

  private fun smallKey(id: Int) = "widget_small_action_$id"
  private fun metricKey(id: Int) = "widget_metric_$id"

  fun smallAction(context: Context, appWidgetId: Int): FlowiAction =
    FlowiAction.fromKey(prefs(context).getString(smallKey(appWidgetId), null))

  fun setSmallAction(context: Context, appWidgetId: Int, action: FlowiAction) {
    prefs(context).edit().putString(smallKey(appWidgetId), action.key).commit()
  }

  fun metric(context: Context, appWidgetId: Int): FlowiMetric =
    FlowiMetric.fromKey(prefs(context).getString(metricKey(appWidgetId), null))

  fun setMetric(context: Context, appWidgetId: Int, metric: FlowiMetric) {
    prefs(context).edit().putString(metricKey(appWidgetId), metric.key).commit()
  }

  fun forgetWidgets(context: Context, appWidgetIds: IntArray) {
    val editor = prefs(context).edit()
    for (id in appWidgetIds) {
      editor.remove(smallKey(id))
      editor.remove(metricKey(id))
    }
    editor.apply()
  }
}

/** Конверт DeviceAction (spec §2), який пише Android. */
object DeviceActions {
  const val SOURCE = "android_notification"

  private fun isoUtc(date: Date): String {
    val f = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
    f.timeZone = TimeZone.getTimeZone("UTC")
    return f.format(date)
  }

  private fun localDay(date: Date): String =
    SimpleDateFormat("yyyy-MM-dd", Locale.US).format(date)

  /** [userId] — власник черги (NATIVE CONTRACT): JS відкидає дії чужого користувача. */
  fun timerStop(timerId: String, userId: String, now: Date = Date()): JSONObject = JSONObject().apply {
    put("id", UUID.randomUUID().toString().lowercase(Locale.US))
    put("userId", userId)
    put("type", "timer_stop")
    put("at", isoUtc(now))
    put("tz", TimeZone.getDefault().id)
    put("day", localDay(now))
    put("source", SOURCE)
    put("payload", JSONObject().put("timerId", timerId))
  }
}
