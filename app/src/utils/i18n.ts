import { NativeModules, Linking } from 'react-native'

// DeviceInfoManager exposes sync constants: locale, language, brand, manufacturer, miuiVersion
const DeviceInfoManager = NativeModules.DeviceInfoManager
const deviceConstants = DeviceInfoManager?.getConstants?.() || DeviceInfoManager || {}

/** Open the OEM-specific app permission editor (direct to AgentCab's permissions page) */
export function openPermissionEditor() {
  if (DeviceInfoManager?.openAppPermissionEditor) {
    DeviceInfoManager.openAppPermissionEditor().catch(() => Linking.openSettings())
  } else {
    Linking.openSettings()
  }
}

export function isChinese(): boolean {
  const lang = (deviceConstants.language || deviceConstants.locale || '').toLowerCase()
  return lang.startsWith('zh')
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

type PermStrings = {
  title: string
  message: string
  goSettings: string
  cancel: string
}

const permNames: Record<string, { zh: string; en: string }> = {
  photos: { zh: '相册/存储', en: 'Photos/Storage' },
  calendar: { zh: '日历', en: 'Calendar' },
  contacts: { zh: '通讯录', en: 'Contacts' },
  call_log: { zh: '通话记录', en: 'Call Log' },
  sms: { zh: '短信', en: 'SMS' },
  location: { zh: '位置', en: 'Location' },
  audio: { zh: '音频', en: 'Audio' },
  video: { zh: '视频', en: 'Video' },
  bluetooth: { zh: '蓝牙', en: 'Bluetooth' },
  notifications: { zh: '通知', en: 'Notifications' },
}

/** Brand-specific permission path in Chinese */
function brandPermPath(permLabel: string): string {
  const brand = getDeviceBrand()
  switch (brand) {
    case 'xiaomi':
      return `设置 → 应用设置 → 应用管理 → AgentCab → 权限管理 → ${permLabel} → 允许`
    case 'huawei':
      return `设置 → 应用和服务 → 应用管理 → AgentCab → 权限 → ${permLabel} → 允许`
    case 'vivo':
      return `设置 → 应用与权限 → 应用管理 → AgentCab → 权限 → ${permLabel} → 允许`
    case 'oppo':
    case 'oneplus':
      return `设置 → 应用管理 → AgentCab → 权限 → ${permLabel} → 允许`
    case 'samsung':
      return `设置 → 应用程序 → AgentCab → 权限 → ${permLabel} → 允许`
    case 'meizu':
      return `设置 → 应用管理 → AgentCab → 权限管理 → ${permLabel} → 允许`
    default:
      return `设置 → 应用 → AgentCab → 权限 → ${permLabel} → 允许`
  }
}

/** Brand-specific permission path in English */
function brandPermPathEn(permLabel: string): string {
  const brand = getDeviceBrand()
  switch (brand) {
    case 'xiaomi':
      return `Settings → Apps → Manage apps → AgentCab → Permissions → ${permLabel} → Allow`
    case 'huawei':
      return `Settings → Apps & services → Apps → AgentCab → Permissions → ${permLabel} → Allow`
    case 'vivo':
      return `Settings → Apps & permissions → App management → AgentCab → Permissions → ${permLabel} → Allow`
    case 'samsung':
      return `Settings → Apps → AgentCab → Permissions → ${permLabel} → Allow`
    default:
      return `Settings → Apps → AgentCab → Permissions → ${permLabel} → Allow`
  }
}

export function permissionStrings(key: string): PermStrings {
  const zh = isChinese()
  const name = permNames[key] || { zh: key, en: key }
  const label = zh ? name.zh : name.en

  if (zh) {
    return {
      title: `需要${label}权限`,
      message: `请在系统设置中开启${label}权限：\n\n${brandPermPath(label)}`,
      goSettings: '去设置',
      cancel: '取消',
    }
  }
  return {
    title: `${label} Permission Required`,
    message: `Please enable ${label} permission:\n\n${brandPermPathEn(label)}`,
    goSettings: 'Open Settings',
    cancel: 'Cancel',
  }
}

export function dataCollectionStrings() {
  const zh = isChinese()
  return {
    title: zh ? '部分权限未开启' : 'Permission Issues',
    suffix: zh ? '\n\n请前往系统设置开启相关权限。' : '\n\nPlease enable the required permissions in Settings.',
    goSettings: zh ? '去设置' : 'Open Settings',
    continue_: zh ? '继续' : 'Continue',
  }
}

export function smsGuideStrings() {
  const zh = isChinese()
  const brand = getDeviceBrand()

  let message: string
  if (zh) {
    switch (brand) {
      case 'xiaomi':
        message = '小米手机需要额外开启"通知类短信"权限：\n\n设置 → 应用设置 → 应用管理 → AgentCab → 权限管理 → 通知类短信 → 允许'
        break
      case 'huawei':
        message = '华为手机可能限制了短信读取，请检查：\n\n设置 → 应用和服务 → 应用管理 → AgentCab → 权限 → 短信 → 允许\n\n如仍无法读取验证码短信，请关闭"智能短信"功能'
        break
      case 'vivo':
        message = 'vivo手机可能限制了短信读取，请检查：\n\n设置 → 应用与权限 → 应用管理 → AgentCab → 权限 → 短信 → 允许'
        break
      default:
        message = '部分手机系统会限制通知类短信的读取，请检查：\n\n' + brandPermPath('短信') + '\n\n如仍无法读取，请在系统设置中查找"短信权限"或"通知类短信"相关选项'
    }
  } else {
    message = 'Some Android devices restrict reading notification/verification SMS.\n\nPlease check:\n\n' +
      brandPermPathEn('SMS') + '\n\nIf verification SMS are still missing, check for additional SMS-related settings in your system settings.'
  }

  return {
    title: zh ? '无法读取通知类短信' : 'Cannot Read Notification SMS',
    message,
    goSettings: zh ? '去设置' : 'Open Settings',
    skip: zh ? '跳过' : 'Skip',
  }
}

// ── Action Executor i18n ──

export function actionStrings() {
  const zh = isChinese()
  return {
    ok: zh ? '确定' : 'OK',
    cancel: zh ? '取消' : 'Cancel',
    cancelledByUser: zh ? '用户取消' : 'Cancelled by user',
    unknownAction: (type: string) => zh ? `未知操作: ${type}` : `Unknown action: ${type}`,
    actionTimedOut: zh ? '操作超时' : 'Action timed out',

    // File
    deleteFile: (name: string) => zh ? `删除 ${name}？` : `Delete ${name}?`,
    deleteFiles: (n: number) => zh ? `删除 ${n} 个文件？` : `Delete ${n} files?`,
    moveFile: (dest: string) => zh ? `移动文件到 ${dest}？` : `Move file to ${dest}?`,

    // Calendar
    deleteEvent: zh ? '删除日历事件？' : 'Delete calendar event?',
    createReminder: (title: string, time: string) =>
      zh ? `创建提醒: "${title}" 于 ${time}？` : `Create reminder: "${title}" at ${time}?`,

    // Contact
    saveContact: (name: string) => zh ? `保存联系人 "${name}"？` : `Save contact "${name}"?`,

    // SMS
    sendSmsFailed: zh ? '无法发送短信' : 'Could not send SMS.',
    smsPermNeeded: zh ? '短信发送权限未开启' : 'SMS send permission denied.',

    // App
    appNotInstalled: (pkg: string) => zh ? `应用未安装: ${pkg}` : `App not installed: ${pkg}`,
    launchFailed: (pkg: string) => zh ? `启动失败: ${pkg}` : `Failed to launch ${pkg}`,
    uninstallApp: (pkg: string) => zh ? `卸载 ${pkg}？` : `Uninstall ${pkg}?`,
    uninstallFailed: zh ? '无法打开卸载对话框' : 'Could not open uninstall dialog.',

    // Settings
    setBrightness: (level: number) => zh ? `设置亮度为 ${level}？` : `Set brightness to ${level}?`,
    setVolume: (stream: string, level: number) =>
      zh ? `设置${stream === 'media' ? '媒体' : stream}音量为 ${level}？` : `Set ${stream} volume to ${level}?`,
    toggleWifi: (enable: boolean) =>
      zh ? `打开Wi-Fi设置以${enable ? '开启' : '关闭'}Wi-Fi？` : `Open Wi-Fi settings to ${enable ? 'enable' : 'disable'} Wi-Fi?`,
    toggleBluetooth: (enable: boolean) =>
      zh ? `打开蓝牙设置以${enable ? '开启' : '关闭'}蓝牙？` : `Open Bluetooth settings to ${enable ? 'enable' : 'disable'} Bluetooth?`,
    setWallpaper: zh ? '设为壁纸？' : 'Set as wallpaper?',

    // Accessibility
    clickText: (text: string) => zh ? `点击 "${text}"？` : `Click "${text}"?`,
    setText: (text: string) => zh ? `设置文本为 "${text}"？` : `Set text to "${text}"?`,
    longPress: (text: string) => zh ? `长按 "${text}"？` : `Long press "${text}"?`,

    // Errors
    cannotOpenUrl: (url: string) => zh ? `无法打开链接: ${url}` : `Cannot open URL: ${url}`,
    cannotOpenDeeplink: (uri: string) => zh ? `无法打开: ${uri}` : `Cannot open deeplink: ${uri}`,
    cannotOpenSettings: (page?: string) =>
      zh ? `无法打开设置${page ? ` (${page})` : ''}` : `Could not open settings${page ? ` (${page})` : ''}.`,
    noAlarmHandler: zh ? '无法打开闹钟应用' : 'Could not open clock app. No handler for alarm intent.',
    downloadFailed: zh ? '下载失败' : 'Failed to download file.',
    photoCancelled: zh ? '拍照取消或失败' : 'Photo capture cancelled or failed.',
    noRecorder: zh ? '未找到录音应用' : 'No voice recorder app found.',
    bluetoothSettingsFailed: zh ? '无法打开蓝牙设置' : 'Could not open Bluetooth settings.',
  }
}
