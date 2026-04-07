import { useState, useEffect, useCallback } from 'react'
import { storage } from '../services/storage'
import { events, EVENT_PINNED_CHANGED } from '../services/events'
import { api as httpApi } from '../services/api'

const PINNED_KEY = 'pinned_apis'

export type PinnedApi = {
  id: string            // skill ID
  shortcutId?: string   // unique ID for each shortcut (allows multiple per skill)
  name: string
  customName?: string
  presetValues?: Record<string, any>
  isShortcut?: boolean  // true = shows in Home quick actions, false = just bookmarked
  usageCount?: number   // tracks how often this shortcut is used, for sorting
  fileInputMode?: 'camera' | 'gallery'  // how to acquire file for file_id fields in quick run
  script?: string       // .acs script content — shortcut executes this directly
  icon?: string         // MaterialCommunityIcons name, auto-matched by AI
  iconColor?: string    // background color for the icon
}

async function load(): Promise<PinnedApi[]> {
  try {
    const raw = await storage.getStringAsync(PINNED_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

async function save(items: PinnedApi[]) {
  await storage.setStringAsync(PINNED_KEY, JSON.stringify(items))
  events.emit(EVENT_PINNED_CHANGED)
}

export function usePinnedApis() {
  const [pinned, setPinned] = useState<PinnedApi[]>([])

  useEffect(() => {
    load().then(setPinned)
    return events.on(EVENT_PINNED_CHANGED, () => { load().then(setPinned) })
  }, [])

  const ICON_COLORS = ['#FF6482', '#FF9F0A', '#5E5CE6', '#30D158', '#BF5AF2', '#64D2FF', '#FFD60A', '#FF453A', '#2563eb', '#06b6d4']

  const pin = useCallback(async (entry: PinnedApi) => {
    // Auto-assign color if missing
    if (!entry.iconColor) {
      const name = entry.customName || entry.name
      let hash = 0
      for (let i = 0; i < name.length; i++) { hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0 }
      entry.iconColor = ICON_COLORS[Math.abs(hash) % ICON_COLORS.length]
    }

    const current = await load()
    const sid = entry.shortcutId || (entry.isShortcut ? `${entry.id}_${Date.now()}` : undefined)
    const item = { ...entry, shortcutId: sid }

    if (entry.isShortcut) {
      await save([...current, item])
    } else {
      await save([...current.filter(p => p.id !== entry.id || p.isShortcut), item])
    }

    // Background: match icon if not set
    if (entry.isShortcut && !entry.icon) {
      const id = sid || entry.id
      try {
        const res = await httpApi.post('/utils/match-icon', { name: entry.customName || entry.name })
        const icon = res.data?.data?.icon
        if (icon) {
          const updated = await load()
          await save(updated.map(p => (p.shortcutId === id || p.id === id) ? { ...p, icon } : p))
        }
      } catch {}
    }
  }, [])

  const unpin = useCallback(async (id: string) => {
    const current = await load()
    // Try shortcutId first, then fall back to skill id (for bookmarks)
    const hasShortcut = current.some(p => p.shortcutId === id)
    if (hasShortcut) {
      await save(current.filter(p => p.shortcutId !== id))
    } else {
      await save(current.filter(p => p.id !== id || p.isShortcut))
    }
  }, [])

  const isPinned = useCallback((id: string) => pinned.some(p => p.id === id && !p.isShortcut), [pinned])

  const rename = useCallback(async (id: string, customName: string) => {
    const current = await load()
    await save(current.map(p => (p.shortcutId === id || p.id === id) ? { ...p, customName } : p))
    // Re-match icon for new name
    try {
      const res = await httpApi.post('/utils/match-icon', { name: customName })
      const icon = res.data?.data?.icon
      if (icon) {
        const updated = await load()
        await save(updated.map(p => (p.shortcutId === id || p.id === id) ? { ...p, icon } : p))
      }
    } catch {}
  }, [])

  const incrementUsage = useCallback(async (id: string) => {
    const current = await load()
    await save(current.map(p => (p.shortcutId === id || p.id === id) ? { ...p, usageCount: (p.usageCount || 0) + 1 } : p))
  }, [])

  const updateIcon = useCallback(async (id: string, icon: string) => {
    const current = await load()
    await save(current.map(p => (p.shortcutId === id || p.id === id) ? { ...p, icon } : p))
  }, [])

  return { pinned, pin, unpin, isPinned, rename, incrementUsage, updateIcon }
}
