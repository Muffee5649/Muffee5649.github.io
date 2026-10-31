import { supabase } from '@/http/supabase'
import { ServiceError, ServiceStatus } from '../shared'
import { mapOrderingError } from './error'
import type { PaginatedResponse } from '../types'
import type { DishStatus } from './types'

/** 菜品列表行（get_dish_list 返回） */
interface DishRow {
  id: number
  name: string
  category_ids: number[] | null
  category_names: string[] | null
  price_cents: number
  unit: string
  image_urls: string[] | null
  detail_image_urls: string[] | null
  description: string | null
  tags: string[] | null
  status: DishStatus
  sort: number
  stock_enabled: boolean
  stock: number
  auto_replenish: boolean
  replenish_time: string
  replenish_stock: number
  sales_count: number
  /** 平均评分，0~5，保留两位小数 */
  rating_avg: number
  rating_count: number
  created_at: string
  updated_at: string
  total: number
}

/** 菜品列表项 */
export interface DishItem {
  id: number
  name: string
  /** 归属分类（可多个，按分类排序号排列） */
  categoryIds: number[]
  categoryNames: string[]
  /** 价格（分），精确到 0.01 元 */
  priceCents: number
  unit: string
  /** 主图（可多张），第一张作为列表缩略图 */
  imageUrls: string[]
  /** 详情图（可多张） */
  detailImageUrls: string[]
  description: string | null
  tags: string[]
  status: DishStatus
  sort: number
  /** 是否启用库存管理 */
  stockEnabled: boolean
  /** 当前库存数量，仅启用库存时有意义 */
  stock: number
  /** 是否每日自动补充库存 */
  autoReplenish: boolean
  /** 每日自动补充时间，格式 HH:mm:ss */
  replenishTime: string
  /** 每日自动补充后的库存数量 */
  replenishStock: number
  /** 累计销量 */
  salesCount: number
  /** 平均评分，0~5 */
  ratingAvg: number
  /** 评价数量 */
  ratingCount: number
  createTime: string
  updateTime: string
}

/** 菜品查询参数（FR-DISH-05：支持分类筛选；名称搜索为 P1，数据库已支持） */
export interface DishSearchParams {
  current?: number
  size?: number
  name?: string
  categoryId?: number
  status?: DishStatus
}

/** 新增 / 编辑菜品参数 */
export interface DishInput {
  /** 所属分类（可多个，必须均为启用状态的分类） */
  categoryIds: number[]
  /** 菜品名称，全局唯一，1~50 字符 */
  name: string
  /** 价格（分），> 0 */
  priceCents: number
  /** 单位，默认"份" */
  unit?: string
  /** 主图（可多张） */
  imageUrls?: string[]
  /** 详情图（可多张） */
  detailImageUrls?: string[]
  /** 描述，≤ 200 字 */
  description?: string | null
  /** 展示标签，如"辣""招牌"，仅展示不参与业务逻辑 */
  tags?: string[]
  /** 分类内排序号，默认 0 */
  sort?: number
  /** 是否启用库存管理 */
  stockEnabled?: boolean
  /** 当前库存数量，仅启用库存时有意义 */
  stock?: number
  /** 是否每日自动补充库存 */
  autoReplenish?: boolean
  /** 每日自动补充时间，格式 HH:mm:ss，默认 02:00:00 */
  replenishTime?: string
  /** 每日自动补充后的库存数量 */
  replenishStock?: number
}

/** 点餐页菜品（仅在售） */
export interface OrderingMenuDish {
  id: number
  name: string
  priceCents: number
  unit: string
  imageUrl: string | null
  description: string | null
  tags: string[]
}

/** 点餐页分类分组：启用分类（按排序号）→ 在售菜品（按排序号）两级组织（PRD 6.6） */
export interface OrderingMenuCategory {
  id: number
  name: string
  dishes: OrderingMenuDish[]
}

/** 点餐页菜品行（dishes 表直查） */
interface OrderingMenuDishRow {
  id: number
  name: string
  price_cents: number
  unit: string
  image_urls: string[] | null
  description: string | null
  tags: string[] | null
  /** 菜品归属分类关联 */
  dish_category_links: Array<{ category_id: number }> | null
}

/**
 * 菜品服务（FR-DISH）
 */
