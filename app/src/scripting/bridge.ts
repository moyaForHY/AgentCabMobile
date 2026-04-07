/**
 * ScriptBridge implementation
 * Connects the script interpreter to Android's AccessibilityService via NativeModules.
 */

import { NativeModules, Platform, Linking, Vibration, Clipboard } from 'react-native'
import type { ScriptBridge } from './interpreter'
import AsyncStorage from '@react-native-async-storage/async-storage'

const AccessibilityManager = NativeModules.AccessibilityManager ?? null
const ScriptOverlayManager = NativeModules.ScriptOverlayManager ?? null
const PaddleOcrManager = NativeModules.PaddleOcrManager ?? null
const CvManager = NativeModules.CvManager ?? null

let _paddleOcrReady = false

type OcrResult = {
  text: string
  left: number
  top: number
  right: number
  bottom: number
  centerX: number
  centerY: number
  confidence: number
  elements?: OcrResult[]
}

function requireService() {
  if (!AccessibilityManager) throw new Error('AccessibilityManager not available')
}

async function ensureEnabled() {
  requireService()
  const enabled = await AccessibilityManager.isEnabled()
  if (!enabled) throw new Error('Accessibility service not enabled. Go to Settings > Accessibility > AgentCab to enable.')
}

/**
 * Check if the accessibility tree is blocked (e.g. WeChat).
 * If so, fall back to screenshot + OCR.
 */
let _ocrCache: OcrResult[] | null = null
let _ocrCacheTime = 0
const OCR_CACHE_TTL = 500 // ms — reuse recent OCR within 500ms

async function initPaddleOcr(): Promise<boolean> {
  if (_paddleOcrReady) return true
  if (!PaddleOcrManager) return false
  try {
    await PaddleOcrManager.init()
    _paddleOcrReady = true
    console.log('[PaddleOCR] initialized')
    return true
  } catch (e: any) {
    console.log('[PaddleOCR] init failed:', e.message)
    return false
  }
}

async function getOcrResults(): Promise<OcrResult[]> {
  const now = Date.now()
  if (_ocrCache && now - _ocrCacheTime < OCR_CACHE_TTL) return _ocrCache

  const ready = await initPaddleOcr()
  if (!ready) {
    console.log('[OCR] PaddleOCR not available')
    return []
  }

  try {
    console.log('[PaddleOCR] Taking screenshot + running OCR...')
    const results: OcrResult[] = await PaddleOcrManager.screenshotOcr()
    console.log(`[PaddleOCR] Got ${results.length} text lines`)
    if (results.length > 0) {
      console.log('[OCR] All:', results.map((r: OcrResult) => r.text).join(' | '))
    }
    _ocrCache = results
    _ocrCacheTime = now
    return results
  } catch (e: any) {
    console.log('[OCR] Error:', e.message || e)
    return []
  }
}

function invalidateOcrCache() {
  _ocrCache = null
  _ocrCacheTime = 0
}

/**
 * Get screen content — try accessibility tree first, fall back to OCR if empty.
 * Returns normalized format: [{text, isClickable, ...}]
 */
async function getScreenNodes(): Promise<{ nodes: any[], source: 'a11y' | 'ocr' }> {
  await ensureEnabled()
  // 统一用 OCR，不走无障碍树（无障碍树缺少坐标/背景色等信息）
  const ocrResults = await getOcrResults()
  const nodes = ocrResults.map((r: OcrResult) => ({
    text: r.text,
    className: 'ocr.TextLine',
    contentDescription: null,
    isClickable: true, // OCR elements are clickable via coordinates
    isEditable: false,
    isScrollable: false,
    depth: 0,
    _ocr: true,
    _bounds: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
    _center: { x: r.centerX, y: r.centerY },
    _bgR: (r as any).bgR ?? 0,
    _bgG: (r as any).bgG ?? 0,
    _bgB: (r as any).bgB ?? 0,
  }))
  return { nodes, source: 'ocr' }
}

