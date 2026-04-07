/**
 * AgentCab Script Interpreter
 * Executes AST nodes, calling accessibility APIs through a bridge.
 */

import * as AST from './ast'

// ── Signal classes for control flow ──
class ReturnSignal { constructor(public value: any) {} }
class BreakSignal {}
class ContinueSignal {}

// ── Environment (scope chain) ──
class Environment {
  private vars: Record<string, any> = {}
  constructor(public parent: Environment | null = null) {}

  get(name: string): any {
    if (name in this.vars) return this.vars[name]
    if (this.parent) return this.parent.get(name)
    throw new Error(`Undefined variable: ${name}`)
  }

  set(name: string, value: any): void {
    // Walk up scope chain to find existing var
    let env: Environment | null = this
    while (env) {
      if (name in env.vars) {
        env.vars[name] = value
        return
      }
      env = env.parent
    }
    throw new Error(`Undefined variable: ${name}`)
  }

  define(name: string, value: any): void {
    this.vars[name] = value
  }

  has(name: string): boolean {
    if (name in this.vars) return true
    if (this.parent) return this.parent.has(name)
    return false
  }
}

// ── Bridge interface (implemented by native module) ──
export interface ScriptBridge {
  // Screen
  screenHas(text: string): Promise<boolean>
  screenFindText(text: string): Promise<any | null>
  screenFindAll(text: string): Promise<any[]>
  screenFindId(id: string): Promise<any | null>
  screenWaitFor(text: string, timeout: number): Promise<boolean>
  screenWaitGone(text: string, timeout: number): Promise<boolean>
  screenGetText(near: string): Promise<string | null>
  screenDump(): Promise<string>

  // Actions
  click(text: string): Promise<void>
  clickAt(x: number, y: number): Promise<void>
  clickIndex(text: string, index: number): Promise<void>
  longPress(text: string): Promise<void>
  longPressAt(x: number, y: number): Promise<void>
  type(text: string): Promise<void>
  clearText(): Promise<void>
  paste(): Promise<void>

  // Element actions
  elementClick(elementId: string): Promise<void>
  elementLongPress(elementId: string): Promise<void>
  elementSetText(elementId: string, text: string): Promise<void>

  // Gestures
  swipe(direction: string): Promise<void>
  swipeAt(x1: number, y1: number, x2: number, y2: number, duration: number): Promise<void>
  scrollDown(): Promise<void>
  scrollUp(): Promise<void>
  scrollTo(text: string): Promise<boolean>
  pinch(direction: string): Promise<void>

  // Navigation
  back(): Promise<void>
  home(): Promise<void>
  recent(): Promise<void>

  // App
  launch(pkg: string): Promise<void>
  currentApp(): Promise<string>
  isRunning(pkg: string): Promise<boolean>

  // System
  wait(ms: number): Promise<void>
  screenshot(): Promise<string>
  toast(msg: string): Promise<void>
  vibrate(ms: number): Promise<void>
  getClipboard(): Promise<string>
  setClipboard(text: string): Promise<void>
  getTime(): number
  getScreenSize(): { width: number; height: number }
  log(msg: string): void

  // Notifications
  getNotifications(): Promise<any[]>
  clearNotification(index: number): Promise<void>

  // Network
  httpGet(url: string): Promise<{ status: number; body: string }>
  httpPost(url: string, body: any): Promise<{ status: number; body: string }>

  // Storage
  storeGet(key: string): any
  storeSet(key: string, value: any): void
  storeRemove(key: string): void

  // OCR
  ocrRegion(x: number, y: number, w: number, h: number): Promise<any[]>

