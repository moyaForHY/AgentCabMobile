import { NativeModules, Platform } from 'react-native'
const AccessibilityManager = NativeModules.AccessibilityManager ?? null

export type ScreenNode = {
  text: string | null
  className: string | null
  contentDescription: string | null
  isClickable: boolean
  isEditable: boolean
  isScrollable: boolean
  depth: number
}

export async function isAccessibilityEnabled(): Promise<boolean> {
  if (!AccessibilityManager) return false
  return AccessibilityManager.isEnabled()
}

export async function openAccessibilitySettings(): Promise<void> {
  if (!AccessibilityManager) return
  await AccessibilityManager.openSettings()
}

export async function getScreenContent(): Promise<ScreenNode[]> {
  if (!AccessibilityManager) return []
  return AccessibilityManager.getScreenContent()
}

export async function clickByText(text: string): Promise<boolean> {
  if (!AccessibilityManager) return false
  return AccessibilityManager.clickByText(text)
}

export async function setTextByTarget(targetText: string, newText: string): Promise<boolean> {
  if (!AccessibilityManager) return false
  return AccessibilityManager.setTextByTarget(targetText, newText)
}

export async function pressBack(): Promise<boolean> {
  if (!AccessibilityManager) return false
  return AccessibilityManager.pressBack()
}

export async function pressHome(): Promise<boolean> {
  if (!AccessibilityManager) return false
  return AccessibilityManager.pressHome()
}

export async function openRecents(): Promise<boolean> {
  if (!AccessibilityManager) return false
  return AccessibilityManager.openRecents()
}

export async function openNotifications(): Promise<boolean> {
  if (!AccessibilityManager) return false
  return AccessibilityManager.openNotifications()
}

export async function scroll(direction: 'up' | 'down' | 'left' | 'right'): Promise<boolean> {
  if (!AccessibilityManager) return false
  return AccessibilityManager.scroll(direction)
}

export async function swipe(startX: number, startY: number, endX: number, endY: number, durationMs = 300): Promise<boolean> {
  if (!AccessibilityManager) return false
  return AccessibilityManager.swipe(startX, startY, endX, endY, durationMs)
}
