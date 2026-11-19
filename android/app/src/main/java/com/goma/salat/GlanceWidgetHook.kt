package com.goma.salat

import android.content.Context
import com.goma.salat.glance.GlanceWidgets

/**
 * The one way the Glance widgets are redrawn, for callers outside the glance
 * package: `PrayerWidgetProvider.requestUpdate` (the payload write, the
 * prayer-boundary alarm, boot, unlock and every tap) ends here.
 */
object GlanceWidgetHook {
  fun requestUpdate(context: Context) = GlanceWidgets.requestUpdate(context)

}
