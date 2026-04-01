import React, { useEffect, useState, useRef } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native'
import { colors, fontWeight } from '../utils/theme'
import { useI18n } from '../i18n'
import { isChinese } from '../utils/i18n'
import { fetchCall, fetchSkillById } from '../services/api'
import { storage } from '../services/storage'
import { writeClipboard, shareText } from '../services/deviceCapabilities'
import { executeActions, type Action } from '../services/actionExecutor'
import { batchDeletePhotos } from '../services/photoScanner'
import { showModal } from '../components/AppModal'
import DownloadButton from '../components/DownloadButton'
import { SkeletonBox } from '../components/Skeleton'
import ReviewInput from '../components/ReviewInput'

function formatElapsed(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return m > 0 ? `${m}m${s.toString().padStart(2, '0')}s` : `${s}s`
}

function formatEstimate(avg: string): string {
  const sec = parseFloat(avg.replace('~', '').replace('s', ''))
  return sec < 60 ? `${Math.round(sec)}s` : `${Math.round(sec / 60)}min`
}

export default function TaskResultScreen({ route }: any) {
  const { t } = useI18n()
  const { taskId } = route.params
  const [call, setCall] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const [elapsed, setElapsed] = useState(0)
  const [estimatedTime, setEstimatedTime] = useState<string | null>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const cacheKey = `task_result_${taskId}`
    ;(async () => {
      // 1. Load from cache first
      try {
        const cached = await storage.getStringAsync(cacheKey)
        if (cached) {
          setCall(JSON.parse(cached))
          setLoading(false)
        }
      } catch {}

      // 2. Fetch fresh data from API
      try {
        const data = await fetchCall(taskId)
        setCall(data)
        // 3. Save to cache
        storage.setStringAsync(cacheKey, JSON.stringify(data)).catch(() => {})
      } catch {}
      setLoading(false)
    })()
  }, [taskId])

  const isPending = call?.status === 'pending' || call?.status === 'processing' || call?.status === 'running'

  // Poll for updates while pending/processing
  useEffect(() => {
    if (!isPending) {
      if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null }
      return
    }
    pollingRef.current = setInterval(async () => {
      try {
        const data = await fetchCall(taskId)
        setCall(data)
        const cacheKey = `task_result_${taskId}`
        storage.setStringAsync(cacheKey, JSON.stringify(data)).catch(() => {})
      } catch {}
    }, 3000)
    return () => { if (pollingRef.current) clearInterval(pollingRef.current) }
  }, [isPending, taskId])

  // Elapsed time counter while pending/processing
  useEffect(() => {
    if (!isPending || !call?.started_at) {
      if (elapsedRef.current) { clearInterval(elapsedRef.current); elapsedRef.current = null }
      return
    }
    const update = () => setElapsed(Math.floor((Date.now() - new Date(call.started_at).getTime()) / 1000))
    update()
    elapsedRef.current = setInterval(update, 1000)
    return () => { if (elapsedRef.current) clearInterval(elapsedRef.current) }
  }, [isPending, call?.started_at])

  // Fetch estimated time from skill
  useEffect(() => {
    if (!call?.skill_id || estimatedTime) return
    fetchSkillById(call.skill_id).then(skill => {
      if (skill.avg_response_time) setEstimatedTime(skill.avg_response_time)
    }).catch(() => {})
  }, [call?.skill_id])

  // Backend decides if actions can be executed
  const actionsAllowed = call?.actions_allowed === true

  if (loading) {
    return (
      <View style={[s.container, { padding: 16 }]}>
        <SkeletonBox width={80} height={28} borderRadius={8} />
        <View style={{ height: 12 }} />
        <SkeletonBox width={'100%' as any} height={80} borderRadius={14} />
        <View style={{ height: 12 }} />
        <SkeletonBox width={'100%' as any} height={120} borderRadius={14} />
        <View style={{ height: 12 }} />
        <SkeletonBox width={'100%' as any} height={200} borderRadius={14} />
      </View>
    )
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

      {/* Processing indicator */}
      {isPending && (
        <View style={s.processingCard}>
          <View style={s.processingHeader}>
            <ActivityIndicator size="small" color="#2563eb" style={{ marginRight: 8 }} />
            <Text style={s.processingTitle}>
              {isChinese() ? '处理中' : 'Processing'} · {formatElapsed(elapsed)}
              {estimatedTime ? ` (${isChinese() ? '预计' : 'est.'} ~${formatEstimate(estimatedTime)})` : ''}
            </Text>
          </View>
          <Text style={s.processingHint}>
            {isChinese() ? '如果长时间无响应，请尝试刷新' : 'Try refreshing if no response for a long time'}
          </Text>
        </View>
      )}

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

      {/* Actions */}
      {output?.actions && Array.isArray(output.actions) && output.actions.length > 0 && (
        <ActionsSection actions={output.actions} t={t} taskId={taskId} />
      )}

      {/* Review — for completed tasks */}
      {isOk && call.skill_id && (
        <ReviewInput skillId={call.skill_id} />
      )}

      {/* Output Files */}
      {outputFiles.length > 0 && (
        <View style={s.card}>
          <Text style={s.sectionTitle}>{t.outputFiles}</Text>
          {outputFiles.map((file: any, idx: number) => {
            const orig = file.filename || file.original_filename || 'file'
            const ext = orig.includes('.') ? '.' + orig.split('.').pop() : ''
            const shortId = (call.id || '').slice(0, 8)
            const downloadName = `${shortId}_${idx}${ext}`
            return (
              <View key={file.id} style={s.fileRow}>
                <View style={s.fileInfo}>
                  <Text style={s.fileName} numberOfLines={1}>{downloadName}</Text>
                  <Text style={s.fileMeta}>{file.mime_type}</Text>
                </View>
                <DownloadButton
                  url={`https://www.agentcab.ai/v1/files/${file.id}`}
                  filename={downloadName}
                  mimeType={file.mime_type}
                />
              </View>
            )
          })}
        </View>
      )}

      {/* Output Data — Beautified */}
      {output && typeof output === 'object' && <OutputBeautified output={output} t={t} />}

      {/* Output Data — Raw */}
      {output && (
        <CollapsibleSection
          title={t.rawData}
          right={
            <View style={s.actionRow}>
              <TouchableOpacity
                onPress={() => { writeClipboard(typeof output === 'string' ? output : JSON.stringify(output, null, 2)); showModal(t.copied) }}
                activeOpacity={0.6}>
                <Text style={s.actionText}>{t.copy}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => shareText(typeof output === 'string' ? output : JSON.stringify(output, null, 2))}
                activeOpacity={0.6}>
                <Text style={s.actionText}>{t.share}</Text>
              </TouchableOpacity>
            </View>
          }>
          <TruncatedCode text={typeof output === 'string' ? output : JSON.stringify(output, null, 2)} />
        </CollapsibleSection>
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
        <CollapsibleSection title={t.input}>
          <TruncatedCode text={typeof input === 'string' ? input : JSON.stringify(input, null, 2)} />
        </CollapsibleSection>
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
  )
}

