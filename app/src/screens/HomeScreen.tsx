import React, { useEffect, useState, useRef, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Animated,
  Easing,
  Modal,
  TextInput,
  Alert,
} from 'react-native'
import LinearGradient from 'react-native-linear-gradient'
import { colors, gradients, radii, spacing, fontSize, fontWeight } from '../utils/theme'
import { useAuth } from '../hooks/useAuth'
import { useI18n } from '../i18n'
import { fetchWallet, fetchSkills, fetchCalls, type Skill } from '../services/api'
import { useCachedData } from '../hooks/useCachedData'
import { usePinnedApis } from '../hooks/usePinnedApis'
import { events, EVENT_CALL_COMPLETED, EVENT_WALLET_CHANGED } from '../services/events'

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
  const { pinned, rename, unpin } = usePinnedApis()
  const [showRenameModal, setShowRenameModal] = useState(false)
  const [renamingApi, setRenamingApi] = useState<any>(null)
  const [renameText, setRenameText] = useState('')

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
        <TouchableOpacity activeOpacity={0.92} onPress={() => navigation.navigate('Wallet')}>
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

        {/* Pinned APIs — Shortcuts style */}
        {pinned.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{lang === 'zh' ? '快捷操作' : 'Quick Actions'}</Text>
            <View style={styles.pinnedGrid}>
              {pinned.map((api, i) => {
                const colors = [
                  ['#3b82f6', '#2563eb'], ['#f97316', '#ea580c'], ['#8b5cf6', '#7c3aed'],
                  ['#10b981', '#059669'], ['#ec4899', '#db2777'], ['#06b6d4', '#0891b2'],
                  ['#f59e0b', '#d97706'], ['#ef4444', '#dc2626'],
                ]
                const [c1, c2] = colors[i % colors.length]
                return (
                  <TouchableOpacity
                    key={api.id}
                    style={styles.pinnedCard}
                    onPress={() => navigation.navigate('SkillDetail', { skillId: api.id, autoUse: true })}
                    onLongPress={() => {
                      setRenamingApi(api)
                      setRenameText(api.customName || api.name)
                      setShowRenameModal(true)
                    }}
                    activeOpacity={0.8}>
                    <LinearGradient
                      colors={[c1, c2]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.pinnedGradient}>
                      <Text style={styles.pinnedIcon}>▶</Text>
                      <Text style={styles.pinnedName} numberOfLines={2}>{api.customName || api.name}</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>
        )}

        {/* Recent Calls */}
        {recentCalls.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{t.recent}</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Main', { screen: 'TasksTab' })}>
                <Text style={styles.seeAll}>{t.viewAll}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.callList}>
              {recentCalls.map((call, i) => (
                <TouchableOpacity key={call.id} style={[styles.callCard, i === recentCalls.length - 1 && { marginBottom: 0 }]} onPress={() => navigation.navigate('TaskResult', { taskId: call.id })} activeOpacity={0.7}>
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
                        <Text style={styles.callName} numberOfLines={1}>
                          {call.skill_name || t.unnamedSkill}
                        </Text>
                        <Text style={styles.callMeta}>
                          {call.credits_cost} {t.credits}
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
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Popular APIs */}
        {recentSkills.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{t.popularApis}</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Main', { screen: 'DiscoverTab' })}>
                <Text style={styles.seeAll}>{t.browse}</Text>
              </TouchableOpacity>
            </View>
            {recentSkills.map((skill, i) => (
              <TouchableOpacity
                key={skill.id}
                style={[styles.apiRow, i < recentSkills.length - 1 && styles.apiRowBorder]}
                onPress={() => navigation.navigate('SkillDetail', { skillId: skill.id })}
                activeOpacity={0.7}>
                <View style={styles.apiRowLeft}>
                  <Text style={styles.apiRowName} numberOfLines={1}>{skill.name}</Text>
                  <Text style={styles.apiRowDesc} numberOfLines={1}>
                    {skill.description || skill.category || 'AI API'}
                  </Text>
                </View>
                <View style={styles.apiRowRight}>
                  <View style={styles.apiPricePill}>
                    <Text style={styles.apiPriceText}>{skill.price_credits}c</Text>
                  </View>
                  <Text style={styles.apiRowArrow}>›</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

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
                  if (renameText.trim()) rename(renamingApi?.id, renameText.trim())
                  setShowRenameModal(false)
                }}>
                <Text style={styles.modalBtnPrimaryText}>{lang === 'zh' ? '保存' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.modalUnpin}
              onPress={() => { unpin(renamingApi?.id); setShowRenameModal(false) }}>
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
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 20, paddingTop: 16 },

  greeting: {
    fontSize: 26,
    fontWeight: fontWeight.extrabold,
    color: colors.ink950,
    letterSpacing: -0.8,
    marginBottom: 20,
  },

  // Balance Card
  balanceCard: {
    borderRadius: 20,
    padding: 24,
    marginBottom: 28,
    overflow: 'hidden',
  },
  balanceCardInner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 1,
  },
  balanceLabel: {
    fontSize: 11,
    fontWeight: fontWeight.bold,
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 1.5,
  },
  balanceAmount: {
    fontSize: 36,
    fontWeight: fontWeight.extrabold,
    color: '#fff',
    marginTop: 4,
    letterSpacing: -1.5,
  },
  rechargeBtn: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  rechargeBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: fontWeight.bold,
  },
  decoCircle1: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.06)',
    top: -40,
    right: -20,
  },
  balanceStats: {
    flexDirection: 'row',
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.15)',
    zIndex: 1,
  },
  balanceStat: { flex: 1, alignItems: 'center' },
  balanceStatDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.15)' },
  balanceStatLabel: { fontSize: 11, color: 'rgba(255,255,255,0.55)', fontWeight: fontWeight.medium },
  balanceStatValue: { fontSize: 16, color: '#fff', fontWeight: fontWeight.bold, marginTop: 2 },

  decoCircle2: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.04)',
    bottom: -20,
    left: 30,
  },

  // Sections
  section: { marginBottom: 24 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: fontWeight.bold,
    color: colors.ink950,
    letterSpacing: -0.3,
  },
  // Pinned — iOS Shortcuts style
  pinnedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10,
  },
  pinnedCard: {
    width: '48%' as any,
    borderRadius: 16,
    overflow: 'hidden',
  },
  pinnedGradient: {
    padding: 16,
    minHeight: 80,
    justifyContent: 'flex-end',
  },
  pinnedIcon: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 8,
  },
  pinnedName: {
    fontSize: 14,
    fontWeight: fontWeight.bold,
    color: '#fff',
    lineHeight: 18,
  },

  // Rename modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 32,
  },
  modalCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 20,
  },
  modalTitle: {
    fontSize: 16, fontWeight: fontWeight.bold, color: colors.ink950, marginBottom: 14,
  },
  modalInput: {
    backgroundColor: '#f1f5f9', borderRadius: 10, padding: 12, fontSize: 15,
    color: colors.ink950, borderWidth: 1, borderColor: 'rgba(37,99,235,0.1)', marginBottom: 16,
  },
  modalBtns: {
    flexDirection: 'row', gap: 10,
  },
  modalBtnCancel: {
    flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: 'center',
    backgroundColor: '#f1f5f9',
  },
  modalBtnCancelText: { fontSize: 14, fontWeight: fontWeight.semibold, color: colors.ink700 },
  modalUnpin: {
    alignItems: 'center', marginTop: 14,
  },
  modalUnpinText: { fontSize: 13, color: '#dc2626' },
  modalBtnPrimary: {
    flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: 'center',
    backgroundColor: '#2563eb',
  },
  modalBtnPrimaryText: { fontSize: 14, fontWeight: fontWeight.bold, color: '#fff' },

  seeAll: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: fontWeight.semibold,
  },

  // Call Cards
  callList: {},
  callCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.08)',
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
    marginRight: 12,
  },
  callIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  callInfo: { flex: 1 },
  callName: {
    fontSize: 14,
    fontWeight: fontWeight.semibold,
    color: colors.ink900,
  },
  callMeta: {
    fontSize: 12,
    color: colors.ink500,
    marginTop: 2,
  },
  callRight: { alignItems: 'flex-end' },
  callTime: {
    fontSize: 11,
    color: colors.ink400,
    marginTop: 4,
  },

  // Status Badge
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 3,
  },
  statusIcon: { fontSize: 10, fontWeight: fontWeight.bold },
  statusLabel: { fontSize: 11, fontWeight: fontWeight.semibold },

  // Pulse Dot
  pulseDot: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#eff6ff',
    marginRight: 12,
    borderWidth: 2,
    borderColor: '#bfdbfe',
  },

  // API rows
  apiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  apiRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
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
    marginTop: 2,
  },
  apiRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  apiPricePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: colors.primary,
  },
  apiPriceText: {
    fontSize: 12,
    fontWeight: fontWeight.semibold,
    color: '#fff',
  },
  apiRowArrow: {
    fontSize: 20,
    color: '#cbd5e1',
  },
})
