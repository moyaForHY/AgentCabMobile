// Action executor strings — service-layer dict kept separate from UI `t` so
// `t[dynamicKey]` can stay strictly `string`-valued.
// Placeholders use {0}, {1} — substitute via format() from ./index.

import { getCurrentLang, format } from './index'

type ActionDict = {
  ok: string
  cancel: string
  cancelledByUser: string
  unknownAction: string
  actionTimedOut: string
  deleteFile: string
  deleteFiles: string
  moveFile: string
  deleteEvent: string
  createReminder: string
  saveContact: string
  sendSmsFailed: string
  smsPermNeeded: string
  appNotInstalled: string
  launchFailed: string
  uninstallApp: string
  uninstallFailed: string
  setBrightness: string
  setVolume: string
  streamMedia: string
  toggleWifi: string
  toggleBluetooth: string
  enableWord: string
  disableWord: string
  setWallpaper: string
  clickText: string
  setText: string
  longPress: string
  cannotOpenUrl: string
  cannotOpenDeeplink: string
  cannotOpenSettings: string
  cannotOpenSettingsPage: string
  noAlarmHandler: string
  downloadFailed: string
  photoCancelled: string
  noRecorder: string
  bluetoothSettingsFailed: string
  smsAppOpened: string
  notifPermDenied: string
  a11yRequiredTitle: string
  a11yRequiredMsg: string
  a11yNotEnabled: string
  writeSettingsTitle: string
  writeSettingsMsg: string
  goSettings: string
}

const en: ActionDict = {
  ok: 'OK',
  cancel: 'Cancel',
  cancelledByUser: 'Cancelled by user',
  unknownAction: 'Unknown action: {0}',
  actionTimedOut: 'Action timed out',
  deleteFile: 'Delete {0}?',
  deleteFiles: 'Delete {0} files?',
  moveFile: 'Move file to {0}?',
  deleteEvent: 'Delete calendar event?',
  createReminder: 'Create reminder: "{0}" at {1}?',
  saveContact: 'Save contact "{0}"?',
  sendSmsFailed: 'Could not send SMS.',
  smsPermNeeded: 'SMS send permission denied.',
  appNotInstalled: 'App not installed: {0}',
  launchFailed: 'Failed to launch {0}',
  uninstallApp: 'Uninstall {0}?',
  uninstallFailed: 'Could not open uninstall dialog.',
  setBrightness: 'Set brightness to {0}?',
  setVolume: 'Set {0} volume to {1}?',
  streamMedia: 'media',
  toggleWifi: 'Open Wi-Fi settings to {0} Wi-Fi?',
  toggleBluetooth: 'Open Bluetooth settings to {0} Bluetooth?',
  enableWord: 'enable',
  disableWord: 'disable',
  setWallpaper: 'Set as wallpaper?',
  clickText: 'Click "{0}"?',
  setText: 'Set text to "{0}"?',
  longPress: 'Long press "{0}"?',
  cannotOpenUrl: 'Cannot open URL: {0}',
  cannotOpenDeeplink: 'Cannot open deeplink: {0}',
  cannotOpenSettings: 'Could not open settings',
  cannotOpenSettingsPage: 'Could not open settings ({0})',
  noAlarmHandler: 'Could not open clock app. No handler for alarm intent.',
  downloadFailed: 'Failed to download file.',
  photoCancelled: 'Photo capture cancelled or failed.',
  noRecorder: 'No voice recorder app found.',
  bluetoothSettingsFailed: 'Could not open Bluetooth settings.',
  smsAppOpened: 'SMS app opened, please press send manually',
  notifPermDenied: 'Notification permission denied',
  a11yRequiredTitle: 'Accessibility Service Required',
  a11yRequiredMsg: 'This action requires the AgentCab accessibility service.\n\nSettings → Accessibility → AgentCab → Enable',
  a11yNotEnabled: 'Accessibility service not enabled',
  writeSettingsTitle: 'System Settings Permission Required',
  writeSettingsMsg: 'Please allow AgentCab to modify system settings.',
  goSettings: 'Open Settings',
}

