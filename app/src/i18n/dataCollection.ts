// Data collection prompt strings used by dataCollector.ts / SkillDetail.
// Kept separate from UI `t` dict so it stays string-only.

import { getCurrentLang, format } from './index'
import { DeviceBrand } from '../utils/i18n'

type Lang = 'en' | 'zh' | 'vi' | 'ja' | 'ar'

type DataColDict = {
  // Legacy "permission missing" aggregate modal
  title: string
  suffix: string
  goSettings: string
  continue_: string
  skip: string
  // App list permission guide
  appListTitle: string
  appListMsgXiaomi: string
  appListMsgHuawei: string
  appListMsgDefault: string
  // Usage stats access
  usageTitle: string
  usageMsg: string
  // Empty data collected modal
  emptyTitle: string
  emptyMsg: string // {0} = comma-joined list of fields
  emptyJoiner: string
}

const zh: DataColDict = {
  title: '部分权限未开启',
  suffix: '\n\n请前往系统设置开启相关权限。',
  goSettings: '去设置',
  continue_: '继续',
  skip: '跳过',
  appListTitle: '无法获取应用列表',
  appListMsgXiaomi: '需要开启"获取已安装应用列表"权限：\n\n设置 → 应用设置 → 应用管理 → AgentCab → 权限管理 → 获取已安装应用列表 → 允许',
  appListMsgHuawei: '需要允许获取应用列表：\n\n设置 → 应用和服务 → 应用管理 → AgentCab → 权限 → 获取应用列表',
  appListMsgDefault: '需要允许获取已安装应用列表，请在系统设置中开启相关权限。',
  usageTitle: '需要使用情况访问权限',
  usageMsg: '请在设置中开启"使用情况访问权限"以分析手机使用习惯',
  emptyTitle: '数据采集结果为空',
  emptyMsg: '以下数据采集为空，可能是权限未完全开启：\n\n{0}\n\n如果确认已授权，部分手机系统可能需要额外开启相关权限。',
  emptyJoiner: '、',
}

const en: DataColDict = {
  title: 'Permission Issues',
  suffix: '\n\nPlease enable the required permissions in Settings.',
  goSettings: 'Open Settings',
  continue_: 'Continue',
  skip: 'Skip',
  appListTitle: 'Cannot Read App List',
  appListMsgXiaomi: 'Please allow "Access installed apps" in Settings → Apps → AgentCab → Permissions.',
  appListMsgHuawei: 'Please allow app list access:\n\nSettings → Apps → AgentCab → Permissions',
  appListMsgDefault: 'Permission to read installed apps is required. Please enable it in Settings → Apps → AgentCab → Permissions.',
  usageTitle: 'Usage Access Required',
  usageMsg: 'Please enable "Usage Access" in Settings to analyze phone habits',
  emptyTitle: 'Empty Data Collected',
  emptyMsg: 'The following data was empty, which may indicate missing permissions:\n\n{0}\n\nIf permissions are granted, your device may require additional settings.',
  emptyJoiner: ', ',
}

const vi: DataColDict = {
  title: 'Một số quyền chưa được bật',
  suffix: '\n\nVui lòng vào cài đặt để bật các quyền cần thiết.',
  goSettings: 'Mở cài đặt',
  continue_: 'Tiếp tục',
  skip: 'Bỏ qua',
  appListTitle: 'Không đọc được danh sách ứng dụng',
  appListMsgXiaomi: 'Cần cho phép "Truy cập ứng dụng đã cài":\n\nCài đặt → Ứng dụng → AgentCab → Quyền',
  appListMsgHuawei: 'Cần cho phép truy cập danh sách ứng dụng:\n\nCài đặt → Ứng dụng → AgentCab → Quyền',
  appListMsgDefault: 'Cần quyền đọc danh sách ứng dụng đã cài. Vui lòng bật trong Cài đặt.',
  usageTitle: 'Cần quyền Usage Access',
  usageMsg: 'Vui lòng bật "Usage Access" trong Cài đặt để phân tích thói quen sử dụng điện thoại',
  emptyTitle: 'Dữ liệu thu thập trống',
  emptyMsg: 'Các dữ liệu sau trống, có thể do chưa đủ quyền:\n\n{0}\n\nNếu đã cấp quyền, thiết bị của bạn có thể cần cài đặt bổ sung.',
  emptyJoiner: ', ',
}

const ja: DataColDict = {
  title: '一部の権限が無効',
  suffix: '\n\n設定で必要な権限を有効にしてください。',
  goSettings: '設定を開く',
  continue_: '続行',
  skip: 'スキップ',
  appListTitle: 'アプリリストを読み取れません',
  appListMsgXiaomi: '「インストール済みアプリへのアクセス」を許可してください：\n\n設定 → アプリ → AgentCab → 権限',
  appListMsgHuawei: 'アプリリストへのアクセスを許可してください：\n\n設定 → アプリ → AgentCab → 権限',
  appListMsgDefault: 'インストール済みアプリの読み取り権限が必要です。設定 → アプリ → AgentCab → 権限 で有効化してください。',
  usageTitle: '使用履歴アクセスが必要',
  usageMsg: 'スマホの使用習慣を分析するため、設定で「使用履歴アクセス」を有効にしてください',
  emptyTitle: '収集データが空',
  emptyMsg: '以下のデータが空でした。権限不足の可能性があります：\n\n{0}\n\n権限が許可されている場合、デバイスで追加設定が必要な場合があります。',
  emptyJoiner: '、',
}

const ar: DataColDict = {
  title: 'بعض الأذونات غير مفعلة',
  suffix: '\n\nيرجى تفعيل الأذونات المطلوبة في الإعدادات.',
  goSettings: 'فتح الإعدادات',
  continue_: 'متابعة',
  skip: 'تخطي',
  appListTitle: 'لا يمكن قراءة قائمة التطبيقات',
  appListMsgXiaomi: 'يرجى السماح بـ"الوصول إلى التطبيقات المثبتة":\n\nالإعدادات → التطبيقات → AgentCab → الأذونات',
  appListMsgHuawei: 'يرجى السماح بالوصول إلى قائمة التطبيقات:\n\nالإعدادات → التطبيقات → AgentCab → الأذونات',
  appListMsgDefault: 'إذن قراءة التطبيقات المثبتة مطلوب. يرجى تفعيله في الإعدادات → التطبيقات → AgentCab → الأذونات.',
  usageTitle: 'الوصول إلى الاستخدام مطلوب',
  usageMsg: 'يرجى تفعيل "الوصول إلى الاستخدام" في الإعدادات لتحليل عادات استخدام الهاتف',
  emptyTitle: 'البيانات المجمعة فارغة',
  emptyMsg: 'البيانات التالية فارغة، قد يكون بسبب أذونات ناقصة:\n\n{0}\n\nإذا كانت الأذونات ممنوحة، قد يحتاج جهازك إلى إعدادات إضافية.',
  emptyJoiner: '، ',
}

const dicts: Record<Lang, DataColDict> = { en, zh, vi, ja, ar }

function dict(): DataColDict {
  return dicts[getCurrentLang() as Lang]
}

export function dataCollectionStrings(): DataColDict {
  return dict()
}

export function appListPermMessage(brand: DeviceBrand): string {
  const d = dict()
  if (brand === 'xiaomi') return d.appListMsgXiaomi
  if (brand === 'huawei') return d.appListMsgHuawei
  return d.appListMsgDefault
}

export function emptyDataMessage(fields: string[]): string {
  const d = dict()
  return format(d.emptyMsg, fields.join(d.emptyJoiner))
}
