package com.agentcab.accessibility

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.HardwareBuffer
import android.media.Image
import android.media.ImageReader
import android.os.Build
import android.view.Display
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import com.facebook.react.bridge.WritableNativeArray
import com.facebook.react.bridge.WritableNativeMap
import java.util.concurrent.Executors

/**
 * Accessibility Service that can read screen content and perform actions on other apps.
 * Must be enabled by user in system settings.
 */
class AgentAccessibilityService : AccessibilityService() {

    companion object {
        var instance: AgentAccessibilityService? = null
            private set

        fun isRunning(): Boolean = instance != null

        fun getCurrentPackage(): String {
            val inst = instance ?: return ""
            return inst.rootInActiveWindow?.packageName?.toString() ?: ""
        }

        fun getScreenContent(): List<Map<String, Any?>> {
            val inst = instance ?: return emptyList()
            val root = inst.rootInActiveWindow ?: return emptyList()
            val nodes = mutableListOf<Map<String, Any?>>()
            traverseNode(root, nodes, 0)
            return nodes
        }

        fun clickNodeByText(text: String): Boolean {
            val inst = instance ?: return false
            val root = inst.rootInActiveWindow ?: return false
            val nodes = root.findAccessibilityNodeInfosByText(text)
            for (node in nodes) {
                if (node.isClickable) {
                    node.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                    return true
                }
                // Try parent
                var parent = node.parent
                while (parent != null) {
                    if (parent.isClickable) {
                        parent.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                        return true
                    }
                    parent = parent.parent
                }
            }
            return false
        }

        fun setTextByNode(targetText: String, newText: String): Boolean {
            val inst = instance ?: return false
            val root = inst.rootInActiveWindow ?: return false
            val nodes = root.findAccessibilityNodeInfosByText(targetText)
            for (node in nodes) {
                if (node.isEditable) {
                    val args = android.os.Bundle()
                    args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, newText)
                    node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
                    return true
                }
            }
            return false
        }

        fun performGlobalAction(action: Int): Boolean {
            val inst = instance ?: return false
            return inst.performGlobalAction(action)
        }

        /**
         * Take a screenshot using AccessibilityService API (Android 11+).
         * Returns Bitmap via callback on success, null on failure.
         */
        fun takeScreenshot(callback: (Bitmap?) -> Unit) {
            val inst = instance
            if (inst == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
                callback(null)
                return
            }
            val executor = Executors.newSingleThreadExecutor()
            inst.takeScreenshot(
                Display.DEFAULT_DISPLAY,
                executor,
                object : AccessibilityService.TakeScreenshotCallback {
                    override fun onSuccess(screenshot: AccessibilityService.ScreenshotResult) {
                        try {
                            val hwBuffer = screenshot.hardwareBuffer
                            val bitmap = Bitmap.wrapHardwareBuffer(hwBuffer, screenshot.colorSpace)
                            hwBuffer.close()
                            val swBitmap = bitmap?.copy(Bitmap.Config.ARGB_8888, false)
                            bitmap?.recycle()
                            callback(swBitmap)
                        } catch (e: Exception) {
                            callback(null)
                        }
                    }
                    override fun onFailure(errorCode: Int) {
                        callback(null)
                    }
                }
            )
        }

        private fun traverseNode(node: AccessibilityNodeInfo, result: MutableList<Map<String, Any?>>, depth: Int) {
            if (depth > 15) return // Prevent infinite recursion

            val map = mutableMapOf<String, Any?>(
                "text" to node.text?.toString(),
                "className" to node.className?.toString(),
                "contentDescription" to node.contentDescription?.toString(),
                "isClickable" to node.isClickable,
                "isEditable" to node.isEditable,
                "isScrollable" to node.isScrollable,
                "depth" to depth,
            )
            if (node.text != null || node.contentDescription != null || node.isClickable) {
                result.add(map)
            }

            for (i in 0 until node.childCount) {
                val child = node.getChild(i) ?: continue
                traverseNode(child, result, depth + 1)
            }
        }
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this

        serviceInfo = serviceInfo.apply {
            eventTypes = AccessibilityEvent.TYPES_ALL_MASK
            feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
            flags = AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS or
                    AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS
            notificationTimeout = 100
        }
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // Events can be processed here for monitoring
    }

    override fun onInterrupt() {}

    override fun onDestroy() {
        instance = null
        super.onDestroy()
    }
}
