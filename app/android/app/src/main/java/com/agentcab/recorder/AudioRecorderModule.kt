package com.agentcab.recorder

import android.media.MediaRecorder
import android.os.Build
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import java.io.File

@ReactModule(name = AudioRecorderModule.NAME)
class AudioRecorderModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object { const val NAME = "AudioRecorder" }
    override fun getName(): String = NAME

    private var recorder: MediaRecorder? = null
    private var outputPath: String? = null

    @ReactMethod
    fun startRecording(filename: String, promise: Promise) {
        try {
            val dir = reactApplicationContext.cacheDir
            val file = File(dir, filename)
            outputPath = file.absolutePath

            recorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                MediaRecorder(reactApplicationContext)
            } else {
                @Suppress("DEPRECATION")
                MediaRecorder()
            }

            recorder?.apply {
                setAudioSource(MediaRecorder.AudioSource.MIC)
                setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                setAudioSamplingRate(44100)
                setAudioEncodingBitRate(128000)
                setOutputFile(outputPath)
                prepare()
                start()
            }
            promise.resolve(outputPath)
        } catch (e: Exception) {
            promise.reject("RECORD_ERROR", "Failed to start recording: ${e.message}", e)
        }
    }

    @ReactMethod
    fun stopRecording(promise: Promise) {
        try {
            recorder?.apply {
                stop()
                release()
            }
            recorder = null
            promise.resolve(outputPath)
        } catch (e: Exception) {
            recorder?.release()
            recorder = null
            promise.reject("STOP_ERROR", "Failed to stop recording: ${e.message}", e)
        }
    }

    @ReactMethod
    fun isRecording(promise: Promise) {
        promise.resolve(recorder != null)
    }
}
