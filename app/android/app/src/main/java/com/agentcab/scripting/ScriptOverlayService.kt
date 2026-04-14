package com.agentcab.scripting

import android.app.*
import android.content.Context
import android.content.Intent
import android.graphics.*
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.Drawable
import android.widget.ImageView
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.util.Log
import android.view.*
import android.view.animation.AccelerateDecelerateInterpolator
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.*

/**
 * Floating overlay with two states:
 *
 * COLLAPSED — a small dark pill showing status dot + text, draggable, tap to expand
 * EXPANDED  — a card with drag handle, WebView (script-controlled HTML), and native Stop button
 */
class ScriptOverlayService : Service() {

    companion object {
        private const val TAG = "ScriptOverlay"
        private const val CHANNEL_ID = "agentcab_script"
        private const val NOTIFICATION_ID = 8888

        var instance: ScriptOverlayService? = null
            private set

        // Colors
        private const val BG_DARK = "#0F172A"
        private const val BG_CARD = "#111827"
        private const val TEXT_PRIMARY = "#F1F5F9"
        private const val TEXT_SECONDARY = "#94A3B8"
        private const val DOT_GREEN = "#22C55E"
        private const val DOT_YELLOW = "#F59E0B"
        private const val DOT_RED = "#EF4444"
        private const val DOT_PURPLE = "#8B5CF6"
        private const val STOP_RED = "#DC2626"
        private const val HANDLE_COLOR = "#334155"

        fun start(context: Context) {
            val intent = Intent(context, ScriptOverlayService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, ScriptOverlayService::class.java))
        }

        fun startMemo(context: Context) {
            val intent = Intent(context, ScriptOverlayService::class.java).apply {
                putExtra("mode", "memo")
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun addLog(msg: String) {
            instance?.updatePillText(msg)
        }

        fun updateStatus(status: String) {
            instance?.updatePillText(status)
        }

        fun setVisible(visible: Boolean) {
            val vis = if (visible) View.VISIBLE else View.GONE
            instance?.pillView?.post { instance?.pillView?.visibility = vis }
            instance?.cardView?.post { instance?.cardView?.visibility = vis }
            instance?.memoView?.post { instance?.memoView?.visibility = vis }
        }

        fun showHtml(html: String) {
            instance?.showWebPanel(html)
        }

        fun hidePanel() {
            instance?.hideWebPanel()
        }
    }

    private var windowManager: WindowManager? = null
    private val mainHandler = Handler(Looper.getMainLooper())
    private val dp by lazy { resources.displayMetrics.density }

    // ── Pill (collapsed) ──
    private var pillView: View? = null
    private var pillParams: WindowManager.LayoutParams? = null
    private var pillDot: View? = null
    private var pillText: TextView? = null
    private var pillIcon: ImageView? = null
    private var pillIconContainer: LinearLayout? = null
    private var currentDotColor: String = DOT_GREEN
    private var dotForcedVisible: Boolean = false

    // ── Card (expanded) ──
    private var cardView: View? = null
    private var cardParams: WindowManager.LayoutParams? = null
    private var webView: WebView? = null
    private var isExpanded = false
    private var pendingHtml: String? = null

    // ── State ──
    private var wakeLock: PowerManager.WakeLock? = null
    private var memoMode = false
    private var cardFocusable = false
    private var cardShowStop = true
    private var currentPillIconName: String? = null
    private var memoView: View? = null

    // ── Lifecycle ──

    override fun onCreate() {
        super.onCreate()
        instance = this
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, createNotification())
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val mode = intent?.getStringExtra("mode") ?: "script"
        if (mode == "memo") {
            memoMode = true
            createMemoButton()
        } else {
            memoMode = false
            createPill()
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "AgentCab:ScriptExecution").apply {
                acquire(10 * 60 * 1000L)
            }
        }
        Log.d(TAG, "Started mode=$mode")
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        wakeLock?.let { if (it.isHeld) it.release() }
        removePill()
        removeCard()
        memoView?.let { try { windowManager?.removeView(it) } catch (_: Exception) {} }
        memoView = null
        instance = null
        Log.d(TAG, "Destroyed")
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    // ══════════════════════════════════════
    // PILL — collapsed state
    // ══════════════════════════════════════

