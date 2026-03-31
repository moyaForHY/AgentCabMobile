import React, { useEffect, useState, useCallback, useRef } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Animated,
  Easing,
  StatusBar,
} from 'react-native'
import { colors, radii, spacing, fontSize, fontWeight } from '../utils/theme'
import { useI18n } from '../i18n'
import { fetchCalls } from '../services/api'
import { useCachedData } from '../hooks/useCachedData'
import { events, EVENT_CALL_COMPLETED } from '../services/events'

// ─── Status Pill ─────────────────────────────────────────────
function StatusPill({ status }: { status: string }) {
  const { t } = useI18n()
  const config: Record<string, { bg: string; text: string; labelKey: keyof typeof t; icon: string }> = {
    success:    { bg: '#ecfdf5', text: '#059669', labelKey: 'completed', icon: '✓' },
    completed:  { bg: '#ecfdf5', text: '#059669', labelKey: 'completed', icon: '✓' },
    failed:     { bg: '#fef2f2', text: '#dc2626', labelKey: 'failed', icon: '✕' },
    pending:    { bg: '#eff6ff', text: '#2563eb', labelKey: 'pending', icon: '○' },
    processing: { bg: '#eff6ff', text: '#2563eb', labelKey: 'processing', icon: '↻' },
    running:    { bg: '#eff6ff', text: '#2563eb', labelKey: 'running', icon: '↻' },
  }
  const c = config[status] || config.pending
  return (
    <View style={[s.statusPill, { backgroundColor: c.bg }]}>
      <Text style={[s.statusPillIcon, { color: c.text }]}>{c.icon}</Text>
      <Text style={[s.statusPillText, { color: c.text }]}>{t[c.labelKey]}</Text>
    </View>
  )
}

// ─── Status Icon (left side of card) ─────────────────────────
function StatusIcon({ status }: { status: string }) {
  if (status === 'running' || status === 'pending' || status === 'processing') {
    return <RunningIndicator />
  }
  const isOk = status === 'success' || status === 'completed'
  return (
    <View style={[s.iconCircle, { backgroundColor: isOk ? '#ecfdf5' : '#fef2f2' }]}>
      <Text style={[s.iconChar, { color: isOk ? '#059669' : '#dc2626' }]}>
        {isOk ? '✓' : '✕'}
      </Text>
    </View>
  )
}

function RunningIndicator() {
  const anim = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.loop(
      Animated.timing(anim, { toValue: 1, duration: 1200, easing: Easing.linear, useNativeDriver: true }),
    ).start()
  }, [anim])
  const rotate = anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] })
  return (
    <View style={[s.iconCircle, { backgroundColor: '#eff6ff' }]}>
      <Animated.View style={{ width: 18, height: 18, transform: [{ rotate }] }}>
        <View style={{
          width: 18,
          height: 18,
          borderRadius: 9,
          borderWidth: 2.5,
          borderColor: '#bfdbfe',
          borderTopColor: '#2563eb',
        }} />
      </Animated.View>
    </View>
  )
}

// ─── Tasks Screen ────────────────────────────────────────────
const FILTERS = ['all', 'success', 'failed', 'pending'] as const
type Filter = typeof FILTERS[number]

