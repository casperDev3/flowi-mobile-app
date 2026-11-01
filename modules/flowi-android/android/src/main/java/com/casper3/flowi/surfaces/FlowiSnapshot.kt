package com.casper3.flowi.surfaces

import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.TimeZone

const val FLOWI_STEPS_GOAL = 10000.0

/**
 * Дзеркало `WidgetSnapshot` з utils/widgetSnapshot.ts (v1) і `FlowiSnapshot`
 * з targets/widget/Snapshot.swift. Розбір терплячий: будь-яке відсутнє поле —
 * типове значення, `next` — необовʼязковий (старі знімки його не мають).
 */
data class FlowiSnapshot(
  val v: Int,
  val generatedAt: String,
  val day: String,
  val lang: String,
  val authed: Boolean,
  val finance: Finance,
  val steps: Steps,
  val tasks: Tasks,
  val time: Time,
  val next: Next?,
) {
  data class Finance(
    val currency: String,
    val symbol: String,
    val decimals: Int,
    val income: Double,
    val expense: Double,
  )

  data class Steps(val value: Double, val goal: Double)
  data class Tasks(val done: Int, val total: Int)
  data class Running(val label: String, val startedAt: String, val count: Int)
  data class Time(val trackedSec: Double, val running: Running?)

  data class NextMeeting(val title: String, val startsAt: String, val endsAt: String, val location: String?)
  data class NextTask(
    val id: String,
    val title: String,
    val deadline: String?,
    val hasTime: Boolean,
    val overdue: Boolean,
  )
  data class Next(val meeting: NextMeeting?, val task: NextTask?)

  /**
   * Знімок за ІНШУ добу (застосунок не відкривали після півночі) — числа
   * обнуляються; таймер, що йде, лишається (він не привʼязаний до доби).
   */
  fun normalized(now: Date = Date()): FlowiSnapshot {
    if (day == dayKey(now)) return this
    return copy(
      finance = finance.copy(income = 0.0, expense = 0.0),
      steps = steps.copy(value = 0.0),
      tasks = Tasks(0, 0),
      time = time.copy(trackedSec = 0.0),
      next = null,
    )
  }

  /** Старт таймера, що йде, у мс epoch; null — таймера немає або мітка бита. */
  val runningStartedAtMs: Long?
    get() = time.running?.let { parseIso(it.startedAt) }

  companion object {
    val deviceLang: String
      get() = if (Locale.getDefault().language == "en") "en" else "uk"

    fun empty(): FlowiSnapshot = FlowiSnapshot(
      v = 1, generatedAt = "", day = "", lang = deviceLang, authed = false,
      finance = Finance("UAH", "₴", 2, 0.0, 0.0),
      steps = Steps(0.0, FLOWI_STEPS_GOAL),
      tasks = Tasks(0, 0),
      time = Time(0.0, null),
      next = null,
    )

    fun dayKey(date: Date): String {
      val c = Calendar.getInstance()
      c.time = date
      return String.format(
        Locale.US, "%04d-%02d-%02d",
        c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH),
      )
    }

    fun parseIso(value: String?): Long? {
      if (value.isNullOrEmpty()) return null
      val patterns = arrayOf("yyyy-MM-dd'T'HH:mm:ss.SSSX", "yyyy-MM-dd'T'HH:mm:ssX")
      for (p in patterns) {
        try {
          val f = SimpleDateFormat(p, Locale.US)
          f.timeZone = TimeZone.getTimeZone("UTC")
          f.isLenient = false
          val d = f.parse(value)
          if (d != null) return d.time
        } catch (_: Exception) {
          // наступний шаблон
        }
      }
      return null
    }

    private fun JSONObject.str(key: String, fallback: String = ""): String {
      val v = opt(key)
      return if (v is String) v else fallback
    }

    private fun JSONObject.strOrNull(key: String): String? {
      val v = opt(key)
      return if (v is String) v else null
    }

    private fun JSONObject.num(key: String, fallback: Double = 0.0): Double {
      val v = opt(key)
      return if (v is Number && !v.toDouble().isNaN()) v.toDouble() else fallback
    }

    private fun JSONObject.bool(key: String, fallback: Boolean = false): Boolean {
      val v = opt(key)
      return if (v is Boolean) v else fallback
    }

    fun parse(json: String?): FlowiSnapshot? {
      if (json.isNullOrEmpty()) return null
      return try {
        val o = JSONObject(json)
        val base = empty()
        val fin = o.optJSONObject("finance")
        val st = o.optJSONObject("steps")
        val tk = o.optJSONObject("tasks")
        val tm = o.optJSONObject("time")
        val run = tm?.optJSONObject("running")
        val nx = o.optJSONObject("next")
        val lang = o.str("lang", base.lang).let { if (it == "en") "en" else "uk" }
        FlowiSnapshot(
          v = o.num("v", 1.0).toInt(),
          generatedAt = o.str("generatedAt"),
          day = o.str("day"),
          lang = lang,
          authed = o.bool("authed"),
          finance = if (fin == null) base.finance else Finance(
            currency = fin.str("currency", "UAH"),
            symbol = fin.str("symbol", "₴"),
            decimals = fin.num("decimals", 2.0).toInt(),
            income = fin.num("income"),
            expense = fin.num("expense"),
          ),
          steps = if (st == null) base.steps else Steps(st.num("value"), st.num("goal", FLOWI_STEPS_GOAL)),
          tasks = if (tk == null) base.tasks else Tasks(tk.num("done").toInt(), tk.num("total").toInt()),
          time = Time(
            trackedSec = tm?.num("trackedSec") ?: 0.0,
            running = run?.let { Running(it.str("label"), it.str("startedAt"), it.num("count", 1.0).toInt()) },
          ),
          next = nx?.let { n ->
            Next(
              meeting = n.optJSONObject("meeting")?.let {
                NextMeeting(it.str("title"), it.str("startsAt"), it.str("endsAt"), it.strOrNull("location"))
              },
              task = n.optJSONObject("task")?.let {
                NextTask(it.str("id"), it.str("title"), it.strOrNull("deadline"), it.bool("hasTime"), it.bool("overdue"))
              },
            )
          },
        )
      } catch (_: Exception) {
        null
      }
    }
  }
}
