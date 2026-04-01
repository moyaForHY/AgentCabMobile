/**
 * Automation Service
 * Manages scheduled automation rules — CRUD, alarm scheduling, and execution.
 */
import { NativeModules, DeviceEventEmitter } from 'react-native'
import { storage } from './storage'
import { callSkill, fetchSkillById, fetchCall } from './api'
import { executeActions, type Action } from './actionExecutor'
import { collectAllDeviceData, getDeviceFormats } from './dataCollector'
import { events } from './events'

const AlarmSchedulerModule = NativeModules.AlarmSchedulerModule

const STORAGE_KEY = 'automation_rules'

// Actions that require user confirmation — not auto-executed
const DANGEROUS_ACTIONS = new Set([
  'delete_file', 'delete_files', 'move_file',
  'uninstall_app', 'set_wallpaper',
  'click_text', 'set_text', 'long_press',  // accessibility actions
])

// Poll for async skill completion
async function pollForCompletion(callId: string, timeoutMs: number): Promise<any> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, 5000))
    try {
      const call = await fetchCall(callId)
      if (call.status === 'success' || call.status === 'completed' || call.status === 'failed') {
        return call
      }
    } catch {}
  }
  return { status: 'timeout' }
}

// ── Types ──

export type AutomationRule = {
  id: string
  skillId: string
  skillName: string
  schedule: {
    type: 'daily' | 'weekly' | 'interval'
    time?: string        // "07:00" for daily/weekly
    weekday?: number     // 0-6 for weekly (0=Sunday)
    intervalMinutes?: number // for interval type
  }
  enabled: boolean
  lastRun?: string       // ISO date
  createdAt: string
}

// ── Event name ──
export const EVENT_AUTOMATION_CHANGED = 'automation_changed'
export const EVENT_AUTOMATION_EXECUTED = 'automation_executed'

// ── Storage helpers ──

export async function getRules(): Promise<AutomationRule[]> {
  const raw = await storage.getStringAsync(STORAGE_KEY)
  if (!raw) return []
  try {
    return JSON.parse(raw) as AutomationRule[]
  } catch {
    return []
  }
}

async function saveRules(rules: AutomationRule[]): Promise<void> {
  await storage.setStringAsync(STORAGE_KEY, JSON.stringify(rules))
  events.emit(EVENT_AUTOMATION_CHANGED)
}

// ── CRUD ──

export async function saveRule(rule: AutomationRule): Promise<void> {
  // Schedule first — if permission denied, don't save
  if (rule.enabled) {
    await scheduleRule(rule)
  } else {
    await cancelRule(rule.id)
  }

  const rules = await getRules()
  const idx = rules.findIndex(r => r.id === rule.id)
  if (idx >= 0) {
    rules[idx] = rule
  } else {
    rules.push(rule)
  }
  await saveRules(rules)
  await syncKeepAlive()
}

export async function deleteRule(id: string): Promise<void> {
  const rules = await getRules()
  const filtered = rules.filter(r => r.id !== id)
  await saveRules(filtered)
  await cancelRule(id)
  await syncKeepAlive()
}

export async function toggleRule(id: string, enabled: boolean): Promise<void> {
  const rules = await getRules()
  const rule = rules.find(r => r.id === id)
  if (!rule) return
  rule.enabled = enabled
  await saveRules(rules)

  if (enabled) {
    await scheduleRule(rule)
  } else {
    await cancelRule(id)
  }
  await syncKeepAlive()
}

// ── Scheduling ──

function getNextTriggerTime(schedule: AutomationRule['schedule']): number {
  const now = new Date()

  if (schedule.type === 'interval') {
    const minutes = schedule.intervalMinutes || 60
    return now.getTime() + minutes * 60 * 1000
  }

  // Parse time "HH:MM"
  const [hours, minutes] = (schedule.time || '08:00').split(':').map(Number)

  if (schedule.type === 'daily') {
    const target = new Date(now)
    target.setHours(hours, minutes, 0, 0)
    if (target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + 1)
    }
    return target.getTime()
  }

  if (schedule.type === 'weekly') {
    const weekday = schedule.weekday ?? 0
    const target = new Date(now)
    target.setHours(hours, minutes, 0, 0)
    const currentDay = target.getDay()
    let daysUntil = weekday - currentDay
    if (daysUntil < 0 || (daysUntil === 0 && target.getTime() <= now.getTime())) {
      daysUntil += 7
    }
    target.setDate(target.getDate() + daysUntil)
    return target.getTime()
  }

  return now.getTime() + 60 * 60 * 1000 // fallback: 1 hour
}

