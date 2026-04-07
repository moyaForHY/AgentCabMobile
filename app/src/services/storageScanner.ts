import { NativeModules } from 'react-native'
const StorageScannerModule = NativeModules.StorageScanner ?? null

export type DirSize = { name: string; path: string; sizeBytes: number; sizeFormatted: string }
export type AppCache = { packageName: string; cacheSizeBytes: number; cacheSizeFormatted: string; cacheOnlyBytes: number; dataBytes: number }
export type SocialStorage = Record<string, { sizeBytes: number; sizeFormatted: string; exists: boolean }>
export type BurstInfo = { bursts: Array<{ startIndex: number; endIndex: number; count: number; startTime: number; deletable: number; keepUri?: string | null; deletableUris?: string[] }>; totalBursts: number; totalDeletable: number }

export async function scanDirectorySizes(): Promise<DirSize[]> {
  if (!StorageScannerModule) return []
  return StorageScannerModule.scanDirectorySizes()
}

export async function scanAppCaches(): Promise<AppCache[]> {
  if (!StorageScannerModule) return []
  return StorageScannerModule.scanAppCaches()
}

export async function scanSocialAppStorage(): Promise<SocialStorage> {
  if (!StorageScannerModule) return {} as SocialStorage
  return StorageScannerModule.scanSocialAppStorage()
}

export async function analyzePhotoBursts(timestamps: number[]): Promise<BurstInfo> {
  if (!StorageScannerModule) return { bursts: [], totalBursts: 0, totalDeletable: 0 }
  return StorageScannerModule.analyzePhotoBursts(timestamps)
}
