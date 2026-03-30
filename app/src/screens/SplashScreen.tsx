import React, { useEffect, useRef } from 'react'
import { View, Text, StyleSheet, Animated } from 'react-native'
import { colors, fontSize, fontWeight } from '../utils/theme'
import Logo3D from '../components/Logo3D'

interface SplashScreenProps {
  onFinish: () => void
}

export default function SplashScreen({ onFinish }: SplashScreenProps) {
  const opacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start()

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
    <View style={styles.container}>
      <Animated.View style={[styles.content, { opacity }]}>
        <Logo3D size={160} pointCount={250} signalCount={10} color="37, 99, 235" glow />
        <Text style={styles.title}>AgentCab</Text>
        <Text style={styles.subtitle}>Your AI assistant</Text>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: fontWeight.extrabold,
    color: colors.primary,
    letterSpacing: -0.8,
    marginTop: 16,
  },
  subtitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.regular,
    color: colors.textSecondary,
    marginTop: 6,
  },
})
