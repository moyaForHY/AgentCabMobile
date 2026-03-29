package com.agentcab.contacts

import android.provider.ContactsContract
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule

@ReactModule(name = ContactsModule.NAME)
class ContactsModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "ContactsManager"
    }

    override fun getName(): String = NAME

    /**
     * Read contacts with pagination.
     * @param limit Max number of contacts to return
     * @param offset Number of contacts to skip
     */
    @ReactMethod
    fun getContacts(limit: Int, offset: Int, promise: Promise) {
        try {
            val contacts = WritableNativeArray()
            val projection = arrayOf(
                ContactsContract.Contacts._ID,
                ContactsContract.Contacts.DISPLAY_NAME_PRIMARY,
            )
            val sortOrder = "${ContactsContract.Contacts.DISPLAY_NAME_PRIMARY} ASC"

            val cursor = reactApplicationContext.contentResolver.query(
                ContactsContract.Contacts.CONTENT_URI,
                projection,
                null,
                null,
                sortOrder
            )

            cursor?.use {
                val idCol = it.getColumnIndexOrThrow(ContactsContract.Contacts._ID)
                val nameCol = it.getColumnIndexOrThrow(ContactsContract.Contacts.DISPLAY_NAME_PRIMARY)

                // Skip offset
                var skipped = 0
                while (skipped < offset && it.moveToNext()) {
                    skipped++
                }

                var count = 0
                while (it.moveToNext() && count < limit) {
                    val contactId = it.getString(idCol)
                    val name = it.getString(nameCol) ?: ""

                    val contact = WritableNativeMap().apply {
                        putString("id", contactId)
                        putString("name", name)
                        putArray("phoneNumbers", getPhoneNumbers(contactId))
                        putArray("emails", getEmails(contactId))
                    }
                    contacts.pushMap(contact)
                    count++
                }
            }

            promise.resolve(contacts)
        } catch (e: Exception) {
            promise.reject("CONTACTS_ERROR", "Failed to get contacts: ${e.message}", e)
        }
    }

    /**
     * Search contacts by name, phone number, or email.
     * @param query Search string
     */
    @ReactMethod
    fun searchContacts(query: String, promise: Promise) {
        try {
            val contacts = WritableNativeArray()
            val matchedIds = mutableSetOf<String>()

            // Search by display name
            val nameCursor = reactApplicationContext.contentResolver.query(
                ContactsContract.Contacts.CONTENT_URI,
                arrayOf(
                    ContactsContract.Contacts._ID,
                    ContactsContract.Contacts.DISPLAY_NAME_PRIMARY,
                ),
                "${ContactsContract.Contacts.DISPLAY_NAME_PRIMARY} LIKE ?",
                arrayOf("%$query%"),
                "${ContactsContract.Contacts.DISPLAY_NAME_PRIMARY} ASC"
            )

            nameCursor?.use {
                val idCol = it.getColumnIndexOrThrow(ContactsContract.Contacts._ID)
                while (it.moveToNext()) {
                    matchedIds.add(it.getString(idCol))
                }
            }

            // Search by phone number
            val phoneCursor = reactApplicationContext.contentResolver.query(
                ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                arrayOf(ContactsContract.CommonDataKinds.Phone.CONTACT_ID),
                "${ContactsContract.CommonDataKinds.Phone.NUMBER} LIKE ?",
                arrayOf("%$query%"),
                null
            )

            phoneCursor?.use {
                val idCol = it.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Phone.CONTACT_ID)
                while (it.moveToNext()) {
                    matchedIds.add(it.getString(idCol))
                }
            }

            // Search by email
            val emailCursor = reactApplicationContext.contentResolver.query(
                ContactsContract.CommonDataKinds.Email.CONTENT_URI,
                arrayOf(ContactsContract.CommonDataKinds.Email.CONTACT_ID),
                "${ContactsContract.CommonDataKinds.Email.ADDRESS} LIKE ?",
                arrayOf("%$query%"),
                null
            )

            emailCursor?.use {
                val idCol = it.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Email.CONTACT_ID)
                while (it.moveToNext()) {
                    matchedIds.add(it.getString(idCol))
                }
            }

            // Fetch full contact info for matched IDs
            for (contactId in matchedIds) {
                val contactCursor = reactApplicationContext.contentResolver.query(
                    ContactsContract.Contacts.CONTENT_URI,
                    arrayOf(
                        ContactsContract.Contacts._ID,
                        ContactsContract.Contacts.DISPLAY_NAME_PRIMARY,
                    ),
                    "${ContactsContract.Contacts._ID} = ?",
                    arrayOf(contactId),
                    null
                )

                contactCursor?.use {
                    if (it.moveToFirst()) {
                        val name = it.getString(
                            it.getColumnIndexOrThrow(ContactsContract.Contacts.DISPLAY_NAME_PRIMARY)
                        ) ?: ""

                        val contact = WritableNativeMap().apply {
                            putString("id", contactId)
                            putString("name", name)
                            putArray("phoneNumbers", getPhoneNumbers(contactId))
                            putArray("emails", getEmails(contactId))
                        }
                        contacts.pushMap(contact)
                    }
                }
            }

            promise.resolve(contacts)
        } catch (e: Exception) {
            promise.reject("SEARCH_ERROR", "Failed to search contacts: ${e.message}", e)
        }
    }

    /**
     * Get total contact count.
     */
    @ReactMethod
    fun getContactCount(promise: Promise) {
        try {
            val cursor = reactApplicationContext.contentResolver.query(
                ContactsContract.Contacts.CONTENT_URI,
                arrayOf(ContactsContract.Contacts._ID),
                null,
                null,
                null
            )

            val count = cursor?.count ?: 0
            cursor?.close()
            promise.resolve(count)
        } catch (e: Exception) {
            promise.reject("COUNT_ERROR", "Failed to count contacts: ${e.message}", e)
        }
    }

    private fun getPhoneNumbers(contactId: String): WritableNativeArray {
        val phones = WritableNativeArray()
        val cursor = reactApplicationContext.contentResolver.query(
            ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
            arrayOf(ContactsContract.CommonDataKinds.Phone.NUMBER),
            "${ContactsContract.CommonDataKinds.Phone.CONTACT_ID} = ?",
            arrayOf(contactId),
            null
        )

        cursor?.use {
            val numberCol = it.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Phone.NUMBER)
            while (it.moveToNext()) {
                val number = it.getString(numberCol)
                if (number != null) phones.pushString(number)
            }
        }

        return phones
    }

    private fun getEmails(contactId: String): WritableNativeArray {
        val emails = WritableNativeArray()
        val cursor = reactApplicationContext.contentResolver.query(
            ContactsContract.CommonDataKinds.Email.CONTENT_URI,
            arrayOf(ContactsContract.CommonDataKinds.Email.ADDRESS),
            "${ContactsContract.CommonDataKinds.Email.CONTACT_ID} = ?",
            arrayOf(contactId),
            null
        )

        cursor?.use {
            val emailCol = it.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Email.ADDRESS)
            while (it.moveToNext()) {
                val email = it.getString(emailCol)
                if (email != null) emails.pushString(email)
            }
        }

        return emails
    }
}
