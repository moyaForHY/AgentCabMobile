import React, { useEffect, useRef, useState } from 'react'
import { Animated, StyleSheet, Text } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, fontWeight } from '../utils/theme'
import { useI18n } from '../i18n'
import { networkStatus } from '../services/network'

export default function NetworkBanner() {
  const { t } = useI18n()
  const insets = useSafeAreaInsets()
  const [offline, setOffline] = useState(false)
  const [restored, setRestored] = useState(false)
  const slideAnim = useRef(new Animated.Value(-60)).current

  useEffect(() => {
    const unsubscribe = networkStatus.subscribe(online => {
      if (!online) {
        setOffline(true)
        setRestored(false)
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 80,
          friction: 12,
        }).start()
      } else if (offline) {
        // Was offline, now restored
        setRestored(true)
        setTimeout(() => {
          Animated.timing(slideAnim, {
            toValue: -60,
            duration: 300,
            useNativeDriver: true,
          }).start(() => {
            setOffline(false)
            setRestored(false)
          })
        }, 2000)
      }
    })
    return unsubscribe
  }, [offline, slideAnim])

  if (!offline) return null

  return (
    <Animated.View
      style={[
        s.banner,
        { paddingTop: insets.top + 4, transform: [{ translateY: slideAnim }] },
        restored && s.bannerRestored,
      ]}
      pointerEvents="none">
      <Text style={s.text}>
        {restored ? t.networkRestored : t.noInternet}
      </Text>
    </Animated.View>
  )
}

const s = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    backgroundColor: colors.error,
    paddingBottom: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerRestored: {
    backgroundColor: colors.success,
  },
  text: {
    color: '#fff',
    fontSize: 13,
    fontWeight: fontWeight.semibold,
  },
})
