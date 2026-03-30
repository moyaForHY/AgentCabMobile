/**
 * Action Executor
 * Executes structured actions returned by APIs.
 * See DEVICE_PROTOCOL.md for the full action spec.
 */
import { Alert, Linking, NativeModules } from 'react-native'
import * as FileSystem from './fileSystem'
import { deletePhoto } from './photoScanner'
import * as Calendar from './calendar'
import * as AppList from './appList'
import * as Notifications from './notifications'
import * as Accessibility from './accessibility'
import { writeClipboard, shareText, shareFile, takePhoto } from './deviceCapabilities'
import { downloadToDevice } from './fileDownloader'
import { setWallpaper } from './screenshot'
import { saveContact } from './contacts'

const { DeviceInfoManager } = NativeModules

export type Action = {
  type: string
  [key: string]: any
}

type ActionResult = {
  type: string
  success: boolean
  error?: string
}

const ACTION_TIMEOUT_MS = 30000

/** Race a promise against a timeout. */
function withActionTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Action timed out')), ms)),
  ])
}

/**
 * Execute a list of actions sequentially.
 * Returns results for each action.
 */
export async function executeActions(actions: Action[]): Promise<ActionResult[]> {
  const results: ActionResult[] = []
  for (const action of actions) {
    try {
      const result = await withActionTimeout(executeSingleAction(action), ACTION_TIMEOUT_MS)
      results.push(result)
    } catch (err: any) {
      results.push({ type: action.type, success: false, error: err.message || 'Action timed out' })
    }
  }
  return results
}

/**
 * Execute a single action.
 */
