# AgentCab Script (ACS) Language Specification

## Overview

A restricted, JavaScript-like scripting language for AI-driven Android automation via Accessibility Services. AI generates scripts, the app interprets and executes them.

## Architecture

```
AI generates script text
       ↓
   Lexer (tokenizer)
       ↓
   Parser → AST
       ↓
   Interpreter (TypeScript, runs in RN JS thread)
       ↓
   NativeModules (Kotlin AccessibilityManager, CvModule, PaddleOcrModule)
       ↓
   Android Accessibility Service + OpenCV + PaddleOCR
```

## Data Types

- `number` — integers and floats
- `string` — double-quoted `"hello"` or single-quoted `'hello'`
- `boolean` — `true`, `false`
- `null` — `null`
- `array` — `[1, 2, 3]`
- `object` — `{key: "value"}`

## Variables

```javascript
let x = 10
let name = "AgentCab"
let items = [1, 2, 3]
```

No `const` (everything is mutable). No `var`.

## Operators

- Arithmetic: `+`, `-`, `*`, `/`, `%`
- Comparison: `==`, `!=`, `>`, `<`, `>=`, `<=`
- Logical: `&&`, `||`, `!`
- String: `+` (concatenation)
- Member: `.` (property access), `[]` (index access)
- Assignment: `=`, `+=`, `-=`

## Control Flow

### if / else
```javascript
if (condition) { ... }
else if (condition) { ... }
else { ... }
```

### while / for / for-of
```javascript
while (condition) { ... }
for (let i = 0; i < 5; i = i + 1) { ... }
for (let item of array) { ... }
```

### break / continue / return
Supported inside loops and functions.

## Functions

```javascript
function name(param1, param2) {
  return value
}
```

## Error Handling

```javascript
try {
  click("不存在的按钮")
} catch (e) {
  log("出错了: " + e)
}
```

---

## Built-in APIs

### Screen Query (OCR-based)
```javascript
screen.has(text)                        // → boolean — text visible on screen?
screen.findText(text)                   // → {text, _center, _bgR, _bgG, _bgB, chars} | null
screen.findAll(text)                    // → [{text, _center, _bgR, _bgG, _bgB, chars}, ...]
screen.findId(id)                       // → Element | null (accessibility tree)
screen.waitFor(text, timeoutMs)         // → boolean — block until text appears
screen.waitGone(text, timeoutMs)        // → boolean — block until text disappears
screen.getText(near)                    // → string | null — get text near keyword
screen.dump()                           // → string — full accessibility tree
screen.findByColor(options)             // → [{text, x, y, bgR, bgG, bgB}, ...] — CV detect + region OCR
```

### OCR
```javascript
ocrRegion(x, y, width, height)          // → [{text, centerX, centerY, chars, _bgR, _bgG, _bgB}, ...]
// chars: [{left, top, right, bottom}, ...] — per-character positions
// _bgR/_bgG/_bgB: background color (quantized /4*4, 64 levels)
```

### Actions
```javascript
click(text)                             // click by text
clickAt(x, y)                           // click by coordinates
clickIndex(text, n)                     // click nth match
longPress(text)                         // long press by text
longPressAt(x, y)                       // long press by coordinates
type(text)                              // type into focused input (auto: ACTION_SET_TEXT → clipboard fallback)
clearText()                             // clear focused input
paste()                                 // paste clipboard content
```

### Gestures
```javascript
swipe(direction)                        // "up" | "down" | "left" | "right"
swipeAt(x1, y1, x2, y2, durationMs)    // custom swipe
scrollDown()
scrollUp()
scrollTo(text)                          // scroll until text found (max 20 scrolls)
pinch(direction)                        // "in" | "out" (TODO)
```

### Wait
```javascript
wait(ms)                                // sleep

waitFor(condition)                      // → {found, text, x, y, node} — wait for element
// condition: {
//   text: "发送",                       // text to find
//   bgColor: {r, g, b, tolerance},     // background color filter (OCR quantized /4*4)
//   region: {x, y, w, h},             // limit search area
//   timeout: 10000                     // ms, default 10000
// }

waitForChange(timeoutMs)                // → boolean — wait for screen change (via SSIM perception)
```

### Navigation
```javascript
back()                                  // press back
home()                                  // press home
recent()                                // recent apps
```

### App Management
```javascript
launch(packageName)                     // launch app
currentApp()                            // → string (current foreground package name)
isRunning(packageName)                  // → boolean (is this package in foreground?)
```

