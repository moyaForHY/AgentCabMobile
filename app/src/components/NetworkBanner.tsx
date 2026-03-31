import React, { useEffect, useRef, useState } from 'react'
import { Animated, StyleSheet, Text } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, fontWeight } from '../utils/theme'
import { useI18n } from '../i18n'
import { events } from '../services/events'

// Event emitted by api.ts interceptor on network error
const EVENT_NETWORK_ERROR = 'network_error'
const EVENT_NETWORK_OK = 'network_ok'

export { EVENT_NETWORK_ERROR, EVENT_NETWORK_OK }

export default function NetworkBanner() {
  const { t } = useI18n()
  const insets = useSafeAreaInsets()
  const [visible, setVisible] = useState(false)
  const [restored, setRestored] = useState(false)
  const slideAnim = useRef(new Animated.Value(-60)).current
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const unsubError = events.on(EVENT_NETWORK_ERROR, () => {
      if (hideTimer.current) clearTimeout(hideTimer.current)
      setVisible(true)
      setRestored(false)
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 80,
        friction: 12,
      }).start()
    })

    const unsubOk = events.on(EVENT_NETWORK_OK, () => {
      if (!visible) return
      setRestored(true)
      hideTimer.current = setTimeout(() => {
        Animated.timing(slideAnim, {
          toValue: -60,
          duration: 300,
          useNativeDriver: true,
        }).start(() => {
          setVisible(false)
          setRestored(false)
        })
      }, 2000)
    })

    return () => { unsubError(); unsubOk() }
  }, [visible])

  if (!visible) return null

  return (
    <Animated.View
      style={[
        s.banner,
        { top: insets.top, backgroundColor: restored ? '#059669' : '#dc2626' },
        { transform: [{ translateY: slideAnim }] },
      ]}>
      <Text style={s.text}>{restored ? t.networkRestored : t.noInternet}</Text>
    </Animated.View>
  )
}

const s = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 9999,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  text: {
    color: '#fff',
    fontSize: 13,
    fontWeight: fontWeight.semibold,
  },
})
