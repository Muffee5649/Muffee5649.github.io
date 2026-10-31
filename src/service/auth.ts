import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/http/supabase'
import { ServiceError, ServiceStatus } from './shared'
import type { AuthUserInfo } from './types'

/**
 * 注册参数
 */
export interface RegisterParams {
  /** 邮箱 */
  email: string
  /** 用户名（3-20 个字符，大小写不敏感且唯一） */
  username: string
  /** 密码（不少于 6 位） */
  password: string
  /** 邮箱确认后的跳转地址 */
  emailRedirectTo?: string
}

/**
 * 登录参数
 */
export interface LoginParams {
  /** 邮箱或用户名 */
  account: string
  /** 密码 */
  password: string
}

/**
 * 认证成功后返回的数据
 */
export interface AuthSessionData {
  user: User | null
  session: Session | null
}

/**
 * 统一的错误结构
 */
export interface AuthServiceError {
  message: string
  code?: string
  status?: number
}

/**
 * 修改密码参数
 */
export interface ChangePasswordParams {
  /** 当前密码 */
  currentPassword: string
  /** 新密码 */
  newPassword: string
}

export type AuthResult<T = AuthSessionData>
  = | { data: T, error: null }
    | { data: null, error: AuthServiceError }

const EMAIL_PATTERN = /^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/
const USERNAME_MIN_LENGTH = 3
const USERNAME_MAX_LENGTH = 20
const PASSWORD_MIN_LENGTH = 6

function fail<T = AuthSessionData>(message: string, code?: string): AuthResult<T> {
  return {
    data: null,
    error: { message, code },
  }
}

interface SupabaseLikeError {
  message: string
  code?: string | null
  status?: number
}

function toServiceError(error: SupabaseLikeError): AuthServiceError {
  return {
    message: error.message,
    code: error.code ?? undefined,
    status: error.status,
  }
}

/**
 * 认证服务：邮箱 + 用户名 + 密码注册，邮箱或用户名 + 密码登录
 */
