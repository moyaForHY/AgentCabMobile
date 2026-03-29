import React, { useEffect, useState, useRef } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Animated,
  Easing,
} from 'react-native'
import LinearGradient from 'react-native-linear-gradient'
import { colors, gradients, radii, spacing, fontSize, fontWeight } from '../utils/theme'
import { useAuth } from '../hooks/useAuth'
import { useI18n } from '../i18n'
import { fetchWallet, fetchSkills, fetchCalls, type Skill } from '../services/api'

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
  const { t } = useI18n()
  const [wallet, setWallet] = useState<any>(null)
  const [recentSkills, setRecentSkills] = useState<Skill[]>([])
  const [recentCalls, setRecentCalls] = useState<any[]>([])
  const [refreshing, setRefreshing] = useState(false)

  const load = async () => {
    try {
      const w = await fetchWallet()
      setWallet(w)
    } catch {}
    try {
      const s = await fetchSkills(1, 6)
      setRecentSkills(s.items.filter(sk => sk.status === 'published' || sk.status === 'active').slice(0, 4))
    } catch {}
    try {
      const c = await fetchCalls(1, 5)
      setRecentCalls(c.items)
    } catch {}
  }

  useEffect(() => { load() }, [])

  const onRefresh = async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

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
