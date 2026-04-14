/**
 * ScriptManager — singleton that manages script lifecycle.
 * Handles overlay, BackgroundService, bridge creation, and engine execution.
 * Currently limited to 1 active script (screen conflict).
 */

import { NativeModules, DeviceEventEmitter, Platform } from 'react-native'
import BackgroundService from 'react-native-background-actions'
import { ScriptEngine } from './index'
import { createBridge } from './bridge'

const OverlayManager = NativeModules.ScriptOverlayManager ?? null
const CvManager = NativeModules.CvManager ?? null
const YoloIconManager = NativeModules.YoloIconManager ?? null

export type ScriptInfo = {
  id: string
  name: string
  icon?: string
  startedAt: number
}

type RunningScript = ScriptInfo & {
  engine: ScriptEngine
}

type LogCallback = (msg: string) => void

class ScriptManagerImpl {
  private _running: RunningScript | null = null
  private _bgRunning = false
  private _stopSub: any = null
  private _onLog: LogCallback | null = null
  private _stateListeners: Set<() => void> = new Set()
  /** YOLO 模型名集合，cleanup 时统一卸载，避免内存泄漏 */
  private _loadedYoloModels: Set<string> = new Set()

  /** 由 bridge 在 ensureModel 成功后调用，登记本次脚本加载的模型 */
  trackYoloModel(name: string) {
    this._loadedYoloModels.add(name)
  }

  /** Start a script. Returns false if another script is already running. */
  async startScript(
    id: string,
    name: string,
    scriptText: string,
    onLog?: LogCallback,
    icon?: string,
  ): Promise<{ started: boolean; error?: string; conflictWith?: string }> {
    if (this._running) {
      return { started: false, error: `已有脚本在运行: ${this._running.name}`, conflictWith: this._running.name }
    }

    this._onLog = onLog || null

    // Start overlay
    if (Platform.OS === 'android' && OverlayManager) {
      try {
        const canDraw = await OverlayManager.canDrawOverlays()
        if (!canDraw) {
          await OverlayManager.requestOverlayPermission()
          return { started: false, error: '需要悬浮窗权限' }
        }
        await OverlayManager.startOverlay()
      } catch (e) {
        const { reportError } = require('../services/errorReporter')
        reportError('overlay.start', e, { scriptId: id, scriptName: name })
      }
    }

    // Listen for stop from overlay
    this._stopSub = DeviceEventEmitter.addListener('onScriptStop', () => {
      this.stopScript(id)
    })

    // Create bridge + engine
    const bridge = createBridge(id, (msg) => {
      this._onLog?.(msg)
    })
    const engine = new ScriptEngine(bridge, {})

    this._running = { id, name, icon, startedAt: Date.now(), engine }
    this._notifyStateChange()

    // Log startPerception value from script
    const perceptionMatch = scriptText.match(/startPerception\(([^)]+)\)/)
    console.log('[ScriptManager] startPerception in script:', perceptionMatch ? perceptionMatch[1] : 'NOT FOUND')

    // Run in BackgroundService
    const runScript = async () => {
      console.log(`[ScriptManager] runScript BEGIN id=${id}`)
      const result = await engine.run(scriptText)
      console.log(`[ScriptManager] runScript END id=${id} success=${result.success} error=${result.error || '-'}`)
      if (!result.success) {
        this._onLog?.(`⚠ ${result.error || 'Unknown error'}`)
        const { reportError } = require('../services/errorReporter')
        reportError('script.run', new Error(result.error || 'Unknown error'), { scriptId: id, scriptName: name }, true)
      }
    }

    if (Platform.OS === 'android') {
      try {
        await BackgroundService.start(
          async () => {
            await runScript()
          },
          {
            taskName: 'AgentCab Script',
            taskTitle: name,
            taskDesc: '脚本运行中...',
            taskIcon: { name: 'ic_launcher', type: 'mipmap' },
            color: '#2563eb',
            linkingURI: 'agentcab://',
          },
        )
        // Wait for engine to finish
        await new Promise<void>((resolve) => {
          const check = setInterval(() => {
            if (!this._running || this._running.id !== id) {
              clearInterval(check)
              resolve()
            }
          }, 1000)
        })
        try { await BackgroundService.stop() } catch {}
      } catch (e) {
        const { reportError } = require('../services/errorReporter')
        reportError('backgroundService.start', e, { scriptId: id, scriptName: name }, true)
        await runScript()
      }
    } else {
      await runScript()
    }

    // Cleanup
    this._cleanup()
    return { started: true }
  }

  /** Stop the currently running script. Idempotent — always notifies listeners. */
  async stopScript(id?: string) {
    if (this._running) {
      if (!id || this._running.id === id) {
        try { this._running.engine.cancel() } catch {}
        this._onLog?.('⏹ 已停止')
        await this._cleanup()
      }
    } else {
      // 已经没有运行中的脚本了，但还是通知监听器一次，防止 UI 卡在 running 状态
      this._notifyStateChange()
    }
    try { BackgroundService.stop() } catch {}
  }

  /** Get currently running script info */
  getRunningScript(): ScriptInfo | null {
    if (!this._running) return null
    const { engine, ...info } = this._running
    return info
  }

  /** Check if any script is running */
  isRunning(): boolean {
    return this._running !== null
  }

  /** Register state change callback. Returns unsubscribe fn. */
  onStateChange(cb: () => void): () => void {
    this._stateListeners.add(cb)
    return () => { this._stateListeners.delete(cb) }
  }

  private _notifyStateChange() {
    this._stateListeners.forEach(cb => {
      try { cb() } catch {}
    })
  }

  private async _cleanup() {
    this._running = null
    this._onLog = null
    this._stopSub?.remove()
    this._stopSub = null
    this._notifyStateChange()

    // 强制停止 native 截屏/感知循环（脚本中途被打断时关键）
    if (CvManager) {
      try {
        await CvManager.stopPerception()
        console.log('[ScriptManager] cleanup: CV perception stopped')
      } catch (e) {
        console.warn('[ScriptManager] cleanup: stopPerception failed', e)
      }
    }
    // 释放本次脚本加载过的 YOLO 模型
    for (const name of this._loadedYoloModels) {
      try {
        await YoloIconManager?.releaseModel(name)
        console.log(`[ScriptManager] cleanup: released YOLO ${name}`)
      } catch (e) {
        console.warn(`[ScriptManager] cleanup: releaseModel ${name} failed`, e)
      }
    }
    this._loadedYoloModels.clear()

    // Stop overlay
    if (Platform.OS === 'android' && OverlayManager) {
      try { OverlayManager.stopOverlay() } catch {}
    }
  }
}

export const ScriptManager = new ScriptManagerImpl()
