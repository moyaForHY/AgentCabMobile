/**
 * Action Executor
 * Executes structured actions returned by APIs.
 * See DEVICE_PROTOCOL.md for the full action spec.
 */
import { Linking, NativeModules } from 'react-native'
import { showModal } from '../components/AppModal'
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
import { actionStrings, permissionStrings, openPermissionEditor } from '../utils/i18n'

const DeviceInfoManager = NativeModules.DeviceInfoManager ?? null

function guideToSettings(permKey: string) {
  const s = permissionStrings(permKey)
  showModal(s.title, s.message, [
    { text: s.goSettings, onPress: () => openPermissionEditor() },
    { text: s.cancel, style: 'cancel' as const },
  ])
}

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
 * @param skipConfirm - if true, skip individual confirmation dialogs (used when user already confirmed at group level)
 */
export async function executeActions(actions: Action[], skipConfirm = false): Promise<ActionResult[]> {
  const results: ActionResult[] = []
  for (const action of actions) {
    try {
      const result = await withActionTimeout(executeSingleAction(action, skipConfirm), ACTION_TIMEOUT_MS)
      results.push(result)
    } catch (err: any) {
      results.push({ type: action.type, success: false, error: err.message || actionStrings().actionTimedOut })
    }
  }
  return results
}

/**
 * Execute a single action.
 */
