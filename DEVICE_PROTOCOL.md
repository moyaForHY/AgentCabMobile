# AgentCab Device Protocol

API 通过 `input_schema` 和 `output` 中的约定格式，与 App 端的设备能力交互。

---

## 一、Input Formats（自动采集）

在 skill 的 `input_schema.properties` 中，字段的 `format` 值决定 App 如何采集数据。

### 文件类（用户手动选择）

| format | 行为 | 数据类型 |
|--------|------|----------|
| `image` | 弹出相册选择器 | file_id (上传后) |
| `video` | 弹出视频选择器 | file_id |
| `audio` | 弹出音频文件选择器 | file_id |
| `file` | 弹出系统文件选择器 | file_id |
| `camera` | 打开相机拍照 | file_id |
| `record_audio` | 开始录音，停止后上传 | file_id |

### 设备数据类（自动采集，无需用户操作）

| format | 行为 | 数据类型 |
|--------|------|----------|
| `device:photos` | 扫描相册，提取元数据 | `[{name, dateAdded, size, width, height, path, bucket}]` |
| `device:photos_recent` | 最近 7 天的照片 | 同上 |
| `device:photo_hashes` | 计算照片 pHash（用于去重） | `{uri: hash}` |
| `device:calendar` | 读取日历事件（默认未来 30 天） | `[{id, title, startTime, endTime, location, allDay}]` |
| `device:calendar_week` | 本周日历事件 | 同上 |
| `device:contacts` | 读取通讯录 | `[{id, name, phoneNumbers, emails}]` |
| `device:call_log` | 通话记录 | `[{name, number, type, date, duration}]` |
| `device:sms` | 短信内容 | `[{address, body, date, type}]` |
| `device:apps` | 已安装的非系统 App | `[{packageName, name}]` |
| `device:storage` | 存储统计 | `{totalBytes, freeBytes, usedBytes, *Formatted}` |
| `device:files` | 扫描指定目录的文件列表 | `[{name, path, isDirectory, size, lastModified, extension}]` |
| `device:files_downloads` | Downloads 目录文件 | 同上 |
| `device:files_documents` | Documents 目录文件 | 同上 |
| `device:location` | 当前 GPS 坐标 | `{latitude, longitude, accuracy}` |
| `device:clipboard` | 读取剪贴板内容 | `string` |
| `device:screenshot` | 截取当前屏幕 | file_id (上传后) |
| `device:screen_content` | 无障碍读取屏幕文本 | `[{text, className, isClickable, isEditable, depth}]` |
| `device:battery` | 电量和充电状态 | `{level, isCharging}` |
| `device:wifi` | 当前网络信息 | `{ssid, ip}` |
| `device:device_info` | 设备信息 | `{model, brand, osVersion, sdkVersion, screenWidth, screenHeight}` |
| `device:notifications` | 通知栏历史 | `[{packageName, title, text, time}]` |
| `device:media_playing` | 当前播放媒体 | `{title, artist, packageName}` |

### 参数修饰（可选，放在 `x-device-options` 中）

```json
{
  "format": "device:photos",
  "x-device-options": {
    "days": 7,
    "limit": 100,
    "include_hashes": true
  }
}
```

```json
{
  "format": "device:files",
  "x-device-options": {
    "directory": "downloads",
    "recursive": true
  }
}
```

```json
{
  "format": "device:calendar",
  "x-device-options": {
    "range_days": 30,
    "direction": "past"
  }
}
```

```json
{
  "format": "device:call_log",
  "x-device-options": {
    "days": 7,
    "limit": 50
  }
}
```

---

## 二、Output Actions（自动执行）

API 返回的 `output` 中如果包含 `actions` 数组，App 会逐条执行。

### 文件操作

| type | 参数 | 行为 | 需确认 |
|------|------|------|--------|
| `delete_file` | `path` | 删除文件 | ✅ |
| `delete_files` | `paths: string[]` | 批量删除 | ✅ |
| `move_file` | `source, dest` | 移动文件 | ✅ |
| `copy_file` | `source, dest` | 复制文件 | ❌ |
| `create_directory` | `path` | 创建目录 | ❌ |
| `write_file` | `path, content` | 写入文本文件 | ❌ |
| `download_file` | `url, filename, mimeType?` | 下载到手机 | ❌ |

### 日历

| type | 参数 | 行为 | 需确认 |
|------|------|------|--------|
| `create_event` | `calendarId, title, startTime, endTime, description?, location?` | 创建日程 | ❌ |
| `delete_event` | `eventId` | 删除日程 | ✅ |
| `set_alarm` | `hour, minute, message?` | 设置闹钟 | ❌ |

### 通讯

| type | 参数 | 行为 | 需确认 |
|------|------|------|--------|
| `send_sms` | `number, text` | 发送短信 | ✅ |
| `make_call` | `number` | 拨打电话 | ✅ |

### 分享与剪贴板

| type | 参数 | 行为 | 需确认 |
|------|------|------|--------|
| `share_text` | `text, title?` | 弹出分享面板 | ❌ |
| `share_file` | `url, filename, mimeType` | 分享文件 | ❌ |
| `copy_clipboard` | `text` | 复制到剪贴板 | ❌ |
| `open_url` | `url` | 在浏览器打开链接 | ❌ |

### 通知

| type | 参数 | 行为 | 需确认 |
|------|------|------|--------|
| `notify` | `title, body` | 发送本地通知 | ❌ |

### App 操作

| type | 参数 | 行为 | 需确认 |
|------|------|------|--------|
| `launch_app` | `packageName` | 打开 App | ❌ |
| `uninstall_app` | `packageName` | 卸载 App | ✅ |
| `open_deeplink` | `uri` | 打开 App 特定页面 | ❌ |
| `set_wallpaper` | `url` 或 `path` | 设置壁纸 | ✅ |

