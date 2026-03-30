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
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

class AutomationForegroundService : HeadlessJsTaskService() {

    companion object {
        private const val TAG = "AutomationFgService"
        private const val CHANNEL_ID = "agentcab_automation"
        private const val CHANNEL_NAME = "Automations"
        private const val NOTIFICATION_ID = 9001
        private const val TASK_TIMEOUT_MS = 5 * 60 * 1000L // 5 minutes
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Must call startForeground within 5 seconds
        val notification = buildNotification("Running automation...")
        startForeground(NOTIFICATION_ID, notification)

        // Let HeadlessJsTaskService handle the rest (starting RN runtime + task)
        return super.onStartCommand(intent, flags, startId)
    }

    override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
        val ruleId = intent?.getStringExtra("ruleId")
        if (ruleId == null) {
            Log.w(TAG, "No ruleId in intent, stopping service")
            stopSelf()
            return null
        }

        Log.d(TAG, "Starting HeadlessJS task for rule: $ruleId")

        val extras = Arguments.createMap().apply {
            putString("ruleId", ruleId)
        }

        return HeadlessJsTaskConfig(
            "AutomationTask",
            extras,
            TASK_TIMEOUT_MS,
            true // allow task to run in foreground too
        )
    }

    override fun onHeadlessJsTaskFinish(taskId: Int) {
        // Update notification to show completion, then stop
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val notification = buildNotification("Automation completed")
        notificationManager.notify(NOTIFICATION_ID, notification)

        Log.d(TAG, "HeadlessJS task finished, stopping service")
        stopSelf()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Notifications for scheduled automation execution"
            }
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(text: String): Notification {
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }

        return builder
            .setContentTitle("AgentCab")
            .setContentText(text)
            .setSmallIcon(applicationInfo.icon)
            .setOngoing(true)
            .build()
    }
}
