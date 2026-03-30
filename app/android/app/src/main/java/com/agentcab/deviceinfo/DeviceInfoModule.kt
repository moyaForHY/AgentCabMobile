package com.agentcab.deviceinfo

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.location.LocationManager
import android.media.AudioManager
import android.net.wifi.WifiManager
import android.os.BatteryManager
import android.os.Build
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule

@ReactModule(name = DeviceInfoModule.NAME)
class DeviceInfoModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object { const val NAME = "DeviceInfoManager" }
    override fun getName(): String = NAME

    @ReactMethod
    fun getBatteryInfo(promise: Promise) {
        try {
            val filter = IntentFilter(Intent.ACTION_BATTERY_CHANGED)
            val batteryStatus = reactApplicationContext.registerReceiver(null, filter)

            val level = batteryStatus?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
            val scale = batteryStatus?.getIntExtra(BatteryManager.EXTRA_SCALE, 100) ?: 100
            val plugged = batteryStatus?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
            val isCharging = plugged == BatteryManager.BATTERY_STATUS_CHARGING ||
                    plugged == BatteryManager.BATTERY_STATUS_FULL

            val percentage = if (scale > 0) (level * 100) / scale else -1

            val result = WritableNativeMap().apply {
                putInt("level", percentage)
                putBoolean("isCharging", isCharging)
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("BATTERY_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun getLocation(promise: Promise) {
        try {
            val locationManager = reactApplicationContext.getSystemService(Context.LOCATION_SERVICE) as LocationManager

            // Try to get last known location from any provider
            val providers = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER, LocationManager.PASSIVE_PROVIDER)

            for (provider in providers) {
                try {
                    @Suppress("MissingPermission")
                    val loc = locationManager.getLastKnownLocation(provider)
                    if (loc != null) {
                        val result = WritableNativeMap().apply {
                            putDouble("latitude", loc.latitude)
                            putDouble("longitude", loc.longitude)
                            putDouble("accuracy", loc.accuracy.toDouble())
                        }
                        promise.resolve(result)
                        return
                    }
                } catch (_: SecurityException) {
                    continue
                }
            }

            // No cached location available
            promise.resolve(WritableNativeMap().apply {
                putDouble("latitude", 0.0)
                putDouble("longitude", 0.0)
                putDouble("accuracy", -1.0)
            })
        } catch (e: Exception) {
            promise.reject("LOCATION_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun getWifiInfo(promise: Promise) {
        try {
            val wifiManager = reactApplicationContext.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
            val info = wifiManager.connectionInfo
            val result = WritableNativeMap().apply {
                putString("ssid", info?.ssid?.replace("\"", "") ?: "unknown")
                putString("ip", formatIp(info?.ipAddress ?: 0))
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("WIFI_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun getDeviceInfo(promise: Promise) {
        try {
            val result = WritableNativeMap().apply {
                putString("brand", Build.BRAND)
                putString("model", Build.MODEL)
                putString("osVersion", Build.VERSION.RELEASE)
                putInt("sdkVersion", Build.VERSION.SDK_INT)
                putString("device", Build.DEVICE)
                putString("manufacturer", Build.MANUFACTURER)
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("DEVICE_INFO_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun getMediaPlayingInfo(promise: Promise) {
        try {
            val audioManager = reactApplicationContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            val isPlaying = audioManager.isMusicActive
            val result = WritableNativeMap().apply {
                putBoolean("isPlaying", isPlaying)
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("MEDIA_ERROR", e.message, e)
        }
    }

    private fun formatIp(ip: Int): String {
        return "${ip and 0xFF}.${ip shr 8 and 0xFF}.${ip shr 16 and 0xFF}.${ip shr 24 and 0xFF}"
    }
}