function ActionsSection({ actions, t, taskId }: { actions: Action[]; t: any; taskId: string }) {
  // Build groups: each confirm_actions becomes a named group, notify auto-executes
  type ActionGroup = { label: string; actions: Action[] }
  const groups: ActionGroup[] = []

  useEffect(() => {
    // Auto-execute notify actions silently
    for (const action of actions) {
      if (action.type === 'notify') {
        executeActions([action]).catch(() => {})
      }
    }
  }, [])

  for (const action of actions) {
    if (action.type === 'notify') {
      // Skip — auto-executed above
      continue
    }
    if ((action.type === 'confirm_actions' || action.type === 'sequence') && Array.isArray(action.actions) && action.actions.length > 0) {
      // Use the message as group label, or summarize from child types
      const childTypes = [...new Set(action.actions.map((a: Action) => a.type))]
      const label = action.message || `${childTypes.join(', ')} (${action.actions.length})`
      groups.push({ label, actions: action.actions })
    } else {
      // Standalone action — put in its own group
      const label = `${action.type}: ${action.path?.split('/').pop() || action.title || action.text || ''}`
      groups.push({ label, actions: [action] })
    }
  }

  const [executedGroups, setExecutedGroups] = useState<Set<number>>(new Set())
  const [executingGroup, setExecutingGroup] = useState<number | null>(null)

  const storageKey = `actions_executed_${taskId}`

  useEffect(() => {
    storage.getStringAsync(storageKey).then(v => {
      if (v) {
        try { setExecutedGroups(new Set(JSON.parse(v))) } catch { if (v === '1') setExecutedGroups(new Set(groups.map((_, i) => i))) }
      }
    }).catch(() => {})
  }, [storageKey])

  const allExecuted = groups.length > 0 && groups.every((_, i) => executedGroups.has(i))

  const [groupResults, setGroupResults] = useState<Record<number, { ok: number; fail: number; errors: string[] }>>({})

  const handleExecuteGroup = async (idx: number, groupActions: Action[]) => {
    setExecutingGroup(idx)
    try {
      // If all actions are delete_file with content:// URIs, use batch delete (one system dialog)
      const allDeleteFile = groupActions.every(a => a.type === 'delete_file')
      const allContentUri = groupActions.every(a => a.path?.startsWith('content://'))

      let results: { type: string; success: boolean; error?: string }[]

      if (allDeleteFile && allContentUri && groupActions.length > 1) {
        const uris = groupActions.map(a => a.path)
        try {
          const count = await batchDeletePhotos(uris)
          // System dialog shown — assume all succeeded (user confirmed)
          results = groupActions.map(a => ({ type: a.type, success: true }))
        } catch (e: any) {
          results = groupActions.map(a => ({ type: a.type, success: false, error: e.message }))
        }
      } else {
        results = await executeActions(groupActions, true)
      }

      const ok = results.filter(r => r.success).length
      const failed = results.filter(r => !r.success)
      const errors = [...new Set(failed.map(r => r.error || 'Unknown error').slice(0, 3))]

      setGroupResults(prev => ({ ...prev, [idx]: { ok, fail: failed.length, errors } }))

      if (failed.length === 0) {
        // All succeeded — mark done
        const newExecuted = new Set(executedGroups)
        newExecuted.add(idx)
        setExecutedGroups(newExecuted)
        storage.setStringAsync(storageKey, JSON.stringify([...newExecuted])).catch(() => {})
      } else if (ok > 0) {
        // Partial success — show details but don't mark as fully done
        showModal(
          `${ok}/${results.length}`,
          `${ok} succeeded, ${failed.length} failed\n${errors.join('\n')}`,
        )
      } else {
        // All failed
        showModal(t.errorTitle, errors.join('\n'))
      }
    } catch (err: any) {
      showModal(t.errorTitle, err.message)
    } finally {
      setExecutingGroup(null)
    }
  }

  if (groups.length === 0) return null

  return (
    <View style={s.card}>
      <Text style={s.sectionTitle}>{t.actionsLabel} ({groups.reduce((n, g) => n + g.actions.length, 0)})</Text>
      {groups.map((group, idx) => {
        const done = executedGroups.has(idx)
        const running = executingGroup === idx
        return (
          <View key={idx} style={s.actionGroup}>
            <View style={s.actionGroupHeader}>
              <View style={{ flex: 1 }}>
                <Text style={s.actionGroupType}>{group.label}</Text>
                {groupResults[idx] ? (
                  <Text style={[s.actionGroupDetail, groupResults[idx].fail > 0 && { color: '#dc2626' }]}>
                    {groupResults[idx].ok}/{group.actions.length} {groupResults[idx].fail > 0 ? `(${groupResults[idx].errors[0]})` : ''}
                  </Text>
                ) : (
                  <Text style={s.actionGroupDetail}>{group.actions.length} actions</Text>
                )}
              </View>
              <TouchableOpacity
                style={[s.actionGroupBtn, done && s.actionGroupBtnDone]}
                onPress={() => !done && !running && handleExecuteGroup(idx, group.actions)}
                disabled={done || running}
                activeOpacity={0.7}>
                {running ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={s.actionGroupBtnText}>{done ? '✓' : t.executeAll}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )
      })}

      {allExecuted && (
        <View style={s.allDoneBadge}>
          <Text style={s.allDoneText}>✓ {t.executed}</Text>
        </View>
      )}
    </View>
  )
}

// Keep old execute button reference for backward compat
function _LegacyActionsSection({ actions, t, taskId }: { actions: Action[]; t: any; taskId: string }) {
  const [executing, setExecuting] = useState(false)
  const [executed, setExecuted] = useState(false)
  const storageKey = `actions_executed_${taskId}`
  useEffect(() => { storage.getStringAsync(storageKey).then(v => { if (v === '1') setExecuted(true) }).catch(() => {}) }, [storageKey])
  const handleExecute = async () => {
    setExecuting(true)
    try {
      const results = await executeActions(actions)
      const failedResults = results.filter(r => !r.success)
      if (failedResults.length === 0) showModal('✓', t.actionsExecuted.replace('{0}', String(results.length)))
      else showModal(t.doneLabel, t.actionsPartial.replace('{0}', String(results.length - failedResults.length)).replace('{1}', String(failedResults.length)))
      setExecuted(true)
      storage.setStringAsync(storageKey, '1').catch(() => {})
    } catch (err: any) { showModal(t.errorTitle, err.message) }
    finally { setExecuting(false) }
  }
  return (
    <View style={s.card}>
      <TouchableOpacity
        style={[s.executeBtn, (executing || executed) && s.executeBtnDone]}
        onPress={handleExecute}
        disabled={executing || executed}
        activeOpacity={0.7}>
        {executing ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={s.executeBtnText}>{executed ? `✓ ${t.executed}` : t.executeAll}</Text>
        )}
      </TouchableOpacity>
    </View>
  )
}

