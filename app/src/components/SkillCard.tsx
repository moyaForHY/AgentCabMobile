import React from 'react'
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native'
import { colors, fontWeight, shadows, radii, spacing } from '../utils/theme'
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
    <TouchableOpacity style={s.cardShadow} onPress={onPress} activeOpacity={0.8}>
      <View style={s.card}>
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
      </View>
    </TouchableOpacity>
  )
}

const s = StyleSheet.create({
  cardShadow: {
    borderRadius: radii.lg,
    marginBottom: 12,
    ...shadows.md,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  accent: { width: 4, borderTopLeftRadius: radii.lg, borderBottomLeftRadius: radii.lg },
  body: { flex: 1, padding: spacing.md },

  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  authorAvatar: { width: 20, height: 20, borderRadius: 10 },
  authorAvatarFallback: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  authorAvatarLetter: { fontSize: 10, fontWeight: fontWeight.bold, color: colors.primary },
  authorName: { fontSize: 12, color: colors.ink600, fontWeight: fontWeight.medium, flex: 1 },

  name: { fontSize: 16, fontWeight: fontWeight.bold, color: colors.ink950, letterSpacing: -0.2 },
  desc: { fontSize: 13, color: colors.ink600, marginTop: 4, lineHeight: 18 },

  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  chip: {
    fontSize: 10,
    fontWeight: fontWeight.semibold,
    color: colors.primary,
    backgroundColor: colors.primary50,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.xs,
    overflow: 'hidden',
    letterSpacing: 0.2,
  },
  rating: { fontSize: 12, color: '#f59e0b', fontWeight: fontWeight.medium },
  calls: { fontSize: 11, color: colors.ink500 },
  pricePill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radii.lg,
    backgroundColor: colors.primary,
  },
  priceText: { fontSize: 12, fontWeight: fontWeight.semibold, color: colors.white },
})
