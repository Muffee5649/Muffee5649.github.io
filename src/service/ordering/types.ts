/**
 * 点餐系统共享枚举类型
 *
 * 取值与数据库表约束一一对应（见 docs/prd-ordering-system.md 第 4、6 章）
 */

/** 菜品状态：on_sale 在售 / off_sale 停售 */
export type DishStatus = 'on_sale' | 'off_sale'

/** 餐桌类型：hall 大厅 / outdoor 外摆 / room 房间（PRD Q6 取值待业务确认） */
export type DiningTableType = 'hall' | 'outdoor' | 'room'

/** 餐桌状态：idle 空闲 / reserved 已约定 / occupied 占用 / disabled 停用 */
export type DiningTableStatus = 'idle' | 'reserved' | 'occupied' | 'disabled'

/** 开台状态：active 进行中 / settled 已结账 / cancelled 已取消 */
export type SessionStatus = 'active' | 'settled' | 'cancelled'

/** 订单状态：placed 已下单 / cancelled 已取消 */
export type OrderStatus = 'placed' | 'cancelled'

/** 预定状态：reserved 已约定 / arrived 已到店 / cancelled 已取消 / no_show 未到店 */
export type ReservationStatus = 'reserved' | 'arrived' | 'cancelled' | 'no_show'
