package com.agentcab.automation

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.modules.core.DeviceEventManagerModule

class AlarmReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "AlarmReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val ruleId = intent.getStringExtra("ruleId") ?: return
        Log.d(TAG, "Alarm fired for rule: $ruleId")

        // Reschedule the next occurrence (since we use one-shot exact alarms)
        rescheduleNext(context, ruleId)

        // Try to send event to JS if app is running
        try {
            val reactApp = context.applicationContext as? com.facebook.react.ReactApplication
            val reactHost = reactApp?.reactHost
            val reactInstance = reactHost?.currentReactContext

            if (reactInstance != null) {
                reactInstance
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    ?.emit("onAutomationAlarm", Arguments.createMap().apply {
                        putString("ruleId", ruleId)
                    })
                Log.d(TAG, "Sent JS event for rule: $ruleId")
            } else {
                // App not running — launch it with the ruleId
                Log.d(TAG, "App not running, launching with ruleId: $ruleId")
                val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                    putExtra("automationRuleId", ruleId)
                }
                if (launchIntent != null) {
                    context.startActivity(launchIntent)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error handling alarm", e)
            // Fallback: launch app
            val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                putExtra("automationRuleId", ruleId)
            }
            if (launchIntent != null) {
                context.startActivity(launchIntent)
            }
        }
    }

    private fun rescheduleNext(context: Context, ruleId: String) {
        val prefs = context.getSharedPreferences("automation_alarms", Context.MODE_PRIVATE)
        val interval = prefs.getLong("${ruleId}_interval", 0)
        if (interval <= 0) return // One-shot alarm, no rescheduling

        val nextTrigger = System.currentTimeMillis() + interval
        val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

        val intent = Intent(context, AlarmReceiver::class.java).apply {
            action = "com.agentcab.AUTOMATION_ALARM"
            putExtra("ruleId", ruleId)
        }
        val pi = PendingIntent.getBroadcast(
            context,
            ruleId.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, nextTrigger, pi)
        } else {
            am.setExact(AlarmManager.RTC_WAKEUP, nextTrigger, pi)
        }

        // Update stored trigger time
        prefs.edit().putLong("${ruleId}_trigger", nextTrigger).apply()
    }
}
