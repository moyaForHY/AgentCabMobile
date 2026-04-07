/**
 * AgentCab Script Parser
 * Converts token stream into AST.
 */

import { Token, TokenType } from './lexer'
import * as AST from './ast'

export class Parser {
  private tokens: Token[]
  private pos = 0

  constructor(tokens: Token[]) {
    this.tokens = tokens
  }

  parse(): AST.Program {
    const body: AST.Stmt[] = []
    while (!this.isEnd()) {
      body.push(this.parseStmt())
    }
    return { kind: 'Program', body }
  }

  // ── Statements ──

  private parseStmt(): AST.Stmt {
    const t = this.peek()
    switch (t.type) {
      case TokenType.Let: return this.parseVarDecl()
      case TokenType.If: return this.parseIf()
      case TokenType.While: return this.parseWhile()
      case TokenType.For: return this.parseFor()
      case TokenType.Function: return this.parseFunctionDecl()
      case TokenType.Return: return this.parseReturn()
      case TokenType.Break: this.advance(); return { kind: 'BreakStmt' }
      case TokenType.Continue: this.advance(); return { kind: 'ContinueStmt' }
      case TokenType.Try: return this.parseTryCatch()
      case TokenType.LBrace: return this.parseBlock()
      default: return this.parseExprStmt()
    }
  }

  private parseVarDecl(): AST.VarDecl {
    this.expect(TokenType.Let)
    const name = this.expect(TokenType.Identifier).value
    let init: AST.Expr | null = null
    if (this.match(TokenType.Assign)) {
      init = this.parseExpr()
    }
    return { kind: 'VarDecl', name, init }
  }

  private parseIf(): AST.IfStmt {
    this.expect(TokenType.If)
    this.expect(TokenType.LParen)
    const condition = this.parseExpr()
    this.expect(TokenType.RParen)
    const then = this.parseStmt()
    let otherwise: AST.Stmt | null = null
    if (this.check(TokenType.Else)) {
      this.advance()
      otherwise = this.parseStmt()
    }
    return { kind: 'IfStmt', condition, then, otherwise }
  }

  private parseWhile(): AST.WhileStmt {
    this.expect(TokenType.While)
    this.expect(TokenType.LParen)
    const condition = this.parseExpr()
    this.expect(TokenType.RParen)
    const body = this.parseStmt()
    return { kind: 'WhileStmt', condition, body }
  }

  private parseFor(): AST.ForStmt | AST.ForOfStmt {
    this.expect(TokenType.For)
    this.expect(TokenType.LParen)

    // Check for `for (let x of arr)`
    if (this.check(TokenType.Let)) {
      const saved = this.pos
      this.advance() // skip 'let'
      const name = this.peek()
      if (name.type === TokenType.Identifier) {
        this.advance() // skip identifier
        if (this.check(TokenType.Of)) {
          this.advance() // skip 'of'
          const iterable = this.parseExpr()
          this.expect(TokenType.RParen)
          const body = this.parseStmt()
          return { kind: 'ForOfStmt', variable: name.value, iterable, body }
        }
      }
      // Not a for-of, backtrack
      this.pos = saved
    }

    // Regular for (init; condition; update)
    let init: AST.Stmt | null = null
    if (!this.check(TokenType.Semicolon)) {
      init = this.check(TokenType.Let) ? this.parseVarDecl() : this.parseExprStmt()
    }
    this.expect(TokenType.Semicolon)

    let condition: AST.Expr | null = null
    if (!this.check(TokenType.Semicolon)) {
      condition = this.parseExpr()
    }
    this.expect(TokenType.Semicolon)

    let update: AST.Expr | null = null
    if (!this.check(TokenType.RParen)) {
      update = this.parseExpr()
    }
    this.expect(TokenType.RParen)

    const body = this.parseStmt()
    return { kind: 'ForStmt', init, condition, update, body }
  }

  private parseFunctionDecl(): AST.FunctionDecl {
    this.expect(TokenType.Function)
    const name = this.expect(TokenType.Identifier).value
    this.expect(TokenType.LParen)
    const params: string[] = []
    while (!this.check(TokenType.RParen)) {
      if (params.length > 0) this.expect(TokenType.Comma)
      params.push(this.expect(TokenType.Identifier).value)
    }
    this.expect(TokenType.RParen)
    const body = this.parseBlock()
    return { kind: 'FunctionDecl', name, params, body }
  }