export const AuthService = {
  /**
   * 注册
   * 用户名通过 signUp 的 user_metadata 传递，由数据库触发器写入 profiles 表
   */
  async register(params: RegisterParams): Promise<AuthResult> {
    const email = params.email.trim().toLowerCase()
    const username = params.username.trim()
    const { password, emailRedirectTo } = params

    if (!EMAIL_PATTERN.test(email)) {
      return fail('邮箱格式不正确')
    }
    if (username.length < USERNAME_MIN_LENGTH || username.length > USERNAME_MAX_LENGTH) {
      return fail(`用户名长度需为 ${USERNAME_MIN_LENGTH}-${USERNAME_MAX_LENGTH} 个字符`)
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
      return fail(`密码长度不能少于 ${PASSWORD_MIN_LENGTH} 个字符`)
    }

    // 提前校验用户名占用，最终唯一性由数据库唯一索引保证
    const { data: available, error: checkError } = await supabase.rpc('is_username_available', {
      p_username: username,
    })
    if (checkError) {
      return { data: null, error: toServiceError(checkError) }
    }
    if (!available) {
      return fail('用户名已被占用', 'username_taken')
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username },
        emailRedirectTo,
      },
    })
    if (error) {
      return { data: null, error: toServiceError(error) }
    }

    return { data, error: null }
  },

  /**
   * 登录
   * account 含 @ 时按邮箱登录，否则先解析用户名再登录
   */
  async login(params: LoginParams): Promise<AuthResult> {
    const account = params.account.trim()
    const { password } = params

    if (!account || !password) {
      return fail('请输入账号和密码')
    }

    let email = account
    if (!EMAIL_PATTERN.test(account)) {
      const { data: resolvedEmail, error } = await supabase.rpc('get_email_by_username', {
        p_username: account,
      })
      if (error) {
        return { data: null, error: toServiceError(error) }
      }
      if (!resolvedEmail) {
        return fail('用户名或密码错误', 'invalid_credentials')
      }
      email = resolvedEmail
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      return { data: null, error: toServiceError(error) }
    }

    return { data, error: null }
  },

  /**
   * 修改当前登录用户密码
   * 先用当前密码重新校验身份，再更新密码，避免旧密码错误时直接改密
   */
  async changePassword(params: ChangePasswordParams): Promise<AuthResult<null>> {
    const { currentPassword, newPassword } = params

    if (!currentPassword) {
      return fail<null>('请输入当前密码')
    }
    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      return fail<null>(`密码长度不能少于 ${PASSWORD_MIN_LENGTH} 个字符`)
    }

    const { data, error } = await supabase.auth.getUser()
    if (error || !data.user?.email) {
      return fail<null>('登录已过期，请重新登录')
    }

    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: data.user.email,
      password: currentPassword,
    })

    if (verifyError) {
      const isInvalid = verifyError.code === 'invalid_credentials'
      return fail<null>(
        isInvalid ? '当前密码不正确' : verifyError.message,
        verifyError.code ?? undefined,
      )
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
    if (updateError) {
      return fail<null>(updateError.message, updateError.code ?? undefined)
    }

    return { data: null, error: null }
  },

  /**
   * 向新邮箱发送改绑验证码
   * 需要在 Supabase 控制台关闭 “Secure email change”，只向新邮箱发验证码
   */
  async sendEmailChangeCode(newEmail: string): Promise<AuthResult<null>> {
    const email = newEmail.trim().toLowerCase()
    if (!EMAIL_PATTERN.test(email)) {
      return fail<null>('邮箱格式不正确')
    }

    const { data, error } = await supabase.auth.getUser()
    if (error || !data.user) {
      return fail<null>('登录已过期，请重新登录')
    }
    if (data.user.email?.toLowerCase() === email) {
      return fail<null>('新邮箱与当前邮箱相同')
    }

    const { error: updateError } = await supabase.auth.updateUser({ email })
    if (updateError) {
      return { data: null, error: toServiceError(updateError) }
    }

    return { data: null, error: null }
  },

  /**
   * 用邮箱验证码完成改绑，并同步 profiles.email
   */
  async confirmEmailChange(newEmail: string, token: string): Promise<AuthResult<null>> {
    const email = newEmail.trim().toLowerCase()
    const code = token.trim()
    if (!EMAIL_PATTERN.test(email)) {
      return fail<null>('邮箱格式不正确')
    }
    if (!/^\d{6}$/.test(code)) {
      return fail<null>('请输入 6 位验证码')
    }

    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: 'email_change',
    })
    if (error) {
      return fail<null>(error.message, error.code ?? undefined)
    }

    // profiles 是资料主存储，改绑后同步邮箱；失败只影响展示，不回滚认证结果
    const { data } = await supabase.auth.getUser()
    if (data.user) {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ email: data.user.email ?? email })
        .eq('id', data.user.id)
      if (profileError) {
        console.error('同步 profiles 邮箱失败:', profileError.message)
      }
    }

    return { data: null, error: null }
  },

  /**
   * 退出登录
   */
  async logout(): Promise<void> {
    await supabase.auth.signOut()
  },

  /**
   * 获取当前登录用户信息
   * 以 Supabase 会话为准，资料取自 profiles 表
   */
  async getUserInfo(): Promise<AuthUserInfo> {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    if (error || !user) {
      throw new ServiceError(error?.message ?? '登录已过期，请重新登录', ServiceStatus.unauthorized)
    }

    const [{ data: profile, error: profileError }, { data: permissions, error: permissionError }]
      = await Promise.all([
        supabase.from('profiles').select('username, avatar_url').eq('id', user.id).maybeSingle(),
        supabase.rpc('get_user_permissions'),
      ])

    if (profileError) {
      throw new ServiceError(profileError.message, ServiceStatus.error)
    }

    if (permissionError) {
      throw new ServiceError(permissionError.message, ServiceStatus.error)
    }

    const permission = (permissions?.[0] ?? {}) as { roles?: string[], buttons?: string[] }

    return {
      userId: user.id,
      userName: profile?.username ?? user.email ?? '',
      email: user.email ?? '',
      avatar: profile?.avatar_url ?? undefined,
      roles: permission.roles ?? [],
      buttons: permission.buttons ?? [],
    }
  },
}