  // CV (Computer Vision)
  cvSSIM(): Promise<number>
  cvIsStable(threshold?: number): Promise<boolean>
  cvTemplateMatch(templateBase64: string, threshold?: number): Promise<{ x: number; y: number; confidence: number; found: boolean }>
  cvGlobalMotion(): Promise<{ dx: number; dy: number; magnitude: number; scrolling: boolean; direction: string }>
  cvTrackPoints(points: number[][]): Promise<any[]>
  cvDiffRegions(threshold?: number, minAreaRatio?: number): Promise<any[]>
  cvCropScreenshot(x: number, y: number, w: number, h: number): Promise<string>
  cvTemplateMatchMultiScale(templateBase64: string, threshold?: number): Promise<{ x: number; y: number; confidence: number; found: boolean; scale: number }>
  cvDetectElements(minAreaRatio?: number, maxResults?: number): Promise<any[]>
  cvFindRects(minArea?: number, maxResults?: number): Promise<any[]>
  cvRegionColor(x: number, y: number, w: number, h: number): Promise<any>
  cvPixelColor(x: number, y: number): Promise<{ r: number; g: number; b: number; a: number }>
  cvTemplateMatchAll(templateBase64: string, threshold?: number, maxResults?: number): Promise<any[]>
  cvScreenMeta(): Promise<any>
  cvStartPerception(intervalMs?: number, stableThreshold?: number): Promise<void>
  cvStopPerception(): Promise<void>
  cvGetPerception(): Promise<any>
  cvLockFrame(): Promise<boolean>
  cvUnlockFrame(): Promise<void>
  cvSaveTemplate(name: string, x: number, y: number, w: number, h: number): Promise<boolean>
  cvMatchByName(name: string, threshold?: number): Promise<{ x: number; y: number; confidence: number; found: boolean }>
  cvListTemplates(): Promise<string[]>
  cvDeleteTemplate(name: string): Promise<void>
  cvResetFrame(): Promise<void>
}

// ── Interpreter ──

export class Interpreter {
  private bridge: ScriptBridge
  private globalEnv: Environment
  private cancelled = false
  private actionCount = 0
  private startTime = 0
  private maxExecutionTime: number  // ms
  private maxActionsPerSecond = 10
  private onLog?: (msg: string) => void

  constructor(bridge: ScriptBridge, options?: { maxExecutionTime?: number; onLog?: (msg: string) => void }) {
    this.bridge = bridge
    this.maxExecutionTime = options?.maxExecutionTime ?? Infinity // no time limit
    this.onLog = options?.onLog
    this.globalEnv = new Environment()
    this.registerBuiltins()
  }

  cancel() {
    this.cancelled = true
  }

  async execute(program: AST.Program): Promise<any> {
    this.cancelled = false
    this.actionCount = 0
    this.startTime = Date.now()

    try {
      for (const stmt of program.body) {
        this.checkCancelled()
        const result = await this.execStmt(stmt, this.globalEnv)
        if (result instanceof ReturnSignal) return result.value
      }
    } catch (e: any) {
      if (e.message === 'Script cancelled') throw e
      throw new Error(`[Runtime] ${e.message}`)
    }
  }

  // ── Statement execution ──

  private async execStmt(stmt: AST.Stmt, env: Environment): Promise<any> {
    this.checkCancelled()

    switch (stmt.kind) {
      case 'ExprStmt':
        return this.evalExpr(stmt.expr, env)

      case 'VarDecl': {
        const val = stmt.init ? await this.evalExpr(stmt.init, env) : null
        env.define(stmt.name, val)
        return
      }

      case 'BlockStmt': {
        const blockEnv = new Environment(env)
        for (const s of stmt.body) {
          const result = await this.execStmt(s, blockEnv)
          if (result instanceof ReturnSignal || result instanceof BreakSignal || result instanceof ContinueSignal) {
            return result
          }
        }
        return
      }

      case 'IfStmt': {
        const cond = await this.evalExpr(stmt.condition, env)
        if (this.isTruthy(cond)) {
          return this.execStmt(stmt.then, env)
        } else if (stmt.otherwise) {
          return this.execStmt(stmt.otherwise, env)
        }
        return
      }

      case 'WhileStmt': {
        while (this.isTruthy(await this.evalExpr(stmt.condition, env))) {
          this.checkCancelled()
          const result = await this.execStmt(stmt.body, env)
          if (result instanceof BreakSignal) break
          if (result instanceof ContinueSignal) continue
          if (result instanceof ReturnSignal) return result
        }
        return
      }

      case 'ForStmt': {
        const forEnv = new Environment(env)
        if (stmt.init) await this.execStmt(stmt.init, forEnv)
        while (stmt.condition ? this.isTruthy(await this.evalExpr(stmt.condition, forEnv)) : true) {
          this.checkCancelled()
          const result = await this.execStmt(stmt.body, forEnv)
          if (result instanceof BreakSignal) break
          if (result instanceof ContinueSignal) { /* fall through to update */ }
          if (result instanceof ReturnSignal) return result
          if (stmt.update) await this.evalExpr(stmt.update, forEnv)
        }
        return
      }

      case 'ForOfStmt': {
        const iterable = await this.evalExpr(stmt.iterable, env)
        if (!Array.isArray(iterable)) throw new Error('for-of requires an array')
        for (const item of iterable) {
          this.checkCancelled()
          const loopEnv = new Environment(env)
          loopEnv.define(stmt.variable, item)
          const result = await this.execStmt(stmt.body, loopEnv)
          if (result instanceof BreakSignal) break
          if (result instanceof ContinueSignal) continue
          if (result instanceof ReturnSignal) return result
        }
        return
      }

      case 'FunctionDecl': {
        env.define(stmt.name, { params: stmt.params, body: stmt.body, closure: env })
        return
      }

      case 'ReturnStmt': {
        const val = stmt.value ? await this.evalExpr(stmt.value, env) : null
        return new ReturnSignal(val)
      }

      case 'BreakStmt': return new BreakSignal()
      case 'ContinueStmt': return new ContinueSignal()

      case 'TryCatchStmt': {
        try {
          const result = await this.execStmt(stmt.tryBlock, env)
          if (result instanceof ReturnSignal) return result
        } catch (e: any) {
          const catchEnv = new Environment(env)
          catchEnv.define(stmt.catchParam, e.message || String(e))
          const result = await this.execStmt(stmt.catchBlock, catchEnv)
          if (result instanceof ReturnSignal) return result
        }
        return
      }

      default:
        throw new Error(`Unknown statement: ${(stmt as any).kind}`)
    }
  }