  private parseReturn(): AST.ReturnStmt {
    this.expect(TokenType.Return)
    let value: AST.Expr | null = null
    // Return has a value if next token is not } or EOF or another statement keyword
    if (!this.check(TokenType.RBrace) && !this.isEnd()) {
      const t = this.peek()
      if (t.type !== TokenType.If && t.type !== TokenType.While && t.type !== TokenType.For &&
          t.type !== TokenType.Function && t.type !== TokenType.Let) {
        value = this.parseExpr()
      }
    }
    return { kind: 'ReturnStmt', value }
  }

  private parseTryCatch(): AST.TryCatchStmt {
    this.expect(TokenType.Try)
    const tryBlock = this.parseBlock()
    this.expect(TokenType.Catch)
    this.expect(TokenType.LParen)
    const catchParam = this.expect(TokenType.Identifier).value
    this.expect(TokenType.RParen)
    const catchBlock = this.parseBlock()
    return { kind: 'TryCatchStmt', tryBlock, catchParam, catchBlock }
  }

  private parseBlock(): AST.BlockStmt {
    this.expect(TokenType.LBrace)
    const body: AST.Stmt[] = []
    while (!this.check(TokenType.RBrace) && !this.isEnd()) {
      body.push(this.parseStmt())
    }
    this.expect(TokenType.RBrace)
    return { kind: 'BlockStmt', body }
  }

  private parseExprStmt(): AST.ExprStmt {
    const expr = this.parseExpr()
    return { kind: 'ExprStmt', expr }
  }

  // ── Expressions (precedence climbing) ──

  private parseExpr(): AST.Expr {
    return this.parseAssign()
  }

  private parseAssign(): AST.Expr {
    const left = this.parseTernary()
    if (this.check(TokenType.Assign) || this.check(TokenType.PlusAssign) || this.check(TokenType.MinusAssign)) {
      const op = this.advance().value
      const value = this.parseAssign()
      return { kind: 'AssignExpr', target: left, op, value }
    }
    return left
  }

  private parseTernary(): AST.Expr {
    const condition = this.parseOr()
    if (this.check(TokenType.Question)) {
      this.advance() // consume ?
      const consequent = this.parseAssign()
      this.expect(TokenType.Colon)
      const alternate = this.parseAssign()
      return { kind: 'TernaryExpr', condition, consequent, alternate }
    }
    return condition
  }

  private parseOr(): AST.Expr {
    let left = this.parseAnd()
    while (this.match(TokenType.Or)) {
      const right = this.parseAnd()
      left = { kind: 'LogicalExpr', op: '||', left, right }
    }
    return left
  }

  private parseAnd(): AST.Expr {
    let left = this.parseEquality()
    while (this.match(TokenType.And)) {
      const right = this.parseEquality()
      left = { kind: 'LogicalExpr', op: '&&', left, right }
    }
    return left
  }

  private parseEquality(): AST.Expr {
    let left = this.parseComparison()
    while (this.check(TokenType.Eq) || this.check(TokenType.NotEq)) {
      const op = this.advance().value
      const right = this.parseComparison()
      left = { kind: 'BinaryExpr', op, left, right }
    }
    return left
  }

  private parseComparison(): AST.Expr {
    let left = this.parseAddSub()
    while (this.check(TokenType.Lt) || this.check(TokenType.Gt) || this.check(TokenType.LtEq) || this.check(TokenType.GtEq)) {
      const op = this.advance().value
      const right = this.parseAddSub()
      left = { kind: 'BinaryExpr', op, left, right }
    }
    return left
  }

  private parseAddSub(): AST.Expr {
    let left = this.parseMulDiv()
    while (this.check(TokenType.Plus) || this.check(TokenType.Minus)) {
      const op = this.advance().value
      const right = this.parseMulDiv()
      left = { kind: 'BinaryExpr', op, left, right }
    }
    return left
  }

  private parseMulDiv(): AST.Expr {
    let left = this.parseUnary()
    while (this.check(TokenType.Star) || this.check(TokenType.Slash) || this.check(TokenType.Percent)) {
      const op = this.advance().value
      const right = this.parseUnary()
      left = { kind: 'BinaryExpr', op, left, right }
    }
    return left
  }

