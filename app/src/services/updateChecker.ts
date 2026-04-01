import { Linking } from 'react-native'
import { showModal } from '../components/AppModal'

// Must match android/app/build.gradle versionCode
const CURRENT_VERSION_CODE = 10

const VERSION_URL = 'https://www.agentcab.ai/app-version.json'
const DOWNLOAD_URL = 'https://www.agentcab.ai/agentcab-latest.apk'

type AppVersionInfo = {
  version: string
  versionCode: number
  downloadUrl?: string
  changelog?: string
}

export async function checkForUpdate(): Promise<void> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)

    const res = await fetch(VERSION_URL, { signal: controller.signal })
    clearTimeout(timeout)

    if (!res.ok) return

    const info: AppVersionInfo = await res.json()

    if (info.versionCode > CURRENT_VERSION_CODE) {
      const url = info.downloadUrl || DOWNLOAD_URL
      const changelog = info.changelog || ''
      const message = changelog
        ? `New version ${info.version} available.\n\n${changelog}`
        : `New version ${info.version} is available.`

      showModal('Update Available', message, [
        { text: 'Later', style: 'cancel' },
        {
          text: 'Download',
          onPress: () => {
            Linking.openURL(url).catch(() => {})
          },
        },
      ])
    }
  } catch {
    // Silently ignore — no network, server down, etc.
  }
}
