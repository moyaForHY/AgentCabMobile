import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { colors, fontWeight } from '../utils/theme'
import type { Review } from '../services/api'

function renderStars(rating: number): string {
  return '★'.repeat(rating) + '☆'.repeat(5 - rating)
}

export default function ReviewCard({ review }: { review: Review }) {
  const date = new Date(review.created_at).toLocaleDateString('zh-CN')

  return (
    <View style={s.card}>
      <View style={s.header}>
        <Text style={s.name}>{review.user_name || 'User'}</Text>
        <Text style={s.date}>{date}</Text>
      </View>
      <Text style={s.stars}>{renderStars(review.rating)}</Text>
      {review.comment ? <Text style={s.comment}>{review.comment}</Text> : null}
    </View>
  )
}

const s = StyleSheet.create({
  card: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(37, 99, 235, 0.06)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  name: {
    fontSize: 13,
    fontWeight: fontWeight.semibold,
    color: colors.ink950,
  },
  date: {
    fontSize: 11,
    color: colors.ink500,
  },
  stars: {
    fontSize: 14,
    color: '#f59e0b',
    marginBottom: 4,
  },
  comment: {
    fontSize: 13,
    color: colors.ink700,
    lineHeight: 18,
  },
})
