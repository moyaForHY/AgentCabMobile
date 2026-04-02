package com.agentcab.notification

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule

@ReactModule(name = NotificationModule.NAME)
class NotificationModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "NotificationManager"
        const val CHANNEL_ID = "agentcab_tasks"
        const val CHANNEL_NAME = "Task Updates"
    }

    override fun getName(): String = NAME

    init {
        createChannel()
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "Notifications for API call results"
            }
            val nm = reactApplicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.createNotificationChannel(channel)
        }
    }

    @ReactMethod
    fun showNotification(title: String, body: String, id: Int, promise: Promise) {
        showNotificationWithData(title, body, id, null, promise)
    }

    @ReactMethod
    fun showNotificationWithCallId(title: String, body: String, id: Int, callId: String, promise: Promise) {
        showNotificationWithData(title, body, id, callId, promise)
    }

    private fun showNotificationWithData(title: String, body: String, id: Int, callId: String?, promise: Promise) {
        try {
            // Create intent to open app — MainActivity will read the extras
            val intent = reactApplicationContext.packageManager.getLaunchIntentForPackage(reactApplicationContext.packageName)
                ?: Intent()
            intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            if (callId != null) {
                intent.putExtra("callId", callId)
                intent.putExtra("navigate", "TaskResult")
            }

            val pendingIntent = PendingIntent.getActivity(
                reactApplicationContext, id, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val notification = NotificationCompat.Builder(reactApplicationContext, CHANNEL_ID)
                .setContentTitle(title)
                .setContentText(body)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setAutoCancel(true)
                .setContentIntent(pendingIntent)
                .build()

            val nm = reactApplicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.notify(id, notification)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("NOTIFY_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun cancelNotification(id: Int, promise: Promise) {
        try {
            val nm = reactApplicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.cancel(id)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("CANCEL_ERROR", e.message, e)
        }
    }
}
