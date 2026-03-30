import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  Animated,
  Easing,
} from 'react-native'
import LinearGradient from 'react-native-linear-gradient'
import { showModal } from '../components/AppModal'
import { colors, fontWeight } from '../utils/theme'
import { useI18n } from '../i18n'
import { fetchSkills, type Skill } from '../services/api'
import { useKeyboard } from '../hooks/useKeyboard'
import DynamicForm from '../components/DynamicForm'
import type { PickedFile } from '../services/deviceCapabilities'
import {
  saveRule,
  generateRuleId,
  type AutomationRule,
} from '../services/automationService'

const STATUS_BAR_HEIGHT = StatusBar.currentHeight || 44

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTES = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55']
const INTERVAL_OPTIONS = [
  { label: '1h', minutes: 60, desc: '' },
  { label: '2h', minutes: 120, desc: '' },
  { label: '4h', minutes: 240, desc: '' },
  { label: '6h', minutes: 360, desc: '' },
  { label: '12h', minutes: 720, desc: '' },
]

const WEEKDAYS_EN = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const WEEKDAYS_ZH = ['日', '一', '二', '三', '四', '五', '六']
const WEEKDAY_FULL_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const WEEKDAY_FULL_ZH = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

export default function CreateAutomationScreen({ route, navigation }: any) {
  const { t, lang } = useI18n()
  const { height: kbHeight } = useKeyboard()
  const editRule = route?.params?.editRule as AutomationRule | undefined
  const preSelectedSkill = route?.params?.preSelectedSkill as Skill | undefined
  const preInputValues = route?.params?.preInputValues as Record<string, any> | undefined

  const [skills, setSkills] = useState<Skill[]>([])
  const [loadingSkills, setLoadingSkills] = useState(!preSelectedSkill)
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(preSelectedSkill || null)
  const [scheduleType, setScheduleType] = useState<'daily' | 'weekly' | 'interval'>('daily')
  const [hour, setHour] = useState('08')
  const [minute, setMinute] = useState('00')
  const [weekday, setWeekday] = useState(1)
  const [intervalMinutes, setIntervalMinutes] = useState(60)
  const [inputValues, setInputValues] = useState<Record<string, any>>({})
  const [pickedFiles, setPickedFiles] = useState<Record<string, PickedFile[]>>({})
  const [saving, setSaving] = useState(false)

  const fadeAnim = useRef(new Animated.Value(0)).current
  const slideAnim = useRef(new Animated.Value(20)).current
  const hourScrollRef = useRef<ScrollView>(null)

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start()
  }, [selectedSkill])

  // Scroll to selected hour on mount
  useEffect(() => {
    if (selectedSkill && scheduleType !== 'interval') {
      const idx = HOURS.indexOf(hour)
      setTimeout(() => hourScrollRef.current?.scrollTo({ x: Math.max(0, idx * 48 - 80), animated: true }), 100)
    }
  }, [selectedSkill, scheduleType])

  useEffect(() => {
    if (preInputValues && !editRule) setInputValues(preInputValues)
    if (editRule) {
      setScheduleType(editRule.schedule.type)
      if (editRule.schedule.time) {
        const [h, m] = editRule.schedule.time.split(':')
        setHour(h); setMinute(m)
      }
      if (editRule.schedule.weekday !== undefined) setWeekday(editRule.schedule.weekday)
      if (editRule.schedule.intervalMinutes) setIntervalMinutes(editRule.schedule.intervalMinutes)
      if ((editRule as any).inputValues) setInputValues((editRule as any).inputValues)
    }
  }, [editRule])

  useEffect(() => {
    if (preSelectedSkill && !editRule) { setLoadingSkills(false); return }
    setLoadingSkills(true)
    fetchSkills(1, 50)
      .then(res => {
        const available = res.items.filter(s => s.status === 'published' || s.status === 'active')
        setSkills(available)
        if (editRule) {
          const match = available.find(s => s.id === editRule.skillId)
          if (match) setSelectedSkill(match)
        }
      })
      .catch(() => {})
      .finally(() => setLoadingSkills(false))
  }, [])

  const handleFilePicked = useCallback((fieldKey: string, files: PickedFile[]) => {
    setPickedFiles(prev => ({ ...prev, [fieldKey]: files }))
  }, [])

  function filterManualFields(schema: any): any {
    if (!schema?.properties) return schema
    const filtered: Record<string, any> = {}
    for (const [key, prop] of Object.entries(schema.properties) as [string, any][]) {
      if (!prop.format?.startsWith('device:')) filtered[key] = prop
    }
    return { ...schema, properties: filtered }
  }

  const manualSchema = selectedSkill ? filterManualFields(selectedSkill.input_schema) : null
  const hasManualFields = manualSchema && Object.keys(manualSchema.properties || {}).length > 0

  const weekdays = lang === 'zh' ? WEEKDAYS_ZH : WEEKDAYS_EN
  const weekdaysFull = lang === 'zh' ? WEEKDAY_FULL_ZH : WEEKDAY_FULL_EN

  const scheduleDisplay = (() => {
    if (scheduleType === 'daily') return `${t.daily}  ${hour}:${minute}`
    if (scheduleType === 'weekly') return `${weekdaysFull[weekday]}  ${hour}:${minute}`
    const h = Math.round(intervalMinutes / 60)
    return lang === 'zh' ? `每 ${h} 小时` : `Every ${h} hours`
  })()

  const handleSave = async () => {
    if (!selectedSkill) { showModal(t.errorTitle, t.selectSkill); return }
    setSaving(true)
    try {
      const rule: any = {
        id: editRule?.id || generateRuleId(),
        skillId: selectedSkill.id,
        skillName: selectedSkill.name,
        schedule: {
          type: scheduleType,
          ...(scheduleType !== 'interval' && { time: `${hour}:${minute}` }),
          ...(scheduleType === 'weekly' && { weekday }),
          ...(scheduleType === 'interval' && { intervalMinutes }),
        },
        enabled: editRule?.enabled ?? true,
        lastRun: editRule?.lastRun,
        createdAt: editRule?.createdAt || new Date().toISOString(),
        inputValues: hasManualFields ? inputValues : undefined,
      }
      await saveRule(rule)
      navigation.goBack()
    } catch (e: any) {
      // Permission modal already shown by scheduleRule, don't show another
      if (e?.message !== 'EXACT_ALARM_PERMISSION_DENIED') {
        showModal(t.errorTitle, e.message)
      }
    } finally {
      setSaving(false)
    }
  }

  if (loadingSkills) {
    return <View style={s.center}><ActivityIndicator size="large" color={colors.primary} /></View>
  }

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.6} style={s.headerBack}>
          <Text style={s.headerBackIcon}>{'‹'}</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>{editRule ? t.editAutomation : t.createAutomation}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        style={s.body}
        contentContainerStyle={[s.bodyContent, { paddingBottom: kbHeight > 0 ? kbHeight + 20 : 40 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">

        {/* ── Skill Selection ── */}
        {!selectedSkill ? (
          <>
            <Text style={s.stepNum}>01</Text>
            <Text style={s.stepTitle}>{t.selectSkill}</Text>
            <Text style={s.stepHint}>{lang === 'zh' ? '选择一个 AI 技能进行自动化' : 'Choose an AI skill to automate'}</Text>
            {skills.map((skill, i) => (
              <TouchableOpacity
                key={skill.id}
                style={s.skillCard}
                onPress={() => { setSelectedSkill(skill); setInputValues({}); setPickedFiles({}) }}
                activeOpacity={0.8}>
                <View style={[s.skillAccent, { backgroundColor: ['#3b82f6', '#8b5cf6', '#f97316', '#10b981', '#ec4899', '#06b6d4'][i % 6] }]} />
                <View style={s.skillBody}>
                  <Text style={s.skillName} numberOfLines={1}>{skill.name}</Text>
                  {skill.description ? <Text style={s.skillDesc} numberOfLines={2}>{skill.description}</Text> : null}
                  <View style={s.skillMeta}>
                    <Text style={s.skillPrice}>{skill.price_credits} {t.credits}/{lang === 'zh' ? '次' : 'run'}</Text>
                    {skill.call_count > 0 && <Text style={s.skillCalls}>{skill.call_count} {t.calls}</Text>}
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </>
        ) : (
          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>

            {/* ── Selected Skill Card ── */}
            <View style={s.selectedCard}>
              <View style={s.selectedTop}>
                <View style={s.selectedDot} />
                <View style={{ flex: 1 }}>
                  <Text style={s.selectedName}>{selectedSkill.name}</Text>
                  {selectedSkill.description ? <Text style={s.selectedDesc} numberOfLines={2}>{selectedSkill.description}</Text> : null}
                </View>
              </View>
              <View style={s.selectedPriceRow}>
                <Text style={s.selectedPriceLabel}>{lang === 'zh' ? '每次消耗' : 'Cost per run'}</Text>
                <Text style={s.selectedPriceValue}>{selectedSkill.price_credits} <Text style={s.selectedPriceUnit}>{t.credits}</Text></Text>
              </View>
            </View>

            {/* ── Schedule Type ── */}
            <Text style={s.label}>{t.selectSchedule}</Text>
            <View style={s.pillRow}>
              {(['daily', 'weekly', 'interval'] as const).map(type => {
                const active = scheduleType === type
                return (
                  <TouchableOpacity
                    key={type}
                    style={[s.pill, active && s.pillActive]}
                    onPress={() => setScheduleType(type)}
                    activeOpacity={0.7}>
                    <Text style={[s.pillText, active && s.pillTextActive]}>
                      {type === 'daily' ? t.daily : type === 'weekly' ? t.weekly : (lang === 'zh' ? '定时' : 'Interval')}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            {/* ── Time Picker ── */}
            {scheduleType !== 'interval' && (
              <View style={s.timeCard}>
                <Text style={s.timeDisplay}>{hour}:{minute}</Text>
                <View style={s.timeSection}>
                  <Text style={s.timeSubLabel}>{lang === 'zh' ? '小时' : 'Hour'}</Text>
                  <ScrollView ref={hourScrollRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipScroll}>
                    {HOURS.map(h => (
                      <TouchableOpacity key={h} style={[s.chip, hour === h && s.chipActive]} onPress={() => setHour(h)} activeOpacity={0.7}>
                        <Text style={[s.chipText, hour === h && s.chipTextActive]}>{h}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
                <View style={s.timeSection}>
                  <Text style={s.timeSubLabel}>{lang === 'zh' ? '分钟' : 'Minute'}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipScroll}>
                    {MINUTES.map(m => (
                      <TouchableOpacity key={m} style={[s.chip, minute === m && s.chipActive]} onPress={() => setMinute(m)} activeOpacity={0.7}>
                        <Text style={[s.chipText, minute === m && s.chipTextActive]}>{m}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              </View>
            )}

            {/* ── Weekday Picker ── */}
            {scheduleType === 'weekly' && (
              <View style={s.weekRow}>
                {weekdays.map((d, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[s.weekCell, weekday === i && s.weekCellActive]}
                    onPress={() => setWeekday(i)}
                    activeOpacity={0.7}>
                    <Text style={[s.weekCellText, weekday === i && s.weekCellTextActive]}>{d}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* ── Interval Picker ── */}
            {scheduleType === 'interval' && (
              <View style={s.intervalCard}>
                {INTERVAL_OPTIONS.map(opt => {
                  const active = intervalMinutes === opt.minutes
                  return (
                    <TouchableOpacity
                      key={opt.minutes}
                      style={[s.intervalItem, active && s.intervalItemActive]}
                      onPress={() => setIntervalMinutes(opt.minutes)}
                      activeOpacity={0.7}>
                      <Text style={[s.intervalValue, active && s.intervalValueActive]}>{opt.label}</Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            )}

            {/* ── Preset Parameters ── */}
            {hasManualFields && (
              <View style={s.paramsCard}>
                <View style={s.paramsHeader}>
                  <Text style={s.label}>{lang === 'zh' ? '预设参数' : 'Preset Parameters'}</Text>
                </View>
                <Text style={s.paramsHint}>
                  {lang === 'zh' ? '自动化执行时使用以下参数，设备数据自动采集' : 'Used when automation runs. Device data collected automatically.'}
                </Text>
                <DynamicForm
                  schema={manualSchema}
                  values={inputValues}
                  onChange={setInputValues}
                  pickedFiles={pickedFiles}
                  onFilePicked={handleFilePicked}
                />
              </View>
            )}

            {/* ── Summary + Save ── */}
            <View style={s.summaryCard}>
              <View style={s.summaryRow}>
                <View style={s.summaryIconWrap}>
                  <View style={s.summaryClockFace}>
                    <View style={s.summaryClockHand} />
                    <View style={s.summaryClockHandM} />
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.summarySchedule}>{scheduleDisplay}</Text>
                  <Text style={s.summaryCost}>
                    {selectedSkill.price_credits} {t.credits} / {lang === 'zh' ? '次' : 'run'}
                  </Text>
                </View>
              </View>
            </View>

            <TouchableOpacity
              style={[s.saveBtnWrap, saving && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.85}>
              <LinearGradient colors={['#2563eb', '#1e40af']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.saveBtn}>
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={s.saveBtnText}>{editRule ? t.updateAutomation : t.saveAutomation}</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>

          </Animated.View>
        )}
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', paddingHorizontal: 16,
    paddingTop: STATUS_BAR_HEIGHT + 6, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(37, 99, 235, 0.06)',
  },
  headerBack: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#f1f5f9',
    justifyContent: 'center', alignItems: 'center',
  },
  headerBackIcon: { fontSize: 22, color: colors.ink700, marginTop: -2 },
  headerTitle: { fontSize: 17, fontWeight: fontWeight.bold, color: colors.ink950, letterSpacing: -0.3 },

  body: { flex: 1 },
  bodyContent: { padding: 16 },

  // Step indicator (skill select)
  stepNum: { fontSize: 32, fontWeight: fontWeight.extrabold, color: 'rgba(37,99,235,0.12)', letterSpacing: -1 },
  stepTitle: { fontSize: 22, fontWeight: fontWeight.bold, color: colors.ink950, marginTop: -4, marginBottom: 4, letterSpacing: -0.5 },
  stepHint: { fontSize: 13, color: colors.ink500, marginBottom: 18 },

  // Skill cards (selection list)
  skillCard: {
    flexDirection: 'row', backgroundColor: '#fff', borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(37,99,235,0.06)',
    marginBottom: 10, overflow: 'hidden',
  },
  skillAccent: { width: 4, borderTopLeftRadius: 14, borderBottomLeftRadius: 14 },
  skillBody: { flex: 1, padding: 14 },
  skillName: { fontSize: 15, fontWeight: fontWeight.semibold, color: colors.ink950 },
  skillDesc: { fontSize: 12, color: colors.ink500, marginTop: 3, lineHeight: 17 },
  skillMeta: { flexDirection: 'row', gap: 12, marginTop: 8 },
  skillPrice: { fontSize: 11, fontWeight: fontWeight.semibold, color: colors.primary },
  skillCalls: { fontSize: 11, color: colors.ink400 },

  // Selected skill card
  selectedCard: {
    backgroundColor: '#fff', borderRadius: 16,
    borderWidth: 1, borderColor: 'rgba(37,99,235,0.1)',
    marginBottom: 20, overflow: 'hidden',
  },
  selectedTop: { flexDirection: 'row', alignItems: 'flex-start', padding: 16, paddingBottom: 12 },
  selectedDot: {
    width: 10, height: 10, borderRadius: 5, backgroundColor: '#059669',
    marginRight: 12, marginTop: 5,
  },
  selectedName: { fontSize: 16, fontWeight: fontWeight.bold, color: colors.ink950 },
  selectedDesc: { fontSize: 12, color: colors.ink500, marginTop: 3, lineHeight: 17 },
  changeLink: { fontSize: 13, color: colors.primary, fontWeight: fontWeight.semibold },
  selectedPriceRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderTopWidth: 1, borderTopColor: 'rgba(37,99,235,0.06)',
    paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#fafbfc',
  },
  selectedPriceLabel: { fontSize: 12, color: colors.ink500 },
  selectedPriceValue: { fontSize: 16, fontWeight: fontWeight.extrabold, color: colors.primary },
  selectedPriceUnit: { fontSize: 12, fontWeight: fontWeight.medium, color: colors.ink500 },

  // Labels
  label: {
    fontSize: 12, fontWeight: fontWeight.bold, color: colors.ink500,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10,
  },

  // Schedule type pills
  pillRow: {
    flexDirection: 'row', backgroundColor: '#f1f5f9', borderRadius: 12, padding: 3, marginBottom: 18,
  },
  pill: {
    flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
  },
  pillActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3, elevation: 2 },
  pillText: { fontSize: 13, fontWeight: fontWeight.semibold, color: colors.ink500 },
  pillTextActive: { color: colors.primary, fontWeight: fontWeight.bold },

  // Time card
  timeCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: 'rgba(37,99,235,0.06)', marginBottom: 14,
  },
  timeDisplay: {
    fontSize: 40, fontWeight: fontWeight.extrabold, color: colors.ink950,
    textAlign: 'center', letterSpacing: -2, marginBottom: 16,
  },
  timeSection: { marginBottom: 12 },
  timeSubLabel: { fontSize: 11, fontWeight: fontWeight.semibold, color: colors.ink400, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },

  // Chips (hour/minute)
  chipScroll: { gap: 6 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
    backgroundColor: '#f8fafc', borderWidth: 1, borderColor: 'rgba(37,99,235,0.06)',
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 14, fontWeight: fontWeight.semibold, color: colors.ink600 },
  chipTextActive: { color: '#fff' },

  // Weekday
  weekRow: {
    flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18, gap: 6,
  },
  weekCell: {
    flex: 1, aspectRatio: 1, borderRadius: 12,
    backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(37,99,235,0.06)',
    justifyContent: 'center', alignItems: 'center',
  },
  weekCellActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  weekCellText: { fontSize: 14, fontWeight: fontWeight.bold, color: colors.ink600 },
  weekCellTextActive: { color: '#fff' },

  // Interval
  intervalCard: {
    flexDirection: 'row', gap: 8, marginBottom: 18,
  },
  intervalItem: {
    flex: 1, backgroundColor: '#fff', borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(37,99,235,0.06)',
    paddingVertical: 16, alignItems: 'center',
  },
  intervalItemActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  intervalValue: { fontSize: 18, fontWeight: fontWeight.extrabold, color: colors.ink700 },
  intervalValueActive: { color: '#fff' },

  // Params
  paramsCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: 'rgba(37,99,235,0.06)', marginBottom: 14,
  },
  paramsHeader: { marginBottom: 4 },
  paramsHint: { fontSize: 12, color: colors.ink400, marginBottom: 14, lineHeight: 17 },

  // Summary
  summaryCard: {
    backgroundColor: '#f0f7ff', borderRadius: 14,
    padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: 'rgba(37,99,235,0.1)',
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center' },
  summaryIconWrap: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(37,99,235,0.12)',
    justifyContent: 'center', alignItems: 'center', marginRight: 14,
  },
  summaryClockFace: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2.5, borderColor: colors.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  summaryClockHand: {
    position: 'absolute', width: 2, height: 7, backgroundColor: colors.primary,
    borderRadius: 1, bottom: '50%', left: '50%', marginLeft: -1,
  },
  summaryClockHandM: {
    position: 'absolute', width: 2, height: 5, backgroundColor: colors.primary,
    borderRadius: 1, bottom: '50%', left: '50%', marginLeft: -1,
    transform: [{ rotate: '90deg' }, { translateY: -2.5 }],
  },
  summarySchedule: { fontSize: 15, fontWeight: fontWeight.bold, color: colors.ink950 },
  summaryCost: { fontSize: 12, color: colors.ink500, marginTop: 2 },

  // Save
  saveBtnWrap: { borderRadius: 14, overflow: 'hidden' },
  saveBtn: { paddingVertical: 16, alignItems: 'center', borderRadius: 14 },
  saveBtnText: { fontSize: 15, fontWeight: fontWeight.bold, color: '#fff' },
})
