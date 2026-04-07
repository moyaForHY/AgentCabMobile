import { NativeModules } from 'react-native'
const AppListManager = NativeModules.AppListManager ?? null

export type AppInfo = { packageName: string; name: string; isSystem: boolean }

export async function getInstalledApps(includeSystem = false): Promise<AppInfo[]> {
  if (!AppListManager) return []
  return AppListManager.getInstalledApps(includeSystem)
}

export async function isAppInstalled(packageName: string): Promise<boolean> {
  if (!AppListManager) return false
  return AppListManager.isAppInstalled(packageName)
}

export async function launchApp(packageName: string): Promise<boolean> {
  if (!AppListManager) return false
  return AppListManager.launchApp(packageName)
}
