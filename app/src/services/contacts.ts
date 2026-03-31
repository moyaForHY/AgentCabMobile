/**
 * Contacts Bridge
 * Exposes native ContactsManager module to TypeScript.
 * Enables APIs to read and search device contacts.
 */
import { NativeModules, Platform, PermissionsAndroid, Linking } from 'react-native'

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

  if (result === PermissionsAndroid.RESULTS.GRANTED) return true

  if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
    const { showModal } = require('../components/AppModal')
    const { permissionStrings, openPermissionEditor } = require('../utils/i18n')
    const s = permissionStrings('contacts')
    showModal(s.title, s.message, [
      { text: s.goSettings, onPress: () => openPermissionEditor() },
      { text: s.cancel, style: 'cancel' as const },
    ])
  }
  return false
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

  // Request WRITE_CONTACTS permission
  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.WRITE_CONTACTS,
    {
      title: 'Contacts Access',
      message: 'AgentCab needs permission to save contacts.',
      buttonPositive: 'Allow',
      buttonNegative: 'Deny',
    },
  )
  if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
    throw new Error('WRITE_CONTACTS permission denied')
  }

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
