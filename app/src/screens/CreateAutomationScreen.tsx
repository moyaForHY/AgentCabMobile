import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
} from 'react-native'
import { showModal } from '../components/AppModal'
import { colors, fontWeight } from '../utils/theme'
import { useI18n } from '../i18n'
import { fetchSkills, type Skill } from '../services/api'
import {
  saveRule,
  generateRuleId,
  type AutomationRule,
} from '../services/automationService'

const STATUS_BAR_HEIGHT = StatusBar.currentHeight || 44

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTES = ['00', '15', '30', '45']
const INTERVAL_OPTIONS = [
  { label: '1h', minutes: 60 },
  { label: '2h', minutes: 120 },
  { label: '4h', minutes: 240 },
  { label: '6h', minutes: 360 },
  { label: '12h', minutes: 720 },
]

const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WEEKDAYS_ZH = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

type Step = 'skill' | 'type' | 'config' | 'confirm'

export default function CreateAutomationScreen({ route, navigation }: any) {
  const { t, lang } = useI18n()
  const editRule = route?.params?.editRule as AutomationRule | undefined

  const [step, setStep] = useState<Step>(editRule ? 'type' : 'skill')
  const [skills, setSkills] = useState<Skill[]>([])
  const [loadingSkills, setLoadingSkills] = useState(false)
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null)
  const [scheduleType, setScheduleType] = useState<'daily' | 'weekly' | 'interval'>('daily')
  const [hour, setHour] = useState('08')
  const [minute, setMinute] = useState('00')
  const [weekday, setWeekday] = useState(1) // Monday
  const [intervalMinutes, setIntervalMinutes] = useState(60)
  const [saving, setSaving] = useState(false)

  // Pre-fill if editing
  useEffect(() => {
    if (editRule) {
      setScheduleType(editRule.schedule.type)
      if (editRule.schedule.time) {
        const [h, m] = editRule.schedule.time.split(':')
        setHour(h)
        setMinute(m)
      }
      if (editRule.schedule.weekday !== undefined) setWeekday(editRule.schedule.weekday)
      if (editRule.schedule.intervalMinutes) setIntervalMinutes(editRule.schedule.intervalMinutes)
    }
  }, [editRule])

  // Load skills
  useEffect(() => {
    if (step === 'skill' && skills.length === 0) {
      setLoadingSkills(true)
      fetchSkills(1, 50)
        .then(res => setSkills(res.items.filter(s => s.status === 'published' || s.status === 'active')))
        .catch(() => {})
        .finally(() => setLoadingSkills(false))
    }
  }, [step])

  const handleSelectSkill = (skill: Skill) => {
    setSelectedSkill(skill)
    setStep('type')
  }

  const handleSelectType = (type: 'daily' | 'weekly' | 'interval') => {
    setScheduleType(type)
    setStep('config')
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const rule: AutomationRule = {
        id: editRule?.id || generateRuleId(),
        skillId: editRule?.skillId || selectedSkill!.id,
        skillName: editRule?.skillName || selectedSkill!.name,
        schedule: {
          type: scheduleType,
          ...(scheduleType !== 'interval' && { time: `${hour}:${minute}` }),
          ...(scheduleType === 'weekly' && { weekday }),
          ...(scheduleType === 'interval' && { intervalMinutes }),
        },
        enabled: editRule?.enabled ?? true,
        lastRun: editRule?.lastRun,
        createdAt: editRule?.createdAt || new Date().toISOString(),
      }
      await saveRule(rule)
      navigation.goBack()
    } catch (e: any) {
      showModal(t.errorTitle, e.message)
    } finally {
      setSaving(false)
    }
  }

  const weekdays = lang === 'zh' ? WEEKDAYS_ZH : WEEKDAYS_EN

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => {
          if (step === 'skill' || (editRule && step === 'type')) {
            navigation.goBack()
          } else if (step === 'type') {
            setStep('skill')
          } else if (step === 'config') {
            setStep('type')
          }
        }} activeOpacity={0.6}>
          <Text style={s.backBtn}>{t.back}</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>{editRule ? t.editAutomation : t.createAutomation}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={s.body} contentContainerStyle={s.bodyContent} showsVerticalScrollIndicator={false}>
        {/* Step 1: Pick a skill */}
        {step === 'skill' && (
          <>
            <Text style={s.stepTitle}>{t.selectSkill}</Text>
            {loadingSkills ? (
              <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
            ) : (
              skills.map(skill => (
                <TouchableOpacity
                  key={skill.id}
                  style={s.skillRow}
                  activeOpacity={0.7}
                  onPress={() => handleSelectSkill(skill)}>
                  <View style={s.skillDot} />
                  <View style={s.skillInfo}>
                    <Text style={s.skillName} numberOfLines={1}>{skill.name}</Text>
                    {skill.description ? (
                      <Text style={s.skillDesc} numberOfLines={2}>{skill.description}</Text>
                    ) : null}
                  </View>
                  <Text style={s.skillPrice}>{skill.price_credits} cr</Text>
                </TouchableOpacity>
              ))
            )}
          </>
        )}

        {/* Step 2: Pick schedule type */}
        {step === 'type' && (
          <>
            <Text style={s.stepTitle}>{t.selectSchedule}</Text>
            <View style={s.typeGrid}>
              {(['daily', 'weekly', 'interval'] as const).map(type => (
                <TouchableOpacity
                  key={type}
                  style={[s.typeCard, scheduleType === type && step === 'config' && s.typeCardActive]}
                  activeOpacity={0.7}
                  onPress={() => handleSelectType(type)}>
                  <Text style={s.typeIcon}>
                    {type === 'daily' ? '( )' : type === 'weekly' ? '[ ]' : '{ }'}
                  </Text>
                  <Text style={s.typeLabel}>
                    {type === 'daily' ? t.daily : type === 'weekly' ? t.weekly : t.everyXHours}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* Step 3: Configure schedule */}
        {step === 'config' && (
          <>
            {/* Schedule type summary */}
            <Text style={s.stepTitle}>
              {scheduleType === 'daily' ? t.selectTime : scheduleType === 'weekly' ? t.selectDay : t.selectInterval}
            </Text>

            {/* Time picker for daily / weekly */}
            {scheduleType !== 'interval' && (
              <>
                <Text style={s.pickerLabel}>{t.selectTime}</Text>
                <View style={s.timePickerRow}>
                  {/* Hour */}
                  <View style={s.pickerColumn}>
                    <ScrollView style={s.pickerScroll} showsVerticalScrollIndicator={false}>
                      {HOURS.map(h => (
                        <TouchableOpacity
                          key={h}
                          style={[s.pickerItem, hour === h && s.pickerItemActive]}
                          onPress={() => setHour(h)}
                          activeOpacity={0.6}>
                          <Text style={[s.pickerItemText, hour === h && s.pickerItemTextActive]}>{h}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                  <Text style={s.pickerColon}>:</Text>
                  {/* Minute */}
                  <View style={s.pickerColumn}>
                    <ScrollView style={s.pickerScroll} showsVerticalScrollIndicator={false}>
                      {MINUTES.map(m => (
                        <TouchableOpacity
                          key={m}
                          style={[s.pickerItem, minute === m && s.pickerItemActive]}
                          onPress={() => setMinute(m)}
                          activeOpacity={0.6}>
                          <Text style={[s.pickerItemText, minute === m && s.pickerItemTextActive]}>{m}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                </View>
              </>
            )}

            {/* Day picker for weekly */}
            {scheduleType === 'weekly' && (
              <>
                <Text style={[s.pickerLabel, { marginTop: 20 }]}>{t.selectDay}</Text>
                <View style={s.dayGrid}>
                  {weekdays.map((d, i) => (
                    <TouchableOpacity
                      key={i}
                      style={[s.dayChip, weekday === i && s.dayChipActive]}
                      onPress={() => setWeekday(i)}
                      activeOpacity={0.6}>
                      <Text style={[s.dayChipText, weekday === i && s.dayChipTextActive]}>{d}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {/* Interval picker */}
            {scheduleType === 'interval' && (
              <View style={s.intervalGrid}>
                {INTERVAL_OPTIONS.map(opt => (
                  <TouchableOpacity
                    key={opt.minutes}
                    style={[s.intervalChip, intervalMinutes === opt.minutes && s.intervalChipActive]}
                    onPress={() => setIntervalMinutes(opt.minutes)}
                    activeOpacity={0.6}>
                    <Text style={[s.intervalChipText, intervalMinutes === opt.minutes && s.intervalChipTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Summary */}
            <View style={s.summaryCard}>
              <Text style={s.summaryLabel}>{t.automationSummary}</Text>
              <Text style={s.summarySkill}>{editRule?.skillName || selectedSkill?.name}</Text>
              <Text style={s.summarySchedule}>
                {scheduleType === 'daily' && `${t.daily} ${hour}:${minute}`}
                {scheduleType === 'weekly' && `${weekdays[weekday]} ${hour}:${minute}`}
                {scheduleType === 'interval' && `${t.everyXHours} (${INTERVAL_OPTIONS.find(o => o.minutes === intervalMinutes)?.label})`}
              </Text>
            </View>

            {/* Save button */}
            <TouchableOpacity
              style={[s.saveBtn, saving && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.7}>
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={s.saveBtnText}>{editRule ? t.updateAutomation : t.saveAutomation}</Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
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
    paddingTop: STATUS_BAR_HEIGHT + 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(37, 99, 235, 0.06)',
  },
  backBtn: {
    fontSize: 15,
    color: colors.primary,
    fontWeight: fontWeight.semibold,
    minWidth: 40,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: fontWeight.bold,
    color: colors.ink950,
    letterSpacing: -0.3,
  },
  body: { flex: 1 },
  bodyContent: { padding: 16, paddingBottom: 40 },

  // Steps
  stepTitle: {
    fontSize: 18,
    fontWeight: fontWeight.bold,
    color: colors.ink950,
    marginBottom: 16,
    letterSpacing: -0.3,
  },

  // Skill list
  skillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.08)',
    padding: 14,
    marginBottom: 8,
  },
  skillDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginRight: 12,
  },
  skillInfo: { flex: 1, marginRight: 10 },
  skillName: {
    fontSize: 14,
    fontWeight: fontWeight.semibold,
    color: colors.ink950,
  },
  skillDesc: {
    fontSize: 12,
    color: colors.ink500,
    marginTop: 2,
  },
  skillPrice: {
    fontSize: 12,
    color: colors.ink600,
    fontWeight: fontWeight.semibold,
  },

  // Type grid
  typeGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  typeCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.08)',
    padding: 20,
    alignItems: 'center',
  },
  typeCardActive: {
    borderColor: colors.primary,
    backgroundColor: '#eff6ff',
  },
  typeIcon: {
    fontSize: 20,
    fontWeight: fontWeight.bold,
    color: colors.primary,
    marginBottom: 8,
  },
  typeLabel: {
    fontSize: 13,
    fontWeight: fontWeight.semibold,
    color: colors.ink700,
    textAlign: 'center',
  },

  // Time picker
  pickerLabel: {
    fontSize: 14,
    fontWeight: fontWeight.semibold,
    color: colors.ink700,
    marginBottom: 10,
  },
  timePickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  pickerColumn: {
    width: 70,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.08)',
    overflow: 'hidden',
  },
  pickerScroll: {
    maxHeight: 200,
  },
  pickerItem: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  pickerItemActive: {
    backgroundColor: colors.primary,
  },
  pickerItemText: {
    fontSize: 16,
    fontWeight: fontWeight.semibold,
    color: colors.ink700,
  },
  pickerItemTextActive: {
    color: '#fff',
  },
  pickerColon: {
    fontSize: 24,
    fontWeight: fontWeight.bold,
    color: colors.ink700,
  },

  // Day picker
  dayGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  dayChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.08)',
  },
  dayChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dayChipText: {
    fontSize: 13,
    fontWeight: fontWeight.semibold,
    color: colors.ink700,
  },
  dayChipTextActive: {
    color: '#fff',
  },

  // Interval
  intervalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  intervalChip: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.08)',
  },
  intervalChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  intervalChipText: {
    fontSize: 16,
    fontWeight: fontWeight.bold,
    color: colors.ink700,
  },
  intervalChipTextActive: {
    color: '#fff',
  },

  // Summary
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.08)',
    padding: 18,
    marginTop: 24,
    marginBottom: 20,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: fontWeight.semibold,
    color: colors.ink500,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  summarySkill: {
    fontSize: 15,
    fontWeight: fontWeight.bold,
    color: colors.ink950,
    marginBottom: 4,
  },
  summarySchedule: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: fontWeight.semibold,
  },

  // Save
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: fontWeight.bold,
    color: '#fff',
  },
})
