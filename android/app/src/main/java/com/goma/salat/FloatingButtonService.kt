package com.goma.salat

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
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
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView

/**
 * Floating prayer button as a system overlay: a small dark-green pill
 * with gold text drawn above every app, even when صلاتي itself is
 * closed.
 *
 * Ported from the old Flutter Salaty's OverlayService
 * (com.goma.salaty): the same foreground service, the same pill, the
 * same wire format — the times arrive from JavaScript as
 * "hijri|<Hijri date>;title|<panel title>;openapp|<open-app
 * label>;name|epochMs|HH:MM;name|epochMs|HH:MM;..." (today's five
 * prayers plus tomorrow's Fajr) and are persisted in this service's
 * own SharedPreferences, so a reboot restores the last-known
 * countdown without the app. The clock time rides in the payload
 * because native code never formats a time
 * (__tests__/noNativeTimeParsing.test.ts). Payloads without the
 * three meta segments or the clock field (v1) still parse: the panel
 * then shows without the Hijri line and with the app name on its
 * title and open rows, and a prayer without a clock shows its name
 * alone.
 *
 * - Foreground service (START_STICKY): the system restarts it if it
 *   is killed, and it survives the app being swiped away.
 * - The pill has two lines: the next prayer and its clock time
 *   ("العصر 15:08") above, the live countdown below, larger and
 *   bolder. It is draggable (position saved as screen fractions).
 *   A tap toggles the day's-times panel: today's five prayers with
 *   their times, the Hijri date on top, and a row that opens the app.
 *   The panel never takes focus; a tap outside it, the ✕, or another
 *   tap on the pill dismisses it. When a prayer time is reached the
 *   pill shows "حان الآن — <name>" for 60 seconds, then rolls to the
 *   next prayer automatically.
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
    const val KEY_TIMES = "times" // "hijri|…;title|…;openapp|…;name|epochMs;…"
    const val KEY_POS_X = "pos_x" // pill-centre fraction of width
    const val KEY_POS_Y = "pos_y" // pill-centre fraction of height
    const val ACTION_START = "com.goma.salat.overlay.START"
    const val ACTION_STOP = "com.goma.salat.overlay.STOP"
    private const val NOTIF_ID = 1001
    private const val CHANNEL_ID = "salaty_floating_button"
    private const val NOW_WINDOW_MS = 60_000L
  }

  /** One parsed payload: the times plus the panel's display strings. */
  private data class OverlayPayload(
    val times: List<PrayerTime>,
    val hijriDate: String?,
    val panelTitle: String?,
    val openAppLabel: String?,
  )

  /** One prayer from the payload: name, instant, and its clock time. */
  private data class PrayerTime(
    val name: String,
    val at: Long,
    val clock: String?,
  )

  /** One row of the times panel, kept to refresh its highlight. */
  private data class PanelRowView(
    val name: TextView,
    val time: TextView,
    val at: Long,
  )

  private var windowManager: WindowManager? = null
  private var pillView: View? = null
  private var pillLine1: TextView? = null
  private var pillLine2: TextView? = null
  private var layoutParams: WindowManager.LayoutParams? = null
  private var pillShown = false
  private var panelScrim: View? = null
  private var panelView: View? = null
  private var panelRowViews: List<PanelRowView> = emptyList()
  private var panelShown = false
  private val handler = Handler(Looper.getMainLooper())
  private var times: List<PrayerTime> = emptyList()
  private var hijriDate: String? = null
  private var panelTitle: String? = null
  private var openAppLabel: String? = null
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
      val parsed = parseOverlayPayload(raw)
      if (parsed.times.isNotEmpty()) {
        applyPayload(parsed)
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
    dismissPanel()
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
    pillLine1 = view.findViewById(R.id.overlay_pill_line1)
    pillLine2 = view.findViewById(R.id.overlay_pill_line2)
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
    pillLine1 = null
    pillLine2 = null
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
            togglePanel()
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

  // ---- today's-times panel ----

  private fun togglePanel() {
    if (panelShown) dismissPanel() else showPanel()
  }

  private fun showPanel() {
    if (panelShown) return
    val wm = windowManager ?: return
    if (!Settings.canDrawOverlays(this)) return
    val inflater = LayoutInflater.from(this)
    // A fullscreen transparent scrim: taps outside the panel dismiss
    // it, taps inside reach the panel. It never takes focus, so the
    // app underneath keeps what it was doing.
    val scrim = FrameLayout(this)
    val panel = inflater.inflate(R.layout.overlay_times_panel, scrim, false)
    val titleView = panel.findViewById<TextView>(R.id.overlay_panel_title)
    titleView.text = panelTitle ?: "صلاتي"
    val hijriView = panel.findViewById<TextView>(R.id.overlay_panel_hijri)
    if (hijriDate.isNullOrEmpty()) {
      hijriView.visibility = View.GONE
    } else {
      hijriView.visibility = View.VISIBLE
      hijriView.text = hijriDate
    }
    val rowsContainer = panel.findViewById<LinearLayout>(R.id.overlay_panel_rows)
    rowsContainer.removeAllViews()
    val rows = mutableListOf<PanelRowView>()
    // Today's five prayers: the payload's first five entries (the
    // sixth is tomorrow's Fajr, for the countdown past Isha).
    for ((name, at, clock) in times.take(5)) {
      val row = inflater.inflate(R.layout.overlay_times_row, rowsContainer, false)
      val nameView = row.findViewById<TextView>(R.id.overlay_row_name)
      val timeView = row.findViewById<TextView>(R.id.overlay_row_time)
      nameView.text = name
      if (clock == null) {
        // A v1 payload's entry has no clock: the name alone.
        timeView.visibility = View.GONE
      } else {
        timeView.visibility = View.VISIBLE
        timeView.text = clock
      }
      rowsContainer.addView(row)
      rows.add(PanelRowView(nameView, timeView, at))
    }
    panelRowViews = rows
    val openAppView = panel.findViewById<TextView>(R.id.overlay_panel_open_app)
    openAppView.text = openAppLabel ?: "صلاتي"
    openAppView.setOnClickListener {
      dismissPanel()
      openApp()
    }
    panel.findViewById<TextView>(R.id.overlay_panel_close)
      .setOnClickListener { dismissPanel() }
    // Measure first, then anchor under the pill, clamped on screen.
    val density = resources.displayMetrics.density
    panel.minimumWidth = (220 * density).toInt()
    panel.measure(
      View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED),
      View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED),
    )
    val screenW = resources.displayMetrics.widthPixels
    val screenH = resources.displayMetrics.heightPixels
    val pillParams = layoutParams
    val pillH = pillView?.measuredHeight ?: 0
    var x = pillParams?.x ?: 0
    var y = (pillParams?.y ?: 0) + pillH + (8 * density).toInt()
    x = x.coerceIn(0, (screenW - panel.measuredWidth).coerceAtLeast(0))
    y = y.coerceIn(0, (screenH - panel.measuredHeight).coerceAtLeast(0))
    val panelParams = FrameLayout.LayoutParams(
      FrameLayout.LayoutParams.WRAP_CONTENT,
      FrameLayout.LayoutParams.WRAP_CONTENT,
      Gravity.TOP or Gravity.START,
    )
    panelParams.leftMargin = x
    panelParams.topMargin = y
    scrim.addView(panel, panelParams)
    panelView = panel
    scrim.setOnTouchListener { _, event ->
      if (event.action == MotionEvent.ACTION_DOWN) {
        val loc = IntArray(2)
        panel.getLocationOnScreen(loc)
        val inside = event.rawX >= loc[0] && event.rawX < loc[0] + panel.width &&
          event.rawY >= loc[1] && event.rawY < loc[1] + panel.height
        if (!inside) {
          dismissPanel()
          true
        } else {
          false
        }
      } else {
        false
      }
    }
    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    } else {
      @Suppress("DEPRECATION")
      WindowManager.LayoutParams.TYPE_PHONE
    }
    val params = WindowManager.LayoutParams(
      WindowManager.LayoutParams.MATCH_PARENT,
      WindowManager.LayoutParams.MATCH_PARENT,
      type,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
      PixelFormat.TRANSLUCENT,
    )
    params.gravity = Gravity.TOP or Gravity.START
    try {
      wm.addView(scrim, params)
      panelScrim = scrim
      panelShown = true
    } catch (_: Exception) {
      // Overlay not allowed: stay with the pill only.
      panelScrim = null
      panelView = null
      panelRowViews = emptyList()
      return
    }
    refreshPanelHighlight()
  }

  private fun dismissPanel() {
    val scrim = panelScrim
    if (scrim != null && panelShown) {
      try {
        windowManager?.removeView(scrim)
      } catch (_: Exception) {
        // Already removed.
      }
    }
    panelScrim = null
    panelView = null
    panelRowViews = emptyList()
    panelShown = false
  }

  /** Gold + bold for the next prayer's row, plain white for the rest. */
  private fun refreshPanelHighlight() {
    if (!panelShown) return
    val now = System.currentTimeMillis()
    val next = times.firstOrNull { it.at > now }
    val gold = Color.parseColor("#C9A227")
    for (row in panelRowViews) {
      val isNext = next != null && row.at == next.at
      row.name.setTextColor(if (isNext) gold else Color.WHITE)
      row.name.setTypeface(null, if (isNext) Typeface.BOLD else Typeface.NORMAL)
    }
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
    val line1 = pillLine1 ?: return
    val line2 = pillLine2 ?: return
    val now = System.currentTimeMillis()
    if (times.isEmpty()) {
      line1.text = "صلاتي"
      line2.visibility = View.GONE
      return
    }
    line2.visibility = View.VISIBLE
    // "حان الآن" for 60s after a prayer time, then roll on.
    val last = times.lastOrNull { it.at <= now }
    if (last != null && now - last.at < NOW_WINDOW_MS) {
      line1.text = "حان الآن — ${last.name}"
      val next = times.firstOrNull { it.at > now }
      if (next != null) {
        line2.text = formatHms(next.at - now)
      } else {
        line2.visibility = View.GONE
      }
      if (panelShown) refreshPanelHighlight()
      return
    }
    val next = times.firstOrNull { it.at > now }
    if (next == null) {
      // All stored times are past (stale — the app pushes fresh
      // times on the next launch).
      line1.text = "صلاتي"
      line2.visibility = View.GONE
      return
    }
    line1.text = if (next.clock != null) "${next.name} ${next.clock}" else next.name
    line2.text = formatHms(next.at - now)
    if (panelShown) refreshPanelHighlight()
  }

  private fun formatHms(ms: Long): String {
    val s = (ms / 1000).coerceAtLeast(0)
    return String.format("%02d:%02d:%02d", s / 3600, (s % 3600) / 60, s % 60)
  }

  // ---- persistence (this service's own prefs file) ----

  private fun applyPayload(payload: OverlayPayload) {
    times = payload.times
    hijriDate = payload.hijriDate
    panelTitle = payload.panelTitle
    openAppLabel = payload.openAppLabel
    if (panelShown) {
      // Fresh times while the panel is open: rebuild it.
      dismissPanel()
      showPanel()
    }
  }

  /**
   * The wire format (see src/services/floatingButton.ts):
   * "hijri|…;title|…;openapp|…;name|epochMs|HH:MM;…". The three meta
   * segments are optional, and so is the clock field — a v1 payload
   * ("name|epochMs;…") parses to times with no Hijri date, title,
   * open-app label or clock.
   */
  private fun parseOverlayPayload(raw: String): OverlayPayload {
    val times = mutableListOf<PrayerTime>()
    var hijri: String? = null
    var title: String? = null
    var openApp: String? = null
    for (part in raw.split(";")) {
      when {
        part.startsWith("hijri|") ->
          hijri = part.removePrefix("hijri|").takeIf { it.isNotEmpty() }
        part.startsWith("title|") ->
          title = part.removePrefix("title|").takeIf { it.isNotEmpty() }
        part.startsWith("openapp|") ->
          openApp = part.removePrefix("openapp|").takeIf { it.isNotEmpty() }
        else -> {
          val fields = part.split("|")
          if (fields.size < 2) continue
          val ms = fields[1].toLongOrNull() ?: continue
          val clock = fields.getOrNull(2)?.takeIf { it.isNotEmpty() }
          times.add(PrayerTime(fields[0], ms, clock))
        }
      }
    }
    return OverlayPayload(times, hijri, title, openApp)
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
    val parsed = parseOverlayPayload(raw)
    if (parsed.times.isNotEmpty()) applyPayload(parsed)
  }
}
