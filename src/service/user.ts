import { supabase } from '@/http/supabase'
import { ServiceError, ServiceStatus } from './shared'
import type { UserList, UserSearchParams } from './types'

interface UserListRow {
  id: string
  avatar: string
  status: string
  user_name: string
  user_gender: string
  nick_name: string
  user_phone: string
  user_email: string
  user_roles: string[] | null
  create_by: string
  create_time: string
  update_by: string
  update_time: string
  total: number
}

/** 新增用户参数 */
export interface UserCreateParams {
  username: string
  email: string
  password: string
  nickname?: string
  phone?: string
  gender?: string
  status?: number
  roleCodes?: string[]
}

/** 编辑用户参数 */
export interface UserUpdateParams {
  nickname?: string
  phone?: string
  gender?: string
  status?: number
  roleCodes?: string[]
  avatarUrl?: string
}

/** 当前登录用户资料 */
export interface UserProfile {
  userId: string
  userName: string
  nickName: string
  realName: string
  userEmail: string
  userPhone: string
  /** male / female / unknown */
  userGender: string
  address: string
  introduction: string
  avatar?: string
}

/** 更新当前登录用户资料参数 */
export interface UserProfileUpdateParams {
  nickName?: string
  realName?: string
  userPhone?: string
  /** male / female / unknown */
  userGender?: string
  address?: string
  introduction?: string
}

