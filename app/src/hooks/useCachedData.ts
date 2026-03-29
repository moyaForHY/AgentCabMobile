import { useState, useEffect, useCallback } from 'react'
import { storage } from '../services/storage'

/**
 * Generic hook: load from cache first, then fetch fresh data in background.
 * Shows cached data instantly, refreshes silently.
 */
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

  // Load cache + fetch
  useEffect(() => {
    let mounted = true

    ;(async () => {
      // Step 1: cache
      const cached = await storage.getStringAsync(cacheKey)
      if (cached && mounted) {
        try {
          setData(JSON.parse(cached))
          setLoading(false)
        } catch {}
      }

      // Step 2: fresh data
      try {
        const fresh = await fetcher()
        if (mounted) {
          setData(fresh)
          await storage.setStringAsync(cacheKey, JSON.stringify(fresh))
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
    } catch {}
    setRefreshing(false)
  }, [cacheKey, fetcher])

  return { data, loading, refreshing, refresh }
}
