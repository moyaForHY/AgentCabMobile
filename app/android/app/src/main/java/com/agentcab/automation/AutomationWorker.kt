package com.agentcab.automation

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.ForegroundInfo
import androidx.work.WorkerParameters
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import kotlinx.coroutines.delay
import kotlinx.coroutines.withTimeoutOrNull

class AutomationWorker(
    private val context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    companion object {
        private const val TAG = "AutomationWorker"
        private const val CHANNEL_ID = "agentcab_automation"
        private const val NOTIFICATION_ID = 9001
    }

    override suspend fun doWork(): Result {
        val ruleId = inputData.getString("ruleId") ?: return Result.failure()
        Log.d(TAG, "Starting work for rule: $ruleId")

        // Show foreground notification
        setForeground(createForegroundInfo(ruleId))

        // Start HeadlessJS service
        val serviceIntent = Intent(context, AutomationHeadlessService::class.java).apply {
            putExtra("ruleId", ruleId)
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(serviceIntent)
        } else {
            context.startService(serviceIntent)
        }

        // Wait for completion (poll a shared flag, max 5 min)
        val completed = withTimeoutOrNull(5 * 60 * 1000L) {
            while (true) {
                val prefs = context.getSharedPreferences("automation_status", Context.MODE_PRIVATE)
                val status = prefs.getString("${ruleId}_status", null)
                if (status != null) {
                    prefs.edit().remove("${ruleId}_status").apply()
                    return@withTimeoutOrNull status
                }
                delay(2000)
            }
            @Suppress("UNREACHABLE_CODE")
            "timeout"
        }

        Log.d(TAG, "Work completed for rule: $ruleId, status: $completed")
        return Result.success()
    }

    private fun createForegroundInfo(ruleId: String): ForegroundInfo {
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "Automations", NotificationManager.IMPORTANCE_LOW).apply {
                    description = "Automation task execution"
                }
            )
        }

        val notification = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(context, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(context)
        }.apply {
            setSmallIcon(android.R.drawable.ic_popup_sync)
            setContentTitle("Running automation...")
            setContentText("Processing in background")
            setOngoing(true)
        }.build()

        return ForegroundInfo(NOTIFICATION_ID, notification)
    }
}
