/**
 * Data Collector
 * Automatically collects device data based on input_schema format hints.
 * See DEVICE_PROTOCOL.md for the full format spec.
 */
import { NativeModules, PermissionsAndroid, Platform } from 'react-native'
import * as FileSystem from './fileSystem'
import * as PhotoScanner from './photoScanner'
import * as Calendar from './calendar'
import * as Contacts from './contacts'
import * as AppListService from './appList'
import * as Accessibility from './accessibility'
import { readClipboard } from './deviceCapabilities'
import * as StorageScanner from './storageScanner'
import { takeScreenshot } from './screenshot'
import { uploadFile } from './api'

const DeviceInfoManager = NativeModules.DeviceInfoManager ?? null
const CallLogModule = NativeModules.CallLogModule ?? null
const SmsModule = NativeModules.SmsModule ?? null

type DeviceOptions = {
  days?: number
  limit?: number
  include_hashes?: boolean
  directory?: string
  recursive?: boolean
  range_days?: number
  direction?: 'past' | 'future'
}

/** Race a promise against a timeout. Returns fallback on timeout. */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>(resolve => setTimeout(() => resolve(fallback), ms)),
  ])
}

const COLLECT_TIMEOUT = 10000

/**
 * Collect data for a single field based on its format.
 * Returns the collected data, or null if permission denied / unavailable.
 */
