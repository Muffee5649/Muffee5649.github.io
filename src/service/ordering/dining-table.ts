import { supabase } from '@/http/supabase'
import { ServiceError, ServiceStatus } from '../shared'
import { mapOrderingError } from './error'
import type { PaginatedResponse } from '../types'
import type { DiningTableStatus, DiningTableType } from './types'

/** 餐桌列表行（get_dining_table_list 返回） */
interface DiningTableRow {
  id: number
  table_no: string
  table_type: DiningTableType | null
  capacity: number | null
  status: DiningTableStatus
  created_at: string
  updated_at: string
  total: number
}

/** 餐桌列表项 */
export interface DiningTableItem {
  id: number
  tableNo: string
  tableType: DiningTableType | null
  capacity: number | null
  status: DiningTableStatus
  createTime: string
  updateTime: string
}

/** 餐桌查询参数（FR-TBL-06：状态 / 类型 / 桌号筛选为 P1，数据库已支持） */
export interface DiningTableSearchParams {
  current?: number
  size?: number
  tableNo?: string
  tableType?: DiningTableType
  status?: DiningTableStatus
}

/** 桌号二维码列表行（get_dining_table_qr_list 返回） */
interface DiningTableQrRow {
  id: number
  table_no: string
  table_type: DiningTableType | null
  capacity: number | null
  status: DiningTableStatus
  qr_token: string
  total: number
}

/** 桌号二维码列表项 */
export interface DiningTableQrItem {
  id: number
  tableNo: string
  tableType: DiningTableType | null
  capacity: number | null
  status: DiningTableStatus
  /** 二维码校验令牌，与餐桌一对一 */
  qrToken: string
}

/** 扫码解析出的餐桌 */
export interface ResolvedTable {
  id: number
  tableNo: string
  tableType: DiningTableType | null
  capacity: number | null
  status: DiningTableStatus
  /** 进行中开台 id（占用桌加单用） */
  sessionId: number | null
}

/** 新增 / 编辑餐桌参数 */
export interface DiningTableInput {
  /** 桌号，全局唯一，1~10 字符；有进行中开台的餐桌不允许修改桌号 */
  tableNo: string
  /** 类型：hall 大厅 / outdoor 外摆 / room 房间 */
  tableType?: DiningTableType | null
  /** 容纳人数，≥ 1，可空 */
  capacity?: number | null
}

/** 工作台开台摘要（占用态显示，FR-TBL-06） */
export interface WorkbenchSessionSummary {
  sessionId: number
  sessionNo: string
  openedAt: string
  /** 有效下单笔数（状态 ≠ 已取消） */
  orderCount: number
  /** 当前合计金额（分） */
  totalAmountCents: number
}

/** 工作台预定摘要（已约定态显示，FR-TBL-06） */
export interface WorkbenchReservationSummary {
  reservationId: number
  reservationNo: string
  guestName: string
  arrivalTime: string
  partySize: number
}

/** 点餐工作台餐桌（含状态摘要，PRD 6.6 首屏餐桌网格数据源） */
export interface WorkbenchTable {
  id: number
  tableNo: string
  tableType: DiningTableType | null
  capacity: number | null
  status: DiningTableStatus
  /** 当前开台摘要（占用态显示） */
  activeSession: WorkbenchSessionSummary | null
  /** 最近已约定预定摘要（已约定态显示） */
  upcomingReservation: WorkbenchReservationSummary | null
}

/** 工作台开台行（get_session_list 精简） */
interface WorkbenchSessionRow {
  id: number
  session_no: string
  table_id: number
  opened_at: string
  order_count: number
  total_amount_cents: number
}

/** 工作台预定行（get_reservation_list 精简） */
interface WorkbenchReservationRow {
  id: number
  reservation_no: string
  table_id: number
  guest_name: string
  arrival_time: string
  party_size: number
}

/**
 * 餐桌服务（FR-TBL）
 */