  private parseUnary(): AST.Expr {
    if (this.check(TokenType.Not) || this.check(TokenType.Minus)) {
      const op = this.advance().value
      const operand = this.parseUnary()
      return { kind: 'UnaryExpr', op, operand }
    }
    return this.parsePostfix()
  }

  private parsePostfix(): AST.Expr {
    let expr = this.parsePrimary()

    while (true) {
      if (this.match(TokenType.Dot)) {
        const prop = this.expect(TokenType.Identifier).value
        // Check if it's a method call: obj.method(args)
        if (this.check(TokenType.LParen)) {
          const memberExpr: AST.MemberExpr = { kind: 'MemberExpr', object: expr, property: prop }
          this.advance() // skip (
          const args = this.parseArgList()
          this.expect(TokenType.RParen)
          expr = { kind: 'CallExpr', callee: memberExpr, args }
        } else {
          expr = { kind: 'MemberExpr', object: expr, property: prop }
        }
      } else if (this.match(TokenType.LBracket)) {
        const index = this.parseExpr()
        this.expect(TokenType.RBracket)
        expr = { kind: 'IndexExpr', object: expr, index }
      } else if (this.check(TokenType.LParen) && expr.kind === 'Identifier') {
        this.advance() // skip (
        const args = this.parseArgList()
        this.expect(TokenType.RParen)
        expr = { kind: 'CallExpr', callee: expr, args }
      } else {
        break
      }
    }

    return expr
  }

  private parsePrimary(): AST.Expr {
    const t = this.peek()

    switch (t.type) {
      case TokenType.Number:
        this.advance()
        return { kind: 'NumberLiteral', value: parseFloat(t.value) }

      case TokenType.String:
        this.advance()
        return { kind: 'StringLiteral', value: t.value }

      case TokenType.True:
        this.advance()
        return { kind: 'BooleanLiteral', value: true }

      case TokenType.False:
        this.advance()
        return { kind: 'BooleanLiteral', value: false }

      case TokenType.NullKw:
        this.advance()
        return { kind: 'NullLiteral' }

      case TokenType.Identifier:
        this.advance()
        return { kind: 'Identifier', name: t.value }

      case TokenType.LParen: {
        this.advance()
        const expr = this.parseExpr()
        this.expect(TokenType.RParen)
        return expr
      }

      case TokenType.LBracket: {
        this.advance()
        const elements: AST.Expr[] = []
        while (!this.check(TokenType.RBracket)) {
          if (elements.length > 0) this.expect(TokenType.Comma)
          elements.push(this.parseExpr())
        }
        this.expect(TokenType.RBracket)
        return { kind: 'ArrayLiteral', elements }
      }

      case TokenType.LBrace: {
        this.advance()
        const properties: { key: string; value: AST.Expr }[] = []
        while (!this.check(TokenType.RBrace)) {
          if (properties.length > 0) this.expect(TokenType.Comma)
          const key = this.peek()
          const keyStr = key.type === TokenType.String ? key.value : this.expect(TokenType.Identifier).value
          if (key.type === TokenType.String) this.advance()
          this.expect(TokenType.Colon)
          const value = this.parseExpr()
          properties.push({ key: keyStr, value })
        }
        this.expect(TokenType.RBrace)
        return { kind: 'ObjectLiteral', properties }
      }

      default:
        throw this.error(`Unexpected token: ${t.type} (${t.value})`)
    }
  }

  private parseArgList(): AST.Expr[] {
    const args: AST.Expr[] = []
    while (!this.check(TokenType.RParen)) {
      if (args.length > 0) this.expect(TokenType.Comma)
      args.push(this.parseExpr())
    }
    return args
  }

  // ── Helpers ──

  private peek(): Token {
    return this.tokens[this.pos]
  }

  private advance(): Token {
    const t = this.tokens[this.pos]
    this.pos++
    return t
  }

  private check(type: TokenType): boolean {
    return this.peek().type === type
  }

  private match(type: TokenType): boolean {
    if (this.check(type)) {
      this.advance()
      return true
    }
    return false
  }

  private expect(type: TokenType): Token {
    const t = this.peek()
    if (t.type !== type) {
      throw this.error(`Expected ${type}, got ${t.type} (${t.value})`)
    }
    return this.advance()
  }

  private isEnd(): boolean {
    return this.peek().type === TokenType.EOF
  }

  private error(msg: string): Error {
    const t = this.peek()
    return new Error(`[Parser] Line ${t.line}:${t.col} — ${msg}`)
  }
}
