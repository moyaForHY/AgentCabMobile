import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { getAccessToken, setAccessToken } from '../services/storage'
import { login as apiLogin, register as apiRegister, fetchMe, setOnAuthExpired, type UserProfile } from '../services/api'

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
    setUser(null)
  }, [])

  useEffect(() => {
    setOnAuthExpired(() => logout())

    ;(async () => {
      const token = await getAccessToken()
      if (token) {
        try {
          const me = await fetchMe()
          setUser(me)
        } catch {
          await setAccessToken(null)
        }
      }
      setIsLoading(false)
    })()

    return () => setOnAuthExpired(null)
  }, [logout])

  const login = useCallback(async (email: string, password: string) => {
    const result = await apiLogin({ email, password })
    await setAccessToken(result.auth.access_token)
    setUser(result.user)
  }, [])

  const register = useCallback(async (name: string, email: string, password: string) => {
    const result = await apiRegister({ name, email, password })
    await setAccessToken(result.auth.access_token)
    setUser(result.user)
  }, [])

  const refreshUser = useCallback(async () => {
    try {
      const me = await fetchMe()
      setUser(me)
    } catch {
      // ignore
    }
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
