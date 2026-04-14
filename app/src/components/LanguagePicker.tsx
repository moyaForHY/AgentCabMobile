import React from 'react'
import { Modal, Text, TouchableOpacity, StyleSheet, Pressable, NativeModules } from 'react-native'
import Icon from 'react-native-vector-icons/Feather'
import { useI18n, LANG_OPTIONS, isRTLLang, type Lang } from '../i18n'
import { colors, radii, spacing, fontSize } from '../utils/theme'
import { showModal } from './AppModal'

type Props = {
  visible: boolean
  onClose: () => void
}

function restartApp() {
  const DevSettings = NativeModules.DevSettings
  if (DevSettings && typeof DevSettings.reload === 'function') {
    try { DevSettings.reload(); return } catch {}
  }
  const BackHandler = require('react-native').BackHandler
  try { BackHandler.exitApp() } catch {}
}

export default function LanguagePicker({ visible, onClose }: Props) {
  const { t, lang, setLang } = useI18n()

  const handleSelect = (code: Lang) => {
    if (code === lang) { onClose(); return }
    const dirChanged = isRTLLang(code) !== isRTLLang(lang)
    setLang(code)
    onClose()
    if (dirChanged) {
      setTimeout(() => {
        showModal(t.language_restartTitle, t.language_restartMsg, [
          { text: t.language_later, style: 'cancel' },
          { text: t.language_restartNow, onPress: restartApp },
        ])
      }, 250)
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.sheet} onPress={e => e.stopPropagation()}>
          <Text style={s.title}>{t.language}</Text>
          {LANG_OPTIONS.map(opt => {
            const selected = opt.code === lang
            return (
              <TouchableOpacity
                key={opt.code}
                style={[s.row, selected && s.rowSelected]}
                onPress={() => handleSelect(opt.code)}
                activeOpacity={0.7}>
                <Text style={[s.rowText, selected && s.rowTextSelected]}>{opt.native}</Text>
                {selected && <Icon name="check" size={18} color={colors.primary} />}
              </TouchableOpacity>
            )
          })}
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  sheet: {
    backgroundColor: '#fff',
    borderRadius: radii.lg,
    width: '100%',
    maxWidth: 320,
    padding: spacing.md,
  },
  title: {
    fontSize: fontSize.md,
    fontWeight: '600' as const,
    color: colors.ink950,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
  },
  rowSelected: {
    backgroundColor: colors.primary + '10',
  },
  rowText: {
    fontSize: fontSize.md,
    color: colors.ink700,
  },
  rowTextSelected: {
    color: colors.primary,
    fontWeight: '600' as const,
  },
})
