/**
 * Unified permission gate.
 *
 * Callers use `requirePermission('storage')` or `requirePermissions(['photos','audio'])`
 * before any operation that needs runtime permissions. If any are missing, a
 * modal explains which permission is required and offers to open settings.
 *
 * Goal: no more silent failures from missing permissions.
 */
import { PermissionsAndroid, Permission, Platform } from 'react-native'
import { permissionStrings, openPermissionEditor } from '../utils/i18n'
import { showModal } from '../components/AppModal'

export type PermType =
  | 'photos'
  | 'storage'
  | 'calendar'
  | 'contacts'
  | 'call_log'
  | 'sms'
  | 'sms_send'
  | 'location'
  | 'audio'       // microphone — recording
  | 'video'
  | 'bluetooth'
  | 'notifications'
  | 'camera'

/**
 * Map an app-level permission type to the concrete Android permissions the OS
 * needs granted. On Android 13+ media access is split by type.
 */
function androidPermsFor(type: PermType): Permission[] {
  const P = PermissionsAndroid.PERMISSIONS
  const sdk = Platform.Version as number
  switch (type) {
    case 'photos':
      return sdk >= 33 ? [P.READ_MEDIA_IMAGES] : [P.READ_EXTERNAL_STORAGE]
    case 'storage':
      return sdk >= 33 ? [P.READ_MEDIA_IMAGES, P.READ_MEDIA_VIDEO] : [P.READ_EXTERNAL_STORAGE, P.WRITE_EXTERNAL_STORAGE]
    case 'video':
      return sdk >= 33 ? [P.READ_MEDIA_VIDEO] : [P.READ_EXTERNAL_STORAGE]
    case 'audio':
      return [P.RECORD_AUDIO]
    case 'calendar':
      return [P.READ_CALENDAR, P.WRITE_CALENDAR]
    case 'contacts':
      return [P.READ_CONTACTS]
    case 'call_log':
      return [P.READ_CALL_LOG]
    case 'sms':
      return [P.READ_SMS]
    case 'sms_send':
      return [P.SEND_SMS]
    case 'location':
      return [P.ACCESS_FINE_LOCATION]
    case 'bluetooth':
      return sdk >= 31 ? [P.BLUETOOTH_CONNECT, P.BLUETOOTH_SCAN] : []
    case 'notifications':
      return sdk >= 33 ? [P.POST_NOTIFICATIONS] : []
    case 'camera':
      return [P.CAMERA]
  }
}

/** The permission dict key used by `permissionStrings()` for the modal copy. */
function dictKey(type: PermType): string {
  if (type === 'sms_send') return 'sms'
  return type
}

async function checkGranted(perm: Permission): Promise<boolean> {
  try { return await PermissionsAndroid.check(perm) } catch { return false }
}

async function requestGranted(perm: Permission): Promise<'granted' | 'denied' | 'blocked'> {
  try {
    const r = await PermissionsAndroid.request(perm)
    if (r === PermissionsAndroid.RESULTS.GRANTED) return 'granted'
    if (r === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) return 'blocked'
    return 'denied'
  } catch {
    return 'denied'
  }
}

function showPermissionModal(type: PermType): Promise<void> {
  return new Promise((resolve) => {
    const s = permissionStrings(dictKey(type))
    showModal(s.title, s.message, [
      { text: s.goSettings, onPress: () => { openPermissionEditor(); resolve() } },
      { text: s.cancel, style: 'cancel', onPress: () => resolve() },
    ])
  })
}

/**
 * Ensure a single permission type is granted. Returns true if usable.
 * On denial, shows a modal explaining what permission is needed and why.
 */
export async function requirePermission(type: PermType): Promise<boolean> {
  if (Platform.OS !== 'android') return true
  const perms = androidPermsFor(type)
  if (perms.length === 0) return true

  // All already granted?
  const checks = await Promise.all(perms.map(checkGranted))
  if (checks.every(Boolean)) return true

  // Request the missing ones in order. Stop on first blocked.
  let blocked = false
  for (let i = 0; i < perms.length; i++) {
    if (checks[i]) continue
    const result = await requestGranted(perms[i])
    if (result === 'blocked') { blocked = true; break }
    if (result === 'denied') return false
  }
  if (blocked) {
    await showPermissionModal(type)
    return false
  }
  // Re-check after request
  const recheck = await Promise.all(perms.map(checkGranted))
  if (recheck.every(Boolean)) return true
  // Still not all granted — show the modal once more.
  await showPermissionModal(type)
  return false
}

/**
 * Ensure a batch of permission types are all granted. Returns which ones are
 * still missing. Shows a single aggregated modal for blocked permissions.
 */
export async function requirePermissions(types: PermType[]): Promise<{ ok: boolean; missing: PermType[] }> {
  const missing: PermType[] = []
  for (const type of types) {
    const ok = await requirePermission(type)
    if (!ok) missing.push(type)
  }
  return { ok: missing.length === 0, missing }
}

/**
 * Map a skill input_schema `format: "device:*"` value to the permission type
 * needed to collect it. Returns null if the format doesn't need a permission.
 */
export function deviceFormatToPermType(format: string): PermType | null {
  if (!format.startsWith('device:')) return null
  const f = format.slice('device:'.length)
  switch (f) {
    case 'photos':
    case 'photos_recent':
    case 'photo_bursts':
      return 'photos'
    case 'call_log':
      return 'call_log'
    case 'sms':
      return 'sms'
    case 'contacts':
      return 'contacts'
    case 'calendar':
      return 'calendar'
    case 'location':
      return 'location'
    case 'audio':
      return 'audio'
    case 'video':
      return 'video'
    case 'bluetooth':
      return 'bluetooth'
    case 'files':
    case 'files_downloads':
    case 'files_documents':
    case 'dir_sizes':
    case 'app_caches':
    case 'social_storage':
      return 'storage'
    default:
      return null
  }
}

/**
 * Deduped list of permission types required by an input_schema's device:* fields.
 */
export function permTypesFromSchema(schema: any): PermType[] {
  const props = schema?.properties || {}
  const set = new Set<PermType>()
  for (const k of Object.keys(props)) {
    const format: string = props[k]?.format || ''
    const type = deviceFormatToPermType(format)
    if (type) set.add(type)
  }
  return Array.from(set)
}
