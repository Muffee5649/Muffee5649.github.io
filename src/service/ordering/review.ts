import { supabase } from '@/http/supabase'
import { mapOrderingError } from './error'
import type { PaginatedResponse } from '../types'

/** 评价列表行（get_dish_review_list 返回） */
interface DishReviewRow {
  id: number
  dish_id: number
  dish_name: string
  rating: number
  content: string | null
  reviewer_name: string | null
  created_at: string
  updated_at: string
  total: number
}

/** 评价明细项 */
export interface DishReviewItem {
  id: number
  dishId: number
  dishName: string
  /** 评分 1~5 星 */
  rating: number
  content: string | null
  reviewerName: string | null
  createTime: string
  updateTime: string
}

/** 评价查询参数（FR-REV-01） */
export interface DishReviewSearchParams {
  current?: number
  size?: number
  dishId?: number
  rating?: number
}

/** 新增 / 编辑评价参数 */
export interface DishReviewInput {
  /** 所属菜品（编辑时不可变更） */
  dishId: number
  /** 评分 1~5 */
  rating: number
  /** 评价内容，≤ 200 字 */
  content?: string | null
  /** 评价人，≤ 20 字，匿名可为空 */
  reviewerName?: string | null
}

/**
 * 菜品评价服务（PRD 6.7 / FR-REV-01 ~ FR-REV-03）
 */
export const DishReviewService = {
  /**
   * 分页查询评价明细，按评价时间倒序
   */
  async getList(
    params: DishReviewSearchParams = {},
  ): Promise<PaginatedResponse<DishReviewItem>> {
    const current = params.current ?? 1
    const size = params.size ?? 20

    const { data, error } = await supabase.rpc('get_dish_review_list', {
      p_current: current,
      p_size: size,
      p_dish_id: params.dishId ?? null,
      p_rating: params.rating ?? null,
    })

    if (error) {
      throw mapOrderingError(error)
    }

    const rows = (data ?? []) as DishReviewRow[]

    return {
      records: rows.map(row => ({
        id: row.id,
        dishId: row.dish_id,
        dishName: row.dish_name,
        rating: row.rating,
        content: row.content,
        reviewerName: row.reviewer_name,
        createTime: row.created_at,
        updateTime: row.updated_at,
      })),
      current,
      size,
      total: rows[0]?.total ?? 0,
    }
  },

  /**
   * 新增评价（FR-REV-01）：写入后自动重算菜品评分汇总
   */
  async create(input: DishReviewInput): Promise<number> {
    const { data, error } = await supabase.rpc('create_dish_review', {
      p_dish_id: input.dishId,
      p_rating: input.rating,
      p_content: input.content ?? null,
      p_reviewer_name: input.reviewerName ?? null,
    })

    if (error) {
      throw mapOrderingError(error)
    }

    return data as number
  },

  /**
   * 编辑评价（FR-REV-01）：所属菜品不可变更
   */
  async update(id: number, input: DishReviewInput): Promise<void> {
    const { error } = await supabase.rpc('update_dish_review', {
      p_id: id,
      p_rating: input.rating,
      p_content: input.content ?? null,
      p_reviewer_name: input.reviewerName ?? null,
    })

    if (error) {
      throw mapOrderingError(error)
    }
  },

  /**
   * 删除评价（FR-REV-01）：需二次确认，删除后自动重算评分汇总
   */
  async remove(id: number): Promise<void> {
    const { error } = await supabase.rpc('delete_dish_review', {
      p_id: id,
    })

    if (error) {
      throw mapOrderingError(error)
    }
  },
}
