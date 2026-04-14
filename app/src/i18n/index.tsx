import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { NativeModules, Platform, I18nManager } from 'react-native'
import { storage } from '../services/storage'
import en from './en'
import zh from './zh'
import vi from './vi'
import ja from './ja'
import ar from './ar'

type Translations = typeof en
export type Lang = 'en' | 'zh' | 'vi' | 'ja' | 'ar'

const translations: Record<Lang, Translations> = { en, zh, vi, ja, ar }

/** Supported languages, in display order. `native` is the self-name of the language. */
export const LANG_OPTIONS: { code: Lang; native: string; en: string }[] = [
  { code: 'en', native: 'English', en: 'English' },
  { code: 'zh', native: '中文', en: 'Chinese' },
  { code: 'vi', native: 'Tiếng Việt', en: 'Vietnamese' },
  { code: 'ja', native: '日本語', en: 'Japanese' },
  { code: 'ar', native: 'العربية', en: 'Arabic' },
]

const RTL_LANGS: Lang[] = ['ar']

export function isRTLLang(l: Lang): boolean {
  return RTL_LANGS.includes(l)
}

const LANG_KEY = 'app_language'

function detectLang(raw: string): Lang | null {
  const l = (raw || '').toLowerCase()
  if (!l) return null
  if (l.startsWith('zh') || l.includes('cn')) return 'zh'
  if (l.startsWith('vi')) return 'vi'
  if (l.startsWith('ja')) return 'ja'
  if (l.startsWith('ar')) return 'ar'
  if (l.startsWith('en')) return 'en'
  return null
}

function getDeviceLanguage(): Lang {
  try {
    if (Platform.OS === 'android') {
      const i18n = NativeModules.I18nManager
      const primary = detectLang(i18n?.localeIdentifier || i18n?.locale || '')
      if (primary) return primary
      const constants = i18n?.getConstants?.() || {}
      const fallback = detectLang(constants.localeIdentifier || '')
      if (fallback) return fallback
    } else {
      const settings = NativeModules.SettingsManager?.settings
      const locale = settings?.AppleLocale || settings?.AppleLanguages?.[0] || ''
      const primary = detectLang(locale)
      if (primary) return primary
    }
  } catch {}
  return 'en'
}

type I18nContextType = {
  t: Translations
  lang: Lang
  setLang: (lang: Lang) => void
}

const I18nContext = createContext<I18nContextType>({
  t: en,
  lang: 'en',
  setLang: () => {},
})

function applyRTL(l: Lang) {
  try {
    const shouldRTL = isRTLLang(l)
    if (I18nManager.isRTL !== shouldRTL) {
      I18nManager.allowRTL(shouldRTL)
      I18nManager.forceRTL(shouldRTL)
      // Layout mirroring requires an app restart to fully take effect.
    }
  } catch {}
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const initial = getDeviceLanguage()
    _currentLang = initial
    return initial
  })

  // Load saved language preference async
  useEffect(() => {
    storage.getStringAsync(LANG_KEY).then(saved => {
      if (saved && LANG_OPTIONS.some(o => o.code === saved)) {
        setLangState(saved as Lang)
        _currentLang = saved as Lang
        applyRTL(saved as Lang)
      } else {
        applyRTL(_currentLang)
      }
    })
  }, [])

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    _currentLang = l
    storage.setStringAsync(LANG_KEY, l)
    applyRTL(l)
  }, [])

  return (
    <I18nContext.Provider value={{ t: translations[lang], lang, setLang }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n() {
  return useContext(I18nContext)
}

// Global lang accessor for non-React code (API interceptor etc.)
let _currentLang: Lang = 'en'
export function getCurrentLang(): Lang { return _currentLang }
export function setCurrentLang(l: Lang) { _currentLang = l }

/** Non-hook accessor for the current translations dict — use in services / utils. */
export function getT(): Translations {
  return translations[_currentLang]
}

/** Substitute {0}, {1}, ... placeholders in a template string. */
export function format(template: string, ...args: (string | number)[]): string {
  return template.replace(/\{(\d+)\}/g, (_, i) => {
    const v = args[Number(i)]
    return v == null ? '' : String(v)
  })
}

/** BCP-47 locale tag for the current app language — used by Intl/toLocaleString. */
export function getLocale(): string {
  const l = _currentLang
  if (l === 'zh') return 'zh-CN'
  if (l === 'vi') return 'vi-VN'
  if (l === 'ja') return 'ja-JP'
  if (l === 'ar') return 'ar-SA'
  return 'en-US'
}