### System
```javascript
wait(ms)                                // sleep
screenshot()                            // → base64 string
toast(message)                          // show toast
vibrate(ms)                             // vibrate
getClipboard()                          // → string
setClipboard(text)                      // set clipboard
getScreenSize()                         // → {width, height}
getTime()                               // → number (timestamp ms)
log(message)                            // debug log (shown in overlay)
setOverlayLogs(enabled)                 // enable/disable overlay log display
```

### Notifications
```javascript
getNotifications()                      // → [{title, text, package, time}]
clearNotification(index)                // clear nth notification
```

### Network
```javascript
http.get(url)                           // → {status, body}
http.post(url, body)                    // → {status, body}
```

### Storage (persist data between runs)
```javascript
store.set(key, value)
store.get(key)                          // → any
store.remove(key)
```

---

## CV (Computer Vision) — `cv.*`

All CV functions use screenshots from the Accessibility Service. Colors are quantized to 64 levels (/4*4).

### Perception Loop
```javascript
cv.startPerception(intervalMs, threshold)   // start background SSIM monitoring
cv.stopPerception()
cv.getState()                               // → {ssim, isStable, hasChanged, changeCount, stableCount, frameCount}
cv.ackChange()                              // reset sticky hasChanged flag
```

### Element Detection
```javascript
cv.detectElements(minAreaRatio, maxResults, dilateSize, cannyLow, cannyHigh)
// → [{x, y, width, height, cx, cy, area, r, g, b, relX, relY, relW, relH,
//     ratio, dominance, colorCount, topColors: [{r, g, b, ratio}, ...], isImage}]
// Canny edge detection → contour → bounding rect → color sampling
// topColors: top 5 colors sorted by frequency (quantized /4*4)

cv.findRects(minArea, maxResults)           // → [{x, y, width, height, ...}]
```

### SSIM
```javascript
cv.ssim()                                   // → number (0-1, similarity to previous frame)
cv.isStable(threshold)                      // → boolean
cv.hasChanged(threshold)                    // → boolean
cv.resetFrame()                             // reset reference frame for next ssim comparison
```

### Template Matching
```javascript
cv.matchTemplate(base64, threshold)         // → {x, y, confidence, found}
cv.matchTemplateMultiScale(base64, threshold) // → {x, y, confidence, found, scale}
cv.matchTemplateAll(base64, threshold, max) // → [{x, y, confidence}, ...]

// Named templates (save/load)
cv.saveTemplate(name, x, y, w, h)          // capture region as named template
cv.matchByName(name, threshold)             // → {x, y, confidence, found}
cv.listTemplates()                          // → [name, ...]
cv.deleteTemplate(name)
```

### Color
```javascript
cv.regionColor(x, y, w, h)                 // → {r, g, b, isGreen, isWhite, isGray}
cv.pixelColor(x, y)                        // → {r, g, b, a}
```

### Motion
```javascript
cv.globalMotion()                           // → {dx, dy, magnitude, scrolling, direction}
cv.trackPoints(points)                      // → [{x, y, found}, ...] — optical flow
cv.diffRegions(threshold, minAreaRatio)     // → [{x, y, width, height, ...}]
```

### Screenshot
```javascript
cv.cropScreenshot(x, y, w, h)              // → base64 string (JPEG)
cv.screenMeta()                             // → {screenWidth, screenHeight, density, densityDpi, statusBarHeight, navBarHeight}
```

### Frame Lock
```javascript
cv.lockFrame()                              // lock current frame for multiple CV operations
cv.unlockFrame()                            // release locked frame
```

### Text Utilities (native, faster than script)
```javascript
cv.editDistance(str1, str2, maxDist)         // → number (Levenshtein distance)
cv.fuzzyMatch(str1, str2, threshold)        // → boolean (editDistance/maxLen <= threshold)
cv.fuzzyFindInList(query, list, threshold)  // → [index, ...] (matching indices)
```

---

## Utilities

```javascript
parseInt(str)                               // string → integer
parseFloat(str)                             // string → float
String(value)                               // → string
Number(value)                               // → number
JSON.parse(str)                             // → object
JSON.stringify(obj)                         // → string
Math.floor(n) / Math.ceil(n) / Math.round(n)
Math.abs(n) / Math.max(a,b) / Math.min(a,b)
Math.random()                               // → 0-1
Date.now()                                  // → timestamp ms
Date.new()                                  // → date string
```

---

## Execution Model

- **Synchronous by default** — each line waits for completion
- **Screen queries are instant** — read current state (OCR cached 500ms)
- **Actions have implicit waits** — click waits for animation
- **Execution can be cancelled** — user can stop at any time
- **Rate limiting** — max 10 actions per second

## Safety

- No file system access (except through store API)
- No arbitrary code execution
- No access to other apps' data (only what's on screen)
- All actions can be interrupted by user
- Scripts run in isolated scope (no access to app internals)
