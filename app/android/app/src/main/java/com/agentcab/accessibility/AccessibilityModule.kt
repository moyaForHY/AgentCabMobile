package com.agentcab.accessibility

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.Intent
import android.graphics.Path
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule

@ReactModule(name = AccessibilityModule.NAME)
class AccessibilityModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object { const val NAME = "AccessibilityManager" }
    override fun getName(): String = NAME

    @ReactMethod
    fun isEnabled(promise: Promise) {
        promise.resolve(AgentAccessibilityService.isRunning())
    }

    @ReactMethod
    fun openSettings(promise: Promise) {
        try {
            val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            reactApplicationContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SETTINGS_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun getScreenContent(promise: Promise) {
        try {
            if (!AgentAccessibilityService.isRunning()) {
                promise.reject("NOT_ENABLED", "Accessibility service is not enabled")
                return
            }
            val content = AgentAccessibilityService.getScreenContent()
            val result = WritableNativeArray()
            for (node in content) {
                val item = WritableNativeMap().apply {
                    putString("text", node["text"] as? String)
                    putString("className", node["className"] as? String)
                    putString("contentDescription", node["contentDescription"] as? String)
                    putBoolean("isClickable", node["isClickable"] as? Boolean ?: false)
                    putBoolean("isEditable", node["isEditable"] as? Boolean ?: false)
                    putBoolean("isScrollable", node["isScrollable"] as? Boolean ?: false)
                    putInt("depth", node["depth"] as? Int ?: 0)
                }
                result.pushMap(item)
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("CONTENT_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun clickByText(text: String, promise: Promise) {
        try {
            if (!AgentAccessibilityService.isRunning()) {
                promise.reject("NOT_ENABLED", "Accessibility service is not enabled")
                return
            }
            val success = AgentAccessibilityService.clickNodeByText(text)
            promise.resolve(success)
        } catch (e: Exception) {
            promise.reject("CLICK_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun setTextByTarget(targetText: String, newText: String, promise: Promise) {
        try {
            if (!AgentAccessibilityService.isRunning()) {
                promise.reject("NOT_ENABLED", "Accessibility service is not enabled")
                return
            }
            val success = AgentAccessibilityService.setTextByNode(targetText, newText)
            promise.resolve(success)
        } catch (e: Exception) {
            promise.reject("SET_TEXT_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun pressBack(promise: Promise) {
        promise.resolve(AgentAccessibilityService.performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK))
    }

    @ReactMethod
    fun pressHome(promise: Promise) {
        promise.resolve(AgentAccessibilityService.performGlobalAction(AccessibilityService.GLOBAL_ACTION_HOME))
    }

    @ReactMethod
    fun openRecents(promise: Promise) {
        promise.resolve(AgentAccessibilityService.performGlobalAction(AccessibilityService.GLOBAL_ACTION_RECENTS))
    }

    @ReactMethod
    fun openNotifications(promise: Promise) {
        promise.resolve(AgentAccessibilityService.performGlobalAction(AccessibilityService.GLOBAL_ACTION_NOTIFICATIONS))
    }

    @ReactMethod
    fun scroll(direction: String, promise: Promise) {
        if (!AgentAccessibilityService.isRunning()) {
            promise.reject("NOT_ENABLED", "Accessibility service is not enabled")
            return
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) {
            promise.reject("UNSUPPORTED", "Gestures require Android 7+")
            return
        }
        try {
            val inst = AgentAccessibilityService.instance!!
            val dm = reactApplicationContext.resources.displayMetrics
            val w = dm.widthPixels.toFloat()
            val h = dm.heightPixels.toFloat()
            val cx = w / 2
            val path = Path()
            when (direction) {
                "down" -> { path.moveTo(cx, h * 0.6f); path.lineTo(cx, h * 0.3f) }
                "up" -> { path.moveTo(cx, h * 0.3f); path.lineTo(cx, h * 0.6f) }
                "left" -> { path.moveTo(w * 0.7f, h / 2); path.lineTo(w * 0.3f, h / 2) }
                "right" -> { path.moveTo(w * 0.3f, h / 2); path.lineTo(w * 0.7f, h / 2) }
                else -> { promise.reject("INVALID", "Direction must be up/down/left/right"); return }
            }
            val gesture = GestureDescription.Builder()
                .addStroke(GestureDescription.StrokeDescription(path, 0, 300))
                .build()
            inst.dispatchGesture(gesture, object : AccessibilityService.GestureResultCallback() {
                override fun onCompleted(gestureDescription: GestureDescription?) { promise.resolve(true) }
                override fun onCancelled(gestureDescription: GestureDescription?) { promise.resolve(false) }
            }, null)
        } catch (e: Exception) {
            promise.reject("SCROLL_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun swipe(startX: Float, startY: Float, endX: Float, endY: Float, durationMs: Int, promise: Promise) {
        if (!AgentAccessibilityService.isRunning()) {
            promise.reject("NOT_ENABLED", "Accessibility service is not enabled")
            return
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) {
            promise.reject("UNSUPPORTED", "Gestures require Android 7+")
            return
        }
        try {
            val inst = AgentAccessibilityService.instance!!
            val path = Path()
            path.moveTo(startX, startY)
            path.lineTo(endX, endY)
            val dur = if (durationMs > 0) durationMs.toLong() else 300L
            val gesture = GestureDescription.Builder()
                .addStroke(GestureDescription.StrokeDescription(path, 0, dur))
                .build()
            inst.dispatchGesture(gesture, object : AccessibilityService.GestureResultCallback() {
                override fun onCompleted(gestureDescription: GestureDescription?) { promise.resolve(true) }
                override fun onCancelled(gestureDescription: GestureDescription?) { promise.resolve(false) }
            }, null)
        } catch (e: Exception) {
            promise.reject("SWIPE_ERROR", e.message, e)
        }
    }
}
