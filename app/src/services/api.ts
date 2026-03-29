import axios from 'axios'
import { getAccessToken, setAccessToken } from './storage'

const API_BASE_URL = 'https://www.agentcab.ai/v1'

export const api = axios.create({
  baseURL: API_BASE_URL,
})

// Auth state listener for navigation
let onAuthExpired: (() => void) | null = null
export function setOnAuthExpired(callback: (() => void) | null) {
  onAuthExpired = callback
}

api.interceptors.request.use(async config => {
  const token = await getAccessToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  response => response,
  async error => {
    if (error.response?.status === 401) {
      const token = await getAccessToken()
      if (token) {
        await setAccessToken(null)
        onAuthExpired?.()
      }
      return Promise.reject(new Error(token ? 'Session expired. Please login again.' : 'Login required'))
    }

    if (error.response?.status === 403) {
      const detail = error?.response?.data?.detail
      return Promise.reject(new Error(detail || 'You do not have permission to perform this action.'))
    }

    if (error.response?.status === 404) {
      const detail = error?.response?.data?.detail
      return Promise.reject(new Error(detail || 'Resource not found.'))
    }

    if (error.response?.status === 429) {
      return Promise.reject(new Error('Too many requests. Please try again later.'))
    }

    if (error.response?.status >= 500) {
      return Promise.reject(new Error('Server error. Please try again later.'))
    }

    if (!error.response) {
      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        return Promise.reject(new Error('Request timeout. Please check your connection and try again.'))
      }
      return Promise.reject(new Error('Network error. Please check your internet connection.'))
    }

    if (error.response?.status === 400) {
      const detail = error?.response?.data?.detail
      if (detail) {
        if (typeof detail === 'string') return Promise.reject(new Error(detail))
        if (Array.isArray(detail)) {
          const messages = detail.map((err: any) => err.msg || err.message).join(', ')
          return Promise.reject(new Error(messages || 'Validation error.'))
        }
        return Promise.reject(new Error(JSON.stringify(detail)))
      }
      return Promise.reject(new Error('Invalid request. Please check your input.'))
    }

    const detail = error?.response?.data?.detail
    if (detail) {
      return Promise.reject(new Error(typeof detail === 'string' ? detail : JSON.stringify(detail)))
    }
    return Promise.reject(new Error(error.message || 'An unexpected error occurred.'))
  },
)

// Types
export type Skill = {
  id: string
  agent_id: string
  provider_name?: string
  name: string
  description?: string
  input_schema: Record<string, unknown>
  output_schema: Record<string, unknown>
  price_credits: number
  max_price_credits?: number | null
  category?: string
  tags?: string[]
  status: 'draft' | 'published' | 'deleted' | 'active' | 'inactive'
  visibility: string
  allow_free_trial: boolean
  call_count: number
  success_count: number
  rating: number
  created_at: string
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

// Auth APIs
export async function register(payload: {
  name: string
  email: string
  password: string
}) {
  const { data } = await api.post('/auth/register', { ...payload, role: 'caller' })
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

// Skills APIs
export async function fetchSkills(page = 1, pageSize = 20, category?: string, q?: string) {
  const params: Record<string, any> = { include_status: true, page, page_size: pageSize }
  if (category && category !== 'all') params.category = category
  if (q) params.q = q
  const { data } = await api.get('/skills', { params })
  return data.data as {
    items: Skill[]
    statuses: Record<string, { status: string; queue_count: number; avg_response_time: string }>
    page: number
    page_size: number
    total: number
  }
}

export const fetchSkillsWithStatus = fetchSkills

export async function fetchSkillById(skillId: string) {
  const { data } = await api.get(`/skills/${skillId}`)
  return data.data as Skill
}

export async function callSkill(skillId: string, payload: { input: Record<string, unknown>; max_cost?: number }) {
  const { data } = await api.post(`/skills/${skillId}/call`, payload)
  return data.data as {
    call_id: string
    status: string
    output?: Record<string, unknown>
    credits_cost: number
    actual_cost?: number | null
    duration_ms: number
    error_message?: string
  }
}

export async function fetchCall(callId: string) {
  const { data } = await api.get(`/calls/${callId}`)
  return data.data
}

// Skill Example APIs
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

// File APIs
export async function uploadFile(uri: string, filename: string, mimeType: string) {
  const formData = new FormData()
  formData.append('file', {
    uri,
    name: filename,
    type: mimeType,
  } as any)

  const { data } = await api.post('/files/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
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

export async function downloadFile(fileId: string) {
  const { data } = await api.get(`/files/${fileId}`, { responseType: 'blob' })
  return data
}

// Wallet APIs
export async function fetchWallet() {
  const { data } = await api.get('/wallet')
  return data.data
}

export async function fetchTransactions(page = 1, pageSize = 20) {
  const { data } = await api.get('/wallet/transactions', { params: { page, page_size: pageSize } })
  return data.data as {
    items: Array<{ id: string; type: string; credits: string; status: string; created_at: string }>
    page: number
    page_size: number
    total: number
  }
}

// Z-Pay
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
  return data.data
}

// Calls history
export async function fetchCalls(page = 1, pageSize = 20) {
  const { data } = await api.get('/calls', { params: { page, page_size: pageSize } })
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
  }
}
