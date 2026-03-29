package com.agentcab.calendar

import android.content.ContentValues
import android.net.Uri
import android.provider.CalendarContract
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import java.util.TimeZone

@ReactModule(name = CalendarModule.NAME)
class CalendarModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "CalendarManager"
    }

    override fun getName(): String = NAME

    /**
     * List all available calendars on the device.
     */
    @ReactMethod
    fun getCalendars(promise: Promise) {
        try {
            val calendars = WritableNativeArray()
            val projection = arrayOf(
                CalendarContract.Calendars._ID,
                CalendarContract.Calendars.CALENDAR_DISPLAY_NAME,
                CalendarContract.Calendars.CALENDAR_COLOR,
                CalendarContract.Calendars.ACCOUNT_NAME,
            )

            val cursor = reactApplicationContext.contentResolver.query(
                CalendarContract.Calendars.CONTENT_URI,
                projection,
                null,
                null,
                null
            )

            cursor?.use {
                val idCol = it.getColumnIndexOrThrow(CalendarContract.Calendars._ID)
                val nameCol = it.getColumnIndexOrThrow(CalendarContract.Calendars.CALENDAR_DISPLAY_NAME)
                val colorCol = it.getColumnIndexOrThrow(CalendarContract.Calendars.CALENDAR_COLOR)
                val accountCol = it.getColumnIndexOrThrow(CalendarContract.Calendars.ACCOUNT_NAME)

                while (it.moveToNext()) {
                    val calendar = WritableNativeMap().apply {
                        putString("id", it.getLong(idCol).toString())
                        putString("name", it.getString(nameCol) ?: "")
                        putString("color", String.format("#%06X", 0xFFFFFF and it.getInt(colorCol)))
                        putString("accountName", it.getString(accountCol) ?: "")
                    }
                    calendars.pushMap(calendar)
                }
            }

            promise.resolve(calendars)
        } catch (e: Exception) {
            promise.reject("CALENDARS_ERROR", "Failed to get calendars: ${e.message}", e)
        }
    }

    /**
     * Get events in a time range for a specific calendar.
     * @param calendarId Calendar ID
     * @param startTime Start time in milliseconds since epoch
     * @param endTime End time in milliseconds since epoch
     */
    @ReactMethod
    fun getEvents(calendarId: String, startTime: Double, endTime: Double, promise: Promise) {
        try {
            val events = WritableNativeArray()
            val projection = arrayOf(
                CalendarContract.Events._ID,
                CalendarContract.Events.TITLE,
                CalendarContract.Events.DESCRIPTION,
                CalendarContract.Events.DTSTART,
                CalendarContract.Events.DTEND,
                CalendarContract.Events.EVENT_LOCATION,
                CalendarContract.Events.ALL_DAY,
            )

            val selection = "${CalendarContract.Events.CALENDAR_ID} = ? AND " +
                "${CalendarContract.Events.DTSTART} >= ? AND " +
                "${CalendarContract.Events.DTSTART} <= ?"
            val selectionArgs = arrayOf(
                calendarId,
                startTime.toLong().toString(),
                endTime.toLong().toString()
            )

            val cursor = reactApplicationContext.contentResolver.query(
                CalendarContract.Events.CONTENT_URI,
                projection,
                selection,
                selectionArgs,
                "${CalendarContract.Events.DTSTART} ASC"
            )

            cursor?.use {
                val idCol = it.getColumnIndexOrThrow(CalendarContract.Events._ID)
                val titleCol = it.getColumnIndexOrThrow(CalendarContract.Events.TITLE)
                val descCol = it.getColumnIndexOrThrow(CalendarContract.Events.DESCRIPTION)
                val startCol = it.getColumnIndexOrThrow(CalendarContract.Events.DTSTART)
                val endCol = it.getColumnIndexOrThrow(CalendarContract.Events.DTEND)
                val locationCol = it.getColumnIndexOrThrow(CalendarContract.Events.EVENT_LOCATION)
                val allDayCol = it.getColumnIndexOrThrow(CalendarContract.Events.ALL_DAY)

                while (it.moveToNext()) {
                    val event = WritableNativeMap().apply {
                        putString("id", it.getLong(idCol).toString())
                        putString("title", it.getString(titleCol) ?: "")
                        putString("description", it.getString(descCol) ?: "")
                        putDouble("startTime", it.getLong(startCol).toDouble())
                        putDouble("endTime", it.getLong(endCol).toDouble())
                        putString("location", it.getString(locationCol) ?: "")
                        putBoolean("allDay", it.getInt(allDayCol) == 1)
                    }
                    events.pushMap(event)
                }
            }

            promise.resolve(events)
        } catch (e: Exception) {
            promise.reject("EVENTS_ERROR", "Failed to get events: ${e.message}", e)
        }
    }

    /**
     * Create a new calendar event.
     * @param calendarId Calendar ID
     * @param title Event title
     * @param startTime Start time in milliseconds since epoch
     * @param endTime End time in milliseconds since epoch
     * @param description Event description
     * @param location Event location
     */
    @ReactMethod
    fun createEvent(
        calendarId: String,
        title: String,
        startTime: Double,
        endTime: Double,
        description: String,
        location: String,
        promise: Promise
    ) {
        try {
            val values = ContentValues().apply {
                put(CalendarContract.Events.CALENDAR_ID, calendarId.toLong())
                put(CalendarContract.Events.TITLE, title)
                put(CalendarContract.Events.DESCRIPTION, description)
                put(CalendarContract.Events.DTSTART, startTime.toLong())
                put(CalendarContract.Events.DTEND, endTime.toLong())
                put(CalendarContract.Events.EVENT_LOCATION, location)
                put(CalendarContract.Events.EVENT_TIMEZONE, TimeZone.getDefault().id)
            }

            val uri: Uri? = reactApplicationContext.contentResolver.insert(
                CalendarContract.Events.CONTENT_URI,
                values
            )

            if (uri != null) {
                val eventId = uri.lastPathSegment
                promise.resolve(eventId)
            } else {
                promise.reject("CREATE_ERROR", "Failed to create event: insert returned null")
            }
        } catch (e: Exception) {
            promise.reject("CREATE_ERROR", "Failed to create event: ${e.message}", e)
        }
    }

    /**
     * Delete a calendar event by ID.
     * @param eventId Event ID
     */
    @ReactMethod
    fun deleteEvent(eventId: String, promise: Promise) {
        try {
            val uri = CalendarContract.Events.CONTENT_URI
            val rowsDeleted = reactApplicationContext.contentResolver.delete(
                uri,
                "${CalendarContract.Events._ID} = ?",
                arrayOf(eventId)
            )

            promise.resolve(rowsDeleted > 0)
        } catch (e: Exception) {
            promise.reject("DELETE_ERROR", "Failed to delete event: ${e.message}", e)
        }
    }
}
