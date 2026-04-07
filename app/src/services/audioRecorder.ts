import { NativeModules, PermissionsAndroid, Platform } from 'react-native'
const AudioRecorder = NativeModules.AudioRecorder ?? null

export async function requestRecordPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false
  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO)
  return result === PermissionsAndroid.RESULTS.GRANTED
}

export async function startRecording(filename = `recording_${Date.now()}.m4a`): Promise<string> {
  if (!AudioRecorder) throw new Error('AudioRecorder not available on ' + Platform.OS)
  return AudioRecorder.startRecording(filename)
}

export async function stopRecording(): Promise<string> {
  if (!AudioRecorder) throw new Error('AudioRecorder not available on ' + Platform.OS)
  return AudioRecorder.stopRecording()
}

export async function isRecording(): Promise<boolean> {
  if (!AudioRecorder) return false
  return AudioRecorder.isRecording()
}
