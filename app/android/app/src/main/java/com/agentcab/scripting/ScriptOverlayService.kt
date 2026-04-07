package com.agentcab.scripting

import android.app.*
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import android.view.*
import android.widget.*

/**
 * Floating overlay service that shows script execution logs
 * and keeps the JS thread alive while user interacts with other apps.
 */
class ScriptOverlayService : Service() {

    companion object {
        private const val TAG = "ScriptOverlay"
        private const val CHANNEL_ID = "agentcab_script"
        private const val NOTIFICATION_ID = 8888
        var instance: ScriptOverlayService? = null
            private set

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

        fun addLog(msg: String) {
            instance?.addLogMessage(msg)
        }

        fun updateStatus(status: String) {
            instance?.updateStatusText(status)
        }

        fun setVisible(visible: Boolean) {
            instance?.overlayView?.visibility = if (visible) View.VISIBLE else View.GONE
        }
    }

    private var windowManager: WindowManager? = null
    private var overlayView: View? = null
    private var logTextView: TextView? = null
    private var statusTextView: TextView? = null
    private var isMinimized = false
    private val logMessages = mutableListOf<String>()
    private var wakeLock: PowerManager.WakeLock? = null

    override fun onCreate() {
        super.onCreate()
        instance = this
        Log.d(TAG, "ScriptOverlayService created")

        createNotificationChannel()
        startForeground(NOTIFICATION_ID, createNotification())
        createOverlay()

        // Acquire WakeLock to keep CPU running while script executes
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "AgentCab:ScriptExecution").apply {
            acquire(10 * 60 * 1000L) // max 10 minutes
        }
        Log.d(TAG, "WakeLock acquired")
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
            setContentTitle("AgentCab Script")
            setContentText("Script running...")
            setContentIntent(pendingTap)
            setOngoing(true)
        }.build()
    }

    @Suppress("ClickableViewAccessibility")
    private fun createOverlay() {
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager

        // Outer container with rounded corners
        val container = android.widget.FrameLayout(this)

        // Create overlay layout with rounded background
        val bg = android.graphics.drawable.GradientDrawable().apply {
            setColor(Color.parseColor("#E6111827")) // dark with slight transparency
            cornerRadius = 24f
        }
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = bg
            setPadding(28, 12, 20, 10)
        }

        // Header row: green dot + status + stop
        val header = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }

        // Green pulse dot
        val dot = View(this).apply {
            val dotBg = android.graphics.drawable.GradientDrawable().apply {
                shape = android.graphics.drawable.GradientDrawable.OVAL
                setColor(Color.parseColor("#22C55E"))
            }
            background = dotBg
            layoutParams = LinearLayout.LayoutParams(14, 14).apply {
                marginEnd = 10
            }
        }
        header.addView(dot)

        statusTextView = TextView(this).apply {
            text = "AgentCab Running"
            setTextColor(Color.parseColor("#E2E8F0"))
            textSize = 12f
            typeface = android.graphics.Typeface.create("sans-serif-medium", android.graphics.Typeface.NORMAL)
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        header.addView(statusTextView)

        // Stop button — pill shape, larger for easy tap
        val stopBtn = TextView(this).apply {
            text = "Stop"
            setTextColor(Color.WHITE)
            textSize = 13f
            typeface = android.graphics.Typeface.create("sans-serif-medium", android.graphics.Typeface.NORMAL)
            val stopBg = android.graphics.drawable.GradientDrawable().apply {
                setColor(Color.parseColor("#DC2626"))
                cornerRadius = 24f
            }
            background = stopBg
            setPadding(28, 10, 28, 10)
            gravity = Gravity.CENTER
            setOnClickListener {
                ScriptOverlayModule.emitStopEvent()
                // 立即关闭悬浮窗
                try {
                    windowManager?.removeView(overlayView)
                    overlayView = null
                } catch (e: Exception) {}
                stopSelf()
            }
        }
        header.addView(stopBtn)

        layout.addView(header)

        // Log line
        logTextView = TextView(this).apply {
            text = ""
            setTextColor(Color.parseColor("#94A3B8"))
            textSize = 10f
            maxLines = 1
            ellipsize = android.text.TextUtils.TruncateAt.END
            setPadding(24, 4, 0, 0)
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
        }
        layout.addView(logTextView)

        container.addView(layout)

        overlayView = container

        // Window params
        val displayMetrics = resources.displayMetrics
        val overlayWidth = (displayMetrics.widthPixels * 0.65).toInt()
        val params = WindowManager.LayoutParams(
            overlayWidth,
            WindowManager.LayoutParams.WRAP_CONTENT,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            else
                @Suppress("DEPRECATION")
                WindowManager.LayoutParams.TYPE_PHONE,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = 24
            y = 8
        }

        // Make draggable
        var initialY = 0
        var touchY = 0f
        layout.setOnTouchListener { _, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    initialY = params.y
                    touchY = event.rawY
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    params.y = initialY - (event.rawY - touchY).toInt()
                    windowManager?.updateViewLayout(overlayView, params)
                    true
                }
                else -> false
            }
        }

        windowManager?.addView(overlayView, params)
    }

    private fun toggleMinimize() {
        isMinimized = !isMinimized
        val scrollView = (overlayView as? LinearLayout)?.getChildAt(1)
        scrollView?.visibility = if (isMinimized) View.GONE else View.VISIBLE
    }

    fun addLogMessage(msg: String) {
        logMessages.add(msg)
        while (logMessages.size > 50) logMessages.removeAt(0)

        logTextView?.post {
            // Only show latest line
            logTextView?.text = msg
        }
    }

    fun updateStatusText(status: String) {
        statusTextView?.post {
            statusTextView?.text = status
        }
    }

    override fun onDestroy() {
        wakeLock?.let {
            if (it.isHeld) it.release()
            Log.d(TAG, "WakeLock released")
        }
        if (overlayView != null) {
            windowManager?.removeView(overlayView)
            overlayView = null
        }
        instance = null
        Log.d(TAG, "ScriptOverlayService destroyed")
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
