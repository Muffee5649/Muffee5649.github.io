import { defineStore } from 'pinia'
import { ref } from 'vue'
import { AuthService } from '@/service/auth'

/** 默认头像 */
const DEFAULT_AVATAR = '/static/images/default-avatar.png'

/** 当前登录用户信息（由 Supabase 会话 + profiles 表聚合） */
export interface UserInfo {
  /** Supabase 用户 ID（UUID） */
  userId: string
  /** 用户名 */
  username: string
  /** 昵称 */
  nickname: string
  /** 头像地址 */
  avatar: string
  /** 邮箱 */
  email: string
  /** 角色编码列表 */
  roles: string[]
  /** 按钮权限列表 */
  buttons: string[]
}

// 初始化状态
const userInfoState: UserInfo = {
  userId: '',
  username: '',
  nickname: '',
  avatar: DEFAULT_AVATAR,
  email: '',
  roles: [],
  buttons: [],
}

export const useUserStore = defineStore(
  'user',
  () => {
    // 定义用户信息
    const userInfo = ref<UserInfo>({ ...userInfoState })

    // 设置用户信息
    const setUserInfo = (val: UserInfo) => {
      console.log('设置用户信息', val)
      // 若头像为空 则使用默认头像
      if (!val.avatar) {
        val.avatar = DEFAULT_AVATAR
      }
      userInfo.value = val
    }

    const setUserAvatar = (avatar: string) => {
      userInfo.value.avatar = avatar
      console.log('设置用户头像', avatar)
      console.log('userInfo', userInfo.value)
    }

    // 删除用户信息
    const clearUserInfo = () => {
      userInfo.value = { ...userInfoState }
      uni.removeStorageSync('user')
    }

    /**
     * 获取用户信息
     */
    const fetchUserInfo = async () => {
      const info = await AuthService.getUserInfo()
      const val: UserInfo = {
        userId: info.userId,
        username: info.userName,
        nickname: info.userName,
        avatar: info.avatar || DEFAULT_AVATAR,
        email: info.email,
        roles: info.roles,
        buttons: info.buttons,
      }
      setUserInfo(val)
      return val
    }

    return {
      userInfo,
      clearUserInfo,
      fetchUserInfo,
      setUserInfo,
      setUserAvatar,
    }
  },
  {
    persist: true,
  },
)
