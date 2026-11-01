package com.casper3.flowi.surfaces

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.SystemClock
import android.util.Log
import android.view.View
import android.widget.RemoteViews
import java.util.Calendar
import java.util.Date
import java.util.concurrent.Executors

private const val TAG = "FlowiWidgets"

/** Чотири віджети Flowi. */
enum class WidgetKind(val providerClass: Class<out AppWidgetProvider>) {
  LARGE(FlowiLargeWidgetProvider::class.java),
  MEDIUM(FlowiMediumWidgetProvider::class.java),
  SMALL(FlowiSmallWidgetProvider::class.java),
  METRIC(FlowiMetricWidgetProvider::class.java),
}

/** Те, що показує одне кільце — та сама логіка, що LargeView.rings на iOS. */
data class RingModel(
  val metric: FlowiMetric,
  val title: String,
  val caption: String,
  val segments: List<RingRenderer.Segment>,
  val center: String,
  /** null — основний колір тексту. */
  val centerColor: Int?,
  /** Є → центр — живий Chronometer від цієї мітки (мс epoch). */
  val runningSinceMs: Long?,
)

object RingModels {
  fun build(metric: FlowiMetric, snap: FlowiSnapshot, s: FlowiStrings): RingModel = when (metric) {
    FlowiMetric.FINANCE -> {
      // Фінанси сьогодні: дохід (зелений) проти витрат (червоний).
      val income = snap.finance.income
      val expense = snap.finance.expense
      val flow = income + expense
      val net = income - expense
      RingModel(
        metric = metric,
        title = s.finance,
        caption = "+${FlowiFormat.compact(income, s)} · −${FlowiFormat.compact(expense, s)}",
        segments = if (flow > 0) listOf(
          RingRenderer.Segment(income / flow, FlowiColor.INCOME),
          RingRenderer.Segment(expense / flow, FlowiColor.EXPENSE),
        ) else emptyList(),
        center = FlowiFormat.signedMoney(net, snap.finance.symbol, s),
        centerColor = if (net < 0) FlowiColor.EXPENSE else if (net > 0) FlowiColor.INCOME else null,
        runningSinceMs = null,
      )
    }
    FlowiMetric.STEPS -> {
      // Кроки проти цілі (на Android — значення зі знімка застосунку).
      val goal = maxOf(snap.steps.goal, 1.0)
      RingModel(
        metric = metric,
        title = s.steps,
        caption = "${s.ofGoal} ${FlowiFormat.compact(goal, s)}",
        segments = listOf(RingRenderer.Segment(snap.steps.value / goal, FlowiColor.STEPS)),
        center = FlowiFormat.compact(snap.steps.value, s),
        centerColor = null,
        runningSinceMs = null,
      )
    }
    FlowiMetric.TASKS -> {
      val t = snap.tasks
      RingModel(
        metric = metric,
        title = s.tasks,
        caption = s.today,
        segments = if (t.total > 0) {
          listOf(RingRenderer.Segment(t.done.toDouble() / t.total.toDouble(), FlowiColor.TASKS))
        } else emptyList(),
        center = "${t.done}/${t.total}",
        centerColor = null,
        runningSinceMs = null,
      )
    }
    FlowiMetric.TIME -> {
      // Час: живий таймер або записане сьогодні (кільце — частка 8-годинного дня).
      val startedAt = snap.runningStartedAtMs
      val label = snap.time.running?.label.orEmpty()
      RingModel(
        metric = metric,
        title = s.time,
        caption = if (startedAt != null) (if (label.isNotEmpty()) label else s.running) else s.today,
        segments = listOf(
          RingRenderer.Segment(if (startedAt != null) 1.0 else snap.time.trackedSec / (8 * 3600), FlowiColor.TIME),
        ),
        center = FlowiFormat.duration(snap.time.trackedSec, s),
        centerColor = null,
        runningSinceMs = startedAt,
      )
    }
  }
}

object WidgetUpdater {
  private const val ACTION_MIDNIGHT = "com.casper3.flowi.surfaces.MIDNIGHT_REFRESH"
  private val executor = Executors.newSingleThreadExecutor()

  /** Асинхронно перемалювати всі віджети (виклик з JS не чекає на Bitmap-и). */
  fun requestUpdateAll(context: Context) {
    val app = context.applicationContext
    executor.execute {
      try {
        updateAll(app)
      } catch (e: Exception) {
        Log.w(TAG, "updateAll failed", e)
      }
    }
  }

