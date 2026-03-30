import React, { useRef, useState, useCallback, useEffect } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  FlatList,
  Pressable,
  StatusBar,
  Animated,
  Easing,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native'
import { useI18n } from '../i18n'
import { storage } from '../services/storage'
import { colors, fontWeight as fw } from '../utils/theme'

const { width: W, height: H } = Dimensions.get('window')
const SB = StatusBar.currentHeight || 44

// ─── Illustration: Page 1 — "AI that acts" ───────────────────
// Abstract phone with an arm/ray reaching outward
function IllustrationAct() {
  const float = useRef(new Animated.Value(0)).current
  const pulse = useRef(new Animated.Value(0.6)).current
  const rayExtend = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(float, { toValue: -8, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(float, { toValue: 0, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start()
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.6, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start()
    Animated.timing(rayExtend, { toValue: 1, duration: 1200, delay: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start()
  }, [])

  return (
    <View style={ill.container}>
      {/* Background glow */}
      <View style={[ill.glow, { backgroundColor: 'rgba(37,99,235,0.04)', width: 280, height: 280, borderRadius: 140 }]} />
      <View style={[ill.glow, { backgroundColor: 'rgba(37,99,235,0.06)', width: 200, height: 200, borderRadius: 100 }]} />

      {/* Phone body */}
      <Animated.View style={[ill.phone, { transform: [{ translateY: float }] }]}>
        <View style={ill.phoneNotch} />
        {/* Screen content lines */}
        <View style={ill.phoneLine1} />
        <View style={ill.phoneLine2} />
        <View style={ill.phoneLine3} />

        {/* Action dot — the "hand" reaching out */}
        <Animated.View style={[ill.actionOrb, { opacity: pulse }]} />
      </Animated.View>

      {/* Extending rays from phone */}
      {[30, -15, 60].map((angle, i) => (
        <Animated.View
          key={i}
          style={[
            ill.ray,
            {
              transform: [
                { rotate: `${angle}deg` },
                { scaleX: rayExtend },
                { translateX: 60 + i * 15 },
              ],
              opacity: Animated.multiply(rayExtend, new Animated.Value(0.7 - i * 0.15)),
            },
          ]}
        />
      ))}

      {/* Floating particles */}
      {[
        { x: 90, y: -60, size: 8, delay: 0 },
        { x: -80, y: -40, size: 6, delay: 400 },
        { x: 70, y: 50, size: 5, delay: 800 },
        { x: -60, y: 70, size: 7, delay: 200 },
      ].map((p, i) => (
        <FloatingDot key={i} x={p.x} y={p.y} size={p.size} delay={p.delay} />
      ))}
    </View>
  )
}

// ─── Illustration: Page 2 — "One app, many skills" ───────────
// Honeycomb grid of connected nodes
function IllustrationSkills() {
  const scale = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.spring(scale, { toValue: 1, friction: 6, tension: 40, useNativeDriver: true }).start()
  }, [])

  const nodes = [
    { x: 0, y: 0, size: 40, color: '#2563eb', delay: 0 },
    { x: -55, y: -35, size: 28, color: '#3b82f6', delay: 80 },
    { x: 55, y: -35, size: 28, color: '#60a5fa', delay: 160 },
    { x: -55, y: 35, size: 28, color: '#60a5fa', delay: 240 },
    { x: 55, y: 35, size: 28, color: '#3b82f6', delay: 320 },
    { x: 0, y: -70, size: 22, color: '#93bbfd', delay: 400 },
    { x: 0, y: 70, size: 22, color: '#93bbfd', delay: 480 },
    { x: -95, y: 0, size: 18, color: '#bfdbfe', delay: 560 },
    { x: 95, y: 0, size: 18, color: '#bfdbfe', delay: 640 },
  ]

  const connections = [
    [0, 1], [0, 2], [0, 3], [0, 4],
    [1, 5], [2, 5], [3, 6], [4, 6],
    [1, 7], [3, 7], [2, 8], [4, 8],
  ]

  return (
    <View style={ill.container}>
      <View style={[ill.glow, { backgroundColor: 'rgba(37,99,235,0.03)', width: 300, height: 300, borderRadius: 150 }]} />

      <Animated.View style={{ width: 280, height: 240, transform: [{ scale }] }}>
        {/* Connection lines */}
        {connections.map(([a, b], i) => {
          const n1 = nodes[a], n2 = nodes[b]
          const dx = n2.x - n1.x, dy = n2.y - n1.y
          const len = Math.sqrt(dx * dx + dy * dy)
          const angle = Math.atan2(dy, dx) * (180 / Math.PI)
          return (
            <View
              key={`c${i}`}
              style={{
                position: 'absolute',
                left: n1.x + 140,
                top: n1.y + 120,
                width: len,
                height: 1.5,
                backgroundColor: 'rgba(37,99,235,0.12)',
                transform: [{ rotate: `${angle}deg` }],
                transformOrigin: '0 0',
              }}
            />
          )
        })}

        {/* Nodes */}
        {nodes.map((n, i) => (
          <PulsingNode key={i} x={n.x + 140} y={n.y + 120} size={n.size} color={n.color} delay={n.delay} />
        ))}
      </Animated.View>
    </View>
  )
}

// ─── Illustration: Page 3 — "Automate your life" ─────────────
// Clock with orbiting elements
function IllustrationAutomate() {
  const spin = useRef(new Animated.Value(0)).current
  const spinSlow = useRef(new Animated.Value(0)).current
  const handTick = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 8000, easing: Easing.linear, useNativeDriver: true })
    ).start()
    Animated.loop(
      Animated.timing(spinSlow, { toValue: 1, duration: 20000, easing: Easing.linear, useNativeDriver: true })
    ).start()
    Animated.loop(
      Animated.sequence([
        Animated.timing(handTick, { toValue: 1, duration: 1000, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(handTick, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    ).start()
  }, [])

  const orbitRotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] })
  const orbitRotateSlow = spinSlow.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] })
  const minuteRotate = handTick.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '6deg'] })

  return (
    <View style={ill.container}>
      <View style={[ill.glow, { backgroundColor: 'rgba(37,99,235,0.04)', width: 280, height: 280, borderRadius: 140 }]} />

      {/* Outer orbit ring */}
      <Animated.View style={[ill.orbitRing, { width: 220, height: 220, borderRadius: 110, transform: [{ rotate: orbitRotateSlow }] }]}>
        <View style={[ill.orbitDot, { top: -5, left: 105 }]} />
        <View style={[ill.orbitDot, { bottom: -5, left: 105, backgroundColor: '#60a5fa' }]} />
      </Animated.View>

      {/* Inner orbit ring */}
      <Animated.View style={[ill.orbitRing, { width: 160, height: 160, borderRadius: 80, borderColor: 'rgba(37,99,235,0.1)', transform: [{ rotate: orbitRotate }] }]}>
        <View style={[ill.orbitDot, { top: 10, right: -4, width: 8, height: 8, backgroundColor: '#3b82f6' }]} />
        <View style={[ill.orbitDot, { bottom: 10, left: -4, width: 6, height: 6, backgroundColor: '#93bbfd' }]} />
      </Animated.View>

      {/* Clock face */}
      <View style={ill.clockFace}>
        {/* Hour markers */}
        {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg, i) => (
          <View
            key={i}
            style={[
              ill.hourMark,
              {
                transform: [
                  { rotate: `${deg}deg` },
                  { translateY: -38 },
                ],
              },
            ]}
          />
        ))}

        {/* Hour hand */}
        <View style={[ill.hand, { height: 22, width: 3, transform: [{ rotate: '150deg' }], top: 14 }]} />

        {/* Minute hand */}
        <View style={[ill.hand, { height: 30, width: 2, backgroundColor: '#3b82f6', transform: [{ rotate: '30deg' }], top: 8 }]} />

        {/* Center dot */}
        <View style={ill.clockCenter} />
      </View>
    </View>
  )
}

