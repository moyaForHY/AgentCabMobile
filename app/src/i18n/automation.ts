// Automation service strings: brand-specific background running guide +
// schedule formatting. Service-layer dict kept separate from UI `t`.

import { getCurrentLang, format } from './index'
import { DeviceBrand } from '../utils/i18n'

type Lang = 'en' | 'zh' | 'vi' | 'ja' | 'ar'

type BrandGuide = { title: string; msg: string }

type AutomationDict = {
  bgTitle: string
  goSettings: string
  gotIt: string
  brandGuide: Record<DeviceBrand | 'default', BrandGuide>
  sched_daily: string       // "Daily at {0}" / "每天 {0}"
  sched_weeklyAt: string    // "{0} at {1}" / "每{0} {1}"
  sched_everyHours: string  // "Every {0}h"
  sched_everyMins: string   // "Every {0}m"
  weekdayShortSchedule: string[]  // Sun..Sat (for formatSchedule only)
}

const zh: AutomationDict = {
  bgTitle: '开启后台运行权限',
  goSettings: '去设置',
  gotIt: '知道了',
  brandGuide: {
    xiaomi: { title: '开启后台运行权限', msg: '为确保自动化任务准时执行，请进行以下设置：\n\n1. 自启动：设置 → 应用设置 → 应用管理 → AgentCab → 自启动 → 开启\n2. 省电策略：设置 → 电池 → AgentCab → 无限制\n3. 锁定后台：在最近任务中长按 AgentCab → 锁定' },
    huawei: { title: '开启后台运行权限', msg: '请进行以下设置：\n\n1. 自启动：设置 → 应用和服务 → 应用管理 → AgentCab → 自启动 → 开启\n2. 电池：设置 → 电池 → 应用启动管理 → AgentCab → 手动管理 → 全部允许' },
    vivo: { title: '开启后台运行权限', msg: '请进行以下设置：\n\n1. 自启动：设置 → 应用与权限 → 自启动管理 → AgentCab → 开启\n2. 电池：设置 → 电池 → 后台耗电管理 → AgentCab → 允许后台运行' },
    oppo: { title: '开启后台运行权限', msg: '请进行以下设置：\n\n1. 自启动：设置 → 应用管理 → 自启动管理 → AgentCab → 开启\n2. 电池：设置 → 电池 → 省电优化 → AgentCab → 关闭优化' },
    oneplus: { title: '开启后台运行权限', msg: '请进行以下设置：\n\n1. 自启动：设置 → 应用管理 → 自启动管理 → AgentCab → 开启\n2. 电池：设置 → 电池 → 省电优化 → AgentCab → 关闭优化' },
    samsung: { title: '开启后台运行权限', msg: '请在 设置 → 应用 → AgentCab → 电池 中允许后台运行。' },
    meizu: { title: '开启后台运行权限', msg: '请在 设置 → 应用管理 → AgentCab → 权限管理 中允许后台运行。' },
    other: { title: '开启后台运行权限', msg: '请在系统设置中允许 AgentCab 后台运行。' },
    default: { title: '开启后台运行权限', msg: '请在系统设置中允许 AgentCab 后台运行。' },
  },
  sched_daily: '每天 {0}',
  sched_weeklyAt: '每{0} {1}',
  sched_everyHours: '每 {0} 小时',
  sched_everyMins: '每 {0} 分钟',
  weekdayShortSchedule: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'],
}

const en: AutomationDict = {
  bgTitle: 'Enable Background Running',
  goSettings: 'Open Settings',
  gotIt: 'Got it',
  brandGuide: {
    xiaomi: { title: 'Enable Background Running', msg: 'To ensure automations run on time:\n\n1. Autostart: Settings → Apps → AgentCab → Autostart → Enable\n2. Battery: Settings → Battery → AgentCab → No restrictions\n3. Lock in recents: Long press AgentCab in recent tasks → Lock' },
    huawei: { title: 'Enable Background Running', msg: 'Please configure:\n\n1. Autostart: Settings → Apps → AgentCab → Autostart → Enable\n2. Battery: Settings → Battery → App launch → AgentCab → Manual → Allow all' },
    vivo: { title: 'Enable Background Running', msg: 'Please configure:\n\n1. Autostart: Settings → Apps → Autostart → AgentCab → Enable\n2. Battery: Settings → Battery → Background power → AgentCab → Allow' },
    oppo: { title: 'Enable Background Running', msg: 'Please configure:\n\n1. Autostart: Settings → Apps → Autostart → AgentCab → Enable\n2. Battery: Settings → Battery → Power saving → AgentCab → Disable' },
    oneplus: { title: 'Enable Background Running', msg: 'Please configure:\n\n1. Autostart: Settings → Apps → Autostart → AgentCab → Enable\n2. Battery: Settings → Battery → Power saving → AgentCab → Disable' },
    samsung: { title: 'Enable Background Running', msg: 'In Settings → Apps → AgentCab → Battery, allow background running.' },
    meizu: { title: 'Enable Background Running', msg: 'In Settings → Apps → AgentCab → Permissions, allow background running.' },
    other: { title: 'Enable Background Running', msg: 'Please allow AgentCab to run in the background in system settings.' },
    default: { title: 'Enable Background Running', msg: 'Please allow AgentCab to run in the background in system settings.' },
  },
  sched_daily: 'Daily at {0}',
  sched_weeklyAt: '{0} at {1}',
  sched_everyHours: 'Every {0}h',
  sched_everyMins: 'Every {0}m',
  weekdayShortSchedule: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
}

