import React, { useState, useRef, useEffect } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Animated,
  Dimensions,
} from 'react-native'
import { useKeyboard } from '../hooks/useKeyboard'
import LinearGradient from 'react-native-linear-gradient'
import { useI18n } from '../i18n'
import { useAuth } from '../hooks/useAuth'
import { api } from '../services/api'
import { showModal } from '../components/AppModal'
import Logo3D from '../components/Logo3D'
import { colors, gradients, shadows, radii, spacing, fontSize, fontWeight } from '../utils/theme'

const { width: SCREEN_W } = Dimensions.get('window')

type Step = 'form' | 'verify'
type Mode = 'login' | 'register'

function isPhone(input: string): boolean {
  return /^1[3-9]\d{9}$/.test(input.trim())
}

export default function LoginScreen() {
  const { login, register } = useAuth()
  const { t } = useI18n()
  const { height: kbHeight } = useKeyboard()
  const [mode, setMode] = useState<Mode>('login')
  const [step, setStep] = useState<Step>('form')
  const [name, setName] = useState('')
  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [smsCode, setSmsCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [sendingCode, setSendingCode] = useState(false)
  const [codeEndTime, setCodeEndTime] = useState(0)
  const [countdown, setCountdown] = useState(0)

  const fadeAnim = useRef(new Animated.Value(0)).current
  const slideAnim = useRef(new Animated.Value(20)).current
  const tabIndicator = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 60, friction: 12, useNativeDriver: true }),
    ]).start()
  }, [])

  useEffect(() => {
    Animated.spring(tabIndicator, {
      toValue: mode === 'login' ? 0 : 1,
      tension: 100, friction: 12, useNativeDriver: true,
    }).start()
    setStep('form')
  }, [mode])

  // Countdown based on end time — survives background
  useEffect(() => {
    if (codeEndTime <= 0) return
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((codeEndTime - Date.now()) / 1000))
      setCountdown(remaining)
      if (remaining <= 0) return
      requestAnimationFrame(tick)
    }
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [codeEndTime])

  const handleSendCode = async () => {
    if (!account.trim()) return
    setSendingCode(true)
    try {
      await api.post('/auth/sms/send', { phone: account.trim() })
      setCodeEndTime(Date.now() + 60000)
    } catch (err: any) {
      showModal(t.errorTitle, err.message || t.sendCodeFailed)
    } finally {
      setSendingCode(false)
    }
  }

  // Step 1: Validate form and proceed
  const handleFormSubmit = async () => {
    if (!account.trim()) {
      showModal(t.errorTitle, t.fillAllFields); return
    }

    if (mode === 'login') {
      // Login: just need account + password
      if (!password.trim()) {
        showModal(t.errorTitle, t.fillAllFields); return
      }
      setLoading(true)
      try {
        if (isPhone(account)) {
          await login(account.trim(), password, { phone: account.trim(), password })
        } else {
          await login(account.trim(), password)
        }
      } catch (err: any) {
        showModal(t.errorTitle, err.message || t.loginFailed)
      } finally {
        setLoading(false)
      }
    } else {
      // Register: validate all fields, then go to verify step if phone
      if (!name.trim()) { showModal(t.errorTitle, t.enterName); return }
      if (!password.trim()) { showModal(t.errorTitle, t.fillAllFields); return }
      if (password.length < 8) {
        showModal(t.errorTitle, t.passwordMinLength)
        return
      }
      if (password !== confirmPassword) {
        showModal(t.errorTitle, t.passwordsNoMatch)
        return
      }

      if (isPhone(account)) {
        // Phone register → send code and go to verify step
        await handleSendCode()
        setStep('verify')
      } else {
        // Email register → register directly
        setLoading(true)
        try {
          await register(name.trim(), account.trim(), password)
        } catch (err: any) {
          showModal(t.errorTitle, err.message || t.registrationFailed)
        } finally {
          setLoading(false)
        }
      }
    }
  }

  // Step 2: Verify SMS code and complete registration
  const handleVerifySubmit = async () => {
    if (!smsCode.trim() || smsCode.length < 6) {
      showModal(t.errorTitle, t.enterSmsCode)
      return
    }
    setLoading(true)
    try {
      await register(name.trim(), '', password, { phone: account.trim(), sms_code: smsCode.trim() })
    } catch (err: any) {
      showModal(t.errorTitle, err.message || t.registrationFailed)
    } finally {
      setLoading(false)
    }
  }

  const indicatorX = tabIndicator.interpolate({
    inputRange: [0, 1],
    outputRange: [0, (SCREEN_W - 96) / 2],
  })

  return (
    <View style={s.container}>
      <ScrollView
        contentContainerStyle={[s.scrollContent, { paddingBottom: kbHeight > 0 ? kbHeight : 32 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>

        {/* ── Brand Header ── */}
        <Animated.View style={[s.brand, { opacity: fadeAnim }]}>
          <Logo3D size={160} pointCount={250} signalCount={10} color="37, 99, 235" glow />
          <Text style={s.brandName}>AgentCab</Text>
          <Text style={s.brandSub}>{t.subtitle}</Text>
        </Animated.View>

        {/* ── Form Card ── */}
        <Animated.View style={[s.card, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>

          {step === 'form' ? (
            <>
              {/* Tabs */}
              <View style={s.tabWrap}>
                <Animated.View style={[s.tabSlider, { transform: [{ translateX: indicatorX }] }]} />
                <TouchableOpacity style={s.tab} onPress={() => setMode('login')} activeOpacity={0.7}>
                  <Text style={[s.tabText, mode === 'login' && s.tabTextActive]}>{t.login}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.tab} onPress={() => setMode('register')} activeOpacity={0.7}>
                  <Text style={[s.tabText, mode === 'register' && s.tabTextActive]}>{t.signUp}</Text>
                </TouchableOpacity>
              </View>

              {/* Name (register) */}
              {mode === 'register' && (
                <TextInput style={s.input} placeholder={t.namePlaceholder} placeholderTextColor={colors.ink500}
                  value={name} onChangeText={setName} autoCapitalize="words" />
              )}

              {/* Account */}
              <TextInput style={s.input}
                placeholder={t.phoneOrEmail}
                placeholderTextColor={colors.ink500}
                value={account} onChangeText={setAccount}
                autoCapitalize="none" keyboardType="email-address" />

              {/* Password */}
              <TextInput style={s.input} placeholder={t.passwordPlaceholder} placeholderTextColor={colors.ink500}
                value={password} onChangeText={setPassword} secureTextEntry />

              {/* Confirm password (register) */}
              {mode === 'register' && (
                <TextInput style={s.input}
                  placeholder={t.confirmPassword}
                  placeholderTextColor={colors.ink500}
                  value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry />
              )}

              {/* Submit */}
              <View style={[s.btnShadow, loading && { opacity: 0.6 }]}>
              <TouchableOpacity style={s.btnWrap}
                onPress={handleFormSubmit} disabled={loading} activeOpacity={0.85}>
                <LinearGradient colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.btn}>
                  <View style={s.btnInner}>
                    {loading ? <ActivityIndicator color="#fff" /> : (
                      <Text style={s.btnText}>
                        {mode === 'login' ? t.login : (isPhone(account) ? t.nextStep : t.createAccount)}
                      </Text>
                    )}
                  </View>
                </LinearGradient>
              </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              {/* Verify SMS Code */}
              <Text style={s.verifyTitle}>{t.enterVerificationCode}</Text>
              <Text style={s.verifyDesc}>
                {t.codeSentTo.replace('{0}', account)}
              </Text>

              <TextInput style={s.codeInput}
                placeholder="000000"
                placeholderTextColor={colors.ink400}
                value={smsCode} onChangeText={setSmsCode}
                keyboardType="number-pad" maxLength={6}
                autoFocus textAlign="center" />

              <TouchableOpacity
                style={[s.resendBtn, (countdown > 0 || sendingCode) && { opacity: 0.5 }]}
                onPress={handleSendCode}
                disabled={countdown > 0 || sendingCode}>
                <Text style={s.resendText}>
                  {countdown > 0 ? `${countdown}s` : t.resend}
                </Text>
              </TouchableOpacity>

              <View style={[s.btnShadow, loading && { opacity: 0.6 }]}>
              <TouchableOpacity style={s.btnWrap}
                onPress={handleVerifySubmit} disabled={loading} activeOpacity={0.85}>
                <LinearGradient colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.btn}>
                  <View style={s.btnInner}>
                    {loading ? <ActivityIndicator color="#fff" /> : (
                      <Text style={s.btnText}>{t.createAccount}</Text>
                    )}
                  </View>
                </LinearGradient>
              </TouchableOpacity>
              </View>

              <TouchableOpacity style={s.backBtn} onPress={() => setStep('form')}>
                <Text style={s.backText}>{'\u2190'} {t.back}</Text>
              </TouchableOpacity>
            </>
          )}
        </Animated.View>

      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sand50 },
  scrollContent: { flexGrow: 1 },

  // ── Hero ──
  hero: {
    paddingTop: 64,
    paddingBottom: 48,
    alignItems: 'center',
    borderBottomLeftRadius: radii.xxl,
    borderBottomRightRadius: radii.xxl,
    overflow: 'hidden',
  },
  heroGlow: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(37, 99, 235, 0.1)',
    top: 20,
    alignSelf: 'center',
  },
  brand: { alignItems: 'center', zIndex: 1, paddingTop: 60, paddingBottom: 20 },
  brandName: {
    fontSize: 32,
    fontWeight: fontWeight.extrabold,
    color: colors.ink950,
    letterSpacing: -1,
    marginTop: 4,
  },
  brandSub: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.regular,
    color: colors.ink500,
    marginTop: 4,
  },

  // ── Card ──
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.lg,
    marginHorizontal: spacing.lg,
    marginTop: 16,
    ...shadows.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },

  // ── Tabs ──
  tabWrap: {
    flexDirection: 'row',
    backgroundColor: colors.sand100,
    borderRadius: radii.md,
    padding: 3,
    marginBottom: 20,
    position: 'relative',
  },
  tabSlider: {
    position: 'absolute', top: 3, left: 3,
    width: '50%', height: '100%',
    backgroundColor: colors.white,
    borderRadius: 10,
    ...shadows.sm,
  },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', zIndex: 1 },
  tabText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.ink500 },
  tabTextActive: { color: colors.primary },

  // ── Inputs ──
  input: {
    backgroundColor: colors.sand50,
    borderRadius: radii.md,
    padding: 14,
    fontSize: 15,
    color: colors.ink950,
    borderWidth: 1.5,
    borderColor: colors.border,
    marginBottom: 14,
  },

  // ── CTA Button ──
  btnShadow: {
    borderRadius: radii.md,
    marginTop: spacing.xs,
    ...shadows.glow,
  },
  btnWrap: {
    borderRadius: radii.md,
    overflow: 'hidden',
  },
  btn: { borderRadius: radii.md },
  btnInner: { paddingVertical: 15, alignItems: 'center' },
  btnText: { color: colors.white, fontSize: 15, fontWeight: fontWeight.bold },

  // ── Verify step ──
  verifyTitle: {
    fontSize: 20,
    fontWeight: fontWeight.bold,
    color: colors.ink950,
    textAlign: 'center',
    marginBottom: 8,
  },
  verifyDesc: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  codeInput: {
    backgroundColor: colors.sand50,
    borderRadius: radii.md,
    padding: 16,
    fontSize: 28,
    fontWeight: fontWeight.bold,
    color: colors.ink950,
    borderWidth: 1.5,
    borderColor: 'rgba(37, 99, 235, 0.15)',
    marginBottom: 14,
    letterSpacing: 8,
  },
  resendBtn: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  resendText: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: fontWeight.semibold,
  },
  backBtn: {
    alignItems: 'center',
    marginTop: 14,
  },
  backText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
})
