/**
 * Network connectivity check with global state and listeners.
 * Uses the AgentCab API health endpoint as a lightweight probe.
 */

const HEALTH_URL = 'https://www.agentcab.ai/v1/skills?page=1&page_size=1'
const TIMEOUT_MS = 5000
const POLL_INTERVAL_MS = 10000 // check every 10s when offline, 30s when online
const POLL_INTERVAL_ONLINE_MS = 30000

/**
 * Returns true if the device can reach the API server.
 * Uses a plain fetch with a short timeout — no auth required.
 */
export async function isOnline(): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    const response = await fetch(HEALTH_URL, {
      method: 'GET',
      signal: controller.signal,
    })
    clearTimeout(timer)
    return response.ok
  } catch {
    return false
  }
}

// --- Global network status with pub/sub ---

type Listener = (online: boolean) => void

class NetworkStatus {
  private _online = true
  private _listeners = new Set<Listener>()
  private _timer: ReturnType<typeof setInterval> | null = null

  get online() {
    return this._online
  }

  /** Subscribe to connectivity changes. Returns unsubscribe function. */
  subscribe(listener: Listener): () => void {
    this._listeners.add(listener)
    // Deliver current state immediately
    listener(this._online)
    // Start polling if not already running
    if (!this._timer) this._startPolling()
    return () => {
      this._listeners.delete(listener)
      if (this._listeners.size === 0) this._stopPolling()
    }
  }

  /** Call this when a fetch fails with a network error to trigger an immediate check. */
  reportNetworkError() {
    if (this._online) {
      this._setOnline(false)
    }
    // Trigger an immediate re-check
    this._check()
  }

  private _setOnline(value: boolean) {
    if (value === this._online) return
    this._online = value
    this._listeners.forEach(fn => fn(value))
    // Adjust poll frequency
    this._restartPolling()
  }

  private async _check() {
    const result = await isOnline()
    this._setOnline(result)
  }

  private _startPolling() {
    this._check()
    const interval = this._online ? POLL_INTERVAL_ONLINE_MS : POLL_INTERVAL_MS
    this._timer = setInterval(() => this._check(), interval)
  }

  private _restartPolling() {
    this._stopPolling()
    const interval = this._online ? POLL_INTERVAL_ONLINE_MS : POLL_INTERVAL_MS
    this._timer = setInterval(() => this._check(), interval)
  }

  private _stopPolling() {
    if (this._timer) {
      clearInterval(this._timer)
      this._timer = null
    }
  }
}

export const networkStatus = new NetworkStatus()
