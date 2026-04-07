# AgentCab CV Scaffolding

手机端通用视觉感知引擎。所有接口只输出客观数据，不做业务判断。

## 设计原则

- **底层只输出事实** — 位置、颜色、相似度、运动矢量。"这是按钮"、"这是消息"之类的判断由脚本层/AI层负责。
- **坐标双输出** — 同时提供绝对像素值（`x`, `y`）和相对比例值（`relX`, `relY`），适配不同分辨率。
- **截图可共享** — `lockFrame()` 锁定后所有 CV 操作共用同一张截图，避免重复截屏。
- **模板可持久化** — 从屏幕裁剪保存模板，后续用名字匹配，跨会话可用。

---

## API 总览

```
cv.
├── 感知循环 ──────── startPerception / stopPerception / getState
├── 变化检测 ──────── ssim / hasChanged / isStable / diffRegions
├── 光流追踪 ──────── globalMotion / trackPoints
├── 元素检测 ──────── detectElements / findRects / regionColor
├── 图像匹配 ──────── matchTemplate / matchTemplateMultiScale / matchTemplateAll / matchByName
├── 模板管理 ──────── saveTemplate / listTemplates / deleteTemplate
├── 像素/颜色 ─────── pixelColor / regionColor
├── 截图 ──────────── cropScreenshot / lockFrame / unlockFrame
├── OCR ───────────── ocrRegion
├── 屏幕元信息 ────── screenMeta
└── 管理 ──────────── resetFrame
```

---

## 1. 感知循环

后台线程持续截图 + SSIM 对比，维护实时状态。脚本读状态（<1ms）替代主动截图（2-3s）。

### `cv.startPerception(intervalMs, stableThreshold)`

启动后台感知循环。

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| intervalMs | number | 500 | 扫描间隔（毫秒） |
| stableThreshold | number | 0.95 | SSIM 高于此值认为屏幕稳定 |

### `cv.stopPerception()`

停止后台感知循环。脚本结束时务必调用。

### `cv.getState()` → object

读取当前感知状态。

```javascript
let state = cv.getState()
// state.ssim          — 最近一次 SSIM 值 (0~1)
// state.isStable      — 屏幕是否稳定
// state.hasChanged    — 屏幕是否有变化
// state.changeCount   — 连续变化帧数
// state.stableCount   — 连续稳定帧数
// state.frameCount    — 总帧数
// state.lastUpdateMs  — 最后更新时间戳
```

**使用示例：**

```javascript
cv.startPerception(500, 0.95)

while (true) {
  wait(500)
  let state = cv.getState()
  if (!state.hasChanged) { continue }
  if (state.stableCount < 3) { continue }  // 等连续稳定3帧
  // 处理变化...
}

cv.stopPerception()
```

---

## 2. 变化检测

### `cv.ssim()` → number

当前帧与上一帧的结构相似度。0 = 完全不同，1 = 完全相同。

### `cv.hasChanged(threshold?)` → boolean

屏幕是否发生变化。`threshold` 默认 0.95。

### `cv.isStable(threshold?)` → boolean

屏幕是否稳定。`threshold` 默认 0.95。

### `cv.diffRegions(threshold?, minAreaRatio?)` → array

找到屏幕上发生变化的**区域**。告诉你"哪里"变了，不只是"是否"变了。

| 参数 | 默认 | 说明 |
|------|------|------|
| threshold | 30 | 像素差异阈值 (0-255) |
| minAreaRatio | 0.005 | 最小区域面积占屏幕比例 |

```javascript
let regions = cv.diffRegions()
// [{x, y, width, height, cx, cy, relX, relY, relW, relH}, ...]
```

**使用示例：**

```javascript
let changed = cv.diffRegions()
if (changed.length > 0) {
  // 只对变化区域做 OCR，而不是全屏
  for (let r of changed) {
    let text = ocrRegion(r.x, r.y, r.width, r.height)
    log("变化区域文字: " + text)
  }
}
```

---

## 3. 光流追踪

### `cv.globalMotion()` → object

检测屏幕整体运动（滚动方向和距离）。

```javascript
let motion = cv.globalMotion()
// motion.dx          — X方向位移（像素）
// motion.dy          — Y方向位移（像素）
// motion.magnitude   — 位移大小
// motion.scrolling   — 是否在滚动 (magnitude > 3)
// motion.direction   — "up" | "down" | "left" | "right" | "none"
```

**使用示例：**

```javascript
scrollDown()
wait(500)
let motion = cv.globalMotion()
log("滚动了 " + Math.round(motion.dy) + " 像素，方向: " + motion.direction)
```