// ─── Reusable animated elements ──────────────────────────────

function FloatingDot({ x, y, size, delay }: { x: number; y: number; size: number; delay: number }) {
  const anim = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 2500, delay, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 2500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start()
  }, [])
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [0, -6] })
  const opacity = anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.3, 0.7, 0.3] })
  return (
    <Animated.View style={{
      position: 'absolute', left: x + 140 - size / 2, top: y + 120 - size / 2,
      width: size, height: size, borderRadius: size / 2, backgroundColor: '#2563eb',
      opacity, transform: [{ translateY }],
    }} />
  )
}

function PulsingNode({ x, y, size, color, delay }: { x: number; y: number; size: number; color: string; delay: number }) {
  const scale = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.spring(scale, { toValue: 1, friction: 5, tension: 50, delay, useNativeDriver: true }).start()
  }, [])
  return (
    <Animated.View style={{
      position: 'absolute',
      left: x - size / 2,
      top: y - size / 2,
      width: size,
      height: size,
      borderRadius: size / 2,
      backgroundColor: color,
      transform: [{ scale }],
      shadowColor: color,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 6,
      elevation: 3,
    }} />
  )
}

// ─── Page Data ───────────────────────────────────────────────

type PageData = {
  titleKey: 'onboardingTitle1' | 'onboardingTitle2' | 'onboardingTitle3'
  descKey: 'onboardingDesc1' | 'onboardingDesc2' | 'onboardingDesc3'
  Illustration: React.FC
  accent: string
}

