package com.agentcab.ocr

import android.graphics.Bitmap
import android.os.Build
import android.os.Handler
import android.os.Looper
import com.agentcab.accessibility.AgentAccessibilityService
import com.agentcab.scripting.ScriptOverlayService
import com.equationl.paddleocr4android.CpuPowerMode
import com.equationl.paddleocr4android.OCR
import com.equationl.paddleocr4android.OcrConfig
import com.equationl.paddleocr4android.callback.OcrInitCallback
import com.equationl.paddleocr4android.callback.OcrRunCallback
import com.equationl.paddleocr4android.bean.OcrResult
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule

@ReactModule(name = PaddleOcrModule.NAME)
class PaddleOcrModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "PaddleOcrManager"
    }

    override fun getName(): String = NAME

    private var ocr: OCR? = null
    private var isReady = false

    @ReactMethod
    fun init(promise: Promise) {
        if (isReady) {
            promise.resolve(true)
            return
        }
        try {
            val config = OcrConfig()
            config.modelPath = "models/ocr/paddle"
            config.detModelFilename = "det.nb"
            config.recModelFilename = "rec.nb"
            config.clsModelFilename = "cls.nb"
            config.isDrwwTextPositionBox = false
            config.cpuPowerMode = CpuPowerMode.LITE_POWER_FULL

            val instance = OCR(reactApplicationContext)
            instance.initModel(config, object : OcrInitCallback {
                override fun onSuccess() {
                    ocr = instance
                    isReady = true
                    promise.resolve(true)
                }
                override fun onFail(e: Throwable) {
                    promise.reject("INIT_FAILED", "PaddleOCR init failed: ${e.message}", e)
                }
            })
        } catch (e: Exception) {
            promise.reject("INIT_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun screenshotOcr(promise: Promise) {
        if (!isReady || ocr == null) {
            promise.reject("NOT_READY", "PaddleOCR not initialized. Call init() first.")
            return
        }
        if (!AgentAccessibilityService.isRunning()) {
            promise.reject("NOT_ENABLED", "Accessibility service is not enabled")
            return
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            promise.reject("UNSUPPORTED", "Screenshot requires Android 11+")
            return
        }

        // 优先用锁定帧
        synchronized(com.agentcab.cv.CvModule.bitmapLock) {
            val locked = com.agentcab.cv.CvModule.sharedLockedBitmap
            if (locked != null && !locked.isRecycled) {
                try {
                    val copy = locked.copy(locked.config ?: Bitmap.Config.ARGB_8888, false)
                    if (copy != null) { runPaddleOcr(copy, promise); return }
                } catch (_: Exception) {}
            }
            // 其次用感知循环的共享帧（不截图、不闪烁）
            val shared = com.agentcab.cv.CvModule.sharedLatestBitmap
            if (shared != null && !shared.isRecycled && System.currentTimeMillis() - com.agentcab.cv.CvModule.sharedLatestTs < 4000) {
                try {
                    val copy = shared.copy(shared.config ?: Bitmap.Config.ARGB_8888, false)
                    if (copy != null) { runPaddleOcr(copy, promise); return }
                } catch (_: Exception) {}
            }
        }
        // 否则自己截图
        val mainHandler = Handler(Looper.getMainLooper())
        mainHandler.post { ScriptOverlayService.setVisible(false) }
        mainHandler.postDelayed({
            AgentAccessibilityService.takeScreenshot { bitmap ->
                mainHandler.post { ScriptOverlayService.setVisible(true) }
                if (bitmap == null) {
                    promise.reject("SCREENSHOT_FAILED", "Could not take screenshot")
                    return@takeScreenshot
                }
                runPaddleOcr(bitmap, promise)
            }
        }, 100)
    }

    @ReactMethod
    fun screenshotBase64(promise: Promise) {
        if (!AgentAccessibilityService.isRunning()) {
            promise.reject("NOT_ENABLED", "Accessibility service is not enabled")
            return
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            promise.reject("UNSUPPORTED", "Screenshot requires Android 11+")
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

    /**
     * 区域 OCR — 截图后只对指定矩形区域做 OCR
     * 坐标为像素值（截图原始分辨率）
     */
    @ReactMethod
    fun ocrRegion(x: Int, y: Int, width: Int, height: Int, promise: Promise) {
        if (!isReady || ocr == null) {
            promise.reject("NOT_READY", "PaddleOCR not initialized")
            return
        }

        synchronized(com.agentcab.cv.CvModule.bitmapLock) {
            // 优先用锁定帧（lockFrame 锁的那张，保证和 detectElements 用同一张图）
            val locked = com.agentcab.cv.CvModule.sharedLockedBitmap
            if (locked != null && !locked.isRecycled) {
                try {
                    val safeX = x.coerceIn(0, locked.width - 1)
                    val safeY = y.coerceIn(0, locked.height - 1)
                    val safeW = width.coerceAtMost(locked.width - safeX).coerceAtLeast(1)
                    val safeH = height.coerceAtMost(locked.height - safeY).coerceAtLeast(1)
                    val cropped = Bitmap.createBitmap(locked, safeX, safeY, safeW, safeH)
                    runPaddleOcr(cropped, promise)
                    return
                } catch (_: Exception) {}
            }
            // 其次用感知循环的共享帧
            val shared = com.agentcab.cv.CvModule.sharedLatestBitmap
            if (shared != null && !shared.isRecycled && System.currentTimeMillis() - com.agentcab.cv.CvModule.sharedLatestTs < 4000) {
                try {
                    val safeX = x.coerceIn(0, shared.width - 1)
                    val safeY = y.coerceIn(0, shared.height - 1)
                    val safeW = width.coerceAtMost(shared.width - safeX).coerceAtLeast(1)
                    val safeH = height.coerceAtMost(shared.height - safeY).coerceAtLeast(1)
                    val cropped = Bitmap.createBitmap(shared, safeX, safeY, safeW, safeH)
                    runPaddleOcr(cropped, promise)
                    return
                } catch (_: Exception) {}
            }
        }

        if (!AgentAccessibilityService.isRunning() || Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            promise.reject("NOT_AVAILABLE", "Not available")
            return
        }

        // fallback: 自己截图
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
                    val safeX = x.coerceIn(0, bitmap.width - 1)
                    val safeY = y.coerceIn(0, bitmap.height - 1)
                    val safeW = width.coerceAtMost(bitmap.width - safeX).coerceAtLeast(1)
                    val safeH = height.coerceAtMost(bitmap.height - safeY).coerceAtLeast(1)

                    val cropped = Bitmap.createBitmap(bitmap, safeX, safeY, safeW, safeH)
                    bitmap.recycle()
                    runPaddleOcr(cropped, promise)
                } catch (e: Exception) {
                    bitmap.recycle()
                    promise.reject("OCR_REGION_FAILED", e.message, e)
                }
            }
        }, 100)
    }

    @ReactMethod
    fun isAvailable(promise: Promise) {
        promise.resolve(isReady && AgentAccessibilityService.isRunning() &&
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.R)
    }

    private fun runPaddleOcr(bitmap: Bitmap, promise: Promise) {
        ocr!!.run(bitmap, object : OcrRunCallback {
            override fun onSuccess(result: OcrResult) {
                val results = WritableNativeArray()
                val rawResults = result.outputRawResult ?: emptyList()

                for (item in rawResults) {
                    val points = item.points ?: continue
                    if (points.size < 4) continue

                    // points: [topLeft, topRight, bottomRight, bottomLeft]
                    val left = minOf(points[0].x, points[3].x).toInt()
                    val top = minOf(points[0].y, points[1].y).toInt()
                    val right = maxOf(points[1].x, points[2].x).toInt()
                    val bottom = maxOf(points[2].y, points[3].y).toInt()
                    val centerX = (left + right) / 2
                    val centerY = (top + bottom) / 2

                    val text = item.label ?: continue
                    if (text.isBlank()) continue

                    // Sample background color (same approach as ML Kit version)
                    val colorCounts = mutableMapOf<Int, Int>()
                    val charW = if (text.isNotEmpty()) (right - left) / text.length else 20
                    val step = Math.max(1, charW / 4)
                    for (py in top until bottom step step) {
                        for (px in left until right step step) {
                            val sx = px.coerceIn(0, bitmap.width - 1)
                            val sy = py.coerceIn(0, bitmap.height - 1)
                            val p = bitmap.getPixel(sx, sy)
                            val qr = (android.graphics.Color.red(p) / 4) * 4
                            val qg = (android.graphics.Color.green(p) / 4) * 4
                            val qb = (android.graphics.Color.blue(p) / 4) * 4
                            val key = (qr shl 16) or (qg shl 8) or qb
                            colorCounts[key] = (colorCounts[key] ?: 0) + 1
                        }
                    }
                    val majorityKey = colorCounts.maxByOrNull { it.value }?.key ?: 0
                    val bgR = (majorityKey shr 16) and 0xFF
                    val bgG = (majorityKey shr 8) and 0xFF
                    val bgB = majorityKey and 0xFF

                    // 每个字符的估算坐标
                    val chars = WritableNativeArray()
                    val cw = if (text.isNotEmpty()) (right - left).toDouble() / text.length else 0.0
                    for (ci in text.indices) {
                        chars.pushMap(WritableNativeMap().apply {
                            putString("char", text[ci].toString())
                            putInt("x", (left + ci * cw + cw / 2).toInt())
                            putInt("y", centerY)
                            putInt("left", (left + ci * cw).toInt())
                            putInt("right", (left + (ci + 1) * cw).toInt())
                            putInt("top", top)
                            putInt("bottom", bottom)
                        })
                    }

                    val map = WritableNativeMap().apply {
                        putString("text", text)
                        putInt("left", left)
                        putInt("top", top)
                        putInt("right", right)
                        putInt("bottom", bottom)
                        putInt("centerX", centerX)
                        putInt("centerY", centerY)
                        putDouble("confidence", item.confidence.toDouble())
                        putInt("bgR", bgR)
                        putInt("bgG", bgG)
                        putInt("bgB", bgB)
                        putArray("chars", chars)
                    }
                    results.pushMap(map)
                }
                bitmap.recycle()
                promise.resolve(results)
            }

            override fun onFail(e: Throwable) {
                bitmap.recycle()
                promise.reject("OCR_FAILED", e.message, e)
            }
        })
    }
}
