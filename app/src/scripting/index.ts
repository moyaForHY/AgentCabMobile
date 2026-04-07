/**
 * AgentCab Script Engine
 *
 * Usage:
 *   const engine = new ScriptEngine(bridge)
 *   await engine.run(scriptText)
 *   engine.cancel()  // stop execution
 */

import { Lexer } from './lexer'
import { Parser } from './parser'
import { Interpreter, ScriptBridge } from './interpreter'

export type { ScriptBridge } from './interpreter'

export class ScriptEngine {
  private interpreter: Interpreter
  private logs: string[] = []

  constructor(bridge: ScriptBridge, options?: { maxExecutionTime?: number }) {
    this.interpreter = new Interpreter(bridge, {
      maxExecutionTime: options?.maxExecutionTime,
      onLog: (msg) => this.logs.push(msg),
    })
  }

  async run(script: string): Promise<{ success: boolean; logs: string[]; error?: string }> {
    this.logs = []
    try {
      // 1. Tokenize
      const lexer = new Lexer(script)
      const tokens = lexer.tokenize()

      // 2. Parse
      const parser = new Parser(tokens)
      const ast = parser.parse()

      // 3. Execute
      await this.interpreter.execute(ast)

      return { success: true, logs: this.logs }
    } catch (e: any) {
      return { success: false, logs: this.logs, error: e.message }
    }
  }

  cancel() {
    this.interpreter.cancel()
  }

  /** Validate script without executing */
  static validate(script: string): { valid: boolean; error?: string } {
    try {
      const tokens = new Lexer(script).tokenize()
      new Parser(tokens).parse()
      return { valid: true }
    } catch (e: any) {
      return { valid: false, error: e.message }
    }
  }
}
