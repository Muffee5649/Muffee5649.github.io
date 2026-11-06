import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/http/supabase'
import { t } from '@/locale/index'
import { ServiceError, ServiceStatus } from './shared'
import type { AuthUserInfo } from './types'

/**
 * 注册参数
 */
export interface RegisterParams {
  /** 用户名（3-20 个字符，大小写不敏感且唯一） */
  username: string
  /** 密码（不少于 6 位） */
  password: string
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

/** 生成虚拟 Auth 邮箱：时间 id + 随机串，确保注册并发下不重复 */
function createVirtualEmail(domain: 'email.auth' | 'wechat.auth'): string {
  const timeId = `${Date.now()}${Math.random().toString(36).slice(2, 8)}`
  return `${timeId}@${domain}`
}

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

/**
 * Supabase Auth 错误码 → 多语言 key
 * 完整错误码参考：https://supabase.com/docs/guides/auth/debugging/error-codes
 */
const AUTH_ERROR_I18N: Record<string, string> = {
  invalid_credentials: 'auth.error.invalidCredentials',
  email_not_confirmed: 'auth.error.emailNotConfirmed',
  phone_not_confirmed: 'auth.error.phoneNotConfirmed',
  user_not_found: 'auth.error.userNotFound',
  user_banned: 'auth.error.userBanned',
  user_already_exists: 'auth.error.userAlreadyExists',
  email_exists: 'auth.error.emailExists',
  weak_password: 'auth.error.weakPassword',
  same_password: 'auth.error.samePassword',
  signup_disabled: 'auth.error.signupDisabled',
  email_provider_disabled: 'auth.error.emailProviderDisabled',
  email_address_invalid: 'auth.error.emailAddressInvalid',
  validation_failed: 'auth.error.validationFailed',
  too_many_requests: 'auth.error.tooManyRequests',
  over_request_rate_limit: 'auth.error.tooManyRequests',
  over_email_send_rate_limit: 'auth.error.overEmailSendRateLimit',
  request_timeout: 'auth.error.requestTimeout',
  unexpected_failure: 'auth.error.unexpectedFailure',
  conflict: 'auth.error.conflict',
  session_expired: 'auth.error.sessionExpired',
  session_not_found: 'auth.error.sessionExpired',
  refresh_token_not_found: 'auth.error.sessionExpired',
  bad_jwt: 'auth.error.sessionExpired',
  no_authorization: 'auth.error.noAuthorization',
  otp_expired: 'auth.error.otpExpired',
  reauthentication_needed: 'auth.error.reauthenticationNeeded',
}

function toServiceError(error: SupabaseLikeError): AuthServiceError {
  const i18nKey = error.code ? AUTH_ERROR_I18N[error.code] : undefined
  return {
    message: i18nKey ? t(i18nKey) : error.message || t('auth.error.unknown'),
    code: error.code ?? undefined,
    status: error.status,
  }
}

/**
 * 认证服务：用户名 + 密码注册，邮箱或用户名 + 密码登录
 */
export const AuthService = {
  /**
   * 注册
   * Auth 使用时间 id 生成的虚拟邮箱；真实邮箱由用户在个人信息页自行绑定
   */
  async register(params: RegisterParams): Promise<AuthResult> {
    const username = params.username.trim()
    const { password } = params

    if (username.length < USERNAME_MIN_LENGTH || username.length > USERNAME_MAX_LENGTH) {
      return fail(`用户名长度需为 ${USERNAME_MIN_LENGTH}-${USERNAME_MAX_LENGTH} 个字符`)
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
      return fail(`密码长度不能少于 ${PASSWORD_MIN_LENGTH} 个字符`)
    }

    // 提前校验用户名占用，最终唯一性由数据库保证
    const { data: usernameAvailable, error: usernameError } = await supabase.rpc('is_username_available', {
      p_username: username,
    })
    if (usernameError) {
      return { data: null, error: toServiceError(usernameError) }
    }
    if (!usernameAvailable) {
      return fail('用户名已被占用', 'username_taken')
    }

    const { data, error } = await supabase.auth.signUp({
      email: createVirtualEmail('email.auth'),
      password,
      options: {
        data: { username },
      },
    })
    if (error) {
      return { data: null, error: toServiceError(error) }
    }

    return { data, error: null }
  },

  /**
   * 登录
   * account 支持用户名、真实邮箱、虚拟 Auth 邮箱三种形式
   */
  async login(params: LoginParams): Promise<AuthResult> {
    const account = params.account.trim()
    const { password } = params

    if (!account || !password) {
      return fail(t('auth.error.missingCredentials'))
    }

    const { data: resolvedEmail, error } = await supabase.rpc('resolve_login_email', {
      p_account: account,
    })
    if (error) {
      return { data: null, error: toServiceError(error) }
    }

    // 用户名 / 真实邮箱通过 profiles 解析；虚拟邮箱未命中时直接使用
    const email = resolvedEmail || (EMAIL_PATTERN.test(account) ? account : null)
    if (!email) {
      return fail(t('auth.error.invalidCredentials'), 'invalid_credentials')
    }

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (signInError) {
      return { data: null, error: toServiceError(signInError) }
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
        supabase.from('profiles').select('username, avatar_url, email').eq('id', user.id).maybeSingle(),
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
      userName: profile?.username ?? '',
      email: profile?.email ?? '',
      avatar: profile?.avatar_url ?? undefined,
      roles: permission.roles ?? [],
      buttons: permission.buttons ?? [],
    }
  },
}
