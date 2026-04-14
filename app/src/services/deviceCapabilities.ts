/**
 * Device Capabilities Provider
 * Exposes phone capabilities to APIs via input_schema format hints.
 *
 * Supported formats in input_schema:
 *   format: "image"     → photo picker / camera
 *   format: "file"      → document picker (any type)
 *   format: "video"     → video picker
 *   format: "audio"     → audio file picker
 *   format: "location"  → GPS coordinates
 *   format: "clipboard" → read clipboard text
 */
import { Platform, PermissionsAndroid, Alert, Clipboard } from 'react-native'
import { launchImageLibrary, launchCamera } from 'react-native-image-picker'
import { pick, types as DocTypes, isErrorWithCode, errorCodes } from '@react-native-documents/picker'
import Share from 'react-native-share'

export type PickedFile = {
  uri: string
  name: string
  size: number
  mimeType: string
}

// ─── Photo / Image ───────────────────────────────────────────

export async function pickPhoto(): Promise<PickedFile | null> {
  try {
    const result = await launchImageLibrary({
      mediaType: 'photo',
      selectionLimit: 1,
      quality: 1,
    })
    if (result.didCancel || !result.assets?.length) return null
    const a = result.assets[0]
    return { uri: a.uri || '', name: a.fileName || 'photo.jpg', size: a.fileSize || 0, mimeType: a.type || 'image/jpeg' }
  } catch (err) {
    console.warn('pickPhoto failed:', err)
    return null
  }
}

export async function pickPhotos(limit = 10): Promise<PickedFile[]> {
  try {
    const result = await launchImageLibrary({
      mediaType: 'photo',
      selectionLimit: limit,
      quality: 0.8,
    })
    if (result.didCancel || !result.assets?.length) return []
    return result.assets.map(a => ({
      uri: a.uri || '', name: a.fileName || 'photo.jpg', size: a.fileSize || 0, mimeType: a.type || 'image/jpeg',
    }))
  } catch { return [] }
}

export async function takePhoto(): Promise<PickedFile | null> {
  try {
    if (Platform.OS === 'android') {
      const { requirePermission } = require('./permissionGate')
      const ok = await requirePermission('camera')
      if (!ok) return null
    }
    const result = await launchCamera({ mediaType: 'photo', quality: 1, saveToPhotos: false })
    if (result.didCancel || !result.assets?.length) return null
    const a = result.assets[0]
    return { uri: a.uri || '', name: a.fileName || 'camera.jpg', size: a.fileSize || 0, mimeType: a.type || 'image/jpeg' }
  } catch { return null }
}

// ─── Video ───────────────────────────────────────────────────

export async function pickVideo(): Promise<PickedFile | null> {
  try {
    const result = await launchImageLibrary({
      mediaType: 'video',
      selectionLimit: 1,
    })
    if (result.didCancel || !result.assets?.length) return null
    const a = result.assets[0]
    return { uri: a.uri || '', name: a.fileName || 'video.mp4', size: a.fileSize || 0, mimeType: a.type || 'video/mp4' }
  } catch (err) {
    console.warn('pickVideo failed:', err)
    return null
  }
}

// ─── Document / Any File ─────────────────────────────────────

export async function pickFile(type?: string[]): Promise<PickedFile | null> {
  try {
    const [result] = await pick({ type: type || [DocTypes.allFiles] })
    if (!result) return null
    return {
      uri: result.uri,
      name: result.name || 'file',
      size: result.size || 0,
      mimeType: result.type || 'application/octet-stream',
    }
  } catch (err: any) {
    if (isErrorWithCode(err) && err.code === errorCodes.OPERATION_CANCELED) return null
    console.warn('pickFile failed:', err)
    return null
  }
}

export async function pickMultipleFiles(type?: string[]): Promise<PickedFile[]> {
  try {
    const results = await pick({ type: type || [DocTypes.allFiles], allowMultiSelection: true })
    return results.map(r => ({
      uri: r.uri,
      name: r.name || 'file',
      size: r.size || 0,
      mimeType: r.type || 'application/octet-stream',
    }))
  } catch (err: any) {
    if (isErrorWithCode(err) && err.code === errorCodes.OPERATION_CANCELED) return []
    return []
  }
}

// ─── Audio ───────────────────────────────────────────────────

export async function pickAudio(): Promise<PickedFile | null> {
  return pickFile([DocTypes.audio])
}

// ─── Clipboard ───────────────────────────────────────────────

export async function readClipboard(): Promise<string> {
  try {
    return await Clipboard.getString()
  } catch { return '' }
}

export function writeClipboard(text: string): void {
  Clipboard.setString(text)
}

// ─── Location ────────────────────────────────────────────────

export type LocationData = {
  latitude: number
  longitude: number
  accuracy?: number
}

export async function getLocation(): Promise<LocationData | null> {
  const LOCATION_TIMEOUT = 10000
  const { requirePermission } = require('./permissionGate')
  const locationPromise = new Promise<LocationData | null>(resolve => {
    if (Platform.OS !== 'android') { resolve(null); return }
    requirePermission('location')
      .then((ok: boolean) => {
        if (!ok) { resolve(null); return }
        // Use the global navigator.geolocation
        const geo = (globalThis as any).navigator?.geolocation
        if (!geo) { resolve(null); return }
        geo.getCurrentPosition(
          (pos: any) => resolve({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          }),
          () => resolve(null),
          { enableHighAccuracy: true, timeout: LOCATION_TIMEOUT, maximumAge: 60000 },
        )
      })
      .catch(() => resolve(null))
  })
  return Promise.race([
    locationPromise,
    new Promise<null>(resolve => setTimeout(() => resolve(null), LOCATION_TIMEOUT)),
  ])
}

// ─── Share ───────────────────────────────────────────────────

export async function shareText(text: string, title?: string): Promise<void> {
  try {
    await Share.open({ message: text, title })
  } catch {}
}

export async function shareFile(uri: string, filename: string, mimeType: string): Promise<void> {
  try {
    await Share.open({
      url: uri,
      filename,
      type: mimeType,
    })
  } catch {}
}

// ─── Capability Router ───────────────────────────────────────
// Maps input_schema format hints to the right picker

export async function pickByFormat(format: string): Promise<PickedFile | null> {
  switch (format) {
    case 'image':
    case 'photo':
      return pickPhoto()
    case 'video':
      return pickVideo()
    case 'audio':
      return pickAudio()
    case 'file':
    case 'document':
      return pickFile()
    default:
      return pickFile()
  }
}
