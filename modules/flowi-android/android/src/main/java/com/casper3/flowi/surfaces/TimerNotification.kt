package com.casper3.flowi.surfaces

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.drawable.Icon
import android.os.Build
import android.util.Log

/**
 * Постійне сповіщення таймера — аналог Live Activity (spec §10).
 * Звичайне ongoing-сповіщення з chronometer (без foreground service): час
 * рахує сама система від `startedAtMs`, кнопка «Зупинити» ставить дію
 * `timer_stop` у чергу, яку застосовує JS.
 */
object TimerNotification {
  const val CHANNEL_ID = "flowi_timer"
  const val NOTIFICATION_ID = 7301
  private const val STOP_REQUEST_CODE = 7302
  private const val OPEN_REQUEST_CODE = 7303
  private const val DELETE_REQUEST_CODE = 7304
  private const val TIME_URL = "ftrackingapp:///time"
  private const val TAG = "FlowiTimerNotif"

  data class Params(
    val timerId: String,
    val label: String,
    val startedAtMs: Long,
    val otherCount: Int,
    val title: String,
    val stopLabel: String,
    val channelName: String,
    val moreLabel: String,
  ) {
    companion object {
      fun from(map: Map<String, Any?>): Params? {
        val timerId = map["timerId"] as? String ?: return null
        if (timerId.isEmpty()) return null
        val startedAt = (map["startedAtMs"] as? Number)?.toLong() ?: return null
        fun str(key: String, fallback: String) = (map[key] as? String)?.takeIf { it.isNotEmpty() } ?: fallback
        return Params(
          timerId = timerId,
          label = (map["label"] as? String).orEmpty(),
          startedAtMs = startedAt,
          otherCount = ((map["otherCount"] as? Number)?.toInt() ?: 0).coerceAtLeast(0),
          title = str("title", "Таймер іде"),
          stopLabel = str("stopLabel", "Зупинити"),
          channelName = str("channelName", "Таймер"),
          moreLabel = (map["moreLabel"] as? String).orEmpty(),
        )
      }
    }
  }

  private fun manager(context: Context): NotificationManager? =
    context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager

  /** Чи може застосунок показати сповіщення (дозвіл POST_NOTIFICATIONS на 13+ і не вимкнені в системі). */
  fun canPost(context: Context): Boolean {
    val nm = manager(context) ?: return false
    if (!nm.areNotificationsEnabled()) return false
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true
    return context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
  }

  /** Іконка з expo-notifications (`notification_icon`), інакше — власний гліф таймера. */
  private fun smallIcon(context: Context): Int {
    val id = context.resources.getIdentifier("notification_icon", "drawable", context.packageName)
    return if (id != 0) id else R.drawable.flowi_ic_timer
  }

  /**
   * true — сповіщення справді віддано системі. false — немає дозволу/збій:
   * JS не кешує такий показ і спробує знову (після надання дозволу тощо).
   */
  fun show(context: Context, p: Params): Boolean {
    val nm = manager(context) ?: return false
    if (!canPost(context)) return false
    return try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        // Повторне створення з тим самим id лише оновлює назву (зміна мови).
        val channel = NotificationChannel(CHANNEL_ID, p.channelName, NotificationManager.IMPORTANCE_LOW).apply {
          setShowBadge(false)
          enableVibration(false)
          setSound(null, null)
        }
        nm.createNotificationChannel(channel)
      }