  fun updateAll(context: Context) {
    val manager = AppWidgetManager.getInstance(context) ?: return
    val snap = SurfacesStore.loadSnapshot(context).normalized(Date())
    for (kind in WidgetKind.values()) {
      val ids = manager.getAppWidgetIds(ComponentName(context, kind.providerClass))
      for (id in ids) update(context, manager, kind, id, snap)
    }
    scheduleMidnight(context)
  }

  fun update(
    context: Context,
    manager: AppWidgetManager,
    kind: WidgetKind,
    appWidgetId: Int,
    snapshot: FlowiSnapshot = SurfacesStore.loadSnapshot(context).normalized(Date()),
  ) {
    val views = try {
      when (kind) {
        WidgetKind.LARGE -> large(context, snapshot)
        WidgetKind.MEDIUM -> medium(context, snapshot)
        WidgetKind.SMALL -> small(context, snapshot, SurfacesStore.smallAction(context, appWidgetId))
        WidgetKind.METRIC -> metric(context, snapshot, SurfacesStore.metric(context, appWidgetId))
      }
    } catch (e: Exception) {
      Log.w(TAG, "render $kind failed", e)
      return
    }
    // Хост міг зникнути / перезапуститись — один віджет не має валити решту.
    try {
      manager.updateAppWidget(appWidgetId, views)
    } catch (e: Exception) {
      Log.w(TAG, "updateAppWidget $kind#$appWidgetId failed", e)
    }
  }

