// JNI wrapper for PP-OCRv5 (ncnn)
// Provides: init, ocr(Bitmap) -> JSON string

#include <jni.h>
#include <android/bitmap.h>
#include <android/asset_manager_jni.h>
#include <android/log.h>
#include <string>
#include <vector>
#include <sstream>
#include <map>

#include "ppocrv5.h"
#include "ppocrv5_dict.h"

#include <opencv2/core/core.hpp>
#include <opencv2/imgproc/imgproc.hpp>

#define TAG "NcnnOCR"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, TAG, __VA_ARGS__)

static PPOCRv5* g_ppocrv5 = nullptr;
static bool g_initialized = false;

// Escape JSON string
static std::string json_escape(const std::string& s) {
    std::string out;
    for (char c : s) {
        switch (c) {
            case '"': out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\n': out += "\\n"; break;
            case '\r': out += "\\r"; break;
            case '\t': out += "\\t"; break;
            default: out += c;
        }
    }
    return out;
}

extern "C" {

JNIEXPORT jboolean JNICALL
Java_com_agentcab_ocr_NcnnOcrModule_nativeInit(JNIEnv* env, jobject, jobject assetManager) {
    if (g_initialized) return JNI_TRUE;

    AAssetManager* mgr = AAssetManager_fromJava(env, assetManager);
    if (!mgr) {
        LOGE("Failed to get AssetManager");
        return JNI_FALSE;
    }

    g_ppocrv5 = new PPOCRv5();
    int ret = g_ppocrv5->load(mgr,
        "models/ocr/PP_OCRv5_mobile_det.ncnn.param",
        "models/ocr/PP_OCRv5_mobile_det.ncnn.bin",
        "models/ocr/PP_OCRv5_mobile_rec.ncnn.param",
        "models/ocr/PP_OCRv5_mobile_rec.ncnn.bin",
        true,   // use_fp16
        false   // use_gpu (CPU is faster for small models)
    );

    if (ret != 0) {
        LOGE("Failed to load PP-OCRv5 models: %d", ret);
        delete g_ppocrv5;
        g_ppocrv5 = nullptr;
        return JNI_FALSE;
    }

    g_initialized = true;
    LOGI("PP-OCRv5 initialized");
    return JNI_TRUE;
}

JNIEXPORT jstring JNICALL
Java_com_agentcab_ocr_NcnnOcrModule_nativeOcr(JNIEnv* env, jobject, jobject bitmap) {
    if (!g_initialized || !g_ppocrv5) {
        return env->NewStringUTF("[]");
    }

    // Get bitmap info
    AndroidBitmapInfo info;
    if (AndroidBitmap_getInfo(env, bitmap, &info) != 0) {
        LOGE("Failed to get bitmap info");
        return env->NewStringUTF("[]");
    }

    // Lock pixels
    void* pixels = nullptr;
    if (AndroidBitmap_lockPixels(env, bitmap, &pixels) != 0) {
        LOGE("Failed to lock bitmap pixels");
        return env->NewStringUTF("[]");
    }

    // Convert to cv::Mat (keep rgba copy for bg color sampling)
    cv::Mat rgba(info.height, info.width, CV_8UC4, pixels);
    cv::Mat rgbaCopy = rgba.clone();
    cv::Mat rgb;
    cv::cvtColor(rgba, rgb, cv::COLOR_RGBA2RGB);

    AndroidBitmap_unlockPixels(env, bitmap);

    // Run OCR
    std::vector<Object> objects;
    g_ppocrv5->detect_and_recognize(rgb, objects);

    // Build JSON result
    std::ostringstream json;
    json << "[";
    for (size_t i = 0; i < objects.size(); i++) {
        const Object& obj = objects[i];

        // Convert character IDs to text using dictionary
        std::string text;
        for (const auto& ch : obj.text) {
            if (ch.id >= 0 && ch.id < (int)(sizeof(character_dict) / sizeof(character_dict[0]))) {
                text += character_dict[ch.id];
            }
        }

        // Get bounding box
        float cx = obj.rrect.center.x;
        float cy = obj.rrect.center.y;
        float w = obj.rrect.size.width;
        float h = obj.rrect.size.height;

        // Sample background color: edge pixels of bounding rect, majority vote
        int bgR = 255, bgG = 255, bgB = 255;
        {
            int bx = std::max(0, (int)(cx - w/2));
            int by = std::max(0, (int)(cy - h/2));
            int bw = std::min((int)w, (int)info.width - bx);
            int bh = std::min((int)h, (int)info.height - by);
            if (bw > 0 && bh > 0) {
                // Sample corners and edges (quantize to 4-bit per channel)
                std::map<int, int> colorCount;
                int step = std::max(1, std::min(bw, bh) / 4);
                // Top and bottom edges
                for (int x = bx; x < bx + bw; x += step) {
                    for (int dy : {0, bh - 1}) {
                        int sy = by + dy;
                        if (sy >= 0 && sy < (int)info.height && x >= 0 && x < (int)info.width) {
                            cv::Vec4b px = rgbaCopy.at<cv::Vec4b>(sy, x);
                            int key = ((px[0] >> 4) << 8) | ((px[1] >> 4) << 4) | (px[2] >> 4);
                            colorCount[key]++;
                        }
                    }
                }
                // Left and right edges
                for (int y = by; y < by + bh; y += step) {
                    for (int dx : {0, bw - 1}) {
                        int sx = bx + dx;
                        if (y >= 0 && y < (int)info.height && sx >= 0 && sx < (int)info.width) {
                            cv::Vec4b px = rgbaCopy.at<cv::Vec4b>(y, sx);
                            int key = ((px[0] >> 4) << 8) | ((px[1] >> 4) << 4) | (px[2] >> 4);
                            colorCount[key]++;
                        }
                    }
                }
                // Find majority color
                int maxCount = 0, maxKey = 0xFFF;
                for (auto& kv : colorCount) {
                    if (kv.second > maxCount) { maxCount = kv.second; maxKey = kv.first; }
                }
                bgR = ((maxKey >> 8) & 0xF) * 17;
                bgG = ((maxKey >> 4) & 0xF) * 17;
                bgB = (maxKey & 0xF) * 17;
            }
        }

        if (i > 0) json << ",";
        json << "{\"text\":\"" << json_escape(text) << "\""
             << ",\"centerX\":" << (int)cx
             << ",\"centerY\":" << (int)cy
             << ",\"width\":" << (int)w
             << ",\"height\":" << (int)h
             << ",\"prob\":" << obj.prob
             << ",\"bgR\":" << bgR
             << ",\"bgG\":" << bgG
             << ",\"bgB\":" << bgB
             << "}";
    }
    json << "]";

    LOGI("OCR found %zu text regions", objects.size());
    return env->NewStringUTF(json.str().c_str());
}

JNIEXPORT jstring JNICALL
Java_com_agentcab_ocr_NcnnOcrModule_nativeOcrRegion(JNIEnv* env, jobject, jobject bitmap,
    jint x, jint y, jint w, jint h) {
    if (!g_initialized || !g_ppocrv5) {
        return env->NewStringUTF("[]");
    }

    AndroidBitmapInfo info;
    if (AndroidBitmap_getInfo(env, bitmap, &info) != 0) {
        return env->NewStringUTF("[]");
    }

    void* pixels = nullptr;
    if (AndroidBitmap_lockPixels(env, bitmap, &pixels) != 0) {
        return env->NewStringUTF("[]");
    }

    cv::Mat rgba(info.height, info.width, CV_8UC4, pixels);

    // Clamp region
    int sx = std::max(0, std::min(x, (int)info.width - 1));
    int sy = std::max(0, std::min(y, (int)info.height - 1));
    int sw = std::min(w, (int)info.width - sx);
    int sh = std::min(h, (int)info.height - sy);

    cv::Mat region = rgba(cv::Rect(sx, sy, sw, sh));
    cv::Mat rgb;
    cv::cvtColor(region, rgb, cv::COLOR_RGBA2RGB);

    AndroidBitmap_unlockPixels(env, bitmap);

    std::vector<Object> objects;
    g_ppocrv5->detect_and_recognize(rgb, objects);

    // Build JSON (offset coordinates back to original)
    std::ostringstream json;
    json << "[";
    for (size_t i = 0; i < objects.size(); i++) {
        const Object& obj = objects[i];
        std::string text;
        for (const auto& ch : obj.text) {
            if (ch.id >= 0 && ch.id < (int)(sizeof(character_dict) / sizeof(character_dict[0]))) {
                text += character_dict[ch.id];
            }
        }

        float cx = obj.rrect.center.x + sx;
        float cy = obj.rrect.center.y + sy;

        if (i > 0) json << ",";
        json << "{\"text\":\"" << json_escape(text) << "\""
             << ",\"centerX\":" << (int)cx
             << ",\"centerY\":" << (int)cy
             << ",\"width\":" << (int)obj.rrect.size.width
             << ",\"height\":" << (int)obj.rrect.size.height
             << ",\"prob\":" << obj.prob
             << "}";
    }
    json << "]";

    return env->NewStringUTF(json.str().c_str());
}

JNIEXPORT void JNICALL
Java_com_agentcab_ocr_NcnnOcrModule_nativeRelease(JNIEnv*, jobject) {
    if (g_ppocrv5) {
        delete g_ppocrv5;
        g_ppocrv5 = nullptr;
    }
    g_initialized = false;
    LOGI("PP-OCRv5 released");
}

} // extern "C"
