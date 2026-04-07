import React, { useEffect, useState } from 'react'
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Dimensions,
  ActivityIndicator,
} from 'react-native'
import Pdf from 'react-native-pdf'
import Icon from 'react-native-vector-icons/Feather'
import ReactNativeBlobUtil from 'react-native-blob-util'
import { downloadToDevice } from '../services/fileDownloader'
import { showModal } from './AppModal'
import { getAccessToken } from '../services/storage'
import { isChinese } from '../utils/i18n'

const { width: W, height: H } = Dimensions.get('window')

type Props = {
  visible: boolean
  uri: string
  filename?: string
  onClose: () => void
}

export default function PdfPreview({ visible, uri, filename, onClose }: Props) {
  const [saving, setSaving] = useState(false)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)

  const handleSave = async () => {
    if (saving) return
    setSaving(true)
    try {
      const name = filename || 'document.pdf'
      const srcPath = uri.replace('file://', '')
      if (uri.startsWith('http')) {
        const path = await downloadToDevice(uri, name, 'application/pdf')
        if (path) await ReactNativeBlobUtil.android.actionViewIntent(path, 'application/pdf')
      } else {
        const destPath = `${ReactNativeBlobUtil.fs.dirs.DownloadDir}/${name}`
        const base64 = await ReactNativeBlobUtil.fs.readFile(srcPath, 'base64')
        await ReactNativeBlobUtil.fs.writeFile(destPath, base64, 'base64')
        await ReactNativeBlobUtil.android.actionViewIntent(destPath, 'application/pdf')
      }
    } catch (e: any) {
      console.log('[PdfSave] error:', e?.message)
      showModal(isChinese() ? '保存失败' : 'Failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <StatusBar backgroundColor="#1a1a1a" barStyle="light-content" />
      <View style={s.container}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
            <Icon name="x" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={s.title} numberOfLines={1}>{filename || 'PDF'}</Text>
          {totalPages > 0 && (
            <Text style={s.pageInfo}>{page}/{totalPages}</Text>
          )}
        </View>

        {/* PDF */}
        <Pdf
          source={{ uri }}
          style={s.pdf}
          onLoadComplete={(numberOfPages) => setTotalPages(numberOfPages)}
          onPageChanged={(p) => setPage(p)}
          onError={() => showModal(isChinese() ? '加载失败' : 'Load failed')}
          enablePaging
        />

        {/* Save button */}
        <TouchableOpacity style={s.saveBtn} onPress={handleSave} activeOpacity={0.7} disabled={saving}>
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Icon name="share" size={18} color="#fff" />
              <Text style={s.saveBtnText}>{isChinese() ? '用其他应用打开' : 'Open with...'}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </Modal>
  )
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 12,
    gap: 12,
  },
  title: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  pageInfo: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
  },
  pdf: {
    flex: 1,
    width: W,
  },
  saveBtn: {
    position: 'absolute',
    bottom: 32,
    alignSelf: 'center',
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