  // ── Expression evaluation ──

  private async evalExpr(expr: AST.Expr, env: Environment): Promise<any> {
    this.checkCancelled()

    switch (expr.kind) {
      case 'NumberLiteral': return expr.value
      case 'StringLiteral': return expr.value
      case 'BooleanLiteral': return expr.value
      case 'NullLiteral': return null

      case 'ArrayLiteral': {
        const elements = []
        for (const el of expr.elements) elements.push(await this.evalExpr(el, env))
        return elements
      }

      case 'ObjectLiteral': {
        const obj: Record<string, any> = {}
        for (const prop of expr.properties) obj[prop.key] = await this.evalExpr(prop.value, env)
        return obj
      }

      case 'Identifier':
        return env.get(expr.name)

      case 'BinaryExpr': {
        const left = await this.evalExpr(expr.left, env)
        const right = await this.evalExpr(expr.right, env)
        return this.evalBinary(expr.op, left, right)
      }

      case 'UnaryExpr': {
        const operand = await this.evalExpr(expr.operand, env)
        if (expr.op === '!') return !this.isTruthy(operand)
        if (expr.op === '-') return -operand
        throw new Error(`Unknown unary op: ${expr.op}`)
      }

      case 'LogicalExpr': {
        const left = await this.evalExpr(expr.left, env)
        if (expr.op === '||') return this.isTruthy(left) ? left : await this.evalExpr(expr.right, env)
        if (expr.op === '&&') return !this.isTruthy(left) ? left : await this.evalExpr(expr.right, env)
        throw new Error(`Unknown logical op: ${expr.op}`)
      }

      case 'TernaryExpr': {
        const cond = await this.evalExpr(expr.condition, env)
        return this.isTruthy(cond)
          ? await this.evalExpr(expr.consequent, env)
          : await this.evalExpr(expr.alternate, env)
      }

      case 'AssignExpr': {
        const value = await this.evalExpr(expr.value, env)
        if (expr.target.kind === 'Identifier') {
          if (expr.op === '=') {
            env.set(expr.target.name, value)
          } else if (expr.op === '+=') {
            env.set(expr.target.name, env.get(expr.target.name) + value)
          } else if (expr.op === '-=') {
            env.set(expr.target.name, env.get(expr.target.name) - value)
          }
          return env.get(expr.target.name)
        }
        if (expr.target.kind === 'MemberExpr') {
          const obj = await this.evalExpr(expr.target.object, env)
          if (expr.op === '=') obj[expr.target.property] = value
          else if (expr.op === '+=') obj[expr.target.property] += value
          else if (expr.op === '-=') obj[expr.target.property] -= value
          return obj[expr.target.property]
        }
        if (expr.target.kind === 'IndexExpr') {
          const obj = await this.evalExpr(expr.target.object, env)
          const idx = await this.evalExpr(expr.target.index, env)
          if (expr.op === '=') obj[idx] = value
          else if (expr.op === '+=') obj[idx] += value
          else if (expr.op === '-=') obj[idx] -= value
          return obj[idx]
        }
        throw new Error('Invalid assignment target')
      }

      case 'CallExpr': {
        const callee = await this.evalExpr(expr.callee, env)
        const args = []
        for (const arg of expr.args) args.push(await this.evalExpr(arg, env))

        // Built-in function
        if (typeof callee === 'function') {
          await this.rateLimit()
          return await callee(...args)
        }

        // User-defined function
        if (callee && typeof callee === 'object' && 'params' in callee) {
          const fnEnv = new Environment(callee.closure)
          for (let i = 0; i < callee.params.length; i++) {
            fnEnv.define(callee.params[i], args[i] ?? null)
          }
          const result = await this.execStmt(callee.body, fnEnv)
          if (result instanceof ReturnSignal) return result.value
          return null
        }

        throw new Error(`Not a function: ${JSON.stringify(expr.callee)}`)
      }

      case 'MemberExpr': {
        const obj = await this.evalExpr(expr.object, env)
        if (obj == null) throw new Error(`Cannot read property '${expr.property}' of ${obj}`)

        // Array/String built-in methods
        if (expr.property === 'length' && (Array.isArray(obj) || typeof obj === 'string')) return obj.length
        if (expr.property === 'push' && Array.isArray(obj)) return (...args: any[]) => obj.push(...args)
        if (expr.property === 'pop' && Array.isArray(obj)) return () => obj.pop()
        if (expr.property === 'includes' && (Array.isArray(obj) || typeof obj === 'string')) return (v: any) => obj.includes(v)
        if (expr.property === 'contains' && typeof obj === 'string') return (v: string) => obj.includes(v)
        if (expr.property === 'indexOf' && (Array.isArray(obj) || typeof obj === 'string')) return (v: any) => obj.indexOf(v)
        if (expr.property === 'slice' && (Array.isArray(obj) || typeof obj === 'string')) return (a: number, b?: number) => obj.slice(a, b)
        if (expr.property === 'split' && typeof obj === 'string') return (sep: string) => obj.split(sep)
        if (expr.property === 'trim' && typeof obj === 'string') return () => obj.trim()
        if (expr.property === 'toLowerCase' && typeof obj === 'string') return () => obj.toLowerCase()
        if (expr.property === 'toUpperCase' && typeof obj === 'string') return () => obj.toUpperCase()
        if (expr.property === 'replace' && typeof obj === 'string') return (a: string, b: string) => obj.replace(a, b)
        if (expr.property === 'startsWith' && typeof obj === 'string') return (v: string) => obj.startsWith(v)
        if (expr.property === 'endsWith' && typeof obj === 'string') return (v: string) => obj.endsWith(v)
        if (expr.property === 'toString') return () => String(obj)
        if (expr.property === 'charCodeAt' && typeof obj === 'string') return (i: number) => obj.charCodeAt(i)
        if (expr.property === 'charAt' && typeof obj === 'string') return (i: number) => obj.charAt(i)
        if (expr.property === 'substring' && typeof obj === 'string') return (a: number, b?: number) => obj.substring(a, b)
        if (expr.property === 'repeat' && typeof obj === 'string') return (n: number) => obj.repeat(n)
        if (expr.property === 'padStart' && typeof obj === 'string') return (n: number, s?: string) => obj.padStart(n, s)
        if (expr.property === 'padEnd' && typeof obj === 'string') return (n: number, s?: string) => obj.padEnd(n, s)
        if (expr.property === 'join' && Array.isArray(obj)) return (sep?: string) => obj.join(sep)
        if (expr.property === 'reverse' && Array.isArray(obj)) return () => obj.reverse()
        if (expr.property === 'sort' && Array.isArray(obj)) return (fn?: any) => obj.sort(fn)
        if (expr.property === 'filter' && Array.isArray(obj)) {
          return async (fn: any) => {
            const result = []
            for (const item of obj) {
              let keep = false
              if (typeof fn === 'function') keep = await fn(item)
              else if (fn && fn.params) {
                const fnEnv = new Environment(fn.closure)
                fnEnv.define(fn.params[0], item)
                const r = await this.execStmt(fn.body, fnEnv)
                keep = r instanceof ReturnSignal ? r.value : !!r
              }
              if (keep) result.push(item)
            }
            return result
          }
        }
        if (expr.property === 'find' && Array.isArray(obj)) {
          return async (fn: any) => {
            for (const item of obj) {
              let match = false
              if (typeof fn === 'function') match = await fn(item)
              else if (fn && fn.params) {
                const fnEnv = new Environment(fn.closure)
                fnEnv.define(fn.params[0], item)
                const r = await this.execStmt(fn.body, fnEnv)
                match = r instanceof ReturnSignal ? r.value : !!r
              }
              if (match) return item
            }
            return null
          }
        }
        if (expr.property === 'forEach' && Array.isArray(obj)) {
          return async (fn: any) => {
            for (const item of obj) {
              if (typeof fn === 'function') await fn(item)
              else if (fn && fn.params) {
                const fnEnv = new Environment(fn.closure)
                fnEnv.define(fn.params[0], item)
                await this.execStmt(fn.body, fnEnv)
              }
            }
          }
        }
        if (expr.property === 'map' && Array.isArray(obj)) {
          return async (fn: any) => {
            const result = []
            for (const item of obj) {
              if (typeof fn === 'function') result.push(await fn(item))
              else if (fn && fn.params) {
                const fnEnv = new Environment(fn.closure)
                fnEnv.define(fn.params[0], item)
                const r = await this.execStmt(fn.body, fnEnv)
                result.push(r instanceof ReturnSignal ? r.value : null)
              }
            }
            return result
          }
        }
        if (expr.property === 'filter' && Array.isArray(obj)) {
          return async (fn: any) => {
            const result = []
            for (const item of obj) {
              let keep = false
              if (typeof fn === 'function') keep = this.isTruthy(await fn(item))
              else if (fn && fn.params) {
                const fnEnv = new Environment(fn.closure)
                fnEnv.define(fn.params[0], item)
                const r = await this.execStmt(fn.body, fnEnv)
                keep = this.isTruthy(r instanceof ReturnSignal ? r.value : null)
              }
              if (keep) result.push(item)
            }
            return result
          }
        }
        if (expr.property === 'forEach' && Array.isArray(obj)) {
          return async (fn: any) => {
            for (const item of obj) {
              if (typeof fn === 'function') await fn(item)
              else if (fn && fn.params) {
                const fnEnv = new Environment(fn.closure)
                fnEnv.define(fn.params[0], item)
                await this.execStmt(fn.body, fnEnv)
              }
            }
          }
        }

        return obj[expr.property]
      }

      case 'IndexExpr': {
        const obj = await this.evalExpr(expr.object, env)
        const idx = await this.evalExpr(expr.index, env)
        if (obj == null) throw new Error(`Cannot index null`)
        return obj[idx]
      }

      default:
        throw new Error(`Unknown expression: ${(expr as any).kind}`)
    }
  }