export default function TasksScreen({ navigation }: any) {
  const { t } = useI18n()
  const [filter, setFilter] = useState<Filter>('all')

  const callsFetcher = useCallback(async () => {
    const data = await fetchCalls(1, 50)
    return data.items
  }, [])

  const { data: calls, loading, refreshing, refresh } = useCachedData<any[]>('tasks_calls', callsFetcher, [])

  // ─── Refresh when global poller detects task completion ───
  useEffect(() => {
    return events.on(EVENT_CALL_COMPLETED, () => { refresh() })
  }, [refresh])

  const onRefresh = refresh

  const filtered = filter === 'all'
    ? calls
    : filter === 'pending'
    ? calls.filter(c => c.status === 'pending' || c.status === 'running' || c.status === 'processing')
    : calls.filter(c => c.status === filter)
  const counts = {
    all: calls.length,
    success: calls.filter(c => c.status === 'success').length,
    failed: calls.filter(c => c.status === 'failed').length,
    pending: calls.filter(c => c.status === 'pending' || c.status === 'running' || c.status === 'processing').length,
  }

  const renderCall = ({ item, index }: { item: any; index: number }) => (
    <TouchableOpacity
      style={s.card}
      activeOpacity={0.7}
      onPress={() => {
        navigation.navigate('TaskResult', { taskId: item.id })
      }}>
      {/* Top row: icon + name + status pill */}
      <View style={s.cardTop}>
        <StatusIcon status={item.status} />
        <View style={s.cardInfo}>
          <TouchableOpacity
            activeOpacity={0.6}
            onPress={(e) => {
              e.stopPropagation?.()
              if (item.skill_id) navigation.navigate('SkillDetail', { skillId: item.skill_id })
            }}>
            <Text style={[s.cardName, item.skill_id && s.cardNameLink]} numberOfLines={1}>{item.skill_name || t.unnamedSkill}</Text>
          </TouchableOpacity>
          <Text style={s.cardId}>#{item.id.slice(0, 8)}</Text>
        </View>
        <StatusPill status={item.status} />
      </View>

      {/* Bottom row: metadata */}
      <View style={s.cardBottom}>
        <View style={s.metaItem}>
          <Text style={s.metaLabel}>{t.cost}</Text>
          <Text style={s.metaValue}>{item.credits_cost}c</Text>
        </View>
        {item.duration_ms != null && (
          <View style={s.metaItem}>
            <Text style={s.metaLabel}>{t.duration}</Text>
            <Text style={s.metaValue}>{(item.duration_ms / 1000).toFixed(1)}s</Text>
          </View>
        )}
        <View style={[s.metaItem, { alignItems: 'flex-end' }]}>
          <Text style={s.metaLabel}>{t.time}</Text>
          <Text style={s.metaValue}>{formatTime(item.started_at, t)}</Text>
        </View>
      </View>

      {/* Error message if failed */}
      {item.error_message && (
        <View style={s.errorBar}>
          <Text style={s.errorText} numberOfLines={2}>{item.error_message}</Text>
        </View>
      )}
    </TouchableOpacity>
  )

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  return (
    <View style={s.container}>
      {/* Nav header with filters */}
      <View style={s.navHeader}>
        <View style={s.filterRow}>
          {FILTERS.map(f => (
            <TouchableOpacity
              key={f}
              style={[s.filterChip, filter === f && s.filterChipActive]}
              onPress={() => setFilter(f)}
              activeOpacity={0.7}>
              <Text style={[s.filterChipText, filter === f && s.filterChipTextActive]}>
                {f === 'all' ? t.allFilter : f === 'success' ? t.success : f === 'failed' ? t.failed : t.pending}
                {' '}{counts[f]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={renderCall}
        contentContainerStyle={s.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={s.empty}>
            <View style={s.emptyIcon}>
              <Text style={{ fontSize: 32 }}>📋</Text>
            </View>
            <Text style={s.emptyTitle}>{t.noCallsYet}</Text>
            <Text style={s.emptyHint}>{t.callAnApi}</Text>
          </View>
        }
      />
    </View>
  )
}

function formatTime(isoStr: string, t: any): string {
  const d = new Date(isoStr)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return t.justNow
  if (diffMin < 60) return `${diffMin}${t.mAgo}`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}${t.hAgo}`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 7) return `${diffDay}${t.dAgo}`
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

// ─── Styles ──────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16, paddingTop: 8 },

  // Nav header
  navHeader: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingTop: (StatusBar.currentHeight || 44) + 8,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(37, 99, 235, 0.06)',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
  },
  filterChipActive: {
    backgroundColor: colors.primary,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: fontWeight.semibold,
    color: colors.ink600,
  },
  filterChipTextActive: {
    color: '#fff',
  },

  // Card
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.08)',
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardInfo: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  cardName: {
    fontSize: 14,
    fontWeight: fontWeight.semibold,
    color: colors.ink950,
  },
  cardNameLink: {
    color: '#2563eb',
  },
  cardId: {
    fontSize: 11,
    color: colors.ink400,
    marginTop: 1,
    fontFamily: 'monospace',
  },
  cardBottom: {
    flexDirection: 'row',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(37, 99, 235, 0.05)',
  },
  metaItem: { flex: 1 },
  metaLabel: {
    fontSize: 10,
    color: colors.ink400,
    fontWeight: fontWeight.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  metaValue: {
    fontSize: 13,
    color: colors.ink800,
    fontWeight: fontWeight.semibold,
  },

  // Error
  errorBar: {
    marginTop: 10,
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    padding: 10,
  },
  errorText: {
    fontSize: 12,
    color: '#dc2626',
    lineHeight: 16,
  },

  // Status Pill
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  statusPillIcon: { fontSize: 10, fontWeight: fontWeight.bold },
  statusPillText: { fontSize: 11, fontWeight: fontWeight.semibold },

  // Status Icon
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconChar: {
    fontSize: 15,
    fontWeight: fontWeight.bold,
    includeFontPadding: false,
    textAlign: 'center',
  },

  // Empty
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#eff6ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 17, fontWeight: fontWeight.bold, color: colors.ink950 },
  emptyHint: { fontSize: 13, color: colors.ink500, marginTop: 6 },
})
