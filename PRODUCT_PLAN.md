# AgentCab Android AI Agent App — 产品与技术规划

## Context

AgentCab 当前是 Web 端 AI API 市场，面向开发者。但核心问题是：有电脑的用户自己能用 AI 工具，不需要 AgentCab。真正需要一个平台帮他们调用 AI 能力的，是**移动端的普通用户**。

Android 比 iOS 更适合：权限开放，可 APK 直接分发，不受应用商店审核限制，全球 Android 用户基数大。

**关键决策：**
- **目标市场：** 中国市场优先（手机号登录、微信/支付宝充值、中文 UI 为主）
- **交互方式：** 调用 LLM 做自然语言意图识别（更智能，用户体验更好）
- **团队：** 一个人全栈开发，Claude Code 辅助

**目标：** 做一个 Android AI 管家 App，通过手机权限（照片、文件、日历等）+ AgentCab 后端 API + LLM 意图识别，让普通用户用自然语言指挥 AI 完成手机上的各种任务。

---

## 技术栈

**React Native + Kotlin Native Modules**

- React Native：团队熟悉 React/TypeScript 生态，现有 `api.ts` 可直接复用
- Kotlin Native Modules：照片扫描（MediaStore）、文件管理、无障碍服务等系统级能力用 Kotlin 写，桥接到 TypeScript
- 存储：`react-native-keychain`（凭证）、`react-native-mmkv`（本地缓存）
- 网络：复用现有 AgentCab REST API，零后端改动

---

## 架构

```
┌─────────────────────────────────────────┐
│  React Native UI Layer                  │
│  (Chat 界面 / 照片浏览 / 任务进度)       │
├─────────────────────────────────────────┤
│  Agent Orchestrator (TypeScript)        │
│  自然语言 → 解析意图 → 选择技能 → 执行   │
├──────────────┬──────────────────────────┤
│  Local Engine│  AgentCab Cloud API      │
│  (Kotlin)    │  (现有后端，零改动)        │
│  - 照片扫描  │  - POST /v1/skills/call  │
│  - 元数据提取│  - POST /v1/files/upload │
│  - 本地执行  │  - GET /v1/calls/{id}    │
│  - 去重检测  │  - Wallet/Credits        │
└──────────────┴──────────────────────────┘
```

**核心流程：**
1. 用户说 "帮我整理照片" 或 "用这张图生成视频"
2. Agent Orchestrator 解析意图，决定用哪个技能
3. 本地引擎提取元数据/缩略图（不上传原图）
4. 需要 AI 处理时，调用 AgentCab API
5. 结果返回后，本地引擎执行（创建相册、保存视频等）

---

## MVP 范围（第一版只做两个功能）

### 功能 1：AI 照片助手
- 扫描相册，本地提取元数据（日期、位置、EXIF）
- 生成缩略图发送到 AI 分类 API
- 自动分类：旅行/美食/工作/人物/截图/垃圾
- 去重检测（本地哈希比对）
- 一键整理（创建相册/删除垃圾）

### 功能 2：Seedance 2.0 视频生成
- 从相册选一张图
- 设置参数（时长、比例、提示词）
- 调用已有的 Seedance 2.0 API（skill_id: f35ccd53）
- 视频生成后保存到相册
- 动态定价：调用前显示预估费用

---

## 权限策略（渐进式）

| 阶段 | 权限 | 触发时机 |
|------|------|----------|
| MVP | READ_MEDIA_IMAGES | 首次使用照片功能时 |
| MVP | INTERNET | 默认 |
| Phase 2 | WRITE_MEDIA_IMAGES | 用户确认整理方案时 |
| Phase 2 | READ_MEDIA_VIDEO, READ_MEDIA_AUDIO | 添加视频/音频管理时 |
| Phase 3 | MANAGE_EXTERNAL_STORAGE | 文件管理功能 |
| Phase 4 | ACCESSIBILITY_SERVICE | 深度系统集成 |
| Phase 4 | READ_CALENDAR, READ_CONTACTS | 日历/通讯录功能 |

**原则：** 只在用户触发对应功能时才请求权限，永远不一次性全要。

---

## 隐私设计

