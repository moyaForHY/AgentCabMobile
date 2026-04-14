package com.agentcab.scripting

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.modules.core.DeviceEventManagerModule

@ReactModule(name = ScriptOverlayModule.NAME)
class ScriptOverlayModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "ScriptOverlayManager"
        private var moduleInstance: ScriptOverlayModule? = null

        fun emitStopEvent() {
            moduleInstance?.sendEvent("onScriptStop", null)
        }

        fun emitOverlayAction(action: String, dataJson: String) {
            moduleInstance?.let { m ->
                val params = Arguments.createMap().apply {
                    putString("action", action)
                    putString("data", dataJson)
                }
                m.sendEvent("onOverlayAction", params)
            }
        }
    }

    override fun getName(): String = NAME

    override fun initialize() {
        super.initialize()
        moduleInstance = this
    }

    @ReactMethod
    fun canDrawOverlays(promise: Promise) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            promise.resolve(Settings.canDrawOverlays(reactContext))
        } else {
            promise.resolve(true)
        }
    }

    @ReactMethod
    fun requestOverlayPermission(promise: Promise) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(reactContext)) {
            val intent = Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:${reactContext.packageName}")
            )
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            reactContext.startActivity(intent)
            promise.resolve(false)
        } else {
            promise.resolve(true)
        }
    }

    @ReactMethod
    fun startOverlay(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(reactContext)) {
                promise.reject("NO_PERMISSION", "Overlay permission not granted")
                return
            }
            ScriptOverlayService.start(reactContext)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("START_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun stopOverlay(promise: Promise) {
        try {
            ScriptOverlayService.stop(reactContext)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("STOP_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun addLog(message: String) {
        ScriptOverlayService.addLog(message)
    }

    @ReactMethod
    fun updateStatus(status: String) {
        ScriptOverlayService.updateStatus(status)
    }

    @ReactMethod
    fun startMemoOverlay(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(reactContext)) {
                promise.reject("NO_PERMISSION", "Overlay permission not granted")
                return
            }
            ScriptOverlayService.startMemo(reactContext)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("START_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun showOverlayHtml(html: String, promise: Promise) {
        try {
            ScriptOverlayService.showHtml(html)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SHOW_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun hideOverlayPanel(promise: Promise) {
        try {
            ScriptOverlayService.hidePanel()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("HIDE_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun addListener(eventName: String?) {}

    @ReactMethod
    fun removeListeners(count: Int?) {}

    private fun sendEvent(eventName: String, params: WritableMap?) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }
}