export const DiningTableService = {
  /**
   * 分页查询餐桌列表
   */
  async getList(
    params: DiningTableSearchParams = {},
  ): Promise<PaginatedResponse<DiningTableItem>> {
    const current = params.current ?? 1
    const size = params.size ?? 20

    const { data, error } = await supabase.rpc('get_dining_table_list', {
      p_current: current,
      p_size: size,
      p_table_no: params.tableNo ?? null,
      p_table_type: params.tableType ?? null,
      p_status: params.status ?? null,
    })

    if (error) {
      throw mapOrderingError(error)
    }

    const rows = (data ?? []) as DiningTableRow[]

    return {
      records: rows.map(row => ({
        id: row.id,
        tableNo: row.table_no,
        tableType: row.table_type,
        capacity: row.capacity,
        status: row.status,
        createTime: row.created_at,
        updateTime: row.updated_at,
      })),
      current,
      size,
      total: rows[0]?.total ?? 0,
    }
  },

  /**
   * 新增餐桌（FR-TBL-01）：桌号全局唯一，创建后状态为空闲
   */
  async create(input: DiningTableInput): Promise<number> {
    const { data, error } = await supabase.rpc('create_dining_table', {
      p_table_no: input.tableNo.trim(),
      p_table_type: input.tableType ?? null,
      p_capacity: input.capacity ?? null,
    })

    if (error) {
      throw mapOrderingError(error)
    }

    return data as number
  },

  /**
   * 编辑餐桌（FR-TBL-02）：桌号 / 类型 / 容纳人数可改，状态不变更
   */
  async update(id: number, input: DiningTableInput): Promise<void> {
    const { error } = await supabase.rpc('update_dining_table', {
      p_id: id,
      p_table_no: input.tableNo.trim(),
      p_table_type: input.tableType ?? null,
      p_capacity: input.capacity ?? null,
    })

    if (error) {
      throw mapOrderingError(error)
    }
  },

  /**
   * 停用餐桌（FR-TBL-03）：仅空闲态可停用；停用后不出现在点餐工作台与预定可选桌列表
   */
  async disable(id: number): Promise<void> {
    const { error } = await supabase.rpc('disable_dining_table', {
      p_id: id,
    })

    if (error) {
      throw mapOrderingError(error)
    }
  },

  /**
   * 启用餐桌（FR-TBL-03）：恢复为空闲态
   */
  async enable(id: number): Promise<void> {
    const { error } = await supabase.rpc('enable_dining_table', {
      p_id: id,
    })

    if (error) {
      throw mapOrderingError(error)
    }
  },

  /**
   * 删除餐桌（FR-TBL-04）：从未产生开台记录且无任何预定记录时方可删除；需二次确认，不可恢复
   */
  async remove(id: number): Promise<void> {
    const { error } = await supabase.rpc('delete_dining_table', {
      p_id: id,
    })

    if (error) {
      throw mapOrderingError(error)
    }
  },

  /**
   * 查询桌号二维码列表（管理端）：缺失令牌的餐桌会自动补一个，已打印二维码保持有效
   */
  async getQrList(
    params: { current?: number, size?: number, tableNo?: string } = {},
  ): Promise<PaginatedResponse<DiningTableQrItem>> {
    const current = params.current ?? 1
    const size = params.size ?? 100

    const { data, error } = await supabase.rpc('get_dining_table_qr_list', {
      p_current: current,
      p_size: size,
      p_table_no: params.tableNo ?? null,
    })

    if (error) {
      throw mapOrderingError(error)
    }

    const rows = (data ?? []) as DiningTableQrRow[]

    return {
      records: rows.map(row => ({
        id: row.id,
        tableNo: row.table_no,
        tableType: row.table_type,
        capacity: row.capacity,
        status: row.status,
        qrToken: row.qr_token,
      })),
      current,
      size,
      total: rows[0]?.total ?? 0,
    }
  },

  /**
   * 重新生成桌号二维码令牌（管理端）：旧二维码立即失效
   */
  async rotateQrToken(id: number): Promise<string> {
    const { data, error } = await supabase.rpc('rotate_table_qr_token', {
      p_table_id: id,
    })

    if (error) {
      throw mapOrderingError(error)
    }

    return data as string
  },

  /**
   * 按小程序码 scene 中的令牌解析餐桌（未登录也可调用）
   */
  async resolveQrToken(token: string): Promise<ResolvedTable> {
    const { data, error } = await supabase.rpc('resolve_table_qr', {
      p_token: token,
    })

    if (error) {
      throw mapOrderingError(error)
    }

    const row = data as {
      id: number
      table_no: string
      table_type: DiningTableType | null
      capacity: number | null
      status: DiningTableStatus
      session_id: number | null
    }

    return {
      id: row.id,
      tableNo: row.table_no,
      tableType: row.table_type,
      capacity: row.capacity,
      status: row.status,
      sessionId: row.session_id,
    }
  },

  /**
   * 批量生成桌号小程序码（管理端）：返回 令牌 → base64 图片 data URL
   */
  async getWxacodes(tokens: string[]): Promise<Record<string, string>> {
    if (!tokens.length) {
      return {}
    }

    const { data, error } = await supabase.functions.invoke('wechat-qrcode', {
      body: { tokens },
    })

    if (error) {
      const context = (error as { context?: Response }).context
      let message = '小程序码生成失败，请重试'
      if (context) {
        try {
          const body = await context.json() as { error?: string }
          if (body?.error) {
            message = body.error
          }
        }
        catch {
          // 非 JSON 错误响应，使用默认提示
        }
      }
      throw new ServiceError(message, ServiceStatus.error)
    }

    const payload = data as { codes?: Record<string, string>, error?: string } | null
    if (payload?.error) {
      throw new ServiceError(payload.error, ServiceStatus.error)
    }
    return payload?.codes ?? {}
  },

  /**
   * 查询点餐工作台餐桌网格（PRD 6.6）：全部餐桌 + 占用桌的当前开台摘要 + 已约定桌的最近预定摘要
   *
   * 状态色区分 空闲 / 已约定 / 占用 / 停用；已约定桌角标显示到店时间与预定人
   */
  async getWorkbenchTables(): Promise<WorkbenchTable[]> {
    const [tablesResult, sessionsResult, reservationsResult] = await Promise.all([
      supabase
        .from('dining_tables')
        .select('id, table_no, table_type, capacity, status')
        .order('table_no'),
      supabase.rpc('get_session_list', {
        p_current: 1,
        p_size: 999,
        p_table_no: null,
        p_date: null,
        p_status: 'active',
      }),
      supabase.rpc('get_reservation_list', {
        p_current: 1,
        p_size: 999,
        p_arrival_date: null,
        p_status: 'reserved',
        p_table_no: null,
        p_table_type: null,
      }),
    ])

    if (tablesResult.error) {
      throw new ServiceError(tablesResult.error.message, ServiceStatus.error)
    }
    if (sessionsResult.error) {
      throw mapOrderingError(sessionsResult.error)
    }
    if (reservationsResult.error) {
      throw mapOrderingError(reservationsResult.error)
    }

    const tables = (tablesResult.data ?? []) as {
      id: number
      table_no: string
      table_type: DiningTableType | null
      capacity: number | null
      status: DiningTableStatus
    }[]
    const sessions = (sessionsResult.data ?? []) as WorkbenchSessionRow[]
    const reservations = (reservationsResult.data ?? []) as WorkbenchReservationRow[]

    const sessionByTable = new Map(sessions.map(row => [row.table_id, row]))
    // 已约定桌取到店时间最近的一条预定（列表已按到店时间升序）
    const reservationByTable = new Map<number, WorkbenchReservationRow>()
    reservations.forEach((row) => {
      if (!reservationByTable.has(row.table_id)) {
        reservationByTable.set(row.table_id, row)
      }
    })

    return tables.map((table) => {
      const session = sessionByTable.get(table.id)
      const reservation = reservationByTable.get(table.id)

      return {
        id: table.id,
        tableNo: table.table_no,
        tableType: table.table_type,
        capacity: table.capacity,
        status: table.status,
        activeSession: session
          ? {
              sessionId: session.id,
              sessionNo: session.session_no,
              openedAt: session.opened_at,
              orderCount: Number(session.order_count),
              totalAmountCents: Number(session.total_amount_cents),
            }
          : null,
        upcomingReservation: reservation
          ? {
              reservationId: reservation.id,
              reservationNo: reservation.reservation_no,
              guestName: reservation.guest_name,
              arrivalTime: reservation.arrival_time,
              partySize: reservation.party_size,
            }
          : null,
      }
    })
  },
}