### `cv.trackPoints(points)` → array

追踪指定坐标点在下一帧的位置。使用 Lucas-Kanade 稀疏光流。

```javascript
let results = cv.trackPoints([[100, 200], [300, 400]])
// [{x, y, found, dx, dy}, ...]
// found: 是否成功追踪
// dx, dy: 相对原始位置的位移
```

**使用示例：**

```javascript
// 记录一个按钮的位置
let btnX = 500, btnY = 1800

// 页面滚动后，找到按钮的新位置
scrollDown()
wait(500)
let tracked = cv.trackPoints([[btnX, btnY]])
if (tracked[0].found) {
  clickAt(tracked[0].x, tracked[0].y)  // 点击新位置
}
```

---

## 4. 元素检测

### `cv.detectElements(minAreaRatio?, maxResults?)` → array

用 Canny 边缘检测 + 轮廓分析找屏幕上的矩形区域。

| 参数 | 默认 | 说明 |
|------|------|------|
| minAreaRatio | 0.002 | 最小面积占屏幕比例 |
| maxResults | 30 | 最多返回数量 |

```javascript
let elements = cv.detectElements()
// [{
//   x, y, width, height,  — 绝对坐标
//   cx, cy,               — 中心点
//   area,                 — 面积
//   r, g, b,              — 平均颜色
//   relX, relY, relW, relH, — 相对坐标 (0~1)
//   ratio                 — 宽高比
// }, ...]
```

### `cv.findRects(minArea?, maxResults?)` → array

简化版矩形检测。

### `cv.regionColor(x, y, w, h)` → object

指定区域的平均颜色。

```javascript
let color = cv.regionColor(100, 200, 300, 50)
// color.r, color.g, color.b
// color.isGreen  — g > 180 && g > r
// color.isWhite  — r,g,b 都 > 220
// color.isGray   — r,g,b 在 130-200 且接近
```

---

## 5. 图像匹配

### `cv.matchTemplate(base64, threshold?)` → object

精确尺寸模板匹配。返回最佳匹配位置。

```javascript
let result = cv.matchTemplate(iconBase64, 0.8)
// result.x, result.y     — 匹配中心坐标
// result.confidence       — 匹配度 (0~1)
// result.found            — confidence >= threshold
```

### `cv.matchTemplateMultiScale(base64, threshold?)` → object

多尺度匹配（0.5x ~ 2.0x）。解决不同分辨率设备的匹配问题。

```javascript
let result = cv.matchTemplateMultiScale(iconBase64, 0.7)
// 额外返回 result.scale — 匹配的缩放比例
```

### `cv.matchTemplateAll(base64, threshold?, maxResults?)` → array

找所有匹配位置（非极大值抑制）。

```javascript
let matches = cv.matchTemplateAll(sendBtnBase64, 0.8, 5)
// [{x, y, confidence}, ...]
```

### `cv.matchByName(name, threshold?)` → object

用已保存的模板名匹配，不需要传 base64。

```javascript
let result = cv.matchByName("send_button", 0.8)
if (result.found) { clickAt(result.x, result.y) }
```

---

## 6. 模板管理

### `cv.saveTemplate(name, x, y, w, h)` → boolean

从当前屏幕裁剪区域保存为命名模板。持久化到设备存储，跨会话可用。

```javascript
// 保存微信发送按钮作为模板
cv.saveTemplate("wechat_send", 900, 2100, 120, 80)
```

### `cv.listTemplates()` → string[]

列出所有已保存的模板名。

### `cv.deleteTemplate(name)`

删除指定模板。

**使用示例：**

```javascript
// 首次运行：保存模板
cv.saveTemplate("wechat_send", 900, 2100, 120, 80)
cv.saveTemplate("wechat_plus", 50, 2100, 80, 80)

// 后续运行：用模板匹配
let send = cv.matchByName("wechat_send", 0.8)
if (send.found) { clickAt(send.x, send.y) }
```

---

## 7. 像素/颜色

### `cv.pixelColor(x, y)` → object

获取指定像素的精确颜色。

```javascript
let c = cv.pixelColor(500, 1000)
// c.r, c.g, c.b, c.a
```

---

## 8. 截图

### `cv.cropScreenshot(x, y, w, h)` → string

裁剪屏幕指定区域，返回 base64 JPEG。可传给 Vision API 或作为模板。

### `cv.lockFrame()` → boolean

锁定当前帧。后续所有 CV 操作共用这张截图，直到 `unlockFrame()`。

### `cv.unlockFrame()`