const zh: ActionDict = {
  ok: '确定',
  cancel: '取消',
  cancelledByUser: '用户取消',
  unknownAction: '未知操作: {0}',
  actionTimedOut: '操作超时',
  deleteFile: '删除 {0}？',
  deleteFiles: '删除 {0} 个文件？',
  moveFile: '移动文件到 {0}？',
  deleteEvent: '删除日历事件？',
  createReminder: '创建提醒: "{0}" 于 {1}？',
  saveContact: '保存联系人 "{0}"？',
  sendSmsFailed: '无法发送短信',
  smsPermNeeded: '短信发送权限未开启',
  appNotInstalled: '应用未安装: {0}',
  launchFailed: '启动失败: {0}',
  uninstallApp: '卸载 {0}？',
  uninstallFailed: '无法打开卸载对话框',
  setBrightness: '设置亮度为 {0}？',
  setVolume: '设置{0}音量为 {1}？',
  streamMedia: '媒体',
  toggleWifi: '打开Wi-Fi设置以{0}Wi-Fi？',
  toggleBluetooth: '打开蓝牙设置以{0}蓝牙？',
  enableWord: '开启',
  disableWord: '关闭',
  setWallpaper: '设为壁纸？',
  clickText: '点击 "{0}"？',
  setText: '设置文本为 "{0}"？',
  longPress: '长按 "{0}"？',
  cannotOpenUrl: '无法打开链接: {0}',
  cannotOpenDeeplink: '无法打开: {0}',
  cannotOpenSettings: '无法打开设置',
  cannotOpenSettingsPage: '无法打开设置 ({0})',
  noAlarmHandler: '无法打开闹钟应用',
  downloadFailed: '下载失败',
  photoCancelled: '拍照取消或失败',
  noRecorder: '未找到录音应用',
  bluetoothSettingsFailed: '无法打开蓝牙设置',
  smsAppOpened: '已打开短信应用，请手动点击发送',
  notifPermDenied: '通知权限未开启',
  a11yRequiredTitle: '需要开启无障碍服务',
  a11yRequiredMsg: '此操作需要开启AgentCab无障碍服务：\n\n设置 → 无障碍 → AgentCab → 开启',
  a11yNotEnabled: '无障碍服务未开启',
  writeSettingsTitle: '需要修改系统设置权限',
  writeSettingsMsg: '请允许AgentCab修改系统设置：\n\n系统会打开设置页面，请开启"允许修改系统设置"',
  goSettings: '去设置',
}

const vi: ActionDict = {
  ok: 'OK',
  cancel: 'Hủy',
  cancelledByUser: 'Người dùng đã hủy',
  unknownAction: 'Hành động không xác định: {0}',
  actionTimedOut: 'Hành động hết thời gian',
  deleteFile: 'Xóa {0}?',
  deleteFiles: 'Xóa {0} tập tin?',
  moveFile: 'Di chuyển tập tin đến {0}?',
  deleteEvent: 'Xóa sự kiện lịch?',
  createReminder: 'Tạo nhắc nhở: "{0}" lúc {1}?',
  saveContact: 'Lưu liên hệ "{0}"?',
  sendSmsFailed: 'Không thể gửi SMS.',
  smsPermNeeded: 'Không có quyền gửi SMS.',
  appNotInstalled: 'Ứng dụng chưa cài đặt: {0}',
  launchFailed: 'Khởi chạy thất bại: {0}',
  uninstallApp: 'Gỡ cài đặt {0}?',
  uninstallFailed: 'Không thể mở hộp thoại gỡ cài đặt.',
  setBrightness: 'Đặt độ sáng thành {0}?',
  setVolume: 'Đặt âm lượng {0} thành {1}?',
  streamMedia: 'media',
  toggleWifi: 'Mở cài đặt Wi-Fi để {0} Wi-Fi?',
  toggleBluetooth: 'Mở cài đặt Bluetooth để {0} Bluetooth?',
  enableWord: 'bật',
  disableWord: 'tắt',
  setWallpaper: 'Đặt làm hình nền?',
  clickText: 'Nhấp "{0}"?',
  setText: 'Đặt văn bản thành "{0}"?',
  longPress: 'Nhấn giữ "{0}"?',
  cannotOpenUrl: 'Không thể mở URL: {0}',
  cannotOpenDeeplink: 'Không thể mở deeplink: {0}',
  cannotOpenSettings: 'Không thể mở cài đặt',
  cannotOpenSettingsPage: 'Không thể mở cài đặt ({0})',
  noAlarmHandler: 'Không thể mở ứng dụng đồng hồ.',
  downloadFailed: 'Tải xuống thất bại.',
  photoCancelled: 'Chụp ảnh đã hủy hoặc thất bại.',
  noRecorder: 'Không tìm thấy ứng dụng ghi âm.',
  bluetoothSettingsFailed: 'Không thể mở cài đặt Bluetooth.',
  smsAppOpened: 'Đã mở ứng dụng SMS, vui lòng nhấn gửi thủ công',
  notifPermDenied: 'Không có quyền thông báo',
  a11yRequiredTitle: 'Cần dịch vụ Trợ năng',
  a11yRequiredMsg: 'Hành động này cần dịch vụ trợ năng của AgentCab.\n\nCài đặt → Trợ năng → AgentCab → Bật',
  a11yNotEnabled: 'Dịch vụ trợ năng chưa bật',
  writeSettingsTitle: 'Cần quyền sửa cài đặt hệ thống',
  writeSettingsMsg: 'Vui lòng cho phép AgentCab sửa cài đặt hệ thống.',
  goSettings: 'Mở cài đặt',
}

