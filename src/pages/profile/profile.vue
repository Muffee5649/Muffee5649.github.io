<script lang="ts" setup>
import { onShow } from '@dcloudio/uni-app'
import { useDialog, useToast } from '@wot-ui/ui'
import { storeToRefs } from 'pinia'
import { t } from '@/locale/index'
import { LOGIN_PAGE } from '@/router/config'
import { AuthService } from '@/service/auth'
import { StorageService } from '@/service/storage'
import type { UploadFile } from '@/service/storage'
import { UserService } from '@/service/user'
import { useUserStore } from '@/store'
import { useTokenStore } from '@/store/token'

definePage({
  style: {
    navigationBarTitleText: '%tabbar.me%',
  },
})

onShow(() => {
  // 小程序页面标题不会随语言切换自动更新，进入页面时按当前语言重新设置
  uni.setNavigationBarTitle({ title: t('tabbar.me') })
})

const userStore = useUserStore()
const tokenStore = useTokenStore()
const toast = useToast()
const dialog = useDialog()
const { userInfo } = storeToRefs(userStore)

/** 角色展示文案 */
const roleText = computed(() => (userInfo.value.roles?.length ? userInfo.value.roles.join('、') : t('profile.role.none')))

/** 是否已填写真实邮箱（Auth 中的邮箱为虚拟登录标识，不参与展示） */
const hasEmail = computed(() => !!userInfo.value.email)

/** 邮箱展示文案 */
const emailText = computed(() => (hasEmail.value ? userInfo.value.email : t('profile.email.unbound')))

/** 资料编辑面板 */
const profileVisible = ref(false)
const profileSaving = ref(false)
/** 待上传的头像文件：微信临时路径 / H5 File，为空表示未更换头像 */
const avatarSource = ref<UploadFile | null>(null)
const profileForm = reactive({
  nickname: '',
  avatar: '',
})

/** 微信端昵称输入框使用 nickname 类型，支持一键填入微信昵称 */
const nicknameInputType = ref<'text' | 'nickname'>('text')
// #ifdef MP-WEIXIN
nicknameInputType.value = 'nickname'
// #endif

/** 打开资料编辑面板，用当前用户信息填充表单 */
function openProfilePanel() {
  profileForm.nickname = userInfo.value.nickname || userInfo.value.username
  profileForm.avatar = userInfo.value.avatar
  avatarSource.value = null
  profileVisible.value = true
}

/** 关闭资料编辑面板，保存过程中不允许收起 */
function closeProfilePanel() {
  if (profileSaving.value) {
    return
  }
  profileVisible.value = false
}

/** 微信选择头像回调 */
function handleChooseWxAvatar(event: { detail: { avatarUrl: string } }) {
  profileForm.avatar = event.detail.avatarUrl
  avatarSource.value = event.detail.avatarUrl
}

/** 非微信端从相册选择头像 */
function chooseAvatarFromAlbum() {
  uni.chooseImage({
    count: 1,
    success: (res) => {
      // #ifdef H5
      // H5 需要传 File，blob 地址无法被存储 SDK 读取
      const file = res.tempFiles?.[0] as unknown as File | undefined
      if (file instanceof File) {
        avatarSource.value = file
      }
      // #endif
      // #ifndef H5
      avatarSource.value = res.tempFilePaths[0]
      // #endif
      profileForm.avatar = res.tempFilePaths[0]
    },
  })
}

/** 保存昵称与头像 */
async function submitProfile() {
  if (profileSaving.value) {
    return
  }
  const nickname = profileForm.nickname.trim()
  if (!nickname) {
    toast.error(t('profile.nicknameRequired'))
    return
  }
  profileSaving.value = true
  try {
    let avatar = userInfo.value.avatar
    if (avatarSource.value) {
      const { url } = await StorageService.uploadAvatar(avatarSource.value, userInfo.value.userId)
      await UserService.updateAvatar(url)
      avatar = url
    }
    await UserService.updateProfile({ nickName: nickname })
    userStore.setUserInfo({ ...userInfo.value, nickname, avatar })
    profileVisible.value = false
    toast.success(t('profile.saveSuccess'))
  }
  catch (error) {
    toast.error(error instanceof Error ? error.message : t('profile.saveFailed'))
  }
  finally {
    profileSaving.value = false
  }
}

