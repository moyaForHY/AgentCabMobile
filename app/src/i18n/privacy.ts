// Privacy agreement — long-form legal text kept separate from UI `t` dict.

import { getCurrentLang } from './index'

type Lang = 'en' | 'zh' | 'vi' | 'ja' | 'ar'

type PrivacyDict = {
  title: string
  body: string
  checkLabel: string
  decline: string
  accept: string
  linkLabelSuffix: string // "...visit:" / "...访问："
}

const zh: PrivacyDict = {
  title: '用户协议与隐私政策',
  body:
    `欢迎使用 AgentCab！\n\n` +
    `在使用本应用前，请您仔细阅读并同意以下条款：\n\n` +
    `一、信息收集与使用\n\n` +
    `为了提供 AI 技能服务，本应用可能需要访问以下设备信息（仅在您使用相关功能时，经您明确授权后才会读取）：\n\n` +
    `  - 短信（读取/发送）：用于安全检测、诈骗识别、短信通知等技能\n` +
    `  - 通话记录：用于安全检测、通话分析等技能\n` +
    `  - 通讯录：用于联系人管理等技能\n` +
    `  - 相册/存储：用于照片整理、文件管理等技能\n` +
    `  - 日历：用于日程管理等技能\n` +
    `  - 位置：用于需要位置信息的技能\n` +
    `  - 相机：用于拍照、扫描等技能\n` +
    `  - 麦克风：用于语音录制等技能\n` +
    `  - 蓝牙：用于设备信息采集等技能\n` +
    `  - 通知：用于任务完成提醒、安全告警等\n` +
    `  - 已安装应用列表：用于手机管理等技能\n\n` +
    `二、数据安全\n\n` +
    `  - 您的设备数据仅在调用 AI 技能时临时传输至服务器处理，处理完成后不会长期存储原始数据\n` +
    `  - 数据传输全程使用 HTTPS 加密\n` +
    `  - 我们不会将您的个人数据出售或分享给第三方\n\n` +
    `三、权限管理\n\n` +
    `  - 所有权限均为按需申请，您可以拒绝任何权限请求\n` +
    `  - 拒绝某项权限仅影响相关功能，不影响其他功能使用\n` +
    `  - 您可以随时在系统设置中关闭已授予的权限\n\n` +
    `四、账号与注销\n\n` +
    `  - 您可以在个人中心申请删除账号及所有关联数据\n\n` +
    `如需了解完整隐私政策，请访问：`,
  checkLabel: '我已阅读并同意《用户协议》和《隐私政策》',
  decline: '不同意并退出',
  accept: '同意并继续',
  linkLabelSuffix: '',
}

const en: PrivacyDict = {
  title: 'Terms & Privacy Policy',
  body:
    `Welcome to AgentCab!\n\n` +
    `Please read and agree to the following terms before using this app:\n\n` +
    `1. Information Collection\n\n` +
    `To provide AI skill services, this app may request access to the following device information (only when you use related features, and only after your explicit authorization):\n\n` +
    `  - SMS (Read/Send): For security detection, fraud identification, notifications\n` +
    `  - Call Log: For security detection, call analysis\n` +
    `  - Contacts: For contact management\n` +
    `  - Photos/Storage: For photo organization, file management\n` +
    `  - Calendar: For schedule management\n` +
    `  - Location: For location-based features\n` +
    `  - Camera: For photo capture, scanning\n` +
    `  - Microphone: For voice recording\n` +
    `  - Bluetooth: For device information collection\n` +
    `  - Notifications: For task completion alerts, security warnings\n` +
    `  - Installed Apps: For device management\n\n` +
    `2. Data Security\n\n` +
    `  - Device data is only temporarily transmitted to the server when calling AI skills. Raw data is not stored long-term after processing.\n` +
    `  - All data transmission uses HTTPS encryption.\n` +
    `  - We do not sell or share your personal data with third parties.\n\n` +
    `3. Permission Management\n\n` +
    `  - All permissions are requested on-demand. You can deny any permission request.\n` +
    `  - Denying a permission only affects related features.\n` +
    `  - You can revoke permissions at any time in system settings.\n\n` +
    `4. Account Deletion\n\n` +
    `  - You can request to delete your account and all associated data in your profile.\n\n` +
    `For the full privacy policy, visit:`,
  checkLabel: 'I have read and agree to the Terms and Privacy Policy',
  decline: 'Decline & Exit',
  accept: 'Agree & Continue',
  linkLabelSuffix: '',
}