### 无障碍操作（需用户开启无障碍服务）

| type | 参数 | 行为 | 需确认 |
|------|------|------|--------|
| `click_text` | `text` | 点击包含该文字的元素 | ✅ |
| `set_text` | `targetText, newText` | 找到文本框并填入内容 | ✅ |
| `long_press` | `text` | 长按包含该文字的元素 | ✅ |
| `scroll` | `direction: up/down/left/right, amount?` | 滚动屏幕 | ❌ |
| `swipe` | `startX, startY, endX, endY, duration?` | 滑动手势 | ❌ |
| `press_back` | - | 按返回键 | ❌ |
| `press_home` | - | 按 Home 键 | ❌ |
| `open_notifications` | - | 下拉通知栏 | ❌ |

### 复合操作

| type | 参数 | 行为 | 需确认 |
|------|------|------|--------|
| `confirm_actions` | `message, actions: Action[]` | 弹窗确认后批量执行 | ✅ |
| `sequence` | `actions: Action[], delay_ms?` | 按顺序执行，可设间隔 | ❌ |

---

## 三、权限策略

- 所有 `device:*` 数据采集在首次使用时请求对应权限
- 用户拒绝权限时，该字段发送 `null`，不阻断调用
- 需确认（✅）的 action：App 弹窗显示操作内容，用户确认后执行
- 无障碍操作：额外检查无障碍服务是否开启，未开启则提示跳转设置
- `send_sms`、`make_call`：跳转系统界面，由用户最终确认

---

## 四、权限映射

| 能力 | Android 权限 |
|------|-------------|
| `device:photos` | `READ_MEDIA_IMAGES` |
| `device:calendar` | `READ_CALENDAR`, `WRITE_CALENDAR` |
| `device:contacts` | `READ_CONTACTS` |
| `device:call_log` | `READ_CALL_LOG` |
| `device:sms` | `READ_SMS` |
| `device:location` | `ACCESS_FINE_LOCATION` |
| `device:files` | `MANAGE_EXTERNAL_STORAGE` |
| `device:screen_content` | 无障碍服务 |
| `record_audio` | `RECORD_AUDIO` |
| `camera` | `CAMERA` |
| `send_sms` | `SEND_SMS` |
| `make_call` | `CALL_PHONE` |
| `device:notifications` | `BIND_NOTIFICATION_LISTENER_SERVICE` |

---

## 五、示例：AI 生活周报

```json
{
  "input_schema": {
    "type": "object",
    "properties": {
      "photos": {
        "type": "array",
        "format": "device:photos_recent",
        "title": "Recent Photos"
      },
      "calendar": {
        "type": "array",
        "format": "device:calendar_week",
        "title": "This Week Events"
      },
      "contacts": {
        "type": "array",
        "format": "device:contacts",
        "title": "Contacts"
      },
      "location": {
        "type": "object",
        "format": "device:location",
        "title": "Current Location"
      },
      "call_log": {
        "type": "array",
        "format": "device:call_log",
        "title": "Recent Calls",
        "x-device-options": { "days": 7 }
      },
      "device": {
        "type": "object",
        "format": "device:device_info",
        "title": "Device Info"
      }
    },
    "required": ["photos", "calendar"]
  }
}
```

Worker 收到数据后用 Claude 分析，返回：

```json
{
  "report": "# 你的一周\n\n## 📍 去过的地方\n...",
  "highlights": ["连续3天加班到10点", "本周去了4次咖啡厅"],
  "actions": [
    { "type": "copy_clipboard", "text": "我的AI生活周报..." },
    { "type": "share_text", "text": "我的AI生活周报...", "title": "AI Life Weekly" }
  ]
}
```

---

## 六、示例：手机瘦身教练

```json
{
  "input_schema": {
    "type": "object",
    "properties": {
      "storage": {
        "type": "object",
        "format": "device:storage",
        "title": "Storage Stats"
      },
      "photo_hashes": {
        "type": "object",
        "format": "device:photo_hashes",
        "title": "Photo Hashes",
        "x-device-options": { "limit": 500 }
      },
      "downloads": {
        "type": "array",
        "format": "device:files_downloads",
        "title": "Downloads"
      },
      "documents": {
        "type": "array",
        "format": "device:files_documents",
        "title": "Documents"
      },
      "apps": {
        "type": "array",
        "format": "device:apps",
        "title": "Installed Apps"
      },
      "battery": {
        "type": "object",
        "format": "device:battery",
        "title": "Battery"
      }
    },
    "required": ["storage", "downloads"]
  }
}
```

返回：

```json
{
  "summary": "你的手机可以释放 3.2GB 空间",
  "sections": [
    {
      "title": "重复照片",
      "description": "发现 23 组重复照片",
      "saveable_mb": 450
    },
    {
      "title": "大文件",
      "description": "Downloads 中有 5 个超过 100MB 的文件",
      "saveable_mb": 1200
    }
  ],
  "actions": [
    {
      "type": "confirm_actions",
      "message": "删除 23 张重复照片？(释放 450MB)",
      "actions": [
        { "type": "delete_file", "path": "/storage/.../IMG_001.jpg" },
        { "type": "delete_file", "path": "/storage/.../IMG_002.jpg" }
      ]
    },
    {
      "type": "confirm_actions",
      "message": "删除 Downloads 中的 5 个大文件？(释放 1.2GB)",
      "actions": [
        { "type": "delete_file", "path": "/storage/.../big_video.mp4" },
        { "type": "delete_file", "path": "/storage/.../old_backup.zip" }
      ]
    },
    { "type": "notify", "title": "瘦身完成", "body": "已释放 3.2GB 空间" }
  ]
}
```
