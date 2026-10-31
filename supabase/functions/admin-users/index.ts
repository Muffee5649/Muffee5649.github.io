// 管理员用户管理：创建 / 删除 / 改密 Supabase Auth 账号（需要 service_role 权限）
// 调用方必须携带管理员 JWT，函数内部通过 is_admin() 校验

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

interface AdminClient {
  from: (table: string) => any
  auth: {
    admin: {
      createUser: (input: any) => Promise<any>
      deleteUser: (id: string) => Promise<any>
      updateUserById: (id: string, attributes: any) => Promise<any>
    }
  }
  storage: { from: (bucket: string) => { remove: (paths: string[]) => Promise<any> } }
}

/** 统一性别取值 */
function normalizeGender(gender: unknown): string {
  if (gender === 'male' || gender === '男')
    return 'male'
  if (gender === 'female' || gender === '女')
    return 'female'
  return 'unknown'
}

/** 替换用户角色 */
async function replaceRoles(admin: AdminClient, userId: string, roleCodes: unknown): Promise<void> {
  if (!Array.isArray(roleCodes))
    return

  await admin.from('user_roles').delete().eq('user_id', userId)

  const codes = roleCodes.filter(
    (code): code is string => typeof code === 'string' && !!code.trim(),
  )
  if (!codes.length)
    return

  const { data: roles, error } = await admin.from('roles').select('id').in('code', codes)
  if (error)
    throw new Error(error.message)
  if (!roles?.length)
    return

  const { error: insertError } = await admin
    .from('user_roles')
    .insert(roles.map((role: { id: number }) => ({ user_id: userId, role_id: role.id })))
  if (insertError)
    throw new Error(insertError.message)
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

  const { data: isAdmin, error: adminCheckError } = await caller.rpc('is_admin')
  if (adminCheckError || !isAdmin) {
    return json({ error: '无权执行该操作' }, 403)
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as unknown as AdminClient

  let body: Record<string, unknown>
  try {
    body = await req.json()
  }
  catch {
    return json({ error: '请求体格式错误' }, 400)
  }

  const { data: adminProfile } = await admin
    .from('profiles')
    .select('username')
    .eq('id', userData.user.id)
    .maybeSingle()
  const adminName = adminProfile?.username ?? 'system'

  if (body.action === 'create') {
    const username = String(body.username ?? '')
      .trim()
      .toLowerCase()
    const email = String(body.email ?? '')
      .trim()
      .toLowerCase()
    const password = String(body.password ?? '')

    if (!username || !email || !password) {
      return json({ error: '用户名、邮箱与密码不能为空' }, 400)
    }
    if (password.length < 6) {
      return json({ error: '密码长度不能少于 6 位' }, 400)
    }

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { username },
    })

    if (createError) {
      const message = createError.message.includes('already')
        ? '该邮箱已被注册'
        : createError.message.includes('USERNAME_TAKEN')
          ? '用户名已被占用'
          : createError.message
      return json({ error: message }, 400)
    }

    const userId = created.user.id

    // 触发器已建档，此处补全资料并绑定角色
    const { error: profileError } = await admin
      .from('profiles')
      .update({
        username,
        nickname: String(body.nickname ?? '').trim() || username,
        phone: String(body.phone ?? '').trim(),
        gender: normalizeGender(body.gender),
        status: Number(body.status ?? 1),
        email,
        create_by: adminName,
        update_by: adminName,
      })
      .eq('id', userId)

    if (profileError) {
      await admin.auth.admin.deleteUser(userId)
      return json({ error: profileError.message }, 400)
    }

    try {
      await replaceRoles(admin, userId, body.roleCodes)
    }
    catch (error) {
      await admin.auth.admin.deleteUser(userId)
      return json({ error: error instanceof Error ? error.message : '角色绑定失败' }, 400)
    }

    return json({ id: userId })
  }

  if (body.action === 'updatePassword') {
    const userId = String(body.userId ?? '').trim()
    const password = String(body.password ?? '')

    if (!userId || !password) {
      return json({ error: '缺少用户 ID 或新密码' }, 400)
    }
    if (password.length < 6) {
      return json({ error: '密码长度不能少于 6 位' }, 400)
    }

    const { error: passwordError } = await admin.auth.admin.updateUserById(userId, { password })
    if (passwordError) {
      return json({ error: passwordError.message }, 400)
    }

    return json({ id: userId })
  }

  if (body.action === 'delete') {
    const userId = String(body.userId ?? '').trim()

    if (!userId) {
      return json({ error: '缺少用户 ID' }, 400)
    }
    if (userId === userData.user.id) {
      return json({ error: '不能删除当前登录账号' }, 400)
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(userId)
    if (deleteError) {
      return json({ error: deleteError.message }, 400)
    }

    // 账号已删除，尽力清理其头像对象，失败仅记录日志，不影响删除结果
    const { error: avatarError } = await admin.storage
      .from('avatars')
      .remove([`${userId}/avatar`])
    if (avatarError) {
      console.error('清理用户头像失败:', avatarError.message)
    }

    return json({ id: userId })
  }

  return json({ error: '不支持的操作' }, 400)
})
