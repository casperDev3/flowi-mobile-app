package com.casper3.flowi.surfaces

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import kotlin.math.max
import kotlin.math.min

/**
 * Кільце віджета, намальоване в Bitmap (RemoteViews не вміє власних View).
 * Та сама математика, що `FlowiRing` на iOS: сегменти (частка 0…1, колір)
 * по черзі від 12 години, кожен обрізано так, щоб сума не перевищила коло.
 *
 * Доріжка (сіре коло під сегментами) у Bitmap НЕ малюється: Bitmap «запікає»
 * колір на момент рендеру, і після перемикання світла/темна тема вона була б
 * не того кольору. Доріжка — фон ImageView (@drawable/flowi_ring_track_7/9 з
 * @color/flowi_widget_ring_track), який хост віджета бере з поточної теми.
 */
object RingRenderer {
  data class Segment(val fraction: Double, val color: Int)

  /** Дуги як (start, sweep) у частках кола — чиста функція, щоб її легко перевірити. */
  fun arcs(segments: List<Segment>): List<Triple<Double, Double, Int>> {
    var start = 0.0
    val out = ArrayList<Triple<Double, Double, Int>>()
    for (seg in segments) {
      val f = min(max(if (seg.fraction.isNaN()) 0.0 else seg.fraction, 0.0), 1.0 - start)
      if (f <= 0.001) continue
      out.add(Triple(start, f, seg.color))
      start += f
    }
    return out
  }

  fun render(context: Context, segments: List<Segment>, sizeDp: Float, lineWidthDp: Float): Bitmap {
    val density = context.resources.displayMetrics.density
    val size = max(1, (sizeDp * density).toInt())
    val stroke = lineWidthDp * density
    val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val inset = stroke / 2f
    val rect = RectF(inset, inset, size - inset, size - inset)

    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      style = Paint.Style.STROKE
      strokeWidth = stroke
      strokeCap = Paint.Cap.ROUND
    }
    for ((start, sweep, color) in arcs(segments)) {
      paint.color = color
      canvas.drawArc(rect, (-90.0 + start * 360.0).toFloat(), (sweep * 360.0).toFloat(), false, paint)
    }
    return bitmap
  }
}
