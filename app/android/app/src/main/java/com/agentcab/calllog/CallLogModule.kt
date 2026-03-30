package com.agentcab.calllog

import android.provider.CallLog
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

@ReactModule(name = CallLogModule.NAME)
class CallLogModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "CallLogModule"
    }

    override fun getName(): String = NAME

    /**
     * Read recent call log entries.
     * @param limit Max number of entries to return (default 200)
     * @param days  Number of days to look back (default 30)
     */
    @ReactMethod
    fun getCallLog(limit: Int, days: Int, promise: Promise) {
        try {
            val entries = WritableNativeArray()
            val cutoff = System.currentTimeMillis() - days.toLong() * 86400000L

            val projection = arrayOf(
                CallLog.Calls.CACHED_NAME,
                CallLog.Calls.NUMBER,
                CallLog.Calls.TYPE,
                CallLog.Calls.DATE,
                CallLog.Calls.DURATION,
            )

            val selection = "${CallLog.Calls.DATE} >= ?"
            val selectionArgs = arrayOf(cutoff.toString())
            val sortOrder = "${CallLog.Calls.DATE} DESC"

            val cursor = reactApplicationContext.contentResolver.query(
                CallLog.Calls.CONTENT_URI,
                projection,
                selection,
                selectionArgs,
                sortOrder
            )

            val isoFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
                timeZone = TimeZone.getTimeZone("UTC")
            }

            cursor?.use {
                val nameCol = it.getColumnIndexOrThrow(CallLog.Calls.CACHED_NAME)
                val numberCol = it.getColumnIndexOrThrow(CallLog.Calls.NUMBER)
                val typeCol = it.getColumnIndexOrThrow(CallLog.Calls.TYPE)
                val dateCol = it.getColumnIndexOrThrow(CallLog.Calls.DATE)
                val durationCol = it.getColumnIndexOrThrow(CallLog.Calls.DURATION)

                var count = 0
                while (it.moveToNext() && count < limit) {
                    val name = it.getString(nameCol) ?: ""
                    val number = it.getString(numberCol) ?: ""
                    val typeInt = it.getInt(typeCol)
                    val dateMs = it.getLong(dateCol)
                    val duration = it.getInt(durationCol)

                    val typeStr = when (typeInt) {
                        CallLog.Calls.INCOMING_TYPE -> "incoming"
                        CallLog.Calls.OUTGOING_TYPE -> "outgoing"
                        CallLog.Calls.MISSED_TYPE -> "missed"
                        CallLog.Calls.REJECTED_TYPE -> "rejected"
                        CallLog.Calls.BLOCKED_TYPE -> "blocked"
                        CallLog.Calls.VOICEMAIL_TYPE -> "voicemail"
                        else -> "unknown"
                    }

                    val entry = WritableNativeMap().apply {
                        putString("name", name)
                        putString("number", number)
                        putString("type", typeStr)
                        putString("date", isoFormat.format(Date(dateMs)))
                        putInt("duration", duration)
                    }
                    entries.pushMap(entry)
                    count++
                }
            }

            promise.resolve(entries)
        } catch (e: Exception) {
            promise.reject("CALL_LOG_ERROR", "Failed to read call log: ${e.message}", e)
        }
    }
}
