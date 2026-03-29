import React, { useState } from 'react'
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator } from 'react-native'
import { colors, fontWeight } from '../utils/theme'
import { useI18n } from '../i18n'
import { downloadToDevice } from '../services/fileDownloader'

type Status = 'idle' | 'downloading' | 'done' | 'failed'

type Props = {
  url: string
  filename: string
  mimeType?: string
}

export default function DownloadButton({ url, filename, mimeType }: Props) {
  const { t } = useI18n()
  const [status, setStatus] = useState<Status>('idle')

  const handlePress = async () => {
    if (status === 'downloading' || status === 'done') return
    setStatus('downloading')
    const ok = await downloadToDevice(url, filename, mimeType)
    setStatus(ok ? 'done' : 'failed')
  }

  const label = {
    idle: t.download,
    downloading: t.saving,
    done: t.saved,
    failed: t.retry,
  }[status]

  const textColor = {
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
