package com.agentcab.deviceinfo

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.database.Cursor
import android.location.LocationManager
import android.media.AudioManager
import android.media.MediaScannerConnection
import android.net.Uri
import android.net.wifi.WifiManager
import android.os.BatteryManager
import android.os.Build
import android.provider.MediaStore
import android.provider.Settings
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

    @ReactMethod
    fun getAudioFiles(limit: Int, promise: Promise) {
        try {
            val audioList = WritableNativeArray()
            val projection = arrayOf(
                MediaStore.Audio.Media.DISPLAY_NAME,
                MediaStore.Audio.Media.DATA,
                MediaStore.Audio.Media.DURATION,
                MediaStore.Audio.Media.SIZE,
                MediaStore.Audio.Media.ARTIST,
                MediaStore.Audio.Media.ALBUM,
                MediaStore.Audio.Media.MIME_TYPE,
            )
            val sortOrder = "${MediaStore.Audio.Media.DATE_ADDED} DESC"
            val cursor: Cursor? = reactApplicationContext.contentResolver.query(
                MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
                projection,
                null,
                null,
                sortOrder
            )
            cursor?.use {
                var count = 0
                while (it.moveToNext() && count < limit) {
                    val item = WritableNativeMap().apply {
                        putString("name", it.getString(it.getColumnIndexOrThrow(MediaStore.Audio.Media.DISPLAY_NAME)) ?: "")
                        putString("path", it.getString(it.getColumnIndexOrThrow(MediaStore.Audio.Media.DATA)) ?: "")
                        putDouble("duration", (it.getLong(it.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION))).toDouble())
                        putDouble("size", (it.getLong(it.getColumnIndexOrThrow(MediaStore.Audio.Media.SIZE))).toDouble())
                        putString("artist", it.getString(it.getColumnIndexOrThrow(MediaStore.Audio.Media.ARTIST)))
                        putString("album", it.getString(it.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM)))
                        putString("mimeType", it.getString(it.getColumnIndexOrThrow(MediaStore.Audio.Media.MIME_TYPE)) ?: "")
                    }
                    audioList.pushMap(item)
                    count++
                }
            }
            promise.resolve(audioList)
        } catch (e: Exception) {
            promise.reject("AUDIO_FILES_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun getVideoFiles(limit: Int, promise: Promise) {
        try {
            val videoList = WritableNativeArray()
            val projection = arrayOf(
                MediaStore.Video.Media.DISPLAY_NAME,
                MediaStore.Video.Media.DATA,
                MediaStore.Video.Media.DURATION,
                MediaStore.Video.Media.SIZE,
                MediaStore.Video.Media.WIDTH,
                MediaStore.Video.Media.HEIGHT,
                MediaStore.Video.Media.MIME_TYPE,
            )
            val sortOrder = "${MediaStore.Video.Media.DATE_ADDED} DESC"
            val cursor: Cursor? = reactApplicationContext.contentResolver.query(
                MediaStore.Video.Media.EXTERNAL_CONTENT_URI,
                projection,
                null,
                null,
                sortOrder
            )
            cursor?.use {
                var count = 0
                while (it.moveToNext() && count < limit) {
                    val item = WritableNativeMap().apply {
                        putString("name", it.getString(it.getColumnIndexOrThrow(MediaStore.Video.Media.DISPLAY_NAME)) ?: "")
                        putString("path", it.getString(it.getColumnIndexOrThrow(MediaStore.Video.Media.DATA)) ?: "")
                        putDouble("duration", (it.getLong(it.getColumnIndexOrThrow(MediaStore.Video.Media.DURATION))).toDouble())
                        putDouble("size", (it.getLong(it.getColumnIndexOrThrow(MediaStore.Video.Media.SIZE))).toDouble())
                        putInt("width", it.getInt(it.getColumnIndexOrThrow(MediaStore.Video.Media.WIDTH)))
                        putInt("height", it.getInt(it.getColumnIndexOrThrow(MediaStore.Video.Media.HEIGHT)))
                        putString("mimeType", it.getString(it.getColumnIndexOrThrow(MediaStore.Video.Media.MIME_TYPE)) ?: "")
                    }
                    videoList.pushMap(item)
                    count++
                }
            }
            promise.resolve(videoList)
        } catch (e: Exception) {
            promise.reject("VIDEO_FILES_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun getBluetoothInfo(promise: Promise) {
        try {
            val bluetoothManager = reactApplicationContext.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
            val adapter: BluetoothAdapter? = bluetoothManager?.adapter

            if (adapter == null) {
                promise.resolve(WritableNativeMap().apply {
                    putBoolean("enabled", false)
                    putArray("pairedDevices", WritableNativeArray())
                })
                return
            }

            val result = WritableNativeMap()
            result.putBoolean("enabled", adapter.isEnabled)

            val pairedDevices = WritableNativeArray()
            try {
                @Suppress("MissingPermission")
                val bonded = adapter.bondedDevices
                bonded?.forEach { device: BluetoothDevice ->
                    @Suppress("MissingPermission")
                    val deviceMap = WritableNativeMap().apply {
                        putString("name", device.name ?: "Unknown")
                        putString("address", device.address)
                        putInt("type", device.type)
                    }
                    pairedDevices.pushMap(deviceMap)
                }
            } catch (_: SecurityException) {
                // BLUETOOTH_CONNECT permission not granted
            }
            result.putArray("pairedDevices", pairedDevices)
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("BLUETOOTH_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun getBrightness(promise: Promise) {
        try {
            val brightness = Settings.System.getInt(
                reactApplicationContext.contentResolver,
                Settings.System.SCREEN_BRIGHTNESS,
                128
            )
            val brightnessMode = Settings.System.getInt(
                reactApplicationContext.contentResolver,
                Settings.System.SCREEN_BRIGHTNESS_MODE,
                Settings.System.SCREEN_BRIGHTNESS_MODE_MANUAL
            )
            val result = WritableNativeMap().apply {
                putInt("brightness", brightness)
                putBoolean("isAutomatic", brightnessMode == Settings.System.SCREEN_BRIGHTNESS_MODE_AUTOMATIC)
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("BRIGHTNESS_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun getVolumeInfo(promise: Promise) {
        try {
            val audioManager = reactApplicationContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            val result = WritableNativeMap().apply {
                putInt("media", audioManager.getStreamVolume(AudioManager.STREAM_MUSIC))
                putInt("ring", audioManager.getStreamVolume(AudioManager.STREAM_RING))
                putInt("notification", audioManager.getStreamVolume(AudioManager.STREAM_NOTIFICATION))
                putInt("alarm", audioManager.getStreamVolume(AudioManager.STREAM_ALARM))
                putInt("maxMedia", audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC))
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("VOLUME_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun setBrightness(level: Int, promise: Promise) {
        try {
            val ctx = reactApplicationContext
            if (!Settings.System.canWrite(ctx)) {
                // Open system settings to grant WRITE_SETTINGS permission
                val intent = Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS).apply {
                    data = Uri.parse("package:${ctx.packageName}")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                ctx.startActivity(intent)
                promise.reject("WRITE_SETTINGS_REQUIRED", "Please grant 'Modify system settings' permission and try again.")
                return
            }
            val clamped = level.coerceIn(0, 255)
            // Switch to manual brightness mode
            Settings.System.putInt(
                ctx.contentResolver,
                Settings.System.SCREEN_BRIGHTNESS_MODE,
                Settings.System.SCREEN_BRIGHTNESS_MODE_MANUAL
            )
            Settings.System.putInt(
                ctx.contentResolver,
                Settings.System.SCREEN_BRIGHTNESS,
                clamped
            )
            promise.resolve(clamped)
        } catch (e: Exception) {
            promise.reject("BRIGHTNESS_SET_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun setVolume(stream: String, level: Int, promise: Promise) {
        try {
            val audioManager = reactApplicationContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            val streamType = when (stream) {
                "media" -> AudioManager.STREAM_MUSIC
                "ring" -> AudioManager.STREAM_RING
                "notification" -> AudioManager.STREAM_NOTIFICATION
                "alarm" -> AudioManager.STREAM_ALARM
                else -> AudioManager.STREAM_MUSIC
            }
            val maxVol = audioManager.getStreamMaxVolume(streamType)
            val clamped = level.coerceIn(0, maxVol)
            audioManager.setStreamVolume(streamType, clamped, 0)
            promise.resolve(clamped)
        } catch (e: Exception) {
            promise.reject("VOLUME_SET_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun scanFile(path: String, promise: Promise) {
        try {
            MediaScannerConnection.scanFile(
                reactApplicationContext,
                arrayOf(path),
                null
            ) { scannedPath, uri ->
                val result = WritableNativeMap().apply {
                    putString("path", scannedPath)
                    putString("uri", uri?.toString() ?: "")
                }
                promise.resolve(result)
            }
        } catch (e: Exception) {
            promise.reject("SCAN_FILE_ERROR", e.message, e)
        }
    }

    private fun formatIp(ip: Int): String {
        return "${ip and 0xFF}.${ip shr 8 and 0xFF}.${ip shr 16 and 0xFF}.${ip shr 24 and 0xFF}"
    }
}
