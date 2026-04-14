import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
} from 'react-native'
import Icon from 'react-native-vector-icons/Feather'
import { colors, fontWeight } from '../utils/theme'
import { useI18n } from '../i18n'
import { fetchSkills, SITE_URL, type Skill } from '../services/api'
import SkillCard from '../components/SkillCard'

export default function ProviderScreen({ route, navigation }: any) {
  const { providerId, providerName, providerAvatar, providerBio, providerWebsite, providerTwitter, providerGithub, providerLinkedin, providerWechat, providerYoutube, providerBilibili } = route.params
  const { t } = useI18n()
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ total: 0, calls: 0, avgRating: 0 })

  useEffect(() => {
    fetchSkills(1, 100).then(res => {
      const mine = res.items.filter(s => s.agent_id === providerId)
      setSkills(mine)
      const totalCalls = mine.reduce((sum, s) => sum + (s.call_count || 0), 0)
      const rated = mine.filter(s => s.rating > 0)
      const avgRating = rated.length > 0 ? rated.reduce((sum, s) => sum + s.rating, 0) / rated.length : 0
      setStats({ total: mine.length, calls: totalCalls, avgRating })
    }).catch(() => {}).finally(() => setLoading(false))
  }, [providerId])

  const avatarUri = providerAvatar && providerAvatar.length > 0
    ? (providerAvatar.startsWith('http') ? providerAvatar : `${SITE_URL}${providerAvatar}`)
    : null

  return (
    <ScrollView style={st.container} contentContainerStyle={st.content}>
      {/* Header */}
      <View style={st.header}>
        {avatarUri ? (
          <Image source={{ uri: avatarUri }} style={st.avatar} />
        ) : (
          <View style={st.avatarFallback}>
            <Text style={st.avatarLetter}>{(providerName || '?')[0].toUpperCase()}</Text>
          </View>
        )}
        <Text style={st.name}>{providerName}</Text>
        {providerBio ? <Text style={st.bio}>{providerBio}</Text> : null}

        {/* Social */}
        <View style={st.socialRow}>
          {providerWebsite ? (
            <TouchableOpacity style={st.socialBadge} onPress={() => Linking.openURL(providerWebsite)}>
              <Icon name="globe" size={13} color={colors.ink600} />
              <Text style={st.socialText}>{t.profile_website}</Text>
            </TouchableOpacity>
          ) : null}
          {providerTwitter ? (
            <TouchableOpacity style={st.socialBadge} onPress={() => Linking.openURL(providerTwitter.startsWith('http') ? providerTwitter : `https://x.com/${providerTwitter.replace('@', '')}`)}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.ink600 }}>𝕏</Text>
              <Text style={st.socialText}>{providerTwitter.startsWith('@') ? providerTwitter : `@${providerTwitter}`}</Text>
            </TouchableOpacity>
          ) : null}
          {providerGithub ? (
            <TouchableOpacity style={st.socialBadge} onPress={() => Linking.openURL(providerGithub.startsWith('http') ? providerGithub : `https://github.com/${providerGithub}`)}>
              <Icon name="github" size={13} color={colors.ink600} />
              <Text style={st.socialText}>GitHub</Text>
            </TouchableOpacity>
          ) : null}
          {providerLinkedin ? (
            <TouchableOpacity style={st.socialBadge} onPress={() => Linking.openURL(providerLinkedin.startsWith('http') ? providerLinkedin : `https://linkedin.com/in/${providerLinkedin}`)}>
              <Icon name="linkedin" size={13} color={colors.ink600} />
              <Text style={st.socialText}>LinkedIn</Text>
            </TouchableOpacity>
          ) : null}
          {providerWechat ? (
            <View style={st.socialBadge}>
              <Icon name="message-circle" size={13} color={colors.ink600} />
              <Text style={st.socialText}>{providerWechat}</Text>
            </View>
          ) : null}
          {providerYoutube ? (
            <TouchableOpacity style={st.socialBadge} onPress={() => Linking.openURL(providerYoutube.startsWith('http') ? providerYoutube : `https://youtube.com/${providerYoutube}`)}>
              <Icon name="youtube" size={13} color={colors.ink600} />
              <Text style={st.socialText}>YouTube</Text>
            </TouchableOpacity>
          ) : null}
          {providerBilibili ? (
            <TouchableOpacity style={st.socialBadge} onPress={() => Linking.openURL(providerBilibili.startsWith('http') ? providerBilibili : `https://space.bilibili.com/${providerBilibili}`)}>
              <Icon name="tv" size={13} color={colors.ink600} />
              <Text style={st.socialText}>B站</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Stats */}
        <View style={st.statsRow}>
          <View style={st.stat}>
            <Text style={st.statValue}>{stats.total}</Text>
            <Text style={st.statLabel}>{t.provider_clones}</Text>
          </View>
          <View style={st.statDivider} />
          <View style={st.stat}>
            <Text style={st.statValue}>{stats.calls.toLocaleString()}</Text>
            <Text style={st.statLabel}>{t.provider_calls}</Text>
          </View>
          <View style={st.statDivider} />
          <View style={st.stat}>
            <Text style={st.statValue}>{stats.avgRating > 0 ? `★ ${stats.avgRating.toFixed(1)}` : '—'}</Text>
            <Text style={st.statLabel}>{t.rating}</Text>
          </View>
        </View>
      </View>

      {/* Skills */}
      <Text style={st.sectionTitle}>{t.provider_theirClones}</Text>
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
      ) : skills.length === 0 ? (
        <Text style={st.empty}>{t.provider_empty}</Text>
      ) : (
        skills.map((skill, i) => (
          <SkillCard
            key={skill.id}
            skill={skill}
            index={i}
            showAuthor={false}
            onPress={() => navigation.navigate('SkillDetail', { skillId: skill.id })}
          />
        ))
      )}
      <View style={{ height: 32 }} />
    </ScrollView>
  )
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 16 },

  header: { alignItems: 'center', paddingVertical: 20 },
  avatar: { width: 80, height: 80, borderRadius: 40 },
  avatarFallback: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarLetter: { fontSize: 32, fontWeight: fontWeight.bold, color: colors.primary },
  name: { fontSize: 24, fontWeight: fontWeight.extrabold, color: colors.ink950, marginTop: 12, letterSpacing: -0.5 },
  bio: { fontSize: 14, color: colors.ink600, textAlign: 'center', lineHeight: 20, marginTop: 8, maxWidth: 300 },

  socialRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14, justifyContent: 'center' },
  socialBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  socialText: { fontSize: 12, color: colors.ink600, fontWeight: fontWeight.medium },

  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(37,99,235,0.08)',
    marginTop: 16,
    width: '100%',
  },
  stat: { flex: 1, alignItems: 'center', paddingVertical: 14 },
  statDivider: { width: 1, backgroundColor: 'rgba(37,99,235,0.08)' },
  statValue: { fontSize: 18, fontWeight: fontWeight.bold, color: colors.ink950 },
  statLabel: { fontSize: 11, color: colors.ink500, marginTop: 2 },

  sectionTitle: { fontSize: 16, fontWeight: fontWeight.bold, color: colors.ink950, marginTop: 20, marginBottom: 12 },
  empty: { fontSize: 14, color: colors.ink400, textAlign: 'center', marginTop: 20 },

  skillCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(37,99,235,0.08)',
    padding: 14,
    marginBottom: 10,
  },
  skillName: { fontSize: 15, fontWeight: fontWeight.bold, color: colors.ink950, marginBottom: 4 },
  skillDesc: { fontSize: 12, color: colors.ink600, lineHeight: 18, marginBottom: 8 },
  skillMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  skillChip: { fontSize: 10, color: colors.primary, fontWeight: fontWeight.semibold, backgroundColor: colors.primary50, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden' },
  skillPrice: { fontSize: 11, color: colors.ink600, fontWeight: fontWeight.medium },
  skillRating: { fontSize: 11, color: '#f59e0b' },
  skillCalls: { fontSize: 11, color: colors.ink500 },
})
