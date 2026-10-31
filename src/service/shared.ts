/**
 * 服务层统一错误
 * statusCode 语义：401 未登录 / 403 无权限 / 500 业务错误
 */
export class ServiceError extends Error {
  statusCode: number

  constructor(message: string, statusCode = 500) {
    super(message)
    this.name = 'ServiceError'
    this.statusCode = statusCode
  }
}

export const ServiceStatus = {
  unauthorized: 401,
  forbidden: 403,
  error: 500,
} as const
