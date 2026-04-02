/**
 * Data Collector
 * Automatically collects device data based on input_schema format hints.
 * See DEVICE_PROTOCOL.md for the full format spec.
 */
import { NativeModules, PermissionsAndroid, Platform, AppState, Linking } from 'react-native'
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
import { permissionStrings, dataCollectionStrings, smsGuideStrings, getDeviceBrand, openPermissionEditor } from '../utils/i18n'

const DeviceInfoManager = NativeModules.DeviceInfoManager ?? null
const CallLogModule = NativeModules.CallLogModule ?? null
const SmsModule = NativeModules.SmsModule ?? null
const UsageStatsModule = NativeModules.UsageStatsManager ?? null

type DeviceOptions = {
  days?: number
  limit?: number
  include_hashes?: boolean
  directory?: string
  recursive?: boolean
  range_days?: number
  direction?: 'past' | 'future'
}

/** Show a modal guiding user to enable permission in Settings */
function guideToSettings(permKey: string) {
  const { showModal } = require('../components/AppModal')
  const s = permissionStrings(permKey)
  showModal(s.title, s.message, [
    { text: s.goSettings, onPress: () => openPermissionEditor() },
    { text: s.cancel, style: 'cancel' as const },
  ])
}

/** Error class for permission denials — should propagate to collectAllDeviceData */
class PermissionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PermissionError'
  }
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
          const ok = await PhotoScanner.requestPhotoPermission()
          if (!ok) throw new PermissionError('相册权限未开启')
          return await PhotoScanner.scanPhotos(options?.limit || 200, 0)
        })(), COLLECT_TIMEOUT, [])
      } catch (e) { if (e instanceof PermissionError) throw e; return [] }

    case 'device:photos_recent':
      try {
        return await withTimeout((async () => {
          const ok = await PhotoScanner.requestPhotoPermission()
          if (!ok) throw new PermissionError('相册权限未开启')
          const days = options?.days || 7
          const photos = await PhotoScanner.scanPhotos(options?.limit || 500, 0)
          const cutoff = Date.now() / 1000 - days * 86400
          return photos.filter((p: any) => p.dateAdded > cutoff)
        })(), COLLECT_TIMEOUT, [])
      } catch (e) { if (e instanceof PermissionError) throw e; return [] }

    case 'device:photo_hashes':
      try {
        return await withTimeout((async () => {
          const ok = await PhotoScanner.requestPhotoPermission()
          if (!ok) throw new PermissionError('相册权限未开启')
          const allPhotos = await PhotoScanner.scanPhotos(options?.limit || 500, 0)
          const uris = allPhotos.map((p: any) => p.uri)
          return await PhotoScanner.batchComputePhash(uris)
        })(), COLLECT_TIMEOUT, {} as any)
      } catch (e) { if (e instanceof PermissionError) throw e; return {} }

    // ── Calendar ──
    case 'device:calendar':
      try {
        return await withTimeout((async () => {
          const ok = await Calendar.requestCalendarPermission()
          if (!ok) throw new PermissionError('日历权限未开启')
          const rangeDays = options?.range_days || 30
          const dir = options?.direction || 'future'
          const now = Date.now()
          const start = dir === 'past' ? now - rangeDays * 86400000 : now
          const end = dir === 'past' ? now : now + rangeDays * 86400000
          return await Calendar.getEvents('1', start, end)
        })(), COLLECT_TIMEOUT, [])
      } catch (e) { if (e instanceof PermissionError) throw e; return [] }

    case 'device:calendar_week':
      try {
        return await withTimeout((async () => {
          const ok = await Calendar.requestCalendarPermission()
          if (!ok) throw new PermissionError('日历权限未开启')
          const now = Date.now()
          const weekAgo = now - 7 * 86400000
          return await Calendar.getEvents('1', weekAgo, now)
        })(), COLLECT_TIMEOUT, [])
      } catch (e) { if (e instanceof PermissionError) throw e; return [] }

    // ── Contacts ──
    case 'device:contacts':
      try {
        return await withTimeout((async () => {
          const ok = await Contacts.requestContactsPermission()
          if (!ok) throw new PermissionError('通讯录权限未开启')
          return await Contacts.getContacts(options?.limit || 500, 0)
        })(), COLLECT_TIMEOUT, [])
      } catch (e) { if (e instanceof PermissionError) throw e; return [] }

    // ── Call Log ──
    case 'device:call_log':
      try {
        if (!CallLogModule) throw new Error('Call log module not available')
        return await withTimeout((async () => {
          const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_CALL_LOG)
          if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
            if (granted === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) guideToSettings('call_log')
            throw new PermissionError('通话记录权限未开启')
          }
          return await CallLogModule.getCallLog(options?.limit || 200, options?.days || 30)
        })(), COLLECT_TIMEOUT, [])
      } catch (e) { if (e instanceof PermissionError) throw e; return [] }

    // ── SMS ──
    case 'device:sms':
      try {
        if (!SmsModule) throw new Error('SMS module not available')
        return await withTimeout((async () => {
          const smsGranted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_SMS)
          if (smsGranted !== PermissionsAndroid.RESULTS.GRANTED) {
            if (smsGranted === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) guideToSettings('sms')
            throw new PermissionError('短信权限未开启')
          }
          const limit = options?.limit || 100
          const days = options?.days || 30
          const result = await SmsModule.getRecentMessages(limit, days)
          if (AppState.currentState === 'active') {
            // Many Chinese Android skins block notification/service SMS by default
            // Detect by checking if any short-code service messages exist
            const brand = getDeviceBrand()
            const needsCheck = brand !== 'samsung' && brand !== 'other' // Samsung/stock Android don't have this issue
            const hasServiceSms = result?.some((msg: any) => {
              const addr = (msg.address || '').replace(/[^0-9]/g, '')
              return addr.length <= 6 || /^(10|12|95|106)/.test(addr)
            })
            if (needsCheck && !hasServiceSms) {
              const { showModal } = require('../components/AppModal')
              const sg = smsGuideStrings()
              showModal(sg.title, sg.message, [
                { text: sg.goSettings, onPress: () => openPermissionEditor() },
                { text: sg.skip, style: 'cancel' as const },
              ])
            }
          }
          return result
        })(), COLLECT_TIMEOUT, [])
      } catch (e) { if (e instanceof PermissionError) throw e; return [] }

    // ── Apps ──
    case 'device:apps':
      try {
        const apps = await withTimeout(AppListService.getInstalledApps(false), COLLECT_TIMEOUT, [])
        // OEM restriction: getInstalledApplications silently returns only self + a few system apps
        // A real device always has 10+ user apps; fewer means the permission is blocked
        if (apps.length < 10 && AppState.currentState === 'active') {
          const { showModal } = require('../components/AppModal')
          const zh = require('../utils/i18n').isChinese()
          const brand = getDeviceBrand()
          let msg: string
          if (zh) {
            switch (brand) {
              case 'xiaomi':
                msg = '需要开启"获取已安装应用列表"权限：\n\n设置 → 应用设置 → 应用管理 → AgentCab → 权限管理 → 获取已安装应用列表 → 允许'
                break
              case 'huawei':
                msg = '需要允许获取应用列表：\n\n设置 → 应用和服务 → 应用管理 → AgentCab → 权限 → 获取应用列表'
                break
              default:
                msg = '需要允许获取已安装应用列表，请在系统设置中开启相关权限。'
            }
          } else {
            msg = 'Permission to read installed apps is required. Please enable it in Settings → Apps → AgentCab → Permissions.'
          }
          showModal(
            zh ? '无法获取应用列表' : 'Cannot Read App List',
            msg,
            [
              { text: zh ? '去设置' : 'Open Settings', onPress: () => openPermissionEditor() },
              { text: zh ? '跳过' : 'Skip', style: 'cancel' as const },
            ],
          )
        }
        return apps
      } catch (e) { if (e instanceof PermissionError) throw e; return [] }

    // ── Storage ──
    case 'device:storage':
      try {
        return await withTimeout(FileSystem.getStorageStats(), COLLECT_TIMEOUT, null)
      } catch (e) { if (e instanceof PermissionError) throw e; return null }

    // ── Files ──
    case 'device:files':
      try {
        return await withTimeout((async () => {
          const dirs = await FileSystem.getDirectories()
          const dir = options?.directory ? (dirs as any)[options.directory] || options.directory : dirs.root
          return await FileSystem.listFiles(dir, options?.recursive || false)
        })(), COLLECT_TIMEOUT, [])
      } catch (e) { if (e instanceof PermissionError) throw e; return [] }

    case 'device:files_downloads':
      try {
        return await withTimeout((async () => {
          const d = await FileSystem.getDirectories()
          return await FileSystem.listFiles(d.downloads, false)
        })(), COLLECT_TIMEOUT, [])
      } catch (e) { if (e instanceof PermissionError) throw e; return [] }

    case 'device:files_documents':
      try {
        return await withTimeout((async () => {
          const d = await FileSystem.getDirectories()
          return await FileSystem.listFiles(d.documents, false)
        })(), COLLECT_TIMEOUT, [])
      } catch (e) { if (e instanceof PermissionError) throw e; return [] }

    // ── Location ──
    case 'device:location':
      try {
        if (!DeviceInfoManager) return { latitude: 0, longitude: 0, accuracy: -1 }
        return await withTimeout((async () => {
          const locGranted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION)
          if (locGranted !== PermissionsAndroid.RESULTS.GRANTED) {
            if (locGranted === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) guideToSettings('location')
            throw new PermissionError('位置权限未开启')
          }
          return await DeviceInfoManager.getLocation()
        })(), COLLECT_TIMEOUT, { latitude: 0, longitude: 0, accuracy: -1 })
      } catch (e) { if (e instanceof PermissionError) throw e; return { latitude: 0, longitude: 0, accuracy: -1 } }

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
      } catch (e) { if (e instanceof PermissionError) throw e; return null }

    // ── Screen Content (Accessibility) ──
    case 'device:screen_content':
      try {
        return await withTimeout((async () => {
          const enabled = await Accessibility.isAccessibilityEnabled()
          if (!enabled) return null
          return await Accessibility.getScreenContent()
        })(), COLLECT_TIMEOUT, null)
      } catch (e) { if (e instanceof PermissionError) throw e; return null }

    // ── Battery ──
    case 'device:battery':
      try {
        if (!DeviceInfoManager) return null
        return await withTimeout(DeviceInfoManager.getBatteryInfo(), COLLECT_TIMEOUT, null)
      } catch (e) { if (e instanceof PermissionError) throw e; return null }

    // ── WiFi ──
    case 'device:wifi':
      try {
        if (!DeviceInfoManager) return null
        return await withTimeout(DeviceInfoManager.getWifiInfo(), COLLECT_TIMEOUT, null)
      } catch (e) { if (e instanceof PermissionError) throw e; return null }

    // ── Device Info ──
    case 'device:device_info':
      try {
        if (!DeviceInfoManager) return null
        return await withTimeout(DeviceInfoManager.getDeviceInfo(), COLLECT_TIMEOUT, null)
      } catch (e) { if (e instanceof PermissionError) throw e; return null }

    // ── Storage Deep Scan ──
    case 'device:dir_sizes':
      try {
        return await withTimeout(StorageScanner.scanDirectorySizes(), COLLECT_TIMEOUT, [])
      } catch (e) { if (e instanceof PermissionError) throw e; return [] }

    case 'device:app_caches':
      try {
        return await withTimeout(StorageScanner.scanAppCaches(), COLLECT_TIMEOUT, [])
      } catch (e) { if (e instanceof PermissionError) throw e; return [] }

    case 'device:social_storage':
      try {
        return await withTimeout(StorageScanner.scanSocialAppStorage(), COLLECT_TIMEOUT, {} as any)
      } catch (e) { if (e instanceof PermissionError) throw e; return {} }

    case 'device:photo_bursts':
      try {
        return await withTimeout((async () => {
          const ok = await PhotoScanner.requestPhotoPermission()
          if (!ok) throw new PermissionError('相册权限未开启')
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
      } catch (e) { if (e instanceof PermissionError) throw e; return { bursts: [], totalBursts: 0, totalDeletable: 0 } }

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
            if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
              if (granted === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) guideToSettings('audio')
              throw new PermissionError('音频权限未开启')
            }
          }
          return await DeviceInfoManager.getAudioFiles(options?.limit || 200)
        })(), COLLECT_TIMEOUT, [])
      } catch (e) { if (e instanceof PermissionError) throw e; return [] }

    // ── Video Files ──
    case 'device:video':
      try {
        if (!DeviceInfoManager) return []
        return await withTimeout((async () => {
          if (Platform.OS === 'android') {
            const granted = await PermissionsAndroid.request(
              PermissionsAndroid.PERMISSIONS.READ_MEDIA_VIDEO,
            )
            if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
              if (granted === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) guideToSettings('video')
              throw new PermissionError('视频权限未开启')
            }
          }
          return await DeviceInfoManager.getVideoFiles(options?.limit || 200)
        })(), COLLECT_TIMEOUT, [])
      } catch (e) { if (e instanceof PermissionError) throw e; return [] }

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
            if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
              if (granted === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) guideToSettings('bluetooth')
              throw new PermissionError('蓝牙权限未开启')
            }
          }
          return await DeviceInfoManager.getBluetoothInfo()
        })(), COLLECT_TIMEOUT, { enabled: false, pairedDevices: [] })
      } catch (e) { if (e instanceof PermissionError) throw e; return { enabled: false, pairedDevices: [] } }

    // ── Brightness ──
    case 'device:brightness':
      try {
        if (!DeviceInfoManager) return { brightness: 0, isAutomatic: false }
        return await withTimeout(DeviceInfoManager.getBrightness(), COLLECT_TIMEOUT, { brightness: 0, isAutomatic: false })
      } catch (e) { if (e instanceof PermissionError) throw e; return { brightness: 0, isAutomatic: false } }

    // ── Volume ──
    case 'device:volume':
      try {
        if (!DeviceInfoManager) return { media: 0, ring: 0, notification: 0, alarm: 0, maxMedia: 0 }
        return await withTimeout(DeviceInfoManager.getVolumeInfo(), COLLECT_TIMEOUT, { media: 0, ring: 0, notification: 0, alarm: 0, maxMedia: 0 })
      } catch (e) { if (e instanceof PermissionError) throw e; return { media: 0, ring: 0, notification: 0, alarm: 0, maxMedia: 0 } }

    // ── Media Playing ──
    case 'device:media_playing':
      try {
        if (!DeviceInfoManager) return { isPlaying: false, error: 'DeviceInfoManager not available' }
        return await withTimeout(DeviceInfoManager.getMediaPlayingInfo(), COLLECT_TIMEOUT, null)
      } catch (e) { if (e instanceof PermissionError) throw e; return null }

    // ── Usage Stats ──
    case 'device:usage_stats':
      try {
        if (!UsageStatsModule) return []
        return await withTimeout((async () => {
          const granted = await UsageStatsModule.isPermissionGranted()
          if (!granted) {
            const { showModal } = require('../components/AppModal')
            const { isChinese } = require('../utils/i18n')
            const zh = isChinese()
            showModal(
              zh ? '需要使用情况访问权限' : 'Usage Access Required',
              zh ? '请在设置中开启"使用情况访问权限"以分析手机使用习惯' : 'Please enable "Usage Access" in Settings to analyze phone habits',
              [
                { text: zh ? '去设置' : 'Open Settings', onPress: () => UsageStatsModule.requestPermission() },
                { text: zh ? '跳过' : 'Skip', style: 'cancel' as const },
              ],
            )
            throw new PermissionError('使用情况访问权限未开启')
          }
          return await UsageStatsModule.getUsageStats(options?.days || 7)
        })(), COLLECT_TIMEOUT, [])
      } catch (e) { if (e instanceof PermissionError) throw e; return [] }

    case 'device:usage_daily':
      try {
        if (!UsageStatsModule) return []
        return await withTimeout((async () => {
          const granted = await UsageStatsModule.isPermissionGranted()
          if (!granted) throw new PermissionError('使用情况访问权限未开启')
          return await UsageStatsModule.getDailyBreakdown(options?.days || 7)
        })(), COLLECT_TIMEOUT, [])
      } catch (e) { if (e instanceof PermissionError) throw e; return [] }

    case 'device:usage_hourly':
      try {
        if (!UsageStatsModule) return []
        return await withTimeout((async () => {
          const granted = await UsageStatsModule.isPermissionGranted()
          if (!granted) throw new PermissionError('使用情况访问权限未开启')
          return await UsageStatsModule.getHourlyDistribution()
        })(), COLLECT_TIMEOUT, [])
      } catch (e) { if (e instanceof PermissionError) throw e; return [] }

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

  const failures: string[] = []

  // Collect sequentially — Android only allows one permission dialog at a time
  for (const [key, prop] of Object.entries(properties) as [string, any][]) {
    const format = prop.format || ''
    if (format.startsWith('device:')) {
      const options = prop['x-device-options'] || {}
      const fallback = prop.type === 'array' ? [] : prop.type === 'object' ? {} : prop.type === 'string' ? '' : null
      onProgress?.(key, 'collecting')
      try {
        const data = await collectByFormat(format, options)
        result[key] = data ?? fallback
        onProgress?.(key, 'done', data)
      } catch (e: any) {
        result[key] = fallback
        onProgress?.(key, 'failed')
        const label = prop.title || key
        failures.push(`${label}: ${e.message || 'Permission denied'}`)
      }
    }
  }

  // Show failures to user
  if (failures.length > 0) {
    const { showModal } = require('../components/AppModal')
    const ds = dataCollectionStrings()
    showModal(ds.title, failures.join('\n') + ds.suffix, [
      { text: ds.goSettings, onPress: () => openPermissionEditor() },
      { text: ds.continue_, style: 'cancel' as const },
    ])
  }

  // Detect suspiciously empty results — may indicate OEM silent blocking
  if (AppState.currentState === 'active' && failures.length === 0) {
    const emptyFields: string[] = []
    for (const [key, prop] of Object.entries(properties) as [string, any][]) {
      const format = prop.format || ''
      if (!format.startsWith('device:')) continue
      const data = result[key]
      // Only flag array-type fields that returned empty (photos, contacts, calendar, call_log, sms, apps)
      // Skip fields that can legitimately be empty (clipboard, location, battery, etc.)
      const expectsData = ['device:photos', 'device:photos_recent', 'device:contacts',
        'device:calendar', 'device:calendar_week', 'device:call_log', 'device:sms',
        'device:apps', 'device:files', 'device:files_downloads'].includes(format)
      if (expectsData && Array.isArray(data) && data.length === 0) {
        emptyFields.push(prop.title || key)
      }
    }
    if (emptyFields.length > 0) {
      const { showModal } = require('../components/AppModal')
      const zh = require('../utils/i18n').isChinese()
      showModal(
        zh ? '数据采集结果为空' : 'Empty Data Collected',
        (zh
          ? `以下数据采集为空，可能是权限未完全开启：\n\n${emptyFields.join('、')}\n\n如果确认已授权，部分手机系统可能需要额外开启相关权限。`
          : `The following data was empty, which may indicate missing permissions:\n\n${emptyFields.join(', ')}\n\nIf permissions are granted, your device may require additional settings.`),
        [
          { text: zh ? '去设置' : 'Open Settings', onPress: () => openPermissionEditor() },
          { text: zh ? '继续' : 'Continue', style: 'cancel' as const },
        ],
      )
    }
  }

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
