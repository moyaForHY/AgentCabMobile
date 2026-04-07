import { NativeModules, Platform } from 'react-native'
const ScreenshotManager = NativeModules.ScreenshotManager ?? null

export type ScreenshotResult = { uri: string; path: string; width: number; height: number }

export async function takeScreenshot(): Promise<ScreenshotResult> {
  if (!ScreenshotManager) throw new Error('ScreenshotManager not available on ' + Platform.OS)
  return ScreenshotManager.takeScreenshot()
}

export async function setWallpaper(source: string): Promise<boolean> {
  if (!ScreenshotManager?.setWallpaper) throw new Error('setWallpaper not available on ' + Platform.OS)
  return ScreenshotManager.setWallpaper(source)
}
