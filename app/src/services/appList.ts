import { NativeModules } from 'react-native'
const { AppListManager } = NativeModules

export type AppInfo = { packageName: string; name: string; isSystem: boolean }

export async function getInstalledApps(includeSystem = false): Promise<AppInfo[]> {
  return AppListManager.getInstalledApps(includeSystem)
}

export async function isAppInstalled(packageName: string): Promise<boolean> {
  return AppListManager.isAppInstalled(packageName)
}

export async function launchApp(packageName: string): Promise<boolean> {
  return AppListManager.launchApp(packageName)
}