const vi: PrivacyDict = {
  title: 'Điều khoản & Chính sách bảo mật',
  body:
    `Chào mừng bạn đến với AgentCab!\n\n` +
    `Vui lòng đọc và đồng ý các điều khoản sau trước khi sử dụng ứng dụng:\n\n` +
    `1. Thu thập thông tin\n\n` +
    `Để cung cấp dịch vụ kỹ năng AI, ứng dụng có thể yêu cầu truy cập các thông tin thiết bị sau (chỉ khi bạn sử dụng tính năng liên quan và sau khi bạn cấp quyền rõ ràng):\n\n` +
    `  - SMS (Đọc/Gửi): Phát hiện lừa đảo, thông báo bảo mật\n` +
    `  - Nhật ký cuộc gọi: Phát hiện bảo mật, phân tích cuộc gọi\n` +
    `  - Danh bạ: Quản lý liên hệ\n` +
    `  - Ảnh/Bộ nhớ: Sắp xếp ảnh, quản lý tập tin\n` +
    `  - Lịch: Quản lý lịch trình\n` +
    `  - Vị trí: Tính năng dựa trên vị trí\n` +
    `  - Máy ảnh: Chụp ảnh, quét\n` +
    `  - Micro: Ghi âm\n` +
    `  - Bluetooth: Thu thập thông tin thiết bị\n` +
    `  - Thông báo: Cảnh báo hoàn tất nhiệm vụ, cảnh báo bảo mật\n` +
    `  - Ứng dụng đã cài: Quản lý thiết bị\n\n` +
    `2. Bảo mật dữ liệu\n\n` +
    `  - Dữ liệu thiết bị chỉ được truyền tạm thời đến máy chủ khi gọi kỹ năng AI. Dữ liệu gốc không được lưu trữ lâu dài sau khi xử lý.\n` +
    `  - Toàn bộ truyền dữ liệu sử dụng mã hóa HTTPS.\n` +
    `  - Chúng tôi không bán hoặc chia sẻ dữ liệu cá nhân của bạn cho bên thứ ba.\n\n` +
    `3. Quản lý quyền\n\n` +
    `  - Mọi quyền đều được yêu cầu theo nhu cầu. Bạn có thể từ chối bất kỳ yêu cầu nào.\n` +
    `  - Từ chối một quyền chỉ ảnh hưởng đến tính năng liên quan.\n` +
    `  - Bạn có thể thu hồi quyền bất cứ lúc nào trong cài đặt hệ thống.\n\n` +
    `4. Xóa tài khoản\n\n` +
    `  - Bạn có thể yêu cầu xóa tài khoản và toàn bộ dữ liệu liên quan trong hồ sơ cá nhân.\n\n` +
    `Để xem chính sách bảo mật đầy đủ, truy cập:`,
  checkLabel: 'Tôi đã đọc và đồng ý với Điều khoản và Chính sách bảo mật',
  decline: 'Từ chối & Thoát',
  accept: 'Đồng ý & Tiếp tục',
  linkLabelSuffix: '',
}

