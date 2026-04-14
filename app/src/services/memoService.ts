/**
 * Memo Service — handles floating button screenshot + comment → worker → feishu
 */
import { NativeModules, DeviceEventEmitter } from 'react-native'
import { takeScreenshot } from './screenshot'
import { storage } from './storage'
import RNFS from 'react-native-blob-util'

const ScriptOverlayManager = NativeModules.ScriptOverlayManager ?? null
const MEMO_SKILL_ID_KEY = 'memo_skill_id'
const FEISHU_APP_ID_KEY = 'feishu_app_id'
const FEISHU_APP_SECRET_KEY = 'feishu_app_secret'
const FEISHU_FOLDER_TOKEN_KEY = 'feishu_folder_token'

let _listening = false

/** Start memo overlay (floating camera button) */
export async function startMemoOverlay() {
  if (!ScriptOverlayManager?.startMemoOverlay) {
    throw new Error('ScriptOverlayManager not available')
  }
  await ScriptOverlayManager.startMemoOverlay()
  _startListening()
}

/** Stop memo overlay */
export async function stopMemoOverlay() {
  if (ScriptOverlayManager?.stopOverlay) {
    await ScriptOverlayManager.stopOverlay()
  }
}

/** Save feishu config */
export function saveFeishuConfig(appId: string, appSecret: string, folderToken?: string) {
  storage.setString(FEISHU_APP_ID_KEY, appId)
  storage.setString(FEISHU_APP_SECRET_KEY, appSecret)
  if (folderToken) storage.setString(FEISHU_FOLDER_TOKEN_KEY, folderToken)
}

/** Get feishu config */
export function getFeishuConfig() {
  return {
    appId: storage.getString(FEISHU_APP_ID_KEY) || '',
    appSecret: storage.getString(FEISHU_APP_SECRET_KEY) || '',
    folderToken: storage.getString(FEISHU_FOLDER_TOKEN_KEY) || '',
  }
}

function _startListening() {
  if (_listening) return
  _listening = true

  DeviceEventEmitter.addListener('onOverlayAction', async (event) => {
    const { action } = event
    if (action === 'memo_screenshot') {
      await _handleScreenshot()
    } else if (action === 'memo_submit') {
      const data = JSON.parse(event.data || '{}')
      await _submitMemo(data.comment || '')
    } else if (action === 'memo_cancel') {
      ScriptOverlayManager?.hideOverlayPanel?.()
      _pendingScreenshotPath = null
    }
  })
}

let _pendingScreenshotPath: string | null = null

async function _handleScreenshot() {
  try {
    // Take screenshot
    const result = await takeScreenshot()
    _pendingScreenshotPath = result.path
    console.log('[Memo] Screenshot taken:', result.path)

    // Show comment input in overlay webview
    ScriptOverlayManager?.showOverlayHtml?.(`
<div style="background:#1E293B; border-radius:12px; padding:16px;">
  <div style="font-size:14px; color:#94A3B8; margin-bottom:8px;">已截屏，添加备注（可选）</div>
  <textarea id="comment" placeholder="备注..."
    style="width:100%; height:60px; background:#0F172A; color:#E2E8F0; border:1px solid #334155;
    border-radius:8px; padding:8px; font-size:14px; resize:none; outline:none;"></textarea>
  <div style="margin-top:10px; display:flex; gap:8px;">
    <button onclick="action('memo_submit',{comment:document.getElementById('comment').value})"
      style="flex:1; padding:10px; background:#2563EB; color:#fff; border:none; border-radius:8px; font-size:14px;">
      保存到飞书
    </button>
    <button onclick="action('memo_cancel',{})"
      style="padding:10px 16px; background:#334155; color:#E2E8F0; border:none; border-radius:8px; font-size:14px;">
      取消
    </button>
  </div>
</div>
    `)
  } catch (e) {
    console.error('[Memo] Screenshot failed:', e)
  }
}

async function _submitMemo(comment: string) {
  // Hide comment input
  ScriptOverlayManager?.hideOverlayPanel?.()

  if (!_pendingScreenshotPath) {
    console.error('[Memo] No pending screenshot')
    return
  }

  const feishu = getFeishuConfig()
  if (!feishu.appId || !feishu.appSecret) {
    // Show error in overlay
    ScriptOverlayManager?.showOverlayHtml?.(`
<div style="background:#1E293B; border-radius:12px; padding:16px;">
  <div style="color:#EF4444; font-size:14px;">请先在设置中配置飞书 App ID 和 App Secret</div>
  <button onclick="action('memo_cancel',{})"
    style="margin-top:10px; width:100%; padding:10px; background:#334155; color:#E2E8F0; border:none; border-radius:8px;">
    知道了
  </button>
</div>
    `)
    return
  }

  // Show loading
  ScriptOverlayManager?.showOverlayHtml?.(`
<div style="background:#1E293B; border-radius:12px; padding:16px; text-align:center;">
  <div style="color:#94A3B8; font-size:14px;">正在保存到飞书...</div>
</div>
  `)

  try {
    // Read screenshot as base64
    const base64 = await RNFS.fs.readFile(_pendingScreenshotPath, 'base64')

    // Call worker
    const { callSkill } = await import('./api')
    const skillId = storage.getString(MEMO_SKILL_ID_KEY) || ''
    if (!skillId) {
      throw new Error('未配置知识库技能 ID')
    }

    const callResult = await callSkill(skillId, {
      input: {
        action: 'save',
        screenshot: base64,
        comment,
        feishu_app_id: feishu.appId,
        feishu_app_secret: feishu.appSecret,
        feishu_folder_token: feishu.folderToken,
      },
    })

    // Poll for result
    const { fetchCall } = await import('./api')
    let result: any = null
    for (let i = 0; i < 30; i++) {
      await new Promise<void>(r => setTimeout(() => r(), 2000))
      const call = await fetchCall(callResult.call_id)
      if (call.status === 'success' || call.status === 'completed') {
        result = call.output_data || call.output
        break
      }
      if (call.status === 'failed') {
        throw new Error(call.error_message || '处理失败')
      }
    }

    // Show success
    ScriptOverlayManager?.showOverlayHtml?.(`
<div style="background:#1E293B; border-radius:12px; padding:16px; text-align:center;">
  <div style="color:#22C55E; font-size:16px; font-weight:600;">✓ 已保存</div>
  <div style="color:#94A3B8; font-size:12px; margin-top:4px;">${result?.summary || '记录成功'}</div>
</div>
    `)

    // Auto hide after 2s
    setTimeout(() => {
      ScriptOverlayManager?.hideOverlayPanel?.()
    }, 2000)
  } catch (e: any) {
    console.error('[Memo] Submit failed:', e)
    ScriptOverlayManager?.showOverlayHtml?.(`
<div style="background:#1E293B; border-radius:12px; padding:16px;">
  <div style="color:#EF4444; font-size:14px;">保存失败: ${e.message || '未知错误'}</div>
  <button onclick="action('memo_cancel',{})"
    style="margin-top:10px; width:100%; padding:10px; background:#334155; color:#E2E8F0; border:none; border-radius:8px;">
    关闭
  </button>
</div>
    `)
  } finally {
    _pendingScreenshotPath = null
  }
}