const vi: AutomationDict = {
  bgTitle: 'Bật chạy nền',
  goSettings: 'Mở cài đặt',
  gotIt: 'Đã hiểu',
  brandGuide: {
    xiaomi: { title: 'Bật chạy nền', msg: 'Để đảm bảo tự động hóa chạy đúng giờ:\n\n1. Tự khởi động: Cài đặt → Ứng dụng → AgentCab → Tự khởi động\n2. Pin: Cài đặt → Pin → AgentCab → Không giới hạn\n3. Khóa trong recents' },
    huawei: { title: 'Bật chạy nền', msg: 'Vui lòng cấu hình:\n\n1. Tự khởi động: Cài đặt → Ứng dụng → AgentCab → Tự khởi động\n2. Pin: Cài đặt → Pin → Khởi chạy ứng dụng → AgentCab → Thủ công → Cho phép tất cả' },
    vivo: { title: 'Bật chạy nền', msg: 'Vui lòng cấu hình:\n\n1. Tự khởi động: Cài đặt → Tự khởi động → AgentCab → Bật\n2. Pin: Cài đặt → Pin → Quản lý nền → AgentCab → Cho phép' },
    oppo: { title: 'Bật chạy nền', msg: 'Vui lòng cấu hình:\n\n1. Tự khởi động: Cài đặt → Ứng dụng → Tự khởi động → AgentCab → Bật\n2. Pin: Cài đặt → Pin → Tiết kiệm pin → AgentCab → Tắt' },
    oneplus: { title: 'Bật chạy nền', msg: 'Cài đặt → Ứng dụng → AgentCab → Cho phép chạy nền.' },
    samsung: { title: 'Bật chạy nền', msg: 'Trong Cài đặt → Ứng dụng → AgentCab → Pin, cho phép chạy nền.' },
    meizu: { title: 'Bật chạy nền', msg: 'Trong Cài đặt → Ứng dụng → AgentCab → Quyền, cho phép chạy nền.' },
    other: { title: 'Bật chạy nền', msg: 'Vui lòng cho phép AgentCab chạy nền trong cài đặt hệ thống.' },
    default: { title: 'Bật chạy nền', msg: 'Vui lòng cho phép AgentCab chạy nền trong cài đặt hệ thống.' },
  },
  sched_daily: 'Hàng ngày lúc {0}',
  sched_weeklyAt: '{0} lúc {1}',
  sched_everyHours: 'Mỗi {0} giờ',
  sched_everyMins: 'Mỗi {0} phút',
  weekdayShortSchedule: ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'],
}

const ja: AutomationDict = {
  bgTitle: 'バックグラウンド実行を有効化',
  goSettings: '設定を開く',
  gotIt: '了解',
  brandGuide: {
    xiaomi: { title: 'バックグラウンド実行を有効化', msg: '自動化が予定通り実行されるよう：\n\n1. 自動起動：設定 → アプリ → AgentCab → 自動起動\n2. バッテリー：設定 → バッテリー → AgentCab → 制限なし\n3. 履歴でロック' },
    huawei: { title: 'バックグラウンド実行を有効化', msg: '設定してください：\n\n1. 自動起動：設定 → アプリ → AgentCab → 自動起動\n2. バッテリー：設定 → バッテリー → アプリ起動 → AgentCab → 手動 → すべて許可' },
    vivo: { title: 'バックグラウンド実行を有効化', msg: '設定してください：\n\n1. 自動起動：設定 → アプリ → 自動起動 → AgentCab\n2. バッテリー：設定 → バッテリー → バックグラウンド電力 → AgentCab → 許可' },
    oppo: { title: 'バックグラウンド実行を有効化', msg: '設定してください：\n\n1. 自動起動：設定 → アプリ → 自動起動 → AgentCab\n2. バッテリー：設定 → バッテリー → 省電力 → AgentCab → 無効化' },
    oneplus: { title: 'バックグラウンド実行を有効化', msg: '設定 → アプリ → AgentCab → バックグラウンド実行を許可。' },
    samsung: { title: 'バックグラウンド実行を有効化', msg: '設定 → アプリ → AgentCab → バッテリー でバックグラウンド実行を許可してください。' },
    meizu: { title: 'バックグラウンド実行を有効化', msg: '設定 → アプリ → AgentCab → 権限 でバックグラウンド実行を許可してください。' },
    other: { title: 'バックグラウンド実行を有効化', msg: 'システム設定でAgentCabのバックグラウンド実行を許可してください。' },
    default: { title: 'バックグラウンド実行を有効化', msg: 'システム設定でAgentCabのバックグラウンド実行を許可してください。' },
  },
  sched_daily: '毎日 {0}',
  sched_weeklyAt: '{0} {1}',
  sched_everyHours: '{0}時間ごと',
  sched_everyMins: '{0}分ごと',
  weekdayShortSchedule: ['日', '月', '火', '水', '木', '金', '土'],
}

