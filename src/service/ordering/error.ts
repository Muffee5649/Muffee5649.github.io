import { ServiceError, ServiceStatus } from '../shared'

/**
 * 点餐系统 RPC 错误码 → 中文提示
 *
 * 与数据库函数 raise exception 的错误码一一对应；
 * 带参数的错误码（如 DISH_OFF_SALE:宫保鸡丁）会解析出参数并附加展示
 */
const ERROR_MESSAGES: Record<string, string> = {
  // 通用（管理类操作仅管理员可执行，由数据库校验）
  FORBIDDEN: '无权执行该操作',

  // 菜品分类
  CATEGORY_NAME_LENGTH_INVALID: '分类名称长度需为 1-20 个字符',
  CATEGORY_NAME_TAKEN: '分类名称已存在',
  CATEGORY_NOT_FOUND: '分类不存在或已被删除',
  CATEGORY_HAS_DISHES: '请先转移该分类下的菜品',
  CATEGORY_NOT_AVAILABLE: '所属分类不存在或已停用',

  // 菜品
  DISH_NAME_LENGTH_INVALID: '菜品名称长度需为 1-50 个字符',
  DISH_PRICE_INVALID: '价格必须大于 0',
  DISH_TAG_LENGTH_INVALID: '标签内容过长',
  DISH_CATEGORY_REQUIRED: '请至少选择一个所属分类',
  DISH_STOCK_INVALID: '库存数量不能为负数',
  DISH_NAME_TAKEN: '菜品名称已存在',
  DISH_NOT_FOUND: '菜品不存在或已被删除',
  DISH_STATUS_INVALID: '菜品状态不合法',
  DISH_REFERENCED: '菜品已被订单或预点菜单引用，仅可停售',
  DISH_OFF_SALE: '菜品已停售',

  // 菜品评价
  REVIEW_RATING_INVALID: '评分需为 1-5 星',
  REVIEW_CONTENT_TOO_LONG: '评价内容不能超过 200 字',
  REVIEWER_NAME_TOO_LONG: '评价人名称不能超过 20 字',
  REVIEW_NOT_FOUND: '评价不存在或已被删除',

  // 餐桌
  TABLE_NO_LENGTH_INVALID: '桌号长度需为 1-10 个字符',
  TABLE_TYPE_INVALID: '餐桌类型不合法',
  TABLE_CAPACITY_INVALID: '容纳人数需不小于 1',
  TABLE_NO_TAKEN: '桌号已存在',
  TABLE_NOT_FOUND: '餐桌不存在或已被删除',
  TABLE_NOT_AVAILABLE: '该餐桌不可用（不存在或已停用）',
  TABLE_NOT_IDLE: '仅空闲状态的餐桌可停用，请先处理该桌的预定',
  TABLE_NOT_DISABLED: '该餐桌未被停用',
  TABLE_IN_USE: '该餐桌存在进行中开台，不可删除',
  TABLE_HAS_SESSION_HISTORY: '该餐桌存在历史开台记录，仅可停用',
  TABLE_HAS_RESERVATION_HISTORY: '该餐桌存在预定记录，仅可停用',
  TABLE_NO_LOCKED_BY_ACTIVE_SESSION: '该桌有进行中开台，不允许修改桌号',
  TABLE_OCCUPIED: '该桌已开台或正在就餐',

  // 开台 / 订单
  DINER_COUNT_INVALID: '用餐人数需不小于 1',
  SESSION_NOT_FOUND: '开台记录不存在',
  SESSION_NOT_ACTIVE: '开台已结账或已取消',
  SESSION_HAS_ORDERS: '开台下存在有效订单，不能取消开台',
  SESSION_HAS_NO_VALID_ORDERS: '开台下没有有效订单，不能结账',
  TOTAL_CHANGED: '订单有变化，请刷新后重试',
  ORDER_NOTE_LENGTH_INVALID: '整单备注不能超过 50 字',
  ORDER_ITEMS_EMPTY: '请至少选择一道菜品',
  ORDER_ITEM_QUANTITY_INVALID: '菜品数量需不小于 1',
  ITEM_NOTE_LENGTH_INVALID: '条目备注不能超过 50 字',
  ORDER_NOT_FOUND: '订单不存在',
  ORDER_NOT_CANCELLABLE: '该订单已取消或不可操作',
  ITEM_NOT_FOUND: '订单条目不存在',
  REFUND_QUANTITY_INVALID: '退菜数量需不小于 1',
  REFUND_EXCEEDS_QUANTITY: '退菜数量超出可退范围',

  // 预定
  RESERVATION_NOT_FOUND: '预定记录不存在',
  RESERVATION_NOT_EDITABLE: '该预定当前状态不可编辑',
  RESERVATION_NOT_CONFIRMABLE: '仅已约定的预定可到店开台',
  RESERVATION_CONFLICT: '该桌同时段已存在预定，请调整时间或桌位',
  TABLE_ID_REQUIRED: '该桌号类型需指定具体餐桌',
  TABLE_AUTO_ASSIGN_ONLY: '该桌号类型由系统自动分配，无需指定餐桌',
  NO_TABLE_AVAILABLE: '该类型暂无可预约桌位',
  GUEST_NAME_LENGTH_INVALID: '预定人姓名长度需为 1-20 个字符',
  PHONE_LENGTH_INVALID: '联系电话不合法',
  ARRIVAL_TIME_INVALID: '到店时间必须晚于当前时间',
  PARTY_SIZE_INVALID: '用餐人数需不小于 1',
  PRE_ORDER_QUANTITY_INVALID: '预点菜品数量需不小于 1',
}

/**
 * 转换点餐系统 RPC 错误为可读的 HttpError
 *
 * PostgREST 会将数据库 raise exception 的文本透传到 error.message，
 * 形如 `TABLE_OCCUPIED` 或 `DISH_OFF_SALE:宫保鸡丁`
 */
export function mapOrderingError(error: {
  message?: string | null
  code?: string | null
}): ServiceError {
  const message = (error.message ?? '').trim()

  // 解析错误码与可能携带的参数
  const separatorIndex = message.indexOf(':')
  const code = separatorIndex === -1 ? message : message.slice(0, separatorIndex)
  const detail = separatorIndex === -1 ? '' : message.slice(separatorIndex + 1).trim()

  const text = ERROR_MESSAGES[code]
  if (text) {
    return new ServiceError(detail ? `${text}：${detail}` : text, ServiceStatus.error)
  }

  if (error.code === '42501') {
    return new ServiceError('无权执行该操作', ServiceStatus.forbidden)
  }
  if (error.code === '23505') {
    return new ServiceError('数据已存在或状态已变化，请刷新后重试', ServiceStatus.error)
  }

  return new ServiceError(message || '请求失败', ServiceStatus.error)
}
