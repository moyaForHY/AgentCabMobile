/**
 * ScriptExecutor — shows script code, execute button, live logs, stop button.
 * Embedded in TaskResultScreen when output contains a script.
 */

import React, { useState, useCallback } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Clipboard,
} from 'react-native'
import Icon from 'react-native-vector-icons/Feather'
import { colors, fontWeight, radii, shadows } from '../utils/theme'
import { ScriptEngine } from '../scripting'
import { ScriptManager } from '../scripting/ScriptManager'
import { useI18n, format } from '../i18n'
import { usePinnedApis, type PinnedApi } from '../hooks/usePinnedApis'
import { showModal } from './AppModal'

type Props = {
  script: string
  title?: string
}

export default function ScriptExecutor({ script, title }: Props) {
  const [running, setRunning] = useState(() => ScriptManager.isRunning())
  const [logs, setLogs] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [showCode, setShowCode] = useState(false)
  const logsRef = React.useRef<ScrollView>(null)
  const scriptIdRef = React.useRef<string>('')
  const { t } = useI18n()
  const { pin } = usePinnedApis()

  // 监听脚本状态变化
  React.useEffect(() => {
    const unsubscribe = ScriptManager.onStateChange(() => {
      setRunning(ScriptManager.isRunning())
    })
    return unsubscribe
  }, [])

  const handleSaveShortcut = useCallback(async () => {
    const name = title || t.home_defaultScriptName
    const sid = `script_${Date.now()}`
    const entry: PinnedApi = {
      id: sid,
      shortcutId: sid,
      name,
      isShortcut: true,
      script,
    }
    await pin(entry)
    showModal(t.scriptExec_savedTitle, format(t.scriptExec_savedMsg, name))
  }, [script, title, t, pin])

  const handleRun = useCallback(async () => {
    setRunning(true)
    setLogs([])
    setError(null)

    const scriptName = title || t.home_defaultScriptName
    const tryStart = async () => {
      const sid = `script_${Date.now()}`
      scriptIdRef.current = sid
      const result = await ScriptManager.startScript(
        sid,
        scriptName,
        script,
        (msg) => setLogs(prev => [...prev, msg]),
      )
      if (!result.started) {
        if (result.conflictWith) {
          setRunning(false)
          showModal(
            t.home_scriptRunningTitle,
            format(t.home_scriptRunningMsg, result.conflictWith, scriptName),
            [
              { text: t.cancel, style: 'cancel' },
              {
                text: t.home_stopAndStart,
                onPress: async () => {
                  ScriptManager.stopScript()
                  setRunning(true)
                  await tryStart()
                },
              },
            ],
          )
        } else {
          setError(result.error || 'Failed to start')
          setRunning(false)
        }
      }
    }
    await tryStart()
  }, [script, title, t])

  const handleStop = useCallback(() => {
    ScriptManager.stopScript(scriptIdRef.current)
    setLogs(prev => [...prev, t.scriptExec_stopped])
  }, [t])

  // Validate script on mount
  const validation = ScriptEngine.validate(script)

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <Icon name="terminal" size={18} color={colors.primary} />
        <Text style={s.headerTitle}>{title || t.scriptExec_scriptTitle}</Text>
      </View>

      {/* Code preview (collapsible) */}
      <TouchableOpacity style={s.codeToggle} onPress={() => setShowCode(!showCode)} activeOpacity={0.7}>
        <Icon name="code" size={14} color={colors.ink500} />
        <Text style={s.codeToggleText}>{showCode ? t.scriptExec_hideCode : t.scriptExec_viewCode}</Text>
        <Icon name={showCode ? 'chevron-up' : 'chevron-down'} size={14} color={colors.ink400} />
      </TouchableOpacity>

      {showCode && (
        <ScrollView style={s.codeBlock} horizontal={false} nestedScrollEnabled>
          <Text style={s.codeText}>{script}</Text>
        </ScrollView>
      )}

      {/* Validation error */}
      {!validation.valid && (
        <View style={s.validationError}>
          <Icon name="alert-circle" size={14} color="#dc2626" />
          <Text style={s.validationErrorText}>{validation.error}</Text>
        </View>
      )}

      {/* Execute / Stop + Save shortcut */}
      <View style={s.btnRow}>
        {!running ? (
          <View style={s.btnGroup}>
            <TouchableOpacity
              style={[s.runBtn, !validation.valid && s.runBtnDisabled]}
              onPress={handleRun}
              disabled={!validation.valid || running}
              activeOpacity={0.8}>
              <Icon name="play" size={16} color="#fff" />
              <Text style={s.runBtnText}>{t.scriptExec_execute}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.shortcutBtn}
              onPress={handleSaveShortcut}
              activeOpacity={0.7}>
              <Icon name="zap" size={15} color={colors.primary} />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={s.stopBtn} onPress={handleStop} activeOpacity={0.8}>
            <Icon name="square" size={14} color="#fff" />
            <Text style={s.stopBtnText}>{t.scriptExec_stop}</Text>
          </TouchableOpacity>
        )}
      </View>


      {/* Logs */}
      {logs.length > 0 && (
        <View style={s.logsContainer}>
          <View style={s.logsHeader}>
            <Text style={s.logsTitle}>{t.scriptExec_logs}</Text>
            <TouchableOpacity onPress={() => { Clipboard.setString(logs.join('\n')); }} style={s.copyBtn}>
              <Icon name="copy" size={13} color="#666" />
              <Text style={s.copyBtnText}>{t.copy}</Text>
            </TouchableOpacity>
          </View>
          <ScrollView ref={logsRef} style={s.logsScroll} nestedScrollEnabled>
            {logs.map((log, i) => (
              <Text key={i} style={s.logLine}>
                <Text style={s.logLineNum}>{i + 1}  </Text>
                {log}
              </Text>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Error */}
      {error && (
        <View style={s.errorBox}>
          <Icon name="x-circle" size={14} color="#dc2626" />
          <Text style={s.errorText}>{error}</Text>
        </View>
      )}

      {/* Completion */}
      {!running && logs.length > 0 && !error && (
        <View style={s.doneBox}>
          <Icon name="check-circle" size={14} color="#059669" />
          <Text style={s.doneText}>{t.completed}</Text>
        </View>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: radii.lg,
    marginBottom: 16,
    ...shadows.sm,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f1f5f9',
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: fontWeight.bold,
    color: colors.ink950,
  },
  codeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  codeToggleText: {
    flex: 1,
    fontSize: 13,
    color: colors.ink500,
    fontWeight: fontWeight.medium,
  },
  codeBlock: {
    maxHeight: 200,
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#0f172a',
    borderRadius: 8,
    padding: 12,
  },
  codeText: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#e2e8f0',
    lineHeight: 18,
  },
  validationError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 10,
    backgroundColor: '#fef2f2',
    borderRadius: 8,
  },
  validationErrorText: {
    flex: 1,
    fontSize: 12,
    color: '#dc2626',
  },
  btnRow: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  btnGroup: {
    flexDirection: 'row',
    gap: 10,
  },
  runBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: 13,
  },
  shortcutBtn: {
    width: 46,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radii.md,
    backgroundColor: '#f0f4ff',
  },
  runBtnDisabled: {
    opacity: 0.4,
  },
  runBtnText: {
    fontSize: 14,
    fontWeight: fontWeight.bold,
    color: '#fff',
  },
  stopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#dc2626',
    borderRadius: radii.md,
    paddingVertical: 13,
  },
  stopBtnText: {
    fontSize: 14,
    fontWeight: fontWeight.bold,
    color: '#fff',
  },
  runningBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  runningText: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: fontWeight.medium,
  },
  logsContainer: {
    marginHorizontal: 16,
    marginBottom: 12,
  },
  logsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  logsTitle: {
    fontSize: 12,
    fontWeight: fontWeight.bold,
    color: colors.ink500,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: '#f1f5f9',
  },
  copyBtnText: {
    fontSize: 11,
    color: '#666',
  },
  logsScroll: {
    maxHeight: 150,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 10,
  },
  logLine: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: colors.ink700,
    lineHeight: 18,
  },
  logLineNum: {
    color: colors.ink400,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 10,
    backgroundColor: '#fef2f2',
    borderRadius: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    color: '#dc2626',
    lineHeight: 17,
  },
  doneBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 10,
    backgroundColor: '#ecfdf5',
    borderRadius: 8,
  },
  doneText: {
    fontSize: 13,
    color: '#059669',
    fontWeight: fontWeight.medium,
  },
})
