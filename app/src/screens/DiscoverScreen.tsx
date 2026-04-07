import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  ScrollView,
  LayoutAnimation,
  UIManager,
  Platform,
} from 'react-native'

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true)
}
import Icon from 'react-native-vector-icons/Feather'
import { colors, fontWeight, shadows, radii, spacing } from '../utils/theme'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useI18n } from '../i18n'
import { fetchSkills, fetchCategories, type Skill } from '../services/api'
import { storage } from '../services/storage'
import { usePinnedApis } from '../hooks/usePinnedApis'
import SkillCard from '../components/SkillCard'
import { SkillCardSkeleton } from '../components/Skeleton'

export default function DiscoverScreen({ navigation }: any) {
  const insets = useSafeAreaInsets()
  const { t, lang } = useI18n()
  const [skills, setSkills] = useState<Skill[]>([])
  const [statuses, setStatuses] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Load cache on mount
  useEffect(() => {
    storage.getStringAsync('discover_skills').then(cached => {
      if (cached) {
        try {
          const parsed = JSON.parse(cached)
          setSkills(parsed.skills || [])
          setStatuses(parsed.statuses || {})
          setLoading(false)
        } catch {}
      }
    })
  }, [])
  const { pinned, isPinned } = usePinnedApis()
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')
  const [showBookmarked, setShowBookmarked] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [searching, setSearching] = useState(false)

  const toggleFilters = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    setFiltersOpen(prev => !prev)
  }, [])

  const selectCategory = useCallback((cat: string) => {
    setActiveCategory(cat)
    if (cat !== 'all') {
      // keep open to show selection
    }
  }, [])

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const PAGE_SIZE = 20

  const load = async (q?: string, cat?: string, p = 1, append = false) => {
    if (p === 1) setSearching(true)
    try {
      const result = await fetchSkills(p, PAGE_SIZE, cat === 'all' ? undefined : cat, q || undefined)
      const items = result.items.filter((s: Skill) => s.status === 'published' || s.status === 'active')
      if (append) {
        setSkills(prev => {
          const existingIds = new Set(prev.map(s => s.id))
          return [...prev, ...items.filter(s => !existingIds.has(s.id))]
        })
      } else {
        setSkills(items)
      }
      setStatuses(prev => ({ ...prev, ...(result.statuses || {}) }))
      setHasMore(result.items.length === PAGE_SIZE)
      setPage(p)
      if (!q && (!cat || cat === 'all') && p === 1) {
        storage.setStringAsync('discover_skills', JSON.stringify({ skills: items, statuses: result.statuses || {} }))
      }
    } catch (e: any) { console.log('[Discover] load error:', e?.message) } finally { setLoading(false); setSearching(false) }
  }

  useEffect(() => { load() }, [])
  const onRefresh = async () => { setRefreshing(true); await load(search, activeCategory); setRefreshing(false) }

  const onEndReached = async () => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    await load(search, activeCategory, page + 1, true)
    setLoadingMore(false)
  }

  // Debounced search — reset to page 1
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      load(search, activeCategory)
    }, 400)
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [search, activeCategory])

  const [allCategories, setAllCategories] = useState<string[]>([])

  useEffect(() => {
    fetchCategories().then(cats => setAllCategories(cats)).catch(() => {})
  }, [])

  const categories = useMemo(() => {
    return ['all', ...allCategories]
  }, [skills])

  // Apply bookmark filter on top of backend results
  const filtered = showBookmarked ? skills.filter(s => isPinned(s.id)) : skills

  const renderItem = ({ item, index }: { item: Skill; index: number }) => (
    <View style={{ paddingHorizontal: 16 }}>
      <SkillCard skill={item} index={index} onPress={() => navigation.navigate('SkillDetail', { skillId: item.id })} />
    </View>
  )

  if (loading) {
    return (
      <View style={s.container}>
        <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
          {[0, 1, 2, 3, 4].map(i => <SkillCardSkeleton key={i} />)}
        </View>
      </View>
    )
  }

  return (
    <View style={s.container}>
      {/* Header with search */}
      <View style={[s.headerBar, { paddingTop: insets.top + 12 }]}>
        <View style={s.searchRow}>
          <View style={s.searchInputWrapper}>
            <Icon name="search" size={16} color={colors.ink400} style={s.searchIcon} />
            <TextInput
              style={s.searchInput}
              placeholder={t.searchPlaceholder}
              placeholderTextColor={colors.ink400}
              value={search}
              onChangeText={setSearch}
            />
            {searching && (
              <ActivityIndicator size="small" color={colors.primary} style={s.searchSpinner} />
            )}
          </View>
          <TouchableOpacity
            style={[s.bookmarkBtn, showBookmarked && s.bookmarkBtnActive]}
            onPress={() => setShowBookmarked(!showBookmarked)}
            activeOpacity={0.7}>
            <Text style={[s.bookmarkIcon, showBookmarked && s.bookmarkIconActive]}>
              {showBookmarked ? '★' : '☆'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Filter toggle */}
      <TouchableOpacity style={s.filterToggle} onPress={toggleFilters} activeOpacity={0.7}>
        <View style={s.filterToggleInner}>
          <Icon name="sliders" size={14} color={colors.primary} />
          <Text style={s.filterToggleText}>
            {activeCategory === 'all' ? t.filter : activeCategory.charAt(0).toUpperCase() + activeCategory.slice(1)}
          </Text>
        </View>
        <Icon name={filtersOpen ? 'chevron-up' : 'chevron-down'} size={14} color={colors.primary} />
      </TouchableOpacity>

      {/* Collapsible filter chips */}
      {filtersOpen && (
        <View style={s.filterPanel}>
          <View style={s.chipWrap}>
            {categories.map(cat => (
              <TouchableOpacity
                key={cat}
                style={[s.chip, activeCategory === cat && s.chipActive]}
                onPress={() => selectCategory(cat)}
                activeOpacity={0.7}>
                <Text style={[s.chipText, activeCategory === cat && s.chipTextActive]}>
                  {cat === 'all' ? t.all : cat.charAt(0).toUpperCase() + cat.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Feed */}
      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.3}
        ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.primary} style={{ paddingVertical: 16 }} /> : null}
        ListEmptyComponent={
          <View style={s.center}>
            <Icon name="search" size={40} color={colors.ink300} style={{ marginBottom: 12 }} />
            <Text style={s.emptyText}>{t.noApisFound}</Text>
            <Text style={{ fontSize: 13, color: colors.ink400, marginTop: 4 }}>{lang === 'zh' ? '试试其他关键词或清除筛选' : 'Try different keywords or clear filters'}</Text>
          </View>
        }
      />
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 60 },

  headerBar: {
    backgroundColor: colors.white,
    paddingHorizontal: spacing.lg,
    paddingBottom: 14,
    ...shadows.sm,
  },
  searchRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
  searchInputWrapper: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: colors.sand100,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.sand200,
    paddingHorizontal: 14,
  },
  searchIcon: { marginRight: 8 },
  searchSpinner: { marginLeft: 4 },
  bookmarkBtn: {
    width: 42, height: 42, borderRadius: radii.md, backgroundColor: colors.sand100,
    justifyContent: 'center' as const, alignItems: 'center' as const,
    borderWidth: 1,
    borderColor: colors.sand200,
  },
  bookmarkBtnActive: { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
  bookmarkIcon: { fontSize: 20, color: colors.ink400 },
  bookmarkIconActive: { color: '#f59e0b' },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.ink950,
    fontWeight: fontWeight.regular,
  },

  filterToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    marginTop: 2,
  },
  filterToggleInner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
  },
  filterToggleText: {
    fontSize: 13,
    fontWeight: fontWeight.semibold,
    color: colors.primary,
    letterSpacing: 0.2,
  },
  filterPanel: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 12,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.white,
    ...shadows.sm,
  },
  chipActive: {
    backgroundColor: colors.primary,
    ...shadows.glow,
  },
  chipText: {
    fontSize: 13,
    fontWeight: fontWeight.medium,
    color: colors.ink700,
    letterSpacing: 0.1,
  },
  chipTextActive: { color: colors.white, fontWeight: fontWeight.semibold },

  list: { paddingTop: 8, paddingBottom: 24 },

  card: {
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.sand100,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },

  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  apiName: {
    fontSize: 15,
    fontWeight: fontWeight.bold,
    color: colors.ink950,
    flex: 1,
    marginRight: 8,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },

  apiDesc: {
    fontSize: 14,
    color: colors.ink600,
    lineHeight: 20,
    marginBottom: 12,
  },

  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  tag: {
    fontSize: 11,
    fontWeight: fontWeight.semibold,
    color: colors.primary,
    backgroundColor: colors.primary50,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.xs,
    overflow: 'hidden',
  },
  stat: {
    fontSize: 12,
    color: colors.ink500,
  },
  pricePill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radii.lg,
    backgroundColor: colors.primary,
  },
  priceText: {
    fontSize: 12,
    fontWeight: fontWeight.semibold,
    color: colors.white,
  },

  emptyText: { fontSize: 15, color: colors.ink600, fontWeight: fontWeight.medium },
})
