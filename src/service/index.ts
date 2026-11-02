export { AuthService } from './auth'
export type {
  AuthResult,
  AuthServiceError,
  AuthSessionData,
  ChangePasswordParams,
  LoginParams,
  RegisterParams,
} from './auth'
export { MenuService } from './menu'
export type { MenuAuth, MenuInput } from './menu'
// 点餐系统
export {
  DiningTableService,
  DishCategoryService,
  DishReviewService,
  DishService,
  OrderService,
  ReservationService,
} from './ordering'
export type {
  CheckInResult,
  CreateReservationResult,
  DiningTableInput,
  DiningTableItem,
  DiningTableSearchParams,
  DiningTableStatus,
  DiningTableType,
  DishCategoryInput,
  DishCategoryItem,
  DishCategorySearchParams,
  DishInput,
  DishItem,
  DishReviewInput,
  DishReviewItem,
  DishReviewSearchParams,
  DishSearchParams,
  DishStatus,
  OrderingMenuCategory,
  OrderingMenuDish,
  OrderStatus,
  PlaceOrderItem,
  PlaceOrderParams,
  PreOrderItemInput,
  ReservationDetail,
  ReservationInput,
  ReservationItem,
  ReservationPreOrderItem,
  ReservationSearchParams,
  ReservationStatus,
  SessionListItem,
  SessionOrder,
  SessionOrderItem,
  SessionOverview,
  SessionOverviewInfo,
  SessionSearchParams,
  SessionStatus,
  WorkbenchReservationSummary,
  WorkbenchSessionSummary,
  WorkbenchTable,
} from './ordering'
export { RoleService } from './role'
export type { RoleInput } from './role'
export { ServiceError, ServiceStatus } from './shared'
export { STORAGE_BUCKETS, StorageService } from './storage'

export type { UploadFile, UploadOptions, UploadResult } from './storage'
export type {
  AppRouteRecord,
  AuthUserInfo,
  MenuAuthItem,
  PaginatedResponse,
  RoleList,
  RoleListItem,
  RoleSearchParams,
  RouteMeta,
  UserList,
  UserListItem,
  UserSearchParams,
} from './types'

export { UserService } from './user'
export type {
  UserCreateParams,
  UserProfile,
  UserProfileUpdateParams,
  UserUpdateParams,
} from './user'