function getRepeatInterval(schedule: AutomationRule['schedule']): number {
  switch (schedule.type) {
    case 'daily':
      return 24 * 60 * 60 * 1000
    case 'weekly':
      return 7 * 24 * 60 * 60 * 1000
    case 'interval':
      return (schedule.intervalMinutes || 60) * 60 * 1000
    default:
      return 0
  }
}

export async function scheduleRule(rule: AutomationRule): Promise<void> {
  if (!AlarmSchedulerModule) {
    console.warn('AlarmSchedulerModule not available')
    return
  }

  // Check exact alarm permission on Android 12+
  try {
    const canSchedule = await AlarmSchedulerModule.canScheduleExact()
    if (!canSchedule) {
      const { showModal } = require('../components/AppModal')
      showModal(
        'Permission Required',
        'AgentCab needs permission to set exact alarms for automations. Tap "Open Settings" to allow.',
        [
          { text: 'Cancel', style: 'cancel' as const },
          { text: 'Open Settings', onPress: () => AlarmSchedulerModule.requestExactAlarmPermission() },
        ],
      )
      throw new Error('EXACT_ALARM_PERMISSION_DENIED')
    }
  } catch (e: any) {
    if (e?.message === 'EXACT_ALARM_PERMISSION_DENIED') throw e
  }

  const triggerAt = getNextTriggerTime(rule.schedule)
  const interval = getRepeatInterval(rule.schedule)
  await AlarmSchedulerModule.scheduleAlarm(rule.id, triggerAt, interval)

  // MIUI/Xiaomi: guide user to disable battery restrictions (once)
  const { getDeviceBrand, isChinese } = require('../utils/i18n')
  const brand = getDeviceBrand()
  if (brand === 'xiaomi' || brand === 'huawei' || brand === 'vivo' || brand === 'oppo') {
    const prompted = await storage.getStringAsync('automation_battery_prompted')
    if (!prompted) {
      await storage.setStringAsync('automation_battery_prompted', '1')
      const { showModal } = require('../components/AppModal')
      const { Linking } = require('react-native')
      const zh = isChinese()

      const brandGuide: Record<string, { title: string; msg: string }> = {
        xiaomi: {
          title: zh ? '开启后台运行权限' : 'Enable Background Running',
          msg: zh
            ? '为确保自动化任务准时执行，请进行以下设置：\n\n1. 自启动：设置 → 应用设置 → 应用管理 → AgentCab → 自启动 → 开启\n2. 省电策略：设置 → 电池 → AgentCab → 无限制\n3. 锁定后台：在最近任务中长按 AgentCab → 锁定'
            : 'To ensure automations run on time:\n\n1. Autostart: Settings → Apps → AgentCab → Autostart → Enable\n2. Battery: Settings → Battery → AgentCab → No restrictions\n3. Lock in recents: Long press AgentCab in recent tasks → Lock',
        },
        huawei: {
          title: zh ? '开启后台运行权限' : 'Enable Background Running',
          msg: zh
            ? '请进行以下设置：\n\n1. 自启动：设置 → 应用和服务 → 应用管理 → AgentCab → 自启动 → 开启\n2. 电池：设置 → 电池 → 应用启动管理 → AgentCab → 手动管理 → 全部允许'
            : 'Please configure:\n\n1. Autostart: Settings → Apps → AgentCab → Autostart → Enable\n2. Battery: Settings → Battery → App launch → AgentCab → Manual → Allow all',
        },
        vivo: {
          title: zh ? '开启后台运行权限' : 'Enable Background Running',
          msg: zh
            ? '请进行以下设置：\n\n1. 自启动：设置 → 应用与权限 → 自启动管理 → AgentCab → 开启\n2. 电池：设置 → 电池 → 后台耗电管理 → AgentCab → 允许后台运行'
            : 'Please configure:\n\n1. Autostart: Settings → Apps → Autostart → AgentCab → Enable\n2. Battery: Settings → Battery → Background power → AgentCab → Allow',
        },
        oppo: {
          title: zh ? '开启后台运行权限' : 'Enable Background Running',
          msg: zh
            ? '请进行以下设置：\n\n1. 自启动：设置 → 应用管理 → 自启动管理 → AgentCab → 开启\n2. 电池：设置 → 电池 → 省电优化 → AgentCab → 关闭优化'
            : 'Please configure:\n\n1. Autostart: Settings → Apps → Autostart → AgentCab → Enable\n2. Battery: Settings → Battery → Power saving → AgentCab → Disable',
        },
      }

      const guide = brandGuide[brand] || brandGuide.xiaomi
      showModal(guide.title, guide.msg, [
        { text: zh ? '去设置' : 'Open Settings', onPress: () => {
          const { openPermissionEditor } = require('../utils/i18n')
          openPermissionEditor()
        }},
        { text: zh ? '知道了' : 'Got it', style: 'cancel' as const },
      ])
    }
  }
}

