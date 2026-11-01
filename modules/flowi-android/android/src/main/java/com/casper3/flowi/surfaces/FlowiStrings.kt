package com.casper3.flowi.surfaces

import android.graphics.Color
import java.text.NumberFormat
import java.util.Locale
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.roundToLong

/**
 * Рядки віджетів. Мова — та, що обрана в застосунку (snapshot.lang), а не
 * мова пристрою; без знімка — мова пристрою. Українська — типова.
 * Дзеркало `FlowiStrings` з targets/widget/Actions.swift.
 */
class FlowiStrings(lang: String) {
  val lang: String = if (lang == "en") "en" else "uk"
  private val en: Boolean get() = lang == "en"

  val addTask get() = if (en) "Add task" else "Додати завдання"
  val addExpense get() = if (en) "Add expense" else "Додати витрату"
  val addEvent get() = if (en) "Add event" else "Додати подію"
  val addNote get() = if (en) "Take a note" else "Зробити нотатку"
  val finance get() = if (en) "Finance" else "Фінанси"
  val steps get() = if (en) "Steps" else "Кроки"
  val tasks get() = if (en) "Tasks" else "Завдання"
  val time get() = if (en) "Time" else "Час"
  val today get() = if (en) "Today" else "Сьогодні"
  val running get() = if (en) "Running" else "Йде"
  val ofGoal get() = if (en) "of" else "з"
  val signedOut get() = if (en) "Sign in to Flowi" else "Увійдіть у Flowi"
  val hoursShort get() = if (en) "h" else "г"
  val minutesShort get() = if (en) "m" else "хв"
  val thousandShort get() = if (en) "k" else "тис"

  // Лише Android: екрани налаштування малого віджета й віджета-показника.
  val chooseAction get() = if (en) "Widget action" else "Дія віджета"
  val chooseMetric get() = if (en) "Widget metric" else "Показник віджета"

  val locale: Locale get() = if (en) Locale.US else Locale.forLanguageTag("uk-UA")
}

/** Чотири дії віджета. key — стабільний ідентифікатор у конфігурації (як rawValue на iOS). */
enum class FlowiAction(val key: String, val url: String, val tint: Int) {
  TASK("task", "ftrackingapp:///?create=1", Color.parseColor("#6366F1")),
  EXPENSE("expense", "ftrackingapp:///explore?create=1", Color.parseColor("#EF4444")),
  EVENT("event", "ftrackingapp:///calendar?create=meeting", Color.parseColor("#0EA5E9")),
  NOTE("note", "ftrackingapp:///notes?create=1", Color.parseColor("#7C3AED"));

  val iconRes: Int
    get() = when (this) {
      TASK -> R.drawable.flowi_ic_task
      EXPENSE -> R.drawable.flowi_ic_expense
      EVENT -> R.drawable.flowi_ic_event
      NOTE -> R.drawable.flowi_ic_note
    }

  val backgroundRes: Int
    get() = when (this) {
      TASK -> R.drawable.flowi_action_bg_task
      EXPENSE -> R.drawable.flowi_action_bg_expense
      EVENT -> R.drawable.flowi_action_bg_event
      NOTE -> R.drawable.flowi_action_bg_note
    }

  val circleRes: Int
    get() = when (this) {
      TASK -> R.drawable.flowi_circle_task
      EXPENSE -> R.drawable.flowi_circle_expense
      EVENT -> R.drawable.flowi_circle_event
      NOTE -> R.drawable.flowi_circle_note
    }

  fun title(s: FlowiStrings): String = when (this) {
    TASK -> s.addTask
    EXPENSE -> s.addExpense
    EVENT -> s.addEvent
    NOTE -> s.addNote
  }

  companion object {
    fun fromKey(key: String?): FlowiAction = values().firstOrNull { it.key == key } ?: TASK
  }
}

/** Кільце віджета-показника. key — стабільний ідентифікатор у конфігурації. */
enum class FlowiMetric(val key: String, val url: String) {
  TASKS("tasks", FlowiLinks.TASKS),
  STEPS("steps", FlowiLinks.STEPS),
  FINANCE("finance", FlowiLinks.FINANCE),
  TIME("time", FlowiLinks.TIME);

  fun title(s: FlowiStrings): String = when (this) {
    TASKS -> s.tasks
    STEPS -> s.steps
    FINANCE -> s.finance
    TIME -> s.time
  }

  val tint: Int
    get() = when (this) {
      TASKS -> FlowiColor.TASKS
      STEPS -> FlowiColor.STEPS
      FINANCE -> FlowiColor.INCOME
      TIME -> FlowiColor.TIME
    }

  companion object {
    fun fromKey(key: String?): FlowiMetric = values().firstOrNull { it.key == key } ?: TASKS
  }
}

/** Ті самі адреси, що `FlowiLinks` на iOS. */
object FlowiLinks {
  const val FINANCE = "ftrackingapp:///explore"
  const val STEPS = "ftrackingapp:///health-activity"
  const val TASKS = "ftrackingapp:///"
  const val TIME = "ftrackingapp:///time"
}

object FlowiColor {
  val INCOME = Color.parseColor("#10B981")
  val EXPENSE = Color.parseColor("#EF4444")
  val STEPS = Color.parseColor("#10B981")
  val TASKS = Color.parseColor("#6366F1")
  val TIME = Color.parseColor("#F59E0B")
  val ACCENT = Color.parseColor("#7C3AED")
}

/** Дзеркало `FlowiFormat` з FlowiWidget.swift. */
object FlowiFormat {
  fun compact(value: Double, s: FlowiStrings): String {
    val a = abs(value)
    val f = NumberFormat.getNumberInstance(s.locale)
    if (a >= 10_000) {
      f.maximumFractionDigits = if (a >= 100_000) 0 else 1
      val text = f.format(a / 1000)
      return "$text${if (s.lang == "en") "" else " "}${s.thousandShort}"
    }
    f.maximumFractionDigits = if (a.roundToLong().toDouble() == a) 0 else (if (a < 100) 2 else 0)
    return f.format(a)
  }

  fun signedMoney(value: Double, symbol: String, s: FlowiStrings): String {
    val sign = if (value > 0) "+" else if (value < 0) "−" else ""
    return "$sign${compact(value, s)}$symbol"
  }

  fun duration(seconds: Double, s: FlowiStrings): String {
    val total = max(0.0, seconds).toLong() / 60
    val h = total / 60
    val m = total % 60
    if (h == 0L) return "$m${s.minutesShort}"
    return if (m == 0L) "$h${s.hoursShort}" else "$h${s.hoursShort} $m${s.minutesShort}"
  }
}
