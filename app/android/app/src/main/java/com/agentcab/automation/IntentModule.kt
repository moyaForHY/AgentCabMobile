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
        val callId = activity.intent?.getStringExtra("callId")
        val navigate = activity.intent?.getStringExtra("navigate")

        if (ruleId != null || callId != null) {
            val extras = WritableNativeMap()
            if (ruleId != null) extras.putString("automationRuleId", ruleId)
            if (callId != null) extras.putString("callId", callId)
            if (navigate != null) extras.putString("navigate", navigate)
            // Clear so it doesn't re-trigger
            activity.intent?.removeExtra("automationRuleId")
            activity.intent?.removeExtra("callId")
            activity.intent?.removeExtra("navigate")
            promise.resolve(extras)
        } else {
            promise.resolve(null)
        }
    }
}
