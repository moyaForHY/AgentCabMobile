/**
 * Global task poller — uses AlarmManager to check pending tasks.
 * Works even when MIUI freezes JS setInterval in background.
 */
import { NativeModules, DeviceEventEmitter } from 'react-native'
import { AppState } from 'react-native'
import { fetchCalls, fetchCall } from './api'
import { storage } from './storage'
import { events, EVENT_CALL_COMPLETED, EVENT_WALLET_CHANGED } from './events'
import { executeActions, type Action } from './actionExecutor'
import { showNotification } from './notifications'
import { isChinese } from '../utils/i18n'

const AlarmSchedulerModule = NativeModules.AlarmSchedulerModule

const DANGEROUS_ACTIONS = new Set([
  'delete_file', 'delete_files', 'move_file',
  'uninstall_app', 'set_wallpaper',
  'click_text', 'set_text', 'long_press',
])

const CHECK_INTERVAL_MS = 15000 // 15 seconds between checks
const PENDING_STATUSES = ['pending', 'running', 'processing']

let pendingIds: string[] = []
let checking = false
let listenerRegistered = false

/** Single check — called by alarm or directly */
async function checkOnce() {
  if (checking || pendingIds.length === 0) return
  checking = true
  console.log(`[TaskPoller] checking ${pendingIds.length} pending tasks`)
  try {
    const results = await Promise.all(
      pendingIds.map(id => fetchCall(id).catch(() => null)),
    )

    const completed: any[] = []
    for (const result of results) {
      if (!result) continue
      if (!PENDING_STATUSES.includes(result.status)) {
        completed.push(result)
      }
    }

    if (completed.length > 0) {
      const completedIds = new Set(completed.map(c => c.id))
      pendingIds = pendingIds.filter(id => !completedIds.has(id))

      for (const c of completed) {
        const skillName = c.skill_name ?? c.skill?.name ?? ''
        events.emit(EVENT_CALL_COMPLETED, {
          call_id: c.id,
          skill_name: skillName,
          status: c.status,
        })

        // Push notification (especially useful when app is in background)
        const zh = isChinese()
        if (c.status === 'success' || c.status === 'completed') {
          showNotification(
            skillName || (zh ? '任务完成' : 'Task Complete'),
            zh ? `${skillName} 已完成，点击查看结果` : `${skillName} finished. Tap to view results.`,
            undefined,
            c.id,
          ).catch(() => {})
        } else if (c.status === 'failed') {
          showNotification(
            zh ? '任务失败' : 'Task Failed',
            zh ? `${skillName} 执行失败：${c.error_message || '未知错误'}` : `${skillName} failed: ${c.error_message || 'Unknown error'}`,
            undefined,
            c.id,
          ).catch(() => {})
        }

        // Auto-execute safe actions
        const output = c.output_data || c.output
        console.log(`[TaskPoller] task ${c.id.slice(0, 8)} completed (${c.status}), actions: ${output?.actions?.length || 0}, output_data: ${!!c.output_data}, output: ${!!c.output}, keys: ${output ? Object.keys(output).join(',') : 'null'}`)
        if (output?.actions && Array.isArray(output.actions)) {
          try {
            const allSafe: Action[] = []
            const executedGroupIndices: number[] = []

            for (let gi = 0; gi < output.actions.length; gi++) {
              const action = output.actions[gi]
              if (action.type === 'notify') {
                try { await executeActions([action], true) } catch {}
                executedGroupIndices.push(gi)
              } else if ((action.type === 'confirm_actions' || action.type === 'sequence') && Array.isArray(action.actions)) {
                const safe = action.actions.filter((a: Action) => !DANGEROUS_ACTIONS.has(a.type))
                const hasDangerous = action.actions.some((a: Action) => DANGEROUS_ACTIONS.has(a.type))
                if (safe.length > 0) allSafe.push(...safe)
                // Only mark as executed if ALL sub-actions are safe
                if (!hasDangerous && safe.length > 0) executedGroupIndices.push(gi)
              } else if (!DANGEROUS_ACTIONS.has(action.type)) {
                allSafe.push(action)
                executedGroupIndices.push(gi)
              }
            }
            if (allSafe.length > 0) {
              console.log(`[TaskPoller] auto-executing ${allSafe.length} safe actions`)
              await executeActions(allSafe, true)
            }
            // Only mark actually executed groups, leave dangerous ones for user confirmation
            if (executedGroupIndices.length > 0) {
              storage.setString(`actions_executed_${c.id}`, JSON.stringify(executedGroupIndices))
            }
          } catch (e: any) {
            console.log(`[TaskPoller] auto-execute failed: ${e.message}`)
          }
        }
      }
      events.emit(EVENT_WALLET_CHANGED)
    }

    // Schedule next check if still pending
    if (pendingIds.length > 0) {
      scheduleNextCheck()
    } else {
      console.log(`[TaskPoller] all tasks done, no more checks`)
      syncKeepAlive()
    }
  } catch (e: any) {
    console.log(`[TaskPoller] check failed: ${e.message}`)
    // Still schedule next check on error
    if (pendingIds.length > 0) scheduleNextCheck()
  }
  checking = false
}

