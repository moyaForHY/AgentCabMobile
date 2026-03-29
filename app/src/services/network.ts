/**
 * Network connectivity check.
 * Uses the AgentCab API health endpoint as a lightweight probe.
 */

const HEALTH_URL = 'https://www.agentcab.ai/v1/health'
const TIMEOUT_MS = 5000

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