export async function cancelRule(id: string): Promise<void> {
  if (!AlarmSchedulerModule) return
  await AlarmSchedulerModule.cancelAlarm(id)
}

// ── Execution ──

export async function executeRule(ruleId: string): Promise<void> {
  const rules = await getRules()
  const rule = rules.find(r => r.id === ruleId)
  if (!rule) {
    console.warn('Automation rule not found:', ruleId)
    return
  }

  try {
    // Fetch skill to check if it needs device data
    const skill = await fetchSkillById(rule.skillId)
    const formats = getDeviceFormats(skill.input_schema || {})

    // Start with preset input values (user configured when creating automation)
    let input: Record<string, any> = { ...((rule as any).inputValues || {}) }

    // Collect device data and merge (device data overwrites preset for device:* fields)
    if (formats.length > 0) {
      const deviceData = await collectAllDeviceData(skill.input_schema || {})
      input = { ...input, ...deviceData }
    }

    const result = await callSkill(rule.skillId, { input })

    // Use unified taskPoller for monitoring — works in background via AlarmManager
    const { trackTask } = require('./taskPoller')
    trackTask(result.call_id)

    // Update lastRun
    rule.lastRun = new Date().toISOString()
    const allRules = await getRules()
    const idx = allRules.findIndex(r => r.id === ruleId)
    if (idx >= 0) {
      allRules[idx].lastRun = rule.lastRun
      await saveRules(allRules)
    }
  } catch (e: any) {
    console.error('Automation execution failed:', e.message)

    // Update notification to "failed"
    try {
      await AlarmSchedulerModule?.updateNotification(ruleId, `${rule?.skillName || 'Automation'}`, `Failed: ${e.message?.slice(0, 50)}`)
    } catch {}

    events.emit(EVENT_AUTOMATION_EXECUTED, {
      ruleId,
      skillName: rule.skillName,
      status: 'failed',
      error: e.message,
    })
  }
}

// ── Keep-alive — delegated to taskPoller.syncKeepAlive ──
import { syncKeepAlive } from './taskPoller'

// ── Reschedule all (on boot / app start) ──

export async function rescheduleAll(): Promise<void> {
  const rules = await getRules()
  for (const rule of rules) {
    if (rule.enabled) {
      await scheduleRule(rule)
    }
  }
  await syncKeepAlive()
}

// ── Listen for alarm events from native ──

let listenerRegistered = false

export function initAutomationListener(): () => void {
  if (listenerRegistered) return () => {}
  listenerRegistered = true

  // Listen for alarm events when app is running
  const subscription = DeviceEventEmitter.addListener('onAutomationAlarm', (event: { ruleId: string }) => {
    if (event?.ruleId) {
      executeRule(event.ruleId).catch(err =>
        console.error('Failed to execute automation rule:', err),
      )
    }
  })

  // Check if app was launched by an alarm (app was not running)
  const { Linking } = require('react-native')
  Linking.getInitialURL().then((url: string | null) => {
    // Android intent extras come through as launch intent, not URL
    // We need to check NativeModules for the intent extra
  }).catch(() => {})

  // Check launch intent for automationRuleId
  try {
    const { NativeModules } = require('react-native')
    const launchIntent = NativeModules.IntentModule
    if (launchIntent?.getInitialIntent) {
      launchIntent.getInitialIntent().then((extras: any) => {
        if (extras?.automationRuleId) {
          executeRule(extras.automationRuleId).catch(err =>
            console.error('Failed to execute automation from launch intent:', err),
          )
        }
      }).catch(() => {})
    }
  } catch {}

  // Reschedule all on app start
  rescheduleAll().catch(() => {})

  return () => {
    subscription.remove()
    listenerRegistered = false
  }
}

// ── Utility ──

export function generateRuleId(): string {
  return 'rule_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8)
}

export function formatSchedule(schedule: AutomationRule['schedule'], lang: 'en' | 'zh' = 'en'): string {
  if (schedule.type === 'daily') {
    return lang === 'zh' ? `每天 ${schedule.time || '08:00'}` : `Daily at ${schedule.time || '08:00'}`
  }
  if (schedule.type === 'weekly') {
    const days = lang === 'zh'
      ? ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
      : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const day = days[schedule.weekday ?? 0]
    return lang === 'zh'
      ? `每${day} ${schedule.time || '08:00'}`
      : `${day} at ${schedule.time || '08:00'}`
  }
  if (schedule.type === 'interval') {
    const mins = schedule.intervalMinutes || 60
    if (mins >= 60) {
      const h = mins / 60
      return lang === 'zh' ? `每 ${h} 小时` : `Every ${h}h`
    }
    return lang === 'zh' ? `每 ${mins} 分钟` : `Every ${mins}m`
  }
  return ''
}
