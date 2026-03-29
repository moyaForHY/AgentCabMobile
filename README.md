# AgentCab Mobile

**OpenClaw controls your computer. AgentCab Mobile controls your phone.**

[OpenClaw](https://github.com/anthropics/claude-code) lets AI read your files, run commands, and build software on your desktop. AgentCab Mobile does the same thing — but for your Android phone. AI APIs can scan your photos, read your calendar, manage your files, and even operate other apps on your behalf.

[Download APK](https://www.agentcab.ai/AgentCab.apk) · [Website](https://www.agentcab.ai) · [Device Protocol Docs](https://www.agentcab.ai/device-protocol)

---

## How it works

```
You: "帮我整理手机"

AgentCab Mobile:
  1. Scans 500 photos → finds 72 duplicates
  2. Checks Downloads → finds 5 large unused files
  3. Reads WeChat cache → 2.2GB
  4. Returns: "可以释放 3.2GB" + one-tap cleanup actions

You: tap "Execute"
  → 72 duplicate photos deleted
  → 5 files cleaned
  → notification: "已释放 3.2GB"
```

The AI doesn't just analyze — it **acts**. Delete files, create calendar events, share content, launch apps, even click buttons in other apps via accessibility.

## OpenClaw vs AgentCab Mobile

| | OpenClaw (Desktop) | AgentCab Mobile (Phone) |
|---|---|---|
| **Platform** | macOS / Linux / Windows | Android |
| **AI Access** | Files, terminal, code | Photos, contacts, calendar, GPS, apps, screen |
| **Actions** | Read/write files, run commands | Delete files, share, notify, control other apps |
| **Interface** | CLI terminal | Native app with UI |
| **APIs** | Claude API directly | AgentCab marketplace (any AI provider) |
| **Protocol** | Tool use spec | [Device Protocol](DEVICE_PROTOCOL.md) |

## What AI APIs can do with your phone

### 📥 Collect (24 formats)

```
device:photos          → Scan photo library
device:calendar        → Read calendar events
device:contacts        → Read contacts
device:location        → GPS coordinates
device:storage         → Storage stats
device:files_downloads → List Downloads folder
device:apps            → List installed apps
device:screenshot      → Capture screen
device:screen_content  → Read screen text (accessibility)
device:social_storage  → WeChat/QQ/Douyin cache sizes
device:photo_hashes    → Perceptual hashes for dedup
device:photo_bursts    → Detect burst photos
...and 12 more
```

### 📤 Execute (28 actions)

```
delete_file       → Delete a file (with confirmation)
create_event      → Add calendar event
share_text        → Share to WeChat/WhatsApp/etc.
copy_clipboard    → Copy to clipboard
notify            → Push notification
launch_app        → Open another app
click_text        → Click UI element (accessibility)
set_text          → Type into text field
scroll / swipe    → Gesture control
download_file     → Save file to device
confirm_actions   → Batch operations with user approval
...and 17 more
```

### 🔒 Security

- Only **official** and **private** APIs can execute actions
- Destructive actions require **user confirmation**
- Device data collected only when user **taps "Collect"**
- Permission denied → empty data, never blocks

## Built-in AI APIs

| API | What it does |
|-----|-------------|
| **AI Life Weekly** | Scans photos + calendar + calls → generates a personalized weekly report with infographic |
| **Phone Slim Coach** | Finds duplicate photos, large files, app caches → one-tap cleanup plan |
| **Seedance Video** | Photo → AI-generated video |

Build your own: any API on [agentcab.ai](https://www.agentcab.ai) that uses the [Device Protocol](DEVICE_PROTOCOL.md) works automatically.

## Tech

- **React Native 0.84** (New Architecture / Fabric)
- **12 Kotlin native modules** for device access
- **TypeScript** app logic
- **Bilingual** Chinese / English

### Native Modules

```
PhotoScanner    → MediaStore, thumbnails, pHash, batch delete
FileSystem      → CRUD files, search, storage stats
StorageScanner  → Dir sizes, app caches, social storage, burst detect
Contacts        → Read/search
Calendar        → Read/write events
AppList         → List/launch apps
AudioRecorder   → Record audio
Screenshot      → Capture screen
Notifications   → Local push
Accessibility   → Read screen, click, type, scroll, swipe
DeviceInfo      → Battery, GPS, WiFi, device info
```

## Quick Start

```bash
# Prerequisites: Node 18+, Java 17, Android SDK 35

cd app && npm install

export JAVA_HOME="/path/to/java17"
export ANDROID_HOME="$HOME/Library/Android/sdk"

# Run on connected device
npx react-native run-android

# Build release
cd android && ./gradlew assembleRelease
```

## Contributing

Want to help? Here's what we need:

- 🍎 **iOS version** — Device Protocol is platform-agnostic, needs Swift implementation
- 📱 **ROM testing** — Huawei/EMUI, vivo/OriginOS, OPPO/ColorOS, Samsung/OneUI
- 🔌 **New capabilities** — SMS, call log, notification history, NFC
- 🎨 **UI polish** — Markdown rendering, image preview, task result cards

## License

MIT