const ja: ActionDict = {
  ok: 'OK',
  cancel: 'キャンセル',
  cancelledByUser: 'ユーザーによりキャンセル',
  unknownAction: '不明な操作: {0}',
  actionTimedOut: '操作タイムアウト',
  deleteFile: '{0} を削除？',
  deleteFiles: '{0} 個のファイルを削除？',
  moveFile: 'ファイルを {0} に移動？',
  deleteEvent: 'カレンダーイベントを削除？',
  createReminder: 'リマインダーを作成: "{0}" を {1}？',
  saveContact: '連絡先 "{0}" を保存？',
  sendSmsFailed: 'SMSを送信できません',
  smsPermNeeded: 'SMS送信権限がありません',
  appNotInstalled: 'アプリ未インストール: {0}',
  launchFailed: '起動失敗: {0}',
  uninstallApp: '{0} をアンインストール？',
  uninstallFailed: 'アンインストールダイアログを開けません',
  setBrightness: '明るさを {0} に設定？',
  setVolume: '{0} の音量を {1} に設定？',
  streamMedia: 'メディア',
  toggleWifi: 'Wi-Fi設定を開いて{0}？',
  toggleBluetooth: 'Bluetooth設定を開いて{0}？',
  enableWord: '有効化',
  disableWord: '無効化',
  setWallpaper: '壁紙に設定？',
  clickText: '"{0}" をクリック？',
  setText: 'テキストを "{0}" に設定？',
  longPress: '"{0}" を長押し？',
  cannotOpenUrl: 'URLを開けません: {0}',
  cannotOpenDeeplink: 'ディープリンクを開けません: {0}',
  cannotOpenSettings: '設定を開けません',
  cannotOpenSettingsPage: '設定を開けません ({0})',
  noAlarmHandler: '時計アプリを開けません',
  downloadFailed: 'ダウンロード失敗',
  photoCancelled: '写真撮影がキャンセルまたは失敗',
  noRecorder: 'ボイスレコーダーアプリが見つかりません',
  bluetoothSettingsFailed: 'Bluetooth設定を開けません',
  smsAppOpened: 'SMSアプリを開きました。手動で送信してください',
  notifPermDenied: '通知権限が拒否されました',
  a11yRequiredTitle: 'アクセシビリティサービスが必要',
  a11yRequiredMsg: 'この操作にはAgentCabのアクセシビリティサービスが必要です。\n\n設定 → アクセシビリティ → AgentCab → 有効化',
  a11yNotEnabled: 'アクセシビリティサービスが無効',
  writeSettingsTitle: 'システム設定変更の権限が必要',
  writeSettingsMsg: 'AgentCabにシステム設定の変更を許可してください。',
  goSettings: '設定を開く',
}

const ar: ActionDict = {
  ok: 'موافق',
  cancel: 'إلغاء',
  cancelledByUser: 'تم الإلغاء بواسطة المستخدم',
  unknownAction: 'إجراء غير معروف: {0}',
  actionTimedOut: 'انتهت مهلة الإجراء',
  deleteFile: 'حذف {0}؟',
  deleteFiles: 'حذف {0} ملفات؟',
  moveFile: 'نقل الملف إلى {0}؟',
  deleteEvent: 'حذف حدث التقويم؟',
  createReminder: 'إنشاء تذكير: "{0}" في {1}؟',
  saveContact: 'حفظ جهة الاتصال "{0}"؟',
  sendSmsFailed: 'تعذر إرسال SMS.',
  smsPermNeeded: 'تم رفض إذن إرسال SMS.',
  appNotInstalled: 'التطبيق غير مثبت: {0}',
  launchFailed: 'فشل التشغيل: {0}',
  uninstallApp: 'إلغاء تثبيت {0}؟',
  uninstallFailed: 'تعذر فتح مربع إلغاء التثبيت.',
  setBrightness: 'ضبط السطوع إلى {0}؟',
  setVolume: 'ضبط مستوى صوت {0} إلى {1}؟',
  streamMedia: 'الوسائط',
  toggleWifi: 'فتح إعدادات Wi-Fi لـ{0} Wi-Fi؟',
  toggleBluetooth: 'فتح إعدادات Bluetooth لـ{0} Bluetooth؟',
  enableWord: 'تفعيل',
  disableWord: 'تعطيل',
  setWallpaper: 'تعيين كخلفية؟',
  clickText: 'النقر على "{0}"؟',
  setText: 'تعيين النص إلى "{0}"؟',
  longPress: 'الضغط المطول على "{0}"؟',
  cannotOpenUrl: 'لا يمكن فتح الرابط: {0}',
  cannotOpenDeeplink: 'لا يمكن فتح الرابط العميق: {0}',
  cannotOpenSettings: 'تعذر فتح الإعدادات',
  cannotOpenSettingsPage: 'تعذر فتح الإعدادات ({0})',
  noAlarmHandler: 'تعذر فتح تطبيق الساعة.',
  downloadFailed: 'فشل تنزيل الملف.',
  photoCancelled: 'تم إلغاء التقاط الصورة أو فشل.',
  noRecorder: 'لم يتم العثور على تطبيق مسجل صوت.',
  bluetoothSettingsFailed: 'تعذر فتح إعدادات Bluetooth.',
  smsAppOpened: 'تم فتح تطبيق SMS، يرجى الضغط على إرسال يدوياً',
  notifPermDenied: 'تم رفض إذن الإشعارات',
  a11yRequiredTitle: 'خدمة إمكانية الوصول مطلوبة',
  a11yRequiredMsg: 'يتطلب هذا الإجراء خدمة إمكانية الوصول من AgentCab.\n\nالإعدادات → إمكانية الوصول → AgentCab → تفعيل',
  a11yNotEnabled: 'خدمة إمكانية الوصول غير مفعلة',
  writeSettingsTitle: 'إذن تعديل إعدادات النظام مطلوب',
  writeSettingsMsg: 'يرجى السماح لـ AgentCab بتعديل إعدادات النظام.',
  goSettings: 'فتح الإعدادات',
}

