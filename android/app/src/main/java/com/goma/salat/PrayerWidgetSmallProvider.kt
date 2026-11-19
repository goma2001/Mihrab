package com.goma.salat

import androidx.glance.appwidget.GlanceAppWidget
import com.goma.salat.glance.PrayerGlanceWidget

/** "Next prayer": the compact line at every size. */
open class PrayerWidgetSmallProvider : PrayerWidgetProvider() {
  override val glanceAppWidget: GlanceAppWidget = PrayerGlanceWidget(PrayerGlanceWidget.Entry.SMALL)
}
