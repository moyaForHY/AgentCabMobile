import React, { useState, useEffect } from 'react'
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator } from 'react-native'
import ReactNativeBlobUtil from 'react-native-blob-util'
import { colors, fontWeight } from '../utils/theme'
import { useI18n } from '../i18n'
import { downloadToDevice, openFile } from '../services/fileDownloader'

type Status = 'idle' | 'checking' | 'downloading' | 'done' | 'failed'

type Props = {
  url: string
  filename: string
  mimeType?: string
}

export default function DownloadButton({ url, filename, mimeType }: Props) {
  const { t } = useI18n()
  const [status, setStatus] = useState<Status>('checking')

  const filePath = `/storage/emulated/0/Download/${filename}`

  // Check if file already exists in Downloads
  useEffect(() => {
    ReactNativeBlobUtil.fs.exists(filePath)
      .then(exists => setStatus(exists ? 'done' : 'idle'))
      .catch(() => setStatus('idle'))
  }, [filePath])

  const handlePress = async () => {
    if (status === 'downloading' || status === 'checking') return
    if (status === 'done') {
      try { await openFile(filePath, mimeType) } catch {}
      return
    }
    setStatus('downloading')
    const path = await downloadToDevice(url, filename, mimeType)
    setStatus(path ? 'done' : 'failed')
  }

  const label = {
    checking: '...',
    idle: t.download,
    downloading: t.saving,
    done: t.open || 'Open',
    failed: t.retry,
  }[status]

  const textColor = {
    checking: colors.ink500,
    idle: '#2563eb',
    downloading: colors.ink500,
    done: '#059669',
    failed: '#dc2626',
  }[status]

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.6} style={s.btn}>
      {status === 'downloading' ? (
        <ActivityIndicator size="small" color={colors.ink500} style={{ marginRight: 4 }} />
      ) : null}
      <Text style={[s.text, { color: textColor }]}>{label}</Text>
    </TouchableOpacity>
  )
}

const s = StyleSheet.create({
  btn: { flexDirection: 'row', alignItems: 'center' },
  text: { fontSize: 13, fontWeight: fontWeight.semibold },
})
