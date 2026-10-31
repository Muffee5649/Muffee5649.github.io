import { supabase } from '@/http/supabase'
import { ServiceError, ServiceStatus } from './shared'
import type { RoleList, RoleSearchParams } from './types'

interface RoleListRow {
  role_id: number
  role_name: string
  role_code: string
  description: string
  enabled: boolean
  create_time: string
  update_time: string
  total: number
}

/** 角色新增 / 编辑参数 */
export interface RoleInput {
  roleName: string
  roleCode: string
  description?: string
  enabled?: boolean
}

/**
 * 转换数据库错误为可读信息
 */
function mapRoleError(error: { message: string, code?: string }): ServiceError {
  if (error.code === '23505') {
    return new ServiceError('角色编码已存在', ServiceStatus.error)
  }
  if (error.code === '42501') {
    return new ServiceError('无权操作该角色', ServiceStatus.forbidden)
  }
  if (error.message.includes('SYSTEM_ROLE_PROTECTED')) {
    return new ServiceError('系统内置角色不可删除或修改编码', ServiceStatus.error)
  }
  return new ServiceError(error.message, ServiceStatus.error)
}

/**
 * 系统角色服务
 */
export const RoleService = {
  /**
   * 分页查询角色列表
   */
  async getList(params: RoleSearchParams): Promise<RoleList> {
    const current = params.current ?? 1
    const size = params.size ?? 20

    const { data, error } = await supabase.rpc('get_role_list', {
      p_current: current,
      p_size: size,
      p_role_id: params.roleId ?? null,
      p_role_name: params.roleName ?? null,
      p_role_code: params.roleCode ?? null,
      p_description: params.description ?? null,
      p_enabled: params.enabled ?? null,
      p_start_time: params.startTime ?? null,
      p_end_time: params.endTime ?? null,
    })

    if (error) {
      throw new ServiceError(error.message, ServiceStatus.error)
    }

    const rows = (data ?? []) as RoleListRow[]

    return {
      records: rows.map(row => ({
        roleId: row.role_id,
        roleName: row.role_name,
        roleCode: row.role_code,
        description: row.description,
        enabled: row.enabled,
        createTime: row.create_time,
        updateTime: row.update_time,
      })),
      current,
      size,
      total: rows[0]?.total ?? 0,
    }
  },

  /**
   * 新增角色
   */
  async create(params: RoleInput): Promise<number> {
    const { data, error } = await supabase
      .from('roles')
      .insert({
        code: params.roleCode.trim().toUpperCase(),
        name: params.roleName.trim(),
        description: params.description?.trim() ?? '',
        enabled: params.enabled ?? true,
      })
      .select('id')
      .single()

    if (error) {
      throw mapRoleError(error)
    }

    return data.id as number
  },

  /**
   * 编辑角色
   */
  async update(roleId: number, params: RoleInput): Promise<void> {
    const { error } = await supabase
      .from('roles')
      .update({
        code: params.roleCode.trim().toUpperCase(),
        name: params.roleName.trim(),
        description: params.description?.trim() ?? '',
        enabled: params.enabled ?? true,
      })
      .eq('id', roleId)

    if (error) {
      throw mapRoleError(error)
    }
  },

  /**
   * 删除角色
   */
  async remove(roleId: number): Promise<void> {
    const { error } = await supabase.from('roles').delete().eq('id', roleId)

    if (error) {
      throw mapRoleError(error)
    }
  },
}
