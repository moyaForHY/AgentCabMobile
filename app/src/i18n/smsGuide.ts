// SMS permission guide strings — primarily for Chinese carriers where
// notification SMS permission is restricted per-brand. Non-zh markets use
// email registration only, so vi/en branches are kept minimal.

import { getCurrentLang } from './index'
import { getDeviceBrand } from '../utils/i18n'

type Lang = 'en' | 'zh' | 'vi' | 'ja' | 'ar'

type SmsGuide = {
  title: string
  message: string
  goSettings: string
  skip: string
}

const zhBrandMsg: Record<string, string> = {
  xiaomi:  '小米手机需要额外开启"通知类短信"权限：\n\n设置 → 应用设置 → 应用管理 → AgentCab → 权限管理 → 通知类短信 → 允许',
  huawei:  '华为手机可能限制了短信读取，请检查：\n\n设置 → 应用和服务 → 应用管理 → AgentCab → 权限 → 短信 → 允许\n\n如仍无法读取验证码短信，请关闭"智能短信"功能',
  vivo:    'vivo手机可能限制了短信读取，请检查：\n\n设置 → 应用与权限 → 应用管理 → AgentCab → 权限 → 短信 → 允许',
  _default:'部分手机系统会限制通知类短信的读取，请检查：\n\n设置 → 应用 → AgentCab → 权限 → 短信 → 允许\n\n如仍无法读取，请在系统设置中查找"短信权限"或"通知类短信"相关选项',
}

const enMsg = 'Some Android devices restrict reading notification/verification SMS.\n\nPlease check:\n\nSettings → Apps → AgentCab → Permissions → SMS → Allow\n\nIf verification SMS are still missing, check for additional SMS-related settings in your system settings.'

const viMsg = 'Một số thiết bị Android hạn chế đọc SMS thông báo/xác minh.\n\nVui lòng kiểm tra:\n\nCài đặt → Ứng dụng → AgentCab → Quyền → SMS → Cho phép\n\nNếu vẫn không nhận được SMS xác minh, hãy kiểm tra các cài đặt SMS bổ sung trong hệ thống.'

const jaMsg = '一部のAndroid端末は通知/認証SMSの読み取りを制限しています。\n\n設定 → アプリ → AgentCab → 権限 → SMS → 許可 を確認してください。\n\n認証SMSがまだ届かない場合は、システム設定でSMS関連の追加設定を確認してください。'

const arMsg = 'بعض أجهزة Android تقيد قراءة رسائل SMS للإشعارات/التحقق.\n\nيرجى التحقق:\n\nالإعدادات → التطبيقات → AgentCab → الأذونات → SMS → السماح\n\nإذا كانت رسائل التحقق لا تزال مفقودة، تحقق من إعدادات SMS الإضافية في نظامك.'

const chrome: Record<Lang, Omit<SmsGuide, 'message'>> = {
  zh: { title: '无法读取通知类短信', goSettings: '去设置', skip: '跳过' },
  en: { title: 'Cannot Read Notification SMS', goSettings: 'Open Settings', skip: 'Skip' },
  vi: { title: 'Không thể đọc SMS thông báo', goSettings: 'Mở cài đặt', skip: 'Bỏ qua' },
  ja: { title: '通知SMSを読み取れません', goSettings: '設定を開く', skip: 'スキップ' },
  ar: { title: 'لا يمكن قراءة SMS الإشعارات', goSettings: 'فتح الإعدادات', skip: 'تخطي' },
}

export function smsGuideStrings(): SmsGuide {
  const lang = getCurrentLang() as Lang
  let message: string
  if (lang === 'zh') {
    const brand = getDeviceBrand()
    message = zhBrandMsg[brand] || zhBrandMsg._default
  } else if (lang === 'vi') {
    message = viMsg
  } else if (lang === 'ja') {
    message = jaMsg
  } else if (lang === 'ar') {
    message = arMsg
  } else {
    message = enMsg
  }
  return { ...chrome[lang], message }
}
