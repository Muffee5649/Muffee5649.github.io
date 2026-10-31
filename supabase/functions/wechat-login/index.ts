// 微信小程序登录：用 wx.login 的 code 换取 Supabase 会话
// 免登录调用（verify_jwt: false），需配置服务端密钥 WX_APPID / WX_SECRET

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/** 虚拟邮箱后缀：仅作为 Auth 登录标识，不对用户展示；需与前端 profile.vue 的 VIRTUAL_EMAIL_SUFFIX 保持一致 */
const VIRTUAL_EMAIL_SUFFIX = '@wechat.local'

type SupabaseAdmin = ReturnType<typeof createClient>

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

/** 微信 code2session 返回结构 */
interface WxSession {
  openid?: string
  unionid?: string
  session_key?: string
  errcode?: number
  errmsg?: string
}

/**
 * 用登录凭证换取微信用户标识
 */
async function exchangeCode(code: string): Promise<WxSession> {
  const appid = Deno.env.get('WX_APPID')
  const secret = Deno.env.get('WX_SECRET')

  const url = new URL('https://api.weixin.qq.com/sns/jscode2session')
  url.searchParams.set('appid', appid ?? '')
  url.searchParams.set('secret', secret ?? '')
  url.searchParams.set('js_code', code)
  url.searchParams.set('grant_type', 'authorization_code')

  const response = await fetch(url)
  return await response.json() as WxSession
}

/**
 * 按 openid / unionid 查询已绑定的 Supabase 用户
 * 查询失败不阻断登录，回退到虚拟邮箱匹配
 */
async function findUserId(
  admin: SupabaseAdmin,
  column: 'openid' | 'unionid',
  value: string,
): Promise<string | undefined> {
  const { data, error } = await admin
    .from('wechat_accounts')
    .select('user_id')
    .eq(column, value)
    .limit(1)

  if (error) {
    console.error(`查询微信账号映射失败(${column}):`, error.message)
    return undefined
  }
  return (data?.[0]?.user_id as string | undefined) ?? undefined
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ error: '仅支持 POST 请求' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: '服务端环境变量缺失' }, 500)
  }
  if (!Deno.env.get('WX_APPID') || !Deno.env.get('WX_SECRET')) {
    return json({ error: '缺少 WX_APPID / WX_SECRET 密钥' }, 500)
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  }
  catch {
    return json({ error: '请求体格式错误' }, 400)
  }

  const code = String(body.code ?? '').trim()
  if (!code) {
    return json({ error: '缺少微信登录凭证 code' }, 400)
  }

  const wxSession = await exchangeCode(code)
  if (wxSession.errcode || !wxSession.openid) {
    console.error('微信 code2session 失败:', wxSession.errcode, wxSession.errmsg)
    return json({ error: wxSession.errmsg || '微信登录凭证无效' }, 400)
  }

  const openid = wxSession.openid
  const unionid = wxSession.unionid ?? null

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // 1. 优先按当前小程序的 openid 匹配，其次用 unionid 合并其他应用下的同一用户
  let userId = await findUserId(admin, 'openid', openid)
  if (!userId && unionid) {
    userId = await findUserId(admin, 'unionid', unionid)
  }

  // 2. 用映射记录拿到账号当前邮箱（可能是用户后来绑定的真实邮箱）
  let email = ''
  if (userId) {
    const { data, error } = await admin.auth.admin.getUserById(userId)
    if (error || !data.user?.email) {
      console.error('微信账号映射失效:', userId, error?.message)
      userId = undefined
    }
    else {
      email = data.user.email
    }
  }

  // 3. 新用户或历史账号：虚拟邮箱仅作为 Auth 登录标识
  if (!email) {
    email = `${openid}${VIRTUAL_EMAIL_SUFFIX}`
    const { error: createError } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        username: `wx_${openid.slice(-8)}`,
        wx_openid: openid,
        wx_unionid: unionid,
      },
    })

    // 已注册过的微信用户直接复用，其余错误原样返回
    const emailExists = createError
      && (createError.code === 'email_exists'
        || createError.code === 'user_already_exists'
        || createError.message.toLowerCase().includes('already'))
    if (createError && !emailExists) {
      return json({ error: createError.message }, 400)
    }
  }

  // 4. 生成一次性登录凭证，再换取真实会话（generateLink 不会发送邮件）
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })
  if (linkError || !linkData.properties?.hashed_token) {
    return json({ error: linkError?.message ?? '生成登录凭证失败' }, 500)
  }

  const anonymous = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: verified, error: verifyError } = await anonymous.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'magiclink',
  })
  if (verifyError || !verified.session) {
    return json({ error: verifyError?.message ?? '微信登录失败' }, 500)
  }

  // 5. 记录 openid -> user_id 映射，作为后续登录的唯一依据
  const mapping: Record<string, unknown> = {
    openid,
    user_id: verified.session.user.id,
    updated_at: new Date().toISOString(),
  }
  if (unionid) {
    mapping.unionid = unionid
  }

  const { error: mappingError } = await admin
    .from('wechat_accounts')
    .upsert(mapping, { onConflict: 'openid' })
  if (mappingError) {
    // 映射写入失败不影响本次登录，但下次会走虚拟邮箱回退
    console.error('写入微信账号映射失败:', mappingError.message)
  }

  return json({
    accessToken: verified.session.access_token,
    refreshToken: verified.session.refresh_token,
    expiresIn: verified.session.expires_in,
    expiresAt: verified.session.expires_at,
    userId: verified.session.user.id,
  })
})
