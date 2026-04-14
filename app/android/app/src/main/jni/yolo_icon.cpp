// YOLOv8 icon detector (ncnn). Loaded from filesystem path (not assets).
// Multi-model: indexed by name, lazily loaded, cached.

#include <jni.h>
#include <android/bitmap.h>
#include <android/log.h>

#include <map>
#include <mutex>
#include <string>
#include <vector>
#include <fstream>
#include <sstream>
#include <algorithm>
#include <cmath>

#include "net.h"

#define LOG_TAG "YoloIcon"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO,  LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

namespace {

struct Detection {
    int   cls;
    float conf;
    float x;
    float y;
    float w;
    float h;
};

struct Model {
    ncnn::Net net;
    std::vector<std::string> classes;
    int input_size = 640;
};

std::map<std::string, Model*> g_models;
std::mutex g_models_mu;

Model* find_model(const std::string& name) {
    std::lock_guard<std::mutex> lk(g_models_mu);
    auto it = g_models.find(name);
    return it == g_models.end() ? nullptr : it->second;
}

bool load_classes(const std::string& path, std::vector<std::string>& out) {
    std::ifstream f(path);
    if (!f.is_open()) return false;
    std::string line;
    while (std::getline(f, line)) {
        while (!line.empty() && (line.back() == '\r' || line.back() == '\n' || line.back() == ' ')) line.pop_back();
        if (!line.empty()) out.push_back(line);
    }
    return !out.empty();
}

float iou(const Detection& a, const Detection& b) {
    float ax1 = a.x, ay1 = a.y, ax2 = a.x + a.w, ay2 = a.y + a.h;
    float bx1 = b.x, by1 = b.y, bx2 = b.x + b.w, by2 = b.y + b.h;
    float ix1 = std::max(ax1, bx1), iy1 = std::max(ay1, by1);
    float ix2 = std::min(ax2, bx2), iy2 = std::min(ay2, by2);
    float iw = std::max(0.f, ix2 - ix1), ih = std::max(0.f, iy2 - iy1);
    float inter = iw * ih;
    float uni = a.w * a.h + b.w * b.h - inter;
    return uni > 0 ? inter / uni : 0.f;
}

void nms(std::vector<Detection>& dets, float iou_thr) {
    std::sort(dets.begin(), dets.end(), [](const Detection& a, const Detection& b) { return a.conf > b.conf; });
    std::vector<bool> removed(dets.size(), false);
    for (size_t i = 0; i < dets.size(); ++i) {
        if (removed[i]) continue;
        for (size_t j = i + 1; j < dets.size(); ++j) {
            if (removed[j]) continue;
            if (dets[i].cls == dets[j].cls && iou(dets[i], dets[j]) > iou_thr) removed[j] = true;
        }
    }
    std::vector<Detection> kept;
    for (size_t i = 0; i < dets.size(); ++i) if (!removed[i]) kept.push_back(dets[i]);
    dets.swap(kept);
}

// Letterbox: scale + pad to (target, target). Returns scale and pad offsets.
ncnn::Mat letterbox_from_bitmap(JNIEnv* env, jobject bitmap, int target,
                                float& scale_out, int& pad_x_out, int& pad_y_out,
                                int& src_w_out, int& src_h_out) {
    AndroidBitmapInfo info;
    if (AndroidBitmap_getInfo(env, bitmap, &info) < 0) return ncnn::Mat();
    if (info.format != ANDROID_BITMAP_FORMAT_RGBA_8888) {
        LOGE("bitmap format not RGBA_8888: %d", info.format);
        return ncnn::Mat();
    }
    src_w_out = info.width;
    src_h_out = info.height;

    float r = std::min((float)target / info.width, (float)target / info.height);
    int new_w = (int)std::round(info.width * r);
    int new_h = (int)std::round(info.height * r);
    int pad_x = (target - new_w) / 2;
    int pad_y = (target - new_h) / 2;
    scale_out = r;
    pad_x_out = pad_x;
    pad_y_out = pad_y;

    ncnn::Mat in = ncnn::Mat::from_android_bitmap_resize(env, bitmap, ncnn::Mat::PIXEL_RGBA2RGB, new_w, new_h);
    ncnn::Mat padded;
    ncnn::copy_make_border(in, padded, pad_y, target - new_h - pad_y, pad_x, target - new_w - pad_x,
                           ncnn::BORDER_CONSTANT, 114.f);
    const float norm[3] = { 1.f / 255.f, 1.f / 255.f, 1.f / 255.f };
    padded.substract_mean_normalize(nullptr, norm);
    return padded;
}

std::string detections_to_json(const std::vector<Detection>& dets, const std::vector<std::string>& classes) {
    std::ostringstream oss;
    oss << "[";
    for (size_t i = 0; i < dets.size(); ++i) {
        if (i) oss << ",";
        const Detection& d = dets[i];
        std::string name = (d.cls >= 0 && d.cls < (int)classes.size()) ? classes[d.cls] : "unknown";
        oss << "{\"cls\":\"" << name << "\","
            << "\"clsId\":" << d.cls << ","
            << "\"conf\":" << d.conf << ","
            << "\"x\":" << (int)d.x << ","
            << "\"y\":" << (int)d.y << ","
            << "\"w\":" << (int)d.w << ","
            << "\"h\":" << (int)d.h << ","
            << "\"cx\":" << (int)(d.x + d.w / 2) << ","
            << "\"cy\":" << (int)(d.y + d.h / 2) << "}";
    }
    oss << "]";
    return oss.str();
}

} // namespace

