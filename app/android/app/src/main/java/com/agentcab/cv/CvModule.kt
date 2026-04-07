package com.agentcab.cv

import android.graphics.Bitmap
import android.os.Build
import android.os.Handler
import android.os.Looper
import com.agentcab.accessibility.AgentAccessibilityService
import com.agentcab.scripting.ScriptOverlayService
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import org.opencv.android.OpenCVLoader
import org.opencv.android.Utils
import org.opencv.core.*
import org.opencv.imgproc.Imgproc
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread

@ReactModule(name = CvModule.NAME)
class CvModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "CvManager"
        private var openCvLoaded = false
    }

    override fun getName(): String = NAME

    private fun ensureOpenCv(): Boolean {
        if (!openCvLoaded) {
            openCvLoaded = OpenCVLoader.initLocal()
        }
        return openCvLoaded
    }

    private fun takeScreenshotSync(callback: (Bitmap?) -> Unit) {
        // 如果帧已锁定，返回锁定帧的副本
        if (frameLocked.get() && lockedBitmap != null) {
            callback(lockedBitmap!!.copy(lockedBitmap!!.config ?: Bitmap.Config.ARGB_8888, false))
            return
        }
        val mainHandler = Handler(Looper.getMainLooper())
        mainHandler.post { ScriptOverlayService.setVisible(false) }
        mainHandler.postDelayed({
            AgentAccessibilityService.takeScreenshot { bitmap ->
                mainHandler.post { ScriptOverlayService.setVisible(true) }
                callback(bitmap)
            }
        }, 100)
    }

    // ═══════════════════════════════════════
    // 截图共享 (Frame Lock)
    // ═══════════════════════════════════════

    @Volatile private var lockedBitmap: Bitmap? = null
    private val frameLocked = AtomicBoolean(false)

    /**
     * 锁定当前帧 — 截一次图，后续所有 CV 操作共用这张
     */
    @ReactMethod
    fun lockFrame(promise: Promise) {
        if (!AgentAccessibilityService.isRunning() || Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            promise.resolve(false); return
        }
        takeScreenshotSync { bitmap ->
            if (bitmap == null) { promise.resolve(false); return@takeScreenshotSync }
            lockedBitmap?.recycle()
            lockedBitmap = bitmap
            frameLocked.set(true)
            promise.resolve(true)
        }
    }

    /**
     * 解锁帧 — 后续 CV 操作重新截图
     */
    @ReactMethod
    fun unlockFrame(promise: Promise) {
        frameLocked.set(false)
        lockedBitmap?.recycle()
        lockedBitmap = null
        promise.resolve(true)
    }

    // ═══════════════════════════════════════
    // 持续感知循环 (Perception Loop)
    // ═══════════════════════════════════════

    private val scanning = AtomicBoolean(false)
    private var scanThread: Thread? = null
    private var scanIntervalMs = 500L

    // 实时状态 — 脚本可随时读取
    @Volatile var perceptionState = PerceptionState()

    data class PerceptionState(
        var ssim: Double = 0.0,
        var isStable: Boolean = false,
        var hasChanged: Boolean = false,
        var changeCount: Int = 0,        // 连续变化帧数
        var stableCount: Int = 0,        // 连续稳定帧数
        var frameCount: Long = 0,
        var lastUpdateMs: Long = 0,
    )

    /**
     * 启动持续感知循环
     * intervalMs: 扫描间隔（默认 500ms）
     * stableThreshold: SSIM 高于此值认为稳定（默认 0.95）
     */
    @ReactMethod
    fun startPerception(intervalMs: Int, stableThreshold: Double, promise: Promise) {
        if (!ensureOpenCv()) { promise.reject("OPENCV_FAILED", "OpenCV init failed"); return }
        if (scanning.get()) { promise.resolve(true); return }

        scanIntervalMs = intervalMs.toLong()
        scanning.set(true)

        scanThread = thread(name = "CvPerception", isDaemon = true) {
            var prevFrame: Mat? = null

            while (scanning.get()) {
                try {
                    if (!AgentAccessibilityService.isRunning() || Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
                        Thread.sleep(scanIntervalMs)
                        continue
                    }

                    // 截图（同步等待）
                    var bitmap: Bitmap? = null
                    val latch = java.util.concurrent.CountDownLatch(1)
                    val mainHandler = Handler(Looper.getMainLooper())
                    mainHandler.post { ScriptOverlayService.setVisible(false) }
                    mainHandler.postDelayed({
                        AgentAccessibilityService.takeScreenshot { bmp ->
                            mainHandler.post { ScriptOverlayService.setVisible(true) }
                            bitmap = bmp
                            latch.countDown()
                        }
                    }, 50)
                    latch.await(2, java.util.concurrent.TimeUnit.SECONDS)

                    val bmp = bitmap ?: continue

                    // 转灰度并缩小
                    val current = Mat()
                    Utils.bitmapToMat(bmp, current)
                    bmp.recycle()
                    Imgproc.cvtColor(current, current, Imgproc.COLOR_RGBA2GRAY)
                    val small = Mat()
                    Imgproc.resize(current, small, Size(current.cols() / 4.0, current.rows() / 4.0))
                    current.release()

                    if (prevFrame != null) {
                        val score = computeSSIM(prevFrame!!, small)
                        val stable = score > stableThreshold

                        perceptionState = perceptionState.copy(
                            ssim = score,
                            isStable = stable,
                            hasChanged = !stable,
                            changeCount = if (!stable) perceptionState.changeCount + 1 else 0,
                            stableCount = if (stable) perceptionState.stableCount + 1 else 0,
                            frameCount = perceptionState.frameCount + 1,
                            lastUpdateMs = System.currentTimeMillis(),
                        )
                        prevFrame!!.release()
                    } else {
                        perceptionState = perceptionState.copy(
                            frameCount = 1,
                            lastUpdateMs = System.currentTimeMillis(),
                        )
                    }
                    prevFrame = small

                    Thread.sleep(scanIntervalMs)
                } catch (e: InterruptedException) {
                    break
                } catch (e: Exception) {
                    Thread.sleep(scanIntervalMs)
                }
            }
            prevFrame?.release()
        }
        promise.resolve(true)
    }

    /**
     * 停止持续感知循环
     */
    @ReactMethod
    fun stopPerception(promise: Promise) {
        scanning.set(false)
        scanThread?.interrupt()
        scanThread = null
        promise.resolve(true)
    }

    /**
     * 读取当前感知状态
     */
    @ReactMethod
    fun getPerception(promise: Promise) {
        val s = perceptionState
        promise.resolve(WritableNativeMap().apply {
            putDouble("ssim", s.ssim)
            putBoolean("isStable", s.isStable)
            putBoolean("hasChanged", s.hasChanged)
            putInt("changeCount", s.changeCount)
            putInt("stableCount", s.stableCount)
            putDouble("frameCount", s.frameCount.toDouble())
            putDouble("lastUpdateMs", s.lastUpdateMs.toDouble())
        })
    }

    // ═══════════════════════════════════════
    // 单次调用 API（兼容旧脚本）
    // ═══════════════════════════════════════

    private var lastFrame: Mat? = null

    @ReactMethod
    fun ssim(promise: Promise) {
        if (!ensureOpenCv()) {
            promise.reject("OPENCV_FAILED", "OpenCV init failed")
            return
        }
        if (!AgentAccessibilityService.isRunning() || Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            promise.reject("NOT_AVAILABLE", "Accessibility or Android version not supported")
            return
        }

        takeScreenshotSync { bitmap ->
            if (bitmap == null) {
                promise.reject("SCREENSHOT_FAILED", "Could not take screenshot")
                return@takeScreenshotSync
            }
            val current = Mat()
            Utils.bitmapToMat(bitmap, current)
            bitmap.recycle()
            Imgproc.cvtColor(current, current, Imgproc.COLOR_RGBA2GRAY)
            // 缩小以加速
            val small = Mat()
            Imgproc.resize(current, small, Size(current.cols() / 4.0, current.rows() / 4.0))
            current.release()

            val prev = lastFrame
            lastFrame = small.clone()

            if (prev == null) {
                small.release()
                promise.resolve(0.0) // 第一帧没有对比
                return@takeScreenshotSync
            }

            val score = computeSSIM(prev, small)
            prev.release()
            small.release()
            promise.resolve(score)
        }
    }

    private fun computeSSIM(img1: Mat, img2: Mat): Double {
        val c1 = 6.5025  // (0.01 * 255)^2
        val c2 = 58.5225  // (0.03 * 255)^2

        val i1 = Mat()
        val i2 = Mat()
        img1.convertTo(i1, CvType.CV_64F)
        img2.convertTo(i2, CvType.CV_64F)

        val mu1 = Mat()
        val mu2 = Mat()
        Imgproc.GaussianBlur(i1, mu1, Size(11.0, 11.0), 1.5)
        Imgproc.GaussianBlur(i2, mu2, Size(11.0, 11.0), 1.5)

        val mu1_sq = Mat()
        val mu2_sq = Mat()
        val mu1_mu2 = Mat()
        Core.multiply(mu1, mu1, mu1_sq)
        Core.multiply(mu2, mu2, mu2_sq)
        Core.multiply(mu1, mu2, mu1_mu2)

        val sigma1_sq = Mat()
        val sigma2_sq = Mat()
        val sigma12 = Mat()

        val i1_sq = Mat()
        val i2_sq = Mat()
        val i1_i2 = Mat()
        Core.multiply(i1, i1, i1_sq)
        Core.multiply(i2, i2, i2_sq)
        Core.multiply(i1, i2, i1_i2)

        Imgproc.GaussianBlur(i1_sq, sigma1_sq, Size(11.0, 11.0), 1.5)
        Core.subtract(sigma1_sq, mu1_sq, sigma1_sq)

        Imgproc.GaussianBlur(i2_sq, sigma2_sq, Size(11.0, 11.0), 1.5)
        Core.subtract(sigma2_sq, mu2_sq, sigma2_sq)

        Imgproc.GaussianBlur(i1_i2, sigma12, Size(11.0, 11.0), 1.5)
        Core.subtract(sigma12, mu1_mu2, sigma12)

        // (2*mu1*mu2 + c1) * (2*sigma12 + c2)
        val t1 = Mat()
        val t2 = Mat()
        Core.multiply(mu1_mu2, Scalar(2.0), t1)
        Core.add(t1, Scalar(c1), t1)

        Core.multiply(sigma12, Scalar(2.0), t2)
        Core.add(t2, Scalar(c2), t2)

        val numerator = Mat()
        Core.multiply(t1, t2, numerator)

        // (mu1^2 + mu2^2 + c1) * (sigma1^2 + sigma2^2 + c2)
        Core.add(mu1_sq, mu2_sq, t1)
        Core.add(t1, Scalar(c1), t1)

        Core.add(sigma1_sq, sigma2_sq, t2)
        Core.add(t2, Scalar(c2), t2)

        val denominator = Mat()
        Core.multiply(t1, t2, denominator)

        val ssimMap = Mat()
        Core.divide(numerator, denominator, ssimMap)

        val mean = Core.mean(ssimMap)

        // Cleanup
        listOf(i1, i2, mu1, mu2, mu1_sq, mu2_sq, mu1_mu2, sigma1_sq, sigma2_sq, sigma12,
            i1_sq, i2_sq, i1_i2, t1, t2, numerator, denominator, ssimMap).forEach { it.release() }

        return mean.`val`[0]
    }

    /**
     * 模板匹配 — 在屏幕上找到指定图片的位置
     * templateBase64: 模板图片的 base64
     * 返回 {x, y, confidence, found}
     */
    @ReactMethod
    fun templateMatch(templateBase64: String, threshold: Double, promise: Promise) {
        if (!ensureOpenCv()) {
            promise.reject("OPENCV_FAILED", "OpenCV init failed")
            return
        }

        takeScreenshotSync { bitmap ->
            if (bitmap == null) {
                promise.reject("SCREENSHOT_FAILED", "Could not take screenshot")
                return@takeScreenshotSync
            }
            try {
                // Decode template
                val templateBytes = android.util.Base64.decode(templateBase64, android.util.Base64.DEFAULT)
                val templateBitmap = android.graphics.BitmapFactory.decodeByteArray(templateBytes, 0, templateBytes.size)
                if (templateBitmap == null) {
                    bitmap.recycle()
                    promise.resolve(WritableNativeMap().apply {
                        putInt("x", 0); putInt("y", 0); putDouble("confidence", 0.0); putBoolean("found", false)
                    })
                    return@takeScreenshotSync
                }

                val screen = Mat()
                val template = Mat()
                Utils.bitmapToMat(bitmap, screen)
                Utils.bitmapToMat(templateBitmap, template)
                bitmap.recycle()
                templateBitmap.recycle()

                // Convert to grayscale
                Imgproc.cvtColor(screen, screen, Imgproc.COLOR_RGBA2GRAY)
                Imgproc.cvtColor(template, template, Imgproc.COLOR_RGBA2GRAY)

                val result = Mat()
                Imgproc.matchTemplate(screen, template, result, Imgproc.TM_CCOEFF_NORMED)

                val minMaxLoc = Core.minMaxLoc(result)
                val maxVal = minMaxLoc.maxVal
                val maxLoc = minMaxLoc.maxLoc

                val cx = (maxLoc.x + template.cols() / 2).toInt()
                val cy = (maxLoc.y + template.rows() / 2).toInt()

                screen.release()
                template.release()
                result.release()

                promise.resolve(WritableNativeMap().apply {
                    putInt("x", cx)
                    putInt("y", cy)
                    putDouble("confidence", maxVal)
                    putBoolean("found", maxVal >= threshold)
                })
            } catch (e: Exception) {
                bitmap.recycle()
                promise.reject("MATCH_FAILED", e.message, e)
            }
        }
    }

    /**
     * 屏幕是否稳定 — 连续两帧 SSIM > threshold
     */
    @ReactMethod
    fun isStable(threshold: Double, promise: Promise) {
        if (!ensureOpenCv() || !AgentAccessibilityService.isRunning() || Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            promise.resolve(true)
            return
        }
        takeScreenshotSync { bitmap ->
            if (bitmap == null) { promise.resolve(true); return@takeScreenshotSync }
            val current = Mat()
            Utils.bitmapToMat(bitmap, current)
            bitmap.recycle()
            Imgproc.cvtColor(current, current, Imgproc.COLOR_RGBA2GRAY)
            val small = Mat()
            Imgproc.resize(current, small, Size(current.cols() / 4.0, current.rows() / 4.0))
            current.release()

            val prev = lastFrame
            lastFrame = small.clone()

            if (prev == null) { small.release(); promise.resolve(false); return@takeScreenshotSync }
            val score = computeSSIM(prev, small)
            prev.release()
            small.release()
            promise.resolve(score > threshold)
        }
    }

    /**
     * 轮廓检测 — 找屏幕上的矩形区域（按钮、输入框、卡片等）
     * minArea: 最小面积过滤
     * 返回 [{x, y, width, height, cx, cy}]
     */
    @ReactMethod
    fun findRects(minArea: Int, maxResults: Int, promise: Promise) {
        if (!ensureOpenCv() || !AgentAccessibilityService.isRunning() || Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            promise.resolve(WritableNativeArray())
            return
        }

        takeScreenshotSync { bitmap ->
            if (bitmap == null) {
                promise.resolve(WritableNativeArray())
                return@takeScreenshotSync
            }
            try {
                val src = Mat()
                Utils.bitmapToMat(bitmap, src)
                bitmap.recycle()

                // 灰度 + 边缘检测
                val gray = Mat()
                Imgproc.cvtColor(src, gray, Imgproc.COLOR_RGBA2GRAY)
                val edges = Mat()
                Imgproc.Canny(gray, edges, 50.0, 150.0)

                // 膨胀以连接断开的边缘
                val kernel = Imgproc.getStructuringElement(Imgproc.MORPH_RECT, Size(3.0, 3.0))
                Imgproc.dilate(edges, edges, kernel)

                // 找轮廓
                val contours = mutableListOf<MatOfPoint>()
                val hierarchy = Mat()
                Imgproc.findContours(edges, contours, hierarchy, Imgproc.RETR_EXTERNAL, Imgproc.CHAIN_APPROX_SIMPLE)

                // 筛选矩形
                data class RectInfo(val x: Int, val y: Int, val w: Int, val h: Int, val area: Int)
                val rects = mutableListOf<RectInfo>()

                for (contour in contours) {
                    val rect = Imgproc.boundingRect(contour)
                    val area = rect.width * rect.height
                    if (area < minArea) continue
                    // 过滤过扁/过窄的
                    val ratio = rect.width.toDouble() / rect.height.toDouble()
                    if (ratio < 0.1 || ratio > 15) continue
                    rects.add(RectInfo(rect.x, rect.y, rect.width, rect.height, area))
                }

                // 按面积排序，取前 N 个
                rects.sortByDescending { it.area }
                val results = WritableNativeArray()
                for (r in rects.take(maxResults)) {
                    results.pushMap(WritableNativeMap().apply {
                        putInt("x", r.x)
                        putInt("y", r.y)
                        putInt("width", r.w)
                        putInt("height", r.h)
                        putInt("cx", r.x + r.w / 2)
                        putInt("cy", r.y + r.h / 2)
                        putInt("area", r.area)
                    })
                }

                src.release(); gray.release(); edges.release(); hierarchy.release(); kernel.release()
                contours.forEach { it.release() }

                promise.resolve(results)
            } catch (e: Exception) {
                promise.reject("RECT_FAILED", e.message, e)
            }
        }
    }

    /**
     * 区域颜色分析 — 分析指定区域的主色调
     * 返回 {r, g, b, isGreen, isWhite, isGray}
     */
    @ReactMethod
    fun regionColor(x: Int, y: Int, width: Int, height: Int, promise: Promise) {
        if (!ensureOpenCv() || !AgentAccessibilityService.isRunning() || Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            promise.resolve(WritableNativeMap().apply {
                putInt("r", 0); putInt("g", 0); putInt("b", 0)
                putBoolean("isGreen", false); putBoolean("isWhite", false); putBoolean("isGray", false)
            })
            return
        }

        takeScreenshotSync { bitmap ->
            if (bitmap == null) {
                promise.resolve(WritableNativeMap().apply {
                    putInt("r", 0); putInt("g", 0); putInt("b", 0)
                    putBoolean("isGreen", false); putBoolean("isWhite", false); putBoolean("isGray", false)
                })
                return@takeScreenshotSync
            }
            try {
                val mat = Mat()
                Utils.bitmapToMat(bitmap, mat)
                bitmap.recycle()

                // 裁剪区域
                val safeX = x.coerceIn(0, mat.cols() - 1)
                val safeY = y.coerceIn(0, mat.rows() - 1)
                val safeW = width.coerceAtMost(mat.cols() - safeX)
                val safeH = height.coerceAtMost(mat.rows() - safeY)

                val roi = Mat(mat, Rect(safeX, safeY, safeW, safeH))
                val mean = Core.mean(roi)

                val r = mean.`val`[0].toInt()  // RGBA
                val g = mean.`val`[1].toInt()
                val b = mean.`val`[2].toInt()

                mat.release(); roi.release()

                promise.resolve(WritableNativeMap().apply {
                    putInt("r", r)
                    putInt("g", g)
                    putInt("b", b)
                    putBoolean("isGreen", g > 180 && g > r)
                    putBoolean("isWhite", r > 220 && g > 220 && b > 220)
                    putBoolean("isGray", r in 130..200 && g in 130..200 && b in 130..200 && Math.abs(r - g) < 20)
                })
            } catch (e: Exception) {
                promise.reject("COLOR_FAILED", e.message, e)
            }
        }
    }

    /**
     * 元素检测 — 找屏幕上的矩形区域，输出客观数据（位置、大小、颜色）
     * 不做业务分类，分类由脚本层/AI层决定
     * minAreaRatio: 最小面积占屏幕比例（默认 0.002 = 0.2%）
     * 返回 [{x, y, width, height, cx, cy, r, g, b, relX, relY, relW, relH, ratio}]
     */
    @ReactMethod
    fun detectElements(minAreaRatio: Double, maxResults: Int, promise: Promise) {
        if (!ensureOpenCv() || !AgentAccessibilityService.isRunning() || Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            promise.resolve(WritableNativeArray())
            return
        }

        takeScreenshotSync { bitmap ->
            if (bitmap == null) { promise.resolve(WritableNativeArray()); return@takeScreenshotSync }
            try {
                val src = Mat()
                Utils.bitmapToMat(bitmap, src)
                val screenW = src.cols()
                val screenH = src.rows()
                val screenArea = screenW * screenH

                val gray = Mat()
                Imgproc.cvtColor(src, gray, Imgproc.COLOR_RGBA2GRAY)
                val edges = Mat()
                Imgproc.Canny(gray, edges, 40.0, 120.0)
                val kernel = Imgproc.getStructuringElement(Imgproc.MORPH_RECT, Size(3.0, 3.0))
                Imgproc.dilate(edges, edges, kernel)

                val contours = mutableListOf<MatOfPoint>()
                val hierarchy = Mat()
                Imgproc.findContours(edges, contours, hierarchy, Imgproc.RETR_EXTERNAL, Imgproc.CHAIN_APPROX_SIMPLE)

                data class Element(val rect: Rect, val r: Int, val g: Int, val b: Int, val area: Int)
                val elements = mutableListOf<Element>()
                val minArea = (screenArea * minAreaRatio).toInt()

                for (contour in contours) {
                    val rect = Imgproc.boundingRect(contour)
                    val area = rect.width * rect.height
                    if (area < minArea) continue
                    if (rect.width > screenW * 0.98 && rect.height > screenH * 0.9) continue

                    val roi = Mat(src, rect)
                    val mean = Core.mean(roi)
                    roi.release()

                    elements.add(Element(
                        rect, mean.`val`[0].toInt(), mean.`val`[1].toInt(), mean.`val`[2].toInt(), area
                    ))
                }

                elements.sortByDescending { it.area }

                val results = WritableNativeArray()
                for (el in elements.take(maxResults)) {
                    val r = el.rect
                    results.pushMap(WritableNativeMap().apply {
                        putInt("x", r.x)
                        putInt("y", r.y)
                        putInt("width", r.width)
                        putInt("height", r.height)
                        putInt("cx", r.x + r.width / 2)
                        putInt("cy", r.y + r.height / 2)
                        putInt("area", el.area)
                        putInt("r", el.r)
                        putInt("g", el.g)
                        putInt("b", el.b)
                        putDouble("relX", r.x.toDouble() / screenW)
                        putDouble("relY", r.y.toDouble() / screenH)
                        putDouble("relW", r.width.toDouble() / screenW)
                        putDouble("relH", r.height.toDouble() / screenH)
                        putDouble("ratio", r.width.toDouble() / r.height.toDouble())
                    })
                }

                src.release(); gray.release(); edges.release(); hierarchy.release(); kernel.release()
                contours.forEach { it.release() }
                bitmap.recycle()

                promise.resolve(results)
            } catch (e: Exception) {
                bitmap.recycle()
                promise.reject("DETECT_FAILED", e.message, e)
            }
        }
    }

    // ═══════════════════════════════════════
    // 1. 变化区域定位
    // ═══════════════════════════════════════

    /**
     * 找到屏幕上发生变化的区域
     * 返回 [{x, y, width, height, cx, cy, relX, relY, relW, relH}]
     */
    private var diffPrevFrame: Mat? = null

    @ReactMethod
    fun diffRegions(threshold: Int, minAreaRatio: Double, promise: Promise) {
        if (!ensureOpenCv() || !AgentAccessibilityService.isRunning() || Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            promise.resolve(WritableNativeArray())
            return
        }

        takeScreenshotSync { bitmap ->
            if (bitmap == null) { promise.resolve(WritableNativeArray()); return@takeScreenshotSync }
            try {
                val current = Mat()
                Utils.bitmapToMat(bitmap, current)
                bitmap.recycle()
                Imgproc.cvtColor(current, current, Imgproc.COLOR_RGBA2GRAY)

                val screenW = current.cols()
                val screenH = current.rows()
                val prev = diffPrevFrame

                if (prev == null || prev.size() != current.size()) {
                    diffPrevFrame = current.clone()
                    current.release()
                    promise.resolve(WritableNativeArray())
                    return@takeScreenshotSync
                }

                // 帧差法
                val diff = Mat()
                Core.absdiff(prev, current, diff)
                val binary = Mat()
                Imgproc.threshold(diff, binary, threshold.toDouble(), 255.0, Imgproc.THRESH_BINARY)

                // 膨胀合并相邻变化
                val kernel = Imgproc.getStructuringElement(Imgproc.MORPH_RECT, Size(15.0, 15.0))
                Imgproc.dilate(binary, binary, kernel)

                // 找变化区域
                val contours = mutableListOf<MatOfPoint>()
                val hierarchy = Mat()
                Imgproc.findContours(binary, contours, hierarchy, Imgproc.RETR_EXTERNAL, Imgproc.CHAIN_APPROX_SIMPLE)

                val minArea = (screenW * screenH * minAreaRatio).toInt()
                val results = WritableNativeArray()

                for (contour in contours) {
                    val rect = Imgproc.boundingRect(contour)
                    if (rect.width * rect.height < minArea) continue
                    results.pushMap(WritableNativeMap().apply {
                        putInt("x", rect.x)
                        putInt("y", rect.y)
                        putInt("width", rect.width)
                        putInt("height", rect.height)
                        putInt("cx", rect.x + rect.width / 2)
                        putInt("cy", rect.y + rect.height / 2)
                        putDouble("relX", rect.x.toDouble() / screenW)
                        putDouble("relY", rect.y.toDouble() / screenH)
                        putDouble("relW", rect.width.toDouble() / screenW)
                        putDouble("relH", rect.height.toDouble() / screenH)
                    })
                }

                diffPrevFrame?.release()
                diffPrevFrame = current.clone()
                current.release(); diff.release(); binary.release(); hierarchy.release(); kernel.release()
                contours.forEach { it.release() }

                promise.resolve(results)
            } catch (e: Exception) {
                promise.reject("DIFF_FAILED", e.message, e)
            }
        }
    }

    // ═══════════════════════════════════════
    // 2. 区域 OCR
    // ═══════════════════════════════════════

    /**
     * 只对指定矩形区域做 OCR
     * 截图 → 裁剪 → 存为临时图片 → 调 PaddleOCR
     * 返回 base64 裁剪图（供 PaddleOCR JS 侧处理）
     */
    @ReactMethod
    fun cropScreenshot(x: Int, y: Int, width: Int, height: Int, promise: Promise) {
        if (!AgentAccessibilityService.isRunning() || Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            promise.reject("NOT_AVAILABLE", "Not available")
            return
        }

        takeScreenshotSync { bitmap ->
            if (bitmap == null) { promise.reject("SCREENSHOT_FAILED", "Failed"); return@takeScreenshotSync }
            try {
                val safeX = x.coerceIn(0, bitmap.width - 1)
                val safeY = y.coerceIn(0, bitmap.height - 1)
                val safeW = width.coerceAtMost(bitmap.width - safeX)
                val safeH = height.coerceAtMost(bitmap.height - safeY)

                val cropped = Bitmap.createBitmap(bitmap, safeX, safeY, safeW, safeH)
                bitmap.recycle()

                val stream = java.io.ByteArrayOutputStream()
                cropped.compress(Bitmap.CompressFormat.JPEG, 85, stream)
                cropped.recycle()

                val b64 = android.util.Base64.encodeToString(stream.toByteArray(), android.util.Base64.NO_WRAP)
                promise.resolve(b64)
            } catch (e: Exception) {
                bitmap.recycle()
                promise.reject("CROP_FAILED", e.message, e)
            }
        }
    }

    // ═══════════════════════════════════════
    // 3. 多尺度模板匹配
    // ═══════════════════════════════════════

    /**
     * 多尺度模板匹配 — 在 0.5x ~ 2.0x 范围内搜索
     * 返回 {x, y, confidence, found, scale}
     */
    @ReactMethod
    fun templateMatchMultiScale(templateBase64: String, threshold: Double, promise: Promise) {
        if (!ensureOpenCv()) { promise.reject("OPENCV_FAILED", "OpenCV init failed"); return }

        takeScreenshotSync { bitmap ->
            if (bitmap == null) { promise.reject("SCREENSHOT_FAILED", "Failed"); return@takeScreenshotSync }
            try {
                val templateBytes = android.util.Base64.decode(templateBase64, android.util.Base64.DEFAULT)
                val templateBitmap = android.graphics.BitmapFactory.decodeByteArray(templateBytes, 0, templateBytes.size)
                if (templateBitmap == null) {
                    bitmap.recycle()
                    promise.resolve(WritableNativeMap().apply {
                        putInt("x", 0); putInt("y", 0); putDouble("confidence", 0.0)
                        putBoolean("found", false); putDouble("scale", 1.0)
                    })
                    return@takeScreenshotSync
                }

                val screen = Mat()
                val template = Mat()
                Utils.bitmapToMat(bitmap, screen)
                Utils.bitmapToMat(templateBitmap, template)
                bitmap.recycle(); templateBitmap.recycle()

                Imgproc.cvtColor(screen, screen, Imgproc.COLOR_RGBA2GRAY)
                Imgproc.cvtColor(template, template, Imgproc.COLOR_RGBA2GRAY)

                var bestVal = 0.0
                var bestLoc = Point(0.0, 0.0)
                var bestScale = 1.0
                var bestTemplW = template.cols()
                var bestTemplH = template.rows()

                // 尝试多个缩放比例
                val scales = doubleArrayOf(0.5, 0.7, 0.85, 1.0, 1.2, 1.5, 2.0)
                for (scale in scales) {
                    val tw = (template.cols() * scale).toInt()
                    val th = (template.rows() * scale).toInt()
                    if (tw < 10 || th < 10 || tw > screen.cols() || th > screen.rows()) continue

                    val resized = Mat()
                    Imgproc.resize(template, resized, Size(tw.toDouble(), th.toDouble()))

                    val result = Mat()
                    Imgproc.matchTemplate(screen, resized, result, Imgproc.TM_CCOEFF_NORMED)
                    val minMaxLoc = Core.minMaxLoc(result)

                    if (minMaxLoc.maxVal > bestVal) {
                        bestVal = minMaxLoc.maxVal
                        bestLoc = minMaxLoc.maxLoc
                        bestScale = scale
                        bestTemplW = tw
                        bestTemplH = th
                    }
                    resized.release(); result.release()
                }

                screen.release(); template.release()

                val cx = (bestLoc.x + bestTemplW / 2).toInt()
                val cy = (bestLoc.y + bestTemplH / 2).toInt()

                promise.resolve(WritableNativeMap().apply {
                    putInt("x", cx)
                    putInt("y", cy)
                    putDouble("confidence", bestVal)
                    putBoolean("found", bestVal >= threshold)
                    putDouble("scale", bestScale)
                })
            } catch (e: Exception) {
                promise.reject("MATCH_FAILED", e.message, e)
            }
        }
    }

    // ═══════════════════════════════════════
    // 光流追踪 (Optical Flow)
    // ═══════════════════════════════════════

    private var flowPrevFrame: Mat? = null

    /**
     * 全局运动估计 — 屏幕整体滚动了多少
     * 使用稠密光流 (Farneback)，计算全局平均位移
     * 返回 {dx, dy, magnitude, scrolling, direction}
     * direction: "up" | "down" | "left" | "right" | "none"
     */
    @ReactMethod
    fun globalMotion(promise: Promise) {
        if (!ensureOpenCv() || !AgentAccessibilityService.isRunning() || Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            promise.resolve(WritableNativeMap().apply {
                putDouble("dx", 0.0); putDouble("dy", 0.0); putDouble("magnitude", 0.0)
                putBoolean("scrolling", false); putString("direction", "none")
            })
            return
        }

        takeScreenshotSync { bitmap ->
            if (bitmap == null) {
                promise.resolve(WritableNativeMap().apply {
                    putDouble("dx", 0.0); putDouble("dy", 0.0); putDouble("magnitude", 0.0)
                    putBoolean("scrolling", false); putString("direction", "none")
                })
                return@takeScreenshotSync
            }
            try {
                val current = Mat()
                Utils.bitmapToMat(bitmap, current)
                bitmap.recycle()
                Imgproc.cvtColor(current, current, Imgproc.COLOR_RGBA2GRAY)
                // 缩小加速
                val small = Mat()
                Imgproc.resize(current, small, Size(current.cols() / 4.0, current.rows() / 4.0))
                current.release()

                val prev = flowPrevFrame
                flowPrevFrame = small.clone()

                if (prev == null || prev.size() != small.size()) {
                    prev?.release()
                    small.release()
                    promise.resolve(WritableNativeMap().apply {
                        putDouble("dx", 0.0); putDouble("dy", 0.0); putDouble("magnitude", 0.0)
                        putBoolean("scrolling", false); putString("direction", "none")
                    })
                    return@takeScreenshotSync
                }

                // Farneback 稠密光流
                val flow = Mat()
                org.opencv.video.Video.calcOpticalFlowFarneback(
                    prev, small, flow,
                    0.5, 3, 15, 3, 5, 1.2, 0
                )
                prev.release()
                small.release()

                // 计算全局平均位移
                val channels = mutableListOf<Mat>()
                Core.split(flow, channels)
                val meanX = Core.mean(channels[0]).`val`[0] * 4  // 还原缩放
                val meanY = Core.mean(channels[1]).`val`[0] * 4
                channels.forEach { it.release() }
                flow.release()

                val magnitude = Math.sqrt(meanX * meanX + meanY * meanY)
                val scrolling = magnitude > 3.0  // 位移>3像素认为在滚动

                val direction = when {
                    !scrolling -> "none"
                    Math.abs(meanY) > Math.abs(meanX) -> if (meanY > 0) "down" else "up"
                    else -> if (meanX > 0) "right" else "left"
                }

                promise.resolve(WritableNativeMap().apply {
                    putDouble("dx", meanX)
                    putDouble("dy", meanY)
                    putDouble("magnitude", magnitude)
                    putBoolean("scrolling", scrolling)
                    putString("direction", direction)
                })
            } catch (e: Exception) {
                promise.reject("FLOW_FAILED", e.message, e)
            }
        }
    }

    /**
     * 稀疏特征点追踪 — 追踪指定坐标点在下一帧的位置
     * points: [[x1,y1], [x2,y2], ...] 要追踪的点
     * 返回 [{x, y, found, dx, dy}]
     */
    @ReactMethod
    fun trackPoints(points: ReadableArray, promise: Promise) {
        if (!ensureOpenCv() || !AgentAccessibilityService.isRunning() || Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            promise.resolve(WritableNativeArray())
            return
        }

        takeScreenshotSync { bitmap ->
            if (bitmap == null) { promise.resolve(WritableNativeArray()); return@takeScreenshotSync }
            try {
                val current = Mat()
                Utils.bitmapToMat(bitmap, current)
                bitmap.recycle()
                Imgproc.cvtColor(current, current, Imgproc.COLOR_RGBA2GRAY)

                val prev = flowPrevFrame
                flowPrevFrame = current.clone()

                if (prev == null || points.size() == 0) {
                    prev?.release()
                    current.release()
                    promise.resolve(WritableNativeArray())
                    return@takeScreenshotSync
                }

                // 构造输入点
                val prevPts = MatOfPoint2f()
                val ptList = mutableListOf<Point>()
                for (i in 0 until points.size()) {
                    val pt = points.getArray(i) ?: continue
                    ptList.add(Point(pt.getDouble(0), pt.getDouble(1)))
                }
                prevPts.fromList(ptList)

                // Lucas-Kanade 稀疏光流
                val nextPts = MatOfPoint2f()
                val status = MatOfByte()
                val err = MatOfFloat()
                org.opencv.video.Video.calcOpticalFlowPyrLK(
                    prev, current, prevPts, nextPts, status, err
                )
                prev.release()
                current.release()

                val results = WritableNativeArray()
                val nextList = nextPts.toList()
                val statusArr = status.toArray()

                for (i in ptList.indices) {
                    val found = i < statusArr.size && statusArr[i].toInt() == 1
                    val nx = if (found && i < nextList.size) nextList[i].x else ptList[i].x
                    val ny = if (found && i < nextList.size) nextList[i].y else ptList[i].y

                    results.pushMap(WritableNativeMap().apply {
                        putDouble("x", nx)
                        putDouble("y", ny)
                        putBoolean("found", found)
                        putDouble("dx", nx - ptList[i].x)
                        putDouble("dy", ny - ptList[i].y)
                    })
                }

                prevPts.release(); nextPts.release(); status.release(); err.release()
                promise.resolve(results)
            } catch (e: Exception) {
                promise.reject("TRACK_FAILED", e.message, e)
            }
        }
    }

    // ═══════════════════════════════════════
    // 补充能力
    // ═══════════════════════════════════════

    /**
     * 单点取色 — 获取屏幕上某个像素的颜色
     */
    @ReactMethod
    fun pixelColor(x: Int, y: Int, promise: Promise) {
        if (!AgentAccessibilityService.isRunning() || Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            promise.resolve(WritableNativeMap().apply { putInt("r", 0); putInt("g", 0); putInt("b", 0); putInt("a", 0) })
            return
        }
        takeScreenshotSync { bitmap ->
            if (bitmap == null) {
                promise.resolve(WritableNativeMap().apply { putInt("r", 0); putInt("g", 0); putInt("b", 0); putInt("a", 0) })
                return@takeScreenshotSync
            }
            val sx = x.coerceIn(0, bitmap.width - 1)
            val sy = y.coerceIn(0, bitmap.height - 1)
            val pixel = bitmap.getPixel(sx, sy)
            bitmap.recycle()
            promise.resolve(WritableNativeMap().apply {
                putInt("r", android.graphics.Color.red(pixel))
                putInt("g", android.graphics.Color.green(pixel))
                putInt("b", android.graphics.Color.blue(pixel))
                putInt("a", android.graphics.Color.alpha(pixel))
            })
        }
    }

    /**
     * 多目标模板匹配 — 找屏幕上所有匹配位置
     * 返回 [{x, y, confidence}]
     */
    @ReactMethod
    fun templateMatchAll(templateBase64: String, threshold: Double, maxResults: Int, promise: Promise) {
        if (!ensureOpenCv()) { promise.reject("OPENCV_FAILED", "OpenCV init failed"); return }

        takeScreenshotSync { bitmap ->
            if (bitmap == null) { promise.resolve(WritableNativeArray()); return@takeScreenshotSync }
            try {
                val templateBytes = android.util.Base64.decode(templateBase64, android.util.Base64.DEFAULT)
                val templateBitmap = android.graphics.BitmapFactory.decodeByteArray(templateBytes, 0, templateBytes.size)
                if (templateBitmap == null) { bitmap.recycle(); promise.resolve(WritableNativeArray()); return@takeScreenshotSync }

                val screen = Mat()
                val template = Mat()
                Utils.bitmapToMat(bitmap, screen)
                Utils.bitmapToMat(templateBitmap, template)
                bitmap.recycle(); templateBitmap.recycle()

                Imgproc.cvtColor(screen, screen, Imgproc.COLOR_RGBA2GRAY)
                Imgproc.cvtColor(template, template, Imgproc.COLOR_RGBA2GRAY)

                val result = Mat()
                Imgproc.matchTemplate(screen, template, result, Imgproc.TM_CCOEFF_NORMED)

                val results = WritableNativeArray()
                var count = 0
                val tw = template.cols()
                val th = template.rows()

                // 找所有超过阈值的位置（非极大值抑制）
                while (count < maxResults) {
                    val minMaxLoc = Core.minMaxLoc(result)
                    if (minMaxLoc.maxVal < threshold) break

                    val loc = minMaxLoc.maxLoc
                    results.pushMap(WritableNativeMap().apply {
                        putInt("x", (loc.x + tw / 2).toInt())
                        putInt("y", (loc.y + th / 2).toInt())
                        putDouble("confidence", minMaxLoc.maxVal)
                    })

                    // 抑制该区域
                    Imgproc.rectangle(result,
                        Point(loc.x - tw / 2, loc.y - th / 2),
                        Point(loc.x + tw / 2, loc.y + th / 2),
                        Scalar(0.0), -1)
                    count++
                }

                screen.release(); template.release(); result.release()
                promise.resolve(results)
            } catch (e: Exception) {
                promise.reject("MATCH_FAILED", e.message, e)
            }
        }
    }

    /**
     * 屏幕元信息 — 状态栏高度、导航栏高度、屏幕密度等
     */
    @ReactMethod
    fun screenMeta(promise: Promise) {
        val ctx = reactApplicationContext
        val dm = ctx.resources.displayMetrics
        val statusBarHeight = try {
            val resId = ctx.resources.getIdentifier("status_bar_height", "dimen", "android")
            if (resId > 0) ctx.resources.getDimensionPixelSize(resId) else 0
        } catch (_: Exception) { 0 }
        val navBarHeight = try {
            val resId = ctx.resources.getIdentifier("navigation_bar_height", "dimen", "android")
            if (resId > 0) ctx.resources.getDimensionPixelSize(resId) else 0
        } catch (_: Exception) { 0 }

        promise.resolve(WritableNativeMap().apply {
            putInt("screenWidth", dm.widthPixels)
            putInt("screenHeight", dm.heightPixels)
            putDouble("density", dm.density.toDouble())
            putInt("densityDpi", dm.densityDpi)
            putInt("statusBarHeight", statusBarHeight)
            putInt("navBarHeight", navBarHeight)
        })
    }

    // ═══════════════════════════════════════
    // 模板管理
    // ═══════════════════════════════════════

    private val templates = mutableMapOf<String, String>() // name → base64

    /**
     * 保存模板 — 从当前屏幕裁剪区域保存为命名模板
     */
    @ReactMethod
    fun saveTemplate(name: String, x: Int, y: Int, width: Int, height: Int, promise: Promise) {
        takeScreenshotSync { bitmap ->
            if (bitmap == null) { promise.resolve(false); return@takeScreenshotSync }
            try {
                val safeX = x.coerceIn(0, bitmap.width - 1)
                val safeY = y.coerceIn(0, bitmap.height - 1)
                val safeW = width.coerceAtMost(bitmap.width - safeX).coerceAtLeast(1)
                val safeH = height.coerceAtMost(bitmap.height - safeY).coerceAtLeast(1)

                val cropped = Bitmap.createBitmap(bitmap, safeX, safeY, safeW, safeH)
                bitmap.recycle()

                val stream = java.io.ByteArrayOutputStream()
                cropped.compress(Bitmap.CompressFormat.PNG, 100, stream)
                cropped.recycle()

                val b64 = android.util.Base64.encodeToString(stream.toByteArray(), android.util.Base64.NO_WRAP)
                templates[name] = b64

                // 持久化到文件
                val dir = reactApplicationContext.getDir("cv_templates", android.content.Context.MODE_PRIVATE)
                java.io.File(dir, "$name.b64").writeText(b64)

                promise.resolve(true)
            } catch (e: Exception) {
                bitmap.recycle()
                promise.resolve(false)
            }
        }
    }

    /**
     * 加载模板 — 用模板名匹配（自动从内存或文件加载）
     */
    @ReactMethod
    fun matchByName(name: String, threshold: Double, promise: Promise) {
        val b64 = getTemplate(name)
        if (b64 == null) {
            promise.resolve(WritableNativeMap().apply {
                putInt("x", 0); putInt("y", 0); putDouble("confidence", 0.0)
                putBoolean("found", false); putString("error", "Template '$name' not found")
            })
            return
        }
        templateMatch(b64, threshold, promise)
    }

    /**
     * 列出所有已保存的模板名
     */
    @ReactMethod
    fun listTemplates(promise: Promise) {
        // 从文件系统加载所有模板名
        val dir = reactApplicationContext.getDir("cv_templates", android.content.Context.MODE_PRIVATE)
        val names = WritableNativeArray()
        dir.listFiles()?.forEach { file ->
            if (file.name.endsWith(".b64")) {
                names.pushString(file.name.removeSuffix(".b64"))
            }
        }
        promise.resolve(names)
    }

    /**
     * 删除模板
     */
    @ReactMethod
    fun deleteTemplate(name: String, promise: Promise) {
        templates.remove(name)
        val dir = reactApplicationContext.getDir("cv_templates", android.content.Context.MODE_PRIVATE)
        java.io.File(dir, "$name.b64").delete()
        promise.resolve(true)
    }

    private fun getTemplate(name: String): String? {
        templates[name]?.let { return it }
        // 从文件加载
        val dir = reactApplicationContext.getDir("cv_templates", android.content.Context.MODE_PRIVATE)
        val file = java.io.File(dir, "$name.b64")
        if (file.exists()) {
            val b64 = file.readText()
            templates[name] = b64
            return b64
        }
        return null
    }

    /**
     * 重置帧缓存
     */
    @ReactMethod
    fun resetFrame(promise: Promise) {
        lastFrame?.release()
        lastFrame = null
        diffPrevFrame?.release()
        diffPrevFrame = null
        flowPrevFrame?.release()
        flowPrevFrame = null
        promise.resolve(true)
    }
}
