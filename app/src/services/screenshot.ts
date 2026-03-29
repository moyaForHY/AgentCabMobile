import { NativeModules } from 'react-native'
const { ScreenshotManager } = NativeModules

export type ScreenshotResult = { uri: string; path: string; width: number; height: number }

export async function takeScreenshot(): Promise<ScreenshotResult> {
  return ScreenshotManager.takeScreenshot()
}
