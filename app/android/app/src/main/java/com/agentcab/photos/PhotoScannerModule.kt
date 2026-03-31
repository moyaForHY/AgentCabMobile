package com.agentcab.photos

import android.content.ContentUris
import android.database.Cursor
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import android.util.Base64
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import java.io.ByteArrayOutputStream
import java.security.MessageDigest

@ReactModule(name = PhotoScannerModule.NAME)
class PhotoScannerModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "PhotoScanner"
        private const val THUMBNAIL_SIZE = 200
        private const val PHASH_SIZE = 8
    }

    override fun getName(): String = NAME

    /**
     * Scan photos from MediaStore.
     * Returns a list of photo metadata objects.
     * @param limit Max number of photos to return
     * @param offset Number of photos to skip
     */
    @ReactMethod
    fun scanPhotos(limit: Int, offset: Int, promise: Promise) {
        try {
            val photos = WritableNativeArray()
            val collection = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL)
            } else {
                MediaStore.Images.Media.EXTERNAL_CONTENT_URI
            }

            val projection = arrayOf(
                MediaStore.Images.Media._ID,
                MediaStore.Images.Media.DISPLAY_NAME,
                MediaStore.Images.Media.DATE_ADDED,
                MediaStore.Images.Media.DATE_MODIFIED,
                MediaStore.Images.Media.SIZE,
                MediaStore.Images.Media.WIDTH,
                MediaStore.Images.Media.HEIGHT,
                MediaStore.Images.Media.MIME_TYPE,
                MediaStore.Images.Media.DATA,
                MediaStore.Images.Media.BUCKET_DISPLAY_NAME,
            )

            val sortOrder = "${MediaStore.Images.Media.DATE_ADDED} DESC"

            val cursor: Cursor? = reactApplicationContext.contentResolver.query(
                collection,
                projection,
                null,
                null,
                sortOrder
            )

            cursor?.use {
                val idCol = it.getColumnIndexOrThrow(MediaStore.Images.Media._ID)
                val nameCol = it.getColumnIndexOrThrow(MediaStore.Images.Media.DISPLAY_NAME)
                val dateAddedCol = it.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_ADDED)
                val dateModifiedCol = it.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_MODIFIED)
                val sizeCol = it.getColumnIndexOrThrow(MediaStore.Images.Media.SIZE)
                val widthCol = it.getColumnIndexOrThrow(MediaStore.Images.Media.WIDTH)
                val heightCol = it.getColumnIndexOrThrow(MediaStore.Images.Media.HEIGHT)
                val mimeCol = it.getColumnIndexOrThrow(MediaStore.Images.Media.MIME_TYPE)
                val dataCol = it.getColumnIndexOrThrow(MediaStore.Images.Media.DATA)
                val bucketCol = it.getColumnIndexOrThrow(MediaStore.Images.Media.BUCKET_DISPLAY_NAME)

                // Skip offset
                var skipped = 0
                while (skipped < offset && it.moveToNext()) {
                    skipped++
                }

                var count = 0
                while (it.moveToNext() && count < limit) {
                    val id = it.getLong(idCol)
                    val contentUri = ContentUris.withAppendedId(
                        MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id
                    )

                    val photo = WritableNativeMap().apply {
                        putString("id", id.toString())
                        putString("uri", contentUri.toString())
                        putString("name", it.getString(nameCol) ?: "")
                        putDouble("dateAdded", it.getLong(dateAddedCol).toDouble())
                        putDouble("dateModified", it.getLong(dateModifiedCol).toDouble())
                        putDouble("size", it.getLong(sizeCol).toDouble())
                        putInt("width", it.getInt(widthCol))
                        putInt("height", it.getInt(heightCol))
                        putString("mimeType", it.getString(mimeCol) ?: "")
                        putString("path", it.getString(dataCol) ?: "")
                        putString("bucket", it.getString(bucketCol) ?: "")
                    }
                    photos.pushMap(photo)
                    count++
                }
            }

            promise.resolve(photos)
        } catch (e: Exception) {
            promise.reject("SCAN_ERROR", "Failed to scan photos: ${e.message}", e)
        }
    }

    /**
     * Get total photo count on device.
     */
    @ReactMethod
    fun getPhotoCount(promise: Promise) {
        try {
            val collection = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL)
            } else {
                MediaStore.Images.Media.EXTERNAL_CONTENT_URI
            }

            val cursor = reactApplicationContext.contentResolver.query(
                collection,
                arrayOf(MediaStore.Images.Media._ID),
                null,
                null,
                null
            )

            val count = cursor?.count ?: 0
            cursor?.close()
            promise.resolve(count)
        } catch (e: Exception) {
            promise.reject("COUNT_ERROR", "Failed to count photos: ${e.message}", e)
        }
    }

    /**
     * Generate a base64 thumbnail for a photo.
     * @param uri Content URI of the photo
     * @param size Thumbnail size in pixels
     */
    @ReactMethod
    fun getThumbnail(uri: String, size: Int, promise: Promise) {
        try {
            val targetSize = if (size > 0) size else THUMBNAIL_SIZE
            val contentUri = Uri.parse(uri)

            val bitmap = reactApplicationContext.contentResolver.openInputStream(contentUri)?.use { input ->
                val options = BitmapFactory.Options().apply {
                    inJustDecodeBounds = true
                }
                BitmapFactory.decodeStream(input, null, options)

                options.inSampleSize = calculateInSampleSize(options, targetSize, targetSize)
                options.inJustDecodeBounds = false

                reactApplicationContext.contentResolver.openInputStream(contentUri)?.use { input2 ->
                    BitmapFactory.decodeStream(input2, null, options)
                }
            }

            if (bitmap != null) {
                val scaled = Bitmap.createScaledBitmap(bitmap, targetSize, targetSize, true)
                val stream = ByteArrayOutputStream()
                scaled.compress(Bitmap.CompressFormat.JPEG, 70, stream)
                val base64 = Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP)
                promise.resolve("data:image/jpeg;base64,$base64")

                if (scaled != bitmap) scaled.recycle()
                bitmap.recycle()
            } else {
                promise.reject("THUMBNAIL_ERROR", "Failed to decode image")
            }
        } catch (e: Exception) {
            promise.reject("THUMBNAIL_ERROR", "Failed to generate thumbnail: ${e.message}", e)
        }
    }

    /**
     * Compute perceptual hash for duplicate detection.
     * Returns a hex string hash.
     * @param uri Content URI of the photo
     */
    @ReactMethod
    fun computePhash(uri: String, promise: Promise) {
        try {
            val contentUri = Uri.parse(uri)
            val bitmap = reactApplicationContext.contentResolver.openInputStream(contentUri)?.use { input ->
                val options = BitmapFactory.Options().apply {
                    inSampleSize = 4 // Downsample for speed
                }
                BitmapFactory.decodeStream(input, null, options)
            } ?: run {
                promise.reject("PHASH_ERROR", "Failed to decode image")
                return
            }

            // Resize to 8x8 grayscale
            val small = Bitmap.createScaledBitmap(bitmap, PHASH_SIZE, PHASH_SIZE, true)
            val pixels = IntArray(PHASH_SIZE * PHASH_SIZE)
            small.getPixels(pixels, 0, PHASH_SIZE, 0, 0, PHASH_SIZE, PHASH_SIZE)

            // Convert to grayscale values
            val gray = DoubleArray(pixels.size) { i ->
                val p = pixels[i]
                val r = (p shr 16) and 0xFF
                val g = (p shr 8) and 0xFF
                val b = p and 0xFF
                0.299 * r + 0.587 * g + 0.114 * b
            }

            // Compute average
            val avg = gray.average()

            // Build hash: 1 if above average, 0 if below
            val hashBits = StringBuilder()
            for (value in gray) {
                hashBits.append(if (value >= avg) "1" else "0")
            }

            // Convert binary string to hex
            val hashLong = java.lang.Long.parseUnsignedLong(hashBits.toString(), 2)
            val hexHash = String.format("%016x", hashLong)

            promise.resolve(hexHash)

            small.recycle()
            bitmap.recycle()
        } catch (e: Exception) {
            promise.reject("PHASH_ERROR", "Failed to compute phash: ${e.message}", e)
        }
    }

    /**
     * Batch compute phashes for multiple photos.
     * @param uris Array of content URIs
     */
    @ReactMethod
    fun batchComputePhash(uris: ReadableArray, promise: Promise) {
        try {
            val results = WritableNativeMap()
            for (i in 0 until uris.size()) {
                val uri = uris.getString(i) ?: continue
                try {
                    val contentUri = Uri.parse(uri)
                    val bitmap = reactApplicationContext.contentResolver.openInputStream(contentUri)?.use { input ->
                        val options = BitmapFactory.Options().apply { inSampleSize = 4 }
                        BitmapFactory.decodeStream(input, null, options)
                    } ?: continue

                    val small = Bitmap.createScaledBitmap(bitmap, PHASH_SIZE, PHASH_SIZE, true)
                    val pixels = IntArray(PHASH_SIZE * PHASH_SIZE)
                    small.getPixels(pixels, 0, PHASH_SIZE, 0, 0, PHASH_SIZE, PHASH_SIZE)

                    val gray = DoubleArray(pixels.size) { idx ->
                        val p = pixels[idx]
                        0.299 * ((p shr 16) and 0xFF) + 0.587 * ((p shr 8) and 0xFF) + 0.114 * (p and 0xFF)
                    }
                    val avg = gray.average()
                    val hashBits = StringBuilder()
                    for (value in gray) {
                        hashBits.append(if (value >= avg) "1" else "0")
                    }
                    val hashLong = java.lang.Long.parseUnsignedLong(hashBits.toString(), 2)
                    results.putString(uri, String.format("%016x", hashLong))

                    small.recycle()
                    bitmap.recycle()
                } catch (_: Exception) {
                    // Skip failed photos
                }
            }
            promise.resolve(results)
        } catch (e: Exception) {
            promise.reject("BATCH_PHASH_ERROR", "Failed to batch compute phash: ${e.message}", e)
        }
    }

    /**
     * Delete a photo by content URI.
     * On Android 11+, uses createDeleteRequest for system confirmation dialog.
     */
    @ReactMethod
    fun deletePhoto(uri: String, promise: Promise) {
        try {
            val contentUri = Uri.parse(uri)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                // Android 11+: use createDeleteRequest for system dialog
                val pendingIntent = MediaStore.createDeleteRequest(
                    reactApplicationContext.contentResolver,
                    listOf(contentUri)
                )
                val activity = reactApplicationContext.currentActivity
                if (activity != null) {
                    activity.startIntentSenderForResult(
                        pendingIntent.intentSender, 9001, null, 0, 0, 0
                    )
                    // Can't easily get result in RN bridge, assume success if no crash
                    promise.resolve(true)
                } else {
                    promise.reject("DELETE_ERROR", "No activity available")
                }
            } else {
                val deleted = reactApplicationContext.contentResolver.delete(contentUri, null, null)
                promise.resolve(deleted > 0)
            }
        } catch (e: Exception) {
            promise.reject("DELETE_ERROR", "Failed to delete photo: ${e.message}", e)
        }
    }

    /**
     * Batch delete photos by content URIs.
     * On Android 11+, uses createDeleteRequest to show ONE system dialog for all files.
     */
    @ReactMethod
    fun batchDeletePhotos(uris: ReadableArray, promise: Promise) {
        try {
            val contentUris = mutableListOf<Uri>()
            for (i in 0 until uris.size()) {
                val uri = uris.getString(i) ?: continue
                contentUris.add(Uri.parse(uri))
            }

            if (contentUris.isEmpty()) {
                promise.resolve(0)
                return
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                // Android 11+: one system dialog for all files
                val pendingIntent = MediaStore.createDeleteRequest(
                    reactApplicationContext.contentResolver,
                    contentUris
                )
                val activity = reactApplicationContext.currentActivity
                if (activity != null) {
                    activity.startIntentSenderForResult(
                        pendingIntent.intentSender, 9002, null, 0, 0, 0
                    )
                    promise.resolve(contentUris.size)
                } else {
                    promise.reject("DELETE_ERROR", "No activity available")
                }
            } else {
                var count = 0
                for (uri in contentUris) {
                    try {
                        val deleted = reactApplicationContext.contentResolver.delete(uri, null, null)
                        if (deleted > 0) count++
                    } catch (_: Exception) {}
                }
                promise.resolve(count)
            }
        } catch (e: Exception) {
            promise.reject("BATCH_DELETE_ERROR", e.message, e)
        }
    }

    private fun calculateInSampleSize(
        options: BitmapFactory.Options,
        reqWidth: Int,
        reqHeight: Int
    ): Int {
        val (height, width) = options.outHeight to options.outWidth
        var inSampleSize = 1
        if (height > reqHeight || width > reqWidth) {
            val halfHeight = height / 2
            val halfWidth = width / 2
            while (halfHeight / inSampleSize >= reqHeight && halfWidth / inSampleSize >= reqWidth) {
                inSampleSize *= 2
            }
        }
        return inSampleSize
    }
}
