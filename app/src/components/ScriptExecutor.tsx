/**
 * ScriptExecutor — shows script code, execute button, live logs, stop button.
 * Embedded in TaskResultScreen when output contains a script.
 */

import React, { useState, useRef, useCallback } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  NativeModules,
  DeviceEventEmitter,
  Platform,
} from 'react-native'
import BackgroundService from 'react-native-background-actions'
import Icon from 'react-native-vector-icons/Feather'
import { colors, fontWeight, radii, shadows } from '../utils/theme'
import { ScriptEngine } from '../scripting'
import { createBridge } from '../scripting/bridge'
import { isChinese } from '../utils/i18n'
import { usePinnedApis, type PinnedApi } from '../hooks/usePinnedApis'
import { showModal } from './AppModal'

type Props = {
  script: string
  title?: string
}

export default function ScriptExecutor({ script, title }: Props) {
  const [running, setRunning] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [showCode, setShowCode] = useState(false)
  const engineRef = useRef<ScriptEngine | null>(null)
  const logsRef = useRef<ScrollView>(null)
  const zh = isChinese()
  const { pin } = usePinnedApis()

  const handleSaveShortcut = useCallback(async () => {
    const name = title || (zh ? '自动化脚本' : 'Script')
    const sid = `script_${Date.now()}`
    const entry: PinnedApi = {
      id: sid,
      shortcutId: sid,
      name,
      isShortcut: true,
      script,
    }
    await pin(entry)
    showModal(
      zh ? '已保存' : 'Saved',
      zh ? `"${name}" 已添加到快捷指令` : `"${name}" added to Shortcuts`,
    )
  }, [script, title, zh, pin])

  const handleRun = useCallback(async () => {
    setRunning(true)
    setLogs([])
    setError(null)

    // Start overlay for floating logs
    const OverlayManager = NativeModules.ScriptOverlayManager
    if (Platform.OS === 'android' && OverlayManager) {
      try {
        const canDraw = await OverlayManager.canDrawOverlays()
        if (!canDraw) {
          await OverlayManager.requestOverlayPermission()
          setRunning(false)
          return
        }
        await OverlayManager.startOverlay()
      } catch {}
    }

    // Listen for stop from overlay
    const stopSub = DeviceEventEmitter.addListener('onScriptStop', () => {
      engineRef.current?.cancel()
    })

    // The actual script execution function
    const runScript = async () => {
      const bridge = createBridge((msg) => {
        setLogs(prev => [...prev, msg])
      })

      const engine = new ScriptEngine(bridge, {})
      engineRef.current = engine

      const result = await engine.run(script)

      if (!result.success) {
        console.log('[Script] ERROR:', result.error || 'Unknown error')
        setError(result.error || 'Unknown error')
      }
      engineRef.current = null
    }

    // Run inside BackgroundService to keep JS thread alive
    if (Platform.OS === 'android') {
      try {
        await BackgroundService.start(runScript, {
          taskName: 'AgentCab Script',
          taskTitle: zh ? '脚本运行中' : 'Script Running',
          taskDesc: zh ? '自动化脚本正在执行...' : 'Automation script is executing...',
          taskIcon: { name: 'ic_launcher', type: 'mipmap' },
          color: '#2563eb',
          linkingURI: 'agentcab://',
        })
        // BackgroundService.start returns immediately, script runs in background
        // Wait for it to complete
        await new Promise<void>((resolve) => {
          const check = setInterval(() => {
            if (!engineRef.current) {
              clearInterval(check)
              resolve()
            }
          }, 1000)
        })
        await BackgroundService.stop()
      } catch (e: any) {
        // Fallback: run without background service
        await runScript()
      }
    } else {
      await runScript()
    }

    setRunning(false)
    stopSub.remove()

    // Stop overlay
    if (Platform.OS === 'android' && OverlayManager) {
      try { await OverlayManager.stopOverlay() } catch {}
    }
  }, [script, zh])

  const handleStop = useCallback(async () => {
    engineRef.current?.cancel()
    setLogs(prev => [...prev, zh ? '⏹ 已停止' : '⏹ Stopped'])
    setRunning(false)

    // Stop background service
    try { await BackgroundService.stop() } catch {}

    // Stop overlay
    const OverlayManager = NativeModules.ScriptOverlayManager
    if (Platform.OS === 'android' && OverlayManager) {
      try { OverlayManager.stopOverlay() } catch {}
    }
  }, [zh])

  // Validate script on mount
  const validation = ScriptEngine.validate(script)

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <Icon name="terminal" size={18} color={colors.primary} />
        <Text style={s.headerTitle}>{title || (zh ? '自动化脚本' : 'Automation Script')}</Text>
      </View>

      {/* Code preview (collapsible) */}
      <TouchableOpacity style={s.codeToggle} onPress={() => setShowCode(!showCode)} activeOpacity={0.7}>
        <Icon name="code" size={14} color={colors.ink500} />
        <Text style={s.codeToggleText}>{showCode ? (zh ? '隐藏代码' : 'Hide Code') : (zh ? '查看代码' : 'View Code')}</Text>
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
              <Text style={s.runBtnText}>{zh ? '执行脚本' : 'Execute'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.shortcutBtn}
              onPress={handleSaveShortcut}
              activeOpacity={0.7}>
              <Icon name="plus-square" size={18} color={colors.primary} />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={s.stopBtn} onPress={handleStop} activeOpacity={0.8}>
            <Icon name="square" size={14} color="#fff" />
            <Text style={s.stopBtnText}>{zh ? '停止' : 'Stop'}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Running indicator */}
      {running && (
        <View style={s.runningBar}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={s.runningText}>{zh ? '脚本运行中...' : 'Running...'}</Text>
        </View>
      )}

      {/* Logs */}
      {logs.length > 0 && (
        <View style={s.logsContainer}>
          <Text style={s.logsTitle}>{zh ? '日志' : 'Logs'}</Text>
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
          <Text style={s.doneText}>{zh ? '执行完成' : 'Completed'}</Text>
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

  // Code toggle
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

  // Code block
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

  // Validation
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

  // Buttons
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
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: '#eff6ff',
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

  // Running
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

  // Logs
  logsContainer: {
    marginHorizontal: 16,
    marginBottom: 12,
  },
  logsTitle: {
    fontSize: 12,
    fontWeight: fontWeight.bold,
    color: colors.ink500,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 6,
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

  // Error
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

  // Done
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
