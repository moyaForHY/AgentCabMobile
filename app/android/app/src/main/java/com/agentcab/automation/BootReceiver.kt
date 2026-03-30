package com.agentcab.automation

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

class BootReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "BootReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        Log.d(TAG, "Boot completed — rescheduling automation alarms")

        val prefs = context.getSharedPreferences("automation_alarms", Context.MODE_PRIVATE)
        val ids = prefs.getStringSet("alarm_ids", mutableSetOf()) ?: mutableSetOf()

        if (ids.isEmpty()) {
            Log.d(TAG, "No alarms to reschedule")
            return
        }

        val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val now = System.currentTimeMillis()

        for (ruleId in ids) {
            val storedTrigger = prefs.getLong("${ruleId}_trigger", 0)
            val interval = prefs.getLong("${ruleId}_interval", 0)

            if (storedTrigger == 0L) continue

            // Calculate next valid trigger time
            var nextTrigger = storedTrigger
            if (nextTrigger <= now) {
                if (interval > 0) {
                    // Skip ahead to next interval
                    val missed = ((now - nextTrigger) / interval) + 1
                    nextTrigger += missed * interval
                } else {
                    // One-shot alarm that already passed — trigger soon
                    nextTrigger = now + 5000
                }
            }

            val alarmIntent = Intent(context, AlarmReceiver::class.java).apply {
                action = "com.agentcab.AUTOMATION_ALARM"
                putExtra("ruleId", ruleId)
            }
            val pi = PendingIntent.getBroadcast(
                context,
                ruleId.hashCode(),
                alarmIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, nextTrigger, pi)
            } else {
                am.setExact(AlarmManager.RTC_WAKEUP, nextTrigger, pi)
            }

            // Update trigger time in prefs
            prefs.edit().putLong("${ruleId}_trigger", nextTrigger).apply()

            Log.d(TAG, "Rescheduled alarm $ruleId for ${java.util.Date(nextTrigger)}")
        }
    }
}