  /**
   * Колір тексту з ресурсу теми. На API 31+ — посилання на ресурс, яке хост
   * розвʼязує сам під поточну тему (світла/темна перемикаються без
   * перемальовування). Раніше — розвʼязаний колір (оновлюється при наступному
   * перемальовуванні, напр. ACTION_CONFIGURATION_CHANGED, поки живий процес).
   */
  private fun setThemedTextColor(context: Context, views: RemoteViews, viewId: Int, colorRes: Int) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      views.setColorStateList(viewId, "setTextColor", colorRes)
    } else {
      views.setTextColor(viewId, context.getColor(colorRes))
    }
  }

  // MARK: intents

  fun openUrlIntent(context: Context, url: String): PendingIntent {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
      setPackage(context.packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    return PendingIntent.getActivity(
      context,
      url.hashCode(),
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  // MARK: sizes

  private fun bindActionGrid(context: Context, views: RemoteViews, s: FlowiStrings) {
    val cells = listOf(
      Triple(FlowiAction.TASK, R.id.flowi_action_task, R.id.flowi_action_task_title),
      Triple(FlowiAction.EXPENSE, R.id.flowi_action_expense, R.id.flowi_action_expense_title),
      Triple(FlowiAction.EVENT, R.id.flowi_action_event, R.id.flowi_action_event_title),
      Triple(FlowiAction.NOTE, R.id.flowi_action_note, R.id.flowi_action_note_title),
    )
    for ((action, cell, title) in cells) {
      views.setTextViewText(title, action.title(s))
      views.setOnClickPendingIntent(cell, openUrlIntent(context, action.url))
    }
  }

  private class RingIds(
    val cell: Int, val img: Int, val center: Int, val chrono: Int, val title: Int, val caption: Int,
  )

  private fun bindRing(
    context: Context,
    views: RemoteViews,
    ids: RingIds,
    model: RingModel,
    sizeDp: Float,
    lineWidthDp: Float,
  ) {
    views.setImageViewBitmap(ids.img, RingRenderer.render(context, model.segments, sizeDp, lineWidthDp))
    views.setTextViewText(ids.title, model.title)
    views.setTextViewText(ids.caption, model.caption)
    val since = model.runningSinceMs
    if (since != null) {
      // Chronometer рахує від elapsedRealtime: переводимо мітку старту в цю шкалу.
      val base = SystemClock.elapsedRealtime() - (System.currentTimeMillis() - since).coerceAtLeast(0)
      views.setChronometer(ids.chrono, base, null, true)
      views.setViewVisibility(ids.chrono, View.VISIBLE)
      views.setViewVisibility(ids.center, View.GONE)
    } else {
      views.setChronometer(ids.chrono, SystemClock.elapsedRealtime(), null, false)
      views.setViewVisibility(ids.chrono, View.GONE)
      views.setViewVisibility(ids.center, View.VISIBLE)
      views.setTextViewText(ids.center, model.center)
      val color = model.centerColor
      if (color != null) views.setTextColor(ids.center, color)
      else setThemedTextColor(context, views, ids.center, R.color.flowi_widget_text)
    }
    views.setOnClickPendingIntent(ids.cell, openUrlIntent(context, model.metric.url))
  }

  private val largeRings = listOf(
    FlowiMetric.FINANCE to RingIds(
      R.id.flowi_ring_cell_1, R.id.flowi_ring_img_1, R.id.flowi_ring_center_1,
      R.id.flowi_ring_chrono_1, R.id.flowi_ring_title_1, R.id.flowi_ring_caption_1,
    ),
    FlowiMetric.STEPS to RingIds(
      R.id.flowi_ring_cell_2, R.id.flowi_ring_img_2, R.id.flowi_ring_center_2,
      R.id.flowi_ring_chrono_2, R.id.flowi_ring_title_2, R.id.flowi_ring_caption_2,
    ),
    FlowiMetric.TASKS to RingIds(
      R.id.flowi_ring_cell_3, R.id.flowi_ring_img_3, R.id.flowi_ring_center_3,
      R.id.flowi_ring_chrono_3, R.id.flowi_ring_title_3, R.id.flowi_ring_caption_3,
    ),
    FlowiMetric.TIME to RingIds(
      R.id.flowi_ring_cell_4, R.id.flowi_ring_img_4, R.id.flowi_ring_center_4,
      R.id.flowi_ring_chrono_4, R.id.flowi_ring_title_4, R.id.flowi_ring_caption_4,
    ),
  )

  fun large(context: Context, snap: FlowiSnapshot): RemoteViews {
    val s = FlowiStrings(snap.lang)
    val views = RemoteViews(context.packageName, R.layout.flowi_widget_large)
    views.setTextViewText(R.id.flowi_header_today, s.today)
    if (snap.authed) {
      views.setViewVisibility(R.id.flowi_rings, View.VISIBLE)
      views.setViewVisibility(R.id.flowi_signed_out, View.GONE)
      for ((metric, ids) in largeRings) {
        bindRing(context, views, ids, RingModels.build(metric, snap, s), 60f, 7f)
      }
    } else {
      views.setViewVisibility(R.id.flowi_rings, View.GONE)
      views.setViewVisibility(R.id.flowi_signed_out, View.VISIBLE)
      views.setTextViewText(R.id.flowi_signed_out, s.signedOut)
      views.setOnClickPendingIntent(R.id.flowi_signed_out, openUrlIntent(context, FlowiLinks.TASKS))
    }
    bindActionGrid(context, views, s)
    return views
  }

  fun medium(context: Context, snap: FlowiSnapshot): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.flowi_widget_medium)
    bindActionGrid(context, views, FlowiStrings(snap.lang))
    return views
  }

  fun small(context: Context, snap: FlowiSnapshot, action: FlowiAction): RemoteViews {
    val s = FlowiStrings(snap.lang)
    val views = RemoteViews(context.packageName, R.layout.flowi_widget_small)
    views.setImageViewResource(R.id.flowi_small_circle, action.circleRes)
    views.setImageViewResource(R.id.flowi_small_icon, action.iconRes)
    views.setTextViewText(R.id.flowi_small_title, action.title(s))
    views.setOnClickPendingIntent(android.R.id.background, openUrlIntent(context, action.url))
    return views
  }

  fun metric(context: Context, snap: FlowiSnapshot, metric: FlowiMetric): RemoteViews {
    val s = FlowiStrings(snap.lang)
    val views = RemoteViews(context.packageName, R.layout.flowi_widget_metric)
    val ids = RingIds(
      android.R.id.background, R.id.flowi_metric_img, R.id.flowi_metric_center,
      R.id.flowi_metric_chrono, R.id.flowi_metric_title, R.id.flowi_metric_caption,
    )
    if (snap.authed) {
      bindRing(context, views, ids, RingModels.build(metric, snap, s), 84f, 9f)
    } else {
      // Без акаунта — лише заклик увійти; дотик відкриває застосунок.
      views.setImageViewBitmap(ids.img, RingRenderer.render(context, emptyList(), 84f, 9f))
      views.setViewVisibility(ids.chrono, View.GONE)
      views.setViewVisibility(ids.center, View.VISIBLE)
      views.setTextViewText(ids.center, "Flowi")
      setThemedTextColor(context, views, ids.center, R.color.flowi_widget_accent)
      views.setTextViewText(ids.title, metric.title(s))
      views.setTextViewText(ids.caption, s.signedOut)
      views.setOnClickPendingIntent(ids.cell, openUrlIntent(context, FlowiLinks.TASKS))
    }
    return views
  }

  // MARK: midnight

  private fun midnightIntent(context: Context): PendingIntent {
    val intent = Intent(context, FlowiWidgetRefreshReceiver::class.java).setAction(ACTION_MIDNIGHT)
    return PendingIntent.getBroadcast(
      context, 7310, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun hasAnyWidget(context: Context): Boolean {
    val manager = AppWidgetManager.getInstance(context) ?: return false
    return WidgetKind.values().any {
      manager.getAppWidgetIds(ComponentName(context, it.providerClass)).isNotEmpty()
    }
  }

  /**
   * Неточний будильник одразу після півночі: знімок за минулу добу має
   * показати нулі, навіть коли застосунок не відкривали (spec §10).
   * Неточний — не потребує дозволу SCHEDULE_EXACT_ALARM.
   */
  fun scheduleMidnight(context: Context) {
    val alarms = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
    val pending = midnightIntent(context)
    if (!hasAnyWidget(context)) {
      alarms.cancel(pending)
      return
    }
    val next = Calendar.getInstance().apply {
      add(Calendar.DAY_OF_YEAR, 1)
      set(Calendar.HOUR_OF_DAY, 0)
      set(Calendar.MINUTE, 0)
      set(Calendar.SECOND, 5)
      set(Calendar.MILLISECOND, 0)
    }
    try {
      alarms.setWindow(AlarmManager.RTC, next.timeInMillis, 10 * 60 * 1000L, pending)
    } catch (e: Exception) {
      Log.w(TAG, "midnight alarm failed", e)
    }
  }

  fun isMidnightAction(action: String?): Boolean = action == ACTION_MIDNIGHT
}

/** Півночі / зміна дати, часу чи поясу → перемалювати (числа вчорашньої доби — нулі). */
class FlowiWidgetRefreshReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      Intent.ACTION_DATE_CHANGED,
      Intent.ACTION_TIME_CHANGED,
      Intent.ACTION_TIMEZONE_CHANGED,
      Intent.ACTION_LOCALE_CHANGED,
      Intent.ACTION_MY_PACKAGE_REPLACED -> safeUpdateAll(context)
      else -> if (WidgetUpdater.isMidnightAction(intent.action)) safeUpdateAll(context)
    }
  }

  private fun safeUpdateAll(context: Context) {
    try {
      WidgetUpdater.updateAll(context)
    } catch (e: Exception) {
      Log.w(TAG, "refresh failed", e)
    }
  }
}

/** Спільна основа провайдерів: усе малювання — у WidgetUpdater. */
abstract class FlowiBaseWidgetProvider(private val kind: WidgetKind) : AppWidgetProvider() {
  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    try {
      val snap = SurfacesStore.loadSnapshot(context).normalized(Date())
      for (id in appWidgetIds) WidgetUpdater.update(context, appWidgetManager, kind, id, snap)
      WidgetUpdater.scheduleMidnight(context)
    } catch (e: Exception) {
      Log.w(TAG, "onUpdate $kind failed", e)
    }
  }

  override fun onDeleted(context: Context, appWidgetIds: IntArray) {
    SurfacesStore.forgetWidgets(context, appWidgetIds)
  }

  override fun onDisabled(context: Context) {
    WidgetUpdater.scheduleMidnight(context)
  }
}

class FlowiLargeWidgetProvider : FlowiBaseWidgetProvider(WidgetKind.LARGE)
class FlowiMediumWidgetProvider : FlowiBaseWidgetProvider(WidgetKind.MEDIUM)
class FlowiSmallWidgetProvider : FlowiBaseWidgetProvider(WidgetKind.SMALL)
class FlowiMetricWidgetProvider : FlowiBaseWidgetProvider(WidgetKind.METRIC)
