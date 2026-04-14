// Permission prompt strings — brand-specific settings paths + per-permission
// display names, kept out of the UI `t` dict so `t[dynamicKey]` stays string.

import { getCurrentLang } from './index'
import { getDeviceBrand, DeviceBrand } from '../utils/i18n'

type Lang = 'en' | 'zh' | 'vi' | 'ja' | 'ar'

const permNames: Record<string, Record<Lang, string>> = {
  photos:        { zh: '相册/存储',  en: 'Photos/Storage',  vi: 'Ảnh/Bộ nhớ',        ja: '写真/ストレージ', ar: 'الصور/التخزين' },
  calendar:      { zh: '日历',       en: 'Calendar',        vi: 'Lịch',              ja: 'カレンダー',      ar: 'التقويم' },
  contacts:      { zh: '通讯录',     en: 'Contacts',        vi: 'Danh bạ',           ja: '連絡先',          ar: 'جهات الاتصال' },
  call_log:      { zh: '通话记录',   en: 'Call Log',        vi: 'Nhật ký cuộc gọi',  ja: '通話履歴',        ar: 'سجل المكالمات' },
  sms:           { zh: '短信',       en: 'SMS',             vi: 'SMS',               ja: 'SMS',             ar: 'SMS' },
  location:      { zh: '位置',       en: 'Location',        vi: 'Vị trí',            ja: '位置情報',        ar: 'الموقع' },
  audio:         { zh: '音频',       en: 'Audio',           vi: 'Âm thanh',          ja: '音声',            ar: 'الصوت' },
  video:         { zh: '视频',       en: 'Video',           vi: 'Video',             ja: 'ビデオ',          ar: 'الفيديو' },
  bluetooth:     { zh: '蓝牙',       en: 'Bluetooth',       vi: 'Bluetooth',         ja: 'Bluetooth',       ar: 'Bluetooth' },
  notifications: { zh: '通知',       en: 'Notifications',   vi: 'Thông báo',         ja: '通知',            ar: 'الإشعارات' },
}

function brandPath(brand: DeviceBrand, label: string, lang: Lang): string {
  if (lang === 'zh') {
    switch (brand) {
      case 'xiaomi':   return `设置 → 应用设置 → 应用管理 → AgentCab → 权限管理 → ${label} → 允许`
      case 'huawei':   return `设置 → 应用和服务 → 应用管理 → AgentCab → 权限 → ${label} → 允许`
      case 'vivo':     return `设置 → 应用与权限 → 应用管理 → AgentCab → 权限 → ${label} → 允许`
      case 'oppo':
      case 'oneplus':  return `设置 → 应用管理 → AgentCab → 权限 → ${label} → 允许`
      case 'samsung':  return `设置 → 应用程序 → AgentCab → 权限 → ${label} → 允许`
      case 'meizu':    return `设置 → 应用管理 → AgentCab → 权限管理 → ${label} → 允许`
      default:         return `设置 → 应用 → AgentCab → 权限 → ${label} → 允许`
    }
  }
  if (lang === 'vi') {
    switch (brand) {
      case 'xiaomi':   return `Cài đặt → Ứng dụng → Quản lý ứng dụng → AgentCab → Quyền → ${label} → Cho phép`
      case 'huawei':   return `Cài đặt → Ứng dụng và dịch vụ → Ứng dụng → AgentCab → Quyền → ${label} → Cho phép`
      case 'vivo':     return `Cài đặt → Ứng dụng và quyền → Quản lý ứng dụng → AgentCab → Quyền → ${label} → Cho phép`
      case 'samsung':  return `Cài đặt → Ứng dụng → AgentCab → Quyền → ${label} → Cho phép`
      default:         return `Cài đặt → Ứng dụng → AgentCab → Quyền → ${label} → Cho phép`
    }
  }
  if (lang === 'ja') {
    switch (brand) {
      case 'xiaomi':   return `設定 → アプリ → アプリ管理 → AgentCab → 権限 → ${label} → 許可`
      case 'huawei':   return `設定 → アプリとサービス → アプリ → AgentCab → 権限 → ${label} → 許可`
      case 'vivo':     return `設定 → アプリと権限 → AgentCab → 権限 → ${label} → 許可`
      case 'samsung':  return `設定 → アプリ → AgentCab → 権限 → ${label} → 許可`
      default:         return `設定 → アプリ → AgentCab → 権限 → ${label} → 許可`
    }
  }
  if (lang === 'ar') {
    switch (brand) {
      case 'xiaomi':   return `الإعدادات → التطبيقات → إدارة التطبيقات → AgentCab → الأذونات → ${label} → السماح`
      case 'huawei':   return `الإعدادات → التطبيقات والخدمات → التطبيقات → AgentCab → الأذونات → ${label} → السماح`
      case 'vivo':     return `الإعدادات → التطبيقات والأذونات → AgentCab → الأذونات → ${label} → السماح`
      case 'samsung':  return `الإعدادات → التطبيقات → AgentCab → الأذونات → ${label} → السماح`
      default:         return `الإعدادات → التطبيقات → AgentCab → الأذونات → ${label} → السماح`
    }
  }
  // en
  switch (brand) {
    case 'xiaomi':     return `Settings → Apps → Manage apps → AgentCab → Permissions → ${label} → Allow`
    case 'huawei':     return `Settings → Apps & services → Apps → AgentCab → Permissions → ${label} → Allow`
    case 'vivo':       return `Settings → Apps & permissions → App management → AgentCab → Permissions → ${label} → Allow`
    case 'samsung':    return `Settings → Apps → AgentCab → Permissions → ${label} → Allow`
    default:           return `Settings → Apps → AgentCab → Permissions → ${label} → Allow`
  }
}

