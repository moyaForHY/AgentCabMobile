import { NativeModules, PermissionsAndroid, Platform } from 'react-native'
const { NotificationManager: NM } = NativeModules

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'android' && (Platform.Version as number) >= 33) {
    const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS)
    return result === PermissionsAndroid.RESULTS.GRANTED
  }
  return true
}

export async function showNotification(title: string, body: string, id = Date.now(), callId?: string): Promise<void> {
  if (callId && NM.showNotificationWithCallId) {
    await NM.showNotificationWithCallId(title, body, id % 100000, callId)
  } else {
    await NM.showNotification(title, body, id % 100000)
  }
}

export async function cancelNotification(id: number): Promise<void> {
  await NM.cancelNotification(id)
}
