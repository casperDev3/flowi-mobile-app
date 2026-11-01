package com.casper3.flowi.surfaces

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.util.Log
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.lang.ref.WeakReference

/**
 * JS-міст поверхонь Android (spec §10): віджети, сповіщення таймера, черга
 * дій поза застосунком. Імʼя модуля в JS — `FlowiAndroid`
 * (modules/flowi-android/index.ts).
 */
class FlowiAndroidModule : Module() {
  private val context: Context
    get() = appContext.reactContext?.applicationContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("FlowiAndroid")

    Events(EVENT_PENDING_ACTIONS, EVENT_TIMER_DISMISSED)

    OnCreate {
      instance = WeakReference(this@FlowiAndroidModule)
      registerConfigReceiver()
    }

    OnDestroy {
      if (instance?.get() === this@FlowiAndroidModule) instance = null
      unregisterConfigReceiver()
    }

    Function("setWidgetSnapshot") { json: String ->
      val ctx = context
      SurfacesStore.writeSnapshotJson(ctx, json)
      WidgetUpdater.requestUpdateAll(ctx)
    }

    Function("showTimerNotification") { params: Map<String, Any?> ->
      val p = TimerNotification.Params.from(params) ?: return@Function false
      TimerNotification.show(context, p)
    }

    Function("canPostNotifications") {
      TimerNotification.canPost(context)
    }

    Function("setDeviceActionOwner") { userId: String? ->
      SurfacesStore.setDeviceActionOwner(context, userId)
    }

    Function("clearPendingActions") {
      SurfacesStore.clearPending(context)
    }

    Function("clearTimerNotification") {
      TimerNotification.clear(context)
    }

    Function("readPendingActions") {
      SurfacesStore.readPending(context)
    }

    Function("removePendingActions") { ids: List<String> ->
      SurfacesStore.removePending(context, ids)
    }
  }

  /**
   * Світла/темна тема чи мова змінились, поки процес живий → перемалювати
   * віджети (на API < 31 кольори тексту розвʼязуються під час рендеру).
   * ACTION_CONFIGURATION_CHANGED доходить лише до динамічно зареєстрованих.
   */
  private var configReceiver: BroadcastReceiver? = null

  private fun registerConfigReceiver() {
    val ctx = appContext.reactContext?.applicationContext ?: return
    if (configReceiver != null) return
    val receiver = object : BroadcastReceiver() {
      override fun onReceive(c: Context, intent: Intent) {
        WidgetUpdater.requestUpdateAll(c)
      }
    }
    try {
      val filter = IntentFilter(Intent.ACTION_CONFIGURATION_CHANGED)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        ctx.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
      } else {
        ctx.registerReceiver(receiver, filter)
      }
      configReceiver = receiver
    } catch (e: Exception) {
      Log.w("FlowiAndroid", "config receiver failed", e)
    }
  }

  private fun unregisterConfigReceiver() {
    val receiver = configReceiver ?: return
    configReceiver = null
    try {
      appContext.reactContext?.applicationContext?.unregisterReceiver(receiver)
    } catch (_: Exception) {
    }
  }

  private fun emitTimerDismissed() {
    try {
      sendEvent(EVENT_TIMER_DISMISSED, mapOf<String, Any?>())
    } catch (e: Exception) {
      Log.w("FlowiAndroid", "emit $EVENT_TIMER_DISMISSED failed", e)
    }
  }

  private fun emitPendingActions() {
    try {
      sendEvent(EVENT_PENDING_ACTIONS, mapOf<String, Any?>())
    } catch (e: Exception) {
      Log.w("FlowiAndroid", "emit $EVENT_PENDING_ACTIONS failed", e)
    }
  }

  companion object {
    const val EVENT_PENDING_ACTIONS = "onPendingActions"
    const val EVENT_TIMER_DISMISSED = "onTimerNotificationDismissed"

    @Volatile
    private var instance: WeakReference<FlowiAndroidModule>? = null

    /** Ресивер кличе це після запису в чергу; без живого JS — тихо нічого. */
    fun notifyPendingActions() {
      instance?.get()?.emitPendingActions()
    }

    /** Сповіщення таймера змахнули — JS скидає кеш показаного. */
    fun notifyTimerNotificationDismissed() {
      instance?.get()?.emitTimerDismissed()
    }
  }
}
