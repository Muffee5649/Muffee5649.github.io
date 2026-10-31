import type { Session } from '@supabase/supabase-js'
import type { LoginParams } from '@/service/auth'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { supabase } from '@/http/supabase'
import { AuthService } from '@/service/auth'
import { ServiceError, ServiceStatus } from '@/service/shared'
import { useUserStore } from './user'

/**
 * Supabase 会话在本地缓存的精简结构
 * Supabase 自身会持久化完整会话，这里只保存请求拦截器需要的信息
 */
export interface TokenInfo {
  /** 访问令牌 */
  accessToken: string
  /** 刷新令牌 */
  refreshToken: string
  /** 访问令牌过期时间戳（毫秒） */
  expiresAt: number
}

/** 初始状态 */
const tokenInfoState: TokenInfo = {
  accessToken: '',
  refreshToken: '',
  expiresAt: 0,
}

/**
 * 获取微信小程序登录凭证
 */
function getWxCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    uni.login({
      provider: 'weixin',
      success: res => resolve(res.code),
      fail: err => reject(new ServiceError(err.errMsg || '获取微信登录凭证失败', ServiceStatus.error)),
    })
  })
}

export const useTokenStore = defineStore(
  'token',
  () => {
    const tokenInfo = ref<TokenInfo>({ ...tokenInfoState })

    // 添加一个时间戳 ref 作为响应式依赖
    const nowTime = ref(Date.now())

    /**
     * 更新响应式数据:now
     * 确保 isTokenExpired 重新计算，而不是使用错误的过期缓存值
     */
    const updateNowTime = () => {
      nowTime.value = Date.now()
      return useTokenStore()
    }

    /**
     * 将 Supabase 会话同步到本地缓存
     */
    const applySession = (session: Session | null) => {
      if (!session) {
        tokenInfo.value = { ...tokenInfoState }
        uni.removeStorageSync('accessTokenExpireTime')
        return
      }
      tokenInfo.value = {
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        expiresAt: (session.expires_at ?? 0) * 1000,
      }
      uni.setStorageSync('accessTokenExpireTime', tokenInfo.value.expiresAt)
    }

    // 跟随 Supabase 会话变更（含自动刷新、退出登录）
    supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session)
      updateNowTime()
    })

    /**
     * 判断 token 是否过期
     */
    const isTokenExpired = computed(() => {
      if (!tokenInfo.value.accessToken) {
        return true
      }
      return nowTime.value >= tokenInfo.value.expiresAt
    })

    /**
     * 检查是否有登录信息（不考虑 token 是否过期）
     */
    const hasLoginInfo = computed(() => !!tokenInfo.value.accessToken)

    /**
     * 检查是否已登录且 token 有效
     * 建议这样使用 tokenStore.updateNowTime().hasLogin
     */
    const hasLogin = computed(() => hasLoginInfo.value && !isTokenExpired.value)

    /**
     * 获取有效的 token
     * 注意：在 computed 中不直接调用异步函数，只做状态判断
     */
    const validToken = computed(() => (hasLogin.value ? tokenInfo.value.accessToken : ''))

    /**
     * 登录成功后处理逻辑
     */
    async function _postLogin(session: Session | null) {
      if (!session) {
        throw new ServiceError('登录失败，未返回有效会话', ServiceStatus.unauthorized)
      }
      applySession(session)
      updateNowTime()
      const userStore = useUserStore()
      await userStore.fetchUserInfo()
    }

    /**
     * 账号密码登录
     * account 为邮箱或用户名
     */
    const login = async (params: LoginParams) => {
      try {
        const { data, error } = await AuthService.login(params)
        if (error) {
          throw new ServiceError(error.message, ServiceStatus.unauthorized)
        }
        await _postLogin(data.session)
        uni.showToast({
          title: '登录成功',
          icon: 'success',
        })
        return data
      }
      catch (error) {
        console.error('登录失败:', error)
        const message = error instanceof Error ? error.message : '登录失败，请重试'
        uni.showToast({
          title: message,
          icon: 'none',
        })
        throw error
      }
      finally {
        updateNowTime()
      }
    }

    /**
     * 微信小程序登录
     * 通过 wechat-login Edge Function 换取 Supabase 会话
     */
    const wxLogin = async () => {
      try {
        const code = await getWxCode()
        const { data, error } = await supabase.functions.invoke('wechat-login', {
          body: { code },
        })

        if (error) {
          throw new ServiceError('微信登录失败，请重试', ServiceStatus.error)
        }
        if (data?.error) {
          throw new ServiceError(data.error as string, ServiceStatus.error)
        }

        const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
          access_token: data.accessToken as string,
          refresh_token: data.refreshToken as string,
        })
        if (sessionError) {
          throw new ServiceError(sessionError.message, ServiceStatus.unauthorized)
        }

        await _postLogin(sessionData.session)
        uni.showToast({
          title: '登录成功',
          icon: 'success',
        })
        return sessionData
      }
      catch (error) {
        console.error('微信登录失败:', error)
        const message = error instanceof Error ? error.message : '微信登录失败，请重试'
        uni.showToast({
          title: message,
          icon: 'none',
        })
        throw error
      }
      finally {
        updateNowTime()
      }
    }

    /**
     * 退出登录 并 删除用户信息
     */
    const logout = async () => {
      try {
        await AuthService.logout()
      }
      catch (error) {
        console.error('退出登录失败:', error)
      }
      finally {
        applySession(null)
        uni.removeStorageSync('refreshTokenExpireTime')
        updateNowTime()
        console.log('退出登录-清除用户信息')
        const userStore = useUserStore()
        userStore.clearUserInfo()
      }
    }

    /**
     * 刷新 token
     */
    const refreshToken = async () => {
      try {
        const { data, error } = await supabase.auth.refreshSession()
        if (error || !data.session) {
          throw new ServiceError(error?.message ?? '刷新 token 失败', ServiceStatus.unauthorized)
        }
        applySession(data.session)
        return data.session
      }
      catch (error) {
        console.error('刷新 token 失败:', error)
        throw error
      }
      finally {
        updateNowTime()
      }
    }

    /**
     * 尝试获取有效的 token，如果过期则尝试刷新
     * @returns 有效的 token 或空字符串
     */
    const tryGetValidToken = async (): Promise<string> => {
      updateNowTime()
      if (!validToken.value && tokenInfo.value.refreshToken) {
        try {
          await refreshToken()
          return validToken.value
        }
        catch (error) {
          console.error('尝试刷新 token 失败:', error)
          return ''
        }
      }
      return validToken.value
    }

    /**
     * 手动设置会话（供外部恢复登录态使用）
     */
    const setTokenInfo = (val: TokenInfo) => {
      updateNowTime()
      tokenInfo.value = val
      if (val.expiresAt) {
        uni.setStorageSync('accessTokenExpireTime', val.expiresAt)
      }
    }

    return {
      // 核心 API 方法
      login,
      wxLogin,
      logout,

      // 认证状态判断（最常用的）
      hasLogin,

      // 内部系统使用的方法
      refreshToken,
      tryGetValidToken,
      validToken,

      // 调试或特殊场景可能需要直接访问的信息
      tokenInfo,
      setTokenInfo,
      updateNowTime,
    }
  },
  {
    // 添加持久化配置，确保刷新页面后 token 信息不丢失
    persist: true,
  },
)
