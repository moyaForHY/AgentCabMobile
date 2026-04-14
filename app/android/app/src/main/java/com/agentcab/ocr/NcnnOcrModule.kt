package com.agentcab.ocr

import android.graphics.Bitmap
import android.os.Build
import android.os.Handler
import android.os.Looper
import com.agentcab.accessibility.AgentAccessibilityService
import com.agentcab.scripting.ScriptOverlayService
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule

/**
 * NCnn-based PP-OCRv5 module.
 * Keeps same module name "PaddleOcrManager" and same method signatures
 * so bridge.ts and interpreter.ts don't need changes.
 */
@ReactModule(name = NcnnOcrModule.NAME)
class NcnnOcrModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "PaddleOcrManager"  // Same name as old module for compatibility
    }

    override fun getName(): String = NAME

    private var initialized = false

    // Native methods
    private external fun nativeInit(assetManager: android.content.res.AssetManager): Boolean
    private external fun nativeOcr(bitmap: Bitmap): String
    private external fun nativeOcrRegion(bitmap: Bitmap, x: Int, y: Int, w: Int, h: Int): String
    private external fun nativeRelease()

    init {
        try {
            System.loadLibrary("ncnn_ocr")
        } catch (e: UnsatisfiedLinkError) {
            android.util.Log.e(NAME, "Failed to load ncnn_ocr: ${e.message}")
        }
    }

    @ReactMethod
    fun init(promise: Promise) {
        try {
            if (!initialized) {
                val mgr = reactApplicationContext.assets
                initialized = nativeInit(mgr)
            }
            promise.resolve(initialized)
        } catch (e: Exception) {
            promise.reject("INIT_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun isAvailable(promise: Promise) {
        promise.resolve(initialized)
    }

    @ReactMethod
    fun screenshotOcr(promise: Promise) {
        if (!initialized) {
            promise.reject("NOT_READY", "OCR not initialized")
            return
        }
        if (!AgentAccessibilityService.isRunning() || Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            promise.reject("NOT_AVAILABLE", "Accessibility not available")
            return
        }

        // Try shared frame first
        val shared = com.agentcab.cv.CvModule.sharedLockedBitmap
            ?: if (System.currentTimeMillis() - com.agentcab.cv.CvModule.sharedLatestTs < 4000)
                com.agentcab.cv.CvModule.sharedLatestBitmap else null

        if (shared != null && !shared.isRecycled) {
            synchronized(com.agentcab.cv.CvModule.bitmapLock) {
                try {
                    val copy = shared.copy(shared.config ?: Bitmap.Config.ARGB_8888, false)
                    if (copy != null) {
                        val json = nativeOcr(copy)
                        val results = parseJsonToArray(json, copy)
                        copy.recycle()
                        promise.resolve(results)
                        return
                    }
                } catch (_: Exception) {}
            }
        }

        // Fallback: take screenshot
        val mainHandler = Handler(Looper.getMainLooper())
        mainHandler.post { ScriptOverlayService.setVisible(false) }
        mainHandler.postDelayed({
            AgentAccessibilityService.takeScreenshot { bitmap ->
                mainHandler.post { ScriptOverlayService.setVisible(true) }
                if (bitmap == null) {
                    promise.reject("SCREENSHOT_FAILED", "Could not take screenshot")
                    return@takeScreenshot
                }
                try {
                    val json = nativeOcr(bitmap)
                    val results = parseJsonToArray(json, bitmap)
                    bitmap.recycle()
                    promise.resolve(results)
                } catch (e: Exception) {
                    promise.reject("OCR_ERROR", e.message, e)
                }
            }
        }, 100)
    }

    @ReactMethod
    fun ocrRegion(x: Int, y: Int, width: Int, height: Int, promise: Promise) {
        if (!initialized) {
            promise.reject("NOT_READY", "OCR not initialized")
            return
        }

        // Try shared/locked frame
        synchronized(com.agentcab.cv.CvModule.bitmapLock) {
            val bmp = com.agentcab.cv.CvModule.sharedLockedBitmap
                ?: if (System.currentTimeMillis() - com.agentcab.cv.CvModule.sharedLatestTs < 4000)
                    com.agentcab.cv.CvModule.sharedLatestBitmap else null

            if (bmp != null && !bmp.isRecycled) {
                try {
                    val copy = bmp.copy(bmp.config ?: Bitmap.Config.ARGB_8888, false)
                    if (copy != null) {
                        val json = nativeOcrRegion(copy, x, y, width, height)
                        val results = parseJsonToArray(json, copy)
                        copy.recycle()
                        promise.resolve(results)
                        return
                    }
                } catch (_: Exception) {}
            }
        }

        // Fallback: take screenshot
        if (!AgentAccessibilityService.isRunning() || Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            promise.reject("NOT_AVAILABLE", "Not available")
            return
        }
        val mainHandler = Handler(Looper.getMainLooper())
        mainHandler.post { ScriptOverlayService.setVisible(false) }
        mainHandler.postDelayed({
            AgentAccessibilityService.takeScreenshot { bitmap ->
                mainHandler.post { ScriptOverlayService.setVisible(true) }
                if (bitmap == null) {
                    promise.reject("SCREENSHOT_FAILED", "Could not take screenshot")
                    return@takeScreenshot
                }
                try {
                    val json = nativeOcrRegion(bitmap, x, y, width, height)
                    val results = parseJsonToArray(json, bitmap)
                    bitmap.recycle()
                    promise.resolve(results)
                } catch (e: Exception) {
                    promise.reject("OCR_ERROR", e.message, e)
                }
            }
        }, 100)
    }

    @ReactMethod
    fun screenshotBase64(promise: Promise) {
        if (!AgentAccessibilityService.isRunning() || Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            promise.reject("NOT_AVAILABLE", "Not available")
            return
        }
        val mainHandler = Handler(Looper.getMainLooper())
        mainHandler.post { ScriptOverlayService.setVisible(false) }
        mainHandler.postDelayed({
            AgentAccessibilityService.takeScreenshot { bitmap ->
                mainHandler.post { ScriptOverlayService.setVisible(true) }
                if (bitmap == null) {
                    promise.reject("SCREENSHOT_FAILED", "Could not take screenshot")
                    return@takeScreenshot
                }
                val stream = java.io.ByteArrayOutputStream()
                bitmap.compress(android.graphics.Bitmap.CompressFormat.JPEG, 80, stream)
                bitmap.recycle()
                val b64 = android.util.Base64.encodeToString(stream.toByteArray(), android.util.Base64.NO_WRAP)
                promise.resolve(b64)
            }
        }, 100)
    }

    private fun parseJsonToArray(json: String, bitmap: Bitmap? = null): WritableArray {
        val arr = Arguments.createArray()
        try {
            val jsonArr = org.json.JSONArray(json)
            for (i in 0 until jsonArr.length()) {
                val obj = jsonArr.getJSONObject(i)
                val text = obj.getString("text")
                val cx = obj.getInt("centerX")
                val cy = obj.getInt("centerY")
                val w = obj.getInt("width")
                val h = obj.getInt("height")
                val left = (cx - w / 2).coerceAtLeast(0)
                val top = (cy - h / 2).coerceAtLeast(0)
                val right = cx + w / 2
                val bottom = cy + h / 2

                // 背景色采样：区域内均匀采样，量化 4x4，取众数
                var bgR = 255; var bgG = 255; var bgB = 255
                if (bitmap != null && !bitmap.isRecycled && text.isNotEmpty()) {
                    val colorCounts = mutableMapOf<Int, Int>()
                    val charW = if (text.isNotEmpty()) (right - left) / text.length else 20
                    val step = Math.max(1, charW / 4)
                    val bw = bitmap.width; val bh = bitmap.height
                    for (py in top until Math.min(bottom, bh) step step) {
                        for (px in left until Math.min(right, bw) step step) {
                            val p = bitmap.getPixel(px.coerceIn(0, bw - 1), py.coerceIn(0, bh - 1))
                            val qr = (android.graphics.Color.red(p) / 4) * 4
                            val qg = (android.graphics.Color.green(p) / 4) * 4
                            val qb = (android.graphics.Color.blue(p) / 4) * 4
                            val key = (qr shl 16) or (qg shl 8) or qb
                            colorCounts[key] = (colorCounts[key] ?: 0) + 1
                        }
                    }
                    val majorityKey = colorCounts.maxByOrNull { it.value }?.key ?: 0xFFFFFF
                    bgR = (majorityKey shr 16) and 0xFF
                    bgG = (majorityKey shr 8) and 0xFF
                    bgB = majorityKey and 0xFF
                }

                // 字符坐标：按行宽均分
                val chars = Arguments.createArray()
                if (text.isNotEmpty()) {
                    val cw = (right - left).toDouble() / text.length
                    for (ci in text.indices) {
                        chars.pushMap(Arguments.createMap().apply {
                            putString("char", text[ci].toString())
                            putInt("x", (left + ci * cw + cw / 2).toInt())
                            putInt("y", cy)
                            putInt("left", (left + ci * cw).toInt())
                            putInt("right", (left + (ci + 1) * cw).toInt())
                            putInt("top", top)
                            putInt("bottom", bottom)
                        })
                    }
                }

                val map = Arguments.createMap()
                map.putString("text", text)
                map.putInt("left", left)
                map.putInt("top", top)
                map.putInt("right", right)
                map.putInt("bottom", bottom)
                map.putInt("centerX", cx)
                map.putInt("centerY", cy)
                map.putDouble("confidence", obj.getDouble("prob"))
                map.putInt("bgR", bgR)
                map.putInt("bgG", bgG)
                map.putInt("bgB", bgB)
                map.putArray("chars", chars)
                arr.pushMap(map)
            }
        } catch (e: Exception) {
            android.util.Log.e(NAME, "Parse error: ${e.message}")
        }
        return arr
    }
}
