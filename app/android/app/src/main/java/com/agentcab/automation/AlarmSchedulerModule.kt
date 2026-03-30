package com.agentcab.automation

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.*

class AlarmSchedulerModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "AlarmSchedulerModule"

    private fun getAlarmManager(): AlarmManager =
        reactApplicationContext.getSystemService(Context.ALARM_SERVICE) as AlarmManager

    private fun buildPendingIntent(ruleId: String, flags: Int = 0): PendingIntent {
        val intent = Intent(reactApplicationContext, AlarmReceiver::class.java).apply {
            action = "com.agentcab.AUTOMATION_ALARM"
            putExtra("ruleId", ruleId)
        }
        val requestCode = ruleId.hashCode()
        return PendingIntent.getBroadcast(
            reactApplicationContext,
            requestCode,
            intent,
            flags or PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    @ReactMethod
    fun canScheduleExact(promise: Promise) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            promise.resolve(getAlarmManager().canScheduleExactAlarms())
        } else {
            promise.resolve(true)
        }
    }

    @ReactMethod
    fun requestExactAlarmPermission(promise: Promise) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                reactApplicationContext.startActivity(intent)
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("PERMISSION_ERROR", e.message, e)
            }
        } else {
            promise.resolve(true)
        }
    }

    @ReactMethod
    fun scheduleAlarm(ruleId: String, triggerAtMillis: Double, repeatIntervalMillis: Double, promise: Promise) {
        try {
            val am = getAlarmManager()

            // Check exact alarm permission on Android 12+
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !am.canScheduleExactAlarms()) {
                promise.reject("PERMISSION_DENIED", "Exact alarm permission not granted. Please allow in Settings.")
                return
            }

            val pi = buildPendingIntent(ruleId)
            val triggerAt = triggerAtMillis.toLong()
            val interval = repeatIntervalMillis.toLong()

            // Save to SharedPreferences so BootReceiver can reschedule
            val prefs = reactApplicationContext.getSharedPreferences("automation_alarms", Context.MODE_PRIVATE)
            prefs.edit()
                .putLong("${ruleId}_trigger", triggerAt)
                .putLong("${ruleId}_interval", interval)
                .putStringSet("alarm_ids", (prefs.getStringSet("alarm_ids", mutableSetOf()) ?: mutableSetOf()).apply { add(ruleId) })
                .apply()

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi)
            } else {
                am.setExact(AlarmManager.RTC_WAKEUP, triggerAt, pi)
            }

            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ALARM_ERROR", "Failed to schedule alarm: ${e.message}", e)
        }
    }

    @ReactMethod
    fun cancelAlarm(ruleId: String, promise: Promise) {
        try {
            val am = getAlarmManager()
            val pi = buildPendingIntent(ruleId)
            am.cancel(pi)

            // Remove from SharedPreferences
            val prefs = reactApplicationContext.getSharedPreferences("automation_alarms", Context.MODE_PRIVATE)
            val ids = prefs.getStringSet("alarm_ids", mutableSetOf())?.toMutableSet() ?: mutableSetOf()
            ids.remove(ruleId)
            prefs.edit()
                .remove("${ruleId}_trigger")
                .remove("${ruleId}_interval")
                .putStringSet("alarm_ids", ids)
                .apply()

            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ALARM_ERROR", "Failed to cancel alarm: ${e.message}", e)
        }
    }

    @ReactMethod
    fun cancelAllAlarms(promise: Promise) {
        try {
            val prefs = reactApplicationContext.getSharedPreferences("automation_alarms", Context.MODE_PRIVATE)
            val ids = prefs.getStringSet("alarm_ids", mutableSetOf()) ?: mutableSetOf()
            val am = getAlarmManager()

            for (id in ids) {
                val pi = buildPendingIntent(id)
                am.cancel(pi)
            }

            prefs.edit().clear().apply()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ALARM_ERROR", "Failed to cancel all alarms: ${e.message}", e)
        }
    }

    @ReactMethod
    fun startKeepAlive(promise: Promise) {
        try {
            KeepAliveService.start(reactApplicationContext)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SERVICE_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun stopKeepAlive(promise: Promise) {
        try {
            KeepAliveService.stop(reactApplicationContext)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SERVICE_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun updateNotification(ruleId: String, title: String, text: String, promise: Promise) {
        try {
            val nm = reactApplicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager

            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                nm.createNotificationChannel(
                    android.app.NotificationChannel("agentcab_automation", "Automations", android.app.NotificationManager.IMPORTANCE_DEFAULT)
                )
            }

            val tapIntent = reactApplicationContext.packageManager.getLaunchIntentForPackage(reactApplicationContext.packageName)?.apply {
                addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            val pendingTap = android.app.PendingIntent.getActivity(
                reactApplicationContext, ruleId.hashCode(), tapIntent!!,
                android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
            )

            val notification = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                android.app.Notification.Builder(reactApplicationContext, "agentcab_automation")
            } else {
                @Suppress("DEPRECATION")
                android.app.Notification.Builder(reactApplicationContext)
            }.apply {
                setSmallIcon(android.R.drawable.ic_dialog_info)
                setContentTitle(title)
                setContentText(text)
                setContentIntent(pendingTap)
                setAutoCancel(true)
            }.build()

            nm.notify(ruleId.hashCode(), notification)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("NOTIFICATION_ERROR", e.message, e)
        }
    }
}
