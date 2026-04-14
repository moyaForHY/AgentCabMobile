// Weekday labels (kept separate from UI `t` dict so the dict stays string-only).

import { getCurrentLang } from './index'

type Lang = 'en' | 'zh' | 'vi' | 'ja' | 'ar'

const short: Record<Lang, string[]> = {
  en: ['S', 'M', 'T', 'W', 'T', 'F', 'S'],
  zh: ['日', '一', '二', '三', '四', '五', '六'],
  vi: ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'],
  ja: ['日', '月', '火', '水', '木', '金', '土'],
  ar: ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س'],
}

const full: Record<Lang, string[]> = {
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  zh: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'],
  vi: ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'],
  ja: ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'],
  ar: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
}

export function weekdaysShort(): string[] {
  return short[getCurrentLang() as Lang]
}

export function weekdaysFull(): string[] {
  return full[getCurrentLang() as Lang]
}