async function executeSingleAction(action: Action): Promise<ActionResult> {
  try {
    switch (action.type) {
      // ── File Operations ──
      case 'delete_file':
        return await withConfirm(
          `Delete ${action.path?.split('/').pop() || 'file'}?`,
          async () => {
            try {
              if (action.path.startsWith('content://')) {
                return await deletePhoto(action.path)
              }
              return await FileSystem.deleteFile(action.path)
            } catch (e: any) {
              // Android 11+ may throw SecurityException for content:// URIs
              // requiring MediaStore.createDeleteRequest user confirmation
              if (e?.message?.includes?.('SecurityException') || e?.message?.includes?.('security')) {
                throw new Error('This file requires user confirmation to delete on this Android version. Please delete it manually.')
              }
              throw e
            }
          },
          action.type,
        )

      case 'delete_files':
        return await withConfirm(
          `Delete ${action.paths?.length || 0} files?`,
          async () => {
            for (const p of action.paths) {
              try {
                if (p.startsWith('content://')) {
                  await deletePhoto(p)
                } else {
                  await FileSystem.deleteFile(p)
                }
              } catch (e: any) {
                if (e?.message?.includes?.('SecurityException') || e?.message?.includes?.('security')) {
                  console.warn(`Skipping ${p}: requires user confirmation on this Android version`)
                  continue
                }
                throw e
              }
            }
            return true
          },
          action.type,
        )

      case 'move_file':
        return await withConfirm(
          `Move file to ${action.dest}?`,
          () => FileSystem.moveFile(action.source, action.dest),
          action.type,
        )

      case 'copy_file':
        await FileSystem.copyFile(action.source, action.dest)
        return ok(action.type)

      case 'create_directory':
        await FileSystem.createDirectory(action.path)
        return ok(action.type)

      case 'write_file':
        await FileSystem.writeTextFile(action.path, action.content)
        return ok(action.type)

      case 'download_file':
        await downloadToDevice(action.url, action.filename, action.mimeType)
        return ok(action.type)

      // ── Calendar ──
      case 'create_event':
        await Calendar.createEvent(
          action.calendarId || '1',
          action.title,
          action.startTime,
          action.endTime,
          action.description || '',
          action.location || '',
        )
        return ok(action.type)

      case 'delete_event':
        return await withConfirm(
          `Delete calendar event?`,
          () => Calendar.deleteEvent(action.eventId),
          action.type,
        )

      case 'create_reminder':
        return await withConfirm(
          `Create reminder: "${action.title}" at ${new Date(action.time).toLocaleString()}?`,
          async () => {
            await Calendar.requestCalendarPermission()
            const reminderTime = new Date(action.time).getTime()
            const minutesBefore = action.minutes_before ?? 10
            // Create a 30-minute event at the reminder time
            const eventId = await Calendar.createEvent(
              action.calendarId || '1',
              action.title,
              reminderTime,
              reminderTime + 30 * 60 * 1000,
              action.description || '',
              '',
            )
            // Attach an alarm/reminder to the event
            await Calendar.addReminder(eventId, minutesBefore)
          },
          action.type,
        )

      case 'set_alarm':
        try {
          await Linking.openURL(`content://com.android.deskclock/alarm?hour=${action.hour}&minutes=${action.minute}`)
          return ok(action.type)
        } catch {
          return { type: action.type, success: false, error: 'Could not open clock app. No handler for alarm intent.' }
        }

      // ── Communication ──
      case 'send_sms':
        try {
          await Linking.openURL(`sms:${action.number}?body=${encodeURIComponent(action.text)}`)
          return ok(action.type)
        } catch {
          return { type: action.type, success: false, error: 'Could not open SMS app.' }
        }

      case 'make_call':
        try {
          await Linking.openURL(`tel:${action.number}`)
          return ok(action.type)
        } catch {
          return { type: action.type, success: false, error: 'Could not open dialer.' }
        }

      case 'save_contact':
        return await withConfirm(
          `Save contact "${action.name}"?`,
          () => saveContact({
            name: action.name,
            phone: action.phone,
            email: action.email,
            company: action.company,
            title: action.title,
          }),
          action.type,
        )

      // ── Share & Clipboard ──
      case 'share_text':
        await shareText(action.text, action.title)
        return ok(action.type)

      case 'share_file':
        await shareFile(action.url, action.filename, action.mimeType)
        return ok(action.type)

      case 'copy_clipboard':
        writeClipboard(action.text)
        return ok(action.type)

      case 'open_url':
        try {
          await Linking.openURL(action.url)
          return ok(action.type)
        } catch {
          return { type: action.type, success: false, error: `Cannot open URL: ${action.url}` }
        }

      // ── Notification ──
      case 'notify':
        await Notifications.showNotification(action.title, action.body)
        return ok(action.type)

      // ── App Operations ──
      case 'launch_app':
        try {
          await AppList.launchApp(action.packageName)
          return ok(action.type)
        } catch (e: any) {
          const msg = e?.message || ''
          if (msg.includes('not found') || msg.includes('not installed') || msg.includes('ActivityNotFoundException')) {
            return { type: action.type, success: false, error: `App not installed: ${action.packageName}` }
          }
          return { type: action.type, success: false, error: msg || `Failed to launch ${action.packageName}` }
        }

      case 'uninstall_app':
        return await withConfirm(
          `Uninstall ${action.packageName}?`,
          async () => {
            try {
              await Linking.openURL(`package:${action.packageName}`)
            } catch {
              throw new Error('Could not open uninstall dialog.')
            }
          },
          action.type,
        )

      case 'open_deeplink':
        try {
          await Linking.openURL(action.uri)
          return ok(action.type)
        } catch {
          return { type: action.type, success: false, error: `Cannot open deeplink: ${action.uri}` }
        }

      case 'set_wallpaper':
        return await withConfirm(
          'Set as wallpaper?',
          () => setWallpaper(action.url || action.path),
          action.type,
        )

      // ── Accessibility ──
      case 'click_text':
        return await withConfirm(
          `Click "${action.text}"?`,
          () => Accessibility.clickByText(action.text),
          action.type,
        )

      case 'set_text':
        return await withConfirm(
          `Set text to "${action.newText}"?`,
          () => Accessibility.setTextByTarget(action.targetText, action.newText),
          action.type,
        )

      case 'long_press':
        // Long press is click for now (accessibility doesn't distinguish easily)
        return await withConfirm(
          `Long press "${action.text}"?`,
          () => Accessibility.clickByText(action.text),
          action.type,
        )

      case 'scroll':
        await Accessibility.scroll(action.direction || 'down')
        return ok(action.type)

      case 'swipe':
        await Accessibility.swipe(action.startX, action.startY, action.endX, action.endY, action.duration || 300)
        return ok(action.type)

      case 'press_back':
        await Accessibility.pressBack()
        return ok(action.type)

      case 'press_home':
        await Accessibility.pressHome()
        return ok(action.type)

      case 'open_notifications':
        await Accessibility.openNotifications()
        return ok(action.type)

      // ── Device Settings ──
      case 'set_brightness':
        return await withConfirm(
          `Set brightness to ${action.level}?`,
          () => DeviceInfoManager.setBrightness(action.level),
          action.type,
        )

      case 'set_volume':
        return await withConfirm(
          `Set ${action.stream || 'media'} volume to ${action.level}?`,
          () => DeviceInfoManager.setVolume(action.stream || 'media', action.level),
          action.type,
        )

      case 'toggle_wifi':
        return await withConfirm(
          `Open Wi-Fi settings to ${action.enabled ? 'enable' : 'disable'} Wi-Fi?`,
          async () => {
            try {
              await Linking.openURL('android.settings.panel://com.android.settings.panel.action.WIFI')
            } catch {
              // Fallback to standard wifi settings
              await Linking.openURL('android.settings.WIFI_SETTINGS')
            }
          },
          action.type,
        )

      case 'toggle_bluetooth':
        return await withConfirm(
          `Open Bluetooth settings to ${action.enabled ? 'enable' : 'disable'} Bluetooth?`,
          async () => {
            try {
              await Linking.openURL('android.settings.BLUETOOTH_SETTINGS')
            } catch {
              throw new Error('Could not open Bluetooth settings.')
            }
          },
          action.type,
        )

      case 'save_to_gallery': {
        const filename = action.filename || action.url.split('/').pop() || `download_${Date.now()}`
        const downloadedPath = await downloadToDevice(action.url, filename)
        if (!downloadedPath) {
          return { type: action.type, success: false, error: 'Failed to download file.' }
        }
        try {
          await DeviceInfoManager.scanFile(downloadedPath)
        } catch {
          // Media scan failed but file was downloaded
        }
        return ok(action.type)
      }

      case 'open_settings': {
        const settingsMap: Record<string, string> = {
          wifi: 'android.settings.WIFI_SETTINGS',
          bluetooth: 'android.settings.BLUETOOTH_SETTINGS',
          display: 'android.settings.DISPLAY_SETTINGS',
          sound: 'android.settings.SOUND_SETTINGS',
          battery: 'android.intent.action.POWER_USAGE_SUMMARY',
          storage: 'android.settings.INTERNAL_STORAGE_SETTINGS',
          apps: 'android.settings.APPLICATION_SETTINGS',
          location: 'android.settings.LOCATION_SOURCE_SETTINGS',
          security: 'android.settings.SECURITY_SETTINGS',
          accessibility: 'android.settings.ACCESSIBILITY_SETTINGS',
        }
        const settingsAction = action.page ? settingsMap[action.page] : undefined
        try {
          if (settingsAction) {
            await Linking.openURL(settingsAction)
          } else {
            await Linking.openURL('android.settings.SETTINGS')
          }
          return ok(action.type)
        } catch {
          return { type: action.type, success: false, error: `Could not open settings${action.page ? ` (${action.page})` : ''}.` }
        }
      }

      case 'record_audio':
        try {
          await Linking.openURL('android.provider.MediaStore.Audio.Media.RECORD_SOUND_ACTION')
        } catch {
          try {
            // Fallback: open sound recorder via generic intent
            await Linking.openURL('android.intent.action.MAIN')
          } catch {
            return { type: action.type, success: false, error: 'No voice recorder app found.' }
          }
        }
        return ok(action.type)

      case 'take_photo': {
        const photo = await takePhoto()
        if (!photo) {
          return { type: action.type, success: false, error: 'Photo capture cancelled or failed.' }
        }
        return { type: action.type, success: true }
      }

      case 'create_note': {
        const timestamp = Date.now()
        const noteFilename = `note_${timestamp}.txt`
        const dirs = await FileSystem.getDirectories()
        const notePath = `${dirs.documents}/${noteFilename}`
        const noteContent = action.title ? `${action.title}\n\n${action.content}` : action.content
        await FileSystem.writeTextFile(notePath, noteContent)
        return ok(action.type)
      }

      // ── Composite ──
      case 'confirm_actions':
        return await withConfirm(
          action.message,
          async () => {
            await executeActions(action.actions)
            return true
          },
          action.type,
        )

      case 'sequence':
        for (const subAction of action.actions) {
          await executeSingleAction(subAction)
          if (action.delay_ms) {
            await sleep(action.delay_ms)
          }
        }
        return ok(action.type)

      default:
        return { type: action.type, success: false, error: `Unknown action: ${action.type}` }
    }
  } catch (err: any) {
    return { type: action.type, success: false, error: err.message }
  }
}

// ── Helpers ──

function ok(type: string): ActionResult {
  return { type, success: true }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Wrap an action in a user confirmation dialog.
 */
function withConfirm(message: string, execute: () => Promise<any>, type: string): Promise<ActionResult> {
  return new Promise(resolve => {
    Alert.alert(
      'Confirm',
      message,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve({ type, success: false, error: 'Cancelled by user' }) },
        {
          text: 'OK',
          onPress: async () => {
            try {
              await execute()
              resolve({ type, success: true })
            } catch (err: any) {
              resolve({ type, success: false, error: err.message })
            }
          },
        },
      ],
    )
  })
}
