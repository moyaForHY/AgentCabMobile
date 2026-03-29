import * as Keychain from 'react-native-keychain'
import { MMKV } from 'react-native-mmkv'

// Lazy init to avoid JSI timing issues
let _mmkv: MMKV | null = null
function getMMKV(): MMKV {
  if (!_mmkv) {
    try {
      _mmkv = new MMKV({ id: 'agentcab' })
    } catch {
      // Fallback: default instance
      _mmkv = new MMKV()
    }
  }
  return _mmkv
}

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

// General key-value storage (MMKV)
export const storage = {
  getString: (key: string) => { try { return getMMKV().getString(key) } catch { return undefined } },
  setString: (key: string, value: string) => { try { getMMKV().set(key, value) } catch {} },
  getNumber: (key: string) => { try { return getMMKV().getNumber(key) } catch { return undefined } },
  setNumber: (key: string, value: number) => { try { getMMKV().set(key, value) } catch {} },
  getBoolean: (key: string) => { try { return getMMKV().getBoolean(key) } catch { return undefined } },
  setBoolean: (key: string, value: boolean) => { try { getMMKV().set(key, value) } catch {} },
  delete: (key: string) => { try { getMMKV().delete(key) } catch {} },
  clearAll: () => { try { getMMKV().clearAll() } catch {} },
}
