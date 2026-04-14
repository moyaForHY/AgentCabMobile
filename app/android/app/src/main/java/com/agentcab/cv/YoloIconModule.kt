package com.agentcab.cv

import android.graphics.Bitmap
import android.os.Build
import android.os.Handler
import android.os.Looper
import com.agentcab.accessibility.AgentAccessibilityService
import com.agentcab.scripting.ScriptOverlayService
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import java.io.File

object YoloIconJNI {
    init {
        try {
            System.loadLibrary("ncnn_yolo")
        } catch (e: UnsatisfiedLinkError) {
            android.util.Log.e("YoloIcon", "Failed to load ncnn_yolo: ${e.message}")
        }
    }
    @JvmStatic external fun nativeLoad(name: String, dir: String): Boolean
    @JvmStatic external fun nativeDetect(name: String, bitmap: Bitmap, conf: Float, iou: Float): String
    @JvmStatic external fun nativeRelease(name: String)
}

@ReactModule(name = YoloIconModule.NAME)
class YoloIconModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object { const val NAME = "YoloIconManager" }

    override fun getName(): String = NAME

    private fun modelDir(name: String): File =
        File(reactApplicationContext.filesDir, "models/$name")

    @ReactMethod
    fun isModelReady(name: String, promise: Promise) {
        val dir = modelDir(name)
        promise.resolve(File(dir, "model.ncnn.bin").exists() && File(dir, "model.ncnn.param").exists())
    }

    @ReactMethod
    fun loadModel(name: String, promise: Promise) {
        try {
            val dir = modelDir(name)
            if (!File(dir, "model.ncnn.bin").exists()) {
                promise.reject("MODEL_NOT_FOUND", "Model files missing in $dir")
                return
            }
            val ok = YoloIconJNI.nativeLoad(name, dir.absolutePath)
            if (ok) promise.resolve(true)
            else promise.reject("LOAD_FAILED", "ncnn load failed")
        } catch (e: Exception) {
            promise.reject("LOAD_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun releaseModel(name: String, promise: Promise) {
        try {
            YoloIconJNI.nativeRelease(name)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("RELEASE_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun detect(modelName: String, conf: Double, iou: Double, promise: Promise) {
        // Auto-load if needed
        val dir = modelDir(modelName)
        if (!File(dir, "model.ncnn.bin").exists()) {
            promise.reject("MODEL_NOT_FOUND", "Model $modelName not downloaded")
            return
        }
        if (!YoloIconJNI.nativeLoad(modelName, dir.absolutePath)) {
            promise.reject("LOAD_FAILED", "Could not load $modelName")
            return
        }

        takeScreenshotSync { bitmap ->
            if (bitmap == null) {
                promise.reject("SCREENSHOT_FAILED", "Could not take screenshot")
                return@takeScreenshotSync
            }
            try {
                val ensured = if (bitmap.config != Bitmap.Config.ARGB_8888) {
                    val c = bitmap.copy(Bitmap.Config.ARGB_8888, false)
                    bitmap.recycle()
                    c
                } else bitmap
                val json = YoloIconJNI.nativeDetect(modelName, ensured, conf.toFloat(), iou.toFloat())
                ensured.recycle()
                promise.resolve(parseJson(json))
            } catch (e: Exception) {
                promise.reject("DETECT_ERROR", e.message, e)
            }
        }
    }

    private fun takeScreenshotSync(cb: (Bitmap?) -> Unit) {
        // Reuse CvModule's shared/locked frame if fresh
        synchronized(CvModule.bitmapLock) {
            val locked = CvModule.sharedLockedBitmap
            if (locked != null && !locked.isRecycled) {
                cb(locked.copy(locked.config ?: Bitmap.Config.ARGB_8888, false))
                return
            }
            val latest = CvModule.sharedLatestBitmap
            if (latest != null && !latest.isRecycled &&
                System.currentTimeMillis() - CvModule.sharedLatestTs < 4000) {
                cb(latest.copy(latest.config ?: Bitmap.Config.ARGB_8888, false))
                return
            }
        }
        if (!AgentAccessibilityService.isRunning() || Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            cb(null); return
        }
        val mainHandler = Handler(Looper.getMainLooper())
        mainHandler.post { ScriptOverlayService.setVisible(false) }
        mainHandler.postDelayed({
            AgentAccessibilityService.takeScreenshot { bmp ->
                mainHandler.post { ScriptOverlayService.setVisible(true) }
                cb(bmp)
            }
        }, 100)
    }

    private fun parseJson(json: String): WritableArray {
        val arr = Arguments.createArray()
        try {
            val a = org.json.JSONArray(json)
            for (i in 0 until a.length()) {
                val o = a.getJSONObject(i)
                val m = Arguments.createMap()
                m.putString("cls", o.getString("cls"))
                m.putInt("clsId", o.getInt("clsId"))
                m.putDouble("conf", o.getDouble("conf"))
                m.putInt("x", o.getInt("x"))
                m.putInt("y", o.getInt("y"))
                m.putInt("w", o.getInt("w"))
                m.putInt("h", o.getInt("h"))
                m.putInt("cx", o.getInt("cx"))
                m.putInt("cy", o.getInt("cy"))
                arr.pushMap(m)
            }
        } catch (e: Exception) {
            android.util.Log.e(NAME, "parseJson: ${e.message}")
        }
        return arr
    }
}
