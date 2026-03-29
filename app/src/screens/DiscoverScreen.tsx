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
  StatusBar,
} from 'react-native'

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true)
}
import { colors, fontWeight } from '../utils/theme'
import { useI18n } from '../i18n'
import { fetchSkills, type Skill } from '../services/api'

export default function DiscoverScreen({ navigation }: any) {
  const { t } = useI18n()
  const [skills, setSkills] = useState<Skill[]>([])
  const [statuses, setStatuses] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')
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

  const load = async (q?: string, cat?: string) => {
    setSearching(true)
    try {
      const result = await fetchSkills(1, 50, cat === 'all' ? undefined : cat, q || undefined)
      setSkills(result.items.filter((s: Skill) => s.status === 'published' || s.status === 'active'))
      setStatuses(result.statuses || {})
    } catch {} finally { setLoading(false); setSearching(false) }
  }

  useEffect(() => { load() }, [])
  const onRefresh = async () => { setRefreshing(true); await load(search, activeCategory); setRefreshing(false) }

  // Debounced search
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      load(search, activeCategory)
    }, 400)
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [search, activeCategory])

  const categories = useMemo(() => {
    const cats = new Set<string>()
    skills.forEach(s => { if (s.category) cats.add(s.category) })
    return ['all', ...Array.from(cats)]
  }, [skills])

  // Backend handles filtering, skills is already filtered
  const filtered = skills

  const renderItem = ({ item }: { item: Skill }) => {
    const st = statuses[item.id]
    return (
      <TouchableOpacity
        style={s.card}
        onPress={() => navigation.navigate('SkillDetail', { skillId: item.id })}
        activeOpacity={0.85}>

        {/* Name + status */}
        <View style={s.titleRow}>
          <Text style={s.apiName} numberOfLines={1}>{item.name}</Text>
          {st && (
            <View style={[s.statusDot, {
              backgroundColor: st.status === 'available' ? '#10b981' : st.status === 'busy' ? '#ef4444' : colors.primary,
            }]} />
          )}
        </View>

        {/* Description */}
        {item.description ? (
          <Text style={s.apiDesc} numberOfLines={2}>{item.description}</Text>
        ) : null}

        {/* Footer */}
        <View style={s.footer}>
          <View style={s.footerStats}>
            {item.category ? <Text style={s.tag}>{item.category}</Text> : null}
            <Text style={s.stat}>{item.call_count} {t.calls}</Text>
          </View>
          <View style={s.pricePill}>
            <Text style={s.priceText}>{item.price_credits} {t.credits}</Text>
          </View>
        </View>
      </TouchableOpacity>
    )
  }

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color={colors.primary} /></View>
  }

  return (
    <View style={s.container}>
      {/* Header with search */}
      <View style={s.headerBar}>
        <View style={s.searchRow}>
          <TextInput
            style={s.searchInput}
            placeholder={t.searchPlaceholder}
            placeholderTextColor="#94a3b8"
            value={search}
            onChangeText={setSearch}
          />
          {searching && (
            <ActivityIndicator size="small" color={colors.primary} style={s.searchSpinner} />
          )}
        </View>
      </View>

      {/* Filter toggle */}
      <TouchableOpacity style={s.filterToggle} onPress={toggleFilters} activeOpacity={0.7}>
        <Text style={s.filterToggleText}>
          {activeCategory === 'all' ? t.filter : activeCategory.charAt(0).toUpperCase() + activeCategory.slice(1)}
        </Text>
        <Text style={s.filterArrow}>{filtersOpen ? '▲' : '▼'}</Text>
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
        ListEmptyComponent={
          <View style={s.center}><Text style={s.emptyText}>{t.noApisFound}</Text></View>
        }
      />
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  headerBar: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingTop: (StatusBar.currentHeight || 44) + 8,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(37, 99, 235, 0.06)',
  },
  searchRow: { position: 'relative' as const },
  searchSpinner: { position: 'absolute' as const, right: 12, top: 10 },
  searchInput: {
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
    fontSize: 14,
    color: colors.ink950,
  },

  filterToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginTop: 4,
  },
  filterToggleText: {
    fontSize: 13,
    fontWeight: fontWeight.semibold,
    color: colors.primary,
  },
  filterArrow: {
    fontSize: 10,
    color: colors.primary,
  },
  filterPanel: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.15)',
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: 13,
    fontWeight: fontWeight.semibold,
    color: colors.ink700,
  },
  chipTextActive: { color: '#fff' },

  list: { paddingTop: 4, paddingBottom: 20 },

  card: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingHorizontal: 16,
    paddingVertical: 16,
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
    backgroundColor: '#eff6ff',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  stat: {
    fontSize: 12,
    color: colors.ink500,
  },
  pricePill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: colors.primary,
  },
  priceText: {
    fontSize: 12,
    fontWeight: fontWeight.semibold,
    color: '#fff',
  },

  emptyText: { fontSize: 14, color: colors.ink500 },
})
