import { NativeModules, Platform } from 'react-native'
import { requirePermission } from './permissionGate'
const AudioRecorder = NativeModules.AudioRecorder ?? null

export async function requestRecordPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false
  return await requirePermission('audio')
}

export async function startRecording(filename = `recording_${Date.now()}.m4a`): Promise<string> {
  if (!AudioRecorder) throw new Error('AudioRecorder not available on ' + Platform.OS)
  const ok = await requirePermission('audio')
  if (!ok) throw new Error('录音权限未开启')
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