export async function collectByFormat(format: string, options?: DeviceOptions): Promise<any> {
  switch (format) {
    // ── Photos ──
    case 'device:photos':
      try {
        return await withTimeout((async () => {
          await PhotoScanner.requestPhotoPermission()
          return await PhotoScanner.scanPhotos(options?.limit || 200, 0)
        })(), COLLECT_TIMEOUT, [])
      } catch { return [] }

    case 'device:photos_recent':
      try {
        return await withTimeout((async () => {
          await PhotoScanner.requestPhotoPermission()
          const days = options?.days || 7
          const photos = await PhotoScanner.scanPhotos(options?.limit || 500, 0)
          const cutoff = Date.now() / 1000 - days * 86400
          return photos.filter((p: any) => p.dateAdded > cutoff)
        })(), COLLECT_TIMEOUT, [])
      } catch { return [] }

    case 'device:photo_hashes':
      try {
        return await withTimeout((async () => {
          await PhotoScanner.requestPhotoPermission()
          const allPhotos = await PhotoScanner.scanPhotos(options?.limit || 500, 0)
          const uris = allPhotos.map((p: any) => p.uri)
          return await PhotoScanner.batchComputePhash(uris)
        })(), COLLECT_TIMEOUT, {} as any)
      } catch { return {} }

    // ── Calendar ──
    case 'device:calendar':
      try {
        return await withTimeout((async () => {
          await Calendar.requestCalendarPermission()
          const rangeDays = options?.range_days || 30
          const dir = options?.direction || 'future'
          const now = Date.now()
          const start = dir === 'past' ? now - rangeDays * 86400000 : now
          const end = dir === 'past' ? now : now + rangeDays * 86400000
          return await Calendar.getEvents('1', start, end)
        })(), COLLECT_TIMEOUT, [])
      } catch { return [] }

    case 'device:calendar_week':
      try {
        return await withTimeout((async () => {
          await Calendar.requestCalendarPermission()
          const now = Date.now()
          const weekAgo = now - 7 * 86400000
          return await Calendar.getEvents('1', weekAgo, now)
        })(), COLLECT_TIMEOUT, [])
      } catch { return [] }

    // ── Contacts ──
    case 'device:contacts':
      try {
        return await withTimeout((async () => {
          await Contacts.requestContactsPermission()
          return await Contacts.getContacts(options?.limit || 500, 0)
        })(), COLLECT_TIMEOUT, [])
      } catch { return [] }

    // ── Call Log ──
    case 'device:call_log':
      try {
        if (!PermissionsAndroid.PERMISSIONS.READ_CALL_LOG || !CallLogModule) return []
        return await withTimeout((async () => {
          const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_CALL_LOG)
          if (granted !== PermissionsAndroid.RESULTS.GRANTED) return null
          return await CallLogModule.getCallLog(options?.limit || 200, options?.days || 30)
        })(), COLLECT_TIMEOUT, [])
      } catch { return [] }

    // ── SMS ──
    case 'device:sms':
      try {
        if (!SmsModule || !PermissionsAndroid.PERMISSIONS.READ_SMS) return []
        return await withTimeout((async () => {
          const smsGranted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_SMS)
          if (smsGranted !== PermissionsAndroid.RESULTS.GRANTED) return null
          const limit = options?.limit || 100
          const days = options?.days || 30
          return await SmsModule.getRecentMessages(limit, days)
        })(), COLLECT_TIMEOUT, [])
      } catch { return [] }

    // ── Apps ──
    case 'device:apps':
      try {
        return await withTimeout(AppListService.getInstalledApps(false), COLLECT_TIMEOUT, [])
      } catch { return [] }

    // ── Storage ──
    case 'device:storage':
      try {
        return await withTimeout(FileSystem.getStorageStats(), COLLECT_TIMEOUT, null)
      } catch { return null }

    // ── Files ──
    case 'device:files':
      try {
        return await withTimeout((async () => {
          const dirs = await FileSystem.getDirectories()
          const dir = options?.directory ? (dirs as any)[options.directory] || options.directory : dirs.root
          return await FileSystem.listFiles(dir, options?.recursive || false)
        })(), COLLECT_TIMEOUT, [])
      } catch { return [] }

    case 'device:files_downloads':
      try {
        return await withTimeout((async () => {
          const d = await FileSystem.getDirectories()
          return await FileSystem.listFiles(d.downloads, false)
        })(), COLLECT_TIMEOUT, [])
      } catch { return [] }

    case 'device:files_documents':
      try {
        return await withTimeout((async () => {
          const d = await FileSystem.getDirectories()
          return await FileSystem.listFiles(d.documents, false)
        })(), COLLECT_TIMEOUT, [])
      } catch { return [] }

    // ── Location ──
    case 'device:location':
      try {
        if (!DeviceInfoManager) return { latitude: 0, longitude: 0, accuracy: -1 }
        return await withTimeout((async () => {
          const locGranted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION)
          if (locGranted !== PermissionsAndroid.RESULTS.GRANTED) return { latitude: 0, longitude: 0, accuracy: -1 }
          return await DeviceInfoManager.getLocation()
        })(), COLLECT_TIMEOUT, { latitude: 0, longitude: 0, accuracy: -1 })
      } catch { return { latitude: 0, longitude: 0, accuracy: -1 } }

    // ── Clipboard ──
    case 'device:clipboard':
      try {
        return await withTimeout(readClipboard(), COLLECT_TIMEOUT, '')
      } catch { return '' }

    // ── Screenshot ──
    case 'device:screenshot':
      try {
        return await withTimeout((async () => {
          const shot = await takeScreenshot()
          // Upload to AgentCab and return file_id
          const uploaded = await uploadFile(shot.uri, 'screenshot.jpg', 'image/jpeg')
          return uploaded.file_id
        })(), COLLECT_TIMEOUT, null)
      } catch { return null }

    // ── Screen Content (Accessibility) ──
    case 'device:screen_content':
      try {
        return await withTimeout((async () => {
          const enabled = await Accessibility.isAccessibilityEnabled()
          if (!enabled) return null
          return await Accessibility.getScreenContent()
        })(), COLLECT_TIMEOUT, null)
      } catch { return null }

    // ── Battery ──
    case 'device:battery':
      try {
        if (!DeviceInfoManager) return null
        return await withTimeout(DeviceInfoManager.getBatteryInfo(), COLLECT_TIMEOUT, null)
      } catch { return null }

    // ── WiFi ──
    case 'device:wifi':
      try {
        if (!DeviceInfoManager) return null
        return await withTimeout(DeviceInfoManager.getWifiInfo(), COLLECT_TIMEOUT, null)
      } catch { return null }

    // ── Device Info ──
    case 'device:device_info':
      try {
        if (!DeviceInfoManager) return null
        return await withTimeout(DeviceInfoManager.getDeviceInfo(), COLLECT_TIMEOUT, null)
      } catch { return null }

    // ── Storage Deep Scan ──
    case 'device:dir_sizes':
      try {
        return await withTimeout(StorageScanner.scanDirectorySizes(), COLLECT_TIMEOUT, [])
      } catch { return [] }

    case 'device:app_caches':
      try {
        return await withTimeout(StorageScanner.scanAppCaches(), COLLECT_TIMEOUT, [])
      } catch { return [] }

    case 'device:social_storage':
      try {
        return await withTimeout(StorageScanner.scanSocialAppStorage(), COLLECT_TIMEOUT, {} as any)
      } catch { return {} }

    case 'device:photo_bursts':
      try {
        return await withTimeout((async () => {
          await PhotoScanner.requestPhotoPermission()
          const allPhotos = await PhotoScanner.scanPhotos(options?.limit || 500, 0)
          const timestamps = allPhotos.map((p: any) => p.dateAdded)
          const burstResult = await StorageScanner.analyzePhotoBursts(timestamps)
          // Enrich bursts with actual photo URIs so skills can generate delete actions
          if (burstResult.bursts && Array.isArray(burstResult.bursts)) {
            for (const burst of burstResult.bursts) {
              const photos = allPhotos.slice(burst.startIndex, burst.endIndex + 1)
              // Keep first as "best", rest are deletable
              burst.keepUri = photos[0]?.uri || null
              burst.deletableUris = photos.slice(1).map((p: any) => p.uri)
            }
          }
          return burstResult
        })(), COLLECT_TIMEOUT, { bursts: [], totalBursts: 0, totalDeletable: 0 } as any)
      } catch { return { bursts: [], totalBursts: 0, totalDeletable: 0 } }

    // ── Notifications ──
    case 'device:notifications':
      return { available: false, reason: 'Notification access requires special permission. Go to Settings > Notification access to enable.' }

    // ── Audio Files ──
    case 'device:audio':
      try {
        if (!DeviceInfoManager) return []
        return await withTimeout((async () => {
          if (Platform.OS === 'android') {
            const granted = await PermissionsAndroid.request(
              'android.permission.READ_MEDIA_AUDIO' as any,
            )
            if (granted !== PermissionsAndroid.RESULTS.GRANTED) return []
          }
          return await DeviceInfoManager.getAudioFiles(options?.limit || 200)
        })(), COLLECT_TIMEOUT, [])
      } catch { return [] }

    // ── Video Files ──
    case 'device:video':
      try {
        if (!DeviceInfoManager) return []
        return await withTimeout((async () => {
          if (Platform.OS === 'android') {
            const granted = await PermissionsAndroid.request(
              PermissionsAndroid.PERMISSIONS.READ_MEDIA_VIDEO,
            )
            if (granted !== PermissionsAndroid.RESULTS.GRANTED) return []
          }
          return await DeviceInfoManager.getVideoFiles(options?.limit || 200)
        })(), COLLECT_TIMEOUT, [])
      } catch { return [] }

    // ── Health ──
    case 'device:health':
      return { available: false, reason: 'Health data requires Google Fit or Health Connect integration. Coming soon.' }

    // ── Bluetooth ──
    case 'device:bluetooth':
      try {
        if (!DeviceInfoManager) return { enabled: false, pairedDevices: [] }
        return await withTimeout((async () => {
          if (Platform.OS === 'android' && Platform.Version >= 31) {
            const granted = await PermissionsAndroid.request(
              'android.permission.BLUETOOTH_CONNECT' as any,
            )
            if (granted !== PermissionsAndroid.RESULTS.GRANTED) return { enabled: false, pairedDevices: [] }
          }
          return await DeviceInfoManager.getBluetoothInfo()
        })(), COLLECT_TIMEOUT, { enabled: false, pairedDevices: [] })
      } catch { return { enabled: false, pairedDevices: [] } }

    // ── Brightness ──
    case 'device:brightness':
      try {
        if (!DeviceInfoManager) return { brightness: 0, isAutomatic: false }
        return await withTimeout(DeviceInfoManager.getBrightness(), COLLECT_TIMEOUT, { brightness: 0, isAutomatic: false })
      } catch { return { brightness: 0, isAutomatic: false } }

    // ── Volume ──
    case 'device:volume':
      try {
        if (!DeviceInfoManager) return { media: 0, ring: 0, notification: 0, alarm: 0, maxMedia: 0 }
        return await withTimeout(DeviceInfoManager.getVolumeInfo(), COLLECT_TIMEOUT, { media: 0, ring: 0, notification: 0, alarm: 0, maxMedia: 0 })
      } catch { return { media: 0, ring: 0, notification: 0, alarm: 0, maxMedia: 0 } }

    // ── Media Playing ──
    case 'device:media_playing':
      try {
        if (!DeviceInfoManager) return { isPlaying: false, error: 'DeviceInfoManager not available' }
        return await withTimeout(DeviceInfoManager.getMediaPlayingInfo(), COLLECT_TIMEOUT, null)
      } catch { return null }

    default:
      return null
  }
}

