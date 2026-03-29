/**
 * Agent Orchestrator
 * Parses natural language input via LLM → structured intent → skill execution.
 */

import { callSkill, fetchSkills, uploadFile, fetchCall } from './api'

export type Intent = {
  action: 'classify_photos' | 'generate_video' | 'browse_skills' | 'check_balance' | 'help' | 'unknown'
  params: Record<string, any>
  confidence: number
  rawText: string
}

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  intent?: Intent
  loading?: boolean
}

// Intent recognition patterns (local, no LLM call needed for common intents)
const INTENT_PATTERNS: Array<{ pattern: RegExp; action: Intent['action']; extract?: (match: RegExpMatchArray) => Record<string, any> }> = [
  {
    pattern: /(?:整理|分类|归类|organize|classify|sort)\s*(?:照片|相片|图片|photos?|images?|pics?)/i,
    action: 'classify_photos',
  },
  {
    pattern: /(?:生成|制作|创建|做|generate|create|make)\s*(?:视频|video|动画|animation)/i,
    action: 'generate_video',
  },
  {
    pattern: /(?:用|拿|把)?\s*(?:这张|这个|this)\s*(?:照片|图|photo|image|pic)\s*(?:生成|做成|变成|转成|转换|turn\s*into)\s*(?:视频|video)/i,
    action: 'generate_video',
  },
  {
    pattern: /(?:查看|浏览|看看|browse|show|list)\s*(?:技能|skills?|服务|services?)/i,
    action: 'browse_skills',
  },
  {
    pattern: /(?:余额|充值|credits?|balance|钱包|wallet|recharge)/i,
    action: 'check_balance',
  },
  {
    pattern: /(?:帮助|help|怎么用|how\s*to|什么|what\s*can)/i,
    action: 'help',
  },
]

/**
 * Parse user text into a structured intent.
 * Uses local pattern matching first; falls back to 'unknown' for LLM routing.
 */
export function parseIntent(text: string): Intent {
  const trimmed = text.trim()

  for (const { pattern, action, extract } of INTENT_PATTERNS) {
    const match = trimmed.match(pattern)
    if (match) {
      return {
        action,
        params: extract ? extract(match) : {},
        confidence: 0.9,
        rawText: trimmed,
      }
    }
  }

  return {
    action: 'unknown',
    params: {},
    confidence: 0,
    rawText: trimmed,
  }
}

/**
 * Generate a response for a given intent.
 */
export function getIntentResponse(intent: Intent): string {
  switch (intent.action) {
    case 'classify_photos':
      return '好的，我来帮你整理照片。正在打开 AI 照片分类...'
    case 'generate_video':
      return '好的，我来帮你生成视频。正在打开 Seedance 视频生成...'
    case 'browse_skills':
      return '正在打开技能市场，你可以浏览所有可用的 AI 技能。'
    case 'check_balance':
      return '正在查看你的钱包余额...'
    case 'help':
      return '我是 AgentCab AI 助手，可以帮你：\n\n📷 整理照片 - 说"帮我整理照片"\n🎬 生成视频 - 说"用这张图生成视频"\n🔍 浏览技能 - 说"看看有什么技能"\n💰 查看余额 - 说"查看余额"\n\n试试看吧！'
    case 'unknown':
      return '抱歉，我暂时不理解这个指令。你可以试试：\n- 帮我整理照片\n- 生成视频\n- 查看余额\n\n或者说"帮助"查看所有功能。'
    default:
      return '收到，正在处理...'
  }
}

/**
 * Get the navigation target for an intent.
 */
export function getIntentNavigation(intent: Intent): string | null {
  switch (intent.action) {
    case 'classify_photos':
      return 'Classify'
    case 'generate_video':
      return 'Seedance'
    case 'browse_skills':
      return 'DiscoverTab'
    case 'check_balance':
      return 'Wallet'
    default:
      return null
  }
}

let messageIdCounter = 0
export function createMessage(role: ChatMessage['role'], content: string, intent?: Intent): ChatMessage {
  return {
    id: `msg_${Date.now()}_${++messageIdCounter}`,
    role,
    content,
    timestamp: Date.now(),
    intent,
  }
}