const dicts: Record<'en' | 'zh' | 'vi' | 'ja' | 'ar', ActionDict> = { en, zh, vi, ja, ar }

function dict(): ActionDict {
  return dicts[getCurrentLang()]
}

/** Action strings with params substituted — drop-in replacement for the old util. */
export function actionStrings() {
  const a = dict()
  return {
    ok: a.ok,
    cancel: a.cancel,
    cancelledByUser: a.cancelledByUser,
    unknownAction: (type: string) => format(a.unknownAction, type),
    actionTimedOut: a.actionTimedOut,
    deleteFile: (name: string) => format(a.deleteFile, name),
    deleteFiles: (n: number) => format(a.deleteFiles, n),
    moveFile: (dest: string) => format(a.moveFile, dest),
    deleteEvent: a.deleteEvent,
    createReminder: (title: string, time: string) => format(a.createReminder, title, time),
    saveContact: (name: string) => format(a.saveContact, name),
    sendSmsFailed: a.sendSmsFailed,
    smsPermNeeded: a.smsPermNeeded,
    appNotInstalled: (pkg: string) => format(a.appNotInstalled, pkg),
    launchFailed: (pkg: string) => format(a.launchFailed, pkg),
    uninstallApp: (pkg: string) => format(a.uninstallApp, pkg),
    uninstallFailed: a.uninstallFailed,
    setBrightness: (level: number) => format(a.setBrightness, level),
    setVolume: (stream: string, level: number) =>
      format(a.setVolume, stream === 'media' ? a.streamMedia : stream, level),
    toggleWifi: (enable: boolean) => format(a.toggleWifi, enable ? a.enableWord : a.disableWord),
    toggleBluetooth: (enable: boolean) => format(a.toggleBluetooth, enable ? a.enableWord : a.disableWord),
    setWallpaper: a.setWallpaper,
    clickText: (text: string) => format(a.clickText, text),
    setText: (text: string) => format(a.setText, text),
    longPress: (text: string) => format(a.longPress, text),
    cannotOpenUrl: (url: string) => format(a.cannotOpenUrl, url),
    cannotOpenDeeplink: (uri: string) => format(a.cannotOpenDeeplink, uri),
    cannotOpenSettings: (page?: string) => page ? format(a.cannotOpenSettingsPage, page) : a.cannotOpenSettings,
    noAlarmHandler: a.noAlarmHandler,
    downloadFailed: a.downloadFailed,
    photoCancelled: a.photoCancelled,
    noRecorder: a.noRecorder,
    bluetoothSettingsFailed: a.bluetoothSettingsFailed,
    smsAppOpened: a.smsAppOpened,
    notifPermDenied: a.notifPermDenied,
    a11yRequiredTitle: a.a11yRequiredTitle,
    a11yRequiredMsg: a.a11yRequiredMsg,
    a11yNotEnabled: a.a11yNotEnabled,
    writeSettingsTitle: a.writeSettingsTitle,
    writeSettingsMsg: a.writeSettingsMsg,
    goSettings: a.goSettings,
  }
}
