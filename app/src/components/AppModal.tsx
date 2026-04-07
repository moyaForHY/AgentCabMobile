import React from 'react'
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Pressable,
} from 'react-native'
import { colors, fontWeight } from '../utils/theme'

export type ModalButton = {
  text: string
  onPress?: () => void
  style?: 'default' | 'cancel' | 'destructive'
}

type Props = {
  visible: boolean
  title?: string
  message?: string
  buttons?: ModalButton[]
  onDismiss?: () => void
}

export default function AppModal({ visible, title, message, buttons, onDismiss }: Props) {
  const btns = buttons && buttons.length > 0 ? buttons : [{ text: 'OK', onPress: onDismiss }]

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={s.overlay} onPress={onDismiss}>
        <Pressable style={s.card} onPress={e => e.stopPropagation()}>
          {title ? <Text style={s.title}>{title}</Text> : null}
          {message ? <Text style={s.message}>{message}</Text> : null}
          <View style={[s.btnRow, btns.length === 1 && s.btnRowSingle]}>
            {btns.map((btn, i) => {
              const isCancel = btn.style === 'cancel'
              const isDestructive = btn.style === 'destructive'
              const isPrimary = !isCancel && !isDestructive && btns.length > 1 && i === btns.length - 1
              return (
                <TouchableOpacity
                  key={i}
                  style={[
                    s.btn,
                    isCancel && s.btnCancel,
                    isPrimary && s.btnPrimary,
                    isDestructive && s.btnDestructive,
                    btns.length === 1 && s.btnFull,
                  ]}
                  onPress={() => { btn.onPress?.(); onDismiss?.() }}
                  activeOpacity={0.7}>
                  <Text style={[
                    s.btnText,
                    isCancel && s.btnTextCancel,
                    isPrimary && s.btnTextPrimary,
                    isDestructive && s.btnTextDestructive,
                    btns.length === 1 && s.btnTextPrimary,
                  ]}>{btn.text}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

// Imperative API — use like Alert.alert but with themed modal
type ModalState = {
  visible: boolean
  title?: string
  message?: string
  buttons?: ModalButton[]
  onDismiss?: () => void
}

let _setModal: ((s: ModalState) => void) | null = null

export function AppModalRoot() {
  const [state, setState] = React.useState<ModalState>({ visible: false })
  React.useEffect(() => { _setModal = setState }, [])

  return (
    <AppModal
      {...state}
      onDismiss={() => {
        state.onDismiss?.()
        setState(prev => ({ ...prev, visible: false }))
      }}
    />
  )
}

export function showModal(title: string, message?: string, buttons?: ModalButton[]) {
  if (_setModal) {
    _setModal({ visible: true, title, message, buttons })
  }
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    width: '100%',
    maxWidth: 320,
    paddingTop: 24,
    paddingHorizontal: 20,
    paddingBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 10,
  },
  title: {
    fontSize: 17,
    fontWeight: fontWeight.bold,
    color: colors.ink950,
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: colors.ink600,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  btnRowSingle: {
    justifyContent: 'center',
  },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
  },
  btnCancel: {
    backgroundColor: '#f1f5f9',
  },
  btnPrimary: {
    backgroundColor: colors.primary,
  },
  btnDestructive: {
    backgroundColor: '#fef2f2',
  },
  btnFull: {
    backgroundColor: colors.primary,
  },
  btnText: {
    fontSize: 14,
    fontWeight: fontWeight.semibold,
    color: colors.ink700,
  },
  btnTextCancel: {
    color: colors.ink600,
  },
  btnTextPrimary: {
    color: '#fff',
  },
  btnTextDestructive: {
    color: '#dc2626',
  },
})
