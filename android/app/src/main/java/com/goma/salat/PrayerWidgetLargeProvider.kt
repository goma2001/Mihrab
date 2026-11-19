package com.goma.salat

import androidx.glance.appwidget.GlanceAppWidget
import com.goma.salat.glance.PrayerGlanceWidget

open class PrayerWidgetLargeProvider : PrayerWidgetProvider() {
  /** The 4×4: the times and the practice graph. */
  override val glanceAppWidget: GlanceAppWidget = PrayerGlanceWidget(PrayerGlanceWidget.Entry.TALL)
}
