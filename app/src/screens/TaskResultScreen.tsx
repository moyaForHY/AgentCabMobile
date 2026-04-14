import React, { useEffect, useState, useRef } from 'react'
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native'
import Icon from 'react-native-vector-icons/Feather'
import { colors, fontWeight, shadows, radii, spacing, fontSize as fs } from '../utils/theme'
import { useI18n, format } from '../i18n'
import ScriptExecutor from '../components/ScriptExecutor'
import { fetchCall, fetchSkillById, SITE_URL, api } from '../services/api'
import { getAccessToken } from '../services/storage'
import ReactNativeBlobUtil from 'react-native-blob-util'
import { storage } from '../services/storage'
import { writeClipboard, shareText } from '../services/deviceCapabilities'
import { executeActions, type Action } from '../services/actionExecutor'
import { batchDeletePhotos } from '../services/photoScanner'
import { showModal } from '../components/AppModal'
import DownloadButton from '../components/DownloadButton'
import ImagePreview, { isImageFile, isPdfFile, isHtmlFile } from '../components/ImagePreview'
import PdfPreview from '../components/PdfPreview'
import { WebView } from 'react-native-webview'
import { Modal } from 'react-native'
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

/**
 * Strip large base64 blobs from task data before caching to AsyncStorage.
 * Memo screenshot tasks embed `files_b64` arrays that are >1MB each —
 * caching them blows up the SQLite DB (SQLITE_FULL).
 */
const BIG_BLOB_KEYS = new Set(['file_b64', 'files_b64', 'audio_b64', 'image_b64', 'images_b64'])
function slimForCache(data: any): any {
  if (data == null || typeof data !== 'object') return data
  const strip = (obj: any): any => {
    if (obj == null || typeof obj !== 'object') return obj
    if (Array.isArray(obj)) return obj.map(strip)
    const out: any = {}
    for (const [k, v] of Object.entries(obj)) {
      if (BIG_BLOB_KEYS.has(k)) continue
      // Drop any string value that's obviously a base64 blob > 50KB
      if (typeof v === 'string' && v.length > 50000) continue
      out[k] = strip(v)
    }
    return out
  }
  return { ...data, input_data: strip(data.input_data), output_data: strip(data.output_data) }
}