/** Schedule next check via AlarmManager */
function scheduleNextCheck() {
  if (!AlarmSchedulerModule) return
  AlarmSchedulerModule.scheduleTaskCheck(CHECK_INTERVAL_MS).catch(() => {})
}

/** Cancel pending task check alarm */
function cancelCheck() {
  if (!AlarmSchedulerModule) return
  AlarmSchedulerModule.cancelTaskCheck().catch(() => {})
}

/** Start/stop KeepAlive based on pending tasks or automation rules */
export async function syncKeepAlive() {
  if (!AlarmSchedulerModule) return
  try {
    const { getRules } = require('./automationService')
    const rules = await getRules()
    const hasEnabledAutomation = rules.some((r: any) => r.enabled)
    const hasPendingTasks = pendingIds.length > 0
    console.log(`[TaskPoller] syncKeepAlive: automations=${hasEnabledAutomation}, pending=${hasPendingTasks} (${pendingIds.length})`)

    if (hasEnabledAutomation || hasPendingTasks) {
      await AlarmSchedulerModule.startKeepAlive()
    } else {
      await AlarmSchedulerModule.stopKeepAlive()
    }
  } catch {}
}

/** Call when a new task is submitted */
export function trackTask(callId: string) {
  if (!pendingIds.includes(callId)) {
    pendingIds.push(callId)
  }
  console.log(`[TaskPoller] tracking task ${callId.slice(0, 8)}, total pending: ${pendingIds.length}`)
  syncKeepAlive()
  scheduleNextCheck()
}

/** Scan recent calls for pending tasks (on app start) */
export async function scanPendingTasks() {
  try {
    const data = await fetchCalls(1, 20)
    const pending = data.items
      .filter((c: any) => PENDING_STATUSES.includes(c.status))
      .map((c: any) => c.id)
    console.log(`[TaskPoller] scanned ${data.items.length} calls, ${pending.length} pending`)
    if (pending.length > 0) {
      pendingIds = [...new Set([...pendingIds, ...pending])]
      syncKeepAlive()
      scheduleNextCheck()
    } else {
      syncKeepAlive()
    }
  } catch (e: any) {
    console.log(`[TaskPoller] scan failed: ${e.message}`)
    syncKeepAlive()
  }
}

/** Listen for AlarmManager task check events */
export function initTaskCheckListener() {
  if (listenerRegistered) return
  listenerRegistered = true
  DeviceEventEmitter.addListener('onTaskCheckAlarm', () => {
    console.log(`[TaskPoller] alarm-triggered check`)
    checkOnce()
  })
}
