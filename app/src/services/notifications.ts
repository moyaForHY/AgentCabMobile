import { NativeModules, Platform } from 'react-native'
import { requirePermission } from './permissionGate'
const NM = NativeModules.NotificationManager ?? null

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true
  return await requirePermission('notifications')
}

export async function showNotification(title: string, body: string, id = Date.now(), callId?: string): Promise<void> {
  if (!NM) return
  if (callId && NM.showNotificationWithCallId) {
    await NM.showNotificationWithCallId(title, body, id % 100000, callId)
  } else {
    await NM.showNotification(title, body, id % 100000)
  }
}

export async function cancelNotification(id: number): Promise<void> {
  if (!NM) return
  await NM.cancelNotification(id)
}
