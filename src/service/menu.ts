import { supabase } from '@/http/supabase'
import { ServiceError, ServiceStatus } from './shared'
import type { AppRouteRecord, MenuAuthItem, RouteMeta } from './types'

interface MenuRow {
  id: number
  parent_id: number | null
  name: string
  path: string
  component: string | null
  redirect: string | null
  meta: RouteMeta
  sort: number
  status?: number
  created_at?: string
  updated_at?: string
}

/** 按钮权限项 */
export type MenuAuth = MenuAuthItem

/** 菜单新增 / 编辑参数 */
export interface MenuInput {
  parentId?: number | null
  name: string
  path: string
  component?: string | null
  redirect?: string | null
  meta: RouteMeta
  sort?: number
  status?: number
}

/**
 * 转换为数据库字段
 */
function toMenuRow(input: MenuInput) {
  return {
    parent_id: input.parentId ?? null,
    name: input.name,
    path: input.path,
    component: input.component || null,
    redirect: input.redirect || null,
    meta: input.meta,
    sort: input.sort ?? 0,
    status: input.status ?? 1,
  }
}

/**
 * 读取菜单 meta
 */
async function readMeta(menuId: number): Promise<RouteMeta> {
  const { data, error } = await supabase.from('menus').select('meta').eq('id', menuId).single()

  if (error) {
    throw new ServiceError(error.message, ServiceStatus.error)
  }

  return (data?.meta ?? {}) as RouteMeta
}

/**
 * 写回菜单 meta
 */
async function writeMeta(menuId: number, meta: RouteMeta): Promise<void> {
  const { error } = await supabase.from('menus').update({ meta }).eq('id', menuId)

  if (error) {
    throw new ServiceError(error.message, ServiceStatus.error)
  }
}

/**
 * 系统菜单服务
 */
export const MenuService = {
  /**
   * 查询菜单管理列表（含禁用菜单）并组装为路由树
   */
  async getList(): Promise<AppRouteRecord[]> {
    const { data, error } = await supabase.rpc('get_menu_list', {
      p_name: null,
      p_route: null,
    })

    if (error) {
      throw new ServiceError(error.message, ServiceStatus.error)
    }

    return buildMenuTree((data ?? []) as MenuRow[])
  },

  /**
   * 查询当前用户可见的启用菜单（用于生成导航路由）
   */
  async getRouteMenus(): Promise<AppRouteRecord[]> {
    const { data, error } = await supabase.rpc('get_user_menus')

    if (error) {
      throw new ServiceError(error.message, ServiceStatus.error)
    }

    return buildMenuTree((data ?? []) as MenuRow[])
  },

  /**
   * 新增菜单
   */
  async create(input: MenuInput): Promise<number> {
    const { data, error } = await supabase
      .from('menus')
      .insert(toMenuRow(input))
      .select('id')
      .single()

    if (error) {
      throw new ServiceError(error.message, ServiceStatus.error)
    }

    return data.id as number
  },

  /**
   * 编辑菜单
   */
  async update(id: number, input: MenuInput): Promise<void> {
    const { error } = await supabase.from('menus').update(toMenuRow(input)).eq('id', id)

    if (error) {
      throw new ServiceError(error.message, ServiceStatus.error)
    }
  },

  /**
   * 删除菜单（子菜单级联删除）
   */
  async remove(id: number): Promise<void> {
    const { error } = await supabase.from('menus').delete().eq('id', id)

    if (error) {
      throw new ServiceError(error.message, ServiceStatus.error)
    }
  },

  /**
   * 新增按钮权限（写入所属菜单的 meta.authList）
   */
  async addAuth(menuId: number, auth: MenuAuth): Promise<void> {
    const meta = await readMeta(menuId)
    const authList = [...(meta.authList ?? []), auth]

    await writeMeta(menuId, { ...meta, authList })
  },

  /**
   * 编辑按钮权限
   */
  async updateAuth(menuId: number, authMark: string, auth: MenuAuth): Promise<void> {
    const meta = await readMeta(menuId)
    const authList = (meta.authList ?? []).map(item => (item.authMark === authMark ? auth : item))

    await writeMeta(menuId, { ...meta, authList })
  },

  /**
   * 删除按钮权限
   */
  async removeAuth(menuId: number, authMark: string): Promise<void> {
    const meta = await readMeta(menuId)
    const authList = (meta.authList ?? []).filter(item => item.authMark !== authMark)

    await writeMeta(menuId, { ...meta, authList })
  },
}

/**
 * 将扁平的菜单记录组装为路由树
 */
function buildMenuTree(rows: MenuRow[]): AppRouteRecord[] {
  const nodeMap = new Map<number, AppRouteRecord>()
  const roots: AppRouteRecord[] = []

  rows.forEach((row) => {
    nodeMap.set(row.id, {
      id: row.id,
      parentId: row.parent_id,
      name: row.name,
      path: row.path,
      component: row.component ?? undefined,
      redirect: row.redirect ?? undefined,
      status: row.status,
      meta: row.meta,
    })
  })

  rows.forEach((row) => {
    const node = nodeMap.get(row.id)!
    const parent = row.parent_id === null ? undefined : nodeMap.get(row.parent_id)

    if (parent) {
      if (!parent.children)
        parent.children = []
      parent.children.push(node)
    }
    else {
      roots.push(node)
    }
  })

  return roots
}
