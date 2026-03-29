import ReactNativeBlobUtil from 'react-native-blob-util'
import { Alert, ToastAndroid, Platform } from 'react-native'
import { getAccessToken } from './storage'

/**
 * Download a file and save to Downloads. Returns a promise that resolves when done.
 */
export async function downloadToDevice(url: string, filename: string, mimeType?: string): Promise<boolean> {
  try {
    const token = await getAccessToken()
    const dirs = ReactNativeBlobUtil.fs.dirs
    const path = `${dirs.DownloadDir}/${filename}`

    await ReactNativeBlobUtil.config({
      path,
      fileCache: true,
      addAndroidDownloads: {
        useDownloadManager: true,
        notification: true,
        title: filename,
        description: 'Downloading from AgentCab',
        mime: mimeType || 'application/octet-stream',
        mediaScannable: true,
        path,
      },
    }).fetch('GET', url, token ? { Authorization: `Bearer ${token}` } : {})

    return true
  } catch {
    return false
  }
}
