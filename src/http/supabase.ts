import type { SupabaseClient } from '@supabase/supabase-js'

// #ifdef MP-WEIXIN
import { createClient as createMpClient, wxFetch } from 'supabase-mp-js'
// #endif
// #ifndef MP-WEIXIN
import { createClient as createWebClient } from '@supabase/supabase-js'
// #endif

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('[supabase] 缺少 VITE_SUPABASE_URL 或 VITE_SUPABASE_PUBLISHABLE_KEY，请检查 env/.env')
}

/** 401 事件名：由应用层监听，清理登录态并跳转登录页 */
export const UNAUTHORIZED_EVENT = 'http:unauthorized'

/**
 * 带登录态守卫的 fetch
 * Supabase 的查询、RPC、Storage、Auth 请求都走这里，命中 401 时通知应用层
 */
const fetchWithAuthGuard: typeof fetch = async (input, init) => {
  let response: Response
  // #ifdef MP-WEIXIN
  response = await wxFetch(input as RequestInfo, init as RequestInit)
  // #endif
  // #ifndef MP-WEIXIN
  response = await fetch(input, init)
  // #endif

  if (response.status === 401) {
    uni.$emit(UNAUTHORIZED_EVENT)
  }

  return response
}

const authOptions = {
  persistSession: true,
  autoRefreshToken: true,
  // 小程序与 hash 路由下都不需要从 URL 解析会话
  detectSessionInUrl: false,
}

const clientOptions = {
  auth: authOptions,
  global: { fetch: fetchWithAuthGuard },
}

let client!: SupabaseClient

// #ifdef MP-WEIXIN
// 微信端由 supabase-mp-js 注入 wx.request / wx.setStorageSync / wx.connectSocket 适配层
client = createMpClient(SUPABASE_URL, SUPABASE_KEY, clientOptions)
// #endif
// #ifndef MP-WEIXIN
client = createWebClient(SUPABASE_URL, SUPABASE_KEY, clientOptions)
// #endif

export const supabase = client
