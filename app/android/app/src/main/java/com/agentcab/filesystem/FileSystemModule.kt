package com.agentcab.filesystem

import android.os.Build
import android.os.Environment
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import java.io.File

@ReactModule(name = FileSystemModule.NAME)
class FileSystemModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "FileSystemManager"
    }

    override fun getName(): String = NAME

    /**
     * List files in a directory.
     * @param path Absolute path to directory
     * @param recursive Whether to list recursively
     */
    @ReactMethod
    fun listFiles(path: String, recursive: Boolean, promise: Promise) {
        try {
            val dir = File(path)
            if (!dir.exists() || !dir.isDirectory) {
                promise.reject("NOT_FOUND", "Directory not found: $path")
                return
            }

            val files = WritableNativeArray()
            val fileList = if (recursive) dir.walkTopDown().toList() else dir.listFiles()?.toList() ?: emptyList()

            for (file in fileList) {
                if (file == dir) continue
                val item = WritableNativeMap().apply {
                    putString("name", file.name)
                    putString("path", file.absolutePath)
                    putBoolean("isDirectory", file.isDirectory)
                    putDouble("size", file.length().toDouble())
                    putDouble("lastModified", file.lastModified().toDouble())
                    putString("extension", file.extension)
                }
                files.pushMap(item)
            }
            promise.resolve(files)
        } catch (e: Exception) {
            promise.reject("LIST_ERROR", "Failed to list files: ${e.message}", e)
        }
    }

    /**
     * Get file info.
     */
    @ReactMethod
    fun getFileInfo(path: String, promise: Promise) {
        try {
            val file = File(path)
            if (!file.exists()) {
                promise.reject("NOT_FOUND", "File not found: $path")
                return
            }
            val info = WritableNativeMap().apply {
                putString("name", file.name)
                putString("path", file.absolutePath)
                putBoolean("isDirectory", file.isDirectory)
                putDouble("size", file.length().toDouble())
                putDouble("lastModified", file.lastModified().toDouble())
                putString("extension", file.extension)
                putBoolean("canRead", file.canRead())
                putBoolean("canWrite", file.canWrite())
            }
            promise.resolve(info)
        } catch (e: Exception) {
            promise.reject("INFO_ERROR", "Failed to get file info: ${e.message}", e)
        }
    }

    /**
     * Move a file from source to destination.
     */
    @ReactMethod
    fun moveFile(sourcePath: String, destPath: String, promise: Promise) {
        try {
            val source = File(sourcePath)
            val dest = File(destPath)
            if (!source.exists()) {
                promise.reject("NOT_FOUND", "Source not found: $sourcePath")
                return
            }
            dest.parentFile?.mkdirs()
            val success = source.renameTo(dest)
            if (!success) {
                // Fallback: copy then delete
                source.copyTo(dest, overwrite = true)
                source.delete()
            }
            promise.resolve(dest.absolutePath)
        } catch (e: Exception) {
            promise.reject("MOVE_ERROR", "Failed to move file: ${e.message}", e)
        }
    }

    /**
     * Copy a file.
     */
    @ReactMethod
    fun copyFile(sourcePath: String, destPath: String, promise: Promise) {
        try {
            val source = File(sourcePath)
            val dest = File(destPath)
            if (!source.exists()) {
                promise.reject("NOT_FOUND", "Source not found: $sourcePath")
                return
            }
            dest.parentFile?.mkdirs()
            source.copyTo(dest, overwrite = true)
            promise.resolve(dest.absolutePath)
        } catch (e: Exception) {
            promise.reject("COPY_ERROR", "Failed to copy file: ${e.message}", e)
        }
    }

    /**
     * Delete a file or empty directory.
     */
    @ReactMethod
    fun deleteFile(path: String, promise: Promise) {
        try {
            val file = File(path)
            if (!file.exists()) {
                promise.resolve(true)
                return
            }
            val success = if (file.isDirectory) file.deleteRecursively() else file.delete()
            promise.resolve(success)
        } catch (e: Exception) {
            promise.reject("DELETE_ERROR", "Failed to delete: ${e.message}", e)
        }
    }

    /**
     * Create a directory.
     */
    @ReactMethod
    fun createDirectory(path: String, promise: Promise) {
        try {
            val dir = File(path)
            val success = dir.mkdirs()
            promise.resolve(success || dir.exists())
        } catch (e: Exception) {
            promise.reject("MKDIR_ERROR", "Failed to create directory: ${e.message}", e)
        }
    }

    /**
     * Read a text file.
     */
    @ReactMethod
    fun readTextFile(path: String, promise: Promise) {
        try {
            val file = File(path)
            if (!file.exists()) {
                promise.reject("NOT_FOUND", "File not found: $path")
                return
            }
            promise.resolve(file.readText())
        } catch (e: Exception) {
            promise.reject("READ_ERROR", "Failed to read file: ${e.message}", e)
        }
    }

    /**
     * Write text to a file.
     */
    @ReactMethod
    fun writeTextFile(path: String, content: String, promise: Promise) {
        try {
            val file = File(path)
            file.parentFile?.mkdirs()
            file.writeText(content)
            promise.resolve(file.absolutePath)
        } catch (e: Exception) {
            promise.reject("WRITE_ERROR", "Failed to write file: ${e.message}", e)
        }
    }

    /**
     * Get common device directories.
     */
    @ReactMethod
    fun getDirectories(promise: Promise) {
        try {
            val dirs = WritableNativeMap().apply {
                putString("downloads", Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS).absolutePath)
                putString("documents", Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS).absolutePath)
                putString("pictures", Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES).absolutePath)
                putString("music", Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MUSIC).absolutePath)
                putString("movies", Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MOVIES).absolutePath)
                putString("dcim", Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DCIM).absolutePath)
                putString("root", Environment.getExternalStorageDirectory().absolutePath)
            }
            promise.resolve(dirs)
        } catch (e: Exception) {
            promise.reject("DIR_ERROR", "Failed to get directories: ${e.message}", e)
        }
    }

    /**
     * Get storage stats (total, free, used space).
     */
    @ReactMethod
    fun getStorageStats(promise: Promise) {
        try {
            val stat = Environment.getExternalStorageDirectory()
            val total = stat.totalSpace
            val free = stat.freeSpace
            val used = total - free
            val result = WritableNativeMap().apply {
                putDouble("totalBytes", total.toDouble())
                putDouble("freeBytes", free.toDouble())
                putDouble("usedBytes", used.toDouble())
                putString("totalFormatted", formatBytes(total))
                putString("freeFormatted", formatBytes(free))
                putString("usedFormatted", formatBytes(used))
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("STATS_ERROR", "Failed to get storage stats: ${e.message}", e)
        }
    }

    /**
     * Search files by name pattern in a directory.
     */
    @ReactMethod
    fun searchFiles(directory: String, query: String, promise: Promise) {
        try {
            val dir = File(directory)
            if (!dir.exists() || !dir.isDirectory) {
                promise.reject("NOT_FOUND", "Directory not found: $directory")
                return
            }

            val results = WritableNativeArray()
            val lowerQuery = query.lowercase()

            dir.walkTopDown().forEach { file ->
                if (file.name.lowercase().contains(lowerQuery)) {
                    val item = WritableNativeMap().apply {
                        putString("name", file.name)
                        putString("path", file.absolutePath)
                        putBoolean("isDirectory", file.isDirectory)
                        putDouble("size", file.length().toDouble())
                        putDouble("lastModified", file.lastModified().toDouble())
                        putString("extension", file.extension)
                    }
                    results.pushMap(item)
                }
            }
            promise.resolve(results)
        } catch (e: Exception) {
            promise.reject("SEARCH_ERROR", "Failed to search: ${e.message}", e)
        }
    }

    private fun formatBytes(bytes: Long): String {
        if (bytes < 1024) return "$bytes B"
        val kb = bytes / 1024.0
        if (kb < 1024) return String.format("%.1f KB", kb)
        val mb = kb / 1024.0
        if (mb < 1024) return String.format("%.1f MB", mb)
        val gb = mb / 1024.0
        return String.format("%.1f GB", gb)
    }
}
