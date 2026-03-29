import React, { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native'
import LinearGradient from 'react-native-linear-gradient'
import { colors, fontWeight } from '../utils/theme'
import { useI18n } from '../i18n'
import { fetchSkillById, callSkill, uploadFile, fetchWallet, fetchSkillExample, fetchSkillExampleFiles, type Skill } from '../services/api'
import DownloadButton from '../components/DownloadButton'
import { taskManager } from '../services/taskManager'
import { collectAllDeviceData, getDeviceFormats } from '../services/dataCollector'
import DynamicForm from '../components/DynamicForm'
import type { PickedFile } from '../services/deviceCapabilities'

type PageTab = 'use' | 'example'

export default function SkillDetailScreen({ route, navigation }: any) {
  const { t, lang } = useI18n()
  const { skillId } = route.params
  const [skill, setSkill] = useState<Skill | null>(null)
  const [loading, setLoading] = useState(true)
  const [values, setValues] = useState<Record<string, any>>({})
  const [pickedFiles, setPickedFiles] = useState<Record<string, PickedFile[]>>({})
  const [submitting, setSubmitting] = useState(false)
  const [balance, setBalance] = useState<number | null>(null)
  const [example, setExample] = useState<any>(null)
  const [exampleFiles, setExampleFiles] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState<PageTab>('use')
  const [deviceData, setDeviceData] = useState<Record<string, any>>({})
  const [collecting, setCollecting] = useState(false)
  const [deviceFormats, setDeviceFormats] = useState<string[]>([])
  const [fieldStatuses, setFieldStatuses] = useState<Record<string, 'idle' | 'collecting' | 'done' | 'failed'>>({})

  useEffect(() => {
    ;(async () => {
      try {
        const [s, w] = await Promise.all([fetchSkillById(skillId), fetchWallet()])
        setSkill(s)
        setBalance(Number(w.credits))
        const defaults: Record<string, any> = {}
        const props = s.input_schema?.properties as Record<string, any> || {}
        for (const [key, prop] of Object.entries(props)) {
          if (prop.default != null) defaults[key] = prop.default
        }
        setValues(defaults)

        // Detect device: formats (user triggers collection manually)
        setDeviceFormats(getDeviceFormats(s.input_schema as any))

        if (s.example_call_id) {
          try {
            const [ex, exFiles] = await Promise.all([
              fetchSkillExample(skillId),
              fetchSkillExampleFiles(skillId),
            ])
            setExample(ex)
            setExampleFiles(exFiles)
          } catch {}
        }
      } catch (err: any) {
        Alert.alert(t.errorTitle, err.message || t.failedToLoad)
      } finally {
        setLoading(false)
      }
    })()
  }, [skillId])

  const handleCollectDeviceData = useCallback(async () => {
    if (!skill || collecting) return
    setCollecting(true)
    // Init all statuses to idle
    const initStatuses: Record<string, 'idle' | 'collecting' | 'done' | 'failed'> = {}
    deviceFormats.forEach(f => { initStatuses[f] = 'idle' })
    setFieldStatuses(initStatuses)

    const data = await collectAllDeviceData(skill.input_schema as any, (key, status) => {
      setFieldStatuses(prev => ({ ...prev, [key]: status }))
    })
    setDeviceData(data)
    setValues(prev => ({ ...prev, ...data }))
    setCollecting(false)
  }, [skill, collecting, deviceFormats])

  const handleFilePicked = useCallback((fieldKey: string, files: PickedFile[]) => {
    setPickedFiles(prev => ({ ...prev, [fieldKey]: files }))
  }, [])

  const handleSubmit = useCallback(async () => {
    if (!skill) return

    // Check device data collected
    if (deviceFormats.length > 0 && Object.keys(deviceData).length === 0) {
      Alert.alert(t.missing, lang === 'zh' ? '请先点击"采集设备数据"' : 'Please collect device data first')
      return
    }

    const requiredFields: string[] = (skill.input_schema as any)?.required || []
    for (const key of requiredFields) {
      const prop = (skill.input_schema?.properties as any)?.[key]
      // Skip device:* fields — they're handled by collector
      if (prop?.format?.startsWith('device:')) continue
      const isFileField = key === 'files' || key === 'file'
      if (isFileField) {
        if (!pickedFiles[key]?.length) { Alert.alert(t.missing, `"${key}"`); return }
      } else if (values[key] == null || values[key] === '') {
        Alert.alert(t.missing, `"${prop?.title || key}"`); return
      }
    }
    if (balance !== null && balance < skill.price_credits) {
      Alert.alert(t.insufficientCredits, `${skill.price_credits}+, ${balance}.`); return
    }
    Alert.alert(t.callApi, `${skill.name}\n${t.cost}: ${skill.price_credits}${skill.max_price_credits ? `–${skill.max_price_credits}` : ''} ${t.credits}`, [
      { text: t.cancel, style: 'cancel' },
      { text: t.confirm, onPress: doSubmit },
    ])
  }, [skill, values, pickedFiles, balance])

  const doSubmit = async () => {
    if (!skill) return
    setSubmitting(true)
    try {
      const fileIds: string[] = []
      for (const [, files] of Object.entries(pickedFiles)) {
        for (const file of files) {
          const r = await uploadFile(file.uri, file.name, file.mimeType)
          fileIds.push(r.file_id)
        }
      }
      const input: Record<string, any> = { ...values }
      if (fileIds.length > 0) {
        const fk = Object.keys(pickedFiles).find(k => pickedFiles[k]?.length > 0)
        if (fk) input[fk] = fileIds.length === 1 ? fileIds[0] : fileIds
      }
      const result = await callSkill(skill.id, { input, max_cost: skill.max_price_credits || undefined })
      taskManager.addTask(result.call_id, skill, input, result.credits_cost)
      if (result.status === 'completed' || result.status === 'success') {
        taskManager.completeTask(result.call_id, result.output, result.actual_cost ?? undefined)
        Alert.alert(t.doneLabel, `${t.cost}: ${result.actual_cost ?? result.credits_cost} ${t.credits}`, [{ text: 'OK', onPress: () => navigation.goBack() }])
      } else {
        Alert.alert(t.submitted, t.checkTasksTab, [{ text: 'OK', onPress: () => navigation.goBack() }])
      }
    } catch (err: any) {
      Alert.alert(t.errorTitle, err.message || t.failed)
    } finally { setSubmitting(false) }
  }

  if (loading) return <View style={st.center}><ActivityIndicator size="large" color={colors.primary} /></View>
  if (!skill) return null

  // Filter out device:* fields from manual form — they're auto-collected
  function filterManualFields(schema: any): any {
    if (!schema?.properties) return schema
    const filtered: Record<string, any> = {}
    for (const [key, prop] of Object.entries(schema.properties) as [string, any][]) {
      if (!prop.format?.startsWith('device:')) {
        filtered[key] = prop
      }
    }
    return { ...schema, properties: filtered }
  }

  const hasExample = !!example
  const hasInputFields = Object.keys(skill.input_schema?.properties || {}).length > 0

  return (
    <View style={st.container}>
      {/* Header: name + meta (always visible) */}
      <View style={st.header}>
        <Text style={st.name} numberOfLines={2}>{skill.name}</Text>
        <View style={st.metaRow}>
          {skill.category ? (
            <View style={st.chip}><Text style={st.chipText}>{skill.category.toUpperCase()}</Text></View>
          ) : null}
          <Text style={st.metaText}>{skill.call_count} {t.calls}</Text>
          <Text style={st.priceInline}>{skill.price_credits}{skill.max_price_credits ? `–${skill.max_price_credits}` : ''} {t.credits}</Text>
        </View>
      </View>

      {/* Tab bar */}
      {hasExample && (
        <View style={st.tabBar}>
          <TouchableOpacity
            style={[st.tab, activeTab === 'use' && st.tabActive]}
            onPress={() => setActiveTab('use')} activeOpacity={0.7}>
            <Text style={[st.tabText, activeTab === 'use' && st.tabTextActive]}>{t.use}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[st.tab, activeTab === 'example' && st.tabActive]}
            onPress={() => setActiveTab('example')} activeOpacity={0.7}>
            <Text style={[st.tabText, activeTab === 'example' && st.tabTextActive]}>{t.example}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Content */}
      <ScrollView style={st.scroll} contentContainerStyle={st.scrollContent} showsVerticalScrollIndicator={false}>
        {activeTab === 'use' ? (
          <>
            {/* Description */}
            {skill.description ? <Text style={st.desc}>{skill.description}</Text> : null}

            {/* Price + Balance */}
            <View style={st.priceCard}>
              <View style={st.priceCol}>
                <Text style={st.priceLabel}>{t.price}</Text>
                <Text style={st.priceValue}>{skill.price_credits}<Text style={st.priceUnit}> {t.credits}</Text></Text>
              </View>
              <View style={st.priceDivider} />
              <View style={st.priceCol}>
                <Text style={st.priceLabel}>{t.yourBalance}</Text>
                <Text style={[st.balanceValue, balance !== null && balance < skill.price_credits && { color: '#dc2626' }]}>
                  {balance !== null ? balance.toLocaleString() : '—'}
                </Text>
              </View>
            </View>

            {/* Tags */}
            {skill.tags && skill.tags.length > 0 && (
              <View style={st.tagsRow}>
                {skill.tags.map(tag => (
                  <View key={tag} style={st.tag}><Text style={st.tagText}>{tag}</Text></View>
                ))}
              </View>
            )}

            {/* Device data collection */}
            {deviceFormats.length > 0 && (
              <DeviceDataCard
                skill={skill}
                collecting={collecting}
                fieldStatuses={fieldStatuses}
                onCollect={handleCollectDeviceData}
                collected={Object.keys(deviceData).length > 0}
              />
            )}

            {/* Input form (manual fields only — skip device: formats) */}
            {hasInputFields && (
              <View style={st.card}>
                <Text style={st.sectionTitle}>{t.input}</Text>
                <DynamicForm
                  schema={filterManualFields(skill.input_schema as any)}
                  values={values}
                  onChange={setValues}
                  pickedFiles={pickedFiles}
                  onFilePicked={handleFilePicked}
                />
              </View>
            )}

            {/* Call button */}
            <TouchableOpacity
              style={[st.callBtnWrap, submitting && { opacity: 0.6 }]}
              onPress={handleSubmit} disabled={submitting} activeOpacity={0.85}>
              <LinearGradient colors={['#2563eb', '#1e40af']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.callBtn}>
                {submitting ? <ActivityIndicator color="#fff" /> : <Text style={st.callBtnText}>{t.callApi}</Text>}
              </LinearGradient>
            </TouchableOpacity>
          </>
        ) : (
          <>
            {/* Example Input */}
            {example.input_data && (
              <View style={st.exSection}>
                <Text style={st.exLabel}>{t.input.toUpperCase()}</Text>
                <View style={st.codeBlock}>
                  <Text style={st.codeText}>{JSON.stringify(example.input_data, null, 2)}</Text>
                </View>
              </View>
            )}

            {/* Example Output */}
            {(example.output_data || example.output) && (
              <View style={st.exSection}>
                <Text style={st.exLabel}>{t.output.toUpperCase()}</Text>
                <View style={st.codeBlock}>
                  <Text style={st.codeText}>
                    {typeof (example.output_data || example.output) === 'string'
                      ? (example.output_data || example.output)
                      : JSON.stringify(example.output_data || example.output, null, 2)}
                  </Text>
                </View>
              </View>
            )}

            {/* Example Files */}
            {exampleFiles.length > 0 && (
              <View style={st.exSection}>
                <Text style={st.exLabel}>{t.files}</Text>
                {exampleFiles.map(f => (
                  <View key={f.file_id} style={st.fileRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={st.fileName}>{f.filename}</Text>
                      <Text style={st.fileMeta}>{f.file_type} · {f.mime_type}</Text>
                    </View>
                    <DownloadButton
                      url={`https://www.agentcab.ai/v1/skills/${skillId}/example/files/${f.file_id}`}
                      filename={f.filename}
                      mimeType={f.mime_type}
                    />
                  </View>
                ))}
              </View>
            )}

            {example.duration_ms != null && (
              <Text style={st.exMeta}>{(example.duration_ms / 1000).toFixed(1)}s · {example.status}</Text>
            )}
          </>
        )}
        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  )
}

function DeviceDataCard({ skill, collecting, fieldStatuses, onCollect, collected }: {
  skill: Skill
  collecting: boolean
  fieldStatuses: Record<string, string>
  onCollect: () => void
  collected: boolean
}) {
  const { t } = useI18n()
  const properties = skill.input_schema?.properties as Record<string, any> || {}
  const deviceFields = Object.entries(properties).filter(([, p]: [string, any]) => p.format?.startsWith('device:'))

  const statusIcon = (s: string) => {
    switch (s) {
      case 'collecting': return '↻'
      case 'done': return '✓'
      case 'failed': return '✕'
      default: return '○'
    }
  }
  const statusColor = (s: string) => {
    switch (s) {
      case 'collecting': return '#2563eb'
      case 'done': return '#059669'
      case 'failed': return '#dc2626'
      default: return '#94a3b8'
    }
  }

  return (
    <View style={st.deviceCard}>
      <Text style={st.deviceTitle}>Device Data</Text>
      <View style={st.deviceList}>
        {deviceFields.map(([key, prop]: [string, any]) => {
          const status = fieldStatuses[key] || 'idle'
          return (
            <View key={key} style={st.deviceRow}>
              <Text style={[st.deviceStatusIcon, { color: statusColor(status) }]}>{statusIcon(status)}</Text>
              <Text style={st.deviceLabel}>{prop.title || key.replace('device:', '')}</Text>
              <Text style={[st.deviceStatus, { color: statusColor(status) }]}>
                {status === 'idle' ? '' : status === 'collecting' ? 'Collecting...' : status === 'done' ? 'Done' : 'Failed'}
              </Text>
            </View>
          )
        })}
      </View>
      <TouchableOpacity
        style={[st.collectBtn, (collecting || collected) && st.collectBtnDone]}
        onPress={onCollect}
        disabled={collecting}
        activeOpacity={0.7}>
        {collecting ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={st.collectBtnText}>{collected ? '✓ Collected — Tap to Refresh' : 'Collect Device Data'}</Text>
        )}
      </TouchableOpacity>
    </View>
  )
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Header (sticky)
  header: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(37, 99, 235, 0.06)',
  },
  name: { fontSize: 20, fontWeight: fontWeight.bold, color: colors.ink950, letterSpacing: -0.5 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: '#eff6ff', borderWidth: 1, borderColor: 'rgba(37,99,235,0.2)' },
  chipText: { fontSize: 10, fontWeight: fontWeight.bold, color: '#2563eb', letterSpacing: 0.5 },
  metaText: { fontSize: 12, color: colors.ink500 },
  priceInline: { fontSize: 12, fontWeight: fontWeight.bold, color: '#2563eb' },

  // Tab bar
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(37, 99, 235, 0.08)',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: '#2563eb' },
  tabText: { fontSize: 14, fontWeight: fontWeight.semibold, color: colors.ink400 },
  tabTextActive: { color: '#2563eb' },

  // Scroll content
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },

  // Use tab
  desc: { fontSize: 14, color: colors.ink600, lineHeight: 21, marginBottom: 14 },
  priceCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(37,99,235,0.08)',
    marginBottom: 14,
  },
  priceCol: { flex: 1, padding: 16 },
  priceDivider: { width: 1, backgroundColor: 'rgba(37,99,235,0.08)' },
  priceLabel: { fontSize: 10, color: colors.ink500, fontWeight: fontWeight.semibold, letterSpacing: 0.8, marginBottom: 4 },
  priceValue: { fontSize: 22, fontWeight: fontWeight.extrabold, color: '#2563eb', letterSpacing: -0.5 },
  priceUnit: { fontSize: 13, fontWeight: fontWeight.semibold, color: colors.ink500 },
  balanceValue: { fontSize: 22, fontWeight: fontWeight.extrabold, color: colors.ink950, letterSpacing: -0.5 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
  tag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: '#f8f8f7', borderWidth: 1, borderColor: '#f0f0ee' },
  tagText: { fontSize: 12, color: colors.ink600, fontWeight: fontWeight.medium },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: 'rgba(37,99,235,0.08)', marginBottom: 16 },
  // Device data
  deviceCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: 'rgba(37,99,235,0.08)', marginBottom: 14 },
  deviceTitle: { fontSize: 14, fontWeight: fontWeight.bold, color: colors.ink950, marginBottom: 12 },
  deviceList: { gap: 8, marginBottom: 14 },
  deviceRow: { flexDirection: 'row', alignItems: 'center' },
  deviceStatusIcon: { fontSize: 12, fontWeight: fontWeight.bold, width: 18, textAlign: 'center' },
  deviceLabel: { fontSize: 13, color: colors.ink800, flex: 1, marginLeft: 6 },
  deviceStatus: { fontSize: 11, fontWeight: fontWeight.medium },
  collectBtn: { backgroundColor: '#2563eb', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  collectBtnDone: { backgroundColor: '#059669' },
  collectBtnText: { color: '#fff', fontSize: 13, fontWeight: fontWeight.bold },
  sectionTitle: { fontSize: 15, fontWeight: fontWeight.bold, color: colors.ink950, marginBottom: 14 },
  callBtnWrap: { borderRadius: 12, overflow: 'hidden' },
  callBtn: { paddingVertical: 15, alignItems: 'center', borderRadius: 12 },
  callBtnText: { fontSize: 15, fontWeight: fontWeight.bold, color: '#fff' },

  // Example tab
  exSection: { marginBottom: 16 },
  exLabel: { fontSize: 10, fontWeight: fontWeight.bold, color: colors.ink400, letterSpacing: 1, marginBottom: 8 },
  codeBlock: { backgroundColor: '#f1f5f9', borderRadius: 8, padding: 12 },
  codeText: { fontSize: 12, color: colors.ink800, fontFamily: 'monospace', lineHeight: 18 },
  fileRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(37,99,235,0.06)',
  },
  fileName: { fontSize: 13, fontWeight: fontWeight.semibold, color: colors.ink950 },
  fileMeta: { fontSize: 11, color: colors.ink500, marginTop: 2 },
  fileDownload: { fontSize: 13, fontWeight: fontWeight.semibold, color: '#2563eb' },
  exMeta: { fontSize: 12, color: colors.ink500 },
})
