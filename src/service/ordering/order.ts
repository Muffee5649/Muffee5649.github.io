import { supabase } from '@/http/supabase'
import { mapOrderingError } from './error'
import type { PaginatedResponse } from '../types'
import type { OrderStatus, SessionStatus } from './types'

/** 点单条目参数（FR-ORD-02） */
export interface PlaceOrderItem {
  dishId: number
  /** 数量 ≥ 1 */
  quantity: number
  /** 条目备注，≤ 50 字，如"少辣""免葱" */
  note?: string | null
}

/** 点单 / 加单参数：每次提交生成一笔新订单（FR-ORD-02） */
export interface PlaceOrderParams {
  sessionId: number
  items: PlaceOrderItem[]
  /** 整单备注，≤ 50 字，如"先上凉菜" */
  note?: string | null
}

/** 开台（就餐会话）信息（总览头部，FR-ORD-03） */
export interface SessionOverviewInfo {
  id: number
  sessionNo: string
  tableId: number
  /** 桌号文本快照（PRD 7.2：桌号修改不影响历史展示） */
  tableNo: string
  openedAt: string
  dinerCount: number | null
  status: SessionStatus
  settledAt: string | null
  /** 结账金额（分），结账时写入 */
  settledAmount: number | null
  openedBy: string
  settledBy: string | null
  /** 有效下单笔数（状态 ≠ 已取消） */
  orderCount: number
  /** 开台合计金额（分）：Σ 状态 ≠ 已取消的订单金额 */
  totalAmountCents: number
}

/** 订单条目（总览明细，FR-ORD-03） */
export interface SessionOrderItem {
  id: number
  dishId: number
  /** 菜品名称快照（PRD 7.2） */
  dishName: string
  /** 单价快照（分，PRD 7.2） */
  unitPriceCents: number
  quantity: number
  refundedQuantity: number
  /** 有效数量 = 数量 − 已退数量（PRD 7.1） */
  effectiveQuantity: number
  /** 条目小计（分）= 单价快照 × 有效数量 */
  subtotalCents: number
  note: string | null
}

/** 总览中的单笔订单（FR-ORD-03） */
export interface SessionOrder {
  id: number
  orderNo: string
  /** 开台内单序号，按创建顺序递增 */
  seq: number
  status: OrderStatus
  placedAt: string
  placedBy: string
  note: string | null
  /** 订单金额（分）：Σ 该订单全部条目小计 */
  amountCents: number
  items: SessionOrderItem[]
}

/** 桌台消费总览（FR-ORD-03）：头部会话信息 + 按下单时间升序的订单列表 */
export interface SessionOverview {
  session: SessionOverviewInfo
  orders: SessionOrder[]
}

/** 总览 jsonb 原始结构 */
interface OverviewRow {
  session: {
    id: number
    session_no: string
    table_id: number
    table_no: string
    opened_at: string
    diner_count: number | null
    status: SessionStatus
    settled_at: string | null
    settled_amount: number | null
    opened_by: string
    settled_by: string | null
    order_count: number
    total_amount_cents: number
  } | null
  orders: {
    id: number
    order_no: string
    seq: number
    status: OrderStatus
    placed_at: string
    placed_by: string
    note: string | null
    amount_cents: number
    items: {
      id: number
      dish_id: number
      dish_name: string
      unit_price_cents: number
      quantity: number
      refunded_quantity: number
      effective_quantity: number
      subtotal_cents: number
      note: string | null
    }[]
  }[]
}

/** 开台列表行（get_session_list 返回） */
interface SessionListRow {
  id: number
  session_no: string
  table_id: number
  table_no: string
  opened_at: string
  diner_count: number | null
  status: SessionStatus
  settled_at: string | null
  settled_amount: number | null
  opened_by: string
  order_count: number
  total_amount_cents: number
  created_at: string
  updated_at: string
  total: number
}

/** 开台列表项（订单历史查询 FR-ORD-04，按开台为单位检索） */
export interface SessionListItem {
  id: number
  sessionNo: string
  tableId: number
  tableNo: string
  openedAt: string
  dinerCount: number | null
  status: SessionStatus
  settledAt: string | null
  settledAmount: number | null
  openedBy: string
  orderCount: number
  totalAmountCents: number
  createTime: string
  updateTime: string
}

/** 开台查询参数（FR-ORD-04：桌号 / 日期 / 状态基础筛选） */
export interface SessionSearchParams {
  current?: number
  size?: number
  tableNo?: string
  /** 开台时间所在日，格式 YYYY-MM-DD */
  date?: string
  status?: SessionStatus
}

/**
 * 订单服务（FR-ORD）：开台 → 点单 / 加单 → 桌台消费总览 → 退菜 / 取消 → 结账
 */
