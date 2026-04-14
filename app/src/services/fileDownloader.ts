import ReactNativeBlobUtil from 'react-native-blob-util'
import { Platform, Linking } from 'react-native'
import { getAccessToken } from './storage'
import { requirePermission } from './permissionGate'

/**
 * Download a file and save to public Downloads via DownloadManager.
 * Returns the filename (file is in public Downloads).
 */
export async function downloadToDevice(url: string, filename: string, mimeType?: string): Promise<string | null> {
  try {
    if (Platform.OS === 'android') {
      const ok = await requirePermission('storage')
      if (!ok) return null
    }
    const token = await getAccessToken()
    const mime = mimeType || inferMimeType(filename)

    if (Platform.OS === 'android') {
      const res = await ReactNativeBlobUtil.config({
        addAndroidDownloads: {
          useDownloadManager: true,
          notification: true,
          title: filename,
          description: 'Downloaded from AgentCab',
          mime,
          mediaScannable: true,
          path: `/storage/emulated/0/Download/${filename}`,
        },
      }).fetch('GET', url, token ? { Authorization: `Bearer ${token}` } : {})

      return `/storage/emulated/0/Download/${filename}`
    } else {
      // iOS: download to app cache directory
      const cachePath = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/${filename}`
      await ReactNativeBlobUtil.config({ path: cachePath })
        .fetch('GET', url, token ? { Authorization: `Bearer ${token}` } : {})
      return cachePath
    }
  } catch {
    return null
  }
}

/**
 * Open a file with system viewer.
 */
export async function openFile(path: string, mimeType?: string): Promise<void> {
  const mime = mimeType || inferMimeType(path)
  if (Platform.OS === 'android') {
    try {
      // Don't pass chooserTitle to avoid FLAG_ACTIVITY_NEW_TASK issue
      await ReactNativeBlobUtil.android.actionViewIntent(path, mime)
    } catch {}
  } else if (Platform.OS === 'ios') {
    try {
      await ReactNativeBlobUtil.ios.openDocument(path)
    } catch {}
  }
}

function inferMimeType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
    mp4: 'video/mp4', mov: 'video/quicktime', avi: 'video/x-msvideo', mkv: 'video/x-matroska',
    mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg',
    pdf: 'application/pdf',
    doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    txt: 'text/plain', json: 'application/json', csv: 'text/csv',
    zip: 'application/zip', rar: 'application/x-rar-compressed',
    apk: 'application/vnd.android.package-archive',
  }
  return map[ext] || 'application/octet-stream'
}