const ja: PrivacyDict = {
  title: '利用規約とプライバシーポリシー',
  body:
    `AgentCab へようこそ！\n\n` +
    `本アプリを使用する前に、以下の規約を必ずお読みください：\n\n` +
    `1. 情報収集\n\n` +
    `AI スキルサービスを提供するため、本アプリは以下のデバイス情報へのアクセスを要求する場合があります（関連機能を使用する際にのみ、明示的な許可を得てから）：\n\n` +
    `  - SMS（読み取り/送信）：セキュリティ検出、詐欺識別、通知\n` +
    `  - 通話履歴：セキュリティ検出、通話分析\n` +
    `  - 連絡先：連絡先管理\n` +
    `  - 写真/ストレージ：写真整理、ファイル管理\n` +
    `  - カレンダー：スケジュール管理\n` +
    `  - 位置情報：位置ベース機能\n` +
    `  - カメラ：写真撮影、スキャン\n` +
    `  - マイク：音声録音\n` +
    `  - Bluetooth：デバイス情報収集\n` +
    `  - 通知：タスク完了アラート、セキュリティ警告\n` +
    `  - インストール済みアプリ：デバイス管理\n\n` +
    `2. データセキュリティ\n\n` +
    `  - デバイスデータは AI スキル呼び出し時にのみサーバーに一時送信されます。処理後、生データは長期保存されません。\n` +
    `  - すべてのデータ送信は HTTPS で暗号化されます。\n` +
    `  - 個人データを第三者に販売または共有しません。\n\n` +
    `3. 権限管理\n\n` +
    `  - すべての権限はオンデマンドで要求されます。いつでも拒否できます。\n` +
    `  - 権限を拒否しても、関連機能のみが影響を受けます。\n` +
    `  - システム設定からいつでも権限を取り消せます。\n\n` +
    `4. アカウント削除\n\n` +
    `  - プロフィールからアカウントと関連データの削除を要求できます。\n\n` +
    `完全なプライバシーポリシーは以下をご覧ください：`,
  checkLabel: '利用規約とプライバシーポリシーを読み、同意しました',
  decline: '拒否して終了',
  accept: '同意して続ける',
  linkLabelSuffix: '',
}

const ar: PrivacyDict = {
  title: 'الشروط وسياسة الخصوصية',
  body:
    `مرحباً بك في AgentCab!\n\n` +
    `يرجى قراءة الشروط التالية والموافقة عليها قبل استخدام التطبيق:\n\n` +
    `1. جمع المعلومات\n\n` +
    `لتقديم خدمات مهارات الذكاء الاصطناعي، قد يطلب هذا التطبيق الوصول إلى معلومات الجهاز التالية (فقط عند استخدام الميزات ذات الصلة، وبعد تفويضك الصريح):\n\n` +
    `  - SMS (القراءة/الإرسال): للكشف الأمني، تحديد الاحتيال، الإشعارات\n` +
    `  - سجل المكالمات: للكشف الأمني، تحليل المكالمات\n` +
    `  - جهات الاتصال: لإدارة جهات الاتصال\n` +
    `  - الصور/التخزين: لتنظيم الصور، إدارة الملفات\n` +
    `  - التقويم: لإدارة الجدول\n` +
    `  - الموقع: للميزات المستندة إلى الموقع\n` +
    `  - الكاميرا: لالتقاط الصور، المسح\n` +
    `  - الميكروفون: لتسجيل الصوت\n` +
    `  - Bluetooth: لجمع معلومات الجهاز\n` +
    `  - الإشعارات: لتنبيهات إكمال المهام، تحذيرات الأمان\n` +
    `  - التطبيقات المثبتة: لإدارة الجهاز\n\n` +
    `2. أمان البيانات\n\n` +
    `  - يتم إرسال بيانات الجهاز مؤقتاً إلى الخادم فقط عند استدعاء مهارات AI. لا يتم تخزين البيانات الأولية لفترة طويلة بعد المعالجة.\n` +
    `  - يستخدم جميع نقل البيانات تشفير HTTPS.\n` +
    `  - لا نبيع أو نشارك بياناتك الشخصية مع أطراف ثالثة.\n\n` +
    `3. إدارة الأذونات\n\n` +
    `  - يتم طلب جميع الأذونات عند الحاجة. يمكنك رفض أي طلب إذن.\n` +
    `  - رفض إذن يؤثر فقط على الميزات ذات الصلة.\n` +
    `  - يمكنك إلغاء الأذونات في أي وقت من إعدادات النظام.\n\n` +
    `4. حذف الحساب\n\n` +
    `  - يمكنك طلب حذف حسابك وجميع البيانات المرتبطة من ملفك الشخصي.\n\n` +
    `للاطلاع على سياسة الخصوصية الكاملة، قم بزيارة:`,
  checkLabel: 'لقد قرأت وأوافق على الشروط وسياسة الخصوصية',
  decline: 'رفض والخروج',
  accept: 'موافق ومتابعة',
  linkLabelSuffix: '',
}

const dicts: Record<Lang, PrivacyDict> = { en, zh, vi, ja, ar }

export function privacyStrings(): PrivacyDict {
  return dicts[getCurrentLang() as Lang]
}