/**
 * Click by text — accessibility tree click or OCR coordinate tap.
 */
async function smartClick(text: string): Promise<boolean> {
  await ensureEnabled()
  // Try accessibility tree first
  const content = await AccessibilityManager.getScreenContent()
  if (content && content.length > 0) {
    console.log(`[Click] A11y click: "${text}"`)
    return await AccessibilityManager.clickByText(text)
  }
  // Fall back to OCR
  console.log(`[Click] OCR click: "${text}"`)
  const ocrResults = await getOcrResults()
  const match = ocrResults.find((r: OcrResult) => r.text.includes(text))
  if (!match) {
    // Try matching individual elements for finer granularity
    for (const line of ocrResults) {
      if (line.elements) {
        const el = line.elements.find((e: OcrResult) => e.text.includes(text))
        if (el) {
          console.log(`[Click] OCR element match: "${el.text}" at (${el.centerX}, ${el.centerY})`)
          await AccessibilityManager.swipe(el.centerX, el.centerY, el.centerX, el.centerY, 50)
          invalidateOcrCache()
          return true
        }
      }
    }
    console.log(`[Click] OCR: "${text}" not found in ${ocrResults.length} results`)
    return false
  }
  console.log(`[Click] OCR match: "${match.text}" at (${match.centerX}, ${match.centerY})`)
  await AccessibilityManager.swipe(match.centerX, match.centerY, match.centerX, match.centerY, 50)
  invalidateOcrCache()
  return true
}

