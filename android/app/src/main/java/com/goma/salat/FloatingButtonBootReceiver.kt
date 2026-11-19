package com.goma.salat

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

/**
 * Restarts the floating prayer button after a reboot, when the user
 * enabled it. The service loads the last-known prayer times from its
 * own SharedPreferences and the app pushes fresh times on the next
 * launch. Best-effort: starting a foreground service from a broadcast
 * is restricted on Android 12+, so failures are swallowed here
 * (BOOT_COMPLETED itself is exempt).
 */
class FloatingButtonBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
    try {
      val prefs = context.getSharedPreferences(
        FloatingButtonService.PREFS_NAME,
        Context.MODE_PRIVATE,
      )
      if (!prefs.getBoolean(FloatingButtonService.KEY_ENABLED, false)) return
      val svc = Intent(context, FloatingButtonService::class.java).apply {
        action = FloatingButtonService.ACTION_START
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(svc)
      } else {
        context.startService(svc)
      }
    } catch (_: Exception) {
      // Best effort only — the next app launch restores it.
    }
  }
}
