package com.agentcab.automation

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.modules.core.DeviceEventManagerModule

class AlarmReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "AlarmReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val ruleId = intent.getStringExtra("ruleId") ?: return
        Log.d(TAG, "Alarm fired for rule: $ruleId")

        // Reschedule next occurrence
        rescheduleNext(context, ruleId)

        // Ensure KeepAlive is running
        try { KeepAliveService.start(context) } catch (_: Exception) {}

        // Try to send JS event (KeepAlive keeps React context alive)
        try {
            val reactApp = context.applicationContext as? com.facebook.react.ReactApplication
            val reactContext = reactApp?.reactHost?.currentReactContext

            if (reactContext != null) {
                reactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    ?.emit("onAutomationAlarm", Arguments.createMap().apply {
                        putString("ruleId", ruleId)
                    })
                Log.d(TAG, "Sent JS event for rule: $ruleId")
                return
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to send JS event: ${e.message}")
        }

        // Fallback: launch app with ruleId (will auto-execute via IntentModule)
        Log.d(TAG, "React context not available, launching app for rule: $ruleId")
        try {
            val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                putExtra("automationRuleId", ruleId)
            }
            if (launchIntent != null) context.startActivity(launchIntent)
        } catch (_: Exception) {}
    }

    private fun rescheduleNext(context: Context, ruleId: String) {
        val prefs = context.getSharedPreferences("automation_alarms", Context.MODE_PRIVATE)
        val interval = prefs.getLong("${ruleId}_interval", 0)
        if (interval <= 0) return

        val nextTrigger = System.currentTimeMillis() + interval
        val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

        val alarmIntent = Intent(context, AlarmReceiver::class.java).apply {
            action = "com.agentcab.AUTOMATION_ALARM"
            putExtra("ruleId", ruleId)
        }
        val pi = PendingIntent.getBroadcast(
            context, ruleId.hashCode(), alarmIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, nextTrigger, pi)
        } else {
            am.setExact(AlarmManager.RTC_WAKEUP, nextTrigger, pi)
        }

        prefs.edit().putLong("${ruleId}_trigger", nextTrigger).apply()
    }
}
