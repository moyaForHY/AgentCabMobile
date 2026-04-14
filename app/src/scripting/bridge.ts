/**
 * ScriptBridge implementation
 * Connects the script interpreter to Android's AccessibilityService via NativeModules.
 */

import { NativeModules, Platform, Linking, Vibration, Clipboard, DeviceEventEmitter } from 'react-native'
import type { ScriptBridge } from './interpreter'
import AsyncStorage from '@react-native-async-storage/async-storage'

const AccessibilityManager = NativeModules.AccessibilityManager ?? null
const ScriptOverlayManager = NativeModules.ScriptOverlayManager ?? null
const PaddleOcrManager = NativeModules.PaddleOcrManager ?? null
const CvManager = NativeModules.CvManager ?? null
const YoloIconManager = NativeModules.YoloIconManager ?? null

// react-native-blob-util provides fs + downloader; same dep used elsewhere in app
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ReactNativeBlobUtil = (() => { try { return require('react-native-blob-util').default } catch { return null } })()

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

// Per-bridge OCR cache (created inside createBridge closure)
type OcrCache = { results: OcrResult[] | null; time: number }

async function getOcrResults(cache: OcrCache): Promise<OcrResult[]> {
  const now = Date.now()
  if (cache.results && now - cache.time < OCR_CACHE_TTL) return cache.results

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
    cache.results = results
    cache.time = now
    return results
  } catch (e: any) {
    console.log('[OCR] Error:', e.message || e)
    return []
  }
}

function invalidateOcrCache(cache: OcrCache) {
  cache.results = null
  cache.time = 0
}

/**
 * Get screen content — try accessibility tree first, fall back to OCR if empty.
 * Returns normalized format: [{text, isClickable, ...}]
 */
