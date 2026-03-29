import axios from 'axios'

export const api = axios.create({
  baseURL: '/v1'
})

const ACCESS_TOKEN_KEY = 'agenthub_access_token'

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY)
}

export function setAccessToken(token: string | null): void {
  if (!token) {
    localStorage.removeItem(ACCESS_TOKEN_KEY)
    return
  }
  localStorage.setItem(ACCESS_TOKEN_KEY, token)
}

api.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // 401: Token 过期或未授权
    if (error.response?.status === 401) {
      const token = getAccessToken()
      // 只有之前有 token（说明是过期了）才清除并跳转
      // 没有 token 的 401 说明是未登录用户访问需要认证的接口，不跳转
      if (token) {
        setAccessToken(null)
        if (!window.location.pathname.includes('/auth')) {
          window.location.href = '/auth'
        }
      }
      return Promise.reject(new Error(token ? 'Session expired. Please login again.' : 'Login required'))
    }

    // 403: 权限不足
    if (error.response?.status === 403) {
      const detail = error?.response?.data?.detail
      console.log('403 error detail:', detail, typeof detail)
      if (typeof detail === 'string' && detail.includes('Email verification required')) {
        window.location.href = '/auth?verify=1'
        return Promise.reject(new Error(detail))
      }
      return Promise.reject(new Error(detail || 'You do not have permission to perform this action.'))
    }

    // 404: 资源不存在
    if (error.response?.status === 404) {
      const detail = error?.response?.data?.detail
      return Promise.reject(new Error(detail || 'Resource not found.'))
    }

    // 429: 请求过于频繁
    if (error.response?.status === 429) {
      return Promise.reject(new Error('Too many requests. Please try again later.'))
    }

    // 500+: 服务器错误
    if (error.response?.status >= 500) {
      return Promise.reject(new Error('Server error. Please try again later.'))
    }

    // 网络错误（无响应）
    if (!error.response) {
      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        return Promise.reject(new Error('Request timeout. Please check your connection and try again.'))
      }
      return Promise.reject(new Error('Network error. Please check your internet connection.'))
    }

    // 400: 客户端错误，尝试提取详细信息
    if (error.response?.status === 400) {
      const detail = error?.response?.data?.detail
      if (detail) {
        // 如果是字符串，直接返回
        if (typeof detail === 'string') {
          return Promise.reject(new Error(detail))
        }
        // 如果是对象，尝试格式化
        if (typeof detail === 'object') {
          // 处理验证错误
          if (Array.isArray(detail)) {
            const messages = detail.map((err: any) => err.msg || err.message).join(', ')
            return Promise.reject(new Error(messages || 'Validation error.'))
          }
          return Promise.reject(new Error(JSON.stringify(detail)))
        }
      }
      return Promise.reject(new Error('Invalid request. Please check your input.'))
    }

    // 其他错误，尝试提取 detail
    const detail = error?.response?.data?.detail
    if (detail) {
      return Promise.reject(new Error(typeof detail === 'string' ? detail : JSON.stringify(detail)))
    }

    // 兜底错误
    return Promise.reject(new Error(error.message || 'An unexpected error occurred.'))
  }
)

export type Skill = {
  id: string
  agent_id: string
  provider_name?: string
  provider_skill_count?: number
  name: string
  description?: string
  input_schema: Record<string, unknown>
  output_schema: Record<string, unknown>
  price_credits: number
  max_price_credits?: number | null
  category?: string
  tags?: string[]
  callback_url?: string
  max_concurrent_jobs?: number
  status: 'draft' | 'published' | 'deleted' | 'active' | 'inactive'
  visibility: string
  allow_free_trial: boolean
  call_count: number
  success_count: number
  rating: number
  created_at: string
  updated_at?: string | null
  example_call_id?: string
}

export type UserProfile = {
  id: string
  name: string
  email: string
  role: 'caller' | 'provider' | 'admin'
  status: 'active' | 'suspended'
  email_verified: boolean
  total_credits_spent: number
  total_credits_earned: number
  created_at: string
}

export async function sendEmailVerification() {
  const { data } = await api.post('/auth/send-email-verification')
  return data.data as { sent: boolean } | { already_verified: boolean }
}

export async function verifyEmail(code: string) {
  const { data } = await api.post('/auth/verify-email', { code })
  return data.data as { verified: boolean }
}