export default function TaskResultScreen({ route, navigation }: any) {
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
        // 3. Save slim cache — strip large base64 blobs from input/output_data
        //    (memo screenshot tasks embed 1MB+ files_b64 which blows up the DB).
        storage.setStringAsync(cacheKey, JSON.stringify(slimForCache(data))).catch(() => {})
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
        storage.setStringAsync(cacheKey, JSON.stringify(slimForCache(data))).catch(() => {})
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
      <View style={[s.container, { padding: spacing.lg }]}>
        <SkeletonBox width={90} height={32} borderRadius={radii.pill} />
        <View style={{ height: spacing.md }} />
        <SkeletonBox width={'100%' as any} height={80} borderRadius={radii.lg} />
        <View style={{ height: spacing.md }} />
        <SkeletonBox width={'100%' as any} height={120} borderRadius={radii.lg} />
        <View style={{ height: spacing.md }} />
        <SkeletonBox width={'100%' as any} height={200} borderRadius={radii.lg} />
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
            <ActivityIndicator size="small" color="#2563eb" style={{ marginEnd: 8 }} />
            <Text style={s.processingTitle}>
              {t.processing} · {formatElapsed(elapsed)}
              {estimatedTime ? ` (${t.taskResult_estimated} ~${formatEstimate(estimatedTime)})` : ''}
            </Text>
          </View>
          <Text style={s.processingHint}>
            {t.taskResult_retryHint}
          </Text>
        </View>
      )}

      {/* Status badge */}
      <View style={[s.statusBadge, { backgroundColor: statusBg }]}>
        <Icon
          name={isOk ? 'check-circle' : isFailed ? 'x-circle' : 'loader'}
          size={15}
          color={statusColor}
          style={{ marginEnd: 6 }}
        />
        <Text style={[s.statusText, { color: statusColor }]}>{statusLabel}</Text>
      </View>

      {/* Info card */}
      <View style={s.cardShadow}><View style={s.card}>
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
      </View></View>

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

      {/* Script files — rendered separately, not inside card */}
      {outputFiles.filter((f: any) => {
        const name = f.filename || f.original_filename || ''
        return name.endsWith('.acs') || f.mime_type === 'text/x-agentcab-script'
      }).map((f: any) => (
        <ScriptFileExecutor key={f.id} fileId={f.id} filename={f.filename || f.original_filename || 'script.acs'} />
      ))}

      {/* Output Files (non-script) */}
      {outputFiles.filter((f: any) => {
        const name = f.filename || f.original_filename || ''
        return !name.endsWith('.acs') && f.mime_type !== 'text/x-agentcab-script'
      }).length > 0 && (
        <OutputFilesSection files={outputFiles.filter((f: any) => {
          const name = f.filename || f.original_filename || ''
          return !name.endsWith('.acs') && f.mime_type !== 'text/x-agentcab-script'
        })} callId={call.id} />
      )}

      {/* Data Tabs: Output / Raw / Input */}
      {(output || input) && (
        <DataTabs output={output} input={input} inputFiles={inputFiles} t={t} />
      )}

      {/* Re-run button */}
      {call.skill_id && (
        <TouchableOpacity
          style={s.rerunButton}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('SkillDetail', { skillId: call.skill_id, autoUse: false, preInputValues: call.input_data })}>
          <Icon name="refresh-cw" size={16} color={colors.primary} style={{ marginEnd: 8 }} />
          <Text style={s.rerunText}>{t.taskResult_rerun}</Text>
        </TouchableOpacity>
      )}

      {/* Review */}
      {isOk && call.skill_id && (
        <ReviewInput skillId={call.skill_id} />
      )}

      <View style={{ height: spacing.xxl }} />
    </ScrollView>
  )
}

function HtmlPreviewModal({ uri, filename, onClose }: { uri: string; filename: string; onClose: () => void }) {
  const { t } = useI18n()
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#fff' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: 48, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}>
          <TouchableOpacity onPress={onClose}><Icon name="x" size={24} color={colors.ink700} /></TouchableOpacity>
          <Text style={{ flex: 1, marginStart: 12, fontSize: 16, fontWeight: '500', color: colors.ink950 }} numberOfLines={1}>{filename}</Text>
        </View>
        <WebView
          source={{ uri }}
          style={{ flex: 1 }}
          originWhitelist={['*']}
          allowFileAccess={true}
          allowFileAccessFromFileURLs={true}
          allowUniversalAccessFromFileURLs={true}
        />
        <TouchableOpacity
          style={{ position: 'absolute', bottom: 32, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24, backgroundColor: 'rgba(0,0,0,0.5)' }}
          activeOpacity={0.7}
          onPress={async () => {
            try {
              const srcPath = uri.replace('file://', '')
              const name = filename || 'document.html'
              const destPath = `${ReactNativeBlobUtil.fs.dirs.DownloadDir}/${name}`
              const base64 = await ReactNativeBlobUtil.fs.readFile(srcPath, 'base64')
              await ReactNativeBlobUtil.fs.writeFile(destPath, base64, 'base64')
              await ReactNativeBlobUtil.android.actionViewIntent(destPath, 'text/html')
            } catch (e: any) {
              showModal(t.taskResult_openFailed)
            }
          }}>
          <Icon name="share" size={18} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 14, fontWeight: '500', textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 }}>
            {t.taskResult_openWith}
          </Text>
        </TouchableOpacity>
      </View>
    </Modal>
  )
}

