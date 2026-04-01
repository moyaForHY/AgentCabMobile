import React from 'react'
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native'
import { colors, fontWeight } from '../utils/theme'
import { SITE_URL, type Skill } from '../services/api'
import { isChinese } from '../utils/i18n'

const ACCENT_COLORS = ['#3b82f6', '#8b5cf6', '#f97316', '#10b981', '#ec4899', '#06b6d4']

type Props = {
  skill: Skill
  index?: number
  onPress: () => void
  showAuthor?: boolean
}

export default function SkillCard({ skill, index = 0, onPress, showAuthor = true }: Props) {
  const avatarUrl = skill.provider_avatar_url && skill.provider_avatar_url.length > 0
    ? (skill.provider_avatar_url.startsWith('http') ? skill.provider_avatar_url : `${SITE_URL}${skill.provider_avatar_url}`)
    : null

  return (
    <TouchableOpacity style={s.card} onPress={onPress} activeOpacity={0.8}>
      <View style={[s.accent, { backgroundColor: ACCENT_COLORS[index % ACCENT_COLORS.length] }]} />
      <View style={s.body}>
        {/* Name */}
        <Text style={s.name} numberOfLines={1}>{skill.name}</Text>

        {/* Author row */}
        {showAuthor && skill.provider_name ? (
          <View style={s.authorRow}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={s.authorAvatar} />
            ) : (
              <View style={s.authorAvatarFallback}>
                <Text style={s.authorAvatarLetter}>{skill.provider_name[0].toUpperCase()}</Text>
              </View>
            )}
            <Text style={s.authorName} numberOfLines={1}>{skill.provider_name}</Text>
          </View>
        ) : null}

        {/* Description */}
        {skill.description ? <Text style={s.desc} numberOfLines={2}>{skill.description}</Text> : null}

        {/* Footer */}
        <View style={s.footer}>
          <View style={s.metaRow}>
            {skill.category ? <Text style={s.chip}>{skill.category}</Text> : null}
            {skill.rating > 0 ? <Text style={s.rating}>{'★'} {skill.rating.toFixed(1)}</Text> : null}
            {skill.call_count > 0 ? <Text style={s.calls}>{skill.call_count} {isChinese() ? '次' : 'calls'}</Text> : null}
          </View>
          <View style={s.pricePill}>
            <Text style={s.priceText}>{skill.price_credits}c</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  )
}

const s = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(37,99,235,0.06)',
    marginBottom: 10,
    overflow: 'hidden',
  },
  accent: { width: 4, borderTopLeftRadius: 14, borderBottomLeftRadius: 14 },
  body: { flex: 1, padding: 14 },

  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  authorAvatar: { width: 18, height: 18, borderRadius: 9 },
  authorAvatarFallback: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.primary50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  authorAvatarLetter: { fontSize: 9, fontWeight: fontWeight.bold, color: colors.primary },
  authorName: { fontSize: 11, color: colors.ink500, fontWeight: fontWeight.medium, flex: 1 },

  name: { fontSize: 15, fontWeight: fontWeight.semibold, color: colors.ink950 },
  desc: { fontSize: 12, color: colors.ink500, marginTop: 3, lineHeight: 17 },

  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  chip: {
    fontSize: 10,
    fontWeight: fontWeight.semibold,
    color: colors.primary,
    backgroundColor: '#eff6ff',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  rating: { fontSize: 11, color: '#f59e0b' },
  calls: { fontSize: 11, color: colors.ink400 },
  pricePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: colors.primary,
  },
  priceText: { fontSize: 12, fontWeight: fontWeight.semibold, color: '#fff' },
})
