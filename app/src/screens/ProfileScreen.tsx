import React, { useState, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Clipboard,
  TextInput,
  Image,
  Linking,
  Modal,
  ActivityIndicator,
} from 'react-native'
import { showModal } from '../components/AppModal'
import LinearGradient from 'react-native-linear-gradient'
import Icon from 'react-native-vector-icons/Feather'
import { colors, fontWeight, shadows, spacing, radii, fontSize as fs } from '../utils/theme'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../hooks/useAuth'
import { useI18n } from '../i18n'
import { fetchWallet, resetApiKey, fetchMySkills, updateProfile, uploadAvatar, SITE_URL, type Skill } from '../services/api'
import ImageCropPicker from 'react-native-image-crop-picker'
import { useCachedData } from '../hooks/useCachedData'

export default function ProfileScreen({ navigation }: any) {
  const insets = useSafeAreaInsets()
  const { user, logout, refreshUser } = useAuth()
  const { t, lang, setLang } = useI18n()
  const [apiKey, setApiKey] = useState<string | null>(null)
  const [keyVisible, setKeyVisible] = useState(false)
  const [apisExpanded, setApisExpanded] = useState(false)
  const [apiFilter, setApiFilter] = useState<string>('all')
  const [editingProfile, setEditingProfile] = useState(false)
  const [profileForm, setProfileForm] = useState({
    name: '',
    bio: '',
    website: '',
    twitter: '',
    github: '',
    linkedin: '',
    wechat_official: '',
    youtube: '',
    bilibili: '',
  })
  const [savingProfile, setSavingProfile] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [avatarCacheBuster, setAvatarCacheBuster] = useState('')

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

  const handleChangeAvatar = async () => {
    try {
      const image = await ImageCropPicker.openPicker({
        width: 400,
        height: 400,
        cropping: true,
        cropperCircleOverlay: true,
        mediaType: 'photo',
        compressImageQuality: 0.8,
      })
      if (!image?.path) return
      setUploadingAvatar(true)
      const result = await uploadAvatar(image.path)
      await updateProfile({ avatar_url: result.avatar_url })
      await refreshUser()
      setAvatarCacheBuster(`?t=${Date.now()}`)
      setUploadingAvatar(false)
      showModal(t.done, lang === 'zh' ? '头像已更新' : 'Avatar updated')
    } catch (e: any) {
      setUploadingAvatar(false)
      if (e?.code === 'E_PICKER_CANCELLED') return
      console.log('Avatar upload error:', e?.message, e?.response?.data)
      showModal(t.error, e.message)
    }
  }

  const startEditProfile = () => {
    setProfileForm({
      name: user?.name || '',
      bio: user?.bio || '',
      website: user?.website || '',
      twitter: user?.twitter || '',
      github: user?.github || '',
      linkedin: user?.linkedin || '',
      wechat_official: user?.wechat_official || '',
      youtube: user?.youtube || '',
      bilibili: user?.bilibili || '',
    })
    setEditingProfile(true)
  }

  const saveProfile = async () => {
    setSavingProfile(true)
    try {
      await updateProfile(profileForm)
      await refreshUser()
      setEditingProfile(false)
      showModal(t.done, lang === 'zh' ? '个人资料已更新' : 'Profile updated')
    } catch (e: any) {
      showModal(t.error, e.message)
    } finally {
      setSavingProfile(false)
    }
  }

  const toggleLanguage = () => {
    setLang(lang === 'en' ? 'zh' : 'en')
  }

  const avatarUrl = user?.avatar_url && user.avatar_url.length > 0
    ? (user.avatar_url.startsWith('http') ? user.avatar_url : `${SITE_URL}${user.avatar_url}`) + avatarCacheBuster
    : null

  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : ''

  return (
    <>
    <ScrollView
      style={s.container}
      contentContainerStyle={s.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>

      {/* ── Hero Profile Header ── */}
      <LinearGradient colors={['#0f172a', '#1e293b']} style={s.heroHeader}>
        <View style={[s.heroRow, { marginTop: insets.top }]}>
          <View style={s.avatarWrapper}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={s.avatarImg} />
            ) : (
              <View style={s.avatar}>
                <Text style={s.avatarLetter}>{user?.name?.[0]?.toUpperCase() || '?'}</Text>
              </View>
            )}
          </View>
          <View style={s.heroInfo}>
            <Text style={s.heroName}>{user?.name}</Text>
            <View style={s.heroMeta}>
              <View style={s.roleBadge}>
                <Text style={s.roleText}>{user?.role?.toUpperCase() || 'CALLER'}</Text>
              </View>
              {memberSince ? <Text style={s.heroJoined}>{memberSince}</Text> : null}
            </View>
          </View>
          <TouchableOpacity onPress={startEditProfile} style={s.heroEditBtn} activeOpacity={0.7}>
            <Icon name="edit-2" size={16} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        </View>
        {user?.bio ? <Text style={s.heroBio} numberOfLines={2}>{user.bio}</Text> : null}

        {/* Stats inline */}
        <View style={s.heroStats}>
          <View style={s.heroStatItem}>
            <Text style={s.heroStatValue}>{wallet?.credits != null ? Number(wallet.credits).toLocaleString() : '—'}</Text>
            <Text style={s.heroStatLabel}>{t.balance}</Text>
          </View>
          <View style={s.heroStatDivider} />
          <View style={s.heroStatItem}>
            <Text style={s.heroStatValue}>{Number(user?.total_credits_spent || 0).toLocaleString()}</Text>
            <Text style={s.heroStatLabel}>{t.spent}</Text>
          </View>
          <View style={s.heroStatDivider} />
          <View style={s.heroStatItem}>
            <Text style={s.heroStatValue}>{Number(user?.total_credits_earned || 0).toLocaleString()}</Text>
            <Text style={s.heroStatLabel}>{t.earned}</Text>
          </View>
        </View>
      </LinearGradient>

      {/* ── Social Links ── */}
      {(user?.website || user?.twitter || user?.github || user?.linkedin || user?.wechat_official || user?.youtube || user?.bilibili) ? (
        <View style={s.socialRow}>
          {user.website ? <TouchableOpacity style={s.socialBadge} onPress={() => Linking.openURL(user.website!)}><Icon name="globe" size={13} color={colors.ink600} /><Text style={s.socialText}>{lang === 'zh' ? '网站' : 'Website'}</Text></TouchableOpacity> : null}
          {user.twitter ? <TouchableOpacity style={s.socialBadge} onPress={() => Linking.openURL(user.twitter!.startsWith('http') ? user.twitter! : `https://x.com/${user.twitter!.replace('@', '')}`)}><Text style={s.socialIcon}>𝕏</Text><Text style={s.socialText}>{user.twitter.startsWith('@') ? user.twitter : `@${user.twitter}`}</Text></TouchableOpacity> : null}
          {user.github ? <TouchableOpacity style={s.socialBadge} onPress={() => Linking.openURL(user.github!.startsWith('http') ? user.github! : `https://github.com/${user.github}`)}><Icon name="github" size={13} color={colors.ink600} /><Text style={s.socialText}>GitHub</Text></TouchableOpacity> : null}
          {user.linkedin ? <TouchableOpacity style={s.socialBadge} onPress={() => Linking.openURL(user.linkedin!.startsWith('http') ? user.linkedin! : `https://linkedin.com/in/${user.linkedin}`)}><Icon name="linkedin" size={13} color={colors.ink600} /><Text style={s.socialText}>LinkedIn</Text></TouchableOpacity> : null}
          {user.wechat_official ? <View style={s.socialBadge}><Icon name="message-circle" size={13} color={colors.ink600} /><Text style={s.socialText}>{user.wechat_official}</Text></View> : null}
          {user.youtube ? <TouchableOpacity style={s.socialBadge} onPress={() => Linking.openURL(user.youtube!.startsWith('http') ? user.youtube! : `https://youtube.com/${user.youtube}`)}><Icon name="youtube" size={13} color={colors.ink600} /><Text style={s.socialText}>YouTube</Text></TouchableOpacity> : null}
          {user.bilibili ? <TouchableOpacity style={s.socialBadge} onPress={() => Linking.openURL(user.bilibili!.startsWith('http') ? user.bilibili! : `https://space.bilibili.com/${user.bilibili}`)}><Icon name="tv" size={13} color={colors.ink600} /><Text style={s.socialText}>B站</Text></TouchableOpacity> : null}
        </View>
      ) : null}

      {/* ── All settings in one card ── */}
      <View style={s.menuCardShadow}>
      <View style={s.menuCard}>
        {/* Account info */}
        {user?.email ? (
          <>
            <View style={s.menuRow}>
              <Icon name="mail" size={16} color={colors.ink500} style={{ marginRight: 14 }} />
              <Text style={s.menuLabel}>{user.email}</Text>
              {user?.email_verified ? (
                <View style={s.verifyBadgeOk}><Text style={s.verifyTextOk}>✓</Text></View>
              ) : null}
            </View>
            <View style={s.menuDivider} />
          </>
        ) : null}
        {user?.phone ? (
          <>
            <View style={s.menuRow}>
              <Icon name="phone" size={16} color={colors.ink500} style={{ marginRight: 14 }} />
              <Text style={s.menuLabel}>{user.phone}</Text>
            </View>
            <View style={s.menuDivider} />
          </>
        ) : null}

        {/* Wallet */}
        <View style={s.walletRow}>
          <TouchableOpacity style={s.walletBtn} onPress={() => navigation.navigate('Wallet')} activeOpacity={0.7}>
            <LinearGradient colors={['#2563eb', '#1e40af']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.walletBtnGradient}>
              <View style={s.walletBtnInner}>
                <Icon name="plus" size={14} color="#fff" />
                <Text style={s.walletBtnText}>{t.recharge}</Text>
              </View>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity style={s.walletBtnOutline} onPress={() => navigation.navigate('Wallet')} activeOpacity={0.7}>
            <Icon name="arrow-up-right" size={14} color={colors.primary} />
            <Text style={s.walletBtnOutlineText}>{t.withdraw}</Text>
          </TouchableOpacity>
        </View>
        <View style={s.menuDivider} />

        {/* My Clones */}
        {nonDeletedApis.length > 0 && (
          <>
            <TouchableOpacity style={s.menuRow} onPress={() => setApisExpanded(!apisExpanded)} activeOpacity={0.7}>
              <Icon name="box" size={16} color={colors.ink500} style={{ marginRight: 14 }} />
              <Text style={s.menuLabel}>{t.myApis} ({nonDeletedApis.length})</Text>
              <Icon name={apisExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.ink400} />
            </TouchableOpacity>
            {apisExpanded && (
              <>
                {filterOptions.length > 2 && (
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
                {filteredApis.map((api, i) => (
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
                        {api.status === 'published' || api.status === 'active' ? t.published : api.status === 'draft' ? t.draft : api.status}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </>
            )}
            <View style={s.menuDivider} />
          </>
        )}

        {/* Language */}
        <TouchableOpacity style={s.menuRow} onPress={toggleLanguage} activeOpacity={0.6}>
          <Icon name="globe" size={16} color={colors.ink500} style={{ marginRight: 14 }} />
          <Text style={s.menuLabel}>{t.language}</Text>
          <Text style={s.menuValue}>{t.languageName}</Text>
        </TouchableOpacity>
        <View style={s.menuDivider} />

        {/* API Key */}
        <TouchableOpacity style={s.menuRow} onPress={handleResetKey} activeOpacity={0.6}>
          <Icon name="key" size={16} color={colors.ink500} style={{ marginRight: 14 }} />
          <Text style={s.menuLabel}>{t.apiKey}</Text>
          <Text style={{ fontSize: 12, color: colors.ink400 }}>{apiKey ? (keyVisible ? apiKey.slice(0, 12) + '...' : '••••••••') : lang === 'zh' ? '点击重置' : 'Tap to reset'}</Text>
        </TouchableOpacity>
        <View style={s.menuDivider} />

        {/* Logout */}
        <TouchableOpacity style={s.menuRow} onPress={handleLogout} activeOpacity={0.7}>
          <Icon name="log-out" size={16} color={colors.error} style={{ marginRight: 14 }} />
          <Text style={[s.menuLabel, { color: colors.error }]}>{t.logOut}</Text>
        </TouchableOpacity>
      </View>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>

    {/* ── Edit Profile Modal ── */}
    <Modal visible={editingProfile} transparent animationType="slide" onRequestClose={() => setEditingProfile(false)}>
      <View style={s.modalOverlay}>
        <View style={s.modalSheet}>
          <View style={s.modalHandle} />
          <Text style={s.modalTitle}>{lang === 'zh' ? '编辑资料' : 'Edit Profile'}</Text>
          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
            {/* Avatar upload */}
            <TouchableOpacity style={s.avatarUpload} onPress={handleChangeAvatar} disabled={uploadingAvatar} activeOpacity={0.7}>
              {uploadingAvatar ? (
                <View style={s.avatarUploadFallback}>
                  <ActivityIndicator size="small" color={colors.primary} />
                </View>
              ) : avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={s.avatarUploadImg} />
              ) : (
                <View style={s.avatarUploadFallback}>
                  <Icon name="camera" size={20} color={colors.ink400} />
                </View>
              )}
              <Text style={s.avatarUploadText}>{uploadingAvatar ? (lang === 'zh' ? '上传中...' : 'Uploading...') : (lang === 'zh' ? '更换头像' : 'Change Avatar')}</Text>
            </TouchableOpacity>

            <Text style={s.inputLabel}>{lang === 'zh' ? '名称' : 'Name'}</Text>
            <TextInput style={s.input} value={profileForm.name} onChangeText={v => setProfileForm(p => ({ ...p, name: v }))} placeholder={lang === 'zh' ? '你的名称' : 'Your name'} placeholderTextColor={colors.ink400} maxLength={50} />

            <Text style={s.inputLabel}>{lang === 'zh' ? '简介' : 'Bio'}</Text>
            <TextInput style={[s.input, { height: 70, textAlignVertical: 'top' }]} value={profileForm.bio} onChangeText={v => setProfileForm(p => ({ ...p, bio: v }))} placeholder={lang === 'zh' ? '介绍一下自己...' : 'Tell us about yourself...'} placeholderTextColor={colors.ink400} multiline maxLength={500} />

            <Text style={s.inputLabel}>{lang === 'zh' ? '网站' : 'Website'}</Text>
            <TextInput style={s.input} value={profileForm.website} onChangeText={v => setProfileForm(p => ({ ...p, website: v }))} placeholder="https://" placeholderTextColor={colors.ink400} autoCapitalize="none" keyboardType="url" />

            <Text style={s.inputLabel}>X (Twitter)</Text>
            <TextInput style={s.input} value={profileForm.twitter} onChangeText={v => setProfileForm(p => ({ ...p, twitter: v }))} placeholder="@handle" placeholderTextColor={colors.ink400} autoCapitalize="none" />

            <Text style={s.inputLabel}>GitHub</Text>
            <TextInput style={s.input} value={profileForm.github} onChangeText={v => setProfileForm(p => ({ ...p, github: v }))} placeholder="username" placeholderTextColor={colors.ink400} autoCapitalize="none" />

            <Text style={s.inputLabel}>LinkedIn</Text>
            <TextInput style={s.input} value={profileForm.linkedin} onChangeText={v => setProfileForm(p => ({ ...p, linkedin: v }))} placeholder="in/username" placeholderTextColor={colors.ink400} autoCapitalize="none" />

            <Text style={s.inputLabel}>{lang === 'zh' ? '微信公众号' : 'WeChat Official'}</Text>
            <TextInput style={s.input} value={profileForm.wechat_official} onChangeText={v => setProfileForm(p => ({ ...p, wechat_official: v }))} placeholder={lang === 'zh' ? '公众号名称' : 'Official account name'} placeholderTextColor={colors.ink400} />

            <Text style={s.inputLabel}>YouTube</Text>
            <TextInput style={s.input} value={profileForm.youtube} onChangeText={v => setProfileForm(p => ({ ...p, youtube: v }))} placeholder="@channel" placeholderTextColor={colors.ink400} autoCapitalize="none" />

            <Text style={s.inputLabel}>{lang === 'zh' ? 'B站' : 'Bilibili'}</Text>
            <TextInput style={s.input} value={profileForm.bilibili} onChangeText={v => setProfileForm(p => ({ ...p, bilibili: v }))} placeholder={lang === 'zh' ? '空间ID' : 'Space ID'} placeholderTextColor={colors.ink400} autoCapitalize="none" />
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
            <TouchableOpacity style={s.cancelBtn} onPress={() => setEditingProfile(false)}>
              <Text style={s.cancelBtnText}>{t.cancel}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.saveBtn} onPress={saveProfile} disabled={savingProfile}>
              <Text style={s.saveBtnText}>{savingProfile ? '...' : (lang === 'zh' ? '保存' : 'Save')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  </>
  )
}

function InfoRow({ icon, label, value }: { icon?: string; label: string; value: string }) {
  return (
    <View style={s.infoRow}>
      {icon ? <Icon name={icon} size={15} color={colors.ink400} style={{ marginRight: 12 }} /> : null}
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
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingTop: 0 },

  // Hero profile header
  heroHeader: {
    marginBottom: spacing.md,
    elevation: 12,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  avatarWrapper: {
    marginRight: 14,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  avatarImg: { width: 56, height: 56, borderRadius: 28, borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)' },
  avatarLetter: { fontSize: 22, fontWeight: fontWeight.bold, color: '#fff' },
  heroInfo: { flex: 1 },
  heroName: {
    fontSize: 22,
    fontWeight: fontWeight.extrabold,
    color: '#fff',
    letterSpacing: -0.5,
  },
  heroMeta: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  heroJoined: { fontSize: 12, color: 'rgba(255,255,255,0.45)' },
  heroEditBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroBio: { fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 19, marginTop: 12, paddingHorizontal: 20 },
  heroStats: {
    flexDirection: 'row',
    marginTop: 18,
    paddingTop: 16,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  heroStatItem: { flex: 1, alignItems: 'center' },
  heroStatValue: { fontSize: 20, fontWeight: fontWeight.bold, color: '#fff', letterSpacing: -0.5 },
  heroStatLabel: { fontSize: 10, color: 'rgba(255,255,255,0.45)', fontWeight: fontWeight.semibold, marginTop: 4, letterSpacing: 0.5, textTransform: 'uppercase' as any },
  heroStatDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginVertical: 2 },
  roleBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radii.xs,
    backgroundColor: 'rgba(37,99,235,0.3)',
  },
  roleText: { fontSize: 10, fontWeight: fontWeight.bold, color: '#93c5fd', letterSpacing: 0.8 },
  socialRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md, paddingHorizontal: spacing.lg },
  socialBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radii.sm,
    backgroundColor: colors.sand100,
  },
  socialIcon: { fontSize: 13, color: colors.ink600, fontWeight: fontWeight.bold },
  socialText: { fontSize: 11, color: colors.ink600, fontWeight: fontWeight.medium },

  // Avatar upload
  avatarUpload: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: spacing.sm, paddingVertical: spacing.sm },
  avatarUploadImg: { width: 56, height: 56, borderRadius: 28 },
  avatarUploadFallback: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.sand100, justifyContent: 'center', alignItems: 'center' },
  avatarUploadText: { fontSize: fs.sm, color: colors.primary, fontWeight: fontWeight.semibold },

  // Profile edit modal
  inputLabel: { fontSize: fs.xs, color: colors.ink600, fontWeight: fontWeight.semibold, marginBottom: 5, marginTop: 12, letterSpacing: 0.2 },
  input: {
    borderWidth: 1,
    borderColor: colors.sand200,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: fs.sm,
    color: colors.ink950,
    backgroundColor: colors.sand50,
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radii.xxl,
    borderTopRightRadius: radii.xxl,
    paddingHorizontal: spacing.lg,
    paddingBottom: 36,
    paddingTop: 14,
    ...shadows.lg,
  },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.sand200, alignSelf: 'center', marginBottom: spacing.md },
  modalTitle: { fontSize: fs.lg, fontWeight: fontWeight.bold, color: colors.ink950, marginBottom: spacing.xs, letterSpacing: -0.3 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: radii.md, alignItems: 'center', backgroundColor: colors.sand100 },
  cancelBtnText: { fontSize: fs.sm, fontWeight: fontWeight.semibold, color: colors.ink600 },
  saveBtn: { flex: 1, paddingVertical: 14, borderRadius: radii.md, alignItems: 'center', backgroundColor: colors.primary },
  saveBtnText: { fontSize: fs.sm, fontWeight: fontWeight.semibold, color: '#fff' },

  // Card — shadow-based depth
  cardShadow: {
    borderRadius: radii.lg,
    marginBottom: spacing.md,
    marginHorizontal: spacing.lg,
    ...shadows.sm,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: 0,
    overflow: 'hidden',
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.sand200, marginLeft: 20 },

  // Info rows
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  infoLabel: { fontSize: fs.sm, color: colors.ink500, fontWeight: fontWeight.medium },
  infoValue: { fontSize: fs.sm, color: colors.ink950, fontWeight: fontWeight.semibold },

  // Stats
  statsCard: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: {
    fontSize: 22,
    fontWeight: fontWeight.extrabold,
    color: colors.ink950,
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: 10,
    color: colors.ink500,
    fontWeight: fontWeight.semibold,
    marginTop: 6,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  statDivider: { width: StyleSheet.hairlineWidth, backgroundColor: colors.sand200, marginVertical: 4 },

  // Action buttons
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  actionBtnShadow: {
    flex: 1,
    borderRadius: radii.md,
    ...shadows.glow,
  },
  actionBtn: {
    borderRadius: radii.md,
    overflow: 'hidden',
  },
  actionBtnGradient: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    borderRadius: radii.md,
  },
  actionBtnText: {
    fontSize: fs.sm,
    fontWeight: fontWeight.bold,
    color: '#fff',
    letterSpacing: 0.2,
  },
  actionBtnOutline: {
    flex: 1,
    borderRadius: radii.md,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: colors.white,
    ...shadows.sm,
  },
  actionBtnOutlineText: {
    fontSize: fs.sm,
    fontWeight: fontWeight.bold,
    color: colors.primary,
    letterSpacing: 0.2,
  },

  // Secret Key
  sectionLabel: {
    fontSize: fs.sm,
    fontWeight: fontWeight.bold,
    color: colors.ink950,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
    letterSpacing: -0.2,
  },
  keyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  keyText: {
    flex: 1,
    fontSize: 13,
    color: colors.ink700,
    fontFamily: 'monospace',
    backgroundColor: colors.sand50,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radii.sm,
    marginRight: 10,
    overflow: 'hidden',
  },
  keyAction: { fontSize: 13, color: colors.primary, fontWeight: fontWeight.semibold },
  keyBtn: {
    marginHorizontal: 20,
    marginBottom: 12,
    backgroundColor: colors.primary50,
    borderRadius: radii.sm,
    paddingVertical: 11,
    alignItems: 'center',
  },
  keyBtnText: { fontSize: 13, fontWeight: fontWeight.semibold, color: colors.primary },
  keyHint: {
    fontSize: 13,
    color: colors.ink500,
    paddingHorizontal: 20,
    marginBottom: 14,
    lineHeight: 19,
  },
  resetBtn: {
    marginHorizontal: 20,
    marginBottom: 18,
    borderRadius: radii.sm,
    paddingVertical: 11,
    alignItems: 'center',
    backgroundColor: colors.sand50,
  },
  resetBtnText: { fontSize: 13, fontWeight: fontWeight.semibold, color: colors.ink700 },

  // Security
  securityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 18,
  },
  securityLabel: { fontSize: fs.sm, color: colors.ink700, fontWeight: fontWeight.medium },
  verifyBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radii.xs,
    backgroundColor: '#fef2f2',
  },
  verifyBadgeOk: { backgroundColor: '#ecfdf5' },
  verifyText: { fontSize: fs.xs, fontWeight: fontWeight.semibold, color: '#dc2626' },
  verifyTextOk: { color: '#059669' },

  // My Clones
  apiFilterRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 20, paddingBottom: 12, flexWrap: 'wrap' },
  apiFilterChip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: radii.pill, backgroundColor: colors.sand100 },
  apiFilterChipActive: { backgroundColor: colors.primary },
  apiFilterText: { fontSize: 11, fontWeight: fontWeight.semibold, color: colors.ink600 },
  apiFilterTextActive: { color: '#fff' },
  myApiHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 0 },
  myApiTitle: { fontSize: fs.sm, fontWeight: fontWeight.bold, color: colors.ink950 },
  expandArrow: { fontSize: 10, color: colors.ink500 },
  myApiRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 15 },
  myApiRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.sand200 },
  myApiLeft: { flex: 1, marginRight: 12 },
  myApiName: { fontSize: fs.sm, fontWeight: fontWeight.semibold, color: colors.ink950 },
  myApiMeta: { fontSize: fs.xs, color: colors.ink500, marginTop: 3 },
  myApiStatus: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.xs },
  myApiStatusText: { fontSize: 11, fontWeight: fontWeight.semibold },

  // Menu items
  menuCardShadow: {
    borderRadius: radii.lg,
    marginBottom: spacing.md,
    marginHorizontal: spacing.lg,
    ...shadows.sm,
  },
  menuCard: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  menuIconWrap: {
    width: 32,
    height: 32,
    borderRadius: radii.sm,
    backgroundColor: colors.primary50,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  menuLabel: { flex: 1, fontSize: fs.sm, color: colors.ink800, fontWeight: fontWeight.medium },
  menuValue: { fontSize: fs.sm, color: colors.primary, fontWeight: fontWeight.semibold },
  menuDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.sand200, marginLeft: 50 },

  // Wallet buttons
  walletRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  walletBtn: {
    flex: 1,
    borderRadius: radii.md,
    overflow: 'hidden',
  },
  walletBtnGradient: {
    borderRadius: radii.md,
  },
  walletBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
  },
  walletBtnText: {
    fontSize: 13,
    fontWeight: fontWeight.bold,
    color: '#fff',
  },
  walletBtnOutline: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: radii.md,
    backgroundColor: colors.primary50,
  },
  walletBtnOutlineText: {
    fontSize: 13,
    fontWeight: fontWeight.bold,
    color: colors.primary,
  },
})
