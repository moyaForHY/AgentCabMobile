import React, { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Image,
  Platform,
  Share,
  RefreshControl,
} from 'react-native'
import { showModal } from '../components/AppModal'
import LinearGradient from 'react-native-linear-gradient'
import Icon from 'react-native-vector-icons/Feather'
import { colors, fontWeight, shadows } from '../utils/theme'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useI18n } from '../i18n'
import { fetchSkillById, callSkill, uploadFile, fetchWallet, fetchSkillExample, fetchSkillExampleFiles, fetchReviews, fetchCalls, SITE_URL, type Skill, type Review } from '../services/api'
import DownloadButton from '../components/DownloadButton'
import { isImageFile, isPdfFile, isHtmlFile } from '../components/ImagePreview'
import { isChinese } from '../utils/i18n'
import ImagePreview from '../components/ImagePreview'
import PdfPreview from '../components/PdfPreview'
import { WebView } from 'react-native-webview'
import { Modal } from 'react-native'
import { storage } from '../services/storage'
import { taskManager } from '../services/taskManager'
import { collectAllDeviceData, getDeviceFormats } from '../services/dataCollector'
import DynamicForm from '../components/DynamicForm'
import ReviewCard from '../components/ReviewCard'
import { SkillDetailSkeleton } from '../components/Skeleton'
import { usePinnedApis } from '../hooks/usePinnedApis'
import { useKeyboard } from '../hooks/useKeyboard'
import { events, EVENT_CALL_COMPLETED, EVENT_WALLET_CHANGED } from '../services/events'
import { trackTask } from '../services/taskPoller'
import type { PickedFile } from '../services/deviceCapabilities'

type PageTab = 'use' | 'history' | 'example' | 'reviews'

// In-memory cache for instant re-entry
const skillMemCache = new Map<string, { skill: any; wallet: any; example: any; exampleFiles: any[] }>()

