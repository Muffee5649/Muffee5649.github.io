import type { SupabaseClient } from '@supabase/supabase-js'

// #ifdef MP-WEIXIN
import { createClient as createMpClient } from 'supabase-mp-js'
// #endif
// #ifndef MP-WEIXIN
import { createClient as createWebClient } from '@supabase/supabase-js'
// #endif

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('[supabase] 缺少 VITE_SUPABASE_URL 或 VITE_SUPABASE_PUBLISHABLE_KEY，请检查 env/.env')
}

const authOptions = {
  persistSession: true,
  autoRefreshToken: true,
  // 小程序与 hash 路由下都不需要从 URL 解析会话
  detectSessionInUrl: false,
}

let client!: SupabaseClient

// #ifdef MP-WEIXIN
// 微信端由 supabase-mp-js 注入 wx.request / wx.setStorageSync / wx.connectSocket 适配层
client = createMpClient(SUPABASE_URL, SUPABASE_KEY, { auth: authOptions })
// #endif
// #ifndef MP-WEIXIN
client = createWebClient(SUPABASE_URL, SUPABASE_KEY, { auth: authOptions })
// #endif

export const supabase = client
