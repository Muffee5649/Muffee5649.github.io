import { supabase } from '@/http/supabase'
import { mapOrderingError } from './error'
import type { PaginatedResponse } from '../types'

/** 分类列表行（get_dish_category_list 返回） */
interface CategoryRow {
  id: number
  name: string
  sort: number
  enabled: boolean
  dish_count: number
  created_at: string
  updated_at: string
  total: number
}

/** 分类列表项 */
export interface DishCategoryItem {
  id: number
  name: string
  sort: number
  enabled: boolean
  /** 下属菜品数量（含停售菜品） */
  dishCount: number
  createTime: string
  updateTime: string
}

/** 分类查询参数（FR-CAT-05；名称/状态筛选为 P1，数据库已支持） */
export interface DishCategorySearchParams {
  current?: number
  size?: number
  name?: string
  enabled?: boolean
}

/** 新增 / 编辑分类参数 */
export interface DishCategoryInput {
  /** 分类名称，全局唯一，1~20 字符 */
  name: string
  /** 排序号，升序展示，默认 0 */
  sort?: number
}

/**
 * 菜品分类服务（FR-CAT）
 */
export const DishCategoryService = {
  /**
   * 分页查询分类列表（含下属菜品数量），按排序号升序
   */
  async getList(
    params: DishCategorySearchParams = {},
  ): Promise<PaginatedResponse<DishCategoryItem>> {
    const current = params.current ?? 1
    const size = params.size ?? 20

    const { data, error } = await supabase.rpc('get_dish_category_list', {
      p_current: current,
      p_size: size,
      p_name: params.name ?? null,
      p_enabled: params.enabled ?? null,
    })

    if (error) {
      throw mapOrderingError(error)
    }

    const rows = (data ?? []) as CategoryRow[]

    return {
      records: rows.map(row => ({
        id: row.id,
        name: row.name,
        sort: row.sort,
        enabled: row.enabled,
        dishCount: row.dish_count,
        createTime: row.created_at,
        updateTime: row.updated_at,
      })),
      current,
      size,
      total: rows[0]?.total ?? 0,
    }
  },

  /**
   * 新增分类（FR-CAT-01）：名称全局唯一，创建后默认启用
   */
  async create(input: DishCategoryInput): Promise<number> {
    const { data, error } = await supabase.rpc('create_dish_category', {
      p_name: input.name.trim(),
      p_sort: input.sort ?? 0,
    })

    if (error) {
      throw mapOrderingError(error)
    }

    return data as number
  },

  /**
   * 编辑分类（FR-CAT-02）：改名仍需唯一，排序号调整即时生效
   */
  async update(id: number, input: DishCategoryInput): Promise<void> {
    const { error } = await supabase.rpc('update_dish_category', {
      p_id: id,
      p_name: input.name.trim(),
      p_sort: input.sort ?? 0,
    })

    if (error) {
      throw mapOrderingError(error)
    }
  },

  /**
   * 启用 / 停用分类（FR-CAT-03）：随时可切、即时生效，不影响历史订单
   */
  async setEnabled(id: number, enabled: boolean): Promise<void> {
    const { error } = await supabase.rpc('set_dish_category_enabled', {
      p_id: id,
      p_enabled: enabled,
    })

    if (error) {
      throw mapOrderingError(error)
    }
  },

  /**
   * 删除分类（FR-CAT-04）：分类下有菜品时阻断；需二次确认，不可恢复
   */
  async remove(id: number): Promise<void> {
    const { error } = await supabase.rpc('delete_dish_category', {
      p_id: id,
    })

    if (error) {
      throw mapOrderingError(error)
    }
  },
}
