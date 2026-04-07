import React, { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Switch,
  RefreshControl,
} from 'react-native'
import { showModal } from '../components/AppModal'
import { colors, fontWeight } from '../utils/theme'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useI18n } from '../i18n'
import {
  getRules,
  toggleRule,
  deleteRule,
  formatSchedule,
  EVENT_AUTOMATION_CHANGED,
  type AutomationRule,
} from '../services/automationService'
import { events } from '../services/events'
import Icon from 'react-native-vector-icons/Feather'

export default function AutomationsScreen({ navigation }: any) {
  const insets = useSafeAreaInsets()
  const { t, lang } = useI18n()
  const [rules, setRules] = useState<AutomationRule[]>([])
  const [refreshing, setRefreshing] = useState(false)

  const loadRules = useCallback(async () => {
    const loaded = await getRules()
    setRules(loaded.sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
  }, [])

  useEffect(() => {
    loadRules()
    const unsub = events.on(EVENT_AUTOMATION_CHANGED, loadRules)
    return unsub
  }, [loadRules])

  const onRefresh = async () => {
    setRefreshing(true)
    await loadRules()
    setRefreshing(false)
  }

  const handleToggle = async (id: string, value: boolean) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, enabled: value } : r))
    await toggleRule(id, value)
  }

  const handleDelete = (rule: AutomationRule) => {
    showModal(t.deleteAutomation, t.deleteAutomationConfirm, [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.delete,
        style: 'destructive',
        onPress: async () => {
          await deleteRule(rule.id)
        },
      },
    ])
  }

  const renderItem = ({ item }: { item: AutomationRule }) => {
    const scheduleText = formatSchedule(item.schedule, lang as 'en' | 'zh')
    const lastRunText = item.lastRun
      ? new Date(item.lastRun).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : null

    return (
      <View style={s.ruleCard}>
        <View style={s.ruleTop}>
          <View style={s.ruleInfo}>
            <Text style={s.ruleName} numberOfLines={1}>{item.skillName}</Text>
            <Text style={s.ruleSchedule}>{scheduleText}</Text>
            {lastRunText && (
              <Text style={s.ruleLastRun}>{t.lastRun}: {lastRunText}</Text>
            )}
          </View>
          <Switch
            value={item.enabled}
            onValueChange={v => handleToggle(item.id, v)}
            trackColor={{ false: '#e2e8f0', true: 'rgba(37, 99, 235, 0.3)' }}
            thumbColor={item.enabled ? colors.primary : '#f1f5f9'}
          />
        </View>
        <View style={s.ruleActions}>
          <TouchableOpacity
            style={s.ruleActionBtn}
            onPress={() => navigation.navigate('CreateAutomation', { editRule: item })}
            activeOpacity={0.7}>
            <Icon name="edit-2" size={14} color={colors.primary} />
            <Text style={s.ruleActionText}>{lang === 'zh' ? '编辑' : 'Edit'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.ruleActionBtn}
            onPress={() => handleDelete(item)}
            activeOpacity={0.7}>
            <Icon name="trash-2" size={14} color="#dc2626" />
            <Text style={[s.ruleActionText, { color: '#dc2626' }]}>{lang === 'zh' ? '删除' : 'Delete'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.6}>
          <Text style={s.backBtn}>{t.back}</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>{t.automations}</Text>
        <View style={{ width: 40 }} />
      </View>

      {rules.length === 0 ? (
        <View style={s.emptyState}>
          {/* Clock icon */}
          <View style={s.emptyIcon}>
            <View style={s.clockOuter}>
              <View style={s.clockHand} />
              <View style={[s.clockHand, s.clockHandMinute]} />
            </View>
          </View>
          <Text style={s.emptyText}>{t.noAutomations}</Text>
          <TouchableOpacity
            style={s.emptyBtn}
            onPress={() => navigation.navigate('Main', { screen: 'DiscoverTab' })}
            activeOpacity={0.7}>
            <Text style={s.emptyBtnText}>{lang === 'zh' ? '浏览分身' : 'Browse Clones'}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={rules}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={s.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
        />
      )}
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(37, 99, 235, 0.06)',
  },
  backBtn: {
    fontSize: 15,
    color: colors.primary,
    fontWeight: fontWeight.semibold,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: fontWeight.bold,
    color: colors.ink950,
    letterSpacing: -0.3,
  },
  addBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addBtnText: {
    fontSize: 20,
    color: '#fff',
    fontWeight: fontWeight.bold,
    marginTop: -1,
  },

  // List
  list: { padding: 16 },
  ruleCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.08)',
    padding: 16,
    marginBottom: 10,
  },
  ruleTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ruleInfo: { flex: 1, marginRight: 12 },
  ruleName: {
    fontSize: 15,
    fontWeight: fontWeight.semibold,
    color: colors.ink950,
    marginBottom: 4,
  },
  ruleSchedule: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: fontWeight.medium,
    marginBottom: 2,
  },
  ruleLastRun: {
    fontSize: 11,
    color: colors.ink500,
    marginTop: 2,
  },
  ruleActions: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(37, 99, 235, 0.06)',
  },
  ruleActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ruleActionText: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: fontWeight.medium,
  },

  // Empty
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyIcon: {
    marginBottom: 20,
  },
  clockOuter: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 3,
    borderColor: colors.ink400,
    justifyContent: 'center',
    alignItems: 'center',
  },
  clockHand: {
    position: 'absolute',
    width: 2.5,
    height: 14,
    backgroundColor: colors.ink400,
    borderRadius: 1.25,
    bottom: '50%',
    left: '50%',
    marginLeft: -1.25,
  },
  clockHandMinute: {
    height: 10,
    transform: [{ rotate: '90deg' }],
    transformOrigin: 'bottom center',
  },
  emptyText: {
    fontSize: 15,
    color: colors.ink500,
    textAlign: 'center',
    marginBottom: 20,
  },
  emptyBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyBtnText: {
    fontSize: 14,
    fontWeight: fontWeight.bold,
    color: '#fff',
  },
})
