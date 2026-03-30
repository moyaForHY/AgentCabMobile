import { useState, useEffect, useCallback } from 'react'
import { storage } from '../services/storage'

const PINNED_KEY = 'pinned_apis'

export type PinnedApi = {
  id: string
  name: string       // original API name
  customName?: string // user-defined alias
}

export function usePinnedApis() {
  const [pinned, setPinned] = useState<PinnedApi[]>([])

  useEffect(() => {
    storage.getStringAsync(PINNED_KEY).then(raw => {
      if (raw) {
        try { setPinned(JSON.parse(raw)) } catch {}
      }
    })
  }, [])

  const save = useCallback(async (items: PinnedApi[]) => {
    setPinned(items)
    await storage.setStringAsync(PINNED_KEY, JSON.stringify(items))
  }, [])

  const pin = useCallback(async (api: PinnedApi) => {
    const updated = [...pinned.filter(p => p.id !== api.id), api]
    await save(updated)
  }, [pinned, save])

  const unpin = useCallback(async (id: string) => {
    await save(pinned.filter(p => p.id !== id))
  }, [pinned, save])

  const isPinned = useCallback((id: string) => {
    return pinned.some(p => p.id === id)
  }, [pinned])

  const rename = useCallback(async (id: string, customName: string) => {
    const updated = pinned.map(p => p.id === id ? { ...p, customName } : p)
    await save(updated)
  }, [pinned, save])

  return { pinned, pin, unpin, isPinned, rename }
}