const chrome: Record<Lang, { titleFmt: (label: string) => string; msgFmt: (label: string, path: string) => string; goSettings: string; cancel: string }> = {
  zh: {
    titleFmt: (label) => `需要${label}权限`,
    msgFmt: (label, path) => `请在系统设置中开启${label}权限：\n\n${path}`,
    goSettings: '去设置',
    cancel: '取消',
  },
  en: {
    titleFmt: (label) => `${label} Permission Required`,
    msgFmt: (label, path) => `Please enable ${label} permission:\n\n${path}`,
    goSettings: 'Open Settings',
    cancel: 'Cancel',
  },
  vi: {
    titleFmt: (label) => `Cần quyền ${label}`,
    msgFmt: (label, path) => `Vui lòng bật quyền ${label}:\n\n${path}`,
    goSettings: 'Mở cài đặt',
    cancel: 'Hủy',
  },
  ja: {
    titleFmt: (label) => `${label}権限が必要`,
    msgFmt: (label, path) => `${label}権限を有効にしてください：\n\n${path}`,
    goSettings: '設定を開く',
    cancel: 'キャンセル',
  },
  ar: {
    titleFmt: (label) => `إذن ${label} مطلوب`,
    msgFmt: (label, path) => `يرجى تفعيل إذن ${label}:\n\n${path}`,
    goSettings: 'فتح الإعدادات',
    cancel: 'إلغاء',
  },
}

export type PermStrings = {
  title: string
  message: string
  goSettings: string
  cancel: string
}

export function permissionStrings(key: string): PermStrings {
  const lang = getCurrentLang() as Lang
  const defaultName: Record<Lang, string> = { zh: key, en: key, vi: key, ja: key, ar: key }
  const name = permNames[key] || defaultName
  const label = name[lang]
  const brand = getDeviceBrand()
  const path = brandPath(brand, label, lang)
  const c = chrome[lang]
  return {
    title: c.titleFmt(label),
    message: c.msgFmt(label, path),
    goSettings: c.goSettings,
    cancel: c.cancel,
  }
}
