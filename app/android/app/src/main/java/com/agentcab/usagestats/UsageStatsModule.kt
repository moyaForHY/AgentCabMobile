package com.agentcab.usagestats

import android.app.AppOpsManager
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Process
import android.provider.Settings
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import java.text.SimpleDateFormat
import java.util.*

@ReactModule(name = UsageStatsModule.NAME)
class UsageStatsModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "UsageStatsManager"
    }

    override fun getName(): String = NAME

    /** Check if usage stats permission is granted */
    @ReactMethod
    fun isPermissionGranted(promise: Promise) {
        try {
            val appOps = reactApplicationContext.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
            val mode = appOps.checkOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS,
                Process.myUid(),
                reactApplicationContext.packageName
            )
            promise.resolve(mode == AppOpsManager.MODE_ALLOWED)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    /** Open usage access settings page */
    @ReactMethod
    fun requestPermission(promise: Promise) {
        try {
            val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            reactApplicationContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("USAGE_STATS_ERROR", e.message, e)
        }
    }

    /** Get usage stats for a time range */
    @ReactMethod
    fun getUsageStats(days: Int, promise: Promise) {
        try {
            val usm = reactApplicationContext.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
            val pm = reactApplicationContext.packageManager

            val endTime = System.currentTimeMillis()
            val startTime = endTime - days.toLong() * 24 * 60 * 60 * 1000

            val stats = usm.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, startTime, endTime)

            if (stats == null || stats.isEmpty()) {
                promise.resolve(WritableNativeArray())
                return
            }

            // Group by package, sum up time
            val appMap = mutableMapOf<String, Long>()
            val lastUsedMap = mutableMapOf<String, Long>()

            for (s in stats) {
                if (s.totalTimeInForeground > 0) {
                    appMap[s.packageName] = (appMap[s.packageName] ?: 0) + s.totalTimeInForeground
                    val prev = lastUsedMap[s.packageName] ?: 0
                    if (s.lastTimeUsed > prev) lastUsedMap[s.packageName] = s.lastTimeUsed
                }
            }

            // Sort by usage time descending, take top 30
            val sorted = appMap.entries.sortedByDescending { it.value }.take(30)

            val result = WritableNativeArray()
            val dateFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
                timeZone = TimeZone.getTimeZone("UTC")
            }

            for (entry in sorted) {
                val appName = try {
                    val appInfo = pm.getApplicationInfo(entry.key, 0)
                    pm.getApplicationLabel(appInfo).toString()
                } catch (_: PackageManager.NameNotFoundException) {
                    entry.key
                }

                val map = WritableNativeMap().apply {
                    putString("packageName", entry.key)
                    putString("appName", appName)
                    putDouble("totalMinutes", entry.value / 60000.0)
                    putString("lastUsed", dateFormat.format(Date(lastUsedMap[entry.key] ?: 0)))
                }
                result.pushMap(map)
            }

            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("USAGE_STATS_ERROR", e.message, e)
        }
    }

    /** Get daily breakdown for the past N days */
    @ReactMethod
    fun getDailyBreakdown(days: Int, promise: Promise) {
        try {
            val usm = reactApplicationContext.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager

            val endTime = System.currentTimeMillis()
            val startTime = endTime - days.toLong() * 24 * 60 * 60 * 1000

            val stats = usm.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, startTime, endTime)

            if (stats == null || stats.isEmpty()) {
                promise.resolve(WritableNativeArray())
                return
            }

            // Group by day
            val cal = Calendar.getInstance()
            val dayFormat = SimpleDateFormat("yyyy-MM-dd", Locale.US)
            val dayMap = mutableMapOf<String, Long>() // day -> total ms
            val dayAppMap = mutableMapOf<String, MutableMap<String, Long>>() // day -> (pkg -> ms)

            for (s in stats) {
                if (s.totalTimeInForeground > 0) {
                    cal.timeInMillis = s.lastTimeUsed
                    val dayKey = dayFormat.format(cal.time)
                    dayMap[dayKey] = (dayMap[dayKey] ?: 0) + s.totalTimeInForeground

                    val apps = dayAppMap.getOrPut(dayKey) { mutableMapOf() }
                    apps[s.packageName] = (apps[s.packageName] ?: 0) + s.totalTimeInForeground
                }
            }

            val pm = reactApplicationContext.packageManager
            val result = WritableNativeArray()

            for (day in dayMap.keys.sorted()) {
                val dayData = WritableNativeMap().apply {
                    putString("date", day)
                    putDouble("totalMinutes", (dayMap[day] ?: 0) / 60000.0)
                }

                // Top 5 apps for this day
                val topApps = WritableNativeArray()
                val apps = dayAppMap[day]?.entries?.sortedByDescending { it.value }?.take(5)
                apps?.forEach { entry ->
                    val appName = try {
                        val appInfo = pm.getApplicationInfo(entry.key, 0)
                        pm.getApplicationLabel(appInfo).toString()
                    } catch (_: PackageManager.NameNotFoundException) {
                        entry.key
                    }
                    val appMap = WritableNativeMap().apply {
                        putString("packageName", entry.key)
                        putString("appName", appName)
                        putDouble("minutes", entry.value / 60000.0)
                    }
                    topApps.pushMap(appMap)
                }
                dayData.putArray("topApps", topApps)
                result.pushMap(dayData)
            }

            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("USAGE_STATS_ERROR", e.message, e)
        }
    }

    /** Get hourly distribution for today */
    @ReactMethod
    fun getHourlyDistribution(promise: Promise) {
        try {
            val usm = reactApplicationContext.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager

            val cal = Calendar.getInstance()
            cal.set(Calendar.HOUR_OF_DAY, 0)
            cal.set(Calendar.MINUTE, 0)
            cal.set(Calendar.SECOND, 0)
            cal.set(Calendar.MILLISECOND, 0)
            val startTime = cal.timeInMillis
            val endTime = System.currentTimeMillis()

            val events = usm.queryEvents(startTime, endTime)
            val hourlyMinutes = DoubleArray(24)

            var lastForegroundTime = 0L
            var lastPackage = ""

            val event = android.app.usage.UsageEvents.Event()
            while (events.hasNextEvent()) {
                events.getNextEvent(event)
                when (event.eventType) {
                    android.app.usage.UsageEvents.Event.ACTIVITY_RESUMED -> {
                        lastForegroundTime = event.timeStamp
                        lastPackage = event.packageName
                    }
                    android.app.usage.UsageEvents.Event.ACTIVITY_PAUSED -> {
                        if (lastForegroundTime > 0) {
                            val duration = event.timeStamp - lastForegroundTime
                            val hour = Calendar.getInstance().apply { timeInMillis = lastForegroundTime }.get(Calendar.HOUR_OF_DAY)
                            hourlyMinutes[hour] += duration / 60000.0
                            lastForegroundTime = 0
                        }
                    }
                }
            }

            val result = WritableNativeArray()
            for (h in 0..23) {
                val map = WritableNativeMap().apply {
                    putInt("hour", h)
                    putDouble("minutes", hourlyMinutes[h])
                }
                result.pushMap(map)
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("USAGE_STATS_ERROR", e.message, e)
        }
    }
}