export async function register(payload: {
  name: string
  email: string
  password: string
  role?: 'caller' | 'provider'
}) {
  const { data } = await api.post('/auth/register', { ...payload, role: payload.role || 'caller' })
  return data.data as {
    user: UserProfile
    api_key: string
    auth: { access_token: string; token_type: string; expires_in: number }
  }
}

export async function login(payload: { email: string; password: string }) {
  const { data } = await api.post('/auth/login', payload)
  return data.data as {
    user: UserProfile
    auth: { access_token: string; token_type: string; expires_in: number }
  }
}

export async function fetchMe() {
  const { data } = await api.get('/auth/me')
  return data.data as UserProfile
}

export async function resetApiKey() {
  const { data } = await api.post('/auth/reset-api-key')
  return data.data as { api_key: string }
}

export async function fetchSkills(): Promise<Skill[]> {
  const { data } = await api.get('/skills')
  return data.data.items
}

export async function fetchMySkills(): Promise<Skill[]> {
  const { data } = await api.get('/skills/my')
  return data.data
}

export async function fetchSkillById(skillId: string): Promise<Skill> {
  const { data } = await api.get(`/skills/${skillId}`)
  return data.data
}

export async function fetchSkillsWithStatus(page: number = 1, pageSize: number = 20, q?: string, category?: string, providerId?: string) {
  const params: Record<string, any> = {
    include_status: true,
    page,
    page_size: pageSize
  }
  if (q) params.q = q
  if (category && category !== 'all') params.category = category
  if (providerId) params.provider_id = providerId
  const { data } = await api.get('/skills', { params })
  return data.data as {
    items: Skill[]
    statuses: Record<string, {
      status: 'available' | 'moderate' | 'busy'
      queue_count: number
      avg_response_time: string
    }>
    page: number
    page_size: number
    total: number
  }
}

export async function fetchSkillStatus(skillId: string) {
  const { data } = await api.get(`/skills/${skillId}/status`)
  return data.data as {
    status: 'available' | 'moderate' | 'busy'
    queue_count: number
    avg_response_time: string
    success_rate: number
  }
}

export async function createSkill(payload: {
  name: string
  description?: string
  input_schema: Record<string, unknown>
  output_schema: Record<string, unknown>
  price_credits: number
  category?: string
  tags?: string[]
  max_concurrent_jobs?: number
  callback_url?: string
  status?: 'draft' | 'published' | 'deleted' | 'active' | 'inactive'
  visibility?: 'public' | 'private'
  allow_free_trial?: boolean
}) {
  const { data} = await api.post('/skills', payload)
  return data.data as Skill
}

export async function updateSkill(skillId: string, payload: {
  name?: string
  description?: string
  input_schema?: Record<string, unknown>
  output_schema?: Record<string, unknown>
  price_credits?: number
  category?: string
  tags?: string[]
  max_concurrent_jobs?: number
  callback_url?: string
  status?: 'draft' | 'published' | 'deleted' | 'active' | 'inactive'
  visibility?: 'public' | 'private'
  allow_free_trial?: boolean
}) {
  const { data } = await api.put(`/skills/${skillId}`, payload)
  return data.data as Skill
}

export async function deleteSkill(skillId: string) {
  const { data } = await api.delete(`/skills/${skillId}`)
  return data.data as { deleted: boolean }
}

export async function callSkill(skillId: string, payload: { input: Record<string, unknown>; max_cost?: number }) {
  const { data } = await api.post(`/skills/${skillId}/call`, payload)
  return data.data as {
    call_id: string
    status: string
    output?: Record<string, unknown>
    credits_cost: number
    actual_cost?: number | null
    is_free_trial?: boolean
    duration_ms: number
    error_message?: string
  }
}

export async function getTrialStatus(skillId: string) {
  const { data } = await api.get(`/skills/${skillId}/trial-status`)
  return data.data as {
    can_use_trial: boolean
    trial_used: boolean
    allow_free_trial: boolean
  }
}

export async function uploadFile(file: File) {
  const formData = new FormData()
  formData.append('file', file)

  const { data } = await api.post('/files/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    },
    timeout: 120000 // 120 seconds for large file uploads
  })

  return data.data as {
    file_id: string
    filename: string
    file_size: number
    mime_type: string
    url: string
    expires_at: string
  }
}

