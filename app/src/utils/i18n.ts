import { NativeModules, Linking } from 'react-native'

// DeviceInfoManager exposes sync constants: locale, language, brand, manufacturer, miuiVersion
const DeviceInfoManager = NativeModules.DeviceInfoManager ?? null
const deviceConstants = DeviceInfoManager?.getConstants?.() || DeviceInfoManager || {}

/** Open the OEM-specific app permission editor (direct to AgentCab's permissions page) */
export function openPermissionEditor() {
  if (DeviceInfoManager?.openAppPermissionEditor) {
    DeviceInfoManager.openAppPermissionEditor().catch(() => Linking.openSettings())
  } else {
    Linking.openSettings()
  }
}

// ── Device brand detection ──

export type DeviceBrand = 'xiaomi' | 'huawei' | 'oppo' | 'vivo' | 'samsung' | 'oneplus' | 'meizu' | 'other'

export function getDeviceBrand(): DeviceBrand {
  const brand = (deviceConstants.brand || '').toLowerCase()
  const mfr = (deviceConstants.manufacturer || '').toLowerCase()
  const key = brand + ' ' + mfr
  if (/xiaomi|redmi|poco/.test(key)) return 'xiaomi'
  if (/huawei|honor/.test(key)) return 'huawei'
  if (/oppo|realme|oneplus/.test(key)) return 'oneplus' // OnePlus is under OPPO
  if (/vivo|iqoo/.test(key)) return 'vivo'
  if (/samsung/.test(key)) return 'samsung'
  if (/meizu/.test(key)) return 'meizu'
  if (/oneplus/.test(key)) return 'oneplus'
  return 'other'
}

export function isMiui(): boolean { return getDeviceBrand() === 'xiaomi' }

// permissionStrings moved to src/i18n/permission.ts
export { permissionStrings } from '../i18n/permission'
export type { PermStrings } from '../i18n/permission'

// dataCollectionStrings moved to src/i18n/dataCollection.ts
export { dataCollectionStrings } from '../i18n/dataCollection'

// smsGuideStrings moved to src/i18n/smsGuide.ts
export { smsGuideStrings } from '../i18n/smsGuide'

// ── Action Executor i18n ──
// Strings moved to src/i18n/action.ts (separate from UI `t` dict).
// Re-exported here for backward compatibility.
export { actionStrings } from '../i18n/action'
