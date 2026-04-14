import React, { useEffect, useRef, useState, useCallback } from 'react'
import {
  Animated,
  TouchableOpacity,
  Text,
  StyleSheet,
  Platform,
  StatusBar,
} from 'react-native'
import { events, EVENT_CALL_COMPLETED, type CallCompletedPayload } from '../services/events'
import { navigate } from '../navigation/navigationRef'
import { colors, fontWeight } from '../utils/theme'

const BANNER_HEIGHT = 60
const TOP_INSET = Platform.OS === 'ios' ? 50 : (StatusBar.currentHeight ?? 24) + 8
const AUTO_DISMISS_MS = 4000

type PendingNotification = CallCompletedPayload

export default function TaskNotification() {
  const translateY = useRef(new Animated.Value(-(BANNER_HEIGHT + TOP_INSET))).current
  const [visible, setVisible] = useState(false)
  const [current, setCurrent] = useState<PendingNotification | null>(null)
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const dismiss = useCallback(() => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current)
    Animated.timing(translateY, {
      toValue: -(BANNER_HEIGHT + TOP_INSET),
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setVisible(false)
      setCurrent(null)
    })
  }, [translateY])

  const show = useCallback(
    (payload: PendingNotification) => {
      setCurrent(payload)
      setVisible(true)
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        friction: 8,
      }).start()

      if (dismissTimer.current) clearTimeout(dismissTimer.current)
      dismissTimer.current = setTimeout(dismiss, AUTO_DISMISS_MS)
    },
    [translateY, dismiss],
  )

  useEffect(() => {
    const unsub = events.on(EVENT_CALL_COMPLETED, (payload?: CallCompletedPayload) => {
      if (!payload?.call_id) return
      show(payload)
    })
    return () => {
      unsub()
      if (dismissTimer.current) clearTimeout(dismissTimer.current)
    }
  }, [show])

  const handleTap = useCallback(() => {
    dismiss()
    if (current?.call_id) {
      navigate('TaskResult', { taskId: current.call_id })
    }
  }, [current, dismiss])

  if (!visible && !current) return null

  const label = current?.skill_name
    ? `${current.skill_name} completed`
    : 'Task completed!'

  return (
    <Animated.View
      style={[
        styles.container,
        { transform: [{ translateY }] },
      ]}
      pointerEvents="box-none"
    >
      <TouchableOpacity
        style={styles.banner}
        activeOpacity={0.85}
        onPress={handleTap}
      >
        <Text style={styles.icon}>✓</Text>
        <Text style={styles.text} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.action}>Tap to view</Text>
      </TouchableOpacity>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: TOP_INSET,
    left: 12,
    right: 12,
    zIndex: 9999,
    elevation: 9999,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  icon: {
    fontSize: 16,
    color: '#fff',
    marginEnd: 10,
    fontWeight: fontWeight.bold as any,
  },
  text: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
    fontWeight: fontWeight.semibold as any,
    letterSpacing: -0.2,
  },
  action: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    fontWeight: fontWeight.medium as any,
    marginStart: 8,
  },
})
