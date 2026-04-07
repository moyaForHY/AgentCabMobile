import React, { useEffect, useState, useRef, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  RefreshControl,
  Animated,
  ActivityIndicator,
  Easing,
  Modal,
  TextInput,
  Alert,
  NativeModules,
  DeviceEventEmitter,
  Platform,
} from 'react-native'
import LinearGradient from 'react-native-linear-gradient'
import { colors, gradients, radii, spacing, fontSize, fontWeight, shadows } from '../utils/theme'
import { useAuth } from '../hooks/useAuth'
import { useI18n } from '../i18n'
import { fetchWallet, fetchSkills, fetchCalls, fetchSkillById, callSkill, uploadFile, type Skill } from '../services/api'
import { useCachedData } from '../hooks/useCachedData'
import { usePinnedApis } from '../hooks/usePinnedApis'
import { events, EVENT_CALL_COMPLETED, EVENT_WALLET_CHANGED } from '../services/events'
import { getRules, type AutomationRule } from '../services/automationService'
import { collectAllDeviceData, getDeviceFormats } from '../services/dataCollector'
import { takePhoto, pickPhoto, type PickedFile } from '../services/deviceCapabilities'
import { trackTask } from '../services/taskPoller'
import { taskManager } from '../services/taskManager'
import { showModal } from '../components/AppModal'
import SkillCard from '../components/SkillCard'
import { SkillCardSkeleton } from '../components/Skeleton'
import Icon from 'react-native-vector-icons/Feather'
import MIcon from 'react-native-vector-icons/MaterialCommunityIcons'
import { ScriptEngine } from '../scripting'
import { createBridge } from '../scripting/bridge'
import BackgroundService from 'react-native-background-actions'

// ─── Status Badge ────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n()
  const config: Record<string, { bg: string; text: string; labelKey: keyof typeof t; icon: string }> = {
    success:    { bg: '#ecfdf5', text: '#059669', labelKey: 'done', icon: '✓' },
    completed:  { bg: '#ecfdf5', text: '#059669', labelKey: 'done', icon: '✓' },
    failed:     { bg: '#fef2f2', text: '#dc2626', labelKey: 'failed', icon: '✕' },
    pending:    { bg: '#eff6ff', text: '#2563eb', labelKey: 'pending', icon: '○' },
    processing: { bg: '#eff6ff', text: '#2563eb', labelKey: 'running', icon: '↻' },
    running:    { bg: '#eff6ff', text: '#2563eb', labelKey: 'running', icon: '↻' },
  }
  const c = config[status] || config.pending
  return (
    <View style={[styles.statusBadge, { backgroundColor: c.bg }]}>
      <Text style={[styles.statusIcon, { color: c.text }]}>{c.icon}</Text>
      <Text style={[styles.statusLabel, { color: c.text }]}>{t[c.labelKey]}</Text>
    </View>
  )
}

// ─── Pulse Dot for running items ─────────────────────────────
function PulseDot() {
  const anim = useRef(new Animated.Value(0.3)).current
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.3, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    ).start()
  }, [anim])
  return <Animated.View style={[styles.pulseDot, { opacity: anim }]} />
}