export async function listFiles(page: number = 1, pageSize: number = 20) {
  const { data } = await api.get('/files', {
    params: { page, page_size: pageSize }
  })
  return data.data as {
    items: Array<{
      file_id: string
      filename: string
      file_size: number
      mime_type: string
      created_at: string
      expires_at: string | null
      url: string
    }>
    page: number
    page_size: number
    total: number
  }
}

export async function deleteFile(fileId: string) {
  const { data } = await api.delete(`/files/${fileId}`)
  return data.data
}

export async function fetchWallet() {
  const { data } = await api.get('/wallet')
  return data.data
}

export async function fetchTransactions(page: number = 1, pageSize: number = 20) {
  const { data } = await api.get('/wallet/transactions', {
    params: { page, page_size: pageSize }
  })
  return data.data as {
    items: Array<{
      id: string
      type: string
      credits: string
      status: string
      created_at: string
    }>
    page: number
    page_size: number
    total: number
  }
}

export async function createRecharge(amount_usd: number) {
  const { data } = await api.post('/wallet/recharge', { amount_usd })
  return data.data as { checkout_url: string; session_id: string }
}

export async function getStripeConnectStatus() {
  const { data } = await api.get('/stripe/connect/status')
  return data.data as {
    connected: boolean
    account_id: string | null
    details_submitted: boolean
    payouts_enabled: boolean
    charges_enabled: boolean
    is_mock: boolean
  }
}

export async function startStripeConnect() {
  const { data } = await api.post('/stripe/connect/start')
  return data.data as {
    account_id: string
    onboarding_url: string
    is_mock: boolean
  }
}

export async function fetchCalls(page: number = 1, pageSize: number = 20) {
  const { data } = await api.get('/calls', {
    params: { page, page_size: pageSize }
  })
  return data.data as {
    items: Array<{
      id: string
      skill_id: string
      skill_name?: string
      status: string
      credits_cost: number
      started_at: string
      duration_ms?: number
      error_message?: string
    }>
    page: number
    page_size: number
    total: number
    total_successful?: number
    total_credits_spent?: number
  }
}

export async function fetchReceivedCalls(page: number = 1, pageSize: number = 20) {
  const { data } = await api.get('/calls/provider/received', {
    params: { page, page_size: pageSize }
  })
  return data.data as {
    items: Array<{
      id: string
      skill_id: string
      skill_name?: string
      caller_id: string
      status: string
      credits_cost: number
      started_at: string
      duration_ms?: number
      error_message?: string
    }>
    page: number
    page_size: number
    total: number
    total_successful?: number
    total_credits_spent?: number
  }
}

export async function forceFailCall(callId: string) {
  const { data } = await api.post(`/calls/${callId}/fail`)
  return data.data
}

export async function fetchCall(callId: string) {
  const { data } = await api.get(`/calls/${callId}`)
  return data.data as {
    id: string
    skill_id: string
    status: string
    input_data?: Record<string, unknown>
    output_data?: Record<string, unknown> | string
    output_ref?: string
    output?: Record<string, unknown>
    credits_cost: number
    actual_cost?: number | null
    is_free_trial?: boolean
    started_at: string
    completed_at?: string
    duration_ms?: number
    error_message?: string
    input_files?: Array<{
      id: string
      filename: string
      original_filename: string
      file_size: number
      mime_type: string
      created_at: string
      expires_at?: string | null
    }>
    output_files?: Array<{
      id: string
      filename: string
      original_filename: string
      file_size: number
      mime_type: string
      created_at: string
      expires_at?: string | null
    }>
  }
}

export async function createWithdrawal(credits: number) {
  const { data } = await api.post('/withdrawals', { credits })
  return data.data as {
    id: string
    status: string
    credits: string
    amount_usd: string
    stripe_transfer_id?: string
  }
}

export async function createUSDCWithdrawal(credits: number, withdrawal_address: string, chain: string) {
  const { data } = await api.post('/wallet/withdraw', { credits, withdrawal_address, chain })
  return data.data as {
    withdrawal_id: string
    credits: string
    amount_usdc: string
    status: string
    message: string
  }
}

