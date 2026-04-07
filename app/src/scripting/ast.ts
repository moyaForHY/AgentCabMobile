/**
 * AgentCab Script AST Node Types
 */

// ── Expressions ──

export type Expr =
  | NumberLiteral
  | StringLiteral
  | BooleanLiteral
  | NullLiteral
  | ArrayLiteral
  | ObjectLiteral
  | Identifier
  | BinaryExpr
  | UnaryExpr
  | LogicalExpr
  | AssignExpr
  | CallExpr
  | MemberExpr
  | IndexExpr
  | TernaryExpr

export type NumberLiteral = { kind: 'NumberLiteral'; value: number }
export type StringLiteral = { kind: 'StringLiteral'; value: string }
export type BooleanLiteral = { kind: 'BooleanLiteral'; value: boolean }
export type NullLiteral = { kind: 'NullLiteral' }
export type ArrayLiteral = { kind: 'ArrayLiteral'; elements: Expr[] }
export type ObjectLiteral = { kind: 'ObjectLiteral'; properties: { key: string; value: Expr }[] }
export type Identifier = { kind: 'Identifier'; name: string }
export type BinaryExpr = { kind: 'BinaryExpr'; op: string; left: Expr; right: Expr }
export type UnaryExpr = { kind: 'UnaryExpr'; op: string; operand: Expr }
export type LogicalExpr = { kind: 'LogicalExpr'; op: string; left: Expr; right: Expr }
export type AssignExpr = { kind: 'AssignExpr'; target: Expr; op: string; value: Expr }
export type CallExpr = { kind: 'CallExpr'; callee: Expr; args: Expr[] }
export type MemberExpr = { kind: 'MemberExpr'; object: Expr; property: string }
export type IndexExpr = { kind: 'IndexExpr'; object: Expr; index: Expr }
export type TernaryExpr = { kind: 'TernaryExpr'; condition: Expr; consequent: Expr; alternate: Expr }

// ── Statements ──

export type Stmt =
  | ExprStmt
  | VarDecl
  | BlockStmt
  | IfStmt
  | WhileStmt
  | ForStmt
  | ForOfStmt
  | FunctionDecl
  | ReturnStmt
  | BreakStmt
  | ContinueStmt
  | TryCatchStmt

export type ExprStmt = { kind: 'ExprStmt'; expr: Expr }
export type VarDecl = { kind: 'VarDecl'; name: string; init: Expr | null }
export type BlockStmt = { kind: 'BlockStmt'; body: Stmt[] }
export type IfStmt = { kind: 'IfStmt'; condition: Expr; then: Stmt; otherwise: Stmt | null }
export type WhileStmt = { kind: 'WhileStmt'; condition: Expr; body: Stmt }
export type ForStmt = { kind: 'ForStmt'; init: Stmt | null; condition: Expr | null; update: Expr | null; body: Stmt }
export type ForOfStmt = { kind: 'ForOfStmt'; variable: string; iterable: Expr; body: Stmt }
export type FunctionDecl = { kind: 'FunctionDecl'; name: string; params: string[]; body: Stmt }
export type ReturnStmt = { kind: 'ReturnStmt'; value: Expr | null }
export type BreakStmt = { kind: 'BreakStmt' }
export type ContinueStmt = { kind: 'ContinueStmt' }
export type TryCatchStmt = { kind: 'TryCatchStmt'; tryBlock: Stmt; catchParam: string; catchBlock: Stmt }

// ── Program ──

export type Program = { kind: 'Program'; body: Stmt[] }
