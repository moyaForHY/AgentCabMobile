import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { NativeModules, Platform } from 'react-native'
import { storage } from '../services/storage'
import en from './en'
import zh from './zh'

type Translations = typeof en
type Lang = 'en' | 'zh'

const translations: Record<Lang, Translations> = { en, zh }

const LANG_KEY = 'app_language'

function getDeviceLanguage(): Lang {
  try {
    // Try multiple ways to detect locale on Android
    if (Platform.OS === 'android') {
      const i18n = NativeModules.I18nManager
      const locale = i18n?.localeIdentifier || i18n?.locale || ''
      if (locale.startsWith('zh') || locale.includes('CN') || locale.includes('cn')) return 'zh'
      // Fallback: check getConstants if available
      const constants = i18n?.getConstants?.() || {}
      const fallback = constants.localeIdentifier || ''
      if (fallback.startsWith('zh') || fallback.includes('CN')) return 'zh'
    } else {
      const settings = NativeModules.SettingsManager?.settings
      const locale = settings?.AppleLocale || settings?.AppleLanguages?.[0] || ''
      if (locale.startsWith('zh')) return 'zh'
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

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = storage.getString(LANG_KEY)
    if (saved === 'zh' || saved === 'en') return saved
    const detected = getDeviceLanguage()
    return detected
  })

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    storage.setString(LANG_KEY, l)
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