export const OrderService = {
  /**
   * 开台（FR-ORD-01）：空闲 / 已约定餐桌可开台，同一餐桌同时最多 1 个进行中开台
   *
   * @returns 开台编号对应的新会话 id
   */
  async openTable(tableId: number, dinerCount?: number | null): Promise<number> {
    const { data, error } = await supabase.rpc('open_table', {
      p_table_id: tableId,
      p_diner_count: dinerCount ?? null,
    })

    if (error) {
      throw mapOrderingError(error)
    }

    return data as number
  },

  /**
   * 点单 / 加单（FR-ORD-02）：每次提交生成一笔新订单，不合并进已有订单；
   * 提交时逐条校验菜品在售，被停售则整笔失败并提示被停售的菜品
   *
   * @returns 新订单 id
   */
  async placeOrder(params: PlaceOrderParams): Promise<number> {
    const { data, error } = await supabase.rpc('place_order', {
      p_session_id: params.sessionId,
      p_items: params.items.map(item => ({
        dish_id: item.dishId,
        quantity: item.quantity,
        note: item.note ?? null,
      })),
      p_note: params.note ?? null,
    })

    if (error) {
      throw mapOrderingError(error)
    }

    return data as number
  },

  /**
   * 桌台消费总览（FR-ORD-03）：N 笔订单逐单逐条明细，含合计与有效数量口径；
   * 已结账 / 已取消开台为只读快照，可随时回看
   */
  async getSessionOverview(sessionId: number): Promise<SessionOverview> {
    const { data, error } = await supabase.rpc('get_table_session_overview', {
      p_session_id: sessionId,
    })

    if (error) {
      throw mapOrderingError(error)
    }

    const row = data as OverviewRow

    if (!row?.session) {
      throw mapOrderingError({ message: 'SESSION_NOT_FOUND' })
    }

    return {
      session: {
        id: row.session.id,
        sessionNo: row.session.session_no,
        tableId: row.session.table_id,
        tableNo: row.session.table_no,
        openedAt: row.session.opened_at,
        dinerCount: row.session.diner_count,
        status: row.session.status,
        settledAt: row.session.settled_at,
        settledAmount: row.session.settled_amount,
        openedBy: row.session.opened_by,
        settledBy: row.session.settled_by,
        orderCount: Number(row.session.order_count),
        totalAmountCents: Number(row.session.total_amount_cents),
      },
      orders: (row.orders ?? []).map(order => ({
        id: order.id,
        orderNo: order.order_no,
        seq: order.seq,
        status: order.status,
        placedAt: order.placed_at,
        placedBy: order.placed_by,
        note: order.note,
        amountCents: Number(order.amount_cents),
        items: (order.items ?? []).map(item => ({
          id: item.id,
          dishId: item.dish_id,
          dishName: item.dish_name,
          unitPriceCents: item.unit_price_cents,
          quantity: item.quantity,
          refundedQuantity: item.refunded_quantity,
          effectiveQuantity: item.effective_quantity,
          subtotalCents: Number(item.subtotal_cents),
          note: item.note,
        })),
      })),
    }
  },

  /**
   * 订单历史查询（FR-ORD-04）：按开台为单位检索（含进行中），结果可展开查看订单明细
   */
  async getList(
    params: SessionSearchParams = {},
  ): Promise<PaginatedResponse<SessionListItem>> {
    const current = params.current ?? 1
    const size = params.size ?? 20

    const { data, error } = await supabase.rpc('get_session_list', {
      p_current: current,
      p_size: size,
      p_table_no: params.tableNo ?? null,
      p_date: params.date ?? null,
      p_status: params.status ?? null,
    })

    if (error) {
      throw mapOrderingError(error)
    }

    const rows = (data ?? []) as SessionListRow[]

    return {
      records: rows.map(row => ({
        id: row.id,
        sessionNo: row.session_no,
        tableId: row.table_id,
        tableNo: row.table_no,
        openedAt: row.opened_at,
        dinerCount: row.diner_count,
        status: row.status,
        settledAt: row.settled_at,
        settledAmount: row.settled_amount,
        openedBy: row.opened_by,
        orderCount: Number(row.order_count),
        totalAmountCents: Number(row.total_amount_cents),
        createTime: row.created_at,
        updateTime: row.updated_at,
      })),
      current,
      size,
      total: rows[0]?.total ?? 0,
    }
  },

  /**
   * 条目退菜（FR-ORD-05）：1 ≤ 退菜数量 ≤ 数量 − 已退数量；仅进行中开台可退，结账后不可退
   */
  async refundOrderItem(itemId: number, quantity: number): Promise<void> {
    const { error } = await supabase.rpc('refund_order_item', {
      p_item_id: itemId,
      p_quantity: quantity,
    })

    if (error) {
      throw mapOrderingError(error)
    }
  },

  /**
   * 整单取消（FR-ORD-06）：该订单全部条目视为全部退，不计入开台合计；结账后不可取消
   */
  async cancelOrder(orderId: number): Promise<void> {
    const { error } = await supabase.rpc('cancel_order', {
      p_order_id: orderId,
    })

    if (error) {
      throw mapOrderingError(error)
    }
  },

  /**
   * 结账（FR-ORD-07）：按当时订单集重算金额并与预期值比对，不一致拒绝结账（并发保护）
   *
   * @param expectedTotalCents 结账确认弹窗展示的合计金额（分）
   * @returns 实际结账金额（分）
   */
  async settleSession(sessionId: number, expectedTotalCents: number): Promise<number> {
    const { data, error } = await supabase.rpc('settle_session', {
      p_session_id: sessionId,
      p_expected_total_cents: expectedTotalCents,
    })

    if (error) {
      throw mapOrderingError(error)
    }

    return data as number
  },

  /**
   * 取消开台（FR-ORD-08）：仅当开台无任何已下单订单时允许；结账 / 取消后数据只读可回看
   */
  async cancelSession(sessionId: number): Promise<void> {
    const { error } = await supabase.rpc('cancel_session', {
      p_session_id: sessionId,
    })

    if (error) {
      throw mapOrderingError(error)
    }
  },
}