export default function SkillDetailScreen({ route, navigation }: any) {
  const insets = useSafeAreaInsets()
  const { t, lang } = useI18n()
  const { skillId, autoUse, preInputValues } = route.params
  const { isPinned, pin, unpin } = usePinnedApis()
  const memCached = skillMemCache.get(skillId)
  const [skill, setSkill] = useState<Skill | null>(memCached?.skill || null)
  const [loading, setLoading] = useState(!memCached)
  const [values, setValues] = useState<Record<string, any>>({})
  const [pickedFiles, setPickedFiles] = useState<Record<string, PickedFile[]>>({})
  const [submitting, setSubmitting] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null)
  const [balance, setBalance] = useState<number | null>(memCached?.wallet?.credits != null ? Number(memCached.wallet.credits) : null)
  const [example, setExample] = useState<any>(memCached?.example || null)
  const [exampleFiles, setExampleFiles] = useState<any[]>(memCached?.exampleFiles || [])
  const [activeTab, setActiveTab] = useState<PageTab>('use')
  const [deviceData, setDeviceData] = useState<Record<string, any>>({})
  const [collecting, setCollecting] = useState(false)
  const [deviceFormats, setDeviceFormats] = useState<string[]>([])
  const [fieldStatuses, setFieldStatuses] = useState<Record<string, 'idle' | 'collecting' | 'done' | 'failed'>>({})
  const [shouldAutoCollect, setShouldAutoCollect] = useState(false)
  const [reviews, setReviews] = useState<Review[]>([])
  const [reviewsTotal, setReviewsTotal] = useState(0)
  const { height: kbHeight } = useKeyboard()
  const scrollRef = React.useRef<ScrollView>(null)
  const [showMoreActions, setShowMoreActions] = useState(false)
  const [myCalls, setMyCalls] = useState<any[]>([])
  const [loadingCalls, setLoadingCalls] = useState(false)
  const [callsPage, setCallsPage] = useState(0)
  const [callsHasMore, setCallsHasMore] = useState(true)
  const [loadingMoreCalls, setLoadingMoreCalls] = useState(false)
  const [refreshingCalls, setRefreshingCalls] = useState(false)

  useEffect(() => {
    if (kbHeight > 0) setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100)
  }, [kbHeight])

  useEffect(() => {
    const cacheKey = `skill_detail_${skillId}`

    const applySkillData = (s: Skill, w: { credits: any }, ex: any, exFiles: any[]) => {
      setSkill(s)
      setBalance(Number(w.credits))
      const defaults: Record<string, any> = {}
      const props = s.input_schema?.properties as Record<string, any> || {}
      for (const [key, prop] of Object.entries(props)) {
        if (prop.default != null) defaults[key] = prop.default
      }
      setValues({ ...defaults, ...(preInputValues || {}) })

      const formats = getDeviceFormats(s.input_schema as any)
      setDeviceFormats(formats)

      if (autoUse && formats.length > 0) {
        setShouldAutoCollect(true)
      }

      if (ex) setExample(ex)
      if (exFiles?.length) setExampleFiles(exFiles)
    }

    ;(async () => {
      // 1. Load from cache first — show cached data instantly, no skeleton
      try {
        const cached = await storage.getStringAsync(cacheKey)
        if (cached) {
          const { skill: cachedSkill, wallet: cachedWallet, example: cachedExample, exampleFiles: cachedExFiles } = JSON.parse(cached)
          applySkillData(cachedSkill, cachedWallet, cachedExample, cachedExFiles)
          setLoading(false)
        }
      } catch {}

      // 2. Fetch fresh data from API (silent background refresh)
      try {
        const [s, w] = await Promise.all([fetchSkillById(skillId), fetchWallet()])
        let ex = null
        let exFiles: any[] = []
        if (s.example_call_id) {
          try {
            const [fetchedEx, fetchedExFiles] = await Promise.all([
              fetchSkillExample(skillId),
              fetchSkillExampleFiles(skillId),
            ])
            ex = fetchedEx
            exFiles = fetchedExFiles
          } catch {}
        }

        applySkillData(s, w, ex, exFiles)

        // Fetch reviews (with cache)
        const reviewsCacheKey = `skill_reviews_${skillId}`
        try {
          const cachedReviews = await storage.getStringAsync(reviewsCacheKey)
          if (cachedReviews) {
            try {
              const parsed = JSON.parse(cachedReviews)
              setReviews(parsed.items)
              setReviewsTotal(parsed.total)
            } catch {}
          }
        } catch {}
        try {
          const rev = await fetchReviews(skillId)
          setReviews(rev.items)
          setReviewsTotal(rev.total)
          storage.setStringAsync(reviewsCacheKey, JSON.stringify({ items: rev.items, total: rev.total })).catch(() => {})
        } catch {}

        // 3. Save to cache (disk + memory)
        const cacheData = { skill: s, wallet: w, example: ex, exampleFiles: exFiles }
        skillMemCache.set(skillId, cacheData)
        storage.setStringAsync(cacheKey, JSON.stringify(cacheData)).catch(() => {})
      } catch (err: any) {
        // Only show error if we have no cached data
        if (!skill) {
          showModal(t.errorTitle, err.message || t.failedToLoad)
        }
      } finally {
        setLoading(false)
      }
    })()
  }, [skillId])

  // Auto-collect trigger from quick action
  useEffect(() => {
    if (shouldAutoCollect && skill && !collecting && Object.keys(deviceData).length === 0) {
      setShouldAutoCollect(false)
      handleCollectDeviceData()
    }
  }, [shouldAutoCollect, skill, collecting])

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

    // Check which fields got empty data — likely permission denied
    const properties = skill.input_schema?.properties as Record<string, any> || {}
    const emptyFields: string[] = []
    for (const [key, prop] of Object.entries(properties)) {
      if (!prop.format?.startsWith('device:')) continue
      const val = data[key]
      const isEmpty = val === null || val === undefined ||
        (Array.isArray(val) && val.length === 0) ||
        (typeof val === 'object' && !Array.isArray(val) && Object.keys(val).length === 0) ||
        val === ''
      // Skip fields that are normally empty (clipboard, notifications, etc.)
      const alwaysOptional = ['device:clipboard', 'device:notifications', 'device:media_playing', 'device:call_log', 'device:sms']
      if (isEmpty && !alwaysOptional.includes(prop.format)) {
        emptyFields.push(prop.title || key)
      }
    }

    if (emptyFields.length > 0) {
      showModal(
        lang === 'zh' ? '部分数据未采集' : 'Some data not collected',
        (lang === 'zh'
          ? `以下数据未能采集（可能需要开启权限）：\n\n${emptyFields.join('\n')}\n\n请到手机 设置 → 应用管理 → AgentCab → 权限 中开启相应权限。`
          : `The following data could not be collected (permissions may be needed):\n\n${emptyFields.join('\n')}\n\nGo to Settings → Apps → AgentCab → Permissions to enable.`),
        [
          { text: lang === 'zh' ? '去设置' : 'Open Settings', onPress: () => Linking.openSettings() },
          { text: 'OK' },
        ],
      )
    }
  }, [skill, collecting, deviceFormats, lang])

  const handleFilePicked = useCallback((fieldKey: string, files: PickedFile[]) => {
    setPickedFiles(prev => ({ ...prev, [fieldKey]: files }))
  }, [])

  const handleRefreshCalls = useCallback(async () => {
    setRefreshingCalls(true)
    try {
      const r = await fetchCalls(1, 20, undefined, skillId)
      setMyCalls(r.items)
      setCallsPage(1)
      setCallsHasMore(r.items.length === 20)
      const callsCacheKey = `skill_calls_${skillId}`
      storage.setStringAsync(callsCacheKey, JSON.stringify({ items: r.items })).catch(() => {})
    } catch {}
    setRefreshingCalls(false)
  }, [skillId])

  const handleSubmit = useCallback(async () => {
    if (!skill) return

    // Check device data collected
    if (deviceFormats.length > 0 && Object.keys(deviceData).length === 0) {
      showModal(t.missing, lang === 'zh' ? '请先点击"采集设备数据"' : 'Please collect device data first')
      return
    }

    const requiredFields: string[] = (skill.input_schema as any)?.required || []
    for (const key of requiredFields) {
      const prop = (skill.input_schema?.properties as any)?.[key]
      // Skip device:* fields — they're handled by collector
      if (prop?.format?.startsWith('device:')) continue
      const itemFormat = prop?.items?.format || ''
      const isFileField = prop?.format === 'file_id' || itemFormat === 'file_id' || key === 'files' || key === 'file' || key === 'file_ids' || key === 'file_id'
      if (isFileField) {
        if (!pickedFiles[key]?.length) { showModal(t.missing, `"${prop?.title || key}"`); return }
      } else if (values[key] == null || values[key] === '') {
        showModal(t.missing, `"${prop?.title || key}"`); return
      }
    }
    if (balance !== null && balance < skill.price_credits) {
      showModal(t.insufficientCredits, `${skill.price_credits}+, ${balance}.`); return
    }
    showModal(t.callApi, `${skill.name}\n${t.cost}: ${skill.price_credits}${skill.max_price_credits ? `–${skill.max_price_credits}` : ''} ${t.credits}`, [
      { text: t.cancel, style: 'cancel' },
      { text: t.confirm, onPress: doSubmit },
    ])
  }, [skill, values, pickedFiles, balance])

  const doSubmit = async () => {
    if (!skill) return
    setSubmitting(true)
    try {
      const fileIds: string[] = []
      const allFiles = Object.entries(pickedFiles).flatMap(([, files]) => files)
      const totalFiles = allFiles.length
      if (totalFiles > 0) setUploadProgress({ current: 0, total: totalFiles })
      let uploaded = 0
      for (const [, files] of Object.entries(pickedFiles)) {
        for (const file of files) {
          const r = await uploadFile(file.uri, file.name, file.mimeType)
          fileIds.push(r.file_id)
          uploaded++
          setUploadProgress({ current: uploaded, total: totalFiles })
        }
      }
      setUploadProgress(null)
      const input: Record<string, any> = { ...values }
      if (fileIds.length > 0) {
        const fk = Object.keys(pickedFiles).find(k => pickedFiles[k]?.length > 0)
        if (fk) {
          const fieldSchema = (skill.input_schema?.properties as any)?.[fk]
          const isArray = fieldSchema?.type === 'array'
          input[fk] = isArray ? fileIds : (fileIds.length === 1 ? fileIds[0] : fileIds)
        }
      }
      const result = await callSkill(skill.id, { input, max_cost: skill.max_price_credits || undefined })
      taskManager.addTask(result.call_id, skill, input, result.credits_cost)
      trackTask(result.call_id)
      events.emit(EVENT_WALLET_CHANGED)
      if (result.status === 'completed' || result.status === 'success') {
        taskManager.completeTask(result.call_id, result.output, result.actual_cost ?? undefined)
        events.emit(EVENT_CALL_COMPLETED, {
          call_id: result.call_id,
          skill_name: skill.name,
          status: result.status,
        })
      }
      // Always navigate to result page
      navigation.navigate('TaskResult', { taskId: result.call_id })
    } catch (err: any) {
      showModal(t.errorTitle, err.message || t.failed)
    } finally { setSubmitting(false); setUploadProgress(null) }
  }

  if (loading) return <SkillDetailSkeleton />
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
  const manualSchema = filterManualFields(skill.input_schema as any)
  const hasInputFields = Object.keys(manualSchema?.properties || {}).length > 0

  return (
    <View style={st.container}>
      {/* Fixed Nav Bar */}
      <View style={[st.navBar, { paddingTop: insets.top }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7} style={st.navBtn}>
          <Icon name="arrow-left" size={20} color={colors.ink700} />
        </TouchableOpacity>
        <Text style={st.navTitle} numberOfLines={1}>{skill.name}</Text>
        <TouchableOpacity
          style={st.navBtn}
          onPress={() => {
            if (isPinned(skillId)) unpin(skillId)
            else pin({ id: skillId, name: skill.name })
          }}
          activeOpacity={0.6}>
          <Text style={{ fontSize: 18, color: isPinned(skillId) ? '#f59e0b' : colors.ink300 }}>
            {isPinned(skillId) ? '★' : '☆'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={st.navBtn}
          onPress={() => {
            Share.share({
              message: `${skill.name} - ${skill.description || ''}\nhttps://www.agentcab.ai/skills/${skill.id}`,
              url: `https://www.agentcab.ai/skills/${skill.id}`,
            })
          }}
          activeOpacity={0.6}>
          <Icon name="share-2" size={18} color={colors.ink700} />
        </TouchableOpacity>
      </View>

      {/* Scrollable Content (Hero + Body) */}
      <ScrollView ref={scrollRef} style={st.scroll} contentContainerStyle={[st.scrollContent, { paddingBottom: kbHeight > 0 ? kbHeight : 32 }]} showsVerticalScrollIndicator={false}
        refreshControl={activeTab === 'history' ? <RefreshControl refreshing={refreshingCalls} onRefresh={handleRefreshCalls} tintColor={colors.primary} colors={[colors.primary]} /> : undefined}>

        {/* Hero (scrollable) */}
        <View style={st.heroScrollable}>
          <View style={st.heroContent}>
            {skill.category ? (
              <View style={st.heroBadge}>
                <Text style={st.heroBadgeText}>{skill.category.toUpperCase()}</Text>
              </View>
            ) : null}
            <Text style={st.heroTitle} numberOfLines={2}>{skill.name}</Text>

            {skill.provider_name && (
              <TouchableOpacity
                style={st.heroAuthor}
                activeOpacity={0.7}
                onPress={() => navigation.navigate('Provider', {
                  providerId: skill.agent_id,
                  providerName: skill.provider_name,
                  providerAvatar: skill.provider_avatar_url,
                  providerBio: skill.provider_bio,
                  providerWebsite: skill.provider_website,
                  providerTwitter: skill.provider_twitter,
                  providerGithub: skill.provider_github,
                  providerLinkedin: skill.provider_linkedin,
                  providerWechat: skill.provider_wechat_official,
                  providerYoutube: skill.provider_youtube,
                  providerBilibili: skill.provider_bilibili,
                })}
              >
                {skill.provider_avatar_url && skill.provider_avatar_url.length > 0 ? (
                  <Image source={{ uri: skill.provider_avatar_url.startsWith('http') ? skill.provider_avatar_url : `${SITE_URL}${skill.provider_avatar_url}` }} style={st.heroAuthorAvatar} />
                ) : (
                  <View style={st.heroAuthorAvatarFallback}>
                    <Text style={{ fontSize: 10, fontWeight: fontWeight.bold, color: colors.ink500 }}>{skill.provider_name.charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                <Text style={st.heroAuthorName}>{skill.provider_name}</Text>
                {skill.provider_skill_count ? (
                  <Text style={st.heroAuthorMeta}> · {skill.provider_skill_count} {lang === 'zh' ? '个分身' : 'clones'}</Text>
                ) : null}
                <Icon name="chevron-right" size={12} color={colors.ink300} />
              </TouchableOpacity>
            )}
          </View>

          <View style={st.statsRow}>
            <View style={st.statPill}>
              <Text style={st.statValue}>{skill.call_count}</Text>
              <Text style={st.statLabel}>{t.calls}</Text>
            </View>
            {skill.call_count > 5 && skill.success_count != null && (
              <View style={st.statPill}>
                <Text style={st.statValue}>{Math.round((skill.success_count / skill.call_count) * 100)}%</Text>
                <Text style={st.statLabel}>{lang === 'zh' ? '成功' : 'Success'}</Text>
              </View>
            )}
            <View style={st.statPill}>
              <Text style={[st.statValue, { color: '#fbbf24' }]}>{skill.rating > 0 ? skill.rating.toFixed(1) : '—'}</Text>
              <Text style={st.statLabel}>{lang === 'zh' ? '评分' : 'Rating'}</Text>
            </View>
            {skill.avg_response_time && (() => {
              const sec = parseFloat(skill.avg_response_time.replace('~', '').replace('s', ''))
              const label = sec < 60 ? `~${Math.round(sec)}s` : `~${Math.round(sec / 60)}min`
              return (
                <View style={st.statPill}>
                  <Text style={st.statValue}>{label}</Text>
                  <Text style={st.statLabel}>{lang === 'zh' ? '耗时' : 'Speed'}</Text>
                </View>
              )
            })()}
          </View>
        </View>

        {/* Segmented control */}
        <View style={st.segmentWrap}>
          <TouchableOpacity
            style={[st.segment, activeTab === 'use' && st.segmentActive]}
            onPress={() => setActiveTab('use')} activeOpacity={0.7}>
            <Text style={[st.segmentText, activeTab === 'use' && st.segmentTextActive]}>{t.use}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[st.segment, activeTab === 'history' && st.segmentActive]}
            onPress={() => {
              setActiveTab('history')
              if (callsPage === 0 && !loadingCalls) {
                setLoadingCalls(true)
                const callsCacheKey = `skill_calls_${skillId}`
                // Load from cache first
                storage.getStringAsync(callsCacheKey).then(cached => {
                  if (cached) {
                    try {
                      const parsed = JSON.parse(cached)
                      setMyCalls(parsed.items)
                      setCallsPage(1)
                      setCallsHasMore(parsed.items.length === 20)
                    } catch {}
                  }
                }).catch(() => {})
                // Fetch fresh in background
                fetchCalls(1, 20, undefined, skillId).then(r => {
                  setMyCalls(r.items)
                  setCallsPage(1)
                  setCallsHasMore(r.items.length === 20)
                  storage.setStringAsync(callsCacheKey, JSON.stringify({ items: r.items })).catch(() => {})
                }).catch(() => {}).finally(() => setLoadingCalls(false))
              }
            }} activeOpacity={0.7}>
            <Text style={[st.segmentText, activeTab === 'history' && st.segmentTextActive]}>
              {lang === 'zh' ? '记录' : 'History'}
            </Text>
          </TouchableOpacity>
          {hasExample && (
            <TouchableOpacity
              style={[st.segment, activeTab === 'example' && st.segmentActive]}
              onPress={() => setActiveTab('example')} activeOpacity={0.7}>
              <Text style={[st.segmentText, activeTab === 'example' && st.segmentTextActive]}>{t.example}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[st.segment, activeTab === 'reviews' && st.segmentActive]}
            onPress={() => setActiveTab('reviews')} activeOpacity={0.7}>
            <Text style={[st.segmentText, activeTab === 'reviews' && st.segmentTextActive]}>
              {t.reviews}{reviewsTotal > 0 ? ` (${reviewsTotal})` : ''}
            </Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'use' ? (
          <>
            {/* Description */}
            {skill.description ? <Text style={st.desc}>{skill.description}</Text> : null}

            {/* Price + Balance */}
            <View style={st.priceCardShadow}>
            <View style={st.priceCard}>
              <LinearGradient colors={['#eff6ff', '#dbeafe']} style={st.priceLeft}>
                <View style={st.pricePad}>
                  <Text style={st.priceLabel}>{t.price}</Text>
                  <Text style={st.priceValue}>{skill.price_credits}{skill.max_price_credits ? <Text style={st.priceRange}>–{skill.max_price_credits}</Text> : null}</Text>
                  <Text style={st.priceUnit}>{t.credits}</Text>
                </View>
              </LinearGradient>
              <View style={st.priceRight}>
                <View style={st.pricePad}>
                  <Text style={st.priceLabel}>{t.yourBalance}</Text>
                  <Text style={[st.balanceValue, balance !== null && balance < skill.price_credits && { color: '#dc2626' }]}>
                    {balance !== null ? balance.toLocaleString() : '—'}
                  </Text>
                  <Text style={st.priceUnit}>{t.credits}</Text>
                </View>
              </View>
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
                  schema={manualSchema}
                  values={values}
                  onChange={setValues}
                  pickedFiles={pickedFiles}
                  onFilePicked={handleFilePicked}
                />
              </View>
            )}

            {/* Call + Quick Action Buttons */}
            {(() => {
              const requiredFields: string[] = (skill.input_schema as any)?.required || []
              const props = (skill.input_schema?.properties as any) || {}
              const missingManual = requiredFields.filter(key => {
                const prop = props[key]
                if (prop?.format?.startsWith('device:')) return false
                const itemFmt = prop?.items?.format || ''
                const isFile = prop?.format === 'file_id' || itemFmt === 'file_id' || key === 'file_ids' || key === 'file_id' || key === 'files' || key === 'file'
                if (isFile) return !pickedFiles[key]?.length
                return values[key] == null || values[key] === ''
              })
              const allFilled = missingManual.length === 0
              return (
                <>
                  {/* Call Button */}
                  <View style={[st.callBtnShadow, (submitting || !allFilled) && { opacity: 0.5 }]}>
                  <TouchableOpacity
                    style={st.callBtnWrap}
                    onPress={() => {
                      if (!allFilled) { showModal(t.missing, lang === 'zh' ? '请先填写所有必填参数' : 'Please fill all required fields first'); return }
                      handleSubmit()
                    }}
                    disabled={submitting} activeOpacity={0.85}>
                    <LinearGradient colors={allFilled ? ['#2563eb', '#1e40af'] : ['#94a3b8', '#94a3b8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.callBtn}>
                      <View style={st.callBtnInner}>
                        {submitting
                          ? uploadProgress
                            ? <Text style={st.callBtnText}>Uploading {uploadProgress.current}/{uploadProgress.total}...</Text>
                            : <><ActivityIndicator color="#fff" size="small" /><Text style={[st.callBtnText, { marginLeft: 8 }]}>Calling...</Text></>
                          : <Text style={st.callBtnText}>{t.callApi} · {skill.price_credits}{skill.max_price_credits ? `–${skill.max_price_credits}` : ''} {t.credits}</Text>}
                      </View>
                    </LinearGradient>
                  </TouchableOpacity>
                  </View>

                  {/* Collapsible quick actions */}
                  <TouchableOpacity
                    style={{ alignItems: 'center', paddingVertical: 10 }}
                    onPress={() => setShowMoreActions(!showMoreActions)}
                    activeOpacity={0.6}>
                    <Text style={{ fontSize: 12, color: colors.ink500 }}>
                      {showMoreActions ? (lang === 'zh' ? '收起' : 'Less') : (lang === 'zh' ? '更多操作' : 'More actions')} {showMoreActions ? '▲' : '▼'}
                    </Text>
                  </TouchableOpacity>

                  {showMoreActions && (
                <View style={st.secondaryBtnRow}>
                  <TouchableOpacity
                    style={[st.secondaryBtn, { flex: 1 }, !allFilled && st.secondaryBtnDisabled]}
                    onPress={() => {
                      if (!allFilled) { showModal(t.missing, lang === 'zh' ? '请先填写所有必填参数' : 'Please fill all required fields first'); return }
                      // Check if skill has file_id fields — ask user for input mode
                      const allProps = skill.input_schema?.properties as Record<string, any> || {}
                      const hasFileField = Object.entries(allProps).some(([k, p]: [string, any]) => {
                        const fmt = p?.format || ''
                        const itemFmt = p?.items?.format || ''
                        return fmt === 'file_id' || itemFmt === 'file_id' || k === 'file_ids' || k === 'file_id'
                      })
                      if (hasFileField) {
                        showModal(
                          lang === 'zh' ? '文件获取方式' : 'File Input Mode',
                          lang === 'zh' ? '快捷调用时如何获取文件？' : 'How to get the file when quick running?',
                          [
                            { text: lang === 'zh' ? '拍照' : 'Camera', onPress: () => {
                              pin({ id: skillId, name: skill.name, presetValues: values, isShortcut: true, fileInputMode: 'camera' })
                              setTimeout(() => showModal(lang === 'zh' ? '快捷方式已创建' : 'Shortcut Created', lang === 'zh' ? '点击时将直接打开相机' : 'Will open camera on tap'), 300)
                            }},
                            { text: lang === 'zh' ? '相册' : 'Gallery', onPress: () => {
                              pin({ id: skillId, name: skill.name, presetValues: values, isShortcut: true, fileInputMode: 'gallery' })
                              setTimeout(() => showModal(lang === 'zh' ? '快捷方式已创建' : 'Shortcut Created', lang === 'zh' ? '点击时将打开相册选择' : 'Will open gallery on tap'), 300)
                            }},
                          ],
                        )
                      } else {
                        pin({ id: skillId, name: skill.name, presetValues: values, isShortcut: true })
                        showModal(
                          lang === 'zh' ? '快捷方式已创建' : 'Shortcut Created',
                          lang === 'zh' ? '已保存到首页快捷操作，点击即可一键调用' : 'Saved to Home quick actions with current parameters',
                        )
                      }
                    }}
                    activeOpacity={0.7}>
                    <Text style={[st.secondaryBtnText, !allFilled && st.secondaryBtnTextDisabled]}>{lang === 'zh' ? '创建快捷方式' : 'Create Shortcut'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[st.secondaryBtn, { flex: 1 }, !allFilled && st.secondaryBtnDisabled]}
                    onPress={() => {
                      if (!allFilled) { showModal(t.missing, lang === 'zh' ? '请先填写所有必填参数' : 'Please fill all required fields first'); return }
                      navigation.navigate('CreateAutomation', {
                        preSelectedSkill: skill,
                        preInputValues: values,
                      })
                    }}
                    activeOpacity={0.7}>
                    <Text style={[st.secondaryBtnText, !allFilled && st.secondaryBtnTextDisabled]}>{t.createAutomation}</Text>
                  </TouchableOpacity>
                </View>
                  )}
                </>
              )
            })()}
          </>
        ) : activeTab === 'history' ? (
          <>
            {loadingCalls ? (
              <View style={{ alignItems: 'center', paddingVertical: 48 }}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : myCalls.length > 0 ? myCalls.map((call) => {
              const isOk = call.status === 'success' || call.status === 'completed'
              const isFail = call.status === 'failed'
              const accentColor = isOk ? '#059669' : isFail ? '#dc2626' : '#2563eb'
              const time = new Date(call.started_at)
              const timeStr = time.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }) + ' ' + time.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
              return (
                <TouchableOpacity
                  key={call.id}
                  style={[st.historyCard, { borderLeftWidth: 3, borderLeftColor: accentColor }]}
                  activeOpacity={0.7}
                  onPress={() => navigation.navigate('TaskResult', { taskId: call.id })}>
                  <View style={st.historyTop}>
                    <View style={[st.historyIcon, { backgroundColor: isOk ? '#ecfdf5' : isFail ? '#fef2f2' : '#eff6ff' }]}>
                      <Text style={{ fontSize: 12, fontWeight: fontWeight.bold, color: accentColor }}>{isOk ? '✓' : isFail ? '✕' : '↻'}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={st.historyId}>#{call.id.slice(0, 8)}</Text>
                    </View>
                    <View style={[st.historyStatus, { backgroundColor: isOk ? '#ecfdf5' : isFail ? '#fef2f2' : '#eff6ff' }]}>
                      <Text style={{ fontSize: 11, fontWeight: fontWeight.semibold, color: accentColor }}>
                        {isOk ? (lang === 'zh' ? '完成' : 'Done') : isFail ? (lang === 'zh' ? '失败' : 'Failed') : (lang === 'zh' ? '进行中' : 'Running')}
                      </Text>
                    </View>
                  </View>
                  <View style={st.historyBottom}>
                    <View style={st.historyMeta}>
                      <Icon name="zap" size={11} color={colors.ink500} />
                      <Text style={st.historyMetaText}>{call.credits_cost}c</Text>
                    </View>
                    {call.duration_ms != null && (
                      <View style={st.historyMeta}>
                        <Icon name="clock" size={11} color={colors.ink500} />
                        <Text style={st.historyMetaText}>{(call.duration_ms / 1000).toFixed(1)}s</Text>
                      </View>
                    )}
                    <View style={[st.historyMeta, { marginLeft: 'auto' }]}>
                      <Icon name="calendar" size={11} color={colors.ink500} />
                      <Text style={st.historyMetaText}>{timeStr}</Text>
                    </View>
                  </View>
                  {call.error_message && (
                    <View style={st.historyError}>
                      <Text style={st.historyErrorText} numberOfLines={2}>{call.error_message}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              )
            }) : (
              <View style={{ alignItems: 'center', paddingVertical: 48 }}>
                <Icon name="inbox" size={36} color={colors.ink300} />
                <Text style={{ fontSize: 14, color: colors.ink400, marginTop: 12 }}>{lang === 'zh' ? '暂无调用记录' : 'No calls yet'}</Text>
              </View>
            )}
            {myCalls.length > 0 && callsHasMore && !loadingCalls && (
              <TouchableOpacity
                style={{ alignItems: 'center', paddingVertical: 14 }}
                activeOpacity={0.6}
                onPress={() => {
                  if (loadingMoreCalls) return
                  setLoadingMoreCalls(true)
                  fetchCalls(callsPage + 1, 20, undefined, skillId).then(r => {
                    setMyCalls(prev => [...prev, ...r.items])
                    setCallsPage(p => p + 1)
                    setCallsHasMore(r.items.length === 20)
                  }).catch(() => {}).finally(() => setLoadingMoreCalls(false))
                }}>
                {loadingMoreCalls ? (
                  <ActivityIndicator color={colors.primary} size="small" />
                ) : (
                  <Text style={{ fontSize: 13, color: colors.primary, fontWeight: fontWeight.semibold }}>{lang === 'zh' ? '加载更多' : 'Load more'}</Text>
                )}
              </TouchableOpacity>
            )}
          </>
        ) : activeTab === 'example' ? (
          <>
            {/* Example Input */}
            {example.input_data && (
              <CollapsibleJson title={t.input.toUpperCase()} data={example.input_data} />
            )}

            {/* Example Output — beautified like TaskResult */}
            {(example.output_data || example.output) && (() => {
              const exOutput = example.output_data || example.output
              const isObj = typeof exOutput === 'object' && exOutput !== null

              // Extract key fields for display
              const summary = isObj ? (exOutput.coach_summary || exOutput.message || exOutput.one_liner || '') : ''
              const grade = isObj ? exOutput.grade : null
              const roasts = isObj ? exOutput.roasts : null
              const vocabulary = isObj ? exOutput.vocabulary : null
              const cardText = isObj ? exOutput.card_text : null

              return (
                <View style={st.exSection}>
                  <Text style={st.exLabel}>{t.output.toUpperCase()}</Text>
                  {summary ? <Text style={{ fontSize: 15, color: colors.ink700, lineHeight: 22, marginBottom: 10 }}>{summary}</Text> : null}
                  {grade ? <View style={{ backgroundColor: colors.primary50, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, alignSelf: 'flex-start', marginBottom: 10 }}><Text style={{ fontSize: 20, fontWeight: '800', color: colors.primary }}>{grade}</Text></View> : null}
                  {cardText ? <Text style={{ fontSize: 13, color: colors.ink600, lineHeight: 20, marginBottom: 10 }}>{cardText}</Text> : null}
                  {roasts && Array.isArray(roasts) ? roasts.slice(0, 3).map((r: string, i: number) => (
                    <Text key={i} style={{ fontSize: 13, color: colors.ink600, lineHeight: 19, marginBottom: 6 }}>• {r}</Text>
                  )) : null}
                  {vocabulary && Array.isArray(vocabulary) ? vocabulary.slice(0, 5).map((v: any, i: number) => (
                    <Text key={i} style={{ fontSize: 13, color: colors.ink600, marginBottom: 4 }}>{v.target || v.name_target} — {v.zh || v.name_zh}</Text>
                  )) : null}
                  {!summary && !grade && !cardText && (
                    <CollapsibleJson title={t.output.toUpperCase()} data={exOutput} />
                  )}
                </View>
              )
            })()}

            {/* Example Files — with preview */}
            {exampleFiles.length > 0 && (
              <ExampleFilesSection files={exampleFiles} skillId={skillId} />
            )}

            {example.duration_ms != null && (
              <Text style={st.exMeta}>{(example.duration_ms / 1000).toFixed(1)}s · {example.status}</Text>
            )}
          </>
        ) : activeTab === 'reviews' ? (
          <>
            {skill.rating > 0 && (
              <View style={{ alignItems: 'center', marginBottom: 20 }}>
                <Text style={{ fontSize: 48, fontWeight: fontWeight.extrabold, color: colors.ink950, letterSpacing: -2 }}>{skill.rating.toFixed(1)}</Text>
                <Text style={{ fontSize: 20, color: '#fbbf24', marginTop: 2 }}>{'★'.repeat(Math.round(skill.rating)) + '☆'.repeat(5 - Math.round(skill.rating))}</Text>
                <Text style={{ fontSize: 13, color: colors.ink500, marginTop: 4 }}>{reviewsTotal} {t.reviews}</Text>
              </View>
            )}
            {reviews.length > 0 ? reviews.map(review => (
              <ReviewCard key={review.id} review={review} />
            )) : (
              <Text style={st.noReviews}>{t.noReviews}</Text>
            )}
          </>
        ) : null}
        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Call button removed from sticky footer — now inside ScrollView */}
    </View>
  )
}

function CollapsibleJson({ title, data }: { title: string; data: any }) {
  const [expanded, setExpanded] = React.useState(false)
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2)
  const isLong = text.length > 500

  return (
    <View style={st.exSection}>
      <TouchableOpacity
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.6}>
        <Text style={st.exLabel}>{title}</Text>
        <Text style={{ fontSize: 12, color: colors.ink400 }}>{expanded ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {expanded && (
        <View style={st.codeBlock}>
          <Text style={st.codeText}>{text}</Text>
        </View>
      )}
      {!expanded && isLong && (
        <View style={st.codeBlock}>
          <Text style={st.codeText} numberOfLines={3}>{text}</Text>
        </View>
      )}
      {!expanded && !isLong && (
        <View style={st.codeBlock}>
          <Text style={st.codeText}>{text}</Text>
        </View>
      )}
    </View>
  )
}

function ExampleFilesSection({ files, skillId }: { files: any[]; skillId: string }) {
  const { t } = useI18n()
  const [preview, setPreview] = useState<{ uri: string; filename: string; type: 'image' | 'pdf' | 'html' | 'md'; content?: string } | null>(null)
  const [loading, setLoading] = useState('')
  const [progress, setProgress] = useState(0)

  const openPreview = async (fileUrl: string, filename: string, type: 'image' | 'pdf' | 'html' | 'md') => {
    if (type === 'md') {
      setLoading(filename)
      try {
        const res = await fetch(fileUrl)
        const text = await res.text()
        setPreview({ uri: '', filename, type: 'md', content: text })
      } catch {} finally { setLoading('') }
      return
    }
    // PDF/HTML: download locally first
    if (type === 'html') {
      setLoading(filename)
      setProgress(0)
      try {
        const RNBU = require('react-native-blob-util'); const ReactNativeBlobUtil = RNBU.default || RNBU
        const cachePath = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/example_${filename.replace(/[^a-zA-Z0-9.]/g, '_')}`
        const exists = await ReactNativeBlobUtil.fs.exists(cachePath)
        if (!exists) {
          console.log('[Preview] downloading HTML:', fileUrl)
          await ReactNativeBlobUtil.config({ path: cachePath })
            .fetch('GET', fileUrl)
            .progress((received: number, total: number) => {
              if (total > 0) setProgress(Math.round(received / total * 100))
            })
        }
        setPreview({ uri: 'file://' + cachePath, filename, type: 'html' })
      } catch (e: any) { console.log('[Preview] HTML error:', e?.message) } finally { setLoading(''); setProgress(0) }
      return
    }
    if (type === 'pdf') {
      setLoading(filename)
      setProgress(0)
      try {
        const RNBU = require('react-native-blob-util'); const ReactNativeBlobUtil = RNBU.default || RNBU
        const cachePath = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/example_${filename.replace(/[^a-zA-Z0-9.]/g, '_')}`
        const exists = await ReactNativeBlobUtil.fs.exists(cachePath)
        if (!exists) {
          await ReactNativeBlobUtil.config({ path: cachePath })
            .fetch('GET', fileUrl)
            .progress((received: number, total: number) => {
              if (total > 0) setProgress(Math.round(received / total * 100))
            })
        }
        setPreview({ uri: cachePath, filename, type: 'pdf' })
      } catch {} finally { setLoading(''); setProgress(0) }
      return
    }
    setPreview({ uri: fileUrl, filename, type })
  }

  return (
    <View style={st.exSection}>
      <Text style={st.exLabel}>{t.files}</Text>
      {files.map(f => {
        const fileUrl = `${SITE_URL}/v1/skills/${skillId}/example/files/${f.file_id}`
        const isImg = isImageFile(f.mime_type, f.filename)
        const isPdf_ = isPdfFile(f.mime_type, f.filename)
        const isHtml_ = isHtmlFile(f.mime_type, f.filename)
        const isMd = f.filename?.endsWith('.md') || f.mime_type === 'text/markdown'
        const canPreview = isImg || isPdf_ || isHtml_ || isMd

        return (
          <View key={f.file_id}>
            {isImg && (
              <TouchableOpacity activeOpacity={0.8} onPress={() => openPreview(fileUrl, f.filename, 'image')}>
                <Image
                  source={{ uri: fileUrl }}
                  style={{ width: '100%', height: 200, borderRadius: 8, marginBottom: 8, backgroundColor: '#f1f5f9' }}
                  resizeMode="contain"
                />
              </TouchableOpacity>
            )}
            {(isPdf_ || isHtml_ || isMd) && (
              <TouchableOpacity
                style={{ height: 80, borderRadius: 8, marginBottom: 8, backgroundColor: '#f8fafc', justifyContent: 'center', alignItems: 'center' }}
                activeOpacity={0.7}
                onPress={() => openPreview(fileUrl, f.filename, isPdf_ ? 'pdf' : isMd ? 'md' : 'html')}>
                {loading === f.filename ? (
                  <>
                    <ActivityIndicator color={colors.primary} />
                    {progress > 0 && <Text style={{ color: colors.primary, fontSize: 12, marginTop: 4 }}>{progress}%</Text>}
                  </>
                ) : (
                  <>
                    <Icon name={isPdf_ ? 'file-text' : isMd ? 'file' : 'globe'} size={28} color={colors.ink400} />
                    <Text style={{ color: colors.primary, fontSize: 12, marginTop: 4 }}>{isChinese() ? '点击预览' : 'Tap to preview'}</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
            <View style={st.fileRow}>
              <View style={{ flex: 1 }}>
                <Text style={st.fileName}>{f.filename}</Text>
                <Text style={st.fileMeta}>{f.file_type} · {f.mime_type}</Text>
              </View>
              {!isImg && !isPdf_ && !isHtml_ && !isMd && (
                <DownloadButton url={fileUrl} filename={f.filename} mimeType={f.mime_type} />
              )}
            </View>
          </View>
        )
      })}

      {/* Preview modals */}
      {preview?.type === 'image' && (
        <ImagePreview visible uri={preview.uri} filename={preview.filename} onClose={() => setPreview(null)} />
      )}
      {preview?.type === 'pdf' && (
        <PdfPreview visible uri={preview.uri} filename={preview.filename} onClose={() => setPreview(null)} />
      )}
      {(preview?.type === 'html' || preview?.type === 'md') && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setPreview(null)}>
          <View style={{ flex: 1, backgroundColor: '#fff' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: 48, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}>
              <TouchableOpacity onPress={() => setPreview(null)}><Icon name="x" size={24} color={colors.ink700} /></TouchableOpacity>
              <Text style={{ flex: 1, marginLeft: 12, fontSize: 16, fontWeight: '500', color: colors.ink950 }} numberOfLines={1}>{preview.filename}</Text>
            </View>
            {preview.type === 'html' ? (
              <WebView
                source={{ uri: preview.uri }}
                style={{ flex: 1 }}
                originWhitelist={['*']}
                allowFileAccess={true}
                allowFileAccessFromFileURLs={true}
                allowUniversalAccessFromFileURLs={true}
              />
            ) : (
              <ScrollView style={{ flex: 1, padding: 16 }}>
                <Text style={{ fontSize: 14, color: colors.ink700, lineHeight: 22 }}>{preview.content || ''}</Text>
              </ScrollView>
            )}
            <TouchableOpacity
              style={{ position: 'absolute', bottom: 32, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24, backgroundColor: 'rgba(0,0,0,0.5)' }}
              activeOpacity={0.7}
              onPress={async () => {
                try {
                  const RNBU = require('react-native-blob-util'); const ReactNativeBlobUtil = RNBU.default || RNBU
                  const srcPath = preview.uri.replace('file://', '')
                  const name = preview.filename || (preview.type === 'html' ? 'document.html' : 'document.md')
                  const mime = preview.type === 'html' ? 'text/html' : 'text/markdown'
                  const destPath = `${ReactNativeBlobUtil.fs.dirs.DownloadDir}/${name}`
                  const base64 = await ReactNativeBlobUtil.fs.readFile(srcPath, 'base64')
                  await ReactNativeBlobUtil.fs.writeFile(destPath, base64, 'base64')
                  await ReactNativeBlobUtil.android.actionViewIntent(destPath, mime)
                } catch (e: any) {
                  showModal(isChinese() ? '打开失败' : 'Failed')
                }
              }}>
              <Icon name="share" size={18} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 14, fontWeight: '500', textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 }}>
                {isChinese() ? '用其他应用打开' : 'Open with...'}
              </Text>
            </TouchableOpacity>
          </View>
        </Modal>
      )}
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

  // Fixed nav bar
  navBar: {
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
    zIndex: 10,
  },
  navBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navTitle: {
    flex: 1,
    color: colors.ink900,
    fontSize: 16,
    fontWeight: fontWeight.semibold,
    marginHorizontal: 12,
  },

  // Hero (scrollable, full width)
  heroScrollable: {
    paddingBottom: 16,
  },
  heroIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroContent: {
    marginBottom: 16,
    paddingHorizontal: 20,
  },
  heroBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#eff6ff',
    marginBottom: 10,
  },
  heroBadgeText: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: '#2563eb',
    letterSpacing: 1,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: fontWeight.extrabold,
    color: colors.ink900,
    letterSpacing: -0.8,
    lineHeight: 32,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 16,
  },
  statPill: {
    flex: 1,
    backgroundColor: '#eef2f7',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#dce3ed',
  },
  statValue: {
    fontSize: 16,
    fontWeight: fontWeight.bold,
    color: colors.ink900,
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 10,
    color: colors.ink600,
    fontWeight: fontWeight.medium,
    letterSpacing: 0.3,
  },

  // Segmented control
  segmentWrap: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    padding: 3,
    marginBottom: 18,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 8,
  },
  segmentActive: {
    backgroundColor: '#fff',
    ...shadows.sm,
  },
  segmentText: { fontSize: 13, fontWeight: fontWeight.semibold, color: colors.ink500 },
  segmentTextActive: { color: colors.ink950 },

  // Scroll content
  scroll: { flex: 1 },
  scrollContent: { padding: 20 },

  // Use tab
  desc: {
    fontSize: 15,
    color: colors.ink600,
    lineHeight: 23,
    marginBottom: 18,
  },

  // Hero author
  heroAuthor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  heroAuthorAvatar: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: '#e2e8f0' },
  heroAuthorAvatarFallback: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#e2e8f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroAuthorName: { fontSize: 13, fontWeight: fontWeight.medium, color: colors.ink700 },
  heroAuthorMeta: { fontSize: 12, color: colors.ink600 },

  // Price card
  priceCardShadow: {
    borderRadius: 12,
    marginBottom: 12,
    ...shadows.sm,
  },
  priceCard: {
    flexDirection: 'row',
    borderRadius: 12,
    overflow: 'hidden',
  },
  priceLeft: {
    flex: 1,
  },
  priceRight: {
    flex: 1,
    backgroundColor: '#fff',
  },
  pricePad: {
    padding: 12,
  },
  priceLabel: {
    fontSize: 9,
    color: colors.ink500,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  priceValue: { fontSize: 22, fontWeight: fontWeight.extrabold, color: '#1e40af', letterSpacing: -1 },
  priceRange: { fontSize: 16, fontWeight: fontWeight.bold, color: '#3b82f6' },
  priceUnit: { fontSize: 11, fontWeight: fontWeight.medium, color: colors.ink500, marginTop: 2 },
  balanceValue: { fontSize: 28, fontWeight: fontWeight.extrabold, color: colors.ink950, letterSpacing: -1 },

  // Tags
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  tagText: { fontSize: 12, color: colors.ink600, fontWeight: fontWeight.medium },

  // Generic card
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    ...shadows.sm,
  },

  // History tab cards (mirrors TasksScreen)
  historyCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    ...shadows.sm,
  },
  historyTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  historyIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  historyId: {
    fontSize: 12,
    color: colors.ink500,
    fontFamily: 'monospace',
    letterSpacing: 0.3,
  },
  historyStatus: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 50,
  },
  historyBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#f1f5f9',
  },
  historyMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  historyMetaText: {
    fontSize: 12,
    color: colors.ink500,
    fontWeight: fontWeight.medium,
  },
  historyError: {
    marginTop: 8,
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  historyErrorText: {
    fontSize: 12,
    color: '#dc2626',
    lineHeight: 17,
  },

  // Device data
  deviceCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    ...shadows.sm,
  },
  deviceTitle: { fontSize: 14, fontWeight: fontWeight.bold, color: colors.ink950, marginBottom: 12 },
  deviceList: { gap: 8, marginBottom: 14 },
  deviceRow: { flexDirection: 'row', alignItems: 'center' },
  deviceStatusIcon: { fontSize: 12, fontWeight: fontWeight.bold, width: 18, textAlign: 'center' },
  deviceLabel: { fontSize: 13, color: colors.ink800, flex: 1, marginLeft: 6 },
  deviceStatus: { fontSize: 11, fontWeight: fontWeight.medium },
  collectBtn: { backgroundColor: '#2563eb', borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  collectBtnDone: { backgroundColor: '#059669' },
  collectBtnText: { color: '#fff', fontSize: 13, fontWeight: fontWeight.bold },
  sectionTitle: { fontSize: 15, fontWeight: fontWeight.bold, color: colors.ink950, marginBottom: 14 },

  // CTA
  callBtnShadow: {
    borderRadius: 14,
    ...shadows.glow,
  },
  callBtnWrap: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  callBtn: {
    borderRadius: 14,
  },
  callBtnInner: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  callBtnText: { fontSize: 15, fontWeight: fontWeight.bold, color: '#fff', letterSpacing: 0.2 },

  secondaryBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  secondaryBtn: {
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryBtnText: { fontSize: 13, fontWeight: fontWeight.semibold, color: colors.ink700 },
  secondaryBtnDisabled: { borderColor: '#f1f5f9', opacity: 0.5 },
  secondaryBtnTextDisabled: { color: colors.ink400 },

  // Example tab
  exSection: { marginBottom: 16 },
  exLabel: { fontSize: 10, fontWeight: fontWeight.bold, color: colors.ink400, letterSpacing: 1, marginBottom: 8 },
  codeBlock: { backgroundColor: '#f8fafc', borderRadius: 10, padding: 14, borderWidth: 1, borderColor: '#f1f5f9' },
  codeText: { fontSize: 12, color: colors.ink800, fontFamily: 'monospace', lineHeight: 18 },
  fileRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  fileName: { fontSize: 13, fontWeight: fontWeight.semibold, color: colors.ink950 },
  fileMeta: { fontSize: 11, color: colors.ink500, marginTop: 2 },
  fileDownload: { fontSize: 13, fontWeight: fontWeight.semibold, color: '#2563eb' },
  exMeta: { fontSize: 12, color: colors.ink500 },

  // Reviews
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  ratingStars: { fontSize: 16, color: '#fbbf24' },
  ratingValue: { fontSize: 16, fontWeight: fontWeight.bold, color: colors.ink950 },
  ratingCount: { fontSize: 12, color: colors.ink500 },
  noReviews: { fontSize: 13, color: colors.ink400, textAlign: 'center', paddingVertical: 12 },
})