/**
 * Collect all device:* fields from an input_schema.
 * Calls onProgress for each field as it completes.
 */
export async function collectAllDeviceData(
  schema: Record<string, any>,
  onProgress?: (key: string, status: 'collecting' | 'done' | 'failed', data?: any) => void,
): Promise<Record<string, any>> {
  const properties = schema.properties || {}
  const result: Record<string, any> = {}

  const promises: Promise<void>[] = []

  for (const [key, prop] of Object.entries(properties) as [string, any][]) {
    const format = prop.format || ''
    if (format.startsWith('device:')) {
      const options = prop['x-device-options'] || {}
      const fallback = prop.type === 'array' ? [] : prop.type === 'object' ? {} : prop.type === 'string' ? '' : null
      promises.push(
        (async () => {
          onProgress?.(key, 'collecting')
          try {
            const data = await collectByFormat(format, options)
            result[key] = data ?? fallback
            onProgress?.(key, 'done', data)
          } catch {
            result[key] = fallback
            onProgress?.(key, 'failed')
          }
        })(),
      )
    }
  }

  await Promise.all(promises)
  return result
}

/**
 * Check which device formats are in the schema.
 */
export function getDeviceFormats(schema: Record<string, any>): string[] {
  const properties = schema.properties || {}
  const formats: string[] = []
  for (const [, prop] of Object.entries(properties) as [string, any][]) {
    const format = prop.format || ''
    if (format.startsWith('device:')) {
      formats.push(format)
    }
  }
  return formats
}
