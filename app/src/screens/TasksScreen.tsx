import React, { useEffect, useState, useCallback, useRef } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Animated,
  Easing,
} from 'react-native'
import { colors, radii, spacing, fontSize, fontWeight, shadows, gradients } from '../utils/theme'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useI18n } from '../i18n'
import { fetchCalls, getCached } from '../services/api'
import { useCachedData } from '../hooks/useCachedData'
import { events, EVENT_CALL_COMPLETED } from '../services/events'
import Icon from 'react-native-vector-icons/Feather'
import LinearGradient from 'react-native-linear-gradient'
import { TaskCardSkeleton } from '../components/Skeleton'

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
      <Text style={[s.iconChar, { color: isOk ? '#059669' : colors.danger }]}>
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
    <View style={[s.iconCircle, { backgroundColor: colors.primary50 }]}>
      <Animated.View style={{ width: 20, height: 20, transform: [{ rotate }] }}>
        <View style={{
          width: 20,
          height: 20,
          borderRadius: 10,
          borderWidth: 2.5,
          borderColor: colors.primary200,
          borderTopColor: colors.primary,
        }} />
      </Animated.View>
    </View>
  )
}

// ─── Card accent color by status ────────────────────────────
function getAccentColor(status: string): string {
  if (status === 'success' || status === 'completed') return '#059669'
  if (status === 'failed') return '#dc2626'
  return '#2563eb'
}

// ─── Tasks Screen ────────────────────────────────────────────
const FILTERS = ['all', 'success', 'failed', 'pending'] as const
type Filter = typeof FILTERS[number]