const ar: AutomationDict = {
  bgTitle: 'تفعيل التشغيل في الخلفية',
  goSettings: 'فتح الإعدادات',
  gotIt: 'فهمت',
  brandGuide: {
    xiaomi: { title: 'تفعيل التشغيل في الخلفية', msg: 'لضمان تشغيل الأتمتة في الوقت المناسب:\n\n1. التشغيل التلقائي: الإعدادات → التطبيقات → AgentCab → التشغيل التلقائي\n2. البطارية: الإعدادات → البطارية → AgentCab → بلا قيود\n3. القفل في التطبيقات الأخيرة' },
    huawei: { title: 'تفعيل التشغيل في الخلفية', msg: 'يرجى التكوين:\n\n1. التشغيل التلقائي: الإعدادات → التطبيقات → AgentCab → التشغيل التلقائي\n2. البطارية: الإعدادات → البطارية → تشغيل التطبيق → AgentCab → يدوي → السماح للكل' },
    vivo: { title: 'تفعيل التشغيل في الخلفية', msg: 'يرجى التكوين:\n\n1. التشغيل التلقائي: الإعدادات → التطبيقات → التشغيل التلقائي → AgentCab\n2. البطارية: الإعدادات → البطارية → الطاقة الخلفية → AgentCab → السماح' },
    oppo: { title: 'تفعيل التشغيل في الخلفية', msg: 'يرجى التكوين:\n\n1. التشغيل التلقائي: الإعدادات → التطبيقات → التشغيل التلقائي → AgentCab\n2. البطارية: الإعدادات → البطارية → توفير الطاقة → AgentCab → تعطيل' },
    oneplus: { title: 'تفعيل التشغيل في الخلفية', msg: 'الإعدادات → التطبيقات → AgentCab → السماح بالتشغيل في الخلفية.' },
    samsung: { title: 'تفعيل التشغيل في الخلفية', msg: 'في الإعدادات → التطبيقات → AgentCab → البطارية، اسمح بالتشغيل في الخلفية.' },
    meizu: { title: 'تفعيل التشغيل في الخلفية', msg: 'في الإعدادات → التطبيقات → AgentCab → الأذونات، اسمح بالتشغيل في الخلفية.' },
    other: { title: 'تفعيل التشغيل في الخلفية', msg: 'يرجى السماح لـ AgentCab بالتشغيل في الخلفية في إعدادات النظام.' },
    default: { title: 'تفعيل التشغيل في الخلفية', msg: 'يرجى السماح لـ AgentCab بالتشغيل في الخلفية في إعدادات النظام.' },
  },
  sched_daily: 'يومياً في {0}',
  sched_weeklyAt: '{0} في {1}',
  sched_everyHours: 'كل {0} ساعات',
  sched_everyMins: 'كل {0} دقيقة',
  weekdayShortSchedule: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
}

const dicts: Record<Lang, AutomationDict> = { en, zh, vi, ja, ar }

function dict(): AutomationDict {
  return dicts[getCurrentLang() as Lang]
}

export function bgRunGuide(brand: DeviceBrand): BrandGuide {
  const d = dict()
  return d.brandGuide[brand] || d.brandGuide.default
}

export function automationChrome() {
  const d = dict()
  return { goSettings: d.goSettings, gotIt: d.gotIt }
}

/** Format an AutomationRule schedule for display, using the current app language. */
export function formatScheduleI18n(schedule: { type: string; time?: string; weekday?: number; intervalMinutes?: number }): string {
  const d = dict()
  if (schedule.type === 'daily') {
    return format(d.sched_daily, schedule.time || '08:00')
  }
  if (schedule.type === 'weekly') {
    const day = d.weekdayShortSchedule[schedule.weekday ?? 0]
    return format(d.sched_weeklyAt, day, schedule.time || '08:00')
  }
  if (schedule.type === 'interval') {
    const mins = schedule.intervalMinutes || 60
    if (mins >= 60) return format(d.sched_everyHours, mins / 60)
    return format(d.sched_everyMins, mins)
  }
  return ''
}
