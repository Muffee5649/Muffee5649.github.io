import { supabase } from '@/http/supabase'
import { ServiceError, ServiceStatus } from '../shared'
import { mapOrderingError } from './error'
import type { PaginatedResponse } from '../types'
import type { DiningTableType, DishStatus, ReservationStatus } from './types'

/** 预点菜单条目参数（FR-RSV-07）：仅可选在售菜品，不记录价格 */
export interface PreOrderItemInput {
  dishId: number
  /** 数量 ≥ 1 */
  quantity: number
  /** 条目备注，≤ 50 字 */
  note?: string | null
}

/** 创建 / 编辑预定参数（FR-RSV-01 / FR-RSV-06） */
export interface ReservationInput {
  /** 预定桌号类型：room 房间（可指定具体桌）；hall / outdoor（系统按人数随机分配） */
  tableType: DiningTableType
  /**
   * 指定餐桌 id：room 类型必填；
   * hall / outdoor 类型不传（由系统随机分配，传入会被拒绝）
   */
  tableId?: number | null
  /** 预定人姓名，1~20 字符 */
  guestName: string
  /** 联系电话 */
  phone: string
  /** 预定到店时间（ISO 字符串），必须晚于当前时间 */
  arrivalTime: string
  /** 用餐人数，≥ 1，随机分配与容量提示的依据 */
  partySize: number
  /** 是否提前备菜，默认否，仅标记记录 */
  prepMeal?: boolean
  /** 备注，≤ 50 字，如"生日""靠窗" */
  note?: string | null
  /** 预点菜单（可选）；编辑时整体替换 */
  preOrders?: PreOrderItemInput[] | null
}

/** 预定列表行（get_reservation_list 返回） */
interface ReservationRow {
  id: number
  reservation_no: string
  table_type: DiningTableType
  table_id: number
  table_no: string
  guest_name: string
  phone: string
  arrival_time: string
  party_size: number
  prep_meal: boolean
  note: string | null
  status: ReservationStatus
  session_id: number | null
  pre_order_count: number
  created_by: string
  created_at: string
  updated_at: string
  total: number
}

/** 预定列表项（FR-RSV-02） */
export interface ReservationItem {
  id: number
  reservationNo: string
  tableType: DiningTableType
  tableId: number
  tableNo: string
  guestName: string
  phone: string
  arrivalTime: string
  partySize: number
  prepMeal: boolean
  note: string | null
  status: ReservationStatus
  /** 到店核销后关联的开台 id（可跳转消费总览） */
  sessionId: number | null
  /** 预点菜单条目数（可展开明细） */
  preOrderCount: number
  createdBy: string
  createTime: string
  updateTime: string
}

/** 预定查询参数（FR-RSV-02：按日期 / 状态 / 桌号 / 类型筛选） */
export interface ReservationSearchParams {
  current?: number
  size?: number
  /** 到店日期，格式 YYYY-MM-DD */
  arrivalDate?: string
  status?: ReservationStatus
  tableNo?: string
  tableType?: DiningTableType
}

/** 预点菜单明细项（FR-RSV-02 可展开）：菜品状态为最新在售/停售态供转单提示 */
export interface ReservationPreOrderItem {
  id: number
  dishId: number
  dishName: string
  quantity: number
  note: string | null
  /** 菜品当前状态：核销转单时已停售的条目会被自动跳过 */
  dishStatus: DishStatus
}

/** 到店开台核销结果（FR-RSV-03） */
export interface CheckInResult {
  /** 关联开台 id */
  sessionId: number
  /** 预点菜单转成的首笔订单 id；预点为空或全部停售时为 null */
  orderId: number | null
  /** 转单时被跳过的已停售菜品名称（提示店员） */
  skippedDishes: string[]
}

/** 预点菜单明细行（get_reservation_pre_orders 返回） */
interface PreOrderRow {
  id: number
  dish_id: number
  dish_name: string
  quantity: number
  note: string | null
  status: DishStatus
}

/** 到店核销 jsonb 原始结构 */
interface CheckInRow {
  session_id: number
  order_id: number | null
  skipped_dishes: string[] | null
}

/** 创建预定结果：分配结果（桌号）需展示给店员（FR-RSV-01） */
export interface CreateReservationResult {
  id: number
  reservationNo: string
  tableId: number
  tableNo: string
}

/**
 * 将预点菜单参数转换为 RPC jsonb 结构
 *
 * null 表示不传（创建时无预点 / 编辑时保留原预点菜单）；空数组表示清空预点菜单
 */
function toPreOrdersJsonb(preOrders?: PreOrderItemInput[] | null): unknown {
  if (preOrders === undefined || preOrders === null) {
    return null
  }

  return preOrders.map(item => ({
    dish_id: item.dishId,
    quantity: item.quantity,
    note: item.note ?? null,
  }))
}

/**
 * 预定服务（FR-RSV）
 */
