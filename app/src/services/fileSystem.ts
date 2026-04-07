/**
 * File System Bridge
 * Exposes native FileSystemManager module to TypeScript.
 * Enables APIs to browse, search, move, copy, delete files on device.
 */
import { NativeModules, PermissionsAndroid, Platform, Linking } from 'react-native'

const FileSystemManager = NativeModules.FileSystemManager ?? null

export type FileInfo = {
  name: string
  path: string
  isDirectory: boolean
  size: number
  lastModified: number
  extension: string
  canRead?: boolean
  canWrite?: boolean
}

export type StorageStats = {
  totalBytes: number
  freeBytes: number
  usedBytes: number
  totalFormatted: string
  freeFormatted: string
  usedFormatted: string
}

export type DeviceDirs = {
  downloads: string
  documents: string
  pictures: string
  music: string
  movies: string
  dcim: string
  root: string
}

/**
 * Request file management permission (Android 11+).
 * Opens system settings for MANAGE_EXTERNAL_STORAGE.
 */
export async function requestFilePermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false

  const sdkInt = Platform.Version as number

  // Android 11+ needs MANAGE_EXTERNAL_STORAGE
  if (sdkInt >= 30) {
    try {
      // Check if already granted via native check
      // If not, direct user to settings
      await Linking.openSettings()
      return true // User needs to manually grant
    } catch {
      return false
    }
  }

  // Android 10 and below
  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
  )
  return granted === PermissionsAndroid.RESULTS.GRANTED
}

export async function listFiles(path: string, recursive = false): Promise<FileInfo[]> {
  if (!FileSystemManager) return []
  return FileSystemManager.listFiles(path, recursive)
}

export async function getFileInfo(path: string): Promise<FileInfo> {
  if (!FileSystemManager) throw new Error('FileSystemManager not available on ' + Platform.OS)
  return FileSystemManager.getFileInfo(path)
}

export async function moveFile(source: string, dest: string): Promise<string> {
  if (!FileSystemManager) throw new Error('FileSystemManager not available on ' + Platform.OS)
  return FileSystemManager.moveFile(source, dest)
}

export async function copyFile(source: string, dest: string): Promise<string> {
  if (!FileSystemManager) throw new Error('FileSystemManager not available on ' + Platform.OS)
  return FileSystemManager.copyFile(source, dest)
}

export async function deleteFile(path: string): Promise<boolean> {
  if (!FileSystemManager) throw new Error('FileSystemManager not available on ' + Platform.OS)
  return FileSystemManager.deleteFile(path)
}

export async function createDirectory(path: string): Promise<boolean> {
  if (!FileSystemManager) throw new Error('FileSystemManager not available on ' + Platform.OS)
  return FileSystemManager.createDirectory(path)
}

export async function readTextFile(path: string): Promise<string> {
  if (!FileSystemManager) throw new Error('FileSystemManager not available on ' + Platform.OS)
  return FileSystemManager.readTextFile(path)
}

export async function writeTextFile(path: string, content: string): Promise<string> {
  if (!FileSystemManager) throw new Error('FileSystemManager not available on ' + Platform.OS)
  return FileSystemManager.writeTextFile(path, content)
}

export async function getDirectories(): Promise<DeviceDirs> {
  if (!FileSystemManager) {
    // Return reasonable iOS defaults
    const docs = Platform.OS === 'ios' ? '' : '/storage/emulated/0'
    return {
      downloads: docs + '/Downloads',
      documents: docs + '/Documents',
      pictures: docs + '/Pictures',
      music: docs + '/Music',
      movies: docs + '/Movies',
      dcim: docs + '/DCIM',
      root: docs,
    }
  }
  return FileSystemManager.getDirectories()
}

export async function getStorageStats(): Promise<StorageStats> {
  if (!FileSystemManager) return { totalBytes: 0, freeBytes: 0, usedBytes: 0, totalFormatted: '', freeFormatted: '', usedFormatted: '' }
  return FileSystemManager.getStorageStats()
}

export async function searchFiles(directory: string, query: string): Promise<FileInfo[]> {
  if (!FileSystemManager) return []
  return FileSystemManager.searchFiles(directory, query)
}