export function createBridge(onLog?: (msg: string) => void): ScriptBridge {
  const STORE_PREFIX = 'script_store_'
  const logs: string[] = []

  return {
    // ── Screen Query (auto-fallback: accessibility tree → OCR) ──

    async screenHas(text: string): Promise<boolean> {
      const { nodes } = await getScreenNodes()
      return nodes.some((n: any) =>
        (n.text && n.text.includes(text)) ||
        (n.contentDescription && n.contentDescription?.includes(text))
      )
    },

    async screenFindText(text: string): Promise<any | null> {
      const { nodes } = await getScreenNodes()
      return nodes.find((n: any) =>
        (n.text && n.text.includes(text)) ||
        (n.contentDescription && n.contentDescription?.includes(text))
      ) || null
    },

    async screenFindAll(text: string): Promise<any[]> {
      const { nodes } = await getScreenNodes()
      return nodes.filter((n: any) =>
        (n.text && n.text.includes(text)) ||
        (n.contentDescription && n.contentDescription?.includes(text))
      )
    },

    async screenFindId(id: string): Promise<any | null> {
      await ensureEnabled()
      const content = await AccessibilityManager.getScreenContent()
      return content.find((n: any) => n.viewId === id) || null
    },

    async screenWaitFor(text: string, timeout: number): Promise<boolean> {
      const deadline = Date.now() + timeout
      while (Date.now() < deadline) {
        invalidateOcrCache() // Force fresh screenshot each check
        if (await this.screenHas(text)) return true
        await this.wait(500)
      }
      return false
    },

    async screenWaitGone(text: string, timeout: number): Promise<boolean> {
      const deadline = Date.now() + timeout
      while (Date.now() < deadline) {
        invalidateOcrCache()
        if (!(await this.screenHas(text))) return true
        await this.wait(500)
      }
      return false
    },

    async screenGetText(near: string): Promise<string | null> {
      const { nodes } = await getScreenNodes()
      const idx = nodes.findIndex((n: any) =>
        (n.text && n.text.includes(near)) ||
        (n.contentDescription && n.contentDescription?.includes(near))
      )
      if (idx < 0) return null
      for (let i = idx - 1; i >= Math.max(0, idx - 3); i--) {
        if (nodes[i].text) return nodes[i].text
      }
      for (let i = idx + 1; i < Math.min(nodes.length, idx + 3); i++) {
        if (nodes[i].text) return nodes[i].text
      }
      return null
    },

    async screenDump(): Promise<string> {
      const { nodes, source } = await getScreenNodes()
      return JSON.stringify({ source, nodes }, null, 2)
    },

    // ── Actions ──

    async click(text: string): Promise<void> {
      await ensureEnabled()
      const success = await smartClick(text)
      if (!success) throw new Error(`Could not click: "${text}" not found or not clickable`)
      await this.wait(200)
    },

    async clickAt(x: number, y: number): Promise<void> {
      await ensureEnabled()
      // Use swipe with same start/end point and short duration to simulate tap
      await AccessibilityManager.swipe(x, y, x, y, 50)
      await this.wait(200)
    },

    async clickIndex(text: string, index: number): Promise<void> {
      await ensureEnabled()
      const all = await this.screenFindAll(text)
      if (index >= all.length) throw new Error(`clickIndex: only ${all.length} matches for "${text}", requested index ${index}`)
      // For now, click by text (clicks first match). TODO: support index in native
      await AccessibilityManager.clickByText(text)
      await this.wait(200)
    },

    async longPress(text: string): Promise<void> {
      await ensureEnabled()
      // Find element position and do a long press gesture
      const el = await this.screenFindText(text)
      if (!el || !el.bounds) throw new Error(`longPress: "${text}" not found`)
      const { left, top, right, bottom } = el.bounds
      const cx = (left + right) / 2
      const cy = (top + bottom) / 2
      await AccessibilityManager.swipe(cx, cy, cx, cy, 800)
      await this.wait(200)
    },

    async longPressAt(x: number, y: number): Promise<void> {
      await ensureEnabled()
      await AccessibilityManager.swipe(x, y, x, y, 800)
      await this.wait(200)
    },

    async type(text: string): Promise<void> {
      await ensureEnabled()
      // Try accessibility tree first
      const content = await AccessibilityManager.getScreenContent()
      if (content && content.length > 0) {
        const editable = content.find((n: any) => n.isEditable)
        if (editable && editable.text != null) {
          await AccessibilityManager.setTextByTarget(editable.text, text)
        } else {
          await AccessibilityManager.setTextByTarget('', text)
        }
      } else {
        // A11y tree blocked for chat content, but input field might still work
        console.log('[Type] A11y tree empty, trying setTextByTarget anyway...')
        try {
          const ok = await AccessibilityManager.setTextByTarget('', text)
          console.log(`[Type] setTextByTarget result: ${ok}`)
          if (ok) return
        } catch {}
        // Fallback: set clipboard for manual paste
        console.log('[Type] setTextByTarget failed, setting clipboard')
        await AccessibilityManager.pasteText(text)
      }
      invalidateOcrCache()
      await this.wait(100)
    },

    async clearText(): Promise<void> {
      await ensureEnabled()
      const content = await AccessibilityManager.getScreenContent()
      const editable = content.find((n: any) => n.isEditable)
      if (editable) {
        await AccessibilityManager.setTextByTarget(editable.text || '', '')
      }
    },

    async paste(): Promise<void> {
      const text = await Clipboard.getString()
      await this.type(text)
    },

    // ── Element Actions ──

    async elementClick(elementId: string): Promise<void> {
      await this.click(elementId) // fallback to text match
    },

    async elementLongPress(elementId: string): Promise<void> {
      await this.longPress(elementId)
    },

    async elementSetText(elementId: string, text: string): Promise<void> {
      await ensureEnabled()
      await AccessibilityManager.setTextByTarget(elementId, text)
    },

    // ── Gestures ──

    async swipe(direction: string): Promise<void> {
      await ensureEnabled()
      await AccessibilityManager.scroll(direction)
      await this.wait(300)
    },

    async swipeAt(x1: number, y1: number, x2: number, y2: number, duration: number): Promise<void> {
      await ensureEnabled()
      await AccessibilityManager.swipe(x1, y1, x2, y2, duration)
      await this.wait(200)
    },

    async scrollDown(): Promise<void> {
      await this.swipe('down')
    },

    async scrollUp(): Promise<void> {
      await this.swipe('up')
    },

    async scrollTo(text: string): Promise<boolean> {
      for (let i = 0; i < 20; i++) {
        if (await this.screenHas(text)) return true
        await this.scrollDown()
        await this.wait(500)
      }
      return false
    },

    async pinch(direction: string): Promise<void> {
      // TODO: implement pinch gesture in native module
      this.log(`pinch(${direction}) not yet implemented`)
    },

    // ── Navigation ──

    async back(): Promise<void> {
      await ensureEnabled()
      await AccessibilityManager.pressBack()
      await this.wait(300)
    },

    async home(): Promise<void> {
      await ensureEnabled()
      await AccessibilityManager.pressHome()
      await this.wait(300)
    },

    async recent(): Promise<void> {
      await ensureEnabled()
      await AccessibilityManager.openRecents()
      await this.wait(300)
    },

    // ── App Management ──

    async launch(pkg: string): Promise<void> {
      // Use AccessibilityModule to launch app (keeps our process in foreground)
      if (AccessibilityManager) {
        try {
          await AccessibilityManager.launchApp(pkg)
          await this.wait(2000)
          return
        } catch {}
      }
      // Fallback to Linking
      try {
        await Linking.openURL(`android-app://${pkg}`)
      } catch {
        try {
          const intent = `intent:#Intent;package=${pkg};category=android.intent.category.LAUNCHER;end`
          await Linking.openURL(intent)
        } catch (e: any) {
          throw new Error(`Cannot launch ${pkg}: ${e.message}`)
        }
      }
      await this.wait(2000)
    },

    async currentApp(): Promise<string> {
      // TODO: implement in native module
      return 'unknown'
    },

    async isRunning(pkg: string): Promise<boolean> {
      // TODO: implement in native module
      return false
    },

    // ── System ──

    async wait(ms: number): Promise<void> {
      return new Promise(resolve => setTimeout(resolve, ms))
    },

    async screenshot(): Promise<string> {
      if (!PaddleOcrManager) {
        console.log('[Screenshot] PaddleOcrManager not available')
        return ''
      }
      try {
        console.log('[Screenshot] calling screenshotBase64...')
        const b64 = await PaddleOcrManager.screenshotBase64()
        console.log('[Screenshot] got ' + (b64 ? b64.length : 0) + ' chars')
        return b64 || ''
      } catch (e: any) {
        console.log('[Screenshot] error: ' + (e.message || e))
        return ''
      }
    },

    async toast(msg: string): Promise<void> {
      const { showModal } = require('../components/AppModal')
      showModal(msg)
    },

    async vibrate(ms: number): Promise<void> {
      Vibration.vibrate(ms)
    },

    async getClipboard(): Promise<string> {
      return await Clipboard.getString()
    },

    async setClipboard(text: string): Promise<void> {
      Clipboard.setString(text)
    },

    getTime(): number {
      return Date.now()
    },

    getScreenSize(): { width: number; height: number } {
      const { Dimensions } = require('react-native')
      const { width, height } = Dimensions.get('screen')
      const { PixelRatio } = require('react-native')
      const scale = PixelRatio.get()
      return { width: Math.round(width * scale), height: Math.round(height * scale) }
    },

    log(msg: string): void {
      console.log('[Script]', msg)
      onLog?.(msg)
      // Also send to overlay if running
      ScriptOverlayManager?.addLog(msg)
    },

    // ── Notifications ──

    async getNotifications(): Promise<any[]> {
      // TODO: implement via NotificationListenerService
      return []
    },

    async clearNotification(index: number): Promise<void> {
      // TODO: implement
    },

    // ── Network ──

    async httpGet(url: string): Promise<{ status: number; body: string }> {
      try {
        const headers: Record<string, string> = {}
        // Auto-inject auth for AgentCab API
        if (url.includes('agentcab.ai') || url.includes('agentcab.cn')) {
          const { getAccessToken } = require('../services/storage')
          const token = await getAccessToken()
          if (token) headers['Authorization'] = `Bearer ${token}`
        }
        const res = await fetch(url, { headers })
        const body = await res.text()
        return { status: res.status, body }
      } catch (e: any) {
        throw new Error(`HTTP GET failed: ${e.message}`)
      }
    },

    async httpPost(url: string, data: any): Promise<{ status: number; body: string }> {
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        // Auto-inject auth for AgentCab API
        if (url.includes('agentcab.ai') || url.includes('agentcab.cn')) {
          const { getAccessToken } = require('../services/storage')
          const token = await getAccessToken()
          if (token) headers['Authorization'] = `Bearer ${token}`
        }
        const res = await fetch(url, {
          method: 'POST',
          headers,
          body: typeof data === 'string' ? data : JSON.stringify(data),
        })
        const body = await res.text()
        return { status: res.status, body }
      } catch (e: any) {
        throw new Error(`HTTP POST failed: ${e.message}`)
      }
    },

    // ── Storage ──

    storeGet(key: string): any {
      // Sync read not possible with AsyncStorage, return cached value
      return null // TODO: pre-load store values
    },

    storeSet(key: string, value: any): void {
      AsyncStorage.setItem(STORE_PREFIX + key, JSON.stringify(value)).catch(() => {})
    },

    storeRemove(key: string): void {
      AsyncStorage.removeItem(STORE_PREFIX + key).catch(() => {})
    },

    // ── CV (Computer Vision) ──

    async cvSSIM(): Promise<number> {
      if (!CvManager) return 0
      try { return await CvManager.ssim() } catch { return 0 }
    },

    async cvIsStable(threshold?: number): Promise<boolean> {
      if (!CvManager) return true
      try { return await CvManager.isStable(threshold ?? 0.95) } catch { return true }
    },

    async cvTemplateMatch(templateBase64: string, threshold?: number): Promise<{ x: number; y: number; confidence: number; found: boolean }> {
      if (!CvManager) return { x: 0, y: 0, confidence: 0, found: false }
      try { return await CvManager.templateMatch(templateBase64, threshold ?? 0.8) } catch { return { x: 0, y: 0, confidence: 0, found: false } }
    },

    async cvFindRects(minArea?: number, maxResults?: number): Promise<any[]> {
      if (!CvManager) return []
      try { return await CvManager.findRects(minArea ?? 5000, maxResults ?? 20) } catch { return [] }
    },

    async cvRegionColor(x: number, y: number, w: number, h: number): Promise<any> {
      if (!CvManager) return { r: 0, g: 0, b: 0, isGreen: false, isWhite: false, isGray: false }
      try { return await CvManager.regionColor(x, y, w, h) } catch { return { r: 0, g: 0, b: 0, isGreen: false, isWhite: false, isGray: false } }
    },

    async cvDiffRegions(threshold?: number, minAreaRatio?: number): Promise<any[]> {
      if (!CvManager) return []
      try { return await CvManager.diffRegions(threshold ?? 30, minAreaRatio ?? 0.005) } catch { return [] }
    },

    async cvCropScreenshot(x: number, y: number, w: number, h: number): Promise<string> {
      if (!CvManager) return ''
      try { return await CvManager.cropScreenshot(x, y, w, h) } catch { return '' }
    },

    async cvTemplateMatchMultiScale(templateBase64: string, threshold?: number): Promise<{ x: number; y: number; confidence: number; found: boolean; scale: number }> {
      if (!CvManager) return { x: 0, y: 0, confidence: 0, found: false, scale: 1 }
      try { return await CvManager.templateMatchMultiScale(templateBase64, threshold ?? 0.7) } catch { return { x: 0, y: 0, confidence: 0, found: false, scale: 1 } }
    },

    async cvDetectElements(minAreaRatio?: number, maxResults?: number): Promise<any[]> {
      if (!CvManager) return []
      try { return await CvManager.detectElements(minAreaRatio ?? 0.002, maxResults ?? 30) } catch { return [] }
    },

    async cvGlobalMotion(): Promise<{ dx: number; dy: number; magnitude: number; scrolling: boolean; direction: string }> {
      if (!CvManager) return { dx: 0, dy: 0, magnitude: 0, scrolling: false, direction: 'none' }
      try { return await CvManager.globalMotion() } catch { return { dx: 0, dy: 0, magnitude: 0, scrolling: false, direction: 'none' } }
    },

    async cvTrackPoints(points: number[][]): Promise<any[]> {
      if (!CvManager) return []
      try { return await CvManager.trackPoints(points) } catch { return [] }
    },

    async cvStartPerception(intervalMs?: number, stableThreshold?: number): Promise<void> {
      if (CvManager) { try { await CvManager.startPerception(intervalMs ?? 500, stableThreshold ?? 0.95) } catch {} }
    },

    async cvStopPerception(): Promise<void> {
      if (CvManager) { try { await CvManager.stopPerception() } catch {} }
    },

    async cvGetPerception(): Promise<any> {
      if (!CvManager) return { ssim: 0, isStable: true, hasChanged: false, changeCount: 0, stableCount: 0, frameCount: 0 }
      try { return await CvManager.getPerception() } catch { return { ssim: 0, isStable: true, hasChanged: false, changeCount: 0, stableCount: 0, frameCount: 0 } }
    },

    async cvPixelColor(x: number, y: number): Promise<{ r: number; g: number; b: number; a: number }> {
      if (!CvManager) return { r: 0, g: 0, b: 0, a: 0 }
      try { return await CvManager.pixelColor(x, y) } catch { return { r: 0, g: 0, b: 0, a: 0 } }
    },

    async cvTemplateMatchAll(templateBase64: string, threshold?: number, maxResults?: number): Promise<any[]> {
      if (!CvManager) return []
      try { return await CvManager.templateMatchAll(templateBase64, threshold ?? 0.8, maxResults ?? 10) } catch { return [] }
    },

    async cvScreenMeta(): Promise<any> {
      if (!CvManager) return { screenWidth: 0, screenHeight: 0, density: 1, densityDpi: 160, statusBarHeight: 0, navBarHeight: 0 }
      try { return await CvManager.screenMeta() } catch { return { screenWidth: 0, screenHeight: 0, density: 1, densityDpi: 160, statusBarHeight: 0, navBarHeight: 0 } }
    },

    async ocrRegion(x: number, y: number, w: number, h: number): Promise<any[]> {
      if (!PaddleOcrManager) return []
      const ready = await initPaddleOcr()
      if (!ready) return []
      try { return await PaddleOcrManager.ocrRegion(x, y, w, h) } catch { return [] }
    },

    async cvLockFrame(): Promise<boolean> {
      if (!CvManager) return false
      try { return await CvManager.lockFrame() } catch { return false }
    },

    async cvUnlockFrame(): Promise<void> {
      if (CvManager) { try { await CvManager.unlockFrame() } catch {} }
    },

    async cvSaveTemplate(name: string, x: number, y: number, w: number, h: number): Promise<boolean> {
      if (!CvManager) return false
      try { return await CvManager.saveTemplate(name, x, y, w, h) } catch { return false }
    },

    async cvMatchByName(name: string, threshold?: number): Promise<{ x: number; y: number; confidence: number; found: boolean }> {
      if (!CvManager) return { x: 0, y: 0, confidence: 0, found: false }
      try { return await CvManager.matchByName(name, threshold ?? 0.8) } catch { return { x: 0, y: 0, confidence: 0, found: false } }
    },

    async cvListTemplates(): Promise<string[]> {
      if (!CvManager) return []
      try { return await CvManager.listTemplates() } catch { return [] }
    },

    async cvDeleteTemplate(name: string): Promise<void> {
      if (CvManager) { try { await CvManager.deleteTemplate(name) } catch {} }
    },

    async cvResetFrame(): Promise<void> {
      if (CvManager) { try { await CvManager.resetFrame() } catch {} }
    },
  }
}
