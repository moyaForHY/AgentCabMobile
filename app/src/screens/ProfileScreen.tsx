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
import { colors, fontWeight } from '../utils/theme'
import { useAuth } from '../hooks/useAuth'
import { useI18n } from '../i18n'
import { fetchWallet, resetApiKey, fetchMySkills, updateProfile, uploadAvatar, SITE_URL, type Skill } from '../services/api'
import ImageCropPicker from 'react-native-image-crop-picker'
import { useCachedData } from '../hooks/useCachedData'

export default function ProfileScreen({ navigation }: any) {
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

      {/* ── Identity ── */}
      <View style={s.identityRow}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={s.avatarImg} />
        ) : (
          <LinearGradient
            colors={['#2563eb', '#1e40af']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={s.avatar}>
            <Text style={s.avatarLetter}>{user?.name?.[0]?.toUpperCase() || '?'}</Text>
          </LinearGradient>
        )}
        <View style={s.identityInfo}>
          <Text style={s.userName}>{user?.name}</Text>
          {user?.bio ? <Text style={s.userBio} numberOfLines={2}>{user.bio}</Text> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <View style={s.roleBadge}>
              <Text style={s.roleText}>{user?.role?.toUpperCase() || 'CALLER'}</Text>
            </View>
            <TouchableOpacity onPress={startEditProfile}>
              <Text style={s.editLink}>{lang === 'zh' ? '编辑资料' : 'Edit Profile'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

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

      {/* Edit Profile Modal is rendered outside ScrollView */}

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

      {/* ── My Clones ── */}
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

      {/* ── Secret Key ── */}
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
  avatarImg: { width: 52, height: 52, borderRadius: 26, marginRight: 14 },
  avatarLetter: { fontSize: 22, fontWeight: fontWeight.bold, color: '#fff' },
  identityInfo: { flex: 1 },
  userName: {
    fontSize: 18,
    fontWeight: fontWeight.bold,
    color: colors.ink950,
    letterSpacing: -0.3,
    marginBottom: 2,
  },
  userBio: { fontSize: 12, color: colors.ink600, lineHeight: 17, marginBottom: 4 },
  editLink: { fontSize: 12, color: colors.primary, fontWeight: fontWeight.medium },
  roleBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#eff6ff',
  },
  roleText: { fontSize: 10, fontWeight: fontWeight.semibold, color: '#2563eb', letterSpacing: 0.3 },
  socialRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  socialBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#f1f5f9' },
  socialIcon: { fontSize: 13, color: colors.ink600, fontWeight: fontWeight.bold },
  socialText: { fontSize: 11, color: colors.ink600, fontWeight: fontWeight.medium },

  // Avatar upload
  avatarUpload: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8, paddingVertical: 8 },
  avatarUploadImg: { width: 56, height: 56, borderRadius: 28 },
  avatarUploadFallback: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.sand100, justifyContent: 'center', alignItems: 'center' },
  avatarUploadText: { fontSize: 14, color: colors.primary, fontWeight: fontWeight.medium },

  // Profile edit
  inputLabel: { fontSize: 12, color: colors.ink600, fontWeight: fontWeight.medium, marginBottom: 4, marginTop: 10 },
  input: {
    borderWidth: 1,
    borderColor: colors.sand200,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: colors.ink950,
    backgroundColor: colors.sand50,
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 32,
    paddingTop: 12,
  },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.sand200, alignSelf: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: fontWeight.bold, color: colors.ink950, marginBottom: 4 },
  cancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center', backgroundColor: colors.sand100 },
  cancelBtnText: { fontSize: 14, fontWeight: fontWeight.semibold, color: colors.ink600 },
  saveBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center', backgroundColor: colors.primary },
  saveBtnText: { fontSize: 14, fontWeight: fontWeight.semibold, color: '#fff' },

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

  // Secret Key
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

  // My Clones
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