const pages: PageData[] = [
  { titleKey: 'onboardingTitle1', descKey: 'onboardingDesc1', Illustration: IllustrationAct, accent: '#2563eb' },
  { titleKey: 'onboardingTitle2', descKey: 'onboardingDesc2', Illustration: IllustrationSkills, accent: '#3b82f6' },
  { titleKey: 'onboardingTitle3', descKey: 'onboardingDesc3', Illustration: IllustrationAutomate, accent: '#1e40af' },
]

// ─── Main Screen ─────────────────────────────────────────────

export default function OnboardingScreen({ navigation, onDone }: any) {
  const { t } = useI18n()
  const flatListRef = useRef<FlatList>(null)
  const [currentPage, setCurrentPage] = useState(0)
  const fadeIn = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.timing(fadeIn, { toValue: 1, duration: 600, delay: 200, useNativeDriver: true }).start()
  }, [])

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const page = Math.round(e.nativeEvent.contentOffset.x / W)
    setCurrentPage(page)
  }, [])

  const finish = useCallback(() => {
    storage.setString('onboarding_done', '1')
    onDone?.()
  }, [navigation])

  const goNext = useCallback(() => {
    if (currentPage < pages.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentPage + 1, animated: true })
    } else {
      finish()
    }
  }, [currentPage, finish])

  const isLast = currentPage === pages.length - 1

  const renderPage = useCallback(({ item }: { item: PageData }) => {
    const { Illustration } = item
    return (
      <View style={s.page}>
        <View style={s.illustrationWrap}>
          <Illustration />
        </View>
        <View style={s.textWrap}>
          <Text style={s.pageNum}>{`0${pages.indexOf(item) + 1}`}</Text>
          <Text style={s.title}>{t[item.titleKey]}</Text>
          <Text style={s.desc}>{t[item.descKey]}</Text>
        </View>
      </View>
    )
  }, [t])

  return (
    <View style={s.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      <Animated.View style={[s.inner, { opacity: fadeIn }]}>
        {/* Skip */}
        {!isLast && (
          <Pressable style={s.skipBtn} onPress={finish} hitSlop={16}>
            <Text style={s.skipText}>{t.onboardingSkip}</Text>
          </Pressable>
        )}

        <FlatList
          ref={flatListRef}
          data={pages}
          renderItem={renderPage}
          keyExtractor={(_, i) => String(i)}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          bounces={false}
        />

        {/* Bottom */}
        <View style={s.bottom}>
          {/* Dots */}
          <View style={s.dots}>
            {pages.map((_, i) => (
              <View key={i} style={[s.dot, i === currentPage && s.dotActive]} />
            ))}
          </View>

          {/* CTA button */}
          <Pressable style={[s.ctaBtn, isLast && s.ctaBtnLast]} onPress={goNext}>
            <Text style={s.ctaText}>{isLast ? t.onboardingGetStarted : '→'}</Text>
          </Pressable>
        </View>
      </Animated.View>
    </View>
  )
}