async function getScreenNodes(cache: OcrCache): Promise<{ nodes: any[], source: 'a11y' | 'ocr' }> {
  await ensureEnabled()
  // 统一用 OCR，不走无障碍树（无障碍树缺少坐标/背景色等信息）
  const ocrResults = await getOcrResults(cache)
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
async function smartClick(text: string, cache: OcrCache): Promise<boolean> {
  await ensureEnabled()
  // Try accessibility tree first
  const content = await AccessibilityManager.getScreenContent()
  if (content && content.length > 0) {
    console.log(`[Click] A11y click: "${text}"`)
    return await AccessibilityManager.clickByText(text)
  }
  // Fall back to OCR
  console.log(`[Click] OCR click: "${text}"`)
  const ocrResults = await getOcrResults(cache)
  const match = ocrResults.find((r: OcrResult) => r.text.includes(text))
  if (!match) {
    // Try matching individual elements for finer granularity
    for (const line of ocrResults) {
      if (line.elements) {
        const el = line.elements.find((e: OcrResult) => e.text.includes(text))
        if (el) {
          console.log(`[Click] OCR element match: "${el.text}" at (${el.centerX}, ${el.centerY})`)
          await AccessibilityManager.swipe(el.centerX, el.centerY, el.centerX, el.centerY, 50)
          invalidateOcrCache(cache)
          return true
        }
      }
    }
    console.log(`[Click] OCR: "${text}" not found in ${ocrResults.length} results`)
    return false
  }
  console.log(`[Click] OCR match: "${match.text}" at (${match.centerX}, ${match.centerY})`)
  await AccessibilityManager.swipe(match.centerX, match.centerY, match.centerX, match.centerY, 50)
  invalidateOcrCache(cache)
  return true
}

export function createBridge(scriptId?: string, onLog?: (msg: string) => void): ScriptBridge {
  const STORE_PREFIX = 'script_store_'
  const logs: string[] = []

  // Per-bridge state (isolated from other bridges)
  const _cache: OcrCache = { results: null, time: 0 }
  let _overlayLogsEnabled = true

  const raw: ScriptBridge = {
    // ── Screen Query (auto-fallback: accessibility tree → OCR) ──

    async screenHas(text: string): Promise<boolean> {
      const { nodes } = await getScreenNodes(_cache)
      return nodes.some((n: any) =>
        (n.text && n.text.includes(text)) ||
        (n.contentDescription && n.contentDescription?.includes(text))
      )
    },

    async screenFindText(text: string): Promise<any | null> {
      const { nodes } = await getScreenNodes(_cache)
      return nodes.find((n: any) =>
        (n.text && n.text.includes(text)) ||
        (n.contentDescription && n.contentDescription?.includes(text))
      ) || null
    },

    async screenFindAll(text: string): Promise<any[]> {
      const { nodes } = await getScreenNodes(_cache)
      return nodes.filter((n: any) =>
        (n.text && n.text.includes(text)) ||
        (n.contentDescription && n.contentDescription?.includes(text))
      )
    },

    async screenFindByColor(r: number, g: number, b: number, tolerance: number = 50): Promise<any[]> {
      // 1. CV 找色块
      if (!CvManager) {
        // fallback: 全屏 OCR + 颜色过滤
        const { nodes } = await getScreenNodes(_cache)
        return nodes.filter((n: any) => {
          const dr = Math.abs((n._bgR ?? 0) - r)
          const dg = Math.abs((n._bgG ?? 0) - g)
          const db = Math.abs((n._bgB ?? 0) - b)
          return dr < tolerance && dg < tolerance && db < tolerance
        })
      }

      const elements: any[] = await CvManager.detectElements(0.002, 50)

      // 2. 按颜色筛选色块
      const matched = elements.filter((el: any) =>
        Math.abs(el.r - r) < tolerance &&
        Math.abs(el.g - g) < tolerance &&
        Math.abs(el.b - b) < tolerance
      )

      // 3. 对匹配的色块做区域 OCR
      const ready = await initPaddleOcr()
      if (!ready || !PaddleOcrManager) return []

      const results: any[] = []
      for (const el of matched) {
        try {
          const ocrResults: OcrResult[] = await PaddleOcrManager.ocrRegion(el.x, el.y, el.width, el.height)
          // 一个色块的所有文字合并为一条
          const text = ocrResults.map((o: OcrResult) => o.text).join('')
          if (text.length > 0) {
            results.push({
              text,
              _ocr: true,
              _bounds: { left: el.x, top: el.y, right: el.x + el.width, bottom: el.y + el.height },
              _center: { x: el.cx, y: el.cy },
              _bgR: el.r,
              _bgG: el.g,
              _bgB: el.b,
            })
          }
        } catch {}
      }
      return results
    },

    async screenFindId(id: string): Promise<any | null> {
      await ensureEnabled()
      const content = await AccessibilityManager.getScreenContent()
      return content.find((n: any) => n.viewId === id) || null
    },

    async screenWaitFor(text: string, timeout: number): Promise<boolean> {
      const deadline = Date.now() + timeout
      while (Date.now() < deadline) {
        invalidateOcrCache(_cache) // Force fresh screenshot each check
        if (await this.screenHas(text)) return true
        await this.wait(500)
      }
      return false
    },

    async screenWaitGone(text: string, timeout: number): Promise<boolean> {
      const deadline = Date.now() + timeout
      while (Date.now() < deadline) {
        invalidateOcrCache(_cache)
        if (!(await this.screenHas(text))) return true
        await this.wait(500)
      }
      return false
    },

    async screenGetText(near: string): Promise<string | null> {
      const { nodes } = await getScreenNodes(_cache)
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
      const { nodes, source } = await getScreenNodes(_cache)
      return JSON.stringify({ source, nodes }, null, 2)
    },

    // ── Actions ──

    async click(text: string): Promise<void> {
      await ensureEnabled()
      const success = await smartClick(text, _cache)
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
      invalidateOcrCache(_cache)
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

    // 等待元素出现
    // condition: { text, bgColor?: {r,g,b,tolerance}, region?: {x,y,w,h}, timeout?: ms }
    async waitFor(condition: any): Promise<any> {
      const timeout = condition.timeout || 10000
      const start = Date.now()
      while (Date.now() - start < timeout) {
        const nodes = condition.region
          ? await this.ocrRegion(condition.region.x, condition.region.y, condition.region.w, condition.region.h)
          : await this.ocrFullScreen()
        for (const n of nodes) {
          if (!n?.text) continue
          const t = String(n.text)
          // 文字匹配
          if (condition.text && t.indexOf(condition.text) < 0) continue
          // 颜色过滤
          if (condition.bgColor) {
            const tol = condition.bgColor.tolerance ?? 4
            if (Math.abs((n._bgR || 0) - condition.bgColor.r) > tol) continue
            if (Math.abs((n._bgG || 0) - condition.bgColor.g) > tol) continue
            if (Math.abs((n._bgB || 0) - condition.bgColor.b) > tol) continue
          }
          return { found: true, text: t, x: n._center?.x || 0, y: n._center?.y || 0, node: n }
        }
        await this.wait(500)
      }
      return { found: false }
    },

    // 等待画面变化
    async waitForChange(timeoutMs?: number): Promise<boolean> {
      const timeout = timeoutMs || 10000
      const start = Date.now()
      while (Date.now() - start < timeout) {
        const state = await this.cvGetPerception()
        if (state.hasChanged) return true
        await this.wait(300)
      }
      return false
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
      try { return await AccessibilityManager.getCurrentPackage() || 'unknown' } catch { return 'unknown' }
    },

    async isRunning(pkg: string): Promise<boolean> {
      try { return (await AccessibilityManager.getCurrentPackage()) === pkg } catch { return false }
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
      if (_overlayLogsEnabled) ScriptOverlayManager?.addLog(msg)
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

    async cvSSIM(b64?: string): Promise<number> {
      if (!CvManager) return 0
      try { return await CvManager.ssim(b64 || null) } catch (e) { console.error("[CV] error:", e); return 0 }
    },

    async cvIsStable(threshold?: number): Promise<boolean> {
      if (!CvManager) return true
      try { return await CvManager.isStable(threshold ?? 0.95) } catch (e) { console.error("[CV] error:", e); return true }
    },

    async cvTemplateMatch(templateBase64: string, threshold?: number): Promise<{ x: number; y: number; confidence: number; found: boolean }> {
      if (!CvManager) return { x: 0, y: 0, confidence: 0, found: false }
      try { return await CvManager.templateMatch(templateBase64, threshold ?? 0.8) } catch (e) { console.error("[CV] error:", e); return { x: 0, y: 0, confidence: 0, found: false } }
    },

    /**
     * 确保模型已下载到本地。先看缓存，没有则下载 + 校验 sha256 + 解压。
     * 模型目录: filesDir/models/<name>/
     * zip 内应包含 model.ncnn.param / model.ncnn.bin / classes.txt
     */
    async _ensureModelInner(
      name: string,
      url: string,
      sha256: string,
      _size?: number,
    ): Promise<boolean> {
      if (!YoloIconManager) {
        console.warn('[ensureModel] YoloIconManager not available')
        return false
      }
      if (!ReactNativeBlobUtil) {
        console.warn('[ensureModel] react-native-blob-util not available')
        return false
      }
      // 1. Already loaded native-side?
      try {
        const ready = await YoloIconManager.isModelReady(name)
        if (ready) {
          // Verify cached file hash quickly
          const dir = `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/models/${name}`
          const zipPath = `${dir}/model.zip`
          const exists = await ReactNativeBlobUtil.fs.exists(zipPath)
          if (exists) {
            const cached = await ReactNativeBlobUtil.fs.hash(zipPath, 'sha256')
            if (cached === sha256) {
              await YoloIconManager.loadModel(name)
              return true
            }
            // Hash mismatch -> fall through to redownload
            console.warn(`[ensureModel] cached sha256 mismatch, redownloading ${name}`)
          } else {
            // Files exist but no zip stored — trust them
            await YoloIconManager.loadModel(name)
            return true
          }
        }
      } catch {}

      // 2. Download — `url` is either a full https URL or a file_id
      const dir = `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/models/${name}`
      const zipPath = `${dir}/model.zip`
      // Ensure parent dirs exist. This is private sandbox, should never need
      // permissions — if mkdir fails, surface the real error.
      const dirExists = await ReactNativeBlobUtil.fs.isDir(dir).catch(() => false)
      if (!dirExists) {
        try {
          await ReactNativeBlobUtil.fs.mkdir(dir)
        } catch (e: any) {
          throw new Error(`[ensureModel] mkdir failed for ${dir}: ${e?.message || e}`)
        }
      }
      // Pre-clean any stale zip so overwrite semantics are explicit
      try { await ReactNativeBlobUtil.fs.unlink(zipPath) } catch {}

      let fetchUrl = url
      const headers: Record<string, string> = {}
      if (!/^https?:\/\//i.test(url)) {
        const { SITE_URL } = require('../services/api')
        const { getAccessToken } = require('../services/storage')
        fetchUrl = `${SITE_URL}/v1/files/${url}`
        const token = await getAccessToken()
        if (token) headers.Authorization = `Bearer ${token}`
      }
      console.log(`[ensureModel] downloading ${name} to ${zipPath}`)
      let res
      try {
        res = await ReactNativeBlobUtil
          // No `fileCache` — we provide an explicit path; fileCache writes to
          // an extra temp location that some ROMs treat as external storage
          // and block without permission.
          .config({ path: zipPath, overwrite: true })
          .fetch('GET', fetchUrl, headers)
      } catch (e: any) {
        throw new Error(`[ensureModel] fetch failed for ${name} → ${zipPath}: ${e?.message || e}`)
      }
      const status = res.info().status
      if (status < 200 || status >= 300) {
        throw new Error(`[ensureModel] download ${name} failed: HTTP ${status}`)
      }

      // 3. Verify sha256
      const got = await ReactNativeBlobUtil.fs.hash(zipPath, 'sha256')
      if (got !== sha256) {
        throw new Error(`sha256 mismatch for ${name}: expected ${sha256}, got ${got}`)
      }

      // 4. Unzip — flat zip (zip -j), files at root
      try {
        await ReactNativeBlobUtil.fs.unlink(`${dir}/model.ncnn.bin`).catch(() => {})
        await ReactNativeBlobUtil.fs.unlink(`${dir}/model.ncnn.param`).catch(() => {})
        await ReactNativeBlobUtil.fs.unlink(`${dir}/classes.txt`).catch(() => {})
        const { unzip } = require('react-native-zip-archive')
        await unzip(zipPath, dir)
      } catch (e: any) {
        throw new Error(`unzip failed for ${name}: ${e?.message || e}`)
      }

      // 5. Load into native
      await YoloIconManager.loadModel(name)
      try {
        const { ScriptManager } = require('./ScriptManager')
        ScriptManager.trackYoloModel(name)
      } catch {}
      console.log(`[ensureModel] ${name} ready`)
      return true
    },

    /**
     * Public wrapper — surfaces errors via Toast + worker-side error report
     * so we can debug model-download failures on user devices remotely.
     */
    async ensureModel(
      name: string,
      url: string,
      sha256: string,
      size?: number,
    ): Promise<boolean> {
      try {
        return await (this as any)._ensureModelInner(name, url, sha256, size)
      } catch (e: any) {
        const { reportError } = require('../services/errorReporter')
        reportError('ensureModel', e, { name, url, sha256, size })
        return false
      }
    },

    /**
     * 用 YOLO 模型检测屏幕上的图标。
     * 返回 [{cls, clsId, conf, x, y, w, h, cx, cy}, ...]
     */
    async cvDetectIcons(
      modelName: string,
      options?: { conf?: number; iou?: number; classes?: string[] },
    ): Promise<Array<{ cls: string; clsId: number; conf: number; x: number; y: number; w: number; h: number; cx: number; cy: number }>> {
      if (!YoloIconManager) return []
      try {
        const all = await YoloIconManager.detect(modelName, options?.conf ?? 0.4, options?.iou ?? 0.45)
        if (options?.classes && options.classes.length > 0) {
          const set = new Set(options.classes)
          return all.filter((r: any) => set.has(r.cls))
        }
        return all
      } catch (e) {
        console.error('[cvDetectIcons] error:', e)
        return []
      }
    },

    async cvFindIconByShape(
      templateBase64: string,
      options?: {
        minArea?: number
        maxArea?: number
        minCircularity?: number
        shapeThreshold?: number
        maxResults?: number
        invert?: boolean
      },
    ): Promise<{ found: boolean; matches: Array<{ x: number; y: number; w: number; h: number; cx: number; cy: number; score: number; area: number }> }> {
      if (!CvManager) return { found: false, matches: [] }
      try { return await CvManager.findIconByShape(templateBase64, options ?? {}) } catch (e) { console.error("[CV] findIconByShape error:", e); return { found: false, matches: [] } }
    },

    async cvFindRects(minArea?: number, maxResults?: number): Promise<any[]> {
      if (!CvManager) return []
      try { return await CvManager.findRects(minArea ?? 5000, maxResults ?? 20) } catch (e) { console.error("[CV] error:", e); return [] }
    },

    async cvRegionColor(x: number, y: number, w: number, h: number): Promise<any> {
      if (!CvManager) return { r: 0, g: 0, b: 0, isGreen: false, isWhite: false, isGray: false }
      try { return await CvManager.regionColor(x, y, w, h) } catch (e) { console.error("[CV] error:", e); return { r: 0, g: 0, b: 0, isGreen: false, isWhite: false, isGray: false } }
    },

    async cvDiffRegions(threshold?: number, minAreaRatio?: number): Promise<any[]> {
      if (!CvManager) return []
      try { return await CvManager.diffRegions(threshold ?? 30, minAreaRatio ?? 0.005) } catch (e) { console.error("[CV] error:", e); return [] }
    },

    async cvCropScreenshot(x: number, y: number, w: number, h: number): Promise<string> {
      if (!CvManager) return ''
      try { return await CvManager.cropScreenshot(x, y, w, h) } catch (e) { console.error('[CV] cropScreenshot error:', e); return '' }
    },

    async cvStitchImages(imagesB64: string[]): Promise<string> {
      if (!CvManager) return imagesB64[0] || ''
      try { return await CvManager.stitchImages(imagesB64) } catch (e) { console.error('[CV] stitchImages error:', e); return imagesB64[0] || '' }
    },

    async cvTemplateMatchMultiScale(templateBase64: string, threshold?: number): Promise<{ x: number; y: number; confidence: number; found: boolean; scale: number }> {
      if (!CvManager) return { x: 0, y: 0, confidence: 0, found: false, scale: 1 }
      try { return await CvManager.templateMatchMultiScale(templateBase64, threshold ?? 0.7) } catch (e) { console.error("[CV] error:", e); return { x: 0, y: 0, confidence: 0, found: false, scale: 1 } }
    },

    async cvDetectElements(minAreaRatio?: number, maxResults?: number, dilateSize?: number, cannyLow?: number, cannyHigh?: number): Promise<any[]> {
      if (!CvManager) return []
      try { return await CvManager.detectElements(minAreaRatio ?? 0.002, maxResults ?? 30, dilateSize ?? 3, cannyLow ?? 40, cannyHigh ?? 120) } catch (e) { console.error("[CV] error:", e); return [] }
    },

    async cvGlobalMotion(): Promise<{ dx: number; dy: number; magnitude: number; scrolling: boolean; direction: string }> {
      if (!CvManager) return { dx: 0, dy: 0, magnitude: 0, scrolling: false, direction: 'none' }
      try { return await CvManager.globalMotion() } catch (e) { console.error("[CV] error:", e); return { dx: 0, dy: 0, magnitude: 0, scrolling: false, direction: 'none' } }
    },

    async cvTrackPoints(points: number[][]): Promise<any[]> {
      if (!CvManager) return []
      try { return await CvManager.trackPoints(points) } catch (e) { console.error("[CV] error:", e); return [] }
    },

    async cvStartPerception(intervalMs?: number, stableThreshold?: number): Promise<void> {
      if (CvManager) {
        const interval = intervalMs ?? 500
        const threshold = stableThreshold ?? 0.95
        console.log(`[CV] startPerception interval=${interval} threshold=${threshold}`)
        try { await CvManager.startPerception(interval, threshold) } catch (e) { console.error('[CV] startPerception error:', e) }
        _overlayLogsEnabled = false
      }
    },

    async cvStopPerception(): Promise<void> {
      if (CvManager) { try { await CvManager.stopPerception() } catch {} }
      _overlayLogsEnabled = true  // 恢复悬浮窗日志
    },

    async cvAckChange(): Promise<void> {
      if (CvManager) { try { await CvManager.ackChange() } catch {} }
    },

    async cvGetPerception(): Promise<any> {
      if (!CvManager) return { ssim: 0, isStable: true, hasChanged: false, changeCount: 0, stableCount: 0, frameCount: 0 }
      try { return await CvManager.getPerception() } catch (e) { console.error("[CV] error:", e); return { ssim: 0, isStable: true, hasChanged: false, changeCount: 0, stableCount: 0, frameCount: 0 } }
    },

    async cvPixelColor(x: number, y: number): Promise<{ r: number; g: number; b: number; a: number }> {
      if (!CvManager) return { r: 0, g: 0, b: 0, a: 0 }
      try { return await CvManager.pixelColor(x, y) } catch (e) { console.error("[CV] error:", e); return { r: 0, g: 0, b: 0, a: 0 } }
    },

    async cvTemplateMatchAll(templateBase64: string, threshold?: number, maxResults?: number): Promise<any[]> {
      if (!CvManager) return []
      try { return await CvManager.templateMatchAll(templateBase64, threshold ?? 0.8, maxResults ?? 10) } catch (e) { console.error("[CV] error:", e); return [] }
    },

    async cvFeatureMatch(templateBase64: string, minMatches?: number): Promise<{ x: number; y: number; found: boolean; matchCount: number; totalKeypoints: number }> {
      if (!CvManager) return { x: 0, y: 0, found: false, matchCount: 0, totalKeypoints: 0 }
      try { return await CvManager.featureMatch(templateBase64, minMatches ?? 10) } catch (e) { console.error("[CV] error:", e); return { x: 0, y: 0, found: false, matchCount: 0, totalKeypoints: 0 } }
    },

    async cvScreenMeta(): Promise<any> {
      if (!CvManager) return { screenWidth: 0, screenHeight: 0, density: 1, densityDpi: 160, statusBarHeight: 0, navBarHeight: 0 }
      try { return await CvManager.screenMeta() } catch (e) { console.error("[CV] error:", e); return { screenWidth: 0, screenHeight: 0, density: 1, densityDpi: 160, statusBarHeight: 0, navBarHeight: 0 } }
    },

    async ocrRegion(x: number, y: number, w: number, h: number): Promise<any[]> {
      if (!PaddleOcrManager) return []
      const ready = await initPaddleOcr()
      if (!ready) return []
      try { return await PaddleOcrManager.ocrRegion(x, y, w, h) } catch (e) { console.error("[CV] error:", e); return [] }
    },

    async cvLockFrame(): Promise<boolean> {
      if (!CvManager) return false
      try { return await CvManager.lockFrame() } catch (e) { console.error("[CV] error:", e); return false }
    },

    async cvUnlockFrame(): Promise<void> {
      if (CvManager) { try { await CvManager.unlockFrame() } catch {} }
    },

    async cvSaveTemplate(name: string, x: number, y: number, w: number, h: number): Promise<boolean> {
      if (!CvManager) return false
      try { return await CvManager.saveTemplate(name, x, y, w, h) } catch (e) { console.error("[CV] error:", e); return false }
    },

    async cvMatchByName(name: string, threshold?: number): Promise<{ x: number; y: number; confidence: number; found: boolean }> {
      if (!CvManager) return { x: 0, y: 0, confidence: 0, found: false }
      try { return await CvManager.matchByName(name, threshold ?? 0.8) } catch (e) { console.error("[CV] error:", e); return { x: 0, y: 0, confidence: 0, found: false } }
    },

    async cvListTemplates(): Promise<string[]> {
      if (!CvManager) return []
      try { return await CvManager.listTemplates() } catch (e) { console.error("[CV] error:", e); return [] }
    },

    async cvDeleteTemplate(name: string): Promise<void> {
      if (CvManager) { try { await CvManager.deleteTemplate(name) } catch {} }
    },

    async cvEditDistance(a: string, b: string, maxDist?: number): Promise<number> {
      if (!CvManager) return Math.abs(a.length - b.length)
      try { return await CvManager.editDistance(a, b, maxDist ?? Math.max(a.length, b.length)) } catch (e) { console.error("[CV] error:", e); return Math.abs(a.length - b.length) }
    },

    async cvFuzzyTextMatch(a: string, b: string, threshold?: number): Promise<boolean> {
      if (!CvManager) return a === b
      try { return await CvManager.fuzzyTextMatch(a, b, threshold ?? 0.3) } catch (e) { console.error("[CV] error:", e); return a === b }
    },

    async cvFuzzyFindInList(query: string, list: string[], threshold?: number): Promise<number[]> {
      if (!CvManager) return []
      try { return await CvManager.fuzzyFindInList(query, list, threshold ?? 0.3) } catch (e) { console.error("[CV] error:", e); return [] }
    },

    setOverlayLogs(enabled: boolean): void {
      _overlayLogsEnabled = enabled
    },

    async cvResetFrame(): Promise<void> {
      if (CvManager) { try { await CvManager.resetFrame() } catch {} }
    },

    async overlayShowHtml(html: string): Promise<void> {
      if (ScriptOverlayManager?.showOverlayHtml) {
        await ScriptOverlayManager.showOverlayHtml(html)
      }
    },

    async overlayHide(): Promise<void> {
      if (ScriptOverlayManager?.hideOverlayPanel) {
        await ScriptOverlayManager.hideOverlayPanel()
      }
    },

    // Wait for overlay WebView action (button click)
    // Returns { action: string, data: object } or null on timeout
    async waitForOverlayAction(timeoutMs: number): Promise<{ action: string; data: any } | null> {
      return new Promise((resolve) => {
        let timer: any = null
        const sub = DeviceEventEmitter.addListener('onOverlayAction', (event) => {
          sub.remove()
          if (timer) clearTimeout(timer)
          try {
            resolve({ action: event.action, data: JSON.parse(event.data || '{}') })
          } catch {
            resolve({ action: event.action, data: {} })
          }
        })
        if (timeoutMs > 0) {
          timer = setTimeout(() => { sub.remove(); resolve(null) }, timeoutMs)
        }
      })
    },

    // ── Audio Recording ──
    async startRecording(): Promise<string | null> {
      const AudioRecorder = NativeModules.AudioRecorder
      if (!AudioRecorder) return null
      try {
        const { requirePermission } = require('../services/permissionGate')
        const ok = await requirePermission('audio')
        if (!ok) {
          console.error('[Audio] permission denied')
          return null
        }
        const filename = `memo_${Date.now()}.m4a`
        return await AudioRecorder.startRecording(filename)
      } catch (e) {
        console.error('[Audio] start error:', e)
        return null
      }
    },

    async stopRecording(): Promise<string | null> {
      const AudioRecorder = NativeModules.AudioRecorder
      if (!AudioRecorder) return null
      try {
        return await AudioRecorder.stopRecording()
      } catch (e) {
        console.error('[Audio] stop error:', e)
        return null
      }
    },

    async isRecording(): Promise<boolean> {
      const AudioRecorder = NativeModules.AudioRecorder
      if (!AudioRecorder) return false
      try {
        return await AudioRecorder.isRecording()
      } catch {
        return false
      }
    },

    async fileToBase64(filePath: string): Promise<string | null> {
      try {
        const RNFS = require('react-native-blob-util').default
        return await RNFS.fs.readFile(filePath, 'base64')
      } catch (e) {
        console.error('[File] base64 error:', e)
        return null
      }
    },

    // Take screenshot and return base64 encoded PNG
    async screenshotBase64(): Promise<string | null> {
      if (!PaddleOcrManager) return null
      try {
        await initPaddleOcr()
        // Use CvManager to get screenshot as base64
        if (CvManager?.screenshotBase64) {
          return await CvManager.screenshotBase64()
        }
        // Fallback: use accessibility service screenshot
        if (AccessibilityManager?.screenshotBase64) {
          return await AccessibilityManager.screenshotBase64()
        }
        return null
      } catch (e) {
        console.error('[Screenshot] base64 error:', e)
        return null
      }
    },
  }

  // Wrap every method so that any thrown error is auto-reported to the worker
  // via the errorReporter. Script code that catches errors itself still works
  // (caught = not thrown past this proxy). This catches everything the bridge
  // doesn't handle internally — permission denials, native module crashes,
  // network failures — without having to touch 60+ individual catch blocks.
  return new Proxy(raw, {
    get(target, prop: string) {
      const value = (target as any)[prop]
      if (typeof value !== 'function') return value
      return function (this: any, ...args: any[]) {
        const onError = (e: any) => {
          const brief = (e?.message || String(e) || 'unknown').split('\n')[0].slice(0, 160)
          // 1) push into the script log stream so it shows in the overlay /
          //    ScriptExecutor log view — visible even when the floating window
          //    covers any Toast
          try { onLog?.(`⚠ bridge.${String(prop)}: ${brief}`) } catch {}
          // 2) also push into the overlay log HUD directly (in case the
          //    overlay is showing but the script's onLog isn't hooked)
          try {
            if (ScriptOverlayManager?.addLog) {
              ScriptOverlayManager.addLog(`⚠ bridge.${String(prop)}: ${brief}`)
            }
          } catch {}
          // 3) upload to worker for remote debugging
          try {
            const { reportError } = require('../services/errorReporter')
            reportError(`bridge.${String(prop)}`, e, {
              scriptId,
              argCount: args.length,
              argPreview: args.slice(0, 2).map(a => {
                if (a == null) return String(a)
                if (typeof a === 'string') return a.length > 80 ? a.slice(0, 80) + '…' : a
                if (typeof a === 'object') return '[object]'
                return String(a)
              }),
            }, true)
          } catch {}
        }
        try {
          const result = value.apply(target, args)
          if (result && typeof result.then === 'function') {
            return result.catch((e: any) => { onError(e); throw e })
          }
          return result
        } catch (e) {
          onError(e)
          throw e
        }
      }
    },
  })
}