export const DishService = {
  /**
   * 分页查询菜品列表（含分类名称），支持名称 / 分类 / 状态筛选
   */
  async getList(params: DishSearchParams = {}): Promise<PaginatedResponse<DishItem>> {
    const current = params.current ?? 1
    const size = params.size ?? 20

    const { data, error } = await supabase.rpc('get_dish_list', {
      p_current: current,
      p_size: size,
      p_name: params.name ?? null,
      p_category_id: params.categoryId ?? null,
      p_status: params.status ?? null,
    })

    if (error) {
      throw mapOrderingError(error)
    }

    const rows = (data ?? []) as DishRow[]

    return {
      records: rows.map(row => ({
        id: row.id,
        name: row.name,
        categoryIds: row.category_ids ?? [],
        categoryNames: row.category_names ?? [],
        priceCents: row.price_cents,
        unit: row.unit,
        imageUrls: row.image_urls ?? [],
        detailImageUrls: row.detail_image_urls ?? [],
        description: row.description,
        tags: row.tags ?? [],
        status: row.status,
        sort: row.sort,
        stockEnabled: row.stock_enabled,
        stock: row.stock,
        autoReplenish: row.auto_replenish,
        replenishTime: row.replenish_time,
        replenishStock: row.replenish_stock,
        salesCount: row.sales_count,
        ratingAvg: Number(row.rating_avg),
        ratingCount: row.rating_count,
        createTime: row.created_at,
        updateTime: row.updated_at,
      })),
      current,
      size,
      total: rows[0]?.total ?? 0,
    }
  },

  /**
   * 新增菜品（FR-DISH-01）：名称全局唯一，创建后默认在售
   */
  async create(input: DishInput): Promise<number> {
    const { data, error } = await supabase.rpc('create_dish', {
      p_category_ids: input.categoryIds,
      p_name: input.name.trim(),
      p_price_cents: input.priceCents,
      p_unit: input.unit?.trim() || '份',
      p_image_urls: input.imageUrls ?? [],
      p_detail_image_urls: input.detailImageUrls ?? [],
      p_description: input.description?.trim() || null,
      p_tags: input.tags ?? [],
      p_sort: input.sort ?? 0,
      p_stock_enabled: input.stockEnabled ?? false,
      p_stock: input.stock ?? 0,
      p_auto_replenish: input.autoReplenish ?? false,
      p_replenish_time: input.replenishTime || '02:00:00',
      p_replenish_stock: input.replenishStock ?? 0,
    })

    if (error) {
      throw mapOrderingError(error)
    }

    return data as number
  },

  /**
   * 编辑菜品（FR-DISH-02）：改价改名仅影响之后新订单（快照规则），更换分类须为启用分类
   */
  async update(id: number, input: DishInput): Promise<void> {
    const { error } = await supabase.rpc('update_dish', {
      p_id: id,
      p_category_ids: input.categoryIds,
      p_name: input.name.trim(),
      p_price_cents: input.priceCents,
      p_unit: input.unit?.trim() || '份',
      p_image_urls: input.imageUrls ?? [],
      p_detail_image_urls: input.detailImageUrls ?? [],
      p_description: input.description?.trim() || null,
      p_tags: input.tags ?? [],
      p_sort: input.sort ?? 0,
      p_stock_enabled: input.stockEnabled ?? false,
      p_stock: input.stock ?? 0,
      p_auto_replenish: input.autoReplenish ?? false,
      p_replenish_time: input.replenishTime || '02:00:00',
      p_replenish_stock: input.replenishStock ?? 0,
    })

    if (error) {
      throw mapOrderingError(error)
    }
  },

  /**
   * 在售 / 停售切换（FR-DISH-03）：随时可切、即时生效，历史订单条目不受影响
   */
  async setStatus(id: number, status: DishStatus): Promise<void> {
    const { error } = await supabase.rpc('set_dish_status', {
      p_id: id,
      p_status: status,
    })

    if (error) {
      throw mapOrderingError(error)
    }
  },

  /**
   * 删除菜品（FR-DISH-04）：被订单条目或预点菜单引用时仅可停售；需二次确认，不可恢复
   */
  async remove(id: number): Promise<void> {
    const { error } = await supabase.rpc('delete_dish', {
      p_id: id,
    })

    if (error) {
      throw mapOrderingError(error)
    }
  },

  /**
   * 查询点餐页两级菜单：启用分类（按排序号）→ 在售菜品（按排序号）
   *
   * 供点单（FR-ORD-02）与预点菜单（FR-RSV-07）的菜品选择组件使用
   */
  async getOrderingMenu(): Promise<OrderingMenuCategory[]> {
    const [categoriesResult, dishesResult] = await Promise.all([
      supabase
        .from('dish_categories')
        .select('id, name')
        .eq('enabled', true)
        .order('sort', { ascending: true })
        .order('id', { ascending: true }),
      supabase
        .from('dishes')
        .select(
          'id, name, price_cents, unit, image_urls, description, tags, dish_category_links(category_id)',
        )
        .eq('status', 'on_sale')
        .order('sort', { ascending: true })
        .order('id', { ascending: true }),
    ])

    if (categoriesResult.error) {
      throw new ServiceError(categoriesResult.error.message, ServiceStatus.error)
    }
    if (dishesResult.error) {
      throw new ServiceError(dishesResult.error.message, ServiceStatus.error)
    }

    const categories = (categoriesResult.data ?? []) as { id: number, name: string }[]
    const dishes = (dishesResult.data ?? []) as OrderingMenuDishRow[]

    return categories.map(category => ({
      id: category.id,
      name: category.name,
      dishes: dishes
        .filter(dish =>
          (dish.dish_category_links ?? []).some(link => link.category_id === category.id),
        )
        .map(dish => ({
          id: dish.id,
          name: dish.name,
          priceCents: dish.price_cents,
          unit: dish.unit,
          imageUrl: dish.image_urls?.[0] ?? null,
          description: dish.description,
          tags: dish.tags ?? [],
        })),
    }))
  },
}
