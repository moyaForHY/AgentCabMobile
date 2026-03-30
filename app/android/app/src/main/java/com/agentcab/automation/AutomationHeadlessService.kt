package com.agentcab.automation

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.util.Log
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.jstasks.HeadlessJsTaskConfig

class AutomationHeadlessService : HeadlessJsTaskService() {

    companion object {
        private const val TAG = "AutomationHeadless"
        private const val CHANNEL_ID = "agentcab_automation"
        private const val NOTIFICATION_ID = 9002
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Must call startForeground immediately
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "Automations", NotificationManager.IMPORTANCE_LOW).apply {
                    description = "Automation task execution"
                }
            )
        }

        val notification = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }.apply {
            setSmallIcon(android.R.drawable.ic_popup_sync)
            setContentTitle("Running automation...")
            setContentText("Processing in background")
            setOngoing(true)
        }.build()

        startForeground(NOTIFICATION_ID, notification)

        return super.onStartCommand(intent, flags, startId)
    }

    override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
        val ruleId = intent?.getStringExtra("ruleId") ?: return null
        Log.d(TAG, "Starting HeadlessJS task for rule: $ruleId")

        val extras = Bundle().apply {
            putString("ruleId", ruleId)
        }

        return HeadlessJsTaskConfig(
            "AutomationTask",
            com.facebook.react.bridge.Arguments.fromBundle(extras),
            5 * 60 * 1000L, // 5 min timeout
            true // allow in foreground
        )
    }
}
