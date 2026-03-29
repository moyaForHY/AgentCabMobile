import { NativeModules } from 'react-native'
const { AccessibilityManager } = NativeModules

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
  return AccessibilityManager.isEnabled()
}

export async function openAccessibilitySettings(): Promise<void> {
  await AccessibilityManager.openSettings()
}

export async function getScreenContent(): Promise<ScreenNode[]> {
  return AccessibilityManager.getScreenContent()
}

export async function clickByText(text: string): Promise<boolean> {
  return AccessibilityManager.clickByText(text)
}

export async function setTextByTarget(targetText: string, newText: string): Promise<boolean> {
  return AccessibilityManager.setTextByTarget(targetText, newText)
}

export async function pressBack(): Promise<boolean> {
  return AccessibilityManager.pressBack()
}

export async function pressHome(): Promise<boolean> {
  return AccessibilityManager.pressHome()
}

export async function openRecents(): Promise<boolean> {
  return AccessibilityManager.openRecents()
}

export async function openNotifications(): Promise<boolean> {
  return AccessibilityManager.openNotifications()
}