export const ReservationService = {
  /**
   * 创建预定（FR-RSV-01）：房间可指定具体桌，其余类型按人数随机分配；
   * 同桌已约定预定的到店时间间隔不足 120 分钟时提示冲突
   *
   * @returns 预定 id 与分配的桌号（用于展示分配结果）
   */
  async create(input: ReservationInput): Promise<CreateReservationResult> {
    const { data: id, error } = await supabase.rpc('create_reservation', {
      p_table_type: input.tableType,
      p_table_id: input.tableId ?? null,
      p_guest_name: input.guestName.trim(),
      p_phone: input.phone.trim(),
      p_arrival_time: input.arrivalTime,
      p_party_size: input.partySize,
      p_prep_meal: input.prepMeal ?? false,
      p_note: input.note?.trim() || null,
      p_pre_orders: toPreOrdersJsonb(input.preOrders),
    })

    if (error) {
      throw mapOrderingError(error)
    }

    // 回查分配结果（RLS 允许 authenticated 读取）
    const { data, error: detailError } = await supabase
      .from('reservations')
      .select('reservation_no, table_id, dining_tables(table_no)')
      .eq('id', id as number)
      .single()

    if (detailError || !data) {
      throw new ServiceError(
        detailError?.message ?? '预定创建成功，但查询分配结果失败',
        ServiceStatus.error,
      )
    }

    const detail = data as {
      reservation_no: string
      table_id: number
      dining_tables: { table_no: string }[] | null
    }

    return {
      id: id as number,
      reservationNo: detail.reservation_no,
      tableId: detail.table_id,
      tableNo: detail.dining_tables?.[0]?.table_no ?? '',
    }
  },

  /**
   * 编辑预定（FR-RSV-06）：仅已约定状态可编辑；类型 / 人数变更时桌位重新分配，预点菜单整体替换
   */
  async update(id: number, input: ReservationInput): Promise<void> {
    const { error } = await supabase.rpc('update_reservation', {
      p_id: id,
      p_table_type: input.tableType,
      p_table_id: input.tableId ?? null,
      p_guest_name: input.guestName.trim(),
      p_phone: input.phone.trim(),
      p_arrival_time: input.arrivalTime,
      p_party_size: input.partySize,
      p_prep_meal: input.prepMeal ?? false,
      p_note: input.note?.trim() || null,
      p_pre_orders: toPreOrdersJsonb(input.preOrders),
    })

    if (error) {
      throw mapOrderingError(error)
    }
  },

  /**
   * 预定列表（FR-RSV-02）：按到店时间排序，支持日期 / 状态 / 桌号 / 类型筛选
   */
  async getList(
    params: ReservationSearchParams = {},
  ): Promise<PaginatedResponse<ReservationItem>> {
    const current = params.current ?? 1
    const size = params.size ?? 20

    const { data, error } = await supabase.rpc('get_reservation_list', {
      p_current: current,
      p_size: size,
      p_arrival_date: params.arrivalDate ?? null,
      p_status: params.status ?? null,
      p_table_no: params.tableNo ?? null,
      p_table_type: params.tableType ?? null,
    })

    if (error) {
      throw mapOrderingError(error)
    }

    const rows = (data ?? []) as ReservationRow[]

    return {
      records: rows.map(row => ({
        id: row.id,
        reservationNo: row.reservation_no,
        tableType: row.table_type,
        tableId: row.table_id,
        tableNo: row.table_no,
        guestName: row.guest_name,
        phone: row.phone,
        arrivalTime: row.arrival_time,
        partySize: row.party_size,
        prepMeal: row.prep_meal,
        note: row.note,
        status: row.status,
        sessionId: row.session_id,
        preOrderCount: Number(row.pre_order_count),
        createdBy: row.created_by,
        createTime: row.created_at,
        updateTime: row.updated_at,
      })),
      current,
      size,
      total: rows[0]?.total ?? 0,
    }
  },

  /**
   * 查看预点菜单明细（FR-RSV-02 可展开）：返回菜品最新状态供核销前提示
   */
  async getPreOrders(reservationId: number): Promise<ReservationPreOrderItem[]> {
    const { data, error } = await supabase.rpc('get_reservation_pre_orders', {
      p_reservation_id: reservationId,
    })

    if (error) {
      throw mapOrderingError(error)
    }

    const rows = (data ?? []) as PreOrderRow[]

    return rows.map(row => ({
      id: row.id,
      dishId: row.dish_id,
      dishName: row.dish_name,
      quantity: row.quantity,
      note: row.note,
      dishStatus: row.status,
    }))
  },

  /**
   * 到店开台核销（FR-RSV-03）：创建关联开台，预点菜单转首笔订单；
   * 已停售条目自动跳过并在结果中提示；该桌正在就餐时阻断
   *
   * @param dinerCount 补填用餐人数，不传则取预定的用餐人数
   */
  async checkIn(reservationId: number, dinerCount?: number | null): Promise<CheckInResult> {
    const { data, error } = await supabase.rpc('check_in_reservation', {
      p_id: reservationId,
      p_diner_count: dinerCount ?? null,
    })

    if (error) {
      throw mapOrderingError(error)
    }

    const row = data as CheckInRow

    return {
      sessionId: row.session_id,
      orderId: row.order_id,
      skippedDishes: row.skipped_dishes ?? [],
    }
  },

  /**
   * 取消预定（FR-RSV-04）：仅已约定状态可取消；桌状态按优先级自动释放
   */
  async cancel(id: number): Promise<void> {
    const { error } = await supabase.rpc('cancel_reservation', {
      p_id: id,
    })

    if (error) {
      throw mapOrderingError(error)
    }
  },

  /**
   * 标记未到店（FR-RSV-05）：超过到店时间顾客未到时手动标记；桌状态自动释放
   */
  async markNoShow(id: number): Promise<void> {
    const { error } = await supabase.rpc('mark_reservation_no_show', {
      p_id: id,
    })

    if (error) {
      throw mapOrderingError(error)
    }
  },
}
