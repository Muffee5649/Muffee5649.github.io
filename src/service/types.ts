/** 分页响应，字段与数据库 RPC 返回保持一致 */
export interface PaginatedResponse<T> {
  records: T[]
  current: number
  size: number
  total: number
}

/** 当前登录用户信息 */
export interface AuthUserInfo {
  userId: string
  userName: string
  email: string
  avatar?: string
  roles: string[]
  buttons: string[]
}

/** 用户分页查询参数 */
export interface UserSearchParams {
  current?: number
  size?: number
  id?: string
  userName?: string
  userGender?: string
  userPhone?: string
  userEmail?: string
  status?: number
}

/** 用户列表项 */
export interface UserListItem {
  id: string
  avatar: string
  status: string
  userName: string
  userGender: string
  nickName: string
  userPhone: string
  userEmail: string
  userRoles: string[]
  createBy: string
  createTime: string
  updateBy: string
  updateTime: string
}

export type UserList = PaginatedResponse<UserListItem>

/** 角色分页查询参数 */
export interface RoleSearchParams {
  current?: number
  size?: number
  roleId?: number
  roleName?: string
  roleCode?: string
  description?: string
  enabled?: boolean
  startTime?: string
  endTime?: string
}

/** 角色列表项 */
export interface RoleListItem {
  roleId: number
  roleName: string
  roleCode: string
  description: string
  enabled: boolean
  createTime: string
  updateTime: string
}

export type RoleList = PaginatedResponse<RoleListItem>

/** 按钮权限项 */
export interface MenuAuthItem {
  authMark: string
  authName?: string
  [key: string]: unknown
}

/** 路由 meta，字段由业务按需扩展 */
export interface RouteMeta {
  title?: string
  icon?: string
  authList?: MenuAuthItem[]
  [key: string]: unknown
}

/** 菜单 / 路由记录 */
export interface AppRouteRecord {
  id: number
  parentId: number | null
  name: string
  path: string
  component?: string
  redirect?: string
  status?: number
  meta: RouteMeta
  children?: AppRouteRecord[]
}
