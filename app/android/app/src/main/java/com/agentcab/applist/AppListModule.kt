package com.agentcab.applist

import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule

@ReactModule(name = AppListModule.NAME)
class AppListModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object { const val NAME = "AppListManager" }
    override fun getName(): String = NAME

    @ReactMethod
    fun getInstalledApps(includeSystem: Boolean, promise: Promise) {
        try {
            val pm = reactApplicationContext.packageManager
            val apps = pm.getInstalledApplications(PackageManager.GET_META_DATA)
            val result = WritableNativeArray()

            for (app in apps) {
                if (!includeSystem && (app.flags and ApplicationInfo.FLAG_SYSTEM) != 0) continue
                val item = WritableNativeMap().apply {
                    putString("packageName", app.packageName)
                    putString("name", pm.getApplicationLabel(app).toString())
                    putBoolean("isSystem", (app.flags and ApplicationInfo.FLAG_SYSTEM) != 0)
                }
                result.pushMap(item)
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("APP_LIST_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun isAppInstalled(packageName: String, promise: Promise) {
        try {
            reactApplicationContext.packageManager.getPackageInfo(packageName, 0)
            promise.resolve(true)
        } catch (e: PackageManager.NameNotFoundException) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun launchApp(packageName: String, promise: Promise) {
        try {
            val intent = reactApplicationContext.packageManager.getLaunchIntentForPackage(packageName)
            if (intent != null) {
                intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
                reactApplicationContext.startActivity(intent)
                promise.resolve(true)
            } else {
                promise.reject("NOT_FOUND", "App not found: $packageName")
            }
        } catch (e: Exception) {
            promise.reject("LAUNCH_ERROR", e.message, e)
        }
    }
}
