package com.agentcab.sms

import android.net.Uri
import android.provider.Telephony
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import java.text.SimpleDateFormat
import java.util.*

@ReactModule(name = SmsModule.NAME)
class SmsModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "SmsModule"
    }

    override fun getName(): String = NAME

    @ReactMethod
    fun getRecentMessages(limit: Int, days: Int, promise: Promise) {
        try {
            val messages = WritableNativeArray()
            val dateFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
                timeZone = TimeZone.getTimeZone("UTC")
            }
            val cutoffMs = System.currentTimeMillis() - days.toLong() * 86400000L

            // Try multiple URIs
            val uris = listOf(
                Telephony.Sms.Inbox.CONTENT_URI,
                Telephony.Sms.CONTENT_URI,
                Uri.parse("content://sms/inbox"),
                Uri.parse("content://sms"),
            )

            var workingUri: Uri? = null
            var maxRows = 0
            for (uri in uris) {
                try {
                    val testCursor = reactApplicationContext.contentResolver.query(
                        uri, null, null, null, "date DESC"
                    )
                    val count = testCursor?.count ?: 0
                    // Check newest date
                    var newestDate = 0L
                    if (testCursor != null && testCursor.moveToFirst()) {
                        val dateIdx = testCursor.getColumnIndex("date")
                        if (dateIdx >= 0) newestDate = testCursor.getLong(dateIdx)
                    }
                    testCursor?.close()
                    if (count > maxRows) {
                        maxRows = count
                        workingUri = uri
                    }
                } catch (e: Exception) {
                    // URI not available on this device
                }
            }

            if (workingUri == null) {
                promise.resolve(messages)
                return
            }

            val cursor = reactApplicationContext.contentResolver.query(
                workingUri,
                null,  // all columns - MIUI may filter differently with explicit projection
                null, null, "date DESC"
            )

            cursor?.use {
                val addressCol = it.getColumnIndexOrThrow("address")
                val bodyCol = it.getColumnIndexOrThrow("body")
                val dateCol = it.getColumnIndexOrThrow("date")
                val typeCol = it.getColumnIndexOrThrow("type")
                val readCol = it.getColumnIndexOrThrow("read")

                var count = 0
                while (it.moveToNext() && count < limit) {
                    val msgDate = it.getLong(dateCol)
                    if (msgDate < cutoffMs) continue // skip old, don't break (might not be sorted)

                    count++
                    val typeInt = it.getInt(typeCol)
                    val typeStr = when (typeInt) {
                        1 -> "received"
                        2 -> "sent"
                        3 -> "draft"
                        4 -> "outbox"
                        else -> "unknown"
                    }

                    val msg = WritableNativeMap().apply {
                        putString("address", it.getString(addressCol) ?: "")
                        putString("body", it.getString(bodyCol) ?: "")
                        putString("date", dateFormat.format(Date(msgDate)))
                        putString("type", typeStr)
                        putBoolean("read", it.getInt(readCol) == 1)
                    }
                    messages.pushMap(msg)
                }
            }

            promise.resolve(messages)
        } catch (e: Exception) {
            android.util.Log.e("SmsModule", "Error reading SMS", e)
            promise.reject("SMS_ERROR", "Failed to read SMS: ${e.message}", e)
        }
    }
}
