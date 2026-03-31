import React, { useState, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Clipboard,
} from 'react-native'
import { showModal } from '../components/AppModal'
import LinearGradient from 'react-native-linear-gradient'
import { colors, fontWeight } from '../utils/theme'
import { useAuth } from '../hooks/useAuth'
import { useI18n } from '../i18n'
import { fetchWallet, resetApiKey, fetchMySkills, type Skill } from '../services/api'
import { useCachedData } from '../hooks/useCachedData'

export default function ProfileScreen({ navigation }: any) {
  const { user, logout, refreshUser } = useAuth()
  const { t, lang, setLang } = useI18n()
  const [apiKey, setApiKey] = useState<string | null>(null)
  const [keyVisible, setKeyVisible] = useState(false)
  const [apisExpanded, setApisExpanded] = useState(false)
  const [apiFilter, setApiFilter] = useState<string>('all')

  const walletFetcher = useCallback(() => fetchWallet(), [])
  const apisFetcher = useCallback(() => fetchMySkills(), [])

  const { data: wallet, refresh: refreshWallet, refreshing: r1 } = useCachedData('home_wallet', walletFetcher, null)
  const { data: myApis, refresh: refreshApis, refreshing: r2 } = useCachedData<Skill[]>('profile_my_apis', apisFetcher, [])

  const nonDeletedApis = myApis.filter(a => a.status !== 'deleted')
  const filteredApis = apiFilter === 'all'
    ? nonDeletedApis
    : apiFilter === 'private'
    ? nonDeletedApis.filter(a => a.visibility === 'private')
    : nonDeletedApis.filter(a => a.status === apiFilter)

  // Collect unique statuses + visibility filters
  const apiStatuses = [...new Set(nonDeletedApis.map(a => a.status))]
  const filterOptions: string[] = ['all', ...apiStatuses, 'private']
  const refreshing = r1 || r2

  const onRefresh = async () => {
    await Promise.all([refreshWallet(), refreshApis(), refreshUser()])
  }

  const handleLogout = () => {
    showModal(t.logOut, t.logOutConfirm, [
      { text: t.cancel, style: 'cancel' },
      { text: t.logOut, style: 'destructive', onPress: logout },
    ])
  }

  const handleResetKey = () => {
    showModal(t.resetApiKey, t.resetApiKeyConfirm, [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.reset,
        style: 'destructive',
        onPress: async () => {
          try {
            const result = await resetApiKey()
            setApiKey(result.api_key)
            setKeyVisible(true)
            showModal(t.done, t.newKeyGenerated)
          } catch (e: any) {
            showModal(t.error, e.message)
          }
        },
      },
    ])
  }

  const handleCopyKey = () => {
    if (apiKey) {
      Clipboard.setString(apiKey)
      showModal(t.copied, t.apiKeyCopied)
    }
  }

  const toggleLanguage = () => {
    setLang(lang === 'en' ? 'zh' : 'en')
  }

  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : ''

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={s.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>

      {/* ── Identity ── */}
      <View style={s.identityRow}>
        <LinearGradient
          colors={['#2563eb', '#1e40af']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={s.avatar}>
          <Text style={s.avatarLetter}>{user?.name?.[0]?.toUpperCase() || '?'}</Text>
        </LinearGradient>
        <View style={s.identityInfo}>
          <Text style={s.userName}>{user?.name}</Text>
          <View style={s.roleBadge}>
            <Text style={s.roleText}>{user?.role?.toUpperCase() || 'CALLER'}</Text>
          </View>
        </View>
      </View>

      {/* ── Info Card ── */}
      <View style={s.card}>
        <InfoRow label={t.name} value={user?.name || ''} />
        <View style={s.divider} />
        {user?.email ? (
          <>
            <InfoRow label={t.email} value={user.email} />
            <View style={s.divider} />
          </>
        ) : null}
        {user?.phone ? (
          <>
            <InfoRow label={lang === 'zh' ? '手机号' : 'Phone'} value={user.phone} />
            <View style={s.divider} />
          </>
        ) : null}
        <InfoRow label={t.role} value={user?.role || 'caller'} />
        <View style={s.divider} />
        <InfoRow label={t.joined} value={memberSince} />
      </View>

      {/* ── Stats ── */}
      <View style={s.statsCard}>
        <StatItem label={t.balance} value={wallet?.credits != null ? Number(wallet.credits).toLocaleString() : '—'} highlight />
        <View style={s.statDivider} />
        <StatItem label={t.spent} value={Number(user?.total_credits_spent || 0).toLocaleString()} />
        <View style={s.statDivider} />
        <StatItem label={t.earned} value={Number(user?.total_credits_earned || 0).toLocaleString()} />
      </View>

      {/* ── Recharge / Withdraw ── */}
      <View style={s.actionRow}>
        <TouchableOpacity
          style={s.actionBtn}
          onPress={() => navigation.navigate('Wallet')}
          activeOpacity={0.7}>
          <LinearGradient colors={['#2563eb', '#1e40af']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.actionBtnGradient}>
            <Text style={s.actionBtnText}>{t.recharge}</Text>
          </LinearGradient>
        </TouchableOpacity>
        <TouchableOpacity
          style={s.actionBtnOutline}
          onPress={() => navigation.navigate('Wallet')}
          activeOpacity={0.7}>
          <Text style={s.actionBtnOutlineText}>{t.withdraw}</Text>
        </TouchableOpacity>
      </View>

      {/* ── My APIs ── */}
      {nonDeletedApis.length > 0 && (
        <View style={s.card}>
          <TouchableOpacity style={s.myApiHeader} onPress={() => setApisExpanded(!apisExpanded)} activeOpacity={0.7}>
            <Text style={s.myApiTitle}>{t.myApis} ({nonDeletedApis.length})</Text>
            <Text style={s.expandArrow}>{apisExpanded ? '▲' : '▼'}</Text>
          </TouchableOpacity>
          {apisExpanded && filterOptions.length > 2 && (
            <View style={s.apiFilterRow}>
              {filterOptions.map(st => {
                const count = st === 'all' ? nonDeletedApis.length
                  : st === 'private' ? nonDeletedApis.filter(a => a.visibility === 'private').length
                  : nonDeletedApis.filter(a => a.status === st).length
                return (
                  <TouchableOpacity
                    key={st}
                    style={[s.apiFilterChip, apiFilter === st && s.apiFilterChipActive]}
                    onPress={() => setApiFilter(st)}
                    activeOpacity={0.7}>
                    <Text style={[s.apiFilterText, apiFilter === st && s.apiFilterTextActive]}>
                      {st === 'all' ? t.allFilter : st === 'published' || st === 'active' ? t.published : st === 'draft' ? t.draft : st === 'private' ? t.private : st} {count}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          )}
          {apisExpanded && filteredApis.map((api, i) => (
            <TouchableOpacity
              key={api.id}
              style={[s.myApiRow, i < filteredApis.length - 1 && s.myApiRowBorder]}
              onPress={() => navigation.navigate('SkillDetail', { skillId: api.id })}
              activeOpacity={0.6}>
              <View style={s.myApiLeft}>
                <Text style={s.myApiName} numberOfLines={1}>{api.name}</Text>
                <Text style={s.myApiMeta}>{api.call_count} {t.calls} · {api.price_credits} {t.credits}</Text>
              </View>
              <View style={[s.myApiStatus, {
                backgroundColor: api.status === 'published' || api.status === 'active' ? '#ecfdf5' : '#fffbeb',
              }]}>
                <Text style={[s.myApiStatusText, {
                  color: api.status === 'published' || api.status === 'active' ? '#059669' : '#d97706',
                }]}>
                  {api.status === 'published' || api.status === 'active' ? t.published : api.status === 'draft' ? t.draft : api.status === 'private' ? t.private : api.status}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* ── API Key ── */}
      <View style={s.card}>
        <Text style={s.sectionLabel}>{t.apiKey}</Text>
        {apiKey ? (
          <>
            <View style={s.keyRow}>
              <Text style={s.keyText} numberOfLines={1}>
                {keyVisible ? apiKey : '••••••••••••••••••••••••'}
              </Text>
              <TouchableOpacity onPress={() => setKeyVisible(!keyVisible)} activeOpacity={0.6}>
                <Text style={s.keyAction}>{keyVisible ? t.hide : t.show}</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={s.keyBtn} onPress={handleCopyKey} activeOpacity={0.7}>
              <Text style={s.keyBtnText}>Copy</Text>
            </TouchableOpacity>
          </>
        ) : (
          <Text style={s.keyHint}>{t.apiKeyHidden}</Text>
        )}
        <TouchableOpacity style={s.resetBtn} onPress={handleResetKey} activeOpacity={0.7}>
          <Text style={s.resetBtnText}>{t.resetApiKey}</Text>
        </TouchableOpacity>
      </View>

      {/* ── Security (only for email users) ── */}
      {user?.email ? (
        <View style={s.card}>
          <Text style={s.sectionLabel}>{t.security}</Text>
          <View style={s.securityRow}>
            <Text style={s.securityLabel}>{t.email}</Text>
            <View style={[s.verifyBadge, user?.email_verified && s.verifyBadgeOk]}>
              <Text style={[s.verifyText, user?.email_verified && s.verifyTextOk]}>
                {user?.email_verified ? t.emailVerified : t.emailNotVerified}
              </Text>
            </View>
          </View>
        </View>
      ) : null}

      {/* ── Automations ── */}
      <View style={s.card}>
        <TouchableOpacity style={s.langRow} onPress={() => navigation.navigate('Automations')} activeOpacity={0.6}>
          <Text style={s.langLabel}>{t.automations}</Text>
          <Text style={s.langValue}>→</Text>
        </TouchableOpacity>
      </View>

      {/* ── Language ── */}
      <View style={s.card}>
        <TouchableOpacity style={s.langRow} onPress={toggleLanguage} activeOpacity={0.6}>
          <Text style={s.langLabel}>{t.language}</Text>
          <Text style={s.langValue}>{t.languageName} →</Text>
        </TouchableOpacity>
      </View>

      {/* ── Delete Account ── */}
      <TouchableOpacity
        style={s.deleteAccountBtn}
        onPress={() => showModal(t.deleteAccount, t.deleteAccountMsg)}
        activeOpacity={0.7}>
        <Text style={s.deleteAccountText}>{t.deleteAccount}</Text>
      </TouchableOpacity>

      {/* ── Logout ── */}
      <TouchableOpacity style={s.logoutBtn} onPress={handleLogout} activeOpacity={0.7}>
        <Text style={s.logoutText}>{t.logOut}</Text>
      </TouchableOpacity>

      <View style={{ height: 32 }} />
    </ScrollView>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.infoRow}>
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={s.infoValue}>{value}</Text>
    </View>
  )
}

function StatItem({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={s.statItem}>
      <Text style={[s.statValue, highlight && { color: '#2563eb' }]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 16, paddingTop: 24 },

  // Identity
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  avatarLetter: { fontSize: 22, fontWeight: fontWeight.bold, color: '#fff' },
  identityInfo: { flex: 1 },
  userName: {
    fontSize: 18,
    fontWeight: fontWeight.bold,
    color: colors.ink950,
    letterSpacing: -0.3,
    marginBottom: 6,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#eff6ff',
  },
  roleText: { fontSize: 10, fontWeight: fontWeight.semibold, color: '#2563eb', letterSpacing: 0.3 },

  // Card
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.08)',
    marginBottom: 12,
    padding: 0,
    overflow: 'hidden',
  },
  divider: { height: 1, backgroundColor: 'rgba(37, 99, 235, 0.06)', marginLeft: 18 },

  // Info rows
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 15,
  },
  infoLabel: { fontSize: 14, color: colors.ink500, fontWeight: fontWeight.medium },
  infoValue: { fontSize: 14, color: colors.ink950, fontWeight: fontWeight.semibold },

  // Stats
  statsCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.08)',
  },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: {
    fontSize: 20,
    fontWeight: fontWeight.extrabold,
    color: colors.ink950,
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: 10,
    color: colors.ink500,
    fontWeight: fontWeight.semibold,
    marginTop: 4,
    letterSpacing: 0.8,
  },
  statDivider: { width: 1, backgroundColor: 'rgba(37, 99, 235, 0.08)', marginVertical: 2 },

  // Action buttons
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  actionBtn: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  actionBtnGradient: {
    paddingVertical: 13,
    alignItems: 'center',
    borderRadius: 12,
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: fontWeight.bold,
    color: '#fff',
  },
  actionBtnOutline: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.2)',
  },
  actionBtnOutlineText: {
    fontSize: 14,
    fontWeight: fontWeight.bold,
    color: '#2563eb',
  },

  // API Key
  sectionLabel: {
    fontSize: 14,
    fontWeight: fontWeight.bold,
    color: colors.ink950,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 10,
  },
  keyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    marginBottom: 10,
  },
  keyText: {
    flex: 1,
    fontSize: 13,
    color: colors.ink700,
    fontFamily: 'monospace',
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 10,
    overflow: 'hidden',
  },
  keyAction: { fontSize: 13, color: '#2563eb', fontWeight: fontWeight.semibold },
  keyBtn: {
    marginHorizontal: 18,
    marginBottom: 10,
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  keyBtnText: { fontSize: 13, fontWeight: fontWeight.semibold, color: '#2563eb' },
  keyHint: {
    fontSize: 13,
    color: colors.ink500,
    paddingHorizontal: 18,
    marginBottom: 12,
    lineHeight: 18,
  },
  resetBtn: {
    marginHorizontal: 18,
    marginBottom: 16,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.15)',
  },
  resetBtnText: { fontSize: 13, fontWeight: fontWeight.semibold, color: colors.ink700 },

  // Security
  securityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingBottom: 16,
  },
  securityLabel: { fontSize: 14, color: colors.ink700, fontWeight: fontWeight.medium },
  verifyBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#fef2f2',
  },
  verifyBadgeOk: { backgroundColor: '#ecfdf5' },
  verifyText: { fontSize: 12, fontWeight: fontWeight.semibold, color: '#dc2626' },
  verifyTextOk: { color: '#059669' },

  // My APIs
  apiFilterRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 18, paddingBottom: 10, flexWrap: 'wrap' },
  apiFilterChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: '#f1f5f9' },
  apiFilterChipActive: { backgroundColor: '#2563eb' },
  apiFilterText: { fontSize: 11, fontWeight: fontWeight.semibold, color: colors.ink600 },
  apiFilterTextActive: { color: '#fff' },
  myApiHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 0 },
  myApiTitle: { fontSize: 14, fontWeight: fontWeight.bold, color: colors.ink950 },
  expandArrow: { fontSize: 10, color: colors.ink500 },
  myApiRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 14 },
  myApiRowBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(37,99,235,0.06)' },
  myApiLeft: { flex: 1, marginRight: 12 },
  myApiName: { fontSize: 14, fontWeight: fontWeight.semibold, color: colors.ink950 },
  myApiMeta: { fontSize: 12, color: colors.ink500, marginTop: 2 },
  myApiStatus: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  myApiStatusText: { fontSize: 11, fontWeight: fontWeight.semibold },

  // Language
  langRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  langLabel: { fontSize: 14, color: colors.ink700, fontWeight: fontWeight.medium },
  langValue: { fontSize: 14, color: '#2563eb', fontWeight: fontWeight.semibold },

  // Delete Account
  deleteAccountBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.15)',
    marginBottom: 10,
  },
  deleteAccountText: { fontSize: 14, fontWeight: fontWeight.semibold, color: colors.ink500 },

  // Logout
  logoutBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  logoutText: { fontSize: 14, fontWeight: fontWeight.semibold, color: '#dc2626' },
})