  // ── Helpers ──

  private evalBinary(op: string, left: any, right: any): any {
    switch (op) {
      case '+':
        if (typeof left === 'string' || typeof right === 'string') return String(left) + String(right)
        return left + right
      case '-': return left - right
      case '*': return left * right
      case '/':
        if (right === 0) throw new Error('Division by zero')
        return left / right
      case '%': return left % right
      case '==': return left == right
      case '!=': return left != right
      case '<': return left < right
      case '>': return left > right
      case '<=': return left <= right
      case '>=': return left >= right
      default: throw new Error(`Unknown operator: ${op}`)
    }
  }

  private isTruthy(val: any): boolean {
    if (val === null || val === undefined || val === false || val === 0 || val === '') return false
    return true
  }

  private checkCancelled() {
    if (this.cancelled) throw new Error('Script cancelled')
    if (Date.now() - this.startTime > this.maxExecutionTime) {
      throw new Error(`Script exceeded max execution time (${this.maxExecutionTime / 1000}s)`)
    }
  }

  private async rateLimit() {
    this.actionCount++
    // Simple rate limiting: after every 10 actions, wait 1 second
    if (this.actionCount % this.maxActionsPerSecond === 0) {
      await this.bridge.wait(100)
    }
  }

  // ── Register built-in functions and objects ──

