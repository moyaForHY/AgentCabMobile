import React, { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
import { colors, fontWeight } from '../utils/theme'
import { useI18n } from '../i18n'
import { showModal } from './AppModal'
import {
  createReview,
  fetchMyReview,
  updateReview as apiUpdateReview,
  deleteReview as apiDeleteReview,
  type Review,
} from '../services/api'

type Props = {
  skillId: string
  onSubmitted?: () => void
}

export default function ReviewInput({ skillId, onSubmitted }: Props) {
  const { t } = useI18n()
  const [myReview, setMyReview] = useState<Review | null>(null)
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    fetchMyReview(skillId)
      .then(r => {
        if (r) {
          setMyReview(r)
          setRating(r.rating)
          setComment(r.comment || '')
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [skillId])

  const handleSubmit = useCallback(async () => {
    if (rating === 0) {
      showModal(t.selectRating)
      return
    }
    setSubmitting(true)
    try {
      if (myReview) {
        const updated = await apiUpdateReview(skillId, rating, comment || undefined)
        setMyReview(updated)
        setEditing(false)
        showModal(t.reviewUpdated)
      } else {
        const created = await createReview(skillId, rating, comment || undefined)
        setMyReview(created)
        showModal(t.reviewSubmitted)
      }
      onSubmitted?.()
    } catch (err: any) {
      showModal(t.errorTitle, err.message)
    } finally {
      setSubmitting(false)
    }
  }, [skillId, rating, comment, myReview, onSubmitted, t])

  const handleDelete = useCallback(() => {
    showModal(t.deleteReview, t.deleteReviewConfirm, [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.delete,
        style: 'destructive',
        onPress: async () => {
          try {
            await apiDeleteReview(skillId)
            setMyReview(null)
            setRating(0)
            setComment('')
            setEditing(false)
            showModal(t.reviewDeleted)
            onSubmitted?.()
          } catch (err: any) {
            showModal(t.errorTitle, err.message)
          }
        },
      },
    ])
  }, [skillId, onSubmitted, t])

  if (loading) {
    return (
      <View style={s.card}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    )
  }

  // Show existing review (not editing)
  if (myReview && !editing) {
    return (
      <View style={s.card}>
        <Text style={s.title}>{t.yourReview}</Text>
        <Text style={s.starsDisplay}>{'★'.repeat(myReview.rating) + '☆'.repeat(5 - myReview.rating)}</Text>
        {myReview.comment ? <Text style={s.commentDisplay}>{myReview.comment}</Text> : null}
        <View style={s.actionRow}>
          <TouchableOpacity style={s.actionBtn} onPress={() => setEditing(true)} activeOpacity={0.7}>
            <Text style={s.actionBtnText}>{t.editReview}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.actionBtn, s.deleteBtn]} onPress={handleDelete} activeOpacity={0.7}>
            <Text style={s.deleteBtnText}>{t.deleteReview}</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  // Write / edit form
  return (
    <View style={s.card}>
      <Text style={s.title}>{myReview ? t.editReview : t.writeReview}</Text>

      {/* Star selector */}
      <View style={s.starsRow}>
        {[1, 2, 3, 4, 5].map(i => (
          <TouchableOpacity key={i} onPress={() => setRating(i)} activeOpacity={0.6}>
            <Text style={[s.star, i <= rating && s.starFilled]}>{i <= rating ? '★' : '☆'}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Comment input */}
      <TextInput
        style={s.input}
        placeholder={t.reviewPlaceholder}
        placeholderTextColor={colors.ink400}
        value={comment}
        onChangeText={setComment}
        multiline
        maxLength={500}
      />

      {/* Buttons */}
      <View style={s.btnRow}>
        {editing && (
          <TouchableOpacity
            style={s.cancelBtn}
            onPress={() => {
              setEditing(false)
              setRating(myReview?.rating || 0)
              setComment(myReview?.comment || '')
            }}
            activeOpacity={0.7}>
            <Text style={s.cancelBtnText}>{t.cancel}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[s.submitBtn, submitting && { opacity: 0.6 }]}
          onPress={handleSubmit}
          disabled={submitting}
          activeOpacity={0.7}>
          {submitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={s.submitBtnText}>{myReview ? t.updateReview : t.submitReview}</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.08)',
    marginBottom: 14,
  },
  title: {
    fontSize: 14,
    fontWeight: fontWeight.bold,
    color: colors.ink950,
    marginBottom: 12,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  star: {
    fontSize: 28,
    color: colors.ink400,
  },
  starFilled: {
    color: '#f59e0b',
  },
  input: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.08)',
    padding: 12,
    fontSize: 14,
    color: colors.ink950,
    minHeight: 60,
    textAlignVertical: 'top',
    marginBottom: 12,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'flex-end',
  },
  submitBtn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: fontWeight.bold,
  },
  cancelBtn: {
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: colors.ink600,
    fontSize: 14,
    fontWeight: fontWeight.semibold,
  },
  // Existing review display
  starsDisplay: {
    fontSize: 18,
    color: '#f59e0b',
    marginBottom: 6,
  },
  commentDisplay: {
    fontSize: 13,
    color: colors.ink700,
    lineHeight: 18,
    marginBottom: 12,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: fontWeight.semibold,
    color: colors.primary,
  },
  deleteBtn: {
    backgroundColor: '#fef2f2',
  },
  deleteBtnText: {
    fontSize: 13,
    fontWeight: fontWeight.semibold,
    color: '#dc2626',
  },
})
