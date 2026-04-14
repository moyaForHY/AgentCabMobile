/**
 * Error reporter — sends app-side errors to the worker via the existing
 * script_log_upload skill, so we can debug issues that happen on other users'
 * devices without direct logcat access.
 *
 * Non-blocking: failures are swallowed — reporting must never throw.
 */
import { ToastAndroid, Platform } from 'react-native'
import { api, SITE_URL } from './api'

// script_log_upload_handler skill id (from agentcab worker)
const ERROR_REPORT_SKILL_ID = '5974d840-6f5e-43cd-80e6-fd7b1a9bf3c7'

let appVersion = ''
try {
  const pkg = require('../../package.json')
  appVersion = pkg?.version || ''
} catch {}

function briefMessage(e: any): string {
  const msg = (e?.message || String(e) || '').trim()
  if (!msg) return 'unknown error'
  // Keep first line only, trim length
  return msg.split('\n')[0].slice(0, 160)
}

function showToast(msg: string) {
  if (Platform.OS === 'android') {
    try { ToastAndroid.show(msg, ToastAndroid.LONG) } catch {}
  }
}

/**
 * Report an error. Shows a Toast on-device and uploads to worker.
 * @param context Short label (e.g. "ensureModel", "screenshot") — goes into script_name.
 * @param error The error object or string.
 * @param extra Optional structured context (urls, paths, sdk version).
 * @param silent If true, don't show a Toast (still uploads).
 */
export async function reportError(
  context: string,
  error: any,
  extra?: Record<string, any>,
  silent = false,
): Promise<void> {
  const brief = briefMessage(error)
  console.error(`[${context}] ${brief}`, error, extra)
  if (!silent) showToast(`${context}: ${brief}`)

  try {
    const lines: string[] = [
      `[${new Date().toISOString()}] ${context}: ${brief}`,
      `app_version: ${appVersion}`,
    ]
    if (error?.stack) lines.push(String(error.stack))
    if (extra) {
      for (const [k, v] of Object.entries(extra)) {
        lines.push(`${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
      }
    }

    await api.post(`/v1/skills/${ERROR_REPORT_SKILL_ID}/call`, {
      input: {
        script_name: `error_${context}`,
        logs: lines,
      },
    })
  } catch {
    // Reporting itself must never throw
  }
}