// ─── Illustration shared styles ──────────────────────────────

const ill = StyleSheet.create({
  container: {
    width: 280,
    height: 240,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
  },
  // Phone
  phone: {
    width: 72,
    height: 120,
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#2563eb',
    alignItems: 'center',
    paddingTop: 16,
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 6,
  },
  phoneNotch: {
    position: 'absolute',
    top: 6,
    width: 24,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(37,99,235,0.2)',
  },
  phoneLine1: { width: 40, height: 3, borderRadius: 1.5, backgroundColor: 'rgba(37,99,235,0.15)', marginBottom: 6 },
  phoneLine2: { width: 32, height: 3, borderRadius: 1.5, backgroundColor: 'rgba(37,99,235,0.1)', marginBottom: 6 },
  phoneLine3: { width: 36, height: 3, borderRadius: 1.5, backgroundColor: 'rgba(37,99,235,0.08)' },
  actionOrb: {
    position: 'absolute',
    bottom: -14,
    right: -14,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#2563eb',
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 5,
  },
  ray: {
    position: 'absolute',
    width: 40,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(37,99,235,0.2)',
    right: 60,
    top: 130,
  },
  // Clock
  clockFace: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: '#fff',
    borderWidth: 2.5,
    borderColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 5,
  },
  hourMark: {
    position: 'absolute',
    width: 2,
    height: 6,
    backgroundColor: 'rgba(37,99,235,0.25)',
    borderRadius: 1,
  },
  clockHand: {
    position: 'absolute',
    backgroundColor: '#1e40af',
    borderRadius: 2,
  },
  hand: {
    position: 'absolute',
    backgroundColor: '#1e40af',
    borderRadius: 2,
    left: '50%',
    marginLeft: -1.5,
    transformOrigin: 'bottom',
  },
  clockCenter: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#2563eb',
  },
  orbitRing: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: 'rgba(37,99,235,0.08)',
    borderStyle: 'dashed',
  },
  orbitDot: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#2563eb',
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 2,
  },
})

// ─── Main styles ─────────────────────────────────────────────

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  inner: {
    flex: 1,
  },
  skipBtn: {
    position: 'absolute',
    top: SB + 10,
    right: 20,
    zIndex: 10,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  skipText: {
    fontSize: 15,
    fontWeight: fw.medium,
    color: colors.ink500,
    letterSpacing: 0.3,
  },
  page: {
    width: W,
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  illustrationWrap: {
    height: H * 0.4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textWrap: {
    paddingHorizontal: 40,
    alignItems: 'center',
  },
  pageNum: {
    fontSize: 13,
    fontWeight: fw.bold,
    color: 'rgba(37,99,235,0.25)',
    letterSpacing: 2,
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: fw.extrabold,
    color: colors.ink950,
    textAlign: 'center',
    letterSpacing: -0.8,
    marginBottom: 12,
    lineHeight: 34,
  },
  desc: {
    fontSize: 16,
    fontWeight: fw.regular,
    color: colors.ink500,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 8,
  },
  bottom: {
    paddingBottom: 48,
    paddingHorizontal: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(37,99,235,0.15)',
  },
  dotActive: {
    backgroundColor: '#2563eb',
    width: 24,
    borderRadius: 4,
  },
  ctaBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  ctaBtnLast: {
    width: 'auto',
    paddingHorizontal: 32,
    borderRadius: 28,
  },
  ctaText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: fw.bold,
    letterSpacing: -0.3,
  },
})
