import React, { useState, useEffect } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import Icon from 'react-native-vector-icons/Feather'
import { api } from '../services/api'
import { showModal } from '../components/AppModal'
import { colors, fontWeight, radii, spacing, fontSize as fs } from '../utils/theme'
import { useI18n } from '../i18n'

export default function EmailVerifyScreen({ navigation }: any) {
  const { t } = useI18n()
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [countdown, setCountdown] = useState(0)

  useEffect(() => {
    // 进入页面自动发送验证码
    handleSend()
  }, [])

  useEffect(() => {
    if (countdown <= 0) return
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000)
    return () => clearTimeout(timer)
  }, [countdown])

  const handleSend = async () => {
    if (countdown > 0) return
    setSending(true)
    try {
      await api.post('/auth/send-email-verification')
      setCountdown(60)
      showModal(t.emailVerify_codeSent, t.emailVerify_checkEmail)
    } catch (err: any) {
      showModal(t.emailVerify_sendFailed, err?.response?.data?.detail || err.message)
    } finally {
      setSending(false)
    }
  }

  const handleVerify = async () => {
    if (!code.trim() || code.length < 6) {
      showModal(t.emailVerify_hint, t.emailVerify_enter6)
      return
    }
    setLoading(true)
    try {
      await api.post('/auth/verify-email', { code: code.trim() })
      showModal(t.emailVerify_verified, t.emailVerify_verifiedMsg)
      navigation.goBack()
    } catch (err: any) {
      showModal(t.emailVerify_failed, err?.response?.data?.detail || err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={s.container}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
        <Icon name="arrow-left" size={22} color={colors.ink700} />
      </TouchableOpacity>

      <View style={s.content}>
        <Icon name="mail" size={48} color={colors.primary} style={{ marginBottom: 20 }} />
        <Text style={s.title}>{t.emailVerify_title}</Text>
        <Text style={s.desc}>{t.emailVerify_desc}</Text>

        <TextInput
          style={s.input}
          placeholder={t.emailVerify_enter6}
          placeholderTextColor={colors.ink300}
          value={code}
          onChangeText={setCode}
          keyboardType="number-pad"
          maxLength={6}
          autoFocus
        />

        <TouchableOpacity style={s.verifyBtn} onPress={handleVerify} disabled={loading} activeOpacity={0.7}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={s.verifyBtnText}>{t.emailVerify_verify}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={handleSend} disabled={countdown > 0 || sending} activeOpacity={0.7} style={s.resendBtn}>
          <Text style={[s.resendText, countdown > 0 && { color: colors.ink300 }]}>
            {countdown > 0
              ? `${t.emailVerify_resend} (${countdown}s)`
              : sending
                ? t.emailVerify_sending
                : t.emailVerify_resendCode}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  backBtn: { paddingTop: 56, paddingStart: 20 },
  content: { flex: 1, alignItems: 'center', paddingTop: 60, paddingHorizontal: 40 },
  title: { fontSize: fs.xl, color: colors.ink700, fontWeight: fontWeight.bold, marginBottom: 8 },
  desc: { fontSize: fs.sm, color: colors.ink400, textAlign: 'center', marginBottom: 32 },
  input: {
    width: '100%',
    height: 52,
    borderWidth: 1,
    borderColor: colors.sand200,
    borderRadius: radii.md,
    paddingHorizontal: 16,
    fontSize: 24,
    textAlign: 'center',
    letterSpacing: 8,
    color: colors.ink700,
    fontWeight: fontWeight.semibold,
  },
  verifyBtn: {
    width: '100%',
    height: 48,
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
  },
  verifyBtnText: { color: '#fff', fontSize: fs.md, fontWeight: fontWeight.semibold },
  resendBtn: { marginTop: 20 },
  resendText: { fontSize: fs.sm, color: colors.primary },
})
