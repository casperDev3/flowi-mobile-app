package com.casper3.flowi.surfaces

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.graphics.Typeface
import android.os.Bundle
import android.util.TypedValue
import android.view.Gravity
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

/**
 * Екран налаштування віджета (довге натискання → «Налаштувати», або одразу
 * при додаванні). Простий список варіантів, зібраний кодом — без AppCompat і
 * без власних layout-ів, щоб модуль не тягнув залежностей.
 * Мова — snapshot.lang, як у самих віджетів.
 */
abstract class FlowiWidgetConfigActivity : Activity() {
  protected data class Option(val key: String, val title: String, val iconRes: Int?, val tint: Int)

  protected abstract fun heading(s: FlowiStrings): String
  protected abstract fun options(s: FlowiStrings): List<Option>
  protected abstract fun currentKey(appWidgetId: Int): String
  protected abstract fun save(appWidgetId: Int, key: String)
  protected abstract val kind: WidgetKind

  private var appWidgetId = AppWidgetManager.INVALID_APPWIDGET_ID

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    appWidgetId = intent?.extras?.getInt(
      AppWidgetManager.EXTRA_APPWIDGET_ID,
      AppWidgetManager.INVALID_APPWIDGET_ID,
    ) ?: AppWidgetManager.INVALID_APPWIDGET_ID
    // Закрили без вибору → віджет не додається (до Android 12) / лишається як був.
    setResult(RESULT_CANCELED, resultIntent())
    if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
      finish()
      return
    }
    val s = FlowiStrings(SurfacesStore.loadSnapshot(this).lang)
    setContentView(buildContent(s))
  }

  private fun resultIntent() = Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)

  private fun dp(value: Float): Int =
    TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, resources.displayMetrics).toInt()

  private fun buildContent(s: FlowiStrings): ScrollView {
    val textColor = getColor(R.color.flowi_widget_text)
    val list = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(20f), dp(20f), dp(20f), dp(12f))
    }
    list.addView(TextView(this).apply {
      text = heading(s)
      setTextColor(textColor)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
      typeface = Typeface.DEFAULT_BOLD
      setPadding(0, 0, 0, dp(12f))
    })
    val current = currentKey(appWidgetId)
    for (option in options(s)) {
      val row = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        minimumHeight = dp(52f)
        isClickable = true
        isFocusable = true
        contentDescription = option.title
        val outValue = TypedValue()
        theme.resolveAttribute(android.R.attr.selectableItemBackground, outValue, true)
        setBackgroundResource(outValue.resourceId)
        setOnClickListener { choose(option.key) }
      }
      val icon = ImageView(this).apply {
        if (option.iconRes != null) setImageResource(option.iconRes)
        else setImageBitmap(
          RingRenderer.render(
            this@FlowiWidgetConfigActivity,
            listOf(RingRenderer.Segment(0.7, option.tint)),
            24f,
            4f,
          ),
        )
        importantForAccessibility = ImageView.IMPORTANT_FOR_ACCESSIBILITY_NO
      }
      row.addView(icon, LinearLayout.LayoutParams(dp(26f), dp(26f)))
      row.addView(
        TextView(this).apply {
          text = option.title
          setTextColor(textColor)
          setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
          if (option.key == current) typeface = Typeface.DEFAULT_BOLD
          setPadding(dp(14f), 0, 0, 0)
        },
        LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f),
      )
      if (option.key == current) {
        row.addView(TextView(this).apply {
          text = "✓"
          setTextColor(option.tint)
          setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
        })
      }
      list.addView(row, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
    }
    return ScrollView(this).apply {
      setBackgroundColor(getColor(R.color.flowi_widget_bg))
      addView(list)
    }
  }

  private fun choose(key: String) {
    save(appWidgetId, key)
    val manager = AppWidgetManager.getInstance(this)
    WidgetUpdater.update(this, manager, kind, appWidgetId)
    WidgetUpdater.scheduleMidnight(this)
    setResult(RESULT_OK, resultIntent())
    finish()
  }
}

/** Малий віджет: одна з чотирьох дій. */
class FlowiSmallWidgetConfigActivity : FlowiWidgetConfigActivity() {
  override val kind = WidgetKind.SMALL
  override fun heading(s: FlowiStrings) = s.chooseAction
  override fun options(s: FlowiStrings) = FlowiAction.values().map { Option(it.key, it.title(s), it.iconRes, it.tint) }
  override fun currentKey(appWidgetId: Int) = SurfacesStore.smallAction(this, appWidgetId).key
  override fun save(appWidgetId: Int, key: String) =
    SurfacesStore.setSmallAction(this, appWidgetId, FlowiAction.fromKey(key))
}

/** Віджет-показник: одне з чотирьох кілець. */
class FlowiMetricWidgetConfigActivity : FlowiWidgetConfigActivity() {
  override val kind = WidgetKind.METRIC
  override fun heading(s: FlowiStrings) = s.chooseMetric
  override fun options(s: FlowiStrings) = FlowiMetric.values().map { Option(it.key, it.title(s), null, it.tint) }
  override fun currentKey(appWidgetId: Int) = SurfacesStore.metric(this, appWidgetId).key
  override fun save(appWidgetId: Int, key: String) =
    SurfacesStore.setMetric(this, appWidgetId, FlowiMetric.fromKey(key))
}
