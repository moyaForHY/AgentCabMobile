import React, { useEffect, useState } from 'react'
import {
  Modal,
  View,
  Image,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Dimensions,
  ActivityIndicator,
} from 'react-native'
import Icon from 'react-native-vector-icons/Feather'
import { Text } from 'react-native'
import ReactNativeBlobUtil from 'react-native-blob-util'
import { downloadToDevice } from '../services/fileDownloader'
import { showModal } from './AppModal'
import { getAccessToken } from '../services/storage'
import { useI18n } from '../i18n'

type Props = {
  visible: boolean
  uri: string
  filename?: string
  mimeType?: string
  onClose: () => void
}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window')

export default function ImagePreview({ visible, uri, filename, mimeType, onClose }: Props) {
  const { t } = useI18n()
  const [saving, setSaving] = React.useState(false)
  const [authHeaders, setAuthHeaders] = useState<Record<string, string>>({})
  useEffect(() => { getAccessToken().then(tok => { if (tok) setAuthHeaders({ Authorization: `Bearer ${tok}` }) }) }, [])

  const handleSave = async () => {
    if (saving) return
    setSaving(true)
    try {
      const name = filename || 'image.jpg'
      const srcPath = uri.startsWith('file://') ? uri.replace('file://', '') : null
      if (srcPath) {
        const destPath = `${ReactNativeBlobUtil.fs.dirs.DownloadDir}/${name}`
        const base64 = await ReactNativeBlobUtil.fs.readFile(srcPath, 'base64')
        await ReactNativeBlobUtil.fs.writeFile(destPath, base64, 'base64')
        await ReactNativeBlobUtil.android.actionViewIntent(destPath, mimeType || 'image/jpeg')
      } else {
        const path = await downloadToDevice(uri, name, mimeType || 'image/jpeg')
        if (path) await ReactNativeBlobUtil.android.actionViewIntent(path, mimeType || 'image/jpeg')
      }
    } catch (e: any) {
      showModal(t.preview_saveFailed)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <StatusBar backgroundColor="rgba(0,0,0,0.95)" barStyle="light-content" />
      <View style={s.overlay}>
        {/* Close button */}
        <TouchableOpacity style={s.closeBtn} onPress={onClose} activeOpacity={0.7}>
          <Icon name="x" size={24} color="#fff" />
        </TouchableOpacity>

        {/* Image */}
        <Image
          source={uri.startsWith('file://') ? { uri } : { uri, headers: authHeaders }}
          style={s.image}
          resizeMode="contain"
        />

        {/* Save to gallery */}
        <TouchableOpacity style={s.saveBtn} onPress={handleSave} activeOpacity={0.7} disabled={saving}>
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Icon name="share" size={18} color="#fff" />
              <Text style={s.saveBtnText}>{t.taskResult_openWith}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </Modal>
  )
}

/** Helper to check if a mime type or filename is an image */
export function isImageFile(mimeType?: string, filename?: string): boolean {
  if (mimeType?.startsWith('image/')) return true
  if (filename) {
    const ext = filename.split('.').pop()?.toLowerCase()
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext || '')
  }
  return false
}

/** Helper to check if a file is a PDF */
export function isPdfFile(mimeType?: string, filename?: string): boolean {
  if (mimeType === 'application/pdf') return true
  if (filename?.toLowerCase().endsWith('.pdf')) return true
  return false
}

/** Helper to check if a file is HTML */
export function isHtmlFile(mimeType?: string, filename?: string): boolean {
  if (mimeType === 'text/html') return true
  if (filename?.toLowerCase().endsWith('.html') || filename?.toLowerCase().endsWith('.htm')) return true
  return false
}

/** Check if file can be previewed in-app */
export function isPreviewable(mimeType?: string, filename?: string): boolean {
  return isImageFile(mimeType, filename) || isPdfFile(mimeType, filename) || isHtmlFile(mimeType, filename)
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtn: {
    position: 'absolute',
    top: 48,
    right: 16,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: SCREEN_W,
    height: SCREEN_H * 0.7,
  },
  saveBtn: {
    position: 'absolute',
    bottom: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
})
