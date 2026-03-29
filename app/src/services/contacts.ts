/**
 * Contacts Bridge
 * Exposes native ContactsManager module to TypeScript.
 * Enables APIs to read and search device contacts.
 */
import { NativeModules, Platform, PermissionsAndroid } from 'react-native'

const { ContactsManager } = NativeModules

export type ContactInfo = {
  id: string
  name: string
  phoneNumbers: string[]
  emails: string[]
}

/**
 * Request READ_CONTACTS permission.
 */
export async function requestContactsPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false

  const permission = PermissionsAndroid.PERMISSIONS.READ_CONTACTS

  const granted = await PermissionsAndroid.check(permission)
  if (granted) return true

  const result = await PermissionsAndroid.request(permission, {
    title: 'Contacts Access',
    message: 'AgentCab needs access to your contacts to help you manage them.',
    buttonPositive: 'Allow',
    buttonNegative: 'Deny',
  })

  return result === PermissionsAndroid.RESULTS.GRANTED
}

/**
 * Read contacts with pagination.
 */
export async function getContacts(limit = 50, offset = 0): Promise<ContactInfo[]> {
  return ContactsManager.getContacts(limit, offset)
}

/**
 * Search contacts by name, phone number, or email.
 */
export async function searchContacts(query: string): Promise<ContactInfo[]> {
  return ContactsManager.searchContacts(query)
}

/**
 * Get total contact count on device.
 */
export async function getContactCount(): Promise<number> {
  return ContactsManager.getContactCount()
}
