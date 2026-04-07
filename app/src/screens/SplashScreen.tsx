import React, { useEffect, useRef } from 'react'
import { View, Text, StyleSheet, Animated } from 'react-native'
import LinearGradient from 'react-native-linear-gradient'
import { colors, gradients, fontSize, fontWeight } from '../utils/theme'
import Logo3D from '../components/Logo3D'

interface SplashScreenProps {
  onFinish: () => void
}

export default function SplashScreen({ onFinish }: SplashScreenProps) {
  const opacity = useRef(new Animated.Value(0)).current
  const scale = useRef(new Animated.Value(0.92)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        tension: 60,
        friction: 12,
        useNativeDriver: true,
      }),
    ]).start()

    const timer = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) onFinish()
      })
    }, 2000)

    return () => clearTimeout(timer)
  }, [])

  return (
    <LinearGradient colors={gradients.heroDark} style={styles.container}>
      <Animated.View style={[styles.content, { opacity, transform: [{ scale }] }]}>
        <Logo3D size={160} pointCount={250} signalCount={10} color="37, 99, 235" glow />
        <Text style={styles.title}>AgentCab</Text>
        <Text style={styles.subtitle}>AI能力，触手可及</Text>
      </Animated.View>

      {/* Decorative glow orb */}
      <View style={styles.glowOrb} />
    </LinearGradient>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
  },
  title: {
    fontSize: 34,
    fontWeight: fontWeight.extrabold,
    color: colors.white,
    letterSpacing: -1,
    marginTop: 16,
  },
  subtitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.regular,
    color: 'rgba(255, 255, 255, 0.5)',
    marginTop: 6,
  },
  glowOrb: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
    top: '30%',
  },
})
