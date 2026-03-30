/**
 * Calendar Bridge
 * Exposes native CalendarManager module to TypeScript.
 * Enables APIs to read, create, and delete calendar events.
 */
import { NativeModules, Platform, PermissionsAndroid } from 'react-native'

const { CalendarManager } = NativeModules

export type CalendarInfo = {
  id: string
  name: string
  color: string
  accountName: string
}

export type CalendarEvent = {
  id: string
  title: string
  description: string
  startTime: number
  endTime: number
  location: string
  allDay: boolean
}

/**
 * Request calendar permissions (READ_CALENDAR and WRITE_CALENDAR).
 */
export async function requestCalendarPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false

  const readPermission = PermissionsAndroid.PERMISSIONS.READ_CALENDAR
  const writePermission = PermissionsAndroid.PERMISSIONS.WRITE_CALENDAR

  const readGranted = await PermissionsAndroid.check(readPermission)
  const writeGranted = await PermissionsAndroid.check(writePermission)
  if (readGranted && writeGranted) return true

  const results = await PermissionsAndroid.requestMultiple([
    readPermission,
    writePermission,
  ])

  return (
    results[readPermission] === PermissionsAndroid.RESULTS.GRANTED &&
    results[writePermission] === PermissionsAndroid.RESULTS.GRANTED
  )
}

/**
 * List all available calendars on the device.
 */
export async function getCalendars(): Promise<CalendarInfo[]> {
  return CalendarManager.getCalendars()
}

/**
 * Get events in a time range for a specific calendar.
 * @param calendarId Calendar ID
 * @param startTime Start time in milliseconds since epoch
 * @param endTime End time in milliseconds since epoch
 */
export async function getEvents(
  calendarId: string,
  startTime: number,
  endTime: number,
): Promise<CalendarEvent[]> {
  return CalendarManager.getEvents(calendarId, startTime, endTime)
}

/**
 * Create a new calendar event.
 * @returns The ID of the created event
 */
export async function createEvent(
  calendarId: string,
  title: string,
  startTime: number,
  endTime: number,
  description = '',
  location = '',
): Promise<string> {
  return CalendarManager.createEvent(
    calendarId,
    title,
    startTime,
    endTime,
    description,
    location,
  )
}

/**
 * Delete a calendar event by ID.
 * @returns true if the event was deleted
 */
export async function deleteEvent(eventId: string): Promise<boolean> {
  return CalendarManager.deleteEvent(eventId)
}

/**
 * Add a reminder (alarm) to an existing calendar event.
 * @param eventId The event to attach the reminder to
 * @param minutesBefore Minutes before the event to fire the alarm
 */
export async function addReminder(eventId: string, minutesBefore: number): Promise<boolean> {
  return CalendarManager.addReminder(eventId, minutesBefore)
}
