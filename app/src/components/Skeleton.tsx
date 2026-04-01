import React, { useEffect, useRef } from 'react'
import { View, Animated, Easing, StyleSheet } from 'react-native'

// ─── SkeletonBox ────────────────────────────────────────────
type SkeletonBoxProps = {
  width: number | string
  height: number
  borderRadius?: number
  style?: any
}

export function SkeletonBox({ width, height, borderRadius = 6, style }: SkeletonBoxProps) {
  const opacity = useRef(new Animated.Value(0.3)).current

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    ).start()
  }, [opacity])

  return (
    <Animated.View
      style={[
        { width: width as any, height, borderRadius, backgroundColor: '#e2e8f0', opacity },
        style,
      ]}
    />
  )
}

// ─── SkillCardSkeleton ──────────────────────────────────────
// Mimics: left accent bar + title + author row + description + footer (chip + price pill)
export function SkillCardSkeleton() {
  return (
    <View style={sk.card}>
      <View style={sk.accent} />
      <View style={sk.body}>
        <SkeletonBox width={160} height={14} borderRadius={4} />
        <View style={sk.authorRow}>
          <SkeletonBox width={18} height={18} borderRadius={9} />
          <SkeletonBox width={80} height={10} borderRadius={3} />
        </View>
        <SkeletonBox width="90%" height={10} borderRadius={3} style={{ marginTop: 6 }} />
        <SkeletonBox width="60%" height={10} borderRadius={3} style={{ marginTop: 4 }} />
        <View style={sk.footer}>
          <View style={sk.metaRow}>
            <SkeletonBox width={48} height={16} borderRadius={4} />
            <SkeletonBox width={36} height={12} borderRadius={3} />
          </View>
          <SkeletonBox width={42} height={22} borderRadius={12} />
        </View>
      </View>
    </View>
  )
}

const sk = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(37,99,235,0.06)',
    marginBottom: 10,
    overflow: 'hidden',
  },
  accent: { width: 4, backgroundColor: '#e2e8f0', borderTopLeftRadius: 14, borderBottomLeftRadius: 14 },
  body: { flex: 1, padding: 14 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
})

// ─── TaskCardSkeleton ───────────────────────────────────────
// Mimics: icon dot + name + meta on left, status badge + time on right
export function TaskCardSkeleton() {
  return (
    <View style={tk.card}>
      <View style={tk.left}>
        <SkeletonBox width={32} height={32} borderRadius={10} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <SkeletonBox width={120} height={13} borderRadius={3} />
          <SkeletonBox width={80} height={10} borderRadius={3} style={{ marginTop: 4 }} />
        </View>
      </View>
      <View style={tk.right}>
        <SkeletonBox width={52} height={20} borderRadius={6} />
        <SkeletonBox width={36} height={10} borderRadius={3} style={{ marginTop: 4 }} />
      </View>
    </View>
  )
}

const tk = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(37,99,235,0.08)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  left: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 12 },
  right: { alignItems: 'flex-end' },
})

// ─── SkillDetailSkeleton ────────────────────────────────────
// Mimics: header (name + meta), description block, price card, form placeholder
export function SkillDetailSkeleton() {
  return (
    <View style={sd.container}>
      {/* Header */}
      <View style={sd.header}>
        <SkeletonBox width="70%" height={20} borderRadius={4} />
        <View style={sd.metaRow}>
          <SkeletonBox width={60} height={14} borderRadius={4} />
          <SkeletonBox width={40} height={14} borderRadius={4} />
          <SkeletonBox width={50} height={14} borderRadius={4} />
        </View>
      </View>

      {/* Description block */}
      <View style={sd.section}>
        <SkeletonBox width="100%" height={12} borderRadius={3} />
        <SkeletonBox width="95%" height={12} borderRadius={3} style={{ marginTop: 6 }} />
        <SkeletonBox width="70%" height={12} borderRadius={3} style={{ marginTop: 6 }} />
      </View>

      {/* Price card */}
      <View style={sd.priceCard}>
        <SkeletonBox width={80} height={14} borderRadius={4} />
        <SkeletonBox width={60} height={24} borderRadius={6} style={{ marginTop: 8 }} />
      </View>

      {/* Form placeholder */}
      <View style={sd.section}>
        <SkeletonBox width={100} height={12} borderRadius={3} />
        <SkeletonBox width="100%" height={40} borderRadius={8} style={{ marginTop: 8 }} />
        <SkeletonBox width={100} height={12} borderRadius={3} style={{ marginTop: 16 }} />
        <SkeletonBox width="100%" height={40} borderRadius={8} style={{ marginTop: 8 }} />
      </View>

      {/* Submit button placeholder */}
      <SkeletonBox width="100%" height={48} borderRadius={12} style={{ marginTop: 20 }} />
    </View>
  )
}

const sd = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 20 },
  header: { marginBottom: 20 },
  metaRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  section: { marginBottom: 20 },
  priceCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(37,99,235,0.08)',
  },
})