export async function fetchWithdrawals() {
  const { data } = await api.get('/wallet/withdrawals')
  return data.data as Array<{
    id: string
    status: string
    credits: string
    amount_usd: string
    withdrawal_address?: string
    chain?: string
    tx_hash?: string
    created_at: string
  }>
}

// USDC Deposit APIs
export async function fetchUSDCDepositInfo() {
  const { data } = await api.get('/wallet/deposit/info')
  return data.data as {
    deposit_address: string
    supported_chains: string[]
    min_amount_usdc: string
    exchange_rate: string
    note?: string
  }
}

export async function createUSDCDeposit(txHash: string, chain: string) {
  const { data } = await api.post('/wallet/deposit', {
    tx_hash: txHash,
    chain
  })
  return data.data as {
    deposit_id: string
    amount_usdc: string
    credits_added: number
    confirmations: number
    status: string
  }
}

// Reviews API
export type Review = {
  id: string
  skill_id: string
  user_id: string
  user_name?: string
  rating: number
  comment?: string
  created_at: string
  updated_at?: string
}

export async function createReview(skillId: string, rating: number, comment?: string) {
  const { data } = await api.post(`/skills/${skillId}/reviews`, {
    rating,
    comment
  })
  return data.data
}

export async function updateReview(skillId: string, rating?: number, comment?: string) {
  const { data } = await api.put(`/skills/${skillId}/reviews`, {
    rating,
    comment
  })
  return data.data
}

export async function listReviews(skillId: string, page: number = 1, pageSize: number = 20) {
  const { data } = await api.get(`/skills/${skillId}/reviews`, {
    params: { page, page_size: pageSize }
  })
  return data.data as {
    items: Review[]
    page: number
    page_size: number
    total: number
  }
}

export async function getMyReview(skillId: string) {
  const { data } = await api.get(`/skills/${skillId}/reviews/my`)
  return data.data as Review | null
}

export async function deleteReview(skillId: string) {
  const { data } = await api.delete(`/skills/${skillId}/reviews`)
  return data.data
}

// Z-Pay Payment API
export async function createZPayOrder(amount: number, type: 'wxpay' | 'alipay' = 'wxpay') {
  const { data } = await api.post('/payment/zpay/create-order', { amount, payment_type: type })
  return data.data as {
    qrcode: string
    payurl: string
    img: string
    trade_no: string
    out_trade_no: string
    amount: number
    credits: number
  }
}

export async function checkZPayOrder(outTradeNo: string) {
  const { data } = await api.get(`/payment/zpay/check-order/${outTradeNo}`)
  return data.data as {
    out_trade_no: string
    status: string
    amount: number
    credits: number
    created_at: string
  }
}

// Skill Status Workflow APIs
export async function publishSkill(skillId: string, callId: string) {
  const { data } = await api.post(`/skills/${skillId}/publish`, {
    example_call_id: callId
  })
  return data.data as Skill
}

export async function unpublishSkill(skillId: string) {
  const { data } = await api.post(`/skills/${skillId}/unpublish`)
  return data.data as Skill
}

export async function fetchSkillExample(skillId: string) {
  const { data } = await api.get(`/skills/${skillId}/example`)
  return data.data as {
    call_id: string
    input_data?: Record<string, unknown>
    output_data?: Record<string, unknown> | string
    output?: Record<string, unknown>
    status: string
    duration_ms?: number
    created_at: string
  }
}

export async function fetchSkillExampleFiles(skillId: string) {
  const { data } = await api.get(`/skills/${skillId}/example/files`)
  return data.data as Array<{
    file_id: string
    filename: string
    file_size: number
    mime_type: string
    file_type: string
  }>
}

export async function downloadSkillExampleFile(skillId: string, fileId: string) {
  const { data } = await api.get(`/skills/${skillId}/example/files/${fileId}`, {
    responseType: 'blob'
  })
  return data
}

export async function downloadFile(fileId: string) {
  const { data } = await api.get(`/files/${fileId}`, {
    responseType: 'blob'
  })
  return data
}

export async function fetchSkillSuccessfulCalls(skillId: string, page: number = 1, pageSize: number = 20) {
  const { data } = await api.get(`/skills/${skillId}/available-calls-for-example`)
  const calls = data.data || []
  return {
    items: calls,
    page: 1,
    page_size: calls.length,
    total: calls.length
  }
}

