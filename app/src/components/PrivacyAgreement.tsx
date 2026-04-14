import React, { useState, useEffect } from 'react'
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Linking,
  BackHandler,
} from 'react-native'
import { colors, fontWeight, radii } from '../utils/theme'
import { privacyStrings } from '../i18n/privacy'
import AsyncStorage from '@react-native-async-storage/async-storage'

const PRIVACY_ACCEPTED_KEY = 'privacy_accepted_v1'
const PRIVACY_URL = 'https://www.agentcab.ai/privacy'

type Props = {
  onAccepted: () => void
}

export default function PrivacyAgreement({ onAccepted }: Props) {
  const [visible, setVisible] = useState(false)
  const [checked, setChecked] = useState(false)
  const ps = privacyStrings()

  useEffect(() => {
    AsyncStorage.getItem(PRIVACY_ACCEPTED_KEY).then(v => {
      if (v === '1') {
        onAccepted()
      } else {
        setVisible(true)
      }
    })
  }, [])

  // Prevent back button dismissing
  useEffect(() => {
    if (!visible) return
    const handler = BackHandler.addEventListener('hardwareBackPress', () => true)
    return () => handler.remove()
  }, [visible])

  const handleAccept = () => {
    if (!checked) return
    AsyncStorage.setItem(PRIVACY_ACCEPTED_KEY, '1')
    setVisible(false)
    onAccepted()
  }

  const handleDecline = () => {
    BackHandler.exitApp()
  }

  if (!visible) return null

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => {}}>
      <View style={s.overlay}>
        <View style={s.card}>
          <Text style={s.title}>{ps.title}</Text>

          <ScrollView style={s.scroll} showsVerticalScrollIndicator>
            <Text style={s.body}>{ps.body}</Text>
            <TouchableOpacity onPress={() => Linking.openURL(PRIVACY_URL)}>
              <Text style={s.link}>{PRIVACY_URL}</Text>
            </TouchableOpacity>
          </ScrollView>

          <TouchableOpacity
            style={s.checkRow}
            onPress={() => setChecked(!checked)}
            activeOpacity={0.7}
          >
            <View style={[s.checkbox, checked && s.checkboxChecked]}>
              {checked && <Text style={s.checkmark}>{'✓'}</Text>}
            </View>
            <Text style={s.checkLabel}>{ps.checkLabel}</Text>
          </TouchableOpacity>

          <View style={s.btnRow}>
            <TouchableOpacity
              style={s.btnDecline}
              onPress={handleDecline}
              activeOpacity={0.7}
            >
              <Text style={s.btnDeclineText}>{ps.decline}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.btnAccept, !checked && s.btnDisabled]}
              onPress={handleAccept}
              disabled={!checked}
              activeOpacity={0.7}
            >
              <Text style={[s.btnAcceptText, !checked && s.btnDisabledText]}>
                {ps.accept}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    width: '100%',
    maxWidth: 380,
    maxHeight: '80%',
    paddingTop: 24,
    paddingHorizontal: 20,
    paddingBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 10,
  },
  title: {
    fontSize: 20,
    fontWeight: fontWeight.bold,
    color: colors.ink950,
    textAlign: 'center',
    marginBottom: 16,
  },
  scroll: {
    maxHeight: 340,
    marginBottom: 16,
  },
  body: {
    fontSize: 13,
    color: colors.ink700,
    lineHeight: 20,
  },
  link: {
    fontSize: 13,
    color: colors.primary,
    marginTop: 4,
    marginBottom: 8,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.ink400,
    marginEnd: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkmark: {
    color: '#fff',
    fontSize: 13,
    fontWeight: fontWeight.bold,
  },
  checkLabel: {
    flex: 1,
    fontSize: 13,
    color: colors.ink700,
    lineHeight: 18,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  btnDecline: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: radii.md,
    alignItems: 'center',
    backgroundColor: colors.sand100,
  },
  btnDeclineText: {
    fontSize: 14,
    fontWeight: fontWeight.semibold,
    color: colors.ink600,
  },
  btnAccept: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: radii.md,
    alignItems: 'center',
    backgroundColor: colors.primary,
  },
  btnAcceptText: {
    fontSize: 14,
    fontWeight: fontWeight.semibold,
    color: '#fff',
  },
  btnDisabled: {
    backgroundColor: colors.sand200,
  },
  btnDisabledText: {
    color: colors.ink400,
  },
})
