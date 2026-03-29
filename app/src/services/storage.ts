import * as Keychain from 'react-native-keychain'
import AsyncStorage from '@react-native-async-storage/async-storage'

// Secure storage for tokens (Keychain)
const TOKEN_SERVICE = 'com.agentcab.auth'

export async function getAccessToken(): Promise<string | null> {
  try {
    const credentials = await Keychain.getGenericPassword({ service: TOKEN_SERVICE })
    if (credentials) {
      return credentials.password
    }
    return null
  } catch {
    return null
  }
}

export async function setAccessToken(token: string | null): Promise<void> {
  if (!token) {
    await Keychain.resetGenericPassword({ service: TOKEN_SERVICE })
    return
  }
  await Keychain.setGenericPassword('token', token, { service: TOKEN_SERVICE })
}

// General key-value storage (AsyncStorage based)
export const storage = {
  getString: (key: string): string | undefined => {
    // Sync read not possible with AsyncStorage — return undefined
    // Use getStringAsync for async reads
    return undefined
  },
  setString: (key: string, value: string) => {
    AsyncStorage.setItem(key, value).catch(() => {})
  },
  getBoolean: (key: string): boolean | undefined => undefined,
  setBoolean: (key: string, value: boolean) => {
    AsyncStorage.setItem(key, value ? 'true' : 'false').catch(() => {})
  },
  getNumber: (key: string): number | undefined => undefined,
  setNumber: (key: string, value: number) => {
    AsyncStorage.setItem(key, String(value)).catch(() => {})
  },
  delete: (key: string) => {
    AsyncStorage.removeItem(key).catch(() => {})
  },
  clearAll: () => {
    AsyncStorage.clear().catch(() => {})
  },
  // Async versions
  getStringAsync: async (key: string): Promise<string | null> => {
    try {
      const result = await Promise.race([
        AsyncStorage.getItem(key),
        new Promise<null>((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
      ])
      return result
    } catch { return null }
  },
  setStringAsync: async (key: string, value: string): Promise<void> => {
    AsyncStorage.setItem(key, value).catch(() => {})
  },
  clearCache: async (): Promise<void> => {
    try { await AsyncStorage.clear() } catch {}
  },
}
