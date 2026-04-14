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

        // 共享最新帧 — 其他模块（PaddleOCR等）可以直接用
        @Volatile @JvmStatic var sharedLatestBitmap: Bitmap? = null
        @Volatile @JvmStatic var sharedLatestTs: Long = 0
        // 锁定帧 — lockFrame() 时截的帧，其他模块也可以用
        @Volatile @JvmStatic var sharedLockedBitmap: Bitmap? = null
        // 同步锁 — 防止 recycle 和读取并发
        @JvmStatic val bitmapLock = Any()
        @Volatile @JvmStatic var scanIntervalMs = 500L
        val scanning = AtomicBoolean(false)
        var scanThread: Thread? = null
    }

    override fun getName(): String = NAME

    private fun ensureOpenCv(): Boolean {
        if (!openCvLoaded) {
            openCvLoaded = OpenCVLoader.initLocal()
        }
        return openCvLoaded
    }

    // 感知循环维护的最新帧（所有模块共享）
    @Volatile private var latestPerceptionBitmap: Bitmap? = null
    @Volatile private var latestPerceptionTs: Long = 0

    private fun takeScreenshotSync(callback: (Bitmap?) -> Unit) {
        // 1. 如果帧已锁定，返回锁定帧的副本
        if (frameLocked.get() && lockedBitmap != null) {
            callback(lockedBitmap!!.copy(lockedBitmap!!.config ?: Bitmap.Config.ARGB_8888, false))
            return
        }
        // 2. 如果感知循环有新鲜帧（<4秒），直接用
        val perceptionBmp = latestPerceptionBitmap
        if (perceptionBmp != null && System.currentTimeMillis() - latestPerceptionTs < 4000) {
            callback(perceptionBmp.copy(perceptionBmp.config ?: Bitmap.Config.ARGB_8888, false))
            return
        }
        // 3. 否则自己截图
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
    /** 暂停 perception SSIM 比对（脚本自身动作期间用，不影响截图共享） */
    private val perceptionPaused = AtomicBoolean(false)

    @ReactMethod
    fun pausePerception(promise: Promise) {
        perceptionPaused.set(true)
        promise.resolve(true)
    }

    @ReactMethod
    fun resumePerception(promise: Promise) {
        perceptionPaused.set(false)
        promise.resolve(true)
    }

    /**
     * 锁定当前帧 — 截一次图，后续所有 CV 操作共用这张
     */
    @ReactMethod
    fun screenshotBase64(promise: Promise) {
        if (!AgentAccessibilityService.isRunning() || Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            promise.resolve(null); return
        }
        // 永远走 AccessibilityService 直截，不用 lockedBitmap / perceptionBitmap 缓存。
        // 调用方拿到的是真实当前屏幕帧。
        val mainHandler = Handler(Looper.getMainLooper())
        mainHandler.post { ScriptOverlayService.setVisible(false) }
        mainHandler.postDelayed({
            AgentAccessibilityService.takeScreenshot { bitmap ->
                mainHandler.post { ScriptOverlayService.setVisible(true) }
                if (bitmap == null) { promise.resolve(null); return@takeScreenshot }
                try {
                    val stream = java.io.ByteArrayOutputStream()
                    bitmap.compress(Bitmap.CompressFormat.JPEG, 70, stream)
                    bitmap.recycle()
                    val base64 = android.util.Base64.encodeToString(stream.toByteArray(), android.util.Base64.NO_WRAP)
                    promise.resolve(base64)
                } catch (e: Exception) {
                    promise.reject("SCREENSHOT_ERROR", e.message, e)
                }
            }
        }, 100)
    }

    @ReactMethod
    fun lockFrame(promise: Promise) {
        if (!AgentAccessibilityService.isRunning() || Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            promise.resolve(false); return
        }
        takeScreenshotSync { bitmap ->
            if (bitmap == null) { promise.resolve(false); return@takeScreenshotSync }
            lockedBitmap?.recycle()
            lockedBitmap = bitmap
            sharedLockedBitmap = bitmap
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
        sharedLockedBitmap = null
        promise.resolve(true)
    }

    // ═══════════════════════════════════════
    // 持续感知循环 (Perception Loop)
    // ═══════════════════════════════════════

    // 实时状态 — 脚本可随时读取
    @Volatile var perceptionState = PerceptionState()

    // 粘性标记：检测到变化后置 true，脚本读取后才重置
    private val stickyChanged = AtomicBoolean(false)

    data class PerceptionState(
        var ssim: Double = 0.0,
        var isStable: Boolean = false,
        var hasChanged: Boolean = false,
        var changeCount: Int = 0,        // 连续变化帧数
        var stableCount: Int = 0,        // 连续稳定帧数
        var frameCount: Long = 0,
        var lastUpdateMs: Long = 0,
        // 变化区域（原图坐标）
        var changeX: Int = 0,
        var changeY: Int = 0,
        var changeW: Int = 0,
        var changeH: Int = 0,
    )

    /**
     * 启动持续感知循环
     * intervalMs: 扫描间隔（默认 500ms）
     * stableThreshold: SSIM 高于此值认为稳定（默认 0.95）
     */
    @ReactMethod
    fun startPerception(intervalMs: Int, stableThreshold: Double, promise: Promise) {
        android.util.Log.d("CvPerception", "startPerception called: interval=$intervalMs scanning=${scanning.get()}")
        if (!ensureOpenCv()) { promise.reject("OPENCV_FAILED", "OpenCV init failed"); return }
        if (scanning.get()) {
            // 更新间隔
            scanIntervalMs = intervalMs.toLong()
            android.util.Log.d("CvPerception", "Updated interval to $scanIntervalMs")
            promise.resolve(true)
            return
        }

        scanIntervalMs = intervalMs.toLong()
        android.util.Log.d("CvPerception", "Starting new perception loop: interval=$scanIntervalMs")
        scanning.set(true)

        scanThread = thread(name = "CvPerception", isDaemon = true) {
            var prevFrame: Mat? = null

            while (scanning.get()) {
                try {
                    if (!AgentAccessibilityService.isRunning() || Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
                        Thread.sleep(scanIntervalMs)
                        continue
                    }

                    // 截图（隐藏悬浮窗避免 OCR 误识别）
                    var bitmap: Bitmap? = null
                    val latch = java.util.concurrent.CountDownLatch(1)
                    val mainHandler = Handler(Looper.getMainLooper())
                    mainHandler.post {
                        ScriptOverlayService.setVisible(false)
                    }
                    mainHandler.postDelayed({
                        AgentAccessibilityService.takeScreenshot { bmp ->
                            bitmap = bmp
                            mainHandler.post { ScriptOverlayService.setVisible(true) }
                            latch.countDown()
                        }
                    }, 150)
                    latch.await(2, java.util.concurrent.TimeUnit.SECONDS)

                    if (bitmap == null) {
                        android.util.Log.w("CvPerception", "截图失败 (null)")
                        continue
                    }
                    val bmp = bitmap!!

                    android.util.Log.d("CvPerception", "截图 ${bmp.width}x${bmp.height} sticky=${stickyChanged.get()}")

                    // 保存最新帧供所有模块使用
                    val frameCopy = bmp.copy(bmp.config ?: Bitmap.Config.ARGB_8888, false)
                    latestPerceptionBitmap?.recycle()
                    latestPerceptionBitmap = frameCopy
                    latestPerceptionTs = System.currentTimeMillis()
                    synchronized(bitmapLock) {
                        sharedLatestBitmap?.recycle()
                        sharedLatestBitmap = frameCopy.copy(frameCopy.config ?: Bitmap.Config.ARGB_8888, false)
                        sharedLatestTs = System.currentTimeMillis()
                    }

                    // 转灰度并缩小
                    val current = Mat()
                    Utils.bitmapToMat(bmp, current)
                    bmp.recycle()
                    Imgproc.cvtColor(current, current, Imgproc.COLOR_RGBA2GRAY)
                    val small = Mat()
                    Imgproc.resize(current, small, Size(current.cols() / 4.0, current.rows() / 4.0))
                    current.release()

                    // 暂停状态（脚本正在执行截图等动作）跳过 SSIM 比对，
                    // 避免脚本自身动作造成的屏幕变化被误判为新消息
                    if (perceptionPaused.get()) {
                        prevFrame?.release()
                        prevFrame = small
                        continue
                    }

                    if (prevFrame != null) {
                        val score = computeSSIM(prevFrame!!, small)
                        val stable = score > stableThreshold

                        // 计算变化区域
                        var cx = 0; var cy = 0; var cw = 0; var ch = 0
                        if (!stable) {
                            stickyChanged.set(true)
                            try {
                                val diff = Mat()
                                Core.absdiff(prevFrame, small, diff)
                                val thresh = Mat()
                                Imgproc.threshold(diff, thresh, 25.0, 255.0, Imgproc.THRESH_BINARY)
                                diff.release()
                                // 找变化像素的包围框
                                val points = Mat()
                                Core.findNonZero(thresh, points)
                                thresh.release()
                                if (!points.empty()) {
                                    val rect = Imgproc.boundingRect(points)
                                    // 缩小了4倍，还原到原图坐标
                                    cx = rect.x * 4; cy = rect.y * 4
                                    cw = rect.width * 4; ch = rect.height * 4
                                }
                                points.release()
                            } catch (_: Exception) {}
                        }

                        android.util.Log.d("CvPerception", "ssim=${String.format("%.4f", score)} stable=$stable sticky=${stickyChanged.get()}" +
                            if (!stable) " change=($cx,$cy,${cw}x$ch)" else "")

                        perceptionState = perceptionState.copy(
                            ssim = score,
                            isStable = stable,
                            hasChanged = stickyChanged.get(),
                            changeCount = if (!stable) perceptionState.changeCount + 1 else 0,
                            stableCount = if (stable && stickyChanged.get()) perceptionState.stableCount + 1 else if (stable) perceptionState.stableCount + 1 else 0,
                            frameCount = perceptionState.frameCount + 1,
                            lastUpdateMs = System.currentTimeMillis(),
                            changeX = if (!stable) cx else perceptionState.changeX,
                            changeY = if (!stable) cy else perceptionState.changeY,
                            changeW = if (!stable) cw else perceptionState.changeW,
                            changeH = if (!stable) ch else perceptionState.changeH,
                        )
                        prevFrame!!.release()
                    } else {
                        perceptionState = perceptionState.copy(
                            frameCount = 1,
                            lastUpdateMs = System.currentTimeMillis(),
                        )
                    }
                    prevFrame = small

                    android.util.Log.d("CvPerception", "sleep ${scanIntervalMs}ms")
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
            putInt("changeX", s.changeX)
            putInt("changeY", s.changeY)
            putInt("changeW", s.changeW)
            putInt("changeH", s.changeH)
        })
    }

    /**
     * 确认变化已处理 — 重置粘性标记
     */
    @ReactMethod
    fun ackChange(promise: Promise) {
        stickyChanged.set(false)
        perceptionState = perceptionState.copy(hasChanged = false, stableCount = 0)
        promise.resolve(true)
    }

    // ═══════════════════════════════════════
    // 单次调用 API（兼容旧脚本）
    // ═══════════════════════════════════════

    private var lastFrame: Mat? = null

    @ReactMethod
    fun ssim(b64: String?, promise: Promise) {
        if (!ensureOpenCv()) {
            promise.reject("OPENCV_FAILED", "OpenCV init failed")
            return
        }

        val finish: (Bitmap?) -> Unit = { bitmap ->
            if (bitmap == null) {
                promise.reject("SCREENSHOT_FAILED", "Could not decode / take screenshot")
            } else {
                val current = Mat()
                Utils.bitmapToMat(bitmap, current)
                bitmap.recycle()
                Imgproc.cvtColor(current, current, Imgproc.COLOR_RGBA2GRAY)
                val small = Mat()
                Imgproc.resize(current, small, Size(current.cols() / 4.0, current.rows() / 4.0))
                current.release()

                val prev = lastFrame
                lastFrame = small.clone()

                if (prev == null) {
                    small.release()
                    promise.resolve(0.0)
                } else {
                    val score = computeSSIM(prev, small)
                    prev.release()
                    small.release()
                    promise.resolve(score)
                }
            }
        }

        if (!b64.isNullOrEmpty()) {
            try {
                val bytes = android.util.Base64.decode(b64, android.util.Base64.NO_WRAP)
                val bmp = android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                finish(bmp)
            } catch (e: Exception) {
                promise.reject("DECODE_FAILED", e.message, e)
            }
            return
        }

        if (!AgentAccessibilityService.isRunning() || Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            promise.reject("NOT_AVAILABLE", "Accessibility or Android version not supported")
            return
        }
        takeScreenshotSync(finish)
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
     * 基于形状的图标定位 — 轮廓 + Hu 矩 (matchShapes)
     * 对模板图标二值化取最大外轮廓，在截屏里找所有轮廓，按面积/圆度/形状得分过滤。
     * 天然抗缩放/旋转，不依赖颜色和像素级对齐，适合 `+`、齿轮、箭头这类符号图标。
     *
     * options (可选):
     *   - minArea / maxArea: 候选轮廓面积范围 (px^2, 默认 100..20000)
     *   - minCircularity: 圆度下限 0..1 (默认 0)，要求外轮廓接近圆用 0.7+
     *   - shapeThreshold: matchShapes 距离上限 (默认 0.15，越小越严)
     *   - maxResults: 最多返回数 (默认 10)
     *   - invert: 模板/截屏二值化时是否反相 (默认 true — 暗图标亮背景)
     * 返回 { found, matches: [{x,y,w,h,cx,cy,score,area}] }
     */
    @ReactMethod
    fun findIconByShape(templateBase64: String, options: ReadableMap?, promise: Promise) {
        if (!ensureOpenCv()) {
            promise.reject("OPENCV_FAILED", "OpenCV init failed")
            return
        }

        val minArea = if (options?.hasKey("minArea") == true) options.getDouble("minArea") else 100.0
        val maxArea = if (options?.hasKey("maxArea") == true) options.getDouble("maxArea") else 20000.0
        val minCircularity = if (options?.hasKey("minCircularity") == true) options.getDouble("minCircularity") else 0.0
        val shapeThreshold = if (options?.hasKey("shapeThreshold") == true) options.getDouble("shapeThreshold") else 0.15
        val maxResults = if (options?.hasKey("maxResults") == true) options.getInt("maxResults") else 10
        val invert = if (options?.hasKey("invert") == true) options.getBoolean("invert") else true

        takeScreenshotSync { bitmap ->
            if (bitmap == null) {
                promise.reject("SCREENSHOT_FAILED", "Could not take screenshot")
                return@takeScreenshotSync
            }
            try {
                val templateBytes = android.util.Base64.decode(templateBase64, android.util.Base64.DEFAULT)
                val templateBitmap = android.graphics.BitmapFactory.decodeByteArray(templateBytes, 0, templateBytes.size)
                if (templateBitmap == null) {
                    bitmap.recycle()
                    promise.resolve(WritableNativeMap().apply {
                        putBoolean("found", false)
                        putArray("matches", WritableNativeArray())
                    })
                    return@takeScreenshotSync
                }

                val screen = Mat()
                val template = Mat()
                Utils.bitmapToMat(bitmap, screen)
                Utils.bitmapToMat(templateBitmap, template)
                bitmap.recycle()
                templateBitmap.recycle()

                val screenGray = Mat()
                val templateGray = Mat()
                Imgproc.cvtColor(screen, screenGray, Imgproc.COLOR_RGBA2GRAY)
                Imgproc.cvtColor(template, templateGray, Imgproc.COLOR_RGBA2GRAY)
                screen.release(); template.release()

                Imgproc.GaussianBlur(screenGray, screenGray, Size(3.0, 3.0), 0.0)

                val thrFlag = (if (invert) Imgproc.THRESH_BINARY_INV else Imgproc.THRESH_BINARY) or Imgproc.THRESH_OTSU

                val templateBw = Mat()
                Imgproc.threshold(templateGray, templateBw, 0.0, 255.0, thrFlag)
                templateGray.release()

                val screenBw = Mat()
                Imgproc.threshold(screenGray, screenBw, 0.0, 255.0, thrFlag)
                screenGray.release()

                val tmplContours = ArrayList<MatOfPoint>()
                Imgproc.findContours(templateBw, tmplContours, Mat(), Imgproc.RETR_EXTERNAL, Imgproc.CHAIN_APPROX_NONE)
                templateBw.release()
                if (tmplContours.isEmpty()) {
                    screenBw.release()
                    promise.resolve(WritableNativeMap().apply {
                        putBoolean("found", false)
                        putArray("matches", WritableNativeArray())
                    })
                    return@takeScreenshotSync
                }
                val tmplContour = tmplContours.maxByOrNull { Imgproc.contourArea(it) }!!

                val screenContours = ArrayList<MatOfPoint>()
                Imgproc.findContours(screenBw, screenContours, Mat(), Imgproc.RETR_EXTERNAL, Imgproc.CHAIN_APPROX_NONE)
                screenBw.release()

                data class Hit(val score: Double, val rect: Rect, val area: Double)
                val hits = ArrayList<Hit>()

                for (c in screenContours) {
                    val area = Imgproc.contourArea(c)
                    if (area < minArea || area > maxArea) { c.release(); continue }

                    if (minCircularity > 0.0) {
                        val peri = Imgproc.arcLength(MatOfPoint2f(*c.toArray()), true)
                        if (peri <= 1e-3) { c.release(); continue }
                        val circ = 4.0 * Math.PI * area / (peri * peri)
                        if (circ < minCircularity) { c.release(); continue }
                    }

                    val score = Imgproc.matchShapes(c, tmplContour, Imgproc.CONTOURS_MATCH_I2, 0.0)
                    if (score <= shapeThreshold) {
                        hits.add(Hit(score, Imgproc.boundingRect(c), area))
                    }
                    c.release()
                }
                tmplContour.release()
                for (c in tmplContours) c.release()

                val sorted = hits.sortedBy { it.score }.take(maxResults)
                val arr = WritableNativeArray()
                for (h in sorted) {
                    arr.pushMap(WritableNativeMap().apply {
                        putInt("x", h.rect.x)
                        putInt("y", h.rect.y)
                        putInt("w", h.rect.width)
                        putInt("h", h.rect.height)
                        putInt("cx", h.rect.x + h.rect.width / 2)
                        putInt("cy", h.rect.y + h.rect.height / 2)
                        putDouble("score", h.score)
                        putDouble("area", h.area)
                    })
                }

                promise.resolve(WritableNativeMap().apply {
                    putBoolean("found", sorted.isNotEmpty())
                    putArray("matches", arr)
                })
            } catch (e: Exception) {
                promise.reject("SHAPE_MATCH_FAILED", e.message, e)
            }
        }
    }

    /**
     * 特征点匹配 — 用 ORB 特征点检测，不受缩放/旋转影响
     * 返回 {x, y, found, matchCount, totalKeypoints}
     */
    @ReactMethod
    fun featureMatch(templateBase64: String, minMatches: Int, promise: Promise) {
        if (!ensureOpenCv()) { promise.reject("OPENCV_FAILED", "OpenCV init failed"); return }

        takeScreenshotSync { bitmap ->
            if (bitmap == null) { promise.reject("SCREENSHOT_FAILED", "Failed"); return@takeScreenshotSync }
            try {
                val templateBytes = android.util.Base64.decode(templateBase64, android.util.Base64.DEFAULT)
                val templateBitmap = android.graphics.BitmapFactory.decodeByteArray(templateBytes, 0, templateBytes.size)
                if (templateBitmap == null) {
                    bitmap.recycle()
                    promise.resolve(WritableNativeMap().apply {
                        putInt("x", 0); putInt("y", 0); putBoolean("found", false)
                        putInt("matchCount", 0); putInt("totalKeypoints", 0)
                    })
                    return@takeScreenshotSync
                }

                val screenMat = Mat()
                val templateMat = Mat()
                Utils.bitmapToMat(bitmap, screenMat)
                Utils.bitmapToMat(templateBitmap, templateMat)
                bitmap.recycle()
                templateBitmap.recycle()

                // 转灰度
                val screenGray = Mat()
                val templateGray = Mat()
                Imgproc.cvtColor(screenMat, screenGray, Imgproc.COLOR_RGBA2GRAY)
                Imgproc.cvtColor(templateMat, templateGray, Imgproc.COLOR_RGBA2GRAY)
                screenMat.release()
                templateMat.release()

                // ORB 特征检测
                val orb = org.opencv.features2d.ORB.create(500)
                val kp1 = org.opencv.core.MatOfKeyPoint()
                val kp2 = org.opencv.core.MatOfKeyPoint()
                val desc1 = Mat()
                val desc2 = Mat()
                orb.detectAndCompute(templateGray, Mat(), kp1, desc1)
                orb.detectAndCompute(screenGray, Mat(), kp2, desc2)
                templateGray.release()
                screenGray.release()

                if (desc1.empty() || desc2.empty()) {
                    promise.resolve(WritableNativeMap().apply {
                        putInt("x", 0); putInt("y", 0); putBoolean("found", false)
                        putInt("matchCount", 0); putInt("totalKeypoints", kp1.toList().size)
                    })
                    desc1.release(); desc2.release(); kp1.release(); kp2.release()
                    return@takeScreenshotSync
                }

                // BF 匹配
                val matcher = org.opencv.features2d.BFMatcher.create(org.opencv.core.Core.NORM_HAMMING, true)
                val matches = org.opencv.core.MatOfDMatch()
                matcher.match(desc1, desc2, matches)
                desc1.release(); desc2.release()

                val matchList = matches.toList().sortedBy { it.distance }
                matches.release()

                // 过滤好的匹配（距离 < 中位数 * 0.7）
                val goodMatches = if (matchList.size > 4) {
                    val median = matchList[matchList.size / 2].distance
                    matchList.filter { it.distance < median * 0.7 }
                } else {
                    matchList
                }

                val found = goodMatches.size >= minMatches
                var cx = 0
                var cy = 0

                if (found && goodMatches.isNotEmpty()) {
                    // 计算匹配区域中心
                    val kp2List = kp2.toList()
                    var sumX = 0.0
                    var sumY = 0.0
                    for (m in goodMatches) {
                        val pt = kp2List[m.trainIdx].pt
                        sumX += pt.x
                        sumY += pt.y
                    }
                    cx = (sumX / goodMatches.size).toInt()
                    cy = (sumY / goodMatches.size).toInt()
                }

                kp1.release(); kp2.release()

                promise.resolve(WritableNativeMap().apply {
                    putInt("x", cx)
                    putInt("y", cy)
                    putBoolean("found", found)
                    putInt("matchCount", goodMatches.size)
                    putInt("totalKeypoints", matchList.size)
                })
            } catch (e: Exception) {
                bitmap.recycle()
                promise.reject("FEATURE_MATCH_FAILED", e.message, e)
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

                // 众数颜色（量化到32阶，取出现最多的）
                val colorCounts = mutableMapOf<Int, Int>()
                val step = Math.max(1, Math.min(safeW, safeH) / 20)
                for (py in safeY until safeY + safeH step step) {
                    for (px in safeX until safeX + safeW step step) {
                        val sx = px.coerceIn(0, mat.cols() - 1)
                        val sy = py.coerceIn(0, mat.rows() - 1)
                        val pixel = mat.get(sy, sx)
                        val qr = ((pixel[0].toInt()) / 32) * 32
                        val qg = ((pixel[1].toInt()) / 32) * 32
                        val qb = ((pixel[2].toInt()) / 32) * 32
                        val key = (qr shl 16) or (qg shl 8) or qb
                        colorCounts[key] = (colorCounts[key] ?: 0) + 1
                    }
                }
                val totalPixels = colorCounts.values.sum()
                val majorityEntry = colorCounts.maxByOrNull { it.value }
                val majorityKey = majorityEntry?.key ?: 0
                val majorityCount = majorityEntry?.value ?: 0
                val r = (majorityKey shr 16) and 0xFF
                val g = (majorityKey shr 8) and 0xFF
                val b = majorityKey and 0xFF

                // 众数占比（纯色气泡接近 1.0，图片 < 0.3）
                val dominance = if (totalPixels > 0) majorityCount.toDouble() / totalPixels else 0.0
                // 颜色种类数（纯色气泡 < 10，图片 > 30）
                val colorCount = colorCounts.size

                mat.release()

                promise.resolve(WritableNativeMap().apply {
                    putInt("r", r)
                    putInt("g", g)
                    putInt("b", b)
                    putDouble("dominance", dominance)
                    putInt("colorCount", colorCount)
                    putBoolean("isGreen", g > 180 && g > r)
                    putBoolean("isWhite", r > 220 && g > 220 && b > 220)
                    putBoolean("isGray", r in 130..200 && g in 130..200 && b in 130..200 && Math.abs(r - g) < 20)
                    putBoolean("isImage", dominance < 0.3 && colorCount > 20)
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
    fun detectElements(minAreaRatio: Double, maxResults: Int, dilateSize: Int, cannyLow: Double, cannyHigh: Double, promise: Promise) {
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
                Imgproc.Canny(gray, edges, cannyLow, cannyHigh)
                if (dilateSize > 0) {
                    val kernel = Imgproc.getStructuringElement(Imgproc.MORPH_RECT, Size(dilateSize.toDouble(), dilateSize.toDouble()))
                    Imgproc.dilate(edges, edges, kernel)
                    kernel.release()
                }

                val contours = mutableListOf<MatOfPoint>()
                val hierarchy = Mat()
                Imgproc.findContours(edges, contours, hierarchy, Imgproc.RETR_EXTERNAL, Imgproc.CHAIN_APPROX_SIMPLE)

                data class ColorEntry(val r: Int, val g: Int, val b: Int, val ratio: Double)
                data class Element(val rect: Rect, val r: Int, val g: Int, val b: Int, val area: Int, val dominance: Double, val colorCount: Int, val topColors: List<ColorEntry>)
                val elements = mutableListOf<Element>()
                val minArea = (screenArea * minAreaRatio).toInt()

                for (contour in contours) {
                    val rect = Imgproc.boundingRect(contour)
                    val area = rect.width * rect.height
                    if (area < minArea) continue
                    if (rect.width > screenW * 0.98 && rect.height > screenH * 0.9) continue

                    // 采样颜色分布
                    val colorCounts = mutableMapOf<Int, Int>()
                    val step = Math.max(1, Math.min(rect.width, rect.height) / 15)
                    for (py in rect.y until rect.y + rect.height step step) {
                        for (px in rect.x until rect.x + rect.width step step) {
                            val sx = px.coerceIn(0, src.cols() - 1)
                            val sy = py.coerceIn(0, src.rows() - 1)
                            val pixel = src.get(sy, sx)
                            val qr = ((pixel[0].toInt()) / 4) * 4
                            val qg = ((pixel[1].toInt()) / 4) * 4
                            val qb = ((pixel[2].toInt()) / 4) * 4
                            val key = (qr shl 16) or (qg shl 8) or qb
                            colorCounts[key] = (colorCounts[key] ?: 0) + 1
                        }
                    }
                    val totalPx = colorCounts.values.sum()
                    val majorityEntry = colorCounts.maxByOrNull { it.value }
                    val majorityKey = majorityEntry?.key ?: 0
                    val majorityCount = majorityEntry?.value ?: 0
                    val elR = (majorityKey shr 16) and 0xFF
                    val elG = (majorityKey shr 8) and 0xFF
                    val elB = majorityKey and 0xFF
                    val dominance = if (totalPx > 0) majorityCount.toDouble() / totalPx else 0.0

                    // Top N 颜色（按占比降序）
                    val topColors = colorCounts.entries
                        .sortedByDescending { it.value }
                        .take(5)
                        .map { entry ->
                            val cr = (entry.key shr 16) and 0xFF
                            val cg = (entry.key shr 8) and 0xFF
                            val cb = entry.key and 0xFF
                            val ratio = if (totalPx > 0) entry.value.toDouble() / totalPx else 0.0
                            ColorEntry(cr, cg, cb, ratio)
                        }

                    elements.add(Element(rect, elR, elG, elB, area, dominance, colorCounts.size, topColors))
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
                        putDouble("dominance", el.dominance)
                        putInt("colorCount", el.colorCount)
                        // topColors 数组
                        val colorsArr = WritableNativeArray()
                        for (c in el.topColors) {
                            colorsArr.pushMap(WritableNativeMap().apply {
                                putInt("r", c.r)
                                putInt("g", c.g)
                                putInt("b", c.b)
                                putDouble("ratio", c.ratio)
                            })
                        }
                        putArray("topColors", colorsArr)
                        putBoolean("isImage", el.dominance < 0.3 && el.colorCount > 20)
                    })
                }

                src.release(); gray.release(); edges.release(); hierarchy.release()
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
    // 长截屏拼接 — 模板匹配检测重叠 → 裁剪 → vconcat
    // ═══════════════════════════════════════

    @ReactMethod
    fun stitchImages(imagesB64: com.facebook.react.bridge.ReadableArray, promise: Promise) {
        if (!ensureOpenCv()) { promise.reject("OPENCV_FAIL", "OpenCV init failed"); return }
        val n = imagesB64.size()
        if (n == 0) { promise.resolve(""); return }
        if (n == 1) { promise.resolve(imagesB64.getString(0)); return }

        val mats = mutableListOf<Mat>()
        val parts = mutableListOf<Mat>()
        var stitched: Mat? = null
        try {
            for (i in 0 until n) {
                val b64 = imagesB64.getString(i) ?: continue
                val bytes = android.util.Base64.decode(b64, android.util.Base64.NO_WRAP)
                val bmp = android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                    ?: throw IllegalArgumentException("decode failed at index $i")
                val mat = Mat()
                Utils.bitmapToMat(bmp, mat)
                Imgproc.cvtColor(mat, mat, Imgproc.COLOR_RGBA2RGB)
                bmp.recycle()
                mats.add(mat)
            }

            val width = mats[0].cols()
            // 第一张完整保留
            parts.add(mats[0].clone())

            for (i in 0 until mats.size - 1) {
                val a = mats[i]
                val b = mats[i + 1]
                val hA = a.rows()
                val hB = b.rows()
                // 取 a 底部 150 像素做模板
                val stripH = minOf(150, hA / 3, hB / 3)
                if (stripH <= 10) {
                    parts.add(b.clone())
                    continue
                }
                val template = a.submat(hA - stripH, hA, 0, width)
                // 在 b 的上半部分 + 模板高度范围内搜
                val searchEnd = minOf(hB, hB / 2 + stripH + 50)
                val searchArea = b.submat(0, searchEnd, 0, width)
                val result = Mat()
                Imgproc.matchTemplate(searchArea, template, result, Imgproc.TM_CCOEFF_NORMED)
                val mm = Core.minMaxLoc(result)
                val matchY = mm.maxLoc.y.toInt()
                val score = mm.maxVal
                android.util.Log.d(NAME, "stitch $i→${i + 1}: score=$score matchY=$matchY stripH=$stripH")
                result.release()
                searchArea.release()
                template.release()

                val overlapEnd = matchY + stripH
                if (score > 0.6 && overlapEnd in 1 until hB) {
                    val nonOverlap = b.submat(overlapEnd, hB, 0, width)
                    parts.add(nonOverlap.clone())
                    nonOverlap.release()
                } else {
                    // 没匹配上（滑动过头 / 全新内容）就整张追加
                    parts.add(b.clone())
                }
            }

            // vconcat
            stitched = Mat()
            Core.vconcat(parts, stitched)

            // 转回 base64
            val bmpOut = Bitmap.createBitmap(stitched.cols(), stitched.rows(), Bitmap.Config.ARGB_8888)
            val rgba = Mat()
            Imgproc.cvtColor(stitched, rgba, Imgproc.COLOR_RGB2RGBA)
            Utils.matToBitmap(rgba, bmpOut)
            rgba.release()

            val stream = java.io.ByteArrayOutputStream()
            bmpOut.compress(Bitmap.CompressFormat.JPEG, 85, stream)
            bmpOut.recycle()
            val b64Out = android.util.Base64.encodeToString(stream.toByteArray(), android.util.Base64.NO_WRAP)
            android.util.Log.d(NAME, "stitch done: ${n} imgs → ${stitched.rows()}px tall, ${b64Out.length} bytes b64")
            promise.resolve(b64Out)
        } catch (e: Exception) {
            android.util.Log.e(NAME, "stitchImages error", e)
            promise.reject("STITCH_FAIL", e.message, e)
        } finally {
            mats.forEach { it.release() }
            parts.forEach { it.release() }
            stitched?.release()
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
                // createBitmap 可能返回原始 bitmap（全屏裁剪时），不能提前回收
                if (cropped !== bitmap) { bitmap.recycle() }

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

    // ═══════════════════════════════════════
    // 文本工具（原生加速）
    // ═══════════════════════════════════════

    /**
     * 编辑距离 — 原生实现，比脚本快几十倍
     * 带提前退出：超过 maxDist 立即返回
     */
    @ReactMethod
    fun editDistance(a: String, b: String, maxDist: Int, promise: Promise) {
        if (a == b) { promise.resolve(0); return }
        val la = a.length
        val lb = b.length
        if (la == 0) { promise.resolve(lb); return }
        if (lb == 0) { promise.resolve(la); return }

        val diff = Math.abs(la - lb)
        if (diff > maxDist) { promise.resolve(diff); return }

        // 带状 DP
        val k = maxDist
        val big = k + 1
        var prev = IntArray(lb + 1) { if (it <= k) it else big }

        for (i in 1..la) {
            val curr = IntArray(lb + 1) { big }
            val jMin = maxOf(0, i - k)
            val jMax = minOf(lb, i + k)
            if (jMin == 0) curr[0] = i

            var rowMin = big
            for (j in maxOf(1, jMin)..jMax) {
                val cost = if (a[i - 1] == b[j - 1]) 0 else 1
                val replace = prev[j - 1] + cost
                val delete = prev[j] + 1
                val insert = if (j > jMin) curr[j - 1] + 1 else big
                val v = minOf(replace, delete, insert)
                curr[j] = v
                if (v < rowMin) rowMin = v
            }
            if (rowMin >= k) { promise.resolve(k); return }
            prev = curr
        }
        promise.resolve(prev[lb])
    }

    /**
     * 模糊文本匹配 — editDistance / maxLen < threshold
     */
    @ReactMethod
    fun fuzzyTextMatch(a: String, b: String, threshold: Double, promise: Promise) {
        if (a == b) { promise.resolve(true); return }
        val la = a.length
        val lb = b.length
        val maxLen = maxOf(la, lb)
        if (maxLen == 0) { promise.resolve(true); return }

        // 长度差检查
        if (Math.abs(la - lb).toDouble() / maxLen >= threshold) { promise.resolve(false); return }

        // 前缀后缀快速检查
        val check = maxOf(1, (minOf(la, lb) * 0.3).toInt())
        val prefixOk = a.substring(0, minOf(check, la)) == b.substring(0, minOf(check, lb))
        val suffixOk = a.substring(maxOf(0, la - check)) == b.substring(maxOf(0, lb - check))
        if (prefixOk && suffixOk) { promise.resolve(true); return }

        // 编辑距离
        val maxDist = (maxLen * threshold).toInt() + 1
        val dist = nativeEditDistance(a, b, maxDist)
        promise.resolve(dist.toDouble() / maxLen < threshold)
    }

    /**
     * 批量模糊匹配 — 在列表中找到与 query 匹配的项
     * 返回匹配的索引列表
     */
    @ReactMethod
    fun fuzzyFindInList(query: String, list: ReadableArray, threshold: Double, promise: Promise) {
        val results = WritableNativeArray()
        for (i in 0 until list.size()) {
            val item = list.getString(i) ?: continue
            if (query == item) {
                results.pushInt(i)
                continue
            }
            val maxLen = maxOf(query.length, item.length)
            if (maxLen == 0) continue
            if (Math.abs(query.length - item.length).toDouble() / maxLen >= threshold) continue
            val maxDist = (maxLen * threshold).toInt() + 1
            val dist = nativeEditDistance(query, item, maxDist)
            if (dist.toDouble() / maxLen < threshold) {
                results.pushInt(i)
            }
        }
        promise.resolve(results)
    }

    private fun nativeEditDistance(a: String, b: String, maxDist: Int): Int {
        val la = a.length
        val lb = b.length
        if (la == 0) return lb
        if (lb == 0) return la
        if (Math.abs(la - lb) > maxDist) return Math.abs(la - lb)

        val k = maxDist
        val big = k + 1
        var prev = IntArray(lb + 1) { if (it <= k) it else big }

        for (i in 1..la) {
            val curr = IntArray(lb + 1) { big }
            val jMin = maxOf(0, i - k)
            val jMax = minOf(lb, i + k)
            if (jMin == 0) curr[0] = i

            var rowMin = big
            for (j in maxOf(1, jMin)..jMax) {
                val cost = if (a[i - 1] == b[j - 1]) 0 else 1
                val v = minOf(prev[j - 1] + cost, prev[j] + 1, if (j > jMin) curr[j - 1] + 1 else big)
                curr[j] = v
                if (v < rowMin) rowMin = v
            }
            if (rowMin >= k) return k
            prev = curr
        }
        return prev[lb]
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
