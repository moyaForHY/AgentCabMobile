package com.agentcab.storage

import android.os.Environment
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import java.io.File

@ReactModule(name = StorageScannerModule.NAME)
class StorageScannerModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "StorageScanner"
    }

    override fun getName(): String = NAME

    /**
     * Scan all top-level directories and report sizes.
     * Returns [{name, path, sizeBytes, sizeFormatted}] sorted by size descending.
     */
    @ReactMethod
    fun scanDirectorySizes(promise: Promise) {
        Thread {
            try {
                val root = Environment.getExternalStorageDirectory()
                val dirs = root.listFiles()?.filter { it.isDirectory } ?: emptyList()
                val result = WritableNativeArray()

                for (dir in dirs) {
                    val size = getDirSize(dir)
                    if (size > 1024 * 1024) { // Skip dirs < 1MB
                        val item = WritableNativeMap().apply {
                            putString("name", dir.name)
                            putString("path", dir.absolutePath)
                            putDouble("sizeBytes", size.toDouble())
                            putString("sizeFormatted", formatBytes(size))
                        }
                        result.pushMap(item)
                    }
                }

                promise.resolve(result)
            } catch (e: Exception) {
                promise.reject("SCAN_ERROR", e.message, e)
            }
        }.start()
    }

    /**
     * Scan app cache directories and report sizes.
     * Returns [{packageName, appName, cacheSizeBytes, cacheSizeFormatted}].
     */
    @ReactMethod
    fun scanAppCaches(promise: Promise) {
        Thread {
            try {
                val dataDir = File(Environment.getExternalStorageDirectory(), "Android/data")
                val result = WritableNativeArray()

                if (dataDir.exists() && dataDir.isDirectory) {
                    val appDirs = dataDir.listFiles()?.filter { it.isDirectory } ?: emptyList()
                    for (appDir in appDirs) {
                        val cacheDir = File(appDir, "cache")
                        val totalSize = if (cacheDir.exists()) getDirSize(cacheDir) else 0L
                        // Also check files dir
                        val filesDir = File(appDir, "files")
                        val filesSize = if (filesDir.exists()) getDirSize(filesDir) else 0L
                        val combined = totalSize + filesSize

                        if (combined > 5 * 1024 * 1024) { // > 5MB
                            val item = WritableNativeMap().apply {
                                putString("packageName", appDir.name)
                                putDouble("cacheSizeBytes", combined.toDouble())
                                putString("cacheSizeFormatted", formatBytes(combined))
                                putDouble("cacheOnlyBytes", totalSize.toDouble())
                                putDouble("dataBytes", filesSize.toDouble())
                            }
                            result.pushMap(item)
                        }
                    }
                }

                promise.resolve(result)
            } catch (e: Exception) {
                promise.reject("CACHE_SCAN_ERROR", e.message, e)
            }
        }.start()
    }

    /**
     * Scan known social app storage (WeChat, QQ, Douyin, etc.)
     * Returns detailed breakdown.
     */
    @ReactMethod
    fun scanSocialAppStorage(promise: Promise) {
        Thread {
            try {
                val root = Environment.getExternalStorageDirectory()
                val result = WritableNativeMap()

                // WeChat
                val wechatPaths = listOf(
                    File(root, "Android/data/com.tencent.mm"),
                    File(root, "tencent/MicroMsg"),
                )
                var wechatTotal = 0L
                for (p in wechatPaths) {
                    if (p.exists()) wechatTotal += getDirSize(p)
                }
                result.putMap("wechat", WritableNativeMap().apply {
                    putDouble("sizeBytes", wechatTotal.toDouble())
                    putString("sizeFormatted", formatBytes(wechatTotal))
                    putBoolean("exists", wechatTotal > 0)
                })

                // QQ
                val qqPaths = listOf(
                    File(root, "Android/data/com.tencent.mobileqq"),
                    File(root, "tencent/QQfile_recv"),
                )
                var qqTotal = 0L
                for (p in qqPaths) {
                    if (p.exists()) qqTotal += getDirSize(p)
                }
                result.putMap("qq", WritableNativeMap().apply {
                    putDouble("sizeBytes", qqTotal.toDouble())
                    putString("sizeFormatted", formatBytes(qqTotal))
                    putBoolean("exists", qqTotal > 0)
                })

                // Douyin / TikTok
                val douyinPaths = listOf(
                    File(root, "Android/data/com.ss.android.ugc.aweme"),
                    File(root, "Android/data/com.zhiliaoapp.musically"),
                )
                var douyinTotal = 0L
                for (p in douyinPaths) {
                    if (p.exists()) douyinTotal += getDirSize(p)
                }
                result.putMap("douyin", WritableNativeMap().apply {
                    putDouble("sizeBytes", douyinTotal.toDouble())
                    putString("sizeFormatted", formatBytes(douyinTotal))
                    putBoolean("exists", douyinTotal > 0)
                })

                // Xiaohongshu
                val xhsSize = getDirSafe(File(root, "Android/data/com.xingin.xhs"))
                result.putMap("xiaohongshu", WritableNativeMap().apply {
                    putDouble("sizeBytes", xhsSize.toDouble())
                    putString("sizeFormatted", formatBytes(xhsSize))
                    putBoolean("exists", xhsSize > 0)
                })

                // Bilibili
                val biliSize = getDirSafe(File(root, "Android/data/tv.danmaku.bili"))
                result.putMap("bilibili", WritableNativeMap().apply {
                    putDouble("sizeBytes", biliSize.toDouble())
                    putString("sizeFormatted", formatBytes(biliSize))
                    putBoolean("exists", biliSize > 0)
                })

                // Weibo
                val weiboSize = getDirSafe(File(root, "Android/data/com.sina.weibo"))
                result.putMap("weibo", WritableNativeMap().apply {
                    putDouble("sizeBytes", weiboSize.toDouble())
                    putString("sizeFormatted", formatBytes(weiboSize))
                    putBoolean("exists", weiboSize > 0)
                })

                promise.resolve(result)
            } catch (e: Exception) {
                promise.reject("SOCIAL_SCAN_ERROR", e.message, e)
            }
        }.start()
    }

    /**
     * Get photo statistics: burst detection, type breakdown.
     * Analyzes photo timestamps to find bursts (photos taken within 3 seconds).
     */
    @ReactMethod
    fun analyzePhotoBursts(timestamps: ReadableArray, promise: Promise) {
        try {
            val times = mutableListOf<Long>()
            for (i in 0 until timestamps.size()) {
                times.add(timestamps.getDouble(i).toLong())
            }
            times.sort()

            val bursts = WritableNativeArray()
            var burstStart = 0
            var i = 1

            while (i < times.size) {
                if (times[i] - times[i - 1] <= 3) { // Within 3 seconds
                    // Continue burst
                } else {
                    if (i - burstStart >= 3) { // Burst of 3+ photos
                        val burst = WritableNativeMap().apply {
                            putInt("startIndex", burstStart)
                            putInt("endIndex", i - 1)
                            putInt("count", i - burstStart)
                            putDouble("startTime", times[burstStart].toDouble())
                            putInt("deletable", i - burstStart - 1) // Keep 1, delete rest
                        }
                        bursts.pushMap(burst)
                    }
                    burstStart = i
                }
                i++
            }
            // Check last burst
            if (i - burstStart >= 3) {
                val burst = WritableNativeMap().apply {
                    putInt("startIndex", burstStart)
                    putInt("endIndex", i - 1)
                    putInt("count", i - burstStart)
                    putDouble("startTime", times[burstStart].toDouble())
                    putInt("deletable", i - burstStart - 1)
                }
                bursts.pushMap(burst)
            }

            var totalDeletable = 0
            for (j in 0 until bursts.size()) {
                totalDeletable += bursts.getMap(j)?.getInt("deletable") ?: 0
            }

            val result = WritableNativeMap().apply {
                putArray("bursts", bursts)
                putInt("totalBursts", bursts.size())
                putInt("totalDeletable", totalDeletable)
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("BURST_ERROR", e.message, e)
        }
    }

    private fun getDirSize(dir: File): Long {
        var size = 0L
        try {
            dir.walkTopDown().forEach { file ->
                if (file.isFile) size += file.length()
            }
        } catch (_: Exception) {}
        return size
    }

    private fun getDirSafe(dir: File): Long {
        return if (dir.exists()) getDirSize(dir) else 0L
    }

    private fun formatBytes(bytes: Long): String {
        if (bytes < 1024) return "$bytes B"
        val kb = bytes / 1024.0
        if (kb < 1024) return String.format("%.1f KB", kb)
        val mb = kb / 1024.0
        if (mb < 1024) return String.format("%.1f MB", mb)
        val gb = mb / 1024.0
        return String.format("%.1f GB", gb)
    }
}