解锁帧。后续 CV 操作恢复实时截图。

**使用示例：**

```javascript
// 一次截图，多次分析
cv.lockFrame()
let elements = cv.detectElements()      // 用锁定帧
let color = cv.regionColor(0, 0, 500, 100) // 同一帧
let rects = cv.findRects(3000, 10)       // 同一帧
cv.unlockFrame()
```

---

## 9. OCR

### `ocrRegion(x, y, w, h)` → array

对屏幕指定矩形区域做 OCR。比全屏 OCR 快得多。

```javascript
let results = ocrRegion(100, 200, 800, 60)
// 返回格式同 screen.findAll("")，但只包含指定区域内的文字
```

**使用示例：**

```javascript
// 先用 CV 找到变化区域，再对该区域做 OCR
let changed = cv.diffRegions()
for (let r of changed) {
  let texts = ocrRegion(r.x, r.y, r.width, r.height)
  // 只识别变化区域，快得多
}
```

---

## 10. 屏幕元信息

### `cv.screenMeta()` → object

获取设备屏幕参数。

```javascript
let meta = cv.screenMeta()
// meta.screenWidth     — 屏幕宽度（像素）
// meta.screenHeight    — 屏幕高度（像素）
// meta.density         — 屏幕密度
// meta.densityDpi      — DPI
// meta.statusBarHeight — 状态栏高度（像素）
// meta.navBarHeight    — 导航栏高度（像素）
```

---

## 11. 管理

### `cv.resetFrame()`

清除所有帧缓存（SSIM/diff/光流）。在切换 App 或页面大幅变化时调用。

---

## 典型使用模式

### 模式 1：持续监控（替代 OCR 轮询）

```javascript
cv.startPerception(500, 0.95)

while (running) {
  wait(300)
  let state = cv.getState()
  
  // 没变化，跳过
  if (!state.hasChanged) { continue }
  
  // 等稳定（对方发完消息）
  if (state.stableCount < 3) { continue }
  
  // 找到变化区域
  let changed = cv.diffRegions()
  
  // 只对变化区域做 OCR
  for (let r of changed) {
    let texts = ocrRegion(r.x, r.y, r.width, r.height)
    // 处理新内容...
  }
}

cv.stopPerception()
```

### 模式 2：一次截图多次分析

```javascript
cv.lockFrame()

let elements = cv.detectElements()
let meta = cv.screenMeta()

for (let el of elements) {
  // 判断是什么：基于颜色、位置、大小
  if (el.relY > 0.85 && el.ratio > 4) {
    // 底部、很宽、很扁 → 可能是输入框
    let text = ocrRegion(el.x, el.y, el.width, el.height)
  }
}

cv.unlockFrame()
```

### 模式 3：模板驱动的自动化

```javascript
// 初始化：保存关键 UI 元素模板
cv.saveTemplate("search_icon", 50, 100, 60, 60)
cv.saveTemplate("send_btn", 950, 2100, 100, 80)

// 使用：不依赖文字，用图像找元素
let search = cv.matchByName("search_icon", 0.75)
if (search.found) {
  clickAt(search.x, search.y)
  wait(1000)
  type("关键词")
  
  let send = cv.matchByName("send_btn", 0.8)
  if (send.found) { clickAt(send.x, send.y) }
}
```

### 模式 4：滚动追踪

```javascript
// 记录一个元素的位置
let targetY = 800

// 滚动
scrollDown()
wait(500)

// 看它移到哪了
let motion = cv.globalMotion()
if (motion.scrolling) {
  targetY = targetY + motion.dy  // 更新位置
  log("元素新位置: y=" + targetY)
}
```

---

## 技术栈

- **OpenCV Android SDK 4.10.0** — SSIM、模板匹配、轮廓检测、光流
- **PaddleOCR** — 中文文字识别（端上推理）
- **Kotlin + JNI** — Native Module 桥接到 React Native
- **后台线程** — 感知循环独立于 JS 线程运行

## 性能参考

| 操作 | 耗时 | 说明 |
|------|------|------|
| SSIM（缩小4x） | ~20ms | 帧对比 |
| 轮廓检测 | ~50ms | 含截图 |
| 模板匹配（单尺度） | ~30ms | 不含截图 |
| 模板匹配（多尺度） | ~150ms | 7个尺度 |
| 光流（Farneback） | ~80ms | 缩小4x |
| 区域 OCR | ~500ms | PaddleOCR |
| 全屏 OCR | ~2000ms | PaddleOCR |
| getState() | <1ms | 读内存变量 |