    @Suppress("ClickableViewAccessibility")
    private fun createPill() {
        removePill()
        val wm = windowManager ?: return

        val pillHeight = (44 * dp).toInt()

        // Outer container — tab shape, left side rounded, right side flat (against screen edge)
        val container = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding((10 * dp).toInt(), (8 * dp).toInt(), (8 * dp).toInt(), (8 * dp).toInt())
            val bg = GradientDrawable().apply {
                setColor(Color.parseColor(BG_DARK))
                cornerRadii = floatArrayOf(
                    12 * dp, 12 * dp,  // top-left
                    0f, 0f,            // top-right (flat against edge)
                    0f, 0f,            // bottom-right
                    12 * dp, 12 * dp   // bottom-left
                )
                setStroke(1, Color.parseColor("#1E293B"))
            }
            background = bg
            elevation = 8 * dp
        }

        // Icon container (supports multiple icons, vertical)
        pillIconContainer = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT
            )
            visibility = View.GONE
        }
        container.addView(pillIconContainer)

        // Single icon (backward compat)
        pillIcon = ImageView(this).apply {
            layoutParams = LinearLayout.LayoutParams((20 * dp).toInt(), (20 * dp).toInt())
            visibility = View.GONE
        }
        container.addView(pillIcon)

        // Status dot (shown by default, hidden when icon is shown)
        pillDot = View(this).apply {
            val dotBg = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor(DOT_GREEN))
            }
            background = dotBg
            layoutParams = LinearLayout.LayoutParams((10 * dp).toInt(), (10 * dp).toInt())
        }
        container.addView(pillDot)

        // Status text (hidden by default for tab style)
        pillText = TextView(this).apply {
            text = ""
            setTextColor(Color.parseColor(TEXT_PRIMARY))
            textSize = 13f
            typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
            maxLines = 1
            ellipsize = android.text.TextUtils.TruncateAt.END
            maxWidth = (120 * dp).toInt()
            visibility = View.GONE
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                marginStart = (6 * dp).toInt()
            }
        }
        container.addView(pillText)

        pillView = container

        // Window params — right edge, flush
        pillParams = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            overlayType(),
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.END
            x = 0  // flush with right edge
            y = (200 * dp).toInt()
        }

        // Touch: drag + tap + long press
        var initialX = 0; var initialY = 0
        var touchX = 0f; var touchY = 0f
        var isDragging = false; var downTime = 0L
        var longPressHandled = false
        val longPressRunnable = Runnable {
            if (!isDragging) {
                longPressHandled = true
                sendOverlayAction("longpress", "{}")
                expand()
            }
        }

        container.setOnTouchListener { _, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    initialX = pillParams!!.x; initialY = pillParams!!.y
                    touchX = event.rawX; touchY = event.rawY
                    isDragging = false; downTime = System.currentTimeMillis()
                    longPressHandled = false
                    mainHandler.postDelayed(longPressRunnable, 500)
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = event.rawX - touchX; val dy = event.rawY - touchY
                    if (Math.abs(dx) > 8 * dp || Math.abs(dy) > 8 * dp) {
                        isDragging = true
                        mainHandler.removeCallbacks(longPressRunnable)
                    }
                    if (isDragging) {
                        pillParams!!.x = 0  // always flush with right edge
                        pillParams!!.y = initialY + dy.toInt()
                        try { wm.updateViewLayout(pillView, pillParams) } catch (_: Exception) {}
                    }
                    true
                }
                MotionEvent.ACTION_UP -> {
                    mainHandler.removeCallbacks(longPressRunnable)
                    val hasMultiIcons = pillIconContainer?.visibility == View.VISIBLE
                    if (!isDragging && !longPressHandled && System.currentTimeMillis() - downTime < 300) {
                        if (hasMultiIcons) {
                            // 多图标模式：各图标自己处理点击
                        } else if (pillIcon?.visibility == View.VISIBLE) {
                            // 单图标模式（如录音中）：发事件让脚本处理，不展开
                            val iconName = currentPillIconName ?: ""
                            sendOverlayAction("pill_tap", "{\"icon\":\"$iconName\"}")
                        } else {
                            // 默认：展开
                            expand()
                        }
                    }
                    true
                }
                else -> false
            }
        }

        wm.addView(pillView, pillParams)
    }

    private fun removePill() {
        pillView?.let { try { windowManager?.removeView(it) } catch (_: Exception) {} }
        pillView = null; pillDot = null; pillText = null; pillIcon = null; pillIconContainer = null; pillParams = null
    }

    private fun sendOverlayAction(action: String, data: String) {
        Log.d(TAG, "sendOverlayAction: $action")
        ScriptOverlayModule.emitOverlayAction(action, data)
    }

    fun updatePillText(text: String) {
        pillText?.post { pillText?.text = text }
    }

    fun updatePillDot(color: String) {
        currentDotColor = color
        pillDot?.post {
            val bg = pillDot?.background as? GradientDrawable
            try { bg?.setColor(Color.parseColor(color)) } catch (_: Exception) {}
        }
    }

    fun updatePillBg(color: String) {
        pillView?.post {
            val bg = pillView?.background as? GradientDrawable
            try { bg?.setColor(Color.parseColor(color)) } catch (_: Exception) {}
        }
    }

    fun updatePillIcon(iconName: String?, iconColor: String?) {
        currentPillIconName = iconName
        pillView?.post {
            if (iconName.isNullOrEmpty()) {
                pillIcon?.visibility = View.GONE
                pillIconContainer?.visibility = View.GONE
                pillDot?.visibility = View.VISIBLE
            } else if (iconName.contains(",")) {
                // 多图标模式：逗号分隔。pillDot 仅当脚本通过 data-pill-dot 显式设置时才显示
                pillDot?.visibility = if (dotForcedVisible) View.VISIBLE else View.GONE
                pillIcon?.visibility = View.GONE
                pillIconContainer?.visibility = View.VISIBLE
                pillIconContainer?.removeAllViews()
                val color = try { Color.parseColor(iconColor ?: "#FFFFFF") } catch (_: Exception) { Color.WHITE }
                val iconSize = (22 * dp).toInt()
                val gap = (8 * dp).toInt()
                for (name in iconName.split(",")) {
                    val trimmed = name.trim()
                    val iv = ImageView(this@ScriptOverlayService).apply {
                        layoutParams = LinearLayout.LayoutParams(iconSize, iconSize).apply {
                            bottomMargin = gap
                        }
                        setImageDrawable(PillIconDrawable(trimmed, color, iconSize))
                        setOnClickListener {
                            alpha = 0.5f
                            postDelayed({ alpha = 1f }, 200)
                            sendOverlayAction("icon_tap", "{\"icon\":\"$trimmed\"}")
                            if (trimmed != "mic") expand()
                        }
                        setOnLongClickListener {
                            alpha = 0.5f
                            postDelayed({ alpha = 1f }, 200)
                            sendOverlayAction("icon_long_tap", "{\"icon\":\"$trimmed\"}")
                            true  // consume, 不触发后续 click
                        }
                    }
                    pillIconContainer?.addView(iv)
                }
            } else {
                // 单图标模式
                pillDot?.visibility = View.GONE
                pillIconContainer?.visibility = View.GONE
                pillIcon?.visibility = View.VISIBLE
                val color = try { Color.parseColor(iconColor ?: "#FFFFFF") } catch (_: Exception) { Color.WHITE }
                pillIcon?.setImageDrawable(PillIconDrawable(iconName, color, (20 * dp).toInt()))
            }
        }
    }

    // Simple icon drawable for pill
    private class PillIconDrawable(val icon: String, val color: Int, val size: Int) : Drawable() {
        private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = size * 0.08f
            strokeCap = Paint.Cap.ROUND
            strokeJoin = Paint.Join.ROUND
            this.color = this@PillIconDrawable.color
        }

        override fun draw(canvas: Canvas) {
            val s = size.toFloat()
            val m = s * 0.15f // margin
            when (icon) {
                "camera" -> {
                    val r = RectF(m, s * 0.3f, s - m, s - m)
                    canvas.drawRoundRect(r, s * 0.08f, s * 0.08f, paint)
                    canvas.drawCircle(s / 2, s * 0.58f, s * 0.17f, paint)
                    canvas.drawLine(s * 0.3f, s * 0.3f, s * 0.38f, m, paint)
                    canvas.drawLine(s * 0.38f, m, s * 0.62f, m, paint)
                    canvas.drawLine(s * 0.62f, m, s * 0.7f, s * 0.3f, paint)
                }
                "check" -> {
                    canvas.drawLine(m, s * 0.5f, s * 0.4f, s - m, paint)
                    canvas.drawLine(s * 0.4f, s - m, s - m, m, paint)
                }
                "sync" -> {
                    val r = RectF(m, m, s - m, s - m)
                    canvas.drawArc(r, -30f, 250f, false, paint)
                    // arrow
                    canvas.drawLine(s - m, m, s - m, s * 0.35f, paint)
                    canvas.drawLine(s - m, m, s * 0.65f, m, paint)
                }
                "alert" -> {
                    canvas.drawCircle(s / 2, s / 2, s / 2 - m, paint)
                    canvas.drawLine(s / 2, s * 0.25f, s / 2, s * 0.55f, paint)
                    paint.style = Paint.Style.FILL
                    canvas.drawCircle(s / 2, s * 0.72f, s * 0.04f, paint)
                }
                "send" -> {
                    canvas.drawLine(s - m, m, s * 0.45f, s * 0.55f, paint)
                    val path = Path()
                    path.moveTo(s - m, m)
                    path.lineTo(s * 0.6f, s - m)
                    path.lineTo(s * 0.45f, s * 0.55f)
                    path.lineTo(m, s * 0.38f)
                    path.close()
                    paint.style = Paint.Style.STROKE
                    canvas.drawPath(path, paint)
                }
                "mic" -> {
                    // 麦克风
                    val r = RectF(s * 0.35f, m, s * 0.65f, s * 0.55f)
                    canvas.drawRoundRect(r, s * 0.15f, s * 0.15f, paint)
                    canvas.drawLine(s / 2, s * 0.55f, s / 2, s * 0.75f, paint)
                    canvas.drawLine(s * 0.35f, s * 0.75f, s * 0.65f, s * 0.75f, paint)
                    val arcR = RectF(s * 0.22f, s * 0.3f, s * 0.78f, s * 0.65f)
                    canvas.drawArc(arcR, 0f, 180f, false, paint)
                }
                "chat" -> {
                    // 对话气泡
                    val r = RectF(m, m, s - m, s * 0.7f)
                    canvas.drawRoundRect(r, s * 0.08f, s * 0.08f, paint)
                    val path = Path()
                    path.moveTo(s * 0.25f, s * 0.7f)
                    path.lineTo(m, s - m)
                    path.lineTo(s * 0.4f, s * 0.7f)
                    canvas.drawPath(path, paint)
                }
            }
        }

        override fun setAlpha(alpha: Int) { paint.alpha = alpha }
        override fun setColorFilter(cf: ColorFilter?) { paint.colorFilter = cf }
        override fun getOpacity() = PixelFormat.TRANSLUCENT
        override fun getIntrinsicWidth() = size
        override fun getIntrinsicHeight() = size
    }

    // ══════════════════════════════════════
    // CARD — expanded state
    // ══════════════════════════════════════

    @Suppress("ClickableViewAccessibility")
    private fun expand() {
        if (isExpanded) return
        isExpanded = true

        // Hide pill
        pillView?.animate()?.alpha(0f)?.setDuration(150)?.withEndAction {
            pillView?.visibility = View.GONE
        }?.start()

        val wm = windowManager ?: return
        val displayMetrics = resources.displayMetrics
        val cardWidth = (displayMetrics.widthPixels * 0.88).toInt()
        val maxHeight = (displayMetrics.heightPixels * 0.55).toInt()

        // ── Build card layout ──
        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            val bg = GradientDrawable().apply {
                setColor(Color.parseColor(BG_CARD))
                cornerRadius = 16 * dp
                setStroke(1, Color.parseColor("#1E293B"))
            }
            background = bg
            elevation = 20 * dp
        }

        // Handle bar row: pill + stop button
        val handleRow = FrameLayout(this).apply {
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, (40 * dp).toInt()
            )
        }

        // Center drag pill
        val pill = View(this).apply {
            val pillBg = GradientDrawable().apply {
                setColor(Color.parseColor(HANDLE_COLOR))
                cornerRadius = 3 * dp
            }
            background = pillBg
            layoutParams = FrameLayout.LayoutParams((36 * dp).toInt(), (4 * dp).toInt()).apply {
                gravity = Gravity.CENTER
            }
        }
        handleRow.addView(pill)

        // Stop button (right)
        val stopBtn = TextView(this).apply {
            text = "停止"
            setTextColor(Color.WHITE)
            textSize = 11f
            typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
            val bg = GradientDrawable().apply {
                setColor(Color.parseColor(STOP_RED))
                cornerRadius = 12 * dp
            }
            background = bg
            setPadding((14 * dp).toInt(), (4 * dp).toInt(), (14 * dp).toInt(), (4 * dp).toInt())
            gravity = Gravity.CENTER
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT, (26 * dp).toInt()
            ).apply {
                gravity = Gravity.END or Gravity.CENTER_VERTICAL
                marginEnd = (12 * dp).toInt()
            }
            setOnClickListener {
                ScriptOverlayModule.emitStopEvent()
                collapse()
                stopSelf()
            }
        }
        stopBtn.visibility = if (cardShowStop) View.VISIBLE else View.GONE
        handleRow.addView(stopBtn)

        // Collapse button (left — small ‹ arrow)
        val collapseBtn = TextView(this).apply {
            text = "‹"
            setTextColor(Color.parseColor(TEXT_SECONDARY))
            textSize = 18f
            gravity = Gravity.CENTER
            layoutParams = FrameLayout.LayoutParams((32 * dp).toInt(), (40 * dp).toInt()).apply {
                gravity = Gravity.START or Gravity.CENTER_VERTICAL
                marginStart = (8 * dp).toInt()
            }
            setOnClickListener { collapse() }
        }
        handleRow.addView(collapseBtn)

        card.addView(handleRow)

        // Divider
        val divider = View(this).apply {
            setBackgroundColor(Color.parseColor("#1E293B"))
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 1)
        }
        card.addView(divider)

        // WebView
        webView = WebView(this).apply {
            setBackgroundColor(Color.TRANSPARENT)
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            webViewClient = WebViewClient()
            webChromeClient = WebChromeClient()

            addJavascriptInterface(object {
                @JavascriptInterface
                fun onResize(heightPx: Int) {
                    post {
                        val nativeHeight = (heightPx * dp).toInt()
                        val clamped = nativeHeight.coerceIn((60 * dp).toInt(), maxHeight)
                        val lp = layoutParams
                        lp.height = clamped
                        layoutParams = lp
                        // Update window size
                        cardParams?.let { pp ->
                            pp.height = clamped + (41 * dp).toInt() // handle + divider
                            try { wm.updateViewLayout(cardView, pp) } catch (_: Exception) {}
                        }
                    }
                }

                @JavascriptInterface
                fun onAction(name: String, dataJson: String) {
                    Log.d(TAG, "Action: $name data=$dataJson")
                    ScriptOverlayModule.emitOverlayAction(name, dataJson)
                }
            }, "AgentCab")

            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, (100 * dp).toInt()
            )
        }
        card.addView(webView)

        cardView = card

        // Position card where pill was
        val focusable = cardFocusable
        cardParams = WindowManager.LayoutParams(
            cardWidth,
            WindowManager.LayoutParams.WRAP_CONTENT,
            overlayType(),
            if (focusable) WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
            else WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
            PixelFormat.TRANSLUCENT
        ).apply {
            if (focusable) softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE
            gravity = Gravity.TOP or Gravity.END
            x = (8 * dp).toInt()
            y = pillParams?.y ?: (48 * dp).toInt()
        }

        // Drag via handle
        var initialX = 0; var initialY = 0
        var touchX = 0f; var touchY = 0f
        handleRow.setOnTouchListener { _, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    initialX = cardParams!!.x; initialY = cardParams!!.y
                    touchX = event.rawX; touchY = event.rawY; true
                }
                MotionEvent.ACTION_MOVE -> {
                    cardParams!!.x = initialX + (event.rawX - touchX).toInt()
                    cardParams!!.y = initialY + (event.rawY - touchY).toInt()
                    try { wm.updateViewLayout(cardView, cardParams) } catch (_: Exception) {}
                    true
                }
                else -> false
            }
        }

        wm.addView(cardView, cardParams)

        // Animate in
        card.alpha = 0f
        card.scaleX = 0.9f; card.scaleY = 0.9f
        card.animate().alpha(1f).scaleX(1f).scaleY(1f)
            .setDuration(200).setInterpolator(AccelerateDecelerateInterpolator()).start()

        // Load pending HTML if any
        pendingHtml?.let { loadHtmlIntoWebView(it) }

        Log.d(TAG, "Expanded")
    }

    private fun collapse() {
        if (!isExpanded) return
        isExpanded = false

        // Animate card out
        cardView?.animate()?.alpha(0f)?.scaleX(0.9f)?.scaleY(0.9f)
            ?.setDuration(150)?.withEndAction {
                removeCard()
            }?.start()

        // Show pill
        pillView?.visibility = View.VISIBLE
        pillView?.alpha = 0f
        pillView?.animate()?.alpha(1f)?.setDuration(200)?.start()

        Log.d(TAG, "Collapsed")
        sendOverlayAction("collapsed", "{}")
    }

    private fun removeCard() {
        cardView?.let { try { windowManager?.removeView(it) } catch (_: Exception) {} }
        webView?.destroy()
        webView = null; cardView = null; cardParams = null
    }

    // ══════════════════════════════════════
    // WebView panel — public API
    // ══════════════════════════════════════

    fun showWebPanel(html: String) {
        if (Looper.myLooper() != Looper.getMainLooper()) {
            mainHandler.post { showWebPanel(html) }
            return
        }
        pendingHtml = html

        // Update pill text: prefer data-pill-text, fallback to first text node
        val pillTextAttr = Regex("data-pill-text=[\"']([^\"']*)[\"']").find(html)
        if (pillTextAttr != null) {
            updatePillText(pillTextAttr.groupValues[1])
        } else {
            val textMatch = Regex(">([^<]{2,40})<").find(html)
            textMatch?.groupValues?.get(1)?.let { t ->
                val clean = t.trim()
                if (clean.isNotEmpty()) updatePillText(clean)
            }
        }

        // Update dot color: prefer data-pill-dot, fallback to content detection
        val pillDotAttr = Regex("data-pill-dot=[\"']([^\"']+)[\"']").find(html)
        dotForcedVisible = pillDotAttr != null
        if (pillDotAttr != null) {
            updatePillDot(pillDotAttr.groupValues[1])
        } else {
            when {
                html.contains("#22C55E") || html.contains("监听") -> updatePillDot(DOT_GREEN)
                html.contains("#F59E0B") || html.contains("恢复") || html.contains("帮助") -> updatePillDot(DOT_YELLOW)
                html.contains("#EF4444") || html.contains("出错") || html.contains("失败") -> updatePillDot(DOT_RED)
                html.contains("#8B5CF6") || html.contains("思考") || html.contains("生成") -> updatePillDot(DOT_PURPLE)
                else -> updatePillDot(DOT_GREEN)
            }
        }

        // Update pill background: data-pill-bg
        val pillBgAttr = Regex("data-pill-bg=[\"']([^\"']+)[\"']").find(html)
        if (pillBgAttr != null) {
            updatePillBg(pillBgAttr.groupValues[1])
        }

        // Update focusable: data-pill-focusable
        val focusableAttr = Regex("data-pill-focusable=[\"']([^\"']*)[\"']").find(html)
        cardFocusable = focusableAttr?.groupValues?.get(1) == "true"

        // Update stop button visibility: data-pill-stop
        val stopAttr = Regex("data-pill-stop=[\"']([^\"']*)[\"']").find(html)
        cardShowStop = stopAttr?.groupValues?.get(1) != "false"

        // Update pill icon: data-pill-icon, data-pill-icon-color
        val pillIconAttr = Regex("data-pill-icon=[\"']([^\"']+)[\"']").find(html)
        val pillIconColorAttr = Regex("data-pill-icon-color=[\"']([^\"']+)[\"']").find(html)
        updatePillIcon(pillIconAttr?.groupValues?.get(1), pillIconColorAttr?.groupValues?.get(1))

        // Hide/show text: if data-pill-text is empty string, hide text
        if (pillTextAttr != null && pillTextAttr.groupValues[1].isEmpty()) {
            pillText?.post { pillText?.visibility = View.GONE }
        } else {
            pillText?.post { pillText?.visibility = View.VISIBLE }
        }

        if (isExpanded && webView != null) {
            loadHtmlIntoWebView(html)
            // Update card focusable flag dynamically
            cardParams?.let { cp ->
                val newFlags = if (cardFocusable) WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
                    else WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
                if (cp.flags != newFlags) {
                    cp.flags = newFlags
                    if (cardFocusable) cp.softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE
                    else cp.softInputMode = 0
                    try { windowManager?.updateViewLayout(cardView, cp) } catch (_: Exception) {}
                }
            }
        }
        // If collapsed, HTML will be loaded when user expands
    }

    fun hideWebPanel() {
        if (Looper.myLooper() != Looper.getMainLooper()) {
            mainHandler.post { hideWebPanel() }
            return
        }
        pendingHtml = null
        if (isExpanded) collapse()
        Log.d(TAG, "Panel hidden")
    }

    private fun loadHtmlIntoWebView(html: String) {
        val fullHtml = """
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: -apple-system, 'PingFang SC', 'Helvetica Neue', sans-serif;
  background: transparent;
  color: #E2E8F0;
  padding: 12px 14px;
  overflow: hidden;
  -webkit-text-size-adjust: none;
}
button { font-family: inherit; cursor: pointer; -webkit-tap-highlight-color: transparent; }
input, textarea { font-family: inherit; }
</style>
</head>
<body>
$html
<script>
function reportHeight() {
  var h = document.body.scrollHeight;
  AgentCab.onResize(h);
}
window.onload = reportHeight;
new MutationObserver(reportHeight).observe(document.body, {childList:true, subtree:true, attributes:true});
setTimeout(reportHeight, 50);
setTimeout(reportHeight, 300);

function action(name, data) {
  AgentCab.onAction(name, JSON.stringify(data || {}));
}
</script>
</body>
</html>
        """.trimIndent()
        webView?.loadDataWithBaseURL(null, fullHtml, "text/html", "UTF-8", null)
    }

    // ══════════════════════════════════════
    // Memo floating button
    // ══════════════════════════════════════

    @Suppress("ClickableViewAccessibility")
    private fun createMemoButton() {
        val wm = windowManager ?: return
        memoView?.let { try { wm.removeView(it) } catch (_: Exception) {} }

        val btnSize = (48 * dp).toInt()
        val btn = TextView(this).apply {
            text = "📷"
            textSize = 20f
            gravity = Gravity.CENTER
            val bg = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#2563EB"))
            }
            background = bg
            elevation = 12 * dp
        }

        val container = FrameLayout(this)
        container.addView(btn, FrameLayout.LayoutParams(btnSize, btnSize))
        memoView = container

        val params = WindowManager.LayoutParams(
            btnSize, btnSize, overlayType(),
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = resources.displayMetrics.widthPixels - btnSize - (16 * dp).toInt()
            y = (resources.displayMetrics.heightPixels * 0.6).toInt()
        }

        var initialX = 0; var initialY = 0
        var touchX = 0f; var touchY = 0f; var isDragging = false

        btn.setOnTouchListener { _, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    initialX = params.x; initialY = params.y
                    touchX = event.rawX; touchY = event.rawY; isDragging = false; true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = event.rawX - touchX; val dy = event.rawY - touchY
                    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) isDragging = true
                    if (isDragging) {
                        params.x = initialX + dx.toInt(); params.y = initialY + dy.toInt()
                        try { wm.updateViewLayout(memoView, params) } catch (_: Exception) {}
                    }
                    true
                }
                MotionEvent.ACTION_UP -> {
                    if (!isDragging) ScriptOverlayModule.emitOverlayAction("memo_screenshot", "{}")
                    true
                }
                else -> false
            }
        }

        wm.addView(memoView, params)
        Log.d(TAG, "Memo button created")
    }

    // ══════════════════════════════════════
    // Helpers
    // ══════════════════════════════════════

    private fun overlayType(): Int {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        else
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "Script Execution", NotificationManager.IMPORTANCE_LOW).apply {
                    description = "Shows when a script is running"
                    setShowBadge(false)
                }
            )
        }
    }

    private fun createNotification(): Notification {
        val tapIntent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        val pendingTap = PendingIntent.getActivity(
            this, 0, tapIntent!!,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }.apply {
            setSmallIcon(android.R.drawable.ic_media_play)
            setContentTitle("AgentCab")
            setContentText("运行中...")
            setContentIntent(pendingTap)
            setOngoing(true)
        }.build()
    }
}