function DataTabs({ output, input, inputFiles, t }: { output: any; input: any; inputFiles: any[]; t: any }) {
  const [tab, setTab] = useState<'output' | 'raw' | 'input'>('output')
  const tabs = [
    { key: 'output' as const, label: t.output, show: output && typeof output === 'object' },
    { key: 'raw' as const, label: t.rawData, show: !!output },
    { key: 'input' as const, label: t.input, show: !!input },
  ].filter(t => t.show)

  return (
    <View style={s.cardShadow}><View style={s.card}>
      <View style={{ flexDirection: 'row', marginBottom: 12, paddingHorizontal: spacing.lg, paddingTop: spacing.md, flexWrap: 'wrap' }}>
        {tabs.map(item => (
          <TouchableOpacity
            key={item.key}
            onPress={() => setTab(item.key)}
            style={{
              paddingVertical: 6,
              paddingHorizontal: 14,
              borderRadius: 16,
              backgroundColor: tab === item.key ? colors.primary + '15' : 'transparent',
              marginEnd: 8,
            }}
            activeOpacity={0.7}>
            <Text style={{
              fontSize: fs.sm,
              color: tab === item.key ? colors.primary : colors.ink400,
              fontWeight: fontWeight.semibold,
            }}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md }}>
        {tab === 'raw' && (
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 8 }}>
            <TouchableOpacity
              onPress={() => { writeClipboard(typeof output === 'string' ? output : JSON.stringify(output, null, 2)); showModal(t.copied) }}
              activeOpacity={0.6}>
              <Text style={s.actionText}>{t.copy}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => shareText(typeof output === 'string' ? output : JSON.stringify(output, null, 2))}
              activeOpacity={0.6}
              style={{ marginStart: 12 }}>
              <Text style={s.actionText}>{t.share}</Text>
            </TouchableOpacity>
          </View>
        )}
        {tab === 'output' && output && typeof output === 'object' && (
          <OutputBeautifiedInline output={output} t={t} />
        )}
        {tab === 'raw' && output && (
          <TruncatedCode text={typeof output === 'string' ? output : JSON.stringify(output, null, 2)} />
        )}
        {tab === 'input' && (
          <>
            {inputFiles.length > 0 && (
              <View style={{ marginBottom: 12 }}>
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
            {input && <TruncatedCode text={typeof input === 'string' ? input : JSON.stringify(input, null, 2)} />}
          </>
        )}
      </View>
    </View></View>
  )
}

function AutoImage({ uri, height }: { uri: string; height: number }) {
  const [width, setWidth] = useState(0)
  useEffect(() => {
    Image.getSize(uri, (w, h) => {
      setWidth(Math.round((w / h) * height))
    }, () => {})
  }, [uri, height])
  if (!width) return <ActivityIndicator style={{ height }} color={colors.primary} />
  return <Image source={{ uri }} style={{ width, height }} resizeMode="contain" />
}

function ScriptFileExecutor({ fileId, filename }: { fileId: string; filename: string }) {
  const { t } = useI18n()
  const [script, setScript] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      try {
        const url = `${SITE_URL}/v1/files/${fileId}`
        const token = await getAccessToken()
        const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
        if (!res.ok) throw new Error(`${res.status}`)
        const text = await res.text()
        setScript(text)
      } catch (e: any) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    })()
  }, [fileId])

  if (loading) {
    return (
      <View style={{ padding: 20, alignItems: 'center' }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    )
  }

  if (error || !script) {
    return (
      <View style={{ padding: 16 }}>
        <Text style={{ color: colors.ink500, fontSize: 13 }}>{t.taskResult_scriptLoadFailed}: {error}</Text>
      </View>
    )
  }

  return <ScriptExecutor script={script} title={filename.replace('.acs', '')} />
}