extern "C" {

JNIEXPORT jboolean JNICALL
Java_com_agentcab_cv_YoloIconJNI_nativeLoad(JNIEnv* env, jclass,
                                            jstring jname, jstring jdir) {
    const char* cname = env->GetStringUTFChars(jname, nullptr);
    const char* cdir  = env->GetStringUTFChars(jdir,  nullptr);
    std::string name(cname), dir(cdir);
    env->ReleaseStringUTFChars(jname, cname);
    env->ReleaseStringUTFChars(jdir,  cdir);

    {
        std::lock_guard<std::mutex> lk(g_models_mu);
        auto it = g_models.find(name);
        if (it != g_models.end()) {
            // Already loaded
            return JNI_TRUE;
        }
    }

    auto* m = new Model();
    m->net.opt.num_threads = 4;
    m->net.opt.use_packing_layout = true;
    m->net.opt.use_fp16_packed = true;
    m->net.opt.use_fp16_storage = true;

    std::string param_path = dir + "/model.ncnn.param";
    std::string bin_path   = dir + "/model.ncnn.bin";
    std::string cls_path   = dir + "/classes.txt";

    if (m->net.load_param(param_path.c_str()) != 0) {
        LOGE("load_param failed: %s", param_path.c_str());
        delete m; return JNI_FALSE;
    }
    if (m->net.load_model(bin_path.c_str()) != 0) {
        LOGE("load_model failed: %s", bin_path.c_str());
        delete m; return JNI_FALSE;
    }
    if (!load_classes(cls_path, m->classes)) {
        LOGE("load_classes failed: %s", cls_path.c_str());
        delete m; return JNI_FALSE;
    }
    LOGI("loaded model %s with %zu classes", name.c_str(), m->classes.size());

    {
        std::lock_guard<std::mutex> lk(g_models_mu);
        g_models[name] = m;
    }
    return JNI_TRUE;
}

JNIEXPORT jstring JNICALL
Java_com_agentcab_cv_YoloIconJNI_nativeDetect(JNIEnv* env, jclass,
                                              jstring jname, jobject bitmap,
                                              jfloat conf_thr, jfloat iou_thr) {
    const char* cname = env->GetStringUTFChars(jname, nullptr);
    std::string name(cname);
    env->ReleaseStringUTFChars(jname, cname);

    Model* m = find_model(name);
    if (!m) return env->NewStringUTF("[]");

    float scale; int pad_x, pad_y, src_w, src_h;
    ncnn::Mat in = letterbox_from_bitmap(env, bitmap, m->input_size, scale, pad_x, pad_y, src_w, src_h);
    if (in.empty()) return env->NewStringUTF("[]");

    ncnn::Extractor ex = m->net.create_extractor();
    ex.input("in0", in);
    ncnn::Mat out;
    if (ex.extract("out0", out) != 0) {
        LOGE("extract out0 failed");
        return env->NewStringUTF("[]");
    }
    // out shape: [4 + nc, 8400] (channels, w)
    int nc = out.h - 4;
    int na = out.w;
    if (nc <= 0 || na <= 0) {
        LOGE("unexpected out shape h=%d w=%d", out.h, out.w);
        return env->NewStringUTF("[]");
    }

    std::vector<Detection> dets;
    dets.reserve(64);
    const float* px = out.row(0);
    const float* py = out.row(1);
    const float* pw = out.row(2);
    const float* ph = out.row(3);

    for (int i = 0; i < na; ++i) {
        int   best_c = -1;
        float best_s = conf_thr;
        for (int c = 0; c < nc; ++c) {
            float s = out.row(4 + c)[i];
            if (s > best_s) { best_s = s; best_c = c; }
        }
        if (best_c < 0) continue;

        // YOLOv8 ultralytics ncnn export: bbox in [0..640] cxcywh space (input space)
        float cx = px[i];
        float cy = py[i];
        float bw = pw[i];
        float bh = ph[i];

        // Reverse letterbox -> original image coordinates
        float x = (cx - bw / 2 - pad_x) / scale;
        float y = (cy - bh / 2 - pad_y) / scale;
        float w = bw / scale;
        float h = bh / scale;
        if (x < 0) { w += x; x = 0; }
        if (y < 0) { h += y; y = 0; }
        if (x + w > src_w) w = src_w - x;
        if (y + h > src_h) h = src_h - y;
        if (w <= 1 || h <= 1) continue;

        Detection d{ best_c, best_s, x, y, w, h };
        dets.push_back(d);
    }

    nms(dets, iou_thr);

    std::string json = detections_to_json(dets, m->classes);
    return env->NewStringUTF(json.c_str());
}

JNIEXPORT void JNICALL
Java_com_agentcab_cv_YoloIconJNI_nativeRelease(JNIEnv* env, jclass, jstring jname) {
    const char* cname = env->GetStringUTFChars(jname, nullptr);
    std::string name(cname);
    env->ReleaseStringUTFChars(jname, cname);
    std::lock_guard<std::mutex> lk(g_models_mu);
    auto it = g_models.find(name);
    if (it != g_models.end()) {
        delete it->second;
        g_models.erase(it);
    }
}

} // extern "C"
