# AgentCab Script Language Specification

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
   NativeModules (Kotlin AccessibilityManager)
       ↓
   Android Accessibility Service
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
if (screen.has("新消息")) {
  click("新消息")
} else if (screen.has("通讯录")) {
  click("通讯录")
} else {
  log("nothing found")
}
```

### while
```javascript
while (screen.has("加载中")) {
  wait(500)
}
```

### for
```javascript
for (let i = 0; i < 5; i += 1) {
  scrollDown()
  wait(500)
}

// for-of arrays
let items = screen.findAll("商品")
for (let item of items) {
  log(item.text)
}
```

### break / continue
```javascript
while (true) {
  if (screen.has("完成")) {
    break
  }
  wait(1000)
}
```

## Functions

```javascript
function sendMessage(contact, msg) {
  click(contact)
  wait(1000)
  type(msg)
  click("发送")
}

sendMessage("妈妈", "今天回家吃饭")
```

### return
```javascript
function findPrice() {
  let text = screen.getText("¥")
  if (text == null) {
    return -1
  }
  return text
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

## Built-in APIs

### Screen Query
```javascript
screen.has(text)                    // → boolean
screen.findText(text)               // → Element | null
screen.findAll(text)                // → Element[]
screen.findId(id)                   // → Element | null
screen.waitFor(text, timeoutMs)     // → boolean (blocks until found or timeout)
screen.waitGone(text, timeoutMs)    // → boolean (blocks until gone or timeout)
screen.getText(near)                // → string | null
screen.dump()                       // → string (full accessibility tree XML)
```

### Element Properties
```javascript
let el = screen.findText("发送")
el.text        // string
el.id          // string
el.className   // string
el.bounds      // {left, top, right, bottom}
el.enabled     // boolean
el.checked     // boolean
el.clickable   // boolean
el.click()     // click this element
el.longPress() // long press
el.setText(s)  // set text
```

### Actions
```javascript
click(text)                         // click by text
clickAt(x, y)                      // click by coordinates
clickIndex(text, n)                 // click nth match
longPress(text)                     // long press by text
type(text)                          // type into focused input
clearText()                         // clear focused input
paste()                             // paste clipboard
```

### Gestures
```javascript
swipe(direction)                    // "up" | "down" | "left" | "right"
swipeAt(x1, y1, x2, y2, durationMs)
scrollDown()
scrollUp()
scrollTo(text)                      // scroll until text found
pinch(direction)                    // "in" | "out"
```

### Navigation
```javascript
back()                              // press back
home()                              // press home
recent()                            // recent apps
```

### App Management
```javascript
launch(packageName)                 // launch app
currentApp()                        // → string (package name)
isRunning(packageName)              // → boolean
```

### System
```javascript
wait(ms)                            // sleep
screenshot()                        // → base64 string (for AI vision)
toast(message)                      // show toast
vibrate(ms)                         // vibrate
getClipboard()                      // → string
setClipboard(text)                  // set clipboard
getTime()                           // → number (timestamp)
log(message)                        // debug log
```

### Notifications
```javascript
getNotifications()                  // → [{title, text, package, time}]
clearNotification(index)            // clear nth notification
```

### Network (for reporting results)
```javascript
http.get(url)                       // → {status, body}
http.post(url, body)                // → {status, body}
```

### Storage (persist data between runs)
```javascript
store.set(key, value)
store.get(key)                      // → any
store.remove(key)
```

## Execution Model

- **Synchronous by default** — each line waits for completion
- **Screen queries are instant** — read current state
- **Actions have implicit waits** — click waits for animation (200ms default)
- **Timeout on all blocking operations** — default 30s, configurable
- **Execution can be cancelled** — user can stop at any time
- **Max execution time** — 5 minutes default, configurable per script
- **Rate limiting** — max 10 actions per second (prevent abuse)

## Safety

- No file system access (except through store API)
- No arbitrary code execution
- No access to other apps' data (only what's on screen)
- All actions can be interrupted by user
- Dangerous actions (uninstall, delete, send SMS) require user confirmation
- Scripts run in isolated scope (no access to app internals)

## Example Scripts

### Auto-reply WeChat
```javascript
function autoReply(keyword, reply) {
  launch("com.tencent.mm")
  wait(2000)

  while (true) {
    if (screen.has(keyword)) {
      click(keyword)
      wait(1000)
      type(reply)
      click("发送")
      wait(500)
      back()
    }
    wait(3000)
  }
}

autoReply("在吗", "稍等，一会儿回复你")
```

### Batch like posts on Xiaohongshu
```javascript
launch("com.xingin.xhs")
wait(3000)

for (let i = 0; i < 20; i += 1) {
  let hearts = screen.findAll("♡")
  for (let heart of hearts) {
    heart.click()
    wait(300)
  }
  scrollDown()
  wait(1000)
}
```

### Monitor price drop
```javascript
function checkPrice(url, target) {
  launch("com.android.browser")
  wait(2000)
  // navigate to URL
  click("地址栏")
  clearText()
  type(url)
  click("前往")
  wait(5000)

  let priceEl = screen.findText("¥")
  if (priceEl != null) {
    let price = priceEl.text
    log("Current price: " + price)
    if (price <= target) {
      toast("降价了！现在 " + price)
      vibrate(1000)
    }
  }
}

checkPrice("https://item.jd.com/123456.html", 299)
```