function OutputFilesSection({ files, callId }: { files: any[]; callId: string }) {
  const { t } = useI18n()
  const [previewFile, setPreviewFile] = useState<{ uri: string; filename: string; mimeType: string; type: 'image' | 'pdf' | 'html' } | null>(null)
  const [cachedImages, setCachedImages] = useState<Record<string, string>>({})
  const [failedFiles, setFailedFiles] = useState<Set<string>>(new Set())

  // Check file availability + cache previewable files (single pass)
  React.useEffect(() => {
    (async () => {
      const token = await getAccessToken()
      const failed = new Set<string>()
      const cached: Record<string, string> = {}

      for (const file of files) {
        const orig = file.filename || file.original_filename || 'file'
        const previewable = isImageFile(file.mime_type, orig) || isPdfFile(file.mime_type, orig) || isHtmlFile(file.mime_type, orig)

        // Check expiry from expires_at field first
        if (file.expires_at && new Date(file.expires_at).getTime() < Date.now()) {
          failed.add(file.id)
          continue
        }

        if (!previewable) continue

        // Check local cache
        const ext = (file.mime_type || '').split('/').pop() || orig.split('.').pop() || 'jpg'
        const cachePath = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/agentcab_${file.id}.${ext}`

        try {
          const exists = await ReactNativeBlobUtil.fs.exists(cachePath)
          if (exists) {
            const stat = await ReactNativeBlobUtil.fs.stat(cachePath)
            if (Number(stat.size) > 1024) {
              cached[file.id] = 'file://' + cachePath
              continue
            }
            await ReactNativeBlobUtil.fs.unlink(cachePath).catch(() => {})
          }

          // Download
          const res = await ReactNativeBlobUtil.config({ path: cachePath })
            .fetch('GET', `${SITE_URL}/v1/files/${file.id}`, token ? { Authorization: `Bearer ${token}` } : {})

          if (res.info().status === 200) {
            cached[file.id] = 'file://' + res.path()
          } else {
            await ReactNativeBlobUtil.fs.unlink(cachePath).catch(() => {})
            failed.add(file.id)
          }
        } catch {
          failed.add(file.id)
        }
      }

      if (Object.keys(cached).length > 0) setCachedImages(prev => ({ ...prev, ...cached }))
      if (failed.size > 0) setFailedFiles(prev => { const s = new Set(prev); failed.forEach(id => s.add(id)); return s })
    })()
  }, [files])

  const formatExpiry = (expiresAt: string) => {
    if (!expiresAt) return ''
    const remaining = new Date(expiresAt).getTime() - Date.now()
    if (remaining <= 0) return t.taskResult_expired
    const hours = Math.floor(remaining / 3600000)
    if (hours >= 24) return format(t.taskResult_expiresInDays, Math.floor(hours / 24))
    if (hours > 0) return format(t.taskResult_expiresInHours, hours)
    const mins = Math.floor(remaining / 60000)
    return format(t.taskResult_expiresInMinutes, mins)
  }

  return (
    <View style={s.cardShadow}><View style={s.card}>
      <Text style={s.sectionTitle}>{t.outputFiles}</Text>
      {files.map((file: any, idx: number) => {
        const orig = file.filename || file.original_filename || 'file'
        const ext = orig.includes('.') ? '.' + orig.split('.').pop() : ''
        const shortId = (callId || '').slice(0, 8)
        const downloadName = `${shortId}_${idx}${ext}`
        const fileUrl = `${SITE_URL}/v1/files/${file.id}`
        const isImage = isImageFile(file.mime_type, orig)
        const isPdf = isPdfFile(file.mime_type, orig)
        const isHtml = isHtmlFile(file.mime_type, orig)
        const isScript = orig.endsWith('.acs') || file.mime_type === 'text/x-agentcab-script'
        const canPreview = isImage || isPdf || isHtml
        const cached = cachedImages[file.id]
        const expiry = file.expires_at ? formatExpiry(file.expires_at) : ''

        // Script file — render ScriptExecutor
        if (isScript) {
          return <ScriptFileExecutor key={file.id} fileId={file.id} filename={orig} />
        }

        return (
          <View key={file.id}>
            {canPreview ? (
              <>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                  if (!cached) return
                  const type = isImage ? 'image' : isPdf ? 'pdf' : 'html'
                  setPreviewFile({ uri: cached, filename: downloadName, mimeType: file.mime_type, type })
                }}
                style={s.thumbContainer}>
                {cached ? (
                  isImage ? (
                    <AutoImage uri={cached} height={220} />
                  ) : (
                    <View style={[s.thumbImage, { justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' }]}>
                      <Icon name={isPdf ? 'file-text' : 'globe'} size={32} color={colors.ink400} />
                      <Text style={{ color: colors.ink500, fontSize: 12, marginTop: 6 }}>{isPdf ? 'PDF' : 'HTML'}</Text>
                      <Text style={{ color: colors.primary, fontSize: 12, marginTop: 2 }}>{t.taskResult_tapToPreview}</Text>
                    </View>
                  )
                ) : failedFiles.has(file.id) ? (
                  <View style={[s.thumbImage, { justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8f8f8' }]}>
                    <Icon name="alert-circle" size={24} color={colors.ink400} />
                    <Text style={{ color: colors.ink400, fontSize: 12, marginTop: 4 }}>{t.taskResult_fileExpired}</Text>
                  </View>
                ) : (
                  <View style={[s.thumbImage, { justifyContent: 'center', alignItems: 'center', backgroundColor: '#f1f5f9' }]}>
                    <ActivityIndicator color={colors.primary} />
                  </View>
                )}
              </TouchableOpacity>
              <View style={s.fileRow}>
                <View style={s.fileInfo}>
                  <Text style={s.fileName} numberOfLines={1}>{downloadName}</Text>
                  <Text style={s.fileMeta}>{file.mime_type}{expiry ? ` · ${expiry}` : ''}</Text>
                </View>
              </View>
              </>
            ) : failedFiles.has(file.id) ? (
              <View style={s.fileRow}>
                <View style={s.fileInfo}>
                  <Text style={[s.fileName, { color: colors.ink400 }]} numberOfLines={1}>{downloadName}</Text>
                  <Text style={s.fileMeta}>{t.taskResult_fileExpired}</Text>
                </View>
              </View>
            ) : (
              <View style={s.fileRow}>
                <View style={s.fileInfo}>
                  <Text style={s.fileName} numberOfLines={1}>{downloadName}</Text>
                  <Text style={s.fileMeta}>{file.mime_type}{expiry ? ` · ${expiry}` : ''}</Text>
                </View>
                <DownloadButton url={fileUrl} filename={downloadName} mimeType={file.mime_type} />
              </View>
            )}
          </View>
        )
      })}
      {previewFile?.type === 'image' && (
        <ImagePreview
          visible
          uri={previewFile.uri}
          filename={previewFile.filename}
          mimeType={previewFile.mimeType}
          onClose={() => setPreviewFile(null)}
        />
      )}
      {previewFile?.type === 'pdf' && (
        <PdfPreview
          visible
          uri={previewFile.uri}
          filename={previewFile.filename}
          onClose={() => setPreviewFile(null)}
        />
      )}
      {previewFile?.type === 'html' && (
        <HtmlPreviewModal uri={previewFile.uri} filename={previewFile.filename} onClose={() => setPreviewFile(null)} />
      )}
    </View></View>
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
    <View style={s.cardShadow}><View style={s.card}>
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
    </View></View>
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
    <View style={s.cardShadow}><View style={s.card}>
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
    </View></View>
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
    <View style={s.cardShadow}><View style={s.card}>
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
    </View></View>
  )
}

function OutputBeautifiedInline({ output, t }: { output: any; t: any }) {
  const hasMessage = typeof output.message === 'string'
  const hasSections = Array.isArray(output.sections) && output.sections.length > 0
  const healthScore = output.health_score ?? output.healthScore
  const safetyScore = output.safety_score ?? output.safetyScore
  const hasScores = healthScore != null || safetyScore != null
  const hasFunFacts = Array.isArray(output.fun_facts) && output.fun_facts.length > 0
  const hasAlerts = Array.isArray(output.alerts) && output.alerts.length > 0
  const hasBeautified = hasMessage || hasSections || hasScores || hasFunFacts || hasAlerts

  if (!hasBeautified) return <TruncatedCode text={typeof output === 'string' ? output : JSON.stringify(output, null, 2)} />

  return (
    <View>
      {hasMessage && (
        <View style={s.summaryBox}>
          <Text style={s.summaryText}>{output.message}</Text>
        </View>
      )}
      {hasScores && (
        <View style={s.scoresRow}>
          {healthScore != null && <ScoreBadge label={t.healthScore} score={healthScore} />}
          {safetyScore != null && <ScoreBadge label={t.safetyScore} score={safetyScore} />}
        </View>
      )}
      {hasSections && output.sections.map((sec: any, idx: number) => (
        <View key={idx} style={s.sectionCard}>
          {sec.title && <Text style={s.sectionCardTitle}>{sec.title}</Text>}
          {sec.description && <Text style={s.sectionCardDesc}>{sec.description}</Text>}
        </View>
      ))}
      {hasAlerts && (
        <View style={s.alertsContainer}>
          <Text style={s.alertsTitle}>{t.alerts}</Text>
          {output.alerts.map((alert: any, idx: number) => (
            <AlertItem key={idx} alert={alert} />
          ))}
        </View>
      )}
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
    <View style={s.cardShadow}><View style={s.card}>
      <TouchableOpacity style={s.sectionHeader} onPress={() => setOpen(!open)} activeOpacity={0.6}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={s.collapseArrow}>{open ? '▾' : '▸'}</Text>
          <Text style={s.sectionTitleInline}>{title}</Text>
        </View>
        {open && right ? <View style={{ paddingTop: 14 }}>{right}</View> : null}
      </TouchableOpacity>
      {open && children}
    </View></View>
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
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingTop: spacing.md },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Re-run button
  rerunButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radii.lg,
    paddingVertical: 12,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  rerunText: {
    fontSize: fs.sm,
    fontWeight: fontWeight.semibold,
    color: colors.primary,
  },

  // Processing indicator
  processingCard: {
    backgroundColor: colors.primary50,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.md,
  },
  processingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  processingTitle: {
    fontSize: fs.sm,
    fontWeight: fontWeight.semibold,
    color: colors.primary,
    letterSpacing: 0.1,
  },
  processingHint: {
    fontSize: fs.xs,
    color: colors.ink600,
    marginStart: 28,
    marginTop: 2,
  },

  // Status
  statusBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    marginBottom: spacing.lg,
  },
  statusText: {
    fontSize: fs.sm,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.2,
  },

  // Card
  cardShadow: {
    borderRadius: radii.lg,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.sand200, marginStart: spacing.md },

  // Info rows
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: 15,
  },
  infoLabel: { fontSize: fs.sm, color: colors.ink600, fontWeight: fontWeight.medium },
  infoValue: { fontSize: fs.sm, color: colors.ink950, fontWeight: fontWeight.semibold, maxWidth: '60%', textAlign: 'right' },
  mono: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 11 },

  // Section
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm + 2,
  },
  sectionTitle: {
    fontSize: fs.sm,
    fontWeight: fontWeight.bold,
    color: colors.ink800,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm + 2,
    letterSpacing: 0.2,
    textTransform: 'uppercase' as const,
  },
  sectionTitleInline: {
    fontSize: fs.sm,
    fontWeight: fontWeight.bold,
    color: colors.ink800,
    letterSpacing: 0.2,
  },
  collapseArrow: {
    fontSize: 13,
    color: colors.ink400,
    marginEnd: spacing.sm,
    width: 14,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingTop: spacing.md,
  },
  actionText: {
    fontSize: fs.sm,
    fontWeight: fontWeight.semibold,
    color: colors.primary,
  },

  // Error
  errorCard: {
    backgroundColor: '#fef2f2',
    borderRadius: radii.lg,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  errorMsg: {
    fontSize: fs.sm,
    color: colors.error,
    lineHeight: 20,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  errorText: { fontSize: fs.sm, color: colors.error },

  // Actions
  actionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs + 2,
  },
  actionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
    marginTop: 6,
    marginEnd: spacing.sm + 2,
  },
  actionLabel: {
    fontSize: fs.sm,
    color: colors.ink700,
    flex: 1,
    lineHeight: 20,
  },
  actionGroup: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.sand200,
    paddingBottom: spacing.sm + 2,
  },
  actionGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actionGroupType: {
    fontSize: fs.sm,
    fontWeight: fontWeight.semibold,
    color: colors.ink950,
    marginBottom: 2,
  },
  actionGroupDetail: {
    fontSize: fs.xs,
    color: colors.ink500,
    marginTop: 2,
  },
  actionGroupBtn: {
    backgroundColor: colors.primary,
    borderRadius: radii.sm,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    marginStart: spacing.sm + 4,
    ...shadows.sm,
  },
  actionGroupBtnDone: {
    backgroundColor: colors.success,
  },
  actionGroupBtnText: {
    color: colors.white,
    fontSize: fs.xs,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.2,
  },
  allDoneBadge: {
    alignItems: 'center',
    paddingVertical: spacing.sm + 4,
  },
  allDoneText: {
    color: colors.success,
    fontSize: fs.sm,
    fontWeight: fontWeight.bold,
  },
  executeBtn: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm + 4,
    marginBottom: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: 14,
    alignItems: 'center',
    ...shadows.md,
  },
  executeBtnDone: {
    backgroundColor: colors.success,
  },
  executeBtnText: {
    color: colors.white,
    fontSize: fs.md,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.2,
  },

  // Files
  thumbContainer: {
    margin: spacing.md,
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: colors.sand100,
    alignSelf: 'center',
  },
  thumbImage: {
    width: '100%',
    height: 220,
    resizeMode: 'contain',
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.sand200,
  },
  fileInfo: { flex: 1, marginEnd: spacing.sm + 4 },
  fileName: { fontSize: fs.sm, fontWeight: fontWeight.semibold, color: colors.ink950 },
  fileMeta: { fontSize: fs.xs, color: colors.ink500, marginTop: 3 },
  downloadBtn: { fontSize: fs.sm, fontWeight: fontWeight.semibold, color: colors.primary },

  // Beautified output
  summaryBox: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    backgroundColor: colors.primary50,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  summaryText: {
    fontSize: 15,
    fontWeight: fontWeight.medium,
    color: colors.ink900,
    lineHeight: 23,
  },
  scoresRow: {
    flexDirection: 'row',
    gap: spacing.sm + 4,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  scoreBadge: {
    flex: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  scoreBadgeLabel: {
    fontSize: 11,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.xs + 2,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  },
  scoreBadgeValue: {
    fontSize: 32,
    fontWeight: fontWeight.black,
    letterSpacing: -1,
  },
  sectionCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm + 2,
    backgroundColor: colors.sand50,
    borderRadius: radii.md,
    padding: spacing.md,
    ...shadows.sm,
  },
  sectionCardTitle: {
    fontSize: fs.sm,
    fontWeight: fontWeight.bold,
    color: colors.ink950,
    marginBottom: spacing.xs,
  },
  sectionCardDesc: {
    fontSize: fs.sm,
    color: colors.ink700,
    lineHeight: 21,
  },
  alertsContainer: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  alertsTitle: {
    fontSize: fs.sm,
    fontWeight: fontWeight.bold,
    color: colors.ink800,
    marginBottom: spacing.sm + 2,
    letterSpacing: 0.2,
    textTransform: 'uppercase' as const,
  },
  alertItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.sm + 2,
    backgroundColor: colors.sand50,
    borderRadius: radii.sm,
    padding: spacing.sm + 4,
  },
  alertDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
    marginEnd: spacing.sm + 2,
  },
  alertTitle: {
    fontSize: fs.sm,
    fontWeight: fontWeight.bold,
    marginBottom: 2,
  },
  alertMessage: {
    fontSize: fs.sm,
    color: colors.ink700,
    lineHeight: 20,
  },
  funFactsContainer: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  funFactsTitle: {
    fontSize: fs.sm,
    fontWeight: fontWeight.bold,
    color: colors.ink800,
    marginBottom: spacing.sm + 2,
    letterSpacing: 0.2,
  },
  funFactRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  funFactBullet: {
    fontSize: fs.sm,
    color: colors.ink400,
  },
  funFactText: {
    flex: 1,
    fontSize: fs.sm,
    color: colors.ink700,
    lineHeight: 21,
  },

  // Code block
  codeBlock: {
    backgroundColor: colors.sand100,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    borderRadius: radii.sm,
    padding: spacing.md,
  },
  codeText: {
    fontSize: fs.xs,
    color: colors.ink800,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 19,
  },
})
