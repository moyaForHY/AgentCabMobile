package com.agentcab.automation

import android.content.Intent
import android.os.Bundle
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/**
 * Headless JS service that runs automation tasks without opening the UI.
 * Started by AlarmReceiver when the app process is not in foreground.
 */
class AutomationHeadlessService : HeadlessJsTaskService() {

    override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
        val extras = intent?.extras ?: return null
        val ruleId = extras.getString("ruleId") ?: return null

        val data = Arguments.createMap().apply {
            putString("ruleId", ruleId)
        }

        return HeadlessJsTaskConfig(
            "AutomationHeadlessTask",  // Must match AppRegistry.registerHeadlessTask name
            data,
            5 * 60 * 1000L,           // 5 minute timeout
            true                       // Allow in foreground
        )
    }
}