const GENDER_MAP: Record<string, string> = {
  male: 'male',
  男: 'male',
  female: 'female',
  女: 'female',
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/

/**
 * 将界面性别转换为数据库枚举值
 */
function toGender(gender?: string): string {
  return gender ? (GENDER_MAP[gender] ?? 'unknown') : 'unknown'
}

/**
 * 读取 Edge Function 返回的错误信息
 */
async function readFunctionError(error: unknown): Promise<string> {
  const context = (error as { context?: Response })?.context
  if (context && typeof context.json === 'function') {
    try {
      const body = await context.json()
      if (body?.error)
        return body.error
    }
    catch {
      // 忽略解析失败，回退到原始错误
    }
  }
  return error instanceof Error ? error.message : '请求失败'
}

/**
 * 转换用户写入操作的数据库错误为可读信息
 */
function mapUserError(message: string): string {
  if (message.includes('CANNOT_REMOVE_OWN_ADMIN')) {
    return '不能移除自己的管理员角色'
  }
  if (message.includes('FORBIDDEN')) {
    return '无权执行该操作'
  }
  return message
}

/**
 * 系统用户服务
 */
export const UserService = {
  /**
   * 分页查询用户列表
   */
  async getList(params: UserSearchParams): Promise<UserList> {
    const current = params.current ?? 1
    const size = params.size ?? 20

    const { data, error } = await supabase.rpc('get_user_list', {
      p_current: current,
      p_size: size,
      p_id: params.id ?? null,
      p_user_name: params.userName ?? null,
      p_user_gender: params.userGender ?? null,
      p_user_phone: params.userPhone ?? null,
      p_user_email: params.userEmail ?? null,
      p_status: params.status ?? null,
    })

    if (error) {
      throw new ServiceError(error.message, ServiceStatus.error)
    }

    const rows = (data ?? []) as UserListRow[]

    return {
      records: rows.map(row => ({
        id: row.id,
        avatar: row.avatar,
        status: row.status,
        userName: row.user_name,
        userGender: row.user_gender,
        nickName: row.nick_name,
        userPhone: row.user_phone,
        userEmail: row.user_email,
        userRoles: row.user_roles ?? [],
        createBy: row.create_by,
        createTime: row.create_time,
        updateBy: row.update_by,
        updateTime: row.update_time,
      })),
      current,
      size,
      total: rows[0]?.total ?? 0,
    }
  },

  /**
   * 新增用户：同步创建 Supabase Auth 账号并绑定角色
   */
  async create(params: UserCreateParams): Promise<string> {
    const { data, error } = await supabase.functions.invoke('admin-users', {
      body: {
        action: 'create',
        username: params.username,
        email: params.email,
        password: params.password,
        nickname: params.nickname,
        phone: params.phone,
        gender: toGender(params.gender),
        status: params.status,
        roleCodes: params.roleCodes,
      },
    })

    if (error) {
      throw new ServiceError(await readFunctionError(error), ServiceStatus.error)
    }
    if (data?.error) {
      throw new ServiceError(data.error, ServiceStatus.error)
    }

    return data.id as string
  },

  /**
   * 编辑用户资料与角色
   */
  async update(id: string, params: UserUpdateParams): Promise<void> {
    const { error } = await supabase.rpc('admin_update_user', {
      p_id: id,
      p_nickname: params.nickname ?? null,
      p_phone: params.phone ?? null,
      p_gender: params.gender ? toGender(params.gender) : null,
      p_status: params.status ?? null,
      p_role_codes: params.roleCodes ?? null,
      p_avatar_url: params.avatarUrl ?? null,
    })

    if (error) {
      throw new ServiceError(mapUserError(error.message), ServiceStatus.error)
    }
  },

  /**
   * 更新当前登录用户的头像地址
   */
  async updateAvatar(avatarUrl: string): Promise<void> {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      throw new ServiceError('登录已过期，请重新登录', ServiceStatus.unauthorized)
    }

    const { error } = await supabase
      .from('profiles')
      .update({ avatar_url: avatarUrl })
      .eq('id', user.id)

    if (error) {
      throw new ServiceError(error.message, ServiceStatus.error)
    }
  },

  /**
   * 更新当前登录用户的真实邮箱
   * 邮箱只写入 profiles，不修改 Supabase Auth 的虚拟登录邮箱
   */
  async updateEmail(email: string): Promise<void> {
    const normalized = email.trim().toLowerCase()
    if (!EMAIL_PATTERN.test(normalized)) {
      throw new ServiceError('邮箱格式不正确', ServiceStatus.error)
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      throw new ServiceError('登录已过期，请重新登录', ServiceStatus.unauthorized)
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError) {
      throw new ServiceError(profileError.message, ServiceStatus.error)
    }

    if ((profile?.email ?? '').toLowerCase() === normalized) {
      return
    }

    const { data: available, error: checkError } = await supabase.rpc('is_email_available', {
      p_email: normalized,
    })
    if (checkError) {
      throw new ServiceError(checkError.message, ServiceStatus.error)
    }
    if (!available) {
      throw new ServiceError('该邮箱已被使用', ServiceStatus.error)
    }

    const { error } = await supabase
      .from('profiles')
      .update({ email: normalized })
      .eq('id', user.id)

    if (error) {
      throw new ServiceError(error.message, ServiceStatus.error)
    }
  },

  /**
   * 获取当前登录用户资料
   * 昵称 / 手机 / 性别存放在 profiles 表，姓名 / 地址 / 个人介绍存放在用户元数据
   */
  async getProfile(): Promise<UserProfile> {
    const { data, error } = await supabase.auth.getUser()

    if (error || !data.user) {
      throw new ServiceError('登录已过期，请重新登录', ServiceStatus.unauthorized)
    }

    const user = data.user
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('username, nickname, phone, email, gender, avatar_url')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError) {
      throw new ServiceError(profileError.message, ServiceStatus.error)
    }

    const metadata = (user.user_metadata ?? {}) as Record<string, unknown>
    const readMeta = (key: string): string =>
      typeof metadata[key] === 'string' ? (metadata[key] as string) : ''

    return {
      userId: user.id,
      userName: profile?.username ?? '',
      nickName: profile?.nickname ?? profile?.username ?? '',
      realName: readMeta('real_name'),
      userEmail: profile?.email ?? '',
      userPhone: profile?.phone ?? '',
      userGender: profile?.gender ?? 'unknown',
      address: readMeta('address'),
      introduction: readMeta('introduction'),
      avatar: profile?.avatar_url ?? undefined,
    }
  },

  /**
   * 更新当前登录用户资料
   * 昵称 / 手机 / 性别写入 profiles，姓名 / 地址 / 个人介绍写入用户元数据
   */
  async updateProfile(params: UserProfileUpdateParams): Promise<void> {
    const { data, error } = await supabase.auth.getUser()

    if (error || !data.user) {
      throw new ServiceError('登录已过期，请重新登录', ServiceStatus.unauthorized)
    }

    const user = data.user
    const profilePayload: Record<string, unknown> = {}

    if (params.nickName !== undefined)
      profilePayload.nickname = params.nickName.trim()
    if (params.userPhone !== undefined)
      profilePayload.phone = params.userPhone.trim()
    if (params.userGender !== undefined)
      profilePayload.gender = toGender(params.userGender)

    if (Object.keys(profilePayload).length > 0) {
      const { error: profileError } = await supabase
        .from('profiles')
        .update(profilePayload)
        .eq('id', user.id)

      if (profileError) {
        throw new ServiceError(profileError.message, ServiceStatus.error)
      }
    }

    const metadataPayload: Record<string, unknown> = {}

    if (params.realName !== undefined)
      metadataPayload.real_name = params.realName.trim()
    if (params.address !== undefined)
      metadataPayload.address = params.address.trim()
    if (params.introduction !== undefined)
      metadataPayload.introduction = params.introduction.trim()

    if (Object.keys(metadataPayload).length > 0) {
      const { error: metadataError } = await supabase.auth.updateUser({
        data: metadataPayload,
      })

      if (metadataError) {
        throw new ServiceError(metadataError.message, ServiceStatus.error)
      }
    }
  },

  /**
   * 管理员修改指定用户密码（无需旧密码）
   */
  async resetPassword(id: string, password: string): Promise<void> {
    const { data, error } = await supabase.functions.invoke('admin-users', {
      body: { action: 'updatePassword', userId: id, password },
    })

    if (error) {
      throw new ServiceError(await readFunctionError(error), ServiceStatus.error)
    }
    if (data?.error) {
      throw new ServiceError(data.error, ServiceStatus.error)
    }
  },

  /**
   * 删除用户：同步删除 Supabase Auth 账号（资料与角色级联删除）
   */
  async remove(id: string): Promise<void> {
    const { data, error } = await supabase.functions.invoke('admin-users', {
      body: { action: 'delete', userId: id },
    })

    if (error) {
      throw new ServiceError(await readFunctionError(error), ServiceStatus.error)
    }
    if (data?.error) {
      throw new ServiceError(data.error, ServiceStatus.error)
    }
  },
}
