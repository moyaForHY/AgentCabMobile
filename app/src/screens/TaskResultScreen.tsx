import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native'
import { colors, fontWeight } from '../utils/theme'
import { useI18n } from '../i18n'
import { fetchCall } from '../services/api'
import { writeClipboard, shareText } from '../services/deviceCapabilities'
import { executeActions, type Action } from '../services/actionExecutor'
import DownloadButton from '../components/DownloadButton'

export default function TaskResultScreen({ route }: any) {
  const { t } = useI18n()
  const { taskId } = route.params
  const [call, setCall] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      try {
        const data = await fetchCall(taskId)
        setCall(data)
      } catch {}
      setLoading(false)
    })()
  }, [taskId])

  // Backend decides if actions can be executed
  const actionsAllowed = call?.actions_allowed === true

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color={colors.primary} /></View>
  }

  if (!call) {
    return (
      <View style={s.center}>
        <Text style={s.errorText}>{t.failedToLoad}</Text>
      </View>
    )
  }

  const isOk = call.status === 'success' || call.status === 'completed'
  const isFailed = call.status === 'failed'
  const statusColor = isOk ? '#059669' : isFailed ? '#dc2626' : '#2563eb'
  const statusBg = isOk ? '#ecfdf5' : isFailed ? '#fef2f2' : '#eff6ff'
  const statusLabel = isOk ? t.success : isFailed ? t.failed : call.status

  const output = call.output_data || call.output
  const outputFiles = call.output_files || []
  const inputFiles = call.input_files || []
  const input = call.input_data

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

      {/* Status badge */}
      <View style={[s.statusBadge, { backgroundColor: statusBg }]}>
        <Text style={[s.statusText, { color: statusColor }]}>{statusLabel}</Text>
      </View>

      {/* Info card */}
      <View style={s.card}>
        <InfoRow label={t.callId} value={call.id} mono />
        <View style={s.divider} />
        <InfoRow label={t.status} value={statusLabel} />
        <View style={s.divider} />
        <InfoRow label={t.cost} value={`${call.actual_cost ?? call.credits_cost} ${t.credits}`} />
        {call.duration_ms != null && (
          <>
            <View style={s.divider} />
            <InfoRow label={t.duration} value={`${(call.duration_ms / 1000).toFixed(1)}s`} />
          </>
        )}
        {call.started_at && (
          <>
            <View style={s.divider} />
            <InfoRow label={t.time} value={new Date(call.started_at).toLocaleString('zh-CN')} />
          </>
        )}
      </View>

      {/* Error */}
      {call.error_message && (
        <View style={s.errorCard}>
          <Text style={s.sectionTitle}>{t.error}</Text>
          <Text style={s.errorMsg}>{call.error_message}</Text>
        </View>
      )}

      {/* Actions — only if backend allows */}
      {actionsAllowed && output?.actions && Array.isArray(output.actions) && output.actions.length > 0 && (
        <ActionsSection actions={output.actions} t={t} />
      )}

      {/* Output Files */}
      {outputFiles.length > 0 && (
        <View style={s.card}>
          <Text style={s.sectionTitle}>{t.outputFiles}</Text>
          {outputFiles.map((file: any) => (
            <View key={file.id} style={s.fileRow}>
              <View style={s.fileInfo}>
                <Text style={s.fileName} numberOfLines={1}>{file.filename || file.original_filename}</Text>
                <Text style={s.fileMeta}>{file.mime_type}</Text>
              </View>
              <DownloadButton
                url={`https://www.agentcab.ai/v1/files/${file.id}`}
                filename={file.filename || file.original_filename}
                mimeType={file.mime_type}
              />
            </View>
          ))}
        </View>
      )}

      {/* Output Data */}
      {output && (
        <View style={s.card}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>{t.output}</Text>
            <View style={s.actionRow}>
              <TouchableOpacity
                onPress={() => { writeClipboard(typeof output === 'string' ? output : JSON.stringify(output, null, 2)); Alert.alert(t.copied) }}
                activeOpacity={0.6}>
                <Text style={s.actionText}>{t.copy}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => shareText(typeof output === 'string' ? output : JSON.stringify(output, null, 2))}
                activeOpacity={0.6}>
                <Text style={s.actionText}>Share</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={s.codeBlock}>
            <Text style={s.codeText}>
              {typeof output === 'string' ? output : JSON.stringify(output, null, 2)}
            </Text>
          </View>
        </View>
      )}

      {/* Input Files */}
      {inputFiles.length > 0 && (
        <View style={s.card}>
          <Text style={s.sectionTitle}>{t.inputFiles}</Text>
          {inputFiles.map((file: any) => (
            <View key={file.id} style={s.fileRow}>
              <View style={s.fileInfo}>
                <Text style={s.fileName} numberOfLines={1}>{file.filename || file.original_filename}</Text>
                <Text style={s.fileMeta}>{file.mime_type}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Input Data */}
      {input && (
        <View style={s.card}>
          <Text style={s.sectionTitle}>{t.input}</Text>
          <View style={s.codeBlock}>
            <Text style={s.codeText}>
              {typeof input === 'string' ? input : JSON.stringify(input, null, 2)}
            </Text>
          </View>
        </View>
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
  )
}

function ActionsSection({ actions, t }: { actions: Action[]; t: any }) {
  const [executing, setExecuting] = useState(false)
  const [executed, setExecuted] = useState(false)

  const handleExecute = async () => {
    setExecuting(true)
    try {
      const results = await executeActions(actions)
      const failed = results.filter(r => !r.success)
      if (failed.length === 0) {
        Alert.alert('✓', `${results.length} actions executed`)
      } else {
        Alert.alert('Done', `${results.length - failed.length} succeeded, ${failed.length} failed`)
      }
      setExecuted(true)
    } catch (err: any) {
      Alert.alert(t.errorTitle, err.message)
    } finally {
      setExecuting(false)
    }
  }

  return (
    <View style={s.card}>
      <Text style={s.sectionTitle}>Actions ({actions.length})</Text>
      {actions.map((action, i) => (
        <View key={i} style={s.actionItem}>
          <View style={s.actionDot} />
          <Text style={s.actionLabel}>
            {action.type === 'confirm_actions' ? action.message : `${action.type}: ${action.path || action.text || action.title || action.url || action.packageName || ''}`}
          </Text>
        </View>
      ))}
      <TouchableOpacity
        style={[s.executeBtn, (executing || executed) && s.executeBtnDone]}
        onPress={handleExecute}
        disabled={executing || executed}
        activeOpacity={0.7}>
        {executing ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={s.executeBtnText}>{executed ? '✓ Executed' : 'Execute All'}</Text>
        )}
      </TouchableOpacity>
    </View>
  )
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={s.infoRow}>
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={[s.infoValue, mono && s.mono]} numberOfLines={1}>{value}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 16, paddingTop: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Status
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 14,
  },
  statusText: {
    fontSize: 13,
    fontWeight: fontWeight.bold,
  },

  // Card
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.08)',
    marginBottom: 12,
    overflow: 'hidden',
  },
  divider: { height: 1, backgroundColor: 'rgba(37, 99, 235, 0.06)', marginLeft: 16 },

  // Info rows
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  infoLabel: { fontSize: 13, color: colors.ink500, fontWeight: fontWeight.medium },
  infoValue: { fontSize: 13, color: colors.ink950, fontWeight: fontWeight.semibold, maxWidth: '60%', textAlign: 'right' },
  mono: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 11 },

  // Section
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingRight: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: fontWeight.bold,
    color: colors.ink950,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 14,
    paddingTop: 14,
  },
  actionText: {
    fontSize: 13,
    fontWeight: fontWeight.semibold,
    color: '#2563eb',
  },

  // Error
  errorCard: {
    backgroundColor: '#fef2f2',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#fecaca',
    marginBottom: 12,
  },
  errorMsg: {
    fontSize: 13,
    color: '#dc2626',
    lineHeight: 18,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  errorText: { fontSize: 14, color: '#dc2626' },

  // Actions
  actionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  actionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#2563eb',
    marginTop: 6,
    marginRight: 10,
  },
  actionLabel: {
    fontSize: 13,
    color: colors.ink700,
    flex: 1,
    lineHeight: 18,
  },
  executeBtn: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 16,
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  executeBtnDone: {
    backgroundColor: '#059669',
  },
  executeBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: fontWeight.bold,
  },

  // Files
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(37, 99, 235, 0.06)',
  },
  fileInfo: { flex: 1, marginRight: 12 },
  fileName: { fontSize: 13, fontWeight: fontWeight.semibold, color: colors.ink950 },
  fileMeta: { fontSize: 11, color: colors.ink500, marginTop: 2 },
  downloadBtn: { fontSize: 13, fontWeight: fontWeight.semibold, color: '#2563eb' },

  // Code block
  codeBlock: {
    backgroundColor: '#f1f5f9',
    marginHorizontal: 12,
    marginBottom: 12,
    borderRadius: 8,
    padding: 12,
  },
  codeText: {
    fontSize: 12,
    color: colors.ink800,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 18,
  },
})
