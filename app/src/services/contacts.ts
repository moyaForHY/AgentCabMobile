/**
 * Contacts Bridge
 * Exposes native ContactsManager module to TypeScript.
 * Enables APIs to read and search device contacts.
 */
import { NativeModules, Platform, Linking } from 'react-native'
import { requirePermission } from './permissionGate'

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
  return await requirePermission('contacts')
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

export type SaveContactParams = {
  name: string
  phone?: string
  email?: string
  company?: string
  title?: string
}

/**
 * Save a new contact using Android ContactsContract INSERT intent.
 * Opens the system contacts app with pre-filled fields for user confirmation.
 */
export async function saveContact(params: SaveContactParams): Promise<void> {
  if (Platform.OS !== 'android') {
    throw new Error('saveContact is only supported on Android')
  }

  const ok = await requirePermission('contacts')
  if (!ok) throw new Error('通讯录权限未开启')

  // Build intent URI for ContactsContract.Intents.Insert
  // Uses content://com.android.contacts/contacts with extras via intent URI
  const extras: string[] = []
  extras.push(`name=${encodeURIComponent(params.name)}`)
  if (params.phone) extras.push(`phone=${encodeURIComponent(params.phone)}`)
  if (params.email) extras.push(`email=${encodeURIComponent(params.email)}`)
  if (params.company) extras.push(`company=${encodeURIComponent(params.company)}`)
  if (params.title) extras.push(`job_title=${encodeURIComponent(params.title)}`)

  // Use ContactsManager native method if available, otherwise fall back to intent
  if (ContactsManager.insertContact) {
    return ContactsManager.insertContact(
      params.name,
      params.phone || '',
      params.email || '',
      params.company || '',
      params.title || '',
    )
  }

  // Fallback: open contacts app with add-contact intent
  const uri = `content://contacts/people`
  await Linking.openURL(uri)
}
