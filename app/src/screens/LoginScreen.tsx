import React, { useState, useRef, useEffect } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  ScrollView,
  Animated,
  Dimensions,
} from 'react-native'
import LinearGradient from 'react-native-linear-gradient'
import { useI18n } from '../i18n'
import { useAuth } from '../hooks/useAuth'
import Logo3D from '../components/Logo3D'

const { width: SCREEN_W } = Dimensions.get('window')

type Mode = 'login' | 'register'

export default function LoginScreen() {
  const { login, register } = useAuth()
  const { t } = useI18n()
  const [mode, setMode] = useState<Mode>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

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
  }, [mode])

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert(t.errorTitle, t.fillAllFields); return
    }
    if (mode === 'register' && !name.trim()) {
      Alert.alert(t.errorTitle, t.enterName); return
    }
    setLoading(true)
    try {
      if (mode === 'login') await login(email.trim(), password)
      else await register(name.trim(), email.trim(), password)
    } catch (err: any) {
      Alert.alert(t.errorTitle, err.message || 'Something went wrong')
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
      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={s.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>

          {/* Decorative circles */}
          <View style={s.decoCircle1} />
          <View style={s.decoCircle2} />

          {/* Brand */}
          <Animated.View style={[s.brand, { opacity: fadeAnim }]}>
            <Logo3D size={200} pointCount={250} signalCount={10} color="37, 99, 235" glow={false} />
            <Text style={s.brandName}>AgentCab</Text>
            <Text style={s.brandSub}>{t.subtitle}</Text>
          </Animated.View>

          {/* Card */}
          <Animated.View style={[s.card, {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          }]}>
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

            {/* Fields */}
            {mode === 'register' && (
              <TextInput
                style={s.input}
                placeholder={t.namePlaceholder}
                placeholderTextColor="#94a3b8"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />
            )}
            <TextInput
              style={s.input}
              placeholder={t.emailPlaceholder}
              placeholderTextColor="#94a3b8"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TextInput
              style={s.input}
              placeholder={t.passwordPlaceholder}
              placeholderTextColor="#94a3b8"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />

            {/* Submit */}
            <TouchableOpacity
              style={[s.btnWrap, loading && { opacity: 0.6 }]}
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.85}>
              <LinearGradient
                colors={['#2563eb', '#1d4ed8']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={s.btn}>
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={s.btnText}>{mode === 'login' ? t.login : t.createAccount}</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>

        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 24 },

  // Deco
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

  // Brand
  brand: { alignItems: 'center', marginBottom: 28 },
  brandName: {
    fontSize: 28, fontWeight: '800', color: '#0f172a', letterSpacing: -1,
  },
  brandSub: {
    fontSize: 13, color: '#64748b', marginTop: 2,
  },

  // Card
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 20, padding: 24,
    borderWidth: 1, borderColor: 'rgba(37, 99, 235, 0.08)',
    shadowColor: 'rgba(37, 99, 235, 0.08)',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1, shadowRadius: 24,
    elevation: 4,
  },

  // Tabs
  tabWrap: {
    flexDirection: 'row', backgroundColor: '#f1f5f9',
    borderRadius: 12, padding: 3, marginBottom: 20,
    position: 'relative',
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

  // Input
  input: {
    backgroundColor: '#f8fafc', borderRadius: 12,
    padding: 14, fontSize: 15, color: '#0f172a',
    borderWidth: 1.5, borderColor: 'rgba(37, 99, 235, 0.1)',
    marginBottom: 14,
  },

  // Button
  btnWrap: { borderRadius: 12, overflow: 'hidden', marginTop: 4 },
  btn: { paddingVertical: 15, alignItems: 'center', borderRadius: 12 },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
})