export default function TasksScreen({ navigation }: any) {
  const insets = useSafeAreaInsets()
  const { t, lang } = useI18n()
  const [filter, setFilter] = useState<Filter>('all')
  const [calls, setCalls] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [stats, setStats] = useState({ total: 0, success: 0, failed: 0, pending: 0 })
  const PAGE_SIZE = 20

  const statusParam = filter === 'all' ? undefined : filter

  const loadPage = useCallback(async (p: number, replace = false) => {
    try {
      const data = await fetchCalls(p, PAGE_SIZE, statusParam)
      if (replace) {
        setCalls(data.items)
      } else {
        setCalls(prev => {
          const existingIds = new Set(prev.map((c: any) => c.id))
          const newItems = data.items.filter((c: any) => !existingIds.has(c.id))
          return [...prev, ...newItems]
        })
      }
      // Only update stats from unfiltered requests (all tab or first load)
      if (!statusParam) {
        setStats({
          total: data.total ?? 0,
          success: (data as any).total_successful ?? 0,
          failed: (data as any).total_failed ?? 0,
          pending: (data as any).total_pending ?? 0,
        })
      }
      setHasMore(data.items.length === PAGE_SIZE)
      setPage(p)
    } catch {}
  }, [statusParam])

  useEffect(() => {
    // Load cache first, then fetch fresh
    const url = '/calls'
    const params = statusParam ? { page: 1, page_size: PAGE_SIZE, status: statusParam } : { page: 1, page_size: PAGE_SIZE }
    getCached<any>(url, params).then(cached => {
      if (cached?.data?.items) {
        setCalls(cached.data.items)
        if (!statusParam && cached.data.total != null) {
          setStats({
            total: cached.data.total,
            success: cached.data.total_successful ?? 0,
            failed: cached.data.total_failed ?? 0,
            pending: cached.data.total_pending ?? 0,
          })
        }
        setLoading(false)
      }
    }).catch(() => {})
    loadPage(1, true).finally(() => setLoading(false))
  }, [filter])

  useEffect(() => {
    return events.on(EVENT_CALL_COMPLETED, () => {
      loadPage(1, true)
    })
  }, [loadPage])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadPage(1, true)
    setRefreshing(false)
  }, [loadPage])

  const onEndReached = useCallback(async () => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    await loadPage(page + 1)
    setLoadingMore(false)
  }, [loadingMore, hasMore, page, loadPage])

  const pendingStatuses = ['pending', 'processing', 'running']
  const filtered = filter === 'pending'
    ? calls.filter(c => pendingStatuses.includes(c.status))
    : calls
  const counts = {
    all: stats.total,
    success: stats.success,
    failed: stats.failed,
    pending: stats.pending,
  }

  const renderCall = ({ item, index }: { item: any; index: number }) => (
    <Pressable
      style={({ pressed }) => [s.card, { borderLeftWidth: 3, borderLeftColor: getAccentColor(item.status), backgroundColor: pressed ? '#f0f4f8' : '#fff' }]}
      onPress={() => navigation.navigate('TaskResult', { taskId: item.id })}>
      {/* Top row: icon + name + status pill */}
      <View style={s.cardTop}>
        <StatusIcon status={item.status} />
        <View style={s.cardInfo}>
          <TouchableOpacity
            activeOpacity={0.6}
            style={{ alignSelf: 'flex-start' }}
            onPress={() => {
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
          <View style={s.metaLabelRow}>
            <Icon name="zap" size={11} color={colors.ink500} style={s.metaIcon} />
            <Text style={s.metaLabel}>{t.cost}</Text>
          </View>
          <Text style={s.metaValue}>{item.credits_cost}c</Text>
        </View>
        {item.duration_ms != null && (
          <View style={s.metaItem}>
            <View style={s.metaLabelRow}>
              <Icon name="clock" size={11} color={colors.ink500} style={s.metaIcon} />
              <Text style={s.metaLabel}>{t.duration}</Text>
            </View>
            <Text style={s.metaValue}>{(item.duration_ms / 1000).toFixed(1)}s</Text>
          </View>
        )}
        <View style={[s.metaItem, { alignItems: 'flex-end' }]}>
          <View style={[s.metaLabelRow, { justifyContent: 'flex-end' }]}>
            <Icon name="calendar" size={11} color={colors.ink500} style={s.metaIcon} />
            <Text style={s.metaLabel}>{t.time}</Text>
          </View>
          <Text style={s.metaValue}>{formatTime(item.started_at, t)}</Text>
        </View>
      </View>

      {/* Error message if failed */}
      {item.error_message && (
        <View style={s.errorBar}>
          <Text style={s.errorText} numberOfLines={2}>{item.error_message}</Text>
        </View>
      )}
    </Pressable>
  )

  if (loading) {
    return (
      <View style={[s.container, { paddingHorizontal: 16, paddingTop: 16 }]}>
        {[0, 1, 2, 3, 4, 5].map(i => <TaskCardSkeleton key={i} />)}
      </View>
    )
  }

  return (
    <View style={s.container}>
      {/* Nav header with filters */}
      <View style={[s.navHeader, { paddingTop: insets.top + 10 }]}>
        <View style={s.filterRow}>
          {FILTERS.map(f => {
            const isActive = filter === f
            const label = (
              <Text style={[s.filterChipText, isActive && s.filterChipTextActive]}>
                {f === 'all' ? t.allFilter : f === 'success' ? t.success : f === 'failed' ? t.failed : (lang === 'zh' ? '等待中' : 'Waiting')}
              </Text>
            )
            return (
              <TouchableOpacity
                key={f}
                onPress={() => setFilter(f)}
                activeOpacity={0.7}>
                {isActive ? (
                  <LinearGradient
                    colors={gradients.primary}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[s.filterChipGradient, s.filterChipActive]}>
                    <View style={s.filterChipInner}>
                      {label}
                    </View>
                  </LinearGradient>
                ) : (
                  <View style={s.filterChip}>
                    {label}
                  </View>
                )}
              </TouchableOpacity>
            )
          })}
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={renderCall}
        contentContainerStyle={s.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.3}
        ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.primary} style={{ paddingVertical: 16 }} /> : null}
        ListEmptyComponent={
          <View style={s.empty}>
            <View style={s.emptyIcon}>
              <Icon name="inbox" size={48} color={colors.ink300} />
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
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: spacing.md, paddingTop: spacing.sm },

  // Nav header
  navHeader: {
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    paddingBottom: 14,
    ...shadows.sm,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 10,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: radii.pill,
    backgroundColor: colors.sand100,
  },
  filterChipGradient: {
    borderRadius: radii.pill,
  },
  filterChipInner: {
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  filterChipActive: {
    ...shadows.glow,
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  filterChipText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.ink600,
    letterSpacing: 0.2,
  },
  filterChipTextActive: {
    color: colors.white,
  },

  // Card
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.md + 2,
    marginBottom: spacing.sm + 4,
    ...shadows.md,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardInfo: {
    flex: 1,
    marginLeft: 14,
    marginRight: spacing.sm,
  },
  cardName: {
    fontSize: fontSize.sm + 1,
    fontWeight: fontWeight.bold,
    color: colors.ink950,
    letterSpacing: -0.2,
  },
  cardNameLink: {
    color: colors.primary,
  },
  cardId: {
    fontSize: 11,
    color: colors.ink500,
    marginTop: 3,
    fontFamily: 'monospace',
    letterSpacing: 0.3,
  },
  cardBottom: {
    flexDirection: 'row',
    marginTop: spacing.md,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.sand200,
  },
  metaItem: { flex: 1 },
  metaLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  metaIcon: {
    marginRight: 3,
  },
  metaLabel: {
    fontSize: 10,
    color: colors.ink500,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  metaValue: {
    fontSize: fontSize.sm,
    color: colors.ink800,
    fontWeight: fontWeight.bold,
  },

  // Error
  errorBar: {
    marginTop: spacing.sm + 4,
    backgroundColor: '#fef2f2',
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.sm + 2,
  },
  errorText: {
    fontSize: fontSize.xs,
    color: colors.danger,
    lineHeight: 17,
    fontWeight: fontWeight.medium,
  },

  // Status Pill
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
    gap: 4,
  },
  statusPillIcon: { fontSize: 10, fontWeight: fontWeight.bold },
  statusPillText: { fontSize: 11, fontWeight: fontWeight.bold, letterSpacing: 0.2 },

  // Status Icon
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconChar: {
    fontSize: 16,
    fontWeight: fontWeight.bold,
    includeFontPadding: false,
    textAlign: 'center',
  },

  // Stats summary bar
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm + 4,
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radii.md,
    paddingVertical: spacing.sm + 4,
    alignItems: 'center',
    ...shadows.sm,
  },
  statNumber: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
  },
  statLabel: {
    fontSize: 10,
    color: colors.ink500,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },

  // Empty
  empty: { alignItems: 'center', paddingVertical: 80 },
  emptyIcon: {
    width: 88,
    height: 88,
    borderRadius: radii.xxl,
    backgroundColor: colors.primary50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
    ...shadows.sm,
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.ink950,
    letterSpacing: -0.3,
  },
  emptyHint: {
    fontSize: fontSize.sm,
    color: colors.ink500,
    marginTop: spacing.sm,
    lineHeight: 20,
  },
  emptyCta: {
    marginTop: spacing.lg,
  },
  emptyCtaGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: radii.pill,
    gap: 8,
    ...shadows.glow,
    shadowOpacity: 0.2,
  },
  emptyCtaText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.white,
    letterSpacing: 0.2,
  },
})