  private registerBuiltins() {
    const b = this.bridge
    const env = this.globalEnv

    // Screen object
    env.define('screen', {
      has: (text: string) => b.screenHas(text),
      findText: (text: string) => b.screenFindText(text),
      findAll: (text: string) => b.screenFindAll(text),
      findId: (id: string) => b.screenFindId(id),
      waitFor: (text: string, timeout = 30000) => b.screenWaitFor(text, timeout),
      waitGone: (text: string, timeout = 30000) => b.screenWaitGone(text, timeout),
      getText: (near: string) => b.screenGetText(near),
      dump: () => b.screenDump(),
    })

    // Actions
    env.define('click', (text: string) => b.click(text))
    env.define('clickAt', (x: number, y: number) => b.clickAt(x, y))
    env.define('clickIndex', (text: string, n: number) => b.clickIndex(text, n))
    env.define('longPress', (text: string) => b.longPress(text))
    env.define('longPressAt', (x: number, y: number) => b.longPressAt(x, y))
    env.define('type', (text: string) => b.type(text))
    env.define('clearText', () => b.clearText())
    env.define('paste', () => b.paste())

    // Gestures
    env.define('swipe', (dir: string) => b.swipe(dir))
    env.define('swipeAt', (x1: number, y1: number, x2: number, y2: number, dur: number) => b.swipeAt(x1, y1, x2, y2, dur))
    env.define('scrollDown', () => b.scrollDown())
    env.define('scrollUp', () => b.scrollUp())
    env.define('scrollTo', (text: string) => b.scrollTo(text))
    env.define('pinch', (dir: string) => b.pinch(dir))

    // Navigation
    env.define('back', () => b.back())
    env.define('home', () => b.home())
    env.define('recent', () => b.recent())

    // App
    env.define('launch', (pkg: string) => b.launch(pkg))
    env.define('currentApp', () => b.currentApp())
    env.define('isRunning', (pkg: string) => b.isRunning(pkg))

    // System
    env.define('wait', (ms: number) => b.wait(ms))
    env.define('screenshot', () => b.screenshot())
    env.define('toast', (msg: string) => b.toast(msg))
    env.define('vibrate', (ms: number) => b.vibrate(ms))
    env.define('getClipboard', () => b.getClipboard())
    env.define('setClipboard', (text: string) => b.setClipboard(text))
    env.define('getScreenSize', () => b.getScreenSize())
    env.define('getTime', () => b.getTime())
    env.define('log', (msg: any) => {
      const str = typeof msg === 'object' ? JSON.stringify(msg) : String(msg)
      b.log(str)
      this.onLog?.(str)
    })

    // Notifications
    env.define('getNotifications', () => b.getNotifications())
    env.define('clearNotification', (i: number) => b.clearNotification(i))

    // AI Vision — call screen vision API and poll for result
    const VISION_API = 'https://www.agentcab.ai/v1/skills/210db12f-6453-4b1c-9fd8-67d51780907a/call'

    async function callVisionAPI(input: any): Promise<any> {
      const screenshot = await b.screenshot()
      if (!screenshot) { console.log('[Vision] no screenshot'); return null }
      const screenSize = b.getScreenSize()
      input.screenshot = screenshot
      input.screen_width = screenSize.width
      input.screen_height = screenSize.height
      try {
        console.log('[Vision] POST to API...')
        const res = await b.httpPost(VISION_API, { input })
        console.log('[Vision] POST response: ' + res.body.substring(0, 200))
        const data = JSON.parse(res.body)
        const callId = data?.data?.call_id || data?.call_id
        if (!callId) { console.log('[Vision] no call_id'); return null }
        console.log('[Vision] call_id: ' + callId)
        for (let i = 0; i < 15; i++) {
          await new Promise(r => setTimeout(r, 2000))
          const poll = await b.httpGet(`https://www.agentcab.ai/v1/calls/${callId}`)
          const callData = JSON.parse(poll.body)
          const status = callData?.status || callData?.data?.status
          console.log('[Vision] poll ' + i + ': ' + status)
          if (status === 'success' || status === 'completed') {
            const output = callData?.output_data || callData?.data?.output_data || null
            console.log('[Vision] output keys: ' + (output ? Object.keys(output).join(',') : 'null'))
            return output
          }
          if (status === 'failed') { console.log('[Vision] failed'); return null }
        }
      } catch (e: any) { console.log('[Vision] error: ' + e.message) }
      return null
    }

    // findElement("描述") → {x, y, found}
    env.define('findElement', async (description: string) => {
      const prompt = `请找到以下元素的位置: "${description}"\n\n要求:\n1. 返回该元素可点击区域中心点的像素坐标\n2. 状态栏（顶部时间/信号/电量）不可点击\n3. 返回 JSON: {"x": 数字, "y": 数字, "found": true/false}\n4. 找不到返回: {"x": 0, "y": 0, "found": false}`
      const result = await callVisionAPI({ prompt })
      if (!result) return { x: 0, y: 0, found: false }
      return { x: result.x || 0, y: result.y || 0, found: result.found || false }
    })

    // analyzeScreen(prompt) → Gemini Vision 返回的 JSON
    env.define('analyzeScreen', async (prompt: string) => {
      const result = await callVisionAPI({ prompt })
      return result || { success: false }
    })

    // HTTP
    env.define('http', {
      get: (url: string) => b.httpGet(url),
      post: (url: string, body: any) => b.httpPost(url, body),
    })

    // Store
    env.define('store', {
      get: (key: string) => b.storeGet(key),
      set: (key: string, val: any) => b.storeSet(key, val),
      remove: (key: string) => b.storeRemove(key),
    })

    // OCR
    env.define('ocrRegion', (x: number, y: number, w: number, h: number) => b.ocrRegion(x, y, w, h))

    // CV (Computer Vision)
    env.define('cv', {
      ssim: () => b.cvSSIM(),
      isStable: (threshold?: number) => b.cvIsStable(threshold),
      hasChanged: async (threshold?: number) => {
        const score = await b.cvSSIM()
        return score < (threshold ?? 0.95) && score > 0  // score=0 means first frame
      },
      matchTemplate: (template: string, threshold?: number) => b.cvTemplateMatch(template, threshold),
      globalMotion: () => b.cvGlobalMotion(),
      trackPoints: (points: number[][]) => b.cvTrackPoints(points),
      diffRegions: (threshold?: number, minAreaRatio?: number) => b.cvDiffRegions(threshold, minAreaRatio),
      cropScreenshot: (x: number, y: number, w: number, h: number) => b.cvCropScreenshot(x, y, w, h),
      matchTemplateMultiScale: (template: string, threshold?: number) => b.cvTemplateMatchMultiScale(template, threshold),
      detectElements: (minAreaRatio?: number, maxResults?: number) => b.cvDetectElements(minAreaRatio, maxResults),
      findRects: (minArea?: number, maxResults?: number) => b.cvFindRects(minArea, maxResults),
      regionColor: (x: number, y: number, w: number, h: number) => b.cvRegionColor(x, y, w, h),
      pixelColor: (x: number, y: number) => b.cvPixelColor(x, y),
      matchTemplateAll: (template: string, threshold?: number, max?: number) => b.cvTemplateMatchAll(template, threshold, max),
      screenMeta: () => b.cvScreenMeta(),
      startPerception: (intervalMs?: number, threshold?: number) => b.cvStartPerception(intervalMs, threshold),
      stopPerception: () => b.cvStopPerception(),
      getState: () => b.cvGetPerception(),
      lockFrame: () => b.cvLockFrame(),
      unlockFrame: () => b.cvUnlockFrame(),
      saveTemplate: (name: string, x: number, y: number, w: number, h: number) => b.cvSaveTemplate(name, x, y, w, h),
      matchByName: (name: string, threshold?: number) => b.cvMatchByName(name, threshold),
      listTemplates: () => b.cvListTemplates(),
      deleteTemplate: (name: string) => b.cvDeleteTemplate(name),
      resetFrame: () => b.cvResetFrame(),
    })

    // Utility
    env.define('parseInt', (s: string) => parseInt(s, 10))
    env.define('parseFloat', (s: string) => parseFloat(s))
    env.define('String', (v: any) => String(v))
    env.define('Number', (v: any) => Number(v))
    env.define('JSON', {
      parse: (s: string) => JSON.parse(s),
      stringify: (v: any) => JSON.stringify(v),
    })
    env.define('Math', {
      floor: Math.floor,
      ceil: Math.ceil,
      round: Math.round,
      random: Math.random,
      min: Math.min,
      max: Math.max,
      abs: Math.abs,
    })
    env.define('Date', {
      now: () => Date.now(),
      new: (ms?: number) => {
        const d = ms != null ? new Date(ms) : new Date()
        return {
          getFullYear: () => d.getFullYear(),
          getMonth: () => d.getMonth(),
          getDate: () => d.getDate(),
          getHours: () => d.getHours(),
          getMinutes: () => d.getMinutes(),
          getSeconds: () => d.getSeconds(),
          getTime: () => d.getTime(),
          toISOString: () => d.toISOString(),
          toString: () => d.toString(),
        }
      },
    })
  }
}
