import { useState, useEffect, useCallback } from 'react'
import { storage } from '../services/storage'
import { events, EVENT_PINNED_CHANGED } from '../services/events'

const PINNED_KEY = 'pinned_apis'

export type PinnedApi = {
  id: string
  name: string
  customName?: string
  presetValues?: Record<string, any>
  isShortcut?: boolean  // true = shows in Home quick actions, false = just bookmarked
  usageCount?: number   // tracks how often this shortcut is used, for sorting
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

  const pin = useCallback(async (api: PinnedApi) => {
    const current = await load()
    await save([...current.filter(p => p.id !== api.id), api])
  }, [])

  const unpin = useCallback(async (id: string) => {
    const current = await load()
    await save(current.filter(p => p.id !== id))
  }, [])

  const isPinned = useCallback((id: string) => pinned.some(p => p.id === id), [pinned])

  const rename = useCallback(async (id: string, customName: string) => {
    const current = await load()
    await save(current.map(p => p.id === id ? { ...p, customName } : p))
  }, [])

  const incrementUsage = useCallback(async (id: string) => {
    const current = await load()
    await save(current.map(p => p.id === id ? { ...p, usageCount: (p.usageCount || 0) + 1 } : p))
  }, [])

  return { pinned, pin, unpin, isPinned, rename, incrementUsage }
}
