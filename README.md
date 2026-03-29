# AgentCab Mobile

Android client for [AgentCab](https://www.agentcab.ai) — the AI API marketplace. Browse, call, and manage AI APIs directly from your phone, with deep device integration.

## What is this?

AgentCab Mobile turns your Android phone into an AI-powered tool. APIs on the AgentCab marketplace can access your phone's capabilities (photos, contacts, files, location, etc.) through a standardized [Device Protocol](DEVICE_PROTOCOL.md), and execute actions on your device (delete files, create calendar events, share content, etc.).

**Example use cases:**
- 📸 **AI Life Weekly Report** — Scans your recent photos, calendar, call log → generates a personalized weekly summary
- 🧹 **Phone Slim Coach** — Detects duplicate photos, large files, app caches → one-tap cleanup
- 🎬 **Seedance Video** — Select a photo → AI generates a video
- Any API on the marketplace that uses the Device Protocol

## Features

- **4 tabs**: Home / APIs / Tasks / Me
- **API marketplace**: Browse, search, filter AI APIs
- **Dynamic forms**: Auto-generated input UI from any API's `input_schema`
- **Device data collection**: 24 auto-collect formats (photos, calendar, contacts, GPS, storage, etc.)
- **Action execution**: 28 executable action types (delete files, share, notify, accessibility, etc.)
- **File management**: Download, open, share API output files
- **Wallet**: Alipay recharge, balance tracking
- **Bilingual**: Chinese/English with auto-detection
- **Security**: Actions only executable from official/private APIs

## Device Protocol

The core innovation. See [DEVICE_PROTOCOL.md](DEVICE_PROTOCOL.md) for the full spec.

**Input** — APIs declare what device data they need via `format` in `input_schema`:
```json
{
  "photos": { "type": "array", "format": "device:photos_recent" },
  "location": { "type": "object", "format": "device:location" },
  "storage": { "type": "object", "format": "device:storage" }
}
```
The app auto-collects this data with user consent.

**Output** — APIs return structured actions the app can execute:
```json
{
  "actions": [
    { "type": "delete_file", "path": "/storage/.../duplicate.jpg" },
    { "type": "notify", "title": "Done", "body": "Freed 2GB" },
    { "type": "share_text", "text": "My AI weekly report..." }
  ]
}
```

## Tech Stack

- **React Native 0.84** (New Architecture)
- **Kotlin** native modules (12 modules for device capabilities)
- **TypeScript** for all app logic
- **AsyncStorage** for caching
- **Keychain** for secure token storage

### Native Modules (Kotlin)

| Module | Capabilities |
|--------|-------------|
| PhotoScanner | MediaStore scan, thumbnails, pHash dedup, batch delete |
| FileSystem | List, search, move, copy, delete, read/write files |
| StorageScanner | Directory sizes, app caches, social app storage, burst detection |
| Contacts | Read, search contacts |
| Calendar | Read/write events |
| AppList | Installed apps, launch apps |
| AudioRecorder | Start/stop recording |
| Screenshot | Capture screen |
| Notifications | Local push notifications |
| Accessibility | Read screen, click, type, scroll, swipe, navigate |
| DeviceInfo | Battery, location, WiFi, device info |

## Getting Started

### Prerequisites

- Node.js 18+
- Java 17 (OpenJDK)
- Android SDK (platform 35, build-tools 35)
- Android device or emulator

### Setup

```bash
cd app
npm install

# Set environment variables
export JAVA_HOME="/path/to/java17"
export ANDROID_HOME="$HOME/Library/Android/sdk"

# Run on device
npx react-native run-android
```

### Build Release APK

```bash
cd app/android
./gradlew assembleRelease
# Output: app/android/app/build/outputs/apk/release/app-release.apk
```

## Project Structure

```
app/
├── src/
│   ├── screens/          # Home, APIs, Tasks, Me, Login, etc.
│   ├── services/         # API client, device capabilities, action executor
│   ├── components/       # DynamicForm, DownloadButton, Logo3D, etc.
│   ├── hooks/            # useAuth, useCachedData, useTasks
│   ├── i18n/             # Chinese/English translations
│   └── navigation/       # Tab + stack navigation
├── android/
│   └── app/src/main/java/com/agentcab/
│       ├── photos/       # PhotoScannerModule
│       ├── filesystem/   # FileSystemModule
│       ├── storage/      # StorageScannerModule
│       ├── contacts/     # ContactsModule
│       ├── calendar/     # CalendarModule
│       ├── accessibility/# AccessibilityService + Module
│       ├── deviceinfo/   # DeviceInfoModule
│       ├── applist/      # AppListModule
│       ├── recorder/     # AudioRecorderModule
│       ├── screenshot/   # ScreenshotModule
│       └── notification/ # NotificationModule
├── DEVICE_PROTOCOL.md    # Device Protocol specification
└── PRODUCT_PLAN.md       # Product roadmap
```

## Contributing

Contributions welcome! Areas that need help:

- **iOS support** — The Device Protocol is platform-agnostic, iOS implementation needed
- **More ROM compatibility** — Testing on Huawei/EMUI, vivo/OriginOS, OPPO/ColorOS
- **New device capabilities** — SMS reading, call log, notification history
- **UI/UX improvements** — Better task result rendering, Markdown preview

## License

MIT

## Links

- **Website**: [agentcab.ai](https://www.agentcab.ai)
- **Device Protocol Docs**: [agentcab.ai/device-protocol](https://www.agentcab.ai/device-protocol)
- **Download APK**: [agentcab.ai/AgentCab.apk](https://www.agentcab.ai/AgentCab.apk)
