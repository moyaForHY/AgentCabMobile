package com.agentcab.screenshot

import android.app.Activity
import android.graphics.Bitmap
import android.graphics.Canvas
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.PixelCopy
import android.view.View
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import java.io.File

@ReactModule(name = ScreenshotModule.NAME)
class ScreenshotModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object { const val NAME = "ScreenshotManager" }
    override fun getName(): String = NAME

    @ReactMethod
    fun takeScreenshot(promise: Promise) {
        val activity: Activity? = reactApplicationContext.currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "No active activity")
            return
        }

        activity.runOnUiThread {
            try {
                val view: View = activity.window.decorView.rootView
                val width = view.width
                val height = view.height

                if (width == 0 || height == 0) {
                    promise.reject("SCREENSHOT_ERROR", "View has zero dimensions")
                    return@runOnUiThread
                }

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
                    PixelCopy.request(activity.window, bitmap, { result: Int ->
                        if (result == PixelCopy.SUCCESS) {
                            saveBitmap(bitmap, width, height, promise)
                        } else {
                            drawCacheFallback(view, width, height, promise)
                        }
                    }, Handler(Looper.getMainLooper()))
                } else {
                    drawCacheFallback(view, width, height, promise)
                }
            } catch (e: Exception) {
                promise.reject("SCREENSHOT_ERROR", e.message, e)
            }
        }
    }

    private fun drawCacheFallback(view: View, width: Int, height: Int, promise: Promise) {
        try {
            val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(bitmap)
            view.draw(canvas)
            saveBitmap(bitmap, width, height, promise)
        } catch (e: Exception) {
            promise.reject("SCREENSHOT_ERROR", e.message, e)
        }
    }

    private fun saveBitmap(bitmap: Bitmap, width: Int, height: Int, promise: Promise) {
        try {
            val file = File(reactApplicationContext.cacheDir, "screenshot_${System.currentTimeMillis()}.jpg")
            file.outputStream().use { out ->
                bitmap.compress(Bitmap.CompressFormat.JPEG, 90, out)
            }
            bitmap.recycle()

            val result = WritableNativeMap().apply {
                putString("uri", "file://${file.absolutePath}")
                putString("path", file.absolutePath)
                putInt("width", width)
                putInt("height", height)
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("SAVE_ERROR", e.message, e)
        }
    }
}
