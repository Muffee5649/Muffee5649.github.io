import { supabase } from '@/http/supabase'
import { ServiceError, ServiceStatus } from './shared'

/** 预置存储桶 */
export const STORAGE_BUCKETS = {
  /** 用户头像（公开读） */
  AVATARS: 'avatars',
  /** 菜品图片（公开读，仅管理员可写） */
  DISH_IMAGES: 'dish-images',
} as const

/** 待上传文件：H5 用 File / Blob，小程序用 uni.chooseImage 得到的本地临时路径 */
export type UploadFile = File | Blob | string

/** 上传参数 */
export interface UploadOptions {
  /** 存储桶名称 */
  bucket: string
  /** 待上传文件 */
  file: UploadFile
  /** 对象路径，不传时按「年/月/随机 id.扩展名」自动生成 */
  path?: string
  /** 是否覆盖同名对象 */
  upsert?: boolean
  /** 缓存时间（秒） */
  cacheControl?: string
}

/** 上传结果 */
export interface UploadResult {
  bucket: string
  path: string
  url: string
  /** 小程序上传本地路径时无法同步获取，此时为 undefined */
  size?: number
  /** 小程序上传本地路径时无法同步获取，此时为 undefined */
  mimeType?: string
}

function isBlobFile(file: UploadFile): file is Blob {
  return typeof Blob !== 'undefined' && file instanceof Blob
}

/**
 * 生成随机 id，小程序环境没有 crypto.randomUUID
 */
function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}

/**
 * 取文件名：File / Blob 用 name，字符串路径取其最后一段
 */
function resolveFileName(file: UploadFile): string {
  if (typeof file === 'string') {
    return file.split(/[/\\]/).pop() ?? ''
  }
  return typeof File !== 'undefined' && file instanceof File ? file.name : ''
}

/**
 * 生成默认对象路径
 */
function buildObjectPath(file: UploadFile): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const fileName = resolveFileName(file)
  const ext = fileName.includes('.') ? `.${fileName.split('.').pop()!.toLowerCase()}` : ''

  return `${year}/${month}/${createId()}${ext}`
}

/**
 * 获取对象的公开访问地址
 */
function getPublicUrl(bucket: string, path: string): string {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return data.publicUrl
}

/**
 * 上传文件
 */
async function upload(options: UploadOptions): Promise<UploadResult> {
  const { bucket, file, path, upsert = false, cacheControl = '3600' } = options
  const objectPath = path ?? buildObjectPath(file)
  const mimeType = isBlobFile(file) ? (file.type || undefined) : undefined
  const size = isBlobFile(file) ? file.size : undefined

  const { error } = await supabase.storage.from(bucket).upload(objectPath, file, {
    upsert,
    cacheControl,
    contentType: mimeType,
  })

  if (error) {
    throw new ServiceError(error.message, ServiceStatus.error)
  }

  return {
    bucket,
    path: objectPath,
    url: getPublicUrl(bucket, objectPath),
    size,
    mimeType,
  }
}

/**
 * 下载文件
 */
async function download(bucket: string, path: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from(bucket).download(path)

  if (error) {
    throw new ServiceError(error.message, ServiceStatus.error)
  }

  return data
}

/**
 * 创建临时签名地址（私有桶使用）
 */
async function createSignedUrl(bucket: string, path: string, expiresIn = 60): Promise<string> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn)

  if (error) {
    throw new ServiceError(error.message, ServiceStatus.error)
  }

  return data.signedUrl
}

/**
 * 删除文件
 */
async function remove(bucket: string, paths: string | string[]): Promise<void> {
  const list = Array.isArray(paths) ? paths : [paths]
  const { error } = await supabase.storage.from(bucket).remove(list)

  if (error) {
    throw new ServiceError(error.message, ServiceStatus.error)
  }
}

/**
 * 上传用户头像
 * 路径固定为「用户 ID/avatar」，重复上传直接覆盖
 */
async function uploadAvatar(file: UploadFile, userId: string): Promise<UploadResult> {
  return upload({
    bucket: STORAGE_BUCKETS.AVATARS,
    file,
    path: `${userId}/avatar`,
    upsert: true,
    cacheControl: '0',
  })
}

/**
 * 系统通用文件存储服务
 */
export const StorageService = {
  upload,
  download,
  remove,
  getPublicUrl,
  createSignedUrl,
  uploadAvatar,
}

export type StorageServiceType = typeof StorageService
