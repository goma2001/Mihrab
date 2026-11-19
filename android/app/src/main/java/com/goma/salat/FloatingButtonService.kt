package com.goma.salat

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.PixelFormat
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
import android.view.Gravity
import android.view.LayoutInflater
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.TextView

/**
 * Floating prayer button as a system overlay: a small dark-green pill
 * with gold text (next prayer + live countdown) drawn above every app,
 * even when صلاتي itself is closed.
 *
 * Ported from the old Flutter Salaty's OverlayService
 * (com.goma.salaty): the same foreground service, the same pill, the
 * same wire format — the times arrive from JavaScript as
 * "name|epochMs;name|epochMs;..." (today's 5 prayers + tomorrow's
 * Fajr) and are persisted in this service's own SharedPreferences, so
 * a reboot restores the last-known countdown without the app.
 *
 * - Foreground service (START_STICKY): the system restarts it if it
 *   is killed, and it survives the app being swiped away.
 * - The pill is draggable (position saved as screen fractions) and a
 *   tap opens MainActivity. When a prayer time is reached the pill
 *   shows "حان الآن — <name>" for 60 seconds, then rolls to the next
 *   prayer automatically.
 * - Started ONLY from user action (the Settings toggle, through
 *   FloatingButtonModule) or from FloatingButtonBootReceiver after a
 *   reboot. Never started from app launch.
 * - If the overlay permission is revoked while running, the service
 *   stops itself instead of crashing.
 */
class FloatingButtonService : Service() {
  companion object {
    const val PREFS_NAME = "salaty_floating_button_prefs"
    const val KEY_ENABLED = "enabled"
    const val KEY_TIMES = "times" // "name|epochMs;name|epochMs;..."
    const val KEY_POS_X = "pos_x" // pill-centre fraction of width
    const val KEY_POS_Y = "pos_y" // pill-centre fraction of height
    const val ACTION_START = "com.goma.salat.overlay.START"
    const val ACTION_STOP = "com.goma.salat.overlay.STOP"
    private const val NOTIF_ID = 1001
    private const val CHANNEL_ID = "salaty_floating_button"
    private const val NOW_WINDOW_MS = 60_000L
  }

  private var windowManager: WindowManager? = null
  private var pillView: View? = null
  private var pillText: TextView? = null
  private var layoutParams: WindowManager.LayoutParams? = null
  private var pillShown = false
  private val handler = Handler(Looper.getMainLooper())
  private var times: List<Pair<String, Long>> = emptyList()
  private var ticking = false

  private val ticker = object : Runnable {
    override fun run() {
      updatePillText()
      if (ticking) handler.postDelayed(this, 1000)
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    loadTimesFromPrefs()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      stopSelf()
      return START_NOT_STICKY
    }
    intent?.getStringExtra(KEY_TIMES)?.let { raw ->
      val parsed = parseTimes(raw)
      if (parsed.isNotEmpty()) {
        times = parsed
        saveTimesToPrefs(raw)
      }
    }
    if (times.isEmpty()) loadTimesFromPrefs()
    startAsForeground()
    showPill()
    startTicking()
    return START_STICKY
  }

  override fun onDestroy() {
    stopTicking()
    removePill()
    try {
      stopForeground(true)
    } catch (_: Exception) {
      // Already stopped; nothing to remove.
    }
    super.onDestroy()
  }

  // ---- foreground notification ----

