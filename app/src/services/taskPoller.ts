/**
 * Global task poller — polls pending tasks every 5s regardless of which screen is active.
 * Emits EVENT_CALL_COMPLETED + EVENT_WALLET_CHANGED when tasks finish.
 */
import { NativeModules } from 'react-native'
import { fetchCalls, fetchCall } from './api'

const AlarmSchedulerModule = NativeModules.AlarmSchedulerModule
import { events, EVENT_CALL_COMPLETED, EVENT_WALLET_CHANGED } from './events'
import { executeActions, type Action } from './actionExecutor'

const DANGEROUS_ACTIONS = new Set([
  'delete_file', 'delete_files', 'move_file',
  'uninstall_app', 'set_wallpaper',
  'click_text', 'set_text', 'long_press',
])

const POLL_INTERVAL = 5000
const PENDING_STATUSES = ['pending', 'running', 'processing']

let timer: ReturnType<typeof setInterval> | null = null
let pendingIds: string[] = []
let polling = false

async function poll() {
  if (polling || pendingIds.length === 0) return
  polling = true
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
      // Remove completed from pending list
      const completedIds = new Set(completed.map(c => c.id))
      pendingIds = pendingIds.filter(id => !completedIds.has(id))

      for (const c of completed) {
        events.emit(EVENT_CALL_COMPLETED, {
          call_id: c.id,
          skill_name: c.skill_name ?? c.skill?.name,
          status: c.status,
        })

        // Auto-execute safe actions if present
        const output = c.output_data || c.output
        if (output?.actions && Array.isArray(output.actions)) {
          const allActions: Action[] = []
          for (const action of output.actions) {
            if (action.type === 'notify') {
              // Auto-execute notify silently
              executeActions([action], true).catch(() => {})
            } else if ((action.type === 'confirm_actions' || action.type === 'sequence') && Array.isArray(action.actions)) {
              // Flatten and filter safe actions
              const safe = action.actions.filter((a: Action) => !DANGEROUS_ACTIONS.has(a.type))
              if (safe.length > 0) executeActions(safe, true).catch(() => {})
            } else if (!DANGEROUS_ACTIONS.has(action.type)) {
              allActions.push(action)
            }
          }
          if (allActions.length > 0) executeActions(allActions, true).catch(() => {})
        }
      }
      events.emit(EVENT_WALLET_CHANGED)
    }

    // Stop timer if nothing left to poll
    if (pendingIds.length === 0) stopPolling()
  } catch {}
  polling = false
}

function startPolling() {
  if (timer) return
  syncKeepAlive()
  timer = setInterval(poll, POLL_INTERVAL)
  poll()
}

function stopPolling() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  syncKeepAlive()
}

/** Start/stop KeepAlive based on: has pending tasks OR has automation rules */
export async function syncKeepAlive() {
  if (!AlarmSchedulerModule) {
    console.log('[TaskPoller] syncKeepAlive: AlarmSchedulerModule not available')
    return
  }
  try {
    const { getRules } = require('./automationService')
    const rules = await getRules()
    const hasEnabledAutomation = rules.some((r: any) => r.enabled)
    const hasPendingTasks = pendingIds.length > 0
    console.log(`[TaskPoller] syncKeepAlive: automations=${hasEnabledAutomation}, pendingTasks=${hasPendingTasks} (${pendingIds.length})`)

    if (hasEnabledAutomation || hasPendingTasks) {
      await AlarmSchedulerModule.startKeepAlive()
      console.log('[TaskPoller] KeepAlive started')
    } else {
      await AlarmSchedulerModule.stopKeepAlive()
      console.log('[TaskPoller] KeepAlive stopped')
    }
  } catch (e: any) {
    console.log(`[TaskPoller] syncKeepAlive error: ${e.message}`)
  }
}

/** Call this when a new task is submitted */
export function trackTask(callId: string) {
  if (!pendingIds.includes(callId)) {
    pendingIds.push(callId)
  }
  startPolling()
}

/** Scan recent calls for any pending tasks (called on app start) */
export async function scanPendingTasks() {
  try {
    const data = await fetchCalls(1, 20)
    const pending = data.items
      .filter((c: any) => PENDING_STATUSES.includes(c.status))
      .map((c: any) => c.id)
    console.log(`[TaskPoller] scanned ${data.items.length} calls, ${pending.length} pending`)
    if (pending.length > 0) {
      pendingIds = [...new Set([...pendingIds, ...pending])]
      startPolling()
    } else {
      // Still sync KeepAlive — automations may need it
      syncKeepAlive()
    }
  } catch (e: any) {
    console.log(`[TaskPoller] scanPendingTasks failed: ${e.message}`)
    // Still try to sync KeepAlive for automations
    syncKeepAlive()
  }
}
