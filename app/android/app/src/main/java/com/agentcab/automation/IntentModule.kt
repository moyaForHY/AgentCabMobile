package com.agentcab.automation

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.WritableNativeMap

class IntentModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    override fun getName() = "IntentModule"

    @ReactMethod
    fun getInitialIntent(promise: Promise) {
        val activity = reactContext.currentActivity
        if (activity == null) {
            promise.resolve(null)
            return
        }
        val ruleId = activity.intent?.getStringExtra("automationRuleId")
        if (ruleId != null) {
            val extras = WritableNativeMap()
            extras.putString("automationRuleId", ruleId)
            // Clear so it doesn't re-execute on config change
            activity.intent?.removeExtra("automationRuleId")
            promise.resolve(extras)
        } else {
            promise.resolve(null)
        }
    }
}
