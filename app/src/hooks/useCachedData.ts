import { useState, useEffect, useCallback } from 'react'
import { storage } from '../services/storage'

/**
 * Generic hook: load from cache first, then fetch fresh data in background.
 * All instances sharing the same cacheKey stay in sync —
 * when one calls refresh(), all others get the new data.
 */

type Listener = (data: any) => void
const listenerMap = new Map<string, Set<Listener>>()

function notify(cacheKey: string, data: any) {
  listenerMap.get(cacheKey)?.forEach(fn => fn(data))
}

export function useCachedData<T>(
  cacheKey: string,
  fetcher: () => Promise<T>,
  defaultValue: T,
): {
  data: T
  loading: boolean
  refreshing: boolean
  refresh: () => Promise<void>
} {
  const [data, setData] = useState<T>(defaultValue)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Subscribe to updates from other instances with same cacheKey
  useEffect(() => {
    if (!listenerMap.has(cacheKey)) listenerMap.set(cacheKey, new Set())
    const listener: Listener = (newData) => setData(newData)
    listenerMap.get(cacheKey)!.add(listener)
    return () => { listenerMap.get(cacheKey)?.delete(listener) }
  }, [cacheKey])

  // Load cache + fetch
  useEffect(() => {
    let mounted = true

    ;(async () => {
      // Step 1: cache
      const cached = await storage.getStringAsync(cacheKey)
      if (cached && mounted) {
        try {
          const parsed = JSON.parse(cached)
          setData(parsed)
          setLoading(false)
        } catch {}
      }

      // Step 2: fresh data
      try {
        const fresh = await fetcher()
        if (mounted) {
          setData(fresh)
          await storage.setStringAsync(cacheKey, JSON.stringify(fresh))
          notify(cacheKey, fresh)
        }
      } catch {}
      if (mounted) setLoading(false)
    })()

    return () => { mounted = false }
  }, [cacheKey])

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const fresh = await fetcher()
      setData(fresh)
      await storage.setStringAsync(cacheKey, JSON.stringify(fresh))
      // Notify all other instances with same cacheKey
      notify(cacheKey, fresh)
    } catch {}
    setRefreshing(false)
  }, [cacheKey, fetcher])

  return { data, loading, refreshing, refresh }
}