/** 微信小程序下优先微信登录，失败或非小程序端跳账号密码登录页 */
async function handleLogin() {
  // #ifdef MP-WEIXIN
  try {
    await tokenStore.wxLogin()
    return
  }
  catch (error) {
    console.error('微信登录失败，转账号密码登录', error)
  }
  // #endif

  uni.navigateTo({
    url: `${LOGIN_PAGE}`,
  })
}

/** 跳转设置页 */
function goSettings() {
  uni.navigateTo({
    url: '/pages/profile/settings',
  })
}

/** 跳转菜单编辑页 */
function goMenusEdit() {
  uni.navigateTo({
    url: '/pages/menus/edit',
  })
}

/** 跳转桌号二维码页 */
function goQrcode() {
  uni.navigateTo({
    url: '/pages/qrcode/index',
  })
}

/** 修改密码面板 */
const passwordVisible = ref(false)
const passwordSubmitting = ref(false)
const passwordForm = reactive({
  current: '',
  next: '',
})

/** 打开修改密码面板并重置表单 */
function openPasswordPanel() {
  passwordForm.current = ''
  passwordForm.next = ''
  passwordVisible.value = true
}

/** 提交修改密码 */
async function submitPassword() {
  if (passwordSubmitting.value) {
    return
  }
  passwordSubmitting.value = true
  try {
    const { error } = await AuthService.changePassword({
      currentPassword: passwordForm.current,
      newPassword: passwordForm.next,
    })
    if (error) {
      toast.error(error.message)
      return
    }
    passwordVisible.value = false
    toast.success(t('profile.passwordSuccess'))
  }
  finally {
    passwordSubmitting.value = false
  }
}

/** 邮箱编辑面板 */
const emailVisible = ref(false)
const emailSaving = ref(false)
const emailForm = reactive({
  email: '',
})

/** 打开邮箱编辑面板，回填 profiles 中的真实邮箱 */
function openEmailPanel() {
  emailForm.email = userInfo.value.email
  emailVisible.value = true
}

/** 关闭邮箱编辑面板，保存过程中不允许收起 */
function closeEmailPanel() {
  if (emailSaving.value) {
    return
  }
  emailVisible.value = false
}

/** 保存真实邮箱（只更新 profiles，不触碰 Auth 虚拟邮箱） */
async function submitEmailSave() {
  if (emailSaving.value) {
    return
  }
  emailSaving.value = true
  try {
    await UserService.updateEmail(emailForm.email)
    await userStore.fetchUserInfo()
    emailVisible.value = false
    toast.success(t('profile.emailBindSuccess'))
  }
  catch (error) {
    toast.error(error instanceof Error ? error.message : t('profile.emailBindFailed'))
  }
  finally {
    emailSaving.value = false
  }
}

/** 退出登录 */
async function handleLogout() {
  const result = await dialog.confirm({
    title: t('profile.logoutConfirmTitle'),
    msg: t('profile.logoutConfirm'),
  })
  if (result.action !== 'confirm') {
    return
  }
  await tokenStore.logout()
  profileVisible.value = false
  toast.success(t('profile.logoutSuccess'))
}
</script>

