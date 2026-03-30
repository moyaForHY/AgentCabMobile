package com.agentcab.automation

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
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
    fun scheduleAlarm(ruleId: String, triggerAtMillis: Double, repeatIntervalMillis: Double, promise: Promise) {
        try {
            val am = getAlarmManager()
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
            val pi = buildPendingIntent(ruleId, PendingIntent.FLAG_NO_CREATE)
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
                val pi = buildPendingIntent(id, PendingIntent.FLAG_NO_CREATE)
                am.cancel(pi)
            }

            prefs.edit().clear().apply()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ALARM_ERROR", "Failed to cancel all alarms: ${e.message}", e)
        }
    }
}