  private fun startAsForeground() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
      val channel =
        NotificationChannel(
          CHANNEL_ID,
          "الزر العائم",
          NotificationManager.IMPORTANCE_LOW,
        )
      channel.description = "إشعار دائم أثناء عمل الزر العائم فوق التطبيقات"
      nm.createNotificationChannel(channel)
    }
    val openIntent = Intent(this, MainActivity::class.java).apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
    }
    val pending = PendingIntent.getActivity(
      this,
      0,
      openIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }
    val notification = builder
      .setContentTitle("صلاتي")
      .setContentText("الزر العائم يعمل — الصلاة القادمة تظهر فوق التطبيقات")
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentIntent(pending)
      .setOngoing(true)
      .build()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(
        NOTIF_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE,
      )
    } else {
      @Suppress("DEPRECATION")
      startForeground(NOTIF_ID, notification)
    }
  }

  // ---- overlay pill ----

  private fun showPill() {
    if (pillShown) {
      updatePillText()
      return
    }
    if (!Settings.canDrawOverlays(this)) {
      // Permission revoked while running: stop instead of crashing.
      stopSelf()
      return
    }
    val wm = getSystemService(WINDOW_SERVICE) as WindowManager
    windowManager = wm
    val view = LayoutInflater.from(this).inflate(R.layout.overlay_pill, null)
    pillText = view.findViewById(R.id.overlay_pill_text)
    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    } else {
      @Suppress("DEPRECATION")
      WindowManager.LayoutParams.TYPE_PHONE
    }
    val params = WindowManager.LayoutParams(
      WindowManager.LayoutParams.WRAP_CONTENT,
      WindowManager.LayoutParams.WRAP_CONTENT,
      type,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
      PixelFormat.TRANSLUCENT,
    )
    params.gravity = Gravity.TOP or Gravity.START
    // Measure first so the saved centre fractions place the pill
    // exactly (not its top-left corner).
    view.measure(
      View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED),
      View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED),
    )
    val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val fx = prefs.getFloat(KEY_POS_X, 0.90f)
    val fy = prefs.getFloat(KEY_POS_Y, 0.10f)
    params.x = centreToX(fx, view.measuredWidth)
    params.y = centreToY(fy, view.measuredHeight)
    layoutParams = params
    attachDrag(view)
    try {
      wm.addView(view, params)
      pillView = view
      pillShown = true
    } catch (_: Exception) {
      // Overlay not allowed (permission revoked between the check
      // and the add): stop instead of crashing.
      stopSelf()
      return
    }
    updatePillText()
  }

  private fun removePill() {
    val view = pillView
    if (view != null && pillShown) {
      try {
        windowManager?.removeView(view)
      } catch (_: Exception) {
        // Already removed.
      }
    }
    pillView = null
    pillText = null
    layoutParams = null
    pillShown = false
  }

  private fun centreToX(fx: Float, pillWidth: Int): Int {
    val screenW = resources.displayMetrics.widthPixels
    val centre = (fx * screenW).toInt()
    return (centre - pillWidth / 2).coerceIn(0, (screenW - pillWidth).coerceAtLeast(0))
  }

  private fun centreToY(fy: Float, pillHeight: Int): Int {
    val screenH = resources.displayMetrics.heightPixels
    val centre = (fy * screenH).toInt()
    return (centre - pillHeight / 2).coerceIn(0, (screenH - pillHeight).coerceAtLeast(0))
  }

  private fun attachDrag(view: View) {
    val density = resources.displayMetrics.density
    val tapSlopPx = (12 * density).toInt()
    var downRawX = 0f
    var downRawY = 0f
    var startX = 0
    var startY = 0
    var moved = false
    view.setOnTouchListener { _, event ->
      when (event.action) {
        MotionEvent.ACTION_DOWN -> {
          downRawX = event.rawX
          downRawY = event.rawY
          startX = layoutParams?.x ?: 0
          startY = layoutParams?.y ?: 0
          moved = false
          true
        }
        MotionEvent.ACTION_MOVE -> {
          val dx = (event.rawX - downRawX).toInt()
          val dy = (event.rawY - downRawY).toInt()
          if (!moved && dx * dx + dy * dy > tapSlopPx * tapSlopPx) {
            moved = true
          }
          if (moved) {
            val params = layoutParams
            if (params != null) {
              params.x = (startX + dx).coerceIn(
                0,
                (resources.displayMetrics.widthPixels - (pillView?.measuredWidth ?: 0)).coerceAtLeast(0),
              )
              params.y = (startY + dy).coerceIn(
                0,
                (resources.displayMetrics.heightPixels - (pillView?.measuredHeight ?: 0)).coerceAtLeast(0),
              )
              try {
                windowManager?.updateViewLayout(view, params)
              } catch (_: Exception) {
                // View gone; ignore.
              }
            }
          }
          true
        }
        MotionEvent.ACTION_UP -> {
          if (!moved) {
            openApp()
          } else {
            savePosition()
          }
          true
        }
        else -> false
      }
    }
  }

  private fun savePosition() {
    val params = layoutParams ?: return
    val view = pillView ?: return
    val screenW = resources.displayMetrics.widthPixels.toFloat()
    val screenH = resources.displayMetrics.heightPixels.toFloat()
    if (screenW <= 0 || screenH <= 0) return
    val fx = (params.x + view.measuredWidth / 2f) / screenW
    val fy = (params.y + view.measuredHeight / 2f) / screenH
    getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .edit()
      .putFloat(KEY_POS_X, fx.coerceIn(0f, 1f))
      .putFloat(KEY_POS_Y, fy.coerceIn(0f, 1f))
      .apply()
  }

  private fun openApp() {
    val intent = Intent(this, MainActivity::class.java).apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
    }
    startActivity(intent)
  }

  // ---- countdown ----

  private fun startTicking() {
    if (ticking) return
    ticking = true
    handler.post(ticker)
  }

  private fun stopTicking() {
    ticking = false
    handler.removeCallbacks(ticker)
  }

  private fun updatePillText() {
    val textView = pillText ?: return
    val now = System.currentTimeMillis()
    if (times.isEmpty()) {
      textView.text = "صلاتي"
      return
    }
    // "حان الآن" for 60s after a prayer time, then roll on.
    val last = times.lastOrNull { it.second <= now }
    if (last != null && now - last.second < NOW_WINDOW_MS) {
      textView.text = "حان الآن — ${last.first}"
      return
    }
    val next = times.firstOrNull { it.second > now }
    if (next == null) {
      // All stored times are past (stale — the app pushes fresh
      // times on the next launch).
      textView.text = "صلاتي"
      return
    }
    textView.text = "${next.first} ${formatHms(next.second - now)}"
  }

  private fun formatHms(ms: Long): String {
    val s = (ms / 1000).coerceAtLeast(0)
    return String.format("%02d:%02d:%02d", s / 3600, (s % 3600) / 60, s % 60)
  }

  // ---- persistence (this service's own prefs file) ----

  private fun parseTimes(raw: String): List<Pair<String, Long>> {
    val out = mutableListOf<Pair<String, Long>>()
    for (part in raw.split(";")) {
      val sep = part.lastIndexOf("|")
      if (sep <= 0) continue
      val name = part.substring(0, sep)
      val ms = part.substring(sep + 1).toLongOrNull() ?: continue
      out.add(name to ms)
    }
    return out
  }

  private fun saveTimesToPrefs(raw: String) {
    getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .edit()
      .putString(KEY_TIMES, raw)
      .apply()
  }

  private fun loadTimesFromPrefs() {
    val raw = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .getString(KEY_TIMES, null) ?: return
    val parsed = parseTimes(raw)
    if (parsed.isNotEmpty()) times = parsed
  }
}