      val open = Intent(Intent.ACTION_VIEW, android.net.Uri.parse(TIME_URL)).apply {
        setPackage(context.packageName)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      val openPending = PendingIntent.getActivity(
        context, OPEN_REQUEST_CODE, open,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
      val stop = Intent(context, FlowiTimerStopReceiver::class.java).apply {
        action = FlowiTimerStopReceiver.ACTION_STOP
        putExtra(FlowiTimerStopReceiver.EXTRA_TIMER_ID, p.timerId)
      }
      val stopPending = PendingIntent.getBroadcast(
        context, STOP_REQUEST_CODE, stop,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )

      // Android 14+: ongoing можна змахнути — повідомляємо JS, щоб він не вважав його показаним.
      val dismissed = Intent(context, FlowiTimerDismissReceiver::class.java).apply {
        action = FlowiTimerDismissReceiver.ACTION_DISMISSED
      }
      val deletePending = PendingIntent.getBroadcast(
        context, DELETE_REQUEST_CODE, dismissed,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )

      val more = if (p.otherCount > 0) p.moreLabel.replace("{n}", p.otherCount.toString()) else ""
      val text = if (more.isNotEmpty()) "${p.title} · $more" else p.title

      @Suppress("DEPRECATION")
      val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        Notification.Builder(context, CHANNEL_ID)
      } else {
        Notification.Builder(context).setPriority(Notification.PRIORITY_LOW)
      }
      builder
        .setSmallIcon(smallIcon(context))
        .setColor(FlowiColor.ACCENT)
        .setContentTitle(p.label.ifEmpty { p.title })
        .setContentText(text)
        .setWhen(p.startedAtMs)
        .setShowWhen(true)
        .setUsesChronometer(true)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setAutoCancel(false)
        .setContentIntent(openPending)
        .setDeleteIntent(deletePending)
        .setVisibility(Notification.VISIBILITY_PUBLIC)
        .addAction(
          Notification.Action.Builder(
            Icon.createWithResource(context, R.drawable.flowi_ic_stop),
            p.stopLabel,
            stopPending,
          ).build(),
        )
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        builder.setCategory(Notification.CATEGORY_STOPWATCH)
      } else {
        builder.setCategory(Notification.CATEGORY_PROGRESS)
      }
      nm.notify(NOTIFICATION_ID, builder.build())
      true
    } catch (e: Exception) {
      Log.w(TAG, "show failed", e)
      false
    }
  }

  fun clear(context: Context) {
    try {
      manager(context)?.cancel(NOTIFICATION_ID)
    } catch (e: Exception) {
      Log.w(TAG, "clear failed", e)
    }
  }
}

/**
 * «Зупинити» у сповіщенні: дія `timer_stop` у чергу (§7.3), сповіщення геть,
 * `time.running` зі знімка віджетів геть, і — якщо JS живий — подія
 * `onPendingActions`, щоб він одразу її застосував. Процес застосунку
 * мертвий → дія застосується на наступному старті (v1).
 *
 * Дія штампується власником черги (`userId`); власника немає (вихід із
 * акаунта) — нічого не ставимо: зупиняти нічого й нікому.
 */
class FlowiTimerStopReceiver : BroadcastReceiver() {
  companion object {
    const val ACTION_STOP = "com.casper3.flowi.surfaces.STOP_TIMER"
    const val EXTRA_TIMER_ID = "timerId"
  }

  override fun onReceive(context: Context, intent: Intent) {
    val timerId = intent.getStringExtra(EXTRA_TIMER_ID)
    TimerNotification.clear(context)
    if (timerId.isNullOrEmpty()) return
    val owner = SurfacesStore.deviceActionOwner(context) ?: return
    SurfacesStore.appendPending(context, DeviceActions.timerStop(timerId, owner))
    if (SurfacesStore.clearRunningInSnapshot(context)) WidgetUpdater.requestUpdateAll(context)
    FlowiAndroidModule.notifyPendingActions()
  }
}

/** Користувач змахнув сповіщення таймера (Android 14+ дозволяє й для ongoing). */
class FlowiTimerDismissReceiver : BroadcastReceiver() {
  companion object {
    const val ACTION_DISMISSED = "com.casper3.flowi.surfaces.TIMER_DISMISSED"
  }

  override fun onReceive(context: Context, intent: Intent) {
    FlowiAndroidModule.notifyTimerNotificationDismissed()
  }
}
