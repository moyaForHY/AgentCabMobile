import React, { useState, useRef, useEffect } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
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
import Logo3D from '../components/Logo3D'

const { width: SCREEN_W } = Dimensions.get('window')

type Step = 'form' | 'verify'
type Mode = 'login' | 'register'

function isPhone(input: string): boolean {
  return /^1[3-9]\d{9}$/.test(input.trim())
}

export default function LoginScreen() {
  const { login, register } = useAuth()
  const { t, lang } = useI18n()
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
      Alert.alert(t.errorTitle, err.message || 'Failed to send code')
    } finally {
      setSendingCode(false)
    }
  }

  // Step 1: Validate form and proceed
  const handleFormSubmit = async () => {
    if (!account.trim()) {
      Alert.alert(t.errorTitle, t.fillAllFields); return
    }

    if (mode === 'login') {
      // Login: just need account + password
      if (!password.trim()) {
        Alert.alert(t.errorTitle, t.fillAllFields); return
      }
      setLoading(true)
      try {
        if (isPhone(account)) {
          await login(account.trim(), password, { phone: account.trim(), password })
        } else {
          await login(account.trim(), password)
        }
      } catch (err: any) {
        Alert.alert(t.errorTitle, err.message || 'Login failed')
      } finally {
        setLoading(false)
      }
    } else {
      // Register: validate all fields, then go to verify step if phone
      if (!name.trim()) { Alert.alert(t.errorTitle, t.enterName); return }
      if (!password.trim()) { Alert.alert(t.errorTitle, t.fillAllFields); return }
      if (password.length < 8) {
        Alert.alert(t.errorTitle, lang === 'zh' ? '密码至少 8 位' : 'Password must be at least 8 characters')
        return
      }
      if (password !== confirmPassword) {
        Alert.alert(t.errorTitle, lang === 'zh' ? '两次密码不一致' : 'Passwords do not match')
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
          Alert.alert(t.errorTitle, err.message || 'Registration failed')
        } finally {
          setLoading(false)
        }
      }
    }
  }

  // Step 2: Verify SMS code and complete registration
  const handleVerifySubmit = async () => {
    if (!smsCode.trim() || smsCode.length < 6) {
      Alert.alert(t.errorTitle, lang === 'zh' ? '请输入 6 位验证码' : 'Please enter 6-digit code')
      return
    }
    setLoading(true)
    try {
      await register(name.trim(), '', password, { phone: account.trim(), sms_code: smsCode.trim() })
    } catch (err: any) {
      Alert.alert(t.errorTitle, err.message || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  const indicatorX = tabIndicator.interpolate({
    inputRange: [0, 1],
    outputRange: [0, (SCREEN_W - 96) / 2],
  })

  return (
    <LinearGradient colors={['#ffffff', '#f0f7ff', '#f8fafc']} style={s.container}>
      <View style={s.flex}>
        <ScrollView
          contentContainerStyle={[s.scrollContent, { paddingBottom: kbHeight > 0 ? kbHeight : 32 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>

          <View style={s.decoCircle1} />
          <View style={s.decoCircle2} />

          <Animated.View style={[s.brand, { opacity: fadeAnim }]}>
            <Logo3D size={200} pointCount={250} signalCount={10} color="37, 99, 235" glow={false} />
            <Text style={s.brandName}>AgentCab</Text>
            <Text style={s.brandSub}>{t.subtitle}</Text>
          </Animated.View>

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
                  <TextInput style={s.input} placeholder={t.namePlaceholder} placeholderTextColor="#94a3b8"
                    value={name} onChangeText={setName} autoCapitalize="words" />
                )}

                {/* Account */}
                <TextInput style={s.input}
                  placeholder={lang === 'zh' ? '手机号 / 邮箱' : 'Phone / Email'}
                  placeholderTextColor="#94a3b8"
                  value={account} onChangeText={setAccount}
                  autoCapitalize="none" keyboardType="email-address" />

                {/* Password */}
                <TextInput style={s.input} placeholder={t.passwordPlaceholder} placeholderTextColor="#94a3b8"
                  value={password} onChangeText={setPassword} secureTextEntry />

                {/* Confirm password (register) */}
                {mode === 'register' && (
                  <TextInput style={s.input}
                    placeholder={lang === 'zh' ? '确认密码' : 'Confirm Password'}
                    placeholderTextColor="#94a3b8"
                    value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry />
                )}

                {/* Submit */}
                <TouchableOpacity style={[s.btnWrap, loading && { opacity: 0.6 }]}
                  onPress={handleFormSubmit} disabled={loading} activeOpacity={0.85}>
                  <LinearGradient colors={['#2563eb', '#1d4ed8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.btn}>
                    {loading ? <ActivityIndicator color="#fff" /> : (
                      <Text style={s.btnText}>
                        {mode === 'login' ? t.login : (isPhone(account) ? (lang === 'zh' ? '下一步' : 'Next') : t.createAccount)}
                      </Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </>
            ) : (
              <>
                {/* Verify SMS Code */}
                <Text style={s.verifyTitle}>{lang === 'zh' ? '输入验证码' : 'Enter Verification Code'}</Text>
                <Text style={s.verifyDesc}>
                  {lang === 'zh' ? `验证码已发送至 ${account}` : `Code sent to ${account}`}
                </Text>

                <TextInput style={s.codeInput}
                  placeholder="000000"
                  placeholderTextColor="#cbd5e1"
                  value={smsCode} onChangeText={setSmsCode}
                  keyboardType="number-pad" maxLength={6}
                  autoFocus textAlign="center" />

                <TouchableOpacity
                  style={[s.resendBtn, (countdown > 0 || sendingCode) && { opacity: 0.5 }]}
                  onPress={handleSendCode}
                  disabled={countdown > 0 || sendingCode}>
                  <Text style={s.resendText}>
                    {countdown > 0 ? `${countdown}s` : (lang === 'zh' ? '重新发送' : 'Resend')}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity style={[s.btnWrap, loading && { opacity: 0.6 }]}
                  onPress={handleVerifySubmit} disabled={loading} activeOpacity={0.85}>
                  <LinearGradient colors={['#2563eb', '#1d4ed8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.btn}>
                    {loading ? <ActivityIndicator color="#fff" /> : (
                      <Text style={s.btnText}>{t.createAccount}</Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity style={s.backBtn} onPress={() => setStep('form')}>
                  <Text style={s.backText}>{lang === 'zh' ? '← 返回' : '← Back'}</Text>
                </TouchableOpacity>
              </>
            )}
          </Animated.View>

        </ScrollView>
      </View>
    </LinearGradient>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 24 },

  decoCircle1: {
    position: 'absolute', top: -80, right: -60,
    width: 240, height: 240, borderRadius: 120,
    backgroundColor: 'rgba(37, 99, 235, 0.04)',
  },
  decoCircle2: {
    position: 'absolute', bottom: -40, left: -50,
    width: 180, height: 180, borderRadius: 90,
    backgroundColor: 'rgba(37, 99, 235, 0.03)',
  },

  brand: { alignItems: 'center', marginBottom: 28 },
  brandName: { fontSize: 28, fontWeight: '800', color: '#0f172a', letterSpacing: -1 },
  brandSub: { fontSize: 13, color: '#64748b', marginTop: 2 },

  card: {
    backgroundColor: '#ffffff', borderRadius: 20, padding: 24,
    borderWidth: 1, borderColor: 'rgba(37, 99, 235, 0.08)',
    shadowColor: 'rgba(37, 99, 235, 0.08)',
    shadowOffset: { width: 0, height: 8 }, shadowOpacity: 1, shadowRadius: 24, elevation: 4,
  },

  tabWrap: {
    flexDirection: 'row', backgroundColor: '#f1f5f9',
    borderRadius: 12, padding: 3, marginBottom: 20, position: 'relative',
  },
  tabSlider: {
    position: 'absolute', top: 3, left: 3,
    width: '50%', height: '100%',
    backgroundColor: '#fff', borderRadius: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', zIndex: 1 },
  tabText: { fontSize: 14, fontWeight: '600', color: '#94a3b8' },
  tabTextActive: { color: '#2563eb' },

  input: {
    backgroundColor: '#f8fafc', borderRadius: 12,
    padding: 14, fontSize: 15, color: '#0f172a',
    borderWidth: 1.5, borderColor: 'rgba(37, 99, 235, 0.1)',
    marginBottom: 14,
  },

  btnWrap: { borderRadius: 12, overflow: 'hidden', marginTop: 4 },
  btn: { paddingVertical: 15, alignItems: 'center', borderRadius: 12 },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Verify step
  verifyTitle: {
    fontSize: 20, fontWeight: '700', color: '#0f172a', textAlign: 'center', marginBottom: 8,
  },
  verifyDesc: {
    fontSize: 14, color: '#64748b', textAlign: 'center', marginBottom: 24,
  },
  codeInput: {
    backgroundColor: '#f8fafc', borderRadius: 12,
    padding: 16, fontSize: 28, fontWeight: '700', color: '#0f172a',
    borderWidth: 1.5, borderColor: 'rgba(37, 99, 235, 0.15)',
    marginBottom: 14, letterSpacing: 8,
  },
  resendBtn: {
    alignItems: 'center', marginBottom: 16,
  },
  resendText: {
    fontSize: 14, color: '#2563eb', fontWeight: '600',
  },
  backBtn: {
    alignItems: 'center', marginTop: 14,
  },
  backText: {
    fontSize: 14, color: '#64748b',
  },
})