<template>
  <view class="profile-page flex flex-col bg-gray-50">
    <!-- 用户信息头部 -->
    <view class="mx-3 mt-3 flex items-center rounded-3 bg-white p-4">
      <image
        :src="userInfo.avatar"
        mode="aspectFill"
        class="h-16 w-16 flex-none rounded-full bg-gray-100"
      />
      <view class="ml-4 flex-1">
        <view class="text-lg text-gray-800">
          {{ userInfo.username ? userInfo.nickname || userInfo.username : $t('profile.notLoggedIn') }}
        </view>
        <view class="mt-1 text-sm text-gray-500">
          {{ userInfo.username ? `@${userInfo.username}` : $t('profile.loginHint') }}
        </view>
      </view>
      <view
        v-if="tokenStore.hasLogin"
        class="ml-2 flex-none p-1 active:opacity-60"
        @click="openProfilePanel"
      >
        <view class="i-ri-edit-line text-20px text-gray-500" />
      </view>
    </view>

    <!-- 详细信息 -->
    <wd-cell-group
      v-if="tokenStore.hasLogin"
      center
      border
      custom-class="mx-3 mt-3 overflow-hidden rounded-3"
    >
      <wd-cell :title="$t('profile.username')" :value="userInfo.username || '-'" />
      <wd-cell :title="$t('profile.nickname')" :value="userInfo.nickname || '-'" />
      <wd-cell :title="$t('profile.email')" :value="emailText" is-link @click="openEmailPanel" />
      <wd-cell :title="$t('profile.role')" :value="roleText" />
    </wd-cell-group>

    <!-- 设置入口 -->
    <wd-cell-group center custom-class="mx-3 mt-3 overflow-hidden rounded-3">
      <wd-cell
        v-if="tokenStore.hasLogin"
        :title="$t('profile.changePassword')"
        is-link
        @click="openPasswordPanel"
      >
        <template #prefix>
          <view class="i-ri-lock-line mr-1 text-xl text-gray-500" />
        </template>
      </wd-cell>
      <wd-cell
        :title="$t('settings.title')"
        is-link
        @click="goSettings"
      >
        <template #prefix>
          <view class="i-ri-settings-3-line mr-1 text-xl text-gray-500" />
        </template>
      </wd-cell>
      <wd-cell
        v-if="tokenStore.hasLogin"
        :title="$t('menus.edit.title')"
        is-link
        @click="goMenusEdit"
      >
        <template #prefix>
          <view class="i-ri-file-list-3-line mr-1 text-xl text-gray-500" />
        </template>
      </wd-cell>
      <!-- #ifdef H5 -->
      <wd-cell
        v-if="tokenStore.hasLogin"
        :title="$t('qrcode.title')"
        is-link
        @click="goQrcode"
      >
        <template #prefix>
          <view class="i-ri-qr-code-line mr-1 text-xl text-gray-500" />
        </template>
      </wd-cell>
      <!-- #endif -->
    </wd-cell-group>

    <!-- 操作按钮 -->
    <view class="mb-6 mt-auto px-3 pt-6">
      <wd-button v-if="tokenStore.hasLogin" type="danger" size="large" block @click="handleLogout">
        {{ $t('profile.logout') }}
      </wd-button>
      <wd-button v-else type="primary" size="large" block @click="handleLogin">
        {{ $t('profile.login') }}
      </wd-button>
    </view>

    <!-- 修改密码面板 -->
    <wd-popup
      v-model="passwordVisible"
      position="bottom"
      :z-index="1001"
      safe-area-inset-bottom
      custom-class="rounded-t-3"
    >
      <view class="p-4">
        <view class="text-center text-base text-gray-800">
          {{ $t('profile.changePassword') }}
        </view>
        <wd-input
          v-model="passwordForm.current"
          :placeholder="$t('profile.currentPassword')"
          show-password
          clearable
          custom-class="mt-4"
        />
        <wd-input
          v-model="passwordForm.next"
          :placeholder="$t('profile.newPassword')"
          show-password
          clearable
          custom-class="mt-3"
        />
        <view class="mt-6 flex gap-3">
          <wd-button block @click="passwordVisible = false">
            {{ $t('profile.cancel') }}
          </wd-button>
          <wd-button block type="primary" :loading="passwordSubmitting" @click="submitPassword">
            {{ $t('profile.confirm') }}
          </wd-button>
        </view>
      </view>
    </wd-popup>

    <!-- 邮箱绑定面板 -->
    <wd-popup
      v-model="emailVisible"
      position="bottom"
      :z-index="1001"
      :close-on-click-modal="!emailSaving"
      safe-area-inset-bottom
      custom-class="rounded-t-3"
    >
      <view class="p-4">
        <view class="text-center text-base text-gray-800">
          {{ $t('profile.bindEmail') }}
        </view>
        <view class="mt-2 text-center text-xs text-gray-400">
          {{ $t('profile.bindEmailHint') }}
        </view>
        <wd-input
          v-model="emailForm.email"
          :placeholder="$t('profile.emailPlaceholder')"
          clearable
          custom-class="mt-4"
        />
        <view class="mt-6 flex gap-3">
          <wd-button block :disabled="emailSaving" @click="closeEmailPanel">
            {{ $t('profile.cancel') }}
          </wd-button>
          <wd-button block type="primary" :loading="emailSaving" @click="submitEmailSave">
            {{ $t('profile.save') }}
          </wd-button>
        </view>
      </view>
    </wd-popup>

    <!-- 资料编辑面板 -->
    <wd-popup
      v-model="profileVisible"
      position="bottom"
      :z-index="1001"
      :close-on-click-modal="!profileSaving"
      safe-area-inset-bottom
      custom-class="rounded-t-3"
    >
      <view class="p-4">
        <view class="text-center text-base text-gray-800">
          {{ $t('profile.editProfile') }}
        </view>

        <!-- 头像选择：微信端使用 chooseAvatar 能力，其余端走相册 -->
        <view class="mt-5 flex justify-center">
          <!-- #ifdef MP-WEIXIN -->
          <button
            open-type="chooseAvatar"
            class="avatar-picker relative"
            @chooseavatar="handleChooseWxAvatar"
          >
            <image
              :src="profileForm.avatar"
              mode="aspectFill"
              class="h-20 w-20 rounded-full bg-gray-100"
            />
            <view class="absolute bottom-0 right-0 h-6 w-6 center rounded-full bg-primary">
              <view class="i-ri-camera-fill text-14px text-white" />
            </view>
          </button>
          <!-- #endif -->
          <!-- #ifndef MP-WEIXIN -->
          <view class="relative active:opacity-60" @click="chooseAvatarFromAlbum">
            <image
              :src="profileForm.avatar"
              mode="aspectFill"
              class="h-20 w-20 rounded-full bg-gray-100"
            />
            <view class="absolute bottom-0 right-0 h-6 w-6 center rounded-full bg-primary">
              <view class="i-ri-camera-fill text-14px text-white" />
            </view>
          </view>
          <!-- #endif -->
        </view>
        <view class="mt-2 text-center text-xs text-gray-400">
          <!-- #ifdef MP-WEIXIN -->
          {{ $t('profile.avatarTipWx') }}
          <!-- #endif -->
          <!-- #ifndef MP-WEIXIN -->
          {{ $t('profile.avatarTipAlbum') }}
          <!-- #endif -->
        </view>

        <wd-input
          v-model="profileForm.nickname"
          :type="nicknameInputType"
          :placeholder="$t('profile.nicknamePlaceholder')"
          clearable
          :maxlength="20"
          custom-class="mt-4"
        />

        <view class="mt-6 flex gap-3">
          <wd-button block :disabled="profileSaving" @click="closeProfilePanel">
            {{ $t('profile.cancel') }}
          </wd-button>
          <wd-button block type="primary" :loading="profileSaving" @click="submitProfile">
            {{ $t('profile.save') }}
          </wd-button>
        </view>
      </view>
    </wd-popup>

    <wd-dialog />
    <wd-toast />
  </view>
</template>

<style lang="scss" scoped>
/* 自定义 tabbar（fixed + 50px 占位 + 安全区）渲染在页面内容之后，
   页面高度需扣除 tabbar 占位，否则底部按钮被顶到一屏之外 */
/* #ifdef H5 */
/* H5 端 100vh 包含导航栏，需再减去 uni-app 注入的 --window-top */
.profile-page {
  min-height: calc(100vh - var(--window-top, 44px) - 50px - env(safe-area-inset-bottom));
}
/* #endif */
/* #ifndef H5 */
/* 小程序/App 端导航栏为原生，100vh 即为页面可视区域 */
.profile-page {
  min-height: calc(100vh - 50px - env(safe-area-inset-bottom));
}
/* #endif */

/* 重置原生 button 默认样式，仅保留头像内容 */
.avatar-picker {
  margin: 0;
  padding: 0;
  background: transparent;
  line-height: normal;

  &::after {
    border: none;
  }
}
</style>