async function executeSingleAction(action: Action, skipConfirm = false): Promise<ActionResult> {
  const t = actionStrings()
  const confirm = skipConfirm
    ? async (_msg: string, fn: () => Promise<any>, type: string) => { await fn(); return ok(type) }
    : withConfirm

  try {
    switch (action.type) {
      // ── File Operations ──
      case 'delete_file':
        return await confirm(
          t.deleteFile(action.path?.split('/').pop() || 'file'),
          async () => {
            const p = action.path || ''
            const isMedia = p.startsWith('content://') ||
              p.includes('/DCIM/') || p.includes('/Pictures/') ||
              p.includes('/Movies/') || p.includes('/Music/') ||
              /\.(jpg|jpeg|png|gif|webp|mp4|mov|mp3|m4a)$/i.test(p)
            try {
              if (isMedia) {
                return await deletePhoto(p)
              }
              return await FileSystem.deleteFile(p)
            } catch (e: any) {
              // Fallback: try the other method
              try {
                if (isMedia) return await FileSystem.deleteFile(p)
                else return await deletePhoto(p)
              } catch {}
              throw e
            }
          },
          action.type,
        )

      case 'delete_files':
        return await confirm(
          t.deleteFiles(action.paths?.length || 0),
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
        return await confirm(
          t.moveFile(action.dest),
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

      case 'download_file': {
        const dlPath = await downloadToDevice(action.url, action.filename, action.mimeType)
        if (!dlPath) return { type: action.type, success: false, error: t.downloadFailed }
        return ok(action.type)
      }

      // ── Calendar ──
      case 'create_event':
        await Calendar.createEvent(
          action.calendarId || '1',
          action.title,
          action.startTime,
          action.endTime,
          action.description || '',
          action.location || '',
          action.color,
        )
        return ok(action.type)

      case 'clear_calendar_prefix':
        await Calendar.deleteEventsByPrefix(action.calendarId || '1', action.prefix)
        return ok(action.type)

      case 'edit_event':
        await Calendar.editEvent(
          action.eventId,
          action.title,
          action.startTime,
          action.endTime,
          action.description,
          action.location,
        )
        return ok(action.type)

      case 'delete_event':
        return await confirm(
          t.deleteEvent,
          () => Calendar.deleteEvent(action.eventId),
          action.type,
        )

      case 'create_reminder':
        return await confirm(
          t.createReminder(action.title, new Date(action.time).toLocaleString()),
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
          return { type: action.type, success: false, error: t.noAlarmHandler }
        }

      // ── Communication ──
      case 'send_sms': {
        const DeviceInfo = NativeModules.DeviceInfoManager
        if (DeviceInfo?.sendSms) {
          try {
            const { requirePermission } = require('./permissionGate')
            const smsOk = await requirePermission('sms_send')
            if (smsOk) {
              await DeviceInfo.sendSms(action.number, action.text)
              return ok(action.type)
            }
          } catch {}
        }
        // Fallback: open SMS app (user needs to manually press send)
        try {
          await Linking.openURL(`sms:${action.number}?body=${encodeURIComponent(action.text)}`)
          return { type: action.type, success: true, error: t.smsAppOpened }
        } catch {
          return { type: action.type, success: false, error: t.sendSmsFailed }
        }
      }

      case 'make_call':
        try {
          await Linking.openURL(`tel:${action.number}`)
          return ok(action.type)
        } catch {
          return { type: action.type, success: false, error: 'Could not open dialer.' }
        }

      case 'save_contact':
        return await confirm(
          t.saveContact(action.name),
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
          return { type: action.type, success: false, error: t.cannotOpenUrl(action.url) }
        }

      // ── Notification ──
      case 'notify': {
        const { requirePermission } = require('./permissionGate')
        const notifOk = await requirePermission('notifications')
        if (!notifOk) return { type: action.type, success: false, error: t.notifPermDenied }
        await Notifications.showNotification(action.title, action.body)
        return ok(action.type)
      }

      case 'alarm': {
        // Play alarm sound + vibrate + show notification
        const { Vibration, NativeModules: NM } = require('react-native')
        // Vibrate pattern: wait 0ms, vibrate 500ms, pause 200ms, vibrate 500ms, pause 200ms, vibrate 500ms
        Vibration.vibrate([0, 500, 200, 500, 200, 500], false)
        // Show a high-priority notification with sound
        await Notifications.showNotification(
          action.title || 'Alarm',
          action.body || action.message || '',
        )
        // Play alarm sound via DeviceInfoModule if available
        try {
          const DeviceInfo = NM.DeviceInfoManager
          if (DeviceInfo?.playAlarmSound) {
            await DeviceInfo.playAlarmSound(action.duration || 5)
          }
        } catch {}
        return ok(action.type)
      }

      // ── App Operations ──
      case 'launch_app':
        try {
          await AppList.launchApp(action.packageName)
          return ok(action.type)
        } catch (e: any) {
          const msg = e?.message || ''
          if (msg.includes('not found') || msg.includes('not installed') || msg.includes('ActivityNotFoundException')) {
            return { type: action.type, success: false, error: t.appNotInstalled(action.packageName) }
          }
          return { type: action.type, success: false, error: msg || t.launchFailed(action.packageName) }
        }

      case 'uninstall_app':
        return await confirm(
          t.uninstallApp(action.packageName),
          async () => {
            try {
              await Linking.openURL(`package:${action.packageName}`)
            } catch {
              throw new Error(t.uninstallFailed)
            }
          },
          action.type,
        )

      case 'open_deeplink':
        try {
          await Linking.openURL(action.uri)
          return ok(action.type)
        } catch {
          return { type: action.type, success: false, error: t.cannotOpenDeeplink(action.uri) }
        }

      case 'set_wallpaper':
        return await confirm(
          t.setWallpaper,
          () => setWallpaper(action.url || action.path),
          action.type,
        )

      // ── Accessibility ──
      // All accessibility actions require the service to be enabled first
      case 'click_text':
      case 'set_text':
      case 'long_press':
      case 'scroll':
      case 'swipe':
      case 'press_back':
      case 'press_home':
      case 'open_notifications': {
        const a11yEnabled = await Accessibility.isAccessibilityEnabled()
        if (!a11yEnabled) {
          showModal(
            t.a11yRequiredTitle,
            t.a11yRequiredMsg,
            [
              { text: t.goSettings, onPress: () => Linking.openURL('android.settings.ACCESSIBILITY_SETTINGS') },
              { text: t.cancel, style: 'cancel' as const },
            ],
          )
          return { type: action.type, success: false, error: t.a11yNotEnabled }
        }

        switch (action.type) {
          case 'click_text':
            return await confirm(t.clickText(action.text), () => Accessibility.clickByText(action.text), action.type)
          case 'set_text':
            return await confirm(t.setText(action.newText), () => Accessibility.setTextByTarget(action.targetText, action.newText), action.type)
          case 'long_press':
            return await confirm(t.longPress(action.text), () => Accessibility.clickByText(action.text), action.type)
          case 'scroll':
            await Accessibility.scroll(action.direction || 'down'); return ok(action.type)
          case 'swipe':
            await Accessibility.swipe(action.startX, action.startY, action.endX, action.endY, action.duration || 300); return ok(action.type)
          case 'press_back':
            await Accessibility.pressBack(); return ok(action.type)
          case 'press_home':
            await Accessibility.pressHome(); return ok(action.type)
          case 'open_notifications':
            await Accessibility.openNotifications(); return ok(action.type)
          default:
            return ok(action.type)
        }
      }

      // ── Device Settings ──
      case 'set_brightness':
        return await confirm(
          t.setBrightness(action.level),
          async () => {
            if (!DeviceInfoManager?.setBrightness) throw new Error('Not available on this platform')
            try {
              await DeviceInfoManager.setBrightness(action.level)
            } catch (e: any) {
              // WRITE_SETTINGS is a special permission — guide user
              if (e?.message?.includes?.('WRITE_SETTINGS') || e?.message?.includes?.('permission')) {
                showModal(
                  t.writeSettingsTitle,
                  t.writeSettingsMsg,
                  [{ text: t.goSettings, onPress: () => Linking.openURL('android.settings.action.MANAGE_WRITE_SETTINGS') }],
                )
              }
              throw e
            }
          },
          action.type,
        )

      case 'set_volume':
        return await confirm(
          t.setVolume(action.stream || 'media', action.level),
          async () => {
            if (!DeviceInfoManager?.setVolume) throw new Error('Not available on this platform')
            await DeviceInfoManager.setVolume(action.stream || 'media', action.level)
          },
          action.type,
        )

      case 'toggle_wifi':
        return await confirm(
          t.toggleWifi(action.enabled),
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
        return await confirm(
          t.toggleBluetooth(action.enabled),
          async () => {
            try {
              await Linking.openURL('android.settings.BLUETOOTH_SETTINGS')
            } catch {
              throw new Error(t.bluetoothSettingsFailed)
            }
          },
          action.type,
        )

      case 'save_to_gallery': {
        const filename = action.filename || action.url?.split('/').pop() || `download_${Date.now()}`
        if (!action.url) return { type: action.type, success: false, error: t.downloadFailed }
        const downloadedPath = await downloadToDevice(action.url, filename)
        if (!downloadedPath) {
          return { type: action.type, success: false, error: t.downloadFailed }
        }
        try {
          if (DeviceInfoManager?.scanFile) await DeviceInfoManager.scanFile(downloadedPath)
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
          return { type: action.type, success: false, error: t.cannotOpenSettings(action.page) }
        }
      }

      case 'record_audio':
        try {
          await Linking.openURL('android.provider.MediaStore.Audio.Media.RECORD_SOUND_ACTION')
          return ok(action.type)
        } catch {
          return { type: action.type, success: false, error: t.noRecorder }
        }

      case 'take_photo': {
        const photo = await takePhoto()
        if (!photo) {
          return { type: action.type, success: false, error: t.photoCancelled }
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
        return await confirm(
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
        return { type: action.type, success: false, error: t.unknownAction(action.type) }
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
  const t = actionStrings()
  return new Promise(resolve => {
    showModal(
      '',
      message,
      [
        { text: t.cancel, style: 'cancel', onPress: () => resolve({ type, success: false, error: t.cancelledByUser }) },
        {
          text: t.ok,
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
