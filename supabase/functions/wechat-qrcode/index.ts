// 桌号小程序码：按令牌批量生成微信小程序码（scene = 32 位令牌）
// 仅管理员可调用（verify_jwt: true），需配置 WX_APPID / WX_SECRET
// 可选配置：WX_QR_ENV_VERSION（release / trial / develop，默认 release）、WX_QR_PAGE（默认 pages/menus/index）

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/** 单次请求最多生成的二维码数量 */
const MAX_TOKENS = 100
/** 并发调用微信接口的数量 */
const CONCURRENCY = 4
/** 微信 scene 最多 32 个字符，令牌为 32 位十六进制 */
const SCENE_PATTERN = /^[0-9a-f]{32}$/
/** access_token 提前 5 分钟过期，避免临界失效 */
const TOKEN_EXPIRE_MARGIN_SECONDS = 300
/** 微信 access_token 失效类错误码，遇到后清缓存重试一次 */
const INVALID_TOKEN_CODES = new Set([40001, 40014, 42001])
/** 微信规定的小程序版本 */
const ENV_VERSIONS = new Set(['release', 'trial', 'develop'])

interface WxCachedToken {
  value: string
  expiresAt: number
}

let cachedToken: WxCachedToken | null = null

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

/** 获取并缓存微信接口调用凭证 */
async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.value
  }

  const url = new URL('https://api.weixin.qq.com/cgi-bin/token')
  url.searchParams.set('grant_type', 'client_credential')
  url.searchParams.set('appid', Deno.env.get('WX_APPID') ?? '')
  url.searchParams.set('secret', Deno.env.get('WX_SECRET') ?? '')

  const response = await fetch(url)
  const data = await response.json() as {
    access_token?: string
    expires_in?: number
    errcode?: number
    errmsg?: string
  }

  if (!data.access_token) {
    cachedToken = null
    throw new Error(`微信 access_token 获取失败：${data.errmsg ?? data.errcode ?? '未知错误'}`)
  }

  const expiresIn = Math.max((data.expires_in ?? 7200) - TOKEN_EXPIRE_MARGIN_SECONDS, 60)
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + expiresIn * 1000,
  }
  return cachedToken.value
}

/** 生成单张小程序码，返回 base64 data URL */
async function generateWxacode(
  token: string,
  page: string,
  envVersion: string,
  retried = false,
): Promise<string> {
  const accessToken = await getAccessToken()
  const response = await fetch(
    `https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${encodeURIComponent(accessToken)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scene: token,
        page,
        check_path: false,
        env_version: envVersion,
        width: 430,
        auto_color: false,
        line_color: { r: 0, g: 0, b: 0 },
        is_hyaline: false,
      }),
    },
  )

  const contentType = response.headers.get('Content-Type') ?? ''
  if (response.ok && contentType.includes('image')) {
    const bytes = new Uint8Array(await response.arrayBuffer())
    return `data:image/png;base64,${toBase64(bytes)}`
  }

  let errcode = 0
  let errmsg = ''
  try {
    const body = await response.json() as { errcode?: number, errmsg?: string }
    errcode = Number(body.errcode ?? 0)
    errmsg = body.errmsg ?? ''
  }
  catch {
    errmsg = `HTTP ${response.status}`
  }

  // 凭证失效时清缓存并重试一次，避免单个函数实例一直使用过期 token
  if (!retried && (INVALID_TOKEN_CODES.has(errcode) || response.status === 401)) {
    cachedToken = null
    return generateWxacode(token, page, envVersion, true)
  }

  throw new Error(`微信小程序码生成失败：${[errcode || '', errmsg].filter(Boolean).join(' ')}`)
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
  const appid = Deno.env.get('WX_APPID')
  const secret = Deno.env.get('WX_SECRET')

  if (!supabaseUrl || !anonKey) {
    return json({ error: '服务端环境变量缺失' }, 500)
  }
  if (!appid || !secret) {
    return json({ error: '缺少 WX_APPID / WX_SECRET 密钥' }, 500)
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return json({ error: '未登录' }, 401)
  }

  // 以调用方身份校验管理员权限
  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: userData, error: userError } = await caller.auth.getUser()
  if (userError || !userData.user) {
    return json({ error: '登录已过期，请重新登录' }, 401)
  }

  const { data: isAdmin, error: adminError } = await caller.rpc('is_admin')
  if (adminError || !isAdmin) {
    return json({ error: '无权执行该操作' }, 403)
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  }
  catch {
    return json({ error: '请求体格式错误' }, 400)
  }

  const rawTokens = Array.isArray(body.tokens) ? body.tokens : []
  const tokens = Array.from(new Set(
    rawTokens
      .map(item => String(item ?? '').trim().toLowerCase())
      .filter(item => SCENE_PATTERN.test(item)),
  )).slice(0, MAX_TOKENS)

  if (!tokens.length) {
    return json({ error: '缺少有效的桌台令牌' }, 400)
  }

  const page = Deno.env.get('WX_QR_PAGE') ?? 'pages/menus/index'
  const envVersion = ENV_VERSIONS.has(Deno.env.get('WX_QR_ENV_VERSION') ?? '')
    ? (Deno.env.get('WX_QR_ENV_VERSION') as string)
    : 'release'

  const codes: Record<string, string> = {}
  const failures: string[] = []
  let cursor = 0

  async function worker(): Promise<void> {
    while (cursor < tokens.length) {
      const token = tokens[cursor] as string
      cursor += 1
      try {
        codes[token] = await generateWxacode(token, page, envVersion)
      }
      catch (error) {
        console.error('小程序码生成失败:', token, error)
        failures.push(error instanceof Error ? error.message : String(error))
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tokens.length) }, () => worker()))

  if (!Object.keys(codes).length) {
    return json({ error: failures[0] ?? '小程序码生成失败' }, 502)
  }

  return json({ codes })
})