// ─── Home Screen ─────────────────────────────────────────────
export default function HomeScreen({ navigation }: any) {
  const { user } = useAuth()
  const { t, lang } = useI18n()
  const { pinned, rename, unpin, incrementUsage } = usePinnedApis()
  const [automations, setAutomations] = useState<AutomationRule[]>([])
  const [showRenameModal, setShowRenameModal] = useState(false)
  const [renamingApi, setRenamingApi] = useState<any>(null)
  const [renameText, setRenameText] = useState('')
  const [runningShortcut, setRunningShortcut] = useState<string | null>(null)
  const engineRef = useRef<ScriptEngine | null>(null)

  const handleQuickRun = async (api: any) => {
    if (runningShortcut) return
    const uid = api.shortcutId || api.id
    setRunningShortcut(uid)
    incrementUsage(uid)

    // Script shortcut — execute .acs directly
    if (api.script) {
      try {
        const OverlayManager = NativeModules.ScriptOverlayManager
        if (Platform.OS === 'android' && OverlayManager) {
          try {
            const canDraw = await OverlayManager.canDrawOverlays()
            if (!canDraw) { await OverlayManager.requestOverlayPermission(); setRunningShortcut(null); return }
            await OverlayManager.startOverlay()
          } catch {}
        }
        const stopSub = DeviceEventEmitter.addListener('onScriptStop', () => { engineRef.current?.cancel() })
        const runScript = async () => {
          const bridge = createBridge(() => {})
          const engine = new ScriptEngine(bridge, {})
          engineRef.current = engine
          await engine.run(api.script)
          engineRef.current = null
        }
        if (Platform.OS === 'android') {
          try {
            await BackgroundService.start(runScript, {
              taskName: 'AgentCab Script',
              taskTitle: lang === 'zh' ? '脚本运行中' : 'Script Running',
              taskDesc: api.customName || api.name,
              taskIcon: { name: 'ic_launcher', type: 'mipmap' },
              color: '#2563eb',
              linkingURI: 'agentcab://',
            })
            await new Promise<void>((resolve) => {
              const check = setInterval(() => { if (!engineRef.current) { clearInterval(check); resolve() } }, 1000)
            })
            await BackgroundService.stop()
          } catch { await runScript() }
        } else {
          await runScript()
        }
        stopSub.remove()
        if (Platform.OS === 'android' && OverlayManager) { try { await OverlayManager.stopOverlay() } catch {} }
      } catch (err: any) {
        showModal(t.errorTitle, err.message || t.failed)
      } finally {
        setRunningShortcut(null)
      }
      return
    }

    try {
      const skill = await fetchSkillById(api.id)
      const formats = getDeviceFormats(skill.input_schema || {})

      // Start with preset values
      let input: Record<string, any> = { ...(api.presetValues || {}) }

      // Check if there are manual fields without preset values
      const props = skill.input_schema?.properties as Record<string, any> || {}
      const manualFields = Object.entries(props).filter(([, p]: [string, any]) => !p.format?.startsWith('device:'))
      const missingFields = manualFields.filter(([key]) => input[key] == null || input[key] === '')

      if (missingFields.length > 0) {
        // Check if all missing fields are file/photo fields — handle inline
        const allFileFields = missingFields.every(([key, prop]: [string, any]) => {
          const fmt = prop?.format || ''
          const itemFmt = prop?.items?.format || ''
          return fmt === 'file_id' || itemFmt === 'file_id' || key === 'file_ids' || key === 'file_id' || key === 'files' || key === 'file'
        })

        if (allFileFields && missingFields.length === 1) {
          const [fieldKey, fieldProp] = missingFields[0] as [string, any]

          // Use saved fileInputMode from shortcut
          const file = api.fileInputMode === 'camera' ? await takePhoto() : await pickPhoto()
          if (!file) {
            setRunningShortcut(null)
            return
          }

          // Upload in background — show toast and return to home
          setRunningShortcut(null)
          showModal(lang === 'zh' ? '正在处理' : 'Processing', lang === 'zh' ? '照片已拍摄，正在后台上传并调用...' : 'Photo captured, uploading and calling in background...')

          // Do upload + call async
          ;(async () => {
            try {
              const uploaded = await uploadFile(file.uri, file.name, file.mimeType)
              const isArray = fieldProp?.type === 'array'
              input[fieldKey] = isArray ? [uploaded.file_id] : uploaded.file_id

              if (formats.length > 0) {
                const deviceData = await collectAllDeviceData(skill.input_schema || {})
                input = { ...input, ...deviceData }
              }

              const result = await callSkill(skill.id, { input })
              taskManager.addTask(result.call_id, skill, input, result.credits_cost)
              trackTask(result.call_id)
              events.emit(EVENT_WALLET_CHANGED)
              refreshCalls()
              if (result.status === 'completed' || result.status === 'success') {
                events.emit(EVENT_CALL_COMPLETED, { call_id: result.call_id, skill_name: skill.name, status: result.status })
              }
              showModal(lang === 'zh' ? '调用成功' : 'Call Started', lang === 'zh' ? `"${skill.name}" 已提交，可在任务列表查看结果` : `"${skill.name}" submitted. Check Tasks for results.`)
            } catch (err: any) {
              showModal(t.errorTitle, err.message || t.failed)
            }
          })()
          return
        }

        // Other missing fields — navigate to detail page
        navigation.navigate('SkillDetail', { skillId: api.id, autoUse: true })
        setRunningShortcut(null)
        return
      }

      // Collect device data
      if (formats.length > 0) {
        const deviceData = await collectAllDeviceData(skill.input_schema || {})
        input = { ...input, ...deviceData }
      }

      // Call API
      const result = await callSkill(skill.id, { input })
      taskManager.addTask(result.call_id, skill, input, result.credits_cost)
      trackTask(result.call_id)
      events.emit(EVENT_WALLET_CHANGED)

      // Refresh calls list immediately
      refreshCalls()

      if (result.status === 'completed' || result.status === 'success') {
        events.emit(EVENT_CALL_COMPLETED, {
          call_id: result.call_id,
          skill_name: skill.name,
          status: result.status,
        })
      }
      showModal(lang === 'zh' ? '调用成功' : 'Call Started', lang === 'zh' ? `"${skill.name}" 已提交，可在任务列表查看结果` : `"${skill.name}" submitted. Check Tasks for results.`)
    } catch (err: any) {
      showModal(t.errorTitle, err.message || t.failed)
    } finally {
      setRunningShortcut(null)
    }
  }

  useEffect(() => { getRules().then(setAutomations) }, [])
  // Refresh automations when coming back from AutomationsScreen
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => { getRules().then(setAutomations) })
    return unsub
  }, [navigation])

  const walletFetcher = useCallback(() => fetchWallet(), [])
  const skillsFetcher = useCallback(async () => {
    const s = await fetchSkills(1, 6)
    return s.items.filter(sk => sk.status === 'published' || sk.status === 'active').slice(0, 4)
  }, [])
  const callsFetcher = useCallback(async () => {
    const c = await fetchCalls(1, 5)
    return c.items
  }, [])

  const { data: wallet, refresh: refreshWallet, refreshing: r1 } = useCachedData('home_wallet', walletFetcher, null)
  const { data: recentSkills, refresh: refreshSkills, refreshing: r2 } = useCachedData<Skill[]>('home_skills', skillsFetcher, [])
  const { data: recentCalls, refresh: refreshCalls, refreshing: r3 } = useCachedData<any[]>('home_calls', callsFetcher, [])

  const refreshing = r1 || r2 || r3
  const onRefresh = async () => {
    await Promise.all([refreshWallet(), refreshSkills(), refreshCalls()])
  }

  useEffect(() => {
    const unsub1 = events.on(EVENT_CALL_COMPLETED, () => { refreshCalls(); refreshWallet() })
    const unsub2 = events.on(EVENT_WALLET_CHANGED, () => { refreshWallet() })
    return () => { unsub1(); unsub2() }
  }, [])

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>

        {/* Balance Card */}
        <TouchableOpacity activeOpacity={0.92} onPress={() => navigation.navigate('Wallet')} style={styles.balanceCardShadow}>
          <LinearGradient
            colors={['#2563eb', '#1e40af']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.balanceCard}>
            <View style={styles.balanceCardInner}>
              <View>
                <Text style={styles.balanceLabel}>{t.balance}</Text>
                <Text style={styles.balanceAmount}>
                  {wallet?.credits != null ? Number(wallet.credits).toLocaleString() : '—'}
                </Text>
              </View>
              <View style={styles.rechargeBtn}>
                <Text style={styles.rechargeBtnText}>{t.topUp}</Text>
              </View>
            </View>
            {/* Spent / Earned */}
            {user && (
              <View style={styles.balanceStats}>
                <View style={styles.balanceStat}>
                  <Text style={styles.balanceStatLabel}>{t.spent}</Text>
                  <Text style={styles.balanceStatValue}>{Number(user.total_credits_spent || 0).toLocaleString()}</Text>
                </View>
                <View style={styles.balanceStatDivider} />
                <View style={styles.balanceStat}>
                  <Text style={styles.balanceStatLabel}>{t.earned}</Text>
                  <Text style={styles.balanceStatValue}>{Number(user.total_credits_earned || 0).toLocaleString()}</Text>
                </View>
              </View>
            )}
            {/* Decorative circles */}
            <View style={styles.decoCircle1} />
            <View style={styles.decoCircle2} />
          </LinearGradient>
        </TouchableOpacity>

        {/* Shortcuts — iOS style */}
        {pinned.filter(p => p.isShortcut).length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <View style={styles.sectionTitleBar} />
              <Text style={styles.sectionTitle}>{lang === 'zh' ? '快捷指令' : 'Shortcuts'}</Text>
            </View>
            <View style={styles.shortcutsGrid}>
              {[...pinned.filter(p => p.isShortcut)].sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0)).map((item) => {
                const defaultColors = ['#FF6482', '#FF9F0A', '#5E5CE6', '#30D158', '#BF5AF2', '#64D2FF', '#FFD60A', '#FF453A', '#2563eb', '#06b6d4']
                const name = (item.customName || item.name)
                const icon = item.icon || 'lightning-bolt'
                let bg = item.iconColor
                if (!bg) {
                  let hash = 0
                  for (let ci = 0; ci < name.length; ci++) { hash = ((hash << 5) - hash + name.charCodeAt(ci)) | 0 }
                  bg = defaultColors[Math.abs(hash) % defaultColors.length]
                }
                const uid = item.shortcutId || item.id
                const isRunning = runningShortcut === uid
                return (
                  <TouchableOpacity
                    key={uid}
                    style={styles.shortcutCard}
                    onPress={() => handleQuickRun(item)}
                    onLongPress={() => {
                      setRenamingApi(item)
                      setRenameText(item.customName || item.name)
                      setShowRenameModal(true)
                    }}
                    activeOpacity={0.7}
                    disabled={isRunning}>
                    <View style={[styles.shortcutIcon, { backgroundColor: bg }]}>
                      {isRunning ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <MIcon name={icon} size={24} color="#fff" />
                      )}
                    </View>
                    <Text style={styles.shortcutName} numberOfLines={2}>{item.customName || item.name}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>
        )}

        {/* Automations — only show when there are active ones */}
        {automations.filter(a => a.enabled).length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <View style={styles.sectionTitleBar} />
                <Text style={styles.sectionTitle}>{t.automations}</Text>
              </View>
              <TouchableOpacity onPress={() => navigation.navigate('Automations')}>
                <Text style={styles.seeAll}>{lang === 'zh' ? '管理' : 'Manage'}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.autoCardShadow}>
            <View style={styles.autoCard}>
              {automations.filter(a => a.enabled).slice(0, 3).map((rule, idx, arr) => (
                <View key={rule.id}>
                  <View style={styles.autoRow}>
                    <View style={styles.autoAccent} />
                    <View style={styles.autoDot} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.autoName} numberOfLines={1}>{rule.skillName}</Text>
                      <View style={styles.autoScheduleRow}>
                        <Icon name="clock" size={12} color={colors.ink500} style={{ marginRight: 5 }} />
                        <Text style={styles.autoSchedule}>
                          {rule.schedule.type === 'daily' ? `${t.daily} ${rule.schedule.time}` :
                           rule.schedule.type === 'weekly' ? `${t.weekly} ${rule.schedule.time}` :
                           `${t.everyXHours.replace('X', String(Math.round((rule.schedule.intervalMinutes || 60) / 60)))}` }
                          {rule.lastRun ? ` · ${t.lastRun} ${new Date(rule.lastRun).toLocaleDateString('zh-CN')}` : ''}
                        </Text>
                      </View>
                    </View>
                  </View>
                  {idx < arr.length - 1 && <View style={styles.autoDivider} />}
                </View>
              ))}
            </View>
            </View>
          </View>
        )}

        {/* Getting Started — shown when no recent calls */}
        {recentCalls.length === 0 && (
          <View style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <View style={styles.sectionTitleBar} />
              <Text style={styles.sectionTitle}>{lang === 'zh' ? '快速开始' : 'Getting Started'}</Text>
            </View>
            <View style={[styles.gettingStartedCardShadow, { marginTop: 16 }]}>
            <View style={styles.gettingStartedCard}>
              <TouchableOpacity style={styles.gsRow} activeOpacity={0.7} onPress={() => navigation.navigate('Main', { screen: 'DiscoverTab' })}>
                <View style={[styles.gsIconWrap, { backgroundColor: '#eff6ff' }]}><Icon name="grid" size={18} color="#2563eb" /></View>
                <Text style={styles.gsText}>{lang === 'zh' ? '浏览分身' : 'Browse Clones'}</Text>
                <Icon name="chevron-right" size={20} color="#94a3b8" />
              </TouchableOpacity>
              <View style={styles.gsDivider} />
              <TouchableOpacity style={styles.gsRow} activeOpacity={0.7} onPress={() => navigation.navigate('Wallet')}>
                <View style={[styles.gsIconWrap, { backgroundColor: '#ecfdf5' }]}><Icon name="credit-card" size={18} color="#059669" /></View>
                <Text style={styles.gsText}>{lang === 'zh' ? '充值积分' : 'Top up credits'}</Text>
                <Icon name="chevron-right" size={20} color="#94a3b8" />
              </TouchableOpacity>
              <View style={styles.gsDivider} />
              <TouchableOpacity style={styles.gsRow} activeOpacity={0.7} onPress={() => navigation.navigate('Main', { screen: 'ProfileTab' })}>
                <View style={[styles.gsIconWrap, { backgroundColor: '#fef3c7' }]}><Icon name="user" size={18} color="#d97706" /></View>
                <Text style={styles.gsText}>{lang === 'zh' ? '设置个人资料' : 'Set up your profile'}</Text>
                <Icon name="chevron-right" size={20} color="#94a3b8" />
              </TouchableOpacity>
            </View>
            </View>
          </View>
        )}

        {/* Recent Calls */}
        {recentCalls.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <View style={styles.sectionTitleBar} />
                <Text style={styles.sectionTitle}>{t.recent}</Text>
              </View>
              <TouchableOpacity onPress={() => navigation.navigate('Main', { screen: 'TasksTab' })}>
                <Text style={styles.seeAll}>{t.viewAll}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.callList}>
              {recentCalls.map((call, i) => (
                <View key={call.id} style={[styles.callCardShadow, i === recentCalls.length - 1 && { marginBottom: 0 }]}>
                <Pressable style={({ pressed }) => [styles.callCard, pressed && { backgroundColor: '#f0f4f8' }]} onPress={() => navigation.navigate('TaskResult', { taskId: call.id })}>
                  <View style={[styles.callAccent, {
                    backgroundColor: (call.status === 'success' || call.status === 'completed') ? '#10b981' :
                      (call.status === 'failed') ? '#ef4444' : '#3b82f6',
                  }]} />
                  <View style={styles.callMain}>
                    <View style={styles.callLeft}>
                      {call.status === 'running' || call.status === 'pending' || call.status === 'processing' ? (
                        <PulseDot />
                      ) : (
                        <View style={[
                          styles.callIcon,
                          { backgroundColor: (call.status === 'success' || call.status === 'completed') ? '#ecfdf5' : '#fef2f2' },
                        ]}>
                          <Text style={{
                            fontSize: 12,
                            fontWeight: fontWeight.bold,
                            color: (call.status === 'success' || call.status === 'completed') ? '#059669' : '#dc2626',
                          }}>
                            {(call.status === 'success' || call.status === 'completed') ? '✓' : '✕'}
                          </Text>
                        </View>
                      )}
                      <View style={styles.callInfo}>
                        <TouchableOpacity
                          activeOpacity={0.6}
                          style={{ alignSelf: 'flex-start' }}
                          onPress={() => {
                            if (call.skill_id) navigation.navigate('SkillDetail', { skillId: call.skill_id })
                          }}>
                          <Text style={[styles.callName, call.skill_id && { color: '#2563eb' }]} numberOfLines={1}>
                            {call.skill_name || t.unnamedSkill}
                          </Text>
                        </TouchableOpacity>
                        <Text style={styles.callMeta}>
                          #{call.id.slice(0, 8)} · {call.credits_cost}{t.credits}
                          {call.duration_ms ? ` · ${(call.duration_ms / 1000).toFixed(1)}s` : ''}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.callRight}>
                      <StatusBadge status={call.status} />
                      <Text style={styles.callTime}>
                        {formatTime(call.started_at, t)}
                      </Text>
                    </View>
                  </View>
                </Pressable>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Popular Clones */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <View style={styles.sectionTitleBar} />
              <Text style={styles.sectionTitle}>{t.popularApis}</Text>
            </View>
            <TouchableOpacity onPress={() => navigation.navigate('Main', { screen: 'DiscoverTab' })}>
              <Text style={styles.seeAll}>{t.browse}</Text>
            </TouchableOpacity>
          </View>
          {recentSkills.length > 0 ? (
            recentSkills.map((skill, i) => (
              <SkillCard
                key={skill.id}
                skill={skill}
                index={i}
                onPress={() => navigation.navigate('SkillDetail', { skillId: skill.id })}
              />
            ))
          ) : (
            [0, 1, 2].map(i => <SkillCardSkeleton key={i} />)
          )}
        </View>

        <View style={{ height: spacing.xl }} />
      </ScrollView>

      {/* Rename / Unpin Modal */}
      <Modal visible={showRenameModal} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowRenameModal(false)}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{renamingApi?.customName || renamingApi?.name}</Text>
            <TextInput
              style={styles.modalInput}
              value={renameText}
              onChangeText={setRenameText}
              autoFocus
              selectTextOnFocus
              placeholder={lang === 'zh' ? '输入新名称' : 'Enter new name'}
              placeholderTextColor="#94a3b8"
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={styles.modalBtnCancel}
                onPress={() => setShowRenameModal(false)}>
                <Text style={styles.modalBtnCancelText}>{lang === 'zh' ? '取消' : 'Cancel'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalBtnPrimary}
                onPress={() => {
                  if (renameText.trim()) rename(renamingApi?.shortcutId || renamingApi?.id, renameText.trim())
                  setShowRenameModal(false)
                }}>
                <Text style={styles.modalBtnPrimaryText}>{lang === 'zh' ? '保存' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.modalUnpin}
              onPress={() => { unpin(renamingApi?.shortcutId || renamingApi?.id); setShowRenameModal(false) }}>
              <Text style={styles.modalUnpinText}>{lang === 'zh' ? '移除快捷方式' : 'Remove shortcut'}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
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
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

// ─── Styles ──────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingTop: 20 },

  greeting: {
    fontSize: 28,
    fontWeight: fontWeight.extrabold,
    color: colors.ink950,
    letterSpacing: -0.8,
    marginBottom: spacing.lg,
  },

  // Balance Card
  balanceCardShadow: {
    borderRadius: radii.xl,
    marginBottom: spacing.xl,
    ...shadows.lg,
  },
  balanceCard: {
    borderRadius: radii.xl,
    overflow: 'hidden',
  },
  balanceCardInner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 1,
    padding: 22,
    paddingBottom: 16,
  },
  balanceLabel: {
    fontSize: 11,
    fontWeight: fontWeight.bold,
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 1.8,
    textTransform: 'uppercase' as any,
  },
  balanceAmount: {
    fontSize: 38,
    fontWeight: fontWeight.black,
    color: '#fff',
    marginTop: 6,
    letterSpacing: -1.5,
  },
  rechargeBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: radii.sm,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  rechargeBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.3,
  },
  decoCircle1: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.06)',
    top: -50,
    right: -30,
  },
  balanceStats: {
    flexDirection: 'row',
    paddingTop: 14,
    paddingBottom: 18,
    paddingHorizontal: 22,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.12)',
    zIndex: 1,
  },
  balanceStat: { flex: 1, alignItems: 'center' },
  balanceStatDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.12)' },
  balanceStatLabel: { fontSize: 11, color: 'rgba(255,255,255,0.55)', fontWeight: fontWeight.medium, letterSpacing: 0.5 },
  balanceStatValue: { fontSize: 17, color: '#fff', fontWeight: fontWeight.bold, marginTop: 4 },

  decoCircle2: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(255,255,255,0.04)',
    bottom: -25,
    left: 20,
  },

  // Sections
  section: { marginBottom: 30 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionTitleBar: {
    width: 4,
    height: 18,
    borderRadius: 2,
    backgroundColor: colors.primary,
    marginRight: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: fontWeight.extrabold,
    color: colors.ink950,
    letterSpacing: -0.4,
  },
  // Shortcuts — iOS style
  shortcutsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 12,
  },
  shortcutCard: {
    width: '22%' as any,
    alignItems: 'center',
  },
  shortcutIcon: {
    width: 56,
    height: 56,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  shortcutName: {
    fontSize: 11,
    fontWeight: fontWeight.medium,
    color: colors.ink700,
    textAlign: 'center',
    lineHeight: 14,
  },

  // Rename modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'center', padding: spacing.xl,
  },
  modalCard: {
    backgroundColor: colors.white, borderRadius: radii.xl, padding: spacing.lg,
    ...shadows.lg,
  },
  modalTitle: {
    fontSize: 17, fontWeight: fontWeight.bold, color: colors.ink950, marginBottom: 16,
    letterSpacing: -0.3,
  },
  modalInput: {
    backgroundColor: colors.sand100, borderRadius: radii.md, padding: 14, fontSize: 15,
    color: colors.ink950, borderWidth: 0, marginBottom: 18,
  },
  modalBtns: {
    flexDirection: 'row', gap: 12,
  },
  modalBtnCancel: {
    flex: 1, paddingVertical: 13, borderRadius: radii.md, alignItems: 'center',
    backgroundColor: colors.sand100,
  },
  modalBtnCancelText: { fontSize: 14, fontWeight: fontWeight.semibold, color: colors.ink700 },
  modalUnpin: {
    alignItems: 'center', marginTop: 18, paddingVertical: 4,
  },
  modalUnpinText: { fontSize: 13, color: colors.danger, fontWeight: fontWeight.medium },
  modalBtnPrimary: {
    flex: 1, paddingVertical: 13, borderRadius: radii.md, alignItems: 'center',
    backgroundColor: colors.primary,
    ...shadows.glow,
  },
  modalBtnPrimaryText: { fontSize: 14, fontWeight: fontWeight.bold, color: '#fff' },

  seeAll: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.1,
  },

  // Call Cards
  callList: { gap: 10 },
  callCardShadow: {
    borderRadius: radii.lg,
    marginBottom: 0,
    ...shadows.sm,
  },
  callCard: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: 16,
    overflow: 'hidden',
  },
  callAccent: {
    position: 'absolute',
    left: 0,
    top: 6,
    bottom: 6,
    width: 3,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
  },
  callMain: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  callLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 14,
  },
  callIcon: {
    width: 34,
    height: 34,
    borderRadius: radii.sm,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  callInfo: { flex: 1 },
  callName: {
    fontSize: 14,
    fontWeight: fontWeight.semibold,
    color: colors.ink900,
    letterSpacing: -0.1,
  },
  callMeta: {
    fontSize: 12,
    color: colors.ink500,
    marginTop: 3,
  },
  callRight: { alignItems: 'flex-end' },
  callTime: {
    fontSize: 11,
    color: colors.ink400,
    marginTop: 5,
  },

  // Status Badge
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radii.xs,
    gap: 4,
  },
  statusIcon: { fontSize: 10, fontWeight: fontWeight.bold },
  statusLabel: { fontSize: 11, fontWeight: fontWeight.semibold },

  // Pulse Dot
  pulseDot: {
    width: 34,
    height: 34,
    borderRadius: radii.sm,
    backgroundColor: colors.primary50,
    marginRight: 12,
    borderWidth: 2,
    borderColor: colors.primary200,
  },

  // Clone rows
  apiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  apiRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.sand100,
  },
  apiRowLeft: { flex: 1, marginRight: 12 },
  apiRowName: {
    fontSize: 14,
    fontWeight: fontWeight.semibold,
    color: colors.ink950,
  },
  apiRowDesc: {
    fontSize: 12,
    color: colors.ink500,
    marginTop: 3,
  },
  apiRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  apiPricePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
  },
  apiPriceText: {
    fontSize: 12,
    fontWeight: fontWeight.semibold,
    color: '#fff',
  },
  apiRowArrow: {
    fontSize: 20,
    color: colors.ink400,
  },

  // Automations
  autoCardShadow: {
    borderRadius: radii.lg,
    ...shadows.sm,
  },
  autoCard: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  autoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    paddingLeft: 20,
  },
  autoAccent: {
    position: 'absolute',
    left: 0,
    top: 8,
    bottom: 8,
    width: 3,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
    backgroundColor: colors.success,
  },
  autoDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
    marginRight: 14,
  },
  autoName: {
    fontSize: 14,
    fontWeight: fontWeight.semibold,
    color: colors.ink950,
    letterSpacing: -0.1,
  },
  autoScheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  autoSchedule: {
    fontSize: 12,
    color: colors.ink500,
  },
  autoDivider: {
    height: 1,
    backgroundColor: colors.sand200,
    marginLeft: 42,
    marginRight: 16,
  },
  autoEmptyCard: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    paddingVertical: 28,
    alignItems: 'center',
    ...shadows.sm,
  },
  autoEmpty: {
    fontSize: 13,
    color: colors.ink400,
    textAlign: 'center',
    fontWeight: fontWeight.medium,
  },
  autoEmptyAction: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: fontWeight.semibold,
    marginTop: 8,
  },

  // Getting Started
  gettingStartedCardShadow: {
    borderRadius: radii.lg,
    ...shadows.sm,
  },
  gettingStartedCard: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  gsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  gsIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primary50,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  gsText: {
    flex: 1,
    fontSize: 14,
    fontWeight: fontWeight.semibold,
    color: colors.ink950,
    letterSpacing: -0.1,
  },
  gsDivider: {
    height: 1,
    backgroundColor: colors.sand200,
    marginLeft: 70,
  },
})
