/**
 * AgentCab Script Lexer
 * Tokenizes script text into a stream of tokens.
 */

export enum TokenType {
  // Literals
  Number = 'Number',
  String = 'String',
  Boolean = 'Boolean',
  Null = 'Null',
  Identifier = 'Identifier',

  // Keywords
  Let = 'let',
  If = 'if',
  Else = 'else',
  While = 'while',
  For = 'for',
  Of = 'of',
  Function = 'function',
  Return = 'return',
  Break = 'break',
  Continue = 'continue',
  Try = 'try',
  Catch = 'catch',
  True = 'true',
  False = 'false',
  NullKw = 'null',

  // Operators
  Plus = '+',
  Minus = '-',
  Star = '*',
  Slash = '/',
  Percent = '%',
  Assign = '=',
  PlusAssign = '+=',
  MinusAssign = '-=',
  Eq = '==',
  NotEq = '!=',
  Lt = '<',
  Gt = '>',
  LtEq = '<=',
  GtEq = '>=',
  And = '&&',
  Or = '||',
  Not = '!',
  Dot = '.',

  // Delimiters
  LParen = '(',
  RParen = ')',
  LBrace = '{',
  RBrace = '}',
  LBracket = '[',
  RBracket = ']',
  Comma = ',',
  Colon = ':',
  Question = '?',
  Semicolon = ';',

  // Special
  EOF = 'EOF',
}

export type Token = {
  type: TokenType
  value: string
  line: number
  col: number
}

const KEYWORDS: Record<string, TokenType> = {
  let: TokenType.Let,
  if: TokenType.If,
  else: TokenType.Else,
  while: TokenType.While,
  for: TokenType.For,
  of: TokenType.Of,
  function: TokenType.Function,
  return: TokenType.Return,
  break: TokenType.Break,
  continue: TokenType.Continue,
  try: TokenType.Try,
  catch: TokenType.Catch,
  true: TokenType.True,
  false: TokenType.False,
  null: TokenType.NullKw,
}

export class Lexer {
  private src: string
  private pos = 0
  private line = 1
  private col = 1
  private tokens: Token[] = []

  constructor(source: string) {
    this.src = source
  }

  tokenize(): Token[] {
    while (this.pos < this.src.length) {
      this.skipWhitespaceAndComments()
      if (this.pos >= this.src.length) break

      const ch = this.src[this.pos]

      // Numbers
      if (this.isDigit(ch)) {
        this.readNumber()
        continue
      }

      // Strings
      if (ch === '"' || ch === "'") {
        this.readString(ch)
        continue
      }

      // Identifiers / Keywords
      if (this.isAlpha(ch) || ch === '_') {
        this.readIdentifier()
        continue
      }

      // Two-char operators
      const two = this.src.slice(this.pos, this.pos + 2)
      if (two === '==' || two === '!=' || two === '<=' || two === '>=' || two === '&&' || two === '||' || two === '+=' || two === '-=') {
        const typeMap: Record<string, TokenType> = {
          '==': TokenType.Eq, '!=': TokenType.NotEq,
          '<=': TokenType.LtEq, '>=': TokenType.GtEq,
          '&&': TokenType.And, '||': TokenType.Or,
          '+=': TokenType.PlusAssign, '-=': TokenType.MinusAssign,
        }
        this.emit(typeMap[two], two)
        this.advance(2)
        continue
      }

      // Single-char operators and delimiters
      const singleMap: Record<string, TokenType> = {
        '+': TokenType.Plus, '-': TokenType.Minus, '*': TokenType.Star,
        '/': TokenType.Slash, '%': TokenType.Percent, '=': TokenType.Assign,
        '<': TokenType.Lt, '>': TokenType.Gt, '!': TokenType.Not,
        '.': TokenType.Dot, '(': TokenType.LParen, ')': TokenType.RParen,
        '{': TokenType.LBrace, '}': TokenType.RBrace, '[': TokenType.LBracket,
        ']': TokenType.RBracket, ',': TokenType.Comma, ':': TokenType.Colon, '?': TokenType.Question,
        ';': TokenType.Semicolon,
      }
      if (singleMap[ch]) {
        this.emit(singleMap[ch], ch)
        this.advance(1)
        continue
      }

      throw this.error(`Unexpected character: ${ch}`)
    }

    this.emit(TokenType.EOF, '')
    return this.tokens
  }

  private readNumber() {
    const start = this.pos
    while (this.pos < this.src.length && (this.isDigit(this.src[this.pos]) || this.src[this.pos] === '.')) {
      this.advance(1)
    }
    this.emit(TokenType.Number, this.src.slice(start, this.pos))
  }

  private readString(quote: string) {
    this.advance(1) // skip opening quote
    const start = this.pos
    let value = ''
    while (this.pos < this.src.length && this.src[this.pos] !== quote) {
      if (this.src[this.pos] === '\\') {
        this.advance(1)
        const esc = this.src[this.pos]
        if (esc === 'n') value += '\n'
        else if (esc === 't') value += '\t'
        else if (esc === '\\') value += '\\'
        else if (esc === quote) value += quote
        else value += esc
      } else {
        value += this.src[this.pos]
      }
      this.advance(1)
    }
    if (this.pos >= this.src.length) throw this.error('Unterminated string')
    this.advance(1) // skip closing quote
    this.emit(TokenType.String, value)
  }

  private readIdentifier() {
    const start = this.pos
    while (this.pos < this.src.length && (this.isAlphaNum(this.src[this.pos]) || this.src[this.pos] === '_')) {
      this.advance(1)
    }
    const word = this.src.slice(start, this.pos)
    const kwType = KEYWORDS[word]
    if (kwType) {
      this.emit(kwType, word)
    } else {
      this.emit(TokenType.Identifier, word)
    }
  }

  private skipWhitespaceAndComments() {
    while (this.pos < this.src.length) {
      const ch = this.src[this.pos]
      if (ch === ' ' || ch === '\t' || ch === '\r') {
        this.advance(1)
      } else if (ch === '\n') {
        this.advance(1)
        this.line++
        this.col = 1
      } else if (this.src.slice(this.pos, this.pos + 2) === '//') {
        while (this.pos < this.src.length && this.src[this.pos] !== '\n') this.advance(1)
      } else if (this.src.slice(this.pos, this.pos + 2) === '/*') {
        this.advance(2)
        while (this.pos < this.src.length && this.src.slice(this.pos, this.pos + 2) !== '*/') {
          if (this.src[this.pos] === '\n') { this.line++; this.col = 1 }
          this.advance(1)
        }
        if (this.pos < this.src.length) this.advance(2)
      } else {
        break
      }
    }
  }

  private emit(type: TokenType, value: string) {
    this.tokens.push({ type, value, line: this.line, col: this.col })
  }

  private advance(n: number) {
    for (let i = 0; i < n; i++) {
      this.pos++
      this.col++
    }
  }

  private isDigit(ch: string) { return ch >= '0' && ch <= '9' }
  private isAlpha(ch: string) { return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_' || ch === '$' }
  private isAlphaNum(ch: string) { return this.isDigit(ch) || this.isAlpha(ch) }

  private error(msg: string) {
    return new Error(`[Lexer] Line ${this.line}:${this.col} — ${msg}`)
  }
}
