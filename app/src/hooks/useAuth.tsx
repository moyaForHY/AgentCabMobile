import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { getAccessToken, setAccessToken, storage } from '../services/storage'
import { login as apiLogin, register as apiRegister, fetchMe, setOnAuthExpired, type UserProfile } from '../services/api'

const USER_CACHE_KEY = 'cached_user'

type AuthState = {
  user: UserProfile | null
  isLoading: boolean
  isLoggedIn: boolean
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const logout = useCallback(async () => {
    await setAccessToken(null)
    storage.delete(USER_CACHE_KEY)
    setUser(null)
  }, [])

  useEffect(() => {
    setOnAuthExpired(() => logout())

    ;(async () => {
      // Step 1: Try cache first (instant)
      const cached = await storage.getStringAsync(USER_CACHE_KEY)
      if (cached) {
        try {
          setUser(JSON.parse(cached))
          setIsLoading(false) // Show UI immediately with cached data
        } catch {}
      }

      // Step 2: Verify token + refresh user
      const token = await getAccessToken()
      if (token) {
        try {
          const me = await fetchMe()
          setUser(me)
          await storage.setStringAsync(USER_CACHE_KEY, JSON.stringify(me))
        } catch {
          await setAccessToken(null)
          storage.delete(USER_CACHE_KEY)
          setUser(null)
        }
      } else {
        storage.delete(USER_CACHE_KEY)
        setUser(null)
      }
      setIsLoading(false)
    })()

    return () => setOnAuthExpired(null)
  }, [logout])

  const login = useCallback(async (email: string, password: string) => {
    const result = await apiLogin({ email, password })
    await setAccessToken(result.auth.access_token)
    setUser(result.user)
    await storage.setStringAsync(USER_CACHE_KEY, JSON.stringify(result.user))
  }, [])

  const register = useCallback(async (name: string, email: string, password: string) => {
    const result = await apiRegister({ name, email, password })
    await setAccessToken(result.auth.access_token)
    setUser(result.user)
    await storage.setStringAsync(USER_CACHE_KEY, JSON.stringify(result.user))
  }, [])

  const refreshUser = useCallback(async () => {
    try {
      const me = await fetchMe()
      setUser(me)
      await storage.setStringAsync(USER_CACHE_KEY, JSON.stringify(me))
    } catch {}
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isLoggedIn: !!user,
        login,
        register,
        logout,
        refreshUser,
      }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
