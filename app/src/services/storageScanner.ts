import { NativeModules } from 'react-native'
const { StorageScanner } = NativeModules

export type DirSize = { name: string; path: string; sizeBytes: number; sizeFormatted: string }
export type AppCache = { packageName: string; cacheSizeBytes: number; cacheSizeFormatted: string; cacheOnlyBytes: number; dataBytes: number }
export type SocialStorage = Record<string, { sizeBytes: number; sizeFormatted: string; exists: boolean }>
export type BurstInfo = { bursts: Array<{ startIndex: number; endIndex: number; count: number; startTime: number; deletable: number }>; totalBursts: number; totalDeletable: number }

export async function scanDirectorySizes(): Promise<DirSize[]> {
  return StorageScanner.scanDirectorySizes()
}

export async function scanAppCaches(): Promise<AppCache[]> {
  return StorageScanner.scanAppCaches()
}

export async function scanSocialAppStorage(): Promise<SocialStorage> {
  return StorageScanner.scanSocialAppStorage()
}

export async function analyzePhotoBursts(timestamps: number[]): Promise<BurstInfo> {
  return StorageScanner.analyzePhotoBursts(timestamps)
}
