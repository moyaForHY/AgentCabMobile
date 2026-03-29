import { NativeModules, Platform, PermissionsAndroid } from 'react-native'

const { PhotoScanner } = NativeModules

export type PhotoMeta = {
  id: string
  uri: string
  name: string
  dateAdded: number   // Unix timestamp (seconds)
  dateModified: number
  size: number        // bytes
  width: number
  height: number
  mimeType: string
  path: string
  bucket: string      // Album/folder name
}

/**
 * Request photo read permission (Android 13+ uses READ_MEDIA_IMAGES).
 */
export async function requestPhotoPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false

  const sdkInt = Platform.Version as number
  const permission =
    sdkInt >= 33
      ? PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES
      : PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE

  const granted = await PermissionsAndroid.check(permission)
  if (granted) return true

  const result = await PermissionsAndroid.request(permission, {
    title: 'Photo Access',
    message: 'AgentCab needs access to your photos to help you organize them.',
    buttonPositive: 'Allow',
    buttonNegative: 'Deny',
  })

  return result === PermissionsAndroid.RESULTS.GRANTED
}

/**
 * Scan device photos with pagination.
 */
export async function scanPhotos(limit = 50, offset = 0): Promise<PhotoMeta[]> {
  return PhotoScanner.scanPhotos(limit, offset)
}

/**
 * Get total photo count on device.
 */
export async function getPhotoCount(): Promise<number> {
  return PhotoScanner.getPhotoCount()
}

/**
 * Get base64 thumbnail for a photo.
 */
export async function getThumbnail(uri: string, size = 200): Promise<string> {
  return PhotoScanner.getThumbnail(uri, size)
}

/**
 * Compute perceptual hash for a single photo.
 */
export async function computePhash(uri: string): Promise<string> {
  return PhotoScanner.computePhash(uri)
}

/**
 * Batch compute perceptual hashes. Returns { uri: hash } map.
 */
export async function batchComputePhash(uris: string[]): Promise<Record<string, string>> {
  return PhotoScanner.batchComputePhash(uris)
}

/**
 * Find duplicate photos by comparing perceptual hashes.
 * Returns groups of URIs that are likely duplicates (hamming distance <= threshold).
 */
export function findDuplicates(
  hashMap: Record<string, string>,
  threshold = 5,
): string[][] {
  const entries = Object.entries(hashMap)
  const visited = new Set<string>()
  const groups: string[][] = []

  for (let i = 0; i < entries.length; i++) {
    const [uri1, hash1] = entries[i]
    if (visited.has(uri1)) continue

    const group = [uri1]
    visited.add(uri1)

    for (let j = i + 1; j < entries.length; j++) {
      const [uri2, hash2] = entries[j]
      if (visited.has(uri2)) continue

      if (hammingDistance(hash1, hash2) <= threshold) {
        group.push(uri2)
        visited.add(uri2)
      }
    }

    if (group.length > 1) {
      groups.push(group)
    }
  }

  return groups
}

/**
 * Delete a photo by content URI.
 */
export async function deletePhoto(uri: string): Promise<boolean> {
  return PhotoScanner.deletePhoto(uri)
}

/**
 * Batch delete photos by content URIs.
 */
export async function batchDeletePhotos(uris: string[]): Promise<number> {
  return PhotoScanner.batchDeletePhotos(uris)
}

function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return 64 // max distance

  let distance = 0
  const valA = BigInt('0x' + a)
  const valB = BigInt('0x' + b)
  let xor = valA ^ valB

  while (xor > 0n) {
    distance += Number(xor & 1n)
    xor >>= 1n
  }

  return distance
}