function ScoreBadge({ label, score }: { label: string; score: number }) {
  const color = score >= 80 ? '#059669' : score >= 50 ? '#d97706' : '#dc2626'
  const bg = score >= 80 ? '#ecfdf5' : score >= 50 ? '#fffbeb' : '#fef2f2'
  return (
    <View style={[s.scoreBadge, { backgroundColor: bg }]}>
      <Text style={[s.scoreBadgeLabel, { color }]}>{label}</Text>
      <Text style={[s.scoreBadgeValue, { color }]}>{score}</Text>
    </View>
  )
}

function AlertItem({ alert }: { alert: any }) {
  const level = (alert.level || alert.severity || 'info').toLowerCase()
  const color = level === 'critical' || level === 'high' || level === 'error' ? '#dc2626'
    : level === 'warning' || level === 'medium' ? '#d97706'
    : '#2563eb'
  return (
    <View style={s.alertItem}>
      <View style={[s.alertDot, { backgroundColor: color }]} />
      <View style={{ flex: 1 }}>
        {alert.title && <Text style={[s.alertTitle, { color }]}>{alert.title}</Text>}
        <Text style={s.alertMessage}>{alert.message || alert.description || JSON.stringify(alert)}</Text>
      </View>
    </View>
  )
}

function OutputBeautified({ output, t }: { output: any; t: any }) {
  const hasMessage = typeof output.message === 'string'
  const hasSections = Array.isArray(output.sections) && output.sections.length > 0
  const healthScore = output.health_score ?? output.healthScore
  const safetyScore = output.safety_score ?? output.safetyScore
  const hasScores = healthScore != null || safetyScore != null
  const hasFunFacts = Array.isArray(output.fun_facts) && output.fun_facts.length > 0
  const hasAlerts = Array.isArray(output.alerts) && output.alerts.length > 0
  const hasBeautified = hasMessage || hasSections || hasScores || hasFunFacts || hasAlerts

  if (!hasBeautified) return null

  return (
    <View style={s.card}>
      <Text style={s.sectionTitle}>{t.output}</Text>

      {/* Summary message */}
      {hasMessage && (
        <View style={s.summaryBox}>
          <Text style={s.summaryText}>{output.message}</Text>
        </View>
      )}

      {/* Scores */}
      {hasScores && (
        <View style={s.scoresRow}>
          {healthScore != null && <ScoreBadge label={t.healthScore} score={healthScore} />}
          {safetyScore != null && <ScoreBadge label={t.safetyScore} score={safetyScore} />}
        </View>
      )}

      {/* Sections */}
      {hasSections && output.sections.map((sec: any, idx: number) => (
        <View key={idx} style={s.sectionCard}>
          {sec.title && <Text style={s.sectionCardTitle}>{sec.title}</Text>}
          {sec.description && <Text style={s.sectionCardDesc}>{sec.description}</Text>}
        </View>
      ))}

      {/* Alerts */}
      {hasAlerts && (
        <View style={s.alertsContainer}>
          <Text style={s.alertsTitle}>{t.alerts}</Text>
          {output.alerts.map((alert: any, idx: number) => (
            <AlertItem key={idx} alert={alert} />
          ))}
        </View>
      )}

      {/* Fun Facts */}
      {hasFunFacts && (
        <View style={s.funFactsContainer}>
          <Text style={s.funFactsTitle}>{t.funFacts}</Text>
          {output.fun_facts.map((fact: string, idx: number) => (
            <View key={idx} style={s.funFactRow}>
              <Text style={s.funFactBullet}>{'  \u2022  '}</Text>
              <Text style={s.funFactText}>{fact}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}

const TRUNCATE_LIMIT = 2000

function TruncatedCode({ text }: { text: string }) {
  const [expanded, setExpanded] = React.useState(false)
  const needsTruncate = text.length > TRUNCATE_LIMIT

  return (
    <View style={s.codeBlock}>
      <Text style={s.codeText}>
        {needsTruncate && !expanded ? text.slice(0, TRUNCATE_LIMIT) + '...' : text}
      </Text>
      {needsTruncate && (
        <TouchableOpacity onPress={() => setExpanded(!expanded)} style={{ paddingVertical: 8 }}>
          <Text style={{ fontSize: 12, color: colors.primary, fontWeight: '600', textAlign: 'center' }}>
            {expanded ? '▲ Collapse' : `▼ Show all (${(text.length / 1024).toFixed(1)}KB)`}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

function CollapsibleSection({ title, right, children, defaultOpen = false }: {
  title: string; right?: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <View style={s.card}>
      <TouchableOpacity style={s.sectionHeader} onPress={() => setOpen(!open)} activeOpacity={0.6}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={s.collapseArrow}>{open ? '▾' : '▸'}</Text>
          <Text style={s.sectionTitleInline}>{title}</Text>
        </View>
        {open && right ? <View style={{ paddingTop: 14 }}>{right}</View> : null}
      </TouchableOpacity>
      {open && children}
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

  // Processing indicator
  processingCard: {
    backgroundColor: '#eff6ff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    padding: 14,
    marginBottom: 12,
  },
  processingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  processingTitle: {
    fontSize: 14,
    fontWeight: fontWeight.semibold,
    color: '#2563eb',
  },
  processingHint: {
    fontSize: 12,
    color: '#6b7280',
    marginLeft: 26,
  },

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
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: fontWeight.bold,
    color: colors.ink950,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  sectionTitleInline: {
    fontSize: 14,
    fontWeight: fontWeight.bold,
    color: colors.ink950,
  },
  collapseArrow: {
    fontSize: 13,
    color: colors.ink400,
    marginRight: 6,
    width: 14,
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
  actionGroup: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(37,99,235,0.06)',
    paddingBottom: 10,
  },
  actionGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actionGroupType: {
    fontSize: 14,
    fontWeight: fontWeight.semibold,
    color: colors.ink950,
    marginBottom: 2,
  },
  actionGroupDetail: {
    fontSize: 11,
    color: colors.ink500,
    marginTop: 1,
  },
  actionGroupBtn: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginLeft: 12,
  },
  actionGroupBtnDone: {
    backgroundColor: '#059669',
  },
  actionGroupBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: fontWeight.bold,
  },
  allDoneBadge: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  allDoneText: {
    color: '#059669',
    fontSize: 13,
    fontWeight: fontWeight.bold,
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

  // Beautified output
  summaryBox: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#eff6ff',
    borderRadius: 10,
    padding: 14,
  },
  summaryText: {
    fontSize: 15,
    fontWeight: fontWeight.semibold,
    color: colors.ink950,
    lineHeight: 22,
  },
  scoresRow: {
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  scoreBadge: {
    flex: 1,
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  scoreBadgeLabel: {
    fontSize: 11,
    fontWeight: fontWeight.semibold,
    marginBottom: 4,
    letterSpacing: 0.3,
  },
  scoreBadgeValue: {
    fontSize: 28,
    fontWeight: fontWeight.extrabold,
    letterSpacing: -0.5,
  },
  sectionCard: {
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.06)',
  },
  sectionCardTitle: {
    fontSize: 14,
    fontWeight: fontWeight.bold,
    color: colors.ink950,
    marginBottom: 4,
  },
  sectionCardDesc: {
    fontSize: 13,
    color: colors.ink700,
    lineHeight: 19,
  },
  alertsContainer: {
    marginHorizontal: 16,
    marginBottom: 12,
  },
  alertsTitle: {
    fontSize: 13,
    fontWeight: fontWeight.bold,
    color: colors.ink950,
    marginBottom: 8,
  },
  alertItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  alertDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
    marginRight: 10,
  },
  alertTitle: {
    fontSize: 13,
    fontWeight: fontWeight.bold,
    marginBottom: 2,
  },
  alertMessage: {
    fontSize: 13,
    color: colors.ink700,
    lineHeight: 18,
  },
  funFactsContainer: {
    marginHorizontal: 16,
    marginBottom: 12,
  },
  funFactsTitle: {
    fontSize: 13,
    fontWeight: fontWeight.bold,
    color: colors.ink950,
    marginBottom: 8,
  },
  funFactRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  funFactBullet: {
    fontSize: 13,
    color: colors.ink500,
  },
  funFactText: {
    flex: 1,
    fontSize: 13,
    color: colors.ink700,
    lineHeight: 19,
  },

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
