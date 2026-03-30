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

    /**
     * Read recent SMS messages.
     * @param limit Max number of messages to return (default 100)
     * @param days Number of days to look back (default 30)
     */
    @ReactMethod
    fun getRecentMessages(limit: Int, days: Int, promise: Promise) {
        try {
            val messages = WritableNativeArray()
            val dateFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
                timeZone = TimeZone.getTimeZone("UTC")
            }

            val cutoffMs = System.currentTimeMillis() - days.toLong() * 86400000L
            val selection = "${Telephony.Sms.DATE} >= ?"
            val selectionArgs = arrayOf(cutoffMs.toString())
            val sortOrder = "${Telephony.Sms.DATE} DESC LIMIT $limit"

            val cursor = reactApplicationContext.contentResolver.query(
                Telephony.Sms.CONTENT_URI,
                arrayOf(
                    Telephony.Sms.ADDRESS,
                    Telephony.Sms.BODY,
                    Telephony.Sms.DATE,
                    Telephony.Sms.TYPE,
                    Telephony.Sms.READ,
                ),
                selection,
                selectionArgs,
                sortOrder
            )

            cursor?.use {
                val addressCol = it.getColumnIndexOrThrow(Telephony.Sms.ADDRESS)
                val bodyCol = it.getColumnIndexOrThrow(Telephony.Sms.BODY)
                val dateCol = it.getColumnIndexOrThrow(Telephony.Sms.DATE)
                val typeCol = it.getColumnIndexOrThrow(Telephony.Sms.TYPE)
                val readCol = it.getColumnIndexOrThrow(Telephony.Sms.READ)

                while (it.moveToNext()) {
                    val typeInt = it.getInt(typeCol)
                    val typeStr = when (typeInt) {
                        Telephony.Sms.MESSAGE_TYPE_SENT -> "sent"
                        Telephony.Sms.MESSAGE_TYPE_INBOX -> "received"
                        Telephony.Sms.MESSAGE_TYPE_DRAFT -> "draft"
                        Telephony.Sms.MESSAGE_TYPE_OUTBOX -> "outbox"
                        else -> "unknown"
                    }

                    val msg = WritableNativeMap().apply {
                        putString("address", it.getString(addressCol) ?: "")
                        putString("body", it.getString(bodyCol) ?: "")
                        putString("date", dateFormat.format(Date(it.getLong(dateCol))))
                        putString("type", typeStr)
                        putBoolean("read", it.getInt(readCol) == 1)
                    }
                    messages.pushMap(msg)
                }
            }

            promise.resolve(messages)
        } catch (e: Exception) {
            promise.reject("SMS_ERROR", "Failed to read SMS: ${e.message}", e)
        }
    }
}