- **本地优先：** 元数据提取、去重检测、哈希计算全在设备上完成
- **最小上传：** 分类只上传缩略图（< 100KB），不上传原图
- **明确告知：** 视频生成需上传原图时，弹窗显示"将上传此图片到云端处理，费用约 XX credits"
- **不缓存：** 服务端处理完立即删除上传文件（现有 FILE_RETENTION_HOURS 机制）

---

## 对接现有后端（零改动）

App 就是一个普通的 AgentCab Caller：
- 登录：`POST /v1/auth/login` → 拿 JWT
- 浏览技能：`GET /v1/skills`
- 上传文件：`POST /v1/files/upload`
- 调用技能：`POST /v1/skills/{id}/call`
- 轮询结果：`GET /v1/calls/{id}`
- 下载结果：`GET /v1/files/{id}`
- 充值：Z-Pay（微信/支付宝）已集成

需要的后端改动：
- **手机号登录**：添加 SMS 验证码注册/登录（中国市场必须）
- **微信登录**：接入微信开放平台 OAuth（大幅降低注册门槛）
- 文件上传优化（支持分片上传大文件）

---

## 费用与计费

复用现有 Credit 体系：
- 照片分类：每次分析约 5-10 credits（调用文本分类 API）
- Seedance 视频：18-324 credits（动态定价，已实现）
- 充值：Z-Pay 微信/支付宝（已集成）
- App 内显示实时余额（复用 user-menu 里的 wallet 查询）

---

## 开发阶段

### Phase 1：基础框架（2 周）
- React Native 项目初始化
- 登录/注册页面
- API 客户端移植（从 web `api.ts`）
- 底部导航：首页 / 照片 / 发现 / 我的

### Phase 2：照片引擎（3 周）
- Kotlin native module：MediaStore 扫描
- 元数据提取（日期、位置、大小）
- 本地去重（perceptual hash）
- 缩略图生成
- 照片网格浏览 UI

### Phase 3：AI 分类 + Seedance（2 周）
- 接入 AgentCab API 做照片分类
- 分类结果展示 + 一键整理
- Seedance 2.0 视频生成流程
- 调用前费用预估 UI

### Phase 4：Chat 界面 + LLM 意图识别（2 周）
- 自然语言输入
- 调用 Claude/GPT API 做意图识别（用户说什么 → 匹配哪个技能 + 提取参数）
- Agent Orchestrator：LLM 返回结构化指令 → 执行技能
- 任务进度展示
- 历史记录

### Phase 5：钱包 + 打磨（1 周）
- 余额显示 + Z-Pay 充值
- 错误处理 + 离线状态
- 性能优化

### Phase 6：Beta 测试（2 周）
- APK 分发给测试用户
- 收集反馈
- 修 bug

**总计：约 12 周**

---

## 分发策略

1. **第 1-3 个月：** APK 直接分发（官网下载 + 微信群/社群分享）
2. **第 4-6 个月：** 国内应用商店（华为应用市场、小米应用商店、OPPO 软件商店、应用宝）
3. **第 8+ 个月：** Google Play 国际版（精简权限版）

APK 先行的好处：
- 不受应用商店审核限制
- 可以用无障碍服务等高级权限
- 快速迭代，每周发版
- 微信群传播 APK 在中国市场很常见

---

## 关键文件参考

| 文件 | 用途 |
|------|------|
| `frontend/src/services/api.ts` | API 客户端，直接移植到 React Native |
| `seedance20-worker/worker.py` | Seedance 定价公式，App 端预估费用 |
| `backend/app/api/v1/files.py` | 文件上传接口和大小限制 |
| `backend/app/config.py` | 后端配置，JWT/支付/文件上传参数 |

---

## 验证方式

1. **API 对接：** 用 Postman 测试登录、文件上传、技能调用全流程
2. **照片扫描：** 在测试机上扫描 1000+ 张照片，验证性能和内存占用
3. **Seedance 集成：** 从 App 上传图片 → 调用 API → 下载视频 → 保存到相册
4. **计费：** 验证调用前费用预估 vs 实际扣费一致
5. **Beta：** 5-10 个真实用户使用一周，收集 crash 和体验反馈
