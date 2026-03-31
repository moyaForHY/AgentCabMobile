import React, { useState, useEffect } from 'react'
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Linking,
  BackHandler,
} from 'react-native'
import { colors, fontWeight, radii } from '../utils/theme'
import { isChinese } from '../utils/i18n'
import AsyncStorage from '@react-native-async-storage/async-storage'

const PRIVACY_ACCEPTED_KEY = 'privacy_accepted_v1'
const PRIVACY_URL = 'https://www.agentcab.ai/privacy'

type Props = {
  onAccepted: () => void
}

export default function PrivacyAgreement({ onAccepted }: Props) {
  const [visible, setVisible] = useState(false)
  const [checked, setChecked] = useState(false)
  const zh = isChinese()

  useEffect(() => {
    AsyncStorage.getItem(PRIVACY_ACCEPTED_KEY).then(v => {
      if (v === '1') {
        onAccepted()
      } else {
        setVisible(true)
      }
    })
  }, [])

  // Prevent back button dismissing
  useEffect(() => {
    if (!visible) return
    const handler = BackHandler.addEventListener('hardwareBackPress', () => true)
    return () => handler.remove()
  }, [visible])

  const handleAccept = () => {
    if (!checked) return
    AsyncStorage.setItem(PRIVACY_ACCEPTED_KEY, '1')
    setVisible(false)
    onAccepted()
  }

  const handleDecline = () => {
    BackHandler.exitApp()
  }

  if (!visible) return null

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => {}}>
      <View style={s.overlay}>
        <View style={s.card}>
          <Text style={s.title}>
            {zh ? '用户协议与隐私政策' : 'Terms & Privacy Policy'}
          </Text>

          <ScrollView style={s.scroll} showsVerticalScrollIndicator>
            <Text style={s.body}>
              {zh ? (
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
                `如需了解完整隐私政策，请访问：`
              ) : (
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
                `For the full privacy policy, visit:`
              )}
            </Text>
            <TouchableOpacity onPress={() => Linking.openURL(PRIVACY_URL)}>
              <Text style={s.link}>{PRIVACY_URL}</Text>
            </TouchableOpacity>
          </ScrollView>

          <TouchableOpacity
            style={s.checkRow}
            onPress={() => setChecked(!checked)}
            activeOpacity={0.7}
          >
            <View style={[s.checkbox, checked && s.checkboxChecked]}>
              {checked && <Text style={s.checkmark}>{'✓'}</Text>}
            </View>
            <Text style={s.checkLabel}>
              {zh
                ? '我已阅读并同意《用户协议》和《隐私政策》'
                : 'I have read and agree to the Terms and Privacy Policy'}
            </Text>
          </TouchableOpacity>

          <View style={s.btnRow}>
            <TouchableOpacity
              style={s.btnDecline}
              onPress={handleDecline}
              activeOpacity={0.7}
            >
              <Text style={s.btnDeclineText}>
                {zh ? '不同意并退出' : 'Decline & Exit'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.btnAccept, !checked && s.btnDisabled]}
              onPress={handleAccept}
              disabled={!checked}
              activeOpacity={0.7}
            >
              <Text style={[s.btnAcceptText, !checked && s.btnDisabledText]}>
                {zh ? '同意并继续' : 'Agree & Continue'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    width: '100%',
    maxWidth: 380,
    maxHeight: '80%',
    paddingTop: 24,
    paddingHorizontal: 20,
    paddingBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 10,
  },
  title: {
    fontSize: 20,
    fontWeight: fontWeight.bold,
    color: colors.ink950,
    textAlign: 'center',
    marginBottom: 16,
  },
  scroll: {
    maxHeight: 340,
    marginBottom: 16,
  },
  body: {
    fontSize: 13,
    color: colors.ink700,
    lineHeight: 20,
  },
  link: {
    fontSize: 13,
    color: colors.primary,
    marginTop: 4,
    marginBottom: 8,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.ink400,
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkmark: {
    color: '#fff',
    fontSize: 13,
    fontWeight: fontWeight.bold,
  },
  checkLabel: {
    flex: 1,
    fontSize: 13,
    color: colors.ink700,
    lineHeight: 18,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  btnDecline: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: radii.md,
    alignItems: 'center',
    backgroundColor: colors.sand100,
  },
  btnDeclineText: {
    fontSize: 14,
    fontWeight: fontWeight.semibold,
    color: colors.ink600,
  },
  btnAccept: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: radii.md,
    alignItems: 'center',
    backgroundColor: colors.primary,
  },
  btnAcceptText: {
    fontSize: 14,
    fontWeight: fontWeight.semibold,
    color: '#fff',
  },
  btnDisabled: {
    backgroundColor: colors.sand200,
  },
  btnDisabledText: {
    color: colors.ink400,
  },
})
